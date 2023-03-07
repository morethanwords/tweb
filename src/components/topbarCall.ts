/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import ListenerSetter from '../helpers/listenerSetter';
import GROUP_CALL_STATE from '../lib/calls/groupCallState';
import rootScope from '../lib/rootScope';
import ButtonIcon from './buttonIcon';
import TopbarWeave from './topbarWeave';
import SetTransition from './singleTransition';
import PopupGroupCall from './groupCall';
import GroupCallDescriptionElement from './groupCall/description';
import GroupCallTitleElement from './groupCall/title';
import PopupElement from './popups';
import throttle from '../helpers/schedulers/throttle';
import GroupCallInstance from '../lib/calls/groupCallInstance';
import CALL_STATE from '../lib/calls/callState';
import replaceContent from '../helpers/dom/replaceContent';
import PeerTitle from './peerTitle';
import CallDescriptionElement from './call/description';
import PopupCall from './call';
import GroupCallMicrophoneIconMini from './groupCall/microphoneIconMini';
import CallInstance from '../lib/calls/callInstance';
import {AppManagers} from '../lib/appManagers/managers';
import groupCallsController from '../lib/calls/groupCallsController';
import StreamManager from '../lib/calls/streamManager';
import callsController from '../lib/calls/callsController';

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

const CLASS_NAME = 'topbar-call';

export default class TopbarCall {
  public container: HTMLElement;
  private listenerSetter: ListenerSetter;
  private weave: TopbarWeave;
  private center: HTMLDivElement;
  private groupCallTitle: GroupCallTitleElement;
  private groupCallDescription: GroupCallDescriptionElement;
  private groupCallMicrophoneIconMini: GroupCallMicrophoneIconMini;
  private callDescription: CallDescriptionElement;

  private currentDescription: GroupCallDescriptionElement | CallDescriptionElement;

  private instance: GroupCallInstance | any/* CallInstance */;
  private instanceListenerSetter: ListenerSetter;

