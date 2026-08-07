import {
  AppCommunitiesManager,
  CommunityPeerLinkAction,
  CommunityPeerLinkRequestsState,
  CommunityPermission
} from '@appManagers/appCommunitiesManager';
import Modes from '@config/modes';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {AppPeersManager} from '@appManagers/appPeersManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {
  Chat,
  ChatBannedRights,
  ChatFull,
  ChannelParticipant,
  CommunitiesPeerLinkRequests,
  CommunityPeer,
  CommunityPeerRequest,
  Message,
  MessagesChats,
  Update,
  User
} from '@layer';
import '@helpers/peerIdPolyfill';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import SearchIndex from '@lib/searchIndex';
import type {Dialog} from '@appManagers/appMessagesManager';
import hasRights from '@appManagers/utils/chats/hasRights';

const COMMUNITY_ID = 200 as ChatId;
const COMMUNITY_PEER_ID = COMMUNITY_ID.toPeerId(true);
const USER_ID = 100 as UserId;
const USER_PEER_ID = USER_ID.toPeerId(false);

function getCommunity(manager: AppCommunitiesManager, communityId: ChatId) {
  const community = (manager as any).appChatsManager.getChat(communityId) as Chat;
  if(community?._ !== 'community') {
    throw new Error('Expected Community');
  }

  return community;
}

function getProfileManager(manager: AppCommunitiesManager) {
  return (manager as any).appProfileManager as AppProfileManager;
}

function saveFullCommunity(
  manager: AppCommunitiesManager,
  fullCommunity: ChatFull.communityFull
) {
  return (getProfileManager(manager) as any).saveFullPeer(
    fullCommunity.id.toPeerId(true),
    fullCommunity
  ) as ChatFull.communityFull;
}

function getCachedFullCommunity(
  manager: AppCommunitiesManager,
  communityId: ChatId
) {
  const fullChat = getProfileManager(manager).getCachedFullChat(communityId);
  return fullChat?._ === 'communityFull' ? fullChat : undefined;
}

function getFullCommunity(
  manager: AppCommunitiesManager,
  communityId: ChatId,
  override?: boolean
) {
  return getProfileManager(manager).getChatFull(
    communityId,
    override
  ) as MaybePromise<ChatFull.communityFull>;
}

function loadFullCommunity(
  manager: AppCommunitiesManager,
  communityId: ChatId,
  override?: boolean
) {
  return Promise.resolve(getFullCommunity(manager, communityId, override))
  .then((): void => undefined);
}

function getCommunityFullMirror(manager: AppCommunitiesManager) {
  return getProfileManager(manager).getCommunityFullMirror();
}

function getCachedJoinedCommunities(manager: AppCommunitiesManager) {
  return (manager as any).getCachedJoinedCommunities() as
    Array<Chat.community | Chat.communityForbidden> | null;
}

function getCachedPeerLinkRequests(
  manager: AppCommunitiesManager,
  communityId: ChatId
) {
  return manager.getCommunityPeerLinkRequestsMirror()[communityId];
}
const CHANNEL_ID = 300 as ChatId;
const CHANNEL_PEER_ID = CHANNEL_ID.toPeerId(true);
const mirrorInvokeVoid = vi.fn();

vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({
  invokeVoid: mirrorInvokeVoid
} as any);

beforeEach(() => {
  mirrorInvokeVoid.mockClear();
});

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {promise, resolve, reject};
}

function makeCommunity(
  id: ChatId = COMMUNITY_ID,
  pFlags: Chat.community['pFlags'] = {}
): Chat.community {
  return {
    _: 'community',
    pFlags,
    id,
    access_hash: `community-${id}`,
    title: `Community ${id}`,
    photo: {_: 'chatPhotoEmpty'},
    date: 10
  };
}

function makeChannel(
  id: ChatId = CHANNEL_ID,
  linkedCommunityId?: ChatId
): Chat.channel {
  return {
    _: 'channel',
    pFlags: {broadcast: true},
    id,
    access_hash: `channel-${id}`,
    title: `Channel ${id}`,
    photo: {_: 'chatPhotoEmpty'},
    date: 5,
    linked_community_id: linkedCommunityId
  };
}

function makeUser(
  id: UserId = USER_ID,
  linkedCommunityId?: ChatId
): User.user {
  return {
    _: 'user',
    pFlags: {},
    id,
    access_hash: `user-${id}`,
    first_name: `User ${id}`,
    linked_community_id: linkedCommunityId
  };
}

function makeFullCommunity(
  linkedPeers: CommunityPeer[] = [],
  pending = 0
): ChatFull.communityFull {
  return {
    _: 'communityFull',
    id: COMMUNITY_ID,
    about: 'About',
    chat_photo: {_: 'photoEmpty', id: 0},
    linked_peers: linkedPeers,
    peer_link_requests_pending: pending
  };
}

function makeLinkedPeer(peer: CommunityPeer['peer']): CommunityPeer {
  return {
    _: 'communityPeer',
    pFlags: {can_view_history: true},
    visible: true,
    peer
  };
}

function makeRequest(
  peer: CommunityPeerRequest['peer'],
  date: number,
  visible = true
): CommunityPeerRequest {
  return {
    _: 'communityPeerRequest',
    pFlags: visible ? {visible: true} : {},
    peer,
    requested_by: 1,
    date
  };
}

function getPeerId(peer: CommunityPeer['peer']): PeerId {
  switch(peer._) {
    case 'peerUser':
      return (+peer.user_id as UserId).toPeerId(false);
    case 'peerChat':
      return (+peer.chat_id as ChatId).toPeerId(true);
    case 'peerChannel':
      return (+peer.channel_id as ChatId).toPeerId(true);
  }
}

function makeDialog(peerId: PeerId, topMessage: number): Dialog {
  return {
    _: 'dialog',
    pFlags: {},
    peerId,
    folder_id: 0,
    top_message: topMessage
  } as Dialog;
}

function createHarness(options: {
  communities?: Chat.community[],
  users?: User.user[],
  chats?: Chat.channel[],
  authorized?: boolean,
  ready?: boolean,
  handleCommunityUpdatesOnSave?: boolean
} = {}) {
  const communities: Record<number, Chat.community> = Object.fromEntries(
    (options.communities || [makeCommunity()]).map((community) => [community.id, community])
  );
  const users: Record<number, User.user> = Object.fromEntries(
    (options.users || []).map((user) => [user.id, user])
  );
  const chats: Record<number, Chat.channel | Chat.community> = {
    ...communities,
    ...Object.fromEntries((options.chats || []).map((chat) => [chat.id, chat]))
  };
  const pinnedOrders: Record<number, PeerId[]> = {0: []};

  const invokeApi = vi.fn();
  const invokeApiSingleProcess = vi.fn();
  const getAppConfig = vi.fn();
  const processUpdateMessage = vi.fn();
  const saveUpdate = vi.fn();
  const pushToState = vi.fn();
  const getState = vi.fn().mockResolvedValue({
    communityDialogs: {},
    joinedCommunityIds: []
  });
  const dispatchEvent = vi.fn();
  const requestPeersForKey = vi.fn();
  const savePinnedOrders = vi.fn();
  const getDialogOnly = vi.fn();
  const getContacts = vi.fn().mockResolvedValue([]);
  const searchContacts = vi.fn().mockResolvedValue({
    my_results: [],
    results: []
  });
  const markDialogUnread = vi.fn().mockResolvedValue(undefined);
  const saveApiUsers = vi.fn((apiUsers: User[]) => {
    for(const user of apiUsers) {
      if(user._ === 'user') {
        users[+user.id] = user;
      }
    }
  });

  const saveApiPeers = vi.fn((result: {
    chats?: Chat[],
    users?: User[]
  }) => {
    for(const chat of result.chats || []) {
      if(chat._ === 'community') {
        communities[+chat.id] = chat;
        chats[+chat.id] = chat;
        if(options.handleCommunityUpdatesOnSave) {
          manager.handleCommunityUpdate(chat.id.toChatId());
        }
      } else if(chat._ === 'channel') {
        chats[+chat.id] = chat;
      }
    }
    for(const user of result.users || []) {
      if(user._ === 'user') {
        users[+user.id] = user;
      }
    }
  });

  const setUserLinkedCommunityId = vi.fn((userId: UserId, communityId?: ChatId) => {
    const user = users[+userId];
    if(communityId) {
      user.linked_community_id = communityId;
    } else {
      delete user.linked_community_id;
    }
  });
  const setChatLinkedCommunityId = vi.fn((chatId: ChatId, communityId?: ChatId) => {
    const chat = chats[+chatId];
    if(chat?._ !== 'channel') {
      return;
    }
    if(communityId) {
      chat.linked_community_id = communityId;
    } else {
      delete chat.linked_community_id;
    }
  });
  const saveApiChat = vi.fn((chat: Chat) => {
    if(chat._ === 'community') {
      communities[+chat.id] = chat;
      chats[+chat.id] = chat;
    } else if(chat._ === 'channel') {
      chats[+chat.id] = chat;
    }
    return chat;
  });

  const manager = new AppCommunitiesManager();
  Object.assign(manager as any, {
    apiManager: {
      invokeApi,
      invokeApiSingleProcess,
      getAppConfig
    },
    apiUpdatesManager: {
      processUpdateMessage,
      saveUpdate
    },
    appChatsManager: {
      getChats: () => chats,
      getChat: (chatId: ChatId) => chats[+chatId],
      isCommunity: (communityId: ChatId) => !!communities[+communityId],
      hasRights: (communityId: ChatId, action: CommunityPermission) => {
        return hasRights(chats[+communityId], action);
      },
      getChannelInput: (communityId: ChatId) => ({
        _: 'inputChannel',
        channel_id: communityId,
        access_hash: `community-${communityId}`
      }),
      getChannelInputPeer: (communityId: ChatId) => ({
        _: 'inputPeerChannel',
        channel_id: communityId,
        access_hash: `community-${communityId}`
      }),
      getAdminedPublicChannels: (params: {for_community_peer?: boolean}) => {
        return invokeApi('channels.getAdminedPublicChannels', params)
        .then((result: MessagesChats) => {
          saveApiPeers(result);
          return result.chats;
        });
      },
      editChatDefaultBannedRights: (
        communityId: ChatId,
        bannedRights: ChatBannedRights
      ) => invokeApi('messages.editChatDefaultBannedRights', {
        peer: {
          _: 'inputPeerChannel',
          channel_id: communityId,
          access_hash: `community-${communityId}`
        },
        banned_rights: bannedRights
      }),
      saveApiChat,
      setLinkedCommunityId: setChatLinkedCommunityId
    },
    appUsersManager: {
      createSearchIndex: () => new SearchIndex<UserId>({
        clearBadChars: true,
        ignoreCase: true,
        latinize: true,
        includeTag: true
      }),
      getUsers: () => users,
      getUser: (userId: UserId) => users[+userId],
      getContacts,
      searchContacts,
      saveApiUsers,
      getUserInput: (userId: UserId) => ({
        _: 'inputUser',
        user_id: userId,
        access_hash: `user-${userId}`
      }),
      setLinkedCommunityId: setUserLinkedCommunityId
    },
    appPeersManager: {
      getPeerSearchText: (peerId: PeerId) => {
        const user = users[+peerId.toUserId()];
        return [user?.first_name, user?.last_name, user?.username]
        .filter(Boolean)
        .join(' ');
      },
      getPeerId,
      getOutputPeer: (peerId: PeerId) => peerId.isUser() ? {
        _: 'peerUser',
        user_id: peerId.toUserId()
      } : {
        _: 'peerChannel',
        channel_id: peerId.toChatId()
      },
      getInputPeerById: (peerId: PeerId) => peerId.isUser() ? {
        _: 'inputPeerUser',
        user_id: peerId.toUserId(),
        access_hash: `user-${peerId}`
      } : {
        _: 'inputPeerChannel',
        channel_id: peerId.toChatId(),
        access_hash: `channel-${peerId.toChatId()}`
      },
      saveApiPeers
    },
    appPhotosManager: {
      savePhoto: vi.fn((photo) => photo)
    },
    appMessagesManager: {
      getMessageByPeer: vi.fn(),
      getDialogUnreadCount: vi.fn(() => 0),
      markDialogUnread,
      setDialogPin: ({peerId, pinned}: {
        peerId: PeerId,
        pinned: boolean
      }) => {
        const communityId = peerId.toChatId();
        return invokeApi('messages.toggleDialogPin', {
          pinned: pinned || undefined,
          peer: {
            _: 'inputDialogPeerCommunity',
            community: {
              _: 'inputChannel',
              channel_id: communityId,
              access_hash: `community-${communityId}`
            }
          }
        });
      },
      applyDialogPinUpdate: ({peerId, pinned, folderId}: {
        peerId: PeerId,
        pinned: boolean,
        folderId: number
      }) => {
        saveUpdate({
          _: 'updateDialogPinned',
          pFlags: pinned ? {pinned: true} : {},
          folder_id: folderId,
          peer: {
            _: 'dialogPeerCommunity',
            community_id: peerId.toChatId()
          }
        });
      }
    },
    appBotsManager: {
      getAdminedBots: () => invokeApi('bots.getAdminedBots').then((apiUsers: User[]) => {
        saveApiUsers(apiUsers);
        return apiUsers;
      })
    },
    appNotificationsManager: {
      isPeerLocalMuted: vi.fn(() => false)
    },
    appStateManager: {getState, pushToState},
    dialogsStorage: {
      getDialogOnly,
      getPinnedOrders: (folderId: number) => pinnedOrders[folderId] ||= [],
      savePinnedOrders,
      getForumUnreadCount: vi.fn(),
      getDialogActivityDate: (dialog: Dialog) => {
        const message = (manager as any).appMessagesManager.getMessageByPeer(
          dialog.peerId,
          dialog.top_message
        ) as Message.message | Message.messageService;
        let date = message?.date || 0;
        const chat = dialog.peerId.isAnyChat() ?
          chats[+dialog.peerId.toChatId()] :
          undefined;
        if(chat?.date && chat.date > date) {
          date = chat.date;
        }
        if(dialog.draft?._ === 'draftMessage' && dialog.draft.date > date) {
          date = dialog.draft.date;
        }
        return date;
      },
      getDialogUnreadState: (dialog: Dialog, isMuted: boolean) => {
        const count = (manager as any).appMessagesManager
        .getDialogUnreadCount(dialog);
        if(!count) {
          return {count: 0, messages: 0, markOnly: false, unmuted: false};
        }

        const forumUnread = (manager as any).dialogsStorage
        .getForumUnreadCount(dialog.peerId, true);
        if(forumUnread && !(forumUnread instanceof Promise)) {
          const markOnly = !forumUnread.count && !!dialog.pFlags.unread_mark;
          return {
            count,
            messages: forumUnread.count,
            markOnly,
            unmuted: forumUnread.count ?
              forumUnread.hasUnmuted :
              markOnly && !isMuted
          };
        }

        return {
          count,
          messages: dialog.unread_count || 0,
          markOnly: !dialog.unread_count && !!dialog.pFlags.unread_mark,
          unmuted: !isMuted
        };
      }
    },
    peersStorage: {requestPeersForKey},
    rootScope: {
      dispatchEvent,
      myId: options.authorized === false ? 0 : USER_PEER_ID
    },
    managersReady: options.ready !== false
  });

  const appProfileManager = new AppProfileManager();
  Object.assign(appProfileManager as any, {
    apiManager: (manager as any).apiManager,
    appChatsManager: (manager as any).appChatsManager,
    appCommunitiesManager: manager,
    appGroupCallsManager: {saveGroupCall: vi.fn()},
    appMessagesIdsManager: {generateMessageId: vi.fn((messageId) => messageId)},
    appNotificationsManager: {
      ...(manager as any).appNotificationsManager,
      savePeerSettings: vi.fn()
    },
    appPeersManager: (manager as any).appPeersManager,
    appPhotosManager: (manager as any).appPhotosManager,
    appThemesManager: {saveWallPaper: vi.fn((wallpaper) => wallpaper)},
    rootScope: (manager as any).rootScope
  });
  (manager as any).appProfileManager = appProfileManager;

  return {
    manager,
    appProfileManager,
    communities,
    users,
    chats,
    pinnedOrders,
    invokeApi,
    invokeApiSingleProcess,
    getAppConfig,
    processUpdateMessage,
    saveUpdate,
    getState,
    pushToState,
    dispatchEvent,
    requestPeersForKey,
    getDialogOnly,
    getContacts,
    searchContacts,
    markDialogUnread,
    saveApiUsers,
    saveApiPeers,
    saveApiChat,
    savePinnedOrders,
    setUserLinkedCommunityId,
    setChatLinkedCommunityId,
    mirrorInvokeVoid
  };
}

