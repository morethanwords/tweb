import { tsNow } from "../../helpers/date";
import type { Message } from "../../layer";
import type { AppChatsManager } from "../appManagers/appChatsManager";
import type { AppMessagesIDsManager } from "../appManagers/appMessagesIDsManager";
import type { AppMessagesManager, Dialog } from "../appManagers/appMessagesManager";
import type { AppPeersManager } from "../appManagers/appPeersManager";
import type { ServerTimeManager } from "../mtproto/serverTimeManager";

export default class DialogsStorage {
  public dialogs: {[peerID: string]: Dialog} = {};
  public byFolders: {[folderID: number]: Dialog[]} = {};

  public allDialogsLoaded: {[folder_id: number]: boolean} = {};
  public dialogsOffsetDate: {[folder_id: number]: number} = {};
  public pinnedOrders: {[folder_id: number]: number[]} = {
    0: [],
    1: []
  };
  public dialogsNum = 0;

  constructor(private appMessagesManager: AppMessagesManager, private appMessagesIDsManager: AppMessagesIDsManager, private appChatsManager: AppChatsManager, private appPeersManager: AppPeersManager, private serverTimeManager: ServerTimeManager) {

  }

  public getFolder(id: number) {
    if(id <= 1) {
      return this.byFolders[id] ?? (this.byFolders[id] = []);
    }

    const dialogs: {dialog: Dialog, index: number}[] = [];
    const filter = this.appMessagesManager.filtersStorage.filters[id];

    for(const peerID in this.dialogs) {
      const dialog = this.dialogs[peerID];
      if(this.appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) {
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
      date = tsNow(true) + this.serverTimeManager.serverTimeOffset;
    }

    return (date * 0x10000) + ((++this.dialogsNum) & 0xFFFF);
  }

  public generateIndexForDialog(dialog: Dialog, justReturn = false) {
    const channelID = this.appPeersManager.isChannel(dialog.peerID) ? -dialog.peerID : 0;
    const mid = this.appMessagesIDsManager.getFullMessageID(dialog.top_message, channelID);
    const message = this.appMessagesManager.getMessage(mid);

    let topDate = (message as Message.message).date || Date.now() / 1000;
    if(channelID) {
      const channel = this.appChatsManager.getChat(channelID);
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