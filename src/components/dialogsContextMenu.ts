import type {Dialog} from '@appManagers/appMessagesManager';
import type {ForumTopic} from '@layer';
import type {AnyDialog} from '@lib/storages/dialogs';
import appDialogsManager, {
  findDialogListElement
} from '@lib/appDialogsManager';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import PopupDeleteDialog from '@components/popups/deleteDialog';
import {i18n, LangPackKey, _i18n} from '@lib/langPack';
import {toastNew} from '@components/toast';
import PopupMute from '@components/popups/mute';
import {AppManagers} from '@lib/managers';
import {CAN_HIDE_TOPIC, FOLDER_ID_ARCHIVE, GENERAL_TOPIC_ID, REAL_FOLDER_ID, REAL_FOLDERS} from '@appManagers/constants';
import showLimitPopup from '@components/popups/limit';
import createContextMenu from '@helpers/dom/createContextMenu';
import PopupElement from '@components/popups';
import showChatPreviewPopup, {chatPreviewAnchorFromDialogRow} from '@components/popups/chatPreview';
import cancelEvent from '@helpers/dom/cancelEvent';
import IS_SHARED_WORKER_SUPPORTED from '@environment/sharedWorkerSupport';
import appImManager from '@lib/appImManager';
import {isDialog, isForumTopic, isMonoforumDialog, isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import createSubmenuTrigger, {CreateSubmenuArgs} from '@components/createSubmenuTrigger';
import type AddToFolderDropdownMenu from '@components/addToFolderDropdownMenu';
import memoizeAsyncWithTTL from '@helpers/memoizeAsyncWithTTL';
import {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import {openRemoveFeePopup} from '@components/chat/removeFee';
import apiManagerProxy from '@lib/apiManagerProxy';
import canRemoveCommunityPeer from '@appManagers/utils/communities/canRemovePeer';
import isCollapsedCommunity from '@appManagers/utils/communities/isCollapsedCommunity';
import type {
  CommunityLinkedPeerKind
} from '@appManagers/utils/communities/getCommunityLinkedPeerKind';
import type {
  CommunityDialog
} from '@appManagers/appCommunitiesManager';
import leaveCommunityWithConfirmation, {
  canLeaveCommunity
} from '@components/communities/leaveCommunity';
import removeChatFromCommunityWithConfirmation
from '@components/communities/removeChatFromCommunity';
import {
  showCommunityMutePopup,
  unmuteCommunity
} from '@components/communities/communityMute';

/**
 * What an item does on a chat row inside a Community panel (`data-community-chat-kind`),
 * on top of its own `verify`:
 * - `undefined` — nothing special, the item behaves as it does for any other dialog
 * - `'only'` — the item exists for Community chats only
 * - `'expanded'` — the item acts on the chat's place in OUR chat list, so it is offered
 *   only while the Community isn't folded into a single row (where those chats have no
 *   place of their own)
 */
type CommunityChatMode = 'only' | 'expanded';

type DialogContextMenuButton = ButtonMenuItemOptionsVerifiable & {
  communityChat?: CommunityChatMode
};

export default class DialogsContextMenu {
  private buttons: DialogContextMenuButton[];

  private peerId: PeerId;
  private filterId: number;
  private threadId: number;
  private monoforumParentPeerId?: PeerId;
  private dialog: AnyDialog | MonoforumDialog;
  private canManageTopics: boolean;
  private canDelete: boolean;
  private canRemoveFromCommunity: boolean;
  private communityId?: ChatId;
  private communityDialog?: CommunityDialog;
  private isCommunityDialog = false;
  private communityChatKind?: CommunityLinkedPeerKind;
  private isCommunityCollapsed = false;
  private li: HTMLElement;
  private addToFolderMenu: InstanceType<typeof AddToFolderDropdownMenu>;

  constructor(private managers: AppManagers) {

  }

  public attach(element: HTMLElement) {
    createContextMenu({
      listenTo: element,
      buttons: this.getButtons(),
      onOpen: async(e, li) => {
        this.li = li;
        li.classList.add('menu-open');
        this.peerId = li.dataset.peerId.toPeerId();
        this.communityId = li.dataset.communityId ?
          (+li.dataset.communityId).toChatId() :
          undefined;
        this.communityChatKind = li.dataset.communityChatKind as
          CommunityLinkedPeerKind | undefined;
        this.isCommunityDialog = !!this.communityId &&
          !this.communityChatKind &&
          this.peerId.toChatId() === this.communityId;
        this.communityDialog = this.isCommunityDialog ?
          apiManagerProxy.getCommunityDialog(this.communityId) :
          undefined;
        this.isCommunityCollapsed = !!this.communityChatKind &&
          isCollapsedCommunity(apiManagerProxy.getChat(this.communityId));
        this.threadId = +li.dataset.threadId || undefined;
        this.monoforumParentPeerId = +li.dataset.monoforumParentPeerId || undefined;

        if(li.dataset.isAllChats) {
          throw 'All chats dialog';
        }

        this.dialog = this.isCommunityDialog ?
          undefined :
          this.monoforumParentPeerId ?
            await this.managers.monoforumDialogsStorage.getDialogByParent(this.monoforumParentPeerId, this.peerId):
            await this.managers.dialogsStorage.getAnyDialog(this.peerId, this.threadId);
        this.filterId = this.threadId ? undefined : appDialogsManager.filterId;
        this.canManageTopics = isForumTopic(this.dialog) ? await this.managers.dialogsStorage.canManageTopic(this.dialog) : undefined;
        this.canDelete = await this.checkIfCanDelete();
        this.canRemoveFromCommunity = !!this.communityId &&
          canRemoveCommunityPeer(
            apiManagerProxy.getChat(this.communityId),
            apiManagerProxy.getPeer(this.peerId)
          );
      },
      onOpenBefore: async() => {
        this.buttons?.forEach(button => button?.onOpen?.());
        // delete button
        const langPackKey: LangPackKey = this.threadId ? 'Delete' : await this.managers.appPeersManager.getDeleteButtonText(this.peerId);
        const lastButton = this.buttons[this.buttons.length - 1];
        if(lastButton?.element) {
          lastButton.element.lastChild.replaceWith(i18n(langPackKey));
        }
      },
      onClose: () => {
        this.buttons?.forEach(button => button?.onClose?.());
        this.li.classList.remove('menu-open');

        this.li =
        this.peerId =
        this.dialog =
        this.filterId =
        this.threadId =
        this.monoforumParentPeerId =
        this.canManageTopics = undefined;
        this.canRemoveFromCommunity = undefined;
        this.communityId = undefined;
        this.communityDialog = undefined;
        this.isCommunityDialog = false;
        this.communityChatKind = undefined;
        this.isCommunityCollapsed = false;
      },
      findElement: (e) => {
        return findDialogListElement(e.target);
      }
    });
  }

  private getButtons() {
    if(this.buttons) {
      return this.buttons;
    }

    const [appSettings] = useAppSettings();
    this.buttons = [{
      icon: 'newtab',
      text: 'OpenInNewTab',
      onClick: (e: MouseEvent | TouchEvent) => {
        appDialogsManager.openDialogInNewTab(this.li);
        cancelEvent(e);
      },
      verify: () => IS_SHARED_WORKER_SUPPORTED &&
        !this.monoforumParentPeerId &&
        this.canOpenCommunityChat()
    }, {
      icon: 'topics',
      text: 'Community.View',
      onClick: () => {
        appDialogsManager.toggleForumTabByPeerId(
          this.peerId,
          true,
          false
        );
      },
      verify: () => this.isCommunityDialog
    }, {
      icon: 'eye',
      text: 'ChatList.Context.Preview',
      onClick: this.onPreviewClick,
      // a Community chat we only watch has no dialog of its own, but its history is
      // right there in the row — and shift+click already previews it
      verify: () => !!this.dialog || this.communityChatKind === 'viewable'
    }, {
      icon: 'topics',
      text: 'TopicViewAsTopics',
      onClick: () => {
        appImManager.toggleViewAsMessages(this.peerId, false);
      },
      // the flag outlives the forum it was set for, so ask the peer too
      verify: () => apiManagerProxy.isForum(this.peerId) &&
        !!(this.dialog && (this.dialog as Dialog).pFlags.view_forum_as_messages)
    }, {
      icon: 'topics',
      text: 'SavedViewAsChats',
      onClick: () => {
        appImManager.toggleViewAsMessages(this.peerId, false);
      },
      verify: () => this.peerId === rootScope.myId && !appSettings.savedAsForum && !this.threadId
    }, {
      icon: 'message',
      text: 'SavedViewAsMessages',
      onClick: () => {
        appImManager.toggleViewAsMessages(this.peerId, true);
      },
      verify: () => this.peerId === rootScope.myId && appSettings.savedAsForum && !this.threadId
    }, {
      icon: 'unread',
      text: 'MarkAsUnread',
      onClick: this.onUnreadClick,
      verify: async() => !!this.dialog &&
        !this.isCommunityDialog &&
        !this.threadId &&
        !(await this.managers.appMessagesManager.isDialogUnread(this.dialog))
    }, {
      icon: 'readchats',
      text: 'MarkAsRead',
      onClick: this.onUnreadClick,
      verify: () => this.isCommunityDialog ?
        !!(
          this.communityDialog?.unreadCount ||
          this.communityDialog?.unreadMarked
        ) :
        !!this.dialog &&
          this.managers.appMessagesManager.isDialogUnread(this.dialog)
    }, createSubmenuTrigger({
      options: {
        icon: 'folder',
        text: 'AddToFolder',
        communityChat: 'expanded',
        onClose: () => {
          this.addToFolderMenu?.controls.closeTooltip?.();
        },
        verify: () => isDialog(this.dialog) && this.hasFilters()
      },
      createSubmenu: this.createAddToFolderSubmenu
    }), {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      communityChat: 'expanded',
      onClick: this.onPinClick,
      verify: async() => {
        if(this.isCommunityDialog) {
          return !this.communityDialog?.pFlags.pinned;
        }
        if(!this.dialog) return false;
        if(isMonoforumDialog(this.dialog)) return false;

        if(isSavedDialog(this.dialog)) {
          return !this.dialog.pFlags.pinned;
        }

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
      communityChat: 'expanded',
      onClick: this.onPinClick,
      verify: async() => {
        if(this.isCommunityDialog) {
          return !!this.communityDialog?.pFlags.pinned;
        }
        if(!this.dialog) return false;
        if(isMonoforumDialog(this.dialog)) return false;

        if(isSavedDialog(this.dialog)) {
          return !!this.dialog.pFlags.pinned;
        }

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
        if(this.isCommunityDialog) {
          // await it: the managers are async proxies, and `!promise` is always false
          return !(await this.managers.appCommunitiesManager
          .isCommunityMuted(this.communityId));
        }
        return !!this.dialog &&
          !this.monoforumParentPeerId &&
          this.peerId !== rootScope.myId &&
          !(await this.managers.appNotificationsManager.isPeerLocalMuted({
            peerId: this.peerId,
            threadId: this.threadId
          }));
      }
    }, {
      icon: 'unmute',
      text: 'ChatList.Context.Unmute',
      onClick: this.onUnmuteClick,
      verify: () => {
        if(this.isCommunityDialog) {
          return this.managers.appCommunitiesManager
          .isCommunityMuted(this.communityId);
        }
        return !!this.dialog &&
          !this.monoforumParentPeerId &&
          this.peerId !== rootScope.myId &&
          this.managers.appNotificationsManager.isPeerLocalMuted({
            peerId: this.peerId,
            threadId: this.threadId
          });
      }
    }, {
      icon: 'archive',
      text: 'Archive',
      communityChat: 'expanded',
      onClick: this.onArchiveClick,
      verify: () => isDialog(this.dialog) &&
        !this.threadId &&
        !this.monoforumParentPeerId &&
        this.dialog.folder_id !== FOLDER_ID_ARCHIVE &&
        this.peerId !== rootScope.myId
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      communityChat: 'expanded',
      onClick: this.onArchiveClick,
      verify: () => isDialog(this.dialog) &&
        !this.threadId &&
        !this.monoforumParentPeerId &&
        this.dialog.folder_id === FOLDER_ID_ARCHIVE &&
        this.peerId !== rootScope.myId
    }, {
      icon: 'group',
      text: 'Community.ShowSeparately',
      onClick: () => {
        this.managers.appCommunitiesManager.toggleCollapsedInDialogs(
          this.communityId,
          false
        ).catch((error) => {
          console.error('ungroup community error', error);
          toastNew({langPackKey: 'Error.AnError'});
        });
      },
      verify: () => this.isCommunityDialog
    }, {
      icon: 'logout',
      className: 'danger',
      text: 'Community.Leave',
      onClick: this.onLeaveCommunityClick,
      verify: () => this.isCommunityDialog && canLeaveCommunity(
        apiManagerProxy.getChat(this.communityId)
      )
    }, CAN_HIDE_TOPIC ? {
      icon: 'hide',
      text: 'Hide',
      onClick: this.onHideTopicClick,
      verify: () => {
        return this.canManageTopics && (this.dialog as ForumTopic.forumTopic).id === GENERAL_TOPIC_ID;
      }
    } : undefined, {
      icon: 'lock',
      text: 'CloseTopic',
      onClick: this.onToggleTopicClick,
      verify: () => {
        return !apiManagerProxy.isBotforum(this.peerId) && this.canManageTopics && !(this.dialog as ForumTopic.forumTopic).pFlags.closed;
      }
    }, {
      icon: 'lockoff',
      text: 'RestartTopic',
      onClick: this.onToggleTopicClick,
      verify: () => {
        return this.canManageTopics && !!(this.dialog as ForumTopic.forumTopic).pFlags.closed;
      }
    }, {
      icon: 'dollar_circle',
      text: 'PaidMessages.ChargeFee',
      onClick: () => this.onToggleFeeClick(true),
      verify: () => this.verifyToggleFee(true)
    }, {
      icon: 'dollar_circle_x',
      text: 'PaidMessages.RemoveFee',
      onClick: () => this.onToggleFeeClick(false),
      verify: () => this.verifyToggleFee(false)
    }, {
      // NOT the trash: this unlinks the chat, it doesn't delete it — and the Delete item
      // right below would otherwise wear the very same icon
      icon: 'crossround',
      className: 'danger',
      text: 'Community.RemoveChat',
      communityChat: 'only',
      onClick: this.onRemoveFromCommunityClick,
      verify: () => this.canRemoveFromCommunity
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => this.canDelete
    }].filter(Boolean) as DialogContextMenuButton[];

    // a chat row inside a Community panel is a dialog row like any other, so the items
    // stay the ones every dialog gets — only those that make no sense there are dropped
    for(const button of this.buttons) {
      const verify = button.verify;
      button.verify = () => {
        if(this.communityChatKind) {
          if(button.communityChat === 'expanded' && this.isCommunityCollapsed) {
            return false;
          }
        } else if(button.communityChat === 'only') {
          return false;
        }

        return verify ? verify() : true;
      };
    }

    return this.buttons;
  }

  private createAddToFolderSubmenu = async({middleware}: CreateSubmenuArgs) => {
    if(!isDialog(this.dialog)) return;

    const {default: AddToFolderDropdownMenu, fetchDialogFilters} = await import('./addToFolderDropdownMenu');

    const filters = await fetchDialogFilters();

    if(!middleware()) return;

    const menu = new AddToFolderDropdownMenu;
    menu.feedProps({
      dialog: this.dialog,
      filters,
      currentFilter: () => appDialogsManager.filterId,
      onNewDialog: (dialog) => {
        this.dialog = dialog;
      },
      onCleanup: () => {
        this.addToFolderMenu = undefined;
      }
    });

    return this.addToFolderMenu = menu;
  };

  public hasAddToFolderOpen = () => !!this.addToFolderMenu;

  /**
   * A Community lists chats we can't open at all: one that would take a join request, or
   * one hidden behind a private link. Those rows still get the items that act on the LINK
   * (removing the chat from the Community), never the ones that open or read the chat.
   */
  private canOpenCommunityChat = () => {
    return !this.communityChatKind ||
      this.communityChatKind === 'joined' ||
      this.communityChatKind === 'viewable';
  };

  private hasFilters = memoizeAsyncWithTTL(async() => {
    const filters = await this.managers.filtersStorage.getDialogFilters();
    return !!filters.filter(filter => !REAL_FOLDERS.has(filter.id)).length
  }, () => 1, 5_000);


  private async checkIfCanDelete() {
    if(!this.dialog) {
      return false;
    }

    const chat = await this.managers.appChatsManager.getChat(this.peerId.toChatId());
    if(chat?._ === 'channel' && chat?.pFlags?.monoforum && (chat?.pFlags?.left || chat?.pFlags?.creator)) return false;

    if(this.threadId) {
      if(isSavedDialog(this.dialog)) {
        return true;
      }

      if(!this.canManageTopics) {
        return false;
      }

      return (this.dialog as ForumTopic.forumTopic).id !== GENERAL_TOPIC_ID;
    }

    return true;
  }

  private onArchiveClick = async() => {
    const dialog = await this.managers.appMessagesManager.getDialogOnly(this.peerId);
    if(dialog) {
      this.managers.appMessagesManager.editPeerFolders([dialog.peerId], +!dialog.folder_id as REAL_FOLDER_ID);
    }
  };

  private onHideTopicClick = () => {
    this.managers.appMessagesManager.editForumTopic({
      peerId: this.peerId,
      topicId: this.threadId,
      hidden: true
    });
  };

  private onToggleTopicClick = () => {
    this.managers.appMessagesManager.editForumTopic({
      peerId: this.peerId,
      topicId: this.threadId,
      closed: !(this.dialog as ForumTopic.forumTopic).pFlags.closed
    });
  };

  private onPinClick = () => {
    const {peerId, filterId, threadId, dialog} = this;
    if(this.isCommunityDialog) {
      this.managers.appCommunitiesManager.toggleCommunityPin(
        this.communityId,
        !this.communityDialog?.pFlags.pinned
      ).catch((err: ApiError) => {
        if(
          err.type === 'PINNED_DIALOGS_TOO_MUCH' ||
          err.type === 'PINNED_TOO_MUCH'
        ) {
          showLimitPopup('pin');
        }
      });
      return;
    }

    const isSaved = isSavedDialog(dialog);
    this.managers.appMessagesManager.toggleDialogPin({
      peerId,
      filterId,
      topicOrSavedId: threadId
    }).catch(async(err: ApiError) => {
      if(err.type === 'PINNED_DIALOGS_TOO_MUCH' || err.type === 'PINNED_TOO_MUCH') {
        if(isSaved) {
          showLimitPopup('savedPin');
        } else if(threadId) {
          this.managers.apiManager.getLimit('topicPin').then((limit) => {
            toastNew({langPackKey: 'LimitReachedPinnedTopics', langPackArguments: [limit]});
          });
        } else if(!REAL_FOLDERS.has(filterId)) {
          toastNew({langPackKey: 'PinFolderLimitReached'});
        } else {
          showLimitPopup('pin');
        }
      }
    });
  };

  private onUnmuteClick = () => {
    if(this.isCommunityDialog) {
      unmuteCommunity(this.communityId, this.managers);
      return;
    }

    this.managers.appMessagesManager.togglePeerMute({peerId: this.peerId, mute: false, threadId: this.threadId});
  };

  private onMuteClick = () => {
    if(this.isCommunityDialog) {
      showCommunityMutePopup(this.communityId);
      return;
    }

    PopupElement.createPopup(PopupMute, this.peerId, this.threadId);
  };

  private onPreviewClick = () => {
    showChatPreviewPopup({
      peerId: this.monoforumParentPeerId || this.peerId,
      monoforumThreadId: this.monoforumParentPeerId ? this.peerId : undefined,
      threadId: this.threadId,
      anchor: chatPreviewAnchorFromDialogRow(this.li)
    });
  };

  private onUnreadClick = async() => {
    const {peerId, dialog} = this;
    if(this.isCommunityDialog) {
      await this.managers.appCommunitiesManager.markCommunityRead(
        this.communityId
      );
      return;
    }

    if(!isDialog(dialog) && !isForumTopic(dialog) && !isMonoforumDialog(dialog)) return;

    if(this.monoforumParentPeerId) {
      this.managers.appMessagesManager.markDialogUnread({
        peerId: this.monoforumParentPeerId,
        monoforumThreadId: this.peerId,
        read: !!dialog.unread_count
      });
    } else if(dialog.unread_count) {
      if(!this.threadId) {
        this.managers.appMessagesManager.markDialogUnread({peerId, read: true});
      } else {
        this.managers.appMessagesManager.readHistory({peerId, maxId: dialog.top_message, threadId: this.threadId});
      }
    } else if(!this.threadId) {
      this.managers.appMessagesManager.markDialogUnread({peerId});
    }
  };

  private verifyToggleFee = async(requirePayment: boolean) => {
    if(!this.monoforumParentPeerId || this.dialog._ !== 'monoForumDialog') return false;

    const chat = await this.managers.appChatsManager.getChat(this.monoforumParentPeerId.toChatId());
    console.log('my-debug', {chat, requirePayment})
    if(chat?._ !== 'channel' || !chat?.send_paid_messages_stars) return false;

    return requirePayment ? !!this.dialog.pFlags?.nopaid_messages_exception : !this.dialog.pFlags?.nopaid_messages_exception;
  };

  private onToggleFeeClick = async(requirePayment: boolean) => {
    const peerId = this.peerId;
    const parentPeerId = this.monoforumParentPeerId;
    if(!peerId || !parentPeerId) return;

    try {
      await openRemoveFeePopup({peerId, parentPeerId, requirePayment, managers: this.managers})
    } catch{}
  }

  private onRemoveFromCommunityClick = () => {
    const communityId = this.communityId;
    const peerId = this.peerId;
    if(!communityId || !peerId) {
      return;
    }

    void removeChatFromCommunityWithConfirmation({
      communityId,
      peerId,
      managers: this.managers
    });
  };

  private onLeaveCommunityClick = () => {
    void leaveCommunityWithConfirmation({
      communityId: this.communityId,
      managers: this.managers
    });
  };

  private onDeleteClick = () => {
    PopupElement.createPopup(
      PopupDeleteDialog,
      this.peerId,
      undefined,
      undefined,
      this.threadId,
      this.monoforumParentPeerId
    );
  };
}
