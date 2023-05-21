/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import type Chat from './chat';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import ButtonMenu, {ButtonMenuItemOptions} from '../buttonMenu';
import PopupDeleteMessages from '../popups/deleteMessages';
import PopupForward from '../popups/forward';
import PopupPinMessage from '../popups/unpinMessage';
import {copyTextToClipboard} from '../../helpers/clipboard';
import PopupSendNow from '../popups/sendNow';
import {toast, toastNew} from '../toast';
import I18n, {i18n, LangPackKey} from '../../lib/langPack';
import findUpClassName from '../../helpers/dom/findUpClassName';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import isSelectionEmpty from '../../helpers/dom/isSelectionEmpty';
import {Message, Poll, Chat as MTChat, MessageMedia, AvailableReaction, MessageEntity, InputStickerSet, StickerSet, Document, Reaction, Photo, SponsoredMessage, ChannelParticipant} from '../../layer';
import PopupReportMessages from '../popups/reportMessages';
import assumeType from '../../helpers/assumeType';
import PopupSponsored from '../popups/sponsored';
import ListenerSetter from '../../helpers/listenerSetter';
import {getMiddleware} from '../../helpers/middleware';
import PeerTitle from '../peerTitle';
import StackedAvatars from '../stackedAvatars';
import {IS_APPLE} from '../../environment/userAgent';
import PopupReactedList from '../popups/reactedList';
import {ChatReactionsMenu, REACTION_CONTAINER_SIZE} from './reactionsMenu';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '../../lib/appManagers/managers';
import positionMenu, {MenuPositionPadding} from '../../helpers/positionMenu';
import contextMenuController from '../../helpers/contextMenuController';
import {attachContextMenuListener} from '../../helpers/dom/attachContextMenuListener';
import filterAsync from '../../helpers/array/filterAsync';
import appDownloadManager, {DownloadBlob} from '../../lib/appManagers/appDownloadManager';
import {SERVICE_PEER_ID} from '../../lib/mtproto/mtproto_config';
import {MessagesStorageKey, MyMessage} from '../../lib/appManagers/appMessagesManager';
import filterUnique from '../../helpers/array/filterUnique';
import replaceContent from '../../helpers/dom/replaceContent';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import PopupStickers from '../popups/stickers';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import canSaveMessageMedia from '../../lib/appManagers/utils/messages/canSaveMessageMedia';
import getAlbumText from '../../lib/appManagers/utils/messages/getAlbumText';
import PopupElement from '../popups';
import AvatarElement from '../avatar';
import getParticipantPeerId from '../../lib/appManagers/utils/chats/getParticipantPeerId';
import confirmationPopup from '../confirmationPopup';
import wrapPeerTitle from '../wrappers/peerTitle';

type ChatContextMenuButton = ButtonMenuItemOptions & {
  verify: () => boolean | Promise<boolean>,
  notDirect?: () => boolean,
  withSelection?: true,
  isSponsored?: true,
  localName?: 'views' | 'emojis' | 'sponsorInfo' | 'sponsorAdditionalInfo'
};

export default class ChatContextMenu {
  private buttons: ChatContextMenuButton[];
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
  private sponsoredMessage: SponsoredMessage;
  private noForwards: boolean;

  private reactionsMenu: ChatReactionsMenu;
  private listenerSetter: ListenerSetter;
  private attachListenerSetter: ListenerSetter;

  private viewerPeerId: PeerId;
  private middleware: ReturnType<typeof getMiddleware>;
  private canOpenReactedList: boolean;

  private emojiInputsPromise: CancellablePromise<InputStickerSet.inputStickerSetID[]>;
  private albumMessages: Message.message[];
  private linkToMessage: Awaited<ReturnType<ChatContextMenu['getUrlToMessage']>>;
  private selectedMessagesText: string;
  private selectedMessages: MyMessage[];
  private avatarPeerId: number;

