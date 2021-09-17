/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type { Chat, DialogPeer, Message, MessagesPeerDialogs, Update } from "../../layer";
import type { AppChatsManager } from "../appManagers/appChatsManager";
import type { AppMessagesManager, Dialog, MyMessage } from "../appManagers/appMessagesManager";
import type { AppPeersManager } from "../appManagers/appPeersManager";
import type { AppUsersManager } from "../appManagers/appUsersManager";
import type { AppDraftsManager } from "../appManagers/appDraftsManager";
import type { AppNotificationsManager } from "../appManagers/appNotificationsManager";
import type { ApiUpdatesManager } from "../appManagers/apiUpdatesManager";
import type { ServerTimeManager } from "../mtproto/serverTimeManager";
import type { AppMessagesIdsManager } from "../appManagers/appMessagesIdsManager";
import { tsNow } from "../../helpers/date";
import apiManager from "../mtproto/mtprotoworker";
import SearchIndex from "../searchIndex";
import { forEachReverse, insertInDescendSortedArray } from "../../helpers/array";
import rootScope from "../rootScope";
import { safeReplaceObject } from "../../helpers/object";
import { AppStateManager } from "../appManagers/appStateManager";
import { SliceEnd } from "../../helpers/slicedArray";
import { MyDialogFilter } from "./filters";

export type FolderDialog = {
  dialog: Dialog,
  index: number
};

export type Folder = {
  dialogs: FolderDialog[],
  count?: number
};

export default class DialogsStorage {
  private storage: AppStateManager['storages']['dialogs'];
  
  private dialogs: {[peerId: string]: Dialog};
  public byFolders: {[folderId: number]: Dialog[]};

  // public folders: {[folderId: number]: Folder} = {};

  private allDialogsLoaded: {[folder_id: number]: boolean};
  private dialogsOffsetDate: {[folder_id: number]: number};
  private pinnedOrders: {[folder_id: number]: number[]};
  private dialogsNum: number;

  private dialogsIndex: SearchIndex<number>;

  private cachedResults: {
    query: string,
    count: number,
    dialogs: Dialog[],
    folderId: number
  };

  constructor(private appMessagesManager: AppMessagesManager, 
    private appChatsManager: AppChatsManager, 
    private appPeersManager: AppPeersManager, 
    private appUsersManager: AppUsersManager,
    private appDraftsManager: AppDraftsManager,
    private appNotificationsManager: AppNotificationsManager,
    private appStateManager: AppStateManager,
    private apiUpdatesManager: ApiUpdatesManager,
    private serverTimeManager: ServerTimeManager,
    private appMessagesIdsManager: AppMessagesIdsManager
  ) {
    this.storage = this.appStateManager.storages.dialogs;
    this.dialogs = this.storage.getCache();
    this.clear(true);

    rootScope.addEventListener('language_change', (e) => {
      const peerId = appUsersManager.getSelf().id;
      const dialog = this.getDialogOnly(peerId);
      if(dialog) {
        const peerText = appPeersManager.getPeerSearchText(peerId);
        this.dialogsIndex.indexObject(peerId, peerText);
      }
    });

    // to set new indexes
    rootScope.addEventListener('filter_order', () => {
      // ! MUST BE REFACTORED !
      for(let id in this.appMessagesManager.filtersStorage.filters) {
        this.getFolder(+id, false);
      }
    });

    rootScope.addMultipleEventsListeners({
      updateFolderPeers: this.onUpdateFolderPeers,

      updateDialogPinned: this.onUpdateDialogPinned,

      updatePinnedDialogs: this.onUpdatePinnedDialogs,
    });

    appStateManager.getState().then((state) => {
      this.pinnedOrders = state.pinnedOrders || {};
      if(!this.pinnedOrders[0]) this.pinnedOrders[0] = [];
      if(!this.pinnedOrders[1]) this.pinnedOrders[1] = [];
      
      const dialogs = appStateManager.storagesResults.dialogs;
      if(dialogs.length) {
        for(let i = 0, length = dialogs.length; i < length; ++i) {
          const dialog = dialogs[i];
          if(dialog) {
            dialog.top_message = this.appMessagesIdsManager.getServerMessageId(dialog.top_message); // * fix outgoing message to avoid copying dialog

            if(dialog.topMessage) {
              this.appMessagesManager.saveMessages([dialog.topMessage]);
            }
  
            this.saveDialog(dialog, undefined, true);

            // ! WARNING, убрать это когда нужно будет делать чтобы pending сообщения сохранялись
            const message = this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
            if(message.deleted) {
              this.appMessagesManager.reloadConversation(dialog.peerId);
            }
          }
        }
      }

      this.allDialogsLoaded = state.allDialogsLoaded || {};
    });
  }

