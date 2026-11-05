import DialogsStorage from '@lib/storages/dialogs';
import {Dialog as MTDialog} from '@layer';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import makeDialogFilter from '@/tests/helpers/dialogFilter';
import '@helpers/peerIdPolyfill';

const makeHistoryStorage = () => ({
  history: {
    slice: Object.assign([] as number[], {isEnd: () => false}),
    first: [] as number[],
    unshift: () => {}
  },
  count: 0
});

/** A dialogs storage with the managers it reads stubbed out; `managers` adds methods to them or replaces some */
export function createDialogsStorage(managers: Record<string, Record<string, any>> = {}) {
  const storage = new DialogsStorage();
  const stubs: Record<string, Record<string, any>> = {
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
  };

  for(const name in managers) {
    stubs[name] = {...stubs[name], ...managers[name]};
  }

  Object.assign(storage as any, stubs);

  (storage as any).clear(true);
  (storage as any).dialogs = {};
  (storage as any).dialogsStorage = {
    prepareDialogUnreadCountModifying: () => () => {}
  };
  return storage;
}

/** A user's dialog as the server sends it */
export function makeDialog(userId: number, fields?: Partial<MTDialog.dialog>): MTDialog.dialog {
  return {
    _: 'dialog',
    pFlags: {},
    peer: {_: 'peerUser', user_id: userId},
    top_message: 0,
    read_inbox_max_id: 0,
    read_outbox_max_id: 0,
    unread_count: 0,
    unread_mentions_count: 0,
    unread_reactions_count: 0,
    notify_settings: {_: 'peerNotifySettings'},
    ...fields
  } as any;
}

/**
 * A storage of All Chats whose chats' top messages are of the dates a test gives them (`dates`, by `peerId_mid`):
 * `save` puts a chat in it as a page of the list does, `order` reads its chats from the top
 */
export function createAllChatsStorage() {
  const dates = new Map<string, number>();
  const storage = createDialogsStorage({
    appMessagesManager: {
      getMessageByPeer: (peerId: PeerId, mid: number) => dates.has(`${peerId}_${mid}`) ?
        {_: 'message', mid, date: dates.get(`${peerId}_${mid}`), pFlags: {}} :
        undefined,
      getDialogUnreadCount: () => 0
    },
    appNotificationsManager: {
      isPeerLocalMuted: () => false
    },
    appPeersManager: {
      isForum: () => false
    },
    filtersStorage: {
      getFilters: () => ({[FOLDER_ID_ALL]: makeDialogFilter(FOLDER_ID_ALL, FOLDER_ID_ALL)}),
      testDialogForFilter: (dialog: any, filter: any) => !filter || dialog.folder_id === filter.id
    }
  });

  const save = (userId: number, topMessage: number, date: number, options: {keepPlace?: boolean} = {}) => {
    dates.set(`${userId}_${topMessage}`, date);
    const dialog = makeDialog(userId, {top_message: topMessage});
    storage.saveDialog({dialog: dialog as any, ...options});
    return dialog;
  };
  const order = () => storage.getFolderDialogs(FOLDER_ID_ALL, false).map((dialog) => +dialog.peerId);

  return {storage, dates, save, order};
}
