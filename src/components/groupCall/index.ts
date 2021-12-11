/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from "../popups";
import { hexToRgb } from "../../helpers/color";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import customProperties from "../../helpers/dom/customProperties";
import { safeAssign } from "../../helpers/object";
import { GroupCall, GroupCallParticipant } from "../../layer";
import type { AppChatsManager } from "../../lib/appManagers/appChatsManager";
import type { AppGroupCallsManager, GroupCallInstance } from "../../lib/appManagers/appGroupCallsManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import GROUP_CALL_STATE from "../../lib/calls/groupCallState";
import { LangPackKey } from "../../lib/langPack";
import { RLottieColor } from "../../lib/rlottie/rlottiePlayer";
import rootScope from "../../lib/rootScope";
import ButtonIcon from "../buttonIcon";
import GroupCallMicrophoneIcon from "./microphoneIcon";
import GroupCallParticipantsElement from "./participants";
import GroupCallParticipantsVideoElement from "./participantVideos";
import PopupPeer from "../popups/peer";
import GroupCallDescriptionElement from "./description";
import GroupCallTitleElement from "./title";
import { addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen } from "../../helpers/dom/fullScreen";
import Scrollable from "../scrollable";
import MovableElement, { MovableState } from "../movableElement";
import animationIntersector from "../animationIntersector";
import { IS_TOUCH_SUPPORTED } from "../../environment/touchSupport";
import { IS_APPLE_MOBILE } from "../../environment/userAgent";
import mediaSizes, { ScreenSize } from "../../helpers/mediaSizes";
import toggleDisability from "../../helpers/dom/toggleDisability";
import { ripple } from "../ripple";
import throttle from "../../helpers/schedulers/throttle";
import IS_SCREEN_SHARING_SUPPORTED from "../../environment/screenSharingSupport";
import ListenerSetter from "../../helpers/listenerSetter";

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
  let color: RLottieColor, colorStr: 'blue' | 'green' | 'secondary' | 'red';
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
  color = hexToRgb(propertyValue);

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

function makeButton(listenerSetter: ListenerSetter, options: {
  text?: LangPackKey,
  isDanger?: boolean,
  noRipple?: boolean,
  callback?: () => void,
  listenerSetter?: ListenerSetter
}) {
  const _className = className + '-button';
  const div = document.createElement('div');
  div.classList.add(_className, 'rp-overflow');

  if(!options.noRipple) {
    ripple(div);
  }

  if(options.isDanger) {
    div.classList.add(_className + '-red');
  }

  if(options.callback) {
    attachClickEvent(div, options.callback, {listenerSetter: options.listenerSetter});
  }

  return div;
}

export default class PopupGroupCall extends PopupElement {
  private appGroupCallsManager: AppGroupCallsManager;
  private appPeersManager: AppPeersManager;
  private appChatsManager: AppChatsManager;
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
  private movable: MovableElement;
  private buttonsContainer: HTMLDivElement;
  private btnFullScreen2: HTMLButtonElement;
  private btnVideo: HTMLDivElement;
  private btnScreen: HTMLDivElement;

