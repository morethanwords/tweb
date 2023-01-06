/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Dialog} from '../lib/appManagers/appMessagesManager';
import type {ApiLimitType} from '../lib/mtproto/api_methods';
import type {ForumTopic} from '../layer';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '../lib/appManagers/appDialogsManager';
import rootScope from '../lib/rootScope';
import {ButtonMenuItemOptionsVerifiable, ButtonMenuSync} from './buttonMenu';
import PopupDeleteDialog from './popups/deleteDialog';
import {i18n, LangPackKey, _i18n} from '../lib/langPack';
import findUpTag from '../helpers/dom/findUpTag';
import PopupPeer, {PopupPeerButton} from './popups/peer';
import AppChatFoldersTab from './sidebarLeft/tabs/chatFolders';
import appSidebarLeft from './sidebarLeft';
import {toastNew} from './toast';
import PopupMute from './popups/mute';
import {AppManagers} from '../lib/appManagers/managers';
import positionMenu from '../helpers/positionMenu';
import contextMenuController from '../helpers/contextMenuController';
import {GENERAL_TOPIC_ID} from '../lib/mtproto/mtproto_config';

export default class DialogsContextMenu {
  private element: HTMLElement;
  private buttons: ButtonMenuItemOptionsVerifiable[];

  private peerId: PeerId;
  private filterId: number;
  private threadId: number;
  private dialog: Dialog | ForumTopic.forumTopic;
  private canManageTopics: boolean;

  constructor(private managers: AppManagers) {

  }

