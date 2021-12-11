/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { animate } from "../../helpers/animation";
import { GroupCallParticipant } from "../../layer";
import type { GroupCallInstance, GroupCallOutputSource } from "../../lib/appManagers/appGroupCallsManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import { i18n } from "../../lib/langPack";
import PeerTitle from "../peerTitle";
import { getGroupCallParticipantMutedState } from ".";
import GroupCallParticipantMutedIcon from "./participantMutedIcon";
import GroupCallParticipantStatusElement from "./participantStatus";

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

  constructor(private appPeersManager: AppPeersManager, private instance: GroupCallInstance, public source: GroupCallOutputSource) {
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
  
      const icon = document.createElement('i');
      icon.classList.add('group-call-pin-icon', 'tgico-pin');
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
        peerId: this.appPeersManager.getPeerId(participant.peer)
      });

      peerTitleElement = this.peerTitle.element;
    }

    this.groupCallParticipantMutedIcon = new GroupCallParticipantMutedIcon(false);
    this.groupCallParticipantStatus = new GroupCallParticipantStatusElement([type]);

    this.left.append(peerTitleElement, this.groupCallParticipantStatus.container);

    this.right.append(this.groupCallParticipantMutedIcon.container);

    const className = 'group-call-participant-video';
    video.classList.add(className);

    if(video.paused) {
      video.play();
    }
    
    const canvas = document.createElement('canvas');
    canvas.classList.add(className + '-blur');
    const size = 16;
    canvas.width = size;
    canvas.height = size;

    if(video) {
      const ctx = canvas.getContext('2d');
      ctx.filter = 'blur(2px)';
      const renderFrame = () => {
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, canvas.width, canvas.height);
      };

      animate(() => {
        renderFrame();
        return canvas.isConnected;
      });

      renderFrame();
    }
    
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