  constructor(options: {
    appGroupCallsManager: AppGroupCallsManager,
    appPeersManager: AppPeersManager,
    appChatsManager: AppChatsManager,
  }) {
    super('popup-group-call', undefined, {
      body: true,
      withoutOverlay: true,
      closable: true
    });

    safeAssign(this, options);

    this.videosCount = 0;
    this.container.classList.add(className, 'night');

    const instance = this.instance = this.appGroupCallsManager.groupCall;
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
    this.toggleMovable(!IS_TOUCH_SUPPORTED);

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
      ...options
    });
    this.groupCallParticipants = new GroupCallParticipantsElement({
      appendTo: this.body,
      instance,
      listenerSetter,
      ...options
    });

    listenerSetter.add(rootScope)('group_call_state', (instance) => {
      if(this.instance === instance) {
        this.updateInstance();
      }
    });

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(this.instance.id === groupCall.id) {
        this.updateInstance();
      }
    });

    listenerSetter.add(rootScope)('group_call_pinned', ({instance}) => {
      if(this.instance === instance) {
        this.setHasPinned();
      }
    });

    listenerSetter.add(this.groupCallParticipantsVideo)('toggleControls', this.onToggleControls);

    listenerSetter.add(mediaSizes)('changeScreen', (from, to) => {
      if(to === ScreenSize.mobile || from === ScreenSize.mobile) {
        this.toggleMovable(!IS_TOUCH_SUPPORTED);
      }
    });

    this.addEventListener('close', () => {
      const {movable} = this;
      if(movable) {
        previousState = movable.state;
      }

      this.groupCallParticipantsVideo.destroy();
      this.groupCallParticipants.destroy();
      this.groupCallMicrophoneIcon.destroy();

      if(movable) {
        movable.destroy();
      }
    });

    this.toggleRightColumn();
    this.onFullScreenChange();

    this.updateInstance();
  }

  private constructButtons() {
    const buttons = this.buttonsContainer = document.createElement('div');
    buttons.classList.add(className + '-buttons');

    const _makeButton = makeButton.bind(null, this.listenerSetter);

    const btnVideo = this.btnVideo = _makeButton({
      text: 'VoiceChat.Video.Stream.Video',
      callback: this.onVideoClick
    });

    btnVideo.classList.add('tgico-videocamera_filled');

    const btnScreen = this.btnScreen = _makeButton({
      text: 'VoiceChat.Video.Stream.Screencast',
      callback: this.onScreenClick
    });

    btnScreen.classList.add('tgico-sharescreen_filled');
    btnScreen.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    const btnMute = _makeButton({
      noRipple: true,
      callback: throttle(this.onMuteClick, 600, true)
    });
    btnMute.classList.add(className + '-microphone-button');

    const microphoneIcon = this.groupCallMicrophoneIcon = new GroupCallMicrophoneIcon();
    btnMute.append(microphoneIcon.container);

    const btnMore = _makeButton({
      text: 'VoiceChat.Video.Stream.More'
    });

    btnMore.classList.add('tgico-settings_filled', 'btn-disabled');
    btnMore.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    const btnLeave = _makeButton({
      text: 'VoiceChat.Leave',
      isDanger: true,
      callback: this.onLeaveClick
    });

    btnLeave.classList.add('tgico-close');

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

  private onVideoClick = () => {
    const toggle = toggleDisability([this.btnVideo], true);
    this.instance.toggleVideoSharing().finally(() => {
      toggle();
    });
  };

  private onScreenClick = () => {
    const toggle = toggleDisability([this.btnScreen], true);
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
  
  private onLeaveClick = () => {
    const hangUp = (discard: boolean) => {
      this.instance.hangUp(discard);
    };

    if(this.appChatsManager.hasRights(this.instance.chatId, 'manage_call')) {
      new PopupPeer('popup-end-video-chat', {
        titleLangKey: 'VoiceChat.End.Title',
        descriptionLangKey: 'VoiceChat.End.Text',
        checkboxes: [{
          text: 'VoiceChat.End.Third'
        }],
        buttons: [{
          langKey: 'VoiceChat.End.OK',
          callback: (checkboxes) => {
            hangUp(!!checkboxes.size);
          },
          isDanger: true,
        }]
      }).show();
    } else {
      hangUp(false);
    }
  };

  public getContainer() {
    return this.container;
  }

  private toggleMovable(enabled: boolean) {
    if(enabled) {
      if(this.movable) {
        return;
      }

      const movable = this.movable = new MovableElement({
        // minWidth: 366,
        minWidth: 400,
        minHeight: 480,
        element: this.element
      });
  
      movable.state = previousState;
      if(previousState.top === undefined) {
        movable.setPositionToCenter();
      }
  
      this.listenerSetter.add(movable)('resize', this.toggleBigLayout);
    } else {
      if(!this.movable) {
        return;
      }

      this.movable.destroyElements();
      this.movable.destroy();
      this.movable = undefined;
    }
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
      animationIntersector.checkAnimations(isFull);

      rootScope.setThemeColor(isFull ? '#000000' : undefined);
    }
  };

  private toggleBigLayout = () => {
    const isFull = isFullScreen();
    const isBig = (isFull || !!(this.movable && this.movable.width >= 680)) && !!this.videosCount;

    /* if(!isBig && isFull) {
      cancelFullScreen();
      return;
    } */

    const wasBig = this.container.classList.contains('is-big-layout');
    let buttons: HTMLElement[];
    if(isBig && !wasBig) { // fix buttons transition to 0 opacity
      buttons = Array.from(this.buttonsContainer.children) as HTMLElement[];
      buttons.forEach(element => {
        element.style.opacity = '0';
      });

      void this.buttonsContainer.offsetLeft;
    }

    this.container.classList.toggle('is-big-layout', isBig);
    this.btnInvite.classList.toggle('hide', isBig);
    this.btnShowColumn.classList.toggle('hide', !isBig);

    if(buttons) {
      // window.requestAnimationFrame(() => {
        buttons.forEach(element => {
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

    this.setTitle();
    this.setDescription();
    this.setHasPinned();

    const microphoneButtonState = getGroupCallMicrophoneButtonState(this.instance.groupCall as any, this.instance.participant);
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