describe('AppCommunitiesManager protocol routing', () => {
  test('reconciles the Community admin count after the shared chat mutation', () => {
    const {manager} = createHarness();
    const fullCommunity = makeFullCommunity();
    fullCommunity.admins_count = 1;
    saveFullCommunity(manager, fullCommunity);

    manager.handleAdminEdited({
      communityId: COMMUNITY_ID,
      previousParticipant: USER_PEER_ID,
      participant: {
        _: 'channelParticipantAdmin',
        pFlags: {},
        user_id: USER_ID,
        promoted_by: USER_ID,
        date: 1,
        admin_rights: {_: 'chatAdminRights', pFlags: {change_info: true}}
      }
    });

    expect(getCachedFullCommunity(manager, COMMUNITY_ID).admins_count).toBe(2);
    manager.handleAdminEdited({
      communityId: COMMUNITY_ID,
      previousParticipant: {
        _: 'channelParticipantAdmin',
        pFlags: {},
        user_id: USER_ID,
        promoted_by: USER_ID,
        date: 1,
        admin_rights: {_: 'chatAdminRights', pFlags: {change_info: true}}
      },
      participant: {
        _: 'channelParticipant',
        user_id: USER_ID,
        date: 1
      }
    });
    expect(getCachedFullCommunity(manager, COMMUNITY_ID).admins_count).toBe(1);
  });

  test('trusts server chat candidates while filtering only the local fallback', async() => {
    const localCandidate = makeChannel(301 as ChatId);
    localCandidate.pFlags = {creator: true, megagroup: true};
    const localBroadcast = makeChannel(302 as ChatId);
    localBroadcast.pFlags = {creator: true, broadcast: true};
    const serverCandidate = makeChannel(303 as ChatId, COMMUNITY_ID);
    serverCandidate.pFlags = {broadcast: true, monoforum: true};
    const {manager, invokeApi} = createHarness({
      chats: [localCandidate, localBroadcast]
    });
    invokeApi.mockResolvedValue({
      _: 'messages.chats',
      chats: [serverCandidate]
    });

    await expect(manager.getChatsToAdd()).resolves.toEqual([
      localCandidate,
      serverCandidate
    ]);
    expect(invokeApi).toHaveBeenCalledWith(
      'channels.getAdminedPublicChannels',
      {for_community_peer: true}
    );
  });

  test('loads a participant joined chats page and saves its peers', async() => {
    const result = {
      _: 'communities.participantJoinedChats' as const,
      creator_chat_ids: [CHANNEL_ID],
      joined_chat_ids: [CHANNEL_ID],
      chats: [makeChannel()],
      users: [makeUser()]
    };
    const {
      manager,
      invokeApi,
      saveApiPeers
    } = createHarness();
    invokeApi.mockResolvedValue(result);

    await expect(manager.getParticipantJoinedChats({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    })).resolves.toBe(result);

    expect(invokeApi).toHaveBeenCalledWith(
      'communities.getParticipantJoinedChats',
      {
        community: {
          _: 'inputChannel',
          channel_id: COMMUNITY_ID,
          access_hash: `community-${COMMUNITY_ID}`
        },
        participant: {
          _: 'inputPeerUser',
          user_id: USER_ID,
          access_hash: `user-${USER_PEER_ID}`
        }
      }
    );
    expect(saveApiPeers).toHaveBeenCalledWith(result);
  });

  test('loads, saves and filters bots that can be added', async() => {
    const availableBot = {
      ...makeUser(101 as UserId),
      pFlags: {bot: true as const}
    };
    const linkedBot = {
      ...makeUser(102 as UserId, COMMUNITY_ID),
      pFlags: {bot: true as const}
    };
    const regularUser = makeUser(103 as UserId);
    const users = [availableBot, linkedBot, regularUser];
    const {
      manager,
      invokeApi,
      saveApiUsers
    } = createHarness();
    invokeApi.mockResolvedValue(users);

    await expect(manager.getBotsToAdd()).resolves.toEqual([availableBot]);

    expect(invokeApi).toHaveBeenCalledWith('bots.getAdminedBots');
    expect(saveApiUsers).toHaveBeenCalledWith(users);
  });

  test('creates a Community with a clone-safe ChatId result', async() => {
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess,
      processUpdateMessage,
      mirrorInvokeVoid
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    const fullCommunity = makeFullCommunity();
    (community as any).nonCloneable = () => {};
    const updates = {
      _: 'updates' as const,
      updates: [] as Update[],
      users: [] as User[],
      chats: [community],
      date: 1,
      seq: 1
    };
    invokeApi.mockResolvedValue(updates);
    invokeApiSingleProcess.mockImplementation(async({method, processResult}) => {
      if(method !== 'channels.getFullChannel') {
        throw new Error(`Unexpected method ${method}`);
      }

      return processResult({
        _: 'messages.chatFull',
        full_chat: fullCommunity,
        chats: [community],
        users: []
      });
    });

    const result = await manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    });

    expect(result).toBe(COMMUNITY_ID);
    expect(structuredClone(result)).toBe(COMMUNITY_ID);
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBe(fullCommunity);
    expect(mirrorInvokeVoid).toHaveBeenCalledWith('mirror', expect.objectContaining({
      name: 'communityFull',
      key: '' + COMMUNITY_ID,
      value: fullCommunity
    }));
  });

  test('keeps a successful create result when full hydration fails', async() => {
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess,
      processUpdateMessage,
      pushToState,
      requestPeersForKey
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    const updates = {
      _: 'updates' as const,
      updates: [] as Update[],
      users: [] as User[],
      chats: [community],
      date: 1,
      seq: 1
    };
    (manager as any).joinedCommunityIds = [];
    invokeApi.mockResolvedValue(updates);
    invokeApiSingleProcess.mockRejectedValue(new Error('Hydration failed'));

    await expect(manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    })).resolves.toBe(COMMUNITY_ID);

    expect(invokeApi).toHaveBeenCalledOnce();
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
    expect(invokeApiSingleProcess.mock.calls.map(([options]) => options.method))
    .toEqual([
      'communities.getJoinedCommunities',
      'channels.getFullChannel'
    ]);
    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(pushToState).toHaveBeenCalledWith('joinedCommunityIds', [COMMUNITY_ID]);
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set([COMMUNITY_PEER_ID]),
      'community'
    );
    expect(getCachedJoinedCommunities(manager)).toEqual([community]);
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
  });

  test('does not wait for full hydration after a successful create', async() => {
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess,
      processUpdateMessage
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    const hydration = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const updates = {
      _: 'updates' as const,
      updates: [] as Update[],
      users: [] as User[],
      chats: [community],
      date: 1,
      seq: 1
    };
    invokeApi.mockResolvedValue(updates);
    invokeApiSingleProcess.mockImplementation(({processResult}) => {
      return hydration.promise.then(processResult);
    });

    await expect(manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    })).resolves.toBe(COMMUNITY_ID);

    expect(processUpdateMessage).toHaveBeenCalledWith(updates);
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();

    hydration.resolve({
      _: 'messages.chatFull',
      full_chat: makeFullCommunity(),
      chats: [community],
      users: []
    });
    await vi.waitFor(() => {
      expect(getCachedFullCommunity(manager, COMMUNITY_ID))
      .toMatchObject({_: 'communityFull'});
    });
  });

  test('reruns a stale pending joined refresh after creating a Community', async() => {
    const firstJoined = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    const updates = {
      _: 'updates' as const,
      updates: [] as Update[],
      users: [] as User[],
      chats: [community],
      date: 1,
      seq: 1
    };
    let joinedCalls = 0;
    invokeApi.mockResolvedValue(updates);
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      expect(method).toBe('communities.getJoinedCommunities');
      ++joinedCalls;
      return joinedCalls === 1 ?
        firstJoined.promise.then(processResult) :
        Promise.resolve(processResult({
          _: 'messages.chats',
          chats: [community]
        }));
    });
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());
    (manager as any).joinedCommunityIds = null;
    (manager as any).managersReady = true;

    const pendingRefresh = (manager as any).refreshJoinedCommunities();
    await manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    });
    firstJoined.resolve({_: 'messages.chats', chats: []});
    await pendingRefresh;

    await vi.waitFor(() => {
      expect(joinedCalls).toBe(2);
      expect(getCachedJoinedCommunities(manager)).toEqual([community]);
    });
  });

  test('does not apply a create response after an account lifecycle reset', async() => {
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess,
      processUpdateMessage,
      pushToState
    } = createHarness();
    const response = deferred<{
      _: 'updates',
      updates: Update[],
      users: User[],
      chats: Chat[],
      date: number,
      seq: number
    }>();
    invokeApi.mockReturnValue(response.promise);

    const operation = manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    });
    manager.clear();
    response.resolve({
      _: 'updates',
      updates: [],
      users: [],
      chats: [makeCommunity()],
      date: 1,
      seq: 1
    });

    await expect(operation).rejects.toMatchObject({type: 'CHANNEL_INVALID'});
    expect(processUpdateMessage).not.toHaveBeenCalled();
    expect(pushToState).not.toHaveBeenCalledWith(
      'joinedCommunityIds',
      [COMMUNITY_ID]
    );
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });

  test('persists a created Community before processing its peer update', async() => {
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess,
      processUpdateMessage,
      pushToState,
      saveApiPeers
    } = createHarness({handleCommunityUpdatesOnSave: true});
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    const updates = {
      _: 'updates' as const,
      updates: [] as Update[],
      users: [] as User[],
      chats: [community],
      date: 1,
      seq: 1
    };
    (manager as any).joinedCommunityIds = [];
    invokeApi.mockResolvedValue(updates);
    invokeApiSingleProcess.mockRejectedValue(new Error('Hydration failed'));
    processUpdateMessage.mockImplementation((result) => {
      saveApiPeers(result);
    });

    await expect(manager.createCommunity({
      title: 'Community',
      peerId: CHANNEL_PEER_ID
    })).resolves.toBe(COMMUNITY_ID);

    expect(pushToState).toHaveBeenCalledWith('joinedCommunityIds', [COMMUNITY_ID]);
    expect(pushToState).not.toHaveBeenCalledWith('joinedCommunityIds', null);
    expect(getCachedJoinedCommunities(manager)).toEqual([community]);
  });

  test('enables admin-only additions without replacing other server rights', async() => {
    const current: ChatBannedRights = {
      _: 'chatBannedRights',
      flags: 123,
      pFlags: {
        send_messages: true,
        invite_users: true
      },
      until_date: 99
    };
    const community = {
      ...makeCommunity(),
      default_banned_rights: current
    };
    const {manager, invokeApi} = createHarness({communities: [community]});
    invokeApi.mockResolvedValue({_: 'updatesTooLong'});

    await manager.editDefaultBannedRightsMode(COMMUNITY_ID, 'admins');

    expect(invokeApi).toHaveBeenCalledWith(
      'messages.editChatDefaultBannedRights',
      {
        peer: {
          _: 'inputPeerChannel',
          channel_id: COMMUNITY_ID,
          access_hash: `community-${COMMUNITY_ID}`
        },
        banned_rights: {
          _: 'chatBannedRights',
          flags: 123,
          pFlags: {
            send_messages: true,
            invite_users: true,
            manage_linked_peers: true
          },
          until_date: 99
        }
      }
    );
    expect(current.pFlags.manage_linked_peers).toBeUndefined();
  });

  test('restores additions for all members without dropping other server rights', async() => {
    const current: ChatBannedRights = {
      _: 'chatBannedRights',
      flags: 456,
      pFlags: {
        send_media: true,
        change_info: true,
        manage_linked_peers: true
      },
      until_date: 199
    };
    const community = {
      ...makeCommunity(),
      default_banned_rights: current
    };
    const {manager, invokeApi} = createHarness({communities: [community]});
    invokeApi.mockResolvedValue({_: 'updatesTooLong'});

    await manager.editDefaultBannedRightsMode(COMMUNITY_ID, 'all');

    expect(invokeApi).toHaveBeenCalledWith(
      'messages.editChatDefaultBannedRights',
      {
        peer: {
          _: 'inputPeerChannel',
          channel_id: COMMUNITY_ID,
          access_hash: `community-${COMMUNITY_ID}`
        },
        banned_rights: {
          _: 'chatBannedRights',
          flags: 456,
          pFlags: {
            send_media: true,
            change_info: true
          },
          until_date: 199
        }
      }
    );
    expect(current.pFlags.manage_linked_peers).toBe(true);
  });

  test('accepts the server default mode without sending a redundant mutation', async() => {
    const {manager, invokeApi} = createHarness();

    await manager.editDefaultBannedRightsMode(COMMUNITY_ID, 'all');

    expect(invokeApi).not.toHaveBeenCalled();
  });

  test.each<{
    action: CommunityPeerLinkAction,
    expectedFlags: {
      visible?: true,
      hidden?: true,
      deleted?: true
    },
    status: 'linked' | 'unlinked'
  }>([
    {action: 'visible', expectedFlags: {visible: true}, status: 'linked'},
    {action: 'hidden', expectedFlags: {hidden: true}, status: 'linked'},
    {action: 'deleted', expectedFlags: {deleted: true}, status: 'unlinked'}
  ])('sends only the $action link flag', async({action, expectedFlags, status}) => {
    const user = makeUser(USER_ID, action === 'deleted' ? COMMUNITY_ID : undefined);
    const {manager, invokeApi} = createHarness({users: [user]});
    invokeApi.mockResolvedValue(true);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());

    await expect(manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      action
    })).resolves.toEqual({status});

    const [, params] = invokeApi.mock.calls[0];
    expect(invokeApi.mock.calls[0][0]).toBe('communities.togglePeerLink');
    expect(params).toMatchObject({
      ...expectedFlags,
      community: {
        _: 'inputChannel',
        channel_id: COMMUNITY_ID,
        access_hash: `community-${COMMUNITY_ID}`
      },
      peer: {
        _: 'inputPeerUser',
        user_id: USER_ID
      }
    });
    expect(Object.entries(params)
    .filter(([key, value]) => ['visible', 'hidden', 'deleted'].includes(key) && value)
    .map(([key]) => key)).toEqual([action]);
    expect(user.linked_community_id).toBe(action === 'deleted' ? undefined : COMMUNITY_ID);
  });

  test('does not wait for full hydration after a successful link mutation', async() => {
    const user = makeUser();
    const hydration = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess
    } = createHarness({users: [user]});
    invokeApi.mockResolvedValue(true);
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      expect(method).toBe('channels.getFullChannel');
      return hydration.promise.then(processResult);
    });

    await expect(manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      action: 'visible'
    })).resolves.toEqual({status: 'linked'});
    expect(invokeApiSingleProcess).toHaveBeenCalledOnce();

    hydration.resolve({
      _: 'messages.chatFull',
      full_chat: makeFullCommunity([
        makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
      ]),
      chats: [makeCommunity()],
      users: [user]
    });
    await vi.waitFor(() => {
      expect(getCachedFullCommunity(manager, COMMUNITY_ID))
      .toMatchObject({_: 'communityFull'});
    });
  });

  test('reruns a pending full refresh after a mutation', async() => {
    const staleRefresh = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess
    } = createHarness();
    let fullFetchCount = 0;
    invokeApi.mockResolvedValue(true);
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      expect(method).toBe('channels.getFullChannel');
      ++fullFetchCount;
      if(fullFetchCount === 1) {
        return staleRefresh.promise.then(processResult);
      }

      return Promise.resolve(processResult({
        _: 'messages.chatFull',
        full_chat: {
          ...makeFullCommunity(),
          kicked_count: 1
        },
        chats: [makeCommunity()],
        users: []
      }));
    });

    (manager as any).refreshCommunityFull(COMMUNITY_ID);
    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });
    expect(fullFetchCount).toBe(1);

    staleRefresh.resolve({
      _: 'messages.chatFull',
      full_chat: {
        ...makeFullCommunity(),
        kicked_count: 0
      },
      chats: [makeCommunity()],
      users: []
    });
    await vi.waitFor(() => {
      expect(fullFetchCount).toBe(2);
      expect(getCachedFullCommunity(manager, COMMUNITY_ID)?.kicked_count).toBe(1);
    });
  });

  test.each([
    {
      action: 'visible' as const,
      initialLinked: false,
      expectedLinked: true
    },
    {
      action: 'deleted' as const,
      initialLinked: true,
      expectedLinked: false
    }
  ])('keeps full and reverse mirrors aligned when $action refresh fails', async({
    action,
    initialLinked,
    expectedLinked
  }) => {
    const user = makeUser(
      USER_ID,
      initialLinked ? COMMUNITY_ID : undefined
    );
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess
    } = createHarness({users: [user]});
    const peer = {_: 'peerUser' as const, user_id: USER_ID};
    const full = saveFullCommunity(manager, makeFullCommunity(
      initialLinked ? [makeLinkedPeer(peer)] : []
    ));
    let fullFetchCount = 0;
    invokeApi.mockResolvedValue(true);
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method !== 'channels.getFullChannel') {
        throw new Error(`Unexpected method ${method}`);
      }
      if(!fullFetchCount++) {
        return Promise.reject(new Error('Refresh failed'));
      }

      return Promise.resolve(processResult({
        _: 'messages.chatFull',
        full_chat: makeFullCommunity(
          expectedLinked ? [makeLinkedPeer(peer)] : []
        ),
        chats: [],
        users: [user]
      }));
    });

    await manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      action
    });

    expect(full.linked_peers.some((linkedPeer) => {
      return getPeerId(linkedPeer.peer) === USER_PEER_ID;
    })).toBe(expectedLinked);
    expect(user.linked_community_id === COMMUNITY_ID).toBe(expectedLinked);
    await vi.waitFor(() => {
      expect((getProfileManager(manager) as any).fullExpiration[COMMUNITY_PEER_ID]).toBe(0);
    });

    await getFullCommunity(manager, COMMUNITY_ID);
    expect(fullFetchCount).toBe(2);
  });

  test('does not clear a peer that was relinked while unlink was pending', async() => {
    const otherCommunityId = 201 as ChatId;
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const unlink = deferred<true>();
    const {
      manager,
      invokeApi,
      setUserLinkedCommunityId
    } = createHarness({users: [user]});
    invokeApi.mockReturnValue(unlink.promise);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());

    const operation = manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      action: 'deleted'
    });
    user.linked_community_id = otherCommunityId;
    unlink.resolve(true);

    await expect(operation).resolves.toEqual({status: 'unlinked'});
    expect(user.linked_community_id).toBe(otherCommunityId);
    expect(setUserLinkedCommunityId).not.toHaveBeenCalledWith(USER_ID, undefined);
  });

  test('allows an owner to unlink its chat after Community eviction', async() => {
    const channel = makeChannel(CHANNEL_ID, COMMUNITY_ID);
    const {
      manager,
      invokeApi,
      setChatLinkedCommunityId
    } = createHarness({chats: [channel]});
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);
    invokeApi.mockResolvedValue(true);

    await expect(manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: CHANNEL_PEER_ID,
      action: 'deleted'
    })).resolves.toEqual({status: 'unlinked'});

    expect(invokeApi).toHaveBeenCalledWith(
      'communities.togglePeerLink',
      expect.objectContaining({deleted: true})
    );
    expect(channel.linked_community_id).toBeUndefined();
    expect(setChatLinkedCommunityId).toHaveBeenCalledWith(
      CHANNEL_ID,
      undefined
    );
  });

  test('does not unlink a stale chat target after Community eviction', async() => {
    const channel = makeChannel(CHANNEL_ID);
    const {manager, invokeApi} = createHarness({chats: [channel]});
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);

    await expect(manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: CHANNEL_PEER_ID,
      action: 'deleted'
    })).rejects.toMatchObject({type: 'CHANNEL_INVALID'});
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('uses the official production and test-DC peer limits as fallbacks', async() => {
    const previousTestMode = Modes.test;
    const {manager, getAppConfig} = createHarness();
    getAppConfig.mockResolvedValue({});

    try {
      Modes.test = false;
      await expect(manager.getPeersLimit()).resolves.toBe(100);
      await expect(manager.getPeersLimit(true)).resolves.toBe(100);

      Modes.test = true;
      await expect(manager.getPeersLimit()).resolves.toBe(10);
      await expect(manager.getPeersLimit(true)).resolves.toBe(10);

      getAppConfig.mockResolvedValue({
        community_peers_limit: 25,
        community_bot_peers_limit: 5
      });
      await expect(manager.getPeersLimit()).resolves.toBe(25);
      await expect(manager.getPeersLimit(true)).resolves.toBe(5);
    } finally {
      Modes.test = previousTestMode;
    }
  });

  test('loads Community admin candidates from contacts', async() => {
    const contactId = 101 as UserId;
    const botId = 102 as UserId;
    const bot = makeUser(botId);
    bot.pFlags.bot = true;
    const {manager, invokeApi, getContacts} = createHarness({
      users: [makeUser(contactId), bot]
    });
    getContacts.mockResolvedValue([USER_ID, botId, contactId]);

    await expect(manager.getParticipantCandidates({
      communityId: COMMUNITY_ID,
      limit: 50
    })).resolves.toEqual({
      participantIds: [contactId.toPeerId(false)],
      nextOffset: {
        contacts: 1,
        recent: 0
      },
      isEnd: true
    });
    expect(getContacts).toHaveBeenCalledWith();
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('allows bots but not deleted users as Community ban candidates', async() => {
    const contactId = 101 as UserId;
    const botId = 102 as UserId;
    const deletedId = 103 as UserId;
    const bot = makeUser(botId);
    bot.pFlags.bot = true;
    const deleted = makeUser(deletedId);
    deleted.pFlags.deleted = true;
    const {manager, invokeApi, getContacts} = createHarness({
      users: [makeUser(contactId), bot, deleted]
    });
    getContacts.mockResolvedValue([
      USER_ID,
      botId,
      deletedId,
      contactId
    ]);

    await expect(manager.getParticipantCandidates({
      communityId: COMMUNITY_ID,
      limit: 50,
      kind: 'ban'
    })).resolves.toEqual({
      participantIds: [
        botId.toPeerId(false),
        contactId.toPeerId(false)
      ],
      nextOffset: {
        contacts: 2,
        recent: 0
      },
      isEnd: true
    });
    expect(getContacts).toHaveBeenCalledWith();
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('paginates Community admin candidates over contacts', async() => {
    const contactIds = [101, 102, 103] as UserId[];
    const {manager, invokeApi, getContacts} = createHarness({
      users: contactIds.map((userId) => makeUser(userId))
    });
    getContacts.mockResolvedValue(contactIds);

    await expect(manager.getParticipantCandidates({
      communityId: COMMUNITY_ID,
      limit: 2
    })).resolves.toEqual({
      participantIds: contactIds.slice(0, 2).map((userId) => {
        return userId.toPeerId(false);
      }),
      nextOffset: {
        contacts: 2,
        recent: 0
      },
      isEnd: false
    });
    await expect(manager.getParticipantCandidates({
      communityId: COMMUNITY_ID,
      offset: {contacts: 2, recent: 0},
      limit: 2
    })).resolves.toEqual({
      participantIds: [contactIds[2].toPeerId(false)],
      nextOffset: {
        contacts: 3,
        recent: 0
      },
      isEnd: true
    });
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('merges local and remote Community admin-candidate search', async() => {
    const contactId = 101 as UserId;
    const remoteId = 102 as UserId;
    const {
      manager,
      invokeApi,
      getContacts,
      searchContacts
    } = createHarness({
      users: [makeUser(contactId), makeUser(remoteId)]
    });
    getContacts.mockResolvedValue([contactId]);
    searchContacts.mockResolvedValue({
      my_results: [contactId.toPeerId(false)],
      results: [remoteId.toPeerId(false)]
    });

    await expect(manager.getParticipantCandidates({
      communityId: COMMUNITY_ID,
      query: 'alice',
      offset: {
        contacts: 0,
        recent: 0
      },
      limit: 10
    })).resolves.toEqual({
      participantIds: [
        contactId.toPeerId(false),
        remoteId.toPeerId(false)
      ],
      nextOffset: {
        contacts: 2,
        recent: 0
      },
      isEnd: true
    });
    expect(invokeApi).not.toHaveBeenCalled();
    expect(getContacts).toHaveBeenCalledWith('alice');
    expect(searchContacts).toHaveBeenCalledWith('alice', 10);
  });

  test('keeps the removed-users count current after ban and unban mutations', async() => {
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockResolvedValue(true);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(fullCommunity);

    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID,
      unban: true
    });
    expect(fullCommunity.kicked_count).toBe(0);

    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });
    expect(fullCommunity.kicked_count).toBe(1);
    expect(invokeApi).toHaveBeenNthCalledWith(
      1,
      'communities.toggleParticipantBanned',
      {
        unban: true,
        community: {
          _: 'inputChannel',
          channel_id: COMMUNITY_ID,
          access_hash: `community-${COMMUNITY_ID}`
        },
        participant: {
          _: 'inputPeerUser',
          user_id: USER_ID,
          access_hash: `user-${USER_PEER_ID}`
        }
      }
    );
    expect(invokeApi).toHaveBeenNthCalledWith(
      2,
      'communities.toggleParticipantBanned',
      {
        unban: undefined,
        community: {
          _: 'inputChannel',
          channel_id: COMMUNITY_ID,
          access_hash: `community-${COMMUNITY_ID}`
        },
        participant: {
          _: 'inputPeerUser',
          user_id: USER_ID,
          access_hash: `user-${USER_PEER_ID}`
        }
      }
    );
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({kicked_count: 1})
      })
    );
  });

  test('increments an omitted zero removed-users count after banning', async() => {
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, makeFullCommunity());
    invokeApi.mockResolvedValue(true);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(fullCommunity);

    expect(fullCommunity.kicked_count).toBeUndefined();

    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });

    expect(fullCommunity.kicked_count).toBe(1);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({kicked_count: 1})
      })
    );
  });

  test('decrements the removed-users count before an unban request settles', async() => {
    const mutation = deferred<true>();
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockReturnValue(mutation.promise);

    const operation = manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID,
      unban: true
    });

    expect(fullCommunity.kicked_count).toBe(0);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({kicked_count: 0})
      })
    );

    mutation.resolve(true);
    await operation;
  });

  test('restores the removed-users count when an unban request fails', async() => {
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockRejectedValue(new Error('UNBAN_FAILED'));

    await expect(manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID,
      unban: true
    })).rejects.toThrow('UNBAN_FAILED');

    expect(fullCommunity.kicked_count).toBe(1);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({kicked_count: 1})
      })
    );
  });

  test('does not restore a stale removed-users count after unbanning', async() => {
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockResolvedValue(true);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(fullCommunity);

    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID,
      unban: true
    });

    saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    expect(fullCommunity.kicked_count).toBe(0);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({kicked_count: 0})
      })
    );

    saveFullCommunity(manager, makeFullCommunity());
    expect(fullCommunity.kicked_count).toBeUndefined();

    saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    expect(fullCommunity.kicked_count).toBe(1);
  });

  test('keeps the refreshed server removed-users count authoritative', async() => {
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockResolvedValue(true);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockImplementation(async() => {
      fullCommunity.kicked_count = 4;
      return fullCommunity;
    });

    await manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });

    expect(fullCommunity.kicked_count).toBe(4);
  });

  test('does not overwrite a newer removed-users count while banning', async() => {
    const mutation = deferred<true>();
    const {manager, invokeApi} = createHarness();
    const fullCommunity = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockReturnValue(mutation.promise);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(fullCommunity);

    const operation = manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });
    saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 4
    });
    mutation.resolve(true);
    await operation;

    expect(fullCommunity.kicked_count).toBe(4);
  });

  test('does not refresh a readmitted Community for a stale ban mutation', async() => {
    const community = makeCommunity();
    const mutation = deferred<true>();
    const {
      manager,
      invokeApi,
      invokeApiSingleProcess
    } = createHarness({communities: [community]});
    saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 1
    });
    invokeApi.mockReturnValue(mutation.promise);

    const operation = manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });
    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    community.pFlags.left = undefined;
    (manager as any).evictedCommunityIds.delete(COMMUNITY_ID);
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    const readmittedFull = saveFullCommunity(manager, {
      ...makeFullCommunity(),
      kicked_count: 9
    });

    mutation.resolve(true);
    await operation;

    expect(readmittedFull.kicked_count).toBe(9);
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });
});