  public isDialogsLoaded(folderId: number) {
    return !!this.allDialogsLoaded[folderId];
  }

  public setDialogsLoaded(folderId: number, loaded: boolean) {
    this.allDialogsLoaded[folderId] = loaded;
    this.appStateManager.pushToState('allDialogsLoaded', this.allDialogsLoaded);
  }

  public clear(init = false) {
    if(!init) {
      const dialogs = this.appStateManager.storagesResults.dialogs;
      dialogs.length = 0;
      this.storage.clear();
    }

    this.byFolders = {};
    this.allDialogsLoaded = {};
    this.dialogsOffsetDate = {};
    this.pinnedOrders = {
      0: [],
      1: []
    };
    this.dialogsNum = 0;
    this.dialogsIndex = new SearchIndex<number>({
      clearBadChars: true,
      ignoreCase: true,
      latinize: true,
      includeTag: true
    });
    this.cachedResults = {
      query: '',
      count: 0,
      dialogs: [],
      folderId: 0
    };
  }

  public resetPinnedOrder(folderId: number) {
    this.pinnedOrders[folderId] = [];
  }

  public getPinnedOrders(folderId: number) {
    return this.pinnedOrders[folderId];
  }

  public getOffsetDate(folderId: number) {
    return this.dialogsOffsetDate[folderId] || 0;
  }

  public getFolder(id: number, skipMigrated = true) {
    if(id <= 1) {
      const arr = this.byFolders[id] ?? (this.byFolders[id] = []);
      return skipMigrated ? arr.filter(dialog => dialog.migratedTo === undefined) : arr;
    }

    // const dialogs: {dialog: Dialog, index: number}[] = [];
    const dialogs: Dialog[] = [];
    const filter = this.appMessagesManager.filtersStorage.getFilter(id);

    const indexStr = this.getDialogIndexKey(id);
    for(const peerId in this.dialogs) {
      const dialog = this.dialogs[peerId];
      if(this.setDialogIndexInFilter(dialog, indexStr, filter) && (!skipMigrated || dialog.migratedTo === undefined)) {
        insertInDescendSortedArray(dialogs, dialog, indexStr, -1);
      }
    }

    return dialogs;

    // dialogs.sort((a, b) => b.index - a.index);
    // return dialogs.map(d => d.dialog);
  }

  private setDialogIndexInFilter(dialog: Dialog, indexKey: ReturnType<DialogsStorage['getDialogIndexKey']>, filter: MyDialogFilter) {
    let index: number;

    if(this.appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) {
      const pinnedIndex = filter.pinned_peers.indexOf(dialog.peerId);
      if(pinnedIndex !== -1) {
        index = this.generateDialogIndex(this.generateDialogPinnedDateByIndex(filter.pinned_peers.length - 1 - pinnedIndex), true);
      } else if(dialog.pFlags?.pinned) {
        index = this.generateIndexForDialog(dialog, true);
      } else {
        index = dialog.index;
      }
    }

    return dialog[indexKey] = index;
  }

