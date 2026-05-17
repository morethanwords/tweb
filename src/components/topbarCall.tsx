/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, Show} from 'solid-js';
import cancelEvent from '@helpers/dom/cancelEvent';
import classNames from '@helpers/string/classNames';
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
// import StreamManager from '@lib/calls/streamManager';
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
import GroupCallMicrophoneIconMini from '@components/groupCall/microphoneIconMini';
import {AppMediaViewerRtmp} from '@components/appMediaViewerRtmp';
import Button from '@components/buttonTsx';
import TopbarPlate, {createTopbarPlate} from '@components/chat/topbarPlate';
// import TopbarWeave from '@components/topbarWeave';

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

  const micIcon = new GroupCallMicrophoneIconMini();

  let leftEl!: HTMLDivElement;
  let centerEl!: HTMLDivElement;

  // Imperative widgets — one per kind, created on first use.
  let groupCallTitle: GroupCallTitleElement | undefined;
  let groupCallDescription: GroupCallDescriptionElement | undefined;
  let callDescription: CallDescriptionElement | undefined;
  let rtmpDescription: RtmpDescriptionElement | undefined;
  let currentDescription: GroupCallDescriptionElement | CallDescriptionElement | RtmpDescriptionElement | undefined;

  const ensureWidgets = () => {
    if(groupCallTitle) return;
    groupCallTitle = new GroupCallTitleElement(centerEl);
    groupCallDescription = new GroupCallDescriptionElement(leftEl);
    callDescription = new CallDescriptionElement(leftEl);
    rtmpDescription = new RtmpDescriptionElement(centerEl, leftEl);
  };

  const setKindClasses = (inst: AnyInstance | undefined) => {
    for(const [name, ctor] of KIND_CLASSES) {
      plate.container.classList.toggle(`is-${name}`, !!inst && inst instanceof ctor);
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
      replaceContent(centerEl, new PeerTitle({peerId: inst.peerId}).element);
    } else if(inst instanceof GroupCallInstance) {
      groupCallTitle!.update(inst);
    } else {
      replaceContent(centerEl, new PeerTitle({peerId: inst.interlocutorUserId.toPeerId()}).element);
    }
  };

  const clearCurrentInstance = () => {
    if(!instance()) return;
    centerEl?.replaceChildren();

    if(currentDescription) {
      currentDescription.detach();
      currentDescription = undefined;
    }

    setInstance(undefined);
    setKindClasses(undefined);

    instanceListenerSetter?.removeAll();
    instanceListenerSetter = undefined;
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

    // TopbarWeave is commented out — visual gradient/amplitude feedback is disabled.
    // const {weave} = this;
    // weave.componentDidMount();

    const isClosed = state === GROUP_CALL_STATE.CLOSED;
    if((!document.body.classList.contains('is-calling') || isChangingInstance) || isClosed) {
      // if(isClosed) weave.setAmplitude(0);

      SetTransition({
        element: document.body,
        className: 'is-calling',
        forwards: !isClosed,
        duration: 250,
        onTransitionEnd: isClosed ? () => {
          // weave.componentWillUnmount();
          clearCurrentInstance();
        } : undefined
      });
    }

    if(isClosed) {
      toggleActivity(false);
      setIsMuted(undefined);
      setIsRtmp(false);
      return;
    }

    currentActivityName = (inst as Object)?.constructor?.name;
    toggleActivity(true);

    // weave.setCurrentState(
    //   inst instanceof RtmpCallInstance ? 'rtmp' : 'group',
    //   inst instanceof RtmpCallInstance ? inst.state : state,
    //   true
    // );

    setTitle(inst);
    currentDescription?.update(inst as any);

    if(muted !== undefined) {
      micIcon.setState(!muted);
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

  listenerSetter.add(groupCallsController)('instance', (i) => {
    updateInstance(i);
  });

  listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
    const i = groupCallsController.groupCall;
    if(i?.id === groupCall.id) {
      updateInstance(i);
    }
  });

  listenerSetter.add(rtmpCallsController)('currentCallChanged', (call) => {
    updateInstance(call);
  });

  // Amplitude → weave (commented out).
  // listenerSetter.add(StreamManager.ANALYSER_LISTENER)('amplitude', ({amplitudes, type}) => {
  //   const {weave} = this;
  //   if(!amplitudes.length || !weave) return;
  //   let max = 0;
  //   for(let i = 0; i < amplitudes.length; ++i) {
  //     const {type, value} = amplitudes[i];
  //     max = value > max ? value : max;
  //   }
  //   weave.setAmplitude(max);
  // });

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
      <TopbarPlate.Body onClick={onPlateClick}>
        <div class={`${CLASS_NAME}-left`} ref={leftEl}>
          <Show when={isMuted() !== undefined}>
            <Button
              class="btn-icon"
              onClick={(e) => { cancelEvent(e); throttledMuteClick(); }}
            >
              {micIcon.container}
            </Button>
          </Show>
        </div>
        <div class={`${CLASS_NAME}-center`} ref={centerEl} />
        <div class={`${CLASS_NAME}-right`}>
          <Button.Icon
            icon="endcall_filled"
            class={classNames(isRtmp() && 'hide')}
            onClick={(e) => { cancelEvent(e); onHangUp(); }}
          />
        </div>
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