describe('AppCommunitiesManager permissions', () => {
  test.each<{
    permission: CommunityPermission,
    defaultBanned?: true,
    admin?: true,
    expected: boolean
  }>([
    {permission: 'change_info', expected: false},
    {permission: 'change_info', defaultBanned: true, expected: false},
    {permission: 'change_info', defaultBanned: true, admin: true, expected: true},
    {permission: 'manage_linked_peers', expected: false},
    {permission: 'manage_linked_peers', defaultBanned: true, expected: false},
    {permission: 'manage_linked_peers', defaultBanned: true, admin: true, expected: true},
    {permission: 'ban_users', expected: false},
    {permission: 'ban_users', admin: true, expected: true},
    {permission: 'add_admins', expected: false},
    {permission: 'add_admins', admin: true, expected: true}
  ])('resolves $permission from admin and default rights', ({
    permission,
    defaultBanned,
    admin,
    expected
  }) => {
    const community = makeCommunity();
    if(defaultBanned) {
      community.default_banned_rights = {
        _: 'chatBannedRights',
        pFlags: {[permission]: true},
        until_date: 0
      };
    }
    if(admin) {
      community.admin_rights = {
        _: 'chatAdminRights',
        pFlags: {[permission]: true}
      };
    }
    const {manager} = createHarness({communities: [community]});

    expect(manager.hasRights(COMMUNITY_ID, permission)).toBe(expected);
  });

  test('grants every permission to the creator but none to a left member', () => {
    const creator = makeCommunity(COMMUNITY_ID, {creator: true});
    const {manager} = createHarness({communities: [creator]});

    expect(manager.hasRights(COMMUNITY_ID, 'add_admins')).toBe(true);
    creator.pFlags = {left: true};
    expect(manager.hasRights(COMMUNITY_ID, 'change_info')).toBe(false);
  });

  test.each<{
    permission: CommunityPermission,
    expected: boolean
  }>([
    {permission: 'change_info', expected: true},
    {permission: 'manage_linked_peers', expected: true},
    {permission: 'ban_users', expected: true},
    {permission: 'add_admins', expected: true}
  ])('allows opening Edit Community for $permission', ({
    permission,
    expected
  }) => {
    const community = makeCommunity();
    community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {change_info: true},
      until_date: 0
    };
    community.admin_rights = {
      _: 'chatAdminRights',
      pFlags: {[permission]: true}
    };
    const {manager} = createHarness({communities: [community]});

    expect(manager.canEditCommunity(COMMUNITY_ID)).toBe(expected);
  });

  test('does not expose Edit Community without an actionable permission', () => {
    const community = makeCommunity();
    community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {change_info: true},
      until_date: 0
    };
    const {manager} = createHarness({communities: [community]});

    expect(manager.canEditCommunity(COMMUNITY_ID)).toBe(false);
  });

  test('does not expose Edit Community to a plain member', () => {
    // editing a Community is granted, not left over from its default rights
    const {manager} = createHarness({communities: [makeCommunity()]});

    expect(manager.canEditCommunity(COMMUNITY_ID)).toBe(false);
  });

  test('separates suggesting peers from managing linked peers', () => {
    const community = makeCommunity();
    const {manager} = createHarness({communities: [community]});

    expect(manager.canManageLinkedPeers(COMMUNITY_ID)).toBe(false);
    expect(manager.canSuggestPeers(COMMUNITY_ID)).toBe(true);

    community.default_banned_rights = {
      _: 'chatBannedRights',
      pFlags: {manage_linked_peers: true},
      until_date: 0
    };
    expect(manager.canSuggestPeers(COMMUNITY_ID)).toBe(false);

    community.admin_rights = {
      _: 'chatAdminRights',
      pFlags: {manage_linked_peers: true}
    };
    expect(manager.canManageLinkedPeers(COMMUNITY_ID)).toBe(true);
    expect(manager.canSuggestPeers(COMMUNITY_ID)).toBe(true);
  });

  test('hides permissions after authoritative membership eviction', () => {
    const community = makeCommunity(COMMUNITY_ID, {creator: true});
    const {manager} = createHarness({communities: [community]});

    expect(manager.hasRights(COMMUNITY_ID, 'add_admins')).toBe(true);
    expect(manager.canEditCommunity(COMMUNITY_ID)).toBe(true);
    expect(manager.canSuggestPeers(COMMUNITY_ID)).toBe(true);

    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];

    expect(manager.hasRights(COMMUNITY_ID, 'add_admins')).toBe(false);
    expect(manager.canEditCommunity(COMMUNITY_ID)).toBe(false);
    expect(manager.canManageLinkedPeers(COMMUNITY_ID)).toBe(false);
    expect(manager.canSuggestPeers(COMMUNITY_ID)).toBe(false);
  });
});


