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

import { tsNow } from "../../helpers/date";
import type { Message } from "../../layer";
import type { AppChatsManager } from "../appManagers/appChatsManager";
import type { AppMessagesManager, Dialog, MyMessage } from "../appManagers/appMessagesManager";
import type { AppPeersManager } from "../appManagers/appPeersManager";
import type { ServerTimeManager } from "../mtproto/serverTimeManager";
import searchIndexManager from "../searchIndexManager";
import { insertInDescendSortedArray } from "../../helpers/array";

export default class DialogsStorage {
  public dialogs: {[peerId: string]: Dialog} = {};
  public byFolders: {[folderId: number]: Dialog[]} = {};

  public allDialogsLoaded: {[folder_id: number]: boolean};
  private dialogsOffsetDate: {[folder_id: number]: number};
  public pinnedOrders: {[folder_id: number]: number[]};
  private dialogsNum: number;

  public dialogsIndex = searchIndexManager.createIndex();

  constructor(private appMessagesManager: AppMessagesManager, private appChatsManager: AppChatsManager, private appPeersManager: AppPeersManager, private serverTimeManager: ServerTimeManager) {
    this.reset();
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
  
      if(dialog.draft && dialog.draft._ === 'draftMessage' && dialog.draft.date > topDate) {
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
    const pinnedIndex = foundIndex === -1 ? order.push(dialog.peerId) - 1 : foundIndex;

    return this.generateDialogPinnedDateByIndex(pinnedIndex);
  }

  public pushDialog(dialog: Dialog, offsetDate?: number) {
    const dialogs = this.getFolder(dialog.folder_id);
    const pos = dialogs.findIndex(d => d.peerId === dialog.peerId);
    if(pos !== -1) {
      dialogs.splice(pos, 1);
    }

    //if(!this.dialogs[dialog.peerId]) {
      this.dialogs[dialog.peerId] = dialog;
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
    }

    return foundDialog;
  }
}
