import {GroupCallParticipant} from '@layer';
import type {GroupCallOutputSource} from '@appManagers/appGroupCallsManager';
import I18n, {i18n} from '@lib/langPack';
import PeerTitle from '@components/peerTitle';
import {getGroupCallParticipantMutedState} from '.';
import GroupCallParticipantMutedIcon from '@components/groupCall/participantMutedIcon';
import GroupCallParticipantStatusElement from '@components/groupCall/participantStatus';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import callVideoCanvasBlur from '@components/call/videoCanvasBlur';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {AppManagers} from '@lib/managers';
import safePlay from '@helpers/dom/safePlay';
import Icon from '@components/icon';
import Button from '@components/button';

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
  private peerName: string;
  private isPinned: boolean;

  constructor(private managers: AppManagers, private instance: GroupCallInstance, public source: GroupCallOutputSource) {
    this.container = Button(className + '-container', {noRipple: true});
    this.updateAriaLabel();

    this.info = document.createElement('div');
    this.info.classList.add(className + '-info');

    this.left = document.createElement('div');
    this.left.classList.add(className + '-info-left');

    this.right = document.createElement('div');
    this.right.classList.add(className + '-info-right');

    this.info.append(this.left, this.right);

    this.container.append(this.info);
  }

  // Compose the tile's accessible name from the participant's name plus the
  // action the click performs (pin when not pinned, unpin when pinned).
  private updateAriaLabel() {
    const action = I18n.format(this.isPinned ? 'Message.Context.Unpin' : 'Message.Context.Pin', true);
    const label = this.peerName ? this.peerName + ', ' + action : action;
    this.container.setAttribute('aria-label', label);
  }

  public setPinned(value: boolean) {
    this.isPinned = value;
    this.updateAriaLabel();

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
    icon.setAttribute('aria-hidden', 'true');
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
      this.peerName = I18n.format('VoiceChat.Status.You', true);
    } else {
      this.peerTitle = new PeerTitle({
        peerId: getPeerId(participant.peer)
      });

      peerTitleElement = this.peerTitle.element;
      this.peerName = peerTitleElement.textContent;
    }

    this.updateAriaLabel();

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
