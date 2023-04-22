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

import type {Chat, ForumTopic as MTForumTopic, DialogPeer, Message, MessageAction, MessageMedia, MessagesForumTopics, MessagesPeerDialogs, Update, Peer} from '../../layer';
import type {Dialog, ForumTopic, MyMessage} from '../appManagers/appMessagesManager';
import tsNow from '../../helpers/tsNow';
import SearchIndex from '../searchIndex';
import {SliceEnd} from '../../helpers/slicedArray';
import {MyDialogFilter} from './filters';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, NULL_PEER_ID, REAL_FOLDERS, REAL_FOLDER_ID} from '../mtproto/mtproto_config';
import {MaybePromise, NoneToVoidFunction} from '../../types';
import ctx from '../../environment/ctx';
import AppStorage from '../storage';
import type DATABASE_STATE from '../../config/databases/state';
import forEachReverse from '../../helpers/array/forEachReverse';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import safeReplaceObject from '../../helpers/object/safeReplaceObject';
import getServerMessageId from '../appManagers/utils/messageId/getServerMessageId';
import {AppManager} from '../appManagers/manager';
import getDialogIndexKey from '../appManagers/utils/dialogs/getDialogIndexKey';
import isObject from '../../helpers/object/isObject';
import getDialogIndex from '../appManagers/utils/dialogs/getDialogIndex';
import getPeerIdsFromMessage from '../appManagers/utils/messages/getPeerIdsFromMessage';
import {AppStoragesManager} from '../appManagers/appStoragesManager';
import defineNotNumerableProperties from '../../helpers/object/defineNotNumerableProperties';
import setDialogIndex from '../appManagers/utils/dialogs/setDialogIndex';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import pause from '../../helpers/schedulers/pause';
import {BroadcastEvents} from '../rootScope';
import assumeType from '../../helpers/assumeType';
import makeError from '../../helpers/makeError';
import callbackify from '../../helpers/callbackify';

export type FolderDialog = {
  dialog: Dialog,
  index: number
};

export type Folder = {
  dialogs: (Dialog | ForumTopic)[],
  id: number,
  unreadMessagesCount: number,
  unreadPeerIds: Set<PeerId>,
  unreadUnmutedPeerIds: Set<PeerId>,
  dispatchUnreadTimeout?: number
};

export const GLOBAL_FOLDER_ID: REAL_FOLDER_ID = undefined;

// let spentTime = 0;
export default class DialogsStorage extends AppManager {
  private storage: AppStoragesManager['storages']['dialogs'];

  private dialogs: {[peerId: PeerId]: Dialog};

  private folders: {[folderId: number]: Folder};

  private allDialogsLoaded: {[folder_id: number]: boolean};
  private dialogsOffsetDate: {[folder_id: number]: number};
  private pinnedOrders: {[folder_id: number]: PeerId[]};
  private dialogsNum: number;

  private dialogsIndex: SearchIndex<PeerId>;

  private cachedResults: {
    query: string,
    count: number,
    dialogs: Dialog[],
    folderId: number
  };

  private forumTopics: Map<PeerId, {
    topics: Map<number, ForumTopic>,
    deletedTopics: Set<number>,
    getTopicPromises: Map<number, CancellablePromise<ForumTopic>>,
    getTopicsPromise?: Promise<any>
  }>;

  protected after() {
    this.clear(true);

    const onFilterUpdate = (filter: MyDialogFilter) => {
      const dialogs = this.getCachedDialogs(false);
      for(let i = 0; i < dialogs.length; ++i) {
        this.processDialogForFilter(dialogs[i], filter);
      }
    };

    this.rootScope.addEventListener('filter_order', () => {
      const dialogs = this.getCachedDialogs(false);
      // const indexKeys: ReturnType<DialogsStorage['getDialogIndexKey']>[] = [];
      for(const filterId in this.folders) {
        if(+filterId > 1) {
          delete this.folders[filterId];
        }

        // indexKeys.push(this.getDialogIndexKey(+filterId));
      }

      for(let i = 0; i < dialogs.length; ++i) {
        const dialog = dialogs[i];
        // for(const indexKey of indexKeys) {
        //   delete dialog[indexKey];
        // }

        this.processDialogForFilters(dialog);
      }
    });

    this.rootScope.addEventListener('filter_update', onFilterUpdate);
    this.rootScope.addEventListener('filter_new', onFilterUpdate);

    this.rootScope.addEventListener('filter_delete', (filter) => {
      const dialogs = this.getCachedDialogs(false);

      const indexKey = this.getDialogIndexKeyByFilterId(filter.id);
      for(let i = 0; i < dialogs.length; ++i) {
        const dialog = dialogs[i];
        delete dialog[indexKey];
      }

      delete this.folders[filter.id];
    });

    this.rootScope.addEventListener('dialog_notify_settings', (dialog) => {
      this.processChangedUnreadOrUnmuted(dialog.peerId);
    });

    this.rootScope.addEventListener('chat_update', (chatId) => {
      const chat = this.appChatsManager.getChat(chatId);

      const peerId = chatId.toPeerId(true);
      if((chat as Chat.chat).pFlags.left && this.getDialogOnly(peerId)) {
        this.dropDialogOnDeletion(peerId);
      }
    });

    this.rootScope.addEventListener('chat_toggle_forum', ({chatId, enabled}) => {
      const peerId = chatId.toPeerId(true);
      if(!enabled) {
        this.flushForumTopicsCache(peerId);
      }

      this.processChangedUnreadOrUnmuted(peerId);
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateFolderPeers: this.onUpdateFolderPeers,

      updateDialogPinned: this.onUpdateDialogPinned,

      updateChannelPinnedTopic: this.onUpdateChannelPinnedTopic,

      updatePinnedDialogs: this.onUpdatePinnedDialogs,

      updateChannelPinnedTopics: this.onUpdateChannelPinnedTopics
    });

    return Promise.all([
      this.appStateManager.getState(),
      this.appStoragesManager.loadStorage('dialogs')
    ]).then(([state, {results: dialogs, storage}]) => {
      this.storage = storage;
      this.dialogs = this.storage.getCache();

      for(const folderId of REAL_FOLDERS) {
        const order = state.pinnedOrders[folderId];
        if(!order) {
          continue;
        }

        const _order = this.getPinnedOrders(folderId);
        _order.splice(0, _order.length, ...order);
      }

      if(dialogs.length) {
        AppStorage.freezeSaving<typeof DATABASE_STATE>(this.setDialogsFromState.bind(this, dialogs), ['chats', 'dialogs', 'messages', 'users']);
      }

      this.allDialogsLoaded = state.allDialogsLoaded || {};

      if(dialogs.length) {
        this.appDraftsManager.addMissedDialogs();
      }
    });
  }

  public indexMyDialog() {
    const peerId = this.appUsersManager.getSelf().id.toPeerId(false);
    const dialog = this.getDialogOnly(peerId);
    if(dialog) {
      const peerText = this.appPeersManager.getPeerSearchText(peerId);
      this.dialogsIndex.indexObject(peerId, peerText);
    }
  }

  private setDialogsFromState(dialogs: Dialog[]) {
    for(let i = 0, length = dialogs.length; i < length; ++i) {
      const dialog = dialogs[i];
      if(!dialog) {
        continue;
      }

      // if(dialog.peerId !== SERVICE_PEER_ID) {
      dialog.top_message = getServerMessageId(dialog.top_message); // * fix outgoing message to avoid copying dialog
      // }

      if(dialog.topMessage) {
        this.appMessagesManager.saveMessages([dialog.topMessage]);
      }

      for(let i = 0; i <= 21; ++i) {
        const indexKey: ReturnType<typeof getDialogIndexKey> = `index_${i}` as any;
        delete dialog[indexKey];
      }
      // delete dialog.indexes;

      this.saveDialog({
        dialog,
        ignoreOffsetDate: true
      });

      // ! WARNING, убрать это когда нужно будет делать чтобы pending сообщения сохранялись
      const message = this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
      if(!message) {
        this.appMessagesManager.reloadConversation(dialog.peerId);
      }
    }
  }

