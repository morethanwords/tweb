import appChatsManager from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, {Dialog} from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { findUpTag } from "../helpers/dom";
import { positionMenu, openBtnMenu } from "./misc";
import { PopupButton } from "./popups";
import PopupPeer from "./popups/peer";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean})[];

  private selectedId: number;
  private peerType: 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';
  private filterId: number;
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
        const isPinned = this.filterId > 1 ? appMessagesManager.filtersStorage.filters[this.filterId].pinned_peers.includes(this.dialog.peerId) : !!this.dialog.pFlags?.pinned;
        return !isPinned;
      }
    }, {
      icon: 'unpin',
      text: 'Unpin',
      onClick: this.onPinClick,
      verify: () => {
        const isPinned = this.filterId > 1 ? appMessagesManager.filtersStorage.filters[this.filterId].pinned_peers.includes(this.dialog.peerId) : !!this.dialog.pFlags?.pinned;
        return isPinned;
      }
    }, {
      icon: 'mute',
      text: 'Mute',
      onClick: this.onMuteClick,
      verify: () => {
        const isMuted = this.dialog.notify_settings && this.dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
        return !isMuted && this.selectedId != rootScope.myId; 
      }
    }, {
      icon: 'unmute',
      text: 'Unmute',
      onClick: this.onMuteClick,
      verify: () => {
        const isMuted = this.dialog.notify_settings && this.dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
        return isMuted && this.selectedId != rootScope.myId; 
      }
    }, {
      icon: 'archive',
      text: 'Archive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId == 0 && this.selectedId != rootScope.myId
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId == 1 && this.selectedId != rootScope.myId
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
    let dialog = appMessagesManager.getDialogByPeerId(this.selectedId)[0];
    if(dialog) {
      appMessagesManager.editPeerFolders([dialog.peerId], +!dialog.folder_id);
    }
  };

  private onPinClick = () => {
    appMessagesManager.toggleDialogPin(this.selectedId, this.filterId);
  };
  
  private onMuteClick = () => {
    appMessagesManager.mutePeer(this.selectedId);
  };

  private onUnreadClick = () => {
    const dialog = appMessagesManager.getDialogByPeerId(this.selectedId)[0];
    if(!dialog) return;

    if(dialog.unread_count) {
      appMessagesManager.readHistory(this.selectedId, dialog.top_message);
      appMessagesManager.markDialogUnread(this.selectedId, true);
    } else {
      appMessagesManager.markDialogUnread(this.selectedId);
    }
  };

  private onDeleteClick = () => {
    let firstName = appPeersManager.getPeerTitle(this.selectedId, false, true);

    let callbackFlush = (justClear?: true) => {
      appMessagesManager.flushHistory(this.selectedId, justClear);
    };

    let callbackLeave = () => {
      appChatsManager.leave(-this.selectedId);
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
      peerId: this.selectedId,
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

    this.filterId = appDialogsManager.filterId;

    this.selectedId = +li.getAttribute('data-peerId');
    this.dialog = appMessagesManager.getDialogByPeerId(this.selectedId)[0];

    this.buttons.forEach(button => {
      const good = button.verify();

      button.element.classList.toggle('hide', !good);
    });

    // delete button
    let deleteButtonText = '';
    if(appPeersManager.isMegagroup(this.selectedId)) {
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave group';
      this.peerType = 'megagroup';
    } else if(appPeersManager.isChannel(this.selectedId)) {
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave channel';
      this.peerType = 'channel';
    } else if(this.selectedId < 0) {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete and leave';
      this.peerType = 'group';
    } else {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete chat';
      this.peerType = this.selectedId == rootScope.myId ? 'saved' : 'chat';
    }
    this.buttons[this.buttons.length - 1].element.firstChild.nodeValue = deleteButtonText;

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
      this.selectedId = this.dialog = this.filterId = undefined;
    });
  };
}