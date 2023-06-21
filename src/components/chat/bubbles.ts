/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppImManager, ChatSavedPosition, ChatSetPeerOptions} from '../../lib/appManagers/appImManager';
import type {HistoryResult, MyMessage} from '../../lib/appManagers/appMessagesManager';
import type {MyDocument} from '../../lib/appManagers/appDocsManager';
import type {ChatRights} from '../../lib/appManagers/appChatsManager';
import type Chat from './chat';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import {logger} from '../../lib/logger';
import rootScope from '../../lib/rootScope';
import BubbleGroups from './bubbleGroups';
import PopupDatePicker from '../popups/datePicker';
import PopupForward from '../popups/forward';
import PopupStickers from '../popups/stickers';
import ProgressivePreloader from '../preloader';
import Scrollable, {SliceSides} from '../scrollable';
import StickyIntersector from '../stickyIntersector';
import animationIntersector from '../animationIntersector';
import mediaSizes from '../../helpers/mediaSizes';
import {IS_ANDROID, IS_APPLE, IS_MOBILE, IS_SAFARI} from '../../environment/userAgent';
import I18n, {FormatterArguments, i18n, langPack, LangPackKey, UNSUPPORTED_LANG_PACK_KEY, _i18n} from '../../lib/langPack';
import AvatarElement from '../avatar';
import ripple from '../ripple';
import {MessageRender} from './messageRender';
import LazyLoadQueue from '../lazyLoadQueue';
import ListenerSetter from '../../helpers/listenerSetter';
import PollElement from '../poll';
import AudioElement from '../audio';
import {ChannelParticipant, Chat as MTChat, ChatInvite, ChatParticipant, Document, GeoPoint, InputWebFileLocation, KeyboardButton, Message, MessageEntity,  MessageMedia,  MessageReplyHeader, Photo, PhotoSize, ReactionCount, ReplyMarkup, RequestPeerType, SponsoredMessage, Update, UrlAuthResult, User, WebPage, InlineQueryPeerType} from '../../layer';
import {BOT_START_PARAM, NULL_PEER_ID, REPLIES_PEER_ID, SEND_WHEN_ONLINE_TIMESTAMP} from '../../lib/mtproto/mtproto_config';
import {FocusDirection, ScrollStartCallbackDimensions} from '../../helpers/fastSmoothScroll';
import useHeavyAnimationCheck, {getHeavyAnimationPromise, dispatchHeavyAnimationEvent, interruptHeavyAnimation} from '../../hooks/useHeavyAnimationCheck';
import {fastRaf, fastRafPromise} from '../../helpers/schedulers';
import deferredPromise from '../../helpers/cancellablePromise';
import RepliesElement from './replies';
import DEBUG from '../../config/debug';
import {SliceEnd} from '../../helpers/slicedArray';
import PeerTitle from '../peerTitle';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpTag from '../../helpers/dom/findUpTag';
import {toast, toastNew} from '../toast';
import {getMiddleware, Middleware} from '../../helpers/middleware';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import htmlToDocumentFragment from '../../helpers/dom/htmlToDocumentFragment';
import reflowScrollableElement from '../../helpers/dom/reflowScrollableElement';
import replaceContent from '../../helpers/dom/replaceContent';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import whichChild from '../../helpers/dom/whichChild';
import {cancelAnimationByKey} from '../../helpers/animation';
import assumeType from '../../helpers/assumeType';
import debounce, {DebounceReturnType} from '../../helpers/schedulers/debounce';
import windowSize from '../../helpers/windowSize';
import {formatPhoneNumber} from '../../helpers/formatPhoneNumber';
import AppMediaViewer from '../appMediaViewer';
import SetTransition from '../singleTransition';
import handleHorizontalSwipe from '../../helpers/dom/handleHorizontalSwipe';
import findUpAttribute from '../../helpers/dom/findUpAttribute';
import findUpAsChild from '../../helpers/dom/findUpAsChild';
import {wrapCallDuration} from '../wrappers/wrapDuration';
import IS_CALL_SUPPORTED from '../../environment/callSupport';
import Button from '../button';
import {CallType} from '../../lib/calls/types';
import getVisibleRect from '../../helpers/dom/getVisibleRect';
import PopupJoinChatInvite from '../popups/joinChatInvite';
import {InternalLink, INTERNAL_LINK_TYPE} from '../../lib/appManagers/internalLink';
import ReactionsElement, {REACTIONS_ELEMENTS} from './reactions';
import type ReactionElement from './reaction';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import pause from '../../helpers/schedulers/pause';
import ScrollSaver from '../../helpers/scrollSaver';
import getObjectKeysAndSort from '../../helpers/object/getObjectKeysAndSort';
import forEachReverse from '../../helpers/array/forEachReverse';
import formatNumber from '../../helpers/number/formatNumber';
import getViewportSlice from '../../helpers/dom/getViewportSlice';
import SuperIntersectionObserver from '../../helpers/dom/superIntersectionObserver';
import generateFakeIcon from '../generateFakeIcon';
import copyFromElement from '../../helpers/dom/copyFromElement';
import PopupElement from '../popups';
import setAttachmentSize from '../../helpers/setAttachmentSize';
import wrapWebPageDescription from '../wrappers/webPageDescription';
import wrapWebPageTitle from '../wrappers/webPageTitle';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapMessageActionTextNew from '../wrappers/messageActionTextNew';
import isMentionUnread from '../../lib/appManagers/utils/messages/isMentionUnread';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import getPeerColorById from '../../lib/appManagers/utils/peers/getPeerColorById';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '../../lib/appManagers/managers';
import {Awaited, SendMessageEmojiInteractionData} from '../../types';
import idleController from '../../helpers/idleController';
import overlayCounter from '../../helpers/overlayCounter';
import {cancelContextMenuOpening} from '../../helpers/dom/attachContextMenuListener';
import contextMenuController from '../../helpers/contextMenuController';
import {AckedResult} from '../../lib/mtproto/superMessagePort';
import middlewarePromise from '../../helpers/middlewarePromise';
import {EmoticonsDropdown} from '../emoticonsDropdown';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import noop from '../../helpers/noop';
import getAlbumText from '../../lib/appManagers/utils/messages/getAlbumText';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import PopupPayment from '../popups/payment';
import isInDOM from '../../helpers/dom/isInDOM';
import getStickerEffectThumb from '../../lib/appManagers/utils/stickers/getStickerEffectThumb';
import attachStickerViewerListeners from '../stickerViewer';
import {makeMediaSize, MediaSize} from '../../helpers/mediaSize';
import wrapSticker, {onEmojiStickerClick} from '../wrappers/sticker';
import wrapAlbum from '../wrappers/album';
import wrapDocument from '../wrappers/document';
import wrapGroupedDocuments from '../wrappers/groupedDocuments';
import wrapPhoto from '../wrappers/photo';
import wrapPoll from '../wrappers/poll';
import wrapVideo from '../wrappers/video';
import isRTL from '../../helpers/string/isRTL';
import NBSP from '../../helpers/string/nbsp';
import DotRenderer from '../dotRenderer';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import {BatchProcessor} from '../../helpers/sortedList';
import wrapUrl from '../../lib/richTextProcessor/wrapUrl';
import getMessageThreadId from '../../lib/appManagers/utils/messages/getMessageThreadId';
import wrapTopicNameButton from '../wrappers/topicNameButton';
import wrapMediaSpoiler, {onMediaSpoilerClick, toggleMediaSpoiler} from '../wrappers/mediaSpoiler';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {copyTextToClipboard} from '../../helpers/clipboard';
import liteMode from '../../helpers/liteMode';
import getMediaDurationFromMessage from '../../lib/appManagers/utils/messages/getMediaDurationFromMessage';
import wrapLocalSticker from '../wrappers/localSticker';
import {LottieAssetName} from '../../lib/rlottie/lottieLoader';
import clamp from '../../helpers/number/clamp';
import getParticipantRank from '../../lib/appManagers/utils/chats/getParticipantRank';
import wrapParticipantRank from '../wrappers/participantRank';
import internalLinkProcessor from '../../lib/appManagers/internalLinkProcessor';
import confirmationPopup from '../confirmationPopup';
import wrapPeerTitle from '../wrappers/peerTitle';
import PopupPickUser from '../popups/pickUser';
import AppSelectPeers, {SelectSearchPeerType} from '../appSelectPeers';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import hasRights from '../../lib/appManagers/utils/chats/hasRights';
import tsNow from '../../helpers/tsNow';
import eachMinute from '../../helpers/eachMinute';
import deepEqual from '../../helpers/object/deepEqual';
import SwipeHandler from '../swipeHandler';
import getSelectedText from '../../helpers/dom/getSelectedText';
import cancelSelection from '../../helpers/dom/cancelSelection';

export const USER_REACTIONS_INLINE = false;
const USE_MEDIA_TAILS = false;
type MESSAGE_ACTION_TYPE = Message.messageService['action']['_'];
type IGNORE_ACTION_KEY = MESSAGE_ACTION_TYPE;
type IGNORE_ACTION_VALUE = true | ((message: Message.messageService) => boolean);
const IGNORE_ACTIONS_ARRAY: [IGNORE_ACTION_KEY, IGNORE_ACTION_VALUE][] = [
  ['messageActionHistoryClear', true],
  ['messageActionChatCreate', (message) => message.pFlags.out],
  ['messageActionChannelMigrateFrom', true],
  ['messageActionChatMigrateTo', true]
];
const IGNORE_ACTIONS = new Map(IGNORE_ACTIONS_ARRAY);

export const SERVICE_AS_REGULAR: Set<MESSAGE_ACTION_TYPE> = new Set();

if(IS_CALL_SUPPORTED) {
  SERVICE_AS_REGULAR.add('messageActionPhoneCall');
}

const TEST_SCROLL_TIMES: number = undefined;
let TEST_SCROLL = TEST_SCROLL_TIMES;

let queueId = 0;

type GenerateLocalMessageType<IsService> = IsService extends true ? Message.messageService : Message.message;

const SPONSORED_MESSAGE_ID_OFFSET = 1;
export const STICKY_OFFSET = 3;
const SCROLLED_DOWN_THRESHOLD = 300;
const PEER_CHANGED_ERROR = new Error('peer changed');

const DO_NOT_SLICE_VIEWPORT = false;
const DO_NOT_SLICE_VIEWPORT_ON_RENDER = false;
const DO_NOT_SLICE_VIEWPORT_ON_SCROLL = IS_SAFARI;
const DO_NOT_UPDATE_MESSAGE_VIEWS = false;
const DO_NOT_UPDATE_MESSAGE_REACTIONS = false;
const DO_NOT_UPDATE_MESSAGE_REPLY = false;
const GLOBAL_MIDS = true;

const BIG_EMOJI_SIZES: {[size: number]: number} = {
  1: 96,
  2: 90,
  3: 84,
  4: 72,
  5: 60,
  6: 48,
  7: 36
};
const BIG_EMOJI_SIZES_LENGTH = Object.keys(BIG_EMOJI_SIZES).length;

type Bubble = {
  bubble: HTMLElement,
  mids: Set<number>,
  groupedId?: string
};

type MyHistoryResult = HistoryResult | {history: number[]};

function getMainMidForGrouped(mids: number[]) {
  return Math.max(...mids);
}

export default class ChatBubbles {
  public container: HTMLDivElement;
  public chatInner: HTMLDivElement;
  public scrollable: Scrollable;

  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;

  // public messagesCount: number = -1;

  private unreadOut = new Set<number>();
  public needUpdate: {replyToPeerId: PeerId, replyMid: number, mid: number}[] = []; // if need wrapSingleMessage

  public bubbles: {[mid: string]: HTMLElement} = {};
  public skippedMids: Set<number> = new Set();
  public bubblesNewByGroupedId: {[groupId: string]: Bubble} = {};
  public bubblesNew: {[mid: string]: Bubble} = {};
  private dateMessages: {[timestamp: number]: {
    div: HTMLElement,
    firstTimestamp: number,
    container: HTMLElement,
    timeout?: number
  }} = {};

  private scrolledDown = true;
  private isScrollingTimeout = 0;

  private stickyIntersector: StickyIntersector;

  private unreaded: Map<HTMLElement, number> = new Map();
  private unreadedSeen: Set<number> = new Set();
  private readPromise: Promise<void>;

  private bubbleGroups: BubbleGroups;

  private preloader: ProgressivePreloader = null;

  // private messagesQueueOnRender: () => void = null;
  private messagesQueueOnRenderAdditional: () => void = null;

  private firstUnreadBubble: HTMLElement = null;
  private attachedUnreadBubble: boolean;

  public lazyLoadQueue: LazyLoadQueue;

  private middlewareHelper = getMiddleware();

  private log: ReturnType<typeof logger>;

  public listenerSetter: ListenerSetter;

  private followStack: number[] = [];

  private isHeavyAnimationInProgress = false;
  private scrollingToBubble: HTMLElement;

  private isFirstLoad = true;
  private needReflowScroll: boolean;

  private fetchNewPromise: Promise<void>;

  private passEntities: Partial<{
    [_ in MessageEntity['_']]: boolean
  }> = {};

  private onAnimateLadder: () => Promise<any> | void;
  // private ladderDeferred: CancellablePromise<void>;
  private resolveLadderAnimation: () => Promise<any>;
  private emptyPlaceholderBubble: HTMLElement;

  private viewsMids: Set<number> = new Set();
  private sendViewCountersDebounced: () => Promise<void>;

  private isTopPaddingSet = false;

  private getSponsoredMessagePromise: Promise<void>;

  private previousStickyDate: HTMLElement;
  private sponsoredMessage: SponsoredMessage.sponsoredMessage;

  private hoverBubble: HTMLElement;
  private hoverReaction: HTMLElement;
  private sliceViewportDebounced: DebounceReturnType<ChatBubbles['sliceViewport']>;
  private resizeObserver: ResizeObserver;
  private willScrollOnLoad: boolean;
  public observer: SuperIntersectionObserver;

  private renderingMessages: Set<number> = new Set();
  private setPeerCached: boolean;
  private attachPlaceholderOnRender: () => void;

  private bubblesToEject: Set<HTMLElement> = new Set();
  private bubblesToReplace: Map<HTMLElement, HTMLElement> = new Map(); // TO -> FROM
  private updatePlaceholderPosition: () => void;
  private setPeerOptions: {lastMsgId: number; topMessage: number; savedPosition: ChatSavedPosition};

  private setPeerTempId: number = 0;

  private renderNewPromises: Set<Promise<any>> = new Set();
  private updateGradient: boolean;

  private extendedMediaMessages: Set<number> = new Set();
  private pollExtendedMediaMessagesPromise: Promise<void>;

  private batchProcessor: BatchProcessor<Awaited<ReturnType<ChatBubbles['safeRenderMessage']>>>;

  private ranks: Map<PeerId, ReturnType<typeof getParticipantRank>>;
  private processRanks: Set<() => void>;
  private canShowRanks: boolean;
  // private reactions: Map<number, ReactionsElement>;

  private updateLocationOnEdit: Map<HTMLElement, (message: Message.message) => void> = new Map();
  public replySwipeHandler: SwipeHandler;

