import IS_SCREEN_SHARING_SUPPORTED from '@environment/screenSharingSupport';
import {IS_MOBILE} from '@environment/userAgent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import ControlsHover from '@helpers/dom/controlsHover';
import findUpClassName from '@helpers/dom/findUpClassName';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '@helpers/dom/fullScreen';
import replaceContent from '@helpers/dom/replaceContent';
import safePlay from '@helpers/dom/safePlay';
import MovablePanel, {IS_MOVABLE_PANEL} from '@helpers/movablePanel';
import onMediaLoad from '@helpers/onMediaLoad';
import themeController from '@helpers/themeController';
import classNames from '@helpers/string/classNames';
import ListenerSetter from '@helpers/listenerSetter';
import CallInstance from '@lib/calls/callInstance';
import ConferenceInviteInstance from '@lib/calls/conferenceInviteInstance';
import CALL_STATE from '@lib/calls/callState';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {animateValue} from '@helpers/animateValue';
import animationIntersector from '@components/animationIntersector';
import {avatarNew} from '@components/avatarNew';
import ButtonIcon from '@components/buttonIcon';
import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';
import GroupCallMicrophoneIconMini from '@components/groupCall/microphoneIconMini';
import {MovableState} from '@components/movableElement';
import PeerTitle from '@components/peerTitle';
import StackedAvatars from '@components/stackedAvatars';
import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import CallButton from '@components/call/button';
import CallDescriptionElement from '@components/call/description';
import callVideoCanvasBlur from '@components/call/videoCanvasBlur';
import showCallSettingsPopup from '@components/call/settingsPopup';
import createCallNotice, {CallNotice} from '@components/call/notice';
import createCallSignalBars from '@components/call/signalBars';
import qualityStyles from '@components/call/callQuality.module.scss';
import {toastNew} from '@components/toast';
import {createSignal, onCleanup, onMount, untrack, useContext} from 'solid-js';

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

type AnyCallInstance = CallInstance | ConferenceInviteInstance;

// One panel per instance: the top bar and the calls controller both ask for a
// popup for the same call, and neither should end up with two of them.
const shownInstances = new Set<AnyCallInstance>();

