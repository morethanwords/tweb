import safeReplaceObject from '@helpers/object/safeReplaceObject';
import deepEqual from '@helpers/object/deepEqual';
import makeError from '@helpers/makeError';
import Modes from '@config/modes';
import {
  Chat,
  ChatFull,
  ChatParticipant,
  ChannelParticipant,
  CommunitiesParticipantJoinedChats,
  CommunitiesPeerLinkRequests,
  CommunityPeer,
  CommunityPeerRequest,
  Dialog as MTDialog,
  PeerNotifySettings,
  Update
} from '@layer';
import isCollapsedCommunity from '@appManagers/utils/communities/isCollapsedCommunity';
import {AppManager} from '@appManagers/manager';
import type {Dialog, MyMessage} from '@appManagers/appMessagesManager';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import type {REAL_FOLDER_ID} from '@appManagers/constants';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import filterParticipantsByQuery from '@appManagers/utils/chats/filterParticipantsByQuery';
import {
  type CommunityAddMode,
  getCommunityAddMode,
  rightsWithCommunityAddMode
} from '@appManagers/utils/communities/communityAddMode';
import type {ChatRights} from '@appManagers/appChatsManager';
import {
  isCommunityLinkedPeerJoined
} from '@appManagers/utils/communities/getCommunityLinkedPeerKind';
import isCommunityAdminCandidate
from '@appManagers/utils/communities/isAdminCandidate';
import isCommunityChat from '@appManagers/utils/communities/isCommunity';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import CoalescedRefresh from '@appManagers/utils/coalescedRefresh';

export type CommunityPermission = Extract<
  ChatRights,
  'change_info' | 'ban_users' | 'manage_linked_peers' | 'add_admins'
>;

const COMMUNITY_EDIT_PERMISSIONS: readonly CommunityPermission[] = [
  'change_info',
  'manage_linked_peers',
  'ban_users',
  'add_admins'
];

export type CommunityPeerLinkAction = 'visible' | 'hidden' | 'deleted';

export type CommunityPeerLinkResult = {
  status: 'linked' | 'unlinked' | 'requested'
};

export type CommunityPeerLinkRequestsState = {
  loaded: boolean,
  totalCount: number,
  requests: CommunityPeerRequest[],
  nextOffset?: string
};

type OptimisticApprovedLinkedPeers = {
  fullCommunity: ChatFull.communityFull,
  previousLinkedPeers: CommunityPeer[],
  optimisticLinkedPeers: CommunityPeer[]
};

export type CommunityParticipantCandidatesOffset = {
  contacts: number,
  recent: number
};

export type CommunityParticipantCandidatesPage = {
  participantIds: PeerId[],
  nextOffset: CommunityParticipantCandidatesOffset,
  isEnd: boolean
};

export type CommunityParticipantCandidateKind = 'admin' | 'ban';

export type CommunityDialog = {
  _: 'communityDialog',
  communityId: ChatId,
  pFlags: Partial<{
    pinned?: true
  }>,
  notifySettings: PeerNotifySettings,
  muted: boolean,
  dialogs: Dialog[],
  joinedDialogs: Dialog[],
  lastDialogs: Dialog[],
  mutedPeerIds: PeerId[],
  sortDate: number,
  pinnedOrderIndex: number,
  pinnedOrderLength: number,
  unreadCount: number,
  unreadMessagesCount: number,
  unreadUnmutedCount: number,
  unreadMarked: boolean,
  unreadMentionsCount: number,
  unreadReactionsCount: number,
  unreadPollVotesCount: number
};

type KickedCountMutation = {
  baseline: number,
  expected: number
};

export type FullCommunityRequestState = {
  communityId: ChatId,
  generation: number
};

export class AppCommunitiesManager extends AppManager {
  private linkedPeerIds: Map<ChatId, Set<PeerId>> = new Map();

  private communityDialogs: {[communityId: ChatId]: MTDialog.dialogCommunity} = {};
  private communityNotifyOverrides = new Map<
    ChatId,
    PeerNotifySettings
  >();
  private computedDialogs: {[communityId: ChatId]: CommunityDialog} = {};
  private mirroredCommunityDialogs: {[communityId: ChatId]: CommunityDialog} = {};
  private joinedCommunityIds: ChatId[] | null = null;
  private joinedCommunitiesAuthoritative = false;
  private evictedCommunityIds: Set<ChatId> = new Set();
  private peerLinkRequests: Map<ChatId, CommunityPeerLinkRequestsState> = new Map();
  private peerLinkRequestsGeneration: Map<ChatId, number> = new Map();
  private communityMutationQueues: Map<ChatId, Promise<void>> = new Map();
  private communityDataGeneration: Map<ChatId, number> = new Map();
  private dataGenerationCounter = 0;
  private dataGenerationFloor = 0;
  private joinedCommunitiesGeneration = 0;
  private linkedPeersBatchDepth = 0;
  private pendingLinkedCommunities: Set<ChatId> = new Set();
  private pendingCommunityDialogRecomputes: Set<ChatId> = new Set();
  private scheduledCommunityDialogRecomputes: Set<ChatId> = new Set();
  private managersReady = false;
  private joinedCommunitiesRefresh = new CoalescedRefresh<undefined>();
  private communityFullRefresh = new CoalescedRefresh<ChatId>();
  private kickedCountMutations: Map<ChatId, KickedCountMutation> = new Map();

