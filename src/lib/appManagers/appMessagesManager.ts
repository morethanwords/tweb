import { $rootScope, copy, tsNow, safeReplaceObject, dT, listMergeSorted, deepEqual, langPack } from "../utils";
import appMessagesIDsManager from "./appMessagesIDsManager";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { nextRandomInt, bigint } from "../bin_utils";
import { telegramMeWebService } from "../mtproto/mtproto";
import apiUpdatesManager from "./apiUpdatesManager";
import appPhotosManager from "./appPhotosManager";

import AppStorage from '../storage';
import appPeersManager from "./appPeersManager";
import ServerTimeManager from "../mtproto/serverTimeManager";
import apiFileManager from "../mtproto/apiFileManager";
import appDocsManager from "./appDocsManager";
import ProgressivePreloader from "../../components/preloader";
import serverTimeManager from "../mtproto/serverTimeManager";
//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import appWebPagesManager from "./appWebPagesManager";
import { CancellablePromise, deferredPromise } from "../polyfill";
import appPollsManager from "./appPollsManager";
import searchIndexManager from '../searchIndexManager';
import { MTDocument, MTPhotoSize } from "../../types";
import { logger } from "../logger";

//console.trace('include');

const APITIMEOUT = 0;

export type HistoryStorage = {
  count: number | null,
  history: number[],
  pending: number[],
  
  readPromise?: Promise<boolean>,
  maxOutID?: number,
  reply_markup?: any
};

export type HistoryResult = {
  count: number,
  history: number[],
  unreadOffset: number,
  unreadSkip: boolean
};

export type Dialog = {
  _: 'dialog',
  top_message: number,
  read_inbox_max_id: number,
  read_outbox_max_id: number,
  peer: any,
  notify_settings: any,
  folder_id: number,
  flags: number,
  draft: any,
  unread_count: number,
  unread_mentions_count: number,

  index: number,
  peerID: number,
  pFlags: Partial<{
    pinned: true,
    unread_mark: true
  }>,
  pts: number
}

export class DialogsStorage {
  public dialogs: {[peerID: string]: Dialog} = {};
  public byFolders: {[folderID: number]: Dialog[]} = {};

  public allDialogsLoaded: {[folder_id: number]: boolean} = {};
  public dialogsOffsetDate: {[folder_id: number]: number} = {};
  public pinnedOrders: {[folder_id: number]: number[]} = {
    0: [],
    1: []
  };
  public dialogsNum = 0;

  public getFolder(id: number) {
    if(id <= 1) {
      return this.byFolders[id] ?? (this.byFolders[id] = []);
    }

    const dialogs: {dialog: Dialog, index: number}[] = [];
    const filter = appMessagesManager.filtersStorage.filters[id];

    for(const peerID in this.dialogs) {
      const dialog = this.dialogs[peerID];
      if(appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) {
        let index: number;

        const pinnedIndex = filter.pinned_peers.indexOf(dialog.peerID);
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

  public getDialog(peerID: number, folderID?: number): [Dialog, number] | [] {
    const folders: Dialog[][] = [];

    if(folderID === undefined) {
      const dialogs = this.byFolders;
      for(const folderID in dialogs) {
        folders.push(dialogs[folderID]);
      }
    } else {
      folders.push(this.getFolder(folderID));
    }

    for(let folder of folders) {
      const index = folder.findIndex(dialog => dialog.peerID == peerID);
      if(index !== -1) {
        return [folder[index], index];
      }
    }

    return [];
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
      date = tsNow(true) + serverTimeManager.serverTimeOffset;
    }

    return (date * 0x10000) + ((++this.dialogsNum) & 0xFFFF);
  }

  public generateIndexForDialog(dialog: Dialog, justReturn = false) {
    const channelID = appPeersManager.isChannel(dialog.peerID) ? -dialog.peerID : 0;
    const mid = appMessagesIDsManager.getFullMessageID(dialog.top_message, channelID);
    const message = appMessagesManager.getMessage(mid);

    let topDate = message.date;
    if(channelID) {
      const channel = appChatsManager.getChat(channelID);
      if(!topDate || channel.date && channel.date > topDate) {
        topDate = channel.date;
      }
    }

    const savedDraft: any = {};// DraftsManager.saveDraft(peerID, dialog.draft); // warning
    if(savedDraft && savedDraft.date > topDate) {
      topDate = savedDraft.date;
    }

    if(dialog.pFlags.pinned && !justReturn) {
      topDate = this.generateDialogPinnedDate(dialog);
      //this.log('topDate', peerID, topDate);
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

    const foundIndex = order.indexOf(dialog.peerID);
    const pinnedIndex = foundIndex === -1 ? order.push(dialog.peerID) - 1 : foundIndex;

    return this.generateDialogPinnedDateByIndex(pinnedIndex);
  }

  public pushDialog(dialog: Dialog, offsetDate?: number) {
    const dialogs = this.getFolder(dialog.folder_id);
    const pos = dialogs.findIndex(d => d.peerID == dialog.peerID);
    if(pos !== -1) {
      dialogs.splice(pos, 1);
    }

    //if(!this.dialogs[dialog.peerID]) {
      this.dialogs[dialog.peerID] = dialog;
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

    const index = dialog.index;
    const len = dialogs.length;
    if(!len || index < dialogs[len - 1].index) {
      dialogs.push(dialog);
    } else if(index >= dialogs[0].index) {
      dialogs.unshift(dialog);
    } else {
      for(let i = 0; i < len; i++) {
        if(index > dialogs[i].index) {
          dialogs.splice(i, 0, dialog);
          break;
        }
      }
    }
  }

  public dropDialog(peerID: number): [Dialog, number] | [] {
    const foundDialog = this.getDialog(peerID);
    if(foundDialog[0]) {
      this.byFolders[foundDialog[0].folder_id].splice(foundDialog[1], 1);
      delete this.dialogs[peerID];
    }

    return foundDialog;
  }
}

export type DialogFilter = {
  _: 'dialogFilter',
  flags: number,
  pFlags: Partial<{
    contacts: true,
    non_contacts: true,
    groups: true,
    broadcasts: true,
    bots: true,
    exclude_muted: true,
    exclude_read: true,
    exclude_archived: true
  }>,
  id: number,
  title: string,
  emoticon?: string,
  pinned_peers: number[],
  include_peers: number[],
  exclude_peers: number[]
};
export class FiltersStorage {
  public filters: {[filterID: string]: DialogFilter} = {};

  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      this.handleUpdate(e.detail);
    });
  }

  public handleUpdate(update: any) {
    switch(update._) {
      case 'updateDialogFilter': {
        console.log('updateDialogFilter', update);
        if(update.filter) {
          this.saveDialogFilter(update.filter);
        } else if(this.filters[update.id]) { // Папка удалена
          //this.getDialogFilters(true);
          $rootScope.$broadcast('filter_delete', this.filters[update.id]);
          delete this.filters[update.id];
        }

        break;
      }
    }
  }

  public testDialogForFilter(dialog: Dialog, filter: DialogFilter) {
    // exclude_peers
    for(const peerID of filter.exclude_peers) {
      if(peerID == dialog.peerID) {
        return false;
      }
    }

    // include_peers
    for(const peerID of filter.include_peers) {
      if(peerID == dialog.peerID) {
        return true;
      }
    }

    const pFlags = filter.pFlags;

    // exclude_archived
    if(pFlags.exclude_archived && dialog.folder_id == 1) {
      return false;
    }

    // exclude_read
    if(pFlags.exclude_read && !dialog.unread_count) {
      return false;
    }

    // exclude_muted
    if(pFlags.exclude_muted) {
      const isMuted = (dialog.notify_settings?.mute_until * 1000) > Date.now();
      if(isMuted) {
        return false;
      }
    }

    const peerID = dialog.peerID;
    if(peerID < 0) {
      // broadcasts
      if(pFlags.broadcasts && appPeersManager.isBroadcast(peerID)) {
        return true;
      }

      // groups
      if(pFlags.groups && appPeersManager.isAnyGroup(peerID)) {
        return true;
      }
    } else {
      // bots
      if(appPeersManager.isBot(peerID)) {
        return !!pFlags.bots;
      }
      
      // non_contacts
      if(pFlags.non_contacts && !appUsersManager.contactsList.has(peerID)) {
        return true;
      }

      // contacts
      if(pFlags.contacts && appUsersManager.contactsList.has(peerID)) {
        return true;
      }
    }

    return false;
  }

  /* public processDialog(dialog: Dialog) {
    for(const filterID in this.filters) {
      const filter = this.filters[filterID];
      const good = this.testDialogForFilter(dialog, filter);

      const folder = appMessagesManager.dialogsStorage.getFolder(+filterID);
      if(good) {
        folder.push(dialog);
      }

      console.log('processDialog:', dialog, filter, good);
    }
  } */

  /* public initFilters() {
    return Promise.all([
      appUsersManager.getContacts(),

      this.getDialogFilters(),

      appMessagesManager.getConversations('', 0, 20, 0),
      appMessagesManager.getConversations('', 0, 20, 1)
    ]).then(() => {
      const dialogs = appMessagesManager.dialogsStorage.dialogs;
      for(const peerID in dialogs) {
        const dialog = dialogs[peerID];
        this.processDialog(dialog);
      }

      this.inited = true;
    });
  } */

  public toggleDialogPin(peerID: number, filterID: number) {
    const filter = this.filters[filterID];

    const wasPinned = filter.pinned_peers.findAndSplice(p => p == peerID);
    if(!wasPinned) {
      filter.pinned_peers.unshift(peerID);
    }
    
    return this.updateDialogFilter(filter);
  }

  public createDialogFilter(filter: DialogFilter) {
    let maxID = Math.max(1, ...Object.keys(this.filters).map(i => +i));
    filter = copy(filter);
    filter.id = maxID + 1;
    return this.updateDialogFilter(filter);
  }

  public updateDialogFilter(filter: DialogFilter, remove = false) {
    const flags = remove ? 0 : 1;

    if(!remove) {
      filter.flags = 0;
      const f: {[k: string]: number} = {
        contacts: 0,
        non_contacts: 1,
        groups: 2,
        broadcasts: 3,
        bots: 4,
        exclude_muted: 11,
        exclude_read: 12,
        exclude_archived: 13
      };

      for(const key in f) {
        // @ts-ignore
        if(filter.pFlags[key]) {
          filter.flags |= 1 << f[key];
        }
      }

      if(filter.emoticon) {
        filter.flags |= 1 << 25;
      }
    }

    return apiManager.invokeApi('messages.updateDialogFilter', {
      flags,
      id: filter.id,
      filter: remove ? undefined : this.getOutputDialogFilter(filter)
    }).then((bool: boolean) => { // возможно нужна проверка и откат, если результат не ТРУ
      console.log('updateDialogFilter bool:', bool);

      if(bool) {
        /* if(!this.filters[filter.id]) {
          this.saveDialogFilter(filter);
        }

        $rootScope.$broadcast('filter_update', filter); */

        this.handleUpdate({
          _: 'updateDialogFilter',
          id: filter.id,
          filter: remove ? undefined : filter
        });
      }

      return bool;
    });
  }

  public getOutputDialogFilter(filter: DialogFilter) {
    const c: DialogFilter = copy(filter);
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      c[key] = c[key].map((peerID: number) => appPeersManager.getInputPeerByID(peerID));
    });

    c.include_peers.forEachReverse((peerID, idx) => {
      if(c.pinned_peers.includes(peerID)) {
        c.include_peers.splice(idx, 1);
      }
    });

    return c;
  }

  public async getDialogFilters(overwrite = false) {
    if(Object.keys(this.filters).length && !overwrite) {
      /* // УБРАТЬ НА ПРОДЕ!!!!!!!!!!!!
      for(const folderID in this.filters) {
        const filter = this.filters[folderID];
        if(typeof(filter.pinned_peers[0]) !== 'number') filter.pinned_peers = filter.pinned_peers.map(peer => appPeersManager.getPeerID(peer));
        if(typeof(filter.exclude_peers[0]) !== 'number') filter.exclude_peers = filter.exclude_peers.map(peer => appPeersManager.getPeerID(peer));
        if(typeof(filter.include_peers[0]) !== 'number') filter.include_peers = filter.include_peers.map(peer => appPeersManager.getPeerID(peer));
      } */
      return this.filters;
    }

    const filters = await (apiManager.invokeApi('messages.getDialogFilters') as Promise<DialogFilter[]>);
    for(const filter of filters) {
      this.saveDialogFilter(filter, false);
    }

    //console.log(this.filters);
    return this.filters;
  }

  public saveDialogFilter(filter: DialogFilter, update = true) {
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      filter[key] = filter[key].map((peer: any) => appPeersManager.getPeerID(peer));
    });

    filter.include_peers.forEachReverse((peerID, idx) => {
      if(filter.pinned_peers.includes(peerID)) {
        filter.include_peers.splice(idx, 1);
      }
    });
    
    filter.include_peers = filter.pinned_peers.concat(filter.include_peers);

    /* if(this.filters[filter.id]) {
      // ну давай же найдём различия теперь, раз они сами не хотят приходить
      const oldFilter = this.filters[filter.id];

      const updateDialogs: {[peerID: number]: Dialog} = {};

      const pinnedChanged = !deepEqual(oldFilter.pinned_peers, filter.pinned_peers);
      if(pinnedChanged) {
        for(const peerID of oldFilter.pinned_peers) {
          updateDialogs[peerID] = appMessagesManager.getDialogByPeerID(peerID)[0];
        }

        for(const peerID of filter.pinned_peers) {
          updateDialogs[peerID] = appMessagesManager.getDialogByPeerID(peerID)[0];
        }
      }

      // это и так отфильтрует
      //const excludeChanged = !deepEqual(oldFilter.exclude_peers, filter.exclude_peers);

      const includeChanged = !deepEqual(oldFilter.include_peers, filter.include_peers);
      if(includeChanged) {
        for(const peerID of filter.include_peers) {
          updateDialogs[peerID] = appMessagesManager.getDialogByPeerID(peerID)[0];
        }
      }

      Object.assign(this.filters[filter.id], filter);
      if(pinnedChanged) {
        $rootScope.$broadcast('filter_pinned_order', {id: filter.id, order: filter.pinned_peers});
      }

      $rootScope.$broadcast('dialogs_multiupdate', updateDialogs);
    } */if(this.filters[filter.id]) {
      Object.assign(this.filters[filter.id], filter);
    } else {
      this.filters[filter.id] = filter;
    }

    if(update) {
      $rootScope.$broadcast('filter_update', filter);
    }
  }
}

export class AppMessagesManager {
  public messagesStorage: any = {};
  public groupedMessagesStorage: {[groupID: string]: any} = {}; // will be used for albums
  public historiesStorage: {
    [peerID: string]: HistoryStorage
  } = {};
  public pinnedMessages: {[peerID: string]: number} = {};
  public pendingByRandomID: {[randomID: string]: [number, number]} = {};
  public pendingByMessageID: any = {};
  public pendingAfterMsgs: any = {};
  public pendingTopMsgs: any = {};
  public sendFilePromise: CancellablePromise<void> = Promise.resolve();
  public tempID = -1;
  public tempFinalizeCallbacks: any = {};

  public lastSearchFilter: any = {};
  public lastSearchResults: any = [];

  public needSingleMessages: any = [];
  public fetchSingleMessagesTimeout = 0;
  private fetchSingleMessagesPromise: Promise<any> = null;

  public maxSeenID = 0;

  public migratedFromTo: {[peerID: number]: number} = {};
  public migratedToFrom: {[peerID: number]: number} = {};

  public newMessagesHandlePromise = 0;
  public newMessagesToHandle: any = {};
  public newDialogsHandlePromise = 0;
  public newDialogsToHandle: {[peerID: string]: {reload: true} | Dialog} = {};
  public newUpdatesAfterReloadToHandle: any = {};

  private reloadConversationsPromise: Promise<void>;
  private reloadConversationsPeers: number[] = [];

  private dialogsIndex = searchIndexManager.createIndex();
  private cachedResults: {
    query: string,
    count: number,
    dialogs: Dialog[]
  } = {
    query: '',
    count: 0,
    dialogs: []
  };

