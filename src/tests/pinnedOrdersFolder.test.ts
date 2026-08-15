import DialogsStorage from '@lib/storages/dialogs';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {Dialog as MTDialog} from '@layer';
import '@helpers/peerIdPolyfill';

const makeHistoryStorage = () => ({
  history: {
    slice: Object.assign([] as number[], {isEnd: () => false}),
    first: [] as number[],
    unshift: () => {}
  },
  count: 0
});

const createStorage = () => {
  const storage = new DialogsStorage();
  Object.assign(storage as any, {
    appPeersManager: {
      isChannel: () => false,
      isBotforum: () => false,
      getPeerId: (peer: any) => peer.user_id ?? -peer.channel_id,
      getPeerSearchText: () => ''
    },
    appUsersManager: {
      isDeleted: () => false
    },
    appChatsManager: {
      getChat: () => ({})
    },
    appMessagesIdsManager: {
      generateMessageId: (id: number) => id
    },
    appMessagesManager: {
      getMessageByPeer: (): any => undefined,
      getHistoryStorage: makeHistoryStorage,
      getHistoryMessagesStorage: () => ({}),
      getMessageFromStorage: (): any => undefined,
      mergeReplyKeyboard: () => false,
      insertChannelJoinedService: () => {},
      saveMessages: () => {}
    },
    appDraftsManager: {
      saveDraft: (): any => undefined,
      addMissedDialogs: () => {}
    },
    appNotificationsManager: {
      savePeerSettings: () => {}
    },
    appStateManager: {
      pushToState: () => {}
    },
    apiUpdatesManager: {
      addChannelState: () => {},
      addMultipleEventsListeners: () => {}
    },
    filtersStorage: {
      getFilters: () => ({}),
      testDialogForFilter: () => true
    },
    peersStorage: {
      requestPeer: () => {},
      requestPeersForKey: () => {}
    },
    rootScope: {
      addEventListener: () => {},
      dispatchEvent: () => {}
    },
    storage: {
      set: () => {},
      delete: () => {},
      getCache: () => ({})
    }
  });

  (storage as any).clear(true);
  (storage as any).dialogs = {};
  (storage as any).dialogsStorage = {
    prepareDialogUnreadCountModifying: () => () => {}
  };
  return storage;
};

const makeDialog = (userId: number): MTDialog.dialog => ({
  _: 'dialog',
  pFlags: {pinned: true},
  peer: {_: 'peerUser', user_id: userId},
  top_message: 0,
  read_inbox_max_id: 0,
  read_outbox_max_id: 0,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  notify_settings: {_: 'peerNotifySettings'}
} as any);