  private init() {
    this.buttons = [{
      icon: 'unread',
      text: 'MarkAsUnread',
      onClick: this.onUnreadClick,
      verify: async() => !this.threadId && !(await this.managers.appMessagesManager.isDialogUnread(this.dialog))
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
        if(this.threadId && !this.canManageTopics) {
          return false;
        }

        const isPinned = this.filterId !== undefined && this.filterId > 1 ?
          (await this.managers.appMessagesManager.getFilter(this.filterId)).pinnedPeerIds.includes(this.dialog.peerId) :
          !!this.dialog.pFlags?.pinned;
        return !isPinned;
      }
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: this.onPinClick,
      verify: async() => {
        if(this.threadId && !this.canManageTopics) {
          return false;
        }

        const isPinned = this.filterId !== undefined && this.filterId > 1 ?
          (await this.managers.appMessagesManager.getFilter(this.filterId)).pinnedPeerIds.includes(this.dialog.peerId) :
          !!this.dialog.pFlags?.pinned;
        return isPinned;
      }
    }, {
      icon: 'mute',
      text: 'ChatList.Context.Mute',
      onClick: this.onMuteClick,
      verify: async() => {
        return this.peerId !== rootScope.myId && !(await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.dialog.peerId, threadId: this.threadId}));
      }
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: this.onUnmuteClick,
      verify: async() => {
        return this.peerId !== rootScope.myId && (await this.managers.appNotificationsManager.isPeerLocalMuted({peerId: this.dialog.peerId, threadId: this.threadId}));
      }
    }, {
      icon: 'archive',
      text: 'Archive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId === 0 && this.peerId !== rootScope.myId
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: this.onArchiveClick,
      verify: () => this.filterId === 1 && this.peerId !== rootScope.myId
    }, {
      icon: 'eye2',
      text: 'Hide',
      onClick: this.hideTopic,
      verify: async() => {
        return this.canManageTopics && (this.dialog as ForumTopic.forumTopic).id === GENERAL_TOPIC_ID;
      }
    }, {
      icon: 'lock',
      text: 'CloseTopic',
      onClick: this.toggleTopic,
      verify: () => {
        return this.canManageTopics && !(this.dialog as ForumTopic.forumTopic).pFlags.closed;
      }
    }, {
      icon: 'lockoff',
      text: 'RestartTopic',
      onClick: this.toggleTopic,
      verify: () => {
        return this.canManageTopics && !!(this.dialog as ForumTopic.forumTopic).pFlags.closed;
      }
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: async() => {
        if(this.threadId) {
          if(!this.canManageTopics) {
            return false;
          }

          return (this.dialog as ForumTopic.forumTopic).id !== GENERAL_TOPIC_ID;
        }

        return true;
      }
    }];

    this.element = ButtonMenuSync({buttons: this.buttons});
    this.element.id = 'dialogs-contextmenu';
    this.element.classList.add('contextmenu');
    document.getElementById('page-chats').append(this.element);
  }

  private onArchiveClick = async() => {
    const dialog = await this.managers.appMessagesManager.getDialogOnly(this.peerId);
    if(dialog) {
      this.managers.appMessagesManager.editPeerFolders([dialog.peerId], +!dialog.folder_id);
    }
  };

  private hideTopic = () => {
    this.managers.appChatsManager.editForumTopic({
      chatId: this.peerId.toChatId(),
      topicId: this.threadId,
      hidden: true
    });
  };

  private toggleTopic = () => {
    this.managers.appChatsManager.editForumTopic({
      chatId: this.peerId.toChatId(),
      topicId: this.threadId,
      closed: !(this.dialog as ForumTopic.forumTopic).pFlags.closed
    });
  };

  private onPinClick = () => {
    const {peerId, filterId, threadId} = this;
    this.managers.appMessagesManager.toggleDialogPin({
      peerId,
      filterId,
      topicId: threadId
    }).catch(async(err: ApiError) => {
      if(err.type === 'PINNED_DIALOGS_TOO_MUCH' || err.type === 'PINNED_TOO_MUCH') {
        if(threadId) {
          this.managers.apiManager.getLimit('topicPin').then((limit) => {
            toastNew({langPackKey: 'LimitReachedPinnedTopics', langPackArguments: [limit]});
          });
        } else if(filterId >= 1) {
          toastNew({langPackKey: 'PinFolderLimitReached'});
        } else {
          // const a: {[type in ApiLimitType]?: {
          //   title: LangPackKey,
          //   description: LangPackKey,
          //   descriptionPremium: LangPackKey,
          //   descriptionLocked: LangPackKey,
          //   icon: string
          // }} = {
          //   pin: {
          //     title: 'LimitReached',
          //     description: 'LimitReachedPinDialogs',
          //     descriptionPremium: 'LimitReachedPinDialogsPremium',
          //     descriptionLocked: 'LimitReachedPinDialogsLocked',
          //     icon: 'limit_pin'
          //   }
          // };

          // class P extends PopupPeer {
          //   constructor(options: {
          //     isPremium: boolean,
          //     limit: number,
          //     limitPremium: number
          //   }, _a: typeof a[keyof typeof a]) {
          //     super('popup-limit', {
          //       buttons: options.isPremium === undefined ? [{
          //         langKey: 'LimitReached.Ok',
          //         isCancel: true
          //       }] : (options.isPremium ? [{
          //         langKey: 'OK',
          //         isCancel: true
          //       }] : [{
          //         langKey: 'IncreaseLimit',
          //         callback: () => {

          //         }
          //       }, {
          //         langKey: 'Cancel',
          //         isCancel: true
          //       }]),
          //       descriptionLangKey: options.isPremium === undefined ? _a.descriptionLocked : (options.isPremium ? _a.descriptionPremium : _a.description),
          //       descriptionLangArgs: options.isPremium ? [options.limitPremium] : [options.limit, options.limitPremium],
          //       titleLangKey: _a.title
          //     });

          //     const isLocked = options.isPremium === undefined;
          //     if(isLocked) {
          //       this.element.classList.add('is-locked');
          //     }

          //     const limitContainer = document.createElement('div');
          //     limitContainer.classList.add('popup-limit-line');

          //     const hint = document.createElement('div');
          //     hint.classList.add('popup-limit-hint');
          //     const i = document.createElement('span');
          //     i.classList.add('popup-limit-hint-icon', 'tgico-' + _a.icon);
          //     hint.append(i, '' + (options.isPremium ? options.limitPremium : options.limit));

          //     limitContainer.append(hint);

          //     if(!isLocked) {
          //       const limit = document.createElement('div');
          //       limit.classList.add('limit-line');

          //       const free = document.createElement('div');
          //       free.classList.add('limit-line-free');

          //       const premium = document.createElement('div');
          //       premium.classList.add('limit-line-premium');

          //       limit.append(free, premium);

          //       _i18n(free, 'LimitFree');
          //       premium.append(i18n('LimitPremium'), '' + options.limitPremium);

          //       limitContainer.append(limit);
          //     }

          //     this.container.insertBefore(limitContainer, this.description);

          //     if(options.isPremium === false) {
          //       this.buttons.pop().element.remove();
          //     }
          //   }
          // }

          // async function showLimitPopup(type: keyof typeof a) {
          //   const _a = a[type];
          //   const [appConfig, limit, limitPremium] = await Promise.all([
          //     rootScope.managers.apiManager.getAppConfig(),
          //     ...[false, true].map((v) => rootScope.managers.apiManager.getLimit(type, v))
          //   ]);
          //   const isLocked = appConfig.premium_purchase_blocked;
          //   new P({
          //     isPremium: isLocked ? undefined : rootScope.premium,
          //     limit,
          //     limitPremium
          //   }, _a).show();
          // }

          // showLimitPopup('pin');

          const config = await this.managers.apiManager.getConfig();
          new PopupPeer('pinned-dialogs-too-much', {
            buttons: [{
              langKey: 'OK',
              isCancel: true
            }, {
              langKey: 'FiltersSetupPinAlert',
              callback: () => {
                appSidebarLeft.createTab(AppChatFoldersTab).open();
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
    this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, mute: false, threadId: this.threadId});
  };

  private onMuteClick = () => {
    new PopupMute(this.peerId, this.threadId);
  };

  private onUnreadClick = async() => {
    const {peerId, dialog} = this;
    if(dialog.unread_count) {
      this.managers.appMessagesManager.readHistory(peerId, dialog.top_message, this.threadId);

      if(!this.threadId) {
        this.managers.appMessagesManager.markDialogUnread(peerId, true);
      }
    } else if(!this.threadId) {
      this.managers.appMessagesManager.markDialogUnread(peerId);
    }
  };

  private onDeleteClick = () => {
    new PopupDeleteDialog(this.peerId, undefined, undefined, this.threadId);
  };

  onContextMenu = (e: MouseEvent | Touch | TouchEvent) => {
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
      this.peerId = li.dataset.peerId.toPeerId();
      this.threadId = +li.dataset.threadId || undefined;
      this.dialog = await this.managers.dialogsStorage.getDialogOrTopic(this.peerId, this.threadId);
      this.filterId = this.threadId ? undefined : appDialogsManager.filterId;
      this.canManageTopics = this.threadId ? await this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_topics') : undefined;

      await Promise.all(this.buttons.map(async(button) => {
        const good = await button.verify();

        button.element.classList.toggle('hide', !good);
      }));

      const langPackKey: LangPackKey = this.threadId ? 'Delete' : await this.managers.appPeersManager.getDeleteButtonText(this.peerId);
      // delete button
      this.buttons[this.buttons.length - 1].element.lastChild.replaceWith(i18n(langPackKey));

      li.classList.add('menu-open');
      positionMenu(e, this.element);
      contextMenuController.openBtnMenu(this.element, () => {
        li.classList.remove('menu-open');
        this.peerId = this.dialog = this.filterId = this.threadId = this.canManageTopics = undefined;
      });
    };

    r();
  };
}