  public getDialog(peerId: number, folderId?: number, skipMigrated = true): [Dialog, number] | [] {
    const folders: Dialog[][] = [];

    if(folderId === undefined) {
      const dialogs = this.byFolders;
      for(const folderId in dialogs) {
        folders.push(dialogs[folderId]);
      }
    } else {
      folders.push(this.getFolder(folderId, skipMigrated));
    }

    for(let folder of folders) {
      let i = 0, skipped = 0;
      for(let length = folder.length; i < length; ++i) {
        const dialog = folder[i];
        if(dialog.peerId === peerId) {
          return [dialog, i - skipped];
        } else if(skipMigrated && dialog.migratedTo !== undefined) {
          ++skipped;
        }
      }
    }

    return [];
  }

  public getDialogOnly(peerId: number) {
    return this.dialogs[peerId];
  }

  /*
  var date = Date.now() / 1000 | 0;
  var m = date * 0x10000;

  var k = (date + 1) * 0x10000;
  k - m;
  65536
  */
  public generateDialogIndex(date?: number, isPinned?: boolean) {
    if(date === undefined) {
      date = tsNow(true) + this.serverTimeManager.serverTimeOffset;
    }

    return (date * 0x10000) + (isPinned ? 0 : ((++this.dialogsNum) & 0xFFFF));
  }

  public generateIndexForDialog(dialog: Dialog, justReturn = false, message?: MyMessage) {
    let topDate = 0, isPinned: boolean;
    if(dialog.pFlags.pinned && !justReturn) {
      topDate = this.generateDialogPinnedDate(dialog);
      isPinned = true;
    } else {
      if(!message) {
        message = this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
      }
      
      topDate = (message as Message.message).date || topDate;

      const channelId = this.appPeersManager.isChannel(dialog.peerId) ? -dialog.peerId : 0;
      if(channelId) {
        const channel: Chat.channel = this.appChatsManager.getChat(channelId);
        if(!topDate || (channel.date && channel.date > topDate)) {
          topDate = channel.date;
        }
      }
  
      if(dialog.draft?._ === 'draftMessage' && dialog.draft.date > topDate) {
        topDate = dialog.draft.date;
      }
    }

    if(!topDate) {
      topDate = tsNow(true);
    }

    const index = this.generateDialogIndex(topDate, isPinned);
    if(justReturn) {
      return index;
    }

    dialog.index = index;

    // ! MUST BE REFACTORED !
    for(let id in this.appMessagesManager.filtersStorage.filters) {
      const filter = this.appMessagesManager.filtersStorage.filters[id];
      this.setDialogIndexInFilter(dialog, this.getDialogIndexKey(+id), filter);
    }
  }

  public generateDialogPinnedDateByIndex(pinnedIndex: number) {
    return 0x7fff0000 + (pinnedIndex & 0xFFFF); // 0xFFFF - потому что в папках может быть бесконечное число пиннедов
  }

  public generateDialogPinnedDate(dialog: Dialog) {
    const order = this.pinnedOrders[dialog.folder_id];

    const foundIndex = order.indexOf(dialog.peerId);
    let pinnedIndex = foundIndex;
    if(foundIndex === -1) {
      pinnedIndex = order.push(dialog.peerId) - 1;
      this.appStateManager.pushToState('pinnedOrders', this.pinnedOrders);
    }

    return this.generateDialogPinnedDateByIndex(pinnedIndex);
  }

  /* public generateDialog(peerId: number) {
    const dialog: Dialog = {
      _: 'dialog',
      pFlags: {},
      peer: this.appPeersManager.getOutputPeer(peerId),
      top_message: 0,
      read_inbox_max_id: 0,
      read_outbox_max_id: 0,
      unread_count: 0,
      unread_mentions_count: 0,
      notify_settings: {
        _: 'peerNotifySettings',
      },
    };

    return dialog;
  } */

