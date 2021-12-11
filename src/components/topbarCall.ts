/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { cancelEvent } from "../helpers/dom/cancelEvent";
import { attachClickEvent } from "../helpers/dom/clickEvent";
import ListenerSetter from "../helpers/listenerSetter";
import type { AppGroupCallsManager, GroupCallInstance } from "../lib/appManagers/appGroupCallsManager";
import GROUP_CALL_STATE from "../lib/calls/groupCallState";
import rootScope from "../lib/rootScope";
import ButtonIcon from "./buttonIcon";
import TopbarWeave from "./topbarWeave";
import SetTransition from "./singleTransition";
import PopupGroupCall from "./groupCall";
import type { AppPeersManager } from "../lib/appManagers/appPeersManager";
import type { AppChatsManager } from "../lib/appManagers/appChatsManager";
import GroupCallDescriptionElement from "./groupCall/description";
import GroupCallTitleElement from "./groupCall/title";
import { SuperRLottieIcon } from "./superIcon";
import PopupElement from "./popups";
import throttle from "../helpers/schedulers/throttle";

export class GroupCallMicrophoneIconMini extends SuperRLottieIcon<{
  PartState: boolean
}> {
  constructor() {
    super({
      width: 36,
      height: 36,
      getPart: (state) => {
        return this.getItem().getPart(state ? 'unmute' : 'mute');
      }
    });

    this.add({
      name: 'voice_mini',
      parts: [{
        startFrame: 0,
        endFrame: 35,
        name: 'hand-to-muted'
      }, {
        startFrame: 36,
        endFrame: 68,
        name: 'unmute'
      }, {
        startFrame: 69,
        endFrame: 98,
        name: 'mute'
      }, {
        startFrame: 99,
        endFrame: 135,
        name: 'muted-to-hand'
      }, {
        startFrame: 136,
        endFrame: 171,
        name: 'unmuted-to-hand'
      }]
    });
  }
}

export default class TopbarCall {
  public container: HTMLElement;
  private listenerSetter: ListenerSetter;
  private weave: TopbarWeave;
  private center: HTMLDivElement;
  private groupCallTitle: GroupCallTitleElement;
  private groupCallDescription: GroupCallDescriptionElement;
  private groupCallMicrophoneIconMini: GroupCallMicrophoneIconMini;
  
  constructor(
    private appGroupCallsManager: AppGroupCallsManager,
    private appPeersManager: AppPeersManager,
    private appChatsManager: AppChatsManager
  ) {
    const listenerSetter = this.listenerSetter = new ListenerSetter();

    listenerSetter.add(rootScope)('group_call_state', (instance) => {
      this.updateInstance(instance);
    });
    
    listenerSetter.add(rootScope)('group_call_update', (groupCall) => {
      const instance = this.appGroupCallsManager.groupCall;
      if(instance?.id === groupCall.id) {
        this.updateInstance(instance);
      }
    });

    listenerSetter.add(rootScope)('group_call_amplitude', ({amplitudes, type}) => {
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

  private updateInstance(instance: GroupCallInstance) {
    if(this.construct) {
      this.construct();
      this.construct = undefined;
    }

    const {state, id} = instance;

    const {weave, container} = this;

    weave.componentDidMount();
    
    const isClosed = state === GROUP_CALL_STATE.CLOSED;
    if(!document.body.classList.contains('is-calling') || isClosed) {
      if(isClosed) {
        weave.setAmplitude(0);
      }

      SetTransition(document.body, 'is-calling', !isClosed, 250, isClosed ? () => {
        weave.componentWillUnmount();
      }: undefined);
    }
    
    if(isClosed) {
      return;
    }
    
    if(state === GROUP_CALL_STATE.CONNECTING) {
      weave.setCurrentState(GROUP_CALL_STATE.CONNECTING, true);
    } else {
      /* var a = 0;
      animate(() => {
        a += 0.1;
        if(a > 1) a = 0;
        weave.setAmplitude(a);
        return true;
      });
      weave.setAmplitude(1); */
      weave.setCurrentState(state, true);
    }
    
    container.dataset.callId = '' + id;
    
    this.setTitle(instance);
    this.setDescription(instance);
    this.groupCallMicrophoneIconMini.setState(state === GROUP_CALL_STATE.UNMUTED);
    
    const className = 'state-' + state;
    if(container.classList.contains(className)) {
      return;
    }
  }

  private setDescription(instance: GroupCallInstance) {
    return this.groupCallDescription.update(instance);
  }

  private setTitle(instance: GroupCallInstance) {
    return this.groupCallTitle.update(instance);
  }

  private construct() {
    const {listenerSetter} = this;
    const container = this.container = document.createElement('div');
    container.classList.add('sidebar-header', 'topbar-call-container');

    const left = document.createElement('div');
    left.classList.add('topbar-call-left');

    const groupCallMicrophoneIconMini = this.groupCallMicrophoneIconMini = new GroupCallMicrophoneIconMini();
    
    const mute = ButtonIcon();
    mute.append(groupCallMicrophoneIconMini.container);
    left.append(mute);

    const throttledMuteClick = throttle(() => {
      this.appGroupCallsManager.toggleMuted();
    }, 600, true);
    
    attachClickEvent(mute, (e) => {
      cancelEvent(e);
      throttledMuteClick();
    }, {listenerSetter});
    
    const center = this.center = document.createElement('div');
    center.classList.add('topbar-call-center');
    
    this.groupCallTitle = new GroupCallTitleElement(center);
    this.groupCallDescription = new GroupCallDescriptionElement(left);
    
    const right = document.createElement('div');
    right.classList.add('topbar-call-right');
    
    const end = ButtonIcon('endcall_filled');
    right.append(end);
    
    attachClickEvent(end, (e) => {
      cancelEvent(e);
      this.appGroupCallsManager.hangUp(container.dataset.callId, false, false);
    }, {listenerSetter});

    attachClickEvent(container, () => {
      if(PopupElement.getPopup(PopupGroupCall)) {
        return;
      }
      
      new PopupGroupCall({
        appGroupCallsManager: this.appGroupCallsManager,
        appPeersManager: this.appPeersManager,
        appChatsManager: this.appChatsManager
      }).show();
    }, {listenerSetter});
    
    container.append(left, center, right);

    const weave = this.weave = new TopbarWeave();
    const weaveContainer = weave.render();
    container.prepend(weaveContainer);
    
    document.getElementById('column-center').prepend(container);
    weave.componentDidMount();
  }
}