  protected after() {
    this.clear();

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateChannel: this.onUpdateChannel,
      updateChannelParticipant: this.onUpdateChannelParticipant,
      updateChatDefaultBannedRights: this.onUpdateChatDefaultBannedRights
    });

    this.rootScope.addEventListener('dialogs_multiupdate', (dialogs) => {
      for(const peerId of dialogs.keys()) {
        this.recomputeCommunityDialogByPeer(peerId);
      }
    });
    this.rootScope.addEventListener('dialog_unread', ({peerId}) => {
      this.recomputeCommunityDialogByPeer(peerId);
    });
    this.rootScope.addEventListener('dialog_drop', (dialog) => {
      this.recomputeCommunityDialogByPeer(dialog.peerId);
    });
    this.rootScope.addEventListener('dialog_draft', ({peerId}) => {
      this.recomputeCommunityDialogByPeer(peerId);
    });
    this.rootScope.addEventListener('dialog_notify_settings', (dialog) => {
      this.recomputeCommunityDialogByPeer(dialog.peerId);
    });
    this.rootScope.addEventListener('chat_toggle_forum', ({chatId}) => {
      this.recomputeCommunityDialogByPeer(chatId.toPeerId(true));
    });
    this.rootScope.addEventListener('history_append', ({message}) => {
      this.processCommunityServiceMessage(message);
      this.recomputeCommunityDialogByPeer(message.peerId);
    });
    this.rootScope.addEventListener('history_update', ({message}) => {
      this.processCommunityServiceMessage(message);
      this.recomputeCommunityDialogByPeer(message.peerId);
    });
    this.rootScope.addEventListener('history_multiappend', (message) => {
      this.processCommunityServiceMessage(message);
      this.recomputeCommunityDialogByPeer(message.peerId);
    });
    this.rootScope.addEventListener('state_cleared', this.clear);
    this.rootScope.addEventListener('state_synchronized', () => {
      this.restorePersistentState().then((restored) => {
        if(restored) {
          this.refreshJoinedCommunities();
        }
      });
    });
    this.rootScope.addEventListener('user_auth', () => {
      this.refreshJoinedCommunities();
    });
    this.rootScope.addEventListener('managers_ready', this.onManagersReady);

    return this.restorePersistentState();
  }

  private restorePersistentState() {
    const generationFloor = this.dataGenerationFloor;
    return this.appStateManager.getState().then((state) => {
      if(generationFloor !== this.dataGenerationFloor) {
        return false;
      }

      this.communityDialogs = {...state.communityDialogs};
      this.joinedCommunityIds = state.joinedCommunityIds?.map((communityId) => communityId.toChatId()) ?? null;
      this.joinedCommunitiesAuthoritative = false;
      this.rebuildLinkedPeerIdsFromCache();
      this.syncNeededCommunities();
      this.recomputeAllCommunityDialogs();
      return true;
    });
  }

  public clear = () => {
    this.invalidateAllCommunityData();
    ++this.joinedCommunitiesGeneration;
    for(const communityId of this.linkedPeerIds.keys()) {
      this.peersStorage.requestPeersForKey([], this.getLinkedPeersStorageKey(communityId));
    }
    this.peersStorage.requestPeersForKey([], 'community');

    this.appProfileManager.clearCachedCommunityFulls();
    this.linkedPeerIds = new Map();
    this.communityDialogs = {};
    this.communityNotifyOverrides = new Map();
    this.computedDialogs = {};
    this.mirroredCommunityDialogs = {};
    this.joinedCommunityIds = null;
    this.joinedCommunitiesAuthoritative = false;
    this.evictedCommunityIds = new Set();
    this.peerLinkRequests = new Map();
    this.peerLinkRequestsGeneration = new Map();
    this.communityMutationQueues = new Map();
    this.linkedPeersBatchDepth = 0;
    this.pendingLinkedCommunities = new Set();
    this.pendingCommunityDialogRecomputes = new Set();
    this.scheduledCommunityDialogRecomputes = new Set();
    this.joinedCommunitiesRefresh.clear();
    this.communityFullRefresh.clear();
    this.kickedCountMutations = new Map();
    this.mirrorAllCommunityState();
  };

  private onManagersReady = () => {
    this.managersReady = true;
    for(const communityId in this.communityDialogs) {
      const dialog = this.communityDialogs[communityId];
      this.appNotificationsManager.savePeerSettings({
        communityId: dialog.community_id as ChatId,
        settings: dialog.notify_settings
      });
    }

    this.recomputeAllCommunityDialogs();
    this.refreshJoinedCommunities();
  };

  private refreshJoinedCommunities(rerunIfPending = false) {
    if(
      !this.managersReady ||
      !this.rootScope.myId
    ) {
      return;
    }
    return this.joinedCommunitiesRefresh.run(
      undefined,
      (): Promise<void> => Promise.resolve(
        this.getJoinedCommunities(true)
      ).then((): void => undefined),
      rerunIfPending
    );
  }

  private refreshCommunityFull(communityId: ChatId, rerunIfPending = false) {
    communityId = communityId.toChatId();
    const community = this.appChatsManager.getChat(communityId);
    if(
      !this.managersReady ||
      !this.rootScope.myId ||
      !this.isCommunityMembershipCurrent(communityId) ||
      community?._ !== 'community' ||
      community.pFlags.left
    ) {
      return;
    }

    return this.communityFullRefresh.run(communityId, () => {
      const generation = this.getCommunityDataGeneration(communityId);
      return Promise.resolve(
        this.appProfileManager.getChatFull(communityId, true)
      ).then((): undefined => undefined).catch((error) => {
        const fullCommunity = this.appProfileManager.getCachedFullChat(communityId);
        if(
          this.isCommunityDataCurrent(communityId, generation) &&
          fullCommunity?._ === 'communityFull'
        ) {
          this.appProfileManager.expireCachedFullChat(communityId);
        }
        throw error;
      });
    }, rerunIfPending);
  }

  private mirrorCommunityDialog(communityId: ChatId) {
    communityId = communityId.toChatId();
    const dialog = this.computedDialogs[communityId];
    const value = dialog === undefined ? undefined : structuredClone(dialog);
    if(deepEqual(this.mirroredCommunityDialogs[communityId], value)) {
      return;
    }
    if(value === undefined) {
      delete this.mirroredCommunityDialogs[communityId];
    } else {
      this.mirroredCommunityDialogs[communityId] = value;
    }
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'communityDialogs',
      key: '' + communityId,
      value,
      accountNumber: this.getAccountNumber()
    });
  }

  private mirrorCommunityPeerLinkRequests(communityId: ChatId) {
    communityId = communityId.toChatId();
    const state = this.peerLinkRequests.get(communityId);
    MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
      name: 'communityPeerLinkRequests',
      key: '' + communityId,
      value: state === undefined ? undefined : structuredClone(state),
      accountNumber: this.getAccountNumber()
    });
  }

  private mirrorAllCommunityState() {
    const port = MTProtoMessagePort.getInstance<false>();
    const accountNumber = this.getAccountNumber();
    const communityDialogs = this.getCommunityDialogsMirror();
    port.invokeVoid('mirror', {
      name: 'communityDialogs',
      value: communityDialogs,
      accountNumber
    });
    this.mirroredCommunityDialogs = communityDialogs;
    port.invokeVoid('mirror', {
      name: 'communityPeerLinkRequests',
      value: this.getCommunityPeerLinkRequestsMirror(),
      accountNumber
    });
  }

  public getCommunityDialogsMirror(): {[communityId: ChatId]: CommunityDialog} {
    return structuredClone(this.computedDialogs);
  }

  public getCommunityPeerLinkRequestsMirror(): {
    [communityId: ChatId]: CommunityPeerLinkRequestsState
  } {
    return structuredClone(Object.fromEntries(this.peerLinkRequests));
  }

  public isCommunity(communityId: ChatId) {
    communityId = communityId.toChatId();
    return this.appChatsManager.isCommunity(communityId) ||
      !!this.communityDialogs[communityId] ||
      this.appProfileManager.getCachedFullChat(communityId)?._ === 'communityFull' ||
      !!this.joinedCommunityIds?.includes(communityId);
  }

  public hasRights(
    communityId: ChatId,
    permission: CommunityPermission
  ) {
    if(!this.isCommunityMembershipCurrent(communityId)) {
      return false;
    }

    return this.appChatsManager.hasRights(communityId, permission);
  }

  public canEditCommunity(communityId: ChatId) {
    if(!this.isCommunityMembershipCurrent(communityId)) {
      return false;
    }

    return COMMUNITY_EDIT_PERMISSIONS.some((permission) => {
      return this.appChatsManager.hasRights(communityId, permission);
    });
  }

  public canManageLinkedPeers(communityId: ChatId) {
    return this.hasRights(communityId, 'manage_linked_peers');
  }

  public canSuggestPeers(communityId: ChatId) {
    if(!this.isCommunityMembershipCurrent(communityId)) {
      return false;
    }

    const community = this.appChatsManager.getChat(communityId);
    return community?._ === 'community' &&
      !community.pFlags.left &&
      (
        this.canManageLinkedPeers(communityId) ||
        !community.default_banned_rights?.pFlags.manage_linked_peers
      );
  }

  private getTrackedCommunityIds() {
    const communityIds = new Set<ChatId>();
    const addObjectKeys = (value: object) => {
      for(const communityId of Object.keys(value)) {
        communityIds.add(communityId.toChatId());
      }
    };

    addObjectKeys(this.communityDialogs);
    addObjectKeys(this.computedDialogs);
    for(const fullChat of Object.values(this.appProfileManager.getCachedFullChats())) {
      if(fullChat._ === 'communityFull') {
        communityIds.add(fullChat.id.toChatId());
      }
    }
    for(const communityId of this.linkedPeerIds.keys()) {
      communityIds.add(communityId.toChatId());
    }
    for(const communityId of this.peerLinkRequests.keys()) {
      communityIds.add(communityId.toChatId());
    }
    for(const community of Object.values(this.appChatsManager.getChats()).filter(isCommunityChat)) {
      communityIds.add(community.id.toChatId());
    }

    return communityIds;
  }

  private saveJoinedCommunityIds(
    communityIds: ChatId[],
    previousCommunityIds = this.joinedCommunityIds
  ) {
    const previousIds = new Set(previousCommunityIds || []);
    if(this.joinedCommunitiesAuthoritative) {
      for(const communityId of this.getTrackedCommunityIds()) {
        previousIds.add(communityId);
      }
    }
    const nextCommunityIds = [...new Set(
      communityIds.map((communityId) => communityId.toChatId())
    )];
    for(const communityId of nextCommunityIds) {
      this.evictedCommunityIds.delete(communityId);
    }
    this.joinedCommunityIds = nextCommunityIds;
    this.appStateManager.pushToState('joinedCommunityIds', this.joinedCommunityIds);
    const nextCommunityIdsSet = new Set(nextCommunityIds);
    for(const communityId of previousIds) {
      if(!nextCommunityIdsSet.has(communityId)) {
        this.teardownCommunityState(communityId);
      }
    }
    this.syncNeededCommunities();
    this.recomputeAllCommunityDialogs();
  }

  private noteObservedJoinedCommunity(communityId: ChatId) {
    communityId = communityId.toChatId();
    if(this.evictedCommunityIds.has(communityId)) {
      return;
    }

    const refreshPending = this.joinedCommunitiesRefresh.isPending(undefined);
    if(this.joinedCommunityIds === null) {
      if(refreshPending) {
        this.invalidateJoinedCommunitiesFetch();
      }
      this.refreshJoinedCommunities(refreshPending);
      return;
    }
    if(this.joinedCommunityIds.includes(communityId)) {
      return;
    }

    const previousCommunityIds = this.joinedCommunityIds.slice();
    this.invalidateJoinedCommunitiesFetch();
    this.saveJoinedCommunityIds(
      [...previousCommunityIds, communityId],
      previousCommunityIds
    );
    this.refreshJoinedCommunities(refreshPending);
  }

  private invalidateJoinedCommunitiesFetch() {
    return ++this.joinedCommunitiesGeneration;
  }

  // Generations come from one monotonic counter, so a single number identifies
  // "the state this Community was in when the request started". A full reset
  // raises `dataGenerationFloor` instead of walking every entry — the floor is
  // what covers Communities that never had a generation of their own, whose
  // captured `0` would otherwise keep matching after the reset.
  private getCommunityDataGeneration(communityId: ChatId) {
    return Math.max(
      this.communityDataGeneration.get(communityId.toChatId()) || 0,
      this.dataGenerationFloor
    );
  }

  private invalidateCommunityData(communityId: ChatId) {
    const generation = ++this.dataGenerationCounter;
    this.communityDataGeneration.set(communityId.toChatId(), generation);
    return generation;
  }

  private invalidateAllCommunityData() {
    this.dataGenerationFloor = ++this.dataGenerationCounter;
    this.communityDataGeneration = new Map();
  }

  private isCommunityDataCurrent(communityId: ChatId, generation: number) {
    communityId = communityId.toChatId();
    const community = this.appChatsManager.getChat(communityId);
    return this.isCommunityDataGenerationCurrent(communityId, generation) &&
      this.isCommunityMembershipCurrent(communityId) &&
      community?._ === 'community' &&
      !community.pFlags.left;
  }

  private isCommunityDataGenerationCurrent(
    communityId: ChatId,
    generation: number
  ) {
    return generation === this.getCommunityDataGeneration(communityId.toChatId());
  }

  private isCommunityMembershipCurrent(communityId: ChatId) {
    communityId = communityId.toChatId();
    return !this.evictedCommunityIds.has(communityId) &&
      (
        !this.joinedCommunitiesAuthoritative ||
        !!this.joinedCommunityIds?.includes(communityId)
      );
  }

  public captureFullCommunityRequest(communityId: ChatId): FullCommunityRequestState {
    communityId = communityId.toChatId();
    return {
      communityId,
      generation: this.getCommunityDataGeneration(communityId)
    };
  }

  public isFullCommunityRequestCurrent(state: FullCommunityRequestState) {
    return this.isCommunityDataCurrent(state.communityId, state.generation);
  }

  private assertCommunityDataCurrent(communityId: ChatId) {
    communityId = communityId.toChatId();
    const generation = this.getCommunityDataGeneration(communityId);
    if(!this.isCommunityDataCurrent(communityId, generation)) {
      throw makeError('CHANNEL_INVALID');
    }

    return {communityId, generation};
  }

  private getCachedJoinedCommunities(): Array<Chat.community | Chat.communityForbidden> | null {
    if(this.joinedCommunityIds === null) {
      return null;
    }

    const communities = this.joinedCommunityIds
    .map((communityId) => this.appChatsManager.getChat(communityId))
    .filter(isCommunityChat);
    return communities.length === this.joinedCommunityIds.length ? communities : null;
  }

  public getJoinedCommunities(
    overwrite = false
  ): Promise<Array<Chat.community | Chat.communityForbidden>> {
    if(!this.rootScope.myId) {
      return Promise.resolve([]);
    }

    const cached = this.getCachedJoinedCommunities();
    if(cached && !overwrite) {
      return Promise.resolve(cached);
    }

    const generation = this.joinedCommunitiesGeneration;
    return this.apiManager.invokeApiSingleProcess({
      method: 'communities.getJoinedCommunities',
      options: {overwrite},
      processResult: (result) => {
        const communities = result.chats.filter((chat): chat is Chat.community => {
          return chat._ === 'community' && !chat.pFlags.left;
        });
        if(generation !== this.joinedCommunitiesGeneration) {
          return communities;
        }

        const communityIds = communities.map((community) => community.id.toChatId());
        const previousCommunityIds = this.joinedCommunityIds;
        const readmittedCommunityIds = communityIds.filter((communityId) => {
          return this.evictedCommunityIds.has(communityId);
        });
        this.joinedCommunitiesAuthoritative = true;
        this.joinedCommunityIds = communityIds;
        for(const communityId of communityIds) {
          this.evictedCommunityIds.delete(communityId);
        }
        this.appPeersManager.saveApiPeers(result);
        this.restoreCachedLinkedPeerIds(readmittedCommunityIds);
        this.saveJoinedCommunityIds(communityIds, previousCommunityIds);
        for(const communityId of readmittedCommunityIds) {
          this.refreshCommunityFull(communityId);
        }
        return communities;
      }
    });
  }

  public async createCommunity(options: {
    title: string,
    about?: string,
    peerId: PeerId,
    hidden?: boolean
  }): Promise<ChatId> {
    const generationFloor = this.dataGenerationFloor;
    const updates = await this.apiManager.invokeApi('communities.create', {
      hidden: options.hidden || undefined,
      title: options.title,
      about: options.about || undefined,
      peer: this.appPeersManager.getInputPeerById(options.peerId)
    });
    if(generationFloor !== this.dataGenerationFloor) {
      throw makeError('CHANNEL_INVALID');
    }

    const community = (updates._ === 'updates' || updates._ === 'updatesCombined') ?
      updates.chats.find((chat): chat is Chat.community => chat._ === 'community') :
      undefined;
    if(!community) {
      this.apiUpdatesManager.processUpdateMessage(updates);
      throw makeError('CHANNEL_INVALID');
    }

    const communityId = community.id.toChatId();
    this.noteObservedJoinedCommunity(communityId);

    this.apiUpdatesManager.processUpdateMessage(updates);
    void Promise.resolve(
      this.appProfileManager.getChatFull(communityId, true)
    ).catch(() => {});
    return communityId;
  }

  public async reloadCommunity(communityId: ChatId, overwrite = true): Promise<void> {
    if(!this.rootScope.myId) {
      return;
    }

    communityId = communityId.toChatId();
    await this.getJoinedCommunities(overwrite);
    if(!this.joinedCommunityIds?.includes(communityId)) {
      return;
    }
    await this.appProfileManager.getChatFull(communityId, overwrite);
  }

  private getCachedFullCommunity(communityId: ChatId) {
    const fullChat = this.appProfileManager.getCachedFullChat(communityId.toChatId());
    return fullChat?._ === 'communityFull' ? fullChat : undefined;
  }

  private touchCachedFullCommunity(communityId: ChatId) {
    this.appProfileManager.modifyCachedFullChat<ChatFull.communityFull>(
      communityId.toChatId(),
      () => undefined
    );
  }

  public prepareFullCommunity(fullCommunity: ChatFull.communityFull) {
    const communityId = fullCommunity.id.toChatId();
    const kickedCountMutation = this.kickedCountMutations.get(communityId);
    if(!kickedCountMutation) {
      return;
    }

    const serverKickedCount = fullCommunity.kicked_count ?? 0;
    if(serverKickedCount === kickedCountMutation.expected) {
      this.kickedCountMutations.delete(communityId);
    } else if(serverKickedCount === kickedCountMutation.baseline) {
      fullCommunity.kicked_count = kickedCountMutation.expected;
    } else {
      this.kickedCountMutations.delete(communityId);
    }
  }

  public handleFullCommunityUpdate(fullCommunity: ChatFull.communityFull) {
    const communityId = fullCommunity.id.toChatId();
    this.runLinkedPeersBatch(() => {
      this.reconcileLinkedPeers(communityId, fullCommunity.linked_peers);
      this.reconcilePeerLinkRequestsWithFull(communityId, fullCommunity);
    });
  }

  public getPeerLinkedCommunityId(peerId: PeerId): ChatId {
    let communityId: ChatId;
    if(peerId.isUser()) {
      communityId = this.appUsersManager.getUser(
        peerId.toUserId()
      )?.linked_community_id?.toChatId();
    } else {
      const chat = this.appChatsManager.getChat(peerId.toChatId());
      communityId = chat?._ === 'channel' ?
        chat.linked_community_id?.toChatId() :
        undefined;
    }

    if(communityId) {
      return communityId;
    }

    for(const [linkedCommunityId, peerIds] of this.linkedPeerIds) {
      if(peerIds.has(peerId)) {
        return linkedCommunityId;
      }
    }
  }

  private setPeerLinkedCommunityId(peerId: PeerId, communityId?: ChatId) {
    if(peerId.isUser()) {
      return this.appUsersManager.setLinkedCommunityId(peerId.toUserId(), communityId);
    }

    return this.appChatsManager.setLinkedCommunityId(peerId.toChatId(), communityId);
  }

  private getLinkedPeersStorageKey(communityId: ChatId) {
    return `community_${communityId}` as const;
  }

  private runLinkedPeersBatch<T>(callback: () => T): T {
    ++this.linkedPeersBatchDepth;
    try {
      return callback();
    } finally {
      if(!--this.linkedPeersBatchDepth) {
        this.flushLinkedCommunities();
      }
    }
  }

  private markLinkedCommunityChanged(communityId?: ChatId) {
    if(!communityId) {
      return;
    }

    this.pendingLinkedCommunities.add(communityId.toChatId());
    if(!this.linkedPeersBatchDepth) {
      this.flushLinkedCommunities();
    }
  }

  private flushLinkedCommunities() {
    if(!this.pendingLinkedCommunities.size) {
      return;
    }

    const communityIds = [...this.pendingLinkedCommunities];
    this.pendingLinkedCommunities.clear();
    for(const communityId of communityIds) {
      const linkedPeerIds = this.linkedPeerIds.get(communityId) || new Set<PeerId>();
      this.peersStorage.requestPeersForKey(
        linkedPeerIds,
        this.getLinkedPeersStorageKey(communityId)
      );
      this.recomputeCommunityDialog(communityId);
    }
  }

  public handlePeerLinkedCommunityUpdate({
    peerId,
    previousCommunityId,
    communityId
  }: {
    peerId: PeerId,
    previousCommunityId?: ChatId,
    communityId?: ChatId
  }) {
    previousCommunityId = previousCommunityId?.toChatId();
    communityId = communityId?.toChatId();
    if(
      String(previousCommunityId || '') ===
      String(communityId || '')
    ) {
      return;
    }

    this.runLinkedPeersBatch(() => {
      if(previousCommunityId) {
        const peerIds = this.linkedPeerIds.get(previousCommunityId);
        peerIds?.delete(peerId);
        if(peerIds && !peerIds.size) {
          this.linkedPeerIds.delete(previousCommunityId);
        }
        this.markLinkedCommunityChanged(previousCommunityId);
      }

      if(communityId) {
        let peerIds = this.linkedPeerIds.get(communityId);
        if(!peerIds) {
          peerIds = new Set();
          this.linkedPeerIds.set(communityId, peerIds);
        }
        peerIds.add(peerId);
        this.markLinkedCommunityChanged(communityId);
      }
    });

    if(previousCommunityId) {
      const full = this.getCachedFullCommunity(previousCommunityId);
      if(full) {
        const linkedPeers = full.linked_peers.filter(({peer}) => {
          return this.appPeersManager.getPeerId(peer) !== peerId;
        });
        if(linkedPeers.length !== full.linked_peers.length) {
          full.linked_peers = linkedPeers;
          this.appProfileManager.expireCachedFullChat(previousCommunityId);
          this.touchCachedFullCommunity(previousCommunityId);
        }
        if(this.managersReady) {
          this.refreshCommunityFull(previousCommunityId, true);
        }
      }
    }
    if(communityId && this.getCachedFullCommunity(communityId)) {
      this.appProfileManager.expireCachedFullChat(communityId);
      if(this.managersReady) {
        this.refreshCommunityFull(communityId, true);
      }
    }

    if(
      this.managersReady &&
      peerId.isAnyChat() &&
      String(previousCommunityId || '') !== String(communityId || '')
    ) {
      const dialog = this.dialogsStorage.getDialogOnly(peerId);
      if(dialog) {
        this.rootScope.dispatchEvent('dialog_notify_settings', dialog);
      }
    }
  }

  private recomputeCommunityDialogByPeer(peerId: PeerId) {
    const communityId = this.getPeerLinkedCommunityId(peerId);
    if(
      !communityId ||
      this.scheduledCommunityDialogRecomputes.has(communityId)
    ) {
      return;
    }

    const generationFloor = this.dataGenerationFloor;
    this.scheduledCommunityDialogRecomputes.add(communityId);
    queueMicrotask(() => {
      this.scheduledCommunityDialogRecomputes.delete(communityId);
      if(generationFloor === this.dataGenerationFloor) {
        this.recomputeCommunityDialog(communityId);
      }
    });
  }

  private rebuildLinkedPeerIdsFromCache() {
    const previousCommunityIds = new Set(this.linkedPeerIds.keys());
    const linkedPeerIds: Map<ChatId, Set<PeerId>> = new Map();
    const addPeer = (peerId: PeerId, communityId?: ChatId) => {
      communityId = communityId?.toChatId();
      if(!communityId) {
        return;
      }

      let peerIds = linkedPeerIds.get(communityId);
      if(!peerIds) {
        peerIds = new Set();
        linkedPeerIds.set(communityId, peerIds);
      }
      peerIds.add(peerId);
    };

    for(const userId in this.appUsersManager.getUsers()) {
      const user = this.appUsersManager.getUser(userId.toUserId());
      if(user) {
        addPeer(user.id.toPeerId(false), user.linked_community_id);
      }
    }
    for(const chatId in this.appChatsManager.getChats()) {
      const chat = this.appChatsManager.getChat(chatId.toChatId());
      if(chat?._ === 'channel') {
        addPeer(chat.id.toPeerId(true), chat.linked_community_id);
      }
    }

    this.linkedPeerIds = linkedPeerIds;
    this.runLinkedPeersBatch(() => {
      for(const communityId of new Set([
        ...previousCommunityIds,
        ...linkedPeerIds.keys()
      ])) {
        this.markLinkedCommunityChanged(communityId);
      }
    });
  }

  private collectCachedLinkedPeerIds(communityId: ChatId) {
    const peerIds = new Set<PeerId>();
    for(const userId in this.appUsersManager.getUsers()) {
      const user = this.appUsersManager.getUser(userId.toUserId());
      if(String(user?.linked_community_id) === String(communityId)) {
        peerIds.add(user.id.toPeerId(false));
      }
    }

    for(const chatId in this.appChatsManager.getChats()) {
      const chat = this.appChatsManager.getChat(chatId.toChatId());
      if(chat?._ === 'channel' && String(chat.linked_community_id) === String(communityId)) {
        peerIds.add(chat.id.toPeerId(true));
      }
    }

    return peerIds;
  }

  private restoreCachedLinkedPeerIds(communityIds: ChatId[]) {
    this.runLinkedPeersBatch(() => {
      for(const communityId of communityIds) {
        const peerIds = this.collectCachedLinkedPeerIds(communityId);
        if(!peerIds.size) {
          continue;
        }

        this.linkedPeerIds.set(communityId, peerIds);
        this.markLinkedCommunityChanged(communityId);
      }
    });
  }

  private reconcileLinkedPeers(communityId: ChatId, linkedPeers: CommunityPeer[]) {
    const oldPeerIds = new Set(this.linkedPeerIds.get(communityId));
    for(const peerId of this.collectCachedLinkedPeerIds(communityId)) {
      oldPeerIds.add(peerId);
    }
    const newPeerIds = new Set<PeerId>();

    for(const linkedPeer of linkedPeers) {
      const peerId = this.appPeersManager.getPeerId(linkedPeer.peer);
      if(!peerId) {
        continue;
      }

      newPeerIds.add(peerId);
    }

    this.peersStorage.requestPeersForKey(
      newPeerIds,
      this.getLinkedPeersStorageKey(communityId)
    );

    this.runLinkedPeersBatch(() => {
      for(const peerId of newPeerIds) {
        this.setPeerLinkedCommunityId(peerId, communityId);
      }

      for(const peerId of oldPeerIds) {
        if(
          !newPeerIds.has(peerId) &&
          String(this.getPeerLinkedCommunityId(peerId)) === String(communityId)
        ) {
          this.setPeerLinkedCommunityId(peerId);
        }
      }

      this.linkedPeerIds.set(communityId, newPeerIds);
      this.markLinkedCommunityChanged(communityId);
    });
  }

  private reconcileCachedPeerLink(
    communityId: ChatId,
    peerId: PeerId,
    action: CommunityPeerLinkAction
  ) {
    communityId = communityId.toChatId();
    const fullCommunity = this.getCachedFullCommunity(communityId);
    if(!fullCommunity) {
      return false;
    }

    const linkedPeers = fullCommunity.linked_peers.slice();
    const index = linkedPeers.findIndex((linkedPeer) => {
      return this.appPeersManager.getPeerId(linkedPeer.peer) === peerId;
    });
    if(action === 'deleted') {
      if(index !== -1) {
        linkedPeers.splice(index, 1);
      }
    } else {
      const linkedPeer: CommunityPeer = index === -1 ? {
        _: 'communityPeer',
        pFlags: {},
        peer: this.appPeersManager.getOutputPeer(peerId)
      } : {
        ...linkedPeers[index]
      };
      linkedPeer.visible = action === 'visible';
      if(index === -1) {
        linkedPeers.push(linkedPeer);
      } else {
        linkedPeers[index] = linkedPeer;
      }
    }

    fullCommunity.linked_peers = linkedPeers;
    this.reconcileLinkedPeers(communityId, linkedPeers);
    this.touchCachedFullCommunity(communityId);
    return true;
  }

  private teardownCommunityState(
    communityId: ChatId,
    clearLinkedPeers = false
  ) {
    communityId = communityId.toChatId();
    this.evictedCommunityIds.add(communityId);
    this.invalidateCommunityData(communityId);
    this.invalidateJoinedCommunitiesFetch();
    this.invalidatePeerLinkRequestsFetch(communityId);
    this.communityMutationQueues.delete(communityId);
    this.communityFullRefresh.forget(communityId);
    this.kickedCountMutations.delete(communityId);

    if(this.joinedCommunityIds?.includes(communityId)) {
      this.joinedCommunityIds = this.joinedCommunityIds.filter((id) => id !== communityId);
      this.appStateManager.pushToState('joinedCommunityIds', this.joinedCommunityIds);
    }

    if(this.communityDialogs[communityId]) {
      delete this.communityDialogs[communityId];
      this.appStateManager.pushToState('communityDialogs', {...this.communityDialogs});
    }

    const pinnedOrder = this.dialogsStorage.getPinnedOrders(FOLDER_ID_ALL);
    const pinnedIndex = pinnedOrder.indexOf(communityId.toPeerId(true));
    if(pinnedIndex !== -1) {
      pinnedOrder.splice(pinnedIndex, 1);
      this.dialogsStorage.savePinnedOrders();
    }

    this.appProfileManager.deleteCachedFullChat(communityId);

    this.peerLinkRequests.delete(communityId);
    this.mirrorCommunityPeerLinkRequests(communityId);

    if(clearLinkedPeers) {
      this.clearCommunityPeerLinks(communityId);
    }
    this.linkedPeerIds.delete(communityId);
    this.pendingLinkedCommunities.delete(communityId);
    this.peersStorage.requestPeersForKey(
      new Set<PeerId>(),
      this.getLinkedPeersStorageKey(communityId)
    );

    this.syncNeededCommunities();
    delete this.computedDialogs[communityId];
    this.pendingCommunityDialogRecomputes.delete(communityId);
    this.mirrorCommunityDialog(communityId);
  }

  private clearCommunityPeerLinks(communityId: ChatId) {
    communityId = communityId.toChatId();
    const linkedPeerIds = new Set([
      ...(this.linkedPeerIds.get(communityId) || []),
      ...this.collectCachedLinkedPeerIds(communityId)
    ]);
    this.runLinkedPeersBatch(() => {
      for(const peerId of linkedPeerIds) {
        if(String(this.getPeerLinkedCommunityId(peerId)) === String(communityId)) {
          this.setPeerLinkedCommunityId(peerId);
        }
      }
    });
  }

  public saveCommunityDialog(dialog: MTDialog.dialogCommunity) {
    const communityId = dialog.community_id.toChatId();
    if(this.evictedCommunityIds.has(communityId)) {
      return;
    }
    this.noteObservedJoinedCommunity(communityId);

    const notifyOverride = this.communityNotifyOverrides.get(communityId);
    if(notifyOverride) {
      if(deepEqual(dialog.notify_settings, notifyOverride)) {
        this.communityNotifyOverrides.delete(communityId);
      } else {
        dialog = {
          ...dialog,
          notify_settings: notifyOverride
        };
      }
    }

    const oldDialog = this.communityDialogs[communityId];
    if(oldDialog) {
      safeReplaceObject(oldDialog, dialog);
    } else {
      this.communityDialogs[communityId] = dialog;
    }

    const peerId = communityId.toPeerId(true);
    const pinnedOrder = this.dialogsStorage.getPinnedOrders(FOLDER_ID_ALL);
    const pinnedIndex = pinnedOrder.indexOf(peerId);
    if(dialog.pFlags.pinned && pinnedIndex === -1) {
      pinnedOrder.unshift(peerId);
      this.dialogsStorage.savePinnedOrders();
    } else if(!dialog.pFlags.pinned && pinnedIndex !== -1) {
      pinnedOrder.splice(pinnedIndex, 1);
      this.dialogsStorage.savePinnedOrders();
    }

    this.appStateManager.pushToState('communityDialogs', {...this.communityDialogs});
    this.syncNeededCommunities();
    this.recomputeCommunityDialog(communityId);
  }

  public saveCommunityNotifySettings(
    communityId: ChatId,
    notifySettings: PeerNotifySettings
  ) {
    communityId = communityId.toChatId();
    this.communityNotifyOverrides.set(communityId, notifySettings);
    const dialog = this.communityDialogs[communityId];
    if(dialog) {
      dialog.notify_settings = notifySettings;
      this.appStateManager.pushToState(
        'communityDialogs',
        {...this.communityDialogs}
      );
    }

    this.recomputeCommunityDialog(communityId);
  }

  public getCommunityDialog(communityId: ChatId) {
    return this.computedDialogs[communityId];
  }

  public getCollapsedCommunityPeerIds(folderId?: number) {
    const peerIds = new Set<PeerId>();
    for(const communityIdString in this.computedDialogs) {
      const communityId = +communityIdString as ChatId;
      if(!isCollapsedCommunity(this.appChatsManager.getChat(communityId))) {
        continue;
      }

      for(const dialog of this.computedDialogs[communityId].dialogs) {
        if(folderId === undefined || dialog.folder_id === folderId) {
          peerIds.add(dialog.peerId);
        }
      }
    }

    return [...peerIds];
  }

  public getCommunityDialogsCount() {
    return Object.keys(this.communityDialogs).length;
  }

  public getCommunityPinStateToken(communityId: ChatId) {
    communityId = communityId.toChatId();
    const community = this.appChatsManager.getChat(communityId);
    const sourceDialog = this.communityDialogs[communityId];
    const computedDialog = this.computedDialogs[communityId];
    const pinnedOrder = this.dialogsStorage
    .getPinnedOrders(FOLDER_ID_ALL);
    const pinnedOrderIndex = pinnedOrder.indexOf(
      communityId.toPeerId(true)
    );
    return [
      this.getCommunityDataGeneration(communityId),
      +this.isCommunityMembershipCurrent(communityId),
      community?._ || '',
      community?._ === 'community' ?
        +!!community.pFlags.left :
        '',
      community?._ === 'community' ?
        +!!community.pFlags.collapsed_in_dialogs :
        '',
      sourceDialog ? +!!sourceDialog.pFlags.pinned : '',
      computedDialog ? +!!computedDialog.pFlags.pinned : '',
      pinnedOrderIndex,
      pinnedOrder.length
    ].join(':');
  }

  public captureCommunityPinState() {
    const communityIds = new Set<ChatId>([
      ...Object.values(this.appChatsManager.getChats()).filter(isCommunityChat).map((community) => community.id.toChatId()),
      ...Object.keys(this.communityDialogs)
      .map((communityId) => communityId.toChatId()),
      ...Object.keys(this.computedDialogs)
      .map((communityId) => communityId.toChatId())
    ]);
    return new Map<ChatId, string>(
      [...communityIds].map((communityId) => [
        communityId,
        this.getCommunityPinStateToken(communityId)
      ])
    );
  }

  // The Communities whose local pin state moved on since `snapshot` was taken —
  // a pinned-dialogs response says nothing trustworthy about them anymore.
  public getChangedCommunityIds(
    snapshot: ReadonlyMap<ChatId, string>,
    folderId: REAL_FOLDER_ID = FOLDER_ID_ALL
  ) {
    const changedCommunityIds = new Set<ChatId>();
    if(folderId !== FOLDER_ID_ALL) {
      return changedCommunityIds;
    }

    for(const [communityId, token] of snapshot) {
      if(token !== this.getCommunityPinStateToken(communityId)) {
        changedCommunityIds.add(communityId);
      }
    }

    return changedCommunityIds;
  }

  // Puts those Communities back into a server-derived order, each at the spot
  // the local pin order currently gives it.
  public restoreCommunityPinPositions(
    order: PeerId[],
    changedCommunityIds: ReadonlySet<ChatId>
  ) {
    if(!changedCommunityIds.size) {
      return order.slice();
    }

    const changedPeerIds = new Set(
      [...changedCommunityIds]
      .map((communityId) => communityId.toPeerId(true))
    );
    const reconciledOrder = order.filter((peerId) => {
      return !changedPeerIds.has(peerId);
    });
    const currentOrder = this.dialogsStorage
    .getPinnedOrders(FOLDER_ID_ALL);
    for(const communityId of changedCommunityIds) {
      const peerId = communityId.toPeerId(true);
      const currentIndex = currentOrder.indexOf(peerId);
      if(currentIndex === -1) {
        continue;
      }

      const previousPeerId = currentOrder
      .slice(0, currentIndex)
      .reverse()
      .find((currentPeerId) => reconciledOrder.includes(currentPeerId));
      const nextPeerId = currentOrder
      .slice(currentIndex + 1)
      .find((currentPeerId) => reconciledOrder.includes(currentPeerId));
      const insertIndex = previousPeerId !== undefined ?
        reconciledOrder.indexOf(previousPeerId) + 1 :
        nextPeerId !== undefined ?
          reconciledOrder.indexOf(nextPeerId) :
          Math.min(currentIndex, reconciledOrder.length);
      reconciledOrder.splice(insertIndex, 0, peerId);
    }

    return reconciledOrder;
  }

  private getLinkedPeerIds(communityId: ChatId) {
    return [...(this.linkedPeerIds.get(communityId) || [])];
  }

  private recomputeCommunityDialog(communityId: ChatId) {
    communityId = communityId.toChatId();
    if(!this.managersReady) {
      this.pendingCommunityDialogRecomputes.add(communityId);
      return;
    }
    this.pendingCommunityDialogRecomputes.delete(communityId);

    const community = this.appChatsManager.getChat(communityId);
    const sourceDialog = this.communityDialogs[communityId];
    const isJoined = this.joinedCommunityIds === null ||
      this.joinedCommunityIds.includes(communityId);
    const canHaveDialog = community?._ === 'community' &&
      !community.pFlags.left &&
      !this.evictedCommunityIds.has(communityId) &&
      isJoined;

    const oldDialog = this.computedDialogs[communityId];
    if(!canHaveDialog) {
      if(oldDialog) {
        delete this.computedDialogs[communityId];
        this.mirrorCommunityDialog(communityId);
      }
      return;
    }

    const dialogs = this.getLinkedPeerIds(communityId)
    .map((peerId) => this.dialogsStorage.getDialogOnly(peerId))
    .filter((dialog): dialog is Dialog => !!dialog)
    .sort((a, b) => {
      return this.dialogsStorage.getDialogActivityDate(b) -
        this.dialogsStorage.getDialogActivityDate(a);
    });
    const joinedDialogs = dialogs.filter((dialog) => {
      const peer = dialog.peerId.isUser() ?
        this.appUsersManager.getUser(dialog.peerId.toUserId()) :
        this.appChatsManager.getChat(dialog.peerId.toChatId());
      return isCommunityLinkedPeerJoined(peer, dialog);
    });

    const pinnedOrder = this.dialogsStorage.getPinnedOrders(FOLDER_ID_ALL);
    const pinnedOrderIndex = pinnedOrder.indexOf(
      communityId.toPeerId(true)
    );
    const pinned = pinnedOrderIndex !== -1;
    const mutedPeerIds = dialogs.filter((dialog) => {
      return this.appNotificationsManager.isPeerLocalMuted({
        peerId: dialog.peerId,
        respectType: true
      });
    }).map((dialog) => dialog.peerId);
    const mutedPeerIdSet = new Set(mutedPeerIds);
    const unreadStates = joinedDialogs.map((dialog) => {
      return this.dialogsStorage.getDialogUnreadState(
        dialog,
        mutedPeerIdSet.has(dialog.peerId)
      );
    });
    const notifySettings: PeerNotifySettings =
      this.communityNotifyOverrides.get(communityId) ||
      sourceDialog?.notify_settings ||
      {_: 'peerNotifySettings'};
    const dialog: CommunityDialog = {
      _: 'communityDialog',
      communityId,
      pFlags: pinned ? {pinned: true} : {},
      notifySettings,
      // a Community is muted as ONE peer, so the row's own mute state comes from
      // its notify settings — never from the mute state of the chats inside it
      muted: this.appNotificationsManager.isMuted(notifySettings),
      dialogs,
      joinedDialogs,
      lastDialogs: joinedDialogs.slice(0, 20),
      mutedPeerIds,
      sortDate: Math.max(
        0,
        ...joinedDialogs.map((dialog) => {
          return this.dialogsStorage.getDialogActivityDate(dialog);
        })
      ),
      pinnedOrderIndex,
      pinnedOrderLength: pinnedOrder.length,
      unreadCount: unreadStates.reduce((count, unread) => count + +!!unread.count, 0),
      unreadMessagesCount: unreadStates.reduce((count, unread) => {
        return count + unread.messages;
      }, 0),
      unreadUnmutedCount: unreadStates.reduce((count, unread) => count + +unread.unmuted, 0),
      unreadMarked: unreadStates.some((unread) => unread.markOnly),
      unreadMentionsCount: joinedDialogs.reduce((count, dialog) => {
        return count + (dialog.unread_mentions_count || 0);
      }, 0),
      unreadReactionsCount: joinedDialogs.reduce((count, dialog) => {
        return count + (dialog.unread_reactions_count || 0);
      }, 0),
      unreadPollVotesCount: joinedDialogs.reduce((count, dialog) => {
        return count + (dialog.unread_poll_votes_count || 0);
      }, 0)
    };

    if(oldDialog) {
      safeReplaceObject(oldDialog, dialog);
    } else {
      this.computedDialogs[communityId] = dialog;
    }

    this.mirrorCommunityDialog(communityId);
  }

  private recomputeAllCommunityDialogs = () => {
    const communityIds = new Set<ChatId>([
      ...Object.keys(this.communityDialogs).map((communityId) => communityId.toChatId()),
      ...Object.keys(this.computedDialogs).map((communityId) => communityId.toChatId()),
      ...(this.joinedCommunityIds || []),
      ...this.pendingCommunityDialogRecomputes
    ]);
    for(const communityId of communityIds) {
      this.recomputeCommunityDialog(communityId);
    }
  };

  private syncNeededCommunities() {
    const peerIds = new Set<PeerId>();
    for(const community of Object.values(this.appChatsManager.getChats()).filter(isCommunityChat)) {
      if(
        community._ === 'community' &&
        !community.pFlags.left &&
        !this.evictedCommunityIds.has(community.id.toChatId())
      ) {
        peerIds.add((community.id as ChatId).toPeerId(true));
      }
    }

    for(const communityId in this.communityDialogs) {
      peerIds.add(communityId.toChatId().toPeerId(true));
    }

    for(const communityId of this.joinedCommunityIds || []) {
      peerIds.add(communityId.toPeerId(true));
    }

    this.peersStorage.requestPeersForKey(peerIds, 'community');
  }

  public handleCommunityDialogPinned(
    communityId: ChatId,
    pinned: boolean,
    folderId: REAL_FOLDER_ID = FOLDER_ID_ALL
  ) {
    communityId = communityId.toChatId();
    if(
      pinned &&
      (
        !this.isCommunityMembershipCurrent(communityId) ||
        !isCollapsedCommunity(this.appChatsManager.getChat(communityId))
      )
    ) {
      return;
    }

    const peerId = communityId.toPeerId(true);
    const order = this.dialogsStorage.getPinnedOrders(folderId);
    const index = order.indexOf(peerId);
    if(index !== -1) {
      order.splice(index, 1);
    }
    if(pinned) {
      order.unshift(peerId);
    }
    this.dialogsStorage.savePinnedOrders();

    const sourceDialog = this.communityDialogs[communityId];
    if(sourceDialog) {
      if(pinned) {
        sourceDialog.pFlags.pinned = true;
      } else {
        delete sourceDialog.pFlags.pinned;
      }
      this.appStateManager.pushToState('communityDialogs', {...this.communityDialogs});
    }

    this.recomputeCommunityDialog(communityId);
  }

  public sanitizePinnedDialogsOrder(order: PeerId[]) {
    return order.filter((peerId) => {
      if(peerId.isUser()) {
        return true;
      }

      const communityId = peerId.toChatId();
      if(!this.isCommunity(communityId)) {
        return true;
      }

      return this.isCommunityMembershipCurrent(communityId) &&
        isCollapsedCommunity(this.appChatsManager.getChat(communityId));
    });
  }

  public handlePinnedDialogsOrder(folderId: REAL_FOLDER_ID = FOLDER_ID_ALL) {
    if(folderId !== FOLDER_ID_ALL) {
      return;
    }

    this.recomputeAllCommunityDialogs();
  }

  public isCommunityMuted(communityId: ChatId) {
    // the very flag the chat-list row renders, so the menu item and the row can
    // never disagree about the mute state
    return !!this.getCommunityDialog(communityId.toChatId())?.muted;
  }

  public muteCommunity(communityId: ChatId, muteUntil: number) {
    const currentState = this.assertCommunityDataCurrent(communityId);
    return this.appNotificationsManager.updateNotifySettings(
      this.appPeersManager.getInputNotifyPeerById({
        peerId: currentState.communityId.toPeerId(true)
      }),
      {
        _: 'inputPeerNotifySettings',
        mute_until: muteUntil
      }
    );
  }

  public async markCommunityRead(communityId: ChatId) {
    const currentState = this.assertCommunityDataCurrent(communityId);
    const peerIds = this.getCommunityDialog(currentState.communityId)
    ?.joinedDialogs.map(({peerId}) => peerId) || [];
    for(const peerId of peerIds) {
      if(!this.isCommunityDataCurrent(
        currentState.communityId,
        currentState.generation
      )) {
        return;
      }

      await this.appMessagesManager.markDialogUnread({peerId, read: true});
    }
    if(!this.isCommunityDataCurrent(
      currentState.communityId,
      currentState.generation
    )) {
      return;
    }

    this.recomputeCommunityDialog(currentState.communityId);
  }

  public toggleCommunityPin(communityId: ChatId, pinned?: boolean) {
    communityId = communityId.toChatId();
    if(pinned === undefined) {
      pinned = !this.getCommunityDialog(communityId)?.pFlags.pinned;
    }

    return this.enqueueCommunityMutation(communityId, () => {
      return this.toggleCommunityPinNow(communityId, !!pinned);
    });
  }

  private async toggleCommunityPinNow(
    communityId: ChatId,
    pinned: boolean
  ) {
    const dialog = this.getCommunityDialog(communityId);
    const community = this.appChatsManager.getChat(communityId);
    if(
      !dialog ||
      !this.isCommunityMembershipCurrent(communityId) ||
      community?._ !== 'community' ||
      community.pFlags.left
    ) {
      throw makeError('CHANNEL_INVALID');
    }

    if(!!dialog.pFlags.pinned === pinned) {
      return;
    }
    if(pinned && !community.pFlags.collapsed_in_dialogs) {
      return;
    }

    const generation = this.getCommunityDataGeneration(communityId);
    const peerId = communityId.toPeerId(true);
    await this.appMessagesManager.setDialogPin({
      peerId,
      pinned,
      folderId: FOLDER_ID_ALL,
      applyUpdate: false
    });
    if(!this.isCommunityDataCurrent(communityId, generation)) {
      return;
    }
    const currentCommunity = this.appChatsManager.getChat(communityId);
    if(
      pinned &&
      (
        currentCommunity?._ !== 'community' ||
        !currentCommunity.pFlags.collapsed_in_dialogs
      )
    ) {
      return;
    }

    this.appMessagesManager.applyDialogPinUpdate({
      peerId,
      pinned,
      folderId: FOLDER_ID_ALL
    });
  }

  public toggleCollapsedInDialogs(communityId: ChatId, collapsed: boolean) {
    communityId = communityId.toChatId();
    return this.enqueueCommunityMutation(communityId, () => {
      return this.toggleCollapsedInDialogsNow(communityId, collapsed);
    });
  }

  private toggleCollapsedInDialogsNow(
    communityId: ChatId,
    collapsed: boolean
  ) {
    const community = this.appChatsManager.getChat(communityId);
    if(
      !this.isCommunityMembershipCurrent(communityId) ||
      community?._ !== 'community' ||
      community.pFlags.left
    ) {
      return Promise.reject(makeError('CHANNEL_INVALID'));
    }

    const wasCollapsed = !!community.pFlags.collapsed_in_dialogs;
    if(wasCollapsed === collapsed) {
      return Promise.resolve();
    }

    const generation = this.getCommunityDataGeneration(communityId);
    const wasPinned = !!this.getCommunityDialog(communityId)?.pFlags.pinned;
    this.appChatsManager.saveApiChat({
      ...community,
      pFlags: {
        ...community.pFlags,
        collapsed_in_dialogs: collapsed || undefined
      }
    }, true);

    if(!collapsed && wasPinned) {
      this.handleCommunityDialogPinned(communityId, false);
    }

    return this.apiManager.invokeApi('communities.toggleCommunityCollapsedInDialogs', {
      collapsed: collapsed || undefined,
      community: this.appChatsManager.getChannelInput(communityId)
    }).then((updates) => {
      if(this.isCommunityDataCurrent(communityId, generation)) {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    }, (error) => {
      if(this.isCommunityDataCurrent(communityId, generation)) {
        const current = this.appChatsManager.getChat(communityId);
        if(current?._ === 'community') {
          this.appChatsManager.saveApiChat({
            ...current,
            pFlags: {
              ...current.pFlags,
              collapsed_in_dialogs: wasCollapsed || undefined
            }
          }, true);
        }

        if(wasPinned) {
          this.handleCommunityDialogPinned(communityId, true);
        }
      }
      throw error;
    });
  }

  private refreshFullAfterMutation(
    communityId: ChatId,
    generation: number
  ): void {
    if(!this.isCommunityDataCurrent(communityId, generation)) {
      return;
    }

    this.refreshCommunityFull(communityId, true);
  }

  private enqueueCommunityMutation<T>(
    communityId: ChatId,
    callback: (generation: number) => Promise<T>,
    canRun?: (generation: number) => boolean
  ): Promise<T> {
    communityId = communityId.toChatId();
    const generation = this.getCommunityDataGeneration(communityId);
    const previous = this.communityMutationQueues.get(communityId);
    const run = () => {
      if(
        canRun ?
          !canRun(generation) :
          !this.isCommunityDataCurrent(communityId, generation)
      ) {
        throw makeError('CHANNEL_INVALID');
      }

      return callback(generation);
    };
    let result: Promise<T>;
    try {
      result = previous ? previous.then(run) : run();
    } catch(error) {
      result = Promise.reject(error);
    }
    const settle = (): void => {
      if(this.communityMutationQueues.get(communityId) === queue) {
        this.communityMutationQueues.delete(communityId);
      }
    };
    const queue = result.then(settle, settle);
    this.communityMutationQueues.set(communityId, queue);
    return result;
  }

  public togglePeerLink(options: {
    communityId: ChatId,
    peerId: PeerId,
    action: CommunityPeerLinkAction
  }): Promise<CommunityPeerLinkResult> {
    const canRun = options.action === 'deleted' ?
      (generation: number) => {
        return this.isCommunityDataGenerationCurrent(options.communityId, generation) && String(this.getPeerLinkedCommunityId(options.peerId)) ===
          String(options.communityId);
      } :
      undefined;
    return this.enqueueCommunityMutation(options.communityId, (generation) => {
      return this.togglePeerLinkNow(options, generation);
    }, canRun);
  }

  private async togglePeerLinkNow(options: {
    communityId: ChatId,
    peerId: PeerId,
    action: CommunityPeerLinkAction
  }, generation: number): Promise<CommunityPeerLinkResult> {
    const {communityId, peerId, action} = options;
    const generationFloor = this.dataGenerationFloor;
    try {
      await this.apiManager.invokeApi('communities.togglePeerLink', {
        visible: action === 'visible' || undefined,
        hidden: action === 'hidden' || undefined,
        deleted: action === 'deleted' || undefined,
        community: this.appChatsManager.getChannelInput(communityId),
        peer: this.appPeersManager.getInputPeerById(peerId)
      });
    } catch(error) {
      if(
        action === 'deleted' ||
        (error as ApiError).type !== 'COMMUNITY_REQUEST_CREATED'
      ) {
        throw error;
      }

      if(this.isCommunityDataCurrent(communityId, generation)) {
        this.refreshFullAfterMutation(communityId, generation);
      }
      return {status: 'requested'};
    }

    const isCurrent = this.isCommunityDataCurrent(communityId, generation);
    if(action === 'deleted') {
      const canApplyDetachedDelete = generationFloor === this.dataGenerationFloor &&
        String(this.getPeerLinkedCommunityId(peerId)) === String(communityId) &&
        (
          this.isCommunityDataGenerationCurrent(communityId, generation) ||
          this.evictedCommunityIds.has(communityId)
        );
      if(canApplyDetachedDelete) {
        const reconciledFull = this.reconcileCachedPeerLink(
          communityId,
          peerId,
          action
        );
        if(!reconciledFull) {
          this.setPeerLinkedCommunityId(peerId);
        }
      }
      if(isCurrent) {
        this.refreshFullAfterMutation(communityId, generation);
      }
      return {status: 'unlinked'};
    }
    if(!isCurrent) {
      return {status: 'linked'};
    }

    const oldCommunityId = this.getPeerLinkedCommunityId(peerId);
    if(
      oldCommunityId &&
      String(oldCommunityId) !== String(communityId)
    ) {
      if(!this.reconcileCachedPeerLink(oldCommunityId, peerId, 'deleted')) {
        this.recomputeCommunityDialog(oldCommunityId);
      }
      this.refreshFullAfterMutation(oldCommunityId, this.getCommunityDataGeneration(oldCommunityId)
      );
    }

    const reconciledFull = this.reconcileCachedPeerLink(
      communityId,
      peerId,
      action
    );
    if(!reconciledFull) {
      this.setPeerLinkedCommunityId(peerId, communityId);
    }

    this.refreshFullAfterMutation(communityId, generation);
    return {status: 'linked'};
  }

  private makeStalePeerLinkRequestsState(
    totalCount: number,
    requests: CommunityPeerRequest[]
  ): CommunityPeerLinkRequestsState {
    return totalCount ? {
      loaded: false,
      totalCount,
      requests
    } : {
      loaded: true,
      totalCount: 0,
      requests: []
    };
  }

  public handlePendingJoinRequestsUpdate(
    update: Update.updatePendingJoinRequests
  ) {
    const communityId = this.appPeersManager.getPeerId(update.peer).toChatId();
    if(!this.isCommunity(communityId)) {
      return false;
    }

    const count = Math.max(0, update.requests_pending);
    const oldState = this.peerLinkRequests.get(communityId);
    const oldCount = oldState?.totalCount ??
      this.getCachedFullCommunity(communityId)?.peer_link_requests_pending ??
      0;
    this.invalidatePeerLinkRequestsFetch(communityId);
    this.peerLinkRequests.set(communityId, this.makeStalePeerLinkRequestsState(
      count,
      count >= oldCount ? oldState?.requests.slice(0, count) || [] : []
    ));
    this.setPendingRequestsCount(communityId, count);
    return true;
  }

  private invalidatePeerLinkRequestsFetch(communityId: ChatId) {
    const generation = (this.peerLinkRequestsGeneration.get(communityId) || 0) + 1;
    this.peerLinkRequestsGeneration.set(communityId, generation);
    return generation;
  }

  private setPendingRequestsCount(communityId: ChatId, count: number) {
    const fullCommunity = this.getCachedFullCommunity(communityId);
    if(fullCommunity) {
      fullCommunity.peer_link_requests_pending = Math.max(0, count);
      this.touchCachedFullCommunity(communityId);
    }
    this.mirrorCommunityPeerLinkRequests(communityId);
  }

  private reconcilePeerLinkRequestsWithFull(
    communityId: ChatId,
    fullCommunity: ChatFull.communityFull
  ) {
    const state = this.peerLinkRequests.get(communityId);
    if(
      !state?.loaded &&
      !this.peerLinkRequestsGeneration.has(communityId)
    ) {
      return;
    }

    this.invalidatePeerLinkRequestsFetch(communityId);
    if(state) {
      const totalCount = Math.max(
        0,
        fullCommunity.peer_link_requests_pending || 0
      );
      const linkedPeerIds = new Set(
        fullCommunity.linked_peers.map(({peer}) => {
          return this.appPeersManager.getPeerId(peer);
        })
      );
      this.peerLinkRequests.set(
        communityId,
        this.makeStalePeerLinkRequestsState(
          totalCount,
          state.requests.filter((request) => {
            return !linkedPeerIds.has(
              this.appPeersManager.getPeerId(request.peer)
            );
          })
        )
      );
      this.mirrorCommunityPeerLinkRequests(communityId);
    }
  }

  public getPeerLinkRequests(options: {
    communityId: ChatId,
    offset?: string,
    limit?: number
  }): Promise<CommunitiesPeerLinkRequests.communitiesPeerLinkRequests> {
    return this.enqueueCommunityMutation(options.communityId, (generation) => {
      return this.getPeerLinkRequestsNow(options, generation);
    });
  }

  private async getPeerLinkRequestsNow(options: {
    communityId: ChatId,
    offset?: string,
    limit?: number
  }, communityGeneration: number):
  Promise<CommunitiesPeerLinkRequests.communitiesPeerLinkRequests> {
    const {communityId, offset = '', limit = 100} = options;
    const oldState = this.peerLinkRequests.get(communityId);
    const generation = offset ?
      (this.peerLinkRequestsGeneration.get(communityId) || 0) :
      this.invalidatePeerLinkRequestsFetch(communityId);
    const expectedOffset = oldState?.nextOffset;
    const result = await this.apiManager.invokeApi('communities.getPeerLinkRequests', {
      community: this.appChatsManager.getChannelInput(communityId),
      offset,
      limit
    });

    const isCommunityCurrent = this.isCommunityDataCurrent(communityId, communityGeneration);
    const isRequestGenerationCurrent =
      this.peerLinkRequestsGeneration.get(communityId) === generation;
    const isPageCurrent = !offset || (
      !!oldState &&
      expectedOffset === offset &&
      this.peerLinkRequests.get(communityId) === oldState
    );
    if(
      !isCommunityCurrent ||
      !isRequestGenerationCurrent ||
      !isPageCurrent
    ) {
      if(
        !offset &&
        isCommunityCurrent &&
        !isRequestGenerationCurrent &&
        (this.getCachedFullCommunity(communityId)?.peer_link_requests_pending || 0) > 0
      ) {
        return this.getPeerLinkRequestsNow(options, communityGeneration);
      }

      return result;
    }

    this.appPeersManager.saveApiPeers(result);
    const requests = offset && oldState ?
      oldState.requests.slice() :
      [];
    const known = new Set(requests.map((request) => this.appPeersManager.getPeerId(request.peer)));
    for(const request of result.requests) {
      const peerId = this.appPeersManager.getPeerId(request.peer);
      if(!known.has(peerId)) {
        known.add(peerId);
        requests.push(request);
      }
    }

    this.peerLinkRequests.set(communityId, {
      loaded: true,
      totalCount: result.total_count,
      requests,
      nextOffset: result.next_offset
    });
    this.setPendingRequestsCount(communityId, result.total_count);
    return result;
  }

  private removePeerLinkRequest(communityId: ChatId, peerId: PeerId) {
    const state = this.peerLinkRequests.get(communityId);
    if(!state) {
      return false;
    }

    const index = state.requests.findIndex((request) => {
      return this.appPeersManager.getPeerId(request.peer) === peerId;
    });
    if(index === -1) {
      return false;
    }

    state.requests.splice(index, 1);
    state.totalCount = Math.max(0, state.totalCount - 1);
    this.setPendingRequestsCount(communityId, state.totalCount);
    return true;
  }

  private addApprovedPeerLinkRequests(
    communityId: ChatId,
    requests: CommunityPeerRequest[]
  ): OptimisticApprovedLinkedPeers | undefined {
    communityId = communityId.toChatId();
    const fullCommunity = this.getCachedFullCommunity(communityId);
    if(!fullCommunity) {
      return;
    }

    const previousLinkedPeers = fullCommunity.linked_peers;
    const optimisticLinkedPeers = previousLinkedPeers.slice();
    const linkedPeerIds = new Set(
      optimisticLinkedPeers.map((linkedPeer) => {
        return this.appPeersManager.getPeerId(linkedPeer.peer);
      })
    );

    for(const request of requests) {
      const peerId = this.appPeersManager.getPeerId(request.peer);
      if(linkedPeerIds.has(peerId)) {
        continue;
      }

      linkedPeerIds.add(peerId);
      optimisticLinkedPeers.push({
        _: 'communityPeer',
        pFlags: {},
        visible: !!request.pFlags.visible,
        peer: request.peer
      });
    }

    if(optimisticLinkedPeers.length !== previousLinkedPeers.length) {
      fullCommunity.linked_peers = optimisticLinkedPeers;
      this.touchCachedFullCommunity(communityId);
    } else {
      return {
        fullCommunity,
        previousLinkedPeers,
        optimisticLinkedPeers: previousLinkedPeers
      };
    }

    return {
      fullCommunity,
      previousLinkedPeers,
      optimisticLinkedPeers
    };
  }

  private rollbackApprovedPeerLinkRequests(
    communityId: ChatId,
    snapshot: OptimisticApprovedLinkedPeers | undefined,
    pendingRequestsCount: number
  ) {
    communityId = communityId.toChatId();
    if(
      !snapshot ||
      this.getCachedFullCommunity(communityId) !== snapshot.fullCommunity ||
      snapshot.fullCommunity.linked_peers !== snapshot.optimisticLinkedPeers
    ) {
      return false;
    }

    snapshot.fullCommunity.linked_peers = snapshot.previousLinkedPeers;
    snapshot.fullCommunity.peer_link_requests_pending = Math.max(
      0,
      pendingRequestsCount
    );
    this.touchCachedFullCommunity(communityId);
    return true;
  }

  private canRestorePeerLinkRequestSnapshot(
    communityId: ChatId,
    snapshot: CommunityPeerLinkRequestsState
  ) {
    const fullCommunity = this.getCachedFullCommunity(communityId);
    if(!fullCommunity) {
      return true;
    }

    if(
      (fullCommunity.peer_link_requests_pending || 0) !== snapshot.totalCount
    ) {
      return false;
    }

    const linkedPeerIds = new Set(fullCommunity.linked_peers.map((linkedPeer) => {
      return this.appPeersManager.getPeerId(linkedPeer.peer);
    }));
    return !snapshot.requests.some((request) => {
      return linkedPeerIds.has(this.appPeersManager.getPeerId(request.peer));
    });
  }

  private async applyPeerLinkRequestApproval(options: {
    communityId: ChatId,
    reject: boolean,
    generation: number,
    getRequests: (snapshot: CommunityPeerLinkRequestsState) => CommunityPeerRequest[],
    getSuccessPeerIds: (snapshot?: CommunityPeerLinkRequestsState) => PeerId[],
    updatePendingState: (state?: CommunityPeerLinkRequestsState) => void,
    invoke: () => Promise<unknown>
  }) {
    const {
      communityId,
      reject,
      generation,
      getRequests,
      getSuccessPeerIds,
      updatePendingState,
      invoke
    } = options;
    this.invalidatePeerLinkRequestsFetch(communityId);
    const oldState = this.peerLinkRequests.get(communityId);
    const snapshot = oldState ? {
      ...oldState,
      requests: oldState.requests.slice()
    } : undefined;
    const approvedRequests = !reject && snapshot ? getRequests(snapshot) : [];
    const successPeerIds = reject ? [] : getSuccessPeerIds(snapshot);
    updatePendingState(oldState);
    const linkedPeersSnapshot = snapshot ?
      this.addApprovedPeerLinkRequests(communityId, approvedRequests) :
      undefined;

    try {
      await invoke();
    } catch(error) {
      const currentState = this.peerLinkRequests.get(communityId);
      if(
        this.isCommunityDataCurrent(communityId, generation) &&
        snapshot &&
        (
          currentState === oldState ||
          currentState === undefined ||
          (
            !currentState.loaded &&
            currentState.totalCount === snapshot.totalCount
          )
        )
      ) {
        if(linkedPeersSnapshot) {
          this.rollbackApprovedPeerLinkRequests(
            communityId,
            linkedPeersSnapshot,
            snapshot.totalCount
          );
        }
        if(this.canRestorePeerLinkRequestSnapshot(communityId, snapshot)) {
          this.peerLinkRequests.set(communityId, snapshot);
          this.mirrorCommunityPeerLinkRequests(communityId);
        }
      }
      throw error;
    }

    if(!this.isCommunityDataCurrent(communityId, generation)) {
      return;
    }

    for(const peerId of successPeerIds) {
      this.setPeerLinkedCommunityId(peerId, communityId);
    }
    this.refreshFullAfterMutation(communityId, generation);
  }

  public togglePeerLinkRequestApproval(options: {
    communityId: ChatId,
    peerId: PeerId,
    reject?: boolean
  }) {
    return this.enqueueCommunityMutation(options.communityId, (generation) => {
      return this.togglePeerLinkRequestApprovalNow(options, generation);
    });
  }

  private async togglePeerLinkRequestApprovalNow(options: {
    communityId: ChatId,
    peerId: PeerId,
    reject?: boolean
  }, generation: number) {
    const {communityId, peerId, reject = false} = options;
    return this.applyPeerLinkRequestApproval({
      communityId,
      reject,
      generation,
      getRequests: (snapshot) => snapshot.requests.filter((request) => {
        return this.appPeersManager.getPeerId(request.peer) === peerId;
      }),
      getSuccessPeerIds: () => [peerId],
      updatePendingState: () => {
        this.removePeerLinkRequest(communityId, peerId);
      },
      invoke: () => this.apiManager.invokeApi(
        'communities.togglePeerLinkRequestApproval',
        {
          reject: reject || undefined,
          community: this.appChatsManager.getChannelInput(communityId),
          peer: this.appPeersManager.getInputPeerById(peerId)
        }
      )
    });
  }

  public toggleAllPeerLinkRequestApproval(communityId: ChatId, reject = false) {
    return this.enqueueCommunityMutation(communityId, (generation) => {
      return this.toggleAllPeerLinkRequestApprovalNow(communityId, reject, generation);
    });
  }

  private async toggleAllPeerLinkRequestApprovalNow(
    communityId: ChatId,
    reject: boolean,
    generation: number
  ) {
    return this.applyPeerLinkRequestApproval({
      communityId,
      reject,
      generation,
      getRequests: (snapshot) => snapshot.requests,
      getSuccessPeerIds: (snapshot) => {
        return (snapshot?.requests || []).map((request) => {
          return this.appPeersManager.getPeerId(request.peer);
        });
      },
      updatePendingState: (state) => {
        if(!state) {
          return;
        }

        state.requests = [];
        state.totalCount = 0;
        state.nextOffset = undefined;
        this.setPendingRequestsCount(communityId, 0);
      },
      invoke: () => this.apiManager.invokeApi(
        'communities.toggleAllPeerLinkRequestApproval',
        {
          reject: reject || undefined,
          community: this.appChatsManager.getChannelInput(communityId)
        }
      )
    });
  }

  public toggleParticipantBanned(options: {
    communityId: ChatId,
    participantId: PeerId,
    unban?: boolean
  }) {
    return this.enqueueCommunityMutation(options.communityId, (generation) => {
      return this.toggleParticipantBannedNow(options, generation);
    });
  }

  private async toggleParticipantBannedNow(options: {
    communityId: ChatId,
    participantId: PeerId,
    unban?: boolean
  }, generation: number) {
    const communityId = options.communityId.toChatId();
    const fullCommunitySnapshot = this.getCachedFullCommunity(communityId);
    const kickedCountSnapshot = fullCommunitySnapshot?.kicked_count;
    const kickedCountBaseline = kickedCountSnapshot ?? 0;
    const nextKickedCount = Math.max(
      0,
      kickedCountBaseline + (options.unban ? -1 : 1)
    );
    const setKickedCount = (
      expected: number | undefined,
      value: number | undefined
    ) => {
      const fullCommunity = this.getCachedFullCommunity(communityId);
      if(
        !fullCommunity ||
        fullCommunity !== fullCommunitySnapshot ||
        fullCommunity.kicked_count !== expected
      ) {
        return false;
      }

      if(value === undefined) {
        delete fullCommunity.kicked_count;
      } else {
        fullCommunity.kicked_count = value;
      }
      this.touchCachedFullCommunity(communityId);
      return true;
    };
    const optimisticallyChanged =
      kickedCountSnapshot !== nextKickedCount &&
      setKickedCount(kickedCountSnapshot, nextKickedCount);
    const kickedCountMutation: KickedCountMutation = {
      baseline: kickedCountBaseline,
      expected: nextKickedCount
    };
    if(optimisticallyChanged) {
      this.kickedCountMutations.set(communityId, kickedCountMutation);
    }

    try {
      await this.apiManager.invokeApi('communities.toggleParticipantBanned', {
        unban: options.unban || undefined,
        community: this.appChatsManager.getChannelInput(communityId),
        participant: this.appPeersManager.getInputPeerById(options.participantId)
      });
    } catch(error) {
      if(this.kickedCountMutations.get(communityId) === kickedCountMutation) {
        this.kickedCountMutations.delete(communityId);
      }
      if(optimisticallyChanged) {
        setKickedCount(nextKickedCount, kickedCountSnapshot);
      }
      throw error;
    }

    if(!this.isCommunityDataCurrent(communityId, generation)) {
      return;
    }

    setKickedCount(kickedCountSnapshot, nextKickedCount);

    this.refreshFullAfterMutation(communityId, generation);
  }

  public async getParticipantJoinedChats(options: {
    communityId: ChatId,
    participantId: PeerId
  }): Promise<CommunitiesParticipantJoinedChats.communitiesParticipantJoinedChats> {
    const result = await this.apiManager.invokeApi('communities.getParticipantJoinedChats', {
      community: this.appChatsManager.getChannelInput(options.communityId),
      participant: this.appPeersManager.getInputPeerById(options.participantId)
    });
    this.appPeersManager.saveApiPeers(result);
    return result;
  }

  public async getParticipantCandidates(options: {
    communityId: ChatId,
    query?: string,
    offset?: CommunityParticipantCandidatesOffset,
    limit?: number,
    kind?: CommunityParticipantCandidateKind
  }): Promise<CommunityParticipantCandidatesPage> {
    const query = options.query?.trim() || '';
    const offset = options.offset || {contacts: 0, recent: 0};
    const limit = options.limit || 50;
    const kind = options.kind || 'admin';
    const filterCandidates = (peerIds: PeerId[]) => {
      const seen = new Set<PeerId>();
      return peerIds.filter((peerId) => {
        const user = peerId?.isUser() ?
          this.appUsersManager.getUser(peerId.toUserId()) :
          undefined;
        if(
          !peerId?.isUser() ||
          peerId === this.rootScope.myId ||
          seen.has(peerId) ||
          !user ||
          user._ !== 'user' ||
          user.pFlags.deleted ||
          (kind === 'admin' && !isCommunityAdminCandidate(user))
        ) {
          return false;
        }

        seen.add(peerId);
        return true;
      });
    };

    if(query) {
      const [localContactsResult, remoteContactsResult] =
      await Promise.allSettled([
        this.appUsersManager.getContacts(query),
        this.appUsersManager.searchContacts(
          query,
          offset.contacts + limit
        )
      ]);
      if(
        localContactsResult.status === 'rejected' &&
        remoteContactsResult.status === 'rejected'
      ) {
        throw localContactsResult.reason;
      }

      const contactPeerIds = [
        ...(localContactsResult.status === 'fulfilled' ?
          localContactsResult.value.map((userId) => userId.toPeerId(false)) :
          []),
        ...(remoteContactsResult.status === 'fulfilled' ?
          remoteContactsResult.value.my_results.concat(
            remoteContactsResult.value.results
          ) :
          [])
      ].filter((peerId) => peerId.isUser());
      const participantIds = filterCandidates(contactPeerIds)
      .slice(offset.contacts, offset.contacts + limit);
      const nextContactsOffset = offset.contacts + participantIds.length;
      return {
        participantIds,
        nextOffset: {
          contacts: nextContactsOffset,
          recent: 0
        },
        isEnd: participantIds.length < limit
      };
    }

    // Communities do not have a regular member list. Official clients offer
    // contacts as administrator candidates instead.
    const candidates = filterCandidates((
      await this.appUsersManager.getContacts()
    ).map((userId) => userId.toPeerId(false)));
    const participantIds = candidates.slice(
      offset.contacts,
      offset.contacts + limit
    );
    const nextContactsOffset = offset.contacts + participantIds.length;
    return {
      participantIds,
      nextOffset: {
        contacts: nextContactsOffset,
        recent: 0
      },
      isEnd: nextContactsOffset >= candidates.length
    };
  }

  public async getChatsToAdd() {
    const chats = await this.appChatsManager.getAdminedPublicChannels({
      for_community_peer: true
    });
    const isLocalCandidate = (chat: Chat): chat is Chat.channel => {
      return chat._ === 'channel' &&
        !!chat.pFlags.creator &&
        !!chat.pFlags.megagroup &&
        !chat.pFlags.monoforum &&
        !chat.linked_community_id;
    };
    const candidates = new Map<ChatId, Chat.channel>();
    for(const chat of Object.values(this.appChatsManager.getChats())) {
      if(isLocalCandidate(chat)) {
        candidates.set(chat.id.toChatId(), chat);
      }
    }
    for(const chat of chats) {
      if(chat._ === 'channel') {
        candidates.set(chat.id.toChatId(), chat);
      }
    }

    return [...candidates.values()];
  }

  public async getBotsToAdd() {
    const users = await this.appBotsManager.getAdminedBots();
    return users.filter((user) => {
      return user._ === 'user' &&
        !!user.pFlags.bot &&
        !user.linked_community_id;
    });
  }

  public async getPeersLimit(isBot = false) {
    const appConfig = await this.apiManager.getAppConfig();
    return (isBot ?
      appConfig.community_bot_peers_limit :
      appConfig.community_peers_limit) ?? (Modes.test ? 10 : 100);
  }

  public editDefaultBannedRightsMode(
    communityId: ChatId,
    mode: CommunityAddMode
  ) {
    const community = this.appChatsManager.getChat(communityId);
    if(community?._ !== 'community') {
      return Promise.reject(makeError('CHANNEL_INVALID'));
    }

    const current = community.default_banned_rights;
    if(getCommunityAddMode(current) === mode) {
      return Promise.resolve();
    }

    return this.appChatsManager.editChatDefaultBannedRights(
      communityId,
      rightsWithCommunityAddMode(mode, current)
    );
  }

  public handleAdminEdited({
    communityId,
    previousParticipant,
    participant
  }: {
    communityId: ChatId,
    previousParticipant: PeerId | ChannelParticipant | ChatParticipant,
    participant: ChannelParticipant
  }) {
    communityId = communityId.toChatId();
    const isAdmin = (
      value: PeerId | ChannelParticipant | ChatParticipant
    ) => typeof(value) === 'object' && (
      value._ === 'channelParticipantAdmin' ||
      value._ === 'channelParticipantCreator'
    );
    const previousIsAdmin = isAdmin(previousParticipant);
    const nextIsAdmin = isAdmin(participant);
    const fullCommunity = this.getCachedFullCommunity(communityId);
    if(
      previousIsAdmin === nextIsAdmin ||
      fullCommunity?.admins_count === undefined
    ) {
      return;
    }

    fullCommunity.admins_count = Math.max(
      0,
      fullCommunity.admins_count + (nextIsAdmin ? 1 : -1)
    );
    this.touchCachedFullCommunity(communityId);
  }

  private processCommunityServiceMessage(message: MyMessage) {
    if(
      message?._ !== 'messageService' ||
      message.action?._ !== 'messageActionChangeCommunity'
    ) {
      return;
    }

    const oldCommunityId = this.getPeerLinkedCommunityId(message.peerId);
    const communityId = message.action.community_id;
    const newCommunityId = communityId &&
      communityId !== '0' &&
      communityId !== 0 ?
      communityId.toChatId() :
      undefined;
    if(String(oldCommunityId || '') === String(newCommunityId || '')) {
      return;
    }

    this.setPeerLinkedCommunityId(message.peerId, newCommunityId);
    if(oldCommunityId) {
      this.recomputeCommunityDialog(oldCommunityId);
      this.refreshFullAfterMutation(
        oldCommunityId,
        this.getCommunityDataGeneration(oldCommunityId)
      );
    }
    if(newCommunityId) {
      this.recomputeCommunityDialog(newCommunityId);
      this.refreshFullAfterMutation(
        newCommunityId,
        this.getCommunityDataGeneration(newCommunityId)
      );
    }
  }

  public handleCommunityUpdate(communityId: ChatId) {
    communityId = communityId.toChatId();
    const community = this.appChatsManager.getChat(communityId);
    const unavailable = community?._ === 'communityForbidden' ||
      (community?._ === 'community' && !!community.pFlags.left);
    if(unavailable) {
      const refreshPending = this.joinedCommunitiesRefresh.isPending(undefined);
      this.teardownCommunityState(communityId);
      if(refreshPending) {
        this.refreshJoinedCommunities(true);
      }
    } else if(this.evictedCommunityIds.has(communityId)) {
      this.invalidateJoinedCommunitiesFetch();
      this.joinedCommunityIds = null;
      this.joinedCommunitiesAuthoritative = false;
      this.appStateManager.pushToState('joinedCommunityIds', null);
      this.refreshJoinedCommunities(true);
    } else {
      this.noteObservedJoinedCommunity(communityId);
    }

    if(!unavailable) {
      this.syncNeededCommunities();
      this.recomputeCommunityDialog(communityId);
    }
  }

  private onUpdateChannel = (update: {channel_id: ChatId}) => {
    const communityId = update.channel_id.toChatId();
    if(this.isCommunity(communityId)) {
      this.refreshJoinedCommunities(true);
      this.refreshCommunityFull(communityId, true);
    }
  };

  private onUpdateChannelParticipant = (update: Update.updateChannelParticipant) => {
    const communityId = update.channel_id.toChatId();
    if(
      this.isCommunity(communityId) &&
      this.isCommunityMembershipCurrent(communityId)
    ) {
      this.refreshCommunityFull(communityId, true);
    }
  };

  private onUpdateChatDefaultBannedRights = (update: Update.updateChatDefaultBannedRights) => {
    const communityId = this.appPeersManager.getPeerId(update.peer).toChatId();
    const community = this.appChatsManager.getChat(communityId);
    if(community?._ !== 'community') {
      return;
    }

    this.appChatsManager.saveApiChat({
      ...community,
      default_banned_rights: update.default_banned_rights
    }, true);
  };
}