describe('AppCommunitiesManager full state', () => {
  test('shares a non-overwrite full request without dropping its result', async() => {
    const {manager, invokeApiSingleProcess} = createHarness();
    const result = {
      _: 'messages.chatFull' as const,
      full_chat: makeFullCommunity(),
      chats: [makeCommunity()],
      users: [] as User[]
    };
    let resolveResult: (value: typeof result) => void;
    const response = new Promise<typeof result>((resolve) => {
      resolveResult = resolve;
    });
    let sharedPromise: Promise<ChatFull.communityFull>;
    invokeApiSingleProcess.mockImplementation((options) => {
      sharedPromise ||= response.then(options.processResult);
      return sharedPromise;
    });

    const first = getFullCommunity(manager, COMMUNITY_ID);
    const second = getFullCommunity(manager, COMMUNITY_ID);
    resolveResult!(result);

    await expect(first).resolves.toEqual(result.full_chat);
    await expect(second).resolves.toBe(result.full_chat);
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBe(result.full_chat);
  });

  test('exposes a void full loader instead of returning a mutable cached object', async() => {
    const {manager, invokeApiSingleProcess} = createHarness();
    const fullCommunity = saveFullCommunity(manager, makeFullCommunity());
    (fullCommunity as any).nonCloneable = () => {};

    await expect(loadFullCommunity(manager, COMMUNITY_ID)).resolves.toBeUndefined();
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });

  test('mirrors full state and exposes detached snapshots', () => {
    const {manager, mirrorInvokeVoid} = createHarness();
    const fullCommunity = saveFullCommunity(manager, makeFullCommunity());
    const mirrorCall = [...mirrorInvokeVoid.mock.calls].reverse().find((call) => {
      const payload = call[1];
      return payload.name === 'communityFull' && payload.key === '' + COMMUNITY_ID;
    });

    expect(mirrorCall?.[1].value).toEqual(fullCommunity);
    fullCommunity.about = 'Changed after mirroring';
    expect(mirrorCall?.[1].value.about).toBe('About');

    const snapshot = getCommunityFullMirror(manager);
    snapshot[COMMUNITY_ID].about = 'Changed snapshot';
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)?.about).toBe('Changed after mirroring');
  });

  test('treats linked_peers as authoritative and explicitly clears removed links', () => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const channel = makeChannel(CHANNEL_ID, COMMUNITY_ID);
    const {
      manager,
      mirrorInvokeVoid,
      setUserLinkedCommunityId,
      setChatLinkedCommunityId
    } = createHarness({
      users: [user],
      chats: [channel]
    });
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([USER_PEER_ID])
    );

    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
    ]));

    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(channel.linked_community_id).toBeUndefined();
    expect(setChatLinkedCommunityId).toHaveBeenCalledWith(CHANNEL_ID, undefined);

    saveFullCommunity(manager, makeFullCommunity());

    expect(user.linked_community_id).toBeUndefined();
    expect(setUserLinkedCommunityId).toHaveBeenLastCalledWith(USER_ID, undefined);
    const communityFullMirror = [...mirrorInvokeVoid.mock.calls]
    .reverse()
    .find((call) => call[1].name === 'communityFull');
    expect(communityFullMirror).toEqual(['mirror', expect.objectContaining({
      name: 'communityFull',
      key: '' + COMMUNITY_ID,
      value: expect.objectContaining({linked_peers: []})
    })]);
  });

  test('atomically tears down all cached state when a Community becomes unavailable', () => {
    const community = makeCommunity();
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const channel = makeChannel(CHANNEL_ID, COMMUNITY_ID);
    const {
      manager,
      requestPeersForKey,
      pushToState
    } = createHarness({
      communities: [community],
      users: [user],
      chats: [channel]
    });
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID}),
      makeLinkedPeer({_: 'peerChannel', channel_id: CHANNEL_ID})
    ]));
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    (manager as any).communityDialogs[COMMUNITY_ID] = {
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    };
    (manager as any).peerLinkRequests.set(COMMUNITY_ID, {
      loaded: true,
      totalCount: 0,
      requests: []
    });

    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(manager.getCommunityDialogsCount()).toBe(0);
    expect(getCachedJoinedCommunities(manager)).toEqual([]);
    expect((manager as any).linkedPeerIds.has(COMMUNITY_ID)).toBe(false);
    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(channel.linked_community_id).toBe(COMMUNITY_ID);
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set(),
      `community_${COMMUNITY_ID}`
    );
    expect(pushToState).toHaveBeenCalledWith('joinedCommunityIds', []);
    expect(pushToState).toHaveBeenCalledWith('communityDialogs', {});
  });

  test('evicts stale state when the authoritative joined list drops a Community', async() => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const {
      manager,
      invokeApiSingleProcess,
      pinnedOrders,
      savePinnedOrders
    } = createHarness({users: [user]});
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
    ], 1));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    (manager as any).peerLinkRequests.set(COMMUNITY_ID, {
      loaded: true,
      totalCount: 1,
      requests: [makeRequest({_: 'peerUser', user_id: USER_ID}, 1)]
    });
    invokeApiSingleProcess.mockImplementation(async({processResult}) => {
      return processResult({
        _: 'messages.chats',
        chats: []
      });
    });

    await expect(manager.getJoinedCommunities(true)).resolves.toEqual([]);

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toBeUndefined();
    expect(manager.getCommunityDialogsCount()).toBe(0);
    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(pinnedOrders[0]).not.toContain(COMMUNITY_PEER_ID);
    expect(savePinnedOrders).toHaveBeenCalled();
  });

  test('does not restore a late dialogCommunity after authoritative eviction', async() => {
    const {
      manager,
      invokeApiSingleProcess,
      pinnedOrders,
      pushToState
    } = createHarness();
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    invokeApiSingleProcess.mockImplementation(async({processResult}) => {
      return processResult({
        _: 'messages.chats',
        chats: []
      });
    });

    await manager.getJoinedCommunities(true);
    pushToState.mockClear();
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    expect(manager.getCommunityDialogsCount()).toBe(0);
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toBeUndefined();
    expect(pinnedOrders[0]).not.toContain(COMMUNITY_PEER_ID);
    expect(pushToState).not.toHaveBeenCalled();
  });

  test('evicts tracked state from the first authoritative list after cache invalidation', async() => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const {
      manager,
      invokeApiSingleProcess,
      pinnedOrders,
      requestPeersForKey
    } = createHarness({users: [user]});
    (manager as any).joinedCommunityIds = null;
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
    ], 1));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    (manager as any).peerLinkRequests.set(COMMUNITY_ID, {
      loaded: true,
      totalCount: 1,
      requests: [makeRequest({_: 'peerUser', user_id: USER_ID}, 1)]
    });
    invokeApiSingleProcess.mockImplementation(async({processResult}) => {
      return processResult({
        _: 'messages.chats',
        chats: []
      });
    });

    await expect(manager.getJoinedCommunities(true)).resolves.toEqual([]);

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(manager.getCommunityDialogsCount()).toBe(0);
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toBeUndefined();
    expect(getCachedJoinedCommunities(manager)).toEqual([]);
    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(pinnedOrders[0]).not.toContain(COMMUNITY_PEER_ID);
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set(),
      `community_${COMMUNITY_ID}`
    );
  });

  test('applies mixed joined-list additions and removals through real update ordering', async() => {
    const addedCommunity = makeCommunity(201 as ChatId);
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const {
      manager,
      invokeApiSingleProcess,
      pushToState
    } = createHarness({
      users: [user],
      handleCommunityUpdatesOnSave: true
    });
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
    ]));
    invokeApiSingleProcess.mockImplementation(async({processResult}) => {
      return processResult({
        _: 'messages.chats',
        chats: [addedCommunity]
      });
    });

    await expect(manager.getJoinedCommunities(true)).resolves.toEqual([
      addedCommunity
    ]);

    expect(getCachedJoinedCommunities(manager)).toEqual([addedCommunity]);
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(pushToState).toHaveBeenCalledWith(
      'joinedCommunityIds',
      [201 as ChatId]
    );
    expect(pushToState).not.toHaveBeenCalledWith('joinedCommunityIds', null);
  });

  test('evicts state after a Community becomes unavailable', () => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const {
      manager,
      communities,
      pinnedOrders
    } = createHarness({users: [user]});
    (manager as any).joinedCommunityIds = null;
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
    ]));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    communities[+COMMUNITY_ID].pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toBeUndefined();
    expect(getCachedJoinedCommunities(manager)).toBeNull();
    expect(user.linked_community_id).toBe(COMMUNITY_ID);
    expect(pinnedOrders[0]).not.toContain(COMMUNITY_PEER_ID);
  });

  test('ignores a full response that resolves after the Community became unavailable', async() => {
    const community = makeCommunity();
    const user = makeUser();
    const response = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {
      manager,
      invokeApiSingleProcess,
      saveApiPeers
    } = createHarness({
      communities: [community],
      users: [user]
    });
    invokeApiSingleProcess.mockImplementation(({processResult}) => {
      return response.promise.then(processResult);
    });

    const request = getFullCommunity(manager, COMMUNITY_ID, true);
    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    response.resolve({
      _: 'messages.chatFull',
      full_chat: makeFullCommunity([
        makeLinkedPeer({_: 'peerUser', user_id: USER_ID})
      ]),
      chats: [makeCommunity()],
      users: [user]
    });

    await expect(request).resolves.toMatchObject({_: 'communityFull'});
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(user.linked_community_id).toBeUndefined();
    expect(saveApiPeers).not.toHaveBeenCalled();
  });

  test('stops a reload after the Community becomes unavailable', async() => {
    const community = makeCommunity();
    const staleCommunity = makeCommunity();
    const joinedResponse = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const fullResponse = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {
      manager,
      invokeApiSingleProcess,
      saveApiPeers
    } = createHarness({communities: [community]});
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method === 'communities.getJoinedCommunities') {
        return joinedResponse.promise.then(processResult);
      }
      if(method === 'channels.getFullChannel') {
        return fullResponse.promise.then(processResult);
      }

      throw new Error(`Unexpected method ${method}`);
    });

    const request = manager.reloadCommunity(COMMUNITY_ID);
    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    joinedResponse.resolve({
      _: 'messages.chats',
      chats: [staleCommunity]
    });
    fullResponse.resolve({
      _: 'messages.chatFull',
      full_chat: makeFullCommunity(),
      chats: [staleCommunity],
      users: []
    });

    await expect(request).resolves.toBeUndefined();
    expect(invokeApiSingleProcess.mock.calls.map(([options]) => options.method)).toEqual([
      'communities.getJoinedCommunities'
    ]);
    expect(getCommunity(manager, COMMUNITY_ID)).toBe(community);
    expect(community.pFlags.left).toBe(true);
    expect(saveApiPeers).not.toHaveBeenCalled();
  });

  test('does not rehydrate full state after an authoritative joined-list eviction', async() => {
    const {
      manager,
      invokeApiSingleProcess
    } = createHarness();
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    saveFullCommunity(manager, makeFullCommunity());
    invokeApiSingleProcess.mockImplementation(async({method, processResult}) => {
      if(method !== 'communities.getJoinedCommunities') {
        throw new Error(`Unexpected method ${method}`);
      }

      return processResult({
        _: 'messages.chats',
        chats: []
      });
    });

    await expect(manager.reloadCommunity(COMMUNITY_ID)).resolves.toBeUndefined();

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(invokeApiSingleProcess.mock.calls.map(([options]) => options.method))
    .toEqual(['communities.getJoinedCommunities']);
  });

  test('rejects later full hydration after an authoritative joined-list eviction', async() => {
    const {
      manager,
      invokeApiSingleProcess,
      saveApiPeers
    } = createHarness();
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    invokeApiSingleProcess.mockImplementation(async({method, processResult}) => {
      if(method === 'communities.getJoinedCommunities') {
        return processResult({
          _: 'messages.chats',
          chats: []
        });
      }
      if(method === 'channels.getFullChannel') {
        return processResult({
          _: 'messages.chatFull',
          full_chat: makeFullCommunity(),
          chats: [makeCommunity()],
          users: []
        });
      }

      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getJoinedCommunities(true);
    saveApiPeers.mockClear();
    await expect(getFullCommunity(manager, COMMUNITY_ID, true))
    .resolves.toMatchObject({_: 'communityFull'});

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();
    expect(saveApiPeers).not.toHaveBeenCalled();
  });

  test('ignores link requests that resolve after the Community became unavailable', async() => {
    const community = makeCommunity();
    const response = deferred<CommunitiesPeerLinkRequests.communitiesPeerLinkRequests>();
    const {
      manager,
      invokeApi,
      saveApiPeers
    } = createHarness({communities: [community]});
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return response.promise;
      }

      throw new Error(`Unexpected method ${method}`);
    });

    const request = manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    response.resolve({
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [makeRequest({_: 'peerUser', user_id: USER_ID}, 1)],
      chats: [],
      users: [makeUser()]
    });

    await expect(request).resolves.toMatchObject({total_count: 1});
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(saveApiPeers).not.toHaveBeenCalled();
    expect(mirrorInvokeVoid).toHaveBeenCalledWith('mirror', expect.objectContaining({
      name: 'communityPeerLinkRequests',
      key: '' + COMMUNITY_ID,
      value: undefined
    }));
  });

  test('does not restore a stale joined list after a leave update', async() => {
    const community = makeCommunity();
    const staleCommunity = makeCommunity();
    const response = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {
      manager,
      invokeApiSingleProcess,
      saveApiPeers
    } = createHarness({communities: [community]});
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    invokeApiSingleProcess.mockImplementation(({processResult}) => {
      return response.promise.then(processResult);
    });

    const request = manager.getJoinedCommunities(true);
    community.pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    response.resolve({
      _: 'messages.chats',
      chats: [staleCommunity]
    });

    await expect(request).resolves.toEqual([staleCommunity]);
    expect(getCachedJoinedCommunities(manager)).toEqual([]);
    expect(saveApiPeers).not.toHaveBeenCalled();
  });

  test('rebuilds the reverse link index from cached users and chats on restore', async() => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const channel = makeChannel(CHANNEL_ID, COMMUNITY_ID);
    const {manager, requestPeersForKey} = createHarness({
      users: [user],
      chats: [channel]
    });

    await (manager as any).restorePersistentState();

    expect((manager as any).linkedPeerIds.get(COMMUNITY_ID)).toEqual(
      new Set([USER_PEER_ID, CHANNEL_PEER_ID])
    );
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set([USER_PEER_ID, CHANNEL_PEER_ID]),
      `community_${COMMUNITY_ID}`
    );
  });

  test('rebuilds cached links when an evicted Community is readmitted', async() => {
    const user = makeUser(USER_ID, COMMUNITY_ID);
    const channel = makeChannel(CHANNEL_ID, COMMUNITY_ID);
    const {
      manager,
      invokeApiSingleProcess,
      requestPeersForKey
    } = createHarness({
      users: [user],
      chats: [channel]
    });
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([USER_PEER_ID, CHANNEL_PEER_ID])
    );
    const responses = [{
      _: 'messages.chats' as const,
      chats: [] as Chat[]
    }, {
      _: 'messages.chats' as const,
      chats: [makeCommunity()] as Chat[]
    }];
    invokeApiSingleProcess.mockImplementation(async({method, processResult}) => {
      expect(method).toBe('communities.getJoinedCommunities');
      return processResult(responses.shift());
    });
    const loadFullCommunity = vi.spyOn(getProfileManager(manager), 'getChatFull')
    .mockRejectedValue(new Error('Full unavailable'));

    await manager.getJoinedCommunities(true);
    expect((manager as any).linkedPeerIds.has(COMMUNITY_ID)).toBe(false);

    await manager.getJoinedCommunities(true);

    expect((manager as any).linkedPeerIds.get(COMMUNITY_ID)).toEqual(
      new Set([USER_PEER_ID, CHANNEL_PEER_ID])
    );
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set([USER_PEER_ID, CHANNEL_PEER_ID]),
      `community_${COMMUNITY_ID}`
    );
    expect(loadFullCommunity).toHaveBeenCalledWith(COMMUNITY_ID, true);
  });

  test('starts fresh full hydration when a Community is readmitted', async() => {
    const oldFull = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const newFull = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {manager, invokeApiSingleProcess} = createHarness();
    let joinedCalls = 0;
    let fullCalls = 0;
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method === 'communities.getJoinedCommunities') {
        return Promise.resolve(processResult({
          _: 'messages.chats',
          chats: joinedCalls++ ? [makeCommunity()] : []
        }));
      }
      if(method === 'channels.getFullChannel') {
        return (++fullCalls === 1 ? oldFull : newFull)
        .promise.then(processResult);
      }

      throw new Error(`Unexpected method ${method}`);
    });
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];

    const oldHydration = (manager as any).refreshCommunityFull(COMMUNITY_ID);
    await manager.getJoinedCommunities(true);
    await manager.getJoinedCommunities(true);

    expect(fullCalls).toBe(2);

    const staleFull = makeFullCommunity();
    staleFull.about = 'Stale';
    oldFull.resolve({
      _: 'messages.chatFull',
      full_chat: staleFull,
      chats: [makeCommunity()],
      users: []
    });
    await oldHydration;
    expect(getCachedFullCommunity(manager, COMMUNITY_ID)).toBeUndefined();

    const freshFull = makeFullCommunity();
    freshFull.about = 'Fresh';
    newFull.resolve({
      _: 'messages.chatFull',
      full_chat: freshFull,
      chats: [makeCommunity()],
      users: []
    });
    await vi.waitFor(() => {
      expect(getCachedFullCommunity(manager, COMMUNITY_ID)?.about)
      .toBe('Fresh');
    });
  });

  test('persists the joined list and reuses it without another request', async() => {
    const active = makeCommunity();
    const left = makeCommunity(201 as ChatId, {left: true});
    const result = {
      _: 'messages.chats' as const,
      chats: [active, left]
    };
    const {
      manager,
      invokeApiSingleProcess,
      pushToState,
      saveApiPeers
    } = createHarness({communities: []});
    invokeApiSingleProcess.mockImplementation(async({processResult}) => processResult(result));

    await expect(manager.getJoinedCommunities()).resolves.toEqual([active]);
    await expect(manager.getJoinedCommunities()).resolves.toEqual([active]);

    expect(invokeApiSingleProcess).toHaveBeenCalledOnce();
    expect(saveApiPeers).toHaveBeenCalledWith(result);
    expect(pushToState).toHaveBeenCalledWith('joinedCommunityIds', [COMMUNITY_ID]);
    expect(getCachedJoinedCommunities(manager)).toEqual([active]);
  });

  test('gets only the joined list without hydrating every Community full', async() => {
    const {manager, invokeApiSingleProcess} = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    (community as any).nonCloneable = () => {};
    (manager as any).joinedCommunityIds = [COMMUNITY_ID];
    const loadFullCommunity = vi.spyOn(getProfileManager(manager), 'getChatFull')
    .mockResolvedValue(makeFullCommunity());

    await expect(manager.getJoinedCommunities()).resolves.toEqual([community]);
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
    expect(loadFullCommunity).not.toHaveBeenCalled();
  });

  test('does not request joined communities for an unauthorized account slot', async() => {
    const {manager, invokeApiSingleProcess} = createHarness({
      communities: [],
      authorized: false
    });

    await expect(manager.getJoinedCommunities(true)).resolves.toEqual([]);
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });

  test('coalesces automatic joined-community refreshes', async() => {
    const response = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {manager, invokeApiSingleProcess} = createHarness({communities: []});
    invokeApiSingleProcess.mockImplementation(({processResult}) => {
      return response.promise.then(processResult);
    });
    (manager as any).managersReady = true;

    const refreshPromise = (manager as any).refreshJoinedCommunities();
    (manager as any).refreshJoinedCommunities();

    expect(invokeApiSingleProcess).toHaveBeenCalledOnce();
    response.resolve({_: 'messages.chats', chats: []});
    await refreshPromise;
  });

  test('reruns an automatic refresh invalidated by an unknown active Community', async() => {
    const firstResponse = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const secondResponse = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {
      manager,
      invokeApiSingleProcess
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    let requestIndex = 0;
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method !== 'communities.getJoinedCommunities') {
        throw new Error(`Unexpected method ${method}`);
      }

      const response = requestIndex++ ? secondResponse : firstResponse;
      return response.promise.then(processResult);
    });
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());
    (manager as any).joinedCommunityIds = [201 as ChatId];
    (manager as any).managersReady = true;

    const refreshPromise = (manager as any).refreshJoinedCommunities();
    manager.handleCommunityUpdate(COMMUNITY_ID);
    firstResponse.resolve({_: 'messages.chats', chats: []});
    await refreshPromise;
    await vi.waitFor(() => {
      expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
    });
    secondResponse.resolve({
      _: 'messages.chats',
      chats: [community]
    });
    await vi.waitFor(() => {
      expect(getCachedJoinedCommunities(manager)).toEqual([community]);
    });
  });

  test('coalesces updateChannel bursts into one authoritative joined rerun', async() => {
    const joined = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const full = deferred<{
      _: 'messages.chatFull',
      full_chat: ChatFull.communityFull,
      chats: Chat[],
      users: User[]
    }>();
    const {manager, invokeApiSingleProcess} = createHarness();
    let joinedCalls = 0;
    let fullCalls = 0;
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method === 'communities.getJoinedCommunities') {
        ++joinedCalls;
        return joinedCalls === 1 ?
          joined.promise.then(processResult) :
          Promise.resolve(processResult({
            _: 'messages.chats',
            chats: [makeCommunity()]
          }));
      }
      if(method === 'channels.getFullChannel') {
        ++fullCalls;
        return fullCalls === 1 ?
          full.promise.then(processResult) :
          Promise.resolve(processResult({
            _: 'messages.chatFull',
            full_chat: makeFullCommunity(),
            chats: [makeCommunity()],
            users: []
          }));
      }

      throw new Error(`Unexpected method ${method}`);
    });

    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});
    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});
    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});

    expect(joinedCalls).toBe(1);
    expect(fullCalls).toBe(1);

    joined.resolve({
      _: 'messages.chats',
      chats: [makeCommunity()]
    });
    full.resolve({
      _: 'messages.chatFull',
      full_chat: makeFullCommunity(),
      chats: [makeCommunity()],
      users: []
    });

    await vi.waitFor(() => {
      expect(joinedCalls).toBe(2);
      expect(fullCalls).toBe(2);
    });
  });

  test('evicts a Community when the updateChannel rerun excludes it', async() => {
    const firstJoined = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const secondJoined = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {
      manager,
      invokeApiSingleProcess
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    let joinedCalls = 0;
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method !== 'communities.getJoinedCommunities') {
        throw new Error(`Unexpected method ${method}`);
      }

      ++joinedCalls;
      return (joinedCalls === 1 ? firstJoined : secondJoined)
      .promise.then(processResult);
    });
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());

    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});
    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});
    firstJoined.resolve({
      _: 'messages.chats',
      chats: [community]
    });
    await vi.waitFor(() => expect(joinedCalls).toBe(2));
    secondJoined.resolve({
      _: 'messages.chats',
      chats: []
    });

    await vi.waitFor(() => {
      expect(getCachedJoinedCommunities(manager)).toEqual([]);
    });
  });

  test('refreshes Community full even when the joined refresh fails', async() => {
    const {manager, invokeApiSingleProcess} = createHarness();
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      if(method === 'communities.getJoinedCommunities') {
        return Promise.reject(new Error('Joined refresh failed'));
      }
      if(method === 'channels.getFullChannel') {
        return Promise.resolve(processResult({
          _: 'messages.chatFull',
          full_chat: makeFullCommunity(),
          chats: [makeCommunity()],
          users: []
        }));
      }

      throw new Error(`Unexpected method ${method}`);
    });

    (manager as any).onUpdateChannel({channel_id: COMMUNITY_ID});

    await vi.waitFor(() => {
      expect(getCachedFullCommunity(manager, COMMUNITY_ID))
      .toMatchObject({_: 'communityFull'});
    });
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(
      expect.objectContaining({method: 'communities.getJoinedCommunities'})
    );
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(
      expect.objectContaining({method: 'channels.getFullChannel'})
    );
  });

  test('ignores participant updates for an evicted Community', () => {
    const {manager, invokeApiSingleProcess} = createHarness();
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);

    (manager as any).onUpdateChannelParticipant({channel_id: COMMUNITY_ID});

    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });

  test('records and refreshes an unknown active Community', () => {
    const {
      manager,
      invokeApiSingleProcess,
      pushToState
    } = createHarness();
    invokeApiSingleProcess.mockResolvedValue([]);
    (manager as any).joinedCommunityIds = [201 as ChatId];
    (manager as any).managersReady = true;

    manager.handleCommunityUpdate(COMMUNITY_ID);

    expect(pushToState).toHaveBeenCalledWith(
      'joinedCommunityIds',
      [201 as ChatId, COMMUNITY_ID]
    );
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'communities.getJoinedCommunities',
      options: {overwrite: true}
    }));
  });

  test('reruns a stale joined refresh after receiving a Community dialog', async() => {
    const firstJoined = deferred<{
      _: 'messages.chats',
      chats: Chat[]
    }>();
    const {
      manager,
      invokeApiSingleProcess
    } = createHarness();
    const community = getCommunity(manager, COMMUNITY_ID) as Chat.community;
    let joinedCalls = 0;
    invokeApiSingleProcess.mockImplementation(({method, processResult}) => {
      expect(method).toBe('communities.getJoinedCommunities');
      ++joinedCalls;
      return joinedCalls === 1 ?
        firstJoined.promise.then(processResult) :
        Promise.resolve(processResult({
          _: 'messages.chats',
          chats: [community]
        }));
    });
    (manager as any).joinedCommunityIds = null;
    (manager as any).managersReady = true;

    const pendingRefresh = (manager as any).refreshJoinedCommunities();
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    firstJoined.resolve({_: 'messages.chats', chats: []});
    await pendingRefresh;

    await vi.waitFor(() => {
      expect(joinedCalls).toBe(2);
      expect(getCachedJoinedCommunities(manager)).toEqual([community]);
      expect(manager.getCommunityDialog(COMMUNITY_ID))
      .toMatchObject({communityId: COMMUNITY_ID});
    });
  });

  test('defers a linked-peer projection until dialogs storage is initialized', () => {
    const {
      manager,
      getDialogOnly,
      mirrorInvokeVoid
    } = createHarness({authorized: false, ready: false});
    getDialogOnly.mockImplementation(() => {
      throw new Error('dialogs storage is not initialized');
    });

    manager.handlePeerLinkedCommunityUpdate({
      peerId: USER_PEER_ID,
      communityId: COMMUNITY_ID
    });

    expect(getDialogOnly).not.toHaveBeenCalled();
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toBeUndefined();
    expect((manager as any).pendingCommunityDialogRecomputes).toEqual(
      new Set([COMMUNITY_ID])
    );

    getDialogOnly.mockImplementation(() => undefined);
    (manager as any).onManagersReady();

    expect(getDialogOnly).toHaveBeenCalledWith(USER_PEER_ID);
    expect((manager as any).pendingCommunityDialogRecomputes.size).toBe(0);
    expect(manager.getCommunityDialog(COMMUNITY_ID)).toMatchObject({
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      dialogs: []
    });
    expect(mirrorInvokeVoid).toHaveBeenCalledWith('mirror', expect.objectContaining({
      name: 'communityDialogs',
      key: '' + COMMUNITY_ID
    }));
  });

  test('updates the reverse index directly when a peer link changes', () => {
    const {manager, requestPeersForKey} = createHarness();

    manager.handlePeerLinkedCommunityUpdate({
      peerId: USER_PEER_ID,
      communityId: COMMUNITY_ID
    });

    expect((manager as any).linkedPeerIds.get(COMMUNITY_ID)).toEqual(
      new Set([USER_PEER_ID])
    );
    expect(requestPeersForKey).toHaveBeenCalledWith(
      new Set([USER_PEER_ID]),
      `community_${COMMUNITY_ID}`
    );

    manager.handlePeerLinkedCommunityUpdate({
      peerId: USER_PEER_ID,
      previousCommunityId: COMMUNITY_ID
    });

    expect((manager as any).linkedPeerIds.has(COMMUNITY_ID)).toBe(false);
  });

  test('removes a remotely moved peer from the cached old Community', () => {
    const {
      manager,
      mirrorInvokeVoid
    } = createHarness({
      chats: [makeChannel(CHANNEL_ID, COMMUNITY_ID)],
      ready: false
    });
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerChannel', channel_id: CHANNEL_ID})
    ]));
    mirrorInvokeVoid.mockClear();

    manager.handlePeerLinkedCommunityUpdate({
      peerId: CHANNEL_PEER_ID,
      previousCommunityId: COMMUNITY_ID
    });

    expect(getCachedFullCommunity(manager, COMMUNITY_ID)?.linked_peers)
    .toEqual([]);
    expect(mirrorInvokeVoid).toHaveBeenCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityFull',
        key: String(COMMUNITY_ID),
        value: expect.objectContaining({linked_peers: []})
      })
    );
  });

  test('invalidates a linked channel row when its inherited notifications change', () => {
    const dialog = {
      _: 'dialog',
      peerId: CHANNEL_PEER_ID,
      pFlags: {}
    };
    const {
      manager,
      dispatchEvent,
      getDialogOnly
    } = createHarness({chats: [makeChannel()]});
    getDialogOnly.mockReturnValue(dialog);

    manager.handlePeerLinkedCommunityUpdate({
      peerId: CHANNEL_PEER_ID,
      communityId: COMMUNITY_ID
    });

    expect(dispatchEvent).toHaveBeenCalledWith(
      'dialog_notify_settings',
      dialog
    );

    dispatchEvent.mockClear();
    manager.handlePeerLinkedCommunityUpdate({
      peerId: USER_PEER_ID,
      communityId: COMMUNITY_ID
    });
    expect(dispatchEvent).not.toHaveBeenCalledWith(
      'dialog_notify_settings',
      expect.anything()
    );
  });
});

