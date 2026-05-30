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
import {AppMediaViewerRtmp} from '@components/appMediaViewerRtmp';
import Button from '@components/buttonTsx';
import {IconTsx} from '@components/iconTsx';
import TopbarPlate, {createTopbarPlate} from '@components/chat/topbarPlate';
import {StackedAvatarsTsx} from '@components/stackedAvatars';

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

  // Tracked solely for `toggleUninteruptableActivity` calls.
  let currentActivityName: string | undefined;

  const [avatarPeers, setAvatarPeers] = createSignal<PeerId[]>([]);

  let centerEl!: HTMLDivElement;
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

  const onState = () => updateInstance(instance());

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
    else state = convertCallStateToGroupState(inst.connectionState, muted);

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

  listenerSetter.add(groupCallsController)('instance', (i) => {
    updateInstance(i);
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
  listenerSetter.add(rootScope)('group_call_participant', ({groupCallId}) => {
    const i = instance();
    if(i instanceof GroupCallInstance && !i.chatId && String(i.id) === String(groupCallId)) {
      refreshConferenceAvatars(i);
    }
  });

  listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
    updateInstance(call);
  });

  // ───────────────────────── Click handlers ─────────────────────────

  const throttledMuteClick = throttle(() => {
    const inst = instance();
    if(inst && !(inst instanceof RtmpCallInstance)) {
      inst.toggleMuted();
    }
  }, 600, true);

  const onHangUp = () => {
    const inst = instance();
    if(!inst) return;
    if(inst instanceof RtmpCallInstance) {
      rtmpCallsController.leaveCall();
    } else if(inst instanceof GroupCallInstance) {
      inst.hangUp();
    } else {
      inst.hangUp('phoneCallDiscardReasonHangup');
    }
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
    initiallyHidden: false,
    render: () => (
      <TopbarPlate.Body onClick={onPlateClick} noRipple>
        <Show when={!isRtmp() && isMuted() !== undefined}>
          <Button
            class={`${CLASS_NAME}-side-btn ${CLASS_NAME}-mic-btn`}
            onClick={(e) => { cancelEvent(e); throttledMuteClick(); }}
            noRipple
          >
            <IconTsx icon={isMuted() ? 'microphone_crossed_filled' : 'microphone_filled'} />
          </Button>
        </Show>
        <div class={`${CLASS_NAME}-center`} ref={centerEl}>
          <StackedAvatarsTsx peerIds={avatarPeers()} avatarSize={16} />
          <div class={`${CLASS_NAME}-text`}>
            <div class={`${CLASS_NAME}-title`} ref={titleEl} />
            <div class={`${CLASS_NAME}-status`} ref={statusEl} />
          </div>
          <div class={`${CLASS_NAME}-extra`} ref={extraEl} />
        </div>
        <Button.Icon
          icon={isRtmp() ? 'close' : 'endcall_filled'}
          class={`${CLASS_NAME}-side-btn ${CLASS_NAME}-end-btn ${!isRtmp() && 'endcall'}`}
          onClick={(e) => { cancelEvent(e); onHangUp(); }}
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
