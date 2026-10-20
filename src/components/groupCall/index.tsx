import PopupElement, {createPopup, PopupContext} from '@components/popups/indexTsx';
import {hexToRgb} from '@helpers/color';
import customProperties from '@helpers/dom/customProperties';
import {GroupCallParticipant} from '@layer';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import {LottieColor} from '@lib/lottie/lottiePlayer';
import rootScope from '@lib/rootScope';
import ButtonIcon from '@components/buttonIcon';
import GroupCallMicrophoneIcon from '@components/groupCall/microphoneIcon';
import GroupCallParticipantsElement from '@components/groupCall/participants';
import GroupCallVideoGrid from '@components/groupCall/videoGrid';
import GroupCallMicrophoneBlobs from '@components/groupCall/microphoneBlobs';
import GroupCallDescriptionElement from '@components/groupCall/description';
import GroupCallTitleElement from '@components/groupCall/title';
import requestGroupCallLeave from '@components/groupCall/requestLeave';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '@helpers/dom/fullScreen';
import ControlsHover from '@helpers/dom/controlsHover';
import {MovableState} from '@components/movableElement';
import animationIntersector from '@components/animationIntersector';
import {IS_APPLE_MOBILE} from '@environment/userAgent';
import throttle from '@helpers/schedulers/throttle';
import IS_SCREEN_SHARING_SUPPORTED from '@environment/screenSharingSupport';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import CallButton, {setCallButtonLabel} from '@components/call/button';
import MovablePanel, {IS_MOVABLE_PANEL} from '@helpers/movablePanel';
import ListenerSetter from '@helpers/listenerSetter';
import classNames from '@helpers/string/classNames';
import findUpClassName from '@helpers/dom/findUpClassName';
import themeController from '@helpers/themeController';
import groupCallsController from '@lib/calls/groupCallsController';
import {createEffect, createSignal, on, onCleanup, onMount, untrack, useContext} from 'solid-js';
import FingerprintBadge from '@components/conferenceCall/fingerprintBadge';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import showCallSettingsPopup from '@components/call/settingsPopup';
import {toastNew} from '@components/toast';
import {showCallAccount} from '@lib/calls/callAccount';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import {
  GROUP_CALL_MICROPHONE_BUTTON_STATE,
  getGroupCallMicrophoneButtonState,
  getMicrophoneControlAccessibility,
  performMicrophoneControlAction,
  shouldCarryOutMicrophonePress,
  MicrophonePressBeforeListed
} from '@components/groupCall/microphoneControl';
import showPickUserPopup, {createCopyLinkFooter} from '@components/popups/pickUser';
import {copyTextToClipboard} from '@helpers/clipboard';
import shareGroupCallInviteLink from '@components/call/shareInviteLink';
import createInviteViaLinkRow from '@components/groupCall/inviteViaLinkRow';
import {
  inviteConferenceParticipants,
  showConferenceInviteResultToast
} from '@components/groupCall/inviteParticipants';
import {GROUP_CALL_STAGE_GAP} from '@components/groupCall/videoLayout';

export enum GROUP_CALL_PARTICIPANT_MUTED_STATE {
  // Microphone open, not speaking right now.
  UNMUTED,
  MUTED,
  MUTED_FOR_ME,
  MUTED_BY_ADMIN,
  HAND,
  // Microphone open and actually speaking (audio level, GroupCallInstance
  // `speaking`).
  SPEAKING
}

export type GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE = Exclude<
  GROUP_CALL_PARTICIPANT_MUTED_STATE,
  GROUP_CALL_PARTICIPANT_MUTED_STATE.MUTED_BY_ADMIN |
  GROUP_CALL_PARTICIPANT_MUTED_STATE.MUTED_FOR_ME |
  GROUP_CALL_PARTICIPANT_MUTED_STATE.SPEAKING
>;

export function getGroupCallParticipantMutedState(participant: GroupCallParticipant, speaking?: boolean) {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  if(participant.pFlags.muted_by_you) {
    return states.MUTED_FOR_ME;
  } else if(participant.raise_hand_rating !== undefined) {
    return states.HAND;
  } else if(participant.pFlags.muted) {
    return participant.pFlags.can_self_unmute ? states.MUTED : states.MUTED_BY_ADMIN;
  } else {
    return speaking ? states.SPEAKING : states.UNMUTED;
  }
}