  public isDialogsLoaded(folderId: number) {
    return !!this.allDialogsLoaded[folderId];
  }

  public setDialogsLoaded(folderId: number, loaded: boolean) {
    const isForum = this.isFilterIdForForum(folderId);

    if(folderId === GLOBAL_FOLDER_ID && loaded) {
      this.allDialogsLoaded[FOLDER_ID_ALL] = loaded;
      this.allDialogsLoaded[FOLDER_ID_ARCHIVE] = loaded;
    } else {
      if(isForum) {
        defineNotNumerableProperties(this.allDialogsLoaded, [folderId]);
      }

      this.allDialogsLoaded[folderId] = loaded;
    }

    if(isForum) {
      return;
    }

    if(Array.from(REAL_FOLDERS).every((folderId) => this.allDialogsLoaded[folderId])) {
      this.allDialogsLoaded[GLOBAL_FOLDER_ID] = true;
    }

    this.saveAllDialogsLoaded();
  }

  private saveAllDialogsLoaded() {
    this.appStateManager.pushToState('allDialogsLoaded', this.allDialogsLoaded);
  }

  public clear = (init = false) => {
    if(!init) {
      this.storage.clear();

      this.allDialogsLoaded = {};
      this.saveAllDialogsLoaded();

      // * clear not numerable properties
      this.pinnedOrders = Object.assign({}, this.pinnedOrders);
      for(const folderId of REAL_FOLDERS) {
        this.resetPinnedOrder(folderId);
      }
      this.savePinnedOrders();
    } else {
      this.allDialogsLoaded = {};
      this.pinnedOrders = {};
      for(const folderId of REAL_FOLDERS) {
        this.pinnedOrders[folderId] = [];
      }
    }

    this.forumTopics = new Map();
    this.folders = {};
    this.dialogsOffsetDate = {};
    this.dialogsNum = 0;
    this.dialogsIndex = new SearchIndex({
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
  };

  public handleDialogUnpinning(dialog: Dialog | ForumTopic, folderId: number) {
    delete dialog.pFlags.pinned;
    indexOfAndSplice(this.getPinnedOrders(folderId), this.isFilterIdForForum(folderId) ? (dialog as ForumTopic).id : dialog.peerId);
    this.savePinnedOrders();
  }

  public savePinnedOrders() {
    this.appStateManager.pushToState('pinnedOrders', this.pinnedOrders);
  }

  public resetPinnedOrder(folderId: number) {
    this.getPinnedOrders(folderId).length = 0;
  }

  public getPinnedOrders(folderId: number) {
    let orders = this.pinnedOrders[folderId];
    if(!orders && this.isFilterIdForForum(folderId)) {
      defineNotNumerableProperties(this.pinnedOrders, [folderId]);
      orders = this.pinnedOrders[folderId] = [];
    }

    return orders;
  }

  public isDialogPinned(peerId: PeerId, folderId: number) {
    const filter = this.filtersStorage.getFilter(folderId);
    let isPinned: boolean;
    if(filter) {
      isPinned = filter.pinnedPeerIds.indexOf(peerId) !== -1;
    } else {
      isPinned = !!this.getDialogOnly(peerId).pFlags.pinned;
    }

    return isPinned;
  }

  public getOffsetDate(folderId: number): number {
    const offsetDate = this.dialogsOffsetDate[folderId] || 0;
    if(folderId === GLOBAL_FOLDER_ID && !offsetDate) { // make request not from beginning if we have loaded some dialogs
      return Math.min(...Array.from(REAL_FOLDERS).sort((a, b) => a - b));
    }

    return offsetDate;
  }

  private generateFolder(id: number) {
    const folder: Folder = {
      dialogs: [],
      id,
      unreadMessagesCount: 0,
      unreadPeerIds: new Set(),
      unreadUnmutedPeerIds: new Set()
    };

    defineNotNumerableProperties(folder, ['dispatchUnreadTimeout']);

    return folder;
  }

  public getFolder(id: number) {
    return this.folders[id] ??= this.generateFolder(id);
  }

  public isFilterIdForForum(filterId: number) {
    return filterId && filterId < 0;
  }

  public getFilterIdForForum(forumTopic: ForumTopic) {
    return forumTopic.peerId;
  }

  public getDialogKey(dialog: Dialog | ForumTopic) {
    return this.isTopic(dialog) ? dialog.id : dialog.peerId;
  }

  public getFolderDialogs(id: number, skipMigrated = true): Folder['dialogs'] {
    if(id === GLOBAL_FOLDER_ID) { // * it won't be sorted
      return this.getCachedDialogs(skipMigrated);
    }

    const folder = this.getFolder(id);
    if(this.isFilterIdForForum(id)) {
      return skipMigrated ? folder.dialogs.filter((forumTopic) => !(forumTopic as ForumTopic).pFlags.hidden) : folder.dialogs;
    }

    return skipMigrated ? folder.dialogs.filter((dialog) => (dialog as Dialog).migratedTo === undefined) : folder.dialogs;
  }

  public getNextDialog(currentPeerId: PeerId, next: boolean, filterId: number) {
    const folder = this.getFolderDialogs(filterId, true);
    let dialog: Folder['dialogs'][0];
    if(!currentPeerId) {
      if(next) {
        dialog = folder[0];
      }
    } else {
      const idx = folder.findIndex((dialog) => dialog.peerId === currentPeerId);
      if(idx !== -1) {
        const nextIndex = next ? idx + 1 : idx - 1;
        dialog = folder[nextIndex];
      }
    }

    return dialog;
  }

  public getDialogIndexKeyByFilterId(filterId: number) {
    if(this.isFilterIdForForum(filterId)) return getDialogIndexKey();
    if(REAL_FOLDERS.has(filterId)) return getDialogIndexKey(filterId as REAL_FOLDER_ID);
    const filter = this.filtersStorage.getFilter(filterId);
    return getDialogIndexKey(filter.localId);
  }

  private isDialogUnmuted(dialog: Dialog | ForumTopic) {
    return !this.appNotificationsManager.isPeerLocalMuted({
      peerId: dialog.peerId,
      respectType: true,
      threadId: this.isTopic(dialog) ? (dialog as ForumTopic).id : undefined
    });
  }

  public getFolderUnreadCount(filterId: number) {
    const folder = this.getFolder(filterId);
    return {unreadUnmutedCount: folder.unreadUnmutedPeerIds.size, unreadCount: folder.unreadPeerIds.size};
  }

  public getCachedDialogs(skipMigrated?: boolean) {
    const arrays = Array.from(REAL_FOLDERS).map((folderId) => this.getFolderDialogs(folderId, skipMigrated));
    return [].concat(...arrays) as Dialog[];
  }

  private setDialogIndexInFilter(
    dialog: Dialog | ForumTopic,
    indexKey: ReturnType<typeof getDialogIndexKey>,
    filter?: MyDialogFilter
  ) {
    // if(this.isTopic(dialog)) {
    //   return dialog['index_0'];
    // }

    let index: number;

    const isTopic = this.isTopic(dialog);
    const isRealFolder = isTopic || REAL_FOLDERS.has(filter.id);
    /* if(isRealFolder) {
      // index = getDialogIndex(dialog, indexKey);
      index = this.generateIndexForDialog(dialog, true);
    } else  */if(this.filtersStorage.testDialogForFilter(dialog, filter)) {
      const pinnedIds = isTopic ?
        this.getPinnedOrders(this.getFilterIdForForum(dialog)) :
        filter.pinnedPeerIds;

      const pinnedKey = this.getDialogKey(dialog);
      const pinnedIndex = pinnedIds.indexOf(pinnedKey);

      if(pinnedIndex !== -1) {
        index = this.generateDialogIndex(this.generateDialogPinnedDateByIndex(pinnedIds.length - 1 - pinnedIndex), true);
      } else if(dialog.pFlags?.pinned || isRealFolder) {
        index = this.generateIndexForDialog(dialog, true, undefined, !isRealFolder);
      } else {
        index = getDialogIndex(dialog) ?? this.generateIndexForDialog(dialog, true);
      }
    }

    // if(!dialog.hasOwnProperty(indexKey)) {
    //   defineNotNumerableProperties(dialog, [indexKey]);
    // }

    return setDialogIndex(dialog, indexKey, index);
  }

  public getDialog(peerId: PeerId, folderId?: number, topicId?: number, skipMigrated = true): [Folder['dialogs'][0], number] | [] {
    const folders: Folder['dialogs'][] = [];

    if(topicId) {
      folderId = peerId;
      // skipMigrated = false;
    }

    if(folderId === undefined) {
      folders.push(...Array.from(REAL_FOLDERS).map((folderId) => this.getFolder(folderId).dialogs as Dialog[]));
    } else {
      folders.push(this.getFolderDialogs(folderId, false) as Dialog[]);
    }

    const verify: (d: Folder['dialogs'][0]) => boolean = topicId ?
      (d) => (d as ForumTopic).id === topicId :
      (d) => (d as Dialog).peerId === peerId;
    for(const folder of folders) {
      let i = 0, skipped = 0;
      for(let length = folder.length; i < length; ++i) {
        const dialog = folder[i];
        if(verify(dialog)) {
          return [dialog, i - skipped];
        } else if(skipMigrated && ((dialog as ForumTopic).pFlags.hidden || (dialog as Dialog).migratedTo !== undefined)) {
          ++skipped;
        }
      }
    }

    return [];
  }

  public getDialogOnly(peerId: PeerId) {
    return this.dialogs[peerId];
  }

  public getDialogOrTopic(peerId: PeerId, topicId?: number) {
    return topicId ? this.getForumTopic(peerId, topicId) : this.dialogs[peerId];
  }

  public getDialogIndex(
    peerId: PeerId | Parameters<typeof getDialogIndex>[0],
    indexKey: ReturnType<typeof getDialogIndexKey>,
    topicId?: number
  ) {
    const dialog = isObject(peerId) ? peerId : this.getDialogOrTopic(peerId, topicId);
    return getDialogIndex(dialog, indexKey);
  }

  /*
  var date = Date.now() / 1000 | 0;
  var m = date * 0x10000;

  var k = (date + 1) * 0x10000;
  k - m;
  65536
  */
  public generateDialogIndex(date?: number, isPinned?: boolean) {
    date ??= tsNow(true) + this.timeManager.getServerTimeOffset();
    return (date * 0x10000) + (isPinned ? 0 : (++this.dialogsNum & 0xFFFF));
  }

  // public makeFilterForTopics(id: number): MyDialogFilter {
  //   return {
  //     _: 'dialogFilter',
  //     id,

  //   };
  // }

  public isTopic(dialog: Dialog | ForumTopic): dialog is ForumTopic {
    return 'id' in dialog;
  }

  public processDialogForFilters(dialog: Dialog | ForumTopic, noIndex?: boolean) {
    // let perf = performance.now();
    if(this.isTopic(dialog)) {
      this.processDialogForFilter(dialog, undefined, noIndex);
      return;
    }

    const filters = this.filtersStorage.getFilters();
    for(const id in filters) {
      const filter = filters[id];
      this.processDialogForFilter(dialog, filter, noIndex);
    }
    // spentTime += (performance.now() - perf);
    // console.log('generate index time:', spentTime);
  }

  public processDialogForFilter(
    dialog: Dialog | ForumTopic,
    filter?: MyDialogFilter,
    noIndex?: boolean
  ) {
    const isTopic = this.isTopic(dialog);
    const folderId = isTopic ? this.getFilterIdForForum(dialog) : filter.id;

    const indexKey = isTopic ? 'index_0' : this.getDialogIndexKeyByFilterId(folderId);
    const folder = this.getFolder(folderId);
    const dialogs = folder.dialogs;

    const cmp: (d: typeof dialog) => boolean = isTopic ?
      ((d: ForumTopic) => d.id === dialog.id) as any :
      ((d: Dialog) => d.peerId === dialog.peerId) as any;
    const wasIndex = dialogs.findIndex(cmp);
    const wasDialog = dialogs[wasIndex];
    const wasDialogIndex = this.getDialogIndex(wasDialog, indexKey);

    if(noIndex && folderId > FOLDER_ID_ARCHIVE) {
      noIndex = undefined;
    }

    const newDialogIndex = noIndex ? undefined : this.setDialogIndexInFilter(dialog, indexKey, filter);

    if(wasDialogIndex === newDialogIndex) {
      return false;
    }

    if(!!wasDialogIndex !== !!newDialogIndex) {
      this.prepareFolderUnreadCountModifyingByDialog(folderId, dialog, !!newDialogIndex);
    }

    if(wasIndex !== -1) {
      dialogs.splice(wasIndex, 1);
    }

    if(newDialogIndex) {
      insertInDescendSortedArray(dialogs, dialog, (dialog) => this.getDialogIndex(dialog, indexKey), -1);
    }

    return true;
  }

  public prepareDialogUnreadCountModifying(dialog: Dialog | ForumTopic, toggle?: boolean) {
    const isTopic = this.isTopic(dialog);
    const callbacks: NoneToVoidFunction[] = [];

    const folderId = isTopic ? this.getFilterIdForForum(dialog) : dialog.folder_id;
    callbacks.push(this.prepareFolderUnreadCountModifyingByDialog(folderId, dialog, toggle));

    if(!isTopic) {
      const filters = this.filtersStorage.getFilters();
      for(const id in filters) {
        const filter = filters[id];
        if(this.filtersStorage.testDialogForFilter(dialog, filter)) {
          callbacks.push(this.prepareFolderUnreadCountModifyingByDialog(filter.id, dialog, toggle));
        }
      }
    }

    return () => !toggle && callbacks.forEach((callback) => callback());
  }

  public prepareFolderUnreadCountModifyingByDialog(folderId: number, dialog: Dialog | ForumTopic, toggle?: boolean) {
    const wasUnreadCount = this.appMessagesManager.getDialogUnreadCount(dialog);
    const wasUnmuted = this.isDialogUnmuted(dialog);

    if(toggle !== undefined) {
      const addMessagesCount = toggle ? wasUnreadCount : -wasUnreadCount;
      // this.modifyFolderUnreadCount(folderId, addMessagesCount, !!wasUnreadCount, wasUnreadCount && wasUnmuted, dialog);
      this.modifyFolderUnreadCount(folderId, addMessagesCount, toggle && !!wasUnreadCount, toggle && !!wasUnreadCount && wasUnmuted, dialog);
      return;
    }

    return () => {
      const newUnreadCount = this.appMessagesManager.getDialogUnreadCount(dialog);
      const newUnmuted = this.isDialogUnmuted(dialog);

      const addMessagesCount = newUnreadCount - wasUnreadCount;
      this.modifyFolderUnreadCount(folderId, addMessagesCount, !!newUnreadCount, newUnreadCount && newUnmuted, dialog);
    };
  }

  public modifyFolderUnreadCount(
    folderId: number,
    addMessagesCount: number,
    toggleDialog: boolean,
    toggleUnmuted: boolean,
    dialog: Dialog | ForumTopic
  ) {
    const {peerId} = dialog;
    const isForum = this.appPeersManager.isForum(peerId);
    const isTopic = this.isTopic(dialog);
    if(isForum && !isTopic) {
      const forumUnreadCount = this.getForumUnreadCount(peerId);
      if(forumUnreadCount instanceof Promise) {
        forumUnreadCount.then(({count, hasUnmuted}) => {
          dialog = this.getDialogOnly(peerId);
          const folder = this.getFolder(folderId);
          if(
            !dialog ||
            !this.appPeersManager.isForum(peerId) ||
            !folder ||
            !folder.dialogs.some((dialog) => dialog.peerId === peerId)
          ) {
            return;
          }

          this.modifyFolderUnreadCount(folderId, 0, false, false, dialog);
        });

        return;
      } else {
        addMessagesCount = 0;
        toggleDialog = forumUnreadCount.count > 0;
        toggleUnmuted = forumUnreadCount.hasUnmuted;
      }
    }

    const folder = this.getFolder(folderId);
    if(addMessagesCount) {
      folder.unreadMessagesCount = Math.max(0, folder.unreadMessagesCount + addMessagesCount);
    }

    const key = this.getDialogKey(dialog);
    if(toggleDialog) {
      folder.unreadPeerIds.add(key);
    } else {
      folder.unreadPeerIds.delete(key);
    }

    if(toggleUnmuted) {
      folder.unreadUnmutedPeerIds.add(key);
    } else {
      folder.unreadUnmutedPeerIds.delete(key);
    }

    folder.dispatchUnreadTimeout ??= ctx.setTimeout(() => {
      folder.dispatchUnreadTimeout = undefined;
      const _folder = {...folder};
      delete _folder.dialogs;
      this.rootScope.dispatchEvent('folder_unread', _folder);

      if(isTopic) { // * refresh forum dialog unread count
        this.processChangedUnreadOrUnmuted(peerId);
      }
    }, 0);
  }

  public processChangedUnreadOrUnmuted(peerId: PeerId) {
    const dialog = this.getDialogOnly(peerId);
    if(!dialog) {
      return;
    }

    this.processDialogForFilters(dialog);
    this.prepareDialogUnreadCountModifying(dialog)(); // * because counter won't be changed if only changed muted status
    this.rootScope.dispatchEvent('dialog_unread', {
      peerId,
      dialog
    });
  }

  public generateIndexForDialog(
    dialog: Dialog | ForumTopic,
    justReturn?: boolean,
    message?: MyMessage,
    noPinnedOrderUpdate?: boolean
  ) {
    if(!justReturn/*  && !isTopic */) {
      return;
    }

    const isTopic = this.isTopic(dialog);
    let topDate = 0, isPinned: boolean;
    if((dialog as ForumTopic).pFlags.hidden) { // general topic must be first
      topDate = this.generateDialogPinnedDateByIndex(0xFFF);
      isPinned = true;
    } else if(dialog.pFlags.pinned && !noPinnedOrderUpdate) {
      topDate = this.generateDialogPinnedDate(dialog);
      isPinned = true;
    } else {
      message ||= this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);

      topDate = (message as Message.message)?.date || topDate;

      if(!isTopic) {
        const channelId = this.appPeersManager.isChannel(dialog.peerId) && dialog.peerId.toChatId();
        if(channelId) {
          const channel = this.appChatsManager.getChat(channelId) as Chat.channel;
          if(!topDate || (channel.date && channel.date > topDate)) {
            topDate = channel.date;
          }
        }
      }

      if(dialog.draft?._ === 'draftMessage' && dialog.draft.date > topDate) {
        topDate = dialog.draft.date;
      }
    }

    topDate ||= tsNow(true);

    const index = this.generateDialogIndex(topDate, isPinned);
    if(justReturn) {
      return index;
    }

    const indexKey = getDialogIndexKey((dialog as Dialog).folder_id);
    setDialogIndex(dialog, indexKey, index);
  }

  public generateDialogPinnedDateByIndex(pinnedIndex: number) {
    return 0x7fff0000 + (pinnedIndex & 0xFFFF); // 0xFFFF - потому что в папках может быть бесконечное число пиннедов
  }

  public generateDialogPinnedDate(dialog: Dialog | ForumTopic) {
    const isTopic = this.isTopic(dialog);
    const order = this.getPinnedOrders(isTopic ? this.getFilterIdForForum(dialog) : dialog.folder_id);

    const dialogKey = this.getDialogKey(dialog);
    let pinnedIndex = order.indexOf(dialogKey);
    if(pinnedIndex === -1) {
      order.unshift(dialogKey);
      pinnedIndex = 0;

      if(!isTopic) {
        this.savePinnedOrders();
      }
    }

    return this.generateDialogPinnedDateByIndex(order.length - 1 - pinnedIndex);
  }

  /* public generateDialog(peerId: PeerId) {
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

  public setDialogToState(dialog: Dialog | ForumTopic) {
    if(this.isTopic(dialog)) {
      return;
    }

    const {peerId, pts} = dialog;
    const historyStorage = this.appMessagesManager.getHistoryStorage(peerId);
    const messagesStorage = this.appMessagesManager.getHistoryMessagesStorage(peerId);
    const history = historyStorage.history.slice;
    let incomingMessage: MyMessage;
    for(let i = 0, length = history.length; i < length; ++i) {
      const mid = history[i];
      const message: MyMessage = this.appMessagesManager.getMessageFromStorage(messagesStorage, mid);
      if(message && !message.pFlags.is_outgoing/*  || peerId === SERVICE_PEER_ID */) {
        incomingMessage = message;

        const peerIds = getPeerIdsFromMessage(message);
        this.peersStorage.requestPeersForKey(peerIds, `topMessage_${peerId}`);

        break;
      }
    }

    dialog.topMessage = incomingMessage;

    // DO NOT TOUCH THESE LINES, SOME REAL MAGIC HERE.
    // * Read service chat when refreshing page with outgoing & getting new service outgoing message
    /* if(incomingMessage && dialog.read_inbox_max_id >= dialog.top_message) {
      dialog.unread_count = 0;
    }

    dialog.read_inbox_max_id = this.appMessagesIdsManager.clearMessageId(dialog.read_inbox_max_id);
    dialog.read_outbox_max_id = this.appMessagesIdsManager.clearMessageId(dialog.read_outbox_max_id); */
    // CAN TOUCH NOW

    if(peerId.isAnyChat() && pts) {
      const newPts = this.apiUpdatesManager.getChannelState(peerId.toChatId(), pts).pts;
      dialog.pts = newPts;
    }

    this.storage.set({
      [peerId]: dialog
    });

    this.peersStorage.requestPeer(peerId, 'dialog');

    /* for(let id in this.filtersStorage.filters) {
      const filter = this.filtersStorage.filters[id];

      if(this.filtersStorage.testDialogForFilter(dialog, filter)) {

      }
    } */
  }

  public pushDialog({dialog, offsetDate, ignoreOffsetDate, saveGlobalOffset}: {
    dialog: Dialog | ForumTopic,
    offsetDate?: number,
    ignoreOffsetDate?: boolean,
    saveGlobalOffset?: boolean
  }) {
    const isTopic = this.isTopic(dialog);
    const {folder_id, peerId} = dialog as Dialog;

    if(isTopic) {
      const forumTopics = this.getForumTopicsCache(peerId);
      forumTopics.topics.set(dialog.id, dialog);
    } else {
      this.dialogs[peerId] = dialog;
    }

    offsetDate ??= this.getDialogOffsetDate(dialog);

    // if(!isTopic) {
    this.processDialogForFilters(dialog);
    // }

    if(offsetDate && !dialog.pFlags.pinned) {
      if(!isTopic && saveGlobalOffset) {
        const savedGlobalOffsetDate = this.dialogsOffsetDate[GLOBAL_FOLDER_ID];
        if(!savedGlobalOffsetDate || offsetDate < savedGlobalOffsetDate) {
          this.dialogsOffsetDate[GLOBAL_FOLDER_ID] = offsetDate;
        }
      }

      const folderId = isTopic ? this.getFilterIdForForum(dialog) : folder_id;
      const savedOffsetDate = this.dialogsOffsetDate[folderId];
      if(!savedOffsetDate || offsetDate < savedOffsetDate) {
        // if(pos !== -1) {
        if(!ignoreOffsetDate && !this.isDialogsLoaded(folderId)) {
          this.dropDialog(peerId, isTopic ? this.getDialogKey(dialog) : undefined, true);
          return;
        }

        this.dialogsOffsetDate[folderId] = offsetDate;
      }
    }

    this.setDialogToState(dialog);

    // if(pos === -1) {
    // this.prepareFolderUnreadCountModifyingByDialog(folder_id, dialog, true);
    // }

    // const indexKey = getDialogIndexKey(folder_id);
    // /* const newPos =  */insertInDescendSortedArray(dialogs, dialog, (dialog) => getDialogIndex(dialog, indexKey), -1);
    /* if(pos !== -1 && pos !== newPos) {
      rootScope.dispatchEvent('dialog_order', {dialog, pos: newPos});
    } */
  }

  public dropDialogFromFolders(peerId: PeerId, topicId?: number) {
    const foundDialog = this.getDialog(peerId, undefined, topicId, false);
    const [dialog, index] = foundDialog;
    if(dialog) {
      const filterId = topicId ?
        this.getFilterIdForForum(dialog as ForumTopic) :
        (dialog as Dialog).folder_id;

      // const folder = this.getFolder(filterId);
      // folder.dialogs.splice(index, 1);
      const wasPinned = indexOfAndSplice(this.getPinnedOrders(filterId), this.getDialogKey(dialog)) !== undefined;

      this.processDialogForFilters(dialog, true);

      this.dialogsIndex.indexObject(peerId, '');

      if(wasPinned) {
        this.savePinnedOrders();
      }
    }

    return foundDialog;
  }

  public dropDialog(peerId: PeerId, topicId?: number, keepLocal?: boolean) {
    const dialog = this.getDialogOrTopic(peerId, topicId);
    const foundDialog = this.dropDialogFromFolders(peerId, topicId);
    if(dialog) {
      if(!keepLocal) {
        if(topicId) {
          this.getForumTopicsCache(peerId).topics.delete(topicId);
        } else {
          delete this.dialogs[peerId];
        }
      }

      this.clearDialogFromState(dialog, keepLocal);
    }

    return foundDialog;
  }

  public clearDialogFromState(dialog: Dialog | ForumTopic, keepLocal: boolean) {
    if(dialog._ === 'forumTopic') {
      return;
    }

    const {peerId} = dialog;
    this.peersStorage.requestPeersForKey([], `topMessage_${peerId}`);
    this.peersStorage.releasePeer(peerId, 'dialog');
    this.storage.delete(peerId, keepLocal);
  }

  public dropDialogWithEvent(peerId: PeerId, topicId?: number) {
    const dropped = this.dropDialog(peerId, topicId);
    if(dropped.length) {
      this.rootScope.dispatchEvent('dialog_drop', dropped[0]);
    }

    return dropped;
  }

  /**
   * leaving chat, leaving channel, deleting private dialog
   */
  public dropDialogOnDeletion(peerId: PeerId, topicId?: number) {
    this.dropDialogWithEvent(peerId, topicId);
    this.rootScope.dispatchEvent('peer_deleted', peerId);
  }

  public applyDialogs(result: MessagesPeerDialogs | MessagesForumTopics, peerId?: PeerId) {
    // * В эту функцию попадут только те диалоги, в которых есть read_inbox_max_id и read_outbox_max_id, в отличие от тех, что будут в getTopMessages

    const isForum = result._ === 'messages.forumTopics';
    const items = (result as MessagesPeerDialogs).dialogs || (result as MessagesForumTopics).topics;
    if(!isForum) {
      // ! fix 'dialogFolder', maybe there is better way to do it, this only can happen by 'messages.getPinnedDialogs' by folder_id: 0
      forEachReverse(result.dialogs, (dialog, idx) => {
        if(dialog._ === 'dialogFolder') {
          result.dialogs.splice(idx, 1);
        }
      });
    } else {
      this.processTopics(peerId, result);
    }

    assumeType<Folder['dialogs']>(items);

    this.appUsersManager.saveApiUsers(result.users);
    this.appChatsManager.saveApiChats(result.chats);
    this.appMessagesManager.saveMessages(result.messages);

    // this.appMessagesManager.log('applyConversation', dialogsResult);

    const updatedDialogs: BroadcastEvents['dialogs_multiupdate'] = new Map();
    const getUpdateCache = (peerId: PeerId) => {
      let cache = updatedDialogs.get(peerId);
      if(!cache) {
        updatedDialogs.set(peerId, cache = {});
      }

      return cache;
    };

    items.forEach((dialog) => {
      const peerId = this.appPeersManager.getPeerId(dialog.peer);
      let topMid = dialog.top_message;

      const topPendingMid = this.appMessagesManager.pendingTopMsgs[peerId];
      if(topPendingMid) {
        const topPendingMessage = this.appMessagesManager.getMessageByPeer(peerId, topPendingMid) as MyMessage;
        const topMessage = this.appMessagesManager.getMessageByPeer(peerId, topMid) as MyMessage;
        if(!topMid || (topPendingMessage && (!topMessage || topPendingMessage?.date > topMessage?.date))) {
          dialog.top_message = topMid = topPendingMid;
          this.appMessagesManager.getHistoryStorage(peerId).maxId = topPendingMid;
        }
      }

      /* const d = Object.assign({}, dialog);
      if(peerId === 239602833) {
        this.log.error('applyConversation lun', dialog, d);
      } */

      if(topMid || dialog.draft?._ === 'draftMessage') {
        if(this.saveDialog({dialog})) {
          const cache = getUpdateCache(peerId);

          if(isForum) {
            (cache.topics ??= new Map()).set(
              (dialog as ForumTopic).id,
              dialog as ForumTopic
            );
          } else {
            cache.dialog = dialog as Dialog;
          }
        }
      } else {
        this.dropDialogWithEvent(peerId, isForum ? this.getDialogKey(dialog) : undefined);
      }

      const key = this.appMessagesManager.getUpdateAfterReloadKey(peerId, isForum ? this.getDialogKey(dialog) : undefined);
      const updates = this.appMessagesManager.newUpdatesAfterReloadToHandle[key];
      if(updates !== undefined) {
        for(const update of updates) {
          updates.delete(update);
          this.apiUpdatesManager.saveUpdate(update);
        }

        if(!updates.size) {
          delete this.appMessagesManager.newUpdatesAfterReloadToHandle[key];
        }
      }
    });

    if(updatedDialogs.size) {
      this.rootScope.dispatchEvent('dialogs_multiupdate', updatedDialogs);
    }
  }

  private getDialogOffsetDate(dialog: Dialog | ForumTopic) {
    const message = this.appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
    return message?.date || 0;
  }

  public canSaveDialogByPeerId(peerId: PeerId) {
    if(peerId.isAnyChat()) {
      const chat: Chat = this.appChatsManager.getChat(peerId.toChatId());
      // ! chatForbidden stays for chat where you're kicked
      if(
        chat._ === 'channelForbidden' ||
        // || chat._ === 'chatForbidden'
        (chat as Chat.chat).pFlags.left
        // || (chat as any).pFlags.kicked
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Won't save migrated from peer, forbidden peers, left and kicked
   */
  public saveDialog({
    dialog,
    folderId,
    ignoreOffsetDate,
    saveGlobalOffset
  }: {
    dialog: Dialog | ForumTopic,
    folderId?: REAL_FOLDER_ID,
    ignoreOffsetDate?: boolean,
    saveGlobalOffset?: boolean
  }) {
    const isTopic = this.isTopic(dialog);
    const isDialog = !isTopic;

    const peerId = this.appPeersManager.getPeerId(dialog.peer);
    const channelId = this.appPeersManager.isChannel(peerId) ? peerId.toChatId() : undefined;

    const topicId = isTopic ? dialog.id = this.appMessagesIdsManager.generateMessageId(dialog.id, channelId) : undefined;
    if(!isTopic) {
      folderId ??= dialog.folder_id ?? FOLDER_ID_ALL;
    }

    if(!peerId) {
      console.error('saveConversation no peerId???', dialog, folderId);
      return false;
    }

    if(!isTopic && dialog._ !== 'dialog'/*  || peerId === 239602833 */) {
      console.error('saveConversation not regular dialog', dialog, Object.assign({}, dialog));
    }

    if(isDialog && !this.canSaveDialogByPeerId(peerId)) {
      return false;
    }

    if(isDialog && !channelId && peerId.isAnyChat()) {
      const chat = this.appChatsManager.getChat(peerId.toChatId()) as Chat.chat;
      if(chat && chat.migrated_to && chat.pFlags.deactivated) {
        const migratedToPeer = this.appPeersManager.getPeerId(chat.migrated_to);
        this.appMessagesManager.migratedFromTo[peerId] = migratedToPeer;
        this.appMessagesManager.migratedToFrom[migratedToPeer] = peerId;
        dialog.migratedTo = migratedToPeer;
        // return;
      }
    }

    if(isDialog && !dialog.migratedTo) {
      const peerText = this.appPeersManager.getPeerSearchText(peerId);
      this.dialogsIndex.indexObject(peerId, peerText);
    }

    const wasDialogBefore = this.getDialogOrTopic(peerId, topicId);

    let mid: number, message: MyMessage;
    if(dialog.top_message) {
      mid = this.appMessagesIdsManager.generateMessageId(dialog.top_message, channelId);// dialog.top_message;

      // preserve outgoing message
      const wasTopMessage = wasDialogBefore?.top_message && this.appMessagesManager.getMessageByPeer(peerId, wasDialogBefore.top_message) as MyMessage;
      if(wasTopMessage?.pFlags?.is_outgoing && wasDialogBefore.top_message >= mid) {
        mid = wasDialogBefore.top_message;
      }

      message = this.appMessagesManager.getMessageByPeer(peerId, mid);
    } else {
      mid = this.appMessagesManager.generateTempMessageId(peerId);
      message = {
        _: 'message',
        id: mid,
        mid,
        from_id: this.appPeersManager.getOutputPeer(this.appUsersManager.getSelf().id.toPeerId(false)),
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

    dialog.top_message = mid;
    // dialog.unread_count = wasDialogBefore && dialog.read_inbox_max_id === getServerMessageId(wasDialogBefore.read_inbox_max_id) ? wasDialogBefore.unread_count : dialog.unread_count;
    dialog.read_inbox_max_id = this.appMessagesIdsManager.generateMessageId(wasDialogBefore && !dialog.read_inbox_max_id ? wasDialogBefore.read_inbox_max_id : dialog.read_inbox_max_id, channelId);
    dialog.read_outbox_max_id = this.appMessagesIdsManager.generateMessageId(wasDialogBefore && !dialog.read_outbox_max_id ? wasDialogBefore.read_outbox_max_id : dialog.read_outbox_max_id, channelId);

    if(isDialog && dialog.folder_id === undefined) {
      if(dialog._ === 'dialog') {
        // ! СЛОЖНО ! СМОТРИ В getTopMessages
        dialog.folder_id = wasDialogBefore ? (wasDialogBefore as typeof dialog).folder_id : folderId;
      }/*  else if(dialog._ === 'dialogFolder') {
        dialog.folder_id = dialog.folder.id;
      } */
    }

    dialog.draft = this.appDraftsManager.saveDraft({peerId, threadId: topicId, draft: dialog.draft});
    dialog.peerId = peerId;
    // dialog.indexes ??= {} as any;

    // Because we saved message without dialog present
    if(message && message.pFlags.is_outgoing) {
      const isOut = message.pFlags.out;
      if(mid > dialog[isOut ? 'read_outbox_max_id' : 'read_inbox_max_id']) {
        message.pFlags.unread = true;

        if(!dialog.unread_count && !isOut) {
          ++dialog.unread_count;
        }
      } else {
        delete message.pFlags.unread;
      }
    }

    const historyStorage = this.appMessagesManager.getHistoryStorage(peerId, topicId);
    const slice = historyStorage.history.slice;
    /* if(historyStorage === undefined) { // warning
      historyStorage.history.push(mid);
    } else  */if(!slice.length) {
      historyStorage.history.unshift(mid);
      historyStorage.count ||= 1;
      if(this.appMessagesManager.mergeReplyKeyboard(historyStorage, message)) {
        this.rootScope.dispatchEvent('history_reply_markup', {peerId});
      }
    } else if(!slice.isEnd(SliceEnd.Bottom)) { // * this will probably never happen, however, if it does, then it will fix slice with top_message
      const slice = historyStorage.history.insertSlice([mid]);
      slice.setEnd(SliceEnd.Bottom);
      historyStorage.count ||= 1;
      if(this.appMessagesManager.mergeReplyKeyboard(historyStorage, message)) {
        this.rootScope.dispatchEvent('history_reply_markup', {peerId});
      }
    }

    historyStorage.maxId = mid;
    historyStorage.readMaxId = dialog.read_inbox_max_id;
    historyStorage.readOutboxMaxId = dialog.read_outbox_max_id;

    this.appNotificationsManager.savePeerSettings({
      peerId,
      threadId: isTopic ? dialog.id : undefined,
      settings: dialog.notify_settings
    });

    if(isDialog && channelId && dialog.pts) {
      this.apiUpdatesManager.addChannelState(channelId, dialog.pts);
    }

    this.generateIndexForDialog(dialog);

    if(wasDialogBefore) {
      // fix unread count
      const releaseUnreadCount = this.dialogsStorage.prepareDialogUnreadCountModifying(wasDialogBefore);
      safeReplaceObject(wasDialogBefore, dialog);
      releaseUnreadCount();
    }

    this.pushDialog({
      dialog,
      offsetDate: message?.date,
      ignoreOffsetDate,
      saveGlobalOffset
    });

    if(isTopic) {
      this.processTopicUpdate(dialog, wasDialogBefore as ForumTopic);
    }

    return true;
  }

  public processTopicUpdate(topic: ForumTopic, oldTopic?: ForumTopic) {
    if(!oldTopic) {
      return;
    }

    const {peerId, id: threadId} = topic;
    const isIconChanged = topic.icon_emoji_id !== (oldTopic as ForumTopic).icon_emoji_id;
    const isTitleChanged = topic.title !== (oldTopic as ForumTopic).title;
    const isChanged = isIconChanged || isTitleChanged;

    if(isIconChanged) {
      this.rootScope.dispatchEvent('avatar_update', {peerId, threadId});
    }

    if(isChanged) {
      this.rootScope.dispatchEvent('peer_title_edit', {peerId, threadId});
    }
  }

  public getDialogs(options: {
    query?: string,
    offsetIndex?: number,
    limit?: number,
    filterId?: number,
    skipMigrated?: boolean
  }): MaybePromise<{
    dialogs: Folder['dialogs'],
    count: number,
    isTopEnd: boolean,
    isEnd: boolean
  }> {
    const {
      query = '',
      offsetIndex,
      limit = 20,
      filterId = FOLDER_ID_ALL,
      skipMigrated = false
    } = options;

    const isForum = this.isFilterIdForForum(filterId);
    if(!isForum && !REAL_FOLDERS.has(filterId)) {
      const promises: Promise<any>[] = [];

      const fillContactsResult = this.appUsersManager.fillContacts();
      if(!fillContactsResult.cached) {
        promises.push(fillContactsResult.promise);
      }

      const reloadMissingDialogsPromise = this.filtersStorage.reloadMissingPeerIds(filterId);
      if(reloadMissingDialogsPromise) {
        promises.push(reloadMissingDialogsPromise);
      }

      if(promises.length) {
        return Promise.all(promises).then(() => {
          return this.getDialogs(options);
        });
      }
    }

    // let's load only first pages by certain folderId. next pages will load without folder filtering
    const realFolderId/* : REAL_FOLDER_ID */ =
      (!REAL_FOLDERS.has(filterId) || this.getOffsetDate(filterId)) && !isForum ?
        GLOBAL_FOLDER_ID :
        filterId/*  as REAL_FOLDER_ID */;
    let curDialogStorage = this.getFolderDialogs(filterId, skipMigrated);

    const indexKey = this.getDialogIndexKeyByFilterId(filterId);

    if(query && !isForum) {
      if(!limit || this.cachedResults.query !== query || this.cachedResults.folderId !== filterId) {
        this.cachedResults.query = query;
        this.cachedResults.folderId = filterId;

        const results = this.dialogsIndex.search(query);

        const dialogs: Dialog[] = [];
        for(const peerId in this.dialogs) {
          const dialog = this.dialogs[peerId];
          if(results.has(dialog.peerId) && dialog.folder_id === filterId) {
            dialogs.push(dialog);
          }
        }

        dialogs.sort((d1, d2) => this.getDialogIndex(d2, indexKey) - this.getDialogIndex(d1, indexKey));
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
        if(offsetIndex > this.getDialogIndex(curDialogStorage[offset], indexKey)) {
          break;
        }
      }
    }

    const loadedAll = this.isDialogsLoaded(realFolderId);
    const isEnoughDialogs = curDialogStorage.length >= (offset + limit);
    if(query || loadedAll || isEnoughDialogs) {
      const dialogs = curDialogStorage.slice(offset, offset + limit);
      return {
        dialogs,
        count: loadedAll ? curDialogStorage.length : null,
        isTopEnd: curDialogStorage.length && ((dialogs[0] && dialogs[0] === curDialogStorage[0]) || this.getDialogIndex(curDialogStorage[0], indexKey) < offsetIndex),
        isEnd: (query || loadedAll) && (offset + limit) >= curDialogStorage.length
      };
    }

    return this.appMessagesManager.getTopMessages({limit, folderId: realFolderId}).then((result) => {
      // const curDialogStorage = this[folderId];
      if(skipMigrated) {
        curDialogStorage = this.getFolderDialogs(filterId, skipMigrated);
      }

      offset = 0;
      if(offsetIndex > 0) {
        for(let length = curDialogStorage.length; offset < length; ++offset) {
          if(offsetIndex > this.getDialogIndex(curDialogStorage[offset], indexKey)) {
            break;
          }
        }
      }

      // this.log.warn(offset, offset + limit, curDialogStorage.dialogs.length, this.dialogs.length);

      const dialogs = curDialogStorage.slice(offset, offset + limit);
      return {
        dialogs,
        count: result.count === undefined ? curDialogStorage.length : result.count,
        isTopEnd: curDialogStorage.length && ((dialogs[0] && dialogs[0] === curDialogStorage[0]) || this.getDialogIndex(curDialogStorage[0], indexKey) < offsetIndex),
        // isEnd: this.isDialogsLoaded(realFolderId) && (offset + limit) >= curDialogStorage.length
        isEnd: result.isEnd
      };
    });
  }

  public async markFolderAsRead(folderId: number) {
    const folder = this.getFolder(folderId);
    const peerIds = [...folder.unreadPeerIds];
    for(const peerId of peerIds) {
      await this.appMessagesManager.markDialogUnread(peerId, true);
    }
  }

  // * FORUMS SECTION

  public flushForumTopicsCache(peerId: PeerId) {
    const cache = this.forumTopics.get(peerId);
    if(!cache) {
      return;
    }

    const folder = this.folders[peerId];
    if(folder) {
      if(folder.dispatchUnreadTimeout) {
        clearTimeout(folder.dispatchUnreadTimeout);
      }

      delete this.allDialogsLoaded[peerId];
      delete this.pinnedOrders[peerId];
      delete this.dialogsOffsetDate[peerId];
      delete this.folders[peerId];
    }

    cache.topics.clear();

    // for permanent delete
    // this.forumTopics.delete(peerId);
  }

  public getForumTopicsCache(peerId: PeerId) {
    let forumTopics = this.forumTopics.get(peerId);
    if(!forumTopics) {
      forumTopics = {
        topics: new Map(),
        deletedTopics: new Set(),
        getTopicPromises: new Map()
      };

      this.forumTopics.set(peerId, forumTopics);
    }

    return forumTopics;
  }

  public getForumTopicById(peerId: PeerId, topicId?: number): Promise<ForumTopic> {
    if(!this.appPeersManager.isForum(peerId)) {
      return Promise.reject(makeError('CHANNEL_FORUM_MISSING'));
    }

    const cache = this.getForumTopicsCache(peerId);
    let promise: CancellablePromise<ForumTopic>;
    if(topicId) {
      promise = cache.getTopicPromises.get(topicId);
      if(promise) {
        return promise;
      }

      if(cache.deletedTopics.has(topicId)) {
        return Promise.resolve(undefined);
      }

      cache.getTopicPromises.set(topicId, promise = deferredPromise());
    }

    cache.getTopicsPromise ??= pause(0).then(() => {
      const promises: {[topicId: number]: typeof promise} = {};
      const ids: number[] = [];
      for(const [topicId, promise] of cache.getTopicPromises) {
        promises[topicId] = promise;
        ids.push(getServerMessageId(topicId));
      }

      cache.getTopicPromises.clear();

      const fullfillLeft = () => {
        for(const topicId in promises) {
          promises[topicId].resolve(undefined);
          cache.deletedTopics.add(+topicId);
        }
      };

      if(this.getForumTopicsCache(peerId) !== cache) {
        fullfillLeft();
        return;
      }

      return this.apiManager.invokeApi('channels.getForumTopicsByID', {
        channel: this.appChatsManager.getChannelInput(peerId.toChatId()),
        topics: ids
      }).then((messagesForumTopics) => {
        if(this.getForumTopicsCache(peerId) !== cache) {
          return;
        }

        this.applyDialogs(messagesForumTopics, peerId);

        messagesForumTopics.topics.forEach((forumTopic) => {
          if(forumTopic._ === 'forumTopic') {
            promises[forumTopic.id].resolve(forumTopic);
            delete promises[peerId];
          }
        });

        return messagesForumTopics;
      }, () => {}).then(() => {
        fullfillLeft();

        cache.getTopicsPromise = undefined;
        if(cache.getTopicPromises.size) {
          this.getForumTopicById(peerId);
        }
      });
    });

    return promise || cache.getTopicsPromise;
  }

  // public getForumTopicById(peerId: PeerId, topicId: number) {
  //   return this.getForumTopicsByID(peerId, topicId).then((result) => result.topics[0]);
  // }

  public getForumTopic(peerId: PeerId, topicId: number) {
    const forumTopics = this.forumTopics.get(peerId);
    return forumTopics?.topics?.get(topicId);
  }

  public getForumTopicOrReload(peerId: PeerId, topicId: number) {
    const forumTopic = this.getForumTopic(peerId, topicId);
    if(forumTopic) {
      return forumTopic;
    }

    const cache = this.getForumTopicsCache(peerId);
    return cache?.deletedTopics?.has(topicId) ? undefined : this.getForumTopicById(peerId, topicId);
  }

  public processTopics<T extends MaybePromise<{topics: MTForumTopic[], pts?: number}>>(peerId: PeerId, result: T) {
    return callbackify(result, (result) => {
      if('pts' in result) {
        this.apiUpdatesManager.addChannelState(peerId.toChatId(), result.pts);
      }

      const peer = this.appPeersManager.getOutputPeer(peerId);
      result.topics = result.topics.map((topic) => {
        if(topic._ === 'forumTopicDeleted') {
          return;
        }

        (topic as ForumTopic).peer = peer;
        topic.id = this.appMessagesIdsManager.generateMessageId(topic.id, (peer as Peer.peerChannel).channel_id);
        return topic;
      }).filter(Boolean);

      return result;
    });
  }

  public processTopicsPromise<T extends Promise<Parameters<DialogsStorage['processTopics']>[1]>>(peerId: PeerId, promise: T): T {
    return promise.then((result) => {
      this.processTopics(peerId, result);
      return result;
    }) as any;
  }

  public getForumUnreadCount(peerId: PeerId) {
    if(!this.appPeersManager.isForum(peerId)) {
      return;
    }

    const folder = this.getFolder(peerId);

    const f = folder.dialogs.length >= 20 || this.isDialogsLoaded(peerId) ?
      folder.dialogs.slice(0, 20) :
      callbackify(this.getDialogs({filterId: peerId, limit: 20}), (result) => {
        return result.dialogs;
      });

    return callbackify(f, (dialogs) => {
      return {
        count: dialogs.reduce((acc, v) => acc + +!!v.unread_count, 0),
        hasUnmuted: dialogs.some((dialog) => dialog.unread_count && this.isDialogUnmuted(dialog))
      };
    });
  }

  // * FORUMS SECTION END

  private handleDialogTogglePinned(dialog: Dialog | ForumTopic, pinned: boolean, folderId: number) {
    if(dialog) {
      if(!pinned) {
        this.handleDialogUnpinning(dialog, folderId);
      } else { // means set
        dialog.pFlags.pinned = true;
      }

      this.generateIndexForDialog(dialog);
    }

    this.appMessagesManager.scheduleHandleNewDialogs(dialog.peerId, dialog);
  }

  private handleDialogsPinned(folderId: number, order: (Dialog['peerId'] | ForumTopic['id'])[]) {
    const isForum = this.isFilterIdForForum(folderId);
    this.resetPinnedOrder(folderId);
    this.getPinnedOrders(folderId).push(...order);
    this.savePinnedOrders();
    order.reverse(); // index must be higher
    const newPinned: {[id: typeof order[0]]: true} = {};
    order.forEach((id) => {
      newPinned[id] = true;

      const peerId = isForum ? folderId : id;
      const topicId = isForum ? id : undefined;

      const dialog = this.getDialogOrTopic(peerId, topicId);
      this.appMessagesManager.scheduleHandleNewDialogs(peerId, dialog);
      if(!dialog) {
        return;
      }

      dialog.pFlags.pinned = true;
      this.generateIndexForDialog(dialog);
    });

    const dialogs = this.getFolderDialogs(folderId, false);
    for(const dialog of dialogs) {
      if(!dialog.pFlags.pinned) {
        break;
      }

      if(!newPinned[this.getDialogKey(dialog)]) {
        delete dialog.pFlags.pinned;
        this.generateIndexForDialog(dialog);
        this.appMessagesManager.scheduleHandleNewDialogs(dialog.peerId, dialog);
      }
    }
  }

  // only 0 and 1 folders
  private onUpdateFolderPeers = (update: Update.updateFolderPeers) => {
    // this.log('updateFolderPeers', update);
    const peers = update.folder_peers;

    peers.forEach((folderPeer) => {
      const {folder_id, peer} = folderPeer;

      const peerId = this.appPeersManager.getPeerId(peer);
      const dialog = this.dropDialog(peerId)[0];
      if(dialog) {
        if(dialog.pFlags?.pinned) {
          this.handleDialogUnpinning(dialog, folder_id);
        }

        (dialog as Dialog).folder_id = folder_id as REAL_FOLDER_ID;
        this.generateIndexForDialog(dialog);
        this.pushDialog({dialog}); // need for simultaneously updatePinnedDialogs
      }

      this.appMessagesManager.scheduleHandleNewDialogs(peerId, dialog);
    });
  };

  private onUpdateDialogPinned = (update: Update.updateDialogPinned) => {
    const folderId = update.folder_id ?? FOLDER_ID_ALL;
    // this.log('updateDialogPinned', update);
    const peerId = this.appPeersManager.getPeerId((update.peer as DialogPeer.dialogPeer).peer);
    const dialog = this.getDialogOnly(peerId);

    // этот код внизу никогда не сработает, в папках за пиннед отвечает updateDialogFilter
    /* if(update.folder_id > 1) {
      const filter = this.filtersStorage.filters[update.folder_id];
      if(update.pFlags.pinned) {
        filter.pinned_peers.unshift(peerId);
      } else {
        filter.pinned_peers.findAndSplice((p) => p === peerId);
      }
    } */

    this.handleDialogTogglePinned(dialog, update.pFlags.pinned, folderId);
  };

  private onUpdateChannelPinnedTopic = (update: Update.updateChannelPinnedTopic) => {
    const channelId = update.channel_id;
    const peerId = channelId.toPeerId(true);
    const topicId = this.appMessagesIdsManager.generateMessageId(update.topic_id, channelId);
    const topic = this.getForumTopic(peerId, topicId);
    if(!topic) {
      return;
    }

    this.handleDialogTogglePinned(topic, update.pFlags.pinned, this.getFilterIdForForum(topic));
  };

  private onUpdatePinnedDialogs = (update: Update.updatePinnedDialogs) => {
    const folderId = update.folder_id ?? FOLDER_ID_ALL;

    if(update.order) {
      this.handleDialogsPinned(folderId, update.order.map((peer) => this.appPeersManager.getPeerId((peer as DialogPeer.dialogPeer).peer)));
    } else {
      this.apiManager.invokeApi('messages.getPinnedDialogs', {
        folder_id: folderId
      }).then((dialogsResult) => {
        // * for test reordering and rendering
        // dialogsResult.dialogs.reverse();

        this.applyDialogs(dialogsResult);

        this.handleDialogsPinned(folderId, dialogsResult.dialogs.map((d) => d.peerId));
      });
    }
  };

  private onUpdateChannelPinnedTopics = async(update: Update.updateChannelPinnedTopics) => {
    const channelId = update.channel_id;
    const peerId = channelId.toPeerId(true);
    const forumTopics = this.forumTopics.get(peerId);
    if(!forumTopics) {
      return;
    }

    const filterId = peerId;
    if(update.order) {
      const order = update.order.map((topicId) => this.appMessagesIdsManager.generateMessageId(topicId, channelId));
      this.handleDialogsPinned(filterId, order);
    } else {
      const limit = await this.apiManager.getLimit('topicPin', true);

      const promise = this.apiManager.invokeApi('channels.getForumTopics', {
        channel: this.appChatsManager.getChannelInput(channelId),
        limit,
        offset_date: 0,
        offset_id: 0,
        offset_topic: 0
      });

      const result = await this.processTopics(peerId, promise);

      const topics = result.topics as ForumTopic[];
      const pinned = topics.filter((topic) => topic.pFlags.pinned);
      this.handleDialogsPinned(filterId, pinned.map((topic) => topic.id));
    }
  };
}