  constructor(
    private chat: Chat,
    private managers: AppManagers
  ) {
    this.log = this.chat.log;
    // this.chat.log.error('Bubbles construction');

    this.listenerSetter = new ListenerSetter();

    this.constructBubbles();

    // * constructor end

    this.batchProcessor = new BatchProcessor({
      log: this.log,
      process: this.processBatch,
      possibleError: PEER_CHANGED_ERROR
    });
    this.bubbleGroups = new BubbleGroups(this.chat);
    this.preloader = new ProgressivePreloader({
      cancelable: false
    });
    this.lazyLoadQueue = new LazyLoadQueue(undefined, true);
    this.lazyLoadQueue.queueId = ++queueId;

    // this.reactions = new Map();

    // * events

    // will call when sent for update pos
    this.listenerSetter.add(rootScope)('history_update', async({storageKey, sequential, message}) => {
      if(this.chat.messagesStorageKey !== storageKey || this.chat.type === 'scheduled') {
        return;
      }

      const {mid} = message;
      const log = false ? this.log.bindPrefix('history_update-' + mid) : undefined;
      log && log('start');

      const bubble = this.bubbles[mid];
      if(!bubble) return;

      if(this.renderNewPromises.size) {
        log && log.error('will await new messages render');
        await Promise.all(Array.from(this.renderNewPromises));
      }

      if(this.messagesQueuePromise) {
        log && log.error('messages render in process');
        await this.messagesQueuePromise;
      }

      if(this.bubbles[mid] !== bubble) return;

      // await getHeavyAnimationPromise();

      const item = this.bubbleGroups.getItemByBubble(bubble);
      if(!item) { // probably a group item
        log && log.error('no item by bubble', bubble);
        return;
      } else if(item.mid === mid) {
        log && log.warn('wow what', item, mid);
        return;
      }

      if(sequential) {
        const group = item.group;
        const newItem = this.bubbleGroups.createItem(bubble, message);
        // newItem.mid = item.mid;
        const _items = this.bubbleGroups.itemsArr.slice();
        indexOfAndSplice(_items, item);
        const foundItem = this.bubbleGroups.findGroupSiblingByItem(newItem, _items);
        if(
          group === foundItem?.group ||
          (group === this.bubbleGroups.lastGroup && group.items.length === 1 && newItem.dateTimestamp === item.dateTimestamp) ||
          (this.peerId === rootScope.myId && sequential && newItem.dateTimestamp === item.dateTimestamp)
        ) {
          log && log('item has correct position', item);
          this.bubbleGroups.changeBubbleMid(bubble, mid);
          return;
        }
      }

      // return;

      // await fastRafPromise();
      // if(this.bubbles[mid] !== bubble) return;

      // const groupIndex = this.bubbleGroups.groups.indexOf(group);
      this.bubbleGroups.removeAndUnmountBubble(bubble);
      // if(!group.items.length) { // group has collapsed, next message can have higher mid so have to reposition them too
      //   log && log('group has collapsed', item);

      //   const siblingGroups = this.bubbleGroups.groups.slice(0, groupIndex + 1);
      //   for(let length = siblingGroups.length, i = length - 2; i >= 0; --i) {
      //     const siblingGroup = siblingGroups[i];
      //     const siblingItems = siblingGroup.items;
      //     const nextGroup = siblingGroups[i + 1];
      //     const nextItems = nextGroup.items;

      //     let _break = false, moved = false;
      //     for(let j = siblingItems.length - 1; j >= 0; --j) {
      //       const siblingItem = siblingItems[j];
      //       const foundItem = this.bubbleGroups.findGroupSiblingByItem(siblingItem, nextItems);
      //       if(!foundItem) {
      //         _break = true;
      //         break;
      //       }

      //       log('will move item', siblingItem, nextGroup);
      //       this.bubbleGroups.removeAndUnmountBubble(siblingItem.bubble);
      //       this.bubbleGroups.addItemToGroup(siblingItem, nextGroup);
      //       moved = true;
      //     }

      //     if(moved) {
      //       nextGroup.mount();
      //     }

      //     if(_break) {
      //       break;
      //     }
      //   }
      // }

      const {groups} = this.groupBubbles([{bubble, message}]);
      this.bubbleGroups.mountUnmountGroups(groups);

      if(this.scrollingToBubble) {
        this.scrollToEnd();
      }

      log && log('end');

      // this.bubbleGroups.findIncorrentPositions();
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({peerId}) => {
      if(this.peerId === peerId) {
        this.deleteMessagesByIds(Object.keys(this.bubbles).map((m) => +m));
      }
    });

    // Calls when message successfully sent and we have an id
    this.listenerSetter.add(rootScope)('message_sent', async(e) => {
      const {storageKey, tempId, tempMessage, mid, message} = e;

      // ! can't use peerId to validate here, because id can be the same in 'scheduled' and 'chat' types
      if(this.chat.messagesStorageKey !== storageKey) {
        return;
      }

      const bubbles = this.bubbles;
      const _bubble = bubbles[tempId];
      if(_bubble) {
        const bubble = bubbles[tempId];
        bubbles[mid] = bubble;
        bubble.dataset.mid = '' + mid;
        delete bubbles[tempId];

        fastRaf(() => {
          const mid = +bubble.dataset.mid;
          if(bubbles[mid] === bubble && bubble.classList.contains('is-outgoing')) {
            bubble.classList.remove('is-sending', 'is-outgoing');
            bubble.classList.add((this.peerId === rootScope.myId && this.chat.type !== 'scheduled') || !this.unreadOut.has(mid) ? 'is-read' : 'is-sent');
          }
        });
      }

      if(this.unreadOut.has(tempId)) {
        this.unreadOut.delete(tempId);
        this.unreadOut.add(mid);
      }

      // * check timing of scheduled message
      if(this.chat.type === 'scheduled') {
        const timestamp = Date.now() / 1000 | 0;
        const maxTimestamp = tempMessage.date - 10;
        if(timestamp >= maxTimestamp) {
          this.deleteMessagesByIds([mid]);
        }
      }

      if(!_bubble) {
        return;
      }

      let messages: (Message.message | Message.messageService)[], tempIds: number[];
      const groupedId = (message as Message.message).grouped_id;
      if(groupedId) {
        messages = await this.managers.appMessagesManager.getMessagesByAlbum(groupedId);
        const mids = messages.map(({mid}) => mid);
        if(!mids.length || getMainMidForGrouped(mids) !== mid || bubbles[mid] !== _bubble) {
          return;
        }

        if(bubbles[mid] !== _bubble) {
          return;
        }

        tempIds = (Array.from(_bubble.querySelectorAll('.grouped-item')) as HTMLElement[]).map((el) => +el.dataset.mid);
      } else {
        messages = [message];
        tempIds = [tempId];
      }

      const reactionsElements = Array.from(_bubble.querySelectorAll('reactions-element')) as ReactionsElement[];
      if(reactionsElements.length) {
        reactionsElements.forEach((reactionsElement) => {
          reactionsElement.changeMessage(message as Message.message);
        });
      }

      (messages as Message.message[]).forEach((message, idx) => {
        if(!message) {
          return;
        }

        const tempId = tempIds[idx];
        const mid = message.mid;
        const bubble: HTMLElement = _bubble.querySelector(`.document-container[data-mid="${mid}"]`) || _bubble;

        if(message._ !== 'message') {
          return;
        }

        if(message.replies) {
          const repliesElement = _bubble.querySelector('replies-element') as RepliesElement;
          if(repliesElement) {
            repliesElement.message = message;
            repliesElement.init();
          }
        }

        const media = message.media ?? {} as MessageMedia.messageMediaEmpty;
        const doc = (media as MessageMedia.messageMediaDocument).document as Document.document;
        const poll = (media as MessageMedia.messageMediaPoll).poll;
        const webPage = (media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage;
        if(doc) {
          const documentContainer = bubble.querySelector<HTMLElement>(`.document-container[data-mid="${tempId}"]`);
          const div = documentContainer?.querySelector(`.document`);
          if(div && !tempMessage.media?.document?.thumbs?.length && doc.thumbs?.length) {
            getHeavyAnimationPromise().then(async() => {
              const timeSpan = div.querySelector('.time');
              const newDiv = await wrapDocument({message, fontSize: rootScope.settings.messagesTextSize});
              div.replaceWith(newDiv);

              if(timeSpan) {
                (newDiv.querySelector('.document') || newDiv).append(timeSpan);
              }
            });
          }

          if(documentContainer) {
            documentContainer.dataset.mid = '' + mid;
          }

          const element = bubble.querySelector(`audio-element[data-mid="${tempId}"], .document[data-doc-id="${tempId}"], .media-round[data-mid="${tempId}"]`) as HTMLElement;
          if(element) {
            if(element instanceof AudioElement || element.classList.contains('media-round')) {
              element.dataset.mid = '' + message.mid;
              delete element.dataset.isOutgoing;
              (element as AudioElement).message = message;
              (element as AudioElement).onLoad(true);
            } else {
              element.dataset.docId = '' + doc.id;
              (element as any).doc = doc;
            }
          }
        } else if(poll) {
          const pollElement = bubble.querySelector('poll-element') as PollElement;
          if(pollElement) {
            pollElement.message = message;
            pollElement.setAttribute('poll-id', '' + poll.id);
            pollElement.setAttribute('message-id', '' + mid);
          }
        } else if(webPage && !bubble.querySelector('.web')) {
          getHeavyAnimationPromise().then(() => {
            this.safeRenderMessage(message, true, bubble);
            this.scrollToBubbleIfLast(bubble);
          });
        }

        // set new mids to album items for mediaViewer
        if(groupedId) {
          const item = (bubble.querySelector(`.grouped-item[data-mid="${tempId}"]`) as HTMLElement) || bubble; // * it can be .document-container
          if(item) {
            item.dataset.mid = '' + mid;
          }
        }
      });
    });

    this.listenerSetter.add(rootScope)('message_edit', async({storageKey, message}) => {
      if(storageKey !== this.chat.messagesStorageKey) return;

      const bubble = this.bubbles[message.mid];
      if(!bubble) return;

      await getHeavyAnimationPromise();
      if(this.bubbles[message.mid] !== bubble) return;

      const updateLocalOnEdit = this.updateLocationOnEdit.get(bubble);
      if(updateLocalOnEdit) {
        updateLocalOnEdit(message as Message.message);
        return;
      }

      // do not edit geo messages
      if(bubble.querySelector('.geo-container')) {
        return;
      }

      this.safeRenderMessage(message, true, bubble);
    });

    this.listenerSetter.add(rootScope)('message_error', async({storageKey, tempId}) => {
      if(storageKey !== this.chat.messagesStorageKey) return;

      const bubble = this.bubbles[tempId];
      if(!bubble) return;

      await getHeavyAnimationPromise();
      if(this.bubbles[tempId] !== bubble) return;

      bubble.classList.remove('is-outgoing');
      bubble.classList.add('is-error');
    });

    this.listenerSetter.add(rootScope)('message_transcribed', ({peerId, mid, text, pending}) => {
      if(peerId !== this.peerId) return;

      const bubble = this.bubbles[mid];
      if(!bubble) return;

      // TODO: Move it to AudioElement method `finishVoiceTranscription`
      const audioElement = bubble.querySelector('audio-element') as AudioElement;
      if(!audioElement) {
        return;
      }

      // const scrollSaver = this.createScrollSaver(false);
      // scrollSaver.save();

      const speechTextDiv = bubble.querySelector('.document-wrapper, .quote-text.has-document') as HTMLElement;
      const speechRecognitionIcon = audioElement.querySelector('.audio-to-text-button span');
      const speechRecognitionLoader = audioElement.querySelector('.loader');
      if(speechTextDiv && speechRecognitionIcon) {
        let transcribedText = speechTextDiv.querySelector('.audio-transcribed-text');
        if(!transcribedText) {
          transcribedText = document.createElement('div');
          transcribedText.classList.add('audio-transcribed-text');
          transcribedText.append(document.createTextNode(''));

          if(speechTextDiv.classList.contains('document-wrapper')) {
            audioElement.before(transcribedText);
          } else {
            speechTextDiv.append(transcribedText);
          }

          if(pending) {
            const dots = document.createElement('span');
            dots.classList.add('audio-transcribing-dots');
            transcribedText.append(dots);
          }
        } else if(!pending) {
          const dots = transcribedText.querySelector('.audio-transcribing-dots');
          dots?.remove();
        }

        if(!text && !pending/*  && !transcribedText.classList.contains('has-some-text') */) {
          transcribedText.replaceChildren(i18n('Chat.Voice.Transribe.Error'));
          transcribedText.classList.add('is-error');
        } else if(text) {
          // transcribedText.classList.add('has-some-text');
          transcribedText.firstChild.textContent = text;
        }

        speechRecognitionIcon.classList.remove('tgico-transcribe');
        speechRecognitionIcon.classList.add('tgico-up');

        if(!pending && speechRecognitionLoader) {
          speechRecognitionLoader.classList.remove('active');
          setTimeout(() => {
            speechRecognitionLoader.remove();
          }, 300);
        }

        audioElement.transcriptionState = 2;
      }

      // scrollSaver.restore();
    });

    this.listenerSetter.add(rootScope)('album_edit', ({peerId, messages, deletedMids}) => {
      if(peerId !== this.peerId) return;

      const mids = messages.map(({mid}) => mid);
      const oldMids = mids.concat(Array.from(deletedMids));
      const wasMainMid = getMainMidForGrouped(oldMids);
      const bubble = this.bubbles[wasMainMid];
      if(!bubble) {
        return;
      }

      const mainMid = getMainMidForGrouped(mids);
      const message = messages.find((message) => message.mid === mainMid);
      this.safeRenderMessage(message, true, bubble);
    });

    // this.listenerSetter.add(rootScope)('peer_title_edit', async(peerId) => {
    //   if(peerId.isUser()) {
    //     const middleware = this.getMiddleware();
    //     const user = await this.managers.appUsersManager.getUser(peerId.toUserId());
    //     if(!middleware()) return;

    //     const isPremium = user?.pFlags?.premium;
    //     const groups = this.bubbleGroups.groups.filter((group) => group.avatar?.peerId === peerId);
    //     groups.forEach((group) => {
    //       group.avatar.classList.toggle('is-premium', isPremium);
    //       group.avatar.classList.toggle('tgico-star', isPremium);
    //     });
    //   }
    // });

    if(!DO_NOT_UPDATE_MESSAGE_REACTIONS/*  && false */) {
      this.listenerSetter.add(rootScope)('messages_reactions', async(arr) => {
        if(this.chat.type === 'scheduled') {
          return;
        }

        let scrollSaver: ScrollSaver;

        const a = arr.map(async({message, changedResults}) => {
          if(this.peerId !== message.peerId && !GLOBAL_MIDS) {
            return;
          }

          const result = await this.getMountedBubble(message.mid, message);
          if(!result) {
            return;
          }

          // can be .document-container
          return {bubble: findUpClassName(result.bubble, 'bubble'), message, changedResults};
        });

        let top: number;
        (await Promise.all(a)).filter(Boolean).forEach(({bubble, message, changedResults}) => {
          if(!scrollSaver) {
            scrollSaver = this.createScrollSaver(false);
            scrollSaver.save();
          }

          const key = message.peerId + '_' + message.mid;
          const set = REACTIONS_ELEMENTS.get(key);
          if(set) {
            for(const element of set) {
              element.update(message, changedResults);
            }
          } else if(!message.reactions || !message.reactions.results.length) {
            return;
          } else {
            this.appendReactionsElementToBubble(bubble, message, message, changedResults);
          }
        });

        if(scrollSaver) {
          scrollSaver.restore();
        }
      });
    }

    !DO_NOT_UPDATE_MESSAGE_REPLY && this.listenerSetter.add(rootScope)('messages_downloaded', async({peerId, mids}) => {
      const middleware = this.getMiddleware();
      await getHeavyAnimationPromise();
      if(!middleware()) return;

      (mids as number[]).forEach((mid) => {
        const needUpdate = this.needUpdate;
        const filtered: typeof needUpdate[0][] = [];
        forEachReverse(this.needUpdate, (obj, idx) => {
          if(obj.replyMid === mid && (obj.replyToPeerId === peerId || !peerId)) {
            this.needUpdate.splice(idx, 1)[0];
            filtered.push(obj);
          }
        });

        filtered.forEach(async({mid, replyMid, replyToPeerId}) => {
          const bubble = this.bubbles[mid];
          if(!bubble) return;

          const [message, originalMessage] = await Promise.all([
            (await this.chat.getMessage(mid)) as Message.message,
            (await this.managers.appMessagesManager.getMessageByPeer(replyToPeerId, replyMid)) as Message.message
          ]);
          if(!middleware()) return;

          MessageRender.setReply({
            chat: this.chat,
            bubble,
            message
          });

          let maxMediaTimestamp: number;
          const timestamps = bubble.querySelectorAll<HTMLAnchorElement>('.timestamp');
          if(originalMessage && (maxMediaTimestamp = getMediaDurationFromMessage(originalMessage))) {
            timestamps.forEach((timestamp) => {
              const value = +timestamp.dataset.timestamp;
              if(value < maxMediaTimestamp) {
                timestamp.classList.remove('is-disabled');
              } else {
                timestamp.removeAttribute('href');
              }
            });
          }
        });
      });
    });

    attachStickerViewerListeners({
      listenTo: this.scrollable.container,
      listenerSetter: this.listenerSetter,
      findTarget: (e) => {
        const target = e.target as HTMLElement;
        const found = target.closest('.attachment.media-sticker-wrapper') || (findUpClassName(target, 'attachment') && target.closest('.custom-emoji'));
        return found as HTMLElement;
      }
    });
    attachClickEvent(this.scrollable.container, this.onBubblesClick, {listenerSetter: this.listenerSetter});
    // this.listenerSetter.add(this.bubblesContainer)('click', this.onBubblesClick/* , {capture: true, passive: false} */);

    this.listenerSetter.add(this.scrollable.container)('mousedown', (e) => {
      if(e.button !== 0) return;

      const code: HTMLElement = findUpTag(e.target, 'CODE');
      if(code) {
        cancelEvent(e);
        copyFromElement(code);

        const onClick = (e: MouseEvent) => {
          cancelEvent(e);
          toastNew({
            langPackKey: 'TextCopied',
            onClose: () => {
              detach();
            }
          });
        };

        const detach = attachClickEvent(window, onClick, {listenerSetter: this.listenerSetter, once: true, capture: true});
        return;
      }
    });

    /* if(false)  */this.stickyIntersector = new StickyIntersector(this.scrollable.container, (stuck, target) => {
      for(const timestamp in this.dateMessages) {
        const dateMessage = this.dateMessages[timestamp];
        if(dateMessage.container === target) {
          const dateBubble = dateMessage.div;

          // dateMessage.container.classList.add('has-sticky-dates');

          // SetTransition(dateBubble, 'kek', stuck, this.previousStickyDate ? 300 : 0);
          // if(this.previousStickyDate) {
          // dateBubble.classList.add('kek');
          // }

          dateBubble.classList.toggle('is-sticky', stuck);
          if(stuck) {
            this.previousStickyDate = dateBubble;
          }

          break;
        }
      }

      if(this.previousStickyDate) {
        // fastRaf(() => {
        // this.bubblesContainer.classList.add('has-sticky-dates');
        // });
      }
    });

    if(!DO_NOT_SLICE_VIEWPORT_ON_SCROLL) {
      this.sliceViewportDebounced = debounce(this.sliceViewport.bind(this), 3000, false, true);
    }

    let middleware: ReturnType<ChatBubbles['getMiddleware']>;
    useHeavyAnimationCheck(() => {
      this.isHeavyAnimationInProgress = true;
      this.lazyLoadQueue.lock();
      middleware = this.getMiddleware();

      // if(this.sliceViewportDebounced) {
      //   this.sliceViewportDebounced.clearTimeout();
      // }
    }, () => {
      this.isHeavyAnimationInProgress = false;

      if(middleware?.()) {
        this.lazyLoadQueue.unlockAndRefresh();

        // if(this.sliceViewportDebounced) {
        //   this.sliceViewportDebounced();
        // }
      }

      middleware = null;
    }, this.listenerSetter);
  }

  private constructBubbles() {
    const container = this.container = document.createElement('div');
    container.classList.add('bubbles', 'scrolled-down');

    const chatInner = this.chatInner = document.createElement('div');
    chatInner.classList.add('bubbles-inner');

    this.setScroll();

    container.append(this.scrollable.container);
  }

  public attachContainerListeners() {
    const container = this.container;

    this.chat.contextMenu.attachTo(container);
    this.chat.selection.attachListeners(container, new ListenerSetter());

    if(DEBUG) {
      this.listenerSetter.add(container)('dblclick', async(e) => {
        const bubble = findUpClassName(e.target, 'grouped-item') || findUpClassName(e.target, 'bubble');
        if(bubble) {
          const mid = +bubble.dataset.mid
          this.log('debug message:', await this.chat.getMessage(mid));
          this.highlightBubble(bubble);
        }
      });
    }

    if(!IS_MOBILE) {
      this.listenerSetter.add(container)('dblclick', async(e) => {
        if(this.chat.type === 'pinned' ||
          this.chat.selection.isSelecting ||
          !this.chat.input.canSendPlain()) {
          return;
        }

        if(findUpClassName(e.target, 'attachment') ||
          findUpClassName(e.target, 'audio') ||
          findUpClassName(e.target, 'document') ||
          findUpClassName(e.target, 'contact')) {
          return;
        }

        const target = e.target as HTMLElement;
        let bubble = target.classList.contains('bubble') ?
          target :
          (target.classList.contains('document-selection') ? target.parentElement : null);

        const selectedText = getSelectedText();
        if(!bubble && (!selectedText.trim() || /^\s/.test(selectedText))) {
          bubble = findUpClassName(target, 'bubble');
          // cancelEvent(e);
          // cancelSelection();
        }

        if(bubble && !bubble.classList.contains('bubble-first')) {
          const mid = +bubble.dataset.mid;
          const message = await this.chat.getMessage(mid);
          if(message.pFlags.is_outgoing || message.peerId !== this.peerId) {
            return;
          }

          this.chat.input.initMessageReply(mid);
        }
      });
    } else if(IS_TOUCH_SUPPORTED) {
      const className = 'is-gesturing-reply';
      const MAX = 64;
      const replyAfter = MAX * .75;
      let shouldReply = false;
      let target: HTMLElement;
      let icon: HTMLElement;
      let swipeAvatar: HTMLElement;
      this.replySwipeHandler = handleHorizontalSwipe({
        element: container,
        verifyTouchTarget: async(e) => {
          if(this.chat.type === 'pinned' ||
            this.chat.selection.isSelecting ||
            !(await this.chat.canSend())) {
            return false;
          }

          // cancelEvent(e);
          target = findUpClassName(e.target, 'bubble');
          if(!target ||
            target.classList.contains('service') ||
            target.classList.contains('is-sending')) {
            return false;
          }

          if(target) {
            try {
              const avatar = target.parentElement.querySelector('.bubbles-group-avatar') as HTMLElement
              if(avatar) {
                const visibleRect = getVisibleRect(avatar, target);
                if(visibleRect) {
                  swipeAvatar = avatar;
                }
              }
            } catch(err) {}

            [target, swipeAvatar].filter(Boolean).forEach((element) => {
              SetTransition({
                element,
                className,
                forwards: true,
                duration: 250
              });
              void element.offsetLeft; // reflow
            });

            if(!icon) {
              icon = document.createElement('span');
              icon.classList.add('tgico-reply_filled', 'bubble-gesture-reply-icon');
            } else {
              icon.classList.remove('is-visible');
              icon.style.opacity = '';
            }

            target/* .querySelector('.bubble-content') */.append(icon);
          }

          return !!target;
        },
        onSwipe: (xDiff) => {
          shouldReply = xDiff >= replyAfter;

          if(shouldReply && !icon.classList.contains('is-visible')) {
            icon.classList.add('is-visible');
          }
          icon.style.opacity = '' + Math.min(1, xDiff / replyAfter);

          const x = -Math.max(0, Math.min(MAX, xDiff));
          const transform = `translateX(${x}px)`;
          target.style.transform = transform;
          if(swipeAvatar) {
            swipeAvatar.style.transform = transform;
          }
          cancelContextMenuOpening();
        },
        onReset: () => {
          const _target = target;
          const _swipeAvatar = swipeAvatar;
          target = swipeAvatar = undefined;

          const onTransitionEnd = () => {
            if(icon.parentElement === _target) {
              icon.classList.remove('is-visible');
              icon.remove();
            }
          };

          [_target, _swipeAvatar].filter(Boolean).forEach((element, idx) => {
            SetTransition({
              element,
              className,
              forwards: false,
              duration: 250,
              onTransitionEnd: idx === 0 ? onTransitionEnd : undefined
            });
          });

          fastRaf(() => {
            _target.style.transform = '';
            if(_swipeAvatar) {
              _swipeAvatar.style.transform = '';
            }

            if(shouldReply) {
              const {mid} = _target.dataset;
              this.chat.input.initMessageReply(+mid);
              shouldReply = false;
            }
          });
        },
        listenerOptions: {capture: true}
      });
    }
  }

  public constructPeerHelpers() {
    // will call when message is sent (only 1)
    this.listenerSetter.add(rootScope)('history_append', async({storageKey, message}) => {
      if(storageKey !== this.chat.messagesStorageKey || this.chat.type === 'scheduled') return;

      if(liteMode.isAvailable('chat_background')) {
        this.updateGradient = true;
      }

      if(!this.scrollable.loadedAll.bottom) {
        this.chat.setMessageId();
      } else {
        this.renderNewMessage(message, true);
      }
    });

    this.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      if(this.peerId !== message.peerId || this.chat.type === 'scheduled') return;
      this.renderNewMessage(message);
    });

    this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      if((peerId !== this.peerId && !GLOBAL_MIDS) || this.chat.type === 'scheduled') {
        return;
      }

      this.deleteMessagesByIds(Array.from(msgs));
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({peerId}) => {
      if(peerId === this.peerId) {
        this.chat.input.setUnreadCount();

        getHeavyAnimationPromise().then(() => {
          this.updateUnreadByDialog();
        });
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      if(!dialogs.has(this.peerId) || this.chat.type === 'scheduled') {
        return;
      }

      this.chat.input.setUnreadCount();
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(this.peerId !== dialog.peerId || this.chat.type === 'scheduled') {
        return;
      }

      this.chat.input.setUnreadCount();
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const {peerId} = this;
      if(peerId !== chatId.toPeerId(true)) {
        return;
      }

      const chat = await this.managers.appChatsManager.getChat(chatId);
      const hadRights = this.chatInner.classList.contains('has-rights');
      const hadPlainRights = this.chat.input.canSendPlain();
      const [hasRights, hasPlainRights, canEmbedLinks] = await Promise.all([
        this.chat.canSend('send_messages'),
        this.chat.canSend('send_plain'),
        this.chat.canSend('embed_links')
      ]);

      if(hadRights !== hasRights || hadPlainRights !== hasPlainRights) {
        const callbacks = await Promise.all([
          this.finishPeerChange(),
          this.chat.input.finishPeerChange({middleware: this.getMiddleware()})
        ]);

        callbacks.forEach((callback) => callback());
      }

      // reset webpage
      if((canEmbedLinks && !this.chat.input.willSendWebPage) || (!canEmbedLinks && this.chat.input.willSendWebPage)) {
        this.chat.input.lastUrl = '';
        this.chat.input.onMessageInput();
      }

      if(!!(chat as MTChat.channel).pFlags.forum !== this.chat.isForum && this.chat.type === 'chat') {
        this.chat.peerId = 0;
        this.chat.appImManager.setPeer({peerId});
      }
    });

    this.listenerSetter.add(rootScope)('history_reload', (peerId) => {
      if(peerId !== this.peerId) {
        return;
      }

      const mids = getObjectKeysAndSort(this.bubbles, 'desc').filter((mid) => mid > 0);
      const middleware = this.getMiddleware();
      this.managers.appMessagesManager.reloadMessages(this.peerId, mids).then((messages) => {
        if(!middleware()) return;

        const toDelete: number[] = [];
        messages.forEach((message, idx) => {
          const mid = mids[idx];
          if(message) {
            const bubble = this.bubbles[message.mid];
            if(!bubble) return;

            this.safeRenderMessage(message, true, bubble);
          } else {
            toDelete.push(mid);
          }
        });

        this.deleteMessagesByIds(toDelete);

        this.setLoaded('top', false);
        this.setLoaded('bottom', false);
        this.scrollable.checkForTriggers();
      });
    });

    this.listenerSetter.add(rootScope)('settings_updated', async({key}) => {
      if(key === 'settings.emoji.big') {
        const middleware = this.getMiddleware();
        const mids = getObjectKeysAndSort(this.bubbles, 'desc');
        const m = mids.map(async(mid) => {
          const bubble = this.bubbles[mid];
          if(bubble.classList.contains('can-have-big-emoji')) {
            return {bubble, message: await this.chat.getMessage(mid)};
          }
        });

        const awaited = await Promise.all(m);
        if(!middleware()) {
          return;
        }

        awaited.filter(Boolean).forEach(({bubble, message}) => {
          if(this.bubbles[message.mid] !== bubble) {
            return;
          }

          this.safeRenderMessage(message, true, bubble);
        });
      }
    });

    !DO_NOT_UPDATE_MESSAGE_VIEWS && this.listenerSetter.add(rootScope)('messages_views', (arr) => {
      if(this.chat.type === 'scheduled') return;

      fastRaf(() => {
        let scrollSaver: ScrollSaver;
        for(const {peerId, views, mid} of arr) {
          if(this.peerId !== peerId && !GLOBAL_MIDS) continue;

          const bubble = this.bubbles[mid];
          if(!bubble) continue;

          const postViewsElements = Array.from(bubble.querySelectorAll('.post-views')) as HTMLElement[];
          if(!postViewsElements.length) continue;

          const str = formatNumber(views, 1);
          let different = false;
          postViewsElements.forEach((postViews) => {
            if(different || postViews.textContent !== str) {
              if(!scrollSaver) {
                scrollSaver = this.createScrollSaver(true);
                scrollSaver.save();
              }

              different = true;
              postViews.textContent = str;
            }
          });
        }

        scrollSaver?.restore();
      });
    });

    this.observer = new SuperIntersectionObserver({root: this.scrollable.container});

    this.sendViewCountersDebounced = debounce(() => {
      const mids = [...this.viewsMids];
      this.viewsMids.clear();

      this.managers.appMessagesManager.incrementMessageViews(this.peerId, mids);
    }, 1000, false, true);

    // * pinned part start
    this.listenerSetter.add(rootScope)('peer_pinned_messages', ({peerId, mids, pinned}) => {
      if(this.chat.type !== 'pinned' || peerId !== this.peerId) {
        return;
      }

      if(mids) {
        if(!pinned) {
          this.deleteMessagesByIds(mids);
        }
      }
    });
    // * pinned part end

    // * scheduled part start
    const onUpdate = async() => {
      this.chat.topbar.setTitle((await this.managers.appMessagesManager.getScheduledMessagesStorage(this.peerId)).size);
    };

    this.listenerSetter.add(rootScope)('scheduled_new', (message) => {
      if(this.chat.type !== 'scheduled' || message.peerId !== this.peerId) return;

      this.renderNewMessage(message);
      onUpdate();
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId, mids}) => {
      if(this.chat.type !== 'scheduled' || peerId !== this.peerId) return;

      this.deleteMessagesByIds(mids);
      onUpdate();
    });
    // * scheduled part end
  }

  private get peerId() {
    return this.chat.peerId;
  }

  public get messagesQueuePromise() {
    return this.batchProcessor.queuePromise;
  }

  private createScrollSaver(reverse = true) {
    const scrollSaver = new ScrollSaver(this.scrollable, '.bubble:not(.is-date)', reverse);
    return scrollSaver;
  }

  private unreadedObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      const target = entry.target as HTMLElement;
      const mid = this.unreaded.get(target as HTMLElement);
      this.onUnreadedInViewport(target, mid);
    }
  };

  private viewsObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      const mid = +(entry.target as HTMLElement).dataset.mid;
      this.observer.unobserve(entry.target, this.viewsObserverCallback);

      if(mid) {
        this.viewsMids.add(mid);
        this.sendViewCountersDebounced();
      } else {
        const {sponsoredMessage} = this;
        const randomId = sponsoredMessage?.random_id;
        if(randomId) {
          this.managers.appChatsManager.viewSponsoredMessage(this.peerId.toChatId(), randomId);
          delete sponsoredMessage.random_id;
        }
      }
    }
  };

  private stickerEffectObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      this.observer.unobserve(entry.target, this.stickerEffectObserverCallback);

      const attachmentDiv: HTMLElement = entry.target.querySelector('.attachment');
      getHeavyAnimationPromise().then(() => {
        if(isInDOM(attachmentDiv)) {
          simulateClickEvent(attachmentDiv);
        }
      });
    }
  };

  private createResizeObserver() {
    if(!('ResizeObserver' in window) || this.resizeObserver) {
      return;
    }

    const container = this.scrollable.container;
    let wasHeight = 0/* container.offsetHeight */;
    let resizing = false;
    let skip = false;
    let scrolled = 0;
    let part = 0;
    let rAF = 0;
    // let skipNext = true;

    const onResizeEnd = () => {
      const height = container.offsetHeight;
      const isScrolledDown = this.scrollable.isScrolledDown;
      if(height !== wasHeight && (!skip || !isScrolledDown)) { // * fix opening keyboard while ESG is active, offsetHeight will change right between 'start' and this first frame
        part += wasHeight - height;
      }

      /* if(DEBUG) {
        this.log('resize end', scrolled, part, this.scrollable.scrollTop, height, wasHeight, this.scrollable.isScrolledDown);
      } */

      if(part) {
        this.scrollable.setScrollTopSilently(this.scrollable.scrollTop + Math.round(part));
      }

      wasHeight = height;
      scrolled = 0;
      rAF = 0;
      part = 0;
      resizing = false;
      skip = false;
    };

    const setEndRAF = (single: boolean) => {
      if(rAF) window.cancelAnimationFrame(rAF);
      rAF = window.requestAnimationFrame(single ? onResizeEnd : () => {
        rAF = window.requestAnimationFrame(onResizeEnd);
        // this.log('resize after RAF', part);
      });
    };

    const processEntries: ResizeObserverCallback = (entries) => {
      /* if(skipNext) {
        skipNext = false;
        return;
      } */

      if(skip) {
        setEndRAF(false);
        return;
      }

      const entry = entries[0];
      const height = entry.contentRect.height;/* Math.ceil(entry.contentRect.height); */

      if(!wasHeight) {
        wasHeight = height;
        return;
      }

      const realDiff = wasHeight - height;
      let diff = realDiff + part;
      const _part = diff % 1;
      diff -= _part;

      if(!resizing) {
        resizing = true;

        /* if(DEBUG) {
          this.log('resize start', realDiff, this.scrollable.scrollTop, this.scrollable.container.offsetHeight, this.scrollable.isScrolledDown);
        } */

        if(realDiff < 0 && this.scrollable.isScrolledDown) {
          // if(isSafari) { // * fix opening keyboard while ESG is active
          part = -realDiff;
          // }

          skip = true;
          setEndRAF(false);
          return;
        }
      }

      scrolled += diff;

      /* if(DEBUG) {
        this.log('resize', wasHeight - height, diff, this.scrollable.container.offsetHeight, this.scrollable.isScrolledDown, height, wasHeight);
      } */

      if(diff) {
        const needScrollTop = this.scrollable.scrollTop + diff;
        this.scrollable.setScrollTopSilently(needScrollTop);
      }

      setEndRAF(false);

      part = _part;
      wasHeight = height;
    };

    const resizeObserver = this.resizeObserver = new ResizeObserver(processEntries);
    resizeObserver.observe(container);
  }

  private destroyResizeObserver() {
    const resizeObserver = this.resizeObserver;
    if(!resizeObserver) {
      return;
    }

    resizeObserver.disconnect();
    this.resizeObserver = undefined;
  }

  private onBubblesMouseMove = async(e: MouseEvent) => {
    const content = findUpClassName(e.target, 'bubble-content');
    if(
      this.chat.type !== 'scheduled' &&
      content &&
      !this.chat.selection.isSelecting &&
      !findUpClassName(e.target, 'service') &&
      !findUpClassName(e.target, 'bubble-beside-button')
    ) {
      const bubble = findUpClassName(content, 'bubble');
      if(!this.chat.selection.canSelectBubble(bubble)) {
        this.unhoverPrevious();
        return;
      }

      let {hoverBubble, hoverReaction} = this;
      if(bubble === hoverBubble) {
        return;
      }

      this.unhoverPrevious();

      hoverBubble = this.hoverBubble = bubble;
      hoverReaction = this.hoverReaction;
      // hoverReaction = contentWrapper.querySelector('.bubble-hover-reaction');
      if(!hoverReaction) {
        hoverReaction = this.hoverReaction = document.createElement('div');
        hoverReaction.classList.add('bubble-hover-reaction');

        const stickerWrapper = document.createElement('div');
        stickerWrapper.classList.add('bubble-hover-reaction-sticker');
        hoverReaction.append(stickerWrapper);

        content.append(hoverReaction);

        let message = await this.chat.getMessage(+bubble.dataset.mid);
        if(message?._ !== 'message') {
          this.unhoverPrevious();
          return;
        }

        message = await this.managers.appMessagesManager.getGroupsFirstMessage(message);

        const middleware = this.getMiddleware(() => this.hoverReaction === hoverReaction);
        Promise.all([
          this.managers.appReactionsManager.getAvailableReactionsByMessage(message),
          pause(400)
        ]).then(([availableReactions]) => {
          const availableReaction = availableReactions[0];
          if(!availableReaction) {
            hoverReaction.remove();
            return;
          }

          wrapSticker({
            div: stickerWrapper,
            doc: availableReaction.select_animation,
            width: 18,
            height: 18,
            needUpscale: true,
            middleware,
            group: this.chat.animationGroup,
            withThumb: false,
            needFadeIn: false
          }).then(({render}) => render).then((player) => {
            assumeType<RLottiePlayer>(player);

            player.addEventListener('firstFrame', () => {
              if(!middleware()) {
                // debugger;
                return;
              }

              hoverReaction.dataset.loaded = '1';
              this.setHoverVisible(hoverReaction, true);
            }, {once: true});

            attachClickEvent(hoverReaction, (e) => {
              cancelEvent(e); // cancel triggering selection

              this.managers.appReactionsManager.sendReaction(message as Message.message, availableReaction);
              this.unhoverPrevious();
            }, {listenerSetter: this.listenerSetter});
          }, noop);
        });
      } else if(hoverReaction.dataset.loaded) {
        this.setHoverVisible(hoverReaction, true);
      }
    } else {
      this.unhoverPrevious();
    }
  };

  public setReactionsHoverListeners() {
    this.listenerSetter.add(contextMenuController)('toggle', this.unhoverPrevious);
    this.listenerSetter.add(overlayCounter)('change', this.unhoverPrevious);
    this.listenerSetter.add(this.chat.selection)('toggle', this.unhoverPrevious);
    this.listenerSetter.add(this.container)('mousemove', this.onBubblesMouseMove);
  }

  private setHoverVisible(hoverReaction: HTMLElement, visible: boolean) {
    if(hoverReaction.parentElement) {
      hoverReaction.parentElement.classList.toggle('hover-reaction-visible', visible);
    }

    SetTransition({
      element: hoverReaction,
      className: 'is-visible',
      forwards: visible,
      duration: 200,
      onTransitionEnd: visible ? undefined : () => {
        hoverReaction.remove();
      },
      useRafs: 2
    });
  }

  private unhoverPrevious = () => {
    const {hoverBubble, hoverReaction} = this;
    if(hoverBubble) {
      this.setHoverVisible(hoverReaction, false);
      this.hoverBubble = undefined;
      this.hoverReaction = undefined;
    }
  };

  public setStickyDateManually() {
    return;

    const timestamps = Object.keys(this.dateMessages).map((k) => +k).sort((a, b) => b - a);
    let lastVisible: HTMLElement;

    // if(this.chatInner.classList.contains('is-scrolling')) {
    const {scrollTop} = this.scrollable.container;
    const isOverflown = scrollTop > 0;
    if(isOverflown) {
      for(const timestamp of timestamps) {
        const dateMessage = this.dateMessages[timestamp];
        const visibleRect = getVisibleRect(dateMessage.container, this.scrollable.container);
        if(visibleRect && visibleRect.overflow.top) {
          lastVisible = dateMessage.div;
        } else if(lastVisible) {
          break;
        }
      }
    }
    // }

    if(lastVisible === this.previousStickyDate) {
      return;
    }

    if(lastVisible) {
      const needReflow = /* !!this.chat.setPeerPromise ||  */!this.previousStickyDate;
      if(needReflow) {
        lastVisible.classList.add('no-transition');
      }

      lastVisible.classList.add('is-sticky');

      if(needReflow) {
        void lastVisible.offsetLeft; // reflow
        lastVisible.classList.remove('no-transition');
      }
    }

    if(this.previousStickyDate && this.previousStickyDate !== lastVisible) {
      this.previousStickyDate.classList.remove('is-sticky');
    }

    this.previousStickyDate = lastVisible;
  }

  public getRenderedLength() {
    return Object.keys(this.bubbles).length - this.skippedMids.size;
  }

  private onUnreadedInViewport(target: HTMLElement, mid: number) {
    this.unreadedSeen.add(mid);
    this.observer.unobserve(target, this.unreadedObserverCallback);
    this.unreaded.delete(target);
    this.readUnreaded();
  }

  private readUnreaded() {
    if(this.readPromise) return;

    const middleware = this.getMiddleware();
    this.readPromise = idleController.getFocusPromise().then(async() => {
      if(!middleware()) return;
      let maxId = Math.max(...Array.from(this.unreadedSeen));

      // ? if message with maxId is not rendered ?
      if(this.scrollable.loadedAll.bottom) {
        const bubblesMaxId = Math.max(...Object.keys(this.bubbles).map((i) => +i));
        if(maxId >= bubblesMaxId) {
          maxId = Math.max((await this.chat.getHistoryMaxId()) || 0, maxId);
        }
      }

      this.unreaded.forEach((mid, target) => {
        if(mid <= maxId) {
          this.onUnreadedInViewport(target, mid);
        }
      });

      const readContents: number[] = [];
      for(const mid of this.unreadedSeen) {
        const message: MyMessage = await this.chat.getMessage(mid);
        if(isMentionUnread(message)) {
          readContents.push(mid);
        }
      }

      this.managers.appMessagesManager.readMessages(this.peerId, readContents);

      this.unreadedSeen.clear();

      if(DEBUG) {
        this.log('will readHistory by maxId:', maxId);
      }

      // return;

      return this.managers.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId).catch((err: any) => {
        this.log.error('readHistory err:', err);
        this.managers.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId);
      }).finally(() => {
        if(!middleware()) return;
        this.readPromise = undefined;

        if(this.unreadedSeen.size) {
          this.readUnreaded();
        }
      });
    });
  }

  public onBubblesClick = async(e: Event) => {
    let target = e.target as HTMLElement;
    let bubble: HTMLElement = null;
    try {
      bubble = findUpClassName(target, 'bubble');
    } catch(err) {}

    if(!bubble && !this.chat.selection.isSelecting) {
      const avatar = findUpClassName(target, 'user-avatar');
      if(!avatar) {
        return;
      }

      const peerId = avatar.dataset.peerId.toPeerId();
      if(peerId !== NULL_PEER_ID) {
        this.chat.appImManager.setInnerPeer({peerId});
      } else {
        toast(I18n.format('HidAccount', true));
      }
      return;
    }

    if(!bubble) {
      return;
    }

    if(bubble.classList.contains('is-date') && findUpClassName(target, 'bubble-content')) {
      if(bubble.classList.contains('is-fake')) {
        bubble = bubble.previousElementSibling as HTMLElement;
      }

      if(bubble.classList.contains('is-sticky') && !this.chatInner.classList.contains('is-scrolling')) {
        return;
      }

      for(const timestamp in this.dateMessages) {
        const d = this.dateMessages[timestamp];
        if(d.div === bubble) {
          PopupElement.createPopup(PopupDatePicker, new Date(+timestamp), this.onDatePick).show();
          break;
        }
      }

      return;
    }

    if(!IS_TOUCH_SUPPORTED && findUpClassName(target, 'time')) {
      this.chat.selection.toggleByElement(bubble);
      return;
    }

    // ! Trusted - due to audio autoclick
    if(this.chat.selection.isSelecting && e.isTrusted) {
      if(bubble.classList.contains('service') && bubble.dataset.mid === undefined) {
        return;
      }

      cancelEvent(e);
      // console.log('bubble click', e);

      if(IS_TOUCH_SUPPORTED && this.chat.selection.selectedText) {
        this.chat.selection.selectedText = undefined;
        return;
      }

      // this.chatSelection.toggleByBubble(bubble);
      this.chat.selection.toggleByElement(findUpClassName(target, 'grouped-item') || bubble);
      return;
    }

    const mediaSpoiler: HTMLElement = findUpClassName(target, 'media-spoiler-container');
    if(mediaSpoiler) {
      onMediaSpoilerClick({
        event: e,
        mediaSpoiler
      });
      return;
    }

    const contactDiv: HTMLElement = findUpClassName(target, 'contact');
    if(contactDiv) {
      const peerId = contactDiv.dataset.peerId.toPeerId();
      if(peerId) {
        this.chat.appImManager.setInnerPeer({
          peerId
        });
      } else {
        const phone = contactDiv.querySelector<HTMLElement>('.contact-number');
        copyTextToClipboard(phone.innerText.replace(/\s/g, ''));
        toastNew({langPackKey: 'PhoneCopied'});
        cancelEvent(e);
      }

      return;
    }

    const callDiv: HTMLElement = findUpClassName(target, 'bubble-call');
    if(callDiv) {
      this.chat.appImManager.callUser(this.peerId.toUserId(), callDiv.dataset.type as any);
      return;
    }

    const buyButton: HTMLElement = findUpClassName(target, 'is-buy');
    if(buyButton) {
      cancelEvent(e);

      const message = await this.chat.getMessage(+bubble.dataset.mid);
      if(!message) {
        return;
      }

      PopupElement.createPopup(
        PopupPayment,
        message as Message.message,
        await this.managers.appPaymentsManager.getInputInvoiceByPeerId(message.peerId, message.mid)
      );
      return;
    }

    const reactionElement = findUpTag(target, 'REACTION-ELEMENT') as ReactionElement;
    if(reactionElement) {
      cancelEvent(e);
      if(reactionElement.classList.contains('is-inactive')) {
        return;
      }

      const reactionsElement = reactionElement.parentElement as ReactionsElement;
      const reactionCount = reactionsElement.getReactionCount(reactionElement);

      const message = reactionsElement.getMessage();
      this.managers.appReactionsManager.sendReaction(message, reactionCount.reaction);

      return;
    }

    const stickerEmojiEl = findUpAttribute(target, 'data-sticker-emoji');
    if(stickerEmojiEl && stickerEmojiEl.parentElement.querySelectorAll('[data-sticker-emoji]').length === 1 && bubble.classList.contains('emoji-big')) {
      onEmojiStickerClick({
        event: e,
        container: stickerEmojiEl,
        managers: this.managers,
        middleware: this.getMiddleware(),
        peerId: this.peerId
      });

      return;
    }

    const commentsDiv: HTMLElement = findUpClassName(target, 'replies');
    if(commentsDiv) {
      const bubbleMid = +bubble.dataset.mid;
      if(this.peerId === REPLIES_PEER_ID) {
        const message = await this.chat.getMessage(bubbleMid) as Message.message;
        const peerId = getPeerId(message.reply_to.reply_to_peer_id);
        const threadId = message.reply_to.reply_to_top_id;
        const lastMsgId = message.fwd_from.saved_from_msg_id;
        this.chat.appImManager.openThread({
          peerId,
          lastMsgId,
          threadId
        });
      } else {
        const message1 = await this.chat.getMessage(bubbleMid);
        const message = await this.managers.appMessagesManager.getMessageWithReplies(message1 as Message.message);
        const replies = message.replies;
        if(replies) {
          this.managers.appMessagesManager.getDiscussionMessage(this.peerId, message.mid).then((message) => {
            this.chat.appImManager.setInnerPeer({
              peerId: replies.channel_id.toPeerId(true),
              type: 'discussion',
              threadId: (message as MyMessage).mid
            });
          });
        }
      }

      return;
    }

    const via = findUpClassName(target, 'is-via');
    if(via) {
      const el = via.querySelector('.peer-title') as HTMLElement;
      if(target === el || findUpAsChild(target, el)) {
        if(this.chat.input.canSendPlain()) {
          const message = el.innerText + ' ';
          this.managers.appDraftsManager.setDraft(this.peerId, this.chat.threadId, message);
        }

        cancelEvent(e);
        return;
      }
    }

    const nameDiv = findUpClassName(target, 'peer-title') || findUpTag(target, 'AVATAR-ELEMENT') || findUpAttribute(target, 'data-saved-from');
    if(nameDiv && nameDiv !== bubble) {
      target = nameDiv || target;
      const peerIdStr = target.dataset.peerId || target.getAttribute('peer') || (target as AvatarElement).peerId;
      const savedFrom = target.dataset.savedFrom;
      if(typeof(peerIdStr) === 'string' || savedFrom) {
        if(savedFrom) {
          const [peerId, mid] = savedFrom.split('_');
          if(target.classList.contains('is-receipt-link')) {
            const message = await this.managers.appMessagesManager.getMessageByPeer(peerId.toPeerId(), +mid);
            if(message) {
              const inputInvoice = await this.managers.appPaymentsManager.getInputInvoiceByPeerId(this.peerId, +bubble.dataset.mid);
              PopupElement.createPopup(PopupPayment, message as Message.message, inputInvoice, undefined, true);
            }
          } else {
            this.chat.appImManager.setInnerPeer({
              peerId: peerId.toPeerId(),
              lastMsgId: +mid
            });
          }
        } else {
          const peerId = peerIdStr.toPeerId();
          if(peerId !== NULL_PEER_ID) {
            this.chat.appImManager.setInnerPeer({peerId});
          } else {
            toast(I18n.format('HidAccount', true));
          }
        }
      }

      return;
    }

    // this.log('chatInner click:', target);
    // const isVideoComponentElement = target.tagName === 'SPAN' && findUpClassName(target, 'media-container');
    /* if(isVideoComponentElement) {
      const video = target.parentElement.querySelector('video') as HTMLElement;
      if(video) {
        video.click(); // hot-fix for time and play button
        return;
      }
    } */

    if(bubble.classList.contains('sticker') && target.parentElement.classList.contains('attachment')) {
      const messageId = +bubble.dataset.mid;
      const message = await this.chat.getMessage(messageId);

      const doc = ((message as Message.message).media as MessageMedia.messageMediaDocument)?.document as Document.document;

      if(doc?.stickerSetInput) {
        PopupElement.createPopup(PopupStickers, doc.stickerSetInput).show();
      }

      return;
    }

    if(await this.checkTargetForMediaViewer(target, e)) {
      return;
    }

    if(['IMG', 'DIV', 'SPAN'/* , 'A' */].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');

    if(['DIV', 'SPAN'].indexOf(target.tagName) !== -1/*  || target.tagName === 'A' */) {
      if(target.classList.contains('goto-original')) {
        const savedFrom = bubble.dataset.savedFrom;
        const [peerId, mid] = savedFrom.split('_');
        // //this.log('savedFrom', peerId, msgID);
        this.chat.appImManager.setInnerPeer({
          peerId: peerId.toPeerId(),
          lastMsgId: +mid
        });
        return;
      } else if(target.classList.contains('forward')) {
        const mid = +bubble.dataset.mid;
        const message = await this.managers.appMessagesManager.getMessageByPeer(this.peerId, mid);
        PopupElement.createPopup(PopupForward, {
          [this.peerId]: await this.managers.appMessagesManager.getMidsByMessage(message)
        });
        // appSidebarRight.forwardTab.open([mid]);
        return;
      }

      let isReplyClick = false;

      try {
        isReplyClick = !!findUpClassName(e.target, 'reply');
      } catch(err) {}

      if(isReplyClick && bubble.classList.contains('is-reply')/*  || bubble.classList.contains('forwarded') */) {
        const bubbleMid = +bubble.dataset.mid;
        this.followStack.push(bubbleMid);

        const message = (await this.chat.getMessage(bubbleMid)) as Message.message;

        const replyToPeerId = message.reply_to.reply_to_peer_id ? getPeerId(message.reply_to.reply_to_peer_id) : this.peerId;
        const replyToMid = message.reply_to.reply_to_msg_id;

        this.chat.appImManager.setInnerPeer({
          peerId: replyToPeerId,
          lastMsgId: replyToMid,
          type: this.chat.type,
          threadId: this.chat.threadId
        });

        /* if(this.chat.type === 'discussion') {
          this.chat.appImManager.setMessageId(, originalMessageId);
        } else {
          this.chat.appImManager.setInnerPeer(this.peerId, originalMessageId);
        } */
        // this.chat.setMessageId(, originalMessageId);
      }
    }

    // console.log('chatInner click', e);
  };

  public async checkTargetForMediaViewer(target: HTMLElement, e?: Event, mediaTimestamp?: number) {
    const bubble = findUpClassName(target, 'bubble');
    const documentDiv = findUpClassName(target, 'document-with-thumb');
    if((target.tagName === 'IMG' && !target.classList.contains('emoji') && !target.classList.contains('document-thumb')) ||
      target.classList.contains('album-item') ||
      // || isVideoComponentElement
      (target.tagName === 'VIDEO' && !bubble.classList.contains('round')) ||
      (documentDiv && !documentDiv.querySelector('.preloader-container')) ||
      target.classList.contains('canvas-thumbnail')) {
      const groupedItem = findUpClassName(target, 'album-item') || findUpClassName(target, 'document-container');
      const preloader = (groupedItem || bubble).querySelector<HTMLElement>('.preloader-container');
      if(preloader && e) {
        simulateClickEvent(preloader);
        cancelEvent(e);
        return;
      }

      cancelEvent(e);
      const messageId = +(groupedItem || bubble).dataset.mid;
      const message = await this.chat.getMessage(messageId);
      if(!message) {
        this.log.warn('no message by messageId:', messageId);
        return;
      }

      const SINGLE_MEDIA_CLASSNAME = 'webpage';
      const isSingleMedia = bubble.classList.contains(SINGLE_MEDIA_CLASSNAME);

      const f = documentDiv ? (media: any) => {
        return AppMediaViewer.isMediaCompatibleForDocumentViewer(media);
      } : (media: any) => {
        return media._ === 'photo' || ['video', 'gif'].includes(media.type);
      };

      const targets: {element: HTMLElement, mid: number, peerId: PeerId}[] = [];
      const ids = isSingleMedia ? [messageId] : (await Promise.all(Object.keys(this.bubbles).map((k) => +k).map(async(mid) => {
        /* if(isSingleMedia && !this.bubbles[id].classList.contains(SINGLE_MEDIA_CLASSNAME)) {
          return false;
        }  */
        // if(!this.scrollable.visibleElements.find((e) => e.element === this.bubbles[id])) return false;

        const message = await this.chat.getMessage(mid);
        const media = getMediaFromMessage(message);

        return media && f(media) && mid;
      }))).filter(Boolean).sort((a, b) => a - b);

      ids.forEach((id) => {
        let bubble = this.skippedMids.has(id) ? undefined : this.bubbles[id];
        if(!bubble) {
          bubble = this.chatInner.querySelector(`.grouped-item:not(.album-item)[data-mid="${id}"]`);
          if(bubble) {
            bubble = findUpClassName(bubble, 'bubble');
          }
        }

        if(!bubble) {
          return;
        }

        let selector: string;
        if(documentDiv) {
          selector = '.document-container';
        } else {
          const withTail = bubble.classList.contains('with-media-tail');
          selector = '.album-item video, .album-item img, .preview video, .preview img, ';
          if(withTail) {
            selector += '.bubble__media-container';
          } else {
            selector += '.attachment video, .attachment img';
          }
        }

        const elements = Array.from(bubble.querySelectorAll(selector)) as HTMLElement[];
        const parents: Set<HTMLElement> = new Set();
        if(documentDiv) {
          elements.forEach((element) => {
            targets.push({
              element: element.querySelector('.document-ico'),
              mid: +element.dataset.mid,
              peerId: this.peerId
            });
          });
        } else {
          const hasAspecter = !!bubble.querySelector('.media-container-aspecter');
          elements.forEach((element) => {
            if(hasAspecter && !findUpClassName(element, 'media-container-aspecter')) return;
            const albumItem = findUpClassName(element, 'album-item');
            const parent = albumItem || element.parentElement;
            if(parents.has(parent)) return;
            parents.add(parent);
            targets.push({
              element,
              mid: albumItem ? +albumItem.dataset.mid : id,
              peerId: this.peerId
            });
          });
        }
      });

      targets.sort((a, b) => a.mid - b.mid);

      const idx = targets.findIndex((t) => t.mid === messageId);

      if(DEBUG) {
        this.log('open mediaViewer single with ids:', ids, idx, targets);
      }

      if(!targets[idx]) {
        this.log('no target for media viewer!', target);
        return;
      }

      new AppMediaViewer()
      .setSearchContext({
        threadId: this.chat.threadId,
        peerId: this.peerId,
        inputFilter: {_: documentDiv ? 'inputMessagesFilterDocument' : 'inputMessagesFilterPhotoVideo'},
        useSearch: this.chat.type !== 'scheduled' && !isSingleMedia,
        isScheduled: this.chat.type === 'scheduled'
      })
      .openMedia({
        message: message,
        target: targets[idx].element,
        fromRight: 0,
        reverse: true,
        prevTargets: targets.slice(0, idx),
        nextTargets: targets.slice(idx + 1),
        mediaTimestamp
      });
      return true;
    }
  }

  public async onGoDownClick() {
    if(!this.followStack.length) {
      // this.onScroll(true, undefined, true);
      this.chat.setMessageId(/* , dialog.top_message */);
      // const dialog = this.appMessagesManager.getDialogByPeerId(this.peerId)[0];

      // if(dialog) {
      //   this.chat.setPeer(this.peerId/* , dialog.top_message */);
      // } else {
      //   this.log('will scroll down 3');
      //   this.scroll.scrollTop = this.scroll.scrollHeight;
      // }

      return;
    }

    const middleware = this.getMiddleware();
    const slice = this.followStack.slice();
    const messages = await Promise.all(slice.map((mid) => this.chat.getMessage(mid)));
    if(!middleware()) return;

    slice.forEach((mid, idx) => {
      const message = messages[idx];

      const bubble = this.bubbles[mid];
      let bad = true;
      if(bubble) {
        const rect = bubble.getBoundingClientRect();
        bad = (windowSize.height / 2) > rect.top;
      } else if(message) {
        bad = false;
      }

      if(bad) {
        this.followStack.splice(this.followStack.indexOf(mid), 1);
      }
    });

    this.followStack.sort((a, b) => b - a);

    const mid = this.followStack.pop();
    this.chat.setMessageId(mid);
  }

  public getBubbleByPoint(verticalSide: 'top' | 'bottom') {
    const slice = this.getViewportSlice();
    const item = slice.visible[verticalSide === 'top' ? 0 : slice.visible.length - 1];
    return item?.element;
  }

  public async getGroupedBubble(groupId: string) {
    const mids = await this.managers.appMessagesManager.getMidsByAlbum(groupId);
    for(const mid of mids) {
      if(this.bubbles[mid] && !this.skippedMids.has(mid)) {
        // const maxId = Math.max(...mids); // * because in scheduled album can be rendered by lowest mid during sending
        return {
          bubble: this.bubbles[mid],
          mid: mid
          // message: await this.chat.getMessage(maxId) as Message.message
        };
      }
    }
  }

  public getBubbleGroupedItems(bubble: HTMLElement) {
    return Array.from(bubble.querySelectorAll('.grouped-item')) as HTMLElement[];
  }

  public async getMountedBubble(mid: number, message?: Message.message | Message.messageService) {
    if(message === undefined) {
      message = await this.chat.getMessage(mid);
    }

    if(!message) {
      return;
    }

    const groupedId = (message as Message.message).grouped_id;
    if(groupedId) {
      const a = await this.getGroupedBubble(groupedId);
      if(a) {
        a.bubble = a.bubble.querySelector(`.document-container[data-mid="${mid}"]`) || a.bubble;
        return a;
      }
    }

    const bubble = this.bubbles[mid];
    if(!bubble || this.skippedMids.has(mid)) return;

    return {bubble, mid};
  }

  private findNextMountedBubbleByMsgId(mid: number, prev?: boolean) {
    const mids = getObjectKeysAndSort(this.bubbles, prev ? 'desc' : 'asc');

    let filterCallback: (_mid: number) => boolean;
    if(prev) filterCallback = (_mid) => _mid < mid;
    else filterCallback = (_mid) => mid < _mid;

    const foundMid = mids.find((_mid) => {
      if(!filterCallback(_mid)) return false;
      return !!this.bubbles[_mid]?.parentElement;
    });

    return this.bubbles[foundMid];
  }

  public loadMoreHistory(top: boolean, justLoad = false) {
    // this.log('loadMoreHistory', top);
    if(
      !this.peerId ||
      /* TEST_SCROLL || */
      this.chat.setPeerPromise ||
      this.isHeavyAnimationInProgress ||
      (top && (this.getHistoryTopPromise || this.scrollable.loadedAll.top)) ||
      (!top && (this.getHistoryBottomPromise || this.scrollable.loadedAll.bottom))
    ) {
      return;
    }

    // warning, если иды только отрицательные то вниз не попадёт (хотя мб и так не попадёт)
    // some messages can have negative id (such as sponsored message)
    const history = Object.keys(this.bubbles)
    .map((id) => +id)
    .filter((id) => id > 0 && !this.skippedMids.has(id))
    .sort((a, b) => a - b);

    if(!history.length) {
      history.push(0);
    }

    if(top) {
      if(DEBUG) {
        this.log('Will load more (up) history by id:', history[0], 'maxId:', history[history.length - 1], justLoad/* , history */);
      }

      this.getHistory1(history[0], true, undefined, undefined, justLoad);
    } else {
      // let dialog = this.appMessagesManager.getDialogByPeerId(this.peerId)[0];
      // const historyMaxId = await this.chat.getHistoryMaxId();

      // // if scroll down after search
      // if(history.indexOf(historyMaxId) !== -1) {
      //   this.setLoaded('bottom', true);
      //   return;
      // }

      if(DEBUG) {
        this.log('Will load more (down) history by id:', history[history.length - 1], justLoad/* , history */);
      }

      this.getHistory1(history[history.length - 1], false, true, undefined, justLoad);
    }
  }

  public onScroll = (ignoreHeavyAnimation?: boolean, scrollDimensions?: ScrollStartCallbackDimensions, forceDown?: boolean) => {
    // return;

    if(this.isHeavyAnimationInProgress) {
      this.sliceViewportDebounced?.clearTimeout();

      // * В таком случае, кнопка не будет моргать если чат в самом низу, и правильно отработает случай написания нового сообщения и проскролла вниз
      if(this.scrolledDown && !ignoreHeavyAnimation) {
        return;
      }
    } else {
      this.chat.topbar.pinnedMessage?.setCorrectIndexThrottled(this.scrollable.lastScrollDirection);
      this.sliceViewportDebounced?.();
      this.setStickyDateManually();
    }

    // lottieLoader.checkAnimations(false, 'chat');

    if(scrollDimensions && scrollDimensions.distanceToEnd < SCROLLED_DOWN_THRESHOLD && this.scrolledDown) {
      return;
    }

    const distanceToEnd = forceDown ? 0 : scrollDimensions?.distanceToEnd ?? this.scrollable.getDistanceToEnd();
    if(/* !IS_TOUCH_SUPPORTED &&  */(this.scrollable.lastScrollDirection !== 0 && distanceToEnd > 0) || scrollDimensions || forceDown) {
    // if(/* !IS_TOUCH_SUPPORTED &&  */(this.scrollable.lastScrollDirection !== 0 || scrollDimensions) && distanceToEnd > 0) {
      if(this.isScrollingTimeout) {
        clearTimeout(this.isScrollingTimeout);
      } else if(!this.chatInner.classList.contains('is-scrolling')) {
        this.chatInner.classList.add('is-scrolling');
      }

      this.isScrollingTimeout = window.setTimeout(() => {
        this.chatInner.classList.remove('is-scrolling');
        this.isScrollingTimeout = 0;
      }, 1350 + (scrollDimensions?.duration ?? 0));
    }

    if(distanceToEnd < SCROLLED_DOWN_THRESHOLD && (forceDown || this.scrollable.loadedAll.bottom || this.chat.setPeerPromise || !this.peerId)) {
      this.container.classList.add('scrolled-down');
      this.scrolledDown = true;
    } else if(this.container.classList.contains('scrolled-down')) {
      this.container.classList.remove('scrolled-down');
      this.scrolledDown = false;
    }
  };

  public setScroll() {
    if(this.scrollable) {
      this.destroyScrollable();
    }

    this.scrollable = new Scrollable(null, 'IM', /* 10300 */300);
    this.setLoaded('top', false, false);
    this.setLoaded('bottom', false, false);

    this.scrollable.container.append(this.chatInner);

    /* const getScrollOffset = () => {
      //return Math.round(Math.max(300, appPhotosManager.windowH / 1.5));
      return 300;
    };

    window.addEventListener('resize', () => {
      this.scrollable.onScrollOffset = getScrollOffset();
    });

    this.scrollable = new Scrollable(this.bubblesContainer, 'y', 'IM', this.chatInner, getScrollOffset()); */

    this.scrollable.onAdditionalScroll = this.onScroll;
    this.scrollable.onScrolledTop = () => this.loadMoreHistory(true);
    this.scrollable.onScrolledBottom = () => this.loadMoreHistory(false);
    // this.scrollable.attachSentinels(undefined, 300);

    if(IS_TOUCH_SUPPORTED && false) {
      this.scrollable.container.addEventListener('touchmove', () => {
        if(this.isScrollingTimeout) {
          clearTimeout(this.isScrollingTimeout);
        } else if(!this.chatInner.classList.contains('is-scrolling')) {
          this.chatInner.classList.add('is-scrolling');
        }
      }, {passive: true});

      this.scrollable.container.addEventListener('touchend', () => {
        if(!this.chatInner.classList.contains('is-scrolling')) {
          return;
        }

        if(this.isScrollingTimeout) {
          clearTimeout(this.isScrollingTimeout);
        }

        this.isScrollingTimeout = window.setTimeout(() => {
          this.chatInner.classList.remove('is-scrolling');
          this.isScrollingTimeout = 0;
        }, 1350);
      }, {passive: true});
    }
  }

  public async updateUnreadByDialog() {
    const historyStorage = await this.chat.getHistoryStorage();
    const maxId = this.peerId === rootScope.myId ? historyStorage.readMaxId : historyStorage.readOutboxMaxId;

    // /////this.log('updateUnreadByDialog', maxId, dialog, this.unreadOut);

    for(const msgId of this.unreadOut) {
      if(msgId > 0 && msgId <= maxId) {
        const bubble = this.bubbles[msgId];
        if(bubble) {
          this.unreadOut.delete(msgId);

          if(bubble.classList.contains('is-outgoing') || bubble.classList.contains('is-error')) {
            continue;
          }

          bubble.classList.remove('is-sent', 'is-sending', 'is-outgoing'); // is-sending can be when there are bulk of updates (e.g. sending command to Stickers bot)
          bubble.classList.add('is-read');
        }
      }
    }
  }

  public destroyBubble(bubble: HTMLElement, mid = +bubble.dataset.mid) {
    // this.log.warn('destroy bubble', bubble, mid);
    bubble.middlewareHelper.destroy();

    /* const mounted = this.getMountedBubble(mid);
    if(!mounted) return; */

    if(this.bubbles[mid] === bubble) { // have to check because can clear bubble with same id later
      delete this.bubbles[mid];
    }

    this.skippedMids.delete(mid);

    if(this.firstUnreadBubble === bubble) {
      this.firstUnreadBubble = null;
    }

    this.bubbleGroups.removeAndUnmountBubble(bubble);
    if(this.observer) {
      this.observer.unobserve(bubble, this.unreadedObserverCallback);
      this.unreaded.delete(bubble);

      this.observer.unobserve(bubble, this.viewsObserverCallback);
      this.viewsMids.delete(mid);

      this.observer.unobserve(bubble, this.stickerEffectObserverCallback);
    }

    // this.reactions.delete(mid);
  }

  public deleteMessagesByIds(mids: number[], permanent = true, ignoreOnScroll?: boolean) {
    let deleted = false;
    mids.forEach((mid) => {
      const bubble = this.bubbles[mid];
      if(!bubble) return;

      this.destroyBubble(bubble, mid);

      deleted = true;
    });

    if(!deleted) {
      return;
    }

    this.scrollable.ignoreNextScrollEvent();
    if(permanent && this.chat.selection.isSelecting) {
      this.chat.selection.deleteSelectedMids(this.peerId, mids);
    }

    animationIntersector.checkAnimations(false, this.chat.animationGroup);
    this.deleteEmptyDateGroups();

    if(!ignoreOnScroll) {
      this.scrollable.onScroll();
      // this.onScroll();
    }
  }

  private pollExtendedMediaMessages() {
    const mids = Array.from(this.extendedMediaMessages);
    return this.managers.appMessagesManager.getExtendedMedia(this.peerId, mids);
  }

  private setExtendedMediaMessagesPollInterval() {
    if(this.pollExtendedMediaMessagesPromise || !this.extendedMediaMessages.size) {
      return;
    }

    this.pollExtendedMediaMessagesPromise = pause(30000)
    .then(() => this.pollExtendedMediaMessages())
    .then(() => this.setExtendedMediaMessagesPollInterval());
  }

  private setTopPadding(middleware = this.getMiddleware()) {
    let isPaddingNeeded = false;
    let setPaddingTo: HTMLElement;
    if(!this.isTopPaddingSet && this.chat.type !== 'scheduled') {
      const {clientHeight, scrollHeight} = this.scrollable.container;
      isPaddingNeeded = clientHeight === scrollHeight;
      /* const firstEl = this.chatInner.firstElementChild as HTMLElement;
      if(this.chatInner.firstElementChild) {
        const visibleRect = getVisibleRect(firstEl, this.scrollable.container);
        isPaddingNeeded = !visibleRect.overflow.top && (visibleRect.rect.top - firstEl.offsetTop) !== this.scrollable.container.getBoundingClientRect().top;
      } else {
        isPaddingNeeded = true;
      } */

      if(isPaddingNeeded) {
        /* const add = clientHeight - scrollHeight;
        this.chatInner.style.paddingTop = add + 'px';
        this.scrollable.scrollTop += add; */
        setPaddingTo = this.chatInner;
        setPaddingTo.style.paddingTop = clientHeight + 'px';
        this.scrollable.setScrollTopSilently(scrollHeight);
        this.isTopPaddingSet = true;
      }
    }

    return {
      isPaddingNeeded,
      unsetPadding: isPaddingNeeded ? () => {
        if(middleware() && isPaddingNeeded) {
          setPaddingTo.style.paddingTop = '';
          this.isTopPaddingSet = false;
        }
      } : undefined
    };
  }

  private renderNewMessage(message: MyMessage, scrolledDown?: boolean) {
    const promise = this._renderNewMessage(message, scrolledDown);
    this.renderNewPromises.add(promise);
    promise.catch(noop).finally(() => {
      this.renderNewPromises.delete(promise);
    });
    return promise;
  }

  private async _renderNewMessage(message: MyMessage, scrolledDown?: boolean) {
    if(!this.scrollable.loadedAll.bottom) { // seems search active or sliced
      // this.log('renderNewMessagesByIds: seems search is active, skipping render:', mids);
      const setPeerPromise = this.chat.setPeerPromise;
      if(setPeerPromise) {
        const middleware = this.getMiddleware();
        setPeerPromise.then(async() => {
          if(!middleware()) return;
          const newMessage = await this.chat.getMessage(message.mid);
          if(!middleware()) return;
          this.renderNewMessage(newMessage);
        });
      }

      return;
    }

    if(this.chat.threadId && getMessageThreadId(message, this.chat.isForum) !== this.chat.threadId) {
      return;
    }

    if(this.bubbles[message.mid]) {
      return;
    }
    // ! should scroll even without new messages
    /* if(!mids.length) {
      return;
    } */

    if(!scrolledDown) {
      scrolledDown = this.scrolledDown && (
        !this.scrollingToBubble ||
        this.scrollingToBubble === this.getLastBubble() ||
        this.scrollingToBubble === this.chatInner
      );
    }

    const middleware = this.getMiddleware();
    const {isPaddingNeeded, unsetPadding} = this.setTopPadding(middleware);

    const promise = this.performHistoryResult({history: [message]}, false);
    if(scrolledDown) {
      promise.then(() => {
        if(!middleware()) return;
        // this.log('renderNewMessagesByIDs: messagesQueuePromise after', this.scrollable.isScrolledDown);
        // this.scrollable.scrollTo(this.scrollable.scrollHeight, 'top', true, true, 5000);
        // const bubble = this.bubbles[Math.max(...mids)];

        let bubble: HTMLElement;
        if(this.chat.type === 'scheduled') {
          bubble = this.bubbles[message.mid];
        }

        const promise = bubble ? this.scrollToBubbleEnd(bubble) : this.scrollToEnd();
        if(isPaddingNeeded) {
          // it will be called only once even if was set multiple times (that won't happen)
          promise.then(unsetPadding);
        }

        // this.scrollable.scrollIntoViewNew(this.chatInner, 'end');

        /* setTimeout(() => {
          this.log('messagesQueuePromise afterafter:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        }, 10); */
      });
    }

    return promise;
  }

  public getLastBubble() {
    const group = this.bubbleGroups.lastGroup;
    return group?.lastItem?.bubble;
  }

  public scrollToBubble(
    element: HTMLElement,
    position: ScrollLogicalPosition,
    forceDirection?: FocusDirection,
    forceDuration?: number
  ) {
    const bubble = findUpClassName(element, 'bubble');

    if(!element.parentElement) {
      this.log.error('element is not connected', bubble);
    }

    let fallbackToElementStartWhenCentering: HTMLElement;
    // * if it's a start, then scroll to start of the group
    if(bubble && position !== 'end') {
      const item = this.bubbleGroups.getItemByBubble(bubble);
      if(item && item.group.firstItem === item && whichChild(item.group.container) === (this.stickyIntersector ? STICKY_OFFSET : 1)) {
        const dateGroup = item.group.container.parentElement;
        // if(whichChild(dateGroup) === 0) {
        fallbackToElementStartWhenCentering = dateGroup;
        // position = 'start';
        // element = dateGroup;
        // }
      }
    }

    // const isLastBubble = this.getLastBubble() === bubble;
    /* if(isLastBubble) {
      element = this.getLastDateGroup();
    } */

    const margin = 4; // * 4 = .25rem
    /* if(isLastBubble && this.chat.type === 'chat' && this.bubblesContainer.classList.contains('is-chat-input-hidden')) {
      margin = 20;
    } */

    const isChangingHeight = (this.chat.input.messageInput && this.chat.input.messageInput.classList.contains('is-changing-height')) || this.chat.container.classList.contains('is-toggling-helper');
    const promise = this.scrollable.scrollIntoViewNew({
      element,
      position,
      margin,
      forceDirection,
      forceDuration,
      axis: 'y',
      getNormalSize: isChangingHeight ? ({rect}) => {
        // return rect.height;

        let height = windowSize.height;
        // height -= this.chat.topbar.container.getBoundingClientRect().height;
        height -= this.container.offsetTop;
        height -= mediaSizes.isMobile || windowSize.height < 570 ? 58 : 78;
        return height;

        /* const rowsWrapperHeight = this.chat.input.rowsWrapper.getBoundingClientRect().height;
        const diff = rowsWrapperHeight - 54;
        return rect.height + diff; */
      } : undefined,
      fallbackToElementStartWhenCentering,
      startCallback: (dimensions) => {
        // this.onScroll(true, this.scrolledDown && dimensions.distanceToEnd <= SCROLLED_DOWN_THRESHOLD ? undefined : dimensions);
        this.onScroll(true, dimensions);

        if(this.updateGradient) {
          const {gradientRenderer} = this.chat;
          gradientRenderer?.toNextPosition(dimensions.getProgress);
          this.updateGradient = undefined;
        }
      }
    });

    // fix flickering date when opening unread chat and focusing message
    if(forceDirection === FocusDirection.Static) {
      this.scrollable.lastScrollPosition = this.scrollable.scrollTop;
    }

    return promise;
  }

  public scrollToEnd() {
    return this.scrollToBubbleEnd(this.chatInner);
  }

  public async scrollToBubbleEnd(bubble: HTMLElement) {
    /* if(DEBUG) {
      this.log('scrollToNewLastBubble: will scroll into view:', bubble);
    } */

    if(bubble) {
      this.scrollingToBubble = bubble;
      const middleware = this.getMiddleware();
      await this.scrollToBubble(bubble, 'end', undefined, undefined);
      if(!middleware()) return;
      this.scrollingToBubble = undefined;
    }
  }

  // ! can't get it by chatInner.lastElementChild because placeholder can be the last...
  // private getLastDateGroup() {
  //   let lastTime = 0, lastElem: HTMLElement;
  //   for(const i in this.dateMessages) {
  //     const dateMessage = this.dateMessages[i];
  //     if(dateMessage.firstTimestamp > lastTime) {
  //       lastElem = dateMessage.container;
  //       lastTime = dateMessage.firstTimestamp;
  //     }
  //   }

  //   return lastElem;
  // }

  public async scrollToBubbleIfLast(bubble: HTMLElement) {
    if(this.getLastBubble() === bubble) {
      // return this.scrollToBubbleEnd(bubble);
      return this.scrollToEnd();
    }
  }

  public highlightBubble(element: HTMLElement) {
    const datasetKey = 'highlightTimeout';
    if(element.dataset[datasetKey]) {
      clearTimeout(+element.dataset[datasetKey]);
      element.classList.remove('is-highlighted');
      void element.offsetWidth; // reflow
    }

    element.classList.add('is-highlighted');
    element.dataset[datasetKey] = '' + setTimeout(() => {
      element.classList.remove('is-highlighted');
      delete element.dataset[datasetKey];
    }, 2000);
  }

  private createDateBubble(timestamp: number, date: Date = new Date(timestamp * 1000)) {
    let dateElement: HTMLElement;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isScheduled = this.chat.type === 'scheduled';

    if(today.getTime() === date.getTime()) {
      dateElement = i18n(isScheduled ? 'Chat.Date.ScheduledForToday' : 'Date.Today');
    } else if(isScheduled && timestamp === SEND_WHEN_ONLINE_TIMESTAMP) {
      dateElement = i18n('MessageScheduledUntilOnline');
    } else {
      const options: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'long'
      };

      if(date.getFullYear() !== today.getFullYear()) {
        options.year = 'numeric';
      }

      dateElement = new I18n.IntlDateElement({
        date,
        options
      }).element;

      if(isScheduled) {
        dateElement = i18n('Chat.Date.ScheduledFor', [dateElement]);
      }
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble service is-date';
    const bubbleContent = document.createElement('div');
    bubbleContent.classList.add('bubble-content');
    const serviceMsg = document.createElement('div');
    serviceMsg.classList.add('service-msg');

    serviceMsg.append(dateElement);

    bubbleContent.append(serviceMsg);
    bubble.append(bubbleContent);

    return bubble;
  }

  public getDateForDateContainer(timestamp: number) {
    const date = new Date(timestamp * 1000);
    if(timestamp !== SEND_WHEN_ONLINE_TIMESTAMP) {
      date.setHours(0, 0, 0);
    }
    return {date, dateTimestamp: date.getTime()};
  }

  public getDateContainerByTimestamp(timestamp: number) {
    const {date, dateTimestamp} = this.getDateForDateContainer(timestamp);
    let ret = this.dateMessages[dateTimestamp];
    if(ret) {
      return ret;
    }

    const bubble = this.createDateBubble(timestamp, date);
    // bubble.classList.add('is-sticky');
    const fakeBubble = this.createDateBubble(timestamp, date);
    fakeBubble.classList.add('is-fake');

    const container = document.createElement('section');
    container.className = 'bubbles-date-group';
    container.append(bubble, fakeBubble);

    ret = this.dateMessages[dateTimestamp] = {
      div: bubble,
      container,
      firstTimestamp: date.getTime()
    };

    const haveTimestamps = getObjectKeysAndSort(this.dateMessages, 'asc');
    const length = haveTimestamps.length;
    let i = 0, insertBefore: HTMLElement; // there can be 'first bubble' (e.g. bot description) so can't insert by index
    for(; i < haveTimestamps.length; ++i) {
      const t = haveTimestamps[i];
      insertBefore = this.dateMessages[t].container;
      if(dateTimestamp < t) {
        break;
      }
    }

    if(i === length && insertBefore) {
      insertBefore = insertBefore.nextElementSibling as HTMLElement;
    }

    if(!insertBefore) {
      this.chatInner.append(container);
    } else {
      this.chatInner.insertBefore(container, insertBefore);
    }

    this.stickyIntersector?.observeStickyHeaderChanges(container);

    if(this.chatInner.parentElement) {
      this.container.classList.add('has-groups');
    }

    return ret;
  }

  private destroyScrollable() {
    this.scrollable.destroy();
  }

  public destroy() {
    // this.chat.log.error('Bubbles destroying');

    this.destroyScrollable();

    this.listenerSetter.removeAll();

    this.lazyLoadQueue.clear();
    this.observer && this.observer.disconnect();
    this.stickyIntersector && this.stickyIntersector.disconnect();

    delete this.lazyLoadQueue;
    this.observer && delete this.observer;
    this.stickyIntersector && delete this.stickyIntersector;
  }

  public cleanup(bubblesToo = false) {
    this.log('cleanup');

    this.bubbles = {}; // clean it before so sponsored message won't be deleted faster on peer changing
    // //console.time('appImManager cleanup');
    this.setLoaded('top', false, false);
    this.setLoaded('bottom', false, false);

    // cancel scroll
    cancelAnimationByKey(this.scrollable.container);

    // do not wait ending of previous scale animation
    interruptHeavyAnimation();

    if(TEST_SCROLL !== undefined) {
      TEST_SCROLL = TEST_SCROLL_TIMES;
    }

    this.skippedMids.clear();
    this.dateMessages = {};
    this.bubbleGroups.cleanup();
    this.unreadOut.clear();
    this.needUpdate.length = 0;
    this.lazyLoadQueue.clear();
    this.renderNewPromises.clear();

    // clear messages
    if(bubblesToo) {
      this.scrollable.container.textContent = '';
      this.chatInner.textContent = '';
      this.cleanupPlaceholders();
    }

    this.firstUnreadBubble = null;
    this.attachedUnreadBubble = false;

    this.batchProcessor.clear();

    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;
    this.fetchNewPromise = undefined;
    this.getSponsoredMessagePromise = undefined;
    this.updateGradient = undefined;

    if(this.stickyIntersector) {
      this.stickyIntersector.disconnect();
    }

    if(this.observer) {
      this.observer.disconnect();

      this.unreaded.clear();
      this.unreadedSeen.clear();
      this.readPromise = undefined;

      this.viewsMids.clear();
    }

    this.middlewareHelper.clean();

    this.onAnimateLadder = undefined;
    this.resolveLadderAnimation = undefined;
    this.attachPlaceholderOnRender = undefined;
    this.emptyPlaceholderBubble = undefined;
    this.sponsoredMessage = undefined;
    this.previousStickyDate = undefined;

    this.scrollingToBubble = undefined;
    // //console.timeEnd('appImManager cleanup');

    this.isTopPaddingSet = false;

    this.renderingMessages.clear();
    this.bubblesToEject.clear();
    this.bubblesToReplace.clear();

    // this.reactions.clear();

    if(this.isScrollingTimeout) {
      clearTimeout(this.isScrollingTimeout);
      this.isScrollingTimeout = 0;
    }

    this.container.classList.remove('has-sticky-dates');
    this.scrollable.cancelMeasure();
  }

  private cleanupPlaceholders(bubble = this.emptyPlaceholderBubble) {
    if(bubble) {
      this.destroyBubble(bubble);
    }
  }

  private tryToForceStartParam(middleware: () => boolean) {
    // start bot instantly if have messages
    const startParam = this.chat.input.startParam;
    if(startParam === undefined) {
      return;
    }

    this.chat.isStartButtonNeeded().then((isNeeded) => {
      if(!middleware() || isNeeded || this.chat.input.startParam !== startParam) {
        return;
      }

      this.chat.input.startBot();
    });
  }

  public async setPeer(options: ChatSetPeerOptions & {samePeer: boolean}): Promise<{cached?: boolean, promise: Chat['setPeerPromise']}> {
    const {samePeer, peerId, stack} = options;
    let {lastMsgId, startParam} = options;
    const tempId = ++this.setPeerTempId;

    if(!peerId) {
      this.cleanup(true);
      this.preloader.detach();
      return null;
    }

    const perf = performance.now();
    const log = this.log.bindPrefix('setPeer');
    log.warn('start');

    const middleware = () => {
      return this.setPeerTempId === tempId;
    };

    const m = middlewarePromise(middleware, PEER_CHANGED_ERROR);

    if(!samePeer) {
      await m(this.chat.onChangePeer(options, m));
    }

    /* if(samePeer && this.chat.setPeerPromise) {
      return {cached: true, promise: this.chat.setPeerPromise};
    } */

    const chatType = this.chat.type;

    if(chatType === 'scheduled' || this.chat.isRestricted) {
      lastMsgId = 0;
    }

    const historyStorage = await m(this.chat.getHistoryStorage());
    const topMessage = chatType === 'pinned' ? await m(this.managers.appMessagesManager.getPinnedMessagesMaxId(peerId, this.chat.threadId)) : historyStorage.maxId ?? 0;
    const isTarget = lastMsgId !== undefined;

    // * this one will fix topMessage for null message in history (e.g. channel comments with only 1 comment and it is a topMessage)
    /* if(chatType !== 'pinned' && topMessage && !historyStorage.history.slice.includes(topMessage)) {
      topMessage = 0;
    } */

    let followingUnread: boolean;
    let readMaxId = 0, savedPosition: ReturnType<AppImManager['getChatSavedPosition']>, overrideAdditionMsgId: number;
    if(!isTarget) {
      if(!samePeer) {
        savedPosition = this.chat.appImManager.getChatSavedPosition(this.chat);
      }

      if(savedPosition) {

      } else if(topMessage) {
        readMaxId = await m(this.managers.appMessagesManager.getReadMaxIdIfUnread(peerId, this.chat.threadId));
        const dialog = await m(this.chat.getDialogOrTopic());
        if(/* dialog.unread_count */readMaxId && !samePeer && (!dialog || dialog.unread_count !== 1)) {
          const foundSlice = historyStorage.history.findSliceOffset(readMaxId);
          if(foundSlice && foundSlice.slice.isEnd(SliceEnd.Bottom)) {
            overrideAdditionMsgId = foundSlice.slice[foundSlice.offset - 25] || foundSlice.slice[0] || readMaxId;
          }

          followingUnread = !isTarget;
          lastMsgId = readMaxId;
        } else {
          lastMsgId = topMessage;
          // lastMsgID = topMessage;
        }
      }
    }

    const isJump = lastMsgId !== topMessage/*  && overrideAdditionMsgId === undefined */;

    if(startParam === undefined && await m(this.chat.isStartButtonNeeded())) {
      startParam = BOT_START_PARAM;
    }

    if(samePeer) {
      if(stack && lastMsgId) {
        this.followStack.push(stack);
      }

      const mounted = await m(this.getMountedBubble(lastMsgId));
      if(mounted) {
        if(isTarget) {
          this.scrollToBubble(mounted.bubble, 'center');
          this.highlightBubble(mounted.bubble);
          this.chat.dispatchEvent('setPeer', lastMsgId, false);
        } else if(topMessage && !isJump) {
          // log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          // scrollable.setScrollTopSilently(scrollable.scrollHeight);
          this.scrollToEnd();
          this.chat.dispatchEvent('setPeer', lastMsgId, true);
        }

        if(startParam !== undefined) {
          this.chat.input.setStartParam(startParam);
          this.tryToForceStartParam(middleware);
        }

        if(options.mediaTimestamp) {
          getHeavyAnimationPromise().then(() => {
            this.playMediaWithTimestampAndMid({
              lastMsgId,
              middleware,
              mediaTimestamp: options.mediaTimestamp
            });
          });
        }

        return null;
      }
    } else {
      if(this.peerId) { // * set new queue id if new peer (setting not from 0)
        this.lazyLoadQueue.queueId = ++queueId;
        this.managers.apiFileManager.setQueueId(this.chat.bubbles.lazyLoadQueue.queueId);
      }

      this.followStack.length = 0;

      this.passEntities = {
        messageEntityBotCommand: await m(this.managers.appPeersManager.isAnyGroup(peerId)) || this.chat.isBot
      };
    }

    if(DEBUG) {
      log('setPeer peerId:', peerId, historyStorage, lastMsgId, topMessage);
    }

    // add last message, bc in getHistory will load < max_id
    const additionMsgId = overrideAdditionMsgId ?? (isJump || chatType === 'scheduled' || this.chat.isRestricted ? 0 : topMessage);

    let maxBubbleId = 0;
    if(samePeer) {
      const el = this.getBubbleByPoint('bottom'); // ! this may not work if being called when chat is hidden
      // this.chat.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el);
      if(el) {
        maxBubbleId = +el.dataset.mid;
      }

      if(maxBubbleId <= 0) {
        maxBubbleId = Math.max(...Object.keys(this.bubbles).map((mid) => +mid));
      }
    } else {
      this.isFirstLoad = true;
      this.destroyResizeObserver();
    }

    const oldChatInner = this.chatInner;
    const oldPlaceholderBubble = this.emptyPlaceholderBubble;
    this.cleanup();
    const chatInner = this.chatInner = document.createElement('div');
    if(samePeer) {
      chatInner.className = oldChatInner.className;
      chatInner.classList.remove('disable-hover', 'is-scrolling');
    } else {
      chatInner.classList.add('bubbles-inner');
    }

    this.lazyLoadQueue.lock();

    // const haveToScrollToBubble = (topMessage && (isJump || samePeer)) || isTarget;
    const haveToScrollToBubble = samePeer || (topMessage && isJump) || isTarget;
    const fromUp = maxBubbleId > 0 && (!lastMsgId || maxBubbleId < lastMsgId || lastMsgId < 0);
    const scrollFromDown = !fromUp && samePeer;
    const scrollFromUp = !scrollFromDown && fromUp/*  && (samePeer || forwardingUnread) */;
    this.willScrollOnLoad = scrollFromDown || scrollFromUp;

    this.setPeerOptions = {
      lastMsgId,
      topMessage,
      savedPosition
    };

    if(!samePeer) {
      this.ranks = undefined;
      this.processRanks = undefined;
      this.canShowRanks = false;

      if(this.chat.isChannel) {
        this.canShowRanks = true;
        const processRanks = this.processRanks = new Set();

        const promise = this.managers.acknowledged.appProfileManager.getParticipants(this.peerId.toChatId(), {_: 'channelParticipantsAdmins'}, 100);
        const ackedResult = await m(promise);
        const setRanksPromise = ackedResult.result.then((channelParticipants) => {
          if(this.processRanks !== processRanks) {
            return;
          }

          const participants = channelParticipants.participants as (ChatParticipant.chatParticipantAdmin | ChannelParticipant.channelParticipantAdmin)[];
          this.ranks = new Map();
          participants.forEach((participant) => {
            const rank = getParticipantRank(participant);
            this.ranks.set(participant.user_id.toPeerId(), rank);
          });

          getHeavyAnimationPromise().then(() => {
            if(this.processRanks !== processRanks) {
              return;
            }

            processRanks.forEach((callback) => callback());
            this.processRanks = undefined;
          });
        }, (err) => {
          if((err as ApiError).type !== 'CHAT_ADMIN_REQUIRED') {
            this.log.error('ranks error', err);
          }

          this.ranks = new Map();
        });

        if(ackedResult.cached) {
          await m(setRanksPromise);
        }
      }
    }

    let result: Awaited<ReturnType<ChatBubbles['getHistory']>>;
    if(!savedPosition) {
      result = await m(this.getHistory1(lastMsgId, true, isJump, additionMsgId));
    } else {
      result = {
        promise: getHeavyAnimationPromise().then(() => {
          return this.performHistoryResult({history: savedPosition.mids}, true);
        }) as any,
        cached: true,
        waitPromise: Promise.resolve()
      };
    }

    this.setPeerCached = result.cached;

    log.warn('got history');// warning

    const {promise, cached} = result;
    const finishPeerChangeOptions: Parameters<Chat['finishPeerChange']>[0] = {
      isTarget,
      isJump,
      lastMsgId,
      startParam,
      middleware
    };

    if(!cached && !samePeer) {
      await m(this.chat.finishPeerChange(finishPeerChangeOptions));
      this.scrollable.container.replaceChildren();
      // oldContainer.textContent = '';
      // oldChatInner.remove();
      this.preloader.attach(this.container);
    }

    /* this.ladderDeferred && this.ladderDeferred.resolve();
    this.ladderDeferred = deferredPromise<void>(); */

    animationIntersector.lockGroup(this.chat.animationGroup);
    const setPeerPromise = m(promise).then(async() => {
      log.warn('promise fulfilled');

      const mountedByLastMsgId = haveToScrollToBubble ? await m(lastMsgId ? this.getMountedBubble(lastMsgId) : {bubble: this.getLastBubble()}) : undefined;
      if(cached && !samePeer) {
        log.warn('finishing peer change');
        await m(this.chat.finishPeerChange(finishPeerChangeOptions)); // * костыль
        log.warn('finished peer change');
      }

      this.preloader.detach();

      if(this.resolveLadderAnimation) {
        this.resolveLadderAnimation();
        this.resolveLadderAnimation = undefined;
      }

      this.setPeerCached = undefined;

      // this.ladderDeferred.resolve();

      const scrollable = this.scrollable;
      scrollable.lastScrollDirection = 0;
      scrollable.lastScrollPosition = 0;
      replaceContent(scrollable.container, chatInner);
      // this.chat.topbar.container.nextElementSibling.replaceWith(container);

      if(oldPlaceholderBubble) {
        this.cleanupPlaceholders(oldPlaceholderBubble);
      }

      this.attachPlaceholderOnRender?.();

      if(!isTarget && this.chat.isPinnedMessagesNeeded()) {
        this.chat.topbar.pinnedMessage?.setCorrectIndex(0);
      }

      this.container.classList.toggle('has-groups', !!Object.keys(this.dateMessages).length);

      log.warn('mounted chat', this.chatInner === chatInner, this.chatInner.parentElement, performance.now() - perf);

      animationIntersector.unlockGroup(this.chat.animationGroup);
      animationIntersector.checkAnimations(false, this.chat.animationGroup/* , true */);

      // fastRaf(() => {
      this.lazyLoadQueue.unlock();
      // });

      // if(dialog && lastMsgID && lastMsgID !== topMessage && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
      if(savedPosition) {
        scrollable.setScrollTopSilently(savedPosition.top);
        /* const mountedByLastMsgId = this.getMountedBubble(lastMsgId);
        let bubble: HTMLElement = mountedByLastMsgId?.bubble;
        if(!bubble?.parentElement) {
          bubble = this.findNextMountedBubbleByMsgId(lastMsgId);
        }

        if(bubble) {
          const top = bubble.getBoundingClientRect().top;
          const distance = savedPosition.top - top;
          scrollable.scrollTop += distance;
        } */
      } else if(haveToScrollToBubble) {
        let unsetPadding: () => void;
        if(scrollFromDown) {
          scrollable.setScrollTopSilently(99999);
        } else if(scrollFromUp) {
          const set = this.setTopPadding();
          if(set.isPaddingNeeded) {
            unsetPadding = set.unsetPadding;
          }

          scrollable.setScrollTopSilently(0);
        }

        // const mountedByLastMsgId = lastMsgId ? this.getMountedBubble(lastMsgId) : {bubble: this.getLastBubble()};
        let bubble: HTMLElement = (followingUnread && this.firstUnreadBubble) || mountedByLastMsgId?.bubble;
        if(!bubble?.parentElement) {
          bubble = this.findNextMountedBubbleByMsgId(lastMsgId, false) || this.findNextMountedBubbleByMsgId(lastMsgId, true);
        }

        let promise: Promise<void>;
        // ! sometimes there can be no bubble
        if(bubble) {
          const lastBubble = this.getLastBubble();
          const position: ScrollLogicalPosition = followingUnread ? 'start' : (!isJump && !isTarget && lastBubble === bubble ? 'end' : 'center');

          if(position === 'end' && lastBubble === bubble && samePeer) {
            promise = this.scrollToEnd();
          } else {
            promise = this.scrollToBubble(bubble, position, !samePeer ? FocusDirection.Static : undefined);
          }

          if(!followingUnread && isTarget) {
            this.highlightBubble(bubble);
          }
        }

        if(unsetPadding) {
          (promise || Promise.resolve()).then(() => {
            unsetPadding();
          });
        }
      } else {
        scrollable.setScrollTopSilently(99999);
      }

      // if(!cached) {
      this.onRenderScrollSet();
      // }

      this.onScroll();

      const afterSetPromise = Promise.all([
        setPeerPromise,
        getHeavyAnimationPromise()
      ]);
      afterSetPromise.then(() => { // check whether list isn't full
        if(!middleware()) {
          return;
        }

        scrollable.checkForTriggers();

        if(options.mediaTimestamp !== undefined) {
          // ! :(
          const p = cached && !samePeer && liteMode.isAvailable('animations') && this.chat.appImManager.chats.length > 1 ?
            pause(400) :
            Promise.resolve();
          p.then(() => {
            return this.playMediaWithTimestampAndMid({
              lastMsgId,
              middleware,
              mediaTimestamp: options.mediaTimestamp
            });
          });
        }

        this.tryToForceStartParam(middleware);

        // if(cached) {
        // this.onRenderScrollSet();
        // }
      });

      this.chat.dispatchEvent('setPeer', lastMsgId, !isJump);

      Promise.all([
        this.setFetchReactionsInterval(afterSetPromise),
        this.setFetchHistoryInterval({
          afterSetPromise,
          lastMsgId,
          samePeer,
          savedPosition,
          topMessage
        })
      ]).then(() => {
        log('scrolledAllDown:', scrollable.loadedAll.bottom);
        // if(!this.unreaded.length && dialog) { // lol
        if(scrollable.loadedAll.bottom && topMessage && !this.unreaded.size) { // lol
          this.onScrolledAllDown();
        }
      });

      if(chatType === 'chat' && !this.chat.isForumTopic) {
        const dialog = await m(this.managers.appMessagesManager.getDialogOnly(peerId));
        if(dialog?.pFlags.unread_mark) {
          this.managers.appMessagesManager.markDialogUnread(peerId, true);
        }
      }

      // this.chatInner.classList.remove('disable-hover', 'is-scrolling'); // warning, performance!
    }).catch((err) => {
      log.error('setPeer promise error:', err);
      if(!middleware()) {
        this.preloader.detach();
      }

      throw err;
    });

    return {cached, promise: setPeerPromise};
  }

  public playMediaWithTimestampAndMid({
    middleware,
    lastMsgId,
    mediaTimestamp
  }: {
    middleware: () => boolean,
    lastMsgId: number,
    mediaTimestamp: number
  }) {
    this.getMountedBubble(lastMsgId).then((mounted) => {
      if(!middleware() || !mounted) {
        return;
      }

      this.playMediaWithTimestamp(mounted.bubble, mediaTimestamp);
    });
  }

  public playMediaWithTimestamp(element: HTMLElement, timestamp: number) {
    const bubble = findUpClassName(element, 'bubble');
    const groupedItem = findUpClassName(element, 'grouped-item');
    const albumItemMid = groupedItem ? +groupedItem.dataset.mid : +bubble.dataset.textMid;
    let attachment = bubble.querySelector<HTMLElement>('.attachment');
    if(attachment) {
      if(albumItemMid) {
        attachment = attachment.querySelector(`[data-mid="${albumItemMid}"]`);
      }

      const media = attachment.querySelector<HTMLElement>('img, video, canvas');
      this.checkTargetForMediaViewer(media, undefined, timestamp);
      return;
    }

    const audio = (groupedItem || bubble).querySelector<AudioElement>('.audio');
    if(audio) {
      audio.playWithTimestamp(timestamp);
      return;
    }

    const replyToPeerId = bubble.dataset.replyToPeerId.toPeerId();
    const replyToMid = +bubble.dataset.replyToMid;
    if(replyToPeerId && replyToMid) {
      if(replyToPeerId === this.peerId) {
        this.chat.setMessageId(replyToMid, timestamp);
      } else {
        this.chat.appImManager.setInnerPeer({
          peerId: replyToPeerId,
          mediaTimestamp: timestamp
        });
      }
    }
  }

  private async setFetchReactionsInterval(afterSetPromise: Promise<any>) {
    const middleware = this.getMiddleware();
    const needReactionsInterval = this.chat.isChannel;
    if(needReactionsInterval) {
      const fetchReactions = async() => {
        if(!middleware()) return;

        const mids: number[] = [];
        for(const mid in this.bubbles) {
          let message = await this.chat.getMessage(+mid);
          if(message?._ !== 'message') {
            continue;
          }

          message = await this.managers.appMessagesManager.getGroupsFirstMessage(message);
          mids.push(message.mid);
        }

        const promise = mids.length ? this.managers.appReactionsManager.getMessagesReactions(this.peerId, mids) : Promise.resolve();
        promise.then(() => {
          setTimeout(fetchReactions, 10e3);
        });
      };

      Promise.all([afterSetPromise, getHeavyAnimationPromise(), pause(500)]).then(() => {
        fetchReactions();
      });
    }
  }

  private async setFetchHistoryInterval({
    lastMsgId,
    topMessage,
    afterSetPromise,
    savedPosition,
    samePeer
  }: {
    lastMsgId: number,
    topMessage: number,
    afterSetPromise: Promise<any>,
    savedPosition: ChatSavedPosition,
    samePeer: boolean
  }) {
    const peerId = this.peerId;
    if(peerId.isUser()) {
      return;
    }

    const middleware = this.getMiddleware();
    const needFetchInterval = await this.managers.appMessagesManager.isFetchIntervalNeeded(peerId);
    const needFetchNew = savedPosition || needFetchInterval;
    if(!needFetchNew) {
      return;
    }

    await afterSetPromise;
    if(!middleware()) {
      return;
    }

    const chatId = peerId.toChatId();
    middleware.onClean(() => {
      this.managers.apiUpdatesManager.unsubscribeFromChannelUpdates(chatId);
    });

    this.managers.apiUpdatesManager.subscribeToChannelUpdates(chatId);
    // return;

    // this.setLoaded('bottom', false);
    // this.scrollable.checkForTriggers();

    // if(!needFetchInterval) {
    //   return;
    // }

    // const f = () => {
    //   this.fetchNewPromise = new Promise<void>(async(resolve) => {
    //     if(!middleware() || !(await this.managers.appMessagesManager.isFetchIntervalNeeded(peerId))) {
    //       resolve();
    //       return;
    //     }

    //     this.managers.appMessagesManager.getNewHistory(peerId, this.chat.threadId).then((result) => {
    //       if(!middleware() || !result) {
    //         resolve();
    //         return;
    //       }

    //       const {isBottomEnd} = result;
    //       if(this.scrollable.loadedAll.bottom && this.scrollable.loadedAll.bottom !== isBottomEnd) {
    //         this.setLoaded('bottom', isBottomEnd);
    //         this.onScroll();
    //       }

    //       setTimeout(f, 30e3);
    //       resolve();
    //     });
    //   }).finally(() => {
    //     this.fetchNewPromise = undefined;
    //   });
    // };

    // if(samePeer) {
    //   setTimeout(f, 30e3);
    // } else {
    //   f();
    // }
  }

  public async onScrolledAllDown() {
    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      const historyMaxId = await this.chat.getHistoryMaxId();
      this.managers.appMessagesManager.readHistory(this.peerId, historyMaxId, this.chat.threadId, true);
    }
  }

  public async finishPeerChange() {
    const [isChannel, canWrite, isAnyGroup] = await Promise.all([
      this.chat.isChannel,
      this.chat.canSend(),
      this.chat.isAnyGroup
    ]);

    return () => {
      this.chatInner.classList.toggle('has-rights', canWrite);
      this.container.classList.toggle('is-chat-input-hidden', !canWrite);

      this.chatInner.classList.toggle('is-chat', isAnyGroup);
      this.chatInner.classList.toggle('is-channel', isChannel);

      this.createResizeObserver();
    };
  }

  private processBatch = async(...args: Parameters<ChatBubbles['batchProcessor']['process']>) => {
    let [loadQueue, m, log] = args;

    const filterQueue = (queue: typeof loadQueue) => {
      return queue.filter((details) => {
        // message can be deleted during rendering
        return details && this.bubbles[details.bubble.dataset.mid] === details.bubble;
      });
    };

    loadQueue = filterQueue(loadQueue);

    log('messages rendered');

    const {firstGroup, lastGroup} = this.bubbleGroups;
    const firstMid = firstGroup?.firstMid;
    const lastMid = lastGroup?.lastMid;

    const {groups, avatarPromises} = this.groupBubbles(loadQueue.filter((details) => details.updatePosition));

    const {firstGroup: newFirstGroup, lastGroup: newLastGroup} = this.bubbleGroups;
    const newFirstMid = newFirstGroup?.firstMid;
    const newLastMid = newLastGroup?.lastMid;
    const changedTop = firstMid !== newFirstMid;
    const changedBottom = lastMid !== newLastMid;

    // const reverse = loadQueue[0]?.reverse;
    const reverse = changedTop && !changedBottom;

    log('changed ends', changedTop, changedBottom);

    // if(groups.length > 2 && loadQueue.length === 1) {
    //   debugger;
    // }

    const promises = loadQueue.reduce((acc, details) => {
      const perf = performance.now();

      const promises = details.promises.slice();
      const timePromises = promises.map(async(promise) => (await promise, performance.now() - perf));
      Promise.all(timePromises).then((times) => {
        log.groupCollapsed('media message time', performance.now() - perf, details, times);
        times.forEach((time, idx) => {
          log('media message time', time, idx, promises[idx]);
        });
        log.groupEnd();
      });

      // if(details.updatePosition) {
      //   if(res) {
      //     groups.add(res.group);
      //     if(details.needAvatar) {
      //       details.promises.push(res.group.createAvatar(details.message));
      //     }
      //   }
      // }

      acc.push(...details.promises);
      return acc;
    }, [] as Promise<any>[]);

    promises.push(...avatarPromises);
    // promises.push(pause(200));

    // * это нужно для того, чтобы если захочет подгрузить reply или какое-либо сообщение, то скролл не прервался
    // * если добавить этот промис - в таком случае нужно сделать, чтобы скроллило к последнему сообщению после рендера
    // promises.push(getHeavyAnimationPromise());

    log('media promises to call', promises, loadQueue, this.isHeavyAnimationInProgress);
    await m(Promise.all([...promises, this.setUnreadDelimiter()]).catch(noop)); // не нашёл места лучше
    await m(fastRafPromise()); // have to be the last
    log('media promises end');

    loadQueue = filterQueue(loadQueue);

    const {restoreScroll, scrollSaver} = this.prepareToSaveScroll(
      reverse,
      firstMid === newFirstMid,
      lastMid === newLastMid
    );
    // if(this.messagesQueueOnRender) {
    // this.messagesQueueOnRender();
    // }

    this.messagesQueueOnRenderAdditional?.();

    this.ejectBubbles();
    for(const [bubble, oldBubble] of this.bubblesToReplace) {
      if(scrollSaver) {
        scrollSaver.replaceSaved(oldBubble, bubble);
      }

      if(!loadQueue.find((details) => details.bubble === bubble)) {
        continue;
      }

      const item = this.bubbleGroups.getItemByBubble(bubble);
      if(!item) {
        this.log.error('NO ITEM BY BUBBLE', bubble);
      } else {
        item.mounted = false;
        if(!groups.includes(item.group)) {
          groups.push(item.group);
        }
      }

      this.bubblesToReplace.delete(bubble);
    }

    if(this.chat.selection.isSelecting) {
      loadQueue.forEach(({bubble}) => {
        this.chat.selection.toggleElementCheckbox(bubble, true);
      });
    }

    loadQueue.forEach(({message, bubble, updatePosition}) => {
      if(message.pFlags.local && updatePosition) {
        this.chatInner[(message as Message.message).pFlags.sponsored ? 'append' : 'prepend'](bubble);
        return;
      }
    });

    this.bubbleGroups.mountUnmountGroups(groups);
    // this.bubbleGroups.findIncorrentPositions();

    this.updatePlaceholderPosition?.();

    restoreScroll?.();

    m(pause(!this.chat.setPeerPromise ? 0 : 1000))
    .then(() => m(getHeavyAnimationPromise()))
    .then(() => {
      this.lazyLoadQueue.setAllSeen();
    }).catch(noop);

    // this.setStickyDateManually();
  };

  public renderMessagesQueue(options: ReturnType<ChatBubbles['safeRenderMessage']>) {
    return this.batchProcessor.addToQueue(options);
  }

  private ejectBubbles() {
    for(const bubble of this.bubblesToEject) {
      bubble.remove();
      // this.bubbleGroups.removeAndUnmountBubble(bubble);
    }

    this.bubblesToEject.clear();
  }

  public groupBubbles(items: Array<{
    // Awaited<ReturnType<ChatBubbles['safeRenderMessage']>> &
    bubble: HTMLElement,
    message: Message.message | Message.messageService
  }/*  & {
    unmountIfFound?: boolean
  } */>) {
    let modifiedGroups: typeof groups;

    if(this.chat.type === 'scheduled') {
      modifiedGroups = new Set();
      items.forEach(({bubble, message}) => {
        const item = this.bubbleGroups.getItemByBubble(bubble);
        const group = item?.group;
        if(group && item.message.date !== message.date) {
          this.bubbleGroups.removeItem(item);
          modifiedGroups.add(group);
        }
      });
    }

    items.forEach(({bubble, message}) => {
      this.bubbleGroups.prepareForGrouping(bubble, message);
    });

    const groups = this.bubbleGroups.groupUngrouped();

    const avatarPromises = Array.from(groups).map((group) => {
      if(group.avatar) return;
      const firstItem = group.firstItem;
      if(firstItem && this.chat.isAvatarNeeded(firstItem.message)) {
        return group.createAvatar(firstItem.message);
      }
    }).filter(Boolean);

    if(modifiedGroups) {
      for(const group of modifiedGroups) {
        groups.add(group);
      }
    }

    return {
      groups: [...groups],
      avatarPromises
    };
  }

  public getMiddleware(additionalCallback?: () => boolean) {
    return this.middlewareHelper.get(additionalCallback);
  }

  private async wrapMediaSpoiler({
    media,
    promise,
    middleware,
    attachmentDiv
  }: {
    media: Photo.photo | MyDocument,
    promise: Promise<any>,
    middleware: Middleware,
    attachmentDiv: HTMLElement
  }) {
    await promise;
    if(!middleware()) {
      return;
    }

    const {width, height} = attachmentDiv.style;
    const container = await wrapMediaSpoiler({
      media,
      width: parseInt(width),
      height: parseInt(height),
      middleware,
      animationGroup: this.chat.animationGroup
    });

    if(!middleware()) {
      return;
    }

    attachmentDiv.append(container);
  }

  private async safeRenderMessage(
    message: Message.message | Message.messageService,
    reverse?: boolean,
    bubble?: HTMLElement,
    updatePosition = true,
    processResult?: (result: ReturnType<ChatBubbles['renderMessage']>, bubble: HTMLElement) => typeof result
  ) {
    if(!message || this.renderingMessages.has(message.mid) || (this.bubbles[message.mid] && !bubble)) {
      return;
    }

    const middlewareHelper = this.getMiddleware().create();
    const middleware = middlewareHelper.get();

    let result: Awaited<ReturnType<ChatBubbles['renderMessage']>> & {updatePosition: typeof updatePosition};
    try {
      this.renderingMessages.add(message.mid);

      // const groupedId = (message as Message.message).grouped_id;
      const newBubble = document.createElement('div');
      newBubble.middlewareHelper = middlewareHelper;
      newBubble.dataset.mid = '' + message.mid;
      newBubble.dataset.peerId = '' + message.peerId;
      newBubble.dataset.timestamp = '' + message.date;

      // const bubbleNew: Bubble = this.bubblesNew[message.mid] ??= {
      //   bubble: newBubble,
      //   mids: new Set(),
      //   groupedId
      // };

      // bubbleNew.mids.add(message.mid);

      if(bubble) {
        bubble.middlewareHelper.destroy();
        this.skippedMids.delete(message.mid);

        this.bubblesToEject.add(bubble);
        this.bubblesToReplace.delete(bubble);
        this.bubblesToReplace.set(newBubble, bubble);
        this.bubbleGroups.changeBubbleByBubble(bubble, newBubble);
      }

      bubble = this.bubbles[message.mid] = newBubble;
      let originalPromise = this.renderMessage(message, reverse, bubble, middleware);
      if(processResult) {
        originalPromise = processResult(originalPromise, bubble);
      }

      const promise = originalPromise.then((r) => ((r && middleware() ? {...r, updatePosition} : undefined) as typeof result));

      this.renderMessagesQueue(promise.catch(() => undefined));

      result = await promise;
      if(!middleware()) {
        return;
      }

      if(!result) {
        this.skippedMids.add(+message.mid);
      }
    } catch(err) {
      this.log.error('renderMessage error:', err);
    }

    if(!middleware()) {
      return;
    }

    this.renderingMessages.delete(message.mid);
    return result;
  }

  public wrapKeyboardButton({
    button,
    message,
    noTextInject,
    replyMarkup
  }: {
    button: KeyboardButton,
    message?: Message.message,
    replyMarkup?: ReplyMarkup,
    noTextInject?: boolean
  }) {
    let text: DocumentFragment | HTMLElement = wrapRichText(button.text, {noLinks: true, noLinebreaks: true});
    let buttonEl: HTMLButtonElement | HTMLAnchorElement;
    let onClick: (e: Event) => void;

    const {peerId} = this;
    const messageMedia = message?.media;
    const messageMid = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.mid || message?.mid;
    const botId = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.fromId || message?.viaBotId || message?.fromId;

    switch(button._) {
      case 'keyboardButtonUrl': {
        const r = wrapRichText(' ', {
          entities: [{
            _: 'messageEntityTextUrl',
            length: 1,
            offset: 0,
            url: button.url
          }]
        });

        buttonEl = htmlToDocumentFragment(r).firstElementChild as HTMLAnchorElement;
        buttonEl.classList.add('is-link');

        break;
      }

      case 'keyboardButtonSwitchInline': {
        buttonEl = document.createElement('button');
        buttonEl.classList.add('is-switch-inline');
        onClick = (e) => {
          cancelEvent(e);

          let promise: Promise<PeerId>;
          if(button.pFlags.same_peer) promise = Promise.resolve(peerId);
          else promise = this.managers.appInlineBotsManager.checkSwitchReturn(botId).then((peerId) => {
            if(peerId) {
              return peerId;
            }

            let types: TelegramChoosePeerType[];
            if(button.peer_types) {
              const map: {[type in InlineQueryPeerType['_']]?: TelegramChoosePeerType} = {
                inlineQueryPeerTypePM: 'users',
                inlineQueryPeerTypeBotPM: 'bots',
                inlineQueryPeerTypeBroadcast: 'channels',
                inlineQueryPeerTypeChat: 'groups',
                inlineQueryPeerTypeMegagroup: 'groups'
              };

              types = button.peer_types.map((type) => map[type._]);
            }

            return PopupPickUser.createPicker(types, ['send_inline']);
          });

          promise.then(async(chosenPeerId) => {
            const threadId = peerId === chosenPeerId ? this.chat.threadId : undefined;
            await this.chat.appImManager.setInnerPeer({peerId: chosenPeerId, threadId});
            this.managers.appInlineBotsManager.switchInlineQuery(chosenPeerId, threadId, botId, button.query);
          });
        };
        break;
      }

      case 'keyboardButtonBuy': {
        const mediaInvoice = messageMedia._ === 'messageMediaInvoice' ? messageMedia : undefined;
        if(mediaInvoice?.extended_media) {
          break;
        }

        buttonEl = document.createElement('button');
        buttonEl.classList.add('is-buy');

        if(mediaInvoice?.receipt_msg_id) {
          text = i18n('Message.ReplyActionButtonShowReceipt');
        }

        break;
      }

      case 'keyboardButtonUrlAuth': {
        buttonEl = document.createElement('button');
        buttonEl.classList.add('is-url-auth');

        const {url, button_id} = button;

        onClick = () => {
          const toggle = toggleDisability([buttonEl], true);
          this.chat.appImManager.handleUrlAuth({
            peerId,
            mid: messageMid,
            url,
            buttonId: button_id
          }).then(() => {
            toggle();
          });
        };
        break;
      }

      case 'keyboardButtonSimpleWebView':
      case 'keyboardButtonWebView': {
        buttonEl = document.createElement('button');
        buttonEl.classList.add('is-web-view');

        onClick = async() => {
          await this.chat.appImManager.confirmBotWebView(botId);

          const toggle = toggleDisability([buttonEl], true);
          this.chat.openWebApp({
            botId,
            url: button.url,
            isSimpleWebView: button._ === 'keyboardButtonSimpleWebView',
            buttonText: button.text
          }).then(() => {
            toggle();
          });
        };
        break;
      }

      case 'keyboardButtonRequestPhone': {
        buttonEl = document.createElement('button');
        buttonEl.classList.add('is-request-phone');

        onClick = () => {
          confirmationPopup({
            titleLangKey: 'ShareYouPhoneNumberTitle',
            button: {
              langKey: 'OK'
            },
            descriptionLangKey: 'AreYouSureShareMyContactInfoBot'
          }).then(() => {
            this.managers.appMessagesManager.sendContact(peerId, rootScope.myId);
          });
        };
        break;
      }

      case 'keyboardButtonCallback': {
        buttonEl = document.createElement('button');
        onClick = () => {
          this.managers.appInlineBotsManager.callbackButtonClick(peerId, messageMid, button)
          .then((callbackAnswer) => {
            if(typeof callbackAnswer.message === 'string' && callbackAnswer.message.length) {
              toast(wrapRichText(callbackAnswer.message, {noLinks: true, noLinebreaks: true}));
            }
          });
        };

        break;
      }

      case 'keyboardButtonRequestPeer': {
        buttonEl = document.createElement('button');
        onClick = async() => {
          let filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'];
          const peerType = button.peer_type;

          const isRequestingUser = peerType._ === 'requestPeerTypeUser';
          const isRequestingChannel = peerType._ === 'requestPeerTypeBroadcast';
          const isRequestingGroup = peerType._ === 'requestPeerTypeChat';

          const _peerType: SelectSearchPeerType[] = ['dialogs'];
          if(isRequestingUser) {
            filterPeerTypeBy = (peer) => {
              if(peer._ !== 'user') {
                return false;
              }

              if(peerType.bot !== undefined && peerType.bot !== !!peer.pFlags.bot) {
                return false;
              }

              if(peerType.premium !== undefined && peerType.premium !== !!peer.pFlags.premium) {
                return false;
              }

              return true;
            };

            _peerType.push('contacts');
          } else {
            let commonChatIds: ChatId[];
            if(isRequestingGroup) {
              const messagesChats = await this.managers.appUsersManager.getCommonChats(peerId, 100);
              commonChatIds = messagesChats.chats.map((chat) => chat.id);
            }

            filterPeerTypeBy = (peer) => {
              if(peer._ !== 'channel' && (isRequestingChannel ? true : peer._ !== 'chat')) {
                return false;
              }

              if(!!(peer as MTChat.channel).pFlags.broadcast !== isRequestingChannel) {
                return false;
              }

              if(peerType.pFlags.creator && !(peer as MTChat.chat).pFlags.creator) {
                return false;
              }

              if(peerType.has_username !== undefined && !!getPeerActiveUsernames(peer)[0] !== !!peerType.has_username) {
                return false;
              }

              if((peerType as RequestPeerType.requestPeerTypeChat).forum !== undefined &&
                (peerType as RequestPeerType.requestPeerTypeChat).forum !== !!(peer as MTChat.channel).pFlags.forum) {
                return false;
              }

              if(peerType.user_admin_rights) {
                for(const action in peerType.user_admin_rights.pFlags) {
                  if(!hasRights(peer as MTChat.channel, action as ChatRights)) {
                    return false;
                  }
                }
              }

              if((peerType as RequestPeerType.requestPeerTypeChat).pFlags.bot_participant) {
                if(!commonChatIds.includes(peer.id) && !hasRights(peer as MTChat.chat, 'invite_users')) {
                  return false;
                }
              }

              // don't have bot's rights in particular channel
              // const botAdminRights = peerType.bot_admin_rights;
              // if(botAdminRights) {
              //   for(const action in botAdminRights.pFlags) {
              //     if(!hasRights(peer, action as ChatRights, botAdminRights)) {
              //       return false;
              //     }
              //   }
              // }

              return true;
            };
          }

          const requestedPeerId = await PopupPickUser.createPicker2({
            peerType: _peerType,
            filterPeerTypeBy
          });

          if(!isRequestingUser) {
            const descriptionLangArgs: Parameters<typeof confirmationPopup>[0]['descriptionLangArgs'] = [
              await wrapPeerTitle({peerId: requestedPeerId}),
              await wrapPeerTitle({peerId})
            ];

            const descriptionLangKey: Parameters<typeof confirmationPopup>[0]['descriptionLangKey'] = 'Chat.Service.PeerRequest.Confirm.Plain';

            // if(peerType.bot_admin_rights) {
            //   descriptionLangKey = 'Chat.Service.PeerRequest.Confirm.Permission';
            //   descriptionLangArgs.push(
            //     await wrapPeerTitle({peerId}),
            //     await wrapPeerTitle({peerId: requestedPeerId})
            //   );
            // }

            await confirmationPopup({
              descriptionLangKey,
              descriptionLangArgs,
              button: {
                langKey: 'Chat.Service.PeerRequest.Confirm.Ok'
              }
            });
          }

          this.managers.appMessagesManager.sendBotRequestedPeer(
            peerId,
            messageMid,
            button.button_id,
            requestedPeerId
          ).catch((err: ApiError) => {
            if(err.type === 'CHAT_ADMIN_INVITE_REQUIRED') {
              toastNew({
                langPackKey: isRequestingChannel ? 'Error.RequestPeer.NoRights.Channel' : 'Error.RequestPeer.NoRights.Group'
              });
            }
          });
        };

        break;
      }

      default: {
        buttonEl = document.createElement('button');

        if(!message) {
          onClick = () => {
            this.managers.appMessagesManager.sendText(peerId, button.text);
          };
        }

        break;
      }
    }

    if(!noTextInject) {
      buttonEl?.append(text);
    }

    return {text, buttonEl, onClick};
  }

  // reverse means top
  private async renderMessage(
    message: Message.message | Message.messageService,
    reverse = false,
    bubble: HTMLElement,
    middleware: Middleware
  ) {
    // if(DEBUG) {
    //   this.log('message to render:', message);
    // }

    // if(!bubble && this.bubbles[message.mid]) {
    //   return;
    // }

    // await pause(1000);

    const isMessage = message._ === 'message';
    const groupedId = isMessage && message.grouped_id;
    let albumMids: number[], reactionsMessage: Message.message;
    const albumMessages = groupedId ? await this.managers.appMessagesManager.getMessagesByAlbum(groupedId) : undefined;

    const albumMustBeRenderedFull = this.chat.type !== 'pinned';

    if(groupedId && albumMustBeRenderedFull) { // will render only last album's message
      albumMids = albumMessages.map((message) => message.mid);
      const mainMid = getMainMidForGrouped(albumMids);
      if(message.mid !== mainMid) {
        return;
      }
    }

    if(isMessage) {
      reactionsMessage = groupedId ? albumMessages[0] : message;
    }

    // * can't use 'message.pFlags.out' here because this check will be used to define side of message (left-right)
    const our = this.chat.isOurMessage(message);

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'spoilers-container');

    const contentWrapper = document.createElement('div');
    contentWrapper.classList.add('bubble-content-wrapper');

    const bubbleContainer = document.createElement('div');
    bubbleContainer.classList.add('bubble-content');

    bubble.classList.add('bubble');
    contentWrapper.append(bubbleContainer);
    bubble.append(contentWrapper);

    let isInUnread = !our &&
      !message.pFlags.out &&
      (
        message.pFlags.unread ||
        isMentionUnread(message)
      );

    if(!isInUnread && this.chat.peerId.isAnyChat()) {
      const readMaxId = await this.managers.appMessagesManager.getReadMaxIdIfUnread(this.chat.peerId, this.chat.threadId);
      if(readMaxId !== undefined && readMaxId < message.mid) {
        isInUnread = true;
      }
    }

    if(isInUnread && this.observer) {
      // this.log('not our message', message, message.pFlags.unread);
      this.observer.observe(bubble, this.unreadedObserverCallback);
      this.unreaded.set(bubble, message.mid);
    }

    const loadPromises: Promise<any>[] = [];
    const ret = {
      bubble,
      promises: loadPromises,
      message,
      reverse
    };

    const wrapOptions: WrapSomethingOptions = {
      lazyLoadQueue: this.lazyLoadQueue,
      middleware,
      customEmojiSize: this.chat.appImManager.customEmojiSize,
      animationGroup: this.chat.animationGroup
    };

    if(message._ === 'messageService' && (!message.action || !SERVICE_AS_REGULAR.has(message.action._))) {
      const action = message.action;
      if(action) {
        const _ = action._;

        const ignoreAction = IGNORE_ACTIONS.get(_);
        if(ignoreAction && (ignoreAction === true || ignoreAction(message))) {
          return;
        }

        if(langPack.hasOwnProperty(_) && !langPack[_]) {
          return;
        }
      }

      bubble.className = 'bubble service';

      bubbleContainer.replaceChildren();
      const s = document.createElement('div');
      s.classList.add('service-msg');
      if(action) {
        let promise: Promise<any>;
        if(action._ === 'messageActionChannelMigrateFrom') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.chat_id.toPeerId(true), wrapOptions});
          s.append(i18n('ChatMigration.From', [peerTitle.element]));
        } else if(action._ === 'messageActionChatMigrateTo') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.channel_id.toPeerId(true), wrapOptions});
          s.append(i18n('ChatMigration.To', [peerTitle.element]));
        } else {
          promise = wrapMessageActionTextNew({
            message,
            ...wrapOptions
          }).then((el) => s.append(el));
        }

        if(action._ === 'messageActionGiftPremium') {
          const content = bubbleContainer.cloneNode(false) as HTMLElement;
          content.classList.add('bubble-premium-gift-container');
          content.style.height = '12.875rem';
          content.style.width = '12.5rem';

          const service = s.cloneNode(false) as HTMLElement;
          service.classList.add('bubble-premium-gift-wrapper');

          const size = 160;

          const months = action.months;

          const durationAssetMap: {[key: number]: LottieAssetName} = {
            3: 'Gift3',
            6: 'Gift6',
            12: 'Gift12'
          };

          const assetName = durationAssetMap[clamp(months, 3, 12)];

          const promise = wrapLocalSticker({
            width: size,
            height: size,
            assetName,
            middleware,
            loop: false,
            autoplay: liteMode.isAvailable('stickers_chat')
          }).then(({container, promise}) => {
            container.classList.add('bubble-premium-gift-sticker');
            container.style.position = 'relative';
            container.style.width = container.style.height = size + 'px';
            service.prepend(container);
            return promise;
          });

          const isYears = months >= 12 && !(months % 12);
          const duration = i18n(isYears ? 'Years' : 'Months', [isYears ? months / 12 : months]);

          const title = i18n('ActionGiftPremiumTitle');
          const subtitle = i18n('ActionGiftPremiumSubtitle', [duration]);
          title.classList.add('text-bold');

          service.append(title, subtitle);
          loadPromises.push(promise);

          content.append(service);
          bubbleContainer.after(content);
        }

        loadPromises.push(promise);
      }
      bubbleContainer.append(s);

      if(message.pFlags.is_single) { // * Ignore 'Discussion started'
        bubble.classList.add('is-group-last');
      }

      return ret;
    }

    let messageMedia: MessageMedia = isMessage && message.media;
    let needToSetHTML = true;
    let messageMessage: string, totalEntities: MessageEntity[], albumTextMessage: Message.message;
    if(isMessage) {
      if(groupedId && albumMustBeRenderedFull) {
        const t = albumTextMessage = getAlbumText(albumMessages);
        messageMessage = t?.message || '';
        // totalEntities = t.entities;
        totalEntities = t?.totalEntities || [];
      } else {
        messageMessage = message.message;
        // totalEntities = message.entities;
        totalEntities = message.totalEntities;
      }

      const document = (messageMedia as MessageMedia.messageMediaDocument)?.document as MyDocument;
      if(document) {
        if(document?.type === 'sticker') {
          messageMessage = totalEntities = undefined;
        } else if(!['video', 'gif'].includes(document.type)) {
          needToSetHTML = false;
        }
      }
    } else {
      if(message.action._ === 'messageActionPhoneCall') {
        messageMedia = {
          _: 'messageMediaCall',
          action: message.action
        };
      }
    }

    let bigEmojis = 0, customEmojiSize: MediaSize;
    if(totalEntities && !messageMedia) {
      const emojiEntities = totalEntities.filter((e) => e._ === 'messageEntityEmoji'/*  || e._ === 'messageEntityCustomEmoji' */);
      const strLength = messageMessage.replace(/\s/g, '').length;
      const emojiStrLength = emojiEntities.reduce((acc, curr) => acc + curr.length, 0);

      if(emojiStrLength === strLength /* && emojiEntities.length <= 3 *//*  && totalEntities.length === emojiEntities.length */) {
        bigEmojis = Math.min(BIG_EMOJI_SIZES_LENGTH, emojiEntities.length);

        customEmojiSize = mediaSizes.active.customEmoji;

        const size = BIG_EMOJI_SIZES[bigEmojis];
        if(size) {
          customEmojiSize = makeMediaSize(size, size);
          bubble.style.setProperty('--emoji-size', size + 'px');
        }
      }
    }

    customEmojiSize ??= this.chat.appImManager.customEmojiSize;

    let maxMediaTimestamp = getMediaDurationFromMessage(albumTextMessage || message as Message.message);
    if(albumTextMessage && needToSetHTML) {
      bubble.dataset.textMid = '' + albumTextMessage.mid;
    }

    if(message.reply_to) {
      const replyToPeerId = message.reply_to.reply_to_peer_id ? getPeerId(message.reply_to.reply_to_peer_id) : this.peerId;
      bubble.dataset.replyToPeerId = '' + replyToPeerId;
      bubble.dataset.replyToMid = '' + message.reply_to_mid;

      if(maxMediaTimestamp === undefined) {
        const originalMessage = await rootScope.managers.appMessagesManager.getMessageByPeer(replyToPeerId, message.reply_to_mid);
        if(originalMessage) {
          maxMediaTimestamp = getMediaDurationFromMessage(originalMessage as Message.message);
        } else {
          // this.managers.appMessagesManager.fetchMessageReplyTo(message);
          // this.needUpdate.push({replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid});
          maxMediaTimestamp = Infinity;
        }
      }
    }

    const richTextOptions: Parameters<typeof wrapRichText>[1] = {
      entities: totalEntities,
      passEntities: this.passEntities,
      loadPromises,
      lazyLoadQueue: this.lazyLoadQueue,
      customEmojiSize,
      middleware,
      animationGroup: this.chat.animationGroup,
      maxMediaTimestamp,
      textColor: 'primary-text-color'
    };

    const richText = messageMessage ? wrapRichText(messageMessage, richTextOptions) : undefined;

    let canHaveTail = true;
    let isStandaloneMedia = false;
    let attachmentDiv: HTMLElement;
    if(bigEmojis) {
      if(rootScope.settings.emoji.big) {
        const sticker = bigEmojis === 1 &&
          !totalEntities.find((entity) => entity._ === 'messageEntityCustomEmoji') &&
          await this.managers.appStickersManager.getAnimatedEmojiSticker(messageMessage);
        if(bigEmojis === 1 && !messageMedia && sticker) {
          messageMedia = {
            _: 'messageMediaDocument',
            document: sticker,
            pFlags: {}
          };
        } else {
          attachmentDiv = document.createElement('div');
          attachmentDiv.classList.add('attachment', 'spoilers-container');

          setInnerHTML(attachmentDiv, richText);

          bubbleContainer.append(attachmentDiv);
        }

        bubble.classList.add('is-message-empty', 'emoji-big');
        isStandaloneMedia = true;
        canHaveTail = false;
        needToSetHTML = false;
      }

      bubble.classList.add('can-have-big-emoji');
    }

    if(needToSetHTML) {
      setInnerHTML(messageDiv, richText);
    }

    const haveRTLChar = isRTL(messageMessage, true);

    const timeSpan = MessageRender.setTime({
      chatType: this.chat.type,
      message,
      reactionsMessage
    });
    messageDiv.append(timeSpan);
    bubbleContainer.prepend(messageDiv);
    // bubble.prepend(timeSpan, messageDiv); // that's bad

    if(haveRTLChar) {
      timeSpan.classList.add('is-block');
    }

    let topicNameButtonContainer: HTMLElement;
    if(isMessage && this.chat.isAllMessagesForum) {
      const result = await wrapTopicNameButton({
        peerId: this.peerId,
        threadId: getMessageThreadId(message, this.chat.isForum),
        lastMsgId: message.mid,
        wrapOptions: {
          middleware
        },
        withIcons: true
      });

      const {element} = result;
      // if(isStandaloneMedia) {
      //   element.classList.add('floating-part');
      // }

      topicNameButtonContainer = document.createElement('div');
      topicNameButtonContainer.classList.add(/* 'name',  */'topic-name-button-container');
      topicNameButtonContainer.append(element);
    }

    if(isMessage && message.views) {
      bubble.classList.add('channel-post');

      if(!message.fwd_from?.saved_from_msg_id && this.chat.type !== 'pinned') {
        const forward = document.createElement('div');
        forward.classList.add('bubble-beside-button', 'forward', 'tgico-forward_filled');
        bubbleContainer.prepend(forward);
        bubble.classList.add('with-beside-button');
      }

      if(!message.pFlags.is_outgoing && this.observer) {
        this.observer.observe(bubble, this.viewsObserverCallback);
      }
    }

    const replyMarkup = isMessage && message.reply_markup;
    let replyMarkupRows = replyMarkup?._ === 'replyInlineMarkup' && replyMarkup.rows;
    if(replyMarkupRows) {
      replyMarkupRows = replyMarkupRows.filter((row) => row.buttons.length);
    }

    if(replyMarkupRows) {
      const containerDiv = document.createElement('div');
      containerDiv.classList.add('reply-markup');
      const onClickMap: Map<HTMLElement, (e: Event) => void> = new Map();
      replyMarkupRows.forEach((row) => {
        const buttons = row.buttons;

        const rowDiv = document.createElement('div');
        rowDiv.classList.add('reply-markup-row');

        buttons.forEach((button) => {
          const {text, buttonEl, onClick} = this.wrapKeyboardButton({
            button,
            message: message as Message.message,
            noTextInject: true
          });

          if(!buttonEl) {
            return;
          }

          if(onClick) {
            onClickMap.set(buttonEl, onClick);
          }

          buttonEl.classList.add('reply-markup-button', 'rp', 'tgico');
          const t = document.createElement('span');
          t.classList.add('reply-markup-button-text');
          t.append(text);

          ripple(buttonEl);
          buttonEl.append(t);

          rowDiv.append(buttonEl);
        });

        if(!rowDiv.childElementCount) {
          return;
        }

        containerDiv.append(rowDiv);
      });

      const haveButtons = !!containerDiv.childElementCount;

      haveButtons && attachClickEvent(containerDiv, (e) => {
        let target = e.target as HTMLElement;
        target = findUpClassName(target, 'reply-markup-button');
        const onClick = onClickMap.get(target);
        if(onClick) {
          onClick(e);
          cancelEvent(e);
        }
      });

      if(haveButtons) {
        // canHaveTail = false;
        bubble.classList.add('with-reply-markup');
        contentWrapper.append(containerDiv);
      }
    }

    const isOutgoing = message.pFlags.is_outgoing/*  && this.peerId !== rootScope.myId */;
    if(our) {
      if(message.pFlags.unread || isOutgoing) this.unreadOut.add(message.mid);
      let status = '';
      if(message.error) status = 'is-error';
      else if(isOutgoing) status = 'is-sending';
      else status = message.pFlags.unread || (message as Message.message).pFlags.is_scheduled ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    }

    if(isOutgoing && !message.error) {
      bubble.classList.add('is-outgoing');
    }

    const messageWithReplies = isMessage && await this.managers.appMessagesManager.getMessageWithCommentReplies(message);
    const withReplies = !!messageWithReplies && message.mid > 0;

    if(withReplies) {
      bubble.classList.add('with-replies');
    }

    const fwdFrom = isMessage && message.fwd_from;
    const fwdFromId = isMessage && message.fwdFromId;

    const isOut = this.chat.isOutMessage(message);
    let nameContainer: HTMLElement = bubbleContainer;

    const canHideNameIfMedia = !message.viaBotId && (message.fromId === rootScope.myId || !message.pFlags.out);

    const isMessageEmpty = !messageMessage/*  && (!topicNameButtonContainer || isStandaloneMedia) */;

    let viewButton: HTMLAnchorElement;
    // media
    if(messageMedia/*  && messageMedia._ === 'messageMediaPhoto' */) {
      attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');

      if(isMessageEmpty) {
        bubble.classList.add('is-message-empty');
      }

      let processingWebPage = false;

      /* if(isMessage)  */switch(messageMedia._) {
        case 'messageMediaPhotoExternal':
        case 'messageMediaPhoto': {
          const photo = messageMedia.photo;

          if(isMessageEmpty) {
            canHaveTail = false;
          }

          if(canHideNameIfMedia) {
            bubble.classList.add('hide-name');
          }

          bubble.classList.add('photo');

          if(albumMustBeRenderedFull && groupedId && albumMids.length !== 1) {
            bubble.classList.add('is-album', 'is-grouped');
            wrapAlbum({
              messages: albumMessages,
              attachmentDiv,
              middleware: this.getMiddleware(),
              isOut: our,
              lazyLoadQueue: this.lazyLoadQueue,
              chat: this.chat,
              loadPromises,
              autoDownload: this.chat.autoDownload
            });

            break;
          }

          const withTail = !IS_ANDROID && canHaveTail && !withReplies && USE_MEDIA_TAILS;
          if(withTail) bubble.classList.add('with-media-tail');
          const p = wrapPhoto({
            photo: photo as Photo.photo,
            message,
            container: attachmentDiv,
            withTail,
            isOut,
            lazyLoadQueue: this.lazyLoadQueue,
            middleware: this.getMiddleware(),
            loadPromises,
            autoDownloadSize: this.chat.autoDownload.photo
          });

          if((messageMedia as MessageMedia.messageMediaPhoto).pFlags?.spoiler) {
            loadPromises.push(this.wrapMediaSpoiler({
              media: photo as Photo.photo,
              promise: p,
              middleware,
              attachmentDiv
            }));
          }

          break;
        }

        case 'messageMediaWebPage': {
          processingWebPage = true;

          const webPage: WebPage = messageMedia.webpage;
          if(webPage._ !== 'webPage') {
            break;
          }

          const wrapped = wrapUrl(webPage.url);
          const SAFE_TYPES: Set<typeof wrapped['onclick']> = new Set(['im', 'addlist']);
          if(SAFE_TYPES.has(wrapped?.onclick)) {
            const map: {[type: string]: LangPackKey} = {
              telegram_channel: 'Chat.Message.ViewChannel',
              telegram_megagroup: 'OpenGroup',
              telegram_bot: 'Chat.Message.ViewBot',
              telegram_botapp: 'Chat.Message.ViewApp',
              telegram_user: 'Chat.Message.SendMessage',
              telegram_chatlist: 'OpenChatlist'
            };

            const langPackKey = map[webPage.type] || 'OpenMessage';
            viewButton = this.makeViewButton({text: langPackKey, asLink: true});
            viewButton.href = wrapped.url;
            viewButton.setAttribute('onclick', `${wrapped.onclick}(this)`);
            viewButton.setAttribute('safe', '');
          }

          bubble.classList.add('webpage');

          const box = document.createElement('div');
          box.classList.add('web');

          const quote = document.createElement('div');
          quote.classList.add('quote');

          let previewResizer: HTMLDivElement, preview: HTMLDivElement;
          const photo: Photo.photo = webPage.photo as any;
          if(photo || webPage.document) {
            previewResizer = document.createElement('div');
            previewResizer.classList.add('preview-resizer');
            preview = document.createElement('div');
            preview.classList.add('preview');
            previewResizer.append(preview);
          }

          const quoteTextDiv = document.createElement('div');
          quoteTextDiv.classList.add('quote-text');

          const doc = webPage.document as MyDocument;
          if(doc) {
            if(doc.type === 'gif' || doc.type === 'video' || doc.type === 'round') {
              // if(doc.size <= 20e6) {
              const mediaSize = doc.type === 'round' ? mediaSizes.active.round : mediaSizes.active.webpage;
              if(doc.type === 'round') {
                bubble.classList.add('round');
                preview.classList.add('is-round');
              } else {
                bubble.classList.add('video');
              }
              wrapVideo({
                doc,
                container: preview,
                message: message as Message.message,
                boxWidth: mediaSize.width,
                boxHeight: mediaSize.height,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: this.getMiddleware(),
                isOut,
                group: this.chat.animationGroup,
                loadPromises,
                autoDownload: this.chat.autoDownload,
                noInfo: message.mid < 0
              });
              // }
            } else {
              const docDiv = await wrapDocument({
                message: message as Message.message,
                autoDownloadSize: this.chat.autoDownload.file,
                lazyLoadQueue: this.lazyLoadQueue,
                loadPromises,
                sizeType: 'documentName',
                searchContext: {
                  useSearch: false,
                  peerId: this.peerId,
                  inputFilter: {
                    _: 'inputMessagesFilterEmpty'
                  }
                },
                fontSize: rootScope.settings.messagesTextSize,
                canTranscribeVoice: true
              });
              preview.append(docDiv);
              preview.classList.add('preview-with-document');
              quoteTextDiv.classList.add('has-document');
              // messageDiv.classList.add((webpage.type || 'document') + '-message');
              // doc = null;
            }
          }

          if(previewResizer) {
            quoteTextDiv.append(previewResizer);
          }

          let t: HTMLElement;
          if(webPage.site_name) {
            const html = wrapRichText(webPage.url);
            const a: HTMLAnchorElement = htmlToDocumentFragment(html).firstElementChild as any;
            a.classList.add('webpage-name');
            const strong = document.createElement('strong');
            setInnerHTML(strong, wrapEmojiText(webPage.site_name));
            a.textContent = '';
            a.append(strong);
            quoteTextDiv.append(a);
            t = a;
          }

          const title = wrapWebPageTitle(webPage);
          if(title.textContent) {
            const titleDiv = document.createElement('div');
            titleDiv.classList.add('title');
            const strong = document.createElement('strong');
            setInnerHTML(strong, title);
            titleDiv.append(strong);
            quoteTextDiv.append(titleDiv);
            t = titleDiv;
          }

          const description = wrapWebPageDescription(webPage);
          if(description.textContent) {
            const textDiv = document.createElement('div');
            textDiv.classList.add('text');
            setInnerHTML(textDiv, description);
            quoteTextDiv.append(textDiv);
            t = textDiv;
          }

          /* if(t) {
            t.append(timeSpan);
          } else {
            box.classList.add('no-text');
          } */

          quote.append(quoteTextDiv);

          if(photo && !doc) {
            bubble.classList.add('photo');

            const size: PhotoSize.photoSize = photo.sizes[photo.sizes.length - 1] as any;
            let isSquare = false;
            if(size.w === size.h && t) {
              bubble.classList.add('is-square-photo');
              isSquare = true;
              setAttachmentSize(photo, preview, 48, 48, false);

              /* if(t) {
                t.append(timeSpan);
              } */
            } else if(size.h > size.w) {
              bubble.classList.add('is-vertical-photo');
            }

            wrapPhoto({
              photo,
              message,
              container: preview,
              boxWidth: isSquare ? 0 : mediaSizes.active.webpage.width,
              boxHeight: isSquare ? 0 : mediaSizes.active.webpage.height,
              isOut,
              lazyLoadQueue: this.lazyLoadQueue,
              middleware: this.getMiddleware(),
              loadPromises,
              withoutPreloader: isSquare,
              autoDownloadSize: this.chat.autoDownload.photo
            });
          }

          box.append(quote);

          // bubble.prepend(box);
          // if(timeSpan.parentElement === messageDiv) {
          messageDiv.insertBefore(box, timeSpan);
          // } else {
          //   messageDiv.append(box);
          // }

          // this.log('night running', bubble.scrollHeight);

          break;
        }

        case 'messageMediaDocument': {
          const doc = messageMedia.document as MyDocument;

          if(doc.sticker/*  && doc.size <= 1e6 */) {
            bubble.classList.add('sticker');
            canHaveTail = false;
            isStandaloneMedia = true;

            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }

            const sizes = mediaSizes.active;
            const isEmoji = bubble.classList.contains('emoji-big');
            const boxSize = isEmoji ? sizes.emojiSticker : (doc.animated ? sizes.animatedSticker : sizes.staticSticker);
            setAttachmentSize(doc, attachmentDiv, boxSize.width, boxSize.height);
            // let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.minWidth = attachmentDiv.style.width;
            bubbleContainer.style.minHeight = attachmentDiv.style.height;
            // appPhotosManager.setAttachmentSize(doc, bubble);
            wrapSticker({
              doc,
              div: attachmentDiv,
              middleware,
              lazyLoadQueue: this.lazyLoadQueue,
              group: this.chat.animationGroup,
              // play: !!message.pending || !multipleRender,
              play: true,
              liteModeKey: 'stickers_chat',
              loop: true,
              emoji: isEmoji ? messageMessage : undefined,
              withThumb: true,
              loadPromises,
              isOut,
              noPremium: messageMedia?.pFlags?.nopremium
            });

            if((getStickerEffectThumb(doc) || isEmoji) && (isInUnread || isOutgoing)/*  || true */) {
              this.observer.observe(bubble, this.stickerEffectObserverCallback);
            }
          } else if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round'/*  && doc.size <= 20e6 */) {
            // this.log('never get free 2', doc);

            const isRound = doc.type === 'round';
            if(isRound) {
              isStandaloneMedia = true;
            }

            if(isRound || isMessageEmpty) {
              canHaveTail = false;
            }

            if(canHideNameIfMedia) {
              bubble.classList.add('hide-name');
            }

            bubble.classList.add(isRound ? 'round' : 'video');
            if(albumMustBeRenderedFull && groupedId && albumMids.length !== 1) {
              bubble.classList.add('is-album', 'is-grouped');

              wrapAlbum({
                messages: albumMessages,
                attachmentDiv,
                middleware,
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue,
                chat: this.chat,
                loadPromises,
                autoDownload: this.chat.autoDownload
              });
            } else {
              const withTail = !IS_ANDROID && !IS_APPLE && !isRound && canHaveTail && !withReplies && USE_MEDIA_TAILS;
              if(withTail) bubble.classList.add('with-media-tail');
              const p = wrapVideo({
                doc,
                container: attachmentDiv,
                message: message as Message.message,
                boxWidth: mediaSizes.active.regular.width,
                boxHeight: mediaSizes.active.regular.height,
                withTail,
                isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware,
                group: this.chat.animationGroup,
                loadPromises,
                autoDownload: this.chat.autoDownload,
                searchContext: isRound ? {
                  peerId: this.peerId,
                  inputFilter: {_: 'inputMessagesFilterRoundVoice'},
                  threadId: this.chat.threadId,
                  useSearch: !(message as Message.message).pFlags.is_scheduled,
                  isScheduled: (message as Message.message).pFlags.is_scheduled
                } : undefined,
                noInfo: message.mid < 0,
                noAutoplayAttribute: !!messageMedia.pFlags.spoiler
              });

              if(messageMedia.pFlags.spoiler) {
                loadPromises.push(this.wrapMediaSpoiler({
                  media: doc,
                  promise: p,
                  middleware,
                  attachmentDiv
                }));
              }
            }
          } else {
            const newNameContainer = await wrapGroupedDocuments({
              albumMustBeRenderedFull,
              message,
              bubble,
              messageDiv,
              chat: this.chat,
              loadPromises,
              autoDownloadSize: this.chat.autoDownload.file,
              lazyLoadQueue: this.lazyLoadQueue,
              searchContext: doc.type === 'voice' || doc.type === 'audio' ? {
                peerId: this.peerId,
                inputFilter: {_: doc.type === 'voice' ? 'inputMessagesFilterRoundVoice' : 'inputMessagesFilterMusic'},
                threadId: this.chat.threadId,
                useSearch: !(message as Message.message).pFlags.is_scheduled,
                isScheduled: (message as Message.message).pFlags.is_scheduled
              } : undefined,
              sizeType: 'documentName',
              fontSize: rootScope.settings.messagesTextSize,
              richTextFragment: typeof(richText) === 'string' ? undefined : richText,
              richTextOptions,
              canTranscribeVoice: true
            });

            if(newNameContainer) {
              nameContainer = newNameContainer;
            }

            const lastContainer = messageDiv.lastElementChild.querySelector('.document-message, .document, .audio');
            // lastContainer && lastContainer.append(timeSpan.cloneNode(true));
            lastContainer && lastContainer.append(timeSpan);

            bubble.classList.remove('is-message-empty');
            const addClassName = (!(['photo', 'pdf'] as MyDocument['type'][]).includes(doc.type) ? doc.type || 'document' : 'document') + '-message';
            messageDiv.classList.add(addClassName);

            if(doc.type === 'audio' || doc.type === 'voice') {
              bubble.classList.add('min-content');
            }

            processingWebPage = true;
          }

          break;
        }

        case 'messageMediaCall': {
          const action = messageMedia.action;
          const div = document.createElement('div');
          div.classList.add('bubble-call', action.pFlags.video ? 'tgico-videocamera' : 'tgico-phone');

          const type: CallType = action.pFlags.video ? 'video' : 'voice';
          div.dataset.type = type;

          const title = document.createElement('div');
          title.classList.add('bubble-call-title');

          _i18n(title, isOut ?
            (action.pFlags.video ? 'CallMessageVideoOutgoing' : 'CallMessageOutgoing') :
            (action.pFlags.video ? 'CallMessageVideoIncoming' : 'CallMessageIncoming'));

          const subtitle = document.createElement('div');
          subtitle.classList.add('bubble-call-subtitle');

          if(action.duration !== undefined) {
            subtitle.append(wrapCallDuration(action.duration));
          } else {
            let langPackKey: LangPackKey;
            switch(action.reason._) {
              case 'phoneCallDiscardReasonBusy':
                langPackKey = 'Call.StatusBusy';
                break;
              case 'phoneCallDiscardReasonMissed':
                langPackKey = 'Chat.Service.Call.Missed';
                break;
              // case 'phoneCallDiscardReasonHangup':
              default:
                langPackKey = 'Chat.Service.Call.Cancelled';
                break;
            }

            subtitle.classList.add('is-reason');
            _i18n(subtitle, langPackKey);
          }

          subtitle.classList.add('tgico', 'arrow-' + (action.duration !== undefined ? 'green' : 'red'));

          div.append(title, subtitle);

          processingWebPage = true;

          bubble.classList.remove('is-message-empty');
          messageDiv.classList.add('call-message');
          messageDiv.append(div);

          break;
        }

        case 'messageMediaContact': {
          const contact = messageMedia;
          const contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerId = '' + contact.user_id;

          processingWebPage = true;

          const contactDetails = document.createElement('div');
          contactDetails.className = 'contact-details';
          const contactNameDiv = document.createElement('div');
          contactNameDiv.className = 'contact-name';
          const fullName = [
            contact.first_name,
            contact.last_name
          ].filter(Boolean).join(' ');
          contactNameDiv.append(
            fullName.trim() ? wrapEmojiText(fullName) : i18n('AttachContact')
          );

          const contactNumberDiv = document.createElement('div');
          contactNumberDiv.className = 'contact-number';
          contactNumberDiv.textContent = contact.phone_number ? '+' + formatPhoneNumber(contact.phone_number).formatted : 'Unknown phone number';

          contactDiv.append(contactDetails);
          contactDetails.append(contactNameDiv, contactNumberDiv);

          const avatarElem = new AvatarElement();
          avatarElem.updateWithOptions({
            lazyLoadQueue: this.lazyLoadQueue,
            peerId: contact.user_id.toPeerId(),
            peerTitle: contact.user_id ? undefined : (fullName.trim() ? fullName : I18n.format('AttachContact', true)[0])
          });
          avatarElem.classList.add('contact-avatar', 'avatar-54');

          contactDiv.prepend(avatarElem);

          bubble.classList.remove('is-message-empty');
          messageDiv.classList.add('contact-message');
          messageDiv.append(contactDiv);

          break;
        }

        case 'messageMediaPoll': {
          bubble.classList.remove('is-message-empty');

          const pollElement = wrapPoll(message);
          messageDiv.prepend(pollElement);
          messageDiv.classList.add('poll-message');

          break;
        }

        case 'messageMediaInvoice': {
          const isTest = messageMedia.pFlags.test;
          const extendedMedia = messageMedia.extended_media;
          const isAlreadyPaid = extendedMedia?._ === 'messageExtendedMedia';
          const isNotPaid = extendedMedia?._ === 'messageExtendedMediaPreview';
          let innerMedia = isAlreadyPaid ?
            (extendedMedia.media as MessageMedia.messageMediaPhoto).photo as Photo.photo ||
              (extendedMedia.media as MessageMedia.messageMediaDocument).document as Document.document :
            messageMedia.photo;

          const wrappedPrice = paymentsWrapCurrencyAmount(messageMedia.total_amount, messageMedia.currency);
          let priceEl: HTMLElement;
          if(!extendedMedia) {
            priceEl = document.createElement(innerMedia ? 'span' : 'div');
            const f = document.createDocumentFragment();
            const l = i18n(messageMedia.receipt_msg_id ? 'PaymentReceipt' : (isTest ? 'PaymentTestInvoice' : 'PaymentInvoice'));
            l.classList.add('text-uppercase');
            const joiner = ' ' + NBSP;
            const p = document.createElement('span');
            p.classList.add('text-bold');
            p.textContent = wrappedPrice + joiner;
            f.append(p, l);
            if(isTest && messageMedia.receipt_msg_id) {
              const a = document.createElement('span');
              a.classList.add('text-uppercase', 'pre-wrap');
              a.append(joiner + '(Test)');
              f.append(a);
            }
            setInnerHTML(priceEl, f);
          } else if(isNotPaid) {
            priceEl = document.createElement('span');
            priceEl.classList.add('extended-media-buy', 'tgico-premium_lock');
            attachmentDiv.classList.add('is-buy');
            _i18n(priceEl, 'Checkout.PayPrice', [wrappedPrice]);

            if(extendedMedia.video_duration !== undefined) {
              const videoTime = document.createElement('span');
              videoTime.classList.add('video-time');
              videoTime.textContent = toHHMMSS(extendedMedia.video_duration, false);
              attachmentDiv.append(videoTime);
            }
          }

          if(isNotPaid) {
            (extendedMedia.thumb as PhotoSize.photoStrippedSize).w = extendedMedia.w;
            (extendedMedia.thumb as PhotoSize.photoStrippedSize).h = extendedMedia.h;
            innerMedia = {
              _: 'photo',
              access_hash: '',
              pFlags: {},
              date: 0,
              dc_id: 0,
              file_reference: [],
              id: 0,
              sizes: [extendedMedia.thumb]
            };
          }

          if(innerMedia) {
            const mediaSize = extendedMedia ? mediaSizes.active.extendedInvoice : mediaSizes.active.invoice;
            if(innerMedia._ === 'document') {
              wrapVideo({
                doc: innerMedia,
                container: attachmentDiv,
                withTail: false,
                isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware,
                loadPromises,
                boxWidth: mediaSize.width,
                boxHeight: mediaSize.height,
                group: this.chat.animationGroup,
                message: message as Message.message
              });
              bubble.classList.add('video');
            } else {
              wrapPhoto({
                photo: innerMedia,
                container: attachmentDiv,
                withTail: false,
                isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware,
                loadPromises,
                boxWidth: mediaSize.width,
                boxHeight: mediaSize.height,
                message: isAlreadyPaid ? message : undefined
              });
              bubble.classList.add('photo');
            }

            if(priceEl) {
              if(!extendedMedia) {
                priceEl.classList.add('video-time');
              }

              attachmentDiv.append(priceEl);
            }
          } else {
            attachmentDiv = undefined;
          }

          if(isNotPaid) {
            const {mid} = message;
            this.extendedMediaMessages.add(mid);
            middleware.onClean(() => {
              this.extendedMediaMessages.delete(mid);
            });
            this.setExtendedMediaMessagesPollInterval();

            const {width, height} = attachmentDiv.style;
            const dotRenderer = DotRenderer.create({
              width: parseInt(width),
              height: parseInt(height),
              middleware,
              animationGroup: this.chat.animationGroup
            });
            attachmentDiv.append(dotRenderer.canvas);
          }

          let titleDiv: HTMLElement;
          if(!extendedMedia) {
            titleDiv = document.createElement('div');
            titleDiv.classList.add('bubble-primary-color');
            setInnerHTML(titleDiv, wrapEmojiText(messageMedia.title));
          }

          const richText = isAlreadyPaid ? undefined : wrapEmojiText(messageMedia.description);
          messageDiv.prepend(...[titleDiv, !innerMedia && priceEl, richText].filter(Boolean));

          if(!richText) canHaveTail = false;
          else bubble.classList.remove('is-message-empty');
          bubble.classList.add('is-invoice');

          break;
        }

        case 'messageMediaGeoLive':
        case 'messageMediaVenue':
        case 'messageMediaGeo': {
          bubble.classList.add('photo');

          const container = document.createElement('a');
          container.classList.add('geo-container', 'shimmer-bright');

          const isVenue = messageMedia._ === 'messageMediaVenue';
          const isLive = messageMedia._ === 'messageMediaGeoLive';
          const {geo} = messageMedia;
          assumeType<GeoPoint.geoPoint>(geo);

          const svgWidth = 277;
          const svgHeight = 195;

          container.innerHTML = `
          <svg class="geo-svg" width="${svgWidth}px" height="${svgHeight}px" viewBox="0 0 277 195" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
            <g id="Artboard" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
              <path class="geo-svg-path" d="M274.275109,103.333333 C275.780025,103.333333 277,104.567636 277,106.090226 L277,195 L201.724891,195 C200.219975,195 199,193.765697 199,192.243108 L199,109.536341 C199,106.110514 201.744944,103.333333 205.131004,103.333333 L274.275109,103.333333 Z M71.8689956,103.333333 C75.2550558,103.333333 78,106.110514 78,109.536341 L78,192.243108 C78,193.765697 76.7800248,195 75.2751092,195 L3.05533376e-13,195 L3.05533376e-13,106.090226 C3.05533376e-13,104.567636 1.21997518,103.333333 2.72489083,103.333333 L71.8689956,103.333333 Z M179.467331,145 C185.100269,145 190,149.937497 190,155.617021 L190,192.257683 C190,193.772223 188.448961,195 186.946844,195 L90.0531561,195 C88.5510395,195 87,193.772223 87,192.257683 L87,155.617021 C87,149.937497 91.8997314,145 97.5326689,145 L179.467331,145 Z M141.438333,165.734879 L136.933333,167.553888 L136.933333,166.559118 C136.933333,166.237002 136.805833,166.000152 136.550833,165.848568 C136.295833,165.696983 136.026667,165.678035 135.743333,165.791724 L130.02,168.236016 C129.698889,168.368652 129.448611,168.581817 129.269167,168.875512 C129.089722,169.169206 129,169.486585 129,169.827649 L129,180.628013 C129,181.101713 129.165278,181.504358 129.495833,181.835948 C129.826389,182.167538 130.227778,182.333333 130.7,182.333333 L149.966667,182.333333 C150.438889,182.333333 150.840278,182.167538 151.170833,181.835948 C151.501389,181.504358 151.666667,181.101713 151.666667,180.628013 L151.666667,168.690769 L142.6,168.690769 L142.6,166.530696 C142.6,166.227528 142.477222,165.990678 142.231667,165.820146 C141.986111,165.649613 141.721667,165.621191 141.438333,165.734879 Z M140.5,173.333333 C140.740741,173.333333 140.939815,173.410069 141.097222,173.563542 C141.25463,173.717014 141.333333,173.911111 141.333333,174.145833 L141.333333,176.854167 C141.333333,177.088889 141.25463,177.282986 141.097222,177.436458 C140.939815,177.589931 140.740741,177.666667 140.5,177.666667 C140.259259,177.666667 140.060185,177.589931 139.902778,177.436458 C139.74537,177.282986 139.666667,177.088889 139.666667,176.854167 L139.666667,174.145833 C139.666667,173.911111 139.74537,173.717014 139.902778,173.563542 C140.060185,173.410069 140.259259,173.333333 140.5,173.333333 Z M135.833333,173.333333 C136.074074,173.333333 136.273148,173.410069 136.430556,173.563542 C136.587963,173.717014 136.666667,173.911111 136.666667,174.145833 L136.666667,176.854167 C136.666667,177.088889 136.587963,177.282986 136.430556,177.436458 C136.273148,177.589931 136.074074,177.666667 135.833333,177.666667 C135.592593,177.666667 135.393519,177.589931 135.236111,177.436458 C135.078704,177.282986 135,177.088889 135,176.854167 L135,174.145833 C135,173.911111 135.078704,173.717014 135.236111,173.563542 C135.393519,173.410069 135.592593,173.333333 135.833333,173.333333 Z M144.833333,173.333333 C145.074074,173.333333 145.273148,173.410069 145.430556,173.563542 C145.587963,173.717014 145.666667,173.911111 145.666667,174.145833 L145.666667,176.854167 C145.666667,177.088889 145.587963,177.282986 145.430556,177.436458 C145.273148,177.589931 145.074074,177.666667 144.833333,177.666667 C144.592593,177.666667 144.393519,177.589931 144.236111,177.436458 C144.078704,177.282986 144,177.088889 144,176.854167 L144,174.145833 C144,173.911111 144.078704,173.717014 144.236111,173.563542 C144.393519,173.410069 144.592593,173.333333 144.833333,173.333333 Z M149.658824,159.666667 L148.341176,159.666667 C148.139869,159.666667 147.966013,159.735119 147.819608,159.872024 C147.673203,160.008929 147.581699,160.177778 147.545098,160.378571 L146.666667,167.333333 L151.333333,167.333333 L150.454902,160.378571 C150.418301,160.177778 150.326797,160.008929 150.180392,159.872024 C150.033987,159.735119 149.860131,159.666667 149.658824,159.666667 Z M249.919094,140.666667 L238.414239,140.666667 C237.928803,140.666667 237.516181,140.839506 237.176375,141.185185 C236.83657,141.530864 236.666667,141.950617 236.666667,142.444444 L236.666667,144.518519 L242.812298,148.903704 C243.02589,149.061728 243.200647,149.298765 243.33657,149.614815 C243.472492,149.930864 243.540453,150.237037 243.540453,150.533333 L243.540453,162 L249.919094,162 C250.404531,162 250.817152,161.82716 251.156958,161.481481 C251.496764,161.135802 251.666667,160.716049 251.666667,160.222222 L251.666667,142.444444 C251.666667,141.950617 251.496764,141.530864 251.156958,141.185185 C250.817152,140.839506 250.404531,140.666667 249.919094,140.666667 Z M233.681454,145 C233.306839,145 232.961799,145.109357 232.646334,145.32807 L226.406038,149.831579 C226.169439,149.990643 225.987061,150.204386 225.858903,150.472807 C225.730746,150.741228 225.666667,151.01462 225.666667,151.292982 L225.666667,161.105263 C225.666667,161.363743 225.750462,161.577485 225.918053,161.746491 C226.085644,161.915497 226.297597,162 226.553913,162 L231.315465,162 L231.315465,155.408772 L236.047443,155.408772 L236.047443,162 L240.779421,162 C241.035736,162 241.247689,161.915497 241.41528,161.746491 C241.582871,161.577485 241.666667,161.363743 241.666667,161.105263 L241.666667,151.292982 C241.666667,151.01462 241.602588,150.741228 241.47443,150.472807 C241.346272,150.204386 241.163894,149.990643 240.927295,149.831579 L234.716574,145.32807 C234.401109,145.109357 234.056069,145 233.681454,145 Z M28.1107355,151 C26.7011204,151.535116 25.6080384,152.177255 24.8314897,152.926418 C24.054941,153.67558 23.6666667,154.507839 23.6666667,155.423195 C23.6666667,156.313825 24.0383266,157.128954 24.7816465,157.868583 C25.5249664,158.608212 26.5730748,159.243985 27.9259717,159.775903 L28.3614887,159.946655 C29.6189312,160.436878 31.0759356,160.969375 32.7325021,161.229902 C34.5839587,161.521079 36.6177601,161.666667 38.8339062,161.666667 C41.0575639,161.666667 43.0932432,161.521079 44.940944,161.229902 C46.7886449,160.938725 48.3905989,160.30782 49.746806,159.775903 C51.1030131,159.243985 52.1509305,158.608212 52.8905583,157.868583 C53.6301861,157.128954 54,156.313825 54,155.423195 C54,154.74612 53.7747506,154.109424 53.3242518,153.513108 C52.8737529,152.916792 52.232252,152.376601 51.399749,151.892537 C51.0481091,152.042615 50.6745076,152.157696 50.2789446,152.237779 C49.8833815,152.317862 49.4585364,152.366145 49.0044091,152.382629 C48.0792219,153.944799 46.7901408,155.168707 45.137166,156.054355 C43.4841911,156.940003 41.5781488,157.382827 39.4190391,157.382827 L38.373477,157.382827 C36.7571047,157.382827 35.2762577,157.12145 33.9309359,156.598697 C32.5856141,156.075944 31.4161441,155.337853 30.4225259,154.384424 C29.4289077,153.430995 28.6583108,152.302854 28.1107355,151 Z M246.666667,155.666667 L246.666667,157.333333 L245,157.333333 L245,155.666667 L246.666667,155.666667 Z M38.9247583,138.333333 C36.8805223,138.333333 35.0878837,138.524784 33.5468423,138.907687 C32.005801,139.290589 30.807178,139.825485 29.9509735,140.512377 C29.0947689,141.199268 28.6666667,142.000558 28.6666667,142.916248 L28.6666667,145.217011 C28.6666667,146.65308 28.8977785,147.968639 29.3600021,149.163689 C29.8222257,150.358738 30.4832473,151.391681 31.343067,152.262516 C32.2028866,153.133352 33.2290636,153.807308 34.421598,154.284385 C35.6141324,154.761462 36.9411543,155 38.4026637,155 L39.4443793,155 C41.3903102,155 43.0928254,154.597401 44.5519248,153.792202 C46.0110242,152.987003 47.1473979,151.850115 47.961046,150.381537 C48.0380117,150.24262 48.1113372,150.101439 48.1810225,149.957994 L48.8310449,149.957752 C50.1301926,149.957752 51.1498054,149.643464 51.8898832,149.014889 C52.6299611,148.386314 53,147.516781 53,146.406291 C53,145.303865 52.6297708,144.436566 51.8893124,143.804392 C51.2166514,143.230102 50.3137723,142.916665 49.1810488,142.863979 C49.1649624,141.970034 48.735209,141.186167 47.8917885,140.512377 C47.0319689,139.825485 45.8315067,139.290589 44.2904019,138.907687 C42.7492971,138.524784 40.9607493,138.333333 38.9247583,138.333333 Z M246.666667,150.333333 L246.666667,152 L245,152 L245,150.333333 L246.666667,150.333333 Z M49.3462947,144.666667 C49.9216674,144.707967 50.3794206,144.850985 50.719554,145.095721 C51.1287402,145.390142 51.3333333,145.798671 51.3333333,146.321307 C51.3333333,146.844067 51.1285423,147.254623 50.7189604,147.552974 C50.312817,147.848821 49.7398788,147.997986 49,148 C49.2305654,147.116215 49.3458481,146.164212 49.3458481,145.143993 L49.3462947,144.666667 Z M246.666667,145.333333 L246.666667,147 L245,147 L245,145.333333 L246.666667,145.333333 Z M39.0006663,140.333333 C40.5947307,140.333333 42.0207584,140.451406 43.2787493,140.687551 C44.5367403,140.923696 45.527002,141.243793 46.2495345,141.647842 C46.9720671,142.051891 47.3333333,142.502395 47.3333333,142.999356 C47.3333333,143.49558 46.9718767,143.9459 46.2489634,144.350317 C45.5260501,144.754734 44.5357884,145.07523 43.2781782,145.311805 C42.020568,145.548379 40.5947307,145.666667 39.0006663,145.666667 C37.406475,145.666667 35.9822242,145.548379 34.7279138,145.311805 C33.4736034,145.07523 32.4831513,144.754734 31.7565574,144.350317 C31.0299636,143.9459 30.6666667,143.49558 30.6666667,142.999356 C30.6666667,142.502395 31.0297732,142.051891 31.7559863,141.647842 C32.4821994,141.243793 33.4724611,140.923696 34.7267715,140.687551 C35.9810819,140.451406 37.4057135,140.333333 39.0006663,140.333333 Z M176.83043,52 C183.919688,52 190,58.1245592 190,65.2683983 L190,122.398268 C190,129.542107 183.919688,135 176.83043,135 L100.16957,135 C93.0803124,135 87,129.542107 87,122.398268 L87,65.2683983 C87,58.1245592 93.0803124,52 100.16957,52 L176.83043,52 Z M138.333333,80.3333333 C135.511111,80.3333333 133.027778,81.3372814 130.883333,83.3451777 C128.738889,85.3530739 127.666667,88.0490694 127.666667,91.4331641 C127.666667,93.6215454 128.488889,95.9791314 130.133333,98.5059222 C131.777778,101.032713 134.255556,103.77383 137.566667,106.729272 C137.677778,106.819515 137.8,106.887197 137.933333,106.932318 C138.066667,106.977439 138.211111,107 138.366667,107 C138.5,107 138.627778,106.977439 138.75,106.932318 C138.872222,106.887197 138.988889,106.819515 139.1,106.729272 C142.411111,103.77383 144.888889,101.032713 146.533333,98.5059222 C148.177778,95.9791314 149,93.6215454 149,91.4331641 C149,88.0490694 147.927778,85.3530739 145.783333,83.3451777 C143.638889,81.3372814 141.155556,80.3333333 138.333333,80.3333333 Z M138,88 C138.920635,88 139.706349,88.3253968 140.357143,88.9761905 C141.007937,89.6269841 141.333333,90.4126984 141.333333,91.3333333 C141.333333,92.2539683 141.007937,93.0396825 140.357143,93.6904762 C139.706349,94.3412698 138.920635,94.6666667 138,94.6666667 C137.079365,94.6666667 136.293651,94.3412698 135.642857,93.6904762 C134.992063,93.0396825 134.666667,92.2539683 134.666667,91.3333333 C134.666667,90.4126984 134.992063,89.6269841 135.642857,88.9761905 C136.293651,88.3253968 137.079365,88 138,88 Z M277,0 L277,91.2454212 C277,92.7667331 275.781665,94 274.278772,94 L205.227621,94 C201.846113,94 199.104859,91.2251494 199.104859,87.8021978 L199.104859,66.7985348 C199.104859,54.8182041 189.51047,41.6630037 177.675192,41.6630037 L149.102302,41.6630037 C146.284378,41.6630037 144,39.3506282 144,36.4981685 L144,2.75457875 C144,1.23326692 145.218335,0 146.721228,0 L277,0 Z M129.945299,0 C131.448269,0 132.666667,1.23326692 132.666667,2.75457875 L132.666667,36.4981685 C132.666667,39.3506282 130.382171,41.6630037 127.564103,41.6630037 L99.3299145,41.6630037 C87.4940275,41.6630037 77.8991453,54.8182041 77.8991453,66.7985348 L77.8991453,87.8021978 C77.8991453,91.2251494 75.1577504,94 71.7760684,94 L2.72136752,94 C1.21839774,94 0,92.7667331 0,91.2454212 L0,0 L129.945299,0 Z M237.333333,28.6666667 C235.486111,28.6666667 233.875868,29.2909326 232.502604,30.5394645 C231.12934,31.7879963 230.333333,33.3393899 230.114583,35.1936451 C228.753472,35.7622834 227.671875,36.6708685 226.869792,37.9194003 C226.067708,39.1679322 225.666667,40.5339002 225.666667,42.0173044 C225.666667,44.0693469 226.377604,45.8185276 227.799479,47.2648467 C229.221354,48.7111658 230.940972,49.4343254 232.958333,49.4343254 L236.239583,49.4343254 L236.239583,55.0331916 L232.958333,55.0331916 C232.642361,55.0331916 232.381076,55.1382661 232.174479,55.348415 C231.967882,55.5585639 231.864583,56.5660426 231.864583,56.8874469 C231.864583,57.2088511 231.967882,57.4746277 232.174479,57.6847766 C232.381076,57.8949255 232.642361,58 232.958333,58 L241.34375,58 C241.659722,58 241.921007,57.8949255 242.127604,57.6847766 C242.334201,57.4746277 242.4375,57.2088511 242.4375,56.8874469 C242.4375,56.5660426 242.334201,55.5585639 242.127604,55.348415 C241.921007,55.1382661 241.659722,55.0331916 241.34375,55.0331916 L238.427083,55.0331916 L238.427083,49.4343254 L241.708333,49.4343254 C243.725694,49.4343254 245.445312,48.7111658 246.867188,47.2648467 C248.289062,45.8185276 249,44.0693469 249,42.0173044 C249,40.5339002 248.598958,39.1679322 247.796875,37.9194003 C246.994792,36.6708685 245.913194,35.7622834 244.552083,35.1936451 C244.333333,33.3393899 243.537326,31.7879963 242.164062,30.5394645 C240.790799,29.2909326 239.180556,28.6666667 237.333333,28.6666667 Z M39.3280935,33 C39.2243891,33 39.1258699,33.0154494 39.0325359,33.0463483 C38.9392019,33.0772472 38.8510531,33.1235955 38.7680896,33.1853933 L31.8613745,38.3405982 L31.8613745,37.6966292 L31.8583795,37.640264 C31.8289402,37.347262 31.5754523,36.7755434 30.7901174,36.7755434 L30.6207017,36.7767977 L30.4578933,36.7810704 C29.9778294,36.7994331 29.824306,36.8638758 29.6931536,36.9792263 L29.6369144,37.0323034 C29.4606169,37.207397 29.3724681,37.428839 29.3724681,37.6966292 L29.3724681,40.2921348 L26.3857805,42.5477528 C26.1783716,42.7125468 26.0539263,42.9185393 26.0124445,43.1657303 C25.9709628,43.4129213 26.0331854,43.6395131 26.1991125,43.8455056 C26.3650396,44.0514981 26.5724485,44.1750936 26.8213391,44.2162921 C27.0702297,44.2574906 27.2983795,44.1956929 27.5057883,44.0308989 L29.3724681,42.6095506 L29.3724681,54.0730337 C29.3724681,54.340824 29.4606169,54.5622659 29.6369144,54.7373596 C29.8132119,54.9124532 30.0361765,55 30.305808,55 L36.866591,55 C37.3669257,55 37.7725271,54.5921805 37.7725271,54.0891096 L37.7725271,49.1292135 C37.7725271,48.8614232 37.8606758,48.6399813 38.0369734,48.4648876 C38.2132709,48.289794 39.058462,47.9008773 39.3280935,47.9008773 C39.5977251,47.9008773 40.4429162,48.289794 40.6192137,48.4648876 C40.7955112,48.6399813 40.88366,48.8614232 40.88366,49.1292135 L40.88366,54.0891096 C40.88366,54.5921805 41.2892614,55 41.7895961,55 L48.3503791,55 C48.6200106,55 48.8429751,54.9124532 49.0192726,54.7373596 C49.1955702,54.5622659 49.283719,54.340824 49.283719,54.0730337 L49.283719,42.6095506 L51.2441994,44.0774017 C51.4336674,44.2081039 51.6357355,44.2595506 51.8504036,44.2317416 C52.0889238,44.2008427 52.2911475,44.082397 52.4570746,43.8764045 C52.6230016,43.670412 52.6904095,43.4438202 52.6592982,43.1966292 C52.6281869,42.9494382 52.5089268,42.7434457 52.3015179,42.5786517 L39.8880975,33.1853933 C39.8051339,33.1235955 39.7169851,33.0772472 39.6236512,33.0463483 C39.5303172,33.0154494 39.431798,33 39.3280935,33 Z" id="Shape" fill="#FFFFFF"></path>
            </g>
          </svg>`;
          container.target = '_blank';

          const svgPlaceholder = container.firstElementChild;

          attachmentDiv.append(container);

          const zoom = 16;

          const setAnchorURL = (geo: GeoPoint.geoPoint) => {
            container.href = 'https://maps.google.com/maps?q=' + geo.lat + ',' + geo.long;
          };

          const width = mediaSizes.isMobile ? svgWidth : 420;
          const getWebFileLocation = (geo: GeoPoint.geoPoint): InputWebFileLocation.inputWebFileGeoPointLocation => {
            return {
              _: 'inputWebFileGeoPointLocation',
              access_hash: geo.access_hash,
              geo_point: {
                _: 'inputGeoPoint',
                lat: geo.lat,
                long: geo.long
              },
              w: width,
              h: width / (svgWidth / svgHeight),
              scale: window.devicePixelRatio,
              zoom
            };
          };

          let wrapTempId = 0;
          const wrapGeo = (
            media: MessageMedia.messageMediaGeo | MessageMedia.messageMediaGeoLive | MessageMedia.messageMediaVenue,
            loadPromises?: Promise<any>[]
          ) => {
            const geo = media.geo as GeoPoint.geoPoint;
            const _wrapTempId = ++wrapTempId;

            const oldImageContainer = container.querySelector('.geo-image-container');
            if(oldImageContainer) {
              if(liteMode.isAvailable('animations')) {
                oldImageContainer.classList.add('fade-out');
              } else {
                oldImageContainer.remove();
              }
            }

            container.classList.add('shimmer');
            container.prepend(svgPlaceholder);

            const newWrapOptions: WrapSomethingOptions = {
              ...wrapOptions,
              ...(_wrapTempId !== 0 ? {lazyLoadQueue: undefined} : {})
            };

            const imageContainer = document.createElement('div');
            imageContainer.classList.add('geo-image-container');
            if(isLive) {
              const pin = document.createElement('div');
              pin.classList.add('geo-live-pin');

              const heading = document.createElement('div');
              heading.classList.add('geo-live-pin-heading');
              pin.append(heading);

              pin.insertAdjacentHTML('beforeend', `
                <svg version="1.1" class="geo-live-pin-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 64 64" style="enable-background:new 0 0 64 64;" xml:space="preserve">
                  <g>
                    <circle cx="32" cy="32" r="24.5"/>
                    <path d="M32,8c13.23,0,24,10.77,24,24S45.23,56,32,56S8,45.23,8,32S18.77,8,32,8 M32,7C18.19,7,7,18.19,7,32s11.19,25,25,25 s25-11.19,25-25S45.81,7,32,7L32,7z"/>
                  </g>
                  <g>
                    <polygon points="29.38,57.67 27.4,56.08 30.42,54.42 32,51.54 33.58,54.42 36.6,56.08 34.69,57.61 32,60.73"></polygon>
                    <path d="M32,52.58l1.07,1.95l0.14,0.26l0.26,0.14l2.24,1.22l-1.33,1.06l-0.07,0.06l-0.06,0.07L32,59.96l-2.24-2.61l-0.06-0.07 l-0.07-0.06l-1.33-1.06l2.24-1.22l0.26-0.14l0.14-0.26L32,52.58 M32,50.5l-1.94,3.56L26.5,56l2.5,2l3,3.5l3-3.5l2.5-2l-3.56-1.94 L32,50.5L32,50.5z"/>
                  </g>
                </svg>
              `);

              const avatarElement = new AvatarElement();
              avatarElement.classList.add('geo-live-pin-avatar');
              avatarElement.classList.add('avatar-54');
              avatarElement.updateWithOptions({
                peerId: message.fromId,
                isDialog: false,
                loadPromises,
                wrapOptions: newWrapOptions
              });

              pin.append(avatarElement);

              imageContainer.append(pin);
            } else {
              imageContainer.innerHTML = `
                <svg class="geo-pin" xmlns="http://www.w3.org/2000/svg" width="21.333" height="37.218" viewBox="0 0 20 34.892">
                  <g transform="translate(-965.773 -331.784) scale(1.18559)">
                    <path d="M817.112 282.971c-1.258 1.343-2.046 3.299-2.015 5.139.064 3.845 1.797 5.3 4.568 10.592.999 2.328 2.04 4.792 3.031 8.873.138.602.272 1.16.335 1.21.062.048.196-.513.334-1.115.99-4.081 2.033-6.543 3.031-8.871 2.771-5.292 4.504-6.748 4.568-10.592.031-1.84-.759-3.798-2.017-5.14-1.437-1.535-3.605-2.67-5.916-2.717-2.312-.048-4.481 1.087-5.919 2.621z" style="fill:#ea4336;stroke:#ea4336;stroke-width:1;"/>
                    <circle r="3.035" cy="288.253" cx="823.031" style="fill:#970a0a;stroke-width:0"/>
                  </g>
                </svg>
              `;
            }

            wrapPhoto({
              photo: getWebFileLocation(geo),
              container: imageContainer,
              fadeInElement: imageContainer,
              onRender: () => {
                if(_wrapTempId !== wrapTempId) return;
                container.append(imageContainer);
              },
              onRenderFinish: () => {
                if(_wrapTempId !== wrapTempId) return;
                container.classList.remove('shimmer');
                svgPlaceholder.remove();
                oldImageContainer?.remove();
              },
              loadPromises,
              ...newWrapOptions
            });
          };

          function getMetersPerPixel(lat: number, zoom: number) {
            // https://groups.google.com/g/google-maps-js-api-v3/c/hDRO4oHVSeM/m/osOYQYXg2oUJ
            return (156543.03392 * Math.cos(lat * (Math.PI / 180))) / 2 ** zoom;
          }

          setAnchorURL(geo);
          wrapGeo(messageMedia, loadPromises);

          let liveExpiration = isLive ? (message.date + (messageMedia as MessageMedia.messageMediaGeoLive).period) * 1000 : undefined;
          const isLiveExpired = isLive && Date.now() >= liveExpiration;

          let footer: HTMLElement, title: HTMLElement, address: HTMLElement;
          if(isVenue || (isLive && !isLiveExpired)) {
            bubble.classList.remove('is-message-empty');

            footer = document.createElement('div');
            footer.classList.add('geo-footer');

            title = document.createElement('div');
            title.classList.add('geo-footer-title');

            address = document.createElement('div');
            address.classList.add('geo-footer-address');

            footer.append(title, address);
            messageDiv.append(footer);
          } else {
            canHaveTail = false;
          }

          if(isLive) {
            container.classList.add('is-live');
            container.classList.toggle('is-expired', isLiveExpired);
          }

          if(isVenue) {
            title.append(wrapEmojiText((messageMedia as MessageMedia.messageMediaVenue).title));
            address.append(wrapEmojiText((messageMedia as MessageMedia.messageMediaVenue).address));
          } else if(isLive && !isLiveExpired) {
            timeSpan.classList.add('hide');
            title.classList.add('disable-hover');
            address.classList.add('disable-hover');
            footer.classList.add('is-live');

            const updatedI18n = new I18n.IntlElement();
            title.append(i18n('AttachLiveLocation'));
            address.append(updatedI18n.element);

            const timer = document.createElement('div');
            timer.classList.add('geo-footer-timer');

            const radius = 13;
            const size = (radius + 2) * 2;
            const circumference = radius * 2 * Math.PI;

            const timerTextI18n = new I18n.IntlElement();
            timer.append(timerTextI18n.element);
            timer.insertAdjacentHTML('beforeend', `
              <svg class="geo-footer-timer-svg" width="${size}px" height="${size}px">
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" class="geo-footer-timer-circle" transform="rotate(-90, ${size / 2}, ${size / 2})" stroke-dasharray="${circumference} ${circumference}"></circle>
              </svg>
            `);
            const timerCircle = timer.lastElementChild.firstElementChild as SVGCircleElement;
            const timerShadowCircle = timerCircle.cloneNode(true) as SVGCircleElement;
            timerShadowCircle.classList.add('geo-footer-timer-circle-shadow');
            timer.lastElementChild.append(timerShadowCircle);

            footer.append(timer);

            let lastMessage = message as Message.message, cleaned = false;
            const update = (message = lastMessage, isExpired?: boolean) => {
              if(cleaned) {
                return;
              }

              const messageMedia = message.media as MessageMedia.messageMediaGeoLive;
              const {period} = messageMedia;
              const newGeo = messageMedia.geo as GeoPoint.geoPoint;
              liveExpiration = isExpired ? 0 : (message.date + period) * 1000;

              if(lastMessage !== message) {
                if(lastMessage && (geo.lat !== newGeo.lat || geo.long !== newGeo.long)) {
                  setAnchorURL(newGeo);
                  wrapGeo(messageMedia);
                }

                lastMessage = message;
              }

              if(Date.now() >= liveExpiration) {
                bubble.classList.add('is-message-empty');
                container.classList.add('is-expired');
                timeSpan.classList.remove('hide');
                footer.replaceWith(timeSpan);
                clean();
                return;
              }

              container.style.setProperty('--heading', `${messageMedia.heading}deg`);

              if(newGeo.accuracy_radius !== undefined) {
                const accuracyRadiusPx = newGeo.accuracy_radius / getMetersPerPixel(newGeo.lat, zoom);
                container.style.setProperty('--accuracy-size', `${accuracyRadiusPx * 2}px`);
              }

              let langPackKey: LangPackKey, langPackArgs: FormatterArguments;
              if((tsNow(true) - (message.edit_date ?? message.date)) < 60) {
                langPackKey = 'LocationUpdatedJustNow';
              } else {
                langPackKey = 'UpdatedMinutes';
                langPackArgs = [Math.floor((tsNow(true) - message.edit_date) / 60)];
              }

              const timeLeft = (liveExpiration - Date.now()) / 1000;
              const strokeDashOffset = (1 - timeLeft / period) * circumference;
              timerCircle.setAttribute('stroke-dashoffset', `-${strokeDashOffset}`);

              updatedI18n.compareAndUpdate({
                key: langPackKey,
                args: langPackArgs
              });

              timerTextI18n.compareAndUpdate({
                key: timeLeft < 3600 ? 'JustArgument' : 'MessageTimer.ShortHours',
                args: [Math.round(timeLeft < 3600 ? timeLeft / 60 : timeLeft / 3600)]
              });
            };

            const interval = setInterval(update, 1000);
            update();

            const clean = () => {
              cleaned = true;
              this.updateLocationOnEdit.delete(bubble);
              clearInterval(interval);
            };

            this.updateLocationOnEdit.set(bubble, update);
            middleware.onClean(clean);
          }

          if(address) {
            address.append(timeSpan);
          }

          break;
        }

        default:
          attachmentDiv = undefined;
          bubble.classList.remove('is-message-empty');
          messageDiv.append(i18n(UNSUPPORTED_LANG_PACK_KEY), timeSpan);
          this.log.warn('unrecognized media type:', messageMedia._, message);
          break;
      }

      if(!processingWebPage && attachmentDiv) {
        bubbleContainer.append(attachmentDiv);
      }

      /* if(bubble.classList.contains('is-message-empty') && (bubble.classList.contains('photo') || bubble.classList.contains('video'))) {
        bubble.classList.add('no-tail');

        if(!bubble.classList.contains('with-media-tail')) {
          bubble.classList.add('use-border-radius');
        }
      } */
    }

    if(isStandaloneMedia) {
      bubble.classList.add('just-media');
    }

    if(viewButton) {
      timeSpan.before(viewButton);
      // messageDiv.append(viewButton);
    }

    let savedFrom = '';

    // const needName = ((peerId.isAnyChat() && (peerId !== message.fromId || our)) && message.fromId !== rootScope.myId) || message.viaBotId;
    const needName = (message.fromId !== rootScope.myId && this.chat.isAnyGroup) || message.viaBotId || (message as Message.message).pFlags.sponsored;
    if(needName || fwdFrom || message.reply_to_mid || topicNameButtonContainer) { // chat
      let title: HTMLElement | DocumentFragment;
      let titleVia: typeof title;

      const isForwardFromChannel = message.from_id?._ === 'peerChannel' && message.fromId === fwdFromId;

      const mustHaveName = !!(message.viaBotId/*  || topicNameButtonContainer */);
      const isHidden = fwdFrom && !fwdFrom.from_id;
      if(message.viaBotId) {
        titleVia = document.createElement('span');
        titleVia.innerText = '@' + (await this.managers.appPeersManager.getPeerUsername(message.viaBotId));
        titleVia.classList.add('peer-title');
      }

      if(mustHaveName) {
        bubble.classList.add('must-have-name');
      }

      const isForward = fwdFromId || fwdFrom;
      if(isHidden) {
        title = document.createElement('span');
        setInnerHTML(title, wrapEmojiText(fwdFrom.from_name));
        title.classList.add('peer-title');
        bubble.classList.add('hidden-profile');
      } else {
        title = new PeerTitle({
          peerId: fwdFromId || message.fromId,
          withPremiumIcon: !isForward,
          wrapOptions
        }).element;
      }

      let replyContainer: HTMLElement;
      if(
        isMessage &&
        message.reply_to_mid &&
        message.reply_to_mid !== this.chat.threadId &&
        (!this.chat.isAllMessagesForum || message.reply_to.reply_to_top_id)
      ) {
        replyContainer = await MessageRender.setReply({
          chat: this.chat,
          bubble,
          bubbleContainer,
          message
        });
      }

      // this.log(title);

      let nameDiv: HTMLElement;
      if(isForward) {
        if(this.peerId !== rootScope.myId && !isForwardFromChannel) {
          bubble.classList.add('forwarded');
        }

        if(message.savedFrom) {
          savedFrom = message.savedFrom;
          title.dataset.savedFrom = savedFrom;
        }

        nameDiv = document.createElement('div');
        title.dataset.peerId = '' + fwdFromId;

        if((this.peerId === rootScope.myId || this.peerId === REPLIES_PEER_ID || isForwardFromChannel) && !isStandaloneMedia) {
          nameDiv.style.color = getPeerColorById(fwdFromId, false);
          nameDiv.classList.add('colored-name');
          nameDiv.append(title);
        } else {
          /* const fromTitle = message.fromId === this.myID || appPeersManager.isBroadcast(fwdFromId || message.fromId) ? '' : `<div class="name" data-peer-id="${message.fromId}" style="color: ${appPeersManager.getPeerColorByID(message.fromId, false)};">${appPeersManager.getPeerTitle(message.fromId)}</div>`;
          nameDiv.innerHTML = fromTitle + 'Forwarded from ' + title; */
          const args: FormatterArguments = [title];
          if(isStandaloneMedia) {
            const br = document.createElement('br');
            br.classList.add('hide-ol');
            args.unshift(br);
          }
          nameDiv.append(i18n('ForwardedFrom', [args]));
        }
      } else if(!message.viaBotId) {
        if(!isStandaloneMedia && needName) {
          nameDiv = document.createElement('div');
          nameDiv.append(title);

          const peer = await this.managers.appPeersManager.getPeer(message.fromId);
          const pFlags = (peer as User.user)?.pFlags;
          if(pFlags && (pFlags.scam || pFlags.fake)) {
            nameDiv.append(generateFakeIcon(pFlags.scam));
          }

          if(!our) {
            nameDiv.style.color = getPeerColorById(message.fromId, false);
            nameDiv.classList.add('colored-name');
          }

          nameDiv.dataset.peerId = '' + message.fromId;
        } else /* if(!message.reply_to_mid) */ {
          bubble.classList.add('hide-name');
        }
      }

      if(message.viaBotId) {
        if(!nameDiv) {
          nameDiv = document.createElement('div');
        } else {
          nameDiv.append(' ');
        }

        const span = document.createElement('span');
        span.append(i18n('ViaBot'), ' ', titleVia);
        span.classList.add('is-via');

        nameDiv.append(span);
      }

      if(topicNameButtonContainer) {
        if(isStandaloneMedia) {
          topicNameButtonContainer.classList.add('floating-part');
        } else {
          if(!nameDiv) {
            nameDiv = document.createElement('div');
          }

          nameDiv.append(topicNameButtonContainer);

          bubble.classList.remove('hide-name');
        }
      }

      if(nameDiv) {
        nameDiv.classList.add('name');

        if(isStandaloneMedia) {
          nameContainer.append(nameContainer = document.createElement('div'));
          nameContainer.classList.add('name-with-reply', 'floating-part');
        } else {
          nameDiv.classList.add('floating-part');
        }

        nameContainer.append(nameDiv);

        if(isStandaloneMedia && replyContainer) {
          nameContainer.append(replyContainer);
        }
      } else if(isStandaloneMedia && replyContainer) {
        replyContainer.classList.add('floating-part');
      }

      if(title && !isHidden && !fwdFromId && this.canShowRanks) {
        const processRank = () => {
          const rank = this.ranks.get(message.fromId);
          if(!rank) {
            return;
          }

          this.wrapTitleAndRank(title as HTMLElement, rank);
        };

        if((message as Message.message).post_author) {
          this.wrapTitleAndRank(title as HTMLElement, (message as Message.message).post_author);
        } else if(this.ranks) {
          processRank();
        } else {
          const processRanks = this.processRanks;
          processRanks.add(processRank);

          middleware.onDestroy(() => {
            processRanks.delete(processRank);
          });
        }
      } else if(isForwardFromChannel) {
        this.wrapTitleAndRank(title as HTMLElement, 0);
      }

      if(topicNameButtonContainer && isStandaloneMedia) {
        if(!attachmentDiv) {
          this.log.error('no attachment div?', bubble, message);
          debugger;
        } else {
          attachmentDiv.after(topicNameButtonContainer);
        }
      }
    } else {
      bubble.classList.add('hide-name');
    }

    if(this.chat.type === 'pinned') {
      savedFrom = `${this.chat.peerId}_${message.mid}`;
    }

    const isThreadStarter = messageWithReplies && messageWithReplies.mid === this.chat.threadId;
    if(isThreadStarter) {
      bubble.classList.add('is-thread-starter', 'is-group-last');
    }

    if(savedFrom && (this.chat.type === 'pinned' || fwdFrom.saved_from_msg_id) && this.peerId !== REPLIES_PEER_ID) {
      const goto = document.createElement('div');
      goto.classList.add('bubble-beside-button', 'goto-original', 'tgico-arrow_next');
      bubbleContainer.append(goto);
      bubble.dataset.savedFrom = savedFrom;
      bubble.classList.add('with-beside-button');
    }

    bubble.classList.add(isOut ? 'is-out' : 'is-in');

    if(withReplies) {
      const isFooter = MessageRender.renderReplies({
        bubble,
        bubbleContainer,
        message: messageWithReplies,
        messageDiv,
        loadPromises,
        lazyLoadQueue: this.lazyLoadQueue
      });

      if(isFooter) {
        canHaveTail = true;
      } else {
        bubble.classList.add('with-beside-replies');
      }
    }

    if(isMessage) {
      this.appendReactionsElementToBubble(bubble, message, reactionsMessage);
    }

    /* if(isMessage) {
      const reactionHover = document.createElement('div');
      reactionHover.classList.add('bubble-reaction-hover');
      contentWrapper.append(reactionHover);
    } */

    if(canHaveTail) {
      bubble.classList.add('can-have-tail');

      bubbleContainer.append(generateTail());
    }

    return ret;
  }

  private appendReactionsElementToBubble(
    bubble: HTMLElement,
    message: Message.message,
    reactionsMessage: Message.message,
    changedResults?: ReactionCount[]
  ) {
    if(this.peerId.isUser() && USER_REACTIONS_INLINE/*  || true */) {
      return;
    }

    if(!reactionsMessage?.reactions || !reactionsMessage.reactions.results.length) {
      return;
    }

    // message = this.appMessagesManager.getMessageWithReactions(message);

    const reactionsElement = new ReactionsElement();
    reactionsElement.init(reactionsMessage, 'block', bubble.middlewareHelper.get());
    reactionsElement.render(changedResults);

    if(bubble.classList.contains('is-message-empty')) {
      bubble.querySelector('.bubble-content-wrapper').append(reactionsElement);
    } else {
      const messageDiv = bubble.querySelector('.message');
      if(bubble.classList.contains('is-multiple-documents')) {
        const documentContainer = messageDiv.lastElementChild as HTMLElement;
        let documentMessageDiv = documentContainer.querySelector('.document-message');

        let timeSpan: HTMLElement = documentMessageDiv && documentMessageDiv.querySelector('.time');
        if(!timeSpan) {
          timeSpan = MessageRender.setTime({
            chatType: this.chat.type,
            message,
            reactionsMessage
          });
        }

        reactionsElement.append(timeSpan);

        if(!documentMessageDiv) {
          documentMessageDiv = document.createElement('div');
          documentMessageDiv.classList.add('document-message');
          documentContainer.querySelector('.document-wrapper').prepend(documentMessageDiv);
        }

        documentMessageDiv.append(reactionsElement);
      } else {
        const timeSpan = Array.from(bubble.querySelectorAll('.time')).pop();
        reactionsElement.append(timeSpan);

        messageDiv.append(reactionsElement);
      }
    }
  }

  private wrapTitleAndRank(title: HTMLElement, rank: ReturnType<typeof getParticipantRank> | 0) {
    const wrappedRank = this.createBubbleNameRank(rank);
    // title.after(wrappedRank);
    const container = document.createElement('div');
    container.classList.add('title-flex');
    title.replaceWith(container);
    container.append(title, wrappedRank);
  }

  private createBubbleNameRank(rank: ReturnType<typeof getParticipantRank> | 0) {
    const span = document.createElement('span');
    span.classList.add('bubble-name-rank');
    span.append(wrapParticipantRank(rank));
    return span;
  }

  private prepareToSaveScroll(reverse?: boolean, sliceTop?: boolean, sliceBottom?: boolean) {
    const isMounted = !!this.chatInner.parentElement;
    if(!isMounted) {
      return {};
    }

    const log = this.log.bindPrefix('prepareToSaveScroll');
    log('save');
    const scrollSaver = this.createScrollSaver(reverse);
    scrollSaver.save(); // * let's save scroll position by point before the slicing, not after

    if((sliceTop || sliceBottom) && this.getRenderedLength() && !this.chat.setPeerPromise) {
      const viewportSlice = this.getViewportSlice(true);
      if(!sliceTop) viewportSlice.invisibleTop.length = 0;
      if(!sliceBottom) viewportSlice.invisibleBottom.length = 0;
      this.deleteViewportSlice(viewportSlice, true);
    }

    // scrollSaver.save(); // ! slicing will corrupt scroll position
    // const saved = scrollSaver.getSaved();
    // const hadScroll = saved.scrollHeight !== saved.clientHeight;

    return {
      restoreScroll: () => {
        log('restore');
        // scrollSaver.restore(_history.length === 1 && !reverse ? false : true);
        scrollSaver.restore(reverse);
        this.onRenderScrollSet(scrollSaver.getSaved());
      },
      scrollSaver
    };
  }

  public async performHistoryResult(
    historyResult: HistoryResult | {history: (Message.message | Message.messageService | number)[]},
    reverse: boolean
  ) {
    const log = false ? this.log.bindPrefix('perform-' + (Math.random() * 1000 | 0)) : undefined;
    log?.('start', this.chatInner.parentElement);

    let history = historyResult.history;
    history = history.slice(); // need

    if(this.needReflowScroll) {
      reflowScrollableElement(this.scrollable.container);
      this.needReflowScroll = false;
    }

    const cb = (message: Message.message | Message.messageService) => {
      if(!message) {
        return;
      } else if(message.pFlags.local) {
        return this.processLocalMessageRender(message);
      } else {
        return this.safeRenderMessage(message, reverse);
      }
    };

    const messages = await Promise.all(history.map((mid) => {
      return typeof(mid) === 'number' ? this.chat.getMessage(mid) : mid;
    }));

    const setLoadedPromises: Promise<any>[] = [];
    if(!this.scrollable.loadedAll['bottom'] || !this.scrollable.loadedAll['top']) {
      let isEnd = (historyResult as HistoryResult).isEnd;
      if(!isEnd) {
        const historyStorage = await this.chat.getHistoryStorage();
        const firstSlice = historyStorage.history.first;
        const lastSlice = historyStorage.history.last;
        isEnd = {top: false, bottom: false, both: false};
        if(firstSlice.isEnd(SliceEnd.Bottom) && (!firstSlice.length || history.includes(firstSlice[0]))) {
          isEnd.bottom = true;
        }

        if(lastSlice.isEnd(SliceEnd.Top) && (!lastSlice.length || history.includes(lastSlice[lastSlice.length - 1]))) {
          isEnd.top = true;
        }
      }

      if(!isEnd.bottom && this.setPeerOptions) {
        const {lastMsgId, topMessage, savedPosition} = this.setPeerOptions;
        this.setPeerOptions = undefined;
        if((!lastMsgId && !savedPosition) || this.bubbles[topMessage] || lastMsgId === topMessage) {
          isEnd.bottom = true;
        }
      }

      if(isEnd.top) setLoadedPromises.push(this.setLoaded('top', true));
      if(isEnd.bottom) setLoadedPromises.push(this.setLoaded('bottom', true));
    }

    await Promise.all(setLoadedPromises);

    // ! it is important to insert bubbles to group reversed way
    // const length = history.length, promises: Promise<any>[] = [];
    // if(reverse) for(let i = 0; i < length; ++i) promises.push(cb(messages[i]));
    // else for(let i = length - 1; i >= 0; --i) promises.push(cb(messages[i]));
    const promises = messages.map(cb);

    // cannot combine them into one promise
    await Promise.all(promises);
    await this.messagesQueuePromise;

    // * have to check again, because it can be skipped above
    const placeholderPromise = this.checkIfEmptyPlaceholderNeeded();
    placeholderPromise && await placeholderPromise;
    this.messagesQueuePromise && await this.messagesQueuePromise;

    if(this.scrollable.loadedAll.top && this.messagesQueueOnRenderAdditional) {
      this.messagesQueueOnRenderAdditional();
      this.messagesQueueOnRenderAdditional?.(); // * can set it second time
    }

    log?.('performHistoryResult end');
  }

  private onRenderScrollSet(state?: {scrollHeight: number, clientHeight: number}) {
    const className = 'has-sticky-dates';
    if(!this.container.classList.contains(className)) {
      const isLoading = !this.preloader.detached;

      if(isLoading ||
        (
          state ??= {
            scrollHeight: this.scrollable.scrollHeight,
            clientHeight: this.scrollable.container.clientHeight
          },
          state.scrollHeight !== state.clientHeight
        )
      ) {
        /* for(const timestamp in this.dateMessages) {
          const dateMessage = this.dateMessages[timestamp];
          dateMessage.div.classList.add('is-sticky');
        } */

        const middleware = this.getMiddleware();
        const callback = () => {
          if(!middleware()) return;
          this.container.classList.add(className);
        };

        if(this.willScrollOnLoad) {
          callback();
        } else {
          setTimeout(callback, 600);
        }

        return;
      }
    }

    this.willScrollOnLoad = undefined;
  }

  public onDatePick = (timestamp: number) => {
    const peerId = this.peerId;
    this.managers.appMessagesManager.requestHistory({
      peerId,
      offsetId: 0,
      limit: 2,
      addOffset: -1,
      offsetDate: timestamp,
      threadId: this.chat.threadId
    }).then((history) => {
      if(!history?.messages?.length) {
        this.log.error('no history!');
        return;
      } else if(this.peerId !== peerId) {
        return;
      }

      this.chat.setMessageId((history.messages[0] as MyMessage).mid);
      // console.log('got history date:', history);
    });
  };

  public requestHistory(offsetId: number, limit: number, backLimit: number): Promise<AckedResult<HistoryResult>>  {
    // const middleware = this.getMiddleware();
    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      return this.managers.acknowledged.appMessagesManager.getHistory({
        peerId: this.peerId,
        offsetId,
        limit,
        backLimit,
        threadId: this.chat.threadId
      });
    } else if(this.chat.type === 'pinned') {
      return this.managers.acknowledged.appMessagesManager.getHistory({
        peerId: this.peerId,
        inputFilter: {_: 'inputMessagesFilterPinned'},
        offsetId,
        limit,
        backLimit
      });
    } else if(this.chat.type === 'scheduled') {
      return this.managers.acknowledged.appMessagesManager.getScheduledMessages(this.peerId).then((ackedResult) => {
        return {
          cached: ackedResult.cached,
          result: Promise.resolve(ackedResult.result).then((mids) => {
            return {
              history: mids.slice().reverse(),
              count: mids.length,
              isEnd: {
                both: true,
                bottom: true,
                top: true
              }
            };
          })
        };
      });
    }
  }

  private async animateAsLadder(additionMsgId: number, additionMsgIds: number[], isAdditionRender: boolean, backLimit: number, maxId: number) {
    /* const middleware = this.getMiddleware();
    await this.ladderDeferred; */

    const log = this.log.bindPrefix('ladder');
    if(this.chat.setPeerPromise && !this.resolveLadderAnimation) {
      log.warn('will be delayed');
      // @ts-ignore
      this.resolveLadderAnimation = this.animateAsLadder.bind(this, additionMsgId, additionMsgIds, isAdditionRender, backLimit, maxId);
      return;
    }

    /* if(!middleware()) {
      return;
    } */

    if(!Object.keys(this.bubbles).length) {
      log.warn('no bubbles');
      return;
    }

    let sortedMids = getObjectKeysAndSort(this.bubbles, 'desc');

    if(isAdditionRender && additionMsgIds.length) {
      sortedMids = sortedMids.filter((mid) => !additionMsgIds.includes(mid));
    }

    let targetMid: number;
    if(backLimit) {
      targetMid = maxId || Math.max(...sortedMids); // * on discussion enter
    } else {
      if(additionMsgId) {
        targetMid = additionMsgId;
      } else { // * if maxId === 0
        targetMid = Math.max(...sortedMids);
      }
    }

    const topIds = sortedMids.slice(sortedMids.findIndex((mid) => targetMid > mid));
    const middleIds = isAdditionRender ? [] : [targetMid];
    const bottomIds = isAdditionRender ? [] : sortedMids.slice(0, sortedMids.findIndex((mid) => targetMid >= mid)).reverse();

    if(DEBUG) {
      log('targeting mid:', targetMid, maxId, additionMsgId,
        topIds.map((m) => getServerMessageId(m)),
        bottomIds.map((m) => getServerMessageId(m)));
    }

    const setBubbles: HTMLElement[] = [];

    this.chatInner.classList.add('zoom-fading');
    const delay = isAdditionRender ? 10 : 40;
    const offsetIndex = isAdditionRender ? 0 : 1;
    const animateAsLadder = (mids: number[], offsetIndex = 0) => {
      const animationPromise = deferredPromise<void>();
      let lastMsDelay = 0;
      mids.forEach((mid, idx) => {
        const bubble = this.bubbles[mid];
        if(!bubble || this.skippedMids.has(mid)) {
          log.warn('no bubble by mid:', mid);
          return;
        }

        lastMsDelay = ((idx + offsetIndex) || 0.1) * delay;
        // lastMsDelay = (idx + offsetIndex) * delay;
        // lastMsDelay = (idx || 0.1) * 1000;

        const contentWrapper = bubble.lastElementChild as HTMLElement;
        const elementsToAnimate: HTMLElement[] = [contentWrapper];
        const item = this.bubbleGroups.getItemByBubble(bubble);
        if(item && item.group.avatar && item.group.lastItem === item) {
          elementsToAnimate.push(item.group.avatar);
        }

        elementsToAnimate.forEach((element) => {
          element.classList.add('zoom-fade', 'can-zoom-fade');
          element.style.transitionDelay = lastMsDelay + 'ms';
        });

        if(idx === (mids.length - 1)) {
          const onTransitionEnd = (e: TransitionEvent) => {
            if(e.target !== contentWrapper) {
              return;
            }

            animationPromise.resolve();
            contentWrapper.removeEventListener('transitionend', onTransitionEnd);
          };

          contentWrapper.addEventListener('transitionend', onTransitionEnd);
        }

        setBubbles.push(...elementsToAnimate);
      });

      if(!mids.length) {
        animationPromise.resolve();
      }

      return {lastMsDelay, animationPromise};
    };

    const topRes = animateAsLadder(topIds, offsetIndex);
    const middleRes = animateAsLadder(middleIds);
    const bottomRes = animateAsLadder(bottomIds, offsetIndex);
    const promises = [topRes.animationPromise, middleRes.animationPromise, bottomRes.animationPromise];
    const delays: number[] = [topRes.lastMsDelay, middleRes.lastMsDelay, bottomRes.lastMsDelay];

    if(this.onAnimateLadder) {
      await this.onAnimateLadder();
    }

    fastRaf(() => {
      this.setStickyDateManually(); // ! maybe it's not efficient

      setBubbles.forEach((element) => {
        element.classList.remove('zoom-fade');
      });
    });

    let promise: Promise<any>;
    if(topIds.length || middleIds.length || bottomIds.length) {
      promise = Promise.all(promises);

      dispatchHeavyAnimationEvent(promise, Math.max(...delays) + 200) // * 200 - transition time
      .then(() => {
        fastRaf(() => {
          setBubbles.forEach((element) => {
            element.style.transitionDelay = '';
            element.classList.remove('can-zoom-fade');
          });

          this.chatInner.classList.remove('zoom-fading');
        });

        // ! в хроме, каким-то образом из-за zoom-fade класса начинает прыгать скролл при подгрузке сообщений вверх,
        // ! т.е. скролл не ставится, так же, как в сафари при translateZ на блок выше scrollable
        // if(!IS_SAFARI) {
        //   this.needReflowScroll = true;
        // }
      });
    }

    return promise;
  }

  private async renderEmptyPlaceholder(
    type: 'group' | 'saved' | 'noMessages' | 'noScheduledMessages' | 'greeting' | 'restricted',
    bubble: HTMLElement,
    message: any,
    elements: (Node | string)[]
  ) {
    const BASE_CLASS = 'empty-bubble-placeholder';
    bubble.classList.add(BASE_CLASS, BASE_CLASS + '-' + type);

    let title: HTMLElement;
    if(type === 'group') title = i18n('GroupEmptyTitle1');
    else if(type === 'saved') title = i18n('ChatYourSelfTitle');
    else if(type === 'noMessages' || type === 'greeting') title = i18n('NoMessages');
    else if(type === 'noScheduledMessages') title = i18n('NoScheduledMessages');
    else if(type === 'restricted') {
      title = document.createElement('span');
      title.innerText = await this.managers.appPeersManager.getRestrictionReasonText(this.peerId);
    }
    title.classList.add('center', BASE_CLASS + '-title');

    elements.push(title);

    let listElements: HTMLElement[];
    if(type === 'group') {
      elements.push(i18n('GroupEmptyTitle2'));
      listElements = [
        i18n('GroupDescription1'),
        i18n('GroupDescription2'),
        i18n('GroupDescription3'),
        i18n('GroupDescription4')
      ];
    } else if(type === 'saved') {
      listElements = [
        i18n('ChatYourSelfDescription1'),
        i18n('ChatYourSelfDescription2'),
        i18n('ChatYourSelfDescription3'),
        i18n('ChatYourSelfDescription4')
      ];
    } else if(type === 'greeting') {
      const subtitle = i18n('NoMessagesGreetingsDescription');
      subtitle.classList.add('center', BASE_CLASS + '-subtitle');

      // findAndSplice(this.messagesQueue, q => q.bubble === bubble);

      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add(BASE_CLASS + '-sticker');

      const middleware = this.getMiddleware();

      await this.managers.appStickersManager.getGreetingSticker().then(async(doc) => {
        if(!middleware()) return;

        const loadPromises: Promise<any>[] = [];
        await wrapSticker({
          doc,
          // doc: appDocsManager.getDoc("5431607541660389336"), // cubigator mockup
          div: stickerDiv,
          middleware,
          lazyLoadQueue: this.lazyLoadQueue,
          group: this.chat.animationGroup,
          // play: !!message.pending || !multipleRender,
          play: true,
          loop: true,
          withThumb: true,
          loadPromises,
          liteModeKey: 'stickers_chat'
        });

        attachClickEvent(stickerDiv, (e) => {
          cancelEvent(e);
          EmoticonsDropdown.onMediaClick({target: e.target});
        });

        return Promise.all(loadPromises);
      });

      // this.renderMessagesQueue({
      //   message,
      //   bubble,
      //   reverse: false,
      //   promises: [loadPromise]
      // });

      elements.push(subtitle, stickerDiv);
    }

    if(listElements) {
      elements.push(
        ...listElements.map((elem) => {
          const span = document.createElement('span');
          span.classList.add(BASE_CLASS + '-list-item');
          span.append(elem);
          return span;
        })
      );

      if(type === 'group') {
        listElements.forEach((elem) => {
          const i = document.createElement('span');
          i.classList.add('tgico-check');
          elem.prepend(i);
        });
      } else if(type === 'saved') {
        listElements.forEach((elem) => {
          const i = document.createElement('span');
          i.classList.add(BASE_CLASS + '-list-bullet');
          i.innerText = '•';
          elem.prepend(i);
        });
      }
    }

    if(elements.length > 1) {
      bubble.classList.add('has-description');
    }

    elements.forEach((element: any) => element.classList.add(BASE_CLASS + '-line'));
  }

  private async processLocalMessageRender(
    message: Message.message | Message.messageService,
    animate?: boolean,
    middleware = this.getMiddleware()
  ) {
    const isSponsored = !!(message as Message.message).pFlags.sponsored;
    const m = middlewarePromise(middleware);

    const p: Parameters<ChatBubbles['safeRenderMessage']>[4] = async(result) => {
      const {bubble} = await m(result);
      if(!bubble) {
        return result;
      }

      (bubble as any).message = message;

      bubble.classList.add('is-group-last', 'is-group-first');

      const updatePosition = () => {
        if(this.updatePlaceholderPosition === updatePosition) {
          this.updatePlaceholderPosition = undefined;
        }

        appendTo[method](bubble);
      };

      if(!isSponsored) {
        bubble.classList.add('bubble-first');
        bubble.classList.remove('can-have-tail', 'is-in');
      }

      const elements: (Node | string)[] = [];
      const isBot = this.chat.isBot;
      let renderPromise: Promise<any>, appendTo = this.container, method: 'append' | 'prepend' = 'append';
      if(this.chat.isRestricted) {
        renderPromise = this.renderEmptyPlaceholder('restricted', bubble, message, elements);
      } else if(isSponsored) {
        let text: LangPackKey, mid: number, startParam: string, callback: () => void;

        bubble.classList.add('avoid-selection');
        bubble.style.order = '999999';

        const sponsoredMessage = this.sponsoredMessage = (message as Message.message).sponsoredMessage;
        const peerId = getPeerId(sponsoredMessage.from_id);
        // const peer = this.appPeersManager.getPeer(peerId);
        if(sponsoredMessage.channel_post) {
          text = 'OpenChannelPost';
          mid = sponsoredMessage.channel_post;
        } else if(sponsoredMessage.start_param || isBot) {
          text = 'Chat.Message.ViewBot';
          startParam = sponsoredMessage.start_param;
        } else {
          text = await this.managers.appPeersManager.isAnyGroup(peerId) ? 'Chat.Message.ViewGroup' : 'Chat.Message.ViewChannel';
        }

        if(sponsoredMessage.chat_invite) {
          callback = () => {
            PopupElement.createPopup(PopupJoinChatInvite, sponsoredMessage.chat_invite_hash, sponsoredMessage.chat_invite as ChatInvite.chatInvite);
          };
        } else if(sponsoredMessage.chat_invite_hash) {
          callback = () => {
            const link: InternalLink = {
              _: INTERNAL_LINK_TYPE.JOIN_CHAT,
              invite: sponsoredMessage.chat_invite_hash
            };

            internalLinkProcessor.processInternalLink(link);
          };
        } else {
          callback = () => {
            this.chat.appImManager.setInnerPeer({
              peerId,
              lastMsgId: mid,
              startParam
            });
          };
        }

        const button = this.makeViewButton({text});

        this.observer.observe(button, this.viewsObserverCallback);

        if(callback) {
          attachClickEvent(button, callback);
        }

        bubble.querySelector('.bubble-content').prepend(button);

        appendTo = this.chatInner;
        method = 'append';
        animate = false;

        // return result;
      } else if(isBot && message._ === 'message') {
        const b = document.createElement('b');
        b.append(i18n('BotInfoTitle'));
        elements.push(b, '\n\n');
        appendTo = this.chatInner;
        method = 'prepend';
      } else if(this.chat.isAnyGroup && ((await m(this.managers.appPeersManager.getPeer(this.peerId))) as MTChat.chat).pFlags.creator) {
        renderPromise = this.renderEmptyPlaceholder('group', bubble, message, elements);
      } else if(this.chat.type === 'scheduled') {
        renderPromise = this.renderEmptyPlaceholder('noScheduledMessages', bubble, message, elements);
      } else if(rootScope.myId === this.peerId) {
        renderPromise = this.renderEmptyPlaceholder('saved', bubble, message, elements);
      } else if(this.peerId.isUser() && !isBot && await m(this.chat.canSend()) && this.chat.type === 'chat') {
        renderPromise = this.renderEmptyPlaceholder('greeting', bubble, message, elements);
      } else {
        renderPromise = this.renderEmptyPlaceholder('noMessages', bubble, message, elements);
      }

      if(renderPromise) {
        await renderPromise;
      }

      if(elements.length) {
        const messageDiv = bubble.querySelector('.message, .service-msg');
        messageDiv.prepend(...elements);
      }

      const isWaitingForAnimation = !!this.messagesQueueOnRenderAdditional;
      const noTransition = this.setPeerCached && !isWaitingForAnimation;
      if(noTransition) {
        const setOn = bubble.firstElementChild;
        setOn.classList.add('no-transition');

        if(this.chat.setPeerPromise) {
          this.chat.setPeerPromise.catch(noop).finally(() => {
            setOn.classList.remove('no-transition');
          });
        }
      }

      if(animate === undefined && !noTransition) {
        animate = true;
      }

      if(isWaitingForAnimation || animate) {
        this.updatePlaceholderPosition = updatePosition;

        this.onAnimateLadder = () => {
          // appendTo[method](bubble);
          this.onAnimateLadder = undefined;

          // need raf here because animation won't fire if this message is single
          if(!this.messagesQueuePromise) {
            return fastRafPromise();
          }
        };
      } else if(this.chat.setPeerPromise) {
        this.attachPlaceholderOnRender = () => {
          this.attachPlaceholderOnRender = undefined;
          updatePosition();
          // appendTo[method](bubble);
        };
      } else {
        this.updatePlaceholderPosition = updatePosition;
        // appendTo[method](bubble);
      }

      if(!isWaitingForAnimation && animate) {
        await m(getHeavyAnimationPromise());
        const additionMsgIds = getObjectKeysAndSort(this.bubbles);
        indexOfAndSplice(additionMsgIds, message.mid);
        this.animateAsLadder(message.mid, additionMsgIds, false, 0, 0);
      }

      bubble.middlewareHelper.onDestroy(() => {
        if(this.emptyPlaceholderBubble === bubble) {
          this.emptyPlaceholderBubble = undefined;
        }
      });

      this.emptyPlaceholderBubble = bubble;

      return result;
    };

    return this.safeRenderMessage(
      message,
      !isSponsored,
      undefined,
      false,
      p
    );
  }

  private makeViewButton<T extends Parameters<typeof Button>[1]>(options: T) {
    return Button('btn-primary btn-primary-transparent bubble-view-button', options);
  }

  private generateLocalMessageId(addOffset = 0) {
    // const INCREMENT = 0x10;
    const offset = (this.chat.type === 'scheduled' ? -1 : 0) + addOffset;
    // offset = generateMessageId(offset);
    // id: -Math.abs(+this.peerId * INCREMENT + offset),
    const id = -Math.abs(offset);
    // const mid = -Math.abs(generateMessageId(id));
    const mid = id;
    return {id, mid};
  }

  private async generateLocalFirstMessage<T extends boolean>(service?: T, fill?: (message: GenerateLocalMessageType<T>) => void, addOffset = 0): Promise<GenerateLocalMessageType<T>> {
    const {id, mid} = this.generateLocalMessageId(addOffset);
    let message: Omit<Message.message | Message.messageService, 'message'> & {message?: string} = {
      _: service ? 'messageService' : 'message',
      date: 0,
      id,
      mid,
      peer_id: await this.managers.appPeersManager.getOutputPeer(this.peerId),
      pFlags: {
        local: true
      }
    };

    if(!service) {
      message.message = '';
    }/*  else {
      (message as Message.messageService).action = {} as any;
    } */

    assumeType<GenerateLocalMessageType<T>>(message);

    fill?.(message);

    const savedMessages = await this.managers.appMessagesManager.saveMessages([message], {storage: new Map() as any});
    message = savedMessages[0];
    message.mid = mid;
    return message as any;
  }

  public getViewportSlice(useExtra?: boolean) {
    // this.log.trace('viewport slice');
    return getViewportSlice({
      overflowElement: this.scrollable.container,
      selector: '.bubbles-date-group .bubble:not(.is-date)',
      extraSize: useExtra ? Math.max(700, windowSize.height) * 2 : undefined,
      extraMinLength: useExtra ? 5 : undefined
    });
  }

  public deleteViewportSlice(slice: ReturnType<ChatBubbles['getViewportSlice']>, ignoreScrollSaving?: boolean) {
    if(DO_NOT_SLICE_VIEWPORT_ON_RENDER) {
      return;
    }

    const {invisibleTop, invisibleBottom} = slice;
    const invisible = invisibleTop.concat(invisibleBottom);
    if(!invisible.length) {
      return;
    }

    const log = this.log.bindPrefix('VIEWPORT-SLICE');

    if(invisibleTop.length) {
      this.setLoaded('top', false);
      this.getHistoryTopPromise = undefined;
      log('will slice top', invisible);
    }

    if(invisibleBottom.length) {
      this.setLoaded('bottom', false);
      this.getHistoryBottomPromise = undefined;
      log('will slice bottom', invisible);
    }

    const mids = invisible.map(({element}) => +element.dataset.mid);

    let scrollSaver: ScrollSaver;
    if(/* !!invisibleTop.length !== !!invisibleBottom.length &&  */!ignoreScrollSaving) {
      scrollSaver = this.createScrollSaver(!!invisibleTop.length);
      scrollSaver.save();
    }

    log('slicing mids', mids);
    this.deleteMessagesByIds(mids, false, true);

    if(scrollSaver) {
      scrollSaver.restore();
    } else if(invisibleTop.length) {
      this.scrollable.lastScrollPosition = this.scrollable.scrollTop;
    }
  }

  public sliceViewport(ignoreHeavyAnimation?: boolean) {
    // Safari cannot reset the scroll.
    if(IS_SAFARI || (this.isHeavyAnimationInProgress && !ignoreHeavyAnimation) || DO_NOT_SLICE_VIEWPORT) {
      return;
    }

    // const scrollSaver = new ScrollSaver(this.scrollable, true);
    // scrollSaver.save();
    const slice = this.getViewportSlice(true);
    // if(IS_SAFARI) slice.invisibleTop = [];
    this.deleteViewportSlice(slice);
    // scrollSaver.restore();
  }

  private async setLoaded(side: SliceSides, value: boolean, checkPlaceholders = true) {
    const willChange = this.scrollable.loadedAll[side] !== value;
    if(!willChange) {
      return;
    }

    const log = this.log.bindPrefix('setLoaded');
    log('change', side, value);

    this.scrollable.loadedAll[side] = value;
    this.scrollable.onScroll(); // ! WARNING
    // return;

    if(!checkPlaceholders) {
      return;
    }

    if(!this.chat.isRestricted) {
      if(side === 'bottom' && this.chat.isBroadcast/*  && false */) {
        this.toggleSponsoredMessage(value);
      }

      if(side === 'top' && value && this.chat.isBot) {
        return this.renderBotPlaceholder();
      }
    }

    return this.checkIfEmptyPlaceholderNeeded();
  }

  private async toggleSponsoredMessage(value: boolean) {
    const log = this.log.bindPrefix('sponsored');
    log('checking');
    const {mid} = this.generateLocalMessageId(SPONSORED_MESSAGE_ID_OFFSET);
    if(value) {
      const middleware = this.getMiddleware(() => {
        return this.scrollable.loadedAll.bottom && this.getSponsoredMessagePromise === promise;
      });

      const promise = this.getSponsoredMessagePromise = this.managers.appChatsManager.getSponsoredMessage(this.peerId.toChatId())
      .then(async(sponsoredMessages) => {
        if(!middleware() || sponsoredMessages._ === 'messages.sponsoredMessagesEmpty') {
          return;
        }

        const sponsoredMessage = sponsoredMessages.messages[0];
        if(!sponsoredMessage) {
          log('no message');
          return;
        }

        const messagePromise = this.generateLocalFirstMessage(false, (message) => {
          message.message = sponsoredMessage.message;
          message.from_id = sponsoredMessage.from_id;
          message.entities = sponsoredMessage.entities;
          message.pFlags.sponsored = true;
          message.sponsoredMessage = sponsoredMessage;
        }, SPONSORED_MESSAGE_ID_OFFSET);

        return Promise.all([
          messagePromise,
          this.getHistoryTopPromise, // wait for top load and execute rendering after or with it
          this.messagesQueuePromise
        ]).then(([message]) => {
          if(!middleware()) return;
          // this.processLocalMessageRender(message);
          log('rendering', message);
          return this.performHistoryResult({history: [message]}, false);
        });
      }).finally(() => {
        if(this.getSponsoredMessagePromise === promise) {
          this.getSponsoredMessagePromise = undefined;
        }
      });
    } else {
      log('clearing rendered', mid);
      this.getSponsoredMessagePromise = undefined;
      this.deleteMessagesByIds([mid]);
    }
  }

  private async renderBotPlaceholder() {
    const _log = this.log.bindPrefix('bot placeholder');

    const middleware = this.getMiddleware();
    const result = await this.managers.acknowledged.appProfileManager.getProfile(this.peerId.toUserId());
    _log('getting profile, cached:', result.cached);
    const processPromise = result.result.then(async(userFull) => {
      if(!middleware()) {
        return;
      }

      if(!userFull.bot_info?.description) {
        _log.warn('no description');
        return this.checkIfEmptyPlaceholderNeeded();
      }

      const message = await this.generateLocalFirstMessage(false, (message) => {
        const botInfo = userFull.bot_info;
        message.message = botInfo.description;
        if(botInfo.description_document) message.media = {_: 'messageMediaDocument', document: botInfo.description_document, pFlags: {}};
        if(botInfo.description_photo) message.media = {_: 'messageMediaPhoto', photo: botInfo.description_photo, pFlags: {}};
      });

      if(!middleware()) {
        return;
      }

      _log('rendering');
      const renderPromise = this.processLocalMessageRender(message, !result.cached).then(() => {
        _log('done');
      });

      return {renderPromise};
    });

    if(!result.cached) {
      return;
    }

    return processPromise;
  }

  public async checkIfEmptyPlaceholderNeeded() {
    if(this.scrollable.loadedAll.top &&
      this.scrollable.loadedAll.bottom &&
      this.emptyPlaceholderBubble === undefined &&
      (
        this.chat.isRestricted ||
        (
          Object.keys(this.bubbles).length &&
          !this.getRenderedLength()
        ) ||
        (this.chat.type === 'scheduled' && !Object.keys(this.bubbles).length) ||
        !(await this.chat.getHistoryStorage()).count
      )
    ) {
      this.log('inject empty peer placeholder');

      const message = await this.generateLocalFirstMessage(true);
      return {renderPromise: this.processLocalMessageRender(message)};
    }
  }

  public getHistory1(maxId?: number, reverse?: boolean, isBackLimit?: boolean, additionMsgId?: number, justLoad?: boolean) {
    const middleware = this.getMiddleware(justLoad ? undefined : () => {
      return (reverse ? this.getHistoryTopPromise : this.getHistoryBottomPromise) === waitPromise;
    });

    const result = this.getHistory(maxId, reverse, isBackLimit, additionMsgId, justLoad, middleware);
    const waitPromise = result.then((res) => res && (res.waitPromise || res.promise));

    (reverse ? this.getHistoryTopPromise = waitPromise : this.getHistoryBottomPromise = waitPromise);
    waitPromise.then(() => {
      if(!middleware()) {
        return;
      }

      (reverse ? this.getHistoryTopPromise = undefined : this.getHistoryBottomPromise = undefined);

      if(!justLoad) {
        // preload more
        // if(!isFirstMessageRender) {
        if(this.chat.type === 'chat'/*  || this.chat.type === 'discussion' */) {
          /* const storage = this.appMessagesManager.getHistoryStorage(peerId, this.chat.threadId);
            const isMaxIdInHistory = storage.history.indexOf(maxId) !== -1;
            if(isMaxIdInHistory || true) { // * otherwise it is a search or jump */
          setTimeout(() => {
            if(reverse) {
              this.loadMoreHistory(true, true);
            } else {
              this.loadMoreHistory(false, true);
            }
          }, 0);
          // }
        }
        // }

        // this.scrollable.onScroll();
      }
    });

    return result;
  }

  // private async getDiscussionMessages() {
  //   const mids = await this.chat.getMidsByMid(this.chat.threadId);
  //   return Promise.all(mids.map((mid) => this.chat.getMessage(mid)));
  // }

  /**
   * Load and render history
   * @param maxId max message id
   * @param reverse 'true' means up
   * @param isBackLimit is search
   * @param additionMsgId for the last message
   * @param justLoad do not render
   */
  public async getHistory(
    maxId = 0,
    reverse = false,
    isBackLimit = false,
    additionMsgId = 0,
    justLoad = false,
    middleware?: () => boolean
  ): Promise<{cached: boolean, promise: Promise<void>, waitPromise: Promise<any>}> {
    const peerId = this.peerId;

    const isBroadcast = this.chat.isBroadcast;
    // console.time('appImManager call getHistory');
    const pageCount = Math.min(30, windowSize.height / 40/*  * 1.25 */ | 0);
    // const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = isBroadcast ? 20 : (Object.keys(this.bubbles).length > 0 ? Math.max(35, pageCount) : pageCount);
    // const realLoadCount = pageCount;//const realLoadCount = 50;
    let loadCount = realLoadCount;

    /* if(TEST_SCROLL) {
      //loadCount = 1;
      if(Object.keys(this.bubbles).length > 0)
      return {cached: false, promise: Promise.resolve(true)};
    } */
    if(TEST_SCROLL !== undefined) {
      if(TEST_SCROLL) {
        if(Object.keys(this.bubbles).length > 0) {
          --TEST_SCROLL;
        }
      } else {
        return {cached: false, promise: Promise.resolve(), waitPromise: Promise.resolve()};
      }
    }

    // //console.time('render history total');

    let backLimit = 0;
    if(isBackLimit) {
      backLimit = loadCount;

      if(!reverse) { // if not jump
        loadCount = 0;
        // maxId = this.appMessagesManager.incrementMessageId(maxId, 1);
      }
    }

    let additionMsgIds: number[];
    if(additionMsgId && !isBackLimit) {
      if(this.chat.type === 'pinned') {
        additionMsgIds = [additionMsgId];
      } else {
        const historyStorage = await this.chat.getHistoryStorage();
        const slice = historyStorage.history.slice;
        // if(slice.length < loadCount && !slice.isEnd(SliceEnd.Both)) {
        if(slice.isEnd(SliceEnd.Bottom) && !slice.isEnd(SliceEnd.Both)) {
          const sliced = historyStorage.history.sliceMe(additionMsgId, 0, loadCount);
          if(sliced) {
            additionMsgIds = [additionMsgId, ...sliced.slice];
          } else {
            additionMsgIds = slice.slice(0, loadCount);
          }

          // * filter last album, because we don't know is it the last item
          for(let i = additionMsgIds.length - 1; i >= 0; --i) {
            const message = await this.chat.getMessage(additionMsgIds[i]);
            if((message as Message.message)?.grouped_id) additionMsgIds.splice(i, 1);
            else break;
          }

          loadCount = Math.max(0, loadCount - additionMsgIds.length);
          maxId = additionMsgIds[additionMsgIds.length - 1] || maxId;
        }
      }
    }

    /* const result = additionMsgID ?
      {history: [additionMsgID]} :
      appMessagesManager.getHistory(this.peerId, maxId, loadCount, backLimit); */
    let result: AckedResult<MyHistoryResult> = await this.requestHistory(maxId, loadCount, backLimit) as any;
    let resultPromise: typeof result['result'];

    this.log('i vin brehnya', result, maxId, loadCount, backLimit);

    // const isFirstMessageRender = !!additionMsgID && result.cached && !appMessagesManager.getMessage(additionMsgID).grouped_id;
    // const isAdditionRender = additionMsgIds?.length && !result.cached;
    const isAdditionRender = !!additionMsgIds?.length;
    // const isFirstMessageRender = (this.isFirstLoad && backLimit && !result.cached) || (isAdditionRender && loadCount > 0);
    const isFirstMessageRender = this.isFirstLoad && !result.cached && (isAdditionRender || loadCount > 0);
    if(isAdditionRender) {
      resultPromise = result.result;

      result = {
        cached: true,
        result: Promise.resolve({history: additionMsgIds})
      };

      // additionMsgID = 0;
    }

    this.isFirstLoad = false;

    const processResult = async(historyResult: Awaited<typeof result['result']>) => {
      if((historyResult as HistoryResult).isEnd?.top) {
        if(this.chat.type === 'discussion') { // * inject discussion start
          const serviceStartMessageId = await this.managers.appMessagesManager.getThreadServiceMessageId(this.peerId, this.chat.threadId);
          if(serviceStartMessageId) historyResult.history.push(serviceStartMessageId);
          const mids = await this.chat.getMidsByMid(this.chat.threadId);
          historyResult.history.push(...mids.reverse());
        }

        // synchronize bot placeholder appearance
        await this.managers.appProfileManager.getProfileByPeerId(peerId);

        // await this.setLoaded('top', true);
      }
    };

    const sup = (historyResult: Awaited<typeof result['result']>) => {
      return getHeavyAnimationPromise().then(() => {
        return processResult(historyResult);
      }).then(() => {
        if(!isAdditionRender && additionMsgId) {
          historyResult.history.unshift(additionMsgId);
        }

        return this.performHistoryResult(historyResult, reverse);
      });
    };

    const processPromise = (_promise: typeof result['result']) => {
      const promise = Promise.resolve(_promise).then((result) => {
        if(middleware && !middleware()) {
          throw PEER_CHANGED_ERROR;
        }

        if(justLoad) {
          // нужно делать из-за ранней прогрузки
          this.scrollable.onScroll();
          // fastRaf(() => {
          //   this.scrollable.checkForTriggers();
          // });
          return;
        }

        return sup(result);
      }, (err) => {
        this.log.error('getHistory error:', err);
        throw err;
      });

      return promise;
    };

    let promise: Promise<void>, cached: boolean;
    if(!result.cached) {
      cached = false;
      promise = processPromise(result.result);
    } else if(justLoad) {
      // нужно делать из-за ранней прогрузки
      this.scrollable.onScroll();
      return null;
    } else {
      cached = true;
      promise = sup(await result.result);
    }

    const waitPromise = isAdditionRender ? processPromise(resultPromise) : promise;

    if(isFirstMessageRender && liteMode.isAvailable('animations')/*  && false */) {
      let times = isAdditionRender ? 2 : 1;
      this.messagesQueueOnRenderAdditional = () => {
        this.log('messagesQueueOnRenderAdditional');

        if(--times) return;

        this.messagesQueueOnRenderAdditional = undefined;

        const promise = this.animateAsLadder(additionMsgId, additionMsgIds, isAdditionRender, backLimit, maxId);
        promise.then(() => {
          setTimeout(() => { // preload messages
            this.loadMoreHistory(reverse, true);
          }, 0);
        });
      };
    } else {
      this.messagesQueueOnRenderAdditional = undefined;
    }

    if(justLoad) {
      return null;
    }

    return {cached, promise, waitPromise};
  }

  public async setUnreadDelimiter() {
    if(!(this.chat.type === 'chat' || this.chat.type === 'discussion')) {
      return;
    }

    if(this.attachedUnreadBubble) {
      return;
    }

    const historyMaxId = await this.chat.getHistoryMaxId();
    let readMaxId = await this.managers.appMessagesManager.getReadMaxIdIfUnread(this.peerId, this.chat.threadId);
    if(!readMaxId) return;

    readMaxId = Object.keys(this.bubbles)
    .filter((mid) => !this.bubbles[mid].classList.contains('is-out'))
    .map((i) => +i)
    .sort((a, b) => a - b)
    .find((i) => i > readMaxId);

    if(readMaxId && this.bubbles[readMaxId]) {
      const bubble = this.bubbles[readMaxId];
      if(this.firstUnreadBubble && this.firstUnreadBubble !== bubble) {
        this.firstUnreadBubble.classList.remove('is-first-unread');
        this.firstUnreadBubble = null;
      }

      if(readMaxId !== historyMaxId) {
        bubble.classList.add('is-first-unread');
      }

      this.firstUnreadBubble = bubble;
      this.attachedUnreadBubble = true;
    }
  }

  public deleteEmptyDateGroups() {
    const mustBeCount = this.stickyIntersector ? STICKY_OFFSET : 1;
    let deleted = false;
    for(const i in this.dateMessages) {
      const dateMessage = this.dateMessages[i];

      if(dateMessage.container.childElementCount === mustBeCount) { // only date div + sentinel div
        dateMessage.container.remove();
        if(this.stickyIntersector) {
          this.stickyIntersector.unobserve(dateMessage.container, dateMessage.div);
        }
        delete this.dateMessages[i];
        deleted = true;

        // * no sense in it
        /* if(dateMessage.div === this.previousStickyDate) {
          this.previousStickyDate = undefined;
        } */
      }
    }

    if(!deleted) {
      return;
    }

    if(!Object.keys(this.dateMessages).length) {
      this.container.classList.remove('has-groups');
    }

    this.checkIfEmptyPlaceholderNeeded();
    this.setStickyDateManually();
  }
}

export function generateTail() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 11 20');
  svg.setAttributeNS(null, 'width', '11');
  svg.setAttributeNS(null, 'height', '20');
  svg.classList.add('bubble-tail');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#message-tail-filled');

  svg.append(use);

  return svg;
}
