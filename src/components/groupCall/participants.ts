import PopupGroupCall from '.';
import {getOverlayRoot} from '@helpers/appWindow';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {addFullScreenListener, isFullScreen} from '@helpers/dom/fullScreen';
import ListenerSetter from '@helpers/listenerSetter';
import safeAssign from '@helpers/object/safeAssign';
import positionMenu from '@helpers/positionMenu';
import ScrollableLoader from '@helpers/scrollableLoader';
import {GroupCallParticipant} from '@layer';
import appImManager from '@lib/appImManager';
import {AppManagers} from '@lib/managers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';
import {
  ButtonMenuItemOptionsVerifiable
} from '@components/buttonMenu';
import confirmationPopup from '@components/confirmationPopup';
import PeerTitle from '@components/peerTitle';
import PopupElement from '@components/popups';
import Scrollable from '@components/scrollable';
import GroupCallParticipantsList from '@components/groupCall/participantsList';
import GroupCallParticipantsVideoElement from '@components/groupCall/participantVideos';
import {toastNew} from '@components/toast';

export class GroupCallParticipantContextMenu {
  private buttons: ButtonMenuItemOptionsVerifiable[];
  private chatId: ChatId;
  private targetPeerId: PeerId;
  private participant: GroupCallParticipant;
  private instance: GroupCallInstance;
  private canManageCall: boolean;
  private managers: AppManagers;
  private listenerSetter = new ListenerSetter();
  private contextMenu: ReturnType<typeof createContextMenu>;
  private destroyed = false;
  private openGeneration = 0;
  private removeParentCleanup: () => void;

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
      onClick: () => {
        void this.removeParticipant();
      }
    }];

    const {listenerSetter} = this;
    this.removeParentCleanup = options.listenerSetter.addCleanup(() => this.destroy());
    this.managers = options.managers;
    this.instance = options.instance;
    this.chatId = this.instance.chatId;

    this.contextMenu = createContextMenu({
      buttons: this.buttons,
      listenTo: options.onContextElement,
      listenerSetter,
      findElement: (e) => findUpClassName(e.target, 'group-call-participant'),
      resolveAppendTo: () => isFullScreen() ?
        PopupElement.getPopups(PopupGroupCall)[0]?.getContainer() ?? getOverlayRoot() :
        getOverlayRoot(),
      onOpen: async(_e, li) => {
        const generation = ++this.openGeneration;
        const peerId = li.dataset.peerId.toPeerId();
        // A chain-only member has no SFU participant behind them, so every
        // action here (mute, mute-for-me, kick) would address a row the server
        // doesn't know about. tdesktop keeps these rows inert too
        // (calls_group_members_row.cpp:747).
        if(this.instance.isMemberWithAccess(peerId)) {
          return false;
        }
        this.targetPeerId = peerId;

        const participant = await this.instance.getParticipantByPeerId(peerId);
        if(this.destroyed || this.openGeneration !== generation) return false;
        if(!participant || participant.pFlags.self) return false;

        const canManageCall = await this.managers.appChatsManager.hasRights(this.chatId, 'manage_call');
        if(this.destroyed || this.openGeneration !== generation) return false;
        this.targetPeerId = peerId;
        this.participant = participant;
        this.canManageCall = canManageCall;
      },
      onElementReady: (element) => {
        element.classList.add('group-call-participant-menu', 'night');
      },
      position: (e, element) => {
        positionMenu('touches' in e ? e.touches[0] : e, element, 'right');
      },
      reopenOnTrigger: true,
      cancelOnOpenFalse: true
    });

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(this.instance.id === groupCallId) {
        const peerId = getPeerId(participant.peer);
        if(this.targetPeerId === peerId) {
          this.closeContextMenu();
        }
      }
    });

    listenerSetter.add(this.instance)('membersWithAccess', ({current}) => {
      if(this.targetPeerId !== undefined && current.includes(this.targetPeerId)) {
        this.closeContextMenu();
      }
    });

    addFullScreenListener(document.body, () => {
      this.closeContextMenu();
    }, listenerSetter);
  }

  private closeContextMenu() {
    ++this.openGeneration;
    this.contextMenu.close();
  }

  private onOpenProfileClick = () => {
    const popup = PopupElement.getPopups(PopupGroupCall)[0];
    if(popup) {
      popup.hide();
    }

    appImManager.setInnerPeer({peerId: this.targetPeerId});
  };

  private toggleParticipantMuted = (muted: boolean) => {
    return this.instance.editParticipant(this.participant, {
      muted
    }).catch((err) => {
      if(this.destroyed) return;
      console.error('edit group call participant failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    });
  };

  private async removeParticipant(): Promise<void> {
    const chatId = this.chatId;
    const peerId = this.targetPeerId;
    const generation = this.openGeneration;
    let isBroadcast: boolean;
    try {
      isBroadcast = await this.managers.appChatsManager.isBroadcast(chatId);
    } catch(err) {
      if(!this.destroyed && this.openGeneration === generation) {
        console.error('load remove-participant confirmation failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
      return;
    }
    if(this.destroyed || this.openGeneration !== generation) return;

    try {
      await confirmationPopup({
        peerId,
        title: new PeerTitle({peerId}).element,
        descriptionLangKey: isBroadcast ? 'VoiceChat.RemovePeer.Confirm.Channel' : 'VoiceChat.RemovePeer.Confirm',
        descriptionLangArgs: [new PeerTitle({peerId}).element],
        button: {
          langKey: 'VoiceChat.RemovePeer.Confirm.OK',
          isDanger: true
        }
      });
    } catch(err) {
      // Rejection is the confirmation popup's ordinary cancel path.
      return;
    }

    try {
      await this.managers.appChatsManager.kickFromChat(chatId, peerId);
    } catch(err) {
      if(this.destroyed) return;
      console.error('remove group call participant failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    }
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    ++this.openGeneration;
    this.contextMenu.destroy();
    this.removeParentCleanup();
    this.listenerSetter.removeAll();
  }
};

export default class GroupCallParticipantsElement {
  private container: HTMLDivElement;
  private sortedList: GroupCallParticipantsList;
  private instance: GroupCallInstance;
  private listenerSetter: ListenerSetter;
  private groupCallParticipantsVideo: GroupCallParticipantsVideoElement;
  private contextMenu: GroupCallParticipantContextMenu;
  private managers: AppManagers;
  private scrollable: Scrollable;
  private destroyed = false;
  private instanceGeneration = 0;
  private rowMutationGeneration = 0;
  private rowMutationGenerations = new Map<PeerId, number>();

  constructor(options: {
    appendTo: HTMLElement,
    instance: GroupCallInstance,
    listenerSetter: ListenerSetter,
    managers: AppManagers
  }) {
    safeAssign(this, options);

    const className = 'group-call-participants';

    const scrollable = this.scrollable = new Scrollable(undefined);
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
          if(this.destroyed) return true;
          participants.forEach((participant) => {
            this.updateParticipant(participant);
          });

          return isEnd;
        });
      }
    });

    void this.setInstance(instance);
  }

  // Re-render one row from whatever the instance currently knows about the peer
  // (a real SFU participant, a chain-only member, or neither). Reading the
  // participant crosses the manager proxy, so swallow a transient failure
  // rather than dropping the row — or leaking an unhandled rejection.
  private async refreshRow(peerId: PeerId): Promise<void> {
    if(this.destroyed) return;
    const instance = this.instance;
    const generation = this.instanceGeneration;
    try {
      const participant = await instance.getParticipantByPeerId(peerId);
      if(this.destroyed || this.instance !== instance || this.instanceGeneration !== generation) return;
      if(participant) {
        this.updateParticipant(participant);
      } else if(this.sortedList.has(peerId)) {
        this.sortedList.delete(peerId);
      }
    } catch(err) {
      if(!this.destroyed && this.instance === instance && this.instanceGeneration === generation) {
        console.error('refresh group call participant row failed', err);
      }
    }
  }

  private updateParticipant(participant: GroupCallParticipant) {
    if(this.destroyed) return;
    const peerId = getPeerId(participant.peer);
    const mutationGeneration = ++this.rowMutationGeneration;
    this.rowMutationGenerations.set(peerId, mutationGeneration);
    const has = this.sortedList.has(peerId);
    if(participant.pFlags.left) {
      // A `left` update says the SFU dropped them, NOT that they lost the call
      // key — that is the blockchain's word, and it is the one that matters
      // here. Deleting the row on the server's say-so is how a disclosed
      // chain-only key holder used to be erased for good: `getParticipantByPeerId`
      // falls back to the synthetic, but nothing re-added the row afterwards,
      // because publishMembersWithAccess only dispatches when the chain-only
      // SET changes and the set is unchanged by a roster push.
      if(this.instance.isMemberWithAccess(peerId)) {
        this.refreshRow(peerId);
        return;
      }

      if(has) {
        this.sortedList.delete(peerId);
      }

      return;
    }

    if(!has) {
      this.runListMutation(peerId, mutationGeneration, 'add', this.sortedList.add(peerId));
      return;
    }

    this.runListMutation(peerId, mutationGeneration, 'update', this.sortedList.update(peerId));
  }

  private runListMutation(
    peerId: PeerId,
    generation: number,
    operation: 'add' | 'update',
    result: MaybePromise<void>
  ) {
    void Promise.resolve(result).catch((err) => {
      if(this.destroyed || this.rowMutationGenerations.get(peerId) !== generation) return;
      if(operation === 'add' && this.sortedList.has(peerId)) {
        // SortedList registers the element before its async index lookup. If
        // that lookup fails, remove the half-created row so a later update can
        // retry from a clean state.
        this.sortedList.delete(peerId, true);
      }
      console.error(`group call participant row ${operation} failed`, err);
    });
  }

  public async setInstance(instance: GroupCallInstance) {
    const generation = ++this.instanceGeneration;
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
    try {
      const participants = await instance.participants;
      if(this.destroyed || this.instance !== instance || this.instanceGeneration !== generation) return;
      participants.forEach((participant) => {
        this.updateParticipant(participant);
      });

      // The popup can open mid-call, after reconciliation already ran.
      instance.memberWithAccessPeerIds.forEach((peerId) => this.refreshRow(peerId));
    } catch(err) {
      if(!this.destroyed && this.instance === instance && this.instanceGeneration === generation) {
        console.error('load group call participants failed', err);
      }
    }
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    ++this.instanceGeneration;
    this.rowMutationGenerations.clear();
    this.contextMenu.destroy();
    this.scrollable.destroy();
    this.sortedList.destroy();
    this.groupCallParticipantsVideo.destroy();
  }
}
