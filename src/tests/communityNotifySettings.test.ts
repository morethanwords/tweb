import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import DialogsStorage from '@lib/storages/dialogs';
import {Dialog, MessagesDialogs, MessagesPeerDialogs, PeerNotifySettings} from '@layer';
import '@helpers/peerIdPolyfill';

describe('community notification settings', () => {
  test('saves community settings before reverse-processing linked dialogs', () => {
    const order: string[] = [];
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      appNotificationsManager: {
        savePeerSettings: () => order.push('community')
      }
    });
    const linkedDialog = {
      _: 'dialog',
      peer: {_: 'peerUser', user_id: 100}
    } as Dialog.dialog;
    const dialogs: Dialog[] = [{
      _: 'dialogCommunity',
      pFlags: {},
      community_id: 200,
      notify_settings: {_: 'peerNotifySettings'}
    }, linkedDialog];

    const filtered = storage.filterDialogsForStorage(dialogs);
    [...filtered].reverse().forEach(() => order.push('linked'));

    expect(filtered).toEqual([linkedDialog]);
    expect(order).toEqual(['community', 'linked']);
  });

  test('keeps dialogCommunity settings before filtering the unsupported dialog', () => {
    const settings: PeerNotifySettings = {
      _: 'peerNotifySettings',
      mute_until: 100
    };
    const savePeerSettings = vi.fn();
    const saveApiResult = vi.fn();
    const dialogs: Dialog[] = [{
      _: 'dialogCommunity',
      pFlags: {},
      community_id: 200,
      notify_settings: settings
    }];
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      appMessagesManager: {saveApiResult},
      appNotificationsManager: {savePeerSettings}
    });
    const result: MessagesPeerDialogs = {
      _: 'messages.peerDialogs',
      chats: [],
      dialogs,
      messages: [],
      state: {
        _: 'updates.state',
        date: 0,
        pts: 0,
        qts: 0,
        seq: 0,
        unread_count: 0
      },
      users: []
    };

    DialogsStorage.prototype.applyDialogs.call(storage, result);

    expect(savePeerSettings).toHaveBeenCalledWith({
      communityId: 200,
      settings
    });
    expect(result.dialogs).toEqual([]);
    expect(saveApiResult).toHaveBeenCalledWith(result);
  });

  test('inherits linked channel settings between peer and global defaults', () => {
    const peerId = (300 as ChatId).toPeerId(true);
    const manager = new AppNotificationsManager();
    Object.assign(manager as any, {
      appChatsManager: {
        getChat: () => ({
          _: 'channel',
          linked_community_id: 200
        })
      },
      appPeersManager: {
        getInputNotifyPeerById: () => ({_: 'inputNotifyBroadcasts'})
      }
    });
    Object.assign((manager as any).peerSettings, {
      notifyPeer: {
        [peerId]: {
          _: 'peerNotifySettings',
          mute_until: 0,
          show_previews: false
        }
      },
      notifyCommunity: {
        200: {
          _: 'peerNotifySettings',
          mute_until: 100,
          silent: true,
          stories_muted: true
        }
      },
      notifyUsers: {
        _: 'peerNotifySettings',
        show_previews: true,
        silent: false,
        stories_muted: false
      },
      notifyBroadcasts: {
        _: 'peerNotifySettings',
        show_previews: true,
        silent: false,
        stories_muted: false
      }
    });

    expect((manager as any).getPeerLocalSettings({peerId})).toMatchObject({
      _: 'peerNotifySettings',
      mute_until: 0,
      show_previews: false,
      silent: true,
      stories_muted: true
    });
  });

  test('does not inherit Community settings in a linked bot dialog', () => {
    const peerId = (100 as UserId).toPeerId(false);
    const manager = new AppNotificationsManager();
    Object.assign(manager as any, {
      appChatsManager: {
        getChat: vi.fn()
      },
      appPeersManager: {
        getInputNotifyPeerById: () => ({_: 'inputNotifyUsers'})
      }
    });
    Object.assign((manager as any).peerSettings, {
      notifyPeer: {
        [peerId]: {
          _: 'peerNotifySettings',
          mute_until: 0,
          show_previews: false
        }
      },
      notifyCommunity: {
        200: {
          _: 'peerNotifySettings',
          mute_until: 100,
          silent: true,
          stories_muted: true
        }
      },
      notifyUsers: {
        _: 'peerNotifySettings',
        show_previews: true,
        silent: false,
        stories_muted: false
      }
    });

    expect((manager as any).getPeerLocalSettings({peerId})).toMatchObject({
      _: 'peerNotifySettings',
      mute_until: 0,
      show_previews: false,
      silent: false,
      stories_muted: false
    });
  });

  test('invalidates cached linked dialogs when community settings change', () => {
    const peerId = (300 as ChatId).toPeerId(true);
    const dialog = {_: 'dialog', peerId} as Dialog.dialog;
    const dispatchEvent = vi.fn();
    const saveCommunityNotifySettings = vi.fn();
    const manager = new AppNotificationsManager();
    Object.assign(manager as any, {
      appCommunitiesManager: {saveCommunityNotifySettings},
      appChatsManager: {
        getChat: () => ({
          _: 'channel',
          linked_community_id: 200
        })
      },
      checkMuteUntilThrottled: vi.fn(),
      dialogsStorage: {
        getFolderDialogs: (folderId: number) => folderId ? [] : [dialog]
      },
      rootScope: {dispatchEvent}
    });
    const update = {
      _: 'updateNotifySettings',
      peer: {
        _: 'notifyCommunity',
        community_id: 200
      },
      notify_settings: {
        _: 'peerNotifySettings',
        mute_until: 100
      }
    } as const;

    (manager as any).onUpdateNotifySettings(update);

    expect(saveCommunityNotifySettings).toHaveBeenCalledWith(
      200,
      update.notify_settings
    );
    expect(dispatchEvent).toHaveBeenNthCalledWith(1, 'dialog_notify_settings', dialog);
    expect(dispatchEvent).toHaveBeenNthCalledWith(2, 'notify_settings', update);
  });
});