describe('pinned orders are folder-scoped', () => {
  // * the server stamps 'folder_id' on every dialog outside the main folder — in the answer to a
  // * folder-scoped messages.getDialogs too, whose dialogs are NOT all in the requested folder:
  // * an answer for folder 1 also carries the pinned dialogs of folder 0, unmarked
  test('saveDialog files a dialog the server left unmarked into the main folder', () => {
    const storage = createStorage();
    const dialog = makeDialog(100);

    storage.saveDialog({dialog: dialog as any});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ALL);
  });

  test('saveDialog keeps the folder the server stamped', () => {
    const storage = createStorage();
    const dialog = Object.assign(makeDialog(100), {folder_id: FOLDER_ID_ARCHIVE});

    storage.saveDialog({dialog: dialog as any});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ARCHIVE);
  });

  test('saveDialog takes a cached dialog out of the archive when the server stops marking it', () => {
    const storage = createStorage();
    storage.saveDialog({dialog: Object.assign(makeDialog(100), {folder_id: FOLDER_ID_ARCHIVE}) as any});

    const dialog = makeDialog(100);
    storage.saveDialog({dialog: dialog as any});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ALL);
  });

  // * moving a pinned dialog between folders is usually learned from 'updateFolderPeers', but not
  // * when it happened elsewhere while this client was offline — then only the dialogs answer says so
  test('saveDialog drops the pin of the folder the dialog left', () => {
    const storage = createStorage();
    storage.saveDialog({dialog: makeDialog(100) as any});
    const order = storage.getPinnedOrders(FOLDER_ID_ALL);
    order.splice(0, order.length, 100 as PeerId, 200 as PeerId);

    storage.saveDialog({dialog: Object.assign(makeDialog(100), {folder_id: FOLDER_ID_ARCHIVE}) as any});

    expect(storage.getPinnedOrders(FOLDER_ID_ALL)).toEqual([200]);
  });

  test('saveDialog keeps the pin of a dialog that stayed in its folder', () => {
    const storage = createStorage();
    storage.saveDialog({dialog: makeDialog(100) as any});
    const order = storage.getPinnedOrders(FOLDER_ID_ALL);
    order.splice(0, order.length, 100 as PeerId, 200 as PeerId);

    storage.saveDialog({dialog: makeDialog(100) as any});

    expect(storage.getPinnedOrders(FOLDER_ID_ALL)).toEqual([100, 200]);
  });

  test('drops pinned entries belonging to another folder on load', async() => {
    const storage = createStorage();
    const pinnedOrders = {
      [FOLDER_ID_ALL]: [100 as PeerId, -200 as PeerId, -300 as PeerId],
      [FOLDER_ID_ARCHIVE]: [-200 as PeerId, -300 as PeerId]
    };
    const pushToState = vi.fn();
    Object.assign(storage as any, {
      appStateManager: {
        getState: () => Promise.resolve({pinnedOrders, allDialogsLoaded: {}}),
        pushToState
      },
      appStoragesManager: {
        loadStorage: () => Promise.resolve({
          results: [
            {peerId: 100 as PeerId, folder_id: FOLDER_ID_ALL},
            {peerId: -200 as PeerId, folder_id: FOLDER_ID_ARCHIVE},
            {peerId: -300 as PeerId, folder_id: FOLDER_ID_ARCHIVE}
          ],
          storage: {getCache: () => ({})}
        })
      },
      setDialogsFromState: () => {}
    });

    await (storage as any).after();

    expect(storage.getPinnedOrders(FOLDER_ID_ALL)).toEqual([100]);
    expect(storage.getPinnedOrders(FOLDER_ID_ARCHIVE)).toEqual([-200, -300]);
    expect(pushToState).toHaveBeenCalledWith('pinnedOrders', expect.anything());
  });

  test('keeps pinned entries whose dialog is not cached', async() => {
    const storage = createStorage();
    const pushToState = vi.fn();
    Object.assign(storage as any, {
      appStateManager: {
        getState: () => Promise.resolve({
          pinnedOrders: {[FOLDER_ID_ALL]: [100 as PeerId, -400 as PeerId]},
          allDialogsLoaded: {}
        }),
        pushToState
      },
      appStoragesManager: {
        loadStorage: () => Promise.resolve({
          results: [{peerId: 100 as PeerId, folder_id: FOLDER_ID_ALL}],
          storage: {getCache: () => ({})}
        })
      },
      setDialogsFromState: () => {}
    });

    await (storage as any).after();

    expect(storage.getPinnedOrders(FOLDER_ID_ALL)).toEqual([100, -400]);
    expect(pushToState).not.toHaveBeenCalled();
  });
});

describe('pin limit ignores members of a folded Community', () => {
  const setOrder = (storage: DialogsStorage, folderId: number, order: PeerId[]) => {
    const _order = storage.getPinnedOrders(folderId);
    _order.splice(0, _order.length, ...order);
  };

  const stubCollapsed = (storage: DialogsStorage, byFolder: {[folderId: number]: PeerId[]}) => {
    Object.assign(storage as any, {
      appCommunitiesManager: {
        getCollapsedCommunityPeerIds: (folderId: number) => byFolder[folderId] || []
      }
    });
  };

  test('counts only the pins visible in a real folder', () => {
    const storage = createStorage();
    setOrder(storage, FOLDER_ID_ALL, [100 as PeerId, -200 as PeerId, -300 as PeerId]);
    stubCollapsed(storage, {[FOLDER_ID_ALL]: [-200 as PeerId, -300 as PeerId]});

    expect(storage.getVisiblePinnedCount(FOLDER_ID_ALL)).toEqual(1);
    // * the order itself stays server-truth, so the pins come back when the Community unfolds
    expect(storage.getPinnedOrders(FOLDER_ID_ALL)).toHaveLength(3);
  });

  test('counts every pin when no Community is folded', () => {
    const storage = createStorage();
    setOrder(storage, FOLDER_ID_ALL, [100 as PeerId, -200 as PeerId]);
    stubCollapsed(storage, {});

    expect(storage.getVisiblePinnedCount(FOLDER_ID_ALL)).toEqual(2);
  });

  test('does not exclude anything in a virtual filter', () => {
    const storage = createStorage();
    const filterId = 500 as PeerId;
    Object.assign(storage as any, {isVirtualFilter: () => true});
    setOrder(storage, filterId, [100 as PeerId, -200 as PeerId]);
    stubCollapsed(storage, {[filterId]: [-200 as PeerId]});

    expect(storage.getVisiblePinnedCount(filterId)).toEqual(2);
  });
});