describe('AppCommunitiesManager link requests', () => {
  test('applies pending join request updates to Community state immediately', async() => {
    const request = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const {manager, invokeApi} = createHarness({chats: [makeChannel()]});
    const full = saveFullCommunity(manager, makeFullCommunity([], 1));
    invokeApi.mockResolvedValue({
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    } satisfies CommunitiesPeerLinkRequests.communitiesPeerLinkRequests);
    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});

    expect(manager.handlePendingJoinRequestsUpdate({
      _: 'updatePendingJoinRequests',
      peer: {_: 'peerChannel', channel_id: COMMUNITY_ID},
      requests_pending: 2,
      recent_requesters: []
    })).toBe(true);
    expect(full.peer_link_requests_pending).toBe(2);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: false,
      totalCount: 2,
      requests: [request]
    });

    manager.handlePendingJoinRequestsUpdate({
      _: 'updatePendingJoinRequests',
      peer: {_: 'peerChannel', channel_id: COMMUNITY_ID},
      requests_pending: 0,
      recent_requesters: []
    });
    expect(full.peer_link_requests_pending).toBe(0);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: true,
      totalCount: 0,
      requests: []
    });
  });

  test('leaves ordinary pending join request updates to the invites manager', () => {
    const {manager} = createHarness();

    expect(manager.handlePendingJoinRequestsUpdate({
      _: 'updatePendingJoinRequests',
      peer: {_: 'peerChannel', channel_id: CHANNEL_ID},
      requests_pending: 1,
      recent_requesters: []
    })).toBe(false);
    expect(getCachedPeerLinkRequests(manager, CHANNEL_ID)).toBeUndefined();
  });

  test('keeps only compatible stale requests when a fresh full changes server state', async() => {
    const requestA = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const requestB = makeRequest({_: 'peerChannel', channel_id: 301}, 2);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 2,
      requests: [requestA, requestB],
      chats: [],
      users: []
    };
    const {manager, invokeApi} = createHarness({
      chats: [makeChannel(), makeChannel(301 as ChatId)]
    });
    saveFullCommunity(manager, makeFullCommunity([], 2));
    invokeApi.mockResolvedValue(initial);

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)?.totalCount).toBe(2);

    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer(requestA.peer)
    ], 2));

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: false,
      totalCount: 2,
      requests: [requestB]
    });
    expect(mirrorInvokeVoid).toHaveBeenCalledWith('mirror', expect.objectContaining({
      name: 'communityPeerLinkRequests',
      key: '' + COMMUNITY_ID,
      value: {
        loaded: false,
        totalCount: 2,
        requests: [requestB]
      }
    }));
  });

  test('marks loaded requests stale on a fresh full without blanking the list', async() => {
    const request = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    };
    const {manager, invokeApi} = createHarness({chats: [makeChannel()]});
    saveFullCommunity(manager, makeFullCommunity([], 1));
    invokeApi.mockResolvedValue(initial);

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    saveFullCommunity(manager, makeFullCommunity([], 1));

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: false,
      totalCount: 1,
      requests: [request]
    });
    expect(mirrorInvokeVoid).toHaveBeenCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityPeerLinkRequests',
        key: '' + COMMUNITY_ID,
        value: {
          loaded: false,
          totalCount: 1,
          requests: [request]
        }
      })
    );
  });

  test('does not let an older in-flight request page overwrite a fresh full', async() => {
    const request = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const staleResponse = deferred<
      CommunitiesPeerLinkRequests.communitiesPeerLinkRequests
    >();
    const {manager, invokeApi} = createHarness({chats: [makeChannel()]});
    const full = saveFullCommunity(manager, makeFullCommunity([], 1));
    invokeApi.mockReturnValue(staleResponse.promise);

    const operation = manager.getPeerLinkRequests({
      communityId: COMMUNITY_ID
    });
    saveFullCommunity(manager, makeFullCommunity([], 0));
    staleResponse.resolve({
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    });
    await operation;

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(full.peer_link_requests_pending).toBe(0);
  });

  test('refetches an initial request page invalidated by a fresh full', async() => {
    const staleRequest = makeRequest({
      _: 'peerChannel',
      channel_id: CHANNEL_ID
    }, 1);
    const freshRequest = makeRequest({
      _: 'peerChannel',
      channel_id: 301
    }, 2);
    const staleResponse = deferred<
      CommunitiesPeerLinkRequests.communitiesPeerLinkRequests
    >();
    const {manager, invokeApi} = createHarness({
      chats: [makeChannel(), makeChannel(301 as ChatId)]
    });
    saveFullCommunity(manager, makeFullCommunity([], 1));
    invokeApi
    .mockReturnValueOnce(staleResponse.promise)
    .mockResolvedValueOnce({
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [freshRequest],
      chats: [],
      users: []
    });

    const operation = manager.getPeerLinkRequests({
      communityId: COMMUNITY_ID
    });
    saveFullCommunity(manager, makeFullCommunity([], 1));
    staleResponse.resolve({
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [staleRequest],
      chats: [],
      users: []
    });

    await operation;

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: true,
      totalCount: 1,
      requests: [freshRequest],
      nextOffset: undefined
    });
  });

  test('deduplicates paginated requests and rolls back a failed approval', async() => {
    const requestA = makeRequest({_: 'peerUser', user_id: 101}, 1);
    const requestB = makeRequest({_: 'peerUser', user_id: 102}, 2, false);
    const requestC = makeRequest({_: 'peerChannel', channel_id: 301}, 3);
    const firstPage: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 3,
      requests: [requestA, requestB],
      next_offset: 'page-2',
      chats: [],
      users: []
    };
    const secondPage: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 3,
      requests: [requestB, requestC],
      chats: [],
      users: []
    };
    const {manager, invokeApi} = createHarness();
    const full = saveFullCommunity(manager, makeFullCommunity([], 0));
    let rejectApproval: (error: Error) => void;
    const approval = new Promise<never>((resolve, reject) => {
      rejectApproval = reject;
    });
    invokeApi.mockImplementation((method, params) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(params.offset ? secondPage : firstPage);
      }
      if(method === 'communities.togglePeerLinkRequestApproval') {
        return approval;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    await manager.getPeerLinkRequests({
      communityId: COMMUNITY_ID,
      offset: 'page-2'
    });

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      loaded: true,
      totalCount: 3,
      requests: [requestA, requestB, requestC]
    });
    expect(full.peer_link_requests_pending).toBe(3);

    const operation = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: (102 as UserId).toPeerId(false)
    });
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      totalCount: 2,
      requests: [requestA, requestC]
    });
    expect(full.peer_link_requests_pending).toBe(2);
    expect(full.linked_peers).toEqual([{
      _: 'communityPeer',
      pFlags: {},
      visible: false,
      peer: requestB.peer
    }]);

    rejectApproval!(new Error('approval failed'));
    await expect(operation).rejects.toThrow('approval failed');

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      totalCount: 3,
      requests: [requestA, requestB, requestC]
    });
    expect(full.peer_link_requests_pending).toBe(3);
    expect(full.linked_peers).toEqual([]);
  });

  test.each([
    {
      mode: 'approve-one',
      requestCount: 1
    },
    {
      mode: 'reject-one',
      requestCount: 1
    },
    {
      mode: 'approve-all',
      requestCount: 2
    }
  ] as const)('restores requests after failed $mode across a concurrent full refresh', async({
    mode,
    requestCount
  }) => {
    const requests = [
      makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1),
      makeRequest({_: 'peerChannel', channel_id: 301}, 2)
    ].slice(0, requestCount);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: requestCount,
      requests,
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {manager, invokeApi} = createHarness({
      chats: [makeChannel(), makeChannel(301 as ChatId)]
    });
    const full = saveFullCommunity(manager, makeFullCommunity([], requestCount));
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(initial);
      }
      if(
        method === 'communities.togglePeerLinkRequestApproval' ||
        method === 'communities.toggleAllPeerLinkRequestApproval'
      ) {
        return approval.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const operation = mode === 'approve-all' ?
      manager.toggleAllPeerLinkRequestApproval(COMMUNITY_ID) :
      manager.togglePeerLinkRequestApproval({
        communityId: COMMUNITY_ID,
        peerId: CHANNEL_PEER_ID,
        reject: mode === 'reject-one'
      });

    saveFullCommunity(manager, makeFullCommunity([], requestCount));
    approval.reject(new Error('approval failed'));
    await expect(operation).rejects.toThrow('approval failed');

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      loaded: true,
      totalCount: requestCount,
      requests
    });
    expect(full.peer_link_requests_pending).toBe(requestCount);
    expect(full.linked_peers).toEqual([]);
  });

  test('optimistically approves all unique chats with their requested visibility', async() => {
    const requestA = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const requestB = makeRequest({_: 'peerChannel', channel_id: 301}, 2, false);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 2,
      requests: [requestA, requestB],
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {manager, invokeApi} = createHarness({
      chats: [makeChannel(), makeChannel(301 as ChatId)]
    });
    const full = saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer(requestA.peer)
    ], 2));
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(full);
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(initial);
      }
      if(method === 'communities.toggleAllPeerLinkRequestApproval') {
        return approval.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const operation = manager.toggleAllPeerLinkRequestApproval(COMMUNITY_ID);

    expect(full.peer_link_requests_pending).toBe(0);
    expect(full.linked_peers).toEqual([
      makeLinkedPeer(requestA.peer),
      {
        _: 'communityPeer',
        pFlags: {},
        visible: false,
        peer: requestB.peer
      }
    ]);

    approval.resolve(true);
    await operation;

    expect(full.linked_peers.map((linkedPeer) => linkedPeer.visible)).toEqual([
      true,
      false
    ]);
  });

  test('does not roll an approved chat back over newer full community data', async() => {
    const request = makeRequest({_: 'peerChannel', channel_id: CHANNEL_ID}, 1);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {manager, invokeApi} = createHarness({
      chats: [makeChannel(), makeChannel(301 as ChatId)]
    });
    const full = saveFullCommunity(manager, makeFullCommunity([], 1));
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(initial);
      }
      if(method === 'communities.togglePeerLinkRequestApproval') {
        return approval.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const operation = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: CHANNEL_PEER_ID
    });
    expect(full.linked_peers[0].peer).toEqual(request.peer);

    const serverLinkedPeer = makeLinkedPeer({
      _: 'peerChannel',
      channel_id: 301
    });
    saveFullCommunity(manager, makeFullCommunity([serverLinkedPeer], 0));
    approval.reject(new Error('approval failed'));
    await expect(operation).rejects.toThrow('approval failed');

    expect(full.linked_peers).toEqual([serverLinkedPeer]);
    expect(full.peer_link_requests_pending).toBe(0);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toEqual({
      loaded: true,
      totalCount: 0,
      requests: []
    });
  });

  test('waits to fetch until a pending approval has finished', async() => {
    const requestA = makeRequest({_: 'peerUser', user_id: 101}, 1);
    const requestB = makeRequest({_: 'peerUser', user_id: 102}, 2);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 2,
      requests: [requestA, requestB],
      chats: [],
      users: []
    };
    const refreshed: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [requestA],
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {manager, invokeApi} = createHarness();
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());
    let fetchCount = 0;
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(fetchCount++ ? refreshed : initial);
      }
      if(method === 'communities.togglePeerLinkRequestApproval') {
        return approval.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const operation = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: (102 as UserId).toPeerId(false),
      reject: true
    });
    const fetch = manager.getPeerLinkRequests({communityId: COMMUNITY_ID});

    expect(invokeApi.mock.calls.filter(([method]) => {
      return method === 'communities.getPeerLinkRequests';
    })).toHaveLength(1);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)?.requests).toEqual([requestA]);

    approval.resolve(true);
    await operation;
    await fetch;

    expect(invokeApi.mock.calls.map(([method]) => method)).toEqual([
      'communities.getPeerLinkRequests',
      'communities.togglePeerLinkRequestApproval',
      'communities.getPeerLinkRequests'
    ]);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      totalCount: 1,
      requests: [requestA]
    });
  });

  test('serializes a fetch behind pending approval of all requests', async() => {
    const request = makeRequest({_: 'peerUser', user_id: 101}, 1);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    };
    const refreshed: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 0,
      requests: [],
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {manager, invokeApi} = createHarness();
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());
    let fetchCount = 0;
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(fetchCount++ ? refreshed : initial);
      }
      if(method === 'communities.toggleAllPeerLinkRequestApproval') {
        return approval.promise;
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const operation = manager.toggleAllPeerLinkRequestApproval(COMMUNITY_ID, true);
    const fetch = manager.getPeerLinkRequests({communityId: COMMUNITY_ID});

    expect(fetchCount).toBe(1);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)?.requests).toEqual([]);

    approval.resolve(true);
    await operation;
    await fetch;

    expect(fetchCount).toBe(2);
    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      totalCount: 0,
      requests: []
    });
  });

  test('does not queue new-account mutations behind stale work after reset', async() => {
    const request = makeRequest({_: 'peerUser', user_id: USER_ID}, 1);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    };
    const approval = deferred<true>();
    const {
      manager,
      invokeApi,
      setUserLinkedCommunityId
    } = createHarness({users: [makeUser()]});
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(initial);
      }
      if(method === 'communities.togglePeerLinkRequestApproval') {
        return approval.promise;
      }
      if(method === 'communities.toggleParticipantBanned') {
        return Promise.resolve(true);
      }
      if(method === 'communities.togglePeerLink') {
        return Promise.resolve(true);
      }
      throw new Error(`Unexpected method ${method}`);
    });

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    const oldApproval = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID
    });
    const staleQueuedMutation = manager.toggleParticipantBanned({
      communityId: COMMUNITY_ID,
      participantId: USER_PEER_ID
    });
    manager.clear();
    const nextMutation = manager.togglePeerLink({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      action: 'visible'
    });

    expect(invokeApi.mock.calls.map(([method]) => method)).toEqual([
      'communities.getPeerLinkRequests',
      'communities.togglePeerLinkRequestApproval',
      'communities.togglePeerLink'
    ]);
    await expect(nextMutation).resolves.toEqual({status: 'linked'});

    approval.reject(new Error('approval failed'));
    await expect(oldApproval).rejects.toThrow('approval failed');
    await expect(staleQueuedMutation).rejects.toMatchObject({
      type: 'CHANNEL_INVALID'
    });

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toBeUndefined();
    expect(setUserLinkedCommunityId).toHaveBeenCalledTimes(1);
    expect(invokeApi.mock.calls.map(([method]) => method)).toEqual([
      'communities.getPeerLinkRequests',
      'communities.togglePeerLinkRequestApproval',
      'communities.togglePeerLink'
    ]);
  });

  test('keeps an in-flight mutation valid across an ordinary state synchronization', async() => {
    const approval = deferred<true>();
    const {
      manager,
      invokeApi,
      setUserLinkedCommunityId
    } = createHarness({users: [makeUser()]});
    invokeApi.mockReturnValue(approval.promise);
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());

    const operation = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID
    });
    await (manager as any).restorePersistentState();
    approval.resolve(true);

    await operation;
    expect(setUserLinkedCommunityId).toHaveBeenCalledWith(
      USER_ID,
      COMMUNITY_ID
    );
  });

  test('does not apply a successful approval after state reset', async() => {
    const approval = deferred<true>();
    const {
      manager,
      invokeApi,
      setUserLinkedCommunityId
    } = createHarness({users: [makeUser()]});
    invokeApi.mockReturnValue(approval.promise);

    const operation = manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID
    });
    manager.clear();
    approval.resolve(true);

    await operation;
    expect(setUserLinkedCommunityId).not.toHaveBeenCalled();
  });

  test('does not decrement request count twice for duplicate approval', async() => {
    const request = makeRequest({_: 'peerUser', user_id: USER_ID}, 1);
    const initial: CommunitiesPeerLinkRequests.communitiesPeerLinkRequests = {
      _: 'communities.peerLinkRequests',
      total_count: 1,
      requests: [request],
      chats: [],
      users: []
    };
    const {manager, invokeApi} = createHarness();
    invokeApi.mockImplementation((method) => {
      if(method === 'communities.getPeerLinkRequests') {
        return Promise.resolve(initial);
      }
      if(method === 'communities.togglePeerLinkRequestApproval') {
        return Promise.resolve(true);
      }
      throw new Error(`Unexpected method ${method}`);
    });
    vi.spyOn(getProfileManager(manager), 'getChatFull').mockResolvedValue(makeFullCommunity());

    await manager.getPeerLinkRequests({communityId: COMMUNITY_ID});
    await manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      reject: true
    });
    await manager.togglePeerLinkRequestApproval({
      communityId: COMMUNITY_ID,
      peerId: USER_PEER_ID,
      reject: true
    });

    expect(getCachedPeerLinkRequests(manager, COMMUNITY_ID)).toMatchObject({
      totalCount: 0,
      requests: []
    });
  });
});