export function clearMutedStateModifier(state: GROUP_CALL_PARTICIPANT_MUTED_STATE): GROUP_CALL_PARTICIPANT_CLEARED_MUTED_STATE {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  switch(state) {
    case states.MUTED_BY_ADMIN:
    case states.MUTED_FOR_ME:
      return states.MUTED;
    case states.SPEAKING:
      return states.UNMUTED;
    default:
      return state;
  }
}

export function getColorByMutedState(state: GROUP_CALL_PARTICIPANT_MUTED_STATE) {
  const states = GROUP_CALL_PARTICIPANT_MUTED_STATE;
  let colorStr: 'blue' | 'green' | 'secondary' | 'red';
  switch(state) {
    // An open microphone is blue until its owner speaks, then green — as in
    // the native apps; green for every unmuted row said "speaking" to people
    // who were silent.
    case states.HAND:
    case states.UNMUTED:
      colorStr = 'blue';
      break;
    // An open microphone stays grey until its owner speaks, then turns green;
    // green for every unmuted row said "speaking" to people who were silent.
    case states.UNMUTED:
    case states.MUTED:
    case states.MUTED_FOR_ME:
    case states.MUTED_BY_ADMIN:
      colorStr = state === states.MUTED || state === states.UNMUTED ? 'secondary' : 'red';
      break;
    case states.SPEAKING:
      colorStr = 'green';
      break;
  }

  const propertyValue = customProperties.getProperty('gc-' + colorStr + '-text-color');
  const color: LottieColor = hexToRgb(propertyValue);

  return color;
}

let previousState: MovableState = {
  width: 420,
  height: 640
};

const className = 'group-call';

export const GROUP_CALL_POPUP_KIND = Symbol('group-call-popup');

