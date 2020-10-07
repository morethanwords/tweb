import appChatsManager from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appImManager from "../lib/appManagers/appImManager";
import appMessagesManager from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import $rootScope from "../lib/rootScope";
import { findUpTag } from "../lib/utils";
import { parseMenuButtonsTo, positionMenu, openBtnMenu } from "./misc";
import { PopupButton, PopupPeer } from "./popup";

export default class DialogsContextMenu {
  private element = document.getElementById('dialogs-contextmenu') as HTMLDivElement;
  private buttons: {
    archive: HTMLButtonElement,
    pin: HTMLButtonElement,
    mute: HTMLButtonElement,
    unread: HTMLButtonElement,
    delete: HTMLButtonElement,
    //clear: HTMLButtonElement,
  } = {} as any;
  private selectedID: number;
  private peerType: 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';
  private filterID: number;

  constructor() {
    parseMenuButtonsTo(this.buttons, this.element.children);

    this.buttons.archive.addEventListener('click', () => {
      let dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      if(dialog) {
        appMessagesManager.editPeerFolders([dialog.peerID], +!dialog.folder_id);
      }
    });

    this.buttons.pin.addEventListener('click', () => {
      appMessagesManager.toggleDialogPin(this.selectedID, this.filterID);
    });

    this.buttons.mute.addEventListener('click', () => {
      appImManager.mutePeer(this.selectedID);
    });

    this.buttons.unread.addEventListener('click', () => {
      const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      if(!dialog) return;

      if(dialog.unread_count) {
        appMessagesManager.readHistory(this.selectedID, dialog.top_message);
        appMessagesManager.markDialogUnread(this.selectedID, true);
      } else {
        appMessagesManager.markDialogUnread(this.selectedID);
      }
    });

    this.buttons.delete.addEventListener('click', () => {
      let firstName = appPeersManager.getPeerTitle(this.selectedID, false, true);

      let callbackFlush = (justClear: boolean) => {
        appMessagesManager.flushHistory(this.selectedID, justClear);
      };

      let callbackLeave = () => {
        appChatsManager.leaveChannel(-this.selectedID);
      };

      let title: string, description: string, buttons: PopupButton[];
      switch(this.peerType) {
        case 'channel': {
          title = 'Leave Channel?';
          description = `Are you sure you want to leave this channel?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: callbackLeave
          }];

          break;
        }

        case 'megagroup': {
          title = 'Leave Group?';
          description = `Are you sure you want to leave this group?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: callbackLeave
          }];

          break;
        }

        case 'chat': {
          title = 'Delete Chat?';
          description = `Are you sure you want to delete chat with <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE FOR ME AND ' + firstName,
            isDanger: true,
            callback: () => callbackFlush(false)
          }, {
            text: 'DELETE JUST FOR ME',
            isDanger: true,
            callback: () => callbackFlush(true)
          }];

          break;
        }

        case 'saved': {
          title = 'Delete Saved Messages?';
          description = `Are you sure you want to delete all your saved messages?`;
          buttons = [{
            text: 'DELETE SAVED MESSAGES',
            isDanger: true,
            callback: () => callbackFlush(false)
          }];

          break;
        }

        case 'group': {
          title = 'Delete and leave Group?';
          description = `Are you sure you want to delete all message history and leave <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE AND LEAVE ' + firstName,
            isDanger: true,
            callback: () => callbackFlush(true)
          }];

          break;
        }
      }

      buttons.push({
        text: 'CANCEL',
        isCancel: true
      });

      let popup = new PopupPeer('popup-delete-chat', {
        peerID: this.selectedID,
        title: title,
        description: description,
        buttons: buttons
      });

      popup.show();
    });
  }

  onContextMenu = (e: MouseEvent | Touch) => {
    let li: HTMLElement = null;
    
    try {
      li = findUpTag(e.target, 'LI');
    } catch(e) {}
    
    if(!li) return;

    if(e instanceof MouseEvent) e.preventDefault();
    if(this.element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent) e.cancelBubble = true;

    this.filterID = appDialogsManager.filterID;

    this.selectedID = +li.getAttribute('data-peerID');
    const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
    const notOurDialog = dialog.peerID != $rootScope.myID;

    // archive button
    if(notOurDialog) {
      const button = this.buttons.archive;
      const condition = dialog.folder_id == 1;
      button.classList.toggle('flip-icon', condition);
      (button.firstElementChild as HTMLElement).innerText = condition ? 'Unarchive' : 'Archive';
      this.buttons.archive.style.display = '';
    } else {
      this.buttons.archive.style.display = 'none';
    }
    
    // pin button
    {
      const button = this.buttons.pin;
      //const condition = !!dialog.pFlags?.pinned;
      const condition = this.filterID > 1 ? appMessagesManager.filtersStorage.filters[this.filterID].pinned_peers.includes(dialog.peerID) : !!dialog.pFlags?.pinned;
      button.classList.toggle('flip-icon', condition);
      (button.firstElementChild as HTMLElement).innerText = condition ? 'Unpin' : 'Pin';
    }

    // mute button
    if(notOurDialog) {
      const button = this.buttons.mute;
      const condition = dialog.notify_settings && dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
      button.classList.toggle('flip-icon', condition);
      (button.firstElementChild as HTMLElement).innerText = condition ? 'Unmute' : 'Mute';
      this.buttons.mute.style.display = '';
    } else {
      this.buttons.mute.style.display = 'none';
    }

    // unread button
    {
      const button = this.buttons.unread;
      const condition = !!(dialog.pFlags?.unread_mark || dialog.unread_count);
      button.classList.toggle('flip-icon', condition);
      (button.firstElementChild as HTMLElement).innerText = condition ? 'Mark as Read' : 'Mark as Unread';
    }

    /* // clear history button
    if(appPeersManager.isChannel(this.selectedID)) {
      this.buttons.clear.style.display = 'none';
    } else {
      this.buttons.clear.style.display = '';
    } */

    // delete button
    let deleteButtonText = '';
    if(appPeersManager.isMegagroup(this.selectedID)) {
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave group';
      this.peerType = 'megagroup';
    } else if(appPeersManager.isChannel(this.selectedID)) {
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave channel';
      this.peerType = 'channel';
    } else if(this.selectedID < 0) {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete and leave';
      this.peerType = 'group';
    } else {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete chat';
      this.peerType = this.selectedID == $rootScope.myID ? 'saved' : 'chat';
    }
    (this.buttons.delete.firstElementChild as HTMLElement).innerText = deleteButtonText;

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
    });
  };
}