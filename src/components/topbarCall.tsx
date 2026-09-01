import {createSignal, Show} from 'solid-js';
import cancelEvent from '@helpers/dom/cancelEvent';
import ListenerSetter from '@helpers/listenerSetter';
import replaceContent from '@helpers/dom/replaceContent';
import throttle from '@helpers/schedulers/throttle';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';
import CALL_STATE from '@lib/calls/callState';
import RTMP_STATE from '@lib/calls/rtmpState';
import rootScope from '@lib/rootScope';
import callsController from '@lib/calls/callsController';
import groupCallsController from '@lib/calls/groupCallsController';
import rtmpCallsController, {RtmpCallInstance} from '@lib/calls/rtmpCallsController';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import CallInstance from '@lib/calls/callInstance';
import apiManagerProxy from '@lib/apiManagerProxy';
import {AppManagers} from '@lib/managers';
import SetTransition from '@components/singleTransition';
import PopupElement from '@components/popups';
import PopupGroupCall from '@components/groupCall';
import PopupCall from '@components/call';
import PeerTitle from '@components/peerTitle';
import GroupCallTitleElement from '@components/groupCall/title';
import GroupCallDescriptionElement from '@components/groupCall/description';
import CallDescriptionElement from '@components/call/description';
import RtmpDescriptionElement from '@components/rtmp/description';
import {AppMediaViewerRtmp} from '@components/mediaViewer/rtmp';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import TopbarPlate, {createTopbarPlate} from '@components/chat/topbarPlate';
import {StackedAvatarsTsx} from '@components/stackedAvatars';
import {toastNew} from '@components/toast';
import {i18n, LangPackKey} from '@lib/langPack';

function convertCallStateToGroupState(state: CALL_STATE, isMuted: boolean) {
  switch(state) {
    case CALL_STATE.CLOSING:
    case CALL_STATE.CLOSED:
      return GROUP_CALL_STATE.CLOSED;
    case CALL_STATE.CONNECTED:
      return isMuted ? GROUP_CALL_STATE.MUTED : GROUP_CALL_STATE.UNMUTED;
    default:
      return GROUP_CALL_STATE.CONNECTING;
  }
}

function convertRtmpStateToGroupState(state: RTMP_STATE) {
  switch(state) {
    case RTMP_STATE.CLOSED:
      return GROUP_CALL_STATE.CLOSED;
    case RTMP_STATE.CONNECTING:
    case RTMP_STATE.BUFFERING:
      return GROUP_CALL_STATE.CONNECTING;
    default:
      return GROUP_CALL_STATE.MUTED_BY_ADMIN;
  }
}

const CLASS_NAME = 'topbar-call';

type AnyInstance = GroupCallInstance | CallInstance | RtmpCallInstance;

const KIND_CLASSES: Array<[name: string, ctor: new(...args: any[]) => AnyInstance]> = [
  ['group-call', GroupCallInstance],
  ['call', CallInstance],
  ['rtmp', RtmpCallInstance]
];

const STATE_CLASSES: Array<[name: string, state: GROUP_CALL_STATE]> = [
  ['unmuted', GROUP_CALL_STATE.UNMUTED],
  ['muted', GROUP_CALL_STATE.MUTED],
  ['muted-by-admin', GROUP_CALL_STATE.MUTED_BY_ADMIN],
  ['connecting', GROUP_CALL_STATE.CONNECTING]
];

export type TopbarCallController = {
  container: HTMLElement,
  destroy: () => void
};

