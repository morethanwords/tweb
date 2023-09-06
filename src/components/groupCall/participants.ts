/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupGroupCall from '.';
import filterAsync from '../../helpers/array/filterAsync';
import contextMenuController from '../../helpers/contextMenuController';
import {attachContextMenuListener} from '../../helpers/dom/attachContextMenuListener';
import cancelEvent from '../../helpers/dom/cancelEvent';
import findUpClassName from '../../helpers/dom/findUpClassName';
import {addFullScreenListener, isFullScreen} from '../../helpers/dom/fullScreen';
import ListenerSetter from '../../helpers/listenerSetter';
import noop from '../../helpers/noop';
import safeAssign from '../../helpers/object/safeAssign';
import positionMenu from '../../helpers/positionMenu';
import ScrollableLoader from '../../helpers/scrollableLoader';
import {GroupCallParticipant} from '../../layer';
import appImManager from '../../lib/appManagers/appImManager';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import GroupCallInstance from '../../lib/calls/groupCallInstance';
import rootScope from '../../lib/rootScope';
import {ButtonMenuItemOptions, ButtonMenuSync} from '../buttonMenu';
import confirmationPopup from '../confirmationPopup';
import PeerTitle from '../peerTitle';
import PopupElement from '../popups';
import Scrollable from '../scrollable';
import GroupCallParticipantsList from './participantsList';
import GroupCallParticipantsVideoElement from './participantVideos';

export class GroupCallParticipantContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify: (peerId: PeerId) => boolean | Promise<boolean>})[];
  private element: HTMLElement;
  private chatId: ChatId;
  private targetPeerId: PeerId;
  private participant: GroupCallParticipant;
  private instance: GroupCallInstance;
  private canManageCall: boolean;
  private managers: AppManagers;

  constructor(options: {
    listenerSetter: ListenerSetter,
    onContextElement: HTMLElement,
    managers: AppManagers,
    instance: GroupCallInstance,
  }) {
    this.buttons = [{
      icon: 'gc_microphoneoff',
      text: 'VoiceChat.MutePeer',
      verify: () => this.canManageCall && this.participant.pFlags.can_self_unmute,
      onClick: () => this.toggleParticipantMuted(true)
    }, {
      icon: 'gc_microphone',
      text: 'VoiceChat.UnmutePeer',
      verify: () => this.canManageCall && !this.participant.pFlags.can_self_unmute,
      onClick: () => this.toggleParticipantMuted(false)
    }, {
      icon: 'gc_microphoneoff',
      text: 'VoiceChat.MuteForMe',
      verify: () => !this.canManageCall && !this.participant.pFlags.muted_by_you,
      onClick: () => this.toggleParticipantMuted(true)
    }, {
      icon: 'gc_microphone',
      text: 'VoiceChat.UnmuteForMe',
      verify: () => !this.canManageCall && this.participant.pFlags.muted_by_you,
      onClick: () => this.toggleParticipantMuted(false)
    }, {
      icon: 'newprivate',
      text: 'VoiceChat.OpenProfile',
      verify: () => true,
      onClick: this.onOpenProfileClick
    }, {
      icon: 'deleteuser',
      className: 'danger',
      text: 'VoiceChat.RemovePeer',
      verify: () => this.managers.appChatsManager.hasRights(this.chatId, 'ban_users'),
      onClick: async() => {
        confirmationPopup({
          peerId: this.targetPeerId,
          title: new PeerTitle({peerId: this.targetPeerId}).element,
          descriptionLangKey: await this.managers.appChatsManager.isBroadcast(this.chatId) ? 'VoiceChat.RemovePeer.Confirm.Channel' : 'VoiceChat.RemovePeer.Confirm',
          descriptionLangArgs: [new PeerTitle({peerId: this.targetPeerId}).element],
          button: {
            langKey: 'VoiceChat.RemovePeer.Confirm.OK',
            isDanger: true
          }
        }).then(() => {
          this.managers.appChatsManager.kickFromChat(this.chatId, this.targetPeerId);
        }, noop);
      }
    }];

    const {listenerSetter} = options;
    this.managers = options.managers;
    this.instance = options.instance;
    this.chatId = this.instance.chatId;

    this.element = ButtonMenuSync({buttons: this.buttons, listenerSetter});
    this.element.classList.add('group-call-participant-menu', 'night');

    attachContextMenuListener({
      element: options.onContextElement,
      callback: async(e) => {
        const li = findUpClassName(e.target, 'group-call-participant');
        if(!li) {
          return;
        }

        if(this.element.parentElement !== appendTo) {
          appendTo.append(this.element);
        }

        cancelEvent(e);

        const peerId = this.targetPeerId = li.dataset.peerId.toPeerId();
        this.participant = await this.instance.getParticipantByPeerId(peerId);
        if(this.participant.pFlags.self) {
          return;
        }

        this.canManageCall = await this.managers.appChatsManager.hasRights(this.chatId, 'manage_call');

        await filterAsync(this.buttons, async(button) => {
          const good = await button.verify(peerId);
          button.element.classList.toggle('hide', !good);
          return good;
        });

        positionMenu((e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent, this.element, 'right');
        contextMenuController.openBtnMenu(this.element);
      },
      listenerSetter
    });

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(this.instance.id === groupCallId) {
        const peerId = getPeerId(participant.peer);
        if(this.targetPeerId === peerId) {
          contextMenuController.close();
        }
      }
    });

    let appendTo: HTMLElement = document.body;
    addFullScreenListener(document.body, () => {
      const isFull = isFullScreen();
      appendTo = isFull ? PopupElement.getPopups(PopupGroupCall)[0].getContainer(): document.body;

      if(!isFull) {
        contextMenuController.close();
      }
    }, listenerSetter);
  }

  private onOpenProfileClick = () => {
    const popup = PopupElement.getPopups(PopupGroupCall)[0];
    if(popup) {
      popup.hide();
    }

    appImManager.setInnerPeer({peerId: this.targetPeerId});
  };

  private toggleParticipantMuted = (muted: boolean) => {
    this.instance.editParticipant(this.participant, {
      muted
    });
  };
};