  constructor(
    private managers: AppManagers
  ) {
    const listenerSetter = this.listenerSetter = new ListenerSetter();

    listenerSetter.add(callsController)('instance', ({instance}) => {
      if(!this.instance) {
        this.updateInstance(instance);
      }
    });

    listenerSetter.add(callsController)('accepting', (instance) => {
      if(this.instance !== instance) {
        this.updateInstance(instance);
      }
    });

    listenerSetter.add(groupCallsController)('instance', (instance) => {
      this.updateInstance(instance);
    });

    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      const instance = groupCallsController.groupCall;
      if(instance?.id === groupCall.id) {
        this.updateInstance(instance);
      }
    });

    listenerSetter.add(StreamManager.ANALYSER_LISTENER)('amplitude', ({amplitudes, type}) => {
      const {weave} = this;
      if(!amplitudes.length || !weave/*  || type !== 'input' */) return;

      let max = 0;
      for(let i = 0; i < amplitudes.length; ++i) {
        const {type, value} = amplitudes[i];
        max = value > max ? value : max;
      }

      weave.setAmplitude(max);
    });
  }

  private onState = () => {
    this.updateInstance(this.instance);
  };

  private clearCurrentInstance() {
    if(!this.instance) return;
    this.center.textContent = '';

    if(this.currentDescription) {
      this.currentDescription.detach();
      this.currentDescription = undefined;
    }

    this.instance = undefined;
    this.instanceListenerSetter.removeAll();
  }

  private updateInstance(instance: TopbarCall['instance']) {
    if(this.construct) {
      this.construct();
      this.construct = undefined;
    }

    const isChangingInstance = this.instance !== instance;
    if(isChangingInstance) {
      this.clearCurrentInstance();

      this.instance = instance;
      this.instanceListenerSetter = new ListenerSetter();

      this.instanceListenerSetter.add(instance as GroupCallInstance)('state', this.onState);

      if(instance instanceof GroupCallInstance) {
        this.currentDescription = this.groupCallDescription;
      } else {
        this.currentDescription = this.callDescription;
        this.instanceListenerSetter.add(instance)('muted', this.onState);
      }

      this.container.classList.toggle('is-call', !(instance instanceof GroupCallInstance));
    }

    const isMuted = this.instance.isMuted;
    const state = instance instanceof GroupCallInstance ? instance.state : convertCallStateToGroupState(instance.connectionState, isMuted);

    const {weave} = this;

    weave.componentDidMount();

    const isClosed = state === GROUP_CALL_STATE.CLOSED;
    if((!document.body.classList.contains('is-calling') || isChangingInstance) || isClosed) {
      if(isClosed) {
        weave.setAmplitude(0);
      }

      SetTransition({
        element: document.body,
        className: 'is-calling',
        forwards: !isClosed,
        duration: 250,
        onTransitionEnd: isClosed ? () => {
          weave.componentWillUnmount();

          this.clearCurrentInstance();
        } : undefined
      });
    }

    if(isClosed) {
      return;
    }

    weave.setCurrentState(state, true);
    // if(state === GROUP_CALL_STATE.CONNECTING) {
    //   weave.setCurrentState(state, true);
    // } else {
    //   /* var a = 0;
    //   animate(() => {
    //     a += 0.1;
    //     if(a > 1) a = 0;
    //     weave.setAmplitude(a);
    //     return true;
    //   });
    //   weave.setAmplitude(1); */
    //   weave.setCurrentState(state, true);
    // }

    this.setTitle(instance);
    this.setDescription(instance);
    this.groupCallMicrophoneIconMini.setState(!isMuted);
  }

  private setDescription(instance: TopbarCall['instance']) {
    return this.currentDescription.update(instance as any);
  }

  private setTitle(instance: TopbarCall['instance']) {
    if(instance instanceof GroupCallInstance) {
      return this.groupCallTitle.update(instance);
    } else {
      replaceContent(this.center, new PeerTitle({peerId: instance.interlocutorUserId.toPeerId()}).element);
    }
  }

  private construct() {
    const {listenerSetter} = this;
    const container = this.container = document.createElement('div');
    container.classList.add('sidebar-header', CLASS_NAME + '-container');

    const left = document.createElement('div');
    left.classList.add(CLASS_NAME + '-left');

    const groupCallMicrophoneIconMini = this.groupCallMicrophoneIconMini = new GroupCallMicrophoneIconMini();

    const mute = ButtonIcon();
    mute.append(groupCallMicrophoneIconMini.container);
    left.append(mute);

    const throttledMuteClick = throttle(() => {
      this.instance.toggleMuted();
    }, 600, true);

    attachClickEvent(mute, (e) => {
      cancelEvent(e);
      throttledMuteClick();
    }, {listenerSetter});

    const center = this.center = document.createElement('div');
    center.classList.add(CLASS_NAME + '-center');

    this.groupCallTitle = new GroupCallTitleElement(center);
    this.groupCallDescription = new GroupCallDescriptionElement(left);

    this.callDescription = new CallDescriptionElement(left);

    const right = document.createElement('div');
    right.classList.add(CLASS_NAME + '-right');

    const end = ButtonIcon('endcall_filled');
    right.append(end);

    attachClickEvent(end, (e) => {
      cancelEvent(e);

      const {instance} = this;
      if(!instance) {
        return;
      }

      if(instance instanceof GroupCallInstance) {
        instance.hangUp();
      } else {
        instance.hangUp('phoneCallDiscardReasonHangup');
      }
    }, {listenerSetter});

    attachClickEvent(container, () => {
      if(this.instance instanceof GroupCallInstance) {
        if(PopupElement.getPopups(PopupGroupCall).length) {
          return;
        }

        PopupElement.createPopup(PopupGroupCall).show();
      } else if(this.instance instanceof CallInstance) {
        const popups = PopupElement.getPopups(PopupCall);
        if(popups.find((popup) => popup.getCallInstance() === this.instance)) {
          return;
        }

        PopupElement.createPopup(PopupCall, this.instance).show();
      }
    }, {listenerSetter});

    container.append(left, center, right);

    const weave = this.weave = new TopbarWeave();
    const weaveContainer = weave.render(CLASS_NAME + '-weave');
    container.prepend(weaveContainer);

    document.getElementById('column-center').prepend(container);
    weave.componentDidMount();
  }
}