  public setDialogToState(dialog: Dialog) {
    const historyStorage = this.appMessagesManager.getHistoryStorage(dialog.peerId);
    const messagesStorage = this.appMessagesManager.getMessagesStorage(dialog.peerId);
    const history = historyStorage.history.slice;
    let incomingMessage: any;
    for(let i = 0, length = history.length; i < length; ++i) {
      const mid = history[i];
      const message: MyMessage = this.appMessagesManager.getMessageFromStorage(messagesStorage, mid);
      if(!message.pFlags.is_outgoing) {
        incomingMessage = message;
  
        const fromId = message.viaBotId || message.fromId;
        if(fromId !== dialog.peerId) {
          this.appStateManager.requestPeer(fromId, 'topMessage_' + dialog.peerId, 1);
        }
  
        break;
      }
    }

    dialog.topMessage = incomingMessage;

    if(dialog.peerId < 0 && dialog.pts) {
      const newPts = this.apiUpdatesManager.getChannelState(-dialog.peerId, dialog.pts).pts;
      dialog.pts = newPts;
    }

    this.storage.set({
      [dialog.peerId]: dialog
    });

    this.appStateManager.requestPeer(dialog.peerId, 'dialog_' + dialog.peerId, 1);

    /* for(let id in this.appMessagesManager.filtersStorage.filters) {
      const filter = this.appMessagesManager.filtersStorage.filters[id];

      if(this.appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) {
        
      }
    } */
  }

  public pushDialog(dialog: Dialog, offsetDate?: number) {
    const dialogs = this.getFolder(dialog.folder_id, false);
    const pos = dialogs.findIndex(d => d.peerId === dialog.peerId);
    if(pos !== -1) {
      dialogs.splice(pos, 1);
    }
    
    //if(!this.dialogs[dialog.peerId]) {
      this.dialogs[dialog.peerId] = dialog;
      
      this.setDialogToState(dialog);
      //}
      
    // let pos: number;
    if(offsetDate &&
      !dialog.pFlags.pinned &&
      (!this.dialogsOffsetDate[dialog.folder_id] || offsetDate < this.dialogsOffsetDate[dialog.folder_id])) {
      if(pos !== -1) { // So the dialog jumped to the last position
        // dialogs.splice(pos, 1);
        return false;
      }

      this.dialogsOffsetDate[dialog.folder_id] = offsetDate;
    }

    /* const newPos =  */insertInDescendSortedArray(dialogs, dialog, 'index', pos);
    /* if(pos !== -1 && pos !== newPos) {
      rootScope.dispatchEvent('dialog_order', {dialog, pos: newPos});
    } */
  }

  public dropDialog(peerId: number): [Dialog, number] | [] {
    const foundDialog = this.getDialog(peerId, undefined, false);
    if(foundDialog[0]) {
      this.byFolders[foundDialog[0].folder_id].splice(foundDialog[1], 1);
      this.pinnedOrders[foundDialog[0].folder_id].findAndSplice(_peerId => peerId === _peerId);
      this.dialogsIndex.indexObject(peerId, '');
      delete this.dialogs[peerId];

      // clear from state
      this.appStateManager.keepPeerSingle(0, 'topMessage_' + peerId);
      this.appStateManager.keepPeerSingle(0, 'dialog_' + peerId);
      this.storage.delete(peerId);
    }

    return foundDialog;
  }

