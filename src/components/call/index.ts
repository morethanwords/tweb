/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import IS_SCREEN_SHARING_SUPPORTED from '../../environment/screenSharingSupport';
import {IS_MOBILE} from '../../environment/userAgent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import ControlsHover from '../../helpers/dom/controlsHover';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '../../helpers/dom/fullScreen';
import replaceContent from '../../helpers/dom/replaceContent';
import safePlay from '../../helpers/dom/safePlay';
import MovablePanel from '../../helpers/movablePanel';
import onMediaLoad from '../../helpers/onMediaLoad';
import themeController from '../../helpers/themeController';
import toggleClassName from '../../helpers/toggleClassName';
import CallInstance from '../../lib/calls/callInstance';
import CALL_STATE from '../../lib/calls/callState';
import I18n, {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import animationIntersector from '../animationIntersector';
import {avatarNew} from '../avatarNew';
import ButtonIcon from '../buttonIcon';
import GroupCallMicrophoneIconMini from '../groupCall/microphoneIconMini';
import {MovableState} from '../movableElement';
import PeerTitle from '../peerTitle';
import PopupElement from '../popups';
import SetTransition from '../singleTransition';
import makeButton from './button';
import CallDescriptionElement from './description';
import callVideoCanvasBlur from './videoCanvasBlur';

const className = 'call';

const MIN_WIDTH = 400;
const MIN_HEIGHT = 580;

const INIT_STATE: MovableState = {
  width: MIN_WIDTH,
  height: MIN_HEIGHT
};

let previousState: MovableState = {...INIT_STATE};

export default class PopupCall extends PopupElement {
  private peerId: PeerId;

  private description: CallDescriptionElement;
  private emojisSubtitle: HTMLElement;

  private partyStates: HTMLElement;
  private partyMutedState: HTMLElement;

  private firstButtonsRow: HTMLElement;
  private secondButtonsRow: HTMLElement;

  private declineI18nElement: I18n.IntlElement;

  private makeButton: (options: Parameters<typeof makeButton>[2]) => HTMLElement;
  private btnAccept: HTMLElement;
  private btnDecline: HTMLElement;
  private btnVideo: HTMLElement;
  private btnScreen: HTMLElement;
  private btnMute: HTMLElement;
  private btnFullScreen: HTMLButtonElement;
  private btnExitFullScreen: HTMLButtonElement;

  private movablePanel: MovablePanel;
  private microphoneIcon: GroupCallMicrophoneIconMini;
  private muteI18nElement: I18n.IntlElement;

  private videoContainers: {
    input?: HTMLElement,
    output?: HTMLElement
  };

  private controlsHover: ControlsHover;

  constructor(private instance: CallInstance) {
    super('popup-call', {
      withoutOverlay: true,
      closable: true
    });

    this.videoContainers = {};

    const {container, listenerSetter} = this;
    container.classList.add(className, 'night');

    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add(className + '-avatar');

    const peerId = this.peerId = this.instance.interlocutorUserId.toPeerId();
    const {node} = avatarNew({
      middleware: this.middlewareHelper.get(),
      isBig: true,
      peerId,
      size: 'full'
    });
    avatarContainer.append(node);

    const title = new PeerTitle({
      peerId
    }).element;

    title.classList.add(className + '-title');

    const subtitle = document.createElement('div');
    subtitle.classList.add(className + '-subtitle');

    const description = this.description = new CallDescriptionElement(subtitle);

    const emojisSubtitle = this.emojisSubtitle = document.createElement('div');
    emojisSubtitle.classList.add(className + '-emojis');

    container.append(avatarContainer, title, subtitle);

    if(!IS_MOBILE) {
      this.btnFullScreen = ButtonIcon('fullscreen');
      this.btnExitFullScreen = ButtonIcon('smallscreen hide');
      attachClickEvent(this.btnFullScreen, this.onFullScreenClick, {listenerSetter});
      attachClickEvent(this.btnExitFullScreen, () => cancelFullScreen(), {listenerSetter});
      addFullScreenListener(this.container, this.onFullScreenChange, listenerSetter);
      this.header.prepend(this.btnExitFullScreen);
      this.header.append(this.btnFullScreen);

      container.append(emojisSubtitle);
    } else {
      this.header.append(emojisSubtitle);
    }

    this.partyStates = document.createElement('div');
    this.partyStates.classList.add(className + '-party-states');

    this.partyMutedState = document.createElement('div');
    this.partyMutedState.classList.add(className + '-party-state');
    const stateText = i18n('VoipUserMicrophoneIsOff', [new PeerTitle({peerId, onlyFirstName: true, limitSymbols: 18}).element]);
    stateText.classList.add(className + '-party-state-text');
    const mutedIcon = new GroupCallMicrophoneIconMini(false, true);
    mutedIcon.setState(false, false);
    this.partyMutedState.append(
      mutedIcon.container,
      stateText
    );

    this.partyStates.append(this.partyMutedState);
    this.container.append(this.partyStates);

    this.makeButton = makeButton.bind(null, className, this.listenerSetter);
    this.constructFirstButtons();
    this.constructSecondButtons();

    listenerSetter.add(instance)('state', () => {
      this.updateInstance();
    });

    listenerSetter.add(instance)('mediaState', () => {
      this.updateInstance();
    });

    this.movablePanel = new MovablePanel({
      listenerSetter,
      movableOptions: {
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        element: this.element,
        verifyTouchTarget: (e) => {
          const target = e.target;
          if(findUpClassName(target, 'call-button') ||
            findUpClassName(target, 'btn-icon') ||
            isFullScreen()) {
            return false;
          }

          return true;
        }
      },
      // onResize: () => this.toggleBigLayout(),
      previousState: !this.instance.wasTryingToJoin && !this.instance.isOutgoing ? {...INIT_STATE} : previousState
    });

    const movableElement = this.movablePanel.movable;
    if(movableElement) {
      this.listenerSetter.add(movableElement)('resize', () => {
        this.resizeVideoContainers();
      });
    }

    const controlsHover = this.controlsHover = new ControlsHover();
    controlsHover.setup({
      element: this.container,
      listenerSetter: this.listenerSetter,
      showOnLeaveToClassName: 'call-buttons'
    });
    controlsHover.showControls(false);

    this.addEventListener('close', () => {
      const {movablePanel} = this;
      previousState = movablePanel.state;

      this.microphoneIcon.destroy();

      movablePanel.destroy();
    });

    this.updateInstance();
  }

  public getCallInstance() {
    return this.instance;
  }

  private constructFirstButtons() {
    const buttons = this.firstButtonsRow = document.createElement('div');
    buttons.classList.add(className + '-buttons', 'is-first');

    const toggleDisability = toggleClassName.bind(null, 'btn-disabled');

    const btnVideo = this.btnVideo = this.makeButton({
      text: 'Call.Camera',
      icon: 'videocamera_filled',
      callback: () => {
        const toggle = toggleDisability([btnVideo, btnScreen], true);
        this.instance.toggleVideoSharing().finally(toggle);
      }
    });

    const btnScreen = this.btnScreen = this.makeButton({
      text: 'Call.Screen',
      icon: 'sharescreen_filled',
      callback: () => {
        const toggle = toggleDisability([btnVideo, btnScreen], true);
        this.instance.toggleScreenSharing().finally(toggle);
      }
    });

    if(!IS_SCREEN_SHARING_SUPPORTED) {
      btnScreen.classList.add('hide');
      this.container.classList.add('no-screen');
    }

    this.muteI18nElement = new I18n.IntlElement({
      key: 'Call.Mute'
    });
    const btnMute = this.btnMute = this.makeButton({
      text: this.muteI18nElement.element,
      callback: () => {
        this.instance.toggleMuted();
      }
    });

    const microphoneIcon = this.microphoneIcon = new GroupCallMicrophoneIconMini(true, true);
    btnMute.firstElementChild.append(microphoneIcon.container);

    // btnVideo.classList.add('disabled');
    // btnScreen.classList.add('disabled');

    buttons.append(btnVideo, btnScreen, btnMute);
    this.container.append(buttons);
  }

  private constructSecondButtons() {
    const buttons = this.secondButtonsRow = document.createElement('div');
    buttons.classList.add(className + '-buttons', 'is-second');

    this.declineI18nElement = new I18n.IntlElement({
      key: 'Call.Decline'
    });
    const btnDecline = this.btnDecline = this.makeButton({
      text: this.declineI18nElement.element,
      icon: 'endcall_filled',
      callback: () => {
        this.instance.hangUp('phoneCallDiscardReasonHangup');
      },
      isDanger: true
    });

    const btnAccept = this.btnAccept = this.makeButton({
      text: 'Call.Accept',
      icon: 'phone_filled',
      callback: () => {
        this.instance.acceptCall();
      },
      isConfirm: true
    });

    buttons.append(btnDecline, btnAccept);
    this.container.append(buttons);
  }

  private onFullScreenClick = () => {
    requestFullScreen(this.container);
  };

  private onFullScreenChange = () => {
    const isFull = isFullScreen();

    const {btnFullScreen, btnExitFullScreen} = this;

    const wasFullScreen = this.container.classList.contains('is-full-screen');
    this.container.classList.toggle('is-full-screen', isFull);
    btnFullScreen && btnFullScreen.classList.toggle('hide', isFull);
    btnExitFullScreen && btnExitFullScreen.classList.toggle('hide', !isFull);
    this.btnClose.classList.toggle('hide', isFull);

    if(isFull !== wasFullScreen) {
      animationIntersector.checkAnimations(isFull);

      themeController.setThemeColor(isFull ? '#000000' : undefined);

      this.resizeVideoContainers();
    }
  };

  private createVideoContainer(video: HTMLVideoElement) {
    const _className = className + '-video';
    const container = document.createElement('div');
    container.classList.add(_className + '-container');

    video.classList.add(_className);
    if(video.paused) {
      safePlay(video);
    }

    attachClickEvent(container, () => {
      if(!container.classList.contains('small')) {
        return;
      }

      const big = Object.values(this.videoContainers).find((container) => !container.classList.contains('small'));
      big.classList.add('small');
      big.style.cssText = container.style.cssText;
      container.classList.remove('small');
      container.style.cssText = '';

      this.resizeVideoContainers();
    });

    const canvas = callVideoCanvasBlur(video);
    canvas.classList.add(_className + '-blur');

    container.append(canvas, video);

    return container;
  }

  private updateInstance() {
    const {instance} = this;
    const {connectionState} = instance;
    if(connectionState === CALL_STATE.CLOSED) {
      if(this.container.classList.contains('is-full-screen')) {
        cancelFullScreen();
      }

      this.btnVideo.classList.add('disabled');

      this.hide();
      return;
    }

    const isPendingIncoming = !instance.isOutgoing && connectionState === CALL_STATE.PENDING;
    this.declineI18nElement.compareAndUpdate({
      key: connectionState === CALL_STATE.PENDING ? 'Call.Decline' : 'Call.End'
    });
    this.btnAccept.classList.toggle('disable', !isPendingIncoming);
    this.btnAccept.classList.toggle('hide-me', !isPendingIncoming);
    this.container.classList.toggle('two-button-rows', isPendingIncoming);

    const isMuted = instance.isMuted;
    const onFrame = () => {
      this.btnMute.firstElementChild.classList.toggle('active', isMuted);
    };

    const player = this.microphoneIcon.getItem().player;
    this.microphoneIcon.setState(!isMuted, !isMuted, onFrame);
    if(!player) {
      onFrame();
    }

    this.muteI18nElement.compareAndUpdate({
      key: isMuted ? 'VoipUnmute' : 'Call.Mute'
    });

    const isSharingVideo = instance.isSharingVideo;
    this.btnVideo.firstElementChild.classList.toggle('active', isSharingVideo);

    const isSharingScreen = instance.isSharingScreen;
    this.btnScreen.firstElementChild.classList.toggle('active', isSharingScreen);

    const outputState = instance.getMediaState('output');

    SetTransition({
      element: this.partyMutedState,
      className: 'is-visible',
      forwards: !!outputState?.muted,
      duration: 300
    });

    const containers = this.videoContainers;
    const oldContainers = {...containers};
    ['input' as const, 'output' as const].forEach((type) => {
      const mediaState = instance.getMediaState(type);
      const video = instance.getVideoElement(type) as HTMLVideoElement;

      const hasFrame = !!(video && video.videoWidth && video.videoHeight);
      if(video && !hasFrame && !video.dataset.hasPromise) {
        video.dataset.hasPromise = '1';
        // container.classList.add('hide');
        onMediaLoad(video).then(() => {
          delete video.dataset.hasPromise;
          this.updateInstance();
          // this.resizeVideoContainers();
          // container.classList.remove('hide');
        });
      }

      const isActive = !!video && hasFrame && !!(mediaState && (mediaState.videoState === 'active' || mediaState.screencastState === 'active'));
      let videoContainer = containers[type];

      if(isActive && video && !videoContainer) {
        videoContainer = containers[type] = this.createVideoContainer(video);
        this.container.append(videoContainer);
      }

      if(!isActive && videoContainer) {
        videoContainer.remove();
        delete containers[type];
      }
    });

    {
      const input = containers.input;
      const output = containers.output;
      if(Object.keys(oldContainers).length !== Object.keys(containers).length && input) {
        input.classList.toggle('small', !!output);
      }

      if(output && !input) {
        output.classList.remove('small');
      }
    }

    this.resizeVideoContainers();

    this.container.classList.toggle('no-video', !Object.keys(containers).length);

    if(!this.emojisSubtitle.textContent && connectionState < CALL_STATE.EXCHANGING_KEYS) {
      Promise.resolve(instance.getEmojisFingerprint()).then((emojis) => {
        replaceContent(this.emojisSubtitle, wrapEmojiText(emojis.join('')));
      });
    }

    this.setDescription();
  }

  private resizeVideoContainers() {
    Object.values(this.videoContainers).forEach((container) => {
      const isSmall = container.classList.contains('small');
      if(isSmall) {
        const video = container.querySelector('video');
        const popupWidth = this.movablePanel.state;
        const MAX_WIDTH_PX = 240;
        const MAX_HEIGHT_PX = 240;

        const isVertical = video.videoHeight > video.videoWidth;
        const MAX_SIZE = isVertical ? MAX_HEIGHT_PX : MAX_WIDTH_PX;

        const biggestSideSize = 1 / 3 * (isFullScreen() ? 0xFFFF : (isVertical ? popupWidth.height : popupWidth.width));
        const widthRatio = isVertical ? video.videoWidth / video.videoHeight : 1;
        const heightRatio = isVertical ? 1 : video.videoHeight / video.videoWidth;
        container.style.width = biggestSideSize * widthRatio + 'px';
        container.style.height = biggestSideSize * heightRatio + 'px';
        container.style.maxWidth = MAX_SIZE * widthRatio + 'px';
        container.style.maxHeight = MAX_SIZE * heightRatio + 'px';
      } else {
        container.style.cssText = '';
      }
    });
  }

  private setDescription() {
    this.description.update(this.instance);
  }
}