export default function showCallPopup(instance: AnyCallInstance, options: {
  onClose?: () => void
} = {}) {
  if(shownInstances.has(instance)) {
    return;
  }

  shownInstances.add(instance);

  /**
   * Set when this popup shows a ringing conference invitation rather than a
   * 1-on-1 call. tdesktop shows both through the same `Calls::Panel`
   * (calls_panel.cpp:527) — there is no media, no key exchange and no
   * settings to offer until the invitation is accepted, so those parts of the
   * screen are simply not built.
   */
  const inviteInstance = instance instanceof ConferenceInviteInstance ? instance : undefined;
  /**
   * The 1-on-1 call behind this popup. Only defined when `inviteInstance` is
   * not: everything media-related (controls, video tiles, the fingerprint)
   * belongs to an actual call, and none of it is built for an invitation.
   */
  const callInstance = inviteInstance ? undefined : instance as CallInstance;
  const peerId = instance.interlocutorUserId.toPeerId();
  // * the call's: the tab may switch to another account while the panel is up
  const {accountNumber} = instance;

  const [show, setShow] = createSignal(true);
  const [noVideo, setNoVideo] = createSignal(true);
  const [isFull, setIsFull] = createSignal(false);
  const [twoButtonRows, setTwoButtonRows] = createSignal(false);

  let containerEl!: HTMLDivElement;

  // Pieces the imperative update path keeps mutating. They are built by
  // DOM-returning helpers (`ButtonIcon`, `avatarNew`), so they stay plain
  // elements; the call buttons (`CallButton`) follow signals of their own.
  let description: CallDescriptionElement;
  let emojisSubtitle: HTMLElement;
  let microphoneIcon: GroupCallMicrophoneIconMini;
  let btnFullScreen: HTMLButtonElement;
  let btnExitFullScreen: HTMLButtonElement;

  let movablePanel: MovablePanel;
  let controlsHover: ControlsHover;

  // One renderer per gradient state. Only the canvas matching `gradientState`
  // is opaque and drifts; the others sit at opacity 0, holding the picture they
  // were drawn with, and crossfade in/out on state change. Pre-warming all of
  // them means the newly-revealed canvas already has a gradient, which starts
  // moving as its fade starts — no "static until first tick" pop.
  let gradientRenderers: Record<GradientStateKey, ChatBackgroundGradientRenderer>;
  let gradientCanvases: Record<GradientStateKey, HTMLCanvasElement>;
  let gradientCancels: Partial<Record<GradientStateKey, () => void>> = {};
  let gradientState: GradientStateKey = 'connecting';
  let gradientHideTimeout: number;

  const videoContainers: {
    input?: HTMLElement,
    output?: HTMLElement
  } = {};

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
  //
  // Only the canvas shown drifts: a faded-out one keeps the picture it stood at, and starts again as
  // it is shown - three loops for one visible backdrop cost two full redraws of nothing every frame
  // for the whole call.
  const tickGradient = (state: GradientStateKey) => {
    const renderer = gradientRenderers?.[state];
    if(!renderer || gradientCancels[state]) return;
    let progress = 0;
    gradientCancels[state] = animateValue(0, 1, 2000, (t) => {
      progress = 1 - Math.sqrt(1 - t);
    }, {
      easing: (p) => p,
      onEnd: () => {
        gradientCancels[state] = undefined;
        if(gradientCanvases?.[state]?.classList.contains('is-hidden')) return;
        tickGradient(state);
      }
    });
    renderer.toNextPosition(() => progress);
  };

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
  const setGradientState = (next: GradientStateKey) => {
    if(next === gradientState) return;
    const prev = gradientState;
    gradientState = next;

    const prevCanvas = gradientCanvases?.[prev];
    const nextCanvas = gradientCanvases?.[next];
    if(!prevCanvas || !nextCanvas) return;

    // Layer the new canvas above the previous one for the duration of the
    // fade. Both stay BELOW the video container (z -1) and the avatar /
    // buttons / header (z 0+) — the SCSS default is z -3 so we promote to
    // -2 for the next gradient and leave prev / others at -3.
    for(const key of Object.keys(gradientCanvases) as GradientStateKey[]) {
      const canvas = gradientCanvases[key];
      canvas.style.zIndex = key === next ? '-2' : '';
    }

    // Force the browser to commit the current `is-hidden` state (opacity 0)
    // as the transition baseline before we toggle it off. Without this read
    // the next `is-hidden` removal and the toggle land in the same paint
    // and the canvas snaps to opacity 1 with no fade.
    void nextCanvas.offsetWidth;
    nextCanvas.classList.remove('is-hidden');
    tickGradient(next);

    // Cancel any pending hide from a prior transition — the canvas it was
    // meant to hide may now be the active one.
    if(gradientHideTimeout !== undefined) {
      clearTimeout(gradientHideTimeout);
      gradientHideTimeout = undefined;
    }

    const FADE_MS = 600;
    gradientHideTimeout = window.setTimeout(() => {
      gradientHideTimeout = undefined;
      // Skip if the state has flipped back to `prev` since we scheduled
      // (i.e. prev is now the active canvas).
      if(gradientState === prev) return;
      // * its drift goes on to the end of the move it is in (cut short, the renderer's own loop would
      // * wait for the rest of it for good), and no other starts (tickGradient)
      prevCanvas.classList.add('is-hidden');
    }, FADE_MS + 50);
  };

  const runControlAction = (
    action: () => Promise<void>,
    errorKey: 'ConferenceCall.Media.CameraError' |
      'ConferenceCall.Media.ScreenError' |
      'ConferenceCall.Media.MicrophoneError' |
      'Error.AnError',
    restoreControls?: () => void
  ): void => {
    void (async() => {
      try {
        await action();
      } catch(err) {
        console.error('P2P call control action failed', err);
        toastNew({langPackKey: errorKey});
      } finally {
        restoreControls?.();
      }
    })();
  };

  const resizeVideoContainers = () => {
    Object.values(videoContainers).forEach((container) => {
      const isSmall = container.classList.contains('small');
      if(isSmall) {
        const video = container.querySelector('video');
        const popupWidth = movablePanel.state;
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
  };

  const createVideoContainer = (video: HTMLVideoElement) => {
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

      const big = Object.values(videoContainers).find((container) => !container.classList.contains('small'));
      big.classList.add('small');
      big.style.cssText = container.style.cssText;
      container.classList.remove('small');
      container.style.cssText = '';

      resizeVideoContainers();
    });

    const canvas = callVideoCanvasBlur(video);
    canvas.classList.add(_className + '-blur');

    container.append(canvas, video);

    return container;
  };

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const listenerSetter = new ListenerSetter();

    const avatarContainer = document.createElement('div');
    avatarContainer.classList.add(className + '-avatar');

    const {node} = avatarNew({
      middleware,
      isBig: true,
      peerId,
      size: 'full',
      accountNumber
    });
    avatarContainer.append(node);

    const title = new PeerTitle({
      peerId,
      accountNumber
    }).element;

    title.classList.add(className + '-title');
    // The popup shell names its role="dialog" from the title it finds inside
    // (see indexTsx.tsx); the call panel's heading is this peer title.
    title.setAttribute('data-popup-title', '');

    const subtitle = document.createElement('div');
    subtitle.classList.add(className + '-subtitle');

    // Reception, as the engine measures it (0..4), while the call is connected — undefined hides
    // the bars, the way Android waits for its first count.
    const [signalBars, setSignalBars] = createSignal<number>();
    if(callInstance) {
      subtitle.classList.add(qualityStyles.subtitle);
      subtitle.append(createCallSignalBars(signalBars));
    }

    description = new CallDescriptionElement(subtitle);

    emojisSubtitle = document.createElement('div');
    emojisSubtitle.classList.add(className + '-emojis');
    // The key is a hash: both sides compare it in the same order, whatever their languages.
    emojisSubtitle.dir = 'ltr';

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
    gradientRenderers = {} as Record<GradientStateKey, ChatBackgroundGradientRenderer>;
    gradientCanvases = {} as Record<GradientStateKey, HTMLCanvasElement>;
    for(const key of Object.keys(GRADIENT_COLORS) as GradientStateKey[]) {
      const created = ChatBackgroundGradientRenderer.create(GRADIENT_COLORS[key]);
      created.canvas.classList.add(className + '-gradient');
      if(key !== gradientState) {
        created.canvas.classList.add('is-hidden');
      }
      gradientCanvases[key] = created.canvas;
      gradientRenderers[key] = created.gradientRenderer;
      if(key === gradientState) {
        tickGradient(key);
      }
    }

    /**
     * The "who is already in this call" pill — tdesktop's
     * `Panel::initConferenceInvite` (calls_panel.cpp:527): up to three userpics
     * plus the participant count, and nothing at all below two participants.
     */
    const constructConferenceParticipants = (inviteInstance: ConferenceInviteInstance) => {
      const peerIds = inviteInstance.participants;
      if(peerIds.length < 2) {
        return;
      }

      const container = document.createElement('div');
      container.classList.add(className + '-participants');

      const stackedAvatars = new StackedAvatars({
        avatarSize: 30,
        middleware,
        accountNumber
      });
      stackedAvatars.render(peerIds);

      const label = i18n('VoiceChat.Status.Members', [peerIds.length]);
      label.classList.add(className + '-participants-label');

      container.append(stackedAvatars.container, label);
      return container;
    };

    // Avatar / name / duration live in a centred column when there is no
    // video. With video, the column slides to the top and shrinks. The
    // wrapper makes that a single transform target instead of having to
    // animate each element separately.
    const info = document.createElement('div');
    info.classList.add(className + '-info');
    info.append(avatarContainer, title, subtitle);
    if(inviteInstance) {
      const participants = constructConferenceParticipants(inviteInstance);
      if(participants) {
        info.append(participants);
      }
    }

    // Two right-side button groups in the header: a slot for the encryption
    // emojis (center) and an action cluster (settings + fullscreen) so they
    // stay glued together on the right edge regardless of how many of them
    // are visible at a time. A ringing invitation has neither a call to
    // configure nor video to expand, so it gets no action cluster at all.
    const headerActions = document.createElement('div');
    headerActions.classList.add(className + '-header-actions');

    const onFullScreenChange = () => {
      const wasFullScreen = untrack(isFull);
      const isFullNow = isFullScreen();
      setIsFull(isFullNow);

      btnFullScreen && btnFullScreen.classList.toggle('hide', isFullNow);
      btnExitFullScreen && btnExitFullScreen.classList.toggle('hide', !isFullNow);

      if(isFullNow !== wasFullScreen) {
        animationIntersector.checkAnimations(isFullNow);

        themeController.setThemeColor(isFullNow ? '#000000' : undefined);

        resizeVideoContainers();
      }
    };

    if(!inviteInstance) {
      const btnSettings = ButtonIcon('settings_filled');
      attachClickEvent(btnSettings, () => {
        showCallSettingsPopup({mode: 'p2p', instance: callInstance});
      }, {listenerSetter});
      headerActions.append(btnSettings);

      if(!IS_MOBILE) {
        btnFullScreen = ButtonIcon('fullscreen');
        btnExitFullScreen = ButtonIcon('smallscreen hide');
        attachClickEvent(btnFullScreen, () => requestFullScreen(containerEl), {listenerSetter});
        attachClickEvent(btnExitFullScreen, () => cancelFullScreen(), {listenerSetter});
        headerActions.append(btnExitFullScreen, btnFullScreen);
      }
    }

    // The pills above the controls. A weak link — iOS raises its banner once the quality drops to a
    // fifth (`PrivateCallScreen`: `quality <= 0.2`), i.e. at no bars at all. Then what the other
    // side's MediaState says about them: a closed microphone, and a battery about to run out
    // (tdesktop `Panel::createRemoteLowBattery`, macOS `CallTooltipType.batteryLow`). They share one
    // column, so two of them at once stack instead of overlapping.
    let partyStates: HTMLElement;
    let weakNetworkNotice: CallNotice;
    let mutedNotice: CallNotice;
    let lowBatteryNotice: CallNotice;
    if(!inviteInstance) {
      partyStates = document.createElement('div');
      partyStates.classList.add(className + '-party-states');

      weakNetworkNotice = createCallNotice({text: () => i18n('VoipWeakNetwork')});

      const peerName = () => new PeerTitle({peerId, onlyFirstName: true, limitSymbols: 18, accountNumber}).element;

      const mutedIcon = new GroupCallMicrophoneIconMini(false, true, 36);
      mutedIcon.setState(false, false);
      mutedNotice = createCallNotice({
        text: () => i18n('VoipUserMicrophoneIsOff', [peerName()]),
        icon: mutedIcon.container
      });

      lowBatteryNotice = createCallNotice({
        text: () => i18n('Call.Toast.LowBattery', [peerName()]),
        icon: (
          <svg class={qualityStyles.batteryIcon} viewBox="0 0 29 13" fill="none" aria-hidden="true">
            <rect x="1.5" y=".5" width="24" height="12" rx="4" stroke="currentColor" />
            <path d="M27 4.67v4c.8-.34 1.33-1.13 1.33-2s-.53-1.66-1.33-2z" fill="currentColor" />
            <rect x="4.5" y="3.5" width="2" height="6" rx="1" fill="currentColor" />
          </svg>
        ) as SVGSVGElement
      });

      const notices = [weakNetworkNotice, mutedNotice, lowBatteryNotice];
      partyStates.append(
        ...notices.map((notice) => notice.element),
        ...notices.map((notice) => notice.announcement)
      );
    }

    // What the buttons show; `updateInstance` keeps it in step with the call.
    const [isClosed, setIsClosed] = createSignal(false);
    const [canAccept, setCanAccept] = createSignal(false);
    const [declineLabel, setDeclineLabel] = createSignal<LangPackKey>('Call.Decline');
    const [isMuted, setIsMuted] = createSignal(false);
    // follows the microphone icon's animation, a step behind `isMuted`
    const [muteFilled, setMuteFilled] = createSignal(false);
    const [sharingVideo, setSharingVideo] = createSignal(false);
    const [sharingScreen, setSharingScreen] = createSignal(false);
    const [mediaBusy, setMediaBusy] = createSignal(false);

    const onMediaClick = (action: () => Promise<void>, errorKey: 'ConferenceCall.Media.CameraError' | 'ConferenceCall.Media.ScreenError') => {
      setMediaBusy(true);
      runControlAction(action, errorKey, () => setMediaBusy(false));
    };

    let firstButtonsRow: HTMLElement;
    if(!inviteInstance) {
      microphoneIcon = new GroupCallMicrophoneIconMini(true, true, 36);

      firstButtonsRow = (
        <div class={classNames(className + '-buttons', 'is-first')}>
          <CallButton
            class={className}
            label="Call.Camera"
            icon="videocamera_filled"
            active={sharingVideo()}
            pressed={sharingVideo()}
            disabled={isClosed()}
            busy={mediaBusy()}
            onClick={() => onMediaClick(() => callInstance.toggleVideoSharing(), 'ConferenceCall.Media.CameraError')}
          />
          {IS_SCREEN_SHARING_SUPPORTED && (
            <CallButton
              class={className}
              label="Call.Screen"
              icon="sharescreen_filled"
              active={sharingScreen()}
              pressed={sharingScreen()}
              busy={mediaBusy()}
              onClick={() => onMediaClick(() => callInstance.toggleScreenSharing(), 'ConferenceCall.Media.ScreenError')}
            />
          )}
          <CallButton
            class={className}
            label={isMuted() ? 'VoipUnmute' : 'Call.Mute'}
            active={muteFilled()}
            onClick={() => runControlAction(() => callInstance.toggleMuted(), 'ConferenceCall.Media.MicrophoneError')}
          >
            {microphoneIcon.container}
          </CallButton>
        </div>
      ) as HTMLElement;
    }

    const secondButtonsRow = (
      <div class={classNames(className + '-buttons', 'is-second')}>
        <CallButton
          class={className}
          label={declineLabel()}
          icon="endcall_filled"
          color="red"
          onClick={() => runControlAction(
            () => inviteInstance ?
              inviteInstance.hangUp() :
              callInstance.hangUp('phoneCallDiscardReasonHangup'),
            'Error.AnError'
          )}
        />
        <CallButton
          class={className}
          label="Call.Accept"
          icon="phone_filled"
          color="green"
          containerClass={canAccept() ? undefined : 'hide-me'}
          disabled={!canAccept()}
          onClick={() => runControlAction(() => instance.acceptCall(), 'Error.AnError')}
        />
      </div>
    ) as HTMLElement;

    // Reception drives the bars, the weak-network pill and the palette, as in iOS
    // `PrivateCallScreen`: connecting (purple/blue) before the call is up, active (green/teal)
    // while it is, and weak (warm orange/pink) when the bars drop to none. Only a connected call
    // has a reception to speak of — a reconnecting one is back to "Connecting...".
    const updateSignal = () => {
      if(callInstance.isClosing) {
        return;
      }

      const isConnected = callInstance.connectionState === CALL_STATE.CONNECTED;
      const bars = isConnected ? callInstance.signalBars : undefined;
      const isWeak = bars === 0;
      setSignalBars(bars);
      weakNetworkNotice.setVisible(isWeak);
      setGradientState(isConnected ? (isWeak ? 'weak' : 'active') : 'connecting');
    };

    const updateInstance = () => {
      const {connectionState} = instance;
      if(connectionState === CALL_STATE.CLOSED) {
        if(untrack(isFull)) {
          cancelFullScreen();
        }

        setIsClosed(true);

        context.hide();
        return;
      }

      // A ringing invitation has none of the state below it: no media to mirror
      // into the controls, no video tiles, no emoji fingerprint. Only the accept
      // button's visibility and the status line change, and both stop mattering
      // the moment the invitation is accepted or declined.
      if(inviteInstance) {
        const isPending = connectionState === CALL_STATE.PENDING;
        setDeclineLabel(isPending ? 'Call.Decline' : 'Call.End');
        setCanAccept(isPending);
        description.update(instance);
        return;
      }

      updateSignal();

      const isPendingIncoming = !instance.isOutgoing && connectionState === CALL_STATE.PENDING;
      setDeclineLabel(connectionState === CALL_STATE.PENDING ? 'Call.Decline' : 'Call.End');
      setCanAccept(isPendingIncoming);
      setTwoButtonRows(isPendingIncoming);

      const muted = callInstance.isMuted;
      const onFrame = () => setMuteFilled(muted);

      const player = microphoneIcon.getItem().player;
      microphoneIcon.setState(!muted, !muted, onFrame);
      if(!player) {
        onFrame();
      }

      setIsMuted(muted);
      setSharingVideo(callInstance.isSharingVideo);
      setSharingScreen(callInstance.isSharingScreen);

      const outputState = callInstance.getMediaState('output');
      mutedNotice.setVisible(!!outputState?.muted);
      lowBatteryNotice.setVisible(!!outputState?.lowBattery);

      const oldContainers = {...videoContainers};
      ['input' as const, 'output' as const].forEach((type) => {
        const mediaState = callInstance.getMediaState(type);
        const video = callInstance.getVideoElement(type) as HTMLVideoElement;

        const hasFrame = !!(video && video.videoWidth && video.videoHeight);
        if(video && !hasFrame && !video.dataset.hasPromise) {
          video.dataset.hasPromise = '1';
          let loaded = false;
          void (async() => {
            try {
              await onMediaLoad(video);
              loaded = true;
            } catch(err) {
              console.error('P2P call video failed to load', err);
            } finally {
              delete video.dataset.hasPromise;
              if(loaded && gradientRenderers) {
                updateInstance();
              }
            }
          })();
        }

        const isActive = !!video && hasFrame && !!(mediaState && (mediaState.videoState === 'active' || mediaState.screencastState === 'active'));
        let videoContainer = videoContainers[type];

        if(isActive && video && !videoContainer) {
          videoContainer = videoContainers[type] = createVideoContainer(video);
          containerEl.append(videoContainer);
        }

        if(!isActive && videoContainer) {
          videoContainer.remove();
          delete videoContainers[type];
        }
      });

      {
        const input = videoContainers.input;
        const output = videoContainers.output;
        if(Object.keys(oldContainers).length !== Object.keys(videoContainers).length && input) {
          input.classList.toggle('small', !!output);
        }

        if(output && !input) {
          output.classList.remove('small');
        }
      }

      resizeVideoContainers();

      setNoVideo(!Object.keys(videoContainers).length);

      if(
        !emojisSubtitle.textContent &&
        !emojisSubtitle.dataset.hasPromise &&
        !emojisSubtitle.dataset.fingerprintFailed &&
        connectionState < CALL_STATE.EXCHANGING_KEYS
      ) {
        emojisSubtitle.dataset.hasPromise = '1';
        void (async() => {
          try {
            const emojis = await Promise.resolve(callInstance.getEmojisFingerprint());
            if(gradientRenderers) {
              replaceContent(emojisSubtitle, wrapEmojiText(emojis.join('')));
            }
          } catch(err) {
            emojisSubtitle.dataset.fingerprintFailed = '1';
            console.error('P2P emoji fingerprint failed', err);
          } finally {
            delete emojisSubtitle.dataset.hasPromise;
          }
        })();
      }

      description.update(instance);
    };

    if(inviteInstance) {
      listenerSetter.add(inviteInstance)('state', updateInstance);
    } else {
      listenerSetter.add(callInstance)('state', updateInstance);
      listenerSetter.add(callInstance)('mediaState', updateInstance);
      listenerSetter.add(callInstance)('signalBars', updateSignal);
    }

    onMount(() => {
      if(!inviteInstance && !IS_MOBILE) {
        addFullScreenListener(containerEl, onFullScreenChange, listenerSetter);
      }

      movablePanel = new MovablePanel({
        listenerSetter,
        movableOptions: {
          minWidth: MIN_WIDTH,
          minHeight: MIN_HEIGHT,
          element: context.element,
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
        previousState: !instance.wasTryingToJoin && !instance.isOutgoing ? {...INIT_STATE} : previousState
      });

      const movableElement = movablePanel.movable;
      if(movableElement) {
        listenerSetter.add(movableElement)('resize', () => {
          resizeVideoContainers();
        });
      }

      controlsHover = new ControlsHover();
      controlsHover.setup({
        element: containerEl,
        listenerSetter,
        showOnLeaveToClassName: 'call-buttons'
      });
      controlsHover.showControls(false);

      updateInstance();
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    return (
      <>
        <PopupElement.Header>
          <PopupElement.CloseButton class={isFull() ? 'hide' : undefined} />
          {emojisSubtitle}
          {headerActions}
        </PopupElement.Header>
        {Object.values(gradientCanvases)}
        {info}
        {partyStates}
        {firstButtonsRow}
        {secondButtonsRow}
      </>
    );
  }

  const onClose = () => {
    shownInstances.delete(instance);

    if(movablePanel) {
      previousState = movablePanel.state;
      movablePanel.destroy();
    }

    microphoneIcon?.destroy();

    // Stop every state's rAF loop and tear down the renderers. Nulling
    // `gradientRenderers` first stops any late `tickGradient` from
    // re-arming itself.
    if(gradientHideTimeout !== undefined) {
      clearTimeout(gradientHideTimeout);
      gradientHideTimeout = undefined;
    }
    for(const key of Object.keys(gradientCancels) as GradientStateKey[]) {
      gradientCancels[key]?.();
    }
    gradientCancels = {};
    for(const renderer of Object.values(gradientRenderers || {})) {
      renderer.cleanup();
    }
    gradientRenderers = undefined;

    options.onClose?.();
  };

  createPopup(() => (
    <PopupElement
      class={classNames('popup-call', IS_MOVABLE_PANEL && 'movable-element')}
      managers={instance.managers}
      keepOnAccountSwitch
      withoutOverlay
      closable
      show={show()}
      containerClass={classNames(
        className,
        'night',
        inviteInstance && 'is-conference-invite',
        noVideo() && 'no-video',
        !inviteInstance && !IS_SCREEN_SHARING_SUPPORTED && 'no-screen',
        isFull() && 'is-full-screen',
        twoButtonRows() && 'two-button-rows'
      )}
      containerProps={{ref: (element) => containerEl = element}}
      onClose={onClose}
    >
      <Inner />
    </PopupElement>
  ));

  return {
    hide: () => {
      setShow(false);
    }
  };
}