  public applyDialogs(dialogsResult: MessagesPeerDialogs.messagesPeerDialogs) {
    // * В эту функцию попадут только те диалоги, в которых есть read_inbox_max_id и read_outbox_max_id, в отличие от тех, что будут в getTopMessages

    // ! fix 'dialogFolder', maybe there is better way to do it, this only can happen by 'messages.getPinnedDialogs' by folder_id: 0
    forEachReverse(dialogsResult.dialogs, (dialog, idx) => {
      if(dialog._ === 'dialogFolder') {
        dialogsResult.dialogs.splice(idx, 1);
      }
    });

    this.appUsersManager.saveApiUsers(dialogsResult.users);
    this.appChatsManager.saveApiChats(dialogsResult.chats);
    this.appMessagesManager.saveMessages(dialogsResult.messages);

    // this.appMessagesManager.log('applyConversation', dialogsResult);

    const updatedDialogs: {[peerId: number]: Dialog} = {};
    (dialogsResult.dialogs as Dialog[]).forEach((dialog) => {
      const peerId = this.appPeersManager.getPeerId(dialog.peer);
      let topMessage = dialog.top_message;

      const topPendingMessage = this.appMessagesManager.pendingTopMsgs[peerId];
      if(topPendingMessage) {
        if(!topMessage 
          || (this.appMessagesManager.getMessageByPeer(peerId, topPendingMessage) as MyMessage).date > (this.appMessagesManager.getMessageByPeer(peerId, topMessage) as MyMessage).date) {
          dialog.top_message = topMessage = topPendingMessage;
          this.appMessagesManager.getHistoryStorage(peerId).maxId = topPendingMessage;
        }
      }

      /* const d = Object.assign({}, dialog);
      if(peerId === 239602833) {
        this.log.error('applyConversation lun', dialog, d);
      } */

      if(topMessage || (dialog.draft && dialog.draft._ === 'draftMessage')) {
        this.saveDialog(dialog);
        updatedDialogs[peerId] = dialog;
      } else {
        const dropped = this.dropDialog(peerId);
        if(dropped.length) {
          rootScope.dispatchEvent('dialog_drop', {peerId, dialog: dropped[0]});
        }
      }

      const updates = this.appMessagesManager.newUpdatesAfterReloadToHandle[peerId];
      if(updates !== undefined) {
        for(const update of updates) {
          this.apiUpdatesManager.saveUpdate(update);
        }

        delete this.appMessagesManager.newUpdatesAfterReloadToHandle[peerId];
      }
    });

    if(Object.keys(updatedDialogs).length) {
      rootScope.dispatchEvent('dialogs_multiupdate', updatedDialogs);
    }
  }

