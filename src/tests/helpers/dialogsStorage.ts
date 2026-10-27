import DialogsStorage from '@lib/storages/dialogs';
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
