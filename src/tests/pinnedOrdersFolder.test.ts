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
  // * responses to a folder-scoped messages.getDialogs / messages.getPinnedDialogs come
  // * without 'folder_id', so without the explicit folderId archived dialogs used to be
  // * filed into folder 0 (and their pins into pinnedOrders[0], eating the pin limit)
  test('saveDialog files a folder-scoped dialog into the requested folder', () => {
    const storage = createStorage();
    const dialog = makeDialog(100);

    storage.saveDialog({dialog: dialog as any, folderId: FOLDER_ID_ARCHIVE});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ARCHIVE);
  });

  test('saveDialog defaults to the main folder without a requested folder', () => {
    const storage = createStorage();
    const dialog = makeDialog(100);

    storage.saveDialog({dialog: dialog as any});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ALL);
  });

  test('saveDialog keeps the known folder of an already cached dialog', () => {
    const storage = createStorage();
    storage.saveDialog({dialog: makeDialog(100) as any, folderId: FOLDER_ID_ALL});

    const dialog = makeDialog(100);
    storage.saveDialog({dialog: dialog as any, folderId: FOLDER_ID_ARCHIVE});

    expect((dialog as any).folder_id).toEqual(FOLDER_ID_ALL);
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