  /**
   * Won't save migrated from peer, forbidden peers, left and kicked
   */
  public saveDialog(dialog: Dialog, folderId = 0, saveOffset = false) {
    const peerId = this.appPeersManager.getPeerId(dialog.peer);
    if(!peerId) {
      console.error('saveConversation no peerId???', dialog, folderId);
      return;
    }

    if(dialog._ !== 'dialog'/*  || peerId === 239602833 */) {
      console.error('saveConversation not regular dialog', dialog, Object.assign({}, dialog));
    }
    
    const channelId = this.appPeersManager.isChannel(peerId) ? -peerId : 0;

    if(peerId < 0) {
      const chat: Chat = this.appChatsManager.getChat(-peerId);
      // ! chatForbidden stays for chat where you're kicked
      if(chat._ === 'channelForbidden' /* || chat._ === 'chatForbidden' */ || (chat as Chat.chat).pFlags.left || (chat as Chat.chat).pFlags.kicked) {
        return;
      }
    }

    const peerText = this.appPeersManager.getPeerSearchText(peerId);
    this.dialogsIndex.indexObject(peerId, peerText);

    let mid: number, message;
    if(dialog.top_message) {
      mid = this.appMessagesIdsManager.generateMessageId(dialog.top_message);//dialog.top_message;
      message = this.appMessagesManager.getMessageByPeer(peerId, mid);
    } else {
      mid = this.appMessagesManager.generateTempMessageId(peerId);
      message = {
        _: 'message',
        id: mid,
        mid,
        from_id: this.appPeersManager.getOutputPeer(this.appUsersManager.getSelf().id),
        peer_id: this.appPeersManager.getOutputPeer(peerId),
        deleted: true,
        pFlags: {out: true},
        date: 0,
        message: ''
      };
      this.appMessagesManager.saveMessages([message], {isOutgoing: true});
    }

    if(!message?.pFlags) {
      this.appMessagesManager.log.error('saveConversation no message:', dialog, message);
    }

    if(!channelId && peerId < 0) {
      const chat = this.appChatsManager.getChat(-peerId);
      if(chat && chat.migrated_to && chat.pFlags.deactivated) {
        const migratedToPeer = this.appPeersManager.getPeerId(chat.migrated_to);
        this.appMessagesManager.migratedFromTo[peerId] = migratedToPeer;
        this.appMessagesManager.migratedToFrom[migratedToPeer] = peerId;
        dialog.migratedTo = migratedToPeer;
        //return;
      }
    }

    const wasDialogBefore = this.getDialogOnly(peerId);

    dialog.top_message = mid;
    dialog.read_inbox_max_id = this.appMessagesIdsManager.generateMessageId(wasDialogBefore && !dialog.read_inbox_max_id ? wasDialogBefore.read_inbox_max_id : dialog.read_inbox_max_id);
    dialog.read_outbox_max_id = this.appMessagesIdsManager.generateMessageId(wasDialogBefore && !dialog.read_outbox_max_id ? wasDialogBefore.read_outbox_max_id : dialog.read_outbox_max_id);

    if(!dialog.hasOwnProperty('folder_id')) {
      if(dialog._ === 'dialog') {
        // ! СЛОЖНО ! СМОТРИ В getTopMessages
        dialog.folder_id = wasDialogBefore ? wasDialogBefore.folder_id : folderId;
      }/*  else if(dialog._ === 'dialogFolder') {
        dialog.folder_id = dialog.folder.id;
      } */
    }

    dialog.draft = this.appDraftsManager.saveDraft(peerId, 0, dialog.draft);
    dialog.peerId = peerId;

    // Because we saved message without dialog present
    if(message.pFlags.is_outgoing) {
      if(mid > dialog[message.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id']) message.pFlags.unread = true;
      else delete message.pFlags.unread;
    }

    const historyStorage = this.appMessagesManager.getHistoryStorage(peerId);
    const slice = historyStorage.history.slice;
    /* if(historyStorage === undefined) { // warning
      historyStorage.history.push(mid);
    } else  */if(!slice.length) {
      historyStorage.history.unshift(mid);
      if(this.appMessagesManager.mergeReplyKeyboard(historyStorage, message)) {
        rootScope.dispatchEvent('history_reply_markup', {peerId});
      }
    } else if(!slice.isEnd(SliceEnd.Bottom)) { // * this will probably never happen, however, if it does, then it will fix slice with top_message
      const slice = historyStorage.history.insertSlice([mid]);
      slice.setEnd(SliceEnd.Bottom);
      if(this.appMessagesManager.mergeReplyKeyboard(historyStorage, message)) {
        rootScope.dispatchEvent('history_reply_markup', {peerId});
      }
    }

    historyStorage.maxId = mid;
    historyStorage.readMaxId = dialog.read_inbox_max_id;
    historyStorage.readOutboxMaxId = dialog.read_outbox_max_id;

    this.appNotificationsManager.savePeerSettings(peerId, dialog.notify_settings);

    if(channelId && dialog.pts) {
      this.apiUpdatesManager.addChannelState(channelId, dialog.pts);
    }

    this.generateIndexForDialog(dialog);

    if(wasDialogBefore) {
      safeReplaceObject(wasDialogBefore, dialog);
    }

    this.pushDialog(dialog, saveOffset && message.date);
  }

  public getDialogIndexKey(filterId: number) {
    const indexStr = filterId > 1 ? 
      `index_${this.appMessagesManager.filtersStorage.getFilter(filterId).orderIndex}` as const : 
      'index' as const;

    return indexStr;
  }

  public getDialogs(query = '', offsetIndex?: number, limit = 20, folderId = 0, skipMigrated = false): {
    cached: boolean,
    promise: Promise<{
      dialogs: Dialog[],
      count: number,
      isTopEnd: boolean,
      isEnd: boolean
    }>
  } {
    if(folderId > 1) {
      const fillContactsResult = this.appUsersManager.fillContacts();
      if(!fillContactsResult.cached) {
        return {
          cached: false,
          promise: fillContactsResult.promise.then(() => {
            return this.getDialogs(query, offsetIndex, limit, folderId, skipMigrated).promise;
          })
        };
      }
    }

    const realFolderId = folderId > 1 ? 0 : folderId;
    let curDialogStorage = this.getFolder(folderId, skipMigrated);

    const indexStr = this.getDialogIndexKey(folderId);

    if(query) {
      if(!limit || this.cachedResults.query !== query || this.cachedResults.folderId !== folderId) {
        this.cachedResults.query = query;
        this.cachedResults.folderId = folderId;

        const results = this.dialogsIndex.search(query);

        const dialogs: Dialog[] = [];
        for(const peerId in this.dialogs) {
          const dialog = this.dialogs[peerId];
          if(results.has(dialog.peerId) && dialog.folder_id === folderId) {
            dialogs.push(dialog);
          }
        }

        dialogs.sort((d1, d2) => d2[indexStr] - d1[indexStr]);
        this.cachedResults.dialogs = dialogs;
        this.cachedResults.count = dialogs.length;
      }

      curDialogStorage = this.cachedResults.dialogs;
    } else {
      this.cachedResults.query = '';
    }

    let offset = 0;
    if(offsetIndex > 0) {
      for(let length = curDialogStorage.length; offset < length; ++offset) {
        if(offsetIndex > curDialogStorage[offset][indexStr]) {
          break;
        }
      }
    }

    const loadedAll = this.isDialogsLoaded(realFolderId);
    if(query || loadedAll || curDialogStorage.length >= (offset + limit)) {
      const dialogs = curDialogStorage.slice(offset, offset + limit);
      return {
        cached: true,
        promise: Promise.resolve({
          dialogs,
          count: loadedAll ? curDialogStorage.length : null,
          isTopEnd: curDialogStorage.length && ((dialogs[0] && dialogs[0] === curDialogStorage[0]) || curDialogStorage[0][indexStr] < offsetIndex),
          isEnd: loadedAll && (offset + limit) >= curDialogStorage.length
        })
      };
    }

    return {
      cached: false,
      promise: this.appMessagesManager.getTopMessages(limit, realFolderId).then(result => {
        //const curDialogStorage = this[folderId];
        if(skipMigrated) {
          curDialogStorage = this.getFolder(folderId, skipMigrated);
        }
  
        offset = 0;
        if(offsetIndex > 0) {
          for(let length = curDialogStorage.length; offset < length; ++offset) {
            if(offsetIndex > curDialogStorage[offset][indexStr]) {
              break;
            }
          }
        }
  
        //this.log.warn(offset, offset + limit, curDialogStorage.dialogs.length, this.dialogs.length);
  
        const dialogs = curDialogStorage.slice(offset, offset + limit);
        return {
          dialogs,
          count: result.count === undefined ? curDialogStorage.length : result.count,
          isTopEnd: curDialogStorage.length && ((dialogs[0] && dialogs[0] === curDialogStorage[0]) || curDialogStorage[0][indexStr] < offsetIndex),
          // isEnd: this.isDialogsLoaded(realFolderId) && (offset + limit) >= curDialogStorage.length
          isEnd: result.isEnd
        };
      })
    };
  }

  // only 0 and 1 folders
  private onUpdateFolderPeers = (update: Update.updateFolderPeers) => {
    //this.log('updateFolderPeers', update);
    const peers = update.folder_peers;

    peers.forEach((folderPeer) => {
      const {folder_id, peer} = folderPeer;

      const peerId = this.appPeersManager.getPeerId(peer);
      const dialog = this.dropDialog(peerId)[0];
      if(dialog) {
        if(dialog.pFlags?.pinned) {
          delete dialog.pFlags.pinned;
          this.pinnedOrders[folder_id].findAndSplice(p => p === dialog.peerId);
          this.appStateManager.pushToState('pinnedOrders', this.pinnedOrders);
        }

        dialog.folder_id = folder_id;
        this.generateIndexForDialog(dialog);
        this.pushDialog(dialog); // need for simultaneously updatePinnedDialogs
      }

      this.appMessagesManager.scheduleHandleNewDialogs(peerId, dialog);
    });
  };

  private onUpdateDialogPinned = (update: Update.updateDialogPinned) => {
    const folderId = update.folder_id ?? 0;
    //this.log('updateDialogPinned', update);
    const peerId = this.appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
    const dialog = this.getDialogOnly(peerId);

    // этот код внизу никогда не сработает, в папках за пиннед отвечает updateDialogFilter
    /* if(update.folder_id > 1) {
      const filter = this.filtersStorage.filters[update.folder_id];
      if(update.pFlags.pinned) {
        filter.pinned_peers.unshift(peerId);
      } else {
        filter.pinned_peers.findAndSplice(p => p === peerId);
      }
    } */

    if(dialog) {
      if(!update.pFlags.pinned) {
        delete dialog.pFlags.pinned;
        this.pinnedOrders[folderId].findAndSplice(p => p === dialog.peerId);
        this.appStateManager.pushToState('pinnedOrders', this.pinnedOrders);
      } else { // means set
        dialog.pFlags.pinned = true;
      }

      this.generateIndexForDialog(dialog);
    } 

    this.appMessagesManager.scheduleHandleNewDialogs(peerId, dialog);
  };

  private onUpdatePinnedDialogs = (update: Update.updatePinnedDialogs) => {
    const folderId = update.folder_id ?? 0;
        
    const handleOrder = (order: number[]) => {
      this.pinnedOrders[folderId].length = 0;
      order.reverse(); // index must be higher
      order.forEach((peerId) => {
        newPinned[peerId] = true;
  
        const dialog = this.getDialogOnly(peerId);
        this.appMessagesManager.scheduleHandleNewDialogs(peerId, dialog);
        if(!dialog) {
          return;
        }
  
        dialog.pFlags.pinned = true;
        this.generateIndexForDialog(dialog);
      });
      
      this.getFolder(folderId, false).forEach(dialog => {
        const peerId = dialog.peerId;
        if(dialog.pFlags.pinned && !newPinned[peerId]) {
          this.appMessagesManager.scheduleHandleNewDialogs(peerId);
        }
      });
    };

    //this.log('updatePinnedDialogs', update);
    const newPinned: {[peerId: number]: true} = {};
    if(!update.order) {
      apiManager.invokeApi('messages.getPinnedDialogs', {
        folder_id: folderId
      }).then((dialogsResult) => {
        // * for test reordering and rendering
        // dialogsResult.dialogs.reverse();

        this.applyDialogs(dialogsResult);

        handleOrder(dialogsResult.dialogs.map(d => d.peerId));

        /* dialogsResult.dialogs.forEach((dialog) => {
          newPinned[dialog.peerId] = true;
        });

        this.dialogsStorage.getFolder(folderId).forEach((dialog) => {
          const peerId = dialog.peerId;
          if(dialog.pFlags.pinned && !newPinned[peerId]) {
            this.newDialogsToHandle[peerId] = {reload: true};
            this.scheduleHandleNewDialogs();
          }
        }); */
      });

      return;
    }

    //this.log('before order:', this.dialogsStorage[0].map(d => d.peerId));

    handleOrder(update.order.map(peer => this.appPeersManager.getPeerId((peer as DialogPeer.dialogPeer).peer)));
  };
}