describe('community pinned dialog order', () => {
  const ordinaryA = (100 as UserId).toPeerId(false);
  const communityId = 200 as ChatId;
  const communityPeerId = communityId.toPeerId(true);
  const ordinaryB = (300 as UserId).toPeerId(false);

  const makeDialog = (userId: UserId): Dialog.dialog => ({
    _: 'dialog',
    pFlags: {pinned: true},
    peer: {_: 'peerUser', user_id: userId},
    top_message: 0,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: 0,
    unread_poll_votes_count: 0,
    notify_settings: {_: 'peerNotifySettings'}
  });

  test('preserves cold-start order ordinary A, Community, ordinary B', async() => {
    const storage = new DialogsStorage();
    const communitiesManager = {
      getCommunityDialogsCount: () => 1,
      handlePinnedDialogsOrder: vi.fn(),
      isCommunity: (peerId: PeerId) => peerId === communityPeerId,
      sanitizePinnedDialogsOrder: (order: PeerId[]) => order,
      saveCommunityDialog: vi.fn()
    };
    Object.assign(storage as any, {
      allDialogsLoaded: {},
      dialogs: {},
      dialogsOffsetDate: {},
      folders: {},
      pinnedOrders: {0: []},
      appCommunitiesManager: communitiesManager,
      appMessagesManager: {scheduleHandleNewDialogs: vi.fn()},
      appPeersManager: {
        getPeerId: (peer: Dialog.dialog['peer']) => peer._ === 'peerUser' ?
          peer.user_id.toPeerId(false) :
          peer._ === 'peerChannel' ?
            peer.channel_id.toPeerId(true) :
            peer.chat_id.toPeerId(true),
        isBotforum: () => false,
        peerId: (1 as UserId).toPeerId(false)
      },
      appStateManager: {pushToState: vi.fn()},
      saveDialog: vi.fn(),
      setDialogsLoaded: vi.fn(),
      getFolderDialogs: (): never[] => []
    });

    const filterDialogsForStorage = storage.filterDialogsForStorage.bind(storage);
    vi.spyOn(storage, 'filterDialogsForStorage').mockImplementation((dialogs, onPinnedOrder) => {
      const filtered = filterDialogsForStorage(dialogs, onPinnedOrder);
      filtered.length = 0;
      return filtered;
    });

    const response = {
      _: 'messages.dialogsSlice',
      count: 3,
      chats: [],
      dialogs: [
        makeDialog(100 as UserId),
        {
          _: 'dialogCommunity',
          pFlags: {pinned: true},
          community_id: communityId,
          notify_settings: {_: 'peerNotifySettings'}
        },
        makeDialog(300 as UserId)
      ],
      messages: [],
      users: []
    } as MessagesDialogs.messagesDialogsSlice;
    const manager = new AppMessagesManager();
    const log = Object.assign(vi.fn(), {
      bindPrefix: () => log,
      error: vi.fn(),
      warn: vi.fn()
    });
    Object.assign(manager as any, {
      apiManager: {
        invokeApiSingleProcess: vi.fn(({processResult}) => Promise.resolve(processResult(response)))
      },
      appCommunitiesManager: communitiesManager,
      appDraftsManager: {addMissedDialogs: vi.fn()},
      appPeersManager: {getInputPeerById: vi.fn()},
      dialogsStorage: storage,
      log,
      middleware: {get: () => () => true},
      rootScope: {dispatchEvent: vi.fn()},
      saveApiResult: vi.fn()
    });

    const result = await manager.getTopMessages({limit: 20, folderId: 0});

    expect(storage.getPinnedOrders(0)).toEqual([
      ordinaryA,
      communityPeerId,
      ordinaryB
    ]);
    expect(communitiesManager.handlePinnedDialogsOrder).toHaveBeenCalledWith(0);
    expect(result.count).toBe(2);
  });

  test('does not clobber global order from a point getPeerDialogs response', () => {
    const saveApiResult = vi.fn();
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      pinnedOrders: {
        0: [ordinaryA, communityPeerId, ordinaryB]
      },
      appCommunitiesManager: {
        saveCommunityDialog: vi.fn()
      },
      appMessagesManager: {saveApiResult},
      appNotificationsManager: {
        savePeerSettings: vi.fn()
      }
    });
    const result: MessagesPeerDialogs = {
      _: 'messages.peerDialogs',
      chats: [],
      dialogs: [{
        _: 'dialogCommunity',
        pFlags: {pinned: true},
        community_id: communityId,
        notify_settings: {_: 'peerNotifySettings'}
      }],
      messages: [],
      state: {
        _: 'updates.state',
        date: 0,
        pts: 0,
        qts: 0,
        seq: 0,
        unread_count: 0
      },
      users: []
    };

    storage.applyDialogs(result);

    expect(storage.getPinnedOrders(0)).toEqual([
      ordinaryA,
      communityPeerId,
      ordinaryB
    ]);
    expect(saveApiResult).toHaveBeenCalledWith(result);
  });

  test('drops a stale Community from a late pinned-dialogs response', async() => {
    let resolvePinned: (value: MessagesPeerDialogs) => void;
    const pinnedPromise = new Promise<MessagesPeerDialogs>((resolve) => {
      resolvePinned = resolve;
    });
    let pinState = 'collapsed:pinned';
    const currentPinnedOrder: PeerId[] = [communityPeerId];
    const captureCommunityPinState = () => new Map([
      [communityId, pinState]
    ]);
    const getChangedCommunityIds = (
      snapshot: ReadonlyMap<ChatId, string>
    ) => {
      const changedCommunityIds = new Set<ChatId>();
      if(snapshot.get(communityId) !== pinState) {
        changedCommunityIds.add(communityId);
      }

      return changedCommunityIds;
    };
    const restoreCommunityPinPositions = (
      order: PeerId[],
      changedCommunityIds: ReadonlySet<ChatId>
    ) => {
      const nextOrder = order.filter((peerId) => {
        return peerId !== communityPeerId;
      });
      if(
        changedCommunityIds.size &&
        currentPinnedOrder.includes(communityPeerId)
      ) {
        nextOrder.unshift(communityPeerId);
      }
      return nextOrder;
    };
    const applyDialogs = vi.fn();
    const handleDialogsPinned = vi.fn();
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      apiManager: {
        invokeApi: vi.fn().mockReturnValue(pinnedPromise)
      },
      appCommunitiesManager: {
        captureCommunityPinState,
        getChangedCommunityIds,
        restoreCommunityPinPositions,
        handlePinnedDialogsOrder: vi.fn()
      },
      appPeersManager: {
        getPeerId: (peer: Dialog.dialog['peer']) => {
          return peer._ === 'peerUser' ?
            peer.user_id.toPeerId(false) :
            peer._ === 'peerChannel' ?
              peer.channel_id.toPeerId(true) :
              peer.chat_id.toPeerId(true);
        },
        peerId: (1 as UserId).toPeerId(false)
      },
      applyDialogs,
      handleDialogsPinned
    });

    (storage as any).onUpdatePinnedDialogs({
      _: 'updatePinnedDialogs',
      folder_id: 0
    });
    pinState = 'expanded:unpinned';
    currentPinnedOrder.length = 0;
    resolvePinned!({
      _: 'messages.peerDialogs',
      chats: [{
        _: 'community',
        pFlags: {collapsed_in_dialogs: true},
        id: communityId,
        access_hash: 'community',
        title: 'Community',
        photo: {_: 'chatPhotoEmpty'},
        date: 1
      }],
      dialogs: [
        makeDialog(100 as UserId),
        {
          _: 'dialogCommunity',
          pFlags: {pinned: true},
          community_id: communityId,
          notify_settings: {_: 'peerNotifySettings'}
        }
      ],
      messages: [],
      state: {
        _: 'updates.state',
        date: 0,
        pts: 0,
        qts: 0,
        seq: 0,
        unread_count: 0
      },
      users: []
    });

    await vi.waitFor(() => expect(applyDialogs).toHaveBeenCalledOnce());
    const applied = applyDialogs.mock.calls[0][0] as MessagesPeerDialogs;
    expect(applied.dialogs).toEqual([makeDialog(100 as UserId)]);
    expect(applied.chats).toEqual([]);
    expect(handleDialogsPinned).toHaveBeenCalledWith(0, [ordinaryA]);
  });

  test('preserves a Community pinned while getPinnedDialogs was pending', async() => {
    let resolvePinned: (value: MessagesPeerDialogs) => void;
    const pinnedPromise = new Promise<MessagesPeerDialogs>((resolve) => {
      resolvePinned = resolve;
    });
    let pinState = 'expanded:unpinned';
    const currentPinnedOrder: PeerId[] = [];
    const snapshot = new Map([[communityId, pinState]]);
    const appCommunitiesManager = {
      captureCommunityPinState: () => new Map(snapshot),
      getChangedCommunityIds: (captured: ReadonlyMap<ChatId, string>) => {
        const changedCommunityIds = new Set<ChatId>();
        if(captured.get(communityId) !== pinState) {
          changedCommunityIds.add(communityId);
        }

        return changedCommunityIds;
      },
      restoreCommunityPinPositions: (
        order: PeerId[],
        changedCommunityIds: ReadonlySet<ChatId>
      ) => {
        const nextOrder = order.filter((peerId) => {
          return peerId !== communityPeerId;
        });
        if(
          changedCommunityIds.size &&
          currentPinnedOrder.includes(communityPeerId)
        ) {
          nextOrder.unshift(communityPeerId);
        }
        return nextOrder;
      },
      handlePinnedDialogsOrder: vi.fn()
    };
    const applyDialogs = vi.fn();
    const handleDialogsPinned = vi.fn();
    const storage = new DialogsStorage();
    Object.assign(storage as any, {
      apiManager: {
        invokeApi: vi.fn().mockReturnValue(pinnedPromise)
      },
      appCommunitiesManager,
      appPeersManager: {
        getPeerId: (peer: Dialog.dialog['peer']) => {
          return peer._ === 'peerUser' ?
            peer.user_id.toPeerId(false) :
            peer._ === 'peerChannel' ?
              peer.channel_id.toPeerId(true) :
              peer.chat_id.toPeerId(true);
        },
        peerId: (1 as UserId).toPeerId(false)
      },
      applyDialogs,
      handleDialogsPinned
    });

    (storage as any).onUpdatePinnedDialogs({
      _: 'updatePinnedDialogs',
      folder_id: 0
    });
    pinState = 'collapsed:pinned';
    currentPinnedOrder.push(communityPeerId);
    resolvePinned!({
      _: 'messages.peerDialogs',
      chats: [],
      dialogs: [makeDialog(100 as UserId)],
      messages: [],
      state: {
        _: 'updates.state',
        date: 0,
        pts: 0,
        qts: 0,
        seq: 0,
        unread_count: 0
      },
      users: []
    });

    await vi.waitFor(() => expect(applyDialogs).toHaveBeenCalledOnce());
    expect(handleDialogsPinned).toHaveBeenCalledWith(0, [
      communityPeerId,
      ordinaryA
    ]);
  });
});
