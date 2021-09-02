/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, {Dialog} from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import rootScope from "../lib/rootScope";
import { positionMenu, openBtnMenu } from "./misc";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import PopupDeleteDialog from "./popups/deleteDialog";
import { i18n } from "../lib/langPack";
import findUpTag from "../helpers/dom/findUpTag";
import appNotificationsManager from "../lib/appManagers/appNotificationsManager";
import PopupPeer from "./popups/peer";
import AppChatFoldersTab from "./sidebarLeft/tabs/chatFolders";
import appSidebarLeft from "./sidebarLeft";
import { toastNew } from "./toast";

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean})[];

  private selectedId: number;
  private filterId: number;
  private dialog: Dialog;

  private init() {
    this.buttons = [{
      icon: 'unread',
      text: 'MarkAsUnread',
      onClick: this.onUnreadClick,
      verify: () => {
        const isUnread = !!(this.dialog.pFlags?.unread_mark || this.dialog.unread_count);
        return !isUnread;
      }
    }, {
      icon: 'readchats',
      text: 'MarkAsRead',
      onClick: this.onUnreadClick,
      verify: () => { 
        const isUnread = !!(this.dialog.pFlags?.unread_mark || this.dialog.unread_count);
        return isUnread;
      }
    }, {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      onClick: this.onPinClick,
      verify: () => {
        const isPinned = this.filterId > 1 ? appMessagesManager.filtersStorage.getFilter(this.filterId).pinned_peers.includes(this.dialog.peerId) : !!this.dialog.pFlags?.pinned;
        return !isPinned;
      }
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: this.onPinClick,
      verify: () => {
        const isPinned = this.filterId > 1 ? appMessagesManager.filtersStorage.getFilter(this.filterId).pinned_peers.includes(this.dialog.peerId) : !!this.dialog.pFlags?.pinned;
        return isPinned;
      }
    }, {
      icon: 'mute',
      text: 'ChatList.Context.Mute',
      onClick: this.onMuteClick,
      verify: () => {
        return this.selectedId !== rootScope.myId && !appNotificationsManager.isPeerLocalMuted(this.dialog.peerId); 
      }
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: this.onUnmuteClick,
      verify: () => {
        return this.selectedId !== rootScope.myId && appNotificationsManager.isPeerLocalMuted(this.dialog.peerId); 
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
    this.element.classList.add('contextmenu');
    document.getElementById('page-chats').append(this.element);
  }

  private onArchiveClick = () => {
    let dialog = appMessagesManager.getDialogOnly(this.selectedId);
    if(dialog) {
      appMessagesManager.editPeerFolders([dialog.peerId], +!dialog.folder_id);
    }
  };

  private onPinClick = () => {
    appMessagesManager.toggleDialogPin(this.selectedId, this.filterId).catch(err => {
      if(err.type === 'PINNED_DIALOGS_TOO_MUCH') {
        if(this.filterId >= 1) {
          toastNew({langPackKey: 'PinFolderLimitReached'});
        } else {
          new PopupPeer('pinned-dialogs-too-much', {
            buttons: [{
              langKey: 'OK',
              isCancel: true
            }, {
              langKey: 'FiltersSetupPinAlert',
              callback: () => {
                new AppChatFoldersTab(appSidebarLeft).open();
              }
            }],
            descriptionLangKey: 'PinToTopLimitReached2',
            descriptionLangArgs: [i18n('Chats', [rootScope.config.pinned_dialogs_count_max])]
          }).show();
        }
      }
    });
  };

  private onUnmuteClick = () => {
    appMessagesManager.mutePeer(this.selectedId, false);
  };
  
  private onMuteClick = () => {
    appMessagesManager.mutePeer(this.selectedId, true);
  };

  private onUnreadClick = () => {
    const dialog = appMessagesManager.getDialogOnly(this.selectedId);
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
    this.dialog = appMessagesManager.getDialogOnly(this.selectedId);

    this.buttons.forEach(button => {
      const good = button.verify();

      button.element.classList.toggle('hide', !good);
    });

    // delete button
    this.buttons[this.buttons.length - 1].element.lastChild.replaceWith(i18n(appPeersManager.getDeleteButtonText(this.selectedId)));

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
      this.selectedId = this.dialog = this.filterId = undefined;
    });
  };
}