export default function createTopbarCall(managers: AppManagers): TopbarCallController {
  const listenerSetter = new ListenerSetter();
  let instanceListenerSetter: ListenerSetter | undefined;

  const [instance, setInstance] = createSignal<AnyInstance | undefined>(undefined);
  const [isMuted, setIsMuted] = createSignal<boolean | undefined>(undefined);
  const [isRtmp, setIsRtmp] = createSignal(false);
  const [statusAnnouncementsEnabled, setStatusAnnouncementsEnabled] = createSignal(true);
  const [migratingInstance, setMigratingInstance] = createSignal<CallInstance | undefined>();

  // Tracked solely for `toggleUninteruptableActivity` calls.
  let currentActivityName: string | undefined;
  let reopenGroupCallPopupAfterRecovery = false;

  const [avatarPeers, setAvatarPeers] = createSignal<PeerId[]>([]);

  let titleEl!: HTMLDivElement;
  let statusEl!: HTMLDivElement;
  let extraEl!: HTMLDivElement;

  // Imperative widgets — one per kind, created on first use.
  let groupCallTitle: GroupCallTitleElement | undefined;
  let groupCallDescription: GroupCallDescriptionElement | undefined;
  let callDescription: CallDescriptionElement | undefined;
  let rtmpDescription: RtmpDescriptionElement | undefined;
  let currentDescription: GroupCallDescriptionElement | CallDescriptionElement | RtmpDescriptionElement | undefined;

  const ensureWidgets = () => {
    if(groupCallTitle) return;
    groupCallTitle = new GroupCallTitleElement(titleEl);
    groupCallDescription = new GroupCallDescriptionElement(statusEl, true);
    callDescription = new CallDescriptionElement(statusEl);
    rtmpDescription = new RtmpDescriptionElement(statusEl, extraEl);
  };

  const setKindClasses = (inst: AnyInstance | undefined) => {
    for(const [name, ctor] of KIND_CLASSES) {
      plate.container.classList.toggle(`is-${name}`, !!inst && inst instanceof ctor);
    }
  };

  const setStateClass = (state: GROUP_CALL_STATE | undefined) => {
    for(const [name, s] of STATE_CLASSES) {
      plate.container.classList.toggle(`is-${name}`, state === s);
    }
  };

  const toggleActivity = (active: boolean) => {
    if(!currentActivityName) return;
    apiManagerProxy.invoke('toggleUninteruptableActivity', {
      activity: currentActivityName,
      active
    });
  };

  const setTitle = (inst: AnyInstance) => {
    if(inst instanceof RtmpCallInstance) {
      replaceContent(titleEl, new PeerTitle({peerId: inst.peerId}).element);
    } else if(inst instanceof GroupCallInstance) {
      groupCallTitle!.update(inst);
    } else {
      replaceContent(titleEl, new PeerTitle({peerId: inst.interlocutorUserId.toPeerId()}).element);
    }
  };

  // Detach listeners + drop instance references — no DOM mutation. Used to
  // close out a finished call without disturbing the panel's visible state.
  const detachInstance = () => {
    if(!instance()) return;
    setInstance(undefined);
    instanceListenerSetter?.removeAll();
    instanceListenerSetter = undefined;
    // Keep `currentDescription`: its mounted element stays in `statusEl` /
    // `extraEl`. `clearCurrentInstance` (called for the *next* incoming
    // call) wipes it; until then the panel keeps its last visible state.
  };

  // Full reset — wipes DOM content and per-instance signals. Run when a new
  // instance is about to take over (so the user never sees the empty frame
  // between calls), NOT mid-hide-animation.
  const clearCurrentInstance = () => {
    if(!instance() && !currentDescription) return;
    titleEl?.replaceChildren();
    statusEl?.replaceChildren();
    extraEl?.replaceChildren();
    setAvatarPeers([]);

    if(currentDescription) {
      currentDescription.detach();
      currentDescription = undefined;
    }

    setInstance(undefined);
    setKindClasses(undefined);
    setStateClass(undefined);
    setIsMuted(undefined);
    setIsRtmp(false);
    setStatusAnnouncementsEnabled(true);

    instanceListenerSetter?.removeAll();
    instanceListenerSetter = undefined;
  };

  // Conference calls have no chat peer, so there's no single group avatar to
  // show. Pull the (cached) participant peers and stack their avatars instead,
  // filtering out NULL_PEER_ID / invalid entries so we never render a lone blank
  // circle — better no avatars than one empty one.
  const refreshConferenceAvatars = (inst: GroupCallInstance) => {
    void inst.participants.then((participants) => {
      if(instance() !== inst) return; // instance changed while the fetch was in flight
      setAvatarPeers(Array.from(participants.keys()).filter(Boolean));
    }).catch(() => {});
  };

  const onState = () => {
    const inst = instance();
    if(inst instanceof GroupCallInstance && inst.state === GROUP_CALL_STATE.CLOSED) {
      reopenGroupCallPopupAfterRecovery = !!PopupElement.getPopups(PopupGroupCall).length;
    }
    updateInstance(inst);
  };

  const isConferenceMigration = (inst: AnyInstance | undefined) =>
    inst instanceof CallInstance && migratingInstance() === inst;

  const updateInstance = (newInstance: AnyInstance | undefined) => {
    ensureWidgets();

    const isChangingInstance = instance() !== newInstance;
    if(isChangingInstance) {
      clearCurrentInstance();

      setInstance(newInstance);

      if(newInstance) {
        instanceListenerSetter = new ListenerSetter();
        instanceListenerSetter.add(newInstance as GroupCallInstance)('state', onState);

        if(newInstance instanceof GroupCallInstance) {
          currentDescription = groupCallDescription;
        } else if(newInstance instanceof CallInstance) {
          currentDescription = callDescription;
          instanceListenerSetter.add(newInstance)('muted', onState);
        } else if(newInstance instanceof RtmpCallInstance) {
          currentDescription = rtmpDescription;
        }

        setKindClasses(newInstance);
      }
    }

    const inst = instance();
    const muted = inst instanceof RtmpCallInstance ?
      undefined :
      !inst || (inst as GroupCallInstance).isMuted;

    let state: GROUP_CALL_STATE;
    if(!inst) state = GROUP_CALL_STATE.CLOSED;
    else if(inst instanceof GroupCallInstance) state = inst.state;
    else if(inst instanceof RtmpCallInstance) state = convertRtmpStateToGroupState(inst.state);
    else state = isConferenceMigration(inst) ?
      GROUP_CALL_STATE.CONNECTING :
      convertCallStateToGroupState(inst.connectionState, muted);

    // CallDescriptionElement replaces the status with a duration that updates
    // every second once a P2P call connects. Keep state text live, but take the
    // ticking duration out of the live region so assistive technology does not
    // announce every second. CLOSED keeps the previous duration mounted during
    // the hide transition, so it remains non-live until the next instance.
    setStatusAnnouncementsEnabled(!(
      inst instanceof CallInstance &&
      (inst.connectionState === CALL_STATE.CONNECTED || inst.connectionState === CALL_STATE.CLOSED)
    ));

    const isClosed = state === GROUP_CALL_STATE.CLOSED;
    if((!document.body.classList.contains('is-calling') || isChangingInstance) || isClosed) {
      SetTransition({
        element: document.body,
        className: 'is-calling',
        forwards: !isClosed,
        duration: 250,
        // Only detach listeners + drop the instance reference at the end of
        // the hide. Don't touch the panel's DOM (title, status, avatars,
        // mic, classes) — that would leave a one-frame "empty panel" visible
        // if the CSS transition trails the JS timer by even a millisecond.
        // The DOM is wiped on the next incoming call by `clearCurrentInstance`
        // (inside the `isChangingInstance` branch), which fires while the
        // panel is still off-screen.
        onTransitionEnd: isClosed ? detachInstance : undefined
      });
    }

    if(isClosed) {
      toggleActivity(false);
      return;
    }

    currentActivityName = (inst as Object)?.constructor?.name;
    toggleActivity(true);

    setStateClass(state);
    setTitle(inst);
    if(inst instanceof GroupCallInstance) {
      if(inst.chatId) {
        // Legacy voice chat bound to a chat — show the chat's avatar.
        setAvatarPeers([inst.chatId.toPeerId(true)]);
      } else {
        // Conference (chatId is NULL_PEER_ID) — stack participant avatars.
        refreshConferenceAvatars(inst);
      }
    } else if(inst instanceof CallInstance) {
      setAvatarPeers([inst.interlocutorUserId.toPeerId()]);
    } else if(inst instanceof RtmpCallInstance) {
      setAvatarPeers([inst.peerId]);
    }
    currentDescription?.update(inst as any);
    if(isConferenceMigration(inst)) {
      replaceContent(statusEl, i18n('ConferenceCall.Migrating'));
    }

    setIsMuted(muted);
    setIsRtmp(inst instanceof RtmpCallInstance);
  };

  // ───────────────────────── Global listeners ─────────────────────────

  listenerSetter.add(callsController)('instance', ({instance: i}) => {
    if(!instance()) {
      updateInstance(i);
    }
  });

  listenerSetter.add(callsController)('accepting', (i) => {
    if(instance() !== i) {
      updateInstance(i);
    }
  });

  listenerSetter.add(callsController)('conferenceMigration', ({instance: i, state}) => {
    if(state === 'started') {
      setMigratingInstance(i);
    } else if(migratingInstance() === i) {
      setMigratingInstance(undefined);
    }

    if(instance() === i) {
      updateInstance(i);
    }
  });

  listenerSetter.add(groupCallsController)('instance', (i, isRecovery) => {
    updateInstance(i);
    if(isRecovery && reopenGroupCallPopupAfterRecovery) {
      reopenGroupCallPopupAfterRecovery = false;
      onPlateClick();
    } else if(!isRecovery) {
      reopenGroupCallPopupAfterRecovery = false;
    }
  });

  listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
    const i = groupCallsController.groupCall;
    // Compare as strings: instance.id is always stringified, but the dispatched
    // GroupCall.id is `string | number` and comes back as a number for ids that
    // fit a JS safe integer — a strict `===` here silently misses every update,
    // freezing the topbar's participant count at its connect-time value.
    if(i && String(i.id) === String(groupCall.id)) {
      updateInstance(i);
    }
  });

  // Keep the conference avatar stack fresh as participants join/leave.
  listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
    const i = instance();
    if(i instanceof GroupCallInstance && !i.chatId && String(i.id) === String(groupCallId)) {
      if(participant.pFlags.self) {
        // Self-participant arrival unlocks the microphone semantics as well as
        // changing the participant avatar stack.
        updateInstance(i);
      } else {
        // The 5s roster poll re-dispatches EVERY row; a full updateInstance per
        // row is N worker round-trips + N DOM/title rewrites every poll on an
        // idle call. Non-self rows can only change the avatar stack — self
        // mute/permission changes additionally flow through the instance's own
        // 'state' listener.
        refreshConferenceAvatars(i);
      }
    }
  });

  listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
    updateInstance(call);
  });

  // ───────────────────────── Click handlers ─────────────────────────

  // Fire-and-forget behind the leading-edge throttle: the button reflects
  // `isMuted()`, which the instance's own 'state' / 'muted' events drive. Making
  // the click await the toggle (and disabling the button meanwhile) turned every
  // press into a round trip the user had to wait out.
  const throttledMuteClick = throttle(() => {
    const inst = instance();
    if(inst && !(inst instanceof RtmpCallInstance)) {
      inst.toggleMuted();
    }
  }, 600, true);

  // Ending a call is the one action that must never be locked out: a slow
  // discard used to leave the button disabled with the call still up. The
  // in-flight flag only swallows a repeat press, it doesn't disable the button.
  let hangUpPromise: Promise<unknown> | undefined;
  const onHangUp = async() => {
    const inst = instance();
    if(!inst || hangUpPromise || isConferenceMigration(inst)) return;

    try {
      hangUpPromise = inst instanceof RtmpCallInstance ?
        rtmpCallsController.leaveCall() :
        (inst instanceof GroupCallInstance ?
          inst.hangUp() :
          inst.hangUp('phoneCallDiscardReasonHangup'));
      await hangUpPromise;
    } catch(err) {
      console.error('topbar hang up failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      hangUpPromise = undefined;
    }
  };

  const endCallLabel = (): LangPackKey => {
    const inst = instance();
    if(inst instanceof RtmpCallInstance) return 'Close';
    if(inst instanceof GroupCallInstance) return 'VoiceChat.Leave';
    return 'Call.End';
  };

  const onPlateClick = () => {
    const inst = instance();
    if(!inst) return;
    if(inst instanceof RtmpCallInstance) {
      AppMediaViewerRtmp.closeActivePip();
    } else if(inst instanceof GroupCallInstance) {
      if(PopupElement.getPopups(PopupGroupCall).length) return;
      PopupElement.createPopup(PopupGroupCall).show();
    } else if(inst instanceof CallInstance) {
      const popups = PopupElement.getPopups(PopupCall);
      if(popups.find((popup) => popup.getCallInstance() === inst)) return;
      PopupElement.createPopup(PopupCall, inst).show();
    }
  };

  // ───────────────────────── Plate ─────────────────────────

  const plate = createTopbarPlate({
    modifier: 'call',
    height: 24,
    // The plate is never `hide`-toggled: it lives parked above the topbar and
    // slides in on `body.is-calling` (`.pinned-call` transform in
    // _chatPinned.scss). Flipping `hide` alongside that class would put the
    // element back in flow in the same frame the transform flips, leaving the
    // transition no start value to animate from — the plate would jump in.
    initiallyHidden: false,
    render: () => (
      <TopbarPlate.Body onClick={onPlateClick} noRipple>
        <Show when={!isRtmp() && isMuted() !== undefined}>
          <Button
            class={`${CLASS_NAME}-side-btn ${CLASS_NAME}-mic-btn`}
            onClick={(e) => { cancelEvent(e); throttledMuteClick(); }}
            aria-label={i18n(isMuted() ? 'VoipUnmute' : 'Call.Mute').textContent}
            noRipple
          >
            <IconTsx icon={isMuted() ? 'microphone_crossed_filled' : 'microphone_filled'} />
          </Button>
        </Show>
        {/* A real button so the plate is reachable and operable from the
            keyboard; the click itself is handled by the plate, which stays
            clickable edge to edge the way it always was (Enter / Space on the
            button fire a click that bubbles there). */}
        <button
          type="button"
          class={`${CLASS_NAME}-center`}
          aria-label={i18n('Call.Open').textContent}
          aria-describedby={`${CLASS_NAME}-status`}
        >
          <StackedAvatarsTsx peerIds={avatarPeers()} avatarSize={16} />
          <div class={`${CLASS_NAME}-text`}>
            <div class={`${CLASS_NAME}-title`} ref={titleEl} />
            <div
              id={`${CLASS_NAME}-status`}
              class={`${CLASS_NAME}-status`}
              ref={statusEl}
              role={statusAnnouncementsEnabled() ? 'status' : undefined}
              aria-live={statusAnnouncementsEnabled() ? 'polite' : 'off'}
              aria-atomic="true"
            />
          </div>
          <div class={`${CLASS_NAME}-extra`} ref={extraEl} />
        </button>
        <Button.Icon
          icon={isRtmp() ? 'close' : 'endcall_filled'}
          class={`${CLASS_NAME}-side-btn ${CLASS_NAME}-end-btn${!isRtmp() ? ' endcall' : ''}`}
          onClick={(e) => { cancelEvent(e); return onHangUp(); }}
          disabled={isConferenceMigration(instance())}
          tabIndex={0}
          aria-label={i18n(endCallLabel()).textContent}
          noRipple
        />
      </TopbarPlate.Body>
    )
  });

  return {
    container: plate.container,
    destroy: () => {
      listenerSetter.removeAll();
      instanceListenerSetter?.removeAll();
      plate.destroy();
    }
  };
}
