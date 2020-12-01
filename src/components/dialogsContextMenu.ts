import appChatsManager from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, {Dialog} from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { findUpTag } from "../helpers/dom";
import { positionMenu, openBtnMenu } from "./misc";
import { PopupButton } from "./popup";
import PopupPeer from "./popupPeer";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean})[];

  private selectedID: number;
  private peerType: 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';
  private filterID: number;
  private dialog: Dialog;

  private init() {
    this.buttons = [{
      icon: 'unread',
      text: 'Mark as unread',
      onClick: this.onUnreadClick,
      verify: () => {
        const isUnread = !!(this.dialog.pFlags?.unread_mark || this.dialog.unread_count);
        return !isUnread;
      }
    }, {
      icon: 'readchats',
      text: 'Mark as read',
      onClick: this.onUnreadClick,
      verify: () => { 
        const isUnread = !!(this.dialog.pFlags?.unread_mark || this.dialog.unread_count);
        return isUnread;
      }
    }, {
      icon: 'pin',
      text: 'Pin',
      onClick: this.onPinClick,
      verify: () => {
        const isPinned = this.filterID > 1 ? appMessagesManager.filtersStorage.filters[this.filterID].pinned_peers.includes(this.dialog.peerID) : !!this.dialog.pFlags?.pinned;
        return !isPinned;
      }
    }, {
      icon: 'unpin',
      text: 'Unpin',
      onClick: this.onPinClick,
      verify: () => {
        const isPinned = this.filterID > 1 ? appMessagesManager.filtersStorage.filters[this.filterID].pinned_peers.includes(this.dialog.peerID) : !!this.dialog.pFlags?.pinned;
        return isPinned;
      }
    }, {
      icon: 'mute',
      text: 'Mute',
      onClick: this.onMuteClick,
      verify: () => {
        const isMuted = this.dialog.notify_settings && this.dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
        return !isMuted && this.selectedID != rootScope.myID; 
      }
    }, {
      icon: 'unmute',
      text: 'Unmute',
      onClick: this.onMuteClick,
      verify: () => {
        const isMuted = this.dialog.notify_settings && this.dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
        return isMuted && this.selectedID != rootScope.myID; 
      }
    }, {
      icon: 'archive',
      text: 'Archive',
      onClick: this.onArchiveClick,
      verify: () => this.filterID == 0 && this.selectedID != rootScope.myID
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: this.onArchiveClick,
      verify: () => this.filterID == 1 && this.selectedID != rootScope.myID
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => true
    }];

    this.element = ButtonMenu(this.buttons);
    this.element.id = 'dialogs-contextmenu';
    document.getElementById('page-chats').append(this.element);
  }

  private onArchiveClick = () => {
    let dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
    if(dialog) {
      appMessagesManager.editPeerFolders([dialog.peerID], +!dialog.folder_id);
    }
  };

  private onPinClick = () => {
    appMessagesManager.toggleDialogPin(this.selectedID, this.filterID);
  };
  
  private onMuteClick = () => {
    appMessagesManager.mutePeer(this.selectedID);
  };

  private onUnreadClick = () => {
    const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
    if(!dialog) return;

    if(dialog.unread_count) {
      appMessagesManager.readHistory(this.selectedID, dialog.top_message);
      appMessagesManager.markDialogUnread(this.selectedID, true);
    } else {
      appMessagesManager.markDialogUnread(this.selectedID);
    }
  };

  private onDeleteClick = () => {
    let firstName = appPeersManager.getPeerTitle(this.selectedID, false, true);

    let callbackFlush = (justClear?: true) => {
      appMessagesManager.flushHistory(this.selectedID, justClear);
    };

    let callbackLeave = () => {
      appChatsManager.leave(-this.selectedID);
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
          callback: () => callbackFlush()
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
          callback: () => callbackFlush()
        }];

        break;
      }

      case 'group': {
        title = 'Delete and leave Group?';
        description = `Are you sure you want to delete all message history and leave <b>${firstName}</b>?`;
        buttons = [{
          text: 'DELETE AND LEAVE ' + firstName,
          isDanger: true,
          callback: () => callbackLeave()
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
  };

  onContextMenu = (e: MouseEvent | Touch) => {
    if(this.init) {
      this.init();
      this.init = null;
    }

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
    this.dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];

    this.buttons.forEach(button => {
      const good = button.verify();

      button.element.classList.toggle('hide', !good);
    });

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
      this.peerType = this.selectedID == rootScope.myID ? 'saved' : 'chat';
    }
    this.buttons[this.buttons.length - 1].element.firstChild.nodeValue = deleteButtonText;

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
      this.selectedID = this.dialog = this.filterID = undefined;
    });
  };
}