export default function showGroupCallPopup() {
  if(PopupElement.getPopups(GROUP_CALL_POPUP_KIND).length) {
    return;
  }

  const instance = groupCallsController.groupCall;

  const [show, setShow] = createSignal(true);
  const [isFull, setIsFull] = createSignal(false);
  const [isBigLayout, setIsBigLayout] = createSignal(false);
  // the constructor used to flip this on right after building the popup
  const [isRightColumnShown, setIsRightColumnShown] = createSignal(true);
  const [showControls, setShowControls] = createSignal(false);

  let containerEl!: HTMLDivElement;

  // Everything below is built by DOM-returning helpers (ButtonIcon, makeButton,
  // the group-call widgets), so it stays imperative — only the container's own
  // classes are driven by signals.
  let videosCount = 0;
  let btnFullScreen: HTMLButtonElement;
  let btnFullScreen2: HTMLButtonElement;
  let btnExitFullScreen: HTMLButtonElement;
  let btnShowColumn: HTMLButtonElement;
  let btnMute: HTMLButtonElement;
  let buttonsContainer: HTMLDivElement;
  let movablePanel: MovablePanel;
  let groupCallTitle: GroupCallTitleElement;
  let groupCallDescription: GroupCallDescriptionElement;
  let groupCallBodyHeaderDescription: GroupCallDescriptionElement;
  let groupCallParticipants: GroupCallParticipantsElement;
  let videoGrid: GroupCallVideoGrid;
  let microphoneBlobs: GroupCallMicrophoneBlobs;
  let updateBlobsVisibility: () => void;
  let groupCallMicrophoneIcon: GroupCallMicrophoneIcon;
  let bodyEl!: HTMLDivElement;

  // How much of the stage the participants column covers, plus a gap before it. Read off layout
  // offsets rather than boxes, so a column still sliding in reads where it is going. The column is
  // at the inline end: on the left in RTL.
  const getColumnCover = () => {
    if(!untrack(isBigLayout) || !untrack(isRightColumnShown) || !bodyEl) {
      return 0;
    }

    const {stage} = videoGrid;
    const cover = I18n.getIsRTL() ?
      bodyEl.offsetLeft + bodyEl.offsetWidth - stage.offsetLeft :
      stage.offsetLeft + stage.offsetWidth - bodyEl.offsetLeft;
    return cover + GROUP_CALL_STAGE_GAP;
  };

  const updateGridMode = (animate: boolean) => {
    videoGrid?.setMode({wide: untrack(isBigLayout), columnWidth: getColumnCover()}, animate);
  };

  const toggleRightColumn = () => {
    setIsRightColumnShown((shown) => !shown);
    // the column slides with a transform and the tiles move aside with theirs, in step
    updateGridMode(true);
  };

  const toggleBigLayout = () => {
    const movable = movablePanel?.movable;
    const isBig = (isFullScreen() || !!(movable && movable.width >= 680)) && !!videosCount;

    /* if(!isBig && isFull) {
      cancelFullScreen();
      return;
    } */

    const wasBig = untrack(isBigLayout);
    let buttons: HTMLElement[];
    if(isBig && !wasBig) { // fix buttons transition to 0 opacity
      buttons = Array.from(buttonsContainer.querySelectorAll<HTMLElement>('.' + className + '-button'));
      buttons.forEach((element) => {
        element.style.opacity = '0';
      });

      void buttonsContainer.offsetLeft;
    }

    setIsBigLayout(isBig);
    btnShowColumn.classList.toggle('hide', !isBig);
    // A resize of the panel runs this on every step of the drag. The column keeps its width
    // whatever the panel's, so the stage it covers changes with the layout only — measuring it
    // each step forced a layout for nothing.
    if(isBig !== wasBig) {
      updateGridMode(false);
    }
    updateBlobsVisibility?.();

    if(buttons) {
      // window.requestAnimationFrame(() => {
      buttons.forEach((element) => {
        element.style.opacity = '';
      });
      // });
    }
  };

  const onFullScreenChange = () => {
    toggleBigLayout();
    const isFullNow = isFullScreen();

    const wasFullScreen = untrack(isFull);
    setIsFull(isFullNow);
    btnFullScreen && btnFullScreen.classList.toggle('hide', isFullNow);
    btnExitFullScreen && btnExitFullScreen.classList.toggle('hide', !isFullNow);
    // the column is wider in full screen, which only its new class tells
    updateGridMode(false);

    if(isFullNow !== wasFullScreen) {
      animationIntersector.checkAnimations2(isFullNow);

      themeController.setThemeColor(isFullNow ? '#000000' : undefined);
    }
  };

  function Inner() {
    const context = useContext(PopupContext);
    const middleware = untrack(() => context.middlewareHelper).get();
    const managers = untrack(() => context.managers);
    const listenerSetter = new ListenerSetter();

    const onFullScreenClick = () => requestFullScreen(containerEl);

    if(!IS_APPLE_MOBILE) {
      btnFullScreen = ButtonIcon('fullscreen');
      btnFullScreen2 = ButtonIcon('fullscreen ' + className + '-cfs');
      btnExitFullScreen = ButtonIcon('smallscreen');

      setCallButtonLabel(btnFullScreen, 'ConferenceCall.Controls.EnterFullscreen');
      setCallButtonLabel(btnFullScreen2, 'ConferenceCall.Controls.EnterFullscreen');
      setCallButtonLabel(btnExitFullScreen, 'ConferenceCall.Controls.ExitFullscreen');

      listenerSetter.add(btnFullScreen)('click', onFullScreenClick);
      listenerSetter.add(btnFullScreen2)('click', onFullScreenClick);

      listenerSetter.add(btnExitFullScreen)('click', () => {
        cancelFullScreen();
      });
    }

    btnShowColumn = ButtonIcon('rightpanel ' + className + '-only-big');

    setCallButtonLabel(btnShowColumn, 'ConferenceCall.Controls.ShowParticipants');
    listenerSetter.add(btnShowColumn)('click', toggleRightColumn);

    const headerInfo = document.createElement('div');
    headerInfo.classList.add(className + '-header-info');

    // The popup shell renders the title itself, but this header duplicates
    // itself into the participants column, so the title has to be a node this
    // module owns and can clone.
    const title = document.createElement('div');
    title.classList.add('popup-title', className + '-header-title');

    const subtitle = document.createElement('div');
    subtitle.classList.add(className + '-header-subtitle');

    headerInfo.append(title, subtitle);

    // A shallow copy of the header for the participants column: same classes,
    // its own back button, its own title.
    const newHeader = document.createElement('div');
    newHeader.classList.add('popup-header', className + '-header');
    const newHeaderInfo = headerInfo.cloneNode(false) as HTMLElement;
    const newHeaderTitle = title.cloneNode(false) as HTMLElement;

    newHeaderInfo.append(newHeaderTitle);

    const btnHideColumn = ButtonIcon('rightpanel');
    newHeader.append(...[btnHideColumn, newHeaderInfo, btnFullScreen2].filter(Boolean));

    setCallButtonLabel(btnHideColumn, 'ConferenceCall.Controls.HideParticipants');
    listenerSetter.add(btnHideColumn)('click', toggleRightColumn);

    videoGrid = new GroupCallVideoGrid({
      instance,
      listenerSetter,
      onCountChange: (count) => {
        videosCount = count;
        toggleBigLayout();
      }
    });

    // A language switched on the fly moves the column to the other side and the tiles follow it
    // (the stage it leaves is as wide either way, so only the layout changes).
    createEffect(on(I18n.isRTL, () => videoGrid.relayout(), {defer: true}));

    groupCallTitle = new GroupCallTitleElement(title);
    groupCallDescription = new GroupCallDescriptionElement(subtitle);
    groupCallBodyHeaderDescription = new GroupCallDescriptionElement(newHeaderTitle);

    // When this popup is hosting a TdE2E conference (instance.e2e is set), the
    // call's key, under the header, lets users visually verify the call is
    // encrypted to the same key on every participant's device. No key for a
    // legacy voice chat.
    let fingerprintBadge: HTMLElement;
    if(instance?.e2e) {
      const [hash, setHash] = createSignal<Uint8Array | undefined>(
        instance.e2eStatus?.verification?.emojiHash
      );
      listenerSetter.add(instance)('e2eStatus', (status) => {
        setHash(status.verification?.emojiHash);
      });

      fingerprintBadge = wrapSolidComponent(() => (
        <FingerprintBadge emojiHash={hash()} />
      ), middleware);
    }

    // What the call's buttons show; `updateInstance` keeps it in step with the call.
    const [sharingVideo, setSharingVideo] = createSignal(false);
    const [sharingScreen, setSharingScreen] = createSignal(false);
    const [mediaReady, setMediaReady] = createSignal(false);
    const [videoBusy, setVideoBusy] = createSignal(false);
    const [screenBusy, setScreenBusy] = createSignal(false);
    const [microphoneLabel, setMicrophoneLabel] = createSignal<LangPackKey>('VoipUnmute');

    // `setBusy`, when the action has one of the call's buttons to show busy meanwhile
    const runControlAction = async(
      setBusy: ((busy: boolean) => void) | undefined,
      action: () => MaybePromise<void>,
      errorKey: LangPackKey,
      didFail?: () => boolean
    ) => {
      setBusy?.(true);
      let failed = false;
      try {
        await action();
        failed = !!didFail?.();
      } catch(err) {
        console.error('group call control failed', err);
        failed = true;
      } finally {
        setBusy?.(false);
        updateInstance();
      }

      if(failed && instance.state !== GROUP_CALL_STATE.CLOSED) {
        toastNew({langPackKey: errorKey});
      }
    };

    const onVideoClick = () => {
      const wasSharing = instance.isSharingVideo;
      return runControlAction(
        setVideoBusy,
        () => instance.toggleVideoSharing(),
        'ConferenceCall.Media.CameraError',
        () => instance.isSharingVideo === wasSharing
      );
    };

    const onScreenClick = () => {
      const wasSharing = instance.isSharingScreen;
      return runControlAction(
        setScreenBusy,
        () => instance.toggleScreenSharing(),
        'ConferenceCall.Media.ScreenError',
        () => instance.isSharingScreen === wasSharing
      );
    };

    // A press before the server lists us (a conference takes our row a roster
    // poll after the join) asks for the state the label offered, and is carried
    // out once we are listed rather than lost (shouldCarryOutMicrophonePress).
    let pressBeforeListed: MicrophonePressBeforeListed;

    // Fire-and-forget behind the leading-edge throttle, like the topbar plate:
    // the icon follows the instance's own state events, so making the press wait
    // out (and lock the button for) a round trip only made muting feel sluggish.
    const onMuteClick = () => {
      if(!instance.participant) {
        pressBeforeListed = {muted: !instance.isMicrophoneMuted, at: performance.now()};
        return;
      }

      performMicrophoneControlAction(instance).catch((err) => {
        console.error('group call microphone action failed', err);
        if(instance.state !== GROUP_CALL_STATE.CLOSED) {
          toastNew({langPackKey: 'ConferenceCall.Media.MicrophoneError'});
        }
      });
    };

    const isConferenceInviteContextCurrent = (inviteInstance: GroupCallInstance): boolean => {
      return !context.destroyed &&
        instance === inviteInstance &&
        groupCallsController.groupCall === inviteInstance &&
        !!inviteInstance.e2e &&
        !inviteInstance.isClosing;
    };

    const runConferenceInvites = async(inviteInstance: GroupCallInstance, peerIds: PeerId[]) => {
      const isAlive = () => isConferenceInviteContextCurrent(inviteInstance);
      const result = await inviteConferenceParticipants(peerIds, {isAlive});
      if(!isAlive()) return;

      await showConferenceInviteResultToast(result);
    };

    // A conference has no admins, so nobody mints a speaker link.
    const onConferenceShareLinkClick = () => shareGroupCallInviteLink(instance, {
      canManage: false,
      isAlive: () => isConferenceInviteContextCurrent(instance)
    });

    // one picker at a time: the row that opens it stays clickable while the list loads
    let isPickingInvitees = false;
    function onConferenceInviteClick() {
      if(isPickingInvitees) return;
      isPickingInvitees = true;
      return runControlAction(
        undefined,
        async() => {
          // The link is fetched with the participants rather than on the click:
          // the clipboard only accepts a write in the same tick as the user
          // gesture, and a round trip in between loses that activation.
          const [participants, link] = await Promise.all([
            instance.participants,
            managers.appGroupCallsManager.exportGroupCallInvite(instance.id).catch((err): string => {
              console.error('export group call invite failed', err);
              return undefined;
            }),
            // * the people to pick are the call's account's contacts
            showCallAccount(instance.accountNumber)
          ]);
          if(!isConferenceInviteContextCurrent(instance)) return;

          await new Promise<void>((resolve) => {
            // Confirming with nothing picked used to be a dead button. It is the
            // moment you want the link itself, so that is what it offers.
            const copyFooter = createCopyLinkFooter({
              confirmLangKey: 'ConferenceCall.Invite.Button',
              copy: () => {
                if(!link) {
                  toastNew({langPackKey: 'Error.AnError'});
                  return;
                }

                copyTextToClipboard(link);
                toastNew({langPackKey: 'LinkCopied'});
              },
              confirm: () => popup.finalize()
            });

            // tdesktop's conference invite box (calls_group_invite_controller.cpp:806):
            // a multi-select list with an "Invite via Link" row above it, one
            // request per person, and a single toast that reports every verdict.
            const popup = showPickUserPopup({
              titleLangKey: 'ConferenceCall.Invite.Title',
              peerType: ['dialogs', 'contacts'],
              placeholder: 'Search',
              exceptSelf: true,
              multiSelect: true,
              ...copyFooter,
              excludePeerIds: new Set([
                ...participants.keys(),
                ...instance.memberWithAccessPeerIds
              ]),
              filterPeerTypeBy: (peer) => peer._ === 'user' && !peer.pFlags.bot,
              onSelect: (chosen) => {
                const peerIds = chosen.map(({peerId}) => peerId);
                if(!peerIds.length || !isConferenceInviteContextCurrent(instance)) return;

                // Don't hold the picker open for the round trips — tdesktop
                // closes its box on confirm and toasts once the batch answers.
                void runConferenceInvites(instance, peerIds);
              },
              onClose: resolve
            });

            popup.selector.section.content.prepend(createInviteViaLinkRow({
              middleware: popup.middleware,
              onClick: () => {
                popup.hide();
                void onConferenceShareLinkClick();
              }
            }));
          });
        },
        'Error.AnError'
      ).finally(() => {
        isPickingInvitees = false;
      });
    }

    const onMoreClick = async() => {
      try {
        // Conferences have no backing chat. Asking hasRights(NULL_PEER_ID) is both
        // meaningless and capable of preventing the settings/share surface from
        // opening when the manager rejects the pseudo peer.
        const canManage = instance.e2e ? false :
          await managers.appChatsManager.hasRights(instance.chatId, 'manage_call');
        showCallSettingsPopup({mode: 'groupCall', instance, canManage});
      } catch(err) {
        console.error('open group call settings failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
    };

    const onLeaveClick = async() => {
      try {
        const canManage = !instance.e2e &&
          await managers.appChatsManager.hasRights(instance.chatId, 'manage_call');
        await requestGroupCallLeave(instance, canManage);
      } catch(err) {
        console.error('prepare group call leave failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
    };

    groupCallMicrophoneIcon = new GroupCallMicrophoneIcon();

    buttonsContainer = (
      <div
        class={className + '-buttons'}
        role="toolbar"
        aria-label={i18n('ConferenceCall.Controls.Toolbar').textContent}
      >
        <CallButton
          class={className}
          label="Call.Camera"
          icon="videocamera_filled"
          pressed={sharingVideo()}
          // Starting capture before the canonical join and our participant update
          // complete either races negotiation or leaves a local-only camera/mic
          // indicator. An already-active share must remain stoppable if a transient
          // participant update disappears while the call recovers.
          disabled={!mediaReady() && !sharingVideo()}
          busy={videoBusy()}
          onClick={onVideoClick}
        />
        {IS_SCREEN_SHARING_SUPPORTED && (
          <CallButton
            class={className}
            label="Call.Screen"
            icon="sharescreen_filled"
            pressed={sharingScreen()}
            disabled={!mediaReady() && !sharingScreen()}
            busy={screenBusy()}
            onClick={onScreenClick}
          />
        )}
        {/* the waves go under the button (onMount), over the neighbours' backgrounds */}
        <CallButton
          class={className}
          label={microphoneLabel()}
          containerClass={className + '-microphone'}
          buttonClass={className + '-microphone-button'}
          noRipple
          onClick={throttle(onMuteClick, 600, true)}
          ref={(button) => btnMute = button}
        >
          {groupCallMicrophoneIcon.container}
        </CallButton>
        <CallButton
          class={className}
          label="CallSettings.Title"
          icon="settings_filled"
          onClick={onMoreClick}
        />
        <CallButton
          class={className}
          label="VoiceChat.Leave"
          icon="close"
          color="red"
          onClick={onLeaveClick}
        />
      </div>
    ) as HTMLDivElement;

    // No waves until there is a microphone to listen to, nor while the controls of a wide panel are
    // faded out — the canvas would only be drawing under opacity 0.
    updateBlobsVisibility = () => {
      microphoneBlobs?.setHidden(
        !instance.participant ||
        instance.state === GROUP_CALL_STATE.CONNECTING ||
        (untrack(isBigLayout) && !untrack(showControls))
      );
    };

    const updateInstance = () => {
      if(instance.state === GROUP_CALL_STATE.CLOSED) {
        if(untrack(isFull)) {
          cancelFullScreen();
        }

        context.hide();
        return;
      }

      groupCallTitle.update(instance);
      groupCallDescription.update(instance);
      groupCallBodyHeaderDescription.update(instance);

      setSharingVideo(instance.isSharingVideo);
      setSharingScreen(instance.isSharingScreen);
      setMediaReady(instance.isMediaRuntimeReady);

      // Before the server lists us the microphone is what capture says — not a
      // blank: no icon, the default fill and "Connecting..." under it. The label
      // names the next action (Mute / Unmute / Raise hand), so the button has no
      // pressed state: it would say the opposite.
      const {participant} = instance;
      const muted = instance.isMicrophoneMuted;
      setMicrophoneLabel(getMicrophoneControlAccessibility(participant, muted).label);

      const microphoneButtonState = getGroupCallMicrophoneButtonState(participant, muted);
      const micState = microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND ? 'hand' : (microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED ? 'muted' : 'unmuted');
      containerEl.dataset.micState = micState;
      microphoneBlobs?.setColors(micState);
      groupCallMicrophoneIcon.setState(microphoneButtonState);

      updateBlobsVisibility();

      if(participant && pressBeforeListed) {
        const press = pressBeforeListed;
        pressBeforeListed = undefined;
        if(shouldCarryOutMicrophonePress(press, participant, muted)) {
          onMuteClick();
        }
      }
    };

    listenerSetter.add(instance)('state', () => {
      updateInstance();
    });

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(instance?.id === groupCall.id) {
        updateInstance();
      }
    });

    onMount(() => {
      if(!IS_APPLE_MOBILE) {
        addFullScreenListener(containerEl, onFullScreenChange, listenerSetter);
      }

      groupCallParticipants = new GroupCallParticipantsElement({
        appendTo: bodyEl,
        instance,
        listenerSetter,
        managers,
        videoList: videoGrid.list,
        videoGrid,
        // under the last participant, as tdesktop has them (a voice chat's are in its settings)
        actions: instance.e2e ? {
          addPeople: () => void onConferenceInviteClick(),
          shareLink: () => void onConferenceShareLinkClick()
        } : undefined
      });

      // On the stage the controls step aside while the pointer rests, the way a player's do.
      const controlsHover = new ControlsHover();
      controlsHover.setup({
        element: videoGrid.stage,
        listenerSetter,
        showOnLeaveToClassName: className + '-buttons'
      });
      listenerSetter.add(controlsHover)('toggleControls', (show: boolean) => {
        setShowControls(show);
        buttonsContainer.classList.toggle('show-controls', show);
        updateBlobsVisibility();
      });

      // A muted microphone reads as silence anyway; it is zeroed outright so the waves settle the
      // moment it mutes.
      microphoneBlobs = new GroupCallMicrophoneBlobs(btnMute.offsetWidth / 2 || 27, () => {
        return instance.isMicrophoneMuted ? 0 : instance.connections.main?.streamManager.getInputAudioLevel();
      });
      btnMute.before(microphoneBlobs.canvas);

      movablePanel = new MovablePanel({
        listenerSetter,
        movableOptions: {
          minWidth: 400,
          minHeight: 480,
          element: context.element,
          verifyTouchTarget: (e) => {
            const target = e.target;
            if(findUpClassName(target, 'chatlist') ||
              findUpClassName(target, 'group-call-button') ||
              findUpClassName(target, 'btn-icon') ||
              findUpClassName(target, 'group-call-video-tile') ||
              isFullScreen()) {
              return false;
            }

            return true;
          }
        },
        onResize: () => toggleBigLayout(),
        previousState
      });

      onFullScreenChange();

      updateInstance();
    });

    onCleanup(() => {
      listenerSetter.removeAll();
    });

    return (
      <>
        <PopupElement.Header class={className + '-header'}>
          <PopupElement.CloseButton class={isFull() ? 'hide' : undefined} />
          {[
            btnExitFullScreen,
            headerInfo,
            btnFullScreen,
            btnShowColumn
          ].filter(Boolean)}
        </PopupElement.Header>
        {fingerprintBadge}
        <PopupElement.Body ref={(element) => bodyEl = element}>
          {newHeader}
        </PopupElement.Body>
        {videoGrid.stage}
        {videoGrid.flight}
        {buttonsContainer}
      </>
    );
  }

  const onClose = () => {
    if(movablePanel) {
      previousState = movablePanel.state;
      movablePanel.destroy();
    }
  };

  // The panel fades out with its videos and rows still in it; they go once it is gone.
  const onCloseAfterTimeout = () => {
    videoGrid?.destroy();
    groupCallParticipants?.destroy();
    groupCallMicrophoneIcon?.destroy();
    microphoneBlobs?.destroy();
  };

  createPopup(() => (
    <PopupElement
      class={classNames('popup-group-call', IS_MOVABLE_PANEL && 'movable-element')}
      kind={GROUP_CALL_POPUP_KIND}
      managers={instance.managers}
      keepOnAccountSwitch
      withoutOverlay
      closable
      show={show()}
      containerClass={classNames(
        className,
        'night',
        isFull() && 'is-full-screen',
        isBigLayout() && 'is-big-layout',
        isRightColumnShown() && 'is-right-column-shown',
        showControls() && 'show-controls',
        instance?.e2e && 'is-conference'
      )}
      containerProps={{ref: (element) => containerEl = element}}
      onClose={onClose}
      onCloseAfterTimeout={onCloseAfterTimeout}
    >
      <Inner />
    </PopupElement>
  ));

  return {hide: () => {
    setShow(false);
  }};
}
