import PopupGroupCall from '.';
import {getOverlayRoot} from '@helpers/appWindow';
import filterAsync from '@helpers/array/filterAsync';
import contextMenuController from '@helpers/contextMenuController';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import cancelEvent from '@helpers/dom/cancelEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import {addFullScreenListener, isFullScreen} from '@helpers/dom/fullScreen';
import ListenerSetter from '@helpers/listenerSetter';
import noop from '@helpers/noop';
import safeAssign from '@helpers/object/safeAssign';
import positionMenu from '@helpers/positionMenu';
import ScrollableLoader from '@helpers/scrollableLoader';
import {GroupCallParticipant} from '@layer';
import appImManager from '@lib/appImManager';
import {AppManagers} from '@lib/managers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';
import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import confirmationPopup from '@components/confirmationPopup';
import PeerTitle from '@components/peerTitle';
import PopupElement from '@components/popups';
import Scrollable from '@components/scrollable';
import GroupCallParticipantsList from '@components/groupCall/participantsList';
import GroupCallParticipantsVideoElement from '@components/groupCall/participantVideos';

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
        // A chain-only member has no SFU participant behind them, so every
        // action here (mute, mute-for-me, kick) would address a row the server
        // doesn't know about. tdesktop keeps these rows inert too
        // (calls_group_members_row.cpp:747).
        if(this.instance.isMemberWithAccess(peerId)) {
          return;
        }

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

    let appendTo: HTMLElement = getOverlayRoot();
    addFullScreenListener(document.body, () => {
      const isFull = isFullScreen();
      appendTo = isFull ? PopupElement.getPopups(PopupGroupCall)[0].getContainer(): getOverlayRoot();

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

    // Members that the e2e blockchain authorises but the SFU roster omits. They
    // hold the current call key, so they get a row like anyone else — see
    // `@lib/calls/e2e/conferenceMembership`.
    listenerSetter.add(instance)('membersWithAccess', ({current, previous}) => {
      const currentSet = new Set(current);
      // A peer leaving the set either joined the SFU for real (a live row takes
      // over) or was removed from the chain (nothing left to show) — refreshRow
      // resolves which by re-reading the participant.
      previous.filter((peerId) => !currentSet.has(peerId)).forEach((peerId) => {
        this.refreshRow(peerId);
      });
      current.forEach((peerId) => this.refreshRow(peerId));
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

  // Re-render one row from whatever the instance currently knows about the peer
  // (a real SFU participant, a chain-only member, or neither). Reading the
  // participant crosses the manager proxy, so swallow a transient failure
  // rather than dropping the row — or leaking an unhandled rejection.
  private refreshRow(peerId: PeerId) {
    this.instance.getParticipantByPeerId(peerId).then((participant) => {
      if(participant) {
        this.updateParticipant(participant);
      } else if(this.sortedList.has(peerId)) {
        this.sortedList.delete(peerId);
      }
    }, noop);
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

    // The popup can open mid-call, after reconciliation already ran.
    instance.memberWithAccessPeerIds.forEach((peerId) => this.refreshRow(peerId));
  }

  public destroy() {
    this.sortedList.destroy();
    this.groupCallParticipantsVideo.destroy();
  }
}