  private log = logger('MESSAGES'/* , LogLevels.error */);

  public dialogsStorage = new DialogsStorage();
  public filtersStorage = new FiltersStorage();

  constructor() {
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      this.handleUpdate(e.detail);
    });

    $rootScope.$on('webpage_updated', (e: CustomEvent) => {
      let eventData = e.detail;
      eventData.msgs.forEach((msgID: number) => {
        let message = this.getMessage(msgID);
        message.webpage = appWebPagesManager.getWebPage(eventData.id); // warning
        $rootScope.$broadcast('message_edit', {
          peerID: this.getMessagePeer(message),
          id: message.id,
          mid: msgID,
          justMedia: true
        });
      });
    });

    $rootScope.$on('draft_updated', (e: CustomEvent) => {
      let eventData = e.detail;;
      var peerID = eventData.peerID;
      var draft = eventData.draft;

      var dialog = this.getDialogByPeerID(peerID)[0];
      if(dialog) {
        var topDate;
        if(draft && draft.date) {
          topDate = draft.date;
        } else {
          var channelID = appPeersManager.isChannel(peerID) ? -peerID : 0
          var topDate = this.getMessage(dialog.top_message).date;

          if(channelID) {
            var channel = appChatsManager.getChat(channelID);
            if(!topDate || channel.date && channel.date > topDate) {
              topDate = channel.date;
            }
          }
        }

        if(!dialog.pFlags.pinned) {
          dialog.index = this.dialogsStorage.generateDialogIndex(topDate);
        }

        this.dialogsStorage.pushDialog(dialog);

        $rootScope.$broadcast('dialog_draft', {
          peerID: peerID,
          draft: draft,
          index: dialog.index
        });
      }
    });
  }

  

  public getInputEntities(entities: any) {
    var sendEntites = copy(entities);
    sendEntites.forEach((entity: any) => {
      if(entity._ == 'messageEntityMentionName') {
        entity._ = 'inputMessageEntityMentionName';
        entity.user_id = appUsersManager.getUserInput(entity.user_id);
      }
    });
    return sendEntites;
  }

  public editMessage(messageID: number, text: string, options: {
    noWebPage?: boolean
  } = {}) {
    if(typeof(text) !== 'string' || !this.canEditMessage(messageID)) {
      return Promise.reject();
    }

    if(messageID < 0) {
      if(this.tempFinalizeCallbacks[messageID] === undefined) {
        this.tempFinalizeCallbacks[messageID] = {}
      }

      let promise = new Promise((resolve, reject) => {
        this.tempFinalizeCallbacks[messageID].edit = (mid: number) => {
          this.log('invoke callback', mid)
          this.editMessage(mid, text).then(resolve, reject);
        }
      });

      return promise;
    }

    var entities: any = [];
    text = RichTextProcessor.parseMarkdown(text, entities)

    var message = this.getMessage(messageID);
    var peerID = this.getMessagePeer(message);
    var flags = 0;
    let noWebPage = options.noWebPage || false;

    if(noWebPage) {
      flags |= 2;
    }

    if(text) {
      flags |= 8 | 1 << 11;
    }

    /* if(message.media) {
      flags |= 1 << 14;
    } */

    return apiManager.invokeApi('messages.editMessage', {
      flags: flags,
      peer: appPeersManager.getInputPeerByID(peerID),
      id: appMessagesIDsManager.getMessageLocalID(messageID),
      message: text,
      media: message.media,
      entities: this.getInputEntities(entities),
      no_webpage: noWebPage,
    }).then((updates) => {
      apiUpdatesManager.processUpdateMessage(updates);
    }, (error) => {
      if(error && error.type == 'MESSAGE_NOT_MODIFIED') {
        error.handled = true;
        return;
      }
      if(error && error.type == 'MESSAGE_EMPTY') {
        error.handled = true;
      }
      return Promise.reject(error);
    });
  }

  public sendText(peerID: number, text: string, options: Partial<{
    entities: any[],
    replyToMsgID: number,
    viaBotID: number,
    queryID: number,
    resultID: number,
    noWebPage: boolean,
    reply_markup: any,
    clearDraft: boolean,
    webPage: any
  }> = {}) {
    if(typeof(text) != 'string') {
      return;
    }

    peerID = appPeersManager.getPeerMigratedTo(peerID) || peerID;

    var entities = options.entities || [];
    if(!options.viaBotID) {
      text = RichTextProcessor.parseMarkdown(text, entities);
    }
    if(!text.length) {
      return;
    }

    var sendEntites = this.getInputEntities(entities);
    var messageID = this.tempID--;
    var randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
    var randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();
    var historyStorage = this.historiesStorage[peerID];
    var flags = 0;
    var pFlags: any = {};
    var replyToMsgID = options.replyToMsgID;
    var isChannel = appPeersManager.isChannel(peerID);
    var isMegagroup = isChannel && appPeersManager.isMegagroup(peerID);
    var asChannel = isChannel && !isMegagroup ? true : false;
    var message: any;
    let noWebPage = options.noWebPage || false;

    if(historyStorage === undefined) {
      historyStorage = this.historiesStorage[peerID] = {count: null, history: [], pending: []};
    }

    var fromID = appUsersManager.getSelf().id;
    if(peerID != fromID) {
      flags |= 2;
      pFlags.out = true;

      if(!isChannel && !appUsersManager.isBot(peerID)) {
        flags |= 1;
        pFlags.unread = true;
      }
    }

    if(replyToMsgID) {
      flags |= 8;
    }

    if(asChannel) {
      fromID = 0;
      pFlags.post = true;
    } else {
      flags |= 256;
    }

    message = {
      _: 'message',
      id: messageID,
      from_id: fromID,
      to_id: appPeersManager.getOutputPeer(peerID),
      flags: flags,
      pFlags: pFlags,
      date: tsNow(true) + serverTimeManager.serverTimeOffset,
      message: text,
      random_id: randomIDS,
      reply_to_msg_id: replyToMsgID,
      via_bot_id: options.viaBotID,
      reply_markup: options.reply_markup,
      entities: entities,
      views: asChannel && 1,
      pending: true
    };

    if(options.webPage) {
      message.media = {
        _: 'messageMediaWebPage',
        webpage: options.webPage
      };
    }

    var toggleError = (on: any) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }
      $rootScope.$broadcast('messages_pending');
    }

    message.send = () =>  {
      toggleError(false);
      var sentRequestOptions: any = {};
      if(this.pendingAfterMsgs[peerID]) {
        sentRequestOptions.afterMessageID = this.pendingAfterMsgs[peerID].messageID;
      }

      var flags = 0;
      if(replyToMsgID) {
        flags |= 1;
      }

      if(asChannel) {
        flags |= 16;
      }

      if(options.clearDraft) {
        flags |= 128;
      }

      if(noWebPage) {
        flags |= 2;
      }

      var apiPromise: any;
      if(options.viaBotID) {
        apiPromise = apiManager.invokeApi('messages.sendInlineBotResult', {
          flags: flags,
          peer: appPeersManager.getInputPeerByID(peerID),
          random_id: randomID,
          reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID),
          query_id: options.queryID,
          id: options.resultID
        }, sentRequestOptions);
      } else {
        if(sendEntites.length) {
          flags |= 8;
        }

        apiPromise = apiManager.invokeApi('messages.sendMessage', {
          flags: flags,
          no_webpage: noWebPage,
          peer: appPeersManager.getInputPeerByID(peerID),
          message: text,
          random_id: randomID,
          reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID),
          entities: sendEntites
        }, sentRequestOptions);
      }

      // this.log(flags, entities)
      apiPromise.then((updates: any) => {
        if(updates._ == 'updateShortSentMessage') {
          message.flags = updates.flags;
          message.date = updates.date;
          message.id = updates.id;
          message.media = updates.media;
          message.entities = updates.entities;
          updates = {
            _: 'updates',
            users: [],
            chats: [],
            seq: 0,
            updates: [{
              _: 'updateMessageID',
              random_id: randomIDS,
              id: updates.id
            }, {
              _: isChannel
                    ? 'updateNewChannelMessage'
                    : 'updateNewMessage',
              message: message,
              pts: updates.pts,
              pts_count: updates.pts_count
            }]
          };
        } else if(updates.updates) {
          updates.updates.forEach((update: any) => {
            if(update._ == 'updateDraftMessage') {
              update.local = true;
            }
          });
        }
        // Testing bad situations
        // var upd = angular.copy(updates)
        // updates.updates.splice(0, 1)

        apiUpdatesManager.processUpdateMessage(updates);

        // $timeout(function () {
        // ApiUpdatesManager.processUpdateMessage(upd)
        // }, 5000)
      }, (/* error: any */) => {
        toggleError(true);
      }).finally(() => {
        if(this.pendingAfterMsgs[peerID] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerID];
        }
      });

      this.pendingAfterMsgs[peerID] = sentRequestOptions;
    }

    this.saveMessages([message]);
    historyStorage.pending.unshift(messageID);
    $rootScope.$broadcast('history_append', {peerID: peerID, messageID: messageID, my: true});

    setTimeout(() => message.send(), 0);
    // setTimeout(function () {
    //   message.send()
    // }, 5000)

    /* if(options.clearDraft) { // WARNING
      DraftsManager.clearDraft(peerID)
    } */

    this.pendingByRandomID[randomIDS] = [peerID, messageID];
  }

  public sendFile(peerID: number, file: File | Blob | MTDocument, options: Partial<{
    isMedia: boolean,
    replyToMsgID: number,
    caption: string,
    entities: any[],
    width: number,
    height: number,
    objectURL: string,
    isRoundMessage: boolean,
    duration: number,
    background: boolean,

    isVoiceMessage: boolean,
    waveform: Uint8Array
  }> = {}) {
    peerID = appPeersManager.getPeerMigratedTo(peerID) || peerID;
    var messageID = this.tempID--;
    var randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
    var randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();
    var historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {count: null, history: [], pending: []});
    var flags = 0;
    var pFlags: any = {};
    var replyToMsgID = options.replyToMsgID;
    var isChannel = appPeersManager.isChannel(peerID);
    var isMegagroup = isChannel && appPeersManager.isMegagroup(peerID);
    var asChannel = isChannel && !isMegagroup ? true : false;
    var attachType: string, apiFileName: string;

    const fileType = 'mime_type' in file ? file.mime_type : file.type;
    const fileName = file instanceof File ? file.name : '';
    const isDocument = !(file instanceof File) && !(file instanceof Blob);
    let caption = options.caption || '';

    const date = tsNow(true) + ServerTimeManager.serverTimeOffset;

    this.log('sendFile', file, fileType);

    if(caption) {
      let entities = options.entities || [];
      caption = RichTextProcessor.parseMarkdown(caption, entities);
    }

    const attributes: any[] = [];

    let actionName = '';
    if(!options.isMedia) {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    } else if(isDocument) { // maybe it's a sticker or gif
      attachType = 'document';
      apiFileName = '';
    } else if(['image/jpeg', 'image/png', 'image/bmp'].indexOf(fileType) >= 0) {
      attachType = 'photo';
      apiFileName = 'photo.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadPhotoAction';

      let photo: any = {
        _: 'photo',
        id: '' + messageID,
        sizes: [{
          _: 'photoSize',
          w: options.width,
          h: options.height,
          type: 'm',
          size: file.size
        } as MTPhotoSize],
        w: options.width,
        h: options.height,
        downloaded: file.size,
        url: options.objectURL || ''
      };
      
      appPhotosManager.savePhoto(photo);
    } else if(fileType.indexOf('audio/') === 0 || ['video/ogg'].indexOf(fileType) >= 0) {
      attachType = 'audio';
      apiFileName = 'audio.' + (fileType.split('/')[1] == 'ogg' ? 'ogg' : 'mp3');
      actionName = 'sendMessageUploadAudioAction';

      let flags = 0;
      if(options.isVoiceMessage) {
        flags |= 1 << 10;
        flags |= 1 << 2;
        attachType = 'voice';
      }

      let attribute = {
        _: 'documentAttributeAudio',
        flags: flags,
        pFlags: { // that's only for client, not going to telegram
          voice: options.isVoiceMessage
        },
        waveform: options.waveform,
        voice: options.isVoiceMessage,
        duration: options.duration || 0
      };

      attributes.push(attribute);
    } else if(fileType.indexOf('video/') === 0) {
      attachType = 'video';
      apiFileName = 'video.mp4';
      actionName = 'sendMessageUploadVideoAction';

      let flags = 1;
      if(options.isRoundMessage) flags |= 2;
      let videoAttribute = {
        _: 'documentAttributeVideo',
        flags: flags,
        pFlags: { // that's only for client, not going to telegram
          supports_streaming: true,
          round_message: options.isRoundMessage
        }, 
        round_message: options.isRoundMessage,
        supports_streaming: true,
        duration: options.duration,
        w: options.width,
        h: options.height
      };

      attributes.push(videoAttribute);
    } else {
      attachType = 'document';
      apiFileName = 'document.' + fileType.split('/')[1];
      actionName = 'sendMessageUploadDocumentAction';
    }

    attributes.push({_: 'documentAttributeFilename', file_name: fileName || apiFileName});

    if(['document', 'video', 'audio', 'voice'].indexOf(attachType) !== -1 && !isDocument) {
      let doc: any = {
        _: 'document',
        id: '' + messageID,
        duration: options.duration,
        attributes: attributes,
        w: options.width,
        h: options.height,
        downloaded: file.size,
        thumbs: [],
        mime_type: fileType,
        url: options.objectURL || '',
        size: file.size
      };
      
      appDocsManager.saveDoc(doc);
    }

    this.log('AMM: sendFile', attachType, apiFileName, file.type, options);

    var fromID = appUsersManager.getSelf().id;
    if(peerID != fromID) {
      flags |= 2;
      pFlags.out = true;

      if(!isChannel && !appUsersManager.isBot(peerID)) {
        flags |= 1;
        pFlags.unread = true;
      }
    }

    if(replyToMsgID) {
      flags |= 8;
    }

    if(asChannel) {
      fromID = 0;
      pFlags.post = true;
    } else {
      flags |= 256;
    }

    let preloader = new ProgressivePreloader(null, true);

    var media = {
      _: 'messageMediaPending',
      type: attachType,
      file_name: fileName || apiFileName,
      size: file.size,
      file: file,
      preloader: preloader,
      w: options.width,
      h: options.height,
      url: options.objectURL,
      progress: {
        percent: 1, 
        total: file.size,
        done: 0,
        cancel: () => {}
      }
    };

    preloader.preloader.onclick = () => {
      this.log('cancelling upload', media);
      this.setTyping('sendMessageCancelAction');
      media.progress.cancel();
    };

    var message: any = {
      _: 'message',
      id: messageID,
      from_id: fromID,
      to_id: appPeersManager.getOutputPeer(peerID),
      flags: flags,
      pFlags: pFlags,
      date: date,
      message: caption,
      media: isDocument ? {
        _: 'messageMediaDocument',
        pFlags: {},
        flags: 1,
        document: file 
      } : media,
      random_id: randomIDS,
      reply_to_msg_id: replyToMsgID,
      views: asChannel && 1,
      pending: true
    };

    var toggleError = (on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }

      $rootScope.$broadcast('messages_pending');
    };

    var uploaded = false,
      uploadPromise: ReturnType<typeof apiFileManager.uploadFile> = null;

    let invoke = (flags: number, inputMedia: any) => {
      this.setTyping('sendMessageCancelAction');

      return apiManager.invokeApi('messages.sendMedia', {
        flags: flags,
        background: options.background,
        clear_draft: true,
        peer: appPeersManager.getInputPeerByID(peerID),
        media: inputMedia,
        message: caption,
        random_id: randomID,
        reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID)
      }).then((updates) => {
        apiUpdatesManager.processUpdateMessage(updates);
      }, (error) => {
        if(attachType == 'photo' &&
          error.code == 400 &&
          (error.type == 'PHOTO_INVALID_DIMENSIONS' ||
          error.type == 'PHOTO_SAVE_FILE_INVALID')) {
          error.handled = true
          attachType = 'document'
          message.send();
          return;
        }

        toggleError(true);
      });
    };

    message.send = () => {
      let flags = 0;
      if(replyToMsgID) {
        flags |= 1;
      }
      if(options.background) {
        flags |= 64;
      }
      flags |= 128; // clear_draft

      if(isDocument) {
        let {id, access_hash, file_reference} = file as MTDocument;

        let inputMedia = {
          _: 'inputMediaDocument',
          flags: 0,
          id: {
            _: 'inputDocument',
            id: id,
            access_hash: access_hash,
            file_reference: file_reference
          }
        };
        
        invoke(flags, inputMedia);
      } else if(file instanceof File || file instanceof Blob) {
        let deferred = deferredPromise<void>();

        this.sendFilePromise.then(() => {
          if(!uploaded || message.error) {
            uploaded = false;
            uploadPromise = apiFileManager.uploadFile(file);
          }
  
          uploadPromise && uploadPromise.then((inputFile) => {
            this.log('appMessagesManager: sendFile uploaded:', inputFile);

            inputFile.name = apiFileName;
            uploaded = true;
            var inputMedia;
            switch(attachType) {
              case 'photo':
                inputMedia = {
                  _: 'inputMediaUploadedPhoto', 
                  flags: 0, 
                  file: inputFile
                };
                break;

              default:
                inputMedia = {
                  _: 'inputMediaUploadedDocument', 
                  file: inputFile, 
                  mime_type: fileType, 
                  attributes: attributes
                };
            }
  
            invoke(flags, inputMedia);
          }, (/* error */) => {
            toggleError(true);
          });
  
          uploadPromise.notify = (progress: {done: number, total: number}) => {
            this.log('upload progress', progress);
            media.progress.done = progress.done;
            media.progress.percent = Math.max(1, Math.floor(100 * progress.done / progress.total));
            this.setTyping({_: actionName, progress: media.progress.percent | 0});
            preloader.setProgress(media.progress.percent); // lol, nice
            $rootScope.$broadcast('history_update', {peerID: peerID});
          };
  
          media.progress.cancel = () => {
            if(!uploaded) {
              deferred.resolve();
              uploadPromise.cancel();
              this.cancelPendingMessage(randomIDS);
            }
          };
  
          // @ts-ignore
          uploadPromise['finally'](() => {
            deferred.resolve();
            preloader.detach();
          });
        });

        this.sendFilePromise = deferred;
      }
    };

    this.saveMessages([message]);
    historyStorage.pending.unshift(messageID);
    $rootScope.$broadcast('history_append', {peerID: peerID, messageID: messageID, my: true});

    setTimeout(message.send.bind(this), 0);

    this.pendingByRandomID[randomIDS] = [peerID, messageID];
  }

  public async sendAlbum(peerID: number, files: File[], options: Partial<{
    entities: any[],
    replyToMsgID: number,
    caption: string,
    sendFileDetails: Partial<{
      duration: number,
      width: number,
      height: number,
      objectURL: string,
    }>[]
  }> = {}) {
    peerID = appPeersManager.getPeerMigratedTo(peerID) || peerID;
    let groupID: number;
    let historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {count: null, history: [], pending: []});
    let flags = 0;
    let pFlags: any = {};
    let replyToMsgID = options.replyToMsgID;
    let isChannel = appPeersManager.isChannel(peerID);
    let isMegagroup = isChannel && appPeersManager.isMegagroup(peerID);
    let asChannel = isChannel && !isMegagroup ? true : false;

    let caption = options.caption || '';

    let date = tsNow(true) + ServerTimeManager.serverTimeOffset;

    if(caption) {
      let entities = options.entities || [];
      caption = RichTextProcessor.parseMarkdown(caption, entities);
    }

    this.log('AMM: sendAlbum', files, options);

    let fromID = appUsersManager.getSelf().id;
    if(peerID != fromID) {
      pFlags.out = true;

      if(!isChannel && !appUsersManager.isBot(peerID)) {
        pFlags.unread = true;
      }
    }

    if(replyToMsgID) {
      flags |= 1;
    }

    if(asChannel) {
      fromID = 0;
      pFlags.post = true;
    } else {
      flags |= 128; // clear_draft
    }

    let ids = files.map(() => this.tempID--).reverse();
    groupID = ids[ids.length - 1];
    let messages = files.map((file, idx) => {
      //let messageID = this.tempID--;
      //if(!groupID) groupID = messageID;
      let messageID = ids[idx];
      let randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
      let randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();
      let preloader = new ProgressivePreloader(null, true);

      let details = options.sendFileDetails[idx];

      let media = {
        _: 'messageMediaPending',
        type: 'album',
        preloader: preloader,
        progress: {
          percent: 1, 
          total: file.size,
          done: 0,
          cancel: () => {}
        },
        document: undefined as any,
        photo: undefined as any
      };

      if(file.type.indexOf('video/') === 0) {
        let flags = 1;
        let videoAttribute = {
          _: 'documentAttributeVideo',
          flags: flags,
          pFlags: { // that's only for client, not going to telegram
            supports_streaming: true,
            round_message: false
          }, 
          round_message: false,
          supports_streaming: true,
          duration: details.duration,
          w: details.width,
          h: details.height
        };

        let doc: any = {
          _: 'document',
          id: '' + messageID,
          attributes: [videoAttribute],
          downloaded: file.size,
          thumbs: [],
          mime_type: file.type,
          url: details.objectURL || '',
          size: file.size
        };
        
        appDocsManager.saveDoc(doc);
        media.document = doc;
      } else {
        let photo: any = {
          _: 'photo',
          id: '' + messageID,
          sizes: [{
            _: 'photoSize',
            w: details.width,
            h: details.height,
            type: 'm',
            size: file.size
          } as MTPhotoSize],
          w: details.width,
          h: details.height,
          downloaded: file.size,
          url: details.objectURL || ''
        };
        
        appPhotosManager.savePhoto(photo);
        media.photo = photo;
      }

      preloader.preloader.onclick = () => {
        this.log('cancelling upload', media);
        this.setTyping('sendMessageCancelAction');
        media.progress.cancel();
      };

      let message = {
        _: 'message',
        id: messageID,
        from_id: fromID,
        grouped_id: groupID,
        to_id: appPeersManager.getOutputPeer(peerID),
        flags: flags,
        pFlags: pFlags,
        date: date,
        message: caption,
        media: media,
        random_id: randomIDS,
        randomID: randomID,
        reply_to_msg_id: replyToMsgID,
        views: asChannel && 1,
        pending: true,
        error: false
      };

      this.saveMessages([message]);
      historyStorage.pending.unshift(messageID);
      //$rootScope.$broadcast('history_append', {peerID: peerID, messageID: messageID, my: true});

      this.pendingByRandomID[randomIDS] = [peerID, messageID];

      return message;
    });

    $rootScope.$broadcast('history_append', {peerID: peerID, messageID: messages[messages.length - 1].id, my: true});

    let toggleError = (message: any, on: boolean) => {
      if(on) {
        message.error = true;
      } else {
        delete message.error;
      }

      $rootScope.$broadcast('messages_pending');
    };

    let uploaded = false,
      uploadPromise: ReturnType<typeof apiFileManager.uploadFile> = null;

    let inputPeer = appPeersManager.getInputPeerByID(peerID);
    let invoke = (multiMedia: any[]) => {
      this.setTyping('sendMessageCancelAction');

      return apiManager.invokeApi('messages.sendMultiMedia', {
        flags: flags,
        peer: inputPeer,
        multi_media: multiMedia,
        reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID)
      }).then((updates) => {
        apiUpdatesManager.processUpdateMessage(updates);
      }, (error) => {
        messages.forEach(message => toggleError(message, true));
      });
    };

    let inputs: any[] = [];
    for(let i = 0, length = files.length; i < length; ++i) {
      let file = files[i];
      let message = messages[i];
      let media = message.media;
      let preloader = media.preloader;
      let actionName = file.type.indexOf('video/') === 0 ? 'sendMessageUploadVideoAction' : 'sendMessageUploadPhotoAction';
      let deferred = deferredPromise<void>();

      await this.sendFilePromise;
      this.sendFilePromise = deferred;

      if(!uploaded || message.error) {
        uploaded = false;
        uploadPromise = apiFileManager.uploadFile(file);
      }

      uploadPromise.notify = (progress: {done: number, total: number}) => {
        this.log('upload progress', progress);
        media.progress.percent = Math.max(1, Math.floor(100 * progress.done / progress.total));
        this.setTyping({_: actionName, progress: media.progress.percent | 0});
        preloader.setProgress(media.progress.percent); // lol, nice
        $rootScope.$broadcast('history_update', {peerID: peerID});
      };

      await uploadPromise.then((inputFile) => {
        this.log('appMessagesManager: sendAlbum file uploaded:', inputFile);

        let inputMedia: any;
        let details = options.sendFileDetails[i];
        if(details.duration) {
          inputMedia = {
            _: 'inputMediaUploadedDocument',
            flags: 0,
            file: inputFile,
            mime_type: file.type,
            attributes: [{
              _: 'documentAttributeVideo',
              flags: 2,
              supports_streaming: true,
              duration: details.duration,
              w: details.width,
              h: details.height
            }]
          };
        } else {
          inputMedia = {
            _: 'inputMediaUploadedPhoto', 
            flags: 0, 
            file: inputFile
          };
        }

        return apiManager.invokeApi('messages.uploadMedia', {
          peer: inputPeer,
          media: inputMedia
        }).then(messageMedia => {
          let inputMedia: any;
          if(messageMedia.photo) {
            let photo = messageMedia.photo;
            appPhotosManager.savePhoto(photo);
            inputMedia = appPhotosManager.getInputByID(photo.id);
          } else {
            let doc = messageMedia.document;
            appDocsManager.saveDoc(doc);
            inputMedia = appDocsManager.getMediaInputByID(doc.id);
          }

          inputs.push({
            _: 'inputSingleMedia',
            flags: 0,
            media: inputMedia,
            random_id: message.randomID,
            message: caption,
            entities: []
          });

          caption = ''; // only 1 caption for all inputs
        }, () => {
          toggleError(message, true);
        });
      }, () => {
        toggleError(message, true);
      });

      this.log('appMessagesManager: sendAlbum uploadPromise.finally!');
      deferred.resolve();
      preloader.detach();
    }

    uploaded = true;
    invoke(inputs);
  }

  public sendOther(peerID: number, inputMedia: any, options: Partial<{
    replyToMsgID: number,
    viaBotID: number,
    reply_markup: any,
    clearDraft: boolean,
    queryID: number
    resultID: number
  }> = {}) {
    peerID = appPeersManager.getPeerMigratedTo(peerID) || peerID;

    const messageID = this.tempID--;
    const randomID = [nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)];
    const randomIDS = bigint(randomID[0]).shiftLeft(32).add(bigint(randomID[1])).toString();
    const historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {count: null, history: [], pending: []});
    const replyToMsgID = options.replyToMsgID;
    const isChannel = appPeersManager.isChannel(peerID);
    const isMegagroup = isChannel && appPeersManager.isMegagroup(peerID);
    const asChannel = isChannel && !isMegagroup ? true : false;

    let fromID = appUsersManager.getSelf().id;
    let media;
    switch(inputMedia._) {
      case 'inputMediaPoll': {
        inputMedia.poll.id = messageID;
        appPollsManager.savePoll(inputMedia.poll, {
          _: 'pollResults',
          flags: 4,
          total_voters: 0,
          pFlags: {},
        });

        const {poll, results} = appPollsManager.getPoll('' + messageID);
        media = {
          _: 'messageMediaPoll',
          poll,
          results
        };

        break;
      }
      /* case 'inputMediaPhoto':
        media = {
          _: 'messageMediaPhoto',
          photo: appPhotosManager.getPhoto(inputMedia.id.id),
          caption: inputMedia.caption || ''
        };
        break;

      case 'inputMediaDocument':
        var doc = appDocsManager.getDoc(inputMedia.id.id);
        if(doc.sticker && doc.stickerSetInput) {
          appStickersManager.pushPopularSticker(doc.id);
        }
        media = {
          _: 'messageMediaDocument',
          'document': doc,
          caption: inputMedia.caption || ''
        };
        break;

      case 'inputMediaContact':
        media = {
          _: 'messageMediaContact',
          phone_number: inputMedia.phone_number,
          first_name: inputMedia.first_name,
          last_name: inputMedia.last_name,
          user_id: 0
        };
        break;

      case 'inputMediaGeoPoint':
        media = {
          _: 'messageMediaGeo',
          geo: {
            _: 'geoPoint',
            'lat': inputMedia.geo_point['lat'],
            'long': inputMedia.geo_point['long']
          }
        };
        break;

      case 'inputMediaVenue':
        media = {
          _: 'messageMediaVenue',
          geo: {
            _: 'geoPoint',
            'lat': inputMedia.geo_point['lat'],
            'long': inputMedia.geo_point['long']
          },
          title: inputMedia.title,
          address: inputMedia.address,
          provider: inputMedia.provider,
          venue_id: inputMedia.venue_id
        };
        break;

      case 'messageMediaPending':
        media = inputMedia;
        break; */
    }

    let flags = 0;
    let pFlags: any = {};
    if(peerID != fromID) {
      flags |= 2;
      pFlags.out = true;
      if(!appUsersManager.isBot(peerID)) {
        flags |= 1;
        pFlags.unread = true;
      }
    }
    if(replyToMsgID) {
      flags |= 8;
    }
    if(asChannel) {
      fromID = 0;
      pFlags.post = true;
    } else {
      flags |= 256;
    }

    const message: any = {
      _: 'message',
      id: messageID,
      from_id: fromID,
      to_id: appPeersManager.getOutputPeer(peerID),
      flags: flags,
      pFlags: pFlags,
      date: tsNow(true) + ServerTimeManager.serverTimeOffset,
      message: '',
      media: media,
      random_id: randomIDS,
      reply_to_msg_id: replyToMsgID,
      via_bot_id: options.viaBotID,
      reply_markup: options.reply_markup,
      views: asChannel && 1,
      pending: true,
    };

    let toggleError = (on: boolean) => {
      /* const historyMessage = this.messagesForHistory[messageID];
      if (on) {
        message.error = true
        if (historyMessage) {
          historyMessage.error = true
        }
      } else {
        delete message.error
        if (historyMessage) {
          delete historyMessage.error
        }
      } */
      $rootScope.$broadcast('messages_pending');
    };

    message.send = () => {
      let flags = 0;
      if(replyToMsgID) {
        flags |= 1;
      }
      if(asChannel) {
        flags |= 16;
      }
      if(options.clearDraft) {
        flags |= 128;
      }

      const sentRequestOptions: any = {};
      if(this.pendingAfterMsgs[peerID]) {
        sentRequestOptions.afterMessageID = this.pendingAfterMsgs[peerID].messageID;
      }

      let apiPromise: Promise<any>;
      if(options.viaBotID) {
        apiPromise = apiManager.invokeApi('messages.sendInlineBotResult', {
          flags: flags,
          peer: appPeersManager.getInputPeerByID(peerID),
          random_id: randomID,
          reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID),
          query_id: options.queryID,
          id: options.resultID
        }, sentRequestOptions);
      } else {
        apiPromise = apiManager.invokeApi('messages.sendMedia', {
          flags: flags,
          peer: appPeersManager.getInputPeerByID(peerID),
          media: inputMedia,
          random_id: randomID,
          reply_to_msg_id: appMessagesIDsManager.getMessageLocalID(replyToMsgID)
        }, sentRequestOptions);
      }
      apiPromise.then((updates) => {
        if(updates.updates) {
          updates.updates.forEach((update: any) => {
            if(update._ == 'updateDraftMessage') {
              update.local = true
            }
          });
        }

        apiUpdatesManager.processUpdateMessage(updates);
      }, (error) => {
        toggleError(true);
      }).finally(() => {
        if(this.pendingAfterMsgs[peerID] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerID];
        }
      });
      this.pendingAfterMsgs[peerID] = sentRequestOptions;
    }

    this.saveMessages([message]);
    historyStorage.pending.unshift(messageID);
    $rootScope.$broadcast('history_append', {peerID: peerID, messageID: messageID, my: true});

    setTimeout(message.send, 0);

    /* if(options.clearDraft) {
      DraftsManager.clearDraft(peerID)
    } */

    this.pendingByRandomID[randomIDS] = [peerID, messageID];
  }

  public cancelPendingMessage(randomID: string) {
    var pendingData = this.pendingByRandomID[randomID];

    this.log('cancelPendingMessage', randomID, pendingData);

    if(pendingData) {
      var peerID = pendingData[0];
      var tempID = pendingData[1];
      var historyStorage = this.historiesStorage[peerID];
      var pos = historyStorage.pending.indexOf(tempID);

      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateDeleteMessages',
          messages: [tempID]
        }
      });

      if(pos != -1) {
        historyStorage.pending.splice(pos, 1);
      }

      delete this.messagesStorage[tempID];

      return true;
    }

    return false;
  }

  public getConversations(query = '', offsetIndex?: number, limit = 20, folderID = 0) {
    const realFolderID = folderID > 1 ? 0 : folderID;
    let curDialogStorage = this.dialogsStorage.getFolder(folderID);

    if(query) {
      if(!limit || this.cachedResults.query !== query) {
        this.cachedResults.query = query

        const results = searchIndexManager.search(query, this.dialogsIndex);

        this.cachedResults.dialogs = [];
        /* for(const folderID in this.dialogsStorage) {
          const dialogs = this.dialogsStorage[folderID];
          dialogs.forEach(dialog => {
            if(results[dialog.peerID]) {
              this.cachedResults.dialogs.push(dialog);
            }
          });
        } */
        for(const peerID in this.dialogsStorage.dialogs) {
          const dialog = this.dialogsStorage.dialogs[peerID];
          if(results[dialog.peerID]) {
            this.cachedResults.dialogs.push(dialog);
          }
        }

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

    if(query || this.dialogsStorage.allDialogsLoaded[realFolderID] || curDialogStorage.length >= offset + limit) {
      return Promise.resolve({
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: this.dialogsStorage.allDialogsLoaded[realFolderID] ? curDialogStorage.length : null
      });
    }

    return this.getTopMessages(limit, realFolderID).then(totalCount => {
      //const curDialogStorage = this.dialogsStorage[folderID];

      offset = 0;
      if(offsetIndex > 0) {
        for(; offset < curDialogStorage.length; offset++) {
          if(offsetIndex > curDialogStorage[offset].index) {
            break;
          }
        }
      }

      //this.log.warn(offset, offset + limit, curDialogStorage.dialogs.length, this.dialogsStorage.dialogs.length);

      return {
        dialogs: curDialogStorage.slice(offset, offset + limit),
        count: totalCount
      };
    });
  }

  public getTopMessages(limit: number, folderID: number): Promise<number> {
    const dialogs = this.dialogsStorage.getFolder(folderID);
    let offsetID = 0;
    let offsetDate = 0;
    let offsetPeerID = 0;
    let offsetIndex = 0;
    let flags = 0;

    if(this.dialogsStorage.dialogsOffsetDate[folderID]) {
      offsetDate = this.dialogsStorage.dialogsOffsetDate[folderID] + serverTimeManager.serverTimeOffset;
      offsetIndex = this.dialogsStorage.dialogsOffsetDate[folderID] * 0x10000;
      //flags |= 1; // means pinned already loaded
    }

    //if(folderID > 0) {
      //flags |= 1;
      flags |= 2;
    //}

    return apiManager.invokeApi('messages.getDialogs', {
      flags: flags,
      folder_id: folderID,
      offset_date: offsetDate,
      offset_id: appMessagesIDsManager.getMessageLocalID(offsetID),
      offset_peer: appPeersManager.getInputPeerByID(offsetPeerID),
      limit: limit,
      hash: 0
    }, {
      timeout: APITIMEOUT
    }).then((dialogsResult: any) => {
      ///////this.log('messages.getDialogs result:', dialogsResult);

      if(!offsetDate) {
        telegramMeWebService.setAuthorized(true);
      }

      appUsersManager.saveApiUsers(dialogsResult.users);
      appChatsManager.saveApiChats(dialogsResult.chats);
      this.saveMessages(dialogsResult.messages);

      var maxSeenIdIncremented = offsetDate ? true : false;
      var hasPrepend = false;
      let length = dialogsResult.dialogs.length;
      let noIDsDialogs: any = {};
      for(let i = length - 1; i >= 0; --i) {
        let dialog = dialogsResult.dialogs[i];

        this.saveConversation(dialog);
        if(offsetIndex && dialog.index > offsetIndex) {
          this.newDialogsToHandle[dialog.peerID] = dialog;
          hasPrepend = true;
        }

        if(!dialog.read_inbox_max_id && !dialog.read_outbox_max_id) {
          noIDsDialogs[dialog.peerID] = dialog;
        }

        if(!maxSeenIdIncremented &&
            !appPeersManager.isChannel(appPeersManager.getPeerID(dialog.peer))) {
          this.incrementMaxSeenID(dialog.top_message);
          maxSeenIdIncremented = true;
        }
      }

      if(Object.keys(noIDsDialogs).length) {
        //setTimeout(() => { // test bad situation
          this.reloadConversation(Object.keys(noIDsDialogs).map(id => +id)).then(() => {
            $rootScope.$broadcast('dialogs_multiupdate', noIDsDialogs);
  
            for(let peerID in noIDsDialogs) {
              $rootScope.$broadcast('dialog_unread', {peerID: +peerID});
            }
          });
        //}, 10e3);
      }

      if(!dialogsResult.dialogs.length ||
        !dialogsResult.count ||
        dialogs.length >= dialogsResult.count) {
        this.dialogsStorage.allDialogsLoaded[folderID] = true;
      }

      if(hasPrepend) {
        this.scheduleHandleNewDialogs();
      } else {
        $rootScope.$broadcast('dialogs_multiupdate', {});
      }

      return dialogsResult.count;
    });
  }

  public forwardMessages(peerID: number, mids: number[], options: Partial<{
    withMyScore: boolean
  }> = {}) {
    peerID = appPeersManager.getPeerMigratedTo(peerID) || peerID;
    mids = mids.sort((a, b) => a - b);

    var flags = 0;
    if(options.withMyScore) {
      flags |= 256;
    }

    let splitted = appMessagesIDsManager.splitMessageIDsByChannels(mids);
    let promises: any[] = [];

    for(let channelID in splitted.msgIDs) {
      let msgIDs = splitted.msgIDs[channelID];
      let len = msgIDs.length;
      let randomIDs = [];
      for(let i = 0; i < len; i++) {
        randomIDs.push([nextRandomInt(0xFFFFFFFF), nextRandomInt(0xFFFFFFFF)]);
      }

      let sentRequestOptions: any = {};
      if(this.pendingAfterMsgs[peerID]) {
        sentRequestOptions.afterMessageID = this.pendingAfterMsgs[peerID].messageID;
      }

      let promise = apiManager.invokeApi('messages.forwardMessages', {
        flags: flags,
        from_peer: appPeersManager.getInputPeerByID(-channelID),
        id: msgIDs,
        random_id: randomIDs,
        to_peer: appPeersManager.getInputPeerByID(peerID)
      }, sentRequestOptions).then((updates) => {
        apiUpdatesManager.processUpdateMessage(updates);
      }, () => {}).then(() => {
        if(this.pendingAfterMsgs[peerID] === sentRequestOptions) {
          delete this.pendingAfterMsgs[peerID];
        }
      });

      this.pendingAfterMsgs[peerID] = sentRequestOptions;
      promises.push(promise);
    }

    return Promise.all(promises);
  }

  public getMessage(messageID: number) {
    return this.messagesStorage[messageID] || {
      _: 'messageEmpty',
      deleted: true,
      pFlags: {out: false, unread: false}
    };
  }

  public getMessagePeer(message: any): number {
    var toID = message.to_id && appPeersManager.getPeerID(message.to_id) || 0;

    if(toID < 0) {
      return toID;
    } else if(message.pFlags && message.pFlags.out || message.flags & 2) {
      return toID;
    }
    return message.from_id;
  }

  public getDialogByPeerID(peerID: number): [Dialog, number] | [] {
    return this.dialogsStorage.getDialog(peerID);
  }

  public reloadConversation(peerID: number | number[]) {
    [].concat(peerID).forEach(peerID => {
      if(!this.reloadConversationsPeers.includes(peerID)) {
        this.reloadConversationsPeers.push(peerID);
        this.log('will reloadConversation', peerID);
      }
    });

    if(this.reloadConversationsPromise) return this.reloadConversationsPromise;
    return this.reloadConversationsPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        let peers = this.reloadConversationsPeers.map(peerID => appPeersManager.getInputPeerByID(peerID));
        this.reloadConversationsPeers.length = 0;

        apiManager.invokeApi('messages.getPeerDialogs', {peers}).then((result) => {
          this.applyConversations(result);
          resolve();
        }, reject).finally(() => {
          this.reloadConversationsPromise = null;
        });
      }, 0);
    });
  }

  private doFlushHistory(inputPeer: any, justClear: boolean): Promise<true> {
    let flags = 0;
    if(justClear) {
      flags |= 1;
    }

    return apiManager.invokeApi('messages.deleteHistory', {
      flags: flags,
      peer: inputPeer,
      max_id: 0
    }).then((affectedHistory) => {
      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updatePts',
          pts: affectedHistory.pts,
          pts_count: affectedHistory.pts_count
        }
      });

      if(!affectedHistory.offset) {
        return true;
      }

      return this.doFlushHistory(inputPeer, justClear);
    })
  }

  public async flushHistory(peerID: number, justClear: boolean) {
    if(appPeersManager.isChannel(peerID)) {
      let promise = this.getHistory(peerID, 0, 1);

      let historyResult = promise instanceof Promise ? await promise : promise;

      let channelID = -peerID;
      let maxID = appMessagesIDsManager.getMessageLocalID(historyResult.history[0] || 0);
      return apiManager.invokeApi('channels.deleteHistory', {
        channel: appChatsManager.getChannelInput(channelID),
        max_id: maxID
      }).then(() => {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updateChannelAvailableMessages',
            channel_id: channelID,
            available_min_id: maxID
          }
        });

        return true;
      });
    }

    return this.doFlushHistory(appPeersManager.getInputPeerByID(peerID), justClear).then(() => {
      delete this.historiesStorage[peerID];
      for(let mid in this.messagesStorage) {
        let message = this.messagesStorage[mid];
        if(message.peerID == peerID) {
          delete this.messagesStorage[mid];
        }
      }

      if(justClear) {
        $rootScope.$broadcast('dialog_flush', {peerID: peerID});
      } else {
        this.dialogsStorage.dropDialog(peerID);

        $rootScope.$broadcast('dialog_drop', {peerID: peerID});
      }
    });
  }

  public savePinnedMessage(peerID: number, mid: number) {
    if(!mid) {
      delete this.pinnedMessages[peerID];
      return;
    }

    this.pinnedMessages[peerID] = mid;
    this.wrapSingleMessage(mid);
  }

  public getPinnedMessage(peerID: number) {
    return this.getMessage(this.pinnedMessages[peerID] || 0);
  }
  
  public updatePinnedMessage(peerID: number, msgID: number) {
    apiManager.invokeApi('messages.updatePinnedMessage', {
      flags: 0,
      peer: appPeersManager.getInputPeerByID(peerID),
      id: msgID
    }).then(updates => {
      /////this.log('pinned updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates);
    });
  }

  public saveMessages(apiMessages: any[], options: {
    isNew?: boolean,
    isEdited?: boolean
  } = {}) {
    apiMessages.forEach((apiMessage) => {
      if(apiMessage.pFlags === undefined) {
        apiMessage.pFlags = {};
      }

      if(!apiMessage.pFlags.out) {
        apiMessage.pFlags.out = false;
      }

      if(!apiMessage.pFlags.unread) {
        apiMessage.pFlags.unread = false;
      }

      if(apiMessage._ == 'messageEmpty') {
        return;
      }

      const peerID = this.getMessagePeer(apiMessage);
      const isChannel = apiMessage.to_id._ == 'peerChannel';
      const channelID = isChannel ? -peerID : 0;
      const isBroadcast = isChannel && appChatsManager.isBroadcast(channelID);

      const mid = appMessagesIDsManager.getFullMessageID(apiMessage.id, channelID);
      apiMessage.mid = mid;

      if(apiMessage.grouped_id) {
        const storage = this.groupedMessagesStorage[apiMessage.grouped_id] ?? (this.groupedMessagesStorage[apiMessage.grouped_id] = {});
        storage[mid] = apiMessage;
      }

      const dialog = this.getDialogByPeerID(peerID)[0];
      if(dialog && mid > 0) {
        apiMessage.pFlags.unread = mid > dialog[apiMessage.pFlags.out
          ? 'read_outbox_max_id'
          : 'read_inbox_max_id'];
      } else if(options.isNew) {
        apiMessage.pFlags.unread = true;
      }
      // this.log(dT(), 'msg unread', mid, apiMessage.pFlags.out, dialog && dialog[apiMessage.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id'])

      if(apiMessage.reply_to_msg_id) {
        apiMessage.reply_to_mid = appMessagesIDsManager.getFullMessageID(apiMessage.reply_to_msg_id, channelID);
      }

      apiMessage.date -= serverTimeManager.serverTimeOffset;

      apiMessage.peerID = peerID;
      apiMessage.fromID = apiMessage.pFlags.post ? peerID : apiMessage.from_id;

      const fwdHeader = apiMessage.fwd_from;
      if(fwdHeader) {
        if(peerID == appUsersManager.getSelf().id) {
          if(fwdHeader.saved_from_peer && fwdHeader.saved_from_msg_id) {
            const savedFromPeerID = appPeersManager.getPeerID(fwdHeader.saved_from_peer);
            const savedFromMid = appMessagesIDsManager.getFullMessageID(fwdHeader.saved_from_msg_id, 
              appPeersManager.isChannel(savedFromPeerID) ? -savedFromPeerID : 0);
            apiMessage.savedFrom = savedFromPeerID + '_' + savedFromMid;
          }

          apiMessage.fromID = fwdHeader.channel_id ? -fwdHeader.channel_id : fwdHeader.from_id;
        } else {
          apiMessage.fwdPostID = fwdHeader.channel_post;
        }

        apiMessage.fwdFromID = fwdHeader.channel_id ? -fwdHeader.channel_id : fwdHeader.from_id;

        fwdHeader.date -= serverTimeManager.serverTimeOffset;
      }

      if(apiMessage.via_bot_id > 0) {
        apiMessage.viaBotID = apiMessage.via_bot_id;
      }

      const mediaContext = {
        user_id: apiMessage.fromID,
        date: apiMessage.date
      };

      if(apiMessage.media) {
        switch(apiMessage.media._) {
          case 'messageMediaEmpty':
            delete apiMessage.media;
            break;
          case 'messageMediaPhoto':
            if(apiMessage.media.ttl_seconds) {
              apiMessage.media = {_: 'messageMediaUnsupportedWeb'};
            } else {
              apiMessage.media.photo = appPhotosManager.savePhoto(apiMessage.media.photo, mediaContext);
              //appPhotosManager.savePhoto(apiMessage.media.photo, mediaContext);
            }
            break;
          case 'messageMediaPoll':
            apiMessage.media.poll = appPollsManager.savePoll(apiMessage.media.poll, apiMessage.media.results);
            break;
          case 'messageMediaDocument':
            if(apiMessage.media.ttl_seconds) {
              apiMessage.media = {_: 'messageMediaUnsupportedWeb'};
            } else {
              apiMessage.media.document = appDocsManager.saveDoc(apiMessage.media.document, mediaContext); // 11.04.2020 warning
            }


            break;
          case 'messageMediaWebPage':
            /* if(apiMessage.media.webpage.document) {
              appDocsManager.saveDoc(apiMessage.media.webpage.document, mediaContext);
            } */
            appWebPagesManager.saveWebPage(apiMessage.media.webpage, apiMessage.mid, mediaContext);
            break;
          /*case 'messageMediaGame':
            AppGamesManager.saveGame(apiMessage.media.game, apiMessage.mid, mediaContext);
            apiMessage.media.handleMessage = true;
            break; */
          case 'messageMediaInvoice':
            apiMessage.media = {_: 'messageMediaUnsupportedWeb'};
            break;
          case 'messageMediaGeoLive':
            apiMessage.media._ = 'messageMediaGeo';
            break;
        }
      }

      if(apiMessage.action) {
        let migrateFrom;
        let migrateTo;
        switch(apiMessage.action._) {
          case 'messageActionChatEditPhoto':
            apiMessage.action.photo = appPhotosManager.savePhoto(apiMessage.action.photo, mediaContext);
            //appPhotosManager.savePhoto(apiMessage.action.photo, mediaContext);
            if(isBroadcast) {
              apiMessage.action._ = 'messageActionChannelEditPhoto';
            }
            break;

          case 'messageActionChatEditTitle':
            if(isBroadcast) {
              apiMessage.action._ = 'messageActionChannelEditTitle';
            }
            break;

          case 'messageActionChatDeletePhoto':
            if(isBroadcast) {
              apiMessage.action._ = 'messageActionChannelDeletePhoto';
            }
            break;

          case 'messageActionChatAddUser':
            if(apiMessage.action.users.length == 1) {
              apiMessage.action.user_id = apiMessage.action.users[0];
              if(apiMessage.fromID == apiMessage.action.user_id) {
                if(isChannel) {
                  apiMessage.action._ = 'messageActionChatJoined';
                } else {
                  apiMessage.action._ = 'messageActionChatReturn';
                }
              }
            } else if(apiMessage.action.users.length > 1) {
              apiMessage.action._ = 'messageActionChatAddUsers';
            }
            break;

          case 'messageActionChatDeleteUser':
            if(apiMessage.fromID == apiMessage.action.user_id) {
              apiMessage.action._ = 'messageActionChatLeave';
            }
            break;

          case 'messageActionChannelMigrateFrom':
            migrateFrom = -apiMessage.action.chat_id;
            migrateTo = -channelID;
            break

          case 'messageActionChatMigrateTo':
            migrateFrom = -channelID;
            migrateTo = -apiMessage.action.channel_id;
            break;

          case 'messageActionHistoryClear':
            apiMessage.deleted = true;
            apiMessage.clear_history = true;
            apiMessage.pFlags.out = false;
            apiMessage.pFlags.unread = false;
            break;

          case 'messageActionPhoneCall':
            delete apiMessage.fromID;
            apiMessage.action.type = 
              (apiMessage.pFlags.out ? 'out_' : 'in_') +
              (
                apiMessage.action.reason._ == 'phoneCallDiscardReasonMissed' ||
                apiMessage.action.reason._ == 'phoneCallDiscardReasonBusy'
                   ? 'missed'
                   : 'ok'
              );
            break;
        }
        
        if(migrateFrom &&
            migrateTo &&
            !this.migratedFromTo[migrateFrom] &&
            !this.migratedToFrom[migrateTo]) {
          this.migrateChecks(migrateFrom, migrateTo);
        }
      }

      apiMessage.rReply = this.getRichReplyText(apiMessage);

      if(apiMessage.message && apiMessage.message.length) {
        const myEntities = RichTextProcessor.parseEntities(apiMessage.message);
        const apiEntities = apiMessage.entities || [];
        apiMessage.totalEntities = RichTextProcessor.mergeEntities(myEntities, apiEntities, !apiMessage.pending);
      }

      apiMessage.canBeEdited = this.canMessageBeEdited(apiMessage);

      if(!options.isEdited) {
        this.messagesStorage[mid] = apiMessage;
      }
    });
  }

  public getRichReplyText(message: any, text: string = message.message) {
    let messageText = '';

    if(message.media) {
      if(message.grouped_id) {
        messageText += '<i>Album' + (message.message ? ', ' : '') + '</i>';
      } else switch(message.media._) {
        case 'messageMediaPhoto':
          messageText += '<i>Photo' + (message.message ? ', ' : '') + '</i>';
          break;
        case 'messageMediaGeo':
          messageText += '<i>Geolocation</i>';
          break;
        case 'messageMediaPoll':
          messageText += '<i>' + message.media.poll.rReply + '</i>';
          break;
        case 'messageMediaContact':
          messageText += '<i>Contact</i>';
          break;
        case 'messageMediaDocument':
          let document = message.media.document;

          if(document.type == 'video') {
            messageText = '<i>Video' + (message.message ? ', ' : '') + '</i>';
          } else if(document.type == 'voice') {
            messageText = '<i>Voice message</i>';
          } else if(document.type == 'gif') {
            messageText = '<i>GIF' + (message.message ? ', ' : '') + '</i>';
          } else if(document.type == 'round') {
            messageText = '<i>Video message' + (message.message ? ', ' : '') + '</i>';
          } else if(document.type == 'sticker') {
            messageText = (document.stickerEmoji || '') + '<i>Sticker</i>';
          } else {
            messageText = '<i>' + document.file_name + '</i>';
          }

          break;

        default:
          ///////this.log.warn('Got unknown message.media type!', message);
          break;
      }
    }

    if(message.action) {
      let action = message.action;

      let str = '';
      if(action.message) {
        str = RichTextProcessor.wrapRichText(action.message, {noLinebreaks: true});
      } else {
        let suffix = '';
        let _ = action._;
        if(_ == "messageActionPhoneCall") {
          _ += '.' + action.type;
  
          let duration = action.duration;
          if(duration) {
            let d = [];
  
            d.push(duration % 60 + ' s');
            if(duration >= 60) d.push((duration / 60 | 0) + ' min');
            //if(duration >= 3600) d.push((duration / 3600 | 0) + ' h');
            suffix = ' (' + d.reverse().join(' ') + ')';
          }
        }

        // @ts-ignore
        str = (langPack[_] || action._) + suffix;
      }

      //this.log('message action:', action);

      messageText = '<i>' + str + '</i>';
    }

    let messageWrapped = '';
    if(text) {
      let entities = RichTextProcessor.parseEntities(text.replace(/\n/g, ' '), {noLinebreakers: true});

      messageWrapped = RichTextProcessor.wrapRichText(text, {
        noLinebreakers: true, 
        entities: entities, 
        noTextFormat: true
      });
    }

    return messageText + messageWrapped;
  }

  public editPeerFolders(peerIDs: number[], folderID: number) {
    apiManager.invokeApi('folders.editPeerFolders', {
      folder_peers: peerIDs.map(peerID => {
        return {
          _: 'inputFolderPeer',
          peer: appPeersManager.getInputPeerByID(peerID),
          folder_id: folderID
        };
      })
    }).then(updates => {
      this.log('editPeerFolders updates:', updates);
      apiUpdatesManager.processUpdateMessage(updates); // WARNING! возможно тут нужно добавлять channelID, и вызывать апдейт для каждого канала отдельно
    });
  }

  public toggleDialogPin(peerID: number, filterID?: number) {
    if(filterID > 1) {
      this.filtersStorage.toggleDialogPin(peerID, filterID);
      return;
    }

    const dialog = this.getDialogByPeerID(peerID)[0];
    if(!dialog) return Promise.reject();

    const peer = {
      _: 'inputDialogPeer',
      peer: appPeersManager.getInputPeerByID(peerID)
    };

    const flags = dialog.pFlags?.pinned ? 0 : 1;
    return apiManager.invokeApi('messages.toggleDialogPin', {
      flags,
      peer
    }).then(bool => {
      if(bool) {
        this.handleUpdate({
          _: 'updateDialogPinned',
          peer: peer,
          pFlags: {
            pinned: flags
          }
        });
      }
    });
  }

  public markDialogUnread(peerID: number, read?: boolean) {
    let dialog = this.getDialogByPeerID(peerID)[0];
    if(!dialog) return Promise.reject();

    let peer = {
      _: 'inputDialogPeer',
      peer: appPeersManager.getInputPeerByID(peerID)
    };

    let flags = read || dialog.pFlags?.unread_mark ? 0 : 1;
    return apiManager.invokeApi('messages.markDialogUnread', {
      flags,
      peer
    }).then(bool => {
      if(bool) {
        this.handleUpdate({
          _: 'updateDialogUnreadMark',
          peer: peer,
          pFlags: {
            unread: flags
          }
        });
      }
    });
  }

  public migrateChecks(migrateFrom: number, migrateTo: number) {
    if(!this.migratedFromTo[migrateFrom] &&
      !this.migratedToFrom[migrateTo] &&
      appChatsManager.hasChat(-migrateTo)) {
      const fromChat = appChatsManager.getChat(-migrateFrom);
      if(fromChat &&
        fromChat.migrated_to &&
        fromChat.migrated_to.channel_id == -migrateTo) {
          this.migratedFromTo[migrateFrom] = migrateTo;
          this.migratedToFrom[migrateTo] = migrateFrom;

        setTimeout(() => {
          const dropped = this.dialogsStorage.dropDialog(migrateFrom);
          if(dropped.length) {
            $rootScope.$broadcast('dialog_drop', {peerID: migrateFrom, dialog: dropped[0]});
          }

          $rootScope.$broadcast('dialog_migrate', {migrateFrom: migrateFrom, migrateTo: migrateTo});
        }, 100);
      }
    }
  }

  public canMessageBeEdited(message: any) {
    var goodMedias = [
      'messageMediaPhoto',
      'messageMediaDocument',
      'messageMediaWebPage',
      'messageMediaPending'
    ]
    if(message._ != 'message' ||
        message.deleted ||
        message.fwd_from ||
        message.via_bot_id ||
        message.media && goodMedias.indexOf(message.media._) == -1 ||
        message.fromID && appUsersManager.isBot(message.fromID)) {
      return false;
    }
    if(message.media &&
        message.media._ == 'messageMediaDocument' &&
        message.media.document.sticker) {
      return false;
    }

    return true;
  }

  public canEditMessage(messageID: number) {
    if(!this.messagesStorage[messageID]) {
      return false;
    }

    const message = this.messagesStorage[messageID];
    if(!message || !message.canBeEdited) {
      return false;
    }

    if(this.getMessagePeer(message) == appUsersManager.getSelf().id) {
      return true;
    }

    if(message.date < tsNow(true) - 2 * 86400 || !message.pFlags.out) {
      return false;
    }

    return true;
  }

  public applyConversations(dialogsResult: any) {
    appUsersManager.saveApiUsers(dialogsResult.users);
    appChatsManager.saveApiChats(dialogsResult.chats);
    this.saveMessages(dialogsResult.messages);

    //this.log('applyConversation', dialogsResult);

    const updatedDialogs: {[peerID: number]: Dialog} = {};
    let hasUpdated = false;
    dialogsResult.dialogs.forEach((dialog: any) => {
      const peerID = appPeersManager.getPeerID(dialog.peer);
      let topMessage = dialog.top_message;
      const topPendingMesage = this.pendingTopMsgs[peerID];
      if(topPendingMesage) {
        if(!topMessage || this.getMessage(topPendingMesage).date > this.getMessage(topMessage).date) {
          dialog.top_message = topMessage = topPendingMesage;
        }
      }

      if(topMessage) {
        const wasDialogBefore = this.getDialogByPeerID(peerID)[0];

        // here need to just replace, not FULL replace dialog! WARNING
        if(wasDialogBefore && wasDialogBefore.pFlags && wasDialogBefore.pFlags.pinned) {
          if(!dialog.pFlags) dialog.pFlags = {};
          dialog.pFlags.pinned = true;
        }

        this.saveConversation(dialog);

        if(wasDialogBefore) {
          $rootScope.$broadcast('dialog_top', dialog);
        } else {
          updatedDialogs[peerID] = dialog;
          hasUpdated = true;
        }
      } else {
        const dropped = this.dialogsStorage.dropDialog(peerID);
        if(dropped.length) {
          $rootScope.$broadcast('dialog_drop', {peerID: peerID, dialog: dropped[0]});
        }
      }

      if(this.newUpdatesAfterReloadToHandle[peerID] !== undefined) {
        for(const i in this.newUpdatesAfterReloadToHandle[peerID]) {
          const update = this.newUpdatesAfterReloadToHandle[peerID][i];
          this.handleUpdate(update);
        }

        delete this.newUpdatesAfterReloadToHandle[peerID];
      }
    });

    if(hasUpdated) {
      $rootScope.$broadcast('dialogs_multiupdate', updatedDialogs);
    }
  }

  public saveConversation(dialog: Dialog) {
    const peerID = appPeersManager.getPeerID(dialog.peer);
    if(!peerID) {
      return false;
    }
    const channelID = appPeersManager.isChannel(peerID) ? -peerID : 0;
    const peerText = appPeersManager.getPeerSearchText(peerID);
    searchIndexManager.indexObject(peerID, peerText, this.dialogsIndex);

    let mid: number, message;
    if(dialog.top_message) {
      mid = appMessagesIDsManager.getFullMessageID(dialog.top_message, channelID);
      message = this.getMessage(mid);
    } else {
      mid = this.tempID--;
      message = {
        _: 'message',
        id: mid,
        mid: mid,
        from_id: appUsersManager.getSelf().id,
        to_id: appPeersManager.getOutputPeer(peerID),
        deleted: true,
        flags: 0,
        pFlags: {unread: false, out: true},
        date: 0,
        message: ''
      };
      this.saveMessages([message]);
    }

    if(!channelID && peerID < 0) {
      const chat = appChatsManager.getChat(-peerID);
      if(chat && chat.migrated_to && chat.pFlags.deactivated) {
        const migratedToPeer = appPeersManager.getPeerID(chat.migrated_to);
        this.migratedFromTo[peerID] = migratedToPeer;
        this.migratedToFrom[migratedToPeer] = peerID;
        return;
      }
    }

    dialog.top_message = mid;
    dialog.read_inbox_max_id = appMessagesIDsManager.getFullMessageID(dialog.read_inbox_max_id, channelID);
    dialog.read_outbox_max_id = appMessagesIDsManager.getFullMessageID(dialog.read_outbox_max_id, channelID);

    if(!dialog.hasOwnProperty('folder_id')) dialog.folder_id = 0;
    dialog.peerID = peerID;

    this.dialogsStorage.generateIndexForDialog(dialog);
    this.dialogsStorage.pushDialog(dialog, message.date);

    // Because we saved message without dialog present
    if(message.mid > 0) {
      if(message.mid > dialog[message.pFlags.out ? 'read_outbox_max_id' : 'read_inbox_max_id']) message.pFlags.unread = true;
      else message.pFlags.unread = false;
    }

    if(this.historiesStorage[peerID] === undefined/*  && !message.deleted */) { // warning
      const historyStorage: HistoryStorage = {count: null, history: [], pending: []};
      historyStorage[mid > 0 ? 'history' : 'pending'].push(mid);
      if(mid < 0 && message.pFlags.unread) {
        dialog.unread_count++;
      }
      this.historiesStorage[peerID] = historyStorage;
      if(this.mergeReplyKeyboard(historyStorage, message)) {
        $rootScope.$broadcast('history_reply_markup', {peerID: peerID});
      }
    }

    if(channelID && dialog.pts) {
      apiUpdatesManager.addChannelState(channelID, dialog.pts);
    }

    //if(this.filtersStorage.inited) {
      //this.filtersStorage.processDialog(dialog);
    //}
  }

  public mergeReplyKeyboard(historyStorage: HistoryStorage, message: any) {
    // this.log('merge', message.mid, message.reply_markup, historyStorage.reply_markup)
    if(!message.reply_markup &&
      !message.pFlags.out &&
      !message.action) {
      return false;
    }
    if(message.reply_markup &&
      message.reply_markup._ == 'replyInlineMarkup') {
      return false;
    }
    var messageReplyMarkup = message.reply_markup;
    var lastReplyMarkup = historyStorage.reply_markup;
    if(messageReplyMarkup) {
      if(lastReplyMarkup && lastReplyMarkup.mid >= message.mid) {
        return false;
      }

      if(messageReplyMarkup.pFlags.selective &&
        !(message.flags & 16)) {
        return false;
      }

      if(historyStorage.maxOutID &&
        message.mid < historyStorage.maxOutID &&
        messageReplyMarkup.pFlags.single_use) {
        messageReplyMarkup.pFlags.hidden = true;
      }
      messageReplyMarkup = Object.assign({
        mid: message.mid
      }, messageReplyMarkup);
      if(messageReplyMarkup._ != 'replyKeyboardHide') {
        messageReplyMarkup.fromID = message.from_id;
      }
      historyStorage.reply_markup = messageReplyMarkup;
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    if(message.pFlags.out) {
      if(lastReplyMarkup) {
        if(lastReplyMarkup.pFlags.single_use &&
          !lastReplyMarkup.pFlags.hidden &&
          (message.mid > lastReplyMarkup.mid || message.mid < 0) &&
          message.message) {
          lastReplyMarkup.pFlags.hidden = true;
          // this.log('set', historyStorage.reply_markup)
          return true;
        }
      } else if(!historyStorage.maxOutID ||
        message.mid > historyStorage.maxOutID) {
        historyStorage.maxOutID = message.mid;
      }
    }

    if(message.action &&
      message.action._ == 'messageActionChatDeleteUser' &&
      (lastReplyMarkup
        ? message.action.user_id == lastReplyMarkup.fromID
        : appUsersManager.isBot(message.action.user_id)
      )
    ) {
      historyStorage.reply_markup = {
        _: 'replyKeyboardHide',
        mid: message.mid,
        flags: 0,
        pFlags: {}
      };
      // this.log('set', historyStorage.reply_markup)
      return true;
    }

    return false;
  }

  public getSearch(peerID = 0, query: string = '', inputFilter: {
    _?: string
  } = {_: 'inputMessagesFilterEmpty'}, maxID: number, limit: number, offsetRate = 0, backLimit = 0): Promise<{
    count: number,
    next_rate: number,
    history: number[]
  }> {
    //peerID = peerID ? parseInt(peerID) : 0;
    var foundMsgs: number[] = [];
    var useSearchCache = !query;
    var newSearchFilter = {peer: peerID, filter: inputFilter};
    var sameSearchCache = useSearchCache && deepEqual(this.lastSearchFilter, newSearchFilter);

    if(useSearchCache && !sameSearchCache) {
      // this.log.warn(dT(), 'new search filter', lastSearchFilter, newSearchFilter)
      this.lastSearchFilter = newSearchFilter;
      this.lastSearchResults = [];
    }

    //this.log(dT(), 'search', useSearchCache, sameSearchCache, this.lastSearchResults, maxID);

    if(peerID && !maxID && !query) {
      var historyStorage = this.historiesStorage[peerID];

      if(historyStorage !== undefined && historyStorage.history.length) {
        var neededContents: {
          [type: string]: boolean
        } = {},
          neededDocType: string | boolean;
        var neededLimit = limit || 20;
        var message;

        switch(inputFilter._) {
          case 'inputMessagesFilterPhotos':
            neededContents['messageMediaPhoto'] = true;
            break;

          case 'inputMessagesFilterPhotoVideo':
            neededContents['messageMediaPhoto'] = true;
            neededContents['messageMediaDocument'] = true;
            neededDocType = 'video';
            break;

          case 'inputMessagesFilterVideo':
            neededContents['messageMediaDocument'] = true;
            neededDocType = 'video';
            break;

          case 'inputMessagesFilterDocument':
            neededContents['messageMediaDocument'] = true;
            neededDocType = false;
            break;

          case 'inputMessagesFilterVoice':
            neededContents['messageMediaDocument'] = true;
            neededDocType = 'voice';
            break;

          case 'inputMessagesFilterRoundVideo':
            neededContents['messageMediaDocument'] = true;
            neededDocType = 'round';
            break;

          case 'inputMessagesFilterMusic':
            neededContents['messageMediaDocument'] = true;
            neededDocType = 'audio';
            break;

          case 'inputMessagesFilterUrl':
            neededContents['url'] = true;
            break;

          case 'inputMessagesFilterMyMentions':
            neededContents['mentioned'] = true;
            break;

          default:
            return Promise.resolve({
              count: 0,
              next_rate: 0,
              history: [] as number[]
            });
        }

        for(let i = 0; i < historyStorage.history.length; i++) {
          message = this.messagesStorage[historyStorage.history[i]];
          if(message.media && neededContents[message.media._]) {
            if(neededDocType !== undefined &&
                message.media._ == 'messageMediaDocument' &&
                message.media.document.type != neededDocType) {
              continue;
            }

            foundMsgs.push(message.mid);
            if(foundMsgs.length >= neededLimit) {
              break;
            }
          }
        }
      }

      // this.log.warn(dT(), 'before append', foundMsgs)
      if(foundMsgs.length < neededLimit && this.lastSearchResults.length && sameSearchCache) {
        var minID = foundMsgs.length ? foundMsgs[foundMsgs.length - 1] : false;
        for(let i = 0; i < this.lastSearchResults.length; i++) {
          if(minID === false || this.lastSearchResults[i] < minID) {
            foundMsgs.push(this.lastSearchResults[i]);
            if(foundMsgs.length >= neededLimit) {
              break;
            }
          }
        }
      }
      // this.log.warn(dT(), 'after append', foundMsgs)
    }

    if(foundMsgs.length || limit == 1000) {
      if(useSearchCache) {
        this.lastSearchResults = listMergeSorted(this.lastSearchResults, foundMsgs)
      }

      return Promise.resolve({
        count: 0,
        next_rate: 0,
        history: foundMsgs
      });
    }

    let apiPromise: Promise<any>;
    if(peerID || !query) {
      apiPromise = apiManager.invokeApi('messages.search', {
        flags: 0,
        peer: appPeersManager.getInputPeerByID(peerID),
        q: query || '',
        filter: inputFilter || {_: 'inputMessagesFilterEmpty'},
        min_date: 0,
        max_date: 0,
        limit: limit,
        offset_id: appMessagesIDsManager.getMessageLocalID(maxID) || 0,
        add_offset: backLimit ? -backLimit : 0,
        max_id: 0,
        min_id: 0
      }, {
        timeout: APITIMEOUT,
        noErrorBox: true
      });
    } else {
      var offsetDate = 0;
      var offsetPeerID = 0;
      var offsetID = 0;
      var offsetMessage = maxID && this.getMessage(maxID);

      if(offsetMessage && offsetMessage.date) {
        offsetDate = offsetMessage.date + ServerTimeManager.serverTimeOffset;
        offsetID = offsetMessage.id;
        offsetPeerID = this.getMessagePeer(offsetMessage);
      }

      apiPromise = apiManager.invokeApi('messages.searchGlobal', {
        q: query,
        offset_rate: offsetRate,
        offset_peer: appPeersManager.getInputPeerByID(offsetPeerID),
        offset_id: appMessagesIDsManager.getMessageLocalID(offsetID),
        limit: limit || 20
      }, {
        timeout: APITIMEOUT,
        noErrorBox: true
      });
    }

    return apiPromise.then((searchResult: any) => {
      appUsersManager.saveApiUsers(searchResult.users);
      appChatsManager.saveApiChats(searchResult.chats);
      this.saveMessages(searchResult.messages);

      ///////////this.log('messages.search result:', searchResult);

      var foundCount: number = searchResult.count || searchResult.messages.length;

      foundMsgs = [];
      searchResult.messages.forEach((message: any) => {
        var peerID = this.getMessagePeer(message);
        if(peerID < 0) {
          var chat = appChatsManager.getChat(-peerID);
          if(chat.migrated_to) {
            this.migrateChecks(peerID, -chat.migrated_to.channel_id);
          }
        }
        foundMsgs.push(message.mid);
      });

      if(useSearchCache &&
          (!maxID || sameSearchCache && this.lastSearchResults.indexOf(maxID) >= 0)) {
        this.lastSearchResults = listMergeSorted(this.lastSearchResults, foundMsgs);
      }
      // this.log(dT(), 'after API', foundMsgs, lastSearchResults)

      return {
        count: foundCount,
        next_rate: searchResult.next_rate,
        history: foundMsgs
      };
    }, (error) => {
      if(error.code == 400) {
        error.handled = true;
      }

      return Promise.reject(error);
    });
  }

  handleNewMessages = () => {
    clearTimeout(this.newMessagesHandlePromise);
    this.newMessagesHandlePromise = 0;

    $rootScope.$broadcast('history_multiappend', this.newMessagesToHandle);
    this.newMessagesToHandle = {};
  };

  handleNewDialogs = () => {
    clearTimeout(this.newDialogsHandlePromise);
    this.newDialogsHandlePromise = 0;
    
    let newMaxSeenID = 0;
    for(const peerID in this.newDialogsToHandle) {
      const dialog = this.newDialogsToHandle[peerID];
      if('reload' in dialog) {
        this.reloadConversation(+peerID);
        delete this.newDialogsToHandle[peerID];
      } else {
        this.dialogsStorage.pushDialog(dialog);
        if(!appPeersManager.isChannel(+peerID)) {
          newMaxSeenID = Math.max(newMaxSeenID, dialog.top_message || 0);
        }
      }
    }

    //this.log('after order:', this.dialogsStorage[0].map(d => d.peerID));

    if(newMaxSeenID != 0) {
      this.incrementMaxSeenID(newMaxSeenID);
    }

    $rootScope.$broadcast('dialogs_multiupdate', this.newDialogsToHandle);
    this.newDialogsToHandle = {};
  };

  public scheduleHandleNewDialogs() {
    if(!this.newDialogsHandlePromise) {
      this.newDialogsHandlePromise = window.setTimeout(this.handleNewDialogs, 0);
    }
  }

  public deleteMessages(messageIDs: number[], revoke: boolean) {
    const splitted = appMessagesIDsManager.splitMessageIDsByChannels(messageIDs);
    const promises: Promise<any>[] = [];
    for(const channelIDStr in splitted.msgIDs) {
      const channelID = +channelIDStr;
      let msgIDs = splitted.msgIDs[channelID];

      let promise: Promise<any>;
      if(channelID > 0) {
        const channel = appChatsManager.getChat(channelID);
        if(!channel.pFlags.creator && !(channel.pFlags.editor && channel.pFlags.megagroup)) {
          const goodMsgIDs: number[] = [];
          if (channel.pFlags.editor || channel.pFlags.megagroup) {
            msgIDs.forEach((msgID, i) => {
              const message = this.getMessage(splitted.mids[channelID][i]);
              if(message.pFlags.out) {
                goodMsgIDs.push(msgID);
              }
            });
          }

          if(!goodMsgIDs.length) {
            return;
          }

          msgIDs = goodMsgIDs;
        }

        promise = apiManager.invokeApi('channels.deleteMessages', {
          channel: appChatsManager.getChannelInput(channelID),
          id: msgIDs
        }).then((affectedMessages) => {
          apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updateDeleteChannelMessages',
              channel_id: channelID,
              messages: msgIDs,
              pts: affectedMessages.pts,
              pts_count: affectedMessages.pts_count
            }
          });
        });
      } else {
        let flags = 0;
        if(revoke) {
          flags |= 1;
        }

        promise = apiManager.invokeApi('messages.deleteMessages', {
          flags: flags,
          id: msgIDs
        }).then((affectedMessages) => {
          apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updateDeleteMessages',
              messages: msgIDs,
              pts: affectedMessages.pts,
              pts_count: affectedMessages.pts_count
            }
          });
        });
      }

      promises.push(promise);
    }

    return Promise.all(promises);
  }

  public readHistory(peerID: number, maxID = 0, readLength = 0): Promise<boolean> {
    // console.trace('start read')
    const isChannel = appPeersManager.isChannel(peerID);
    const historyStorage = this.historiesStorage[peerID];
    const foundDialog = this.getDialogByPeerID(peerID)[0];

    if(!foundDialog || !foundDialog.unread_count) {
      if(!historyStorage || !historyStorage.history.length) {
        return Promise.resolve(false);
      }

      let foundUnread = !!historyStorage.history.find(messageID => {
        const message = this.messagesStorage[messageID];
        return message && !message.pFlags.out && message.pFlags.unread;
      });

      if(!foundUnread) {
        return Promise.resolve(false);
      }
    }

    if(historyStorage.readPromise) {
      return historyStorage.readPromise;
    }

    let apiPromise: any;
    if(isChannel) {
      apiPromise = apiManager.invokeApi('channels.readHistory', {
        channel: appChatsManager.getChannelInput(-peerID),
        max_id: maxID
      });
    } else {
      apiPromise = apiManager.invokeApi('messages.readHistory', {
        peer: appPeersManager.getInputPeerByID(peerID),
        max_id: maxID
      }).then((affectedMessages: any) => {
        apiUpdatesManager.processUpdateMessage({
          _: 'updateShort',
          update: {
            _: 'updatePts',
            pts: affectedMessages.pts,
            pts_count: affectedMessages.pts_count
          }
        });
      });
    }

    historyStorage.readPromise = apiPromise.then(() => {
      let index = -1;
      if(maxID != 0 && historyStorage.history.length) {
        index = historyStorage.history.indexOf(maxID);
      }

      let readedLength = 1;

      if(historyStorage.history.length && maxID) {
        for(let i = index == -1 ? 0 : index, length = historyStorage.history.length; i < length; i++) {
          const messageID = historyStorage.history[i];

          if(messageID > maxID) continue;

          const message = this.messagesStorage[messageID];
          if(message && !message.pFlags.out) {
            message.pFlags.unread = false;
            readedLength++;
            //NotificationsManager.cancel('msg' + messageID); // warning
          }
        }
      }

      if(foundDialog) {
        // this.log('done read history', peerID)

        if(historyStorage.history.length) {
          ////////this.log.warn('readPromise:', index, historyStorage.history[index != -1 ? index : 0]);
          foundDialog.read_inbox_max_id = maxID;
        }

        if(foundDialog.read_inbox_max_id == foundDialog.top_message || foundDialog.read_inbox_max_id == foundDialog.read_outbox_max_id) {
          foundDialog.unread_count = 0;
        } else {
          foundDialog.unread_count = Math.max(foundDialog.unread_count - (readLength || readedLength), 0);
        }

        
        this.log('readHistory set unread_count to:', foundDialog.unread_count, foundDialog);
        $rootScope.$broadcast('dialog_unread', {peerID: peerID, count: foundDialog.unread_count});
        $rootScope.$broadcast('messages_read');

        return true;
      }

      return false;
    }).finally(() => {
      delete historyStorage.readPromise;
    });

    // NotificationsManager.soundReset(appPeersManager.getPeerString(peerID)) // warning

    return historyStorage.readPromise;
  }

  public readMessages(messageIDs: number[]) {
    var splitted = appMessagesIDsManager.splitMessageIDsByChannels(messageIDs);
    Object.keys(splitted.msgIDs).forEach((channelID: number | string) => {
      channelID = +channelID;
      let msgIDs = splitted.msgIDs[channelID];

      if(channelID > 0) {
        apiManager.invokeApi('channels.readMessageContents', {
          channel: appChatsManager.getChannelInput(channelID),
          id: msgIDs
        }).then(() => {
          apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updateChannelReadMessagesContents',
              channel_id: channelID,
              messages: msgIDs
            }
          });
        });
      } else {
        apiManager.invokeApi('messages.readMessageContents', {
          id: msgIDs
        }).then((affectedMessages: any) => {
          apiUpdatesManager.processUpdateMessage({
            _: 'updateShort',
            update: {
              _: 'updateReadMessagesContents',
              messages: msgIDs,
              pts: affectedMessages.pts,
              pts_count: affectedMessages.pts_count
            }
          });
        });
      }
    });
  }

  public handleUpdate(update: any) {
    this.log('AMM: handleUpdate:', update._);
    switch(update._) {
      case 'updateMessageID': {
        var randomID = update.random_id;
        var pendingData = this.pendingByRandomID[randomID];
        //this.log('AMM updateMessageID:', update, pendingData);
        if(pendingData) {
          var peerID: number = pendingData[0];
          var tempID = pendingData[1];
          var channelID = appPeersManager.isChannel(peerID) ? -peerID : 0;
          var mid = appMessagesIDsManager.getFullMessageID(update.id, channelID);
          var message = this.messagesStorage[mid];
          if(message) {
            var historyStorage = this.historiesStorage[peerID];
            var pos = historyStorage.pending.indexOf(tempID);
            if(pos != -1) {
              historyStorage.pending.splice(pos, 1);
            }
            delete this.messagesStorage[tempID];

            this.finalizePendingMessageCallbacks(tempID, mid);
          } else {
            this.pendingByMessageID[mid] = randomID;
          }
        }
        break;
      }

      case 'updateNewMessage':
      case 'updateNewChannelMessage': {
        var message = update.message;
        var peerID = this.getMessagePeer(message);
        var historyStorage = this.historiesStorage[peerID];
        var foundDialog = this.getDialogByPeerID(peerID);

        if(!foundDialog.length) {
          this.newDialogsToHandle[peerID] = {reload: true}
          this.scheduleHandleNewDialogs();
          if(this.newUpdatesAfterReloadToHandle[peerID] === undefined) {
            this.newUpdatesAfterReloadToHandle[peerID] = [];
          }
          this.newUpdatesAfterReloadToHandle[peerID].push(update);
          break;
        }

        if(update._ == 'updateNewChannelMessage') {
          var chat = appChatsManager.getChat(-peerID);
          if(chat.pFlags && (chat.pFlags.left || chat.pFlags.kicked)) {
            break;
          }
        }

        this.saveMessages([message], {isNew: true});
        // this.log.warn(dT(), 'message unread', message.mid, message.pFlags.unread)

        if(historyStorage === undefined) {
          historyStorage = this.historiesStorage[peerID] = {
            count: null,
            history: [],
            pending: []
          };
        }

        var history = message.mid > 0 ? historyStorage.history : historyStorage.pending;
        if(history.indexOf(message.mid) != -1) {
          return false;
        }
        var topMsgID = history[0];
        history.unshift(message.mid);
        if(message.mid > 0 && message.mid < topMsgID) {
          history.sort((a: any, b: any) => {
            return b - a;
          });
        }

        if(message.mid > 0 &&
            historyStorage.count !== null) {
          historyStorage.count++;
        }

        if(this.mergeReplyKeyboard(historyStorage, message)) {
          $rootScope.$broadcast('history_reply_markup', {peerID: peerID});
        }

        if(!message.pFlags.out && message.from_id) {
          appUsersManager.forceUserOnline(message.from_id);
        }

        var randomID = this.pendingByMessageID[message.mid],
          pendingMessage;

        if(randomID) {
          if(pendingMessage = this.finalizePendingMessage(randomID, message)) {
            $rootScope.$broadcast('history_update', {peerID: peerID, mid: message.mid});
          }

          delete this.pendingByMessageID[message.mid];
        }

        if(!pendingMessage) {
          if(this.newMessagesToHandle[peerID] === undefined) {
            this.newMessagesToHandle[peerID] = [];
          }

          this.newMessagesToHandle[peerID].push(message.mid);
          if(!this.newMessagesHandlePromise) {
            this.newMessagesHandlePromise = window.setTimeout(this.handleNewMessages, 0);
          }
        }

        var inboxUnread = !message.pFlags.out && message.pFlags.unread;
        var dialog = foundDialog[0];
        dialog.top_message = message.mid;
        if(inboxUnread) {
          dialog.unread_count++;
        }
        if(!dialog.pFlags.pinned || !dialog.index) {
          dialog.index = this.dialogsStorage.generateDialogIndex(message.date);
        }

        this.newDialogsToHandle[peerID] = dialog;
        this.scheduleHandleNewDialogs();

        break;
      }

      case 'updateDialogUnreadMark': {
        this.log('updateDialogUnreadMark', update);
        let peerID = appPeersManager.getPeerID(update.peer.peer);
        let foundDialog = this.getDialogByPeerID(peerID);

        if(!foundDialog.length) {
          this.newDialogsToHandle[peerID] = {reload: true};
          this.scheduleHandleNewDialogs();
        } else {
          let dialog = foundDialog[0];

          if(!update.pFlags.unread) {
            delete dialog.pFlags.unread_mark;
          } else {
            dialog.pFlags.unread_mark = true;
          }

          $rootScope.$broadcast('dialogs_multiupdate', {peerID: dialog});
        }

        break;
      }

      case 'updateFolderPeers': { // only 0 and 1 folders
        this.log('updateFolderPeers', update);
        const peers = update.folder_peers;

        this.scheduleHandleNewDialogs();
        peers.forEach((folderPeer: any) => {
          const {folder_id, peer} = folderPeer;

          const peerID = appPeersManager.getPeerID(peer);
          const dropped = this.dialogsStorage.dropDialog(peerID);
          if(!dropped.length) {
            this.newDialogsToHandle[peerID] = {reload: true};
          } else {
            const dialog = dropped[0];
            this.newDialogsToHandle[peerID] = dialog;

            if(dialog.pFlags?.pinned) {
              delete dialog.pFlags.pinned;
              this.dialogsStorage.pinnedOrders[folder_id].findAndSplice(p => p == dialog.peerID);
            }

            dialog.folder_id = folder_id;

            this.dialogsStorage.generateIndexForDialog(dialog);
            this.dialogsStorage.pushDialog(dialog); // need for simultaneously updatePinnedDialogs
          }
        });
        break;
      }

      case 'updateDialogPinned': {
        const folderID = update.folder_id ?? 0;
        this.log('updateDialogPinned', update);
        const peerID = appPeersManager.getPeerID(update.peer.peer);
        const foundDialog = this.getDialogByPeerID(peerID);

        // этот код внизу никогда не сработает, в папках за пиннед отвечает updateDialogFilter
        /* if(update.folder_id > 1) {
          const filter = this.filtersStorage.filters[update.folder_id];
          if(update.pFlags.pinned) {
            filter.pinned_peers.unshift(peerID);
          } else {
            filter.pinned_peers.findAndSplice(p => p == peerID);
          }
        } */

        this.scheduleHandleNewDialogs();
        if(!foundDialog.length) {
          this.newDialogsToHandle[peerID] = {reload: true};
        } else {
          const dialog = foundDialog[0];
          this.newDialogsToHandle[peerID] = dialog;

          if(!update.pFlags.pinned) {
            delete dialog.pFlags.pinned;
            this.dialogsStorage.pinnedOrders[folderID].findAndSplice(p => p == dialog.peerID);
          } else { // means set
            dialog.pFlags.pinned = true;
          }

          this.dialogsStorage.generateIndexForDialog(dialog);
        } 

        break;
      }

      case 'updatePinnedDialogs': {
        const folderID = update.folder_id ?? 0;

        this.log('updatePinnedDialogs', update);
        const newPinned: {[peerID: number]: true} = {};
        if(!update.order) {
          apiManager.invokeApi('messages.getPinnedDialogs', {
            folder_id: folderID
          }).then((dialogsResult: any) => {
            dialogsResult.dialogs.reverse();
            this.applyConversations(dialogsResult);

            dialogsResult.dialogs.forEach((dialog: any) => {
              newPinned[dialog.peerID] = true;
            });

            this.dialogsStorage.getFolder(folderID).forEach((dialog: any) => {
              const peerID = dialog.peerID;
              if(dialog.pFlags.pinned && !newPinned[peerID]) {
                this.newDialogsToHandle[peerID] = {reload: true};
                this.scheduleHandleNewDialogs();
              }
            });
          });

          break;
        }

        //this.log('before order:', this.dialogsStorage[0].map(d => d.peerID));

        this.dialogsStorage.pinnedOrders[folderID].length = 0;
        let willHandle = false;
        update.order.reverse(); // index must be higher
        update.order.forEach((peer: any) => {
          const peerID = appPeersManager.getPeerID(peer.peer);
          newPinned[peerID] = true;

          const foundDialog = this.getDialogByPeerID(peerID);
          if(!foundDialog.length) {
            this.newDialogsToHandle[peerID] = {reload: true};
            willHandle = true;
            return;
          }

          const dialog = foundDialog[0];
          dialog.pFlags.pinned = true;
          this.dialogsStorage.generateIndexForDialog(dialog);

          this.newDialogsToHandle[peerID] = dialog;
          willHandle = true;
        });
        
        this.dialogsStorage.getFolder(folderID).forEach(dialog => {
          const peerID = dialog.peerID;
          if(dialog.pFlags.pinned && !newPinned[peerID]) {
            this.newDialogsToHandle[peerID] = {reload: true};
            willHandle = true;
          }
        });

        if(willHandle) {
          this.scheduleHandleNewDialogs();
        }

        break;
      }   

      case 'updateEditMessage':
      case 'updateEditChannelMessage': {
        var message = update.message;
        var peerID = this.getMessagePeer(message);
        var channelID = message.to_id._ == 'peerChannel' ? -peerID : 0;
        var mid = appMessagesIDsManager.getFullMessageID(message.id, channelID);
        if(this.messagesStorage[mid] === undefined) {
          break;
        }

        // console.trace(dT(), 'edit message', message)
        this.saveMessages([message], {isEdited: true});
        safeReplaceObject(this.messagesStorage[mid], message);

        var dialog = this.getDialogByPeerID(peerID)[0];
        var isTopMessage = dialog && dialog.top_message == mid;
        if(message.clear_history) { // that's will never happen
          if(isTopMessage) {
            $rootScope.$broadcast('dialog_flush', {peerID: peerID});
          }
        } else {
          $rootScope.$broadcast('message_edit', {
            peerID: peerID,
            id: message.id,
            mid: mid,
            justMedia: false
          });

          if(isTopMessage) {
            var updatedDialogs: any = {};
            updatedDialogs[peerID] = dialog;
            $rootScope.$broadcast('dialogs_multiupdate', updatedDialogs);
          }
        }
        break;
      }

      case 'updateReadHistoryInbox':
      case 'updateReadHistoryOutbox':
      case 'updateReadChannelInbox':
      case 'updateReadChannelOutbox': {
        var isOut = update._ == 'updateReadHistoryOutbox' || update._ == 'updateReadChannelOutbox';
        var channelID: number = update.channel_id;
        var maxID = appMessagesIDsManager.getFullMessageID(update.max_id, channelID);
        var peerID = channelID ? -channelID : appPeersManager.getPeerID(update.peer);
        var foundDialog = this.getDialogByPeerID(peerID);
        var history = (this.historiesStorage[peerID] || {}).history || [];
        var newUnreadCount = 0;
        var length = history.length;
        var foundAffected = false;
        var messageID: number, message;
        var i;

        //this.log.warn(dT(), 'read', peerID, isOut ? 'out' : 'in', maxID)

        if(peerID > 0 && isOut) {
          appUsersManager.forceUserOnline(peerID);
        }

        for(i = 0; i < length; i++) {
          messageID = history[i];
          if(messageID > maxID) {
            continue;
          }
          
          message = this.messagesStorage[messageID];
          if(!message) {
            continue;
          }

          if(message.pFlags.out != isOut) {
            continue;
          }
          if(!message.pFlags.unread) {
            break;
          }
          // this.log.warn('read', messageID, message.pFlags.unread, message)
          if(message && message.pFlags.unread) {
            message.pFlags.unread = false
            if(!foundAffected) {
              foundAffected = true;
            }

            if(!message.pFlags.out) {
              if(foundDialog[0]) {
                newUnreadCount = --foundDialog[0].unread_count;
              }
              //NotificationsManager.cancel('msg' + messageID); // warning
            }
          }
        }
        if(foundDialog[0]) {
          if(!isOut && newUnreadCount && foundDialog[0].top_message <= maxID) {
            newUnreadCount = foundDialog[0].unread_count = 0;
          }

          foundDialog[0][isOut ? 'read_outbox_max_id' : 'read_inbox_max_id'] = maxID;
        }

        // need be commented for read out messages
        //if(newUnreadCount != 0 || !isOut) { // fix 16.11.2019 (maybe not)
          //////////this.log.warn(dT(), 'cnt', peerID, newUnreadCount, isOut, foundDialog, update, foundAffected);
          $rootScope.$broadcast('dialog_unread', {peerID: peerID, count: newUnreadCount});
        //}

        if(foundAffected) {
          $rootScope.$broadcast('messages_read');
        }
        break;
      }

      case 'updateChannelReadMessagesContents': {
        var channelID: number = update.channel_id;
        var newMessages: any[] = [];
        update.messages.forEach((msgID: number) => {
          newMessages.push(appMessagesIDsManager.getFullMessageID(msgID, channelID));
        });
        update.messages = newMessages;
      }

      case 'updateReadMessagesContents': {
        var messages: any[] = update.messages;
        var len = messages.length;
        var i;
        var messageID: number, message;
        for(i = 0; i < len; i++) {
          messageID = messages[i];
          if(message = this.messagesStorage[messageID]) {
            delete message.pFlags.media_unread;
          }
        }
        break;
      }

      case 'updateChannelAvailableMessages': {
        var channelID: number = update.channel_id;
        var messages: any[] = [];
        var peerID: number = -channelID;
        var history = (this.historiesStorage[peerID] || {}).history || [];
        if(history.length) {
          history.forEach((msgID: number) => {
            if(!update.available_min_id ||
                appMessagesIDsManager.getMessageLocalID(msgID) <= update.available_min_id) {
              messages.push(msgID);
            }
          });
        }
        update.messages = messages;
      }

      case 'updateDeleteMessages':
      case 'updateDeleteChannelMessages': {
        let historiesUpdated: {[peerID: number]: {count: number, unread: number, msgs: {[mid: number]: true}}} = {};
        let channelID: number = update.channel_id;

        for(let i = 0; i < update.messages.length; i++) {
          let messageID = appMessagesIDsManager.getFullMessageID(update.messages[i], channelID);
          let message = this.messagesStorage[messageID];
          if(message) {
            let peerID = this.getMessagePeer(message);
            let history = historiesUpdated[peerID] || (historiesUpdated[peerID] = {count: 0, unread: 0, msgs: {}});

            if(!message.pFlags.out && message.pFlags.unread) {
              history.unread++;
            }
            history.count++;
            history.msgs[messageID] = true;

            message.deleted = true
            this.messagesStorage[messageID] = {
              deleted: true,
              id: messageID,
              from_id: message.from_id,
              to_id: message.to_id,
              flags: message.flags,
              pFlags: message.pFlags,
              date: message.date
            };

            let peerMessagesToHandle = this.newMessagesToHandle[peerID];
            if(peerMessagesToHandle && peerMessagesToHandle.length) {
              let peerMessagesHandlePos = peerMessagesToHandle.indexOf(messageID);
              if(peerMessagesHandlePos != -1) {
                peerMessagesToHandle.splice(peerMessagesHandlePos);
              }
            }
          }
        }

        Object.keys(historiesUpdated).forEach(peerID => {
          let updatedData = historiesUpdated[+peerID];
          let historyStorage = this.historiesStorage[peerID];
          if(historyStorage !== undefined) {
            let newHistory: number[] = [];
            let newPending: number[] = [];
            for(let i = 0; i < historyStorage.history.length; i++) {
              if(!updatedData.msgs[historyStorage.history[i]]) {
                newHistory.push(historyStorage.history[i]);
              }
            }
            historyStorage.history = newHistory;
            if(updatedData.count &&
              historyStorage.count !== null &&
              historyStorage.count > 0) {
              historyStorage.count -= updatedData.count;
              if(historyStorage.count < 0) {
                historyStorage.count = 0;
              }
            }

            for(let i = 0; i < historyStorage.pending.length; i++) {
              if(!updatedData.msgs[historyStorage.pending[i]]) {
                newPending.push(historyStorage.pending[i]);
              }
            }
            historyStorage.pending = newPending;

            $rootScope.$broadcast('history_delete', {peerID: peerID, msgs: updatedData.msgs});
          }

          let foundDialog = this.getDialogByPeerID(+peerID)[0];
          if(foundDialog) {
            if(updatedData.unread) {
              foundDialog.unread_count -= updatedData.unread;

              $rootScope.$broadcast('dialog_unread', {
                peerID: peerID,
                count: foundDialog.unread_count
              });
            }

            if(updatedData.msgs[foundDialog.top_message]) {
              this.reloadConversation(+peerID);
            }
          }
        });
        break;
      }

      case 'updateChannel': {
        const channelID: number = update.channel_id;
        const peerID = -channelID;
        const channel = appChatsManager.getChat(channelID);

        const needDialog = channel._ == 'channel' && (!channel.pFlags.left && !channel.pFlags.kicked);
        const foundDialog = this.getDialogByPeerID(peerID);
        const hasDialog = foundDialog.length > 0;

        const canViewHistory = channel._ == 'channel' && (channel.username || !channel.pFlags.left && !channel.pFlags.kicked) && true || false;
        const hasHistory = this.historiesStorage[peerID] !== undefined;

        if(canViewHistory != hasHistory) {
          delete this.historiesStorage[peerID];
          $rootScope.$broadcast('history_forbidden', peerID);
        }

        if(hasDialog != needDialog) {
          if(needDialog) {
            this.reloadConversation(-channelID);
          } else {
            if(foundDialog[0]) {
              this.dialogsStorage.dropDialog(peerID);
              //this.dialogsStorage[foundDialog[0].folder_id].splice(foundDialog[1], 1);
              $rootScope.$broadcast('dialog_drop', {peerID: peerID, dialog: foundDialog[0]});
            }
          }
        }

        break;
      }

      case 'updateChannelReload': {
        const channelID: number = update.channel_id;
        const peerID = -channelID;

        this.dialogsStorage.dropDialog(peerID);

        delete this.historiesStorage[peerID];
        this.reloadConversation(-channelID).then(() => {
          $rootScope.$broadcast('history_reload', peerID);
        });

        break;
      }

      case 'updateChannelMessageViews': {
        let views = update.views;
        let mid = appMessagesIDsManager.getFullMessageID(update.id, update.channel_id);
        let message = this.getMessage(mid);
        if(message && message.views && message.views < views) {
          message.views = views;
          $rootScope.$broadcast('message_views', {
            mid: mid,
            views: views
          });
        }
        break;
      }
        
      case 'updateServiceNotification': {
        this.log('updateServiceNotification', update);
        var fromID = 777000;
        var peerID = fromID;
        var messageID = this.tempID--;
        var message: any = {
          _: 'message',
          id: messageID,
          from_id: fromID,
          to_id: appPeersManager.getOutputPeer(peerID),
          flags: 0,
          pFlags: {unread: true},
          date: (update.inbox_date || tsNow(true)) + serverTimeManager.serverTimeOffset,
          message: update.message,
          media: update.media,
          entities: update.entities
        };
        if(!appUsersManager.hasUser(fromID)) {
          appUsersManager.saveApiUsers([{
            _: 'user',
            id: fromID,
            pFlags: {verified: true},
            access_hash: 0,
            first_name: 'Telegram',
            phone: '42777'
          }]);
        }
        this.saveMessages([message]);

        if(update.inbox_date) {
          this.pendingTopMsgs[peerID] = messageID;
          this.handleUpdate({
            _: 'updateNewMessage',
            message: message
          });
        }

        break;
      }

      case 'updateChatPinnedMessage':
      case 'updateUserPinnedMessage': {
        let {id} = update;

        // hz nado li tut appMessagesIDsManager.getFullMessageID(update.max_id, channelID);
        let peerID = update.user_id || -update.chat_id || -update.channel_id;
        this.savePinnedMessage(peerID, id);
        
        break;
      }
    }
  }

  public finalizePendingMessage(randomID: number, finalMessage: any) {
    var pendingData = this.pendingByRandomID[randomID];
    // this.log('pdata', randomID, pendingData)

    if(pendingData) {
      var peerID = pendingData[0];
      var tempID = pendingData[1];
      var historyStorage = this.historiesStorage[peerID],
        message;

      // this.log('pending', randomID, historyStorage.pending)
      var pos = historyStorage.pending.indexOf(tempID);
      if(pos != -1) {
        historyStorage.pending.splice(pos, 1);
      }

      if(message = this.messagesStorage[tempID]) {
        delete message.pending;
        delete message.error;
        delete message.random_id;
        delete message.send;

        $rootScope.$broadcast('messages_pending');
      }

      delete this.messagesStorage[tempID];

      this.finalizePendingMessageCallbacks(tempID, finalMessage.mid);

      return message;
    }

    return false
  }

  public finalizePendingMessageCallbacks(tempID: number, mid: number) {
    var callbacks = this.tempFinalizeCallbacks[tempID];
    this.log.warn(dT(), callbacks, tempID);
    if(callbacks !== undefined) {
      callbacks.forEach((callback: any) => {
        callback(mid);
      });
      delete this.tempFinalizeCallbacks[tempID];
    }

    $rootScope.$broadcast('message_sent', {tempID, mid});
  }

  public incrementMaxSeenID(maxID: number) {
    if(!maxID || !(!this.maxSeenID || maxID > this.maxSeenID)) {
      return false;
    }

    AppStorage.set({
      max_seen_msg: maxID
    });

    apiManager.invokeApi('messages.receivedMessages', {
      max_id: maxID
    });
  }

  public getHistory(peerID: number, maxID = 0, limit: number, backLimit?: number) {
    if(this.migratedFromTo[peerID]) {
      peerID = this.migratedFromTo[peerID];
    }

    const historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {count: null, history: [], pending: []});
    const unreadOffset = 0;
    const unreadSkip = false;

    let offset = 0;
    let offsetNotFound = false;

    let isMigrated = false;
    let reqPeerID = peerID;
    if(this.migratedToFrom[peerID]) {
      isMigrated = true;
      if(maxID && maxID < appMessagesIDsManager.fullMsgIDModulus) {
        reqPeerID = this.migratedToFrom[peerID];
      }
    }

    if(maxID > 0) {
      offsetNotFound = true;
      for(; offset < historyStorage.history.length; offset++) {
        if(maxID > historyStorage.history[offset]) {
          offsetNotFound = false;
          break;
        }
      }
    }

    if(!offsetNotFound && (
      historyStorage.count !== null && historyStorage.history.length == historyStorage.count ||
      historyStorage.history.length >= offset + limit
      )) {
      if(backLimit) {
        backLimit = Math.min(offset, backLimit);
        offset = Math.max(0, offset - backLimit);
        limit += backLimit;
      } else {
        limit = limit;
      }

      let history = historyStorage.history.slice(offset, offset + limit);
      if(!maxID && historyStorage.pending.length) {
        history = historyStorage.pending.slice().concat(history);
      }

      return this.wrapHistoryResult({
        count: historyStorage.count,
        history: history,
        unreadOffset: unreadOffset,
        unreadSkip: unreadSkip
      });
    }

    if(offsetNotFound) {
      offset = 0;
    }
    if((backLimit || unreadSkip || maxID) && historyStorage.history.indexOf(maxID) == -1) {
      if(backLimit) {
        offset = -backLimit;
        limit += backLimit;
      }

      return this.requestHistory(reqPeerID, maxID, limit, offset).then((historyResult: any) => {
        historyStorage.count = historyResult.count || historyResult.messages.length;
        if(isMigrated) {
          historyStorage.count++;
        }

        let history: number[] = [];
        historyResult.messages.forEach((message: any) => {
          history.push(message.mid);
        });

        if(!maxID && historyStorage.pending.length) {
          history = historyStorage.pending.slice().concat(history);
        }

        return this.wrapHistoryResult({
          count: historyStorage.count,
          history: history,
          unreadOffset: unreadOffset,
          unreadSkip: unreadSkip
        });
      });
    }

    return this.fillHistoryStorage(peerID, maxID, limit, historyStorage).then(() => {
      offset = 0;
      if(maxID > 0) {
        for(offset = 0; offset < historyStorage.history.length; offset++) {
          if(maxID > historyStorage.history[offset]) {
            break;
          }
        }
      }

      var history = historyStorage.history.slice(offset, offset + limit);
      if(!maxID && historyStorage.pending.length) {
        history = historyStorage.pending.slice().concat(history);
      }

      return this.wrapHistoryResult({
        count: historyStorage.count,
        history: history,
        unreadOffset: unreadOffset,
        unreadSkip: unreadSkip
      });
    });
  }

  public fillHistoryStorage(peerID: number, maxID: number, fullLimit: number, historyStorage: HistoryStorage): Promise<boolean> {
    // this.log('fill history storage', peerID, maxID, fullLimit, angular.copy(historyStorage))
    const offset = (this.migratedFromTo[peerID] && !maxID) ? 1 : 0;
    return this.requestHistory(peerID, maxID, fullLimit, offset).then((historyResult: any) => {
      historyStorage.count = historyResult.count || historyResult.messages.length;

      if(!maxID && historyResult.messages.length) {
        maxID = historyResult.messages[0].mid + 1;
      }

      let offset = 0;
      if(maxID > 0) {
        for(; offset < historyStorage.history.length; offset++) {
          if(maxID > historyStorage.history[offset]) {
            break;
          }
        }
      }

      const wasTotalCount = historyStorage.history.length;

      historyStorage.history.splice(offset, historyStorage.history.length - offset);
      historyResult.messages.forEach((message: any) => {
        if(this.mergeReplyKeyboard(historyStorage, message)) {
          $rootScope.$broadcast('history_reply_markup', {peerID: peerID});
        }

        historyStorage.history.push(message.mid);
      });

      const totalCount = historyStorage.history.length;
      fullLimit -= (totalCount - wasTotalCount);

      const migratedNextPeer = this.migratedFromTo[peerID];
      const migratedPrevPeer = this.migratedToFrom[peerID]
      const isMigrated = migratedNextPeer !== undefined || migratedPrevPeer !== undefined;

      if(isMigrated) {
        historyStorage.count = Math.max(historyStorage.count, totalCount) + 1;
      }

      if(fullLimit > 0) {
        maxID = historyStorage.history[totalCount - 1];
        if(isMigrated) {
          if(!historyResult.messages.length) {
            if(migratedPrevPeer) {
              maxID = 0;
              peerID = migratedPrevPeer;
            } else {
              historyStorage.count = totalCount;
              return true;
            }
          }

          return this.fillHistoryStorage(peerID, maxID, fullLimit, historyStorage);
        } else if(totalCount < historyStorage.count) {
          return this.fillHistoryStorage(peerID, maxID, fullLimit, historyStorage);
        }
      }

      return true;
    });
  }

  public wrapHistoryResult(result: HistoryResult) {
    if(result.unreadOffset) {
      for(let i = result.history.length - 1; i >= 0; i--) {
        const message = this.messagesStorage[result.history[i]];
        if(message && !message.pFlags.out && message.pFlags.unread) {
          result.unreadOffset = i + 1;
          break;
        }
      }
    }
    return result;
  }

  public requestHistory(peerID: number, maxID: number, limit = 0, offset = 0, offsetDate = 0): Promise<any> {
    const isChannel = appPeersManager.isChannel(peerID);

    //console.trace('requestHistory', peerID, maxID, limit, offset);

    $rootScope.$broadcast('history_request');

    return apiManager.invokeApi('messages.getHistory', {
      peer: appPeersManager.getInputPeerByID(peerID),
      offset_id: maxID ? appMessagesIDsManager.getMessageLocalID(maxID) : 0,
      offset_date: offsetDate,
      add_offset: offset,
      limit: limit,
      max_id: 0,
      min_id: 0,
      hash: 0
    }, {
      timeout: APITIMEOUT,
      noErrorBox: true
    }).then((historyResult: any) => {
      this.log('requestHistory result:', historyResult, maxID, limit, offset);

      appUsersManager.saveApiUsers(historyResult.users);
      appChatsManager.saveApiChats(historyResult.chats);
      this.saveMessages(historyResult.messages);

      if(isChannel) {
        apiUpdatesManager.addChannelState(-peerID, historyResult.pts);
      }

      let length = historyResult.messages.length;
      if(length && historyResult.messages[length - 1].deleted) {
        historyResult.messages.splice(length - 1, 1);
        length--;
        historyResult.count--;
      }

      // will load more history if last message is album grouped (because it can be not last item)
      const historyStorage = this.historiesStorage[peerID];
      // historyResult.messages: desc sorted
      if(length && historyResult.messages[length - 1].grouped_id && (historyStorage.history.length + historyResult.messages.length) < historyResult.count) {
        return this.requestHistory(peerID, historyResult.messages[length - 1].mid, 10, 0).then((_historyResult: any) => {
          return historyResult;
        });
      }

      // don't need the intro now
      /* if(peerID < 0 || !appUsersManager.isBot(peerID) || (length == limit && limit < historyResult.count)) {
        return historyResult;
      } */
      return historyResult;

      /* return appProfileManager.getProfile(peerID).then((userFull: any) => {
        var description = userFull.bot_info && userFull.bot_info.description;
        if(description) {
          var messageID = this.tempID--;
          var message = {
            _: 'messageService',
            id: messageID,
            from_id: peerID,
            to_id: appPeersManager.getOutputPeer(peerID),
            flags: 0,
            pFlags: {},
            date: tsNow(true) + serverTimeManager.serverTimeOffset,
            action: {
              _: 'messageActionBotIntro',
              description: description
            }
          }

          this.saveMessages([message]);
          historyResult.messages.push(message);
          if(historyResult.count) {
            historyResult.count++;
          }
        }

        return historyResult;
      }); */
    }, (error) => {
      switch (error.type) {
        case 'CHANNEL_PRIVATE':
          let channel = appChatsManager.getChat(-peerID);
          channel = {_: 'channelForbidden', access_hash: channel.access_hash, title: channel.title};
          apiUpdatesManager.processUpdateMessage({
            _: 'updates',
            updates: [{
              _: 'updateChannel',
              channel_id: -peerID
            }],
            chats: [channel],
            users: []
          });
          break;
      }

      throw error;
    });
  }

  public fetchSingleMessages() {
    if(this.fetchSingleMessagesPromise) {
      return this.fetchSingleMessagesPromise;
    }

    const mids = this.needSingleMessages.slice();
    this.needSingleMessages.length = 0;

    const splitted = appMessagesIDsManager.splitMessageIDsByChannels(mids);
    let promises: Promise<void>[] = [];
    Object.keys(splitted.msgIDs).forEach((channelID: number | string) => {
      channelID = +channelID;

      let msgIDs = splitted.msgIDs[channelID].map((msgID: number) => {
        return {
          _: 'inputMessageID',
          id: msgID
        };
      });

      var promise;
      if(channelID > 0) {
        promise = apiManager.invokeApi('channels.getMessages', {
          channel: appChatsManager.getChannelInput(channelID),
          id: msgIDs
        });
      } else {
        promise = apiManager.invokeApi('messages.getMessages', {
          id: msgIDs
        });
      }

      promises.push(promise.then((getMessagesResult: any) => {
        appUsersManager.saveApiUsers(getMessagesResult.users);
        appChatsManager.saveApiChats(getMessagesResult.chats);
        this.saveMessages(getMessagesResult.messages);

        $rootScope.$broadcast('messages_downloaded', splitted.mids[+channelID]);
      }));
    });

    this.fetchSingleMessagesPromise = Promise.all(promises).finally(() => {
      this.fetchSingleMessagesTimeout = 0;
      this.fetchSingleMessagesPromise = null;
      if(this.needSingleMessages.length) this.fetchSingleMessages();
    });
  }

  public wrapSingleMessage(msgID: number, overwrite = false) {
    if(this.messagesStorage[msgID] && !overwrite) {
      $rootScope.$broadcast('messages_downloaded', [msgID]);
    } else if(this.needSingleMessages.indexOf(msgID) == -1) {
      this.needSingleMessages.push(msgID);
      if(this.fetchSingleMessagesTimeout == 0) {
        this.fetchSingleMessagesTimeout = window.setTimeout(this.fetchSingleMessages.bind(this), 10);
      }
    }
  }

  public setTyping(action: any): Promise<boolean> {
    if(!$rootScope.myID) return Promise.resolve(false);
    
    if(typeof(action) == 'string') {
      action = {_: action};
    }
    
    let input = appPeersManager.getInputPeerByID($rootScope.myID);
    return apiManager.invokeApi('messages.setTyping', {
      peer: input,
      action: action
    }) as Promise<boolean>;
  }
}

const appMessagesManager = new AppMessagesManager();
export default appMessagesManager;
