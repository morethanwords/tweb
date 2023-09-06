/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {GroupCallParticipant} from '../../layer';
import type {GroupCallOutputSource} from '../../lib/appManagers/appGroupCallsManager';
import {i18n} from '../../lib/langPack';
import PeerTitle from '../peerTitle';
import {getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from './participantMutedIcon';
import GroupCallParticipantStatusElement from './participantStatus';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import callVideoCanvasBlur from '../call/videoCanvasBlur';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {AppManagers} from '../../lib/appManagers/managers';
import safePlay from '../../helpers/dom/safePlay';
import Icon from '../icon';

const className = 'group-call-participant-video';

export type GroupCallParticipantVideoType = 'video' | 'presentation';
export default class GroupCallParticipantVideoElement {
  public container: HTMLElement;
  private peerTitle: PeerTitle;
  private subtitle: HTMLElement;
  private info: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private header: HTMLElement;
  private groupCallParticipantMutedIcon: GroupCallParticipantMutedIcon;
  private groupCallParticipantStatus: GroupCallParticipantStatusElement;

  constructor(private managers: AppManagers, private instance: GroupCallInstance, public source: GroupCallOutputSource) {
    this.container = document.createElement('div');
    this.container.classList.add(className + '-container');

    this.info = document.createElement('div');
    this.info.classList.add(className + '-info');

    this.left = document.createElement('div');
    this.left.classList.add(className + '-info-left');

    this.right = document.createElement('div');
    this.right.classList.add(className + '-info-right');

    this.info.append(this.left, this.right);

    this.container.append(this.info);
  }

  public setPinned(value: boolean) {
    if(!value) {
      if(this.header) {
        this.header.remove();
        this.header = undefined;
      }

      return;
    } else if(this.header) {
      return;
    }

    // if(!this.header) {
    this.header = document.createElement('div');
    this.header.classList.add(className + '-header');

    const icon = Icon('pin', 'group-call-pin-icon');
    this.header.append(icon);

    this.container.append(this.header);
    // }

    // this.container.classList.toggle('is-pinned', value);
  }

  public setParticipant(participant: GroupCallParticipant, type: GroupCallParticipantVideoType, video: HTMLVideoElement) {
    let peerTitleElement: HTMLElement;
    if(participant.pFlags.self) {
      peerTitleElement = i18n('VoiceChat.Status.You');
      peerTitleElement.classList.add('peer-title');
    } else {
      this.peerTitle = new PeerTitle({
        peerId: getPeerId(participant.peer)
      });

      peerTitleElement = this.peerTitle.element;
    }

    this.groupCallParticipantMutedIcon = new GroupCallParticipantMutedIcon(false);
    this.groupCallParticipantStatus = new GroupCallParticipantStatusElement([type]);

    this.left.append(peerTitleElement, this.groupCallParticipantStatus.container);

    this.right.append(this.groupCallParticipantMutedIcon.container);

    video.classList.add(className, 'call-video');

    if(video.paused) {
      safePlay(video);
    }

    const canvas = callVideoCanvasBlur(video);
    canvas.classList.add(className + '-blur');

    this.container.prepend(canvas, video);

    this.updateParticipant(participant);
  }

  public updateParticipant(participant: GroupCallParticipant) {
    const state = getGroupCallParticipantMutedState(participant);

    this.groupCallParticipantMutedIcon.setState(state);
    this.groupCallParticipantStatus.setState(state, participant);
  }

  public destroy() {
    this.groupCallParticipantMutedIcon.destroy();
  }
}