describe('AppCommunitiesManager collapsed and pinned dialogs', () => {
  test('marks every joined Community chat as read through message history', async() => {
    const secondChannelId = 201 as ChatId;
    const secondPeerId = secondChannelId.toPeerId(true);
    const {
      manager,
      getDialogOnly,
      markDialogUnread
    } = createHarness({
      chats: [
        makeChannel(CHANNEL_ID, COMMUNITY_ID),
        makeChannel(secondChannelId, COMMUNITY_ID)
      ]
    });
    const dialogs = new Map<PeerId, Dialog>([
      [CHANNEL_PEER_ID, makeDialog(CHANNEL_PEER_ID, 10)],
      [secondPeerId, makeDialog(secondPeerId, 20)]
    ]);
    getDialogOnly.mockImplementation((peerId) => dialogs.get(peerId));
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerChannel', channel_id: CHANNEL_ID}),
      makeLinkedPeer({_: 'peerChannel', channel_id: secondChannelId})
    ]));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    await manager.markCommunityRead(COMMUNITY_ID);

    expect(markDialogUnread).toHaveBeenCalledTimes(2);
    expect(markDialogUnread).toHaveBeenCalledWith({
      peerId: CHANNEL_PEER_ID,
      read: true
    });
    expect(markDialogUnread).toHaveBeenCalledWith({
      peerId: secondPeerId,
      read: true
    });
  });

  test('marks joined Community chats as read sequentially', async() => {
    const secondChannelId = 201 as ChatId;
    const secondPeerId = secondChannelId.toPeerId(true);
    const firstMark = deferred<void>();
    const secondMark = deferred<void>();
    const {
      manager,
      getDialogOnly,
      markDialogUnread
    } = createHarness({
      chats: [
        makeChannel(CHANNEL_ID, COMMUNITY_ID),
        makeChannel(secondChannelId, COMMUNITY_ID)
      ]
    });
    const dialogs = new Map<PeerId, Dialog>([
      [CHANNEL_PEER_ID, makeDialog(CHANNEL_PEER_ID, 10)],
      [secondPeerId, makeDialog(secondPeerId, 20)]
    ]);
    getDialogOnly.mockImplementation((peerId) => dialogs.get(peerId));
    markDialogUnread
    .mockReturnValueOnce(firstMark.promise)
    .mockReturnValueOnce(secondMark.promise);
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerChannel', channel_id: CHANNEL_ID}),
      makeLinkedPeer({_: 'peerChannel', channel_id: secondChannelId})
    ]));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    const operation = manager.markCommunityRead(COMMUNITY_ID);

    expect(markDialogUnread).toHaveBeenCalledTimes(1);
    expect(markDialogUnread).toHaveBeenLastCalledWith({
      peerId: CHANNEL_PEER_ID,
      read: true
    });

    firstMark.resolve();
    await vi.waitFor(() => {
      expect(markDialogUnread).toHaveBeenCalledTimes(2);
    });
    expect(markDialogUnread).toHaveBeenLastCalledWith({
      peerId: secondPeerId,
      read: true
    });

    secondMark.resolve();
    await operation;
  });

  test('stops marking Community chats after a lifecycle reset', async() => {
    const secondChannelId = 201 as ChatId;
    const secondPeerId = secondChannelId.toPeerId(true);
    const firstMark = deferred<void>();
    const {
      manager,
      getDialogOnly,
      markDialogUnread
    } = createHarness({
      chats: [
        makeChannel(CHANNEL_ID, COMMUNITY_ID),
        makeChannel(secondChannelId, COMMUNITY_ID)
      ]
    });
    const dialogs = new Map<PeerId, Dialog>([
      [CHANNEL_PEER_ID, makeDialog(CHANNEL_PEER_ID, 10)],
      [secondPeerId, makeDialog(secondPeerId, 20)]
    ]);
    getDialogOnly.mockImplementation((peerId) => dialogs.get(peerId));
    markDialogUnread.mockReturnValueOnce(firstMark.promise);
    saveFullCommunity(manager, makeFullCommunity([
      makeLinkedPeer({_: 'peerChannel', channel_id: CHANNEL_ID}),
      makeLinkedPeer({_: 'peerChannel', channel_id: secondChannelId})
    ]));
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    const operation = manager.markCommunityRead(COMMUNITY_ID);
    manager.clear();
    firstMark.resolve();
    await operation;

    expect(markDialogUnread).toHaveBeenCalledTimes(1);
    expect(markDialogUnread).toHaveBeenCalledWith({
      peerId: CHANNEL_PEER_ID,
      read: true
    });
  });

  test('retains a notify update before the source dialog arrives', () => {
    const pendingNotifySettings = {
      _: 'peerNotifySettings' as const,
      mute_until: 200
    };
    const staleNotifySettings = {
      _: 'peerNotifySettings' as const,
      mute_until: 100
    };
    const {
      manager,
      mirrorInvokeVoid,
      pushToState
    } = createHarness();

    manager.saveCommunityNotifySettings(
      COMMUNITY_ID,
      pendingNotifySettings
    );

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.notifySettings)
    .toBe(pendingNotifySettings);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityDialogs',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({
          communityId: COMMUNITY_ID,
          notifySettings: pendingNotifySettings
        })
      })
    );

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: staleNotifySettings
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.notifySettings)
    .toBe(pendingNotifySettings);
    expect(pushToState).toHaveBeenLastCalledWith(
      'communityDialogs',
      {[COMMUNITY_ID]: expect.objectContaining({
        community_id: COMMUNITY_ID,
        notify_settings: pendingNotifySettings
      })}
    );

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: staleNotifySettings
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.notifySettings)
    .toBe(pendingNotifySettings);
    expect(pushToState).toHaveBeenLastCalledWith(
      'communityDialogs',
      {[COMMUNITY_ID]: expect.objectContaining({
        pFlags: {pinned: true},
        notify_settings: pendingNotifySettings
      })}
    );
  });

  test('keeps an empty collapsed community row and seeds its pin order', () => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {manager, pinnedOrders, pushToState} = createHarness({
      communities: [community]
    });
    const notifySettings = {_: 'peerNotifySettings' as const};

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {pinned: true},
      community_id: COMMUNITY_ID,
      notify_settings: notifySettings
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)).toEqual({
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      pFlags: {pinned: true},
      notifySettings,
      dialogs: [],
      joinedDialogs: [],
      lastDialogs: [],
      mutedPeerIds: [],
      sortDate: 0,
      pinnedOrderIndex: 0,
      pinnedOrderLength: 1,
      unreadCount: 0,
      unreadMessagesCount: 0,
      unreadUnmutedCount: 0,
      unreadMarked: false,
      unreadMentionsCount: 0,
      unreadReactionsCount: 0,
      unreadPollVotesCount: 0
    });
    expect(pinnedOrders[0]).toEqual([COMMUNITY_PEER_ID]);
    expect(pushToState).toHaveBeenCalledWith(
      'communityDialogs',
      {[COMMUNITY_ID]: expect.objectContaining({community_id: COMMUNITY_ID})}
    );

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: notifySettings
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.pFlags).toEqual({});
    expect(pinnedOrders[0]).toEqual([]);

    const updatedNotifySettings = {
      _: 'peerNotifySettings' as const,
      mute_until: 100
    };
    manager.saveCommunityNotifySettings(COMMUNITY_ID, updatedNotifySettings);

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.notifySettings)
    .toBe(updatedNotifySettings);
    expect(pushToState).toHaveBeenLastCalledWith(
      'communityDialogs',
      {[COMMUNITY_ID]: expect.objectContaining({
        community_id: COMMUNITY_ID,
        notify_settings: updatedNotifySettings
      })}
    );
  });

  test('keeps the dialog summary mirrored while the community is expanded', () => {
    const community = makeCommunity();
    const {manager, mirrorInvokeVoid} = createHarness({
      communities: [community]
    });
    const linkedDialog = {
      _: 'dialog',
      pFlags: {},
      peerId: CHANNEL_PEER_ID,
      folder_id: 0,
      top_message: 0
    };
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([CHANNEL_PEER_ID])
    );
    (manager as any).dialogsStorage.getDialogOnly
    .mockReturnValue(linkedDialog);

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    expect(community.pFlags.collapsed_in_dialogs).toBeUndefined();
    expect(manager.getCommunityDialog(COMMUNITY_ID)?.dialogs)
    .toEqual([linkedDialog]);
    expect(mirrorInvokeVoid).toHaveBeenLastCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityDialogs',
        key: '' + COMMUNITY_ID,
        value: expect.objectContaining({
          communityId: COMMUNITY_ID,
          dialogs: [linkedDialog]
        })
      })
    );
  });

  test('projects effective child mute state for the first render', () => {
    const joinedChannel = makeChannel(CHANNEL_ID);
    joinedChannel.pFlags.megagroup = true;
    const {manager, getDialogOnly} = createHarness({
      chats: [joinedChannel]
    });
    const linkedDialog = makeDialog(CHANNEL_PEER_ID, 10);
    getDialogOnly.mockReturnValue(linkedDialog);
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([CHANNEL_PEER_ID])
    );
    const isPeerLocalMuted = (manager as any)
    .appNotificationsManager.isPeerLocalMuted;
    isPeerLocalMuted.mockReturnValue(true);

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)?.mutedPeerIds)
    .toEqual([CHANNEL_PEER_ID]);
    expect(isPeerLocalMuted).toHaveBeenCalledWith({
      peerId: CHANNEL_PEER_ID,
      respectType: true
    });
  });

  test('keeps viewable dialogs out of the grouped preview and unread totals', () => {
    const joinedChannel = makeChannel(CHANNEL_ID);
    joinedChannel.pFlags.megagroup = true;
    const viewableChannelId = 301 as ChatId;
    const viewableChannel = makeChannel(viewableChannelId);
    viewableChannel.pFlags.left = true;
    const {manager, getDialogOnly} = createHarness({
      chats: [joinedChannel, viewableChannel]
    });
    const joinedDialog = {
      _: 'dialog',
      pFlags: {},
      peerId: CHANNEL_PEER_ID,
      folder_id: 0,
      top_message: 10,
      unread_count: 2
    };
    const viewablePeerId = viewableChannelId.toPeerId(true);
    const viewableDialog = {
      _: 'dialog',
      pFlags: {unread_mark: true},
      peerId: viewablePeerId,
      folder_id: 0,
      top_message: 20
    };
    const dialogs = new Map<PeerId, any>([
      [CHANNEL_PEER_ID, joinedDialog],
      [viewablePeerId, viewableDialog]
    ]);
    getDialogOnly.mockImplementation((peerId) => dialogs.get(peerId));
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([CHANNEL_PEER_ID, viewablePeerId])
    );
    (manager as any).appMessagesManager.getMessageByPeer
    .mockImplementation((peerId: PeerId) => ({
      _: 'message',
      date: peerId === CHANNEL_PEER_ID ? 100 : 500
    }));
    (manager as any).appMessagesManager.getDialogUnreadCount
    .mockImplementation((dialog: {peerId: PeerId}) => {
      return dialog.peerId === CHANNEL_PEER_ID ? 2 : 9;
    });
    (manager as any).dialogsStorage.getForumUnreadCount = vi.fn();

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)).toMatchObject({
      dialogs: [viewableDialog, joinedDialog],
      joinedDialogs: [joinedDialog],
      lastDialogs: [joinedDialog],
      sortDate: 100,
      unreadCount: 1,
      unreadMessagesCount: 2,
      unreadMarked: false
    });
  });

  test('aggregates unread chats, marks and attention badges', () => {
    const firstChannel = makeChannel(CHANNEL_ID);
    firstChannel.pFlags.megagroup = true;
    const secondChannelId = 301 as ChatId;
    const secondChannel = makeChannel(secondChannelId);
    secondChannel.pFlags.megagroup = true;
    const secondPeerId = secondChannelId.toPeerId(true);
    const dialogs = new Map<PeerId, any>([
      [CHANNEL_PEER_ID, {
        _: 'dialog',
        pFlags: {},
        peerId: CHANNEL_PEER_ID,
        folder_id: 0,
        top_message: 10,
        unread_count: 5,
        unread_mentions_count: 1
      }],
      [secondPeerId, {
        _: 'dialog',
        pFlags: {unread_mark: true},
        peerId: secondPeerId,
        folder_id: 0,
        top_message: 20,
        unread_count: 0,
        unread_reactions_count: 1,
        unread_poll_votes_count: 2
      }]
    ]);
    const {manager, getDialogOnly} = createHarness({
      chats: [firstChannel, secondChannel]
    });
    getDialogOnly.mockImplementation((peerId) => dialogs.get(peerId));
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([CHANNEL_PEER_ID, secondPeerId])
    );
    (manager as any).appMessagesManager.getDialogUnreadCount
    .mockImplementation((dialog: Dialog) => {
      return dialog.unread_count || +!!dialog.pFlags.unread_mark;
    });
    (manager as any).dialogsStorage.getForumUnreadCount = vi.fn();

    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    expect(manager.getCommunityDialog(COMMUNITY_ID)).toMatchObject({
      unreadCount: 2,
      unreadMessagesCount: 5,
      unreadMarked: true,
      unreadMentionsCount: 1,
      unreadReactionsCount: 1,
      unreadPollVotesCount: 2
    });
  });

  test('projects collapsed Community children out of their real folders', () => {
    const community = makeCommunity(
      COMMUNITY_ID,
      {collapsed_in_dialogs: true}
    );
    const {manager} = createHarness({communities: [community]});
    const archivedPeerId = (301 as ChatId).toPeerId(true);
    (manager as any).computedDialogs[COMMUNITY_ID] = {
      dialogs: [
        {peerId: CHANNEL_PEER_ID, folder_id: 0},
        {peerId: archivedPeerId, folder_id: 1}
      ]
    };

    expect(manager.getCollapsedCommunityPeerIds(0))
    .toEqual([CHANNEL_PEER_ID]);
    expect(manager.getCollapsedCommunityPeerIds(1))
    .toEqual([archivedPeerId]);

    community.pFlags.collapsed_in_dialogs = undefined;
    expect(manager.getCollapsedCommunityPeerIds(1)).toEqual([]);
  });

  test('coalesces child events and mirrors only derived changes', async() => {
    const linkedDialog = {
      _: 'dialog',
      pFlags: {},
      peerId: CHANNEL_PEER_ID,
      folder_id: 0,
      top_message: 10,
      unread_count: 0
    };
    const {
      manager,
      getDialogOnly,
      mirrorInvokeVoid
    } = createHarness({
      chats: [makeChannel(CHANNEL_ID, COMMUNITY_ID)]
    });
    getDialogOnly.mockReturnValue(linkedDialog);
    (manager as any).linkedPeerIds.set(
      COMMUNITY_ID,
      new Set([CHANNEL_PEER_ID])
    );
    (manager as any).appMessagesManager.getDialogUnreadCount
    .mockImplementation((dialog: Dialog) => dialog.unread_count || 0);
    (manager as any).dialogsStorage.getForumUnreadCount = vi.fn();
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });
    mirrorInvokeVoid.mockClear();

    (manager as any).recomputeCommunityDialogByPeer(CHANNEL_PEER_ID);
    (manager as any).recomputeCommunityDialogByPeer(CHANNEL_PEER_ID);
    await Promise.resolve();
    expect(mirrorInvokeVoid).not.toHaveBeenCalled();

    linkedDialog.unread_count = 1;
    (manager as any).recomputeCommunityDialogByPeer(CHANNEL_PEER_ID);
    (manager as any).recomputeCommunityDialogByPeer(CHANNEL_PEER_ID);
    await Promise.resolve();
    expect(mirrorInvokeVoid).toHaveBeenCalledOnce();
    expect(mirrorInvokeVoid).toHaveBeenCalledWith(
      'mirror',
      expect.objectContaining({
        name: 'communityDialogs',
        value: expect.objectContaining({unreadMessagesCount: 1})
      })
    );
  });

  test('serializes unpin before a failing expand without resurrecting the pin', async() => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {
      manager,
      pinnedOrders,
      invokeApi,
      saveUpdate
    } = createHarness({communities: [community]});
    const unpin = deferred<true>();
    const expand = deferred<never>();
    pinnedOrders[0].push(COMMUNITY_PEER_ID);
    (manager as any).computedDialogs[COMMUNITY_ID] = {
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      pFlags: {pinned: true}
    };
    saveUpdate.mockImplementation((update: Update.updateDialogPinned) => {
      manager.handleCommunityDialogPinned(
        COMMUNITY_ID,
        !!update.pFlags.pinned
      );
    });
    invokeApi.mockImplementation((method: string) => {
      return method === 'messages.toggleDialogPin' ?
        unpin.promise :
        expand.promise;
    });

    const unpinOperation = manager.toggleCommunityPin(COMMUNITY_ID, false);
    const expandOperation = manager.toggleCollapsedInDialogs(
      COMMUNITY_ID,
      false
    );
    expect(invokeApi).toHaveBeenCalledTimes(1);

    unpin.resolve(true);
    await unpinOperation;
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(2));
    expand.reject(new Error('expand failed'));
    await expect(expandOperation).rejects.toThrow('expand failed');

    expect(community.pFlags.collapsed_in_dialogs).toBe(true);
    expect(pinnedOrders[0]).toEqual([]);
  });

  test('serializes pin before a failing expand and restores the server pin', async() => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {
      manager,
      pinnedOrders,
      invokeApi,
      saveUpdate
    } = createHarness({communities: [community]});
    const pin = deferred<true>();
    const expand = deferred<never>();
    (manager as any).computedDialogs[COMMUNITY_ID] = {
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      pFlags: {}
    };
    saveUpdate.mockImplementation((update: Update.updateDialogPinned) => {
      manager.handleCommunityDialogPinned(
        COMMUNITY_ID,
        !!update.pFlags.pinned
      );
    });
    invokeApi.mockImplementation((method: string) => {
      return method === 'messages.toggleDialogPin' ?
        pin.promise :
        expand.promise;
    });

    const pinOperation = manager.toggleCommunityPin(COMMUNITY_ID, true);
    const expandOperation = manager.toggleCollapsedInDialogs(
      COMMUNITY_ID,
      false
    );
    expect(invokeApi).toHaveBeenCalledTimes(1);

    pin.resolve(true);
    await pinOperation;
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(2));
    expect(pinnedOrders[0]).toEqual([]);
    expand.reject(new Error('expand failed'));
    await expect(expandOperation).rejects.toThrow('expand failed');

    expect(community.pFlags.collapsed_in_dialogs).toBe(true);
    expect(pinnedOrders[0]).toEqual([COMMUNITY_PEER_ID]);
  });

  test('does not restore collapsed or pinned state after Community eviction', async() => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {
      manager,
      communities,
      pinnedOrders,
      invokeApi,
      saveApiChat
    } = createHarness({communities: [community]});
    const collapse = deferred<never>();
    invokeApi.mockReturnValue(collapse.promise);
    pinnedOrders[0].push(COMMUNITY_PEER_ID);
    (manager as any).computedDialogs[COMMUNITY_ID] = {
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      pFlags: {pinned: true}
    };

    const operation = manager.toggleCollapsedInDialogs(COMMUNITY_ID, false);
    communities[+COMMUNITY_ID].pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    collapse.reject(new Error('stale collapse failed'));

    await expect(operation).rejects.toThrow('stale collapse failed');
    expect(communities[+COMMUNITY_ID].pFlags.collapsed_in_dialogs).toBeUndefined();
    expect(pinnedOrders[0]).toEqual([]);
    expect(saveApiChat).toHaveBeenCalledOnce();
  });

  test('does not process a collapsed update after Community eviction', async() => {
    const community = makeCommunity();
    const {
      manager,
      communities,
      invokeApi,
      processUpdateMessage
    } = createHarness({communities: [community]});
    const collapse = deferred<{_: 'updatesTooLong'}>();
    invokeApi.mockReturnValue(collapse.promise);

    const operation = manager.toggleCollapsedInDialogs(COMMUNITY_ID, true);
    communities[+COMMUNITY_ID].pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    collapse.resolve({_: 'updatesTooLong'});

    await operation;
    expect(processUpdateMessage).not.toHaveBeenCalled();
  });

  test('does not apply a pin update after Community eviction', async() => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {
      manager,
      communities,
      invokeApi,
      saveUpdate
    } = createHarness({communities: [community]});
    const pin = deferred<true>();
    invokeApi.mockReturnValue(pin.promise);
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    const operation = manager.toggleCommunityPin(COMMUNITY_ID, true);
    communities[+COMMUNITY_ID].pFlags.left = true;
    manager.handleCommunityUpdate(COMMUNITY_ID);
    pin.resolve(true);

    await operation;
    expect(saveUpdate).not.toHaveBeenCalled();
  });

  test('does not apply a late pin after the Community was expanded', async() => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {
      manager,
      communities,
      invokeApi,
      saveUpdate
    } = createHarness({communities: [community]});
    const pin = deferred<true>();
    invokeApi.mockReturnValue(pin.promise);
    manager.saveCommunityDialog({
      _: 'dialogCommunity',
      pFlags: {},
      community_id: COMMUNITY_ID,
      notify_settings: {_: 'peerNotifySettings'}
    });

    const operation = manager.toggleCommunityPin(COMMUNITY_ID, true);
    communities[+COMMUNITY_ID].pFlags.collapsed_in_dialogs = undefined;
    pin.resolve(true);

    await operation;
    expect(saveUpdate).not.toHaveBeenCalled();
  });

  test('refuses to collapse an evicted Community before optimistic state changes', async() => {
    const {
      manager,
      invokeApi,
      saveApiChat
    } = createHarness();
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);

    await expect(manager.toggleCollapsedInDialogs(COMMUNITY_ID, true))
    .rejects.toMatchObject({type: 'CHANNEL_INVALID'});
    expect(saveApiChat).not.toHaveBeenCalled();
    expect(invokeApi).not.toHaveBeenCalled();
  });

  test('always removes a stale Community from the local pin order', () => {
    const {
      manager,
      pinnedOrders,
      savePinnedOrders
    } = createHarness();
    (manager as any).joinedCommunitiesAuthoritative = true;
    (manager as any).joinedCommunityIds = [];
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);
    pinnedOrders[0].push(COMMUNITY_PEER_ID);

    manager.handleCommunityDialogPinned(COMMUNITY_ID, false);

    expect(pinnedOrders[0]).toEqual([]);
    expect(savePinnedOrders).toHaveBeenCalled();
  });

  test('keeps only current collapsed Communities in bulk pin orders', () => {
    const community = makeCommunity(COMMUNITY_ID, {collapsed_in_dialogs: true});
    const {manager} = createHarness({communities: [community]});
    const mixedOrder = [
      USER_PEER_ID,
      COMMUNITY_PEER_ID,
      CHANNEL_PEER_ID
    ];

    expect(manager.sanitizePinnedDialogsOrder(mixedOrder)).toEqual(mixedOrder);

    delete community.pFlags.collapsed_in_dialogs;
    expect(manager.sanitizePinnedDialogsOrder(mixedOrder)).toEqual([
      USER_PEER_ID,
      CHANNEL_PEER_ID
    ]);

    community.pFlags.collapsed_in_dialogs = true;
    (manager as any).evictedCommunityIds.add(COMMUNITY_ID);
    expect(manager.sanitizePinnedDialogsOrder(mixedOrder)).toEqual([
      USER_PEER_ID,
      CHANNEL_PEER_ID
    ]);
  });
});

