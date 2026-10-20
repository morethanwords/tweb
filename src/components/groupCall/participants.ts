import {GROUP_CALL_POPUP_KIND} from '.';
import {getOverlayRoot} from '@helpers/appWindow';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import {addFullScreenListener, isFullScreen} from '@helpers/dom/fullScreen';
import ListenerSetter from '@helpers/listenerSetter';
import safeAssign from '@helpers/object/safeAssign';
import positionMenu from '@helpers/positionMenu';
import ScrollableLoader from '@helpers/scrollableLoader';
import {GroupCallParticipant} from '@layer';
import {AppManagers} from '@lib/managers';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import GroupCallInstance from '@lib/calls/groupCallInstance';
import rootScope from '@lib/rootScope';
import {
  ButtonMenuItemOptionsVerifiable
} from '@components/buttonMenu';
import confirmationPopup from '@components/confirmationPopup';
import PeerTitle from '@components/peerTitle';
import PopupElement from '@components/popups/indexTsx';
import Scrollable from '@components/scrollable';
import GroupCallParticipantsList from '@components/groupCall/participantsList';
import createGroupCallParticipantsSection, {GroupCallParticipantsActions} from '@components/groupCall/participantsSection';
import {getMiddleware} from '@helpers/middleware';
import type GroupCallVideoGrid from '@components/groupCall/videoGrid';
import type {GroupCallVideoTileType} from '@components/groupCall/videoTile';
import {toastNew} from '@components/toast';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {showCallAccount} from '@lib/calls/callAccount';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';

export class GroupCallParticipantContextMenu {
  private buttons: ButtonMenuItemOptionsVerifiable[];
  private chatId: ChatId;
  private targetPeerId: PeerId;
  private participant: GroupCallParticipant;
  private instance: GroupCallInstance;
  private videoGrid: GroupCallVideoGrid;
  private canManageCall: boolean;
  private canRemove: boolean;
  private managers: AppManagers;
  private listenerSetter = new ListenerSetter();
  private contextMenus: ReturnType<typeof createContextMenu>[];
  private destroyed = false;
  private openGeneration = 0;
  private removeParentCleanup: () => void;