  private isLegacy: boolean;
  private messagePeerId: number;

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
          // 'avatar-element',
          'a',
          '.bubble-beside-button',
          'replies-element',
          '[data-saved-from]:not(.bubble)',
          'poll-element',
          '.attachment',
          '.reply-markup-button'
        ];
        const good = !(e.target as HTMLElement).closest(badSelectors.join(', '));
        if(good) {
          cancelEvent(e);
          // onContextMenu((e as TouchEvent).changedTouches[0]);
          // onContextMenu((e as TouchEvent).changedTouches ? (e as TouchEvent).changedTouches[0] : e as MouseEvent);
          this.onContextMenu(e);
        }
      }, {listenerSetter: this.attachListenerSetter});
    } else attachContextMenuListener({
      element,
      callback: this.onContextMenu,
      listenerSetter: this.attachListenerSetter
    });
  }

  private onContextMenu = (e: MouseEvent | Touch | TouchEvent) => {
    let bubble: HTMLElement, contentWrapper: HTMLElement, avatar: AvatarElement;

    try {
      contentWrapper = findUpClassName(e.target, 'bubble-content-wrapper');
      bubble = contentWrapper ? contentWrapper.parentElement : findUpClassName(e.target, 'bubble');
      avatar = findUpClassName(e.target, 'bubbles-group-avatar') as AvatarElement;
    } catch(e) {}

    // ! context menu click by date bubble (there is no pointer-events)
    if((!bubble || bubble.classList.contains('bubble-first')) && !avatar) return;

    let element = this.element;
    if(e instanceof MouseEvent || e.hasOwnProperty('preventDefault')) (e as any).preventDefault();
    if(element && element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent || e.hasOwnProperty('cancelBubble')) (e as any).cancelBubble = true;

    let mid = avatar ? 0 : +bubble.dataset.mid;
    if(!mid && mid !== 0) {
      return;
    }

    if(avatar && !avatar.peerId) {
      toastNew({langPackKey: 'HidAccount'});
      return;
    }

    const r = async() => {
      const isSponsored = this.isSponsored = mid < 0;
      this.isSelectable = this.chat.selection.canSelectBubble(bubble);
      this.peerId = this.chat.peerId;
      this.messagePeerId = bubble ? bubble.dataset.peerId.toPeerId() : undefined;
      // this.msgID = msgID;
      this.target = e.target as HTMLElement;
      this.isTextSelected = !isSelectionEmpty();
      this.isAnchorTarget = this.target.tagName === 'A' && (
        (this.target as HTMLAnchorElement).target === '_blank' ||
        this.target.classList.contains('anchor-url')
      );
      this.isUsernameTarget = this.target.tagName === 'A' && this.target.classList.contains('mention');

      this.sponsoredMessage = isSponsored ? (bubble as any).message.sponsoredMessage : undefined;

      const mids = avatar ? [] : await this.chat.getMidsByMid(mid);
      // * если открыть контекстное меню для альбома не по бабблу, и последний элемент не выбран, чтобы показать остальные пункты
      if(this.chat.selection.isSelecting && !contentWrapper && mid) {
        if(isSponsored) {
          return;
        }

        if(mids.length > 1) {
          const selectedMid = this.chat.selection.isMidSelected(this.messagePeerId, mid) ?
            mid :
            mids.find((mid) => this.chat.selection.isMidSelected(this.messagePeerId, mid));
          if(selectedMid) {
            mid = selectedMid;
          }
        }
      }

      this.isOverBubble = !!contentWrapper;

      this.avatarPeerId = (avatar as AvatarElement)?.peerId;

      const groupedItem = findUpClassName(this.target, 'grouped-item');
      this.isTargetAGroupedItem = !!groupedItem;
      if(groupedItem) {
        this.mid = +groupedItem.dataset.mid;
      } else {
        this.mid = mid;
      }

      this.isLegacy = this.messagePeerId && this.messagePeerId !== this.peerId;
      this.isSelected = this.chat.selection.isMidSelected(this.messagePeerId, this.mid);
      this.message = avatar ? undefined : (bubble as any).message || await this.chat.getMessage(this.mid);
      this.albumMessages = (this.message as Message.message)?.grouped_id ? await this.managers.appMessagesManager.getMessagesByAlbum((this.message as Message.message).grouped_id) : undefined;
      this.noForwards = this.message && !isSponsored && !(await this.managers.appMessagesManager.canForward(this.message));
      this.viewerPeerId = undefined;
      this.canOpenReactedList = undefined;
      this.linkToMessage = await this.getUrlToMessage();
      this.selectedMessagesText = await this.getSelectedMessagesText();
      this.selectedMessages = this.chat.selection.isSelecting && !avatar ? await this.chat.selection.getSelectedMessages() : undefined;

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

      const side: 'left' | 'right' = !bubble || bubble.classList.contains('is-in') ? 'left' : 'right';
      // bubble.parentElement.append(element);
      // appImManager.log('contextmenu', e, bubble, side);
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
    return filterAsync(buttons, async(button) => {
      let good: boolean;

      if((this.isSponsored && !button.isSponsored) || (!this.isSponsored && button.isSponsored)) {
        return false;
      }

      // if((appImManager.chatSelection.isSelecting && !button.withSelection) || (button.withSelection && !appImManager.chatSelection.isSelecting)) {
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

  private setButtons() {
    if(this.avatarPeerId !== undefined) {
      const openPeer = () => {
        this.chat.appImManager.setInnerPeer({peerId: this.avatarPeerId});
      };
      this.buttons = [{
        icon: 'message',
        text: 'SendMessage',
        onClick: openPeer,
        verify: () => this.chat.peerId !== this.avatarPeerId && this.avatarPeerId.isUser()
      }, {
        icon: 'newgroup',
        text: 'OpenGroup2',
        onClick: openPeer,
        verify: () => this.chat.peerId !== this.avatarPeerId && this.managers.appPeersManager.isAnyGroup(this.avatarPeerId)
      }, {
        icon: 'newchannel',
        text: 'OpenChannel2',
        onClick: openPeer,
        verify: () => this.chat.peerId !== this.avatarPeerId && this.managers.appPeersManager.isBroadcast(this.avatarPeerId)
      }, {
        icon: 'mention',
        text: 'Mention',
        onClick: () => {
          this.chat.input.mentionUser(this.avatarPeerId.toUserId(), false);
        },
        verify: () => /* this.avatarPeerId.isUser() &&  */this.chat.canSend('send_plain')
      }];
      return;
    }

    const verifyFavoriteSticker = async(toAdd: boolean) => {
      const doc = ((this.message as Message.message).media as MessageMedia.messageMediaDocument)?.document;
      if(!(doc as MyDocument)?.sticker) {
        return false;
      }

      const favedStickers = await this.managers.acknowledged.appStickersManager.getFavedStickersStickers();
      if(!favedStickers.cached) {
        return false;
      }

      const found = (await favedStickers.result).some((_doc) => _doc.id === doc.id);
      return toAdd ? !found : found;
    };

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
      verify: async() => !this.isLegacy &&
        await this.chat.canSend() &&
        !this.message.pFlags.is_outgoing &&
        !!this.chat.input.messageInput &&
        this.chat.type !== 'scheduled'/* ,
      cancelEvent: true */
    }, {
      icon: 'favourites',
      text: 'AddToFavorites',
      onClick: this.onFaveStickerClick.bind(this, false),
      verify: () => verifyFavoriteSticker(true)
    }, {
      icon: 'favourites',
      text: 'DeleteFromFavorites',
      onClick: this.onFaveStickerClick.bind(this, true),
      verify: () => verifyFavoriteSticker(false)
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
        copyTextToClipboard(this.target.textContent);
      },
      verify: () => this.isUsernameTarget,
      withSelection: true
    }, {
      icon: 'copy',
      text: 'Text.Context.Copy.Hashtag',
      onClick: () => {
        copyTextToClipboard(this.target.textContent);
      },
      verify: () => this.target.classList.contains('anchor-hashtag'),
      withSelection: true
    }, {
      icon: 'link',
      text: 'MessageContext.CopyMessageLink1',
      onClick: this.onCopyLinkClick,
      verify: async() => !this.isLegacy && await this.managers.appPeersManager.isChannel(this.peerId) && !this.message.pFlags.is_outgoing
    }, {
      icon: 'pin',
      text: 'Message.Context.Pin',
      onClick: this.onPinClick,
      verify: async() => !this.isLegacy &&
        !this.message.pFlags.is_outgoing &&
        this.message._ !== 'messageService' &&
        !this.message.pFlags.pinned &&
        await this.managers.appPeersManager.canPinMessage(this.peerId) &&
        this.chat.type !== 'scheduled'
    }, {
      icon: 'unpin',
      text: 'Message.Context.Unpin',
      onClick: this.onUnpinClick,
      verify: async() => (this.message as Message.message).pFlags.pinned && await this.managers.appPeersManager.canPinMessage(this.peerId)
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.message, this.noForwards),
      verify: () => ChatContextMenu.canDownload(this.message, this.target, this.noForwards)
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
      icon: 'download',
      text: 'Message.Context.Selection.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.selectedMessages, this.noForwards),
      verify: () => this.selectedMessages && ChatContextMenu.canDownload(this.selectedMessages, undefined, this.noForwards),
      withSelection: true
    }, {
      icon: 'flag',
      text: 'ReportChat',
      onClick: () => {
        PopupElement.createPopup(PopupReportMessages, this.peerId, [this.mid]);
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
        if(this.viewerPeerId && false) {
          this.chat.appImManager.setInnerPeer({
            peerId: this.viewerPeerId
          });
        } else if(this.canOpenReactedList) {
          PopupElement.createPopup(PopupReactedList, this.message as Message.message);
        } else {
          return false;
        }
      },
      verify: async() => !this.peerId.isUser() && (!!(this.message as Message.message).reactions?.recent_reactions?.length || await this.managers.appMessagesManager.canViewMessageReadParticipants(this.message)),
      notDirect: () => true,
      localName: 'views'
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
        PopupElement.createPopup(PopupSponsored);
      },
      verify: () => this.isSponsored,
      isSponsored: true
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: () => copyTextToClipboard(this.sponsoredMessage.message),
      verify: () => this.isSponsored,
      isSponsored: true
    }, {
      // icon: 'smile',
      text: 'Loading',
      onClick: () => {
        this.emojiInputsPromise.then((inputs) => {
          PopupElement.createPopup(PopupStickers, inputs, true).show();
        });
      },
      verify: () => !!this.getUniqueCustomEmojisFromMessage().length,
      notDirect: () => true,
      localName: 'emojis'
    }, {
      regularText: this.sponsoredMessage?.sponsor_info ? wrapEmojiText(this.sponsoredMessage.sponsor_info) : undefined,
      separator: true,
      multiline: true,
      onClick: () => copyTextToClipboard(this.sponsoredMessage.sponsor_info),
      verify: () => !!this.sponsoredMessage.sponsor_info,
      isSponsored: true
    }, {
      regularText: this.sponsoredMessage?.additional_info ? wrapEmojiText(this.sponsoredMessage.additional_info) : undefined,
      separator: true,
      multiline: true,
      onClick: () => copyTextToClipboard(this.sponsoredMessage.additional_info),
      verify: () => !!this.sponsoredMessage.additional_info,
      isSponsored: true
    }];
  }

  public static canDownload(message: MyMessage | MyMessage[], withTarget?: HTMLElement, noForwards?: boolean): boolean {
    if(Array.isArray(message)) {
      return message.some((message) => ChatContextMenu.canDownload(message, withTarget, noForwards));
    }

    if(!canSaveMessageMedia(message) || noForwards) {
      return false;
    }

    const isPhoto: boolean = !!((message as Message.message).media as MessageMedia.messageMediaPhoto)?.photo;
    let isGoodType = false

    if(isPhoto) {
      isGoodType = true;
    } else {
      const doc: MyDocument = ((message as Message.message).media as MessageMedia.messageMediaDocument)?.document as any;
      if(!doc) return false;
      // isGoodType = doc.type && (['gif', 'video', 'audio', 'voice', 'sticker'] as MyDocument['type'][]).includes(doc.type)
      isGoodType = true;
    }

    let hasTarget = !withTarget || !!IS_TOUCH_SUPPORTED;

    if(isGoodType && withTarget) {
      hasTarget ||= !!(findUpClassName(withTarget, 'document') ||
        findUpClassName(withTarget, 'audio') ||
        findUpClassName(withTarget, 'media-sticker-wrapper') ||
        findUpClassName(withTarget, 'media-photo') ||
        findUpClassName(withTarget, 'media-video'));
    }

    return isGoodType && hasTarget;
  }

  private getMessageWithText() {
    return (this.albumMessages && getAlbumText(this.albumMessages)) || this.message;
  }

  private getUniqueCustomEmojisFromMessage() {
    const docIds: DocId[] = [];

    const message = this.getMessageWithText();

    const entities = (message as Message.message).entities;
    if(entities) {
      const filtered = entities.filter((entity) => entity._ === 'messageEntityCustomEmoji') as MessageEntity.messageEntityCustomEmoji[];
      docIds.push(...filtered.map((entity) => entity.document_id));
    }

    const reactions = (message as Message.message).reactions;
    if(reactions) {
      const results = reactions.results.filter((reactionCount) => reactionCount.reaction._ === 'reactionCustomEmoji');
      docIds.push(...results.map((reactionCount) => (reactionCount.reaction as Reaction.reactionCustomEmoji).document_id));
    }

    return filterUnique(docIds);
  }

  private async init() {
    this.cleanup();
    this.setButtons();

    const filteredButtons = await this.filterButtons(this.buttons);
    if(!filteredButtons.length) {
      return;
    }

    const element = this.element = await ButtonMenu({
      buttons: filteredButtons,
      listenerSetter: this.listenerSetter
    });
    element.id = 'bubble-contextmenu';
    element.classList.add('contextmenu');

    const viewsButton = filteredButtons.find((button) => button.localName === 'views');
    if(viewsButton) {
      const reactions = (this.message as Message.message).reactions;
      const recentReactions = reactions?.recent_reactions;
      const isViewingReactions = !!recentReactions?.length;
      const participantsCount = await this.managers.appMessagesManager.canViewMessageReadParticipants(this.message) ?
        ((await this.managers.appPeersManager.getPeer(this.peerId)) as MTChat.chat).participants_count :
        undefined;
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

        fakeText?.remove();

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
            dialog: false
          }).element;

          if(!isViewingReactions || result.readParticipantDates.length <= 1) {
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
    if(
      this.message?._ === 'message' &&
      !this.chat.selection.isSelecting &&
      !this.message.pFlags.is_outgoing &&
      !this.message.pFlags.is_scheduled &&
      !this.message.pFlags.local
    ) {
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

    const emojisButton = filteredButtons.find((button) => button.localName === 'emojis');
    if(emojisButton) {
      emojisButton.element.classList.add('is-multiline');
      emojisButton.element.parentElement.insertBefore(document.createElement('hr'), emojisButton.element);

      const setPadding = () => {
        menuPadding ??= {};
        menuPadding.bottom = 24;
      };

      const docIds = this.getUniqueCustomEmojisFromMessage();
      const inputsPromise = this.emojiInputsPromise = deferredPromise();

      await this.managers.appEmojiManager.getCachedCustomEmojiDocuments(docIds).then(async(docs) => {
        const p = async(docs: Document.document[]) => {
          const s: Map<StickerSet['id'], InputStickerSet.inputStickerSetID> = new Map();
          docs.forEach((doc) => {
            if(!doc || s.has(doc.stickerSetInput.id)) {
              return;
            }

            s.set(doc.stickerSetInput.id, doc.stickerSetInput);
          });

          const inputs = [...s.values()];
          inputsPromise.resolve(inputs);
          if(s.size === 1) {
            const result = await this.managers.acknowledged.appStickersManager.getStickerSet(inputs[0]);
            const promise = result.result.then((set) => {
              const el = i18n('MessageContainsEmojiPack', [wrapEmojiText(set.set.title)]);
              replaceContent(emojisButton.textElement, el);
            });

            return result.cached ? promise : (setPadding(), undefined);
          }

          replaceContent(emojisButton.textElement, i18n('MessageContainsEmojiPacks', [s.size]));
        };

        if(docs.some((doc) => !doc)) {
          setPadding();
          this.managers.appEmojiManager.getCustomEmojiDocuments(docIds).then(p);
        } else {
          return p(docs);
        }
      });
      // emojisButton.element.append(i18n('Loading'));
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

  private async getUrlToMessage() {
    if(!this.message || this.peerId.isUser()) {
      return;
    }

    let threadMessage: Message.message;
    const {peerId, mid} = this;
    const threadId = this.chat.threadId;
    if(this.chat.type === 'discussion') {
      threadMessage = (await this.managers.appMessagesManager.getMessageByPeer(peerId, threadId)) as Message.message;
    }

    const username = await this.managers.appPeersManager.getPeerUsername(threadMessage ? threadMessage.fromId : peerId);
    const msgId = getServerMessageId(mid);
    let url = 'https://t.me/';
    if(username) {
      url += username;
      if(threadMessage) url += `/${getServerMessageId(threadMessage.fwd_from.channel_post)}?comment=${msgId}`;
      else if(threadId) url += `/${getServerMessageId(threadId)}/${msgId}`;
      else url += '/' + msgId;
    } else {
      url += 'c/' + peerId.toChatId();
      if(threadMessage) url += `/${msgId}?thread=${getServerMessageId(threadMessage.mid)}`;
      else if(threadId) url += `/${getServerMessageId(threadId)}/${msgId}`;
      else url += '/' + msgId;
    }

    return {url, isPrivate: !username};
  }

  private async getSelectedMessagesText() {
    if(this.avatarPeerId || !isSelectionEmpty()) {
      return '';
    }

    let mids: number[];
    if(!this.chat.selection.isSelecting) {
      mids = [this.mid];
    } else {
      mids = this.chat.selection.getSelectedMids();
    }

    const parts: string[] = await Promise.all(mids.map(async(mid) => {
      const message = (await this.chat.getMessage(mid)) as Message.message;
      return message?.message ? message.message + '\n' : '';
    }));

    return parts.join('');
  }

  private onSendScheduledClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionSendNowBtn);
    } else {
      PopupElement.createPopup(PopupSendNow, this.peerId, await this.chat.getMidsByMid(this.mid));
    }
  };

  private onReplyClick = () => {
    this.chat.input.initMessageReply(this.mid);
  };

  private onFaveStickerClick = (unfave?: boolean) => {
    const docId = ((this.message as Message.message).media as MessageMedia.messageMediaDocument).document.id;
    this.managers.appStickersManager.faveSticker(docId, unfave);
  };

  private onEditClick = () => {
    const message = this.getMessageWithText();
    this.chat.input.initMessageEditing(this.isTargetAGroupedItem ? this.mid : message.mid);
  };

  private onCopyClick = async() => {
    if(isSelectionEmpty()) {
      copyTextToClipboard(this.selectedMessagesText);
    } else {
      document.execCommand('copy');
      // cancelSelection();
    }
  };

  private onCopyAnchorLinkClick = () => {
    copyTextToClipboard((this.target as HTMLAnchorElement).href);
  };

  private onCopyLinkClick = () => {
    const {url, isPrivate} = this.linkToMessage;
    const key: LangPackKey = isPrivate ? 'LinkCopiedPrivateInfo' : 'LinkCopied';
    toast(I18n.format(key, true));
    copyTextToClipboard(url);
  };

  private onPinClick = () => {
    PopupElement.createPopup(PopupPinMessage, this.peerId, this.mid);
  };

  private onUnpinClick = () => {
    PopupElement.createPopup(PopupPinMessage, this.peerId, this.mid, true);
  };

  private onRetractVote = () => {
    this.managers.appPollsManager.sendVote(this.message as Message.message, []);
  };

  private onStopPoll = () => {
    this.managers.appPollsManager.stopPoll(this.message as Message.message);
  };

  private onForwardClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionForwardBtn);
    } else {
      const peerId = this.peerId;
      const mids = this.isTargetAGroupedItem ? [this.mid] : await this.chat.getMidsByMid(this.mid);
      PopupForward.create({
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
      return;
    }

    const {peerId, message} = this;
    const {fromId, mid} = message;
    const chatId = peerId.isUser() ? undefined : peerId.toChatId();
    if(chatId && await this.managers.appChatsManager.isMegagroup(chatId) && !message.pFlags.out) {
      const participants = await this.managers.appProfileManager.getParticipants(chatId, {_: 'channelParticipantsAdmins'}, 100);
      const foundAdmin = participants.participants.some((participant) => getParticipantPeerId(participant) === fromId);
      if(!foundAdmin) {
        const [banUser, reportSpam, deleteAll] = await confirmationPopup({
          titleLangKey: 'DeleteSingleMessagesTitle',
          peerId: fromId,
          descriptionLangKey: 'AreYouSureDeleteSingleMessageMega',
          checkboxes: [{
            text: 'DeleteBanUser'
          }, {
            text: 'DeleteReportSpam'
          }, {
            text: 'DeleteAllFrom',
            textArgs: [await wrapPeerTitle({peerId: fromId})]
          }],
          button: {
            langKey: 'Delete'
          }
        });

        if(banUser) {
          this.managers.appChatsManager.kickFromChannel(peerId.toChatId(), fromId);
        }

        if(reportSpam) {
          this.managers.appMessagesManager.reportMessages(peerId, [mid], 'inputReportReasonSpam');
        }

        if(deleteAll) {
          this.managers.appMessagesManager.doFlushHistory(peerId, false, true, undefined, fromId);
        } else {
          this.managers.appMessagesManager.deleteMessages(peerId, [mid], true);
        }

        return;
      }
    }

    PopupElement.createPopup(
      PopupDeleteMessages,
      peerId,
      this.isTargetAGroupedItem ? [mid] : await this.chat.getMidsByMid(mid),
      this.chat.type
    );
  };

  public static onDownloadClick(messages: MyMessage | MyMessage[], noForwards?: boolean): DownloadBlob | DownloadBlob[] {
    if(Array.isArray(messages)) {
      return messages.map((message) => {
        return this.onDownloadClick(message) as any;
      });
    }

    if(!this.canDownload(messages, undefined, noForwards)) {
      return;
    }

    return appDownloadManager.downloadToDisc({media: getMediaFromMessage(messages, true)});
  };
}
