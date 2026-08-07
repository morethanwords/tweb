import {AppChatsManager} from '@appManagers/appChatsManager';
import AppChatInvitesManager from '@appManagers/appChatInvitesManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import {AppPeersManager} from '@appManagers/appPeersManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {Chat, DataJSON, Updates, User} from '@layer';
import '@helpers/peerIdPolyfill';

describe('layer 228 migration', () => {
  test('builds community dialog and notification inputs through peers manager', () => {
    const communityId = 100 as ChatId;
    const peerId = communityId.toPeerId(true);
    const manager = {
      isCommunity: () => true,
      getInputDialogPeerById: AppPeersManager.prototype.getInputDialogPeerById,
      getInputNotifyPeerById: AppPeersManager.prototype.getInputNotifyPeerById,
      appChatsManager: {
        getChannelInput: () => ({
          _: 'inputChannel',
          channel_id: communityId,
          access_hash: '1'
        })
      }
    } as unknown as AppPeersManager;

    expect(manager.getInputDialogPeerById(peerId)).toEqual({
      _: 'inputDialogPeerCommunity',
      community: {
        _: 'inputChannel',
        channel_id: communityId,
        access_hash: '1'
      }
    });
    expect(manager.getInputNotifyPeerById({peerId})).toEqual({
      _: 'inputNotifyCommunity',
      community: {
        _: 'inputChannel',
        channel_id: communityId,
        access_hash: '1'
      }
    });
  });

  test('routes community pinning through the shared dialog pin primitive', async() => {
    const peerId = (100 as ChatId).toPeerId(true);
    const invokeApi = vi.fn().mockResolvedValue(true);
    const saveUpdate = vi.fn();
    const manager = {
      apiManager: {invokeApi},
      apiUpdatesManager: {saveUpdate},
      appPeersManager: {
        getInputDialogPeerById: () => ({
          _: 'inputDialogPeerCommunity',
          community: {
            _: 'inputChannel',
            channel_id: 100,
            access_hash: '1'
          }
        }),
        getDialogPeer: () => ({
          _: 'dialogPeerCommunity',
          community_id: 100
        })
      },
      applyDialogPinUpdate: AppMessagesManager.prototype.applyDialogPinUpdate
    } as unknown as AppMessagesManager;

    await AppMessagesManager.prototype.setDialogPin.call(manager, {
      peerId,
      pinned: true,
      folderId: 0
    });

    expect(invokeApi).toHaveBeenCalledWith('messages.toggleDialogPin', {
      peer: {
        _: 'inputDialogPeerCommunity',
        community: {
          _: 'inputChannel',
          channel_id: 100,
          access_hash: '1'
        }
      },
      pinned: true
    });
    expect(saveUpdate).toHaveBeenCalledWith({
      _: 'updateDialogPinned',
      peer: {
        _: 'dialogPeerCommunity',
        community_id: 100
      },
      folder_id: 0,
      pFlags: {pinned: true}
    });
  });

  test('caches guard-bot users and returns the initial join query to the calling tab', () => {
    const saveApiUsers = vi.fn();
    const manager = {
      appUsersManager: {saveApiUsers}
    } as unknown as AppChatsManager;
    const users: User[] = [];

    const result = AppChatsManager.prototype.processChatInviteJoinResult.call(manager, {
      _: 'messages.chatInviteJoinResultWebView',
      bot_id: 123,
      query_id: '42',
      users
    }, -456);

    expect(result).toEqual({
      _: 'chatInviteJoinWebView',
      botId: 123,
      peerId: -456,
      queryId: '42'
    });
    expect(saveApiUsers).toHaveBeenCalledWith(users);
  });

  test('returns ordinary join updates unchanged', () => {
    const updates: Updates.updates = {
      _: 'updates',
      chats: [],
      date: 0,
      seq: 0,
      updates: [],
      users: []
    };

    const result = AppChatsManager.prototype.processChatInviteJoinResult.call({} as AppChatsManager, {
      _: 'messages.chatInviteJoinResultOk',
      updates
    });

    expect(result).toBe(updates);
  });

  test('requests the guard WebView with theme params and the web platform', async() => {
    const themeParams: DataJSON.dataJSON = {
      _: 'dataJSON',
      data: '{"bg_color":16777215}'
    };
    const webViewResult = {
      _: 'webViewResultUrl',
      pFlags: {},
      query_id: '84',
      url: 'https://example.com'
    } as const;
    const invokeApi = vi.fn().mockResolvedValue(webViewResult);
    const manager = {
      apiManager: {
        getThemeParams: () => themeParams,
        invokeApi
      }
    } as unknown as AppChatInvitesManager;

    await AppChatInvitesManager.prototype.requestChatJoinWebView.call(manager, '42');

    expect(invokeApi).toHaveBeenCalledWith('messages.requestChatJoinWebView', {
      query_id: '42',
      theme_params: themeParams,
      platform: 'web'
    });
  });

  describe('guard bot on the chat side', () => {
    const channel: Chat.channel = {
      _: 'channel',
      pFlags: {broadcast: true},
      id: 100,
      access_hash: '42',
      title: 'Channel',
      photo: {_: 'chatPhotoEmpty'},
      date: 0
    };
    const channelInput = {
      _: 'inputChannel',
      channel_id: channel.id,
      access_hash: '42'
    };

    const createManager = () => {
      const invokeApi = vi.fn().mockResolvedValue(undefined as unknown as Updates);
      const modifyCachedFullChat = vi.fn();
      const onChatUpdated = vi.fn();
      const manager = new AppChatsManager();
      Object.assign(manager as any, {
        chats: {[channel.id]: channel},
        apiManager: {invokeApi},
        appProfileManager: {modifyCachedFullChat},
        appUsersManager: {
          getUserInput: (id: UserId) => ({_: 'inputUser', user_id: id, access_hash: '7'})
        },
        onChatUpdated
      });

      return {manager, invokeApi, modifyCachedFullChat, onChatUpdated};
    };

    test('sends no guard fields for a plain approval toggle', async() => {
      const {manager, invokeApi, modifyCachedFullChat} = createManager();

      await manager.toggleJoinRequest(channel.id, true);

      expect(invokeApi).toHaveBeenCalledWith('channels.toggleJoinRequest', {
        channel: channelInput,
        enabled: true,
        guard_bot: undefined
      });
      expect(modifyCachedFullChat).not.toHaveBeenCalled();
    });

    test('hands join requests to a guard bot and caches it on the full chat', async() => {
      const {manager, invokeApi, modifyCachedFullChat, onChatUpdated} = createManager();

      await manager.toggleJoinRequest(channel.id, true, {guardBotId: 777});

      expect(invokeApi).toHaveBeenCalledWith('channels.toggleJoinRequest', {
        channel: channelInput,
        enabled: true,
        guard_bot: {_: 'inputUser', user_id: 777, access_hash: '7'}
      });
      expect(onChatUpdated).toHaveBeenCalledWith(channel.id, undefined);

      const channelFull = {guard_bot_id: undefined as any};
      modifyCachedFullChat.mock.calls[0][1](channelFull);
      expect(channelFull.guard_bot_id).toBe(777);
    });

    test('clears the guard bot without turning approvals off', async() => {
      const {manager, invokeApi, modifyCachedFullChat} = createManager();

      await manager.toggleJoinRequest(channel.id, true, {clearGuardBot: true});

      expect(invokeApi).toHaveBeenCalledWith('channels.toggleJoinRequest', {
        channel: channelInput,
        enabled: true,
        guard_bot: {_: 'inputUserEmpty'}
      });

      const channelFull = {guard_bot_id: 777 as any};
      modifyCachedFullChat.mock.calls[0][1](channelFull);
      expect(channelFull.guard_bot_id).toBeUndefined();
    });

    test('leaves the cached full alone when the guard bot did not change', async() => {
      const {manager, modifyCachedFullChat} = createManager();

      await manager.toggleJoinRequest(channel.id, true, {guardBotId: 777});

      const channelFull = {guard_bot_id: '777' as any};
      expect(modifyCachedFullChat.mock.calls[0][1](channelFull)).toBe(false);
    });
  });

  test('routes Community request count updates away from the chat join request UI', async() => {
    const handlePendingJoinRequestsUpdate = vi.fn().mockReturnValue(true);
    const getState = vi.fn();
    const dispatchEvent = vi.fn();
    const manager = new AppChatInvitesManager();
    Object.assign(manager as any, {
      appCommunitiesManager: {handlePendingJoinRequestsUpdate},
      appStateManager: {getState},
      rootScope: {dispatchEvent}
    });
    const update = {
      _: 'updatePendingJoinRequests',
      peer: {_: 'peerChannel', channel_id: 100},
      requests_pending: 1,
      recent_requesters: []
    } as const;

    await (manager as any).onUpdatePendingJoinRequests(update);

    expect(handlePendingJoinRequestsUpdate).toHaveBeenCalledWith(update);
    expect(getState).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  test('keeps ordinary pending join request updates in the chat join request UI', async() => {
    const handlePendingJoinRequestsUpdate = vi.fn().mockReturnValue(false);
    const hideChatJoinRequests = {[-100]: true};
    const pushToState = vi.fn();
    const dispatchEvent = vi.fn();
    const manager = new AppChatInvitesManager();
    Object.assign(manager as any, {
      appCommunitiesManager: {handlePendingJoinRequestsUpdate},
      appStateManager: {
        getState: vi.fn().mockResolvedValue({hideChatJoinRequests}),
        pushToState
      },
      rootScope: {dispatchEvent}
    });
    const update = {
      _: 'updatePendingJoinRequests',
      peer: {_: 'peerChannel', channel_id: 100},
      requests_pending: 2,
      recent_requesters: [1, 2]
    } as const;

    await (manager as any).onUpdatePendingJoinRequests(update);

    expect(hideChatJoinRequests).not.toHaveProperty('-100');
    expect(pushToState).toHaveBeenCalledWith(
      'hideChatJoinRequests',
      hideChatJoinRequests
    );
    expect(dispatchEvent).toHaveBeenCalledWith('chat_requests', {
      chatId: 100,
      recentRequesters: [1, 2],
      requestsPending: 2
    });
  });

  test('maps local community notification updates to the output constructor', () => {
    const processLocalUpdate = vi.fn();
    const manager = {
      apiUpdatesManager: {processLocalUpdate}
    } as unknown as AppNotificationsManager;

    AppNotificationsManager.prototype.generateLocalNotifySettingsUpdate.call(
      manager,
      {
        _: 'inputNotifyCommunity',
        community: {
          _: 'inputChannel',
          channel_id: 100,
          access_hash: '1'
        }
      },
      {
        _: 'inputPeerNotifySettings',
        mute_until: 123
      }
    );

    expect(processLocalUpdate).toHaveBeenCalledWith({
      _: 'updateNotifySettings',
      peer: {
        _: 'notifyCommunity',
        community_id: 100
      },
      notify_settings: {
        _: 'peerNotifySettings',
        mute_until: 123
      }
    });
  });

  test('expires cached community mutes with a well-formed update', () => {
    vi.useFakeTimers();
    try {
      const saveUpdate = vi.fn();
      const manager = new AppNotificationsManager();
      Object.assign(manager as any, {
        apiUpdatesManager: {saveUpdate},
        appPeersManager: {getOutputPeer: vi.fn()},
        peerSettings: {
          notifyPeer: {},
          notifyCommunity: {
            100: {
              _: 'peerNotifySettings',
              mute_until: 1
            }
          },
          notifyUsers: null,
          notifyChats: null,
          notifyBroadcasts: null,
          notifyForumTopic: {}
        }
      });

      (manager as any).checkMuteUntil();

      expect(saveUpdate).toHaveBeenCalledWith({
        _: 'updateNotifySettings',
        peer: {
          _: 'notifyCommunity',
          community_id: '100'
        },
        notify_settings: {
          _: 'peerNotifySettings',
          mute_until: 0
        }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    {
      _: 'community',
      pFlags: {},
      id: 100,
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 0,
      participants_count: 1,
      usernames: [],
      admin_rights: {_: 'chatAdminRights', pFlags: {}},
      default_banned_rights: {_: 'chatBannedRights', pFlags: {}, until_date: 0}
    } as Chat.community,
    {
      _: 'communityForbidden',
      id: 101,
      title: 'Unavailable community'
    } as Chat.communityForbidden
  ])('stores $._ in the unified chat store', (community) => {
    const chats = {};
    const mirrorChat = vi.fn();

    expect(AppChatsManager.prototype.saveApiChat.call({
      chats,
      mirrorChat,
      appCommunitiesManager: {handleCommunityUpdate: vi.fn()},
      rootScope: {dispatchEvent: vi.fn()},
      peersStorage: {isPeerNeeded: () => false}
    } as unknown as AppChatsManager, community)).toBeUndefined();
    expect(chats).toEqual({[community.id]: community});
    expect(mirrorChat).toHaveBeenCalledWith(community);
  });

  test('uses the shared chat cache and channel input helpers for communities', async() => {
    const community: Chat.community = {
      _: 'community',
      pFlags: {},
      id: 100,
      access_hash: '42',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 0
    };
    const manager = new AppChatsManager();
    Object.assign(manager as any, {
      chats: {[community.id]: community}
    });

    expect(manager.getChat(community.id)).toBe(community);
    expect(manager.getChats()[community.id]).toBe(community);
    expect(manager.getChannelInput(community.id)).toEqual({
      _: 'inputChannel',
      channel_id: community.id,
      access_hash: '42'
    });
    expect(manager.getInputPeer(community.id)).toEqual({
      _: 'inputPeerChannel',
      channel_id: community.id,
      access_hash: '42'
    });
    expect(manager.getChatString(community.id)).toBe('c100_42');
    await expect(manager.migrateChat(community.id)).resolves.toBe(community.id);
  });

  test('routes Community title edits through the shared chat mutation', async() => {
    const community: Chat.community = {
      _: 'community',
      pFlags: {},
      id: 100,
      access_hash: '42',
      title: 'Community',
      photo: {_: 'chatPhotoEmpty'},
      date: 0
    };
    const updates: Updates.updates = {
      _: 'updates',
      chats: [],
      date: 0,
      seq: 0,
      updates: [],
      users: []
    };
    const invokeApi = vi.fn().mockResolvedValue(updates);
    const onChatUpdated = vi.fn();
    const manager = new AppChatsManager();
    Object.assign(manager as any, {
      chats: {[community.id]: community},
      apiManager: {invokeApi},
      onChatUpdated
    });

    await manager.editTitle(community.id, 'Renamed');

    expect(invokeApi).toHaveBeenCalledWith('channels.editTitle', {
      channel: {
        _: 'inputChannel',
        channel_id: community.id,
        access_hash: '42'
      },
      title: 'Renamed'
    });
    expect(onChatUpdated).toHaveBeenCalledWith(community.id, updates);
  });

  test('routes Community participant lookup through the shared channel participant path', async() => {
    const getChannelParticipant = vi.fn().mockResolvedValue(undefined);
    const manager = new AppProfileManager();
    Object.assign(manager as any, {
      appChatsManager: {
        isChannel: () => false,
        isCommunity: () => true
      },
      getChannelParticipant
    });

    await manager.getParticipant(100, 200);

    expect(getChannelParticipant).toHaveBeenCalledWith(100, 200);
  });

  test('invalidates a cached Community avatar when its photo changes', () => {
    const oldCommunity: Chat.community = {
      _: 'community',
      pFlags: {},
      id: 100,
      title: 'Community',
      photo: {
        _: 'chatPhoto',
        pFlags: {},
        photo_id: '1',
        dc_id: 2
      },
      date: 0
    };
    const community: Chat.community = {
      ...oldCommunity,
      photo: {
        _: 'chatPhoto',
        pFlags: {},
        photo_id: '2',
        dc_id: 4
      }
    };
    const dispatchEvent = vi.fn();

    AppChatsManager.prototype.saveApiChat.call({
      chats: {100: oldCommunity},
      mirrorChat: vi.fn(),
      appCommunitiesManager: {handleCommunityUpdate: vi.fn()},
      rootScope: {dispatchEvent},
      peersStorage: {isPeerNeeded: () => false}
    } as unknown as AppChatsManager, community);

    expect(dispatchEvent).toHaveBeenCalledWith('avatar_update', {
      peerId: (100 as ChatId).toPeerId(true)
    });
  });

  test('does not process a Community update as an ordinary channel dialog update', () => {
    const isInChat = vi.fn();
    const dispatchEvent = vi.fn();
    const manager = new AppMessagesManager();
    Object.assign(manager as any, {
      appChatsManager: {
        getChat: (): undefined => undefined,
        isInChat
      },
      rootScope: {dispatchEvent}
    });

    (manager as any).onUpdateChannel({
      _: 'updateChannel',
      channel_id: 100
    });

    expect(isInChat).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
