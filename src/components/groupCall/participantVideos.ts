/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../helpers/dom/clickEvent';
import ControlsHover from '../../helpers/dom/controlsHover';
import findUpClassName from '../../helpers/dom/findUpClassName';
import ListenerSetter from '../../helpers/listenerSetter';
import safeAssign from '../../helpers/object/safeAssign';
import {GroupCallParticipant} from '../../layer';
import {GroupCallOutputSource} from '../../lib/appManagers/appGroupCallsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import rootScope from '../../lib/rootScope';
import GroupCallParticipantVideoElement, {GroupCallParticipantVideoType} from './participantVideo';

export default class GroupCallParticipantsVideoElement extends ControlsHover {
  private container: HTMLDivElement;
  private instance: GroupCallInstance;
  private participantsElements: Map<PeerId, Map<GroupCallParticipantVideoType, GroupCallParticipantVideoElement>>;
  private displayPinned: boolean;
  private containers: Map<HTMLElement, GroupCallParticipantVideoElement>;
  private onLengthChange: (length: number) => void;
  private managers: AppManagers;

  constructor(options: {
    appendTo: HTMLElement,
    instance: GroupCallInstance,
    listenerSetter: ListenerSetter,
    displayPinned: boolean,
    onLengthChange?: GroupCallParticipantsVideoElement['onLengthChange'],
    managers: AppManagers
  }) {
    super();
    safeAssign(this, options);

    const className = 'group-call-participants-video';
    const container = this.container = document.createElement('div');
    this.container.classList.add(className + '-container');

    options.appendTo.append(container);

    this.participantsElements = new Map();
    this.containers = new Map();

    const {listenerSetter} = this;

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(this.instance.id === groupCallId) {
        this.updateParticipant(participant);
      }
    });

    listenerSetter.add(this.instance)('pinned', (source) => {
      this.participantsElements.forEach((map) => {
        map.forEach((element) => {
          this.setElementDisplay(element, source);
        });
      });
    });

    attachClickEvent(this.container, (e) => {
      const container = findUpClassName(e.target, 'group-call-participant-video-container');
      if(!container) {
        return;
      }

      const element = this.containers.get(container);
      if(this.instance.pinnedSource === element.source) {
        this.instance.unpinAll();
        return;
      }

      this.instance.pinSource(element.source);
    }, {listenerSetter});

    this.setInstance(this.instance);

    this.setup({
      element: container,
      listenerSetter: listenerSetter,
      showOnLeaveToClassName: 'group-call-buttons'
    });
  }

  private shouldDisplayElement(element: GroupCallParticipantVideoElement, pinnedSource: GroupCallOutputSource) {
    return this.displayPinned ? !pinnedSource || element.source === pinnedSource : pinnedSource && element.source !== pinnedSource;
  }

  private setElementDisplay(element: GroupCallParticipantVideoElement, pinnedSource: GroupCallOutputSource) {
    const shouldDisplay = this.shouldDisplayElement(element, pinnedSource);
    element.container.classList.toggle('video-hidden', !shouldDisplay);

    const isPinned = element.source === pinnedSource;
    element.setPinned(isPinned);
  }

  private updateParticipant(participant: GroupCallParticipant) {
    const peerId = getPeerId(participant.peer);
    const types: GroupCallParticipantVideoType[] = ['video', 'presentation'];
    const hasAnyVideo = types.some((type) => !!participant[type]);
    let participantElements = this.participantsElements.get(peerId);
    if(!hasAnyVideo && !participantElements) {
      return;
    }

    if(!participantElements) {
      this.participantsElements.set(peerId, participantElements = new Map());
    }

    types.forEach((type) => {
      let element = participantElements.get(type);
      const participantVideo = participant[type];
      if(!!participantVideo === !!element) {
        if(element) {
          element.updateParticipant(participant);
        }

        return;
      }

      if(participantVideo) {
        const result = this.instance.getVideoElementFromParticipantByType(participant, type);
        if(!result) {
          return;
        }

        const {video, source} = result;

        element = new GroupCallParticipantVideoElement(this.managers, this.instance, source);

        this.containers.set(element.container, element);

        this.setElementDisplay(element, this.instance.pinnedSource);
        participantElements.set(type, element);
        element.setParticipant(participant, type, video);

        this.container.prepend(element.container);
      } else {
        participantElements.delete(type);
        element.container.remove();

        if(!participantElements.size) {
          this.participantsElements.delete(peerId);
          this.containers.delete(element.container);
          element.destroy();
        }
      }

      this._onLengthChange();
    });
  }

  private _onLengthChange() {
    const length = this.container.childElementCount;
    this.container.dataset.length = '' + length;
    this.container.dataset.layout = length <= 2 ? '1' : (length === 3 ? '3' : '4');

    this.onLengthChange && this.onLengthChange(length);
  }

  public async setInstance(instance: GroupCallInstance) {
    (await instance.participants).forEach((participant) => {
      this.updateParticipant(participant);
    });
  }

  public destroy() {
    this.containers.forEach((element) => {
      element.destroy();
    });
  }
}