export default class GroupCallParticipantsElement {
  private container: HTMLDivElement;
  private sortedList: GroupCallParticipantsList;
  private instance: GroupCallInstance;
  private listenerSetter: ListenerSetter;
  private groupCallParticipantsVideo: GroupCallParticipantsVideoElement;
  private contextMenu: GroupCallParticipantContextMenu;
  private managers: AppManagers;

  constructor(options: {
    appendTo: HTMLElement,
    instance: GroupCallInstance,
    listenerSetter: ListenerSetter,
    managers: AppManagers
  }) {
    safeAssign(this, options);

    const className = 'group-call-participants';

    const scrollable = new Scrollable(undefined);
    scrollable.container.classList.add(className + '-scrollable');

    const container = this.container = document.createElement('div');
    container.classList.add(className);

    // const invite = Button(`btn-primary btn-transparent ${className}-invite`, {icon: 'adduser', text: 'VoiceChat.Invite.InviteMembers'});

    const sortedList = this.sortedList = new GroupCallParticipantsList(this.instance);

    const {instance, listenerSetter} = this;
    this.contextMenu = new GroupCallParticipantContextMenu({
      ...options,
      onContextElement: sortedList.list,
      listenerSetter,
      instance
    });

    this.groupCallParticipantsVideo = new GroupCallParticipantsVideoElement({
      ...options,
      appendTo: scrollable.container,
      displayPinned: false
    });

    scrollable.append(/* invite,  */sortedList.list);
    container.append(scrollable.container);

    options.appendTo.append(container);

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(this.instance.id === groupCallId) {
        this.updateParticipant(participant);
      }
    });

    const scrollableLoader = new ScrollableLoader({
      scrollable,
      getPromise: () => {
        return this.managers.appGroupCallsManager.getGroupCallParticipants(this.instance.id).then(({participants, isEnd}) => {
          participants.forEach((participant) => {
            this.updateParticipant(participant);
          });

          return isEnd;
        });
      }
    });

    this.setInstance(instance);
  }

  private updateParticipant(participant: GroupCallParticipant) {
    const peerId = getPeerId(participant.peer);
    const has = this.sortedList.has(peerId);
    if(participant.pFlags.left) {
      if(has) {
        this.sortedList.delete(peerId);
      }

      return;
    }

    if(!has) {
      this.sortedList.add(peerId);
      return;
    }

    this.sortedList.update(peerId);
  }

  public async setInstance(instance: GroupCallInstance) {
    // @ts-ignore
    /* const users = appUsersManager.users;
    for(const userId in users) {
      const participant: GroupCallParticipant = {
        _: 'groupCallParticipant',
        date: 0,
        peer: {_: 'peerUser', user_id: userId.toPeerId()},
        pFlags: {
          muted: true
        },
        source: 1
      };

      instance.participants.set(userId.toPeerId(), participant);
      this.updateParticipant(participant);
    } */
    const participants = await instance.participants;
    participants.forEach((participant) => {
      this.updateParticipant(participant);
    });
  }

  public destroy() {
    this.sortedList.destroy();
    this.groupCallParticipantsVideo.destroy();
  }
}