  /**
   * tdesktop's members context menu (calls_group_members.cpp, createRowContextMenu), opened on a
   * row of the list and on a video tile alike.
   */
  constructor(options: {
    listenerSetter: ListenerSetter,
    onContextElement: HTMLElement | HTMLElement[],
    managers: AppManagers,
    instance: GroupCallInstance,
    videoGrid?: GroupCallVideoGrid
  }) {
    const isSelf = () => !!this.participant.pFlags.self;
    // muted by an admin, as opposed to by themselves
    const isForceMuted = () => !!this.participant.pFlags.muted && !this.participant.pFlags.can_self_unmute;
    const isMutedForMe = () => !!this.participant.pFlags.muted_by_you;
    const getTile = (type: GroupCallVideoTileType) => this.videoGrid?.getPeerTiles(this.targetPeerId)?.get(type);
    // a lone video has nothing to be pinned over
    const canPin = (type: GroupCallVideoTileType, pinned: boolean) => {
      const tile = getTile(type);
      return !!tile && this.videoGrid.count > 1 && (this.videoGrid.pinnedTile === tile) === pinned;
    };
    const togglePin = (type: GroupCallVideoTileType) => {
      const tile = getTile(type);
      if(!tile) return;
      if(this.videoGrid.pinnedTile === tile) this.instance.unpinAll();
      else this.instance.pinSource(tile.source);
    };

    this.buttons = [{
      icon: 'pin',
      text: 'VoiceChat.PinVideo',
      verify: () => canPin('video', false),
      onClick: () => togglePin('video')
    }, {
      icon: 'unpin',
      text: 'VoiceChat.UnpinVideo',
      verify: () => canPin('video', true),
      onClick: () => togglePin('video')
    }, {
      icon: 'pin',
      text: 'VoiceChat.PinScreencast',
      verify: () => canPin('presentation', false),
      onClick: () => togglePin('presentation')
    }, {
      icon: 'unpin',
      text: 'VoiceChat.UnpinScreencast',
      verify: () => canPin('presentation', true),
      onClick: () => togglePin('presentation')
    }, {
      // whichever applies first: an admin lets the muted speak, anyone can undo their own mute,
      // an admin mutes for everyone, anyone else for themselves
      icon: 'user_allow_speak',
      text: 'VoiceChat.UnmutePeer',
      verify: () => !isSelf() && this.canManageCall && isForceMuted(),
      onClick: () => this.toggleParticipantMuted(false)
    }, {
      icon: 'gc_microphone',
      text: 'VoiceChat.UnmuteForMe',
      verify: () => !isSelf() && !(this.canManageCall && isForceMuted()) && isMutedForMe(),
      onClick: () => this.toggleParticipantMuted(false)
    }, {
      icon: 'gc_microphoneoff',
      text: 'VoiceChat.MutePeer',
      verify: () => !isSelf() && this.canManageCall && !isForceMuted() && !isMutedForMe(),
      onClick: () => this.toggleParticipantMuted(true)
    }, {
      icon: 'gc_microphoneoff',
      text: 'VoiceChat.MuteForMe',
      verify: () => !isSelf() && !this.canManageCall && !isMutedForMe(),
      onClick: () => this.toggleParticipantMuted(true)
    }, {
      icon: 'hand',
      text: 'VoiceChat.CancelSpeakRequest',
      verify: () => isSelf() && this.participant.raise_hand_rating !== undefined,
      onClick: () => this.cancelRaiseHand()
    }, {
      icon: 'user',
      text: 'VoiceChat.OpenProfile',
      verify: () => !isSelf(),
      onClick: () => this.openPeer(true)
    }, {
      icon: 'message',
      text: 'SendMessage',
      verify: () => !isSelf() && this.targetPeerId.isUser(),
      onClick: () => this.openPeer(false)
    }, {
      icon: 'deleteuser',
      className: 'danger',
      text: 'VoiceChat.RemovePeer',
      verify: () => !isSelf() && this.canRemove,
      onClick: () => {
        void this.removeParticipant();
      }
    }];

    const {listenerSetter} = this;
    this.removeParentCleanup = options.listenerSetter.addCleanup(() => this.destroy());
    this.managers = options.managers;
    this.instance = options.instance;
    this.videoGrid = options.videoGrid;
    this.chatId = this.instance.chatId;

    const elements = Array.isArray(options.onContextElement) ? options.onContextElement : [options.onContextElement];
    this.contextMenus = elements.map((listenTo) => createContextMenu({
      buttons: this.buttons,
      listenTo,
      listenerSetter,
      // a row of the list, or a video tile: both carry the participant's peer id
      findElement: (e) => findUpClassName(e.target, 'group-call-participant') || findUpClassName(e.target, 'group-call-video-tile'),
      resolveAppendTo: () => isFullScreen() ?
        PopupElement.getPopups(GROUP_CALL_POPUP_KIND)[0]?.container ?? getOverlayRoot() :
        getOverlayRoot(),
      onOpen: async(_e, target) => {
        const generation = ++this.openGeneration;
        const peerId = target.dataset.peerId.toPeerId();
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
        if(!participant) return false;

        const [canManageCall, canRemove] = await Promise.all([this.canManage(), this.canRemoveParticipant(peerId)]);
        if(this.destroyed || this.openGeneration !== generation) return false;
        this.targetPeerId = peerId;
        this.participant = participant;
        this.canManageCall = canManageCall;
        this.canRemove = canRemove;
      },
      onElementReady: (element) => {
        element.classList.add('group-call-participant-menu', 'night');
      },
      position: (e, element) => {
        positionMenu('touches' in e ? e.touches[0] : e, element, 'right');
      },
      reopenOnTrigger: true,
      cancelOnOpenFalse: true
    }));

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

  private isConferenceCreator() {
    const {groupCall} = this.instance;
    return groupCall?._ === 'groupCall' && !!groupCall.pFlags.creator;
  }

  /** A conference has no chat behind it: there its creator runs the call (tdesktop canManage). */
  private async canManage() {
    if(this.instance.e2e) {
      return this.isConferenceCreator();
    }

    return this.managers.appChatsManager.hasRights(this.chatId, 'manage_call');
  }

  private async canRemoveParticipant(peerId: PeerId) {
    if(this.instance.e2e) {
      return peerId.isUser() && this.isConferenceCreator();
    }

    // the chat speaking as itself is not someone to remove from it
    return peerId !== this.chatId.toPeerId(true) && this.managers.appChatsManager.hasRights(this.chatId, 'ban_users');
  }

  private closeContextMenu() {
    ++this.openGeneration;
    this.contextMenus.forEach((contextMenu) => contextMenu.close());
  }

  /**
   * Their profile, or the chat with them - on the call's account; the call carries on behind its plate
   * either way.
   */
  private async openPeer(profile: boolean) {
    const peerId = this.targetPeerId;
    PopupElement.getPopups(GROUP_CALL_POPUP_KIND)[0]?.hide();

    await showCallAccount(this.instance.accountNumber);
    const opened = hotReloadGuard.appImManager.setInnerPeer({peerId});
    if(profile) {
      void Promise.resolve(opened).then(() => {
        hotReloadGuard.appSidebarRight.toggleSidebar(true);
      }).catch((err) => {
        console.error('open group call participant profile failed', err);
      });
    }
  }

  private cancelRaiseHand() {
    return this.instance.changeRaiseHand(false).catch((err) => {
      if(this.destroyed) return;
      console.error('lower group call hand failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    });
  }

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
    const managers = bindManagersToSession(this.managers);
    const {chatId, instance} = this;
    const peerId = this.targetPeerId;
    const generation = this.openGeneration;
    const isConference = !!instance.e2e;
    let isBroadcast: boolean;
    try {
      isBroadcast = !isConference && await managers.appChatsManager.isBroadcast(chatId);
    } catch(err) {
      if(!this.destroyed && this.openGeneration === generation) {
        console.error('load remove-participant confirmation failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
      return;
    }
    if(this.destroyed || this.openGeneration !== generation) return;

    try {
      const {accountNumber} = instance;
      await confirmationPopup({
        peerId,
        accountNumber,
        title: new PeerTitle({peerId, accountNumber}).element,
        descriptionLangKey: isConference ?
          'VoiceChat.RemovePeer.Confirm.Call' :
          (isBroadcast ? 'VoiceChat.RemovePeer.Confirm.Channel' : 'VoiceChat.RemovePeer.Confirm'),
        descriptionLangArgs: [new PeerTitle({peerId, accountNumber}).element],
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
      if(isConference) {
        await instance.kickConferenceParticipant(peerId);
      } else {
        await managers.appChatsManager.kickFromChat(chatId, peerId);
      }
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
    this.contextMenus.forEach((contextMenu) => contextMenu.destroy());
    this.removeParentCleanup();
    this.listenerSetter.removeAll();
  }
};

export default class GroupCallParticipantsElement {
  private container: HTMLDivElement;
  private sortedList: GroupCallParticipantsList;
  private instance: GroupCallInstance;
  private listenerSetter: ListenerSetter;
  private contextMenu: GroupCallParticipantContextMenu;
  private managers: AppManagers;
  private scrollable: Scrollable;
  private destroyed = false;
  private instanceGeneration = 0;
  private rowMutationGeneration = 0;
  private rowMutationGenerations = new Map<PeerId, number>();
  private releaseSpeaking: () => void;
  private middlewareHelper = getMiddleware();

  constructor(options: {
    appendTo: HTMLElement,
    instance: GroupCallInstance,
    listenerSetter: ListenerSetter,
    managers: AppManagers,
    videoList?: HTMLElement,
    videoGrid?: GroupCallVideoGrid,
    /** What a conference offers under its last participant. */
    actions?: GroupCallParticipantsActions
  }) {
    safeAssign(this, options);

    const className = 'group-call-participants';

    const scrollable = this.scrollable = new Scrollable(undefined);
    scrollable.container.classList.add(className + '-scrollable');
    // `scrolled-start` drives the fade at the top edge
    scrollable.attachBorderListeners();

    const container = this.container = document.createElement('div');
    container.classList.add(className);

    const sortedList = this.sortedList = new GroupCallParticipantsList(this.instance);

    const {instance, listenerSetter} = this;
    // the rows, and the video tiles wherever the grid has put them
    this.contextMenu = new GroupCallParticipantContextMenu({
      ...options,
      onContextElement: [sortedList.list, options.videoGrid?.stage, options.videoGrid?.list].filter(Boolean),
      listenerSetter,
      instance
    });

    // the video grid's tiles for this column sit above the rows and scroll with them
    if(options.videoList) {
      scrollable.append(options.videoList);
    }

    scrollable.append(createGroupCallParticipantsSection({
      list: sortedList.list,
      actions: options.actions,
      middleware: this.middlewareHelper.get()
    }));
    container.append(scrollable.container);

    options.appendTo.append(container);

    listenerSetter.add(rootScope)('group_call_participant', ({groupCallId, participant}) => {
      if(this.instance.id === groupCallId) {
        this.updateParticipant(participant);
      }
    });

    listenerSetter.add(instance)('speaking', ({peerId}) => {
      if(!this.destroyed) {
        this.sortedList.refreshState(peerId);
      }
    });
    // Audio levels are only sampled while the list is on screen.
    this.releaseSpeaking = instance.watchSpeaking();

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
  // (a real SFU participant, a chain-only member, our stand-in, or neither). Reading the
  // participant crosses the manager proxy, so swallow a transient failure
  // rather than dropping the row — or leaking an unhandled rejection.
  private async refreshRow(peerId: PeerId): Promise<void> {
    if(this.destroyed) return;
    const instance = this.instance;
    const generation = this.instanceGeneration;
    try {
      const participant = await instance.getParticipantRow(peerId);
      if(this.destroyed || this.instance !== instance || this.instanceGeneration !== generation) return;
      if(participant) {
        await this.updateParticipant(participant);
      } else if(this.sortedList.has(peerId)) {
        this.sortedList.delete(peerId);
      }
    } catch(err) {
      if(!this.destroyed && this.instance === instance && this.instanceGeneration === generation) {
        console.error('refresh group call participant row failed', err);
      }
    }
  }

  /** Resolves once its row is in place. */
  private updateParticipant(participant: GroupCallParticipant): Promise<void> {
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

    this.sortedList.setParticipant(peerId, participant);
    if(!has) {
      return this.runListMutation(peerId, mutationGeneration, 'add', this.sortedList.add(peerId));
    }

    return this.runListMutation(peerId, mutationGeneration, 'update', this.sortedList.update(peerId));
  }

  private runListMutation(
    peerId: PeerId,
    generation: number,
    operation: 'add' | 'update',
    result: MaybePromise<void>
  ) {
    return Promise.resolve(result).catch((err) => {
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
    // the rows already in the call just appear, as the chat list's first page does
    const unblockGlide = this.sortedList.blockGlide();
    try {
      const participants = await instance.participants;
      if(this.destroyed || this.instance !== instance || this.instanceGeneration !== generation) return;
      const placed: Promise<void>[] = [];
      participants.forEach((participant) => {
        placed.push(this.updateParticipant(participant));
      });

      // The popup can open mid-call, after reconciliation already ran.
      instance.memberWithAccessPeerIds.forEach((peerId) => placed.push(this.refreshRow(peerId)));
      // and we are on the list before the server lists us (getParticipantRow)
      if(!participants.has(instance.selfPeerId)) placed.push(this.refreshRow(instance.selfPeerId));
      await Promise.all(placed);
    } catch(err) {
      if(!this.destroyed && this.instance === instance && this.instanceGeneration === generation) {
        console.error('load group call participants failed', err);
      }
    } finally {
      unblockGlide();
    }
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    ++this.instanceGeneration;
    this.releaseSpeaking?.();
    this.rowMutationGenerations.clear();
    this.contextMenu.destroy();
    this.scrollable.destroy();
    this.sortedList.destroy();
    this.middlewareHelper.destroy();
  }
}
