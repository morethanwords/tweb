/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import type Chat from './chat';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import ButtonMenu, {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from '../buttonMenu';
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
import {Message, Poll, Chat as MTChat, MessageMedia, AvailableReaction, MessageEntity, InputStickerSet, StickerSet, Document, Reaction, Photo, SponsoredMessage, ChannelParticipant, TextWithEntities, SponsoredPeer, TodoItem, TodoCompletion} from '../../layer';
import assumeType from '../../helpers/assumeType';
import PopupSponsored from '../popups/sponsored';
import ListenerSetter from '../../helpers/listenerSetter';
import {getMiddleware} from '../../helpers/middleware';
import PeerTitle from '../peerTitle';
import StackedAvatars from '../stackedAvatars';
import {IS_APPLE, IS_MOBILE} from '../../environment/userAgent';
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
import wrapEmojiText, {wrapEmojiTextWithEntities} from '../../lib/richTextProcessor/wrapEmojiText';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import PopupStickers from '../popups/stickers';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import canSaveMessageMedia from '../../lib/appManagers/utils/messages/canSaveMessageMedia';
import getGroupedText from '../../lib/appManagers/utils/messages/getGroupedText';
import PopupElement from '../popups';
import confirmationPopup, {PopupConfirmationOptions} from '../confirmationPopup';
import Icon from '../icon';
import cloneDOMRect from '../../helpers/dom/cloneDOMRect';
import PopupPremium from '../popups/premium';
import {ChatInputReplyTo} from './input';
import {FullMid, makeFullMid, TEST_BUBBLES_DELETION} from './bubbles';
import AppStatisticsTab from '../sidebarRight/tabs/statistics';
import {ChatType} from './chat';
import {formatFullSentTime} from '../../helpers/date';
import PopupToggleReadDate from '../popups/toggleReadDate';
import rootScope from '../../lib/rootScope';
import ReactionElement from './reaction';
import InputField from '../inputField';
import getMainGroupedMessage from '../../lib/appManagers/utils/messages/getMainGroupedMessage';
import PopupTranslate from '../popups/translate';
import getRichSelection from '../../helpers/dom/getRichSelection';
import detectLanguageForTranslation from '../../helpers/detectLanguageForTranslation';
import usePeerTranslation from '../../hooks/usePeerTranslation';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import documentFragmentToHTML from '../../helpers/dom/documentFragmentToHTML';
import PopupReportAd from '../popups/reportAd';
import PopupAboutAd from '../popups/aboutAd';
import getRichValueWithCaret from '../../helpers/dom/getRichValueWithCaret';
import deepEqual from '../../helpers/object/deepEqual';
import wrapDraftText from '../../lib/richTextProcessor/wrapDraftText';
import flatten from '../../helpers/array/flatten';
import PopupStarReaction from '../popups/starReaction';
import getUniqueCustomEmojisFromMessage from '../../lib/appManagers/utils/messages/getUniqueCustomEmojisFromMessage';
import getPeerTitle from '../wrappers/getPeerTitle';
import {getFullDate} from '../../helpers/date/getFullDate';
import PaidMessagesInterceptor, {PAYMENT_REJECTED} from './paidMessagesInterceptor';
import {MySponsoredPeer} from '../../lib/appManagers/appChatsManager';
import {PopupChecklist} from '../popups/checklist';
import createSubmenuTrigger from '../createSubmenuTrigger';
import noop from '../../helpers/noop';
import {isSensitive} from '../../helpers/restrictions';
import {hasSensitiveSpoiler} from '../wrappers/mediaSpoiler';
import {useAppConfig, useIsFrozen} from '../../stores/appState';

type ChatContextMenuButton = ButtonMenuItemOptions & {
  verify: () => boolean | Promise<boolean>,
  notDirect?: () => boolean,
  withSelection?: true,
  isSponsored?: true,
  localName?: 'views' | 'emojis' | 'sponsorInfo' | 'sponsorAdditionalInfo'
};

export function getSponsoredMessageButtons(options: {
  message?: SponsoredMessage | MySponsoredPeer,
  handleReportAd: () => void,
  handleCopy?: () => void,
  extraVerify?: () => boolean,
}): ChatContextMenuButton[] {
  const {
    message,
    extraVerify = () => true,
    handleReportAd,
    handleCopy
  } = options;
  if(!message) return []

  const canReport = message._ === 'sponsoredPeer' ? true : message.pFlags.can_report;

  return [
    {
      icon: 'info',
      text: 'Chat.Message.Sponsored.What',
      onClick: () => {
        PopupElement.createPopup(PopupSponsored);
      },
      verify: () => extraVerify() && !canReport,
      isSponsored: true
    }, {
      icon: 'info',
      text: 'AboutRevenueSharingAds',
      onClick: () => {
        PopupElement.createPopup(PopupAboutAd);
      },
      verify: () => extraVerify() && !!canReport,
      isSponsored: true
    }, {
      icon: 'hand',
      text: 'HideAd',
      onClick: () => {
        PopupPremium.show({feature: 'no_ads'});
      },
      verify: () => extraVerify() && !canReport,
      isSponsored: true
    }, {
      icon: 'hand',
      text: 'ReportAd',
      onClick: handleReportAd,
      verify: () => extraVerify() && !!canReport,
      isSponsored: true
    }, {
      icon: 'crossround',
      text: 'RemoveAds',
      onClick: () => {
        PopupPremium.show({feature: 'no_ads'});
      },
      verify: () => extraVerify() && !!canReport,
      isSponsored: true
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: handleCopy,
      verify: () => handleCopy != null && extraVerify(),
      isSponsored: true
    }, {
      regularText: message.sponsor_info ? wrapEmojiText(message.sponsor_info) : undefined,
      separator: true,
      secondary: true,
      onClick: () => copyTextToClipboard(message.sponsor_info),
      verify: () => extraVerify() && !!message.sponsor_info,
      isSponsored: true
    }, {
      regularText: message.additional_info ? wrapEmojiText(message.additional_info) : undefined,
      separator: true,
      secondary: true,
      onClick: () => copyTextToClipboard(message.additional_info),
      verify: () => extraVerify() && !!message.additional_info,
      isSponsored: true
    }]
}

export default class ChatContextMenu {
  private buttons: ChatContextMenuButton[];
  private element: HTMLElement;

  private isSelectable: boolean;
  private isSelected: boolean;
  private target: HTMLElement;
  private isTargetAGroupedItem: boolean;
  private isTextSelected: boolean;
  private isTextFromMultipleMessagesSelected: boolean;
  private isAnchorTarget: boolean;
  private isUsernameTarget: boolean;
  private isEmailTarget: boolean;
  private isSponsored: boolean;
  private isOverBubble: boolean;
  private isTag: boolean;
  private reactionElement: ReactionElement;
  private peerId: PeerId;
  private mid: number;
  private message: Message.message | Message.messageService;
  private mainMessage: Message.message | Message.messageService;
  private sponsoredMessage: SponsoredMessage;
  private noForwards: boolean;
  private checklistItem: {item: TodoItem, completion?: TodoCompletion};

  private reactionsMenu: ChatReactionsMenu;
  private listenerSetter: ListenerSetter;
  private attachListenerSetter: ListenerSetter;

  private viewerPeerId: PeerId;
  private middleware: ReturnType<typeof getMiddleware>;
  private canOpenReactedList: boolean;

  private emojiInputsPromise: CancellablePromise<InputStickerSet.inputStickerSetID[]>;
  private groupedMessages: Message.message[];
  private linkToMessage: Awaited<ReturnType<ChatContextMenu['getUrlToMessage']>>;
  private selectedMessagesText: Awaited<ReturnType<ChatContextMenu['getSelectedMessagesText']>>;
  private selectedMessages: MyMessage[];
  private avatarPeerId: number;

  private isLegacy: boolean;
  private messagePeerId: number;

  private canViewReadTime: boolean;
  private messageLanguage: TranslatableLanguageISO;

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
          '.reply-markup-button',
          '.bubble-view-button',
          '.webpage',
          '.bubbles-group-avatar',
          '.bubble-service-button'
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

    // * handle message deletion
    this.attachListenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      if(peerId !== this.chat.peerId) {
        return;
      }

      if(this.mid && msgs.has(this.mid)) {
        contextMenuController.close();
        return;
      }

      if(this.chat.selection.isSelecting && this.selectedMessages) {
        const hasDeletedSelectedMessage = this.selectedMessages.some((message) => msgs.has(message.mid));
        if(hasDeletedSelectedMessage) {
          contextMenuController.close();
          return;
        }
      }

      if(this.groupedMessages) {
        const hasDeletedGroupedMessage = this.groupedMessages.some((message) => msgs.has(message.mid));
        if(hasDeletedGroupedMessage) {
          contextMenuController.close();
        }
      }
    });
  }

  public onContextMenu = (e: MouseEvent | Touch | TouchEvent) => {
    let bubble: HTMLElement, contentWrapper: HTMLElement, avatar: HTMLElement;

    try {
      contentWrapper = findUpClassName(e.target, 'bubble-content-wrapper');
      bubble = contentWrapper ? contentWrapper.parentElement : findUpClassName(e.target, 'bubble');
      avatar = findUpClassName(e.target, 'bubbles-group-avatar') as HTMLElement || undefined;
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

    if(avatar && !avatar.dataset.peerId) {
      toastNew({langPackKey: 'HidAccount'});
      return;
    }

    const paidReactionElement = (e.target as HTMLElement).closest('.reaction.is-paid');
    if(paidReactionElement) {
      PopupElement.createPopup(PopupStarReaction, bubble.dataset.peerId.toPeerId(), mid, this.chat);
      return;
    }

    const tagReactionElement = findUpClassName(e.target, 'reaction-tag');
    let checklistItemId: number;
    const checklistItemElement = (e.target as HTMLElement).closest('[data-checklist-item-id]');
    if(checklistItemElement) {
      checklistItemId = +(checklistItemElement as HTMLElement).dataset.checklistItemId;
    }

    const r = async() => {
      const isSponsored = this.isSponsored = mid < 0;
      this.isSelectable = this.chat.selection.canSelectBubble(bubble);
      this.messagePeerId = bubble ? bubble.dataset.peerId.toPeerId() : undefined;
      this.peerId = this.messagePeerId ?? this.chat.peerId;
      this.target = e.target as HTMLElement;
      this.isTextSelected = !isSelectionEmpty();
      this.isAnchorTarget = this.target.tagName === 'A' && (
        (this.target as HTMLAnchorElement).target === '_blank' ||
        this.target.classList.contains('anchor-url')
      );
      this.isEmailTarget = this.isAnchorTarget && (this.target as HTMLAnchorElement).href.startsWith('mailto:');
      this.isUsernameTarget = this.target.tagName === 'A' && this.target.classList.contains('mention');
      this.isTag = !!tagReactionElement;
      this.reactionElement = tagReactionElement as ReactionElement;

      if(this.isTag && !rootScope.premium) {
        PopupPremium.show({feature: 'saved_tags'});
        return;
      }

      if(this.isTextSelected) {
        const range = document.getSelection().getRangeAt(0);
        this.isTextFromMultipleMessagesSelected = findUpClassName(range.startContainer.parentElement, 'spoilers-container') !== findUpClassName(range.endContainer.parentElement, 'spoilers-container');
      } else {
        this.isTextFromMultipleMessagesSelected = false;
      }

      this.sponsoredMessage = isSponsored ? (bubble as any).message.sponsoredMessage : undefined;

      const mids = avatar ? [] : await this.chat.getMidsByMid(this.messagePeerId, mid);
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

      this.avatarPeerId = avatar && avatar.dataset.peerId.toPeerId();

      const groupedItem = findUpClassName(this.target, 'grouped-item');
      this.isTargetAGroupedItem = !!groupedItem;
      if(groupedItem) {
        this.mid = +groupedItem.dataset.mid;
      } else {
        this.mid = mid;
      }

      this.isLegacy = this.messagePeerId && this.messagePeerId !== this.peerId;
      this.isSelected = this.chat.selection.isMidSelected(this.messagePeerId, this.mid);
      this.message = avatar ? undefined : (bubble as any).message || this.chat.getMessageByPeer(this.messagePeerId, this.mid);
      this.groupedMessages = (this.message as Message.message)?.grouped_id ? await this.managers.appMessagesManager.getMessagesByGroupedId((this.message as Message.message).grouped_id) : undefined;
      if(!groupedItem && this.groupedMessages) this.message = getMainGroupedMessage(this.groupedMessages);
      this.mainMessage = this.groupedMessages ? getMainGroupedMessage(this.groupedMessages) : this.message;
      this.selectedMessages = this.chat.selection.isSelecting && !avatar ? await this.chat.selection.getSelectedMessages() : undefined;
      this.noForwards = this.message && !isSponsored && !(await Promise.all((this.selectedMessages || [this.message]).map((message) => this.managers.appMessagesManager.canForward(message)))).every(Boolean);
      this.viewerPeerId = undefined;
      this.canOpenReactedList = undefined;
      this.linkToMessage = await this.getUrlToMessage();
      this.selectedMessagesText = await this.getSelectedMessagesText();
      this.messageLanguage = useAppConfig().freeze_since_date || this.selectedMessages || !this.message ? undefined : await detectLanguageForTranslation((this.message as Message.message).message);

      if(checklistItemId) {
        const media = (this.message as Message.message).media as MessageMedia.messageMediaToDo;
        this.checklistItem = {
          item: media.todo.list.find((item) => item.id === checklistItemId),
          completion: media.completions?.find((completion) => completion.id === checklistItemId)
        };
      } else {
        this.checklistItem = undefined;
      }

      const initResult = await this.init();
      if(!initResult) {
        return;
      }

      element = initResult.element;
      const {cleanup, destroy, menuPadding, reactionsMenu, reactionsMenuPosition} = initResult;
      const reactionsCallbacks = reactionsMenu && ChatContextMenu.appendReactionsMenu({element, reactionsMenu, reactionsMenuPosition});

      const side: 'left' | 'right' = !bubble || bubble.classList.contains('is-in') ? 'left' : 'right';
      // bubble.parentElement.append(element);
      // appImManager.log('contextmenu', e, bubble, side);
      positionMenu((e as TouchEvent).touches ? (e as TouchEvent).touches[0] : e as MouseEvent, element, side, menuPadding);

      // if(reactionsMenu) {
      //   reactionsMenu.widthContainer.style.top = element.style.top;
      //   reactionsMenu.widthContainer.style.left = element.style.left;
      //   reactionsMenu.widthContainer.style.setProperty('--menu-width', element[reactionsMenuPosition === 'vertical' ? 'offsetHeight' : 'offsetWidth'] + 'px');
      //   element.parentElement.append(reactionsMenu.widthContainer);
      //   if(isReactionsMenuVisible) void reactionsMenu.container.offsetLeft; // reflow
      // }

      contextMenuController.openBtnMenu(element, () => {
        reactionsCallbacks?.onClose();

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

      reactionsCallbacks?.onAfterInit();
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
    if(this.isTag) {
      const tagTitle = this.reactionElement.findTitle();
      const reactionCount = this.reactionElement.reactionCount;
      const renameTitle: LangPackKey = tagTitle ? 'SavedTagRenameTag' : 'SavedTagLabelTag';
      this.buttons = [{
        icon: 'tag_filter',
        text: 'SavedTagFilterByTag',
        onClick: () => {
          this.chat.initSearch({reaction: reactionCount.reaction});
        },
        verify: () => true
      }, {
        icon: 'tag_name',
        text: renameTitle,
        onClick: async() => {
          const inputField = new InputField({
            maxLength: 12,
            label: 'SavedTagLabelPlaceholder'
          });

          tagTitle && inputField.setOriginalValue(tagTitle);

          await confirmationPopup({
            titleLangKey: renameTitle,
            descriptionLangKey: 'SavedTagLabelTagText',
            button: {
              langKey: 'Save'
            },
            inputField
          });

          this.managers.appReactionsManager.updateSavedReactionTag(
            reactionCount.reaction,
            inputField.value
          );
        },
        verify: () => true
      }, {
        icon: 'tag_crossed',
        text: 'SavedTagRemoveTag',
        onClick: () => {
          this.chat.sendReaction({message: this.message, reaction: reactionCount.reaction});
        },
        verify: () => true,
        danger: true
      }, {
        // icon: 'smile',
        text: 'Loading',
        onClick: () => {
          this.emojiInputsPromise.then((inputs) => {
            PopupElement.createPopup(PopupStickers, inputs, true, this.chat.input).show();
          });
        },
        verify: () => reactionCount.reaction._ === 'reactionCustomEmoji',
        localName: 'emojis'
      }];
      return;
    }

    if(this.avatarPeerId !== undefined) {
      const openPeer = () => {
        this.chat.appImManager.setInnerPeer({
          peerId: this.avatarPeerId,
          stack: this.chat.appImManager.getStackFromElement(this.target)
        });
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
          this.chat.input.mentionUser(this.avatarPeerId, false);
        },
        verify: () => /* this.avatarPeerId.isUser() &&  */this.chat.canSend('send_plain')
      }, {
        icon: 'search',
        text: 'Search',
        onClick: () => {
          this.chat.initSearch({filterPeerId: this.avatarPeerId});
        },
        verify: () => this.chat.isAnyGroup
      }];
      return;
    }

    const isGif = (() => {
      const doc = ((this.message as Message.message).media as MessageMedia.messageMediaDocument)?.document;
      const isGif = (doc as MyDocument)?.type === 'gif';
      return isGif;
    })();

    const verifyFavoriteSticker = async(toAdd: boolean) => {
      const doc = ((this.message as Message.message).media as MessageMedia.messageMediaDocument)?.document;
      if(!(doc as MyDocument)?.sticker && !isGif) {
        return false;
      }

      const favedStickers = await (isGif ? this.managers.acknowledged.appGifsManager.getGifs() : this.managers.acknowledged.appStickersManager.getFavedStickersStickers());
      if(!favedStickers.cached) {
        return false;
      }

      const found = (await favedStickers.result).some((_doc) => _doc.id === doc.id);
      return toAdd ? !found : found;
    };

    const self = this;

    this.buttons = [{
      // secondary: true,
      onClick: () => {
        if(this.canViewReadTime === false) {
          PopupElement.createPopup(PopupToggleReadDate, this.peerId, 'readTime');
        }
      },
      verify: () => this.peerId.isUser() && this.managers.appMessagesManager.canViewMessageReadParticipants(this.message),
      notDirect: () => true,
      localName: 'views',
      checkForClose: () => {
        return this.canViewReadTime !== undefined;
      }
    }, createSubmenuTrigger({
      icon: 'more',
      get regularText() { return self.checklistItem ? wrapEmojiTextWithEntities(self.checklistItem.item.title) : undefined },
      verify: () => this.checklistItem !== undefined,
      separatorDown: true
    }, this.createChecklistItemSubmenu) as ChatContextMenuButton, {
      icon: 'send2',
      text: 'MessageScheduleSend',
      onClick: this.onSendScheduledClick,
      verify: () => this.chat.type === ChatType.Scheduled && !this.message.pFlags.is_outgoing
    }, {
      icon: 'send2',
      text: 'Message.Context.Selection.SendNow',
      onClick: this.onSendScheduledClick,
      verify: () => this.chat.type === ChatType.Scheduled &&
        this.isSelected &&
        !this.chat.selection.selectionSendNowBtn.hasAttribute('disabled'),
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
      verify: () => this.chat.type === ChatType.Scheduled
    }, {
      icon: 'message_quote',
      text: 'Quote',
      onClick: this.onQuoteClick,
      verify: async() => /* await this.chat.canSend() && */
        !this.message.pFlags.is_outgoing &&
        !!this.chat.input.messageInput &&
        !!(this.message as Message.message).message &&
        this.isTextSelected &&
        !this.isTextFromMultipleMessagesSelected &&
        (!usePeerTranslation(this.peerId).enabled() || this.message.pFlags.out) &&
        (this.chat.bubbles.canForward(this.message) || this.chat.canSend())
    }, {
      icon: 'reply',
      text: 'Reply',
      onClick: this.onReplyClick,
      verify: async() => !this.isLegacy &&
        // await this.chat.canSend() &&
        !this.message.pFlags.is_outgoing &&
        !!this.chat.input.messageInput &&
        this.chat.type !== ChatType.Scheduled &&
        (this.chat.bubbles.canForward(this.message) || this.chat.canSend())/* ,
      cancelEvent: true */
    }, {
      icon: 'bubblereply',
      text: 'ViewReplies',
      textArgs: [(this.message as Message.message)?.replies?.replies],
      onClick: () => {
        this.chat.appImManager.openThread({
          peerId: this.message.peerId,
          threadId: this.message.mid,
          lastMsgId: 0
        });
      },
      verify: () => {
        if(this.chat.threadId) return false;
        const replies = (this.message as Message.message)?.replies;
        return !!(replies && !replies.pFlags.comments && replies.replies);
      }
    }, {
      icon: isGif ? 'gifs' : 'favourites',
      text: isGif ? 'SaveToGIFs' : 'AddToFavorites',
      onClick: this.onFaveStickerClick.bind(this, false),
      verify: () => verifyFavoriteSticker(true)
    }, {
      icon: isGif ? 'crossgif' : 'crossstar',
      text: isGif ? 'Message.Context.RemoveGif' : 'DeleteFromFavorites',
      onClick: this.onFaveStickerClick.bind(this, true),
      verify: () => verifyFavoriteSticker(false)
    }, {
      icon: 'edit',
      text: 'Edit',
      onClick: this.onEditClick,
      verify: async() => (await this.managers.appMessagesManager.canEditMessage(this.message, 'text')) &&
        !!this.chat.input.messageInput ||
        (this.message._ === 'message' && this.message.pFlags?.out && this.message.suggested_post && !this.message.suggested_post.pFlags?.accepted && !this.message.suggested_post.pFlags?.rejected)
    }, {
      icon: 'plusround',
      text: 'ChecklistAddTasks',
      onClick: this.onAddTaskClick,
      verify: async() => {
        if(this.message._ !== 'message' || this.message.media?._ !== 'messageMediaToDo') return false
        if(this.message.pFlags.is_outgoing) return false
        return this.message.pFlags.out || this.message.media.todo.pFlags.others_can_append
      }/* ,
      cancelEvent: true */
    }, {
      icon: 'factcheck',
      text: (this.mainMessage as Message.message)?.factcheck ? 'EditFactCheck' : 'AddFactCheck',
      onClick: this.onEditFactCheckClick,
      verify: () => this.mainMessage && this.managers.appMessagesManager.canUpdateFactCheck(this.mainMessage.peerId, this.mainMessage.mid)
    }, {
      icon: 'copy',
      text: 'Copy',
      onClick: this.onCopyClick,
      verify: () => !this.noForwards &&
        !!(this.message as Message.message).message &&
        !this.isTextSelected &&
        (!this.isAnchorTarget || (this.message as Message.message).message !== this.target.innerText)
    }, {
      icon: 'copy',
      text: 'Chat.CopySelectedText',
      onClick: this.onCopyClick,
      verify: () => !this.noForwards && !!(this.message as Message.message).message && this.isTextSelected
    }, {
      icon: 'search',
      text: 'Chat.SearchSelected',
      onClick: () => {
        const selection = document.getSelection();
        this.chat.initSearch({query: selection.toString()});
      },
      verify: () => !!(this.message as Message.message).message && this.isTextSelected
    }, {
      icon: 'copy',
      text: 'Message.Context.Selection.Copy',
      onClick: this.onCopyClick,
      verify: async() => {
        if(!this.isSelected || this.noForwards) {
          return false;
        }

        for(const [peerId, mids] of this.chat.selection.selectedMids) {
          const storageKey: MessagesStorageKey = `${peerId}_${this.chat.type === ChatType.Scheduled ? 'scheduled' : 'history'}`;
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
      text: this.isEmailTarget ? 'Text.Context.Copy.Email' : 'CopyLink',
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
      icon: 'premium_translate',
      text: 'TranslateMessage',
      onClick: () => {
        const peerTranslation = usePeerTranslation(this.peerId);
        if(!peerTranslation.canTranslate(true)) {
          PopupPremium.show({feature: 'translations'});
        } else {
          let textWithEntities: TextWithEntities;
          if(this.isTextSelected) {
            const {text, entities} = this.getQuotedText();
            textWithEntities = {_: 'textWithEntities', text, entities};
          }

          PopupElement.createPopup(PopupTranslate, {
            peerId: textWithEntities ? this.peerId : this.message.peerId,
            textWithEntities,
            message: textWithEntities ? undefined : this.message as Message.message,
            detectedLanguage: this.messageLanguage
          });
        }
      },
      verify: () => !!this.messageLanguage
    }, {
      icon: 'link',
      text: 'MessageContext.CopyMessageLink1',
      onClick: this.onCopyLinkClick,
      verify: async() => !this.isLegacy && await this.managers.appPeersManager.isChannel(this.peerId) && !this.chat.isMonoforum && !this.message.pFlags.is_outgoing
    }, {
      icon: 'pin',
      text: 'Message.Context.Pin',
      onClick: this.onPinClick,
      verify: async() => !this.isLegacy &&
        !this.chat.isMonoforum &&
        !this.message.pFlags.is_outgoing &&
        this.message._ !== 'messageService' &&
        !this.message.pFlags.pinned &&
        await this.managers.appPeersManager.canPinMessage(this.message.peerId) &&
        this.chat.type !== ChatType.Scheduled &&
        !useIsFrozen()
    }, {
      icon: 'unpin',
      text: 'Message.Context.Unpin',
      onClick: this.onUnpinClick,
      verify: () => (this.message as Message.message).pFlags.pinned &&
        this.managers.appPeersManager.canPinMessage(this.message.peerId) &&
        !useIsFrozen()
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.message, this.noForwards, this.chat.container),
      verify: () => ChatContextMenu.canDownload(this.message, this.target, this.noForwards, this.chat.container)
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
        return await this.managers.appMessagesManager.canEditMessage(this.message, 'poll') &&
          poll &&
          !poll.pFlags.closed &&
          !this.message.pFlags.is_outgoing;
      }/* ,
      cancelEvent: true */
    }, {
      icon: 'statistics',
      text: 'ViewStatistics',
      onClick: this.onStatisticsClick,
      verify: async() => await this.managers.appPeersManager.isBroadcast(this.messagePeerId) &&
        await this.managers.appProfileManager.canViewStatistics(this.messagePeerId) &&
        !this.message.pFlags.is_outgoing
    }, {
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick, // let forward the message if it's outgoing but not ours (like a changelog)
      verify: () => !this.noForwards &&
        this.chat.type !== ChatType.Scheduled &&
        (!this.message.pFlags.is_outgoing || this.message.fromId === SERVICE_PEER_ID) &&
        this.message._ !== 'messageService'
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
      onClick: () => ChatContextMenu.onDownloadClick(this.selectedMessages, this.noForwards, this.chat.container),
      verify: () => this.selectedMessages && ChatContextMenu.canDownload(this.selectedMessages, undefined, this.noForwards, this.chat.container),
      withSelection: true
    }, {
      icon: 'flag',
      text: 'ReportChat',
      onClick: () => {
        PopupReportAd.createMessageReport(this.messagePeerId, [this.mid]);
      },
      verify: () => !this.message.pFlags.out &&
        this.message._ === 'message' &&
        !this.message.pFlags.is_outgoing &&
        this.managers.appPeersManager.isChannel(this.messagePeerId),
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
      verify: () => !this.peerId.isUser() &&
        (!!(this.message as Message.message).reactions?.recent_reactions?.length || this.managers.appMessagesManager.canViewMessageReadParticipants(this.message)),
      notDirect: () => true,
      localName: 'views'
    }, {
      icon: 'rotate_right',
      text: 'Resend',
      onClick: () => this.handleRepay(),
      verify: () => 'repayRequest' in this.message && !!this.message.repayRequest
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: async() => this.managers.appMessagesManager.canDeleteMessage(this.message)
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Message.Context.Selection.Delete',
      onClick: this.onDeleteClick,
      verify: () => this.isSelected && !this.chat.selection.selectionDeleteBtn.hasAttribute('disabled'),
      notDirect: () => true,
      withSelection: true
    },
    ...getSponsoredMessageButtons({
      message: this.sponsoredMessage,
      extraVerify: () => this.isSponsored,
      handleReportAd: () => {
        const {peerId, mid} = this.message;
        PopupReportAd.createAdReport(this.sponsoredMessage, () => {
          this.chat.bubbles.deleteMessagesByIds([makeFullMid(peerId, mid)], true)
        });
      },
      handleCopy: this.onCopyClick
    }),
    {
      // icon: 'smile',
      text: 'Loading',
      onClick: () => {
        this.emojiInputsPromise.then((inputs) => {
          PopupElement.createPopup(PopupStickers, inputs, true, this.chat.input).show();
        });
      },
      verify: () => !!this.getUniqueCustomEmojisFromMessage().length,
      notDirect: () => true,
      localName: 'emojis'
    }];
  }

  private createChecklistItemSubmenu = async() => {
    const {item, completion} = this.checklistItem;
    const message = this.message as Message.message & {media: MessageMedia.messageMediaToDo};
    const canEdit = await this.managers.appMessagesManager.canEditMessage(message, 'text');
    const buttons: ButtonMenuItemOptionsVerifiable[] = [
      {
        icon: 'check',
        regularText: completion ? formatFullSentTime(completion.date) : undefined,
        separatorDown: true,
        verify: () => !!completion,
        onClick: noop
      },
      {
        icon: completion ? 'checklist_undone' : 'checklist_done',
        text: completion ? 'ChecklistUncheck' : 'ChecklistCheck',
        verify: () => message.media.todo.pFlags.others_can_complete || message.fromId === this.managers.rootScope.myId,
        onClick: () => {
          this.managers.appMessagesManager.updateTodo({
            peerId: message.peerId,
            mid: message.mid,
            taskId: item.id,
            action: completion ? 'uncomplete' : 'complete'
          })
        }
      },
      {
        icon: 'copy',
        text: 'Copy',
        onClick: () => copyTextToClipboard(item.title.text)
      },
      {
        icon: 'edit',
        text: 'ChecklistEditItem',
        verify: () => canEdit,
        onClick: () => {
          PopupElement.createPopup(PopupChecklist, {
            chat: this.chat,
            editMessage: message,
            focusItemId: item.id
          }).show();
        }
      },
      {
        icon: 'delete',
        text: 'ChecklistDeleteItem',
        verify: () => canEdit,
        separator: true,
        danger: true,
        onClick: async() => {
          await this.managers.appMessagesManager.editMessage(message, message.message, {
            newMedia: {
              _: 'inputMediaTodo',
              todo: {
                ...message.media.todo,
                list: message.media.todo.list.filter((v) => v.id !== item.id)
              }
            }
          });
        }
      }
    ]

    return ButtonMenu({
      buttons: await filterAsync(buttons, (button) => button.verify?.() ?? true)
    })
  }

  public static canDownload(
    message: MyMessage | MyMessage[],
    withTarget?: HTMLElement,
    noForwards?: boolean,
    container?: HTMLElement
  ): boolean {
    if(Array.isArray(message)) {
      return message.some((message) => ChatContextMenu.canDownload(message, withTarget, noForwards, container));
    }

    if(!canSaveMessageMedia(message) || noForwards) {
      return false;
    }

    const photo = ((message as Message.message).media as MessageMedia.messageMediaPhoto)?.photo as Photo.photo;
    const document = ((message as Message.message).media as MessageMedia.messageMediaDocument)?.document as Document.document;
    const isPhoto: boolean = !!photo;
    let isGoodType = false

    if(isPhoto) {
      isGoodType = true;
    } else {
      if(!document) {
        return false;
      }

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

    if(container && (message as Message.message).restriction_reason && isSensitive((message as Message.message).restriction_reason)) {
      const item = container.querySelector(`[data-mid="${message.mid}"]`);
      return item && !hasSensitiveSpoiler(item as HTMLElement);
    }

    return isGoodType && hasTarget;
  }

  private getMessageWithText() {
    return (this.groupedMessages && getGroupedText(this.groupedMessages)) || this.message;
  }

  private getUniqueCustomEmojisFromMessage() {
    return getUniqueCustomEmojisFromMessage(this.getMessageWithText());
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
    if(viewsButton && this.peerId.isUser()) {
      viewsButton.element.prepend(Icon('checks', 'btn-menu-item-icon'));
      const loader = document.createElement('div');
      loader.classList.add('btn-menu-item-loader', 'shimmer');
      viewsButton.textElement.append(loader);
      // viewsButton.element.classList.add('is-smaller');

      viewsButton.element.after(document.createElement('hr'));
      const delimiter = viewsButton.element.nextElementSibling;

      const middleware = this.middleware.get();
      this.managers.appMessagesManager.getOutboxReadDate(this.message.peerId, this.message.mid).then((outboxReadDate) => {
        if(!middleware()) {
          return;
        }

        this.canViewReadTime = true;
        // loader.replaceWith(i18n('PmRead'), ' ', formatFullSentTime(outboxReadDate.date, false, false));
        // loader.replaceWith(i18n('Chat.ContextMenu.Read'), ' ', formatFullSentTime(outboxReadDate.date, false, false));
        loader.replaceWith(formatFullSentTime(outboxReadDate.date, true, false));
      }, (err) => {
        if(!middleware()) {
          return;
        }

        if((err as ApiError).type !== 'YOUR_PRIVACY_RESTRICTED') {
          delimiter.remove();
          viewsButton.element.remove();
          return;
        }

        this.canViewReadTime = false;
        const when = i18n('PmReadShowWhen');
        when.classList.add('show-when');
        loader.replaceWith(i18n('Chat.ContextMenu.Read'), ' ', when);
      });
    } else if(viewsButton) {
      const reactions = (this.message as Message.message).reactions;
      const recentReactions = reactions?.recent_reactions;
      const isViewingReactions = !!recentReactions?.length;
      const participantsCount = await this.managers.appMessagesManager.canViewMessageReadParticipants(this.message) ?
        ((await this.managers.appPeersManager.getPeer(this.peerId)) as MTChat.chat).participants_count :
        undefined;
      const reactedLength = reactions ? reactions.results.reduce((acc, r) => acc + r.count, 0) : undefined;

      viewsButton.element.prepend(Icon(isViewingReactions ? 'reactions' : 'checks', 'btn-menu-item-icon'));
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
          const avatars = new StackedAvatars({avatarSize: AVATAR_SIZE, middleware});
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
      this.message &&
      (this.message._ === 'message' || (this.message._ === 'messageService' && this.message.pFlags.reactions_are_possible)) &&
      !this.chat.selection.isSelecting &&
      !this.message.pFlags.is_outgoing &&
      !(this.message._ === 'message' && this.message.pFlags.is_scheduled) &&
      !this.message.pFlags.local &&
      !this.reactionElement
    ) {
      const reactions = this.message.reactions;
      const tags = this.message.peerId === rootScope.myId && (!reactions || reactions.pFlags.reactions_as_tags);
      const reactionsMessage = this.message._ === 'message' ?
        await this.managers.appMessagesManager.getGroupsFirstMessage(this.message) :
        this.message;
      reactionsMenuPosition = (IS_APPLE || IS_TOUCH_SUPPORTED) || true/*  && false */ ? 'horizontal' : 'vertical';
      reactionsMenu = this.reactionsMenu = new ChatReactionsMenu({
        managers: this.managers,
        type: reactionsMenuPosition,
        middleware: this.middleware.get(),
        onFinish: async(reaction) => {
          contextMenuController.close();
          reaction = await reaction;
          if(!reaction) {
            return;
          }

          if(reaction._ === 'reactionPaid') {
            PopupElement.createPopup(PopupStarReaction, reactionsMessage.peerId, reactionsMessage.mid, this.chat);
            return;
          }

          if(!rootScope.premium && tags) {
            PopupPremium.show({feature: 'saved_tags'});
            return;
          }

          this.chat.sendReaction({message: reactionsMessage, reaction});
        },
        getOpenPosition: (hasMenu) => ChatContextMenu.getReactionsOpenPosition(reactionsMenu, hasMenu),
        isTags: tags
      });
      await reactionsMenu.init(reactionsMessage);
      // element.prepend(reactionsMenu.widthContainer);

      menuPadding = ChatContextMenu.getReactionsMenuPadding(reactionsMenuPosition);
    }

    const emojisButton = filteredButtons.find((button) => button.localName === 'emojis');
    if(emojisButton) {
      emojisButton.element.classList.add('is-multiline');
      emojisButton.element.parentElement.insertBefore(document.createElement('hr'), emojisButton.element);

      const setPadding = () => {
        menuPadding ??= {};
        menuPadding.bottom = 24;
      };

      const docIds = this.reactionElement ?
        [(this.reactionElement.reactionCount.reaction as Reaction.reactionCustomEmoji).document_id] :
        this.getUniqueCustomEmojisFromMessage();
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
              const el = i18n(
                this.isTag ? 'Reaction.Tag.From' : (this.reactionElement ? 'MessageContainsReactionPack' : 'MessageContainsEmojiPack'),
                [wrapEmojiText(set.set.title)]
              );
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
    this.buttons.forEach((button) => button.onOpen?.());

    return {
      element,
      cleanup: () => {
        this.cleanup();
        reactionsMenu && reactionsMenu.cleanup();
      },
      destroy: () => {
        element.remove();
        this.buttons.forEach((button) => button.onClose?.());
        reactionsMenu && reactionsMenu.widthContainer.remove();
      },
      menuPadding,
      reactionsMenu,
      reactionsMenuPosition
    };
  }

  private async getUrlToMessage() {
    if(!this.message || this.messagePeerId.isUser()) {
      return;
    }

    let threadMessage: Message.message;
    const {peerId, mid} = this.message;
    const threadId = this.chat.threadId;
    if(this.chat.type === ChatType.Discussion) {
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
      return;
    }

    let fullMids: FullMid[];
    if(!this.chat.selection.isSelecting) {
      const message = this.getMessageWithText();
      if(!message) {
        return;
      }

      fullMids = [makeFullMid(message.peerId, message.mid)];
    } else {
      const v = [...this.chat.selection.selectedMids.entries()];
      const f = v.map(([peerId, mids]) => [...mids].map((mid) => makeFullMid(peerId, mid)));
      fullMids = flatten(f);
    }

    let rawMessages: (Message.message | SponsoredMessage.sponsoredMessage)[];
    if(this.isSponsored) {
      rawMessages = [this.sponsoredMessage];
    } else {
      rawMessages = fullMids.map((fullMid) => this.chat.getMessage(fullMid) as Message.message);
    }

    const messages = rawMessages.filter((message) => message?.message) as Message.message[];
    const meta = messages.length > 1 ? await Promise.all(messages.map(async(message) => {
      const peerTitle = await getPeerTitle({
        peerId: message.fromId,
        plainText: true
      });

      const date = getFullDate(new Date(message.date * 1000), {
        noSeconds: true,
        monthAsNumber: true,
        timeJoiner: ' ',
        leadingZero: true
      });

      return peerTitle + ', [' + date + ']';
    })) : [];

    const htmlParts = messages.map((message) => {
      const wrapped = wrapRichText(message.message, {
        entities: (message as Message.message).totalEntities || message.entities,
        wrappingDraft: true
      });
      return documentFragmentToHTML(wrapped);
    });

    const parts: string[] = messages.map((message) => {
      return message.message;
    });

    const prepare = (smth: string[]) => {
      return smth.map((str, idx) => {
        return meta[idx] ? meta[idx] + '\n' + str : str;
      }).join('\n\n');
    };

    return {
      text: prepare(parts),
      html: prepare(htmlParts)
    };
  }

  private onSendScheduledClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionSendNowBtn);
    } else {
      PopupElement.createPopup(PopupSendNow, this.peerId, await this.chat.getMidsByMid(this.messagePeerId, this.mid));
    }
  };

  private onReplyClick = async() => {
    const {peerId, message} = this;
    const replyTo = this.chat.input.getChatInputReplyToFromMessage(message);

    if(!await this.chat.canSend()) {
      replyTo.replyToPeerId = peerId;
      this.chat.input.createReplyPicker(replyTo);
      return;
    }

    this.chat.input.initMessageReply(replyTo);
  };

  private onFaveStickerClick = (unfave?: boolean) => {
    const document = ((this.message as Message.message).media as MessageMedia.messageMediaDocument).document as MyDocument;
    const docId = document.id;
    if(document.type === 'gif') {
      this.managers.appGifsManager.saveGif(docId, unfave);
    } else {
      this.managers.appStickersManager.faveSticker(docId, unfave);
    }
  };

  private onEditClick = () => {
    const message = this.getMessageWithText();
    if(message._ === 'message' && message.media?._ === 'messageMediaToDo') {
      PopupElement.createPopup(PopupChecklist, {
        chat: this.chat,
        editMessage: message as any
      }).show();
      return;
    }

    if(message?._ === 'message' && message.suggested_post) {
      this.chat.input.initSuggestPostChange(message.mid);
      return;
    }

    this.chat.input.initMessageEditing(this.isTargetAGroupedItem ? this.mid : message.mid);
  };

  private onEditFactCheckClick = async() => {
    const {mainMessage: message} = this;
    const factCheck = (message as Message.message).factcheck;
    const buttonTextElement = new I18n.IntlElement({key: 'Done'});
    const buttonOptions: PopupConfirmationOptions['button'] = {
      text: buttonTextElement.element
    };

    const inputField = new InputField({
      placeholder: 'FactCheckPlaceholder',
      withLinebreaks: true,
      onRawInput: factCheck ? (value) => {
        buttonTextElement.compareAndUpdate({key: value ? 'Done' : 'Remove'});
        if(!buttonOptions.element) {
          return;
        }

        buttonOptions.element.classList.toggle('primary', !!value);
        buttonOptions.element.classList.toggle('danger', !value);
      } : undefined,
      canHaveFormatting: ['bold', 'italic', 'link']
    });

    if(factCheck) {
      inputField.setValueSilently(wrapDraftText(factCheck.text.text, {entities: factCheck.text.entities}));
    }

    try {
      await confirmationPopup({
        titleLangKey: 'FactCheckDialog',
        inputField,
        button: buttonOptions,
        confirmShortcutIsSendShortcut: true
      });
    } catch(err) {
      return;
    }

    const {value: text, entities} = getRichValueWithCaret(inputField.input, true, false);
    const newTextWithEntities: TextWithEntities = text ? {_: 'textWithEntities', text, entities} : undefined;
    if(factCheck && deepEqual(factCheck.text, newTextWithEntities)) {
      return;
    }

    this.managers.appMessagesManager.updateFactCheck(
      message.peerId,
      message.mid,
      newTextWithEntities
    ).then(() => {
      toastNew({
        langPackKey: text ? 'FactCheckEdited' : 'FactCheckDeleted'
      });
    });
  };

  private onCopyClick = async() => {
    if(isSelectionEmpty()) {
      const {text, html} = this.selectedMessagesText;
      copyTextToClipboard(text, html);
    } else {
      document.execCommand('copy');
      // cancelSelection();
    }
  };

  private onCopyAnchorLinkClick = () => {
    let href = (this.target as HTMLAnchorElement).href;
    href = href.replace(/^mailto:/, '');
    copyTextToClipboard(href);
  };

  private onCopyLinkClick = () => {
    const {url, isPrivate} = this.linkToMessage;
    const key: LangPackKey = isPrivate ? 'LinkCopiedPrivateInfo' : 'LinkCopied';
    toast(I18n.format(key, true));
    copyTextToClipboard(url);
  };

  private onPinClick = () => {
    PopupElement.createPopup(PopupPinMessage, this.messagePeerId, this.mid);
  };

  private onUnpinClick = () => {
    PopupElement.createPopup(PopupPinMessage, this.messagePeerId, this.mid, true);
  };

  private onRetractVote = () => {
    this.managers.appPollsManager.sendVote(this.message as Message.message, []);
  };

  private onStopPoll = () => {
    this.managers.appPollsManager.stopPoll(this.message as Message.message);
  };

  private onAddTaskClick = async() => {
    if(!rootScope.premium) {
      PopupPremium.show();
      return;
    }

    PopupElement.createPopup(PopupChecklist, {
      chat: this.chat,
      editMessage: this.message as any,
      appending: true
    }).show();
  };

  private onForwardClick = async() => {
    if(this.chat.selection.isSelecting) {
      simulateClickEvent(this.chat.selection.selectionForwardBtn);
    } else {
      const peerId = this.messagePeerId;
      const mids = this.isTargetAGroupedItem ? [this.mid] : await this.chat.getMidsByMid(peerId, this.mid);
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

    const {message} = this;
    const {peerId, mid} = message;
    // if(TEST_BUBBLES_DELETION) {
    //   return this.chat.bubbles.deleteMessagesByIds(await this.chat.getMidsByMid(mid), true);
    // }

    PopupElement.createPopup(
      PopupDeleteMessages,
      peerId,
      this.isTargetAGroupedItem ? [mid] : await this.chat.getMidsByMid(peerId, mid),
      this.chat.type
    );
  };

  private getQuotedText() {
    return getRichSelection(this.target);
  }

  private onQuoteClick = async() => {
    const messageWithText = this.getMessageWithText();
    const {peerId} = messageWithText;
    let {text: value, entities = [], offset: startIndex} = this.getQuotedText();

    const appConfig = await this.managers.apiManager.getAppConfig();
    let maxLength = appConfig.quote_length_max ?? 1024;
    const whitespaceLength = value.length - value.trimEnd().length;
    if(whitespaceLength) { // * fix whitespace
      maxLength = Math.min(value.length - whitespaceLength, maxLength);
    }
    if(value.length > maxLength) { // * fix overflow
      value = value.slice(0, maxLength);
      entities = entities // * fix length for entities
      .filter((entity) => entity.offset < maxLength)
      .map((entity) => {
        if((entity.offset + entity.length) > maxLength) {
          entity.length = maxLength - entity.offset;
        }

        return entity;
      });
    }

    const quote: ChatInputReplyTo['replyToQuote'] = {
      text: value,
      entities: entities.length ? entities : undefined,
      offset: startIndex
    };

    const replyTo = this.chat.input.getChatInputReplyToFromMessage(messageWithText, quote);

    if(!await this.chat.canSend()) {
      replyTo.replyToPeerId = peerId;
      this.chat.input.createReplyPicker(replyTo);
      return;
    }

    this.chat.input.initMessageReply(replyTo);
  };

  private onStatisticsClick = () => {
    this.chat.topbar.appSidebarRight.createTab(AppStatisticsTab).open(this.messagePeerId.toChatId(), this.mid);
    this.chat.topbar.appSidebarRight.toggleSidebar(true);
  };

  private async handleRepay() {
    if(!('repayRequest' in this.message) || !this.message.repayRequest) return;

    const preparedPaymentResult = await this.chat.input.paidMessageInterceptor.prepareStarsForPayment(
      this.message.repayRequest.messageCount
    );

    if(preparedPaymentResult === PAYMENT_REJECTED) return;

    this.managers.appMessagesManager.confirmRepayRequest(this.message.repayRequest.id, preparedPaymentResult);
  }

  public static onDownloadClick(messages: MyMessage | MyMessage[], noForwards?: boolean, container?: HTMLElement): DownloadBlob | DownloadBlob[] {
    if(Array.isArray(messages)) {
      return messages.map((message) => {
        return this.onDownloadClick(message, noForwards, container) as any;
      });
    }

    if(!this.canDownload(messages, undefined, noForwards, container)) {
      return;
    }

    return appDownloadManager.downloadToDisc({media: getMediaFromMessage(messages, true)});
  };

  public static getReactionsMenuPadding(position: 'vertical' | 'horizontal') {
    const size = 36;
    const margin = 8;
    const totalSize = size + margin;
    let paddingLeft = 56;
    const paddingRight = 40;
    if(IS_TOUCH_SUPPORTED) {
      paddingLeft += 32;
    }

    let menuPadding: MenuPositionPadding;
    if(position === 'vertical') {
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

    return menuPadding;
  }

  public static getReactionsOpenPosition(reactionsMenu: ChatReactionsMenu, hasMenu: boolean) {
    const rect = reactionsMenu.container.getBoundingClientRect();
    const newRect = cloneDOMRect(rect);
    newRect.left -= 21 / 2;
    newRect.top -= 121 / 2;
    if(!hasMenu) newRect.top += 37;
    return newRect;
  }

  public static appendReactionsMenu({element, reactionsMenu, reactionsMenuPosition}: {
    element: HTMLElement,
    reactionsMenu: ChatReactionsMenu,
    reactionsMenuPosition: 'horizontal' | 'vertical'
  }) {
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

    if(reactionsMenu) {
      const container = reactionsMenu.widthContainer;
      if(!IS_MOBILE) {
        const i = document.createElement('div');
        i.classList.add('btn-menu-items', 'btn-menu-transition');
        i.append(...Array.from(element.childNodes));
        element.classList.add('has-items-wrapper');
        element.append(container, i);
      } else {
        element.prepend(container);
      }

      container.style.setProperty('--height', container.offsetHeight + 'px');
    }

    return {
      onAfterInit: () => {
        if(isReactionsMenuVisible) {
          reactionsMenu.container.classList.add('is-visible');
        }
      },
      onClose: () => {
        if(reactionsMenu) {
          reactionsMenu.container.classList.remove('is-visible');
        }
      }
    };
  }
}
