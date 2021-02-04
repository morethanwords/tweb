import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, {Dialog} from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { findUpTag } from "../helpers/dom";
import { positionMenu, openBtnMenu } from "./misc";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import PopupDeleteDialog from "./popups/deleteDialog";

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean})[];

  private selectedId: number;
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
        return !isMuted && this.selectedId !== rootScope.myId; 
      }
    }, {
      icon: 'unmute',
      text: 'Unmute',
      onClick: this.onMuteClick,
      verify: () => {
        const isMuted = this.dialog.notify_settings && this.dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
        return isMuted && this.selectedId !== rootScope.myId; 
      }
    }, {
      icon: 'archive',
      text: 'Archive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId === 0 && this.selectedId !== rootScope.myId
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId === 1 && this.selectedId !== rootScope.myId
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
    new PopupDeleteDialog(this.selectedId);
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

    this.selectedId = +li.dataset.peerId;
    this.dialog = appMessagesManager.getDialogByPeerId(this.selectedId)[0];

    this.buttons.forEach(button => {
      const good = button.verify();

      button.element.classList.toggle('hide', !good);
    });

    // delete button
    this.buttons[this.buttons.length - 1].element.firstChild.nodeValue = appPeersManager.getDeleteButtonText(this.selectedId);

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
      this.selectedId = this.dialog = this.filterId = undefined;
    });
  };
}