/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '../popups';
import {hexToRgb} from '../../helpers/color';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import customProperties from '../../helpers/dom/customProperties';
import {GroupCall, GroupCallParticipant} from '../../layer';
import GROUP_CALL_STATE from '../../lib/calls/groupCallState';
import {RLottieColor} from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import ButtonIcon from '../buttonIcon';
import GroupCallMicrophoneIcon from './microphoneIcon';
import GroupCallParticipantsElement from './participants';
import GroupCallParticipantsVideoElement from './participantVideos';
import PopupPeer from '../popups/peer';
import GroupCallDescriptionElement from './description';
import GroupCallTitleElement from './title';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '../../helpers/dom/fullScreen';
import Scrollable from '../scrollable';
import {MovableState} from '../movableElement';
import animationIntersector from '../animationIntersector';
import {IS_APPLE_MOBILE} from '../../environment/userAgent';
import throttle from '../../helpers/schedulers/throttle';
import IS_SCREEN_SHARING_SUPPORTED from '../../environment/screenSharingSupport';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import makeButton from '../call/button';
import MovablePanel from '../../helpers/movablePanel';
import findUpClassName from '../../helpers/dom/findUpClassName';
import toggleClassName from '../../helpers/toggleClassName';
import themeController from '../../helpers/themeController';
import groupCallsController from '../../lib/calls/groupCallsController';

export enum GROUP_CALL_PARTICIPANT_MUTED_STATE {
  UNMUTED,
  MUTED,
  MUTED_FOR_ME,
  MUTED_BY_ADMIN,
  HAND
}

export type GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE = Exclude<GROUP_CALL_PARTICIPANT_MUTED_STATE, GROUP_CALL_PARTICIPANT_MUTED_STATE.MUTED_BY_ADMIN | GROUP_CALL_PARTICIPANT_MUTED_STATE.MUTED_FOR_ME>;

export function getGroupCallParticipantMutedState(participant: GroupCallParticipant) {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  if(participant.pFlags.muted_by_you) {
    return states.MUTED_FOR_ME;
  } else if(participant.raise_hand_rating !== undefined) {
    return states.HAND;
  } else if(participant.pFlags.muted) {
    return participant.pFlags.can_self_unmute ? states.MUTED : states.MUTED_BY_ADMIN;
  } else {
    return states.UNMUTED;
  }
}

export function clearMutedStateModifier(state: GROUP_CALL_PARTICIPANT_MUTED_STATE): GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  switch(state) {
    case states.MUTED_BY_ADMIN:
    case states.MUTED_FOR_ME:
      return states.MUTED;
    default:
      return state;
  }
}

export function getColorByMutedState(state: GROUP_CALL_PARTICIPANT_MUTED_STATE) {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  let colorStr: 'blue' | 'green' | 'secondary' | 'red';
  switch(state) {
    case states.HAND:
      colorStr = 'blue';
      break;
    case states.MUTED:
    case states.MUTED_FOR_ME:
    case states.MUTED_BY_ADMIN:
      colorStr = state === states.MUTED ? 'secondary' : 'red';
      break;
    case states.UNMUTED:
      colorStr = 'green';
      break;
  }

  const propertyValue = customProperties.getProperty('gc-' + colorStr + '-text-color');
  const color: RLottieColor = hexToRgb(propertyValue);

  return color;
}

export enum GROUP_CALL_MICROPHONE_BUTTON_STATE {
  HAND,
  MUTED,
  UNMUTED,
}

export function getGroupCallMicrophoneButtonState(groupCall: GroupCall.groupCall, participant: GroupCallParticipant) {
  const states = GROUP_CALL_MICROPHONE_BUTTON_STATE;
  if(!participant.pFlags.can_self_unmute) {
    return states.HAND;
  } else if(participant.pFlags.muted) {
    return states.MUTED
  } else {
    return states.UNMUTED;
  }
}

let previousState: MovableState = {
  width: 420,
  height: 640
};

const className = 'group-call';

