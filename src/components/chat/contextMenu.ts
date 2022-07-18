/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { MyDocument } from "../../lib/appManagers/appDocsManager";
import type Chat from "./chat";
import IS_TOUCH_SUPPORTED from "../../environment/touchSupport";
import ButtonMenu, { ButtonMenuItemOptions } from "../buttonMenu";
import PopupDeleteMessages from "../popups/deleteMessages";
import PopupForward from "../popups/forward";
import PopupPinMessage from "../popups/unpinMessage";
import { copyTextToClipboard } from "../../helpers/clipboard";
import PopupSendNow from "../popups/sendNow";
import { toast } from "../toast";
import I18n, { i18n, LangPackKey } from "../../lib/langPack";
import findUpClassName from "../../helpers/dom/findUpClassName";
import cancelEvent from "../../helpers/dom/cancelEvent";
import { attachClickEvent, simulateClickEvent } from "../../helpers/dom/clickEvent";
import isSelectionEmpty from "../../helpers/dom/isSelectionEmpty";
import { Message, Poll, Chat as MTChat, MessageMedia, AvailableReaction } from "../../layer";
import PopupReportMessages from "../popups/reportMessages";
import assumeType from "../../helpers/assumeType";
import PopupSponsored from "../popups/sponsored";
import ListenerSetter from "../../helpers/listenerSetter";
import { getMiddleware } from "../../helpers/middleware";
import PeerTitle from "../peerTitle";
import StackedAvatars from "../stackedAvatars";
import { IS_APPLE } from "../../environment/userAgent";
import PopupReactedList from "../popups/reactedList";
import { ChatReactionsMenu, REACTION_CONTAINER_SIZE } from "./reactionsMenu";
import getPeerId from "../../lib/appManagers/utils/peers/getPeerId";
import getServerMessageId from "../../lib/appManagers/utils/messageId/getServerMessageId";
import { AppManagers } from "../../lib/appManagers/managers";
import positionMenu, { MenuPositionPadding } from "../../helpers/positionMenu";
import contextMenuController from "../../helpers/contextMenuController";
import { attachContextMenuListener } from "../../helpers/dom/attachContextMenuListener";
import filterAsync from "../../helpers/array/filterAsync";
import appDownloadManager from "../../lib/appManagers/appDownloadManager";
import { SERVICE_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { MessagesStorageKey } from "../../lib/appManagers/appMessagesManager";

export default class ChatContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify: () => boolean | Promise<boolean>, notDirect?: () => boolean, withSelection?: true, isSponsored?: true})[];
  private element: HTMLElement;

  private isSelectable: boolean;
  private isSelected: boolean;
  private target: HTMLElement;
  private isTargetAGroupedItem: boolean;
  private isTextSelected: boolean;
  private isAnchorTarget: boolean;
  private isUsernameTarget: boolean;
  private isSponsored: boolean;
  private isOverBubble: boolean;
  private peerId: PeerId;
  private mid: number;
  private message: Message.message | Message.messageService;
  private noForwards: boolean;

  private reactionsMenu: ChatReactionsMenu;
  private listenerSetter: ListenerSetter;
  private attachListenerSetter: ListenerSetter;

  private viewerPeerId: PeerId;
  private middleware: ReturnType<typeof getMiddleware>;
  private canOpenReactedList: boolean;

  constructor(
    private chat: Chat, 
    private managers: AppManagers
  ) {
    this.listenerSetter = new ListenerSetter();
    this.attachListenerSetter = new ListenerSetter();
    this.middleware = getMiddleware();
  }

  public attachTo(element: HTMLElement) {
    this.attachListenerSetter.removeAll();
    
    if(IS_TOUCH_SUPPORTED/*  && false */) {
      attachClickEvent(element, (e) => {
        if(this.chat.selection.isSelecting) {
          return;
        }

        this.chat.log('touchend', e);

        const badSelectors = [
          '.name',
          '.peer-title',
          '.reply',
          '.document',
          'audio-element',
          'avatar-element',
          'a',
          '.bubble-beside-button',
          'replies-element',
          '[data-saved-from]:not(.bubble)',
          'poll-element',
          '.attachment',
          '.reply-markup-button'
        ];
        let good = !(e.target as HTMLElement).closest(badSelectors.join(', '));
        if(good) {
          cancelEvent(e);
          //onContextMenu((e as TouchEvent).changedTouches[0]);
          // onContextMenu((e as TouchEvent).changedTouches ? (e as TouchEvent).changedTouches[0] : e as MouseEvent);
          this.onContextMenu(e);
        }
      }, {listenerSetter: this.attachListenerSetter});
    } else attachContextMenuListener(element, this.onContextMenu, this.attachListenerSetter);
  }

  private onContextMenu = (e: MouseEvent | Touch | TouchEvent) => {
    let bubble: HTMLElement, contentWrapper: HTMLElement;

    try {
      contentWrapper = findUpClassName(e.target, 'bubble-content-wrapper');
      bubble = contentWrapper ? contentWrapper.parentElement : findUpClassName(e.target, 'bubble');
    } catch(e) {}

    // ! context menu click by date bubble (there is no pointer-events)
    if(!bubble || bubble.classList.contains('bubble-first')) return;

    let element = this.element;
    if(e instanceof MouseEvent || e.hasOwnProperty('preventDefault')) (e as any).preventDefault();
    if(element && element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent || e.hasOwnProperty('cancelBubble')) (e as any).cancelBubble = true;

    let mid = +bubble.dataset.mid;
    if(!mid) return;
    
    const r = async() => {
      const isSponsored = this.isSponsored = mid < 0;
      this.isSelectable = this.chat.selection.canSelectBubble(bubble);
      this.peerId = this.chat.peerId;
      //this.msgID = msgID;
      this.target = e.target as HTMLElement;
      this.isTextSelected = !isSelectionEmpty();
      this.isAnchorTarget = this.target.tagName === 'A' && (
        (this.target as HTMLAnchorElement).target === '_blank' || 
        this.target.classList.contains('anchor-url')
      );
      this.isUsernameTarget = this.target.tagName === 'A' && this.target.classList.contains('mention');

      // * если открыть контекстное меню для альбома не по бабблу, и последний элемент не выбран, чтобы показать остальные пункты
      if(this.chat.selection.isSelecting && !contentWrapper) {
        if(isSponsored) {
          return;
        }

        const mids = await this.chat.getMidsByMid(mid);
        if(mids.length > 1) {
          const selectedMid = this.chat.selection.isMidSelected(this.peerId, mid) ? 
            mid : 
            mids.find((mid) => this.chat.selection.isMidSelected(this.peerId, mid));
          if(selectedMid) {
            mid = selectedMid;
          }
        }
      }

      this.isOverBubble = !!contentWrapper;

      const groupedItem = findUpClassName(this.target, 'grouped-item');
      this.isTargetAGroupedItem = !!groupedItem;
      if(groupedItem) {
        this.mid = +groupedItem.dataset.mid;
      } else {
        this.mid = mid;
      }

      this.isSelected = this.chat.selection.isMidSelected(this.peerId, this.mid);
      this.message = await this.chat.getMessage(this.mid);
      this.noForwards = !isSponsored && !(await this.managers.appMessagesManager.canForward(this.message));
      this.viewerPeerId = undefined;
      this.canOpenReactedList = undefined;

      const initResult = await this.init();
      if(!initResult) {
        return;
      }
      
      element = initResult.element;
      const {cleanup, destroy, menuPadding, reactionsMenu, reactionsMenuPosition} = initResult;
      let isReactionsMenuVisible = false;
      if(reactionsMenu) {
        const className = 'is-visible';
        isReactionsMenuVisible = reactionsMenu.container.classList.contains(className);
        if(isReactionsMenuVisible) reactionsMenu.container.classList.remove(className);

        if(reactionsMenuPosition === 'horizontal') {
          const offsetSize = element[/* reactionsMenuPosition === 'vertical' ? 'offsetHeight' :  */'offsetWidth'];
          // if(reactionsMenu.scrollable.container.scrollWidth > offsetWidth) {
            const INNER_CONTAINER_PADDING = 8;
            const visibleLength = (offsetSize - INNER_CONTAINER_PADDING) / REACTION_CONTAINER_SIZE;
            const nextVisiblePart = visibleLength % 1;
            const MIN_NEXT_VISIBLE_PART = 0.65;
            if(nextVisiblePart < MIN_NEXT_VISIBLE_PART) {
              const minSize = (offsetSize + (MIN_NEXT_VISIBLE_PART - nextVisiblePart) * REACTION_CONTAINER_SIZE) | 0;
              element.style[/* reactionsMenuPosition === 'vertical' ? 'minHeight' :  */'minWidth'] = minSize + 'px';
            }
          // }
        }
      }
      
      const side: 'left' | 'right' = bubble.classList.contains('is-in') ? 'left' : 'right';
      //bubble.parentElement.append(element);
      //appImManager.log('contextmenu', e, bubble, side);
      positionMenu((e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent, element, side, menuPadding);

      if(reactionsMenu) {
        reactionsMenu.widthContainer.style.top = element.style.top;
        reactionsMenu.widthContainer.style.left = element.style.left;
        reactionsMenu.widthContainer.style.setProperty('--menu-width', element[reactionsMenuPosition === 'vertical' ? 'offsetHeight' : 'offsetWidth'] + 'px');
        element.parentElement.append(reactionsMenu.widthContainer);
        if(isReactionsMenuVisible) void reactionsMenu.container.offsetLeft; // reflow
      }

      contextMenuController.openBtnMenu(element, () => {
        if(reactionsMenu) {
          reactionsMenu.container.classList.remove('is-visible');
        }

        this.mid = 0;
        this.peerId = undefined;
        this.target = null;
        this.viewerPeerId = undefined;
        this.canOpenReactedList = undefined;
        cleanup();

        setTimeout(() => {
          destroy();
        }, 300);
      });

      if(isReactionsMenuVisible) {
        reactionsMenu.container.classList.add('is-visible');
      }
    };
    
    r();
  };

  public cleanup() {
    this.listenerSetter.removeAll();
    this.reactionsMenu && this.reactionsMenu.cleanup();
    this.middleware.clean();
  }

  public destroy() {
    this.cleanup();
    this.attachListenerSetter.removeAll();
  }

  private async filterButtons(buttons: ChatContextMenu['buttons']) {
    if(this.isSponsored) {
      return buttons.filter((button) => {
        return button.isSponsored;
      });
    } else {
      return filterAsync(buttons, async(button) => {
        let good: boolean;

        //if((appImManager.chatSelection.isSelecting && !button.withSelection) || (button.withSelection && !appImManager.chatSelection.isSelecting)) {
        if(this.chat.selection.isSelecting && !button.withSelection) {
          good = false;
        } else {
          good = this.isOverBubble || IS_TOUCH_SUPPORTED || true ? 
            await button.verify() : 
            button.notDirect && await button.verify() && button.notDirect();
        }

        return !!good;
      });
    }
  }

  private setButtons() {
    this.buttons = [{
      icon: 'send2',
      text: 'MessageScheduleSend',
      onClick: this.onSendScheduledClick,
      verify: () => this.chat.type === 'scheduled' && !this.message.pFlags.is_outgoing
    }, {
      icon: 'send2',
      text: 'Message.Context.Selection.SendNow',
      onClick: this.onSendScheduledClick,
      verify: () => this.chat.type === 'scheduled' && this.isSelected && !this.chat.selection.selectionSendNowBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'schedule',
      text: 'MessageScheduleEditTime',
      onClick: () => {
        this.chat.input.scheduleSending(() => {
          assumeType<Message.message>(this.message);
          this.managers.appMessagesManager.editMessage(this.message, this.message.message, {
            scheduleDate: this.chat.input.scheduleDate,
            entities: this.message.entities
          });

          this.chat.input.onMessageSent(false, false);
        }, new Date(this.message.date * 1000));
      },
      verify: () => this.chat.type === 'scheduled'
    }, {
      icon: 'reply',
      text: 'Reply',
      onClick: this.onReplyClick,
      verify: async() => await this.chat.canSend() && 
        !this.message.pFlags.is_outgoing && 
        !!this.chat.input.messageInput && 
        this.chat.type !== 'scheduled'/* ,
      cancelEvent: true */
    }, {
      icon: 'edit',
      text: 'Edit',
      onClick: this.onEditClick,
      verify: async() => (await this.managers.appMessagesManager.canEditMessage(this.message, 'text')) && !!this.chat.input.messageInput
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: this.onCopyClick,
      verify: () => !this.noForwards && !!(this.message as Message.message).message && !this.isTextSelected && (!this.isAnchorTarget || (this.message as Message.message).message !== this.target.innerText)
    }, {
      icon: 'copy',
      text: 'Chat.CopySelectedText',
      onClick: this.onCopyClick,
      verify: () => !this.noForwards && !!(this.message as Message.message).message && this.isTextSelected
    }, {
      icon: 'copy',
      text: 'Message.Context.Selection.Copy',
      onClick: this.onCopyClick,
      verify: async() => {
        if(!this.isSelected || this.noForwards) {
          return false;
        }

        for(const [peerId, mids] of this.chat.selection.selectedMids) {
          const storageKey: MessagesStorageKey = `${peerId}_${this.chat.type === 'scheduled' ? 'scheduled' : 'history'}`;
          for(const mid of mids) {
            const message = (await this.managers.appMessagesManager.getMessageFromStorage(storageKey, mid)) as Message.message;
            if(!!message.message) {
              return true;
            }
          }
        }

        return false;
      },
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'copy',
      text: 'CopyLink',
      onClick: this.onCopyAnchorLinkClick,
      verify: () => this.isAnchorTarget,
      withSelection: true
    }, {
      icon: 'copy',
      text: 'Text.Context.Copy.Username',
      onClick: () => {
        copyTextToClipboard(this.target.innerHTML);
      },
      verify: () => this.isUsernameTarget,
      withSelection: true
    }, {
      icon: 'copy',
      text: 'Text.Context.Copy.Hashtag',
      onClick: () => {
        copyTextToClipboard(this.target.innerHTML);
      },
      verify: () => this.target.classList.contains('anchor-hashtag'),
      withSelection: true
    }, {
      icon: 'link',
      text: 'MessageContext.CopyMessageLink1',
      onClick: this.onCopyLinkClick,
      verify: async() => await this.managers.appPeersManager.isChannel(this.peerId) && !this.message.pFlags.is_outgoing
    }, {
      icon: 'pin',
      text: 'Message.Context.Pin',
      onClick: this.onPinClick,
      verify: async() => !this.message.pFlags.is_outgoing && 
        this.message._ !== 'messageService' && 
        !this.message.pFlags.pinned && 
        await this.managers.appPeersManager.canPinMessage(this.peerId) && 
        this.chat.type !== 'scheduled',
    }, {
      icon: 'unpin',
      text: 'Message.Context.Unpin',
      onClick: this.onUnpinClick,
      verify: async() => (this.message as Message.message).pFlags.pinned && await this.managers.appPeersManager.canPinMessage(this.peerId),
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => {
        appDownloadManager.downloadToDisc({media: (this.message as any).media.document});
      },
      verify: () => {
        if(this.message.pFlags.is_outgoing) {
          return false;
        }
        
        const doc: MyDocument = ((this.message as Message.message).media as MessageMedia.messageMediaDocument)?.document as any;
        if(!doc) return false;
        
        let hasTarget = !!IS_TOUCH_SUPPORTED;
        const isGoodType = !doc.type || !(['gif', 'video', 'sticker'] as MyDocument['type'][]).includes(doc.type);
        if(isGoodType) hasTarget = hasTarget || !!findUpClassName(this.target, 'document') || !!findUpClassName(this.target, 'audio');
        return isGoodType && hasTarget;
      }
    }, {
      icon: 'checkretract',
      text: 'Chat.Poll.Unvote',
      onClick: this.onRetractVote,
      verify: () => {
        const poll = (this.message as any).media?.poll as Poll;
        return poll && poll.chosenIndexes.length && !poll.pFlags.closed && !poll.pFlags.quiz;
      }/* ,
      cancelEvent: true */
    }, {
      icon: 'stop',
      text: 'Chat.Poll.Stop',
      onClick: this.onStopPoll,
      verify: async() => {
        const poll = (this.message as any).media?.poll;
        return await this.managers.appMessagesManager.canEditMessage(this.message, 'poll') && poll && !poll.pFlags.closed && !this.message.pFlags.is_outgoing;
      }/* ,
      cancelEvent: true */
    }, {
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick, // let forward the message if it's outgoing but not ours (like a changelog)
      verify: () => !this.noForwards && this.chat.type !== 'scheduled' && (!this.message.pFlags.is_outgoing || this.message.fromId === SERVICE_PEER_ID) && this.message._ !== 'messageService'
    }, {
      icon: 'forward',
      text: 'Message.Context.Selection.Forward',
      onClick: this.onForwardClick,
      verify: () => this.chat.selection.selectionForwardBtn && 
        this.isSelected && 
        !this.chat.selection.selectionForwardBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'flag',
      text: 'ReportChat',
      onClick: () => {
        new PopupReportMessages(this.peerId, [this.mid]);
      },
      verify: async() => !this.message.pFlags.out && this.message._ === 'message' && !this.message.pFlags.is_outgoing && await this.managers.appPeersManager.isChannel(this.peerId),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: this.onSelectClick,
      verify: () => !(this.message as Message.messageService).action && !this.isSelected && this.isSelectable,
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Message.Context.Selection.Clear',
      onClick: this.onClearSelectionClick,
      verify: () => this.isSelected,
      notDirect: () => true,
      withSelection: true
    }, {
      onClick: () => {
        if(this.viewerPeerId) {
          this.chat.appImManager.setInnerPeer({
            peerId: this.viewerPeerId
          });
        } else if(this.canOpenReactedList) {
          new PopupReactedList(this.message as Message.message);
        } else {
          return false;
        }
      },
      verify: async() => !this.peerId.isUser() && (!!(this.message as Message.message).reactions?.recent_reactions?.length || await this.managers.appMessagesManager.canViewMessageReadParticipants(this.message)),
      notDirect: () => true
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: async() => this.managers.appMessagesManager.canDeleteMessage(this.message)
    }, {
      icon: 'delete danger',
      text: 'Message.Context.Selection.Delete',
      onClick: this.onDeleteClick,
      verify: () => this.isSelected && !this.chat.selection.selectionDeleteBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
    }, {
      icon: 'info',
      text: 'Chat.Message.Sponsored.What',
      onClick: () => {
        new PopupSponsored();
      },
      verify: () => false,
      isSponsored: true
    }];
  }

  private async init() {
    this.cleanup();
    this.setButtons();
    
    const filteredButtons = await this.filterButtons(this.buttons);
    if(!filteredButtons.length) {
      return;
    }

    const element = this.element = ButtonMenu(filteredButtons, this.listenerSetter);
    element.id = 'bubble-contextmenu';
    element.classList.add('contextmenu');

    const viewsButton = filteredButtons.find((button) => !button.icon);
    if(viewsButton) {
      const reactions = (this.message as Message.message).reactions;
      const recentReactions = reactions?.recent_reactions;
      const isViewingReactions = !!recentReactions?.length;
      const participantsCount = await this.managers.appMessagesManager.canViewMessageReadParticipants(this.message) ? ((await this.managers.appPeersManager.getPeer(this.peerId)) as MTChat.chat).participants_count : undefined;
      const reactedLength = reactions ? reactions.results.reduce((acc, r) => acc + r.count, 0) : undefined;

      viewsButton.element.classList.add('tgico-' + (isViewingReactions ? 'reactions' : 'checks'));
      const i18nElem = new I18n.IntlElement({
        key: isViewingReactions ? (
          participantsCount === undefined ? 'Chat.Context.ReactedFast' : 'Chat.Context.Reacted'
        ) : 'NobodyViewed',
        args: isViewingReactions ? (
          participantsCount === undefined ? [reactedLength] : [participantsCount, participantsCount]
        ) : undefined,
        element: viewsButton.textElement
      });

      let fakeText: HTMLElement;
      if(isViewingReactions) {
        if(participantsCount === undefined) {
          fakeText = i18n('Chat.Context.ReactedFast', [reactedLength]);
        } else {
          fakeText = i18n(
            recentReactions.length === participantsCount ? 'Chat.Context.ReactedFast' : 'Chat.Context.Reacted', 
            [recentReactions.length, participantsCount]
          );
        }
      } else {
        fakeText = i18n('Loading');
      }

      fakeText.classList.add('btn-menu-item-text-fake');
      viewsButton.element.append(fakeText);

      const AVATAR_SIZE = 22;
      const MAX_AVATARS = 3;
      const PADDING_PER_AVATAR = 1.125;
      i18nElem.element.style.visibility = 'hidden';
      i18nElem.element.style.paddingRight = isViewingReactions ? PADDING_PER_AVATAR * Math.min(MAX_AVATARS, recentReactions.length) + 'rem' : '1rem';
      const middleware = this.middleware.get();
      this.managers.appMessagesManager.getMessageReactionsListAndReadParticipants(this.message as Message.message).then((result) => {
        if(!middleware()) {
          return;
        }

        if(fakeText) {
          fakeText.remove();
        }

        const reactions = result.combined;
        const reactedLength = participantsCount === undefined ? 
          result.reactionsCount : 
          (
            isViewingReactions ? 
              reactions.filter((reaction) => reaction.reaction).length : 
              reactions.length
          );

        let fakeElem: HTMLElement;
        if(reactions.length === 1) {
          fakeElem = new PeerTitle({
            peerId: reactions[0].peerId,
            onlyFirstName: true,
            dialog: false,
          }).element;

          if(!isViewingReactions || result.readParticipants.length <= 1) {
            this.viewerPeerId = reactions[0].peerId;
          }
        } else if(isViewingReactions) {
          const isFull = reactedLength === reactions.length || participantsCount === undefined;
          fakeElem = i18n(
            isFull ? 'Chat.Context.ReactedFast' : 'Chat.Context.Reacted', 
            isFull ? [reactedLength] : [reactedLength, reactions.length]
          );
        } else {
          if(!reactions.length) {
            i18nElem.element.style.visibility = '';
          } else {
            fakeElem = i18n('MessageSeen', [reactions.length]);
          }
        }

        if(fakeElem) {
          fakeElem.style.paddingRight = PADDING_PER_AVATAR * Math.min(MAX_AVATARS, reactedLength) + 'rem';
          fakeElem.classList.add('btn-menu-item-text-fake');
          viewsButton.element.append(fakeElem);
        }

        if(reactions.length) {
          const avatars = new StackedAvatars({avatarSize: AVATAR_SIZE});
          avatars.render(recentReactions ? recentReactions.map((r) => getPeerId(r.peer_id)) : reactions.map((reaction) => reaction.peerId));
          viewsButton.element.append(avatars.container);

          // if(reactions.length > 1) {
          // if(isViewingReactions) {
            this.canOpenReactedList = true;
          // }
        }
      });
    }

    let menuPadding: MenuPositionPadding;
    let reactionsMenu: ChatReactionsMenu;
    let reactionsMenuPosition: 'horizontal' | 'vertical';
    if(this.message._ === 'message' && !this.chat.selection.isSelecting && !this.message.pFlags.is_outgoing && !this.message.pFlags.is_scheduled) {
      reactionsMenuPosition = (IS_APPLE || IS_TOUCH_SUPPORTED)/*  && false */ ? 'horizontal' : 'vertical';
      reactionsMenu = this.reactionsMenu = new ChatReactionsMenu(this.managers, reactionsMenuPosition, this.middleware);
      reactionsMenu.init(await this.managers.appMessagesManager.getGroupsFirstMessage(this.message));
      // element.prepend(reactionsMenu.widthContainer);

      const size = 36;
      const margin = 8;
      const totalSize = size + margin;
      const paddingLeft = 0, paddingRight = 0;
      if(reactionsMenuPosition === 'vertical') {
        menuPadding = {
          top: paddingLeft,
          // bottom: 36, // positionMenu will detect it itself somehow
          left: totalSize
        };
      } else {
        menuPadding = {
          top: totalSize,
          right: paddingRight,
          left: paddingLeft
        };
      }
    }

    this.chat.container.append(element);

    return {
      element, 
      cleanup: () => {
        this.cleanup();
        reactionsMenu && reactionsMenu.cleanup();
      },
      destroy: () => {
        element.remove();
        reactionsMenu && reactionsMenu.widthContainer.remove();
      },
      menuPadding,
      reactionsMenu,
      reactionsMenuPosition
    };
  }

  private onSendScheduledClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionSendNowBtn);
    } else {
      new PopupSendNow(this.peerId, await this.chat.getMidsByMid(this.mid));
    }
  };

  private onReplyClick = () => {
    this.chat.input.initMessageReply(this.mid);
  };

  private onEditClick = () => {
    this.chat.input.initMessageEditing(this.mid);
  };

  private onCopyClick = async() => {
    if(isSelectionEmpty()) {
      const mids = this.chat.selection.isSelecting ? 
        [...this.chat.selection.selectedMids.get(this.peerId)].sort((a, b) => a - b) : 
        [this.mid];

      const parts: string[] = await Promise.all(mids.map(async(mid) => {
        const message = (await this.chat.getMessage(mid)) as Message.message;
        return message?.message ? message.message + '\n' : '';
      }));

      const str = parts.join('');

      copyTextToClipboard(str);
    } else {
      document.execCommand('copy');
      //cancelSelection();
    }
  };

  private onCopyAnchorLinkClick = () => {
    copyTextToClipboard((this.target as HTMLAnchorElement).href);
  };

  private onCopyLinkClick = async() => {
    let threadMessage: Message.message;
    const {peerId, mid} = this;
    const threadId = this.chat.threadId;
    if(this.chat.type === 'discussion') {
      threadMessage = (await this.managers.appMessagesManager.getMessageByPeer(peerId, threadId)) as Message.message;
    }

    const username = await this.managers.appPeersManager.getPeerUsername(threadMessage ? threadMessage.fromId : peerId);
    const msgId = getServerMessageId(mid);
    let url = 'https://t.me/';
    let key: LangPackKey;
    if(username) {
      url += username + '/' + (threadMessage ? getServerMessageId(threadMessage.fwd_from.channel_post) : msgId);
      if(threadMessage) url += '?comment=' + msgId;
      key = 'LinkCopied';
    } else {
      url += 'c/' + peerId.toChatId() + '/' + msgId;
      if(threadMessage) url += '?thread=' + getServerMessageId(threadMessage.mid);
      key = 'LinkCopiedPrivateInfo';
    }

    toast(I18n.format(key, true));

    copyTextToClipboard(url);
  };

  private onPinClick = () => {
    new PopupPinMessage(this.peerId, this.mid);
  };

  private onUnpinClick = () => {
    new PopupPinMessage(this.peerId, this.mid, true);
  };

  private onRetractVote = () => {
    this.managers.appPollsManager.sendVote(this.message, []);
  };

  private onStopPoll = () => {
    this.managers.appPollsManager.stopPoll(this.message);
  };

  private onForwardClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionForwardBtn);
    } else {
      const peerId = this.peerId;
      const mids = this.isTargetAGroupedItem ? [this.mid] : await this.chat.getMidsByMid(this.mid);
      new PopupForward({
        [peerId]: mids
      });
    }
  };

  private onSelectClick = () => {
    this.chat.selection.toggleByElement(findUpClassName(this.target, 'grouped-item') || findUpClassName(this.target, 'bubble'));
  };

  private onClearSelectionClick = () => {
    this.chat.selection.cancelSelection();
  };

  private onDeleteClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionDeleteBtn);
    } else {
      new PopupDeleteMessages(this.peerId, this.isTargetAGroupedItem ? [this.mid] : await this.chat.getMidsByMid(this.mid), this.chat.type);
    }
  };
}
