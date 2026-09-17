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
import GroupCallParticipantsVideoElement from '@components/groupCall/participantVideos';
import GroupCallDescriptionElement from '@components/groupCall/description';
import GroupCallTitleElement from '@components/groupCall/title';
import requestGroupCallLeave from '@components/groupCall/requestLeave';
import {addFullScreenListener, cancelFullScreen, isFullScreen, requestFullScreen} from '@helpers/dom/fullScreen';
import Scrollable from '@components/scrollable';
import {MovableState} from '@components/movableElement';
import animationIntersector from '@components/animationIntersector';
import {IS_APPLE_MOBILE} from '@environment/userAgent';
import throttle from '@helpers/schedulers/throttle';
import IS_SCREEN_SHARING_SUPPORTED from '@environment/screenSharingSupport';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import makeButton, {
  setCallButtonBusy,
  setCallButtonDisabled,
  setCallButtonLabel
} from '@components/call/button';
import MovablePanel from '@helpers/movablePanel';
import ListenerSetter from '@helpers/listenerSetter';
import classNames from '@helpers/string/classNames';
import findUpClassName from '@helpers/dom/findUpClassName';
import themeController from '@helpers/themeController';
import groupCallsController from '@lib/calls/groupCallsController';
import {createSignal, onCleanup, onMount, untrack, useContext} from 'solid-js';
import FingerprintBadge from '@components/conferenceCall/fingerprintBadge';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import showCallSettingsPopup from '@components/call/settingsPopup';
import {toastNew} from '@components/toast';
import {i18n, LangPackKey} from '@lib/langPack';
import {
  GROUP_CALL_MICROPHONE_BUTTON_STATE,
  getGroupCallMicrophoneButtonState,
  getMicrophoneControlAccessibility,
  performMicrophoneControlAction
} from '@components/groupCall/microphoneControl';
import showPickUserPopup, {createCopyLinkFooter} from '@components/popups/pickUser';
import {copyTextToClipboard} from '@helpers/clipboard';
import shareGroupCallInviteLink from '@components/call/shareInviteLink';
import createInviteViaLinkRow from '@components/groupCall/inviteViaLinkRow';
import {
  inviteConferenceParticipants,
  showConferenceInviteResultToast
} from '@components/groupCall/inviteParticipants';

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
  const [hasPinned, setHasPinned] = createSignal(false);
  const [showControls, setShowControls] = createSignal(false);

  let containerEl!: HTMLDivElement;

  // Everything below is built by DOM-returning helpers (ButtonIcon, makeButton,
  // the group-call widgets), so it stays imperative — only the container's own
  // classes are driven by signals.
  let videosCount = 0;
  let btnFullScreen: HTMLButtonElement;
  let btnFullScreen2: HTMLButtonElement;
  let btnExitFullScreen: HTMLButtonElement;
  let btnInvite: HTMLButtonElement;
  let btnShowColumn: HTMLButtonElement;
  let btnVideo: HTMLButtonElement;
  let btnScreen: HTMLButtonElement;
  let btnMute: HTMLButtonElement;
  let buttonsContainer: HTMLDivElement;
  let movablePanel: MovablePanel;
  let groupCallTitle: GroupCallTitleElement;
  let groupCallDescription: GroupCallDescriptionElement;
  let groupCallBodyHeaderDescription: GroupCallDescriptionElement;
  let groupCallParticipants: GroupCallParticipantsElement;
  let groupCallParticipantsVideo: GroupCallParticipantsVideoElement;
  let groupCallMicrophoneIcon: GroupCallMicrophoneIcon;
  let videosScrollable: Scrollable;

  const toggleRightColumn = () => setIsRightColumnShown((shown) => !shown);

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
      buttons = Array.from(buttonsContainer.children) as HTMLElement[];
      buttons.forEach((element) => {
        element.style.opacity = '0';
      });

      void buttonsContainer.offsetLeft;
    }

    setIsBigLayout(isBig);
    btnInvite.classList.toggle('hide', isBig);
    btnShowColumn.classList.toggle('hide', !isBig);

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

    btnInvite = ButtonIcon('adduser');
    btnShowColumn = ButtonIcon('rightpanel ' + className + '-only-big');

    setCallButtonLabel(btnInvite, 'VoiceChat.Invite.InviteMembers');
    setCallButtonLabel(btnShowColumn, 'ConferenceCall.Controls.ShowParticipants');
    listenerSetter.add(btnShowColumn)('click', toggleRightColumn);
    if(instance.e2e) {
      listenerSetter.add(btnInvite)('click', () => onConferenceInviteClick());
    }

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

    videosScrollable = new Scrollable(undefined);
    videosScrollable.container.classList.add('group-call-big-video-container');

    groupCallTitle = new GroupCallTitleElement(title);
    groupCallDescription = new GroupCallDescriptionElement(subtitle);
    groupCallBodyHeaderDescription = new GroupCallDescriptionElement(newHeaderTitle);

    // When this popup is hosting a TdE2E conference (instance.e2e is set), a
    // fingerprint badge in the header lets users visually verify the call is
    // encrypted to the same key on every participant's device. No badge for a
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
        <FingerprintBadge
          class={className + '-header-fingerprint'}
          emojiHash={hash()}
        />
      ), middleware);
    }

    const runControlAction = async(
      button: HTMLButtonElement,
      action: () => MaybePromise<void>,
      errorKey: LangPackKey,
      didFail?: () => boolean
    ) => {
      setCallButtonBusy(button, true);
      let failed = false;
      try {
        await action();
        failed = !!didFail?.();
      } catch(err) {
        console.error('group call control failed', err);
        failed = true;
      } finally {
        setCallButtonBusy(button, false);
        updateInstance();
      }

      if(failed && instance.state !== GROUP_CALL_STATE.CLOSED) {
        toastNew({langPackKey: errorKey});
      }
    };

    const onVideoClick = () => {
      const wasSharing = instance.isSharingVideo;
      return runControlAction(
        btnVideo,
        () => instance.toggleVideoSharing(),
        'ConferenceCall.Media.CameraError',
        () => instance.isSharingVideo === wasSharing
      );
    };

    const onScreenClick = () => {
      const wasSharing = instance.isSharingScreen;
      return runControlAction(
        btnScreen,
        () => instance.toggleScreenSharing(),
        'ConferenceCall.Media.ScreenError',
        () => instance.isSharingScreen === wasSharing
      );
    };

    // Fire-and-forget behind the leading-edge throttle, like the topbar plate:
    // the icon follows the instance's own state events, so making the press wait
    // out (and lock the button for) a round trip only made muting feel sluggish.
    const onMuteClick = () => {
      if(!instance.participant) return;

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

    function onConferenceInviteClick() {
      return runControlAction(
        btnInvite,
        async() => {
          // The link is fetched with the participants rather than on the click:
          // the clipboard only accepts a write in the same tick as the user
          // gesture, and a round trip in between loses that activation.
          const [participants, link] = await Promise.all([
            instance.participants,
            managers.appGroupCallsManager.exportGroupCallInvite(instance.id).catch((err): string => {
              console.error('export group call invite failed', err);
              return undefined;
            })
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
                // A conference has no admins, so nobody mints a speaker link.
                void shareGroupCallInviteLink(instance, {
                  canManage: false,
                  isAlive: () => isConferenceInviteContextCurrent(instance)
                });
              }
            }));
          });
        },
        'Error.AnError'
      );
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

    buttonsContainer = document.createElement('div');
    buttonsContainer.classList.add(className + '-buttons');
    buttonsContainer.setAttribute('role', 'toolbar');
    buttonsContainer.setAttribute('aria-label', i18n('ConferenceCall.Controls.Toolbar').textContent);

    const _makeButton = makeButton.bind(null, className, listenerSetter);

    btnVideo = _makeButton({
      ariaLabel: 'VoiceChat.Video.Stream.Video',
      callback: onVideoClick,
      disabled: true,
      icon: 'videocamera_filled'
    }) as HTMLButtonElement;

    btnScreen = _makeButton({
      ariaLabel: 'VoiceChat.Video.Stream.Screencast',
      callback: onScreenClick,
      disabled: true,
      icon: 'sharescreen_filled'
    }) as HTMLButtonElement;

    btnScreen.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    btnMute = _makeButton({
      ariaLabel: 'VoiceChat.Status.Connecting',
      noRipple: true,
      callback: throttle(onMuteClick, 600, true)
    }) as HTMLButtonElement;
    btnMute.classList.add(className + '-microphone-button');

    groupCallMicrophoneIcon = new GroupCallMicrophoneIcon();
    btnMute.append(groupCallMicrophoneIcon.container);

    const btnMore = _makeButton({
      ariaLabel: 'CallSettings.Title',
      icon: 'settings_filled',
      callback: onMoreClick
    }) as HTMLButtonElement;

    const btnLeave = _makeButton({
      ariaLabel: 'VoiceChat.Leave',
      isDanger: true,
      callback: onLeaveClick,
      icon: 'close'
    }) as HTMLButtonElement;

    buttonsContainer.append(btnVideo, btnScreen, btnMute, btnMore, btnLeave);

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
      setHasPinned(!!instance.pinnedSource);

      btnVideo.setAttribute('aria-pressed', String(instance.isSharingVideo));
      btnScreen.setAttribute('aria-pressed', String(instance.isSharingScreen));

      const {participant} = instance;
      const mediaReady = instance.isMediaRuntimeReady;
      // Starting capture before the canonical join and our participant update
      // complete either races negotiation or leaves a local-only camera/mic
      // indicator. An already-active share must remain stoppable if a transient
      // participant update disappears while the call recovers.
      setCallButtonDisabled(btnVideo, !mediaReady && !instance.isSharingVideo);
      setCallButtonDisabled(btnScreen, !mediaReady && !instance.isSharingScreen);

      // Only the label follows the participant — the button itself stays live.
      // `onMuteClick` already no-ops before the participant arrives and for an
      // already-raised hand, and a microphone the user cannot press is worse than
      // one whose press is a no-op.
      const microphoneAccessibility = getMicrophoneControlAccessibility(participant, instance.isMuted);
      setCallButtonLabel(btnMute, microphoneAccessibility.label);
      // The label describes the next action (Mute / Unmute / Raise hand), so a
      // simultaneous pressed state would communicate the inverse semantics.
      btnMute.removeAttribute('aria-pressed');

      if(!participant) {
        return;
      }

      const microphoneButtonState = getGroupCallMicrophoneButtonState(participant, instance.isMuted);
      containerEl.dataset.micState = microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.HAND ? 'hand' : (microphoneButtonState === GROUP_CALL_MICROPHONE_BUTTON_STATE.MUTED ? 'muted' : 'unmuted');
      groupCallMicrophoneIcon.setState(microphoneButtonState);
    };

    listenerSetter.add(instance)('state', () => {
      updateInstance();
    });

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      if(instance?.id === groupCall.id) {
        updateInstance();
      }
    });

    listenerSetter.add(instance)('pinned', () => {
      setHasPinned(!!instance.pinnedSource);
    });

    let bodyEl!: HTMLDivElement;

    onMount(() => {
      if(!IS_APPLE_MOBILE) {
        addFullScreenListener(containerEl, onFullScreenChange, listenerSetter);
      }

      groupCallParticipantsVideo = new GroupCallParticipantsVideoElement({
        appendTo: videosScrollable.container,
        instance,
        listenerSetter,
        displayPinned: true,
        onLengthChange: (length) => {
          videosCount = length;
          toggleBigLayout();
        },
        managers
      });
      groupCallParticipants = new GroupCallParticipantsElement({
        appendTo: bodyEl,
        instance,
        listenerSetter,
        managers
      });

      listenerSetter.add(groupCallParticipantsVideo)('toggleControls', (show: boolean) => {
        setShowControls(show);
        buttonsContainer.classList.toggle('show-controls', show);
      });

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
              findUpClassName(target, 'group-call-participants-video-container') ||
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
            instance.e2e && btnInvite,
            fingerprintBadge,
            btnFullScreen,
            btnShowColumn
          ].filter(Boolean)}
        </PopupElement.Header>
        <PopupElement.Body ref={(element) => bodyEl = element}>
          {newHeader}
        </PopupElement.Body>
        {videosScrollable.container}
        {buttonsContainer}
      </>
    );
  }

  const onClose = () => {
    if(movablePanel) {
      previousState = movablePanel.state;
      movablePanel.destroy();
    }

    groupCallParticipantsVideo?.destroy();
    groupCallParticipants?.destroy();
    groupCallMicrophoneIcon?.destroy();
    videosScrollable?.destroy();
  };

  createPopup(() => (
    <PopupElement
      class="popup-group-call"
      kind={GROUP_CALL_POPUP_KIND}
      withoutOverlay
      closable
      show={show()}
      containerClass={classNames(
        className,
        'night',
        isFull() && 'is-full-screen',
        isBigLayout() && 'is-big-layout',
        isRightColumnShown() && 'is-right-column-shown',
        hasPinned() && 'has-pinned',
        showControls() && 'show-controls'
      )}
      containerProps={{ref: (element) => containerEl = element}}
      onClose={onClose}
    >
      <Inner />
    </PopupElement>
  ));

  return {hide: () => {
    setShow(false);
  }};
}
