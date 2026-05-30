import IS_SCREEN_SHARING_SUPPORTED from '@environment/screenSharingSupport';
import {IS_MOBILE} from '@environment/userAgent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ControlsHover from '@helpers/dom/controlsHover';
import findUpClassName from '@helpers/dom/findUpClassName';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '@helpers/dom/fullScreen';
import replaceContent from '@helpers/dom/replaceContent';
import safePlay from '@helpers/dom/safePlay';
import MovablePanel from '@helpers/movablePanel';
import onMediaLoad from '@helpers/onMediaLoad';
import themeController from '@helpers/themeController';
import toggleClassName from '@helpers/toggleClassName';
import CallInstance from '@lib/calls/callInstance';
import CALL_STATE from '@lib/calls/callState';
import I18n, {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {animateValue} from '@helpers/animateValue';
import animationIntersector from '@components/animationIntersector';
import {avatarNew} from '@components/avatarNew';
import ButtonIcon from '@components/buttonIcon';
import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';
import GroupCallMicrophoneIconMini from '@components/groupCall/microphoneIconMini';
import {MovableState} from '@components/movableElement';
import PeerTitle from '@components/peerTitle';
import PopupElement from '@components/popups';
import SetTransition from '@components/singleTransition';
import makeButton from '@components/call/button';
import CallDescriptionElement from '@components/call/description';
import callVideoCanvasBlur from '@components/call/videoCanvasBlur';
import showCallSettingsPopup from '@components/call/settingsPopup';

// iOS PrivateCallScreen colour palettes (CallBackgroundLayer.swift).
// 4 colours per state; ChatBackgroundGradientRenderer expects exactly 4 to
// reproduce the Telegram "swirl" gradient.
const GRADIENT_COLORS = {
  connecting: '568fd6,626ed5,a667d5,7664da',
  active:     'acbd65,459f8d,53a4d1,3e917a',
  weak:       'c0508d,f09536,ce5081,fc7c4c'
};
type GradientStateKey = keyof typeof GRADIENT_COLORS;

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
  private btnSettings: HTMLButtonElement;
  private btnFullScreen: HTMLButtonElement;
  private btnExitFullScreen: HTMLButtonElement;

  private movablePanel: MovablePanel;
  private microphoneIcon: GroupCallMicrophoneIconMini;
  private muteI18nElement: I18n.IntlElement;

  // One renderer per gradient state. All three drift continuously; only the
  // canvas matching `gradientState` is opaque, the others sit at opacity 0
  // and crossfade in/out on state change. Pre-warming all of them means the
  // newly-revealed canvas already has a live, moving gradient — no "static
  // until first tick" pop during the fade.
  private gradientRenderers: Record<GradientStateKey, ChatBackgroundGradientRenderer>;
  private gradientCanvases: Record<GradientStateKey, HTMLCanvasElement>;
  private gradientCancels: Partial<Record<GradientStateKey, () => void>>;
  private gradientState: GradientStateKey;
  private gradientHideTimeout: number;

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

    // iOS-style gradient backdrop. Uses the same renderer as chat backgrounds
    // (Telegram "swirl" gradient): 50×50 ImageData blended in JS, stretched
    // via CSS to fill the popup. `toNextPosition(getProgress)` is the same
    // pattern passcodeLockScreen.tsx uses — `animateValue` drives a 0→1
    // progress value with LINEAR easing (constant speed; the renderer's
    // default ease-in-out makes the swirl jerk between positions) and
    // chains itself via `onEnd` so each tick fires the moment the previous
    // one settles — continuous drift, no gap, no overlap.
    //
    // Pre-warm one canvas + renderer per state and stack them. State change
    // is a CSS opacity crossfade between the layered canvases.
    this.gradientState = 'connecting';
    this.gradientRenderers = {} as Record<GradientStateKey, ChatBackgroundGradientRenderer>;
    this.gradientCanvases = {} as Record<GradientStateKey, HTMLCanvasElement>;
    this.gradientCancels = {};
    for(const key of Object.keys(GRADIENT_COLORS) as GradientStateKey[]) {
      const created = ChatBackgroundGradientRenderer.create(GRADIENT_COLORS[key]);
      created.canvas.classList.add(className + '-gradient');
      if(key !== this.gradientState) {
        created.canvas.classList.add('is-hidden');
      }
      container.append(created.canvas);
      this.gradientCanvases[key] = created.canvas;
      this.gradientRenderers[key] = created.gradientRenderer;
      this.tickGradient(key);
    }

    // Avatar / name / duration live in a centred column when there is no
    // video. With video, the column slides to the top and shrinks. The
    // wrapper makes that a single transform target instead of having to
    // animate each element separately.
    const info = document.createElement('div');
    info.classList.add(className + '-info');
    info.append(avatarContainer, title, subtitle);
    container.append(info);

    // Two right-side button groups in the header: a slot for the encryption
    // emojis (center) and an action cluster (settings + fullscreen) so they
    // stay glued together on the right edge regardless of how many of them
    // are visible at a time.
    const headerActions = document.createElement('div');
    headerActions.classList.add(className + '-header-actions');

    this.btnSettings = ButtonIcon('settings_filled');
    attachClickEvent(this.btnSettings, () => {
      showCallSettingsPopup({mode: 'p2p', instance: this.instance});
    }, {listenerSetter});
    headerActions.append(this.btnSettings);

    if(!IS_MOBILE) {
      this.btnFullScreen = ButtonIcon('fullscreen');
      this.btnExitFullScreen = ButtonIcon('smallscreen hide');
      attachClickEvent(this.btnFullScreen, this.onFullScreenClick, {listenerSetter});
      attachClickEvent(this.btnExitFullScreen, () => cancelFullScreen(), {listenerSetter});
      addFullScreenListener(this.container, this.onFullScreenChange, listenerSetter);
      headerActions.append(this.btnExitFullScreen, this.btnFullScreen);
    }

    // Header layout: close (left, auto-added by PopupElement), emojis
    // (center), action cluster (right).
    this.header.append(emojisSubtitle);
    this.header.append(headerActions);

    this.partyStates = document.createElement('div');
    this.partyStates.classList.add(className + '-party-states');

    this.partyMutedState = document.createElement('div');
    this.partyMutedState.classList.add(className + '-party-state');
    const stateText = i18n('VoipUserMicrophoneIsOff', [new PeerTitle({peerId, onlyFirstName: true, limitSymbols: 18}).element]);
    stateText.classList.add(className + '-party-state-text');
    const mutedIcon = new GroupCallMicrophoneIconMini(false, true, 36);
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

      // Stop every state's rAF loop and tear down the renderers. Nulling
      // `gradientRenderers` first stops any late `tickGradient` from
      // re-arming itself.
      if(this.gradientHideTimeout !== undefined) {
        clearTimeout(this.gradientHideTimeout);
        this.gradientHideTimeout = undefined;
      }
      for(const key of Object.keys(this.gradientCancels) as GradientStateKey[]) {
        this.gradientCancels[key]?.();
      }
      this.gradientCancels = {};
      for(const renderer of Object.values(this.gradientRenderers || {})) {
        renderer.cleanup();
      }
      this.gradientRenderers = undefined;

      movablePanel.destroy();
    });

    this.updateInstance();
  }

  public getCallInstance() {
    return this.instance;
  }

  // Sequenced crossfade between pre-warmed gradient canvases:
  //   1. Bump the new canvas's z-index so it stacks ABOVE the previous one
  //      during the fade.
  //   2. Reveal it (`is-hidden` → off) — opacity 0 → 1 over the CSS
  //      transition. The previous canvas stays at opacity 1 underneath, so
  //      the user always sees a fully-opaque gradient — no half-and-half
  //      composite over the popup's dark background (that's what made the
  //      old simultaneous-fade flash black mid-transition).
  //   3. After the new canvas finishes fading in, hide the previous one. By
  //      then it's fully covered, so its 1→0 fade-down is imperceptible.
  //
  // Uses z-index rather than `parentElement.append(node)` because moving the
  // canvas in the DOM commits the previous opacity in the same paint as the
  // class flip — the browser sees no "from" value to transition from and
  // snaps the new canvas to opacity 1 in one frame. Z-index changes don't
  // disturb the transition baseline.
  //
  // The hide timeout is tracked so a rapid follow-up state change cancels
  // the pending hide of an intermediate state (and re-uses its canvas).
  private setGradientState(next: GradientStateKey) {
    if(next === this.gradientState) return;
    const prev = this.gradientState;
    this.gradientState = next;

    const prevCanvas = this.gradientCanvases?.[prev];
    const nextCanvas = this.gradientCanvases?.[next];
    if(!prevCanvas || !nextCanvas) return;

    // Layer the new canvas above the previous one for the duration of the
    // fade. Both stay BELOW the video container (z -1) and the avatar /
    // buttons / header (z 0+) — the SCSS default is z -3 so we promote to
    // -2 for the next gradient and leave prev / others at -3.
    for(const key of Object.keys(this.gradientCanvases) as GradientStateKey[]) {
      const canvas = this.gradientCanvases[key];
      canvas.style.zIndex = key === next ? '-2' : '';
    }

    // Force the browser to commit the current `is-hidden` state (opacity 0)
    // as the transition baseline before we toggle it off. Without this read
    // the next `is-hidden` removal and the toggle land in the same paint
    // and the canvas snaps to opacity 1 with no fade.
    void nextCanvas.offsetWidth;
    nextCanvas.classList.remove('is-hidden');

    // Cancel any pending hide from a prior transition — the canvas it was
    // meant to hide may now be the active one.
    if(this.gradientHideTimeout !== undefined) {
      clearTimeout(this.gradientHideTimeout);
      this.gradientHideTimeout = undefined;
    }

    const FADE_MS = 600;
    this.gradientHideTimeout = window.setTimeout(() => {
      this.gradientHideTimeout = undefined;
      // Skip if the state has flipped back to `prev` since we scheduled
      // (i.e. prev is now the active canvas).
      if(this.gradientState === prev) return;
      prevCanvas.classList.add('is-hidden');
    }, FADE_MS + 50);
  }

  // Ambient gradient motion for one state's canvas. Chained — when one
  // `toNextPosition` finishes (animateValue's `onEnd`) the next tick fires
  // immediately, so the gradient drifts continuously without gaps or
  // overlap. Each state has its own cancel handle so `close` can drop all
  // three rAF loops independently.
  //
  // The progress value is pre-warped to undo the renderer's internal
  // `easeOutQuadApply`. Without this, even with `animateValue`'s linear
  // easing the gradient still slows at the end of each 2s tick and jumps
  // back to full speed when the next tick starts — visible as a hitching
  // motion. The renderer computes `transitionValue = 2v - v²`; setting
  // `v = 1 - sqrt(1 - t)` makes `transitionValue ≡ t`, i.e. constant tail
  // velocity, i.e. constant-speed drift.
  private tickGradient = (state: GradientStateKey) => {
    const renderer = this.gradientRenderers?.[state];
    if(!renderer) return;
    let progress = 0;
    this.gradientCancels[state] = animateValue(0, 1, 2000, (t) => {
      progress = 1 - Math.sqrt(1 - t);
    }, {
      easing: (p) => p,
      onEnd: () => {
        this.gradientCancels[state] = undefined;
        this.tickGradient(state);
      }
    });
    renderer.toNextPosition(() => progress);
  };

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

    const microphoneIcon = this.microphoneIcon = new GroupCallMicrophoneIconMini(true, true, 36);
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

    // Drive the gradient palette — mirrors iOS PrivateCallScreen:
    // - connecting (purple/blue) for any pre-connected state
    // - active (green/teal) once both sides are talking
    // The weak-signal palette (warm orange/pink) is defined in GRADIENT_COLORS
    // for the day we surface a quality metric; not yet triggered.
    this.setGradientState(connectionState === CALL_STATE.CONNECTED ? 'active' : 'connecting');

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