export default class PopupGroupCall extends PopupElement {
  private instance: GroupCallInstance;
  private groupCallTitle: GroupCallTitleElement;
  private groupCallDescription: GroupCallDescriptionElement;
  private groupCallBodyHeaderDescription: GroupCallDescriptionElement;
  private groupCallParticipants: GroupCallParticipantsElement;
  private groupCallParticipantsVideo: GroupCallParticipantsVideoElement;
  private groupCallMicrophoneIcon: GroupCallMicrophoneIcon;
  private videosCount: number;
  private btnFullScreen: HTMLButtonElement;
  private btnExitFullScreen: HTMLButtonElement;
  private btnInvite: HTMLButtonElement;
  private btnShowColumn: HTMLButtonElement;
  private movablePanel: MovablePanel;
  private buttonsContainer: HTMLDivElement;
  private btnFullScreen2: HTMLButtonElement;
  private btnVideo: HTMLDivElement;
  private btnScreen: HTMLDivElement;

  constructor() {
    super('popup-group-call', {
      body: true,
      withoutOverlay: true,
      closable: true,
      title: true
    });

    this.videosCount = 0;
    this.container.classList.add(className, 'night');

    const instance = this.instance = groupCallsController.groupCall;
    const {listenerSetter} = this;

    if(!IS_APPLE_MOBILE) {
      const btnFullScreen = this.btnFullScreen = ButtonIcon('fullscreen');
      const btnFullScreen2 = this.btnFullScreen2 = ButtonIcon('fullscreen ' + className + '-cfs');
      const btnExitFullScreen = this.btnExitFullScreen = ButtonIcon('smallscreen');

      attachClickEvent(btnFullScreen, this.onFullScreenClick, {listenerSetter});
      attachClickEvent(btnFullScreen2, this.onFullScreenClick, {listenerSetter});

      attachClickEvent(btnExitFullScreen, () => {
        cancelFullScreen();
      }, {listenerSetter});

      addFullScreenListener(this.container, this.onFullScreenChange, listenerSetter);
    }

    const btnInvite = this.btnInvite = ButtonIcon('adduser');
    const btnShowColumn = this.btnShowColumn = ButtonIcon('rightpanel ' + className + '-only-big');

    attachClickEvent(btnShowColumn, this.toggleRightColumn, {listenerSetter});

    const headerInfo = document.createElement('div');
    headerInfo.classList.add(className + '-header-info');

    this.title.classList.add(className + '-header-title');

    const subtitle = document.createElement('div');
    subtitle.classList.add(className + '-header-subtitle');

    headerInfo.append(this.title, subtitle);

    this.header.classList.add(className + '-header');
    this.header.append(...[this.btnExitFullScreen, headerInfo/* , btnInvite */, this.btnFullScreen, btnShowColumn].filter(Boolean));

    const newHeader = this.header.cloneNode(false) as HTMLElement;
    const newHeaderInfo = headerInfo.cloneNode(false) as HTMLElement;
    const newHeaderTitle = this.title.cloneNode(false) as HTMLElement;

    newHeaderInfo.append(newHeaderTitle);

    const btnHideColumn = ButtonIcon('rightpanel');
    newHeader.append(...[btnHideColumn, newHeaderInfo, this.btnFullScreen2].filter(Boolean));

    attachClickEvent(btnHideColumn, this.toggleRightColumn, {listenerSetter});

    this.body.prepend(newHeader);

    const videosScrollable = new Scrollable(undefined);
    videosScrollable.container.classList.add('group-call-big-video-container');
    this.container.append(videosScrollable.container);

    this.groupCallTitle = new GroupCallTitleElement(this.title);
    this.groupCallDescription = new GroupCallDescriptionElement(subtitle);
    this.groupCallBodyHeaderDescription = new GroupCallDescriptionElement(newHeaderTitle);
    this.constructButtons();

    this.groupCallParticipantsVideo = new GroupCallParticipantsVideoElement({
      appendTo: videosScrollable.container,
      instance,
      listenerSetter,
      displayPinned: true,
      onLengthChange: (length) => {
        this.videosCount = length;
        this.toggleBigLayout();
      },
      managers: this.managers
    });
    this.groupCallParticipants = new GroupCallParticipantsElement({
      appendTo: this.body,
      instance,
      listenerSetter,
      managers: this.managers
    });

    this.movablePanel = new MovablePanel({
      listenerSetter,
      movableOptions: {
        minWidth: 400,
        minHeight: 480,
        element: this.element,
        verifyTouchTarget: (e) => {
          const target = e.target;
          if(findUpClassName(target, 'chatlist') ||
            findUpClassName(target, 'group-call-button') ||
            findUpClassName(target, 'btn-icon') ||
            findUpClassName(target, 'group-call-participants-video-container') ||
            isFullScreen()) {
            return false;
          }

          return true;
        }
      },
      onResize: () => this.toggleBigLayout(),
      previousState
    });

    listenerSetter.add(instance)('state', () => {
      this.updateInstance();
    });

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(this.instance?.id === groupCall.id) {
        this.updateInstance();
      }
    });

    listenerSetter.add(instance)('pinned', () => {
      this.setHasPinned();
    });

    listenerSetter.add(this.groupCallParticipantsVideo)('toggleControls', this.onToggleControls);

    this.addEventListener('close', () => {
      const {movablePanel} = this;
      previousState = movablePanel.state;

      this.groupCallParticipantsVideo.destroy();
      this.groupCallParticipants.destroy();
      this.groupCallMicrophoneIcon.destroy();

      movablePanel.destroy();
    });

    this.toggleRightColumn();
    this.onFullScreenChange();

    this.updateInstance();
  }

  private constructButtons() {
    const buttons = this.buttonsContainer = document.createElement('div');
    buttons.classList.add(className + '-buttons');

    const _makeButton = makeButton.bind(null, className, this.listenerSetter);

    const btnVideo = this.btnVideo = _makeButton({
      // text: 'VoiceChat.Video.Stream.Video',
      callback: this.onVideoClick,
      icon: 'videocamera_filled'
    });

    const btnScreen = this.btnScreen = _makeButton({
      // text: 'VoiceChat.Video.Stream.Screencast',
      callback: this.onScreenClick,
      icon: 'sharescreen_filled'
    });

    btnScreen.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    const btnMute = _makeButton({
      noRipple: true,
      callback: throttle(this.onMuteClick, 600, true)
    });
    btnMute.classList.add(className + '-microphone-button');

    const microphoneIcon = this.groupCallMicrophoneIcon = new GroupCallMicrophoneIcon();
    btnMute.append(microphoneIcon.container);

    const btnMore = _makeButton({
      // text: 'VoiceChat.Video.Stream.More'
      icon: 'settings_filled'
    });

    btnMore.classList.add('btn-disabled');
    btnMore.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    const btnLeave = _makeButton({
      // text: 'VoiceChat.Leave',
      isDanger: true,
      callback: this.onLeaveClick,
      icon: 'close'
    });

    buttons.append(btnVideo, btnScreen, btnMute, btnMore, btnLeave);

    this.container.append(buttons);
  }

  private onFullScreenClick = () => {
    requestFullScreen(this.container);
  };

  private onToggleControls = (show: boolean) => {
    this.container.classList.toggle('show-controls', show);
    this.buttonsContainer.classList.toggle('show-controls', show);
  };

  private toggleDisability = toggleClassName.bind(null, 'btn-disabled');

  private onVideoClick = () => {
    const toggle = this.toggleDisability([this.btnVideo], true);
    this.instance.toggleVideoSharing().finally(() => {
      toggle();
    });
  };

  private onScreenClick = () => {
    const toggle = this.toggleDisability([this.btnScreen], true);
    this.instance.toggleScreenSharing().finally(() => {
      toggle();
    });
  };

  private onMuteClick = () => {
    const participant = this.instance.participant;
    if(!participant.pFlags.can_self_unmute) {
      if(participant.raise_hand_rating === undefined) {
        this.instance.changeRaiseHand(true);
      }
    } else {
      this.instance.toggleMuted();
    }
  };

  private onLeaveClick = async() => {
    const hangUp = (discard: boolean) => {
      this.instance.hangUp(discard);
    };

    if(await this.managers.appChatsManager.hasRights(this.instance.chatId, 'manage_call')) {
      PopupElement.createPopup(PopupPeer, 'popup-end-video-chat', {
        titleLangKey: 'VoiceChat.End.Title',
        descriptionLangKey: 'VoiceChat.End.Text',
        checkboxes: [{
          text: 'VoiceChat.End.Third'
        }],
        buttons: [{
          langKey: 'VoiceChat.End.OK',
          callback: (e, checkboxes) => {
            hangUp(!!checkboxes.size);
          },
          isDanger: true
        }]
      }).show();
    } else {
      hangUp(false);
    }
  };

  public getContainer() {
    return this.container;
  }

  private onFullScreenChange = () => {
    this.toggleBigLayout();
    const isFull = isFullScreen();

    const {btnFullScreen, btnExitFullScreen} = this;

    const wasFullScreen = this.container.classList.contains('is-full-screen');
    this.container.classList.toggle('is-full-screen', isFull);
    btnFullScreen && btnFullScreen.classList.toggle('hide', isFull);
    btnExitFullScreen && btnExitFullScreen.classList.toggle('hide', !isFull);
    this.btnClose.classList.toggle('hide', isFull);

    if(isFull !== wasFullScreen) {
      animationIntersector.checkAnimations2(isFull);

      themeController.setThemeColor(isFull ? '#000000' : undefined);
    }
  };

  private toggleBigLayout = () => {
    const isFull = isFullScreen();
    const movable = this.movablePanel?.movable;
    const isBig = (isFull || !!(movable && movable.width >= 680)) && !!this.videosCount;

    /* if(!isBig && isFull) {
      cancelFullScreen();
      return;
    } */

    const wasBig = this.container.classList.contains('is-big-layout');
    let buttons: HTMLElement[];
    if(isBig && !wasBig) { // fix buttons transition to 0 opacity
      buttons = Array.from(this.buttonsContainer.children) as HTMLElement[];
      buttons.forEach((element) => {
        element.style.opacity = '0';
      });

      void this.buttonsContainer.offsetLeft;
    }

    this.container.classList.toggle('is-big-layout', isBig);
    this.btnInvite.classList.toggle('hide', isBig);
    this.btnShowColumn.classList.toggle('hide', !isBig);

    if(buttons) {
      // window.requestAnimationFrame(() => {
      buttons.forEach((element) => {
        element.style.opacity = '';
      });
      // });
    }
  };

  private toggleRightColumn = () => {
    this.container.classList.toggle('is-right-column-shown');
  };

  private setHasPinned() {
    this.container.classList.toggle('has-pinned', !!this.instance.pinnedSource);
  }

  private updateInstance() {
    if(this.instance.state === GROUP_CALL_STATE.CLOSED) {
      if(this.container.classList.contains('is-full-screen')) {
        cancelFullScreen();
      }

      this.hide();
      return;
    }

    const {participant, groupCall} = this.instance;
    if(!participant) {
      return;
    }

    this.setTitle();
    this.setDescription();
    this.setHasPinned();

    const microphoneButtonState = getGroupCallMicrophoneButtonState(groupCall as any, participant);
    this.container.dataset.micState = microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND ? 'hand' : (microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED ? 'muted' : 'unmuted');
    this.groupCallMicrophoneIcon.setState(microphoneButtonState);
  }

  private setTitle() {
    this.groupCallTitle.update(this.instance);
  }

  private setDescription() {
    this.groupCallDescription.update(this.instance);
    this.groupCallBodyHeaderDescription.update(this.instance);
  }
}
