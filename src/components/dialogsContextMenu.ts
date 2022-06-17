/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager, { DIALOG_LIST_ELEMENT_TAG } from "../lib/appManagers/appDialogsManager";
import type { Dialog } from "../lib/appManagers/appMessagesManager";
import rootScope from "../lib/rootScope";
import ButtonMenu, { ButtonMenuItemOptions } from "./buttonMenu";
import PopupDeleteDialog from "./popups/deleteDialog";
import { i18n } from "../lib/langPack";
import findUpTag from "../helpers/dom/findUpTag";
import PopupPeer from "./popups/peer";
import AppChatFoldersTab from "./sidebarLeft/tabs/chatFolders";
import appSidebarLeft from "./sidebarLeft";
import { toastNew } from "./toast";
import PopupMute from "./popups/mute";
import { AppManagers } from "../lib/appManagers/managers";
import positionMenu from "../helpers/positionMenu";
import contextMenuController from "../helpers/contextMenuController";

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean | Promise<boolean>})[];

  private selectedId: PeerId;
  private filterId: number;
  private dialog: Dialog;

  constructor(private managers: AppManagers) {

  }

  private init() {
    this.buttons = [{
      icon: 'unread',
      text: 'MarkAsUnread',
      onClick: this.onUnreadClick,
      verify: async() => !(await this.managers.appMessagesManager.isDialogUnread(this.dialog))
    }, {
      icon: 'readchats',
      text: 'MarkAsRead',
      onClick: this.onUnreadClick,
      verify: () => this.managers.appMessagesManager.isDialogUnread(this.dialog)
    }, {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      onClick: this.onPinClick,
      verify: async() => {
        const isPinned = this.filterId > 1 ? 
          (await this.managers.appMessagesManager.getFilter(this.filterId)).pinnedPeerIds.includes(this.dialog.peerId) : 
          !!this.dialog.pFlags?.pinned;
        return !isPinned;
      }
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: this.onPinClick,
      verify: async() => {
        const isPinned = this.filterId > 1 ? 
          (await this.managers.appMessagesManager.getFilter(this.filterId)).pinnedPeerIds.includes(this.dialog.peerId) : 
          !!this.dialog.pFlags?.pinned;
        return isPinned;
      }
    }, {
      icon: 'mute',
      text: 'ChatList.Context.Mute',
      onClick: this.onMuteClick,
      verify: async() => {
        return this.selectedId !== rootScope.myId && !(await this.managers.appNotificationsManager.isPeerLocalMuted(this.dialog.peerId)); 
      }
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: this.onUnmuteClick,
      verify: async() => {
        return this.selectedId !== rootScope.myId && (await this.managers.appNotificationsManager.isPeerLocalMuted(this.dialog.peerId)); 
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

  private onArchiveClick = async() => {
    const dialog = await this.managers.appMessagesManager.getDialogOnly(this.selectedId);
    if(dialog) {
      this.managers.appMessagesManager.editPeerFolders([dialog.peerId], +!dialog.folder_id);
    }
  };

  private onPinClick = () => {
    this.managers.appMessagesManager.toggleDialogPin(this.selectedId, this.filterId).catch(async(err) => {
      if(err.type === 'PINNED_DIALOGS_TOO_MUCH') {
        if(this.filterId >= 1) {
          toastNew({langPackKey: 'PinFolderLimitReached'});
        } else {
          const config = await this.managers.apiManager.getConfig();
          new PopupPeer('pinned-dialogs-too-much', {
            buttons: [{
              langKey: 'OK',
              isCancel: true
            }, {
              langKey: 'FiltersSetupPinAlert',
              callback: () => {
                appSidebarLeft.createTab(AppChatFoldersTab);
              }
            }],
            descriptionLangKey: 'PinToTopLimitReached2',
            descriptionLangArgs: [i18n('Chats', [config.pinned_dialogs_count_max])]
          }).show();
        }
      }
    });
  };

  private onUnmuteClick = () => {
    this.managers.appMessagesManager.togglePeerMute(this.selectedId, false);
  };
  
  private onMuteClick = () => {
    new PopupMute(this.selectedId);
  };

  private onUnreadClick = async() => {
    const selectedId = this.selectedId;
    const dialog = await this.managers.appMessagesManager.getDialogOnly(selectedId);
    if(!dialog) return;

    if(dialog.unread_count) {
      this.managers.appMessagesManager.readHistory(selectedId, dialog.top_message);
      this.managers.appMessagesManager.markDialogUnread(selectedId, true);
    } else {
      this.managers.appMessagesManager.markDialogUnread(selectedId);
    }
  };

  private onDeleteClick = () => {
    new PopupDeleteDialog(this.selectedId/* , 'delete' */);
  };

  onContextMenu = (e: MouseEvent | Touch) => {
    if(this.init) {
      this.init();
      this.init = null;
    }

    let li: HTMLElement = null;
    
    try {
      li = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
    } catch(e) {}
    
    if(!li) return;

    if(e instanceof MouseEvent) e.preventDefault();
    if(this.element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent) e.cancelBubble = true;

    const r = async() => {
      this.filterId = appDialogsManager.filterId;
      this.selectedId = li.dataset.peerId.toPeerId();
      this.dialog = await this.managers.appMessagesManager.getDialogOnly(this.selectedId);
  
      await Promise.all(this.buttons.map(async(button) => {
        const good = await button.verify();
  
        button.element.classList.toggle('hide', !good);
      }));
  
      // delete button
      this.buttons[this.buttons.length - 1].element.lastChild.replaceWith(i18n(await this.managers.appPeersManager.getDeleteButtonText(this.selectedId)));
  
      li.classList.add('menu-open');
      positionMenu(e, this.element);
      contextMenuController.openBtnMenu(this.element, () => {
        li.classList.remove('menu-open');
        this.selectedId = this.dialog = this.filterId = undefined;
      });
    };

    r();
  };
}