describe('Community mirror bootstrap', () => {
  test('sends every Community snapshot to a newly attached tab', () => {
    const community = makeCommunity();
    const full = makeFullCommunity();
    const dialog = {
      _: 'communityDialog',
      communityId: COMMUNITY_ID,
      pFlags: {},
      notifySettings: {_: 'peerNotifySettings'},
      dialogs: [],
      joinedDialogs: [],
      lastDialogs: [],
      mutedPeerIds: [],
      sortDate: 0,
      unreadCount: 0,
      unreadMessagesCount: 0,
      unreadUnmutedCount: 0,
      unreadMarked: false
    } as const;
    const requests: CommunityPeerLinkRequestsState = {
      loaded: true,
      totalCount: 0,
      requests: []
    };
    const manager = new AppPeersManager();
    const port = {} as MessageEventSource;
    Object.assign(manager as any, {
      accountNumber: 1,
      appUsersManager: {
        getUsers: () => ({})
      },
      appChatsManager: {
        getChats: () => ({[COMMUNITY_ID]: community})
      },
      appProfileManager: {
        getCommunityFullMirror: () => ({[COMMUNITY_ID]: full})
      },
      appCommunitiesManager: {
        getCommunityDialogsMirror: () => ({[COMMUNITY_ID]: dialog}),
        getCommunityPeerLinkRequestsMirror: () => ({[COMMUNITY_ID]: requests})
      }
    });

    manager.mirrorAllPeers(port);

    expect(mirrorInvokeVoid.mock.calls.map((call) => call[1].name)).toEqual([
      'peers',
      'communityFull',
      'communityDialogs',
      'communityPeerLinkRequests'
    ]);
    expect(mirrorInvokeVoid).toHaveBeenNthCalledWith(2, 'mirror', {
      name: 'communityFull',
      value: {[COMMUNITY_ID]: full},
      accountNumber: 1
    }, port);
    expect(mirrorInvokeVoid).toHaveBeenNthCalledWith(3, 'mirror', {
      name: 'communityDialogs',
      value: {[COMMUNITY_ID]: dialog},
      accountNumber: 1
    }, port);
    expect(mirrorInvokeVoid).toHaveBeenNthCalledWith(4, 'mirror', {
      name: 'communityPeerLinkRequests',
      value: {[COMMUNITY_ID]: requests},
      accountNumber: 1
    }, port);
  });

  test('deletes an evicted Community from the mirror', () => {
    const community = makeCommunity();
    const storageDelete = vi.fn();
    const manager = new AppChatsManager();
    Object.assign(manager as any, {
      accountNumber: 1,
      chats: {[COMMUNITY_ID]: community},
      storage: {delete: storageDelete},
      peersStorage: {isPeerNeeded: () => false}
    });

    manager.clear();

    expect(storageDelete).toHaveBeenCalledWith('' + COMMUNITY_ID);
    expect(mirrorInvokeVoid).toHaveBeenCalledWith('mirror', {
      name: 'peers',
      key: '' + COMMUNITY_PEER_ID,
      value: undefined,
      accountNumber: 1
    });
  });
});
