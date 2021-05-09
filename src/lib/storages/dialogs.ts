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
import { tsNow } from "../../helpers/date";
import apiManager from "../mtproto/mtprotoworker";
import searchIndexManager from "../searchIndexManager";
import { forEachReverse, insertInDescendSortedArray } from "../../helpers/array";
import rootScope from "../rootScope";
import { safeReplaceObject } from "../../helpers/object";
import { AppStateManager } from "../appManagers/appStateManager";
import { SliceEnd } from "../../helpers/slicedArray";

export default class DialogsStorage {
  private storage: AppStateManager['storages']['dialogs'];
  
  private dialogs: {[peerId: string]: Dialog} = {};
  public byFolders: {[folderId: number]: Dialog[]} = {};

  private allDialogsLoaded: {[folder_id: number]: boolean};
  private dialogsOffsetDate: {[folder_id: number]: number};
  private pinnedOrders: {[folder_id: number]: number[]};
  private dialogsNum: number;

  private dialogsIndex = searchIndexManager.createIndex();

  private cachedResults: {
    query: string,
    count: number,
    dialogs: Dialog[],
    folderId: number
  } = {
    query: '',
    count: 0,
    dialogs: [],
    folderId: 0
  };

  constructor(private appMessagesManager: AppMessagesManager, 
    private appChatsManager: AppChatsManager, 
    private appPeersManager: AppPeersManager, 
    private appUsersManager: AppUsersManager,
    private appDraftsManager: AppDraftsManager,
    private appNotificationsManager: AppNotificationsManager,
    private appStateManager: AppStateManager,
    private apiUpdatesManager: ApiUpdatesManager,
    private serverTimeManager: ServerTimeManager
  ) {
    this.storage = this.appStateManager.storages.dialogs;

    this.reset();

    rootScope.on('language_change', (e) => {
      const peerId = appUsersManager.getSelf().id;
      const dialog = this.getDialogOnly(peerId);
      if(dialog) {
        const peerText = appPeersManager.getPeerSearchText(peerId);
        searchIndexManager.indexObject(peerId, peerText, this.dialogsIndex);
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
            dialog.top_message = this.appMessagesManager.getServerMessageId(dialog.top_message); // * fix outgoing message to avoid copying dialog

            if(dialog.topMessage) {
              this.appMessagesManager.saveMessages([dialog.topMessage]);
            }
  
            this.saveDialog(dialog);

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

  public reset() {
    this.allDialogsLoaded = {};
    this.dialogsOffsetDate = {};
    this.pinnedOrders = {
      0: [],
      1: []
    };
    this.dialogsNum = 0;
  }

  public getOffsetDate(folderId: number) {
    return this.dialogsOffsetDate[folderId] || 0;
  }

  public getFolder(id: number) {
    if(id <= 1) {
      return this.byFolders[id] ?? (this.byFolders[id] = []);
    }

    const dialogs: {dialog: Dialog, index: number}[] = [];
    const filter = this.appMessagesManager.filtersStorage.filters[id];

    for(const peerId in this.dialogs) {
      const dialog = this.dialogs[peerId];
      if(this.appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) {
        let index: number;

        const pinnedIndex = filter.pinned_peers.indexOf(dialog.peerId);
        if(pinnedIndex !== -1) {
          index = this.generateDialogIndex(this.generateDialogPinnedDateByIndex(filter.pinned_peers.length - 1 - pinnedIndex));
        } else if(dialog.pFlags?.pinned) {
          index = this.generateIndexForDialog(dialog, true);
        } else {
          index = dialog.index;
        }

        dialogs.push({dialog, index});
      }
    }

    dialogs.sort((a, b) => b.index - a.index);
    return dialogs.map(d => d.dialog);
  }

  public getDialog(peerId: number, folderId?: number): [Dialog, number] | [] {
    const folders: Dialog[][] = [];

    if(folderId === undefined) {
      const dialogs = this.byFolders;
      for(const folderId in dialogs) {
        folders.push(dialogs[folderId]);
      }
    } else {
      folders.push(this.getFolder(folderId));
    }

    for(let folder of folders) {
      const index = folder.findIndex(dialog => dialog.peerId === peerId);
      if(index !== -1) {
        return [folder[index], index];
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
  public generateDialogIndex(date?: number) {
    if(date === undefined) {
      date = tsNow(true) + this.serverTimeManager.serverTimeOffset;
    }

    return (date * 0x10000) + ((++this.dialogsNum) & 0xFFFF);
  }

  public generateIndexForDialog(dialog: Dialog, justReturn = false, message?: MyMessage) {
    const channelId = this.appPeersManager.isChannel(dialog.peerId) ? -dialog.peerId : 0;
    
    let topDate = 0;
    if(dialog.pFlags.pinned && !justReturn) {
      topDate = this.generateDialogPinnedDate(dialog);
    } else {
      if(!message) {
        message = this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
      }

      topDate = (message as Message.message).date || topDate;
      if(channelId) {
        const channel = this.appChatsManager.getChat(channelId);
        if(!topDate || (channel.date && channel.date > topDate)) {
          topDate = channel.date;
        }
      }
  
      if(dialog.draft?._ === 'draftMessage' && dialog.draft.date > topDate) {
        topDate = dialog.draft.date;
      }
    }

    if(!topDate) {
      topDate = Date.now() / 1000;
    }

    const index = this.generateDialogIndex(topDate);
    if(justReturn) return index;
    dialog.index = index;
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

  public generateDialog(peerId: number) {
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
  }

  public setDialogToState(dialog: Dialog) {
    const historyStorage = this.appMessagesManager.getHistoryStorage(dialog.peerId);
    const history = [].concat(historyStorage.history.slice);
    let incomingMessage: any;
    for(let i = 0, length = history.length; i < length; ++i) {
      const mid = history[i];
      const message = this.appMessagesManager.getMessageByPeer(dialog.peerId, mid);
      if(!message.pFlags.is_outgoing) {
        incomingMessage = message;
  
        if(message.fromId !== dialog.peerId) {
          this.appStateManager.requestPeer(message.fromId, 'topMessage_' + dialog.peerId, 1);
        }

        break;
      }
    }

    dialog.topMessage = incomingMessage;

    if(dialog.peerId < 0 && dialog.pts) {
      const newPts = this.apiUpdatesManager.channelStates[-dialog.peerId].pts;
      dialog.pts = newPts;
    }

    this.storage.set({
      [dialog.peerId]: dialog
    });

    this.appStateManager.requestPeer(dialog.peerId, 'dialog_' + dialog.peerId, 1);
  }

  public pushDialog(dialog: Dialog, offsetDate?: number) {
    const dialogs = this.getFolder(dialog.folder_id);
    const pos = dialogs.findIndex(d => d.peerId === dialog.peerId);
    if(pos !== -1) {
      dialogs.splice(pos, 1);
    }

    //if(!this.dialogs[dialog.peerId]) {
      this.dialogs[dialog.peerId] = dialog;

      this.setDialogToState(dialog);
    //}

    if(offsetDate &&
      !dialog.pFlags.pinned &&
      (!this.dialogsOffsetDate[dialog.folder_id] || offsetDate < this.dialogsOffsetDate[dialog.folder_id])) {
      if(pos !== -1) {
        // So the dialog jumped to the last position
        return false;
      }
      this.dialogsOffsetDate[dialog.folder_id] = offsetDate;
    }

    insertInDescendSortedArray(dialogs, dialog, 'index', pos);
  }

  public dropDialog(peerId: number): [Dialog, number] | [] {
    const foundDialog = this.getDialog(peerId);
    if(foundDialog[0]) {
      this.byFolders[foundDialog[0].folder_id].splice(foundDialog[1], 1);
      delete this.dialogs[peerId];
      searchIndexManager.indexObject(peerId, '', this.dialogsIndex);

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

    this.appMessagesManager.log('applyConversation', dialogsResult);

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
          rootScope.broadcast('dialog_drop', {peerId, dialog: dropped[0]});
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
      rootScope.broadcast('dialogs_multiupdate', updatedDialogs);
    }
  }

  /**
   * Won't save migrated from peer, forbidden peers, left and kicked
   */
  public saveDialog(dialog: Dialog, folderId = 0) {
    const peerId = this.appPeersManager.getPeerId(dialog.peer);
    if(!peerId) {
      console.error('saveConversation no peerId???', dialog, folderId);
      return false;
    }

    if(dialog._ !== 'dialog'/*  || peerId === 239602833 */) {
      console.error('saveConversation not regular dialog', dialog, Object.assign({}, dialog));
    }
    
    const channelId = this.appPeersManager.isChannel(peerId) ? -peerId : 0;

    if(peerId < 0) {
      const chat: Chat = this.appChatsManager.getChat(-peerId);
      if(chat._ === 'channelForbidden' || chat._ === 'chatForbidden' || (chat as Chat.chat).pFlags.left || (chat as Chat.chat).pFlags.kicked) {
        return false;
      }
    }

    const peerText = this.appPeersManager.getPeerSearchText(peerId);
    searchIndexManager.indexObject(peerId, peerText, this.dialogsIndex);

    let mid: number, message;
    if(dialog.top_message) {
      mid = this.appMessagesManager.generateMessageId(dialog.top_message);//dialog.top_message;
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
        return;
      }
    }

    const wasDialogBefore = this.getDialogOnly(peerId);

    dialog.top_message = mid;
    dialog.read_inbox_max_id = this.appMessagesManager.generateMessageId(wasDialogBefore && !dialog.read_inbox_max_id ? wasDialogBefore.read_inbox_max_id : dialog.read_inbox_max_id);
    dialog.read_outbox_max_id = this.appMessagesManager.generateMessageId(wasDialogBefore && !dialog.read_outbox_max_id ? wasDialogBefore.read_outbox_max_id : dialog.read_outbox_max_id);

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
      if(this.mergeReplyKeyboard(historyStorage, message)) {
        rootScope.broadcast('history_reply_markup', {peerId});
      }
    } else  */if(!slice.length) {
      historyStorage.history.unshift(mid);
    } else if(!slice.isEnd(SliceEnd.Bottom)) { // * this will probably never happen, however, if it does, then it will fix slice with top_message
      const slice = historyStorage.history.insertSlice([mid]);
      slice.setEnd(SliceEnd.Bottom);
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

    this.pushDialog(dialog, message.date);
  }

  public getDialogs(query = '', offsetIndex?: number, limit = 20, folderId = 0) {
    const realFolderId = folderId > 1 ? 0 : folderId;
    let curDialogStorage = this.getFolder(folderId);

    if(query) {
      if(!limit || this.cachedResults.query !== query || this.cachedResults.folderId !== folderId) {
        this.cachedResults.query = query;
        this.cachedResults.folderId = folderId;

        const results = searchIndexManager.search(query, this.dialogsIndex);

        this.cachedResults.dialogs = [];

        for(const peerId in this.dialogs) {
          const dialog = this.dialogs[peerId];
          if(results[dialog.peerId] && dialog.folder_id === folderId) {
            this.cachedResults.dialogs.push(dialog);
          }
        }

        this.cachedResults.dialogs.sort((d1, d2) => d2.index - d1.index);

        this.cachedResults.count = this.cachedResults.dialogs.length;
      }

      curDialogStorage = this.cachedResults.dialogs;
    } else {
      this.cachedResults.query = '';
    }

    let offset = 0;
    if(offsetIndex > 0) {
      for(; offset < curDialogStorage.length; offset++) {
        if(offsetIndex > curDialogStorage[offset].index) {
          break;
        }
      }
    }

    const loadedAll = this.isDialogsLoaded(realFolderId);
    if(query || loadedAll || curDialogStorage.length >= offset + limit) {
      return Promise.resolve({
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: loadedAll ? curDialogStorage.length : null,
        isEnd: loadedAll && (offset + limit) >= curDialogStorage.length
      });
    }

    return this.appMessagesManager.getTopMessages(limit, realFolderId).then(messagesDialogs => {
      //const curDialogStorage = this[folderId];

      offset = 0;
      if(offsetIndex > 0) {
        for(; offset < curDialogStorage.length; offset++) {
          if(offsetIndex > curDialogStorage[offset].index) {
            break;
          }
        }
      }

      //this.log.warn(offset, offset + limit, curDialogStorage.dialogs.length, this.dialogs.length);

      return {
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: messagesDialogs._ === 'messages.dialogs' ? messagesDialogs.dialogs.length : messagesDialogs.count,
        isEnd: this.isDialogsLoaded(realFolderId) && (offset + limit) >= curDialogStorage.length
      };
    });
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
      
      this.getFolder(folderId).forEach(dialog => {
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
