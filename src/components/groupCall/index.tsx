import PopupElement from '@components/popups';
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
import findUpClassName from '@helpers/dom/findUpClassName';
import themeController from '@helpers/themeController';
import groupCallsController from '@lib/calls/groupCallsController';
import {createSignal} from 'solid-js';
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
import showPickUserPopup from '@components/popups/pickUser';
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
  private btnVideo: HTMLButtonElement;
  private btnScreen: HTMLButtonElement;
  private btnMute: HTMLButtonElement;
  private videosScrollable: Scrollable;

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

      setCallButtonLabel(btnFullScreen, 'ConferenceCall.Controls.EnterFullscreen');
      setCallButtonLabel(btnFullScreen2, 'ConferenceCall.Controls.EnterFullscreen');
      setCallButtonLabel(btnExitFullScreen, 'ConferenceCall.Controls.ExitFullscreen');

      listenerSetter.add(btnFullScreen)('click', this.onFullScreenClick);
      listenerSetter.add(btnFullScreen2)('click', this.onFullScreenClick);

      listenerSetter.add(btnExitFullScreen)('click', () => {
        cancelFullScreen();
      });

      addFullScreenListener(this.container, this.onFullScreenChange, listenerSetter);
    }

    const btnInvite = this.btnInvite = ButtonIcon('adduser');
    const btnShowColumn = this.btnShowColumn = ButtonIcon('rightpanel ' + className + '-only-big');

    setCallButtonLabel(btnInvite, 'VoiceChat.Invite.InviteMembers');
    setCallButtonLabel(btnShowColumn, 'ConferenceCall.Controls.ShowParticipants');
    listenerSetter.add(btnShowColumn)('click', this.toggleRightColumn);
    if(instance.e2e) {
      listenerSetter.add(btnInvite)('click', this.onConferenceInviteClick);
    }

    const headerInfo = document.createElement('div');
    headerInfo.classList.add(className + '-header-info');

    this.title.classList.add(className + '-header-title');

    const subtitle = document.createElement('div');
    subtitle.classList.add(className + '-header-subtitle');

    headerInfo.append(this.title, subtitle);

    this.header.classList.add(className + '-header');
    this.header.append(...[
      this.btnExitFullScreen,
      headerInfo,
      instance.e2e && btnInvite,
      this.btnFullScreen,
      btnShowColumn
    ].filter(Boolean));

    const newHeader = this.header.cloneNode(false) as HTMLElement;
    const newHeaderInfo = headerInfo.cloneNode(false) as HTMLElement;
    const newHeaderTitle = this.title.cloneNode(false) as HTMLElement;

    newHeaderInfo.append(newHeaderTitle);

    const btnHideColumn = ButtonIcon('rightpanel');
    newHeader.append(...[btnHideColumn, newHeaderInfo, this.btnFullScreen2].filter(Boolean));

    setCallButtonLabel(btnHideColumn, 'ConferenceCall.Controls.HideParticipants');
    listenerSetter.add(btnHideColumn)('click', this.toggleRightColumn);

    this.body.prepend(newHeader);

    const videosScrollable = this.videosScrollable = new Scrollable(undefined);
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
      this.videosScrollable.destroy();

      movablePanel.destroy();
    });

    this.toggleRightColumn();
    this.onFullScreenChange();

    this.mountFingerprintBadgeIfConference();

    this.updateInstance();
  }

  // When this popup is hosting a TdE2E conference (instance.e2e is set),
  // append a fingerprint badge to the header so users can visually verify
  // the call is encrypted to the same key on every participant's device.
  // No-op for legacy voice chats.
  private mountFingerprintBadgeIfConference(): void {
    const {instance} = this;
    if(!instance?.e2e) return;

    const [hash, setHash] = createSignal<Uint8Array | undefined>(
      instance.e2eStatus?.verification?.emojiHash
    );
    this.listenerSetter.add(instance)('e2eStatus', (status) => {
      setHash(status.verification?.emojiHash);
    });

    const badge = wrapSolidComponent(() => (
      <FingerprintBadge
        class={className + '-header-fingerprint'}
        emojiHash={hash()}
      />
    ), this.middlewareHelper.get());
    // Place the fingerprint to the LEFT of the fullscreen button. A plain
    // append() lands it at the very end of the header (right of fullscreen).
    if(this.btnFullScreen) {
      this.header.insertBefore(badge, this.btnFullScreen);
    } else {
      this.header.append(badge);
    }
  }

  private constructButtons() {
    const buttons = this.buttonsContainer = document.createElement('div');
    buttons.classList.add(className + '-buttons');
    buttons.setAttribute('role', 'toolbar');
    buttons.setAttribute('aria-label', i18n('ConferenceCall.Controls.Toolbar').textContent);

    const _makeButton = makeButton.bind(null, className, this.listenerSetter);

    const btnVideo = this.btnVideo = _makeButton({
      ariaLabel: 'VoiceChat.Video.Stream.Video',
      callback: this.onVideoClick,
      disabled: true,
      icon: 'videocamera_filled'
    }) as HTMLButtonElement;

    const btnScreen = this.btnScreen = _makeButton({
      ariaLabel: 'VoiceChat.Video.Stream.Screencast',
      callback: this.onScreenClick,
      disabled: true,
      icon: 'sharescreen_filled'
    }) as HTMLButtonElement;

    btnScreen.classList.toggle('hide', !IS_SCREEN_SHARING_SUPPORTED);

    const btnMute = this.btnMute = _makeButton({
      ariaLabel: 'VoiceChat.Status.Connecting',
      noRipple: true,
      callback: throttle(this.onMuteClick, 600, true)
    }) as HTMLButtonElement;
    btnMute.classList.add(className + '-microphone-button');

    const microphoneIcon = this.groupCallMicrophoneIcon = new GroupCallMicrophoneIcon();
    btnMute.append(microphoneIcon.container);

    const btnMore = _makeButton({
      ariaLabel: 'CallSettings.Title',
      icon: 'settings_filled',
      callback: this.onMoreClick
    }) as HTMLButtonElement;

    const btnLeave = _makeButton({
      ariaLabel: 'VoiceChat.Leave',
      isDanger: true,
      callback: this.onLeaveClick,
      icon: 'close'
    }) as HTMLButtonElement;

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

  private runControlAction = async(
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
      this.updateInstance();
    }

    if(failed && this.instance.state !== GROUP_CALL_STATE.CLOSED) {
      toastNew({langPackKey: errorKey});
    }
  };

  private onVideoClick = () => {
    const wasSharing = this.instance.isSharingVideo;
    return this.runControlAction(
      this.btnVideo,
      () => this.instance.toggleVideoSharing(),
      'ConferenceCall.Media.CameraError',
      () => this.instance.isSharingVideo === wasSharing
    );
  };

  private onScreenClick = () => {
    const wasSharing = this.instance.isSharingScreen;
    return this.runControlAction(
      this.btnScreen,
      () => this.instance.toggleScreenSharing(),
      'ConferenceCall.Media.ScreenError',
      () => this.instance.isSharingScreen === wasSharing
    );
  };

  // Fire-and-forget behind the leading-edge throttle, like the topbar plate:
  // the icon follows the instance's own state events, so making the press wait
  // out (and lock the button for) a round trip only made muting feel sluggish.
  private onMuteClick = () => {
    if(!this.instance.participant) return;

    performMicrophoneControlAction(this.instance).catch((err) => {
      console.error('group call microphone action failed', err);
      if(this.instance.state !== GROUP_CALL_STATE.CLOSED) {
        toastNew({langPackKey: 'ConferenceCall.Media.MicrophoneError'});
      }
    });
  };

  private isConferenceInviteContextCurrent(instance: GroupCallInstance): boolean {
    return !this.destroyed &&
      this.instance === instance &&
      groupCallsController.groupCall === instance &&
      !!instance.e2e &&
      !instance.isClosing;
  }

  private onConferenceInviteClick = () => {
    const instance = this.instance;
    return this.runControlAction(
      this.btnInvite,
      async() => {
        const participants = await instance.participants;
        if(!this.isConferenceInviteContextCurrent(instance)) return;

        await new Promise<void>((resolve) => {
          // tdesktop's conference invite box (calls_group_invite_controller.cpp:806):
          // a multi-select list with an "Invite via Link" row above it, one
          // request per person, and a single toast that reports every verdict.
          const popup = showPickUserPopup({
            titleLangKey: 'ConferenceCall.Invite.Title',
            peerType: ['dialogs', 'contacts'],
            placeholder: 'Search',
            exceptSelf: true,
            multiSelect: true,
            footerButtonProps: {langKey: 'ConferenceCall.Invite.Button'},
            excludePeerIds: new Set([
              ...participants.keys(),
              ...instance.memberWithAccessPeerIds
            ]),
            filterPeerTypeBy: (peer) => peer._ === 'user' && !peer.pFlags.bot,
            onSelect: (chosen) => {
              const peerIds = chosen.map(({peerId}) => peerId);
              if(!peerIds.length || !this.isConferenceInviteContextCurrent(instance)) return;

              // Don't hold the picker open for the round trips — tdesktop
              // closes its box on confirm and toasts once the batch answers.
              void this.runConferenceInvites(instance, peerIds);
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
                isAlive: () => this.isConferenceInviteContextCurrent(instance)
              });
            }
          }));
        });
      },
      'Error.AnError'
    );
  };

  private async runConferenceInvites(instance: GroupCallInstance, peerIds: PeerId[]) {
    const isAlive = () => this.isConferenceInviteContextCurrent(instance);
    const result = await inviteConferenceParticipants(peerIds, {isAlive});
    if(!isAlive()) return;

    await showConferenceInviteResultToast(result);
  }

  private onMoreClick = async() => {
    try {
      // Conferences have no backing chat. Asking hasRights(NULL_PEER_ID) is both
      // meaningless and capable of preventing the settings/share surface from
      // opening when the manager rejects the pseudo peer.
      const canManage = this.instance.e2e ? false :
        await this.managers.appChatsManager.hasRights(this.instance.chatId, 'manage_call');
      showCallSettingsPopup({mode: 'groupCall', instance: this.instance, canManage});
    } catch(err) {
      console.error('open group call settings failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  };

  private onLeaveClick = async() => {
    try {
      const canManage = !this.instance.e2e &&
        await this.managers.appChatsManager.hasRights(this.instance.chatId, 'manage_call');
      await requestGroupCallLeave(this.instance, canManage);
    } catch(err) {
      console.error('prepare group call leave failed', err);
      toastNew({langPackKey: 'Error.AnError'});
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

    this.setTitle();
    this.setDescription();
    this.setHasPinned();

    this.btnVideo.setAttribute('aria-pressed', String(this.instance.isSharingVideo));
    this.btnScreen.setAttribute('aria-pressed', String(this.instance.isSharingScreen));

    const {participant} = this.instance;
    const mediaReady = this.instance.isMediaRuntimeReady;
    // Starting capture before the canonical join and our participant update
    // complete either races negotiation or leaves a local-only camera/mic
    // indicator. An already-active share must remain stoppable if a transient
    // participant update disappears while the call recovers.
    setCallButtonDisabled(this.btnVideo, !mediaReady && !this.instance.isSharingVideo);
    setCallButtonDisabled(this.btnScreen, !mediaReady && !this.instance.isSharingScreen);

    // Only the label follows the participant — the button itself stays live.
    // `onMuteClick` already no-ops before the participant arrives and for an
    // already-raised hand, and a microphone the user cannot press is worse than
    // one whose press is a no-op.
    const microphoneAccessibility = getMicrophoneControlAccessibility(participant, this.instance.isMuted);
    setCallButtonLabel(this.btnMute, microphoneAccessibility.label);
    // The label describes the next action (Mute / Unmute / Raise hand), so a
    // simultaneous pressed state would communicate the inverse semantics.
    this.btnMute.removeAttribute('aria-pressed');

    if(!participant) {
      return;
    }

    const microphoneButtonState = getGroupCallMicrophoneButtonState(participant, this.instance.isMuted);
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
