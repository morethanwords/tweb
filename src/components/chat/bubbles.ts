/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppImManager, ChatSavedPosition, ChatSetInnerPeerOptions, ChatSetPeerOptions} from '../../lib/appManagers/appImManager';
import type {HistoryResult, MyMessage} from '../../lib/appManagers/appMessagesManager';
import type {MyDocument} from '../../lib/appManagers/appDocsManager';
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
import {IS_ANDROID, IS_APPLE, IS_FIREFOX, IS_MOBILE, IS_SAFARI} from '../../environment/userAgent';
import I18n, {FormatterArguments, i18n, langPack, LangPackKey, UNSUPPORTED_LANG_PACK_KEY, _i18n} from '../../lib/langPack';
import ripple from '../ripple';
import {fireMessageEffectByBubble, MessageRender} from './messageRender';
import LazyLoadQueue from '../lazyLoadQueue';
import ListenerSetter from '../../helpers/listenerSetter';
import PollElement, {setQuizHint} from '../poll';
import AudioElement from '../audio';
import {ChannelParticipant, Chat as MTChat, ChatInvite, ChatParticipant, Document, Message, MessageEntity,  MessageMedia,  MessageReplyHeader, Photo, PhotoSize, ReactionCount, SponsoredMessage, User, WebPage, WebPageAttribute, Reaction, BotApp, DocumentAttribute, InputStickerSet, TextWithEntities, FactCheck, WebDocument, MessageExtendedMedia, StarGift} from '../../layer';
import {BOT_START_PARAM, NULL_PEER_ID, REPLIES_PEER_ID, SEND_WHEN_ONLINE_TIMESTAMP, STARS_CURRENCY} from '../../lib/mtproto/mtproto_config';
import {FocusDirection, ScrollStartCallbackDimensions} from '../../helpers/fastSmoothScroll';
import useHeavyAnimationCheck, {getHeavyAnimationPromise, dispatchHeavyAnimationEvent, interruptHeavyAnimation} from '../../hooks/useHeavyAnimationCheck';
import {doubleRaf, fastRaf, fastRafPromise} from '../../helpers/schedulers';
import deferredPromise from '../../helpers/cancellablePromise';
import RepliesElement from './replies';
import DEBUG from '../../config/debug';
import {SliceEnd} from '../../helpers/slicedArray';
import PeerTitle from '../peerTitle';
import findUpClassName from '../../helpers/dom/findUpClassName';
import findUpTag from '../../helpers/dom/findUpTag';
import {hideToast, toast, toastNew} from '../toast';
import {getMiddleware, Middleware} from '../../helpers/middleware';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../../helpers/dom/clickEvent';
import htmlToDocumentFragment from '../../helpers/dom/htmlToDocumentFragment';
import reflowScrollableElement from '../../helpers/dom/reflowScrollableElement';
import setInnerHTML, {setDirection} from '../../helpers/dom/setInnerHTML';
import whichChild from '../../helpers/dom/whichChild';
import {animateSingle, cancelAnimationByKey} from '../../helpers/animation';
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
import SuperIntersectionObserver, {IntersectionCallback} from '../../helpers/dom/superIntersectionObserver';
import generateFakeIcon from '../generateFakeIcon';
import copyFromElement from '../../helpers/dom/copyFromElement';
import PopupElement from '../popups';
import setAttachmentSize, {EXPAND_TEXT_WIDTH} from '../../helpers/setAttachmentSize';
import wrapWebPageDescription from '../wrappers/webPageDescription';
import wrapWebPageTitle from '../wrappers/webPageTitle';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapMessageActionTextNew from '../wrappers/messageActionTextNew';
import isMentionUnread from '../../lib/appManagers/utils/messages/isMentionUnread';
import getMediaFromMessage from '../../lib/appManagers/utils/messages/getMediaFromMessage';
import {getPeerColorIndexByPeer} from '../../lib/appManagers/utils/peers/getPeerColorById';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import getServerMessageId from '../../lib/appManagers/utils/messageId/getServerMessageId';
import {AppManagers} from '../../lib/appManagers/managers';
import {Awaited} from '../../types';
import idleController from '../../helpers/idleController';
import overlayCounter from '../../helpers/overlayCounter';
import {cancelContextMenuOpening} from '../../helpers/dom/attachContextMenuListener';
import contextMenuController from '../../helpers/contextMenuController';
import {AckedResult} from '../../lib/mtproto/superMessagePort';
import middlewarePromise from '../../helpers/middlewarePromise';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import noop from '../../helpers/noop';
import getGroupedText from '../../lib/appManagers/utils/messages/getGroupedText';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import PopupPayment from '../popups/payment';
import isInDOM from '../../helpers/dom/isInDOM';
import getStickerEffectThumb from '../../lib/appManagers/utils/stickers/getStickerEffectThumb';
import attachStickerViewerListeners from '../stickerViewer';
import {makeMediaSize, MediaSize} from '../../helpers/mediaSize';
import wrapSticker from '../wrappers/sticker';
import wrapAlbum from '../wrappers/album';
import wrapDocument from '../wrappers/document';
import wrapGroupedDocuments from '../wrappers/groupedDocuments';
import wrapPhoto from '../wrappers/photo';
import wrapPoll from '../wrappers/poll';
import wrapVideo, {USE_VIDEO_OBSERVER} from '../wrappers/video';
import isRTL, {endsWithRTL} from '../../helpers/string/isRTL';
import NBSP from '../../helpers/string/nbsp';
import DotRenderer from '../dotRenderer';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import {BatchProcessor} from '../../helpers/sortedList';
import wrapUrl from '../../lib/richTextProcessor/wrapUrl';
import getMessageThreadId from '../../lib/appManagers/utils/messages/getMessageThreadId';
import wrapTopicNameButton from '../wrappers/topicNameButton';
import wrapMediaSpoiler, {onMediaSpoilerClick} from '../wrappers/mediaSpoiler';
import {copyTextToClipboard} from '../../helpers/clipboard';
import liteMode from '../../helpers/liteMode';
import getMediaDurationFromMessage from '../../lib/appManagers/utils/messages/getMediaDurationFromMessage';
import wrapLocalSticker from '../wrappers/localSticker';
import {LottieAssetName} from '../../lib/rlottie/lottieLoader';
import getParticipantRank from '../../lib/appManagers/utils/chats/getParticipantRank';
import wrapParticipantRank from '../wrappers/participantRank';
import internalLinkProcessor from '../../lib/appManagers/internalLinkProcessor';
import wrapPeerTitle from '../wrappers/peerTitle';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import SwipeHandler from '../swipeHandler';
import getSelectedText from '../../helpers/dom/getSelectedText';
import {createStoriesViewerWithPeer} from '../stories/viewer';
import {render} from 'solid-js/web';
import {createRoot, createEffect, createSignal} from 'solid-js';
import {StoryPreview, wrapStoryMedia} from '../stories/preview';
import wrapReply from '../wrappers/reply';
import {modifyAckedPromise} from '../../helpers/modifyAckedResult';
import callbackify from '../../helpers/callbackify';
import {avatarNew, findUpAvatar} from '../avatarNew';
import Icon from '../icon';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {_tgico} from '../../helpers/tgico';
import setBlankToAnchor from '../../lib/richTextProcessor/setBlankToAnchor';
import addAnchorListener, {UNSAFE_ANCHOR_LINK_TYPES} from '../../helpers/addAnchorListener';
import {formatDate, formatMonthsDuration} from '../../helpers/date';
import {JSX} from 'solid-js';
import Giveaway, {getGiftAssetName, onGiveawayClick} from './giveaway';
import PopupGiftLink from '../popups/giftLink';
import PopupPremium from '../popups/premium';
import getParents from '../../helpers/dom/getParents';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import shouldDisplayGiftCodeAsGift from '../../helpers/shouldDisplayGiftCodeAsGift';
import anchorCallback from '../../helpers/dom/anchorCallback';
import SimilarChannels from './similarChannels';
import clearMessageId from '../../lib/appManagers/utils/messageId/clearMessageId';
import {ChatType} from './chat';
import {isSavedDialog} from '../../lib/appManagers/utils/dialogs/isDialog';
import getFwdFromName from '../../lib/appManagers/utils/messages/getFwdFromName';
import isForwardOfForward from '../../lib/appManagers/utils/messages/isForwardOfForward';
import {ReactionLayoutType} from './reaction';
import reactionsEqual from '../../lib/appManagers/utils/reactions/reactionsEqual';
import getMainGroupedMessage from '../../lib/appManagers/utils/messages/getMainGroupedMessage';
import cancelClickOrNextIfNotClick from '../../helpers/dom/cancelClickOrNextIfNotClick';
import TranslatableMessage from '../translatableMessage';
import getUnreadReactions from '../../lib/appManagers/utils/messages/getUnreadReactions';
import {setPeerLanguageLoaded} from '../../stores/peerLanguage';
import ButtonIcon from '../buttonIcon';
import PopupAboutAd from '../popups/aboutAd';
import numberThousandSplitter, {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';
import wrapGeo from '../wrappers/geo';
import wrapKeyboardButton from '../wrappers/keyboardButton';
import safePlay from '../../helpers/dom/safePlay';
import flatten from '../../helpers/array/flatten';
import WebPageBox from '../wrappers/webPage';
import showTooltip from '../tooltip';
import wrapTextWithEntities from '../../lib/richTextProcessor/wrapTextWithEntities';
import clearfix from '../../helpers/dom/clearfix';
import {usePeer} from '../../stores/peers';
import safeWindowOpen from '../../helpers/dom/safeWindowOpen';
import findAndSplice from '../../helpers/array/findAndSplice';
import generatePhotoForExtendedMediaPreview from '../../lib/appManagers/utils/photos/generatePhotoForExtendedMediaPreview';
import icon from '../icon';
import {MediaSearchContext} from '../appMediaPlaybackController';
import {wrapRoundVideoBubble} from './bubbleParts/roundVideoBubble';
import {createMessageSpoilerOverlay} from '../messageSpoilerOverlay';
import SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import formatStarsAmount from '../../lib/appManagers/utils/payments/formatStarsAmount';
import {Sparkles} from '../sparkles';
import PopupStars from '../popups/stars';
import addPaidServiceMessage from './bubbleParts/paidServiceMessage';
import namedPromises from '../../helpers/namedPromises';
import {getCurrentNewMediaPopup} from '../popups/newMedia';
import PopupStarGiftInfo from '../popups/starGiftInfo';
import {StarGiftBubble, UniqueStarGiftWebPageBox} from './bubbles/starGift';
import {PremiumGiftBubble} from './bubbles/premiumGift';

export const USER_REACTIONS_INLINE = false;
export const TEST_BUBBLES_DELETION = false;
const USE_MEDIA_TAILS = false;
type MESSAGE_ACTION_TYPE = Message.messageService['action']['_'];
type IGNORE_ACTION_KEY = MESSAGE_ACTION_TYPE;
type IGNORE_ACTION_VALUE = true | ((message: Message.messageService) => boolean);
const IGNORE_ACTIONS_ARRAY: [IGNORE_ACTION_KEY, IGNORE_ACTION_VALUE][] = [
  ['messageActionHistoryClear', true],
  ['messageActionChatCreate', (message) => message.pFlags.out],
  ['messageActionChannelMigrateFrom', true],
  ['messageActionChatMigrateTo', true],
  ['messageActionContactSignUp', true]
];
const IGNORE_ACTIONS = new Map(IGNORE_ACTIONS_ARRAY);

export const SERVICE_AS_REGULAR: Set<MESSAGE_ACTION_TYPE> = new Set();

if(IS_CALL_SUPPORTED) {
  SERVICE_AS_REGULAR.add('messageActionPhoneCall');
}

// const TEST_SCROLL_TIMES: number = undefined;
// let TEST_SCROLL = TEST_SCROLL_TIMES;

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

const webPageTypes: {[type in WebPage.webPage['type']]?: LangPackKey} = {
  telegram_channel: 'Chat.Message.ViewChannel',
  telegram_megagroup: 'OpenGroup',
  telegram_bot: 'Chat.Message.ViewBot',
  telegram_botapp: 'Chat.Message.ViewApp',
  telegram_user: 'Chat.Message.SendMessage',
  telegram_chatlist: 'OpenChatlist',
  telegram_story: 'OpenStory',
  telegram_channel_boost: 'BoostLinkButton',
  telegram_giftcode: 'Open',
  telegram_chat: 'OpenGroup',
  telegram_livestream: 'VoipChannelJoinVoiceChatUrl',
  telegram_nft: 'StarGiftLinkButton'
};

const webPageTypesSiteNames: {[type in WebPage.webPage['type']]?: LangPackKey} = {
  telegram_livestream: 'PeerInfo.Action.LiveStream'
};

type Bubble = {
  bubble: HTMLElement,
  mids: Set<number>,
  groupedId?: string
};

type MyHistoryResult = HistoryResult | {history: number[]};

function getMainMidForGrouped(mids: number[]) {
  return Math.min(...mids);
}

const getSponsoredPhoto = (sponsoredMessage: SponsoredMessage) => {
  return sponsoredMessage.photo;
  // const peerId = getPeerId(sponsoredMessage.from_id);
  // if(peerId !== NULL_PEER_ID) {
  //   return;
  // }

  // let photo: Photo.photo | MTChat.channel;
  // const chatInvite = sponsoredMessage.chat_invite;
  // const webPage = sponsoredMessage.webpage;
  // if(chatInvite) {
  //   photo = (chatInvite as ChatInvite.chatInvite).photo as Photo.photo;
  //   photo ||= (chatInvite as ChatInvite.chatInvitePeek).chat as MTChat.channel;
  // } else if(webPage) {
  //   photo = webPage.photo as Photo.photo;
  // }

  // return photo;
};

export type FullMid = `${PeerId}_${number}`;

export function makeFullMid(peerId: PeerId | Message.message | Message.messageService, mid?: number): FullMid {
  if(typeof(peerId) === 'object') {
    mid = peerId.mid;
    peerId = peerId.peerId;
  }

  return `${peerId}_${mid}`;
}

function getBubbleFullMid(bubble: HTMLElement) {
  if(!bubble) return;
  const mid = bubble.dataset.mid;
  if(mid === undefined) return;
  return makeFullMid(bubble.dataset.peerId.toPeerId(), +bubble.dataset.mid);
}

export function splitFullMid(fullMid: FullMid) {
  const [peerId, mid] = fullMid.split('_');
  return {peerId: peerId.toPeerId(), mid: +mid};
}

const EMPTY_FULL_MID = makeFullMid(NULL_PEER_ID, 0);

function appendBubbleTime(bubble: HTMLElement, element: HTMLElement, callback: () => void) {
  (bubble.timeAppenders ??= []).unshift({element, callback});
  callback();
}

type AddMessageSpoilerOverlayParams = {
  mid: number;
  loadPromises?: Promise<void>[];
  messageDiv: HTMLDivElement;
  middleware: Middleware;
  canTranslate?: boolean;
}

export default class ChatBubbles {
  public container: HTMLDivElement;
  public chatInner: HTMLDivElement;
  public scrollable: Scrollable;

  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;

  // public messagesCount: number = -1;

  private unreadOut = new Set<number>();
  private needUpdate: {replyToPeerId: PeerId, replyMid?: number, replyStoryId?: number, mid: number, peerId: PeerId}[] = []; // if need wrapSingleMessage

  private bubbles: {[fullMid: string]: HTMLElement} = {};
  public skippedMids: Set<string> = new Set();
  public bubblesNewByGroupedId: {[groupId: string]: Bubble} = {};
  public bubblesNew: {[mid: string]: Bubble} = {};
  private dateMessages: {[timestamp: number]: {
    div: HTMLElement,
    firstTimestamp: number,
    container: HTMLElement,
    groupsLength: number,
    timeout?: number
  }} = {};

  private scrolledDown = true;
  private isScrollingTimeout = 0;

  private stickyIntersector: StickyIntersector;

  private unreaded: Map<HTMLElement, number> = new Map();
  private unreadedContent: Map<HTMLElement, number> = new Map();
  private unreadedSeen: Set<number> = new Set();
  private unreadedContentSeen: Set<number> = new Set();
  private readPromise: Promise<void>;
  private readContentPromise: Promise<void>;

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

  private followStack: FullMid[] = [];

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

  private viewsMids: Set<FullMid> = new Set();
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

  private renderingMessages: Set<FullMid> = new Set();
  private setPeerCached: boolean;
  private attachPlaceholderOnRender: () => void;

  private bubblesToEject: Set<HTMLElement> = new Set();
  private bubblesToReplace: Map<HTMLElement, HTMLElement> = new Map(); // TO -> FROM
  private updatePlaceholderPosition: () => void;
  private setPeerOptions: {lastMsgFullMid: FullMid, topMessageFullMid: FullMid, savedPosition: ChatSavedPosition};

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

  private remover: HTMLDivElement;

  private lastPlayingVideo: HTMLVideoElement;

  private batchingModifying: Array<() => void>;

  private changedMids: Map<number, number>; // used when message is sent faster than temporary one was rendered

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
    this.preloader = new ProgressivePreloader({
      cancelable: false
    });
    this.lazyLoadQueue = new LazyLoadQueue(undefined, true);
    this.lazyLoadQueue.queueId = ++queueId;

    this.changedMids = new Map();

    // this.reactions = new Map();

    // * events

    // will call when sent for update pos
    this.listenerSetter.add(rootScope)('history_update', async({storageKey, sequential, message}) => {
      if(this.chat.messagesStorageKey !== storageKey || this.chat.type === ChatType.Scheduled) {
        return;
      }

      const {mid} = message;
      const log = false ? this.log.bindPrefix('history_update-' + mid) : undefined;
      log && log('start');

      const fullMid = makeFullMid(message);
      const bubble = this.getBubble(fullMid);
      if(!bubble) return;

      if(this.renderNewPromises.size) {
        log && log.error('will await new messages render');
        await Promise.all(Array.from(this.renderNewPromises));
      }

      if(this.messagesQueuePromise) {
        log && log.error('messages render in process');
        await this.messagesQueuePromise;
      }

      if(this.getBubble(fullMid) !== bubble) return;

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
        const newItem = this.bubbleGroups.createItem(bubble, message, item.reverse);
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
          this.bubbleGroups.changeBubbleMessage(bubble, message);
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

      const {groups} = this.groupBubbles([{bubble, message, reverse: item.reverse}]);
      this.bubbleGroups.mountUnmountGroups(groups);

      if(this.scrollingToBubble) {
        this.scrollToEnd();
      }

      log && log('end');

      // this.bubbleGroups.findIncorrentPositions();
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({peerId}) => {
      if(this.peerId === peerId) {
        this.deleteMessagesByIds(this.getRenderedHistory('asc'));
      }
    });

    // Calls when message successfully sent and we have an id
    this.listenerSetter.add(rootScope)('message_sent', (e) => {
      const {storageKey, tempId, tempMessage, mid, message} = e;

      // ! can't use peerId to validate here, because id can be the same in 'scheduled' and 'chat' types
      if(this.chat.messagesStorageKey !== storageKey) {
        return;
      }

      this.changedMids.set(tempId, mid);

      this.needUpdate.forEach((obj) => {
        if(obj.peerId === tempMessage.peerId && obj.mid === tempId) {
          obj.mid = mid;
        }
      });

      const fullTempMid = makeFullMid(tempMessage);
      const fullMid = makeFullMid(message);

      let _bubble = this.getBubble(fullTempMid);
      if(_bubble) {
        const bubble = _bubble;
        delete this.bubbles[fullTempMid];
        this.bubbles[fullMid] = bubble;
        bubble.dataset.mid = '' + mid;

        fastRaf(() => {
          const mid = +bubble.dataset.mid;
          if(this.getBubble(fullMid) !== bubble || !bubble.classList.contains('is-outgoing')) {
            return;
          }

          bubble.classList.remove('is-outgoing');

          let status: Parameters<ChatBubbles['setBubbleSendingStatus']>[1];
          if(bubble.classList.contains('is-out')) {
            status = (this.peerId === rootScope.myId && this.chat.type !== ChatType.Scheduled) || !this.unreadOut.has(mid) ?
              'read' :
              'sent';
          }

          this.setBubbleSendingStatus(
            bubble,
            status
          );
        });
      }

      if(this.unreadOut.has(tempId)) {
        this.unreadOut.delete(tempId);
        this.unreadOut.add(mid);
      }

      // * check timing of scheduled message
      if(this.chat.type === ChatType.Scheduled) {
        const timestamp = Date.now() / 1000 | 0;
        const maxTimestamp = tempMessage.date - 10;
        if(timestamp >= maxTimestamp) {
          this.deleteMessagesByIds([fullMid]);
        }
      }

      let messages: (Message.message | Message.messageService)[], tempIds: number[];
      const groupedId = (message as Message.message).grouped_id;
      if(groupedId) {
        messages = apiManagerProxy.getMessagesByGroupedId(groupedId);
        const mids = messages.map(({mid}) => mid);
        const lastMid = mids[mids.length - 1];
        if(lastMid !== mid) {
          return;
        }

        _bubble = this.getBubble(message.peerId, getMainMidForGrouped(mids));
        tempIds = (Array.from(_bubble.querySelectorAll('.grouped-item')) as HTMLElement[]).map((el) => +el.dataset.mid);
        (_bubble as any).maxBubbleMid = lastMid;
      } else {
        messages = [message];
        tempIds = [tempId];
        if(_bubble) {
          (_bubble as any).maxBubbleMid = mid;
        }
      }

      if(!_bubble) {
        return;
      }

      const reactionsElements = Array.from(_bubble.querySelectorAll('reactions-element')) as ReactionsElement[];
      if(reactionsElements.length) {
        const mainMessage = apiManagerProxy.getGroupsFirstMessage(message as Message.message);
        reactionsElements.forEach((reactionsElement) => {
          reactionsElement.changeContext(mainMessage);
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
            this.safeRenderMessage({
              message,
              reverse: true,
              bubble
            });
            this.scrollToBubbleIfLast(bubble);
          });
        }

        // set new mids to album items for mediaViewer
        if(groupedId) {
          const item = (bubble.querySelector(`.grouped-item[data-mid="${tempId}"]`) as HTMLElement) ||
            (bubble.classList.contains('document-container') ? bubble : undefined);
          if(item) {
            item.dataset.mid = '' + mid;
          }
        }
      });
    });

    this.listenerSetter.add(rootScope)('message_edit', async({storageKey, message}) => {
      if(storageKey !== this.chat.messagesStorageKey) return;

      const fullMid = makeFullMid(message);
      const bubble = this.getBubble(fullMid);
      if(!bubble) return;

      await getHeavyAnimationPromise();
      if(this.getBubble(fullMid) !== bubble) return;

      const updateLocalOnEdit = this.updateLocationOnEdit.get(bubble);
      if(updateLocalOnEdit) {
        updateLocalOnEdit(message as Message.message);
        return;
      }

      // do not edit geo messages
      if(bubble.querySelector('.geo-container')) {
        return;
      }

      this.safeRenderMessage({
        message,
        reverse: true,
        bubble
      });
    });

    this.listenerSetter.add(rootScope)('message_error', async({storageKey, tempId, peerId}) => {
      if(storageKey !== this.chat.messagesStorageKey) return;

      const fullTempMid = makeFullMid(peerId, tempId);
      const bubble = this.getBubble(fullTempMid);
      if(!bubble) return;

      await getHeavyAnimationPromise();
      if(this.getBubble(fullTempMid) !== bubble) return;

      bubble.classList.remove('is-outgoing');
      this.setBubbleSendingStatus(bubble, 'error');
    });

    this.listenerSetter.add(rootScope)('replies_short_update', (message) => {
      if(this.peerId !== message.peerId) return;
      const bubble = this.getBubble(makeFullMid(message));
      if(!bubble) return;
      this.setBubbleRepliesCount(bubble, message.replies.replies);
    });

    this.listenerSetter.add(rootScope)('message_transcribed', ({peerId, mid, text, pending}) => {
      if(peerId !== this.peerId) return;

      const bubble = this.getBubble(makeFullMid(peerId, mid));
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
            audioElement.after(transcribedText);
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

        speechRecognitionIcon.classList.remove(_tgico('transcribe'));
        speechRecognitionIcon.classList.add(_tgico('up'));

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

    this.listenerSetter.add(rootScope)('grouped_edit', ({peerId, messages, deletedMids}) => {
      if(peerId !== this.peerId) return;

      const mids = messages.map(({mid}) => mid);
      const oldMids = mids.concat(Array.from(deletedMids));
      const wasMainMid = getMainMidForGrouped(oldMids);
      const wasFullMid = makeFullMid(peerId, wasMainMid);
      const bubble = this.getBubble(wasFullMid);
      if(!bubble) {
        return;
      }

      delete this.bubbles[wasFullMid];
      const mainMid = getMainMidForGrouped(mids);
      const message = messages.find((message) => message.mid === mainMid);
      this.safeRenderMessage({
        message,
        reverse: true,
        bubble
      });
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
        if(this.chat.type === ChatType.Scheduled) {
          return;
        }

        let scrollSaver: ScrollSaver;

        const a = arr.map(async({message, changedResults}) => {
          if(this.peerId !== message.peerId && !GLOBAL_MIDS) {
            return;
          }

          const result = await this.getMountedBubble(message);
          if(!result) {
            return;
          }

          // can be .document-container
          return {bubble: findUpClassName(result.bubble, 'bubble'), message, changedResults};
        });

        const waitPromise = deferredPromise<void>();
        (await Promise.all(a)).filter(Boolean).forEach(({bubble, message, changedResults}) => {
          if(!scrollSaver) {
            scrollSaver = this.createScrollSaver(false);
            scrollSaver.save();
          }

          if(bubble.dataset.ignoreReactions) {
            delete bubble.dataset.ignoreReactions;
            changedResults = [];
          }

          const unreadReactions = getUnreadReactions(message);
          if(unreadReactions) {
            changedResults = [];
          }

          const key = message.peerId + '_' + message.mid;
          const set = REACTIONS_ELEMENTS.get(key);
          if(set) {
            for(const element of set) {
              element.update(message, changedResults, waitPromise);
              if(!message.reactions || !message.reactions.results.length) {
                const parentElement = element.parentElement;
                element.remove();

                const timeSpan = element.querySelector('.time');
                if(timeSpan) {
                  findAndSplice(bubble.timeAppenders, ({element: el}) => el === element);
                  bubble.timeAppenders[0].callback();
                }

                if(parentElement.classList.contains('document-message') && !parentElement.childNodes.length) {
                  parentElement.remove();
                }
              }
            }
          } else if(!message.reactions || !message.reactions.results.length) {
            return;
          } else {
            this.appendReactionsElementToBubble(bubble, message, message, changedResults);
          }

          if(unreadReactions) {
            this.setUnreadObserver('content', bubble, message.mid);
          }
        });

        scrollSaver?.restore();
        waitPromise.resolve();
      });
    }

    !DO_NOT_UPDATE_MESSAGE_REPLY && this.listenerSetter.add(rootScope)('messages_downloaded', this.updateMessageReply);
    !DO_NOT_UPDATE_MESSAGE_REPLY && this.listenerSetter.add(rootScope)('stories_downloaded', this.updateMessageReply);

    attachStickerViewerListeners({
      listenTo: this.scrollable.container,
      listenerSetter: this.listenerSetter,
      findTarget: (e) => {
        const target = e.target as HTMLElement;
        const found = target.closest('.attachment.media-sticker-wrapper, .attachment.media-gif-wrapper') || (findUpClassName(target, 'attachment') && target.closest('.custom-emoji'));
        return found as HTMLElement;
      }
    });
    attachClickEvent(this.scrollable.container, this.onBubblesClick, {listenerSetter: this.listenerSetter});
    // this.listenerSetter.add(this.bubblesContainer)('click', this.onBubblesClick/* , {capture: true, passive: false} */);

    this.listenerSetter.add(this.scrollable.container)('mousedown', (e) => {
      if(e.button !== 0) return;

      const codeContainer = findUpClassName(e.target, 'code-header') && findUpClassName(e.target, 'code');
      const code: HTMLElement = codeContainer?.querySelector<HTMLElement>('.code-code') || findUpClassName(e.target, 'monospace-text');
      if(code) {
        const isTogglingWrap = !!findUpClassName(e.target, 'code-header-toggle-wrap');
        cancelEvent(e);
        if(!isTogglingWrap) {
          copyFromElement(code);
        }

        const onClick = (e: MouseEvent) => {
          cancelEvent(e);

          if(isTogglingWrap) {
            // const scrollSaver = this.createScrollSaver(true);
            // scrollSaver.save();
            const present = codeContainer.classList.toggle('is-scrollable');
            // code.classList.toggle('scrollable', present);
            // code.classList.toggle('scrollable-x', present);
            code.classList.toggle('no-scrollbar', present);
            // scrollSaver.restore();
            return;
          }

          toastNew({
            langPackKey: 'CodeCopied',
            onClose: () => {
              detach();
            }
          });
        };

        const detach = attachClickEvent(
          window,
          onClick,
          {
            listenerSetter: this.listenerSetter,
            once: true,
            capture: true,
            ignoreMove: true
          }
        );
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

    const removerContainer = document.createElement('div');
    removerContainer.classList.add('bubbles-remover-container');
    const remover = this.remover = document.createElement('div');
    remover.classList.add('bubbles-remover', 'bubbles-inner');
    removerContainer.append(remover);

    this.setScroll();

    container.append(removerContainer, this.scrollable.container);
  }

  public attachContainerListeners() {
    const container = this.container;

    this.chat.contextMenu.attachTo(container);
    this.chat.selection.attachListeners(container, new ListenerSetter());

    if(DEBUG) {
      this.listenerSetter.add(container)('dblclick', (e) => {
        const bubble = findUpClassName(e.target, 'grouped-item') || findUpClassName(e.target, 'bubble');
        if(bubble) {
          const fullMid = getBubbleFullMid(bubble);

          if(TEST_BUBBLES_DELETION) {
            return this.deleteMessagesByIds([fullMid], true);
          }

          this.log('debug message:', this.chat.getMessage(fullMid));
          this.highlightBubble(bubble);
        }
      });
    }

    if(!IS_MOBILE && !TEST_BUBBLES_DELETION) {
      this.listenerSetter.add(container)('dblclick', async(e) => {
        if(
          this.chat.type === ChatType.Pinned ||
          this.chat.selection.isSelecting ||
          !this.chat.input.canSendPlain()
        ) {
          return;
        }

        if(
          findUpClassName(e.target, 'attachment') ||
          findUpClassName(e.target, 'audio') ||
          findUpClassName(e.target, 'document') ||
          findUpClassName(e.target, 'contact') ||
          findUpClassName(e.target, 'time') ||
          findUpClassName(e.target, 'code-header-button') ||
          findUpClassName(e.target, 'reaction')
        ) {
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
          const message = this.chat.getMessage(getBubbleFullMid(bubble));
          if(message.pFlags.is_outgoing || message.peerId !== this.peerId) {
            return;
          }

          this.chat.input.initMessageReply({replyToMsgId: message.mid});
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
          if(this.chat.type === ChatType.Pinned ||
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
              icon = Icon('reply_filled', 'bubble-gesture-reply-icon');
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
              this.chat.input.initMessageReply({replyToMsgId: +mid});
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
      if(storageKey !== this.chat.messagesStorageKey || this.chat.type === ChatType.Scheduled) return;

      if(liteMode.isAvailable('chat_background')) {
        this.updateGradient = true;
      }

      if(this.chat.threadId && getMessageThreadId(message, this.chat.isForum) !== this.chat.threadId) {
        return;
      }

      // * if user sent a message inside a thread, do not scroll to it in a chat below
      if(
        !this.chat.threadId &&
        this.chat.appImManager.chats.some((chat) => this.chat !== chat && chat.peerId === this.peerId && chat.threadId)
      ) {
        this.renderNewMessage(message);
        return;
      }

      if(!this.scrollable.loadedAll.bottom) {
        this.chat.setMessageId();
      } else {
        this.renderNewMessage(message, true);
      }
    });

    this.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      if(this.peerId !== message.peerId || this.chat.type === ChatType.Scheduled) return;
      this.renderNewMessage(message);
    });

    this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      if((peerId !== this.peerId && !GLOBAL_MIDS) || this.chat.type === ChatType.Scheduled) {
        return;
      }

      const mids = [...msgs.keys()];
      const fullMids = mids.map((mid) => makeFullMid(peerId, mid));
      this.deleteMessagesByIds(fullMids);
      this.updateMessageReply({
        peerId,
        mids
      });
    });

    this.listenerSetter.add(rootScope)('history_delete_key', ({historyKey, mid}) => {
      if(this.chat.historyStorageKey !== historyKey) {
        return;
      }

      this.deleteMessagesByIds([makeFullMid(this.peerId, mid)]);
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
      if(!dialogs.has(this.peerId) || this.chat.type === ChatType.Scheduled || this.chat.type === ChatType.Saved) {
        return;
      }

      this.chat.input.setUnreadCount();
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(this.peerId !== dialog.peerId || this.chat.type === ChatType.Scheduled || this.chat.type === ChatType.Saved) {
        return;
      }

      this.chat.input.setUnreadCount();
    });

    const refreshInput = async() => {
      const callbacks = await Promise.all([
        this.finishPeerChange(),
        this.chat.input.finishPeerChange({peerId: this.peerId, middleware: this.getMiddleware()})
      ]);

      callbacks.forEach((callback) => callback());
    };

    this.listenerSetter.add(rootScope)('user_full_update', async(userId) => {
      const peerId = userId.toPeerId(false);
      if(peerId !== this.peerId) {
        return;
      }

      const middleware = this.getMiddleware();
      const {
        isUserBlocked,
        isPremiumRequired,
        starsAmount
      } = await namedPromises({
        isUserBlocked: this.managers.appProfileManager.isCachedUserBlocked(userId),
        isPremiumRequired: this.chat.isPremiumRequiredToContact(),
        starsAmount: this.managers.appUsersManager.getStarsAmount(userId)
      });

      if(!middleware()) return;

      const wasUserBlocked = this.chat.isUserBlocked;
      const wasPremiumRequired = this.chat.isPremiumRequired;
      const wasStarsAmount = this.chat.starsAmount;
      let refreshing = false;
      // do not refresh if had no status since input is shown by default
      if(wasUserBlocked === undefined ? isUserBlocked : wasUserBlocked !== isUserBlocked) {
        this.chat.isUserBlocked = isUserBlocked;
        refreshing = true;
      }

      const hasPremiumChanged = wasPremiumRequired === undefined ? isPremiumRequired : wasPremiumRequired !== isPremiumRequired;
      const hasStarsAmountChanged = wasStarsAmount === undefined ? starsAmount : wasStarsAmount !== starsAmount;

      this.chat.isPremiumRequired = isPremiumRequired;
      this.chat.starsAmount = starsAmount;

      if(hasPremiumChanged || hasStarsAmountChanged) {
        refreshing = true;
        this.cleanupPlaceholders();
        this.checkIfEmptyPlaceholderNeeded();
      }

      if(hasStarsAmountChanged) {
        getCurrentNewMediaPopup()?.setStarsAmount(starsAmount);
      }

      if(refreshing) {
        refreshInput();
      }
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const {peerId} = this;
      if(peerId !== chatId.toPeerId(true)) {
        return;
      }

      const middleware = this.getMiddleware();
      const chat = apiManagerProxy.getChat(chatId);
      const hadRights = this.chatInner.classList.contains('has-rights');
      const hadPlainRights = this.chat.input.canSendPlain();
      const [hasRights, hasPlainRights, canEmbedLinks] = await Promise.all([
        this.chat.canSend('send_messages'),
        this.chat.canSend('send_plain'),
        this.chat.canSend('embed_links')
      ]);
      if(!middleware()) return;

      if(hadRights !== hasRights || hadPlainRights !== hasPlainRights) {
        await refreshInput();
      }

      if(!middleware()) return;
      // reset webpage
      if((canEmbedLinks && !this.chat.input.willSendWebPage) || (!canEmbedLinks && this.chat.input.willSendWebPage)) {
        this.chat.input.lastUrl = '';
        this.chat.input.onMessageInput();
      }

      if(!!(chat as MTChat.channel).pFlags.forum !== this.chat.isForum && this.chat.type === ChatType.Chat) {
        this.chat.peerId = 0;
        this.chat.appImManager.setPeer({peerId});
      }
    });

    this.listenerSetter.add(rootScope)('history_reload', async(peerId) => {
      if(peerId !== this.peerId) {
        return;
      }

      const wasLikeGroup = this.chat.isLikeGroup;
      this.chat.isLikeGroup = await this.chat._isLikeGroup(peerId);
      const finishPeerChange = wasLikeGroup !== this.chat.isLikeGroup &&  await this.finishPeerChange();

      // * filter local and outgoing
      const fullMids = this.getRenderedHistory('desc', true);
      const mids = fullMids.map((fullMid) => splitFullMid(fullMid).mid);
      const middleware = this.getMiddleware();
      this.managers.appMessagesManager.reloadMessages(peerId, mids).then((messages) => {
        if(!middleware()) return;

        const toDelete: FullMid[] = [];
        messages.forEach((message, idx) => {
          const fullMid = fullMids[idx];
          if(message) {
            const bubble = this.getBubble(peerId, message.mid);
            if(!bubble) return;

            this.safeRenderMessage({
              message,
              reverse: true,
              bubble
            });
          } else {
            toDelete.push(fullMid);
          }
        });

        finishPeerChange?.();
        if(finishPeerChange) {
          this.bubbleGroups.groups.forEach((group) => {
            if(!this.chat.isLikeGroup) {
              group.destroyAvatar();
            } else if(this.chat.isAvatarNeeded(group.firstItem.message)) {
              group.createAvatar(group.firstItem.message);
            }
          });
        }

        this.deleteMessagesByIds(toDelete);

        this.setLoaded('top', false);
        this.setLoaded('bottom', false);
        this.scrollable.checkForTriggers();
      });
    });

    this.listenerSetter.add(rootScope)('settings_updated', ({key}) => {
      if(key === 'settings.emoji.big') {
        // const middleware = this.getMiddleware();
        const fullMids = this.getRenderedHistory('desc');
        const m = fullMids.map((fullMid) => {
          const bubble = this.getBubble(fullMid);
          if(bubble.classList.contains('can-have-big-emoji')) {
            const {peerId, mid} = splitFullMid(fullMid);
            return {bubble, message: this.chat.getMessageByPeer(peerId, mid), fullMid};
          }
        });

        // const awaited = await Promise.all(m);
        // if(!middleware()) {
        //   return;
        // }

        m.filter(Boolean).forEach(({bubble, message, fullMid}) => {
          if(this.getBubble(fullMid) !== bubble) {
            return;
          }

          this.safeRenderMessage({
            message,
            reverse: true,
            bubble
          });
        });
      }
    });

    !DO_NOT_UPDATE_MESSAGE_VIEWS && this.listenerSetter.add(rootScope)('messages_views', (arr) => {
      if(this.chat.type === ChatType.Scheduled) return;

      fastRaf(() => {
        let scrollSaver: ScrollSaver;
        for(const {peerId, views, mid} of arr) {
          if(this.peerId !== peerId && !GLOBAL_MIDS) continue;

          const bubble = this.getBubble(peerId, mid);
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
      const fullMids = [...this.viewsMids];
      this.viewsMids.clear();

      const byPeers: Map<PeerId, number[]> = new Map();
      fullMids.forEach((fullMid) => {
        const {peerId, mid} = splitFullMid(fullMid);
        let mids = byPeers.get(peerId);
        if(!mids) {
          byPeers.set(peerId, mids = []);
        }

        mids.push(mid);
      });

      byPeers.forEach((mids, peerId) => {
        this.managers.appMessagesManager.incrementMessageViews(peerId, mids);
      });
    }, 1000, false, true);

    // * pinned part start
    this.listenerSetter.add(rootScope)('peer_pinned_messages', ({peerId, mids, pinned}) => {
      if(this.chat.type !== ChatType.Pinned || peerId !== this.peerId) {
        return;
      }

      if(mids) {
        if(!pinned) {
          this.deleteMessagesByIds(mids.map((mid) => makeFullMid(peerId, mid)));
        }
      }
    });
    // * pinned part end

    // * scheduled part start
    const onUpdate = async() => {
      this.chat.topbar.setTitle((await this.managers.appMessagesManager.getScheduledMessagesStorage(this.peerId)).size);
    };

    this.listenerSetter.add(rootScope)('scheduled_new', (message) => {
      if(this.chat.type !== ChatType.Scheduled || message.peerId !== this.peerId) return;

      this.renderNewMessage(message);
      onUpdate();
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId, mids}) => {
      if(this.chat.type !== ChatType.Scheduled || peerId !== this.peerId) return;

      this.deleteMessagesByIds(mids.map((mid) => makeFullMid(peerId, mid)));
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

  public createScrollSaver(reverse = true) {
    const scrollSaver = new ScrollSaver(this.scrollable, '.bubble:not(.is-date)', reverse);
    return scrollSaver;
  }

  private unreadedObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      const target = entry.target as HTMLElement;
      const mid = this.unreaded.get(target as HTMLElement);
      this.onUnreadedInViewport('history', target, mid);
    }
  };

  private unreadedContentObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      const target = entry.target as HTMLElement;
      const mid = this.unreadedContent.get(target as HTMLElement);
      this.onUnreadedInViewport('content', target, mid);
    }
  };

  private viewsObserverCallback = (entry: IntersectionObserverEntry) => {
    if(entry.isIntersecting) {
      const fullMid = getBubbleFullMid(entry.target as HTMLElement);
      this.observer.unobserve(entry.target, this.viewsObserverCallback);

      if(fullMid) {
        this.viewsMids.add(fullMid);
        this.sendViewCountersDebounced();
      } else {
        const {sponsoredMessage} = this;
        if(!sponsoredMessage || sponsoredMessage.viewed) {
          return;
        }

        sponsoredMessage.viewed = true;
        this.managers.appMessagesManager.viewSponsoredMessage(sponsoredMessage.random_id);
      }
    }
  };

  private _stickerEffectObserverCallback = (entry: IntersectionObserverEntry, callback: IntersectionCallback, selector: string) => {
    if(entry.isIntersecting) {
      this.observer.unobserve(entry.target, callback);

      const attachmentDiv: HTMLElement = entry.target.querySelector(selector);
      getHeavyAnimationPromise().then(() => {
        if(isInDOM(attachmentDiv)) {
          simulateClickEvent(attachmentDiv);
        }
      });
    }
  };

  private stickerEffectObserverCallback = (entry: IntersectionObserverEntry) => {
    this._stickerEffectObserverCallback(entry, this.stickerEffectObserverCallback, '.attachment');
  };

  private messageEffectObserverCallback = (entry: IntersectionObserverEntry) => {
    this._stickerEffectObserverCallback(entry, this.messageEffectObserverCallback, '.time-inner .time-effect');
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
      const isScrolledDown = this.scrollable.isScrolledToEnd;
      if(height !== wasHeight && (!skip || !isScrolledDown)) { // * fix opening keyboard while ESG is active, offsetHeight will change right between 'start' and this first frame
        part += wasHeight - height;
      }

      /* if(DEBUG) {
        this.log('resize end', scrolled, part, this.scrollable.scrollTop, height, wasHeight, this.scrollable.isScrolledDown);
      } */

      if(part) {
        this.scrollable.setScrollPositionSilently(this.scrollable.scrollPosition + Math.round(part));
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

        if(realDiff < 0 && this.scrollable.isScrolledToEnd) {
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
        const needScrollTop = this.scrollable.scrollPosition + diff;
        this.scrollable.setScrollPositionSilently(needScrollTop);
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

  private updateMessageReply = async(options: {
    peerId: PeerId,
    mids?: number[],
    ids?: number[]
  }) => {
    const middleware = this.getMiddleware();
    await getHeavyAnimationPromise();
    if(!middleware()) return;

    const callbacks: (() => Promise<any>)[] = [];

    const peerId = options.peerId;
    const ids = options.mids || options.ids;
    const needUpdate = this.needUpdate;
    const property: keyof typeof needUpdate[0] = options.mids ? 'replyMid' : 'replyStoryId';
    const promises = ids.map((id) => {
      const filtered: typeof needUpdate[0][] = [];
      forEachReverse(needUpdate, (obj, idx) => {
        if(obj[property] === id && (obj.replyToPeerId === peerId || !peerId)) {
          // needUpdate.splice(idx, 1)[0];
          filtered.push(obj);
        }
      });

      const promises = filtered.map(async({peerId, mid, replyMid, replyToPeerId}) => {
        const fullMid = makeFullMid(peerId, mid);
        const bubble = this.getBubble(fullMid);
        if(!bubble) return;

        const [message, originalMessage] = await Promise.all([
          this.chat.getMessage(fullMid) as Message.message,
          replyMid && this.managers.appMessagesManager.getMessageByPeer(replyToPeerId, replyMid) as Promise<Message.message>
        ]);

        callbacks.push(async() => {
          const promise = MessageRender.setReply({
            chat: this.chat,
            bubble,
            message,
            middleware: bubble.middlewareHelper.get(),
            lazyLoadQueue: this.lazyLoadQueue,
            needUpdate: this.needUpdate,
            isStandaloneMedia: bubble.classList.contains('just-media'),
            isOut: bubble.classList.contains('is-out'),
            fromUpdate: true
          });

          if(!originalMessage) {
            return promise;
          }

          await promise;

          let maxMediaTimestamp: number;
          const timestamps = bubble.querySelectorAll<HTMLAnchorElement>('.timestamp');
          if(maxMediaTimestamp = getMediaDurationFromMessage(originalMessage)) {
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

      return Promise.all(promises);
    });

    await Promise.all(promises);
    if(!middleware() || !callbacks.length) return;

    const scrollSaver = this.createScrollSaver(true);
    scrollSaver.save();
    await Promise.all(callbacks.map((callback) => callback()));
    scrollSaver.restore();
  };

  private onBubblesMouseMove = async(e: MouseEvent) => {
    const mediaVideoContainer = findUpClassName(e.target, 'media-video-mini');
    mediaVideoContainer?.onMiniVideoMouseMove?.(e);

    const content = findUpClassName(e.target, 'bubble-content');
    if(!(
      this.chat.type !== ChatType.Scheduled &&
      content &&
      !this.chat.selection.isSelecting &&
      !findUpClassName(e.target, 'service') &&
      !findUpClassName(e.target, 'bubble-beside-button') &&
      this.peerId !== rootScope.myId
    )) {
      this.unhoverPrevious();
      return;
    }

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
    if(hoverReaction) {
      if(hoverReaction.dataset.loaded) {
        this.setHoverVisible(hoverReaction, true);
      }

      return;
    }

    hoverReaction = this.hoverReaction = document.createElement('div');
    hoverReaction.classList.add('bubble-hover-reaction');
    const middlewareHelper = hoverReaction.middlewareHelper = this.getMiddleware().create();
    const middleware = middlewareHelper.get(() => this.hoverReaction === hoverReaction);

    const stickerWrapper = document.createElement('div');
    stickerWrapper.classList.add('bubble-hover-reaction-sticker');
    hoverReaction.append(stickerWrapper);

    content.append(hoverReaction);

    let message = this.chat.getMessage(getBubbleFullMid(bubble));
    if(message?._ !== 'message') {
      this.unhoverPrevious();
      return;
    }

    message = await this.managers.appMessagesManager.getGroupsFirstMessage(message);

    Promise.all([
      this.managers.appReactionsManager.getAvailableReactionsByMessage(message, true),
      apiManagerProxy.getAvailableReactions(),
      pause(400)
    ]).then(async([{reactions}, availableReactions]) => {
      const reaction = reactions.find((reaction) => reaction._ !== 'reactionPaid');
      if(!reaction) {
        hoverReaction.remove();
        return;
      }

      const availableReaction = reaction._ === 'reactionEmoji' ? availableReactions.find((r) => r.reaction === reaction.emoticon) : undefined;
      const doc = availableReaction?.select_animation ?? await this.managers.appEmojiManager.getCustomEmojiDocument((reaction as Reaction.reactionCustomEmoji).document_id);
      if(!middleware()) {
        return;
      }

      wrapSticker({
        div: stickerWrapper,
        doc,
        width: 18,
        height: 18,
        needUpscale: true,
        middleware,
        group: this.chat.animationGroup,
        withThumb: false,
        needFadeIn: false
      }).then(({render}) => render).then((player) => {
        assumeType<RLottiePlayer>(player);

        const onFirstFrame = () => {
          if(!middleware()) {
            // debugger;
            return;
          }

          hoverReaction.dataset.loaded = '1';
          this.setHoverVisible(hoverReaction, true);
        };

        if(Array.isArray(player)) {
          onFirstFrame();
        } else {
          player.addEventListener('firstFrame', onFirstFrame, {once: true});
        }

        attachClickEvent(hoverReaction, (e) => {
          cancelEvent(e); // cancel triggering selection

          this.chat.sendReaction({
            message: message as Message.message,
            reaction
          });
          this.unhoverPrevious();
        }, {listenerSetter: this.listenerSetter});
      }, noop);
    });
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
        hoverReaction.middlewareHelper.destroy();
      },
      useRafs: visible ? 2 : 0
    });
  }

  private unhoverPrevious = () => {
    const {hoverBubble, hoverReaction} = this;
    if(hoverBubble) {
      this.setHoverVisible(hoverReaction, false);
      this.hoverBubble =
        this.hoverReaction =
        undefined;
    }
  };

  public setStickyDateManually() {
    // const timestamps = Object.keys(this.dateMessages).map((k) => +k).sort((a, b) => b - a);
    // let lastVisible: HTMLElement;

    // // if(this.chatInner.classList.contains('is-scrolling')) {
    // const {scrollTop} = this.scrollable.container;
    // const isOverflown = scrollTop > 0;
    // if(isOverflown) {
    //   for(const timestamp of timestamps) {
    //     const dateMessage = this.dateMessages[timestamp];
    //     const visibleRect = getVisibleRect(dateMessage.container, this.scrollable.container);
    //     if(visibleRect && visibleRect.overflow.top) {
    //       lastVisible = dateMessage.div;
    //     } else if(lastVisible) {
    //       break;
    //     }
    //   }
    // }
    // // }

    // if(lastVisible === this.previousStickyDate) {
    //   return;
    // }

    // if(lastVisible) {
    //   const needReflow = /* !!this.chat.setPeerPromise ||  */!this.previousStickyDate;
    //   if(needReflow) {
    //     lastVisible.classList.add('no-transition');
    //   }

    //   lastVisible.classList.add('is-sticky');

    //   if(needReflow) {
    //     void lastVisible.offsetLeft; // reflow
    //     lastVisible.classList.remove('no-transition');
    //   }
    // }

    // if(this.previousStickyDate && this.previousStickyDate !== lastVisible) {
    //   this.previousStickyDate.classList.remove('is-sticky');
    // }

    // this.previousStickyDate = lastVisible;
  }

  public getRenderedLength() {
    return this.getRenderedHistory().length;
  }

  private onUnreadedInViewport(type: 'history' | 'content', target: HTMLElement, mid: number) {
    let {unreadedSeen, unreadedObserverCallback, unreaded} = this;
    if(type === 'content') {
      unreadedSeen = this.unreadedContentSeen;
      unreadedObserverCallback = this.unreadedContentObserverCallback;
      unreaded = this.unreadedContent;
    }

    unreadedSeen.add(mid);
    this.observer.unobserve(target, unreadedObserverCallback);
    unreaded.delete(target);
    this.readUnreaded(type);
  }

  private readUnreaded(type: 'history' | 'content') {
    const readPromiseKey = type === 'history' ? 'readPromise' : 'readContentPromise';
    if(this[readPromiseKey]) return;

    const unreadedSeenKey = type === 'history' ? 'unreadedSeen' : 'unreadedContentSeen';

    const middleware = this.getMiddleware();
    this[readPromiseKey] = idleController.getFocusPromise().then(async() => {
      if(!middleware()) return;
      const {peerId, threadId} = this.chat;

      let callback: () => Promise<any>;
      if(type === 'history') {
        let maxId = Math.max(...Array.from(this[unreadedSeenKey]));

        // ? if message with maxId is not rendered ?
        if(this.scrollable.loadedAll.bottom) {
          const rendered = this.getRenderedHistory('desc', true);
          const bubblesMaxId = rendered ? splitFullMid(rendered[0]).mid : -1;
          if(maxId >= bubblesMaxId) {
            maxId = Math.max((await this.chat.getHistoryMaxId()) || 0, maxId);
            if(!middleware()) return;
          }
        }

        this.unreaded.forEach((mid, target) => {
          if(mid <= maxId) {
            this.onUnreadedInViewport('history', target, mid);
          }
        });

        if(DEBUG) {
          this.log('will readHistory by maxId:', maxId);
        }

        callback = () => this.managers.appMessagesManager.readHistory(peerId, maxId, threadId);
      } else {
        const readContents: number[] = [];
        for(const mid of this.unreadedContentSeen) {
          const message: MyMessage = this.chat.getMessage(mid);
          if(isMentionUnread(message) || getUnreadReactions(message)) {
            readContents.push(mid);
          }
        }

        if(DEBUG) {
          this.log('will readMessages', readContents);
        }

        callback = () => this.managers.appMessagesManager.readMessages(peerId, readContents);
      }

      this[unreadedSeenKey].clear();

      // const promise = Promise.resolve();
      const promise = callback();

      return promise.catch((err: any) => {
        this.log.error('read err:', type, err);
        callback();
      }).finally(() => {
        if(!middleware()) return;
        this[readPromiseKey] = undefined;

        if(this[unreadedSeenKey].size) {
          this.readUnreaded(type);
        }
      });
    });
  }

  public onBubblesClick = async(e: Event) => {
    let target = e.target as HTMLElement;
    let bubble: HTMLElement = null, bubbleFullMid: FullMid;
    try {
      bubble = findUpClassName(target, 'bubble');
      if(bubble) {
        bubbleFullMid = getBubbleFullMid(bubble);
      }
    } catch(err) {}

    const stack = this.chat.appImManager.getStackFromElement(target);
    const additionalSetPeerProps: Partial<ChatSetInnerPeerOptions> = {stack};

    if(!bubble && !this.chat.selection.isSelecting) {
      const avatar = findUpClassName(target, 'user-avatar');
      if(!avatar) {
        return;
      }

      // const sponsoredContainer = findUpClassName(target, 'bubbles-group-sponsored');
      // if(sponsoredContainer) {
      //   if(sponsoredContainer.dataset.toCallback) {
      //     sponsoredContainer.querySelector<HTMLElement>('.webpage').click();
      //   }
      //   return;
      // }

      const peerId = avatar.dataset.peerId.toPeerId();
      if(peerId !== NULL_PEER_ID) {
        this.chat.appImManager.setInnerPeer({...additionalSetPeerProps, peerId});
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

    const timeEffect = findUpClassName(target, 'time-effect');
    if(timeEffect) {
      fireMessageEffectByBubble({timeEffect, bubble, e, scrollable: this.scrollable});
      return;
    }

    if(!IS_TOUCH_SUPPORTED && findUpClassName(target, 'time')) {
      this.chat.selection.toggleByElement(bubble);
      return;
    }

    // ! Trusted - due to audio autoclick
    if(this.chat.selection.isSelecting && e.isTrusted) {
      if(bubble.classList.contains('service') && bubbleFullMid === undefined) {
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

    const contactDiv: HTMLElement = findUpClassName(target, 'contact');
    if(contactDiv) {
      const peerId = contactDiv.dataset.peerId.toPeerId();
      if(peerId) {
        this.chat.appImManager.setInnerPeer({
          ...additionalSetPeerProps,
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

      const message = this.chat.getMessage(bubbleFullMid);
      if(!message) {
        return;
      }

      const media = (message as Message.message).media;
      const paidMedia = media?._ === 'messageMediaPaidMedia' ? media : undefined;

      const popup = await PopupPayment.create({
        message: message as Message.message,
        inputInvoice: await this.managers.appPaymentsManager.getInputInvoiceByPeerId(message.peerId, message.mid),
        paidMedia
      });

      if(paidMedia) {
        popup.addEventListener('finish', async(result) => {
          if(result === 'paid') {
            setQuizHint({
              icon: 'cash_circle',
              title: i18n('StarsMediaPurchaseCompleted'),
              textElement: i18n('StarsMediaPurchaseCompletedInfo', [
                paidMedia.stars_amount,
                await wrapPeerTitle({peerId: (message as Message.message).fwdFromId || message.peerId})
              ]),
              appendTo: this.container,
              from: 'top',
              duration: 5000
            });
          }
        });
      }
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

    const reactionElement = findUpTag(target, 'REACTION-ELEMENT') as ReactionElement;
    if(reactionElement) {
      if(findUpClassName(target, 'tooltip')) {
        return;
      }

      cancelEvent(e);
      if(reactionElement.classList.contains('is-inactive')) {
        return;
      }

      const reactionsElement = reactionElement.parentElement as ReactionsElement;
      const reactionCount = reactionsElement.getReactionCount(reactionElement);
      const {reaction} = reactionCount;

      if(reactionsElement.getType() === ReactionLayoutType.Tag) {
        if(!rootScope.premium) {
          PopupPremium.show({feature: 'saved_tags'});
          return;
        }

        const search = this.chat.searchSignal();
        if(reactionsEqual(search?.reaction, reaction)) {
          this.chat.contextMenu.onContextMenu(e as MouseEvent);
          return;
        }

        this.chat.initSearch({reaction: reaction});
      } else {
        const message = reactionsElement.getContext();
        this.chat.sendReaction({message, reaction});
      }

      return;
    }

    const stickerEmojiEl = findUpAttribute(target, 'data-sticker-emoji');
    if(
      stickerEmojiEl &&
      stickerEmojiEl.parentElement.querySelectorAll('[data-sticker-emoji]').length === 1 &&
      bubble.classList.contains('emoji-big')
    ) {
      this.chat.appImManager.onEmojiStickerClick({
        event: e,
        container: stickerEmojiEl,
        managers: this.managers,
        middleware: this.getMiddleware(),
        peerId: this.peerId
      }).then((firedAnimation) => {
        if(firedAnimation) {
          return;
        }

        this.openEmojiPackByTarget(stickerEmojiEl);
      });

      return;
    } else if(stickerEmojiEl) {
      this.openEmojiPackByTarget(stickerEmojiEl);
      return;
    }

    const quoteDiv: HTMLElement = findUpClassName(target, 'quote-like-collapsable');
    if(quoteDiv) {
      const isTruncated = quoteDiv.classList.contains('is-truncated');
      const isExpanded = quoteDiv.classList.contains('is-expanded');
      const isGood = isTruncated || isExpanded;
      if(isGood && window.getSelection().isCollapsed) {
        cancelEvent(e);

        const hasAnimations = liteMode.isAvailable('animations');
        if(hasAnimations) {
          (quoteDiv as any).ignoreQuoteResize = Infinity;
        }

        const scrollSaver = this.createScrollSaver(false);
        scrollSaver.save();

        let onTransitionEnd: (e: TransitionEvent) => void;

        const animationPromise = hasAnimations ? Promise.race([
          pause(1000).then(() => {
            quoteDiv.removeEventListener('transitionend', onTransitionEnd);
          }),
          new Promise<void>((resolve) => {
            onTransitionEnd = (e: TransitionEvent) => {
              if(e.target === quoteDiv) {
                resolve();
                delete (quoteDiv as any).ignoreQuoteResize;
              }
            };

            quoteDiv.addEventListener('transitionend', onTransitionEnd, {once: true});
          })
        ]) : Promise.resolve();

        this.animateSomethingWithScroll(animationPromise, scrollSaver);
        quoteDiv.classList.toggle('is-expanded');
        quoteDiv.classList.toggle('is-truncated', isExpanded);
        return;
      }
    }

    const commentsDiv: HTMLElement = findUpClassName(target, 'replies');
    if(commentsDiv) {
      if(this.peerId === REPLIES_PEER_ID) {
        const message = this.chat.getMessage(bubbleFullMid) as Message.message;
        const peerId = getPeerId((message.reply_to as MessageReplyHeader.messageReplyHeader).reply_to_peer_id);
        const threadId = (message.reply_to as MessageReplyHeader.messageReplyHeader).reply_to_top_id;
        const lastMsgId = message.fwd_from.saved_from_msg_id;
        this.chat.appImManager.openThread({
          peerId,
          lastMsgId,
          threadId
        });
      } else {
        const message1 = this.chat.getMessage(bubbleFullMid);
        const message = await this.managers.appMessagesManager.getMessageWithReplies(message1 as Message.message);
        const replies = message.replies;
        if(replies) {
          this.managers.appMessagesManager.getDiscussionMessage(this.peerId, message.mid).then((message) => {
            this.chat.appImManager.setInnerPeer({
              ...additionalSetPeerProps,
              peerId: replies.channel_id.toPeerId(true),
              type: ChatType.Discussion,
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

    const nameDiv = findUpClassName(target, 'peer-title') ||
      findUpAvatar(target) ||
      findUpClassName(target, 'selector-user') ||
      findUpAttribute(target, 'data-saved-from') ||
      findUpAttribute(target, 'data-follow');
    if(nameDiv && nameDiv !== bubble) {
      target = nameDiv || target;
      const peerIdStr = target.dataset.peerId || target.getAttribute('peer') || target.dataset.key || target.dataset.follow/*  || (target as AvatarElement).peerId */;
      const savedFrom = target.dataset.savedFrom as FullMid;
      if(typeof(peerIdStr) === 'string' || savedFrom) {
        cancelEvent(e);
        if(savedFrom) {
          const {peerId, mid} = splitFullMid(savedFrom);
          if(target.classList.contains('is-receipt-link')) {
            const message = await this.managers.appMessagesManager.getMessageByPeer(peerId.toPeerId(), +mid);
            if(message) {
              const inputInvoice = await this.managers.appPaymentsManager.getInputInvoiceByPeerId(message.peerId, message.mid);
              PopupPayment.create({
                message: message as Message.message,
                inputInvoice,
                isReceipt: true
              });
            }
          } else {
            this.chat.appImManager.setInnerPeer({
              ...additionalSetPeerProps,
              peerId: peerId.toPeerId(),
              lastMsgId: +mid
            });
          }
        } else {
          const peerId = peerIdStr.toPeerId();
          if(peerId !== NULL_PEER_ID) {
            this.chat.appImManager.setInnerPeer({...additionalSetPeerProps, peerId});
            this.chat.appImManager.clickIfSponsoredMessage((bubble as any).message);
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
      const message = this.chat.getMessage(bubbleFullMid);

      const doc = ((message as Message.message).media as MessageMedia.messageMediaDocument)?.document as Document.document;

      if(doc?.stickerSetInput) {
        PopupElement.createPopup(PopupStickers, doc.stickerSetInput, undefined, this.chat.input).show();
      }

      return;
    }

    const videoMini = findUpClassName(target, 'media-video-mini');
    if(videoMini && false) {
      if(findUpClassName(target, 'video-to-viewer')) {
        if(this.checkTargetForMediaViewer(videoMini.querySelector('video'), e)) {
          cancelClickOrNextIfNotClick(e);
          return;
        }
      } else if(findUpClassName(target, 'media-photo')) {
        simulateClickEvent(videoMini.querySelector('video'));
      }

      cancelEvent(e);
      // if(findUpClassName(target, 'ckin__controls')) {
      //   return;
      // }

      // // console.log('video click', e);
      // cancelEvent(e);
      return;
    }

    if(this.checkTargetForMediaViewer(target, e)) {
      cancelClickOrNextIfNotClick(e);
      return;
    }

    const webPageContainer = findUpClassName(target, 'webpage') as HTMLAnchorElement;
    if(webPageContainer) {
      if(findUpClassName(target, 'webpage-name-tip')) {
        return;
      }

      if(findUpClassName(target, 'webpage-preview-resizer')) {
        e.preventDefault();
        return;
      }

      const callback = webPageContainer.dataset.callback as Parameters<typeof addAnchorListener>[0]['name'];
      if(callback) {
        (window as any)[callback](findUpTag(target, 'A'), e);
      }

      const sponsoredCallback = (webPageContainer as any).callback as () => void;
      sponsoredCallback?.();

      return;
    }

    if(['IMG', 'DIV', 'SPAN'/* , 'A' */].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');

    if(['DIV', 'SPAN'].indexOf(target.tagName) !== -1/*  || target.tagName === 'A' */) {
      if(target.classList.contains('goto-original')) {
        const savedFrom = bubble.dataset.savedFrom as FullMid;
        const {peerId, mid} = splitFullMid(savedFrom);
        this.chat.appImManager.setInnerPeer({
          ...additionalSetPeerProps,
          peerId: peerId.toPeerId(),
          lastMsgId: +mid
        });
        return;
      } else if(target.classList.contains('forward')) {
        const message = this.chat.getMessage(bubbleFullMid);
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
        const message = this.chat.getMessage(bubbleFullMid) as Message.message;
        const replyTo = message.reply_to;

        if(replyTo._ === 'messageReplyStoryHeader') {
          const target = bubble.querySelector('.reply-media');
          const peerId = getPeerId(replyTo.peer);
          createStoriesViewerWithPeer({
            target: () => target,
            peerId,
            id: replyTo.story_id
          });
          return;
        }

        let replyToMid = replyTo.reply_to_msg_id;
        if(!replyToMid) {
          toastNew({langPackKey: replyTo.pFlags.quote ? 'QuotePrivate' : 'ReplyPrivate'});
          return;
        }

        let replyToPeerId = replyTo.reply_to_peer_id ? getPeerId(replyTo.reply_to_peer_id) : message.peerId;
        if(this.chat.type === ChatType.Discussion && !this.chat.isForum) {
          const historyResult = await this.managers.appMessagesManager.getHistory({
            peerId: replyToPeerId,
            threadId: this.chat.threadId,
            limit: 1,
            offsetId: 1,
            addOffset: -1
          });

          const message = this.chat.getMessageByPeer(replyToPeerId, historyResult.history[0]) as Message.message;
          const fwdFrom = message.fwd_from;
          if(fwdFrom?.channel_post === replyToMid) {
            replyToMid = message.mid;
            replyToPeerId = message.peerId;
          }
        }

        this.followStack.push(bubbleFullMid);

        this.chat.appImManager.setInnerPeer({
          ...additionalSetPeerProps,
          peerId: replyToPeerId,
          lastMsgId: replyToMid,
          type: this.chat.type,
          threadId: this.chat.threadId
        });
      }
    }
  };

  private openEmojiPackByTarget(stickerEmojiEl: HTMLElement) {
    this.managers.appEmojiManager.getCustomEmojiDocument(stickerEmojiEl.dataset.docId).then((doc) => {
      const attribute = doc.attributes.find((attribute) => attribute._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
      if(!attribute) {
        return;
      }

      const inputStickerSet = attribute.stickerset as InputStickerSet.inputStickerSetID;
      PopupElement.createPopup(
        PopupStickers,
        inputStickerSet,
        true,
        this.chat.input
      ).show();
    });
  }

  public checkTargetForMediaViewer(target: HTMLElement, e?: Event, mediaTimestamp?: number) {
    const bubble = findUpClassName(target, 'bubble');
    const documentDiv = findUpClassName(target, 'document-with-thumb');

    if(
      (target.tagName === 'IMG' && !target.classList.contains('emoji') && !target.classList.contains('document-thumb')) ||
      target.classList.contains('album-item') ||
      target.classList.contains('album-item-media') ||
      // || isVideoComponentElement
      (target.tagName === 'VIDEO' && !bubble.classList.contains('round')) ||
      (documentDiv && !documentDiv.querySelector('.preloader-container')) ||
      target.classList.contains('canvas-thumbnail')
    ) {
      const groupedItem = findUpClassName(target, 'album-item') || findUpClassName(target, 'document-container');
      const preloader = (groupedItem || bubble).querySelector<HTMLElement>('.preloader-container');
      if(preloader && e) {
        simulateClickEvent(preloader);
        cancelEvent(e);
        return;
      }

      cancelEvent(e);
      const groupedItemIndex = groupedItem ? +(groupedItem.dataset.index ?? -1) : -1;
      const fullMessageId = getBubbleFullMid(groupedItemIndex !== -1 ? bubble : groupedItem || bubble);
      let message = this.chat.getMessage(fullMessageId), isSponsored = false;
      if(!message) {
        if(splitFullMid(fullMessageId).mid < 0) {
          message = (bubble as any).message;
          isSponsored = true;
        } else {
          this.log.warn('no message by messageId:', fullMessageId);
          return;
        }
      }

      if(bubble.classList.contains('story')) {
        const container = findUpAttribute(target, 'data-story-peer-id');
        const storyPeerId = container.dataset.storyPeerId.toPeerId();
        const storyId = +container.dataset.storyId;
        createStoriesViewerWithPeer({
          target: () => container.querySelector('.media-container-aspecter') || target,
          peerId: storyPeerId,
          id: storyId
        });
        return;
      }

      const SINGLE_MEDIA_CLASSNAME = 'single-media';
      const isSingleMedia = bubble.classList.contains(SINGLE_MEDIA_CLASSNAME);

      const f = documentDiv ? (media: any) => {
        return AppMediaViewer.isMediaCompatibleForDocumentViewer(media);
      } : (media: any) => {
        return media._ === 'photo' || ['video', 'gif'].includes(media.type);
      };

      const targets: {element: HTMLElement, mid: number, peerId: PeerId, fullMid: string, index?: number}[] = [];
      const fullMids = isSingleMedia ? [fullMessageId] : this.getRenderedHistory('asc').map((fullMid) => {
        const bubble = this.getBubble(fullMid);
        if(!isSingleMedia && bubble.classList.contains(SINGLE_MEDIA_CLASSNAME)) {
          return;
        }

        const message = this.chat.getMessage(fullMid);
        const media = getMediaFromMessage(message);

        return media && f(media) && fullMid;
      }).filter(Boolean) as FullMid[];

      fullMids.forEach((fullMid) => {
        let bubble = this.skippedMids.has(fullMid) ? undefined : this.getBubble(fullMid);
        if(!bubble) {
          bubble = this.chatInner.querySelector(`.grouped-item:not(.album-item)[data-mid="${fullMid}"]`);
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
          // selector = '.album-item video, .album-item img, .preview video, .preview img, ';
          selector = '.album-item, .webpage-preview, ';
          // selector = '.album-item, ';
          if(withTail) {
            selector += '.bubble__media-container';
          } else {
            selector += '.attachment';
          }
        }

        const elements = Array.from(bubble.querySelectorAll(selector)) as HTMLElement[];
        const parents: Set<HTMLElement> = new Set();
        if(documentDiv) {
          elements.forEach((element) => {
            targets.push({
              element: element.querySelector('.document-ico'),
              mid: +element.dataset.mid,
              peerId: this.peerId,
              fullMid: getBubbleFullMid(element)
            });
          });
        } else {
          const hasAspecter = !!bubble.querySelector('.media-container-aspecter');
          elements.forEach((element) => {
            element = element.querySelector('video, img') || element;
            if(hasAspecter && !findUpClassName(element, 'media-container-aspecter')) return;
            const albumItem = findUpClassName(element, 'album-item');
            const parent = albumItem || element.parentElement;
            if(parents.has(parent)) return;
            parents.add(parent);
            const _fullMid = groupedItemIndex !== -1 ? fullMid : getBubbleFullMid(albumItem || element) || fullMid;
            targets.push({
              element,
              mid: splitFullMid(_fullMid).mid,
              peerId: this.peerId,
              fullMid: _fullMid,
              index: albumItem && +(albumItem.dataset.index ?? -1)
            });
          });
        }
      });

      // * filter duplicates (can have them in grouped documents)
      forEachReverse(targets, (target, idx, arr) => {
        const foundIndex = arr.findIndex((t) => t.element === target.element);
        if(foundIndex !== idx) {
          arr.splice(foundIndex, 1);
        }
      });

      // targets.sort((a, b) => a.mid - b.mid);

      const idx = groupedItemIndex === -1 ? targets.findIndex((t) => t.fullMid === fullMessageId) : targets.findIndex((t) => t.index === groupedItemIndex);

      if(DEBUG) {
        this.log('open mediaViewer single with ids:', fullMids, idx, targets);
      }

      if(!targets[idx]) {
        this.log('no target for media viewer!', target);
        return;
      }

      new AppMediaViewer(undefined, isSponsored)
      .setSearchContext({
        threadId: this.chat.threadId,
        peerId: this.peerId,
        inputFilter: {_: documentDiv ? 'inputMessagesFilterDocument' : 'inputMessagesFilterPhotoVideo'},
        useSearch: this.chat.type !== ChatType.Scheduled && !isSingleMedia,
        isScheduled: this.chat.type === ChatType.Scheduled
      })
      .openMedia({
        message: message,
        index: targets[idx].index,
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
    const messages = await Promise.all(slice.map((fullMid) => this.chat.getMessage(fullMid)));
    if(!middleware()) return;

    slice.forEach((fullMid, idx) => {
      const message = messages[idx];

      const bubble = this.getBubble(fullMid);
      let bad = true;
      if(bubble) {
        const rect = bubble.getBoundingClientRect();
        bad = (windowSize.height / 2) > rect.top;
      } else if(message) {
        bad = false;
      }

      if(bad) {
        this.followStack.splice(this.followStack.indexOf(fullMid), 1);
      }
    });

    // ! WARNING
    this.followStack.sort((a, b) => splitFullMid(b).mid - splitFullMid(a).mid);

    const fullMid = this.followStack.pop();
    const {mid} = splitFullMid(fullMid);
    this.chat.setMessageId({lastMsgId: mid});
  }

  public getBubbleByPoint(verticalSide: 'top' | 'bottom') {
    const slice = this.getViewportSlice();
    const item = slice.visible[verticalSide === 'top' ? 0 : slice.visible.length - 1];
    return item?.element;
  }

  public async getGroupedBubble(peerId: PeerId, groupId: string) {
    const mids = await this.managers.appMessagesManager.getMidsByGroupedId(groupId);
    for(const mid of mids) {
      const fullMid = makeFullMid(peerId, mid);
      const bubble = this.getBubble(fullMid);
      if(bubble && !this.skippedMids.has(fullMid)) {
        // const maxId = Math.max(...mids); // * because in scheduled album can be rendered by lowest mid during sending
        return {
          bubble,
          peerId,
          mid
          // message: await this.chat.getMessage(maxId) as Message.message
        };
      }
    }
  }

  public getBubbleGroupedItems(bubble: HTMLElement) {
    return Array.from(bubble.querySelectorAll('.grouped-item')) as HTMLElement[];
  }

  public async getMountedBubble(fullMid: FullMid | Message.message | Message.messageService) {
    let message: Message.message | Message.messageService, peerId: PeerId, mid: number;
    if(typeof(fullMid) === 'string') {
      const d = splitFullMid(fullMid);
      peerId = d.peerId;
      mid = d.mid;
      message = this.chat.getMessageByPeer(peerId, mid);
    } else {
      message = fullMid;
      peerId = message.peerId;
      mid = message.mid;
      fullMid = makeFullMid(peerId, mid);
    }

    if(!message) {
      return;
    }

    const groupedId = (message as Message.message).grouped_id;
    if(groupedId) {
      const a = await this.getGroupedBubble(peerId, groupedId);
      if(a) {
        a.bubble = a.bubble.querySelector(`.document-container[data-mid="${mid}"]`) || a.bubble;
        return a;
      }
    }

    const bubble = this.getBubble(fullMid);
    if(!bubble || this.skippedMids.has(fullMid)) return;

    return {bubble, peerId, mid};
  }

  private findNextMountedBubbleByMsgId(fullMid: FullMid, prev?: boolean) {
    if(this.chat.type === ChatType.Search) {
      const fullMids = this.getRenderedHistory('desc', true);
      const idx = fullMids.indexOf(fullMid);
      if(idx === -1) return;
      const nextFullMid = fullMids[idx + (prev ? -1 : 1)];
      return this.getBubble(nextFullMid);
    }

    const fullMids = this.getRenderedHistory(prev ? 'desc' : 'asc');

    let filterCallback: (_mid: FullMid) => boolean;
    if(prev) filterCallback = (_mid) => splitFullMid(_mid).mid < splitFullMid(fullMid).mid;
    else filterCallback = (_mid) => splitFullMid(fullMid).mid < splitFullMid(_mid).mid;

    const foundMid = fullMids.find((fullMid) => {
      if(!filterCallback(fullMid)) return false;
      return !!this.getBubble(fullMid)?.parentElement;
    });

    return this.getBubble(foundMid);
  }

  public getRenderedHistory(sort: 'asc' | 'desc' = 'desc', onlyReal?: boolean) {
    let history = flatten(
      this.bubbleGroups.groups.map((group) => group.items.map((item) => makeFullMid(item.message)))
    );

    if(sort === 'asc') {
      history.reverse();
    }

    if(onlyReal) {
      history = history.filter((fullMid) => {
        const {mid} = splitFullMid(fullMid);
        return mid > 0 && clearMessageId(mid, false) === mid;
      });
    }

    return history;
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

    const history = this.getRenderedHistory('asc');

    if(!history.length) {
      history.push(EMPTY_FULL_MID);
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

  private onScroll = (ignoreHeavyAnimation?: boolean, scrollDimensions?: ScrollStartCallbackDimensions, forceDown?: boolean) => {
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

    this.checkIntersectingVideos();
  };

  private checkIntersectingVideos() {
    if(!USE_VIDEO_OBSERVER) {
      return;
    }

    const intersecting = this.observer?.getIntersecting();
    if(!intersecting) {
      return;
    }

    const videos = Array.from(intersecting).filter((el) => el instanceof HTMLVideoElement && el.mini);
    const centerY = videos.length ? windowSize.height / 2 : 0;
    const distances = videos.map((video) => {
      const bubble = findUpClassName(video, 'bubble');
      const rect = video.getBoundingClientRect();
      const rectBubble = bubble.getBoundingClientRect();
      const distanceToVerticalCenter = Math.abs(rect.top + rect.height / 2 - centerY);
      let distanceBubbleToVerticalCenter = rectBubble.top > centerY ? rectBubble.top - centerY : centerY - rectBubble.bottom;
      if(rectBubble.top < centerY && rectBubble.bottom > centerY) { // * if bubble is in the center
        distanceBubbleToVerticalCenter = 0;
      }
      return {
        video,
        rect,
        /* , bubble */
        distance: distanceToVerticalCenter,
        distanceBubble: distanceBubbleToVerticalCenter
      };
    }).sort((a, b) => a.distance - b.distance);
    let closest = distances[0];
    if(this.scrolledDown && closest) { // * if it's the last message
      distances.sort((a, b) => b.rect.bottom - a.rect.bottom);
      closest = distances[0];
    } else if(closest && closest.distance > 150 && closest.distanceBubble > 150) {
      closest = undefined;
    }

    const video = closest?.video as HTMLVideoElement;
    if(this.lastPlayingVideo !== video) {
      const animationItem = animationIntersector.getAnimations(this.lastPlayingVideo)[0];
      if(animationItem) {
        animationIntersector.toggleItemLock(animationItem, true);
        this.lastPlayingVideo.pause();
      }

      this.lastPlayingVideo = video;

      if(video) {
        // console.log('video', video);
        const animationItem = animationIntersector.getAnimations(video)[0];
        animationIntersector.toggleItemLock(animationItem, false);
        safePlay(video);
      }
    }
  }

  private onVideoLoad = async() => {
    if(!USE_VIDEO_OBSERVER) {
      return;
    }

    await getHeavyAnimationPromise();
    await doubleRaf();
    if(this.lastPlayingVideo) {
      return;
    }
    this.checkIntersectingVideos();
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

    for(const mid of this.unreadOut) {
      if(mid > 0 && mid <= maxId) {
        const fullMid = makeFullMid(this.peerId, mid);
        const bubble = this.getBubble(fullMid);
        if(!bubble) {
          continue;
        }

        this.unreadOut.delete(mid);

        if(bubble.classList.contains('is-outgoing') || bubble.classList.contains('is-error')) {
          continue;
        }

        this.setBubbleSendingStatus(bubble, 'read');
      }
    }
  }

  public destroyBubble(
    bubble: HTMLElement,
    animate?: boolean,
    fullMid = getBubbleFullMid(bubble)
  ) {
    let placeholder: HTMLElement, canBeDeleted: {
      element: HTMLElement,
      parentElement: HTMLElement,
      index: number,
      rect: DOMRect,
      marginBottom?: number,
      previousElement?: HTMLElement,
      previousSameKindElement?: HTMLElement
    }[], wasScrollSize: number, padding: ReturnType<ChatBubbles['setTopPadding']>;
    if(animate && bubble.isConnected) {
      const goodSelectors: string[] = ['.bubbles-date-group', '.bubbles-group', '.bubble'];
      canBeDeleted = [bubble, ...getParents(bubble, goodSelectors[0])].map((element, idx, arr) => {
        const length = arr.length;
        const selectors = goodSelectors.slice(0, length - idx);
        const sameKind = Array.from(arr[length - 1].parentElement.querySelectorAll<HTMLElement>(selectors.join(' ')));
        const previousSameKindElement = sameKind[sameKind.indexOf(element) - 1];
        return {
          element,
          parentElement: element.parentElement,
          index: whichChild(element, false),
          rect: element.getBoundingClientRect(),
          previousElement: element.previousElementSibling as HTMLElement,
          marginBottom: parseInt(window.getComputedStyle(element).marginBottom),
          previousSameKindElement
        };
      });

      padding = this.setTopPadding();
      wasScrollSize = this.scrollable.scrollSize;
      placeholder = document.createElement('div');
      placeholder.classList.add('bubble-delete-placeholder');
    }

    // this.log.warn('destroy bubble', bubble, mid);

    /* const mounted = this.getMountedBubble(mid);
    if(!mounted) return; */

    if(this.getBubble(fullMid) === bubble) { // have to check because can clear bubble with same id later
      delete this.bubbles[fullMid];
    }

    this.skippedMids.delete(fullMid);

    if(this.firstUnreadBubble === bubble) {
      this.firstUnreadBubble = null;
    }

    const scrollSaver = canBeDeleted && this.createScrollSaver(false);
    scrollSaver?.save();

    this.bubbleGroups.removeAndUnmountBubble(bubble);
    if(this.observer) {
      this.observer.unobserve(bubble, this.unreadedObserverCallback);
      this.unreaded.delete(bubble);

      this.observer.unobserve(bubble, this.unreadedContentObserverCallback);
      this.unreadedContent.delete(bubble);

      this.observer.unobserve(bubble, this.viewsObserverCallback);
      this.viewsMids.delete(fullMid);

      this.observer.unobserve(bubble, this.stickerEffectObserverCallback);
      this.observer.unobserve(bubble, this.messageEffectObserverCallback);
    }

    bubble.timeAppenders = bubble.timeSpan = undefined;

    if(canBeDeleted) {
      let deletingItem: typeof canBeDeleted[0];
      canBeDeleted.forEach((item) => {
        if(!item.element.parentElement) {
          deletingItem = item;
        }
      });

      const height = wasScrollSize - this.scrollable.scrollSize;
      const isDeletingOnlyBubble = deletingItem === canBeDeleted[0];
      const isGroupLastBubble = bubble.classList.contains('is-group-last');
      const isGroupFirstBubble = bubble.classList.contains('is-group-first');

      placeholder.style.cssText = `width: 100%; height: ${height}px;`;
      deletingItem.element.style.cssText = `position: absolute; z-index: 0; left: 0; right: 0; top: ${deletingItem.rect.top - 56}px; height: ${deletingItem.rect.height}px;`;

      this.remover.append(deletingItem.element);

      canBeDeleted.forEach((item) => {
        if(!item.element.parentElement) {
          positionElementByIndex(item.element, item.parentElement, item.index, -1);
        }
      });

      // * if joined groups that were splitted before with this bubble, let's insert placeholder inside of a new group
      if(deletingItem.previousElement && !deletingItem.previousElement.parentElement && canBeDeleted[0].previousSameKindElement) {
        canBeDeleted[0].previousSameKindElement.after(placeholder);
      } else {
        positionElementByIndex(placeholder, deletingItem.parentElement, deletingItem.index, -1);
      }/*  else if(canBeDeleted[0].nextSameKindElement) {
        canBeDeleted[0].nextSameKindElement.before(placeholder);
      } */

      // if(false && isDeletingOnlyBubble && isGroupLastBubble && !isGroupFirstBubble) {
      //   canBeDeleted[1].element.after(placeholder);
      // } else if(deletingItem.previousElement?.parentElement) {
      //   deletingItem.previousElement.after(placeholder);
      // } else if(deletingItem.nextElement?.parentElement) {
      //   deletingItem.nextElement.before(placeholder);
      // } else {
      //   positionElementByIndex(placeholder, deletingItem.parentElement, deletingItem.index, -1);
      // }

      scrollSaver.restore();
      scrollSaver.save(); // * save again after moving elements

      const options: KeyframeAnimationOptions = {duration: 300, fill: 'forwards', easing: 'cubic-bezier(.4, .0, .2, 1)'};

      // const contentWrapper = bubble.querySelector<HTMLElement>('.bubble-content-wrapper');
      // const bubbleDeleteKeyframe: Keyframe = {transform: 'scale(0)'};
      // const bubbleDeleteKeyframe: Keyframe = {transform: `translateX(${3 * (bubble.classList.contains('is-out') ? 1 : -1)}rem)`};
      // const avatarContainer = isDeletingOnlyBubble && isGroupLastBubble && !isGroupFirstBubble && deletingItem.parentElement.querySelector<HTMLElement>('.bubbles-group-avatar-container');
      const avatarContainer = isDeletingOnlyBubble && isGroupLastBubble && !isGroupFirstBubble && deletingItem.parentElement.querySelector<HTMLElement>('.bubbles-group-avatar');
      // const avatarForDeletion = isGroupLastBubble && isGroupFirstBubble && bubble.parentElement.querySelector<HTMLElement>('.bubbles-group-avatar');
      // false && [contentWrapper, avatarForDeletion].filter(Boolean).forEach((element) => {
      //   element.style.transformOrigin = `var(--transform-origin-inline-${bubble.classList.contains('is-out') ? 'end' : 'start'}) top`;
      // });
      // * fix jumping floating avatar when height reaches 0px
      const placeholderAnimation = placeholder.animate([/* {height: `${rect.height}px`},  */{height: '0.01px', marginBottom: '0px'}], options);
      const deletionAnimation = deletingItem.element.animate([/* {opacity: 1},  */{/* filter: 'blur(8px)',  */opacity: 0/* , ...(isDeletingOnlyBubble ? bubbleDeleteKeyframe : {}) */}], options);
      // const bubbleDeletionAnimation = /* deletingItem !== canBeDeleted[0] &&  */false && contentWrapper.animate([bubbleDeleteKeyframe], options);
      // const avatarDeletionAnimation = false && avatarForDeletion && avatarForDeletion.animate([bubbleDeleteKeyframe], options);
      // const avatarAnimation = avatarContainer ? avatarContainer.animate([{transform: `translateY(0px)`}, {transform: `translateY(-${deletingItem.marginBottom}px)`}], {...options/* , duration: +options.duration + 2000, fill: 'auto' */}) : undefined;
      const avatarAnimation = avatarContainer ? avatarContainer.animate([{transform: `translateY(-${deletingItem.marginBottom}px)`}, {transform: `translateY(-${deletingItem.marginBottom}px)`}], options) : undefined;
      // const avatarAnimation = avatarContainer && avatarContainer.animate([{bottom: `0px`}, {bottom: `${deletingItem.marginBottom}px`}], {...options, duration: +options.duration + 200, fill: 'auto'});
      const promises = [placeholderAnimation, deletionAnimation, avatarAnimation/* , bubbleDeletionAnimation, avatarDeletionAnimation */].filter(Boolean).map((animation) => animation.finished);
      const promise = Promise.all(promises).then(() => {
        placeholder.remove();
        deletingItem.element.remove();
        avatarAnimation?.cancel();
        bubble.middlewareHelper.destroy();
        getHeavyAnimationPromise().then(() => {
          padding.unsetPadding?.();
        });
      });

      this.animateSomethingWithScroll(promise, scrollSaver);
    } else {
      bubble.middlewareHelper.destroy();
    }

    // this.reactions.delete(mid);
  }

  private animateSomethingWithScroll(promise: Promise<any>, scrollSaver?: ScrollSaver) {
    if(!scrollSaver) {
      scrollSaver = this.createScrollSaver(true);
      scrollSaver.save();
    }

    let finished = false;
    promise.then(() => {
      finished = true;
    });

    dispatchHeavyAnimationEvent(promise);

    scrollSaver && animateSingle(() => {
      if(finished) {
        return false;
      }

      scrollSaver.restore();
      return true;
    }, this.scrollable.container);
  }

  public deleteMessagesByIds(fullMids: FullMid[], permanent = true, ignoreOnScroll?: boolean) {
    fullMids = fullMids.filter((fullMid) => {
      return !!this.getBubble(fullMid);
    });

    if(!fullMids.length) {
      return;
    }

    const rendered = this.getRenderedHistory('desc');
    const indexes: Record<FullMid, number> = {};
    rendered.forEach((mid, idx) => indexes[mid] = idx);

    fullMids
    .slice()
    .sort((a, b) => (indexes[a] ?? 0) - (indexes[b] ?? 0))
    .forEach((fullMid) => {
      const bubble = this.getBubble(fullMid);
      this.destroyBubble(bubble, permanent && liteMode.isAvailable('animations'));
    });

    this.scrollable.ignoreNextScrollEvent();
    if(permanent && this.chat.selection.isSelecting) {
      let releaseBatch: () => void;
      fullMids.forEach((fullMid) => {
        const {peerId, mid} = splitFullMid(fullMid);
        releaseBatch = this.chat.selection.deleteSelectedMids(peerId, [mid], true);
      });
      releaseBatch?.();
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
    if(!this.isTopPaddingSet && this.chat.type !== ChatType.Scheduled) {
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
        this.scrollable.setScrollPositionSilently(scrollHeight);
        this.isTopPaddingSet = true;
      }
    }

    return {
      isPaddingNeeded,
      unsetPadding: isPaddingNeeded ? () => {
        if(!middleware()) {
          return;
        }

        setPaddingTo.style.paddingTop = '';
        this.isTopPaddingSet = false;
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
        setPeerPromise.then(() => {
          if(!middleware()) return;
          const newMessage = this.chat.getMessageByPeer(message.peerId, message.mid);
          this.renderNewMessage(newMessage);
        });
      }

      return;
    }

    if(this.chat.threadId && getMessageThreadId(message, this.chat.isForum) !== this.chat.threadId) {
      return;
    }

    const {savedReaction} = this.chat;
    if(savedReaction?.length) {
      const {reactions} = message as Message.message;
      const foundReaction = reactions?.results && savedReaction.every((reaction) => {
        return reactions.results.some((reactionCount) => reactionsEqual(reactionCount.reaction, reaction));
      });

      if(!foundReaction) {
        return;
      }
    }

    const fullMid = makeFullMid(message);
    if(this.getBubble(fullMid)) {
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

        let bubble: HTMLElement;
        if(this.chat.type === ChatType.Scheduled) {
          bubble = this.getBubble(fullMid);
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
      this.scrollable.lastScrollPosition = this.scrollable.scrollPosition;
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

    const isScheduled = this.chat.type === ChatType.Scheduled;

    if(today.getTime() === date.getTime()) {
      dateElement = i18n(isScheduled ? 'Chat.Date.ScheduledForToday' : 'Date.Today');
    } else if(isScheduled && timestamp === SEND_WHEN_ONLINE_TIMESTAMP) {
      dateElement = i18n('MessageScheduledUntilOnline');
    } else {
      dateElement = formatDate(date, today);

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
      firstTimestamp: date.getTime(),
      groupsLength: 0
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

    // if(TEST_SCROLL !== undefined) {
    //   TEST_SCROLL = TEST_SCROLL_TIMES;
    // }

    this.skippedMids.clear();
    this.dateMessages = {};
    this.bubbleGroups?.cleanup();
    this.bubbleGroups = new BubbleGroups(this.chat);
    this.unreadOut.clear();
    this.needUpdate = [];
    this.lazyLoadQueue.clear();
    this.renderNewPromises.clear();
    this.changedMids.clear();

    // clear messages
    if(bubblesToo) {
      this.scrollable.replaceChildren();
      this.chatInner.replaceChildren();
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
      this.unreadedContent.clear();
      this.unreadedSeen.clear();
      this.unreadedContentSeen.clear();
      this.readPromise = undefined;
      this.readContentPromise = undefined;

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

  public async setPeer(options: ChatSetPeerOptions & {samePeer: boolean, sameSearch: boolean}): Promise<{cached?: boolean, promise: Chat['setPeerPromise']}> {
    const {samePeer, sameSearch, peerId, stack} = options;
    let {lastMsgId, lastMsgPeerId, startParam} = options;
    const tempId = ++this.setPeerTempId;

    let lastMsgFullMid: FullMid, topMessageFullMid: FullMid;

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
      // await pause(2000); // * test some bugs
      await m(this.chat.onChangePeer(options, m));
    }

    /* if(samePeer && this.chat.setPeerPromise) {
      return {cached: true, promise: this.chat.setPeerPromise};
    } */

    const chatType = this.chat.type;

    if(chatType === ChatType.Scheduled || this.chat.isRestricted) {
      lastMsgFullMid = EMPTY_FULL_MID;
    } else if(lastMsgId) {
      lastMsgFullMid = makeFullMid(lastMsgPeerId ?? peerId, lastMsgId);
    } else {
      lastMsgFullMid = EMPTY_FULL_MID;
    }

    const historyStorage = await m(this.chat.getHistoryStorage());
    if(chatType === ChatType.Pinned) {
      topMessageFullMid = makeFullMid(peerId, await m(this.managers.appMessagesManager.getPinnedMessagesMaxId(peerId, this.chat.threadId)));
    } else if(historyStorage.searchHistory) {
      topMessageFullMid = (historyStorage.searchHistory.first[0] as FullMid) ?? EMPTY_FULL_MID;
    } else {
      topMessageFullMid = historyStorage.maxId ? makeFullMid(peerId, historyStorage.maxId) : EMPTY_FULL_MID;
    }
    const isTarget = lastMsgFullMid !== EMPTY_FULL_MID;

    // * this one will fix topMessage for null message in history (e.g. channel comments with only 1 comment and it is a topMessage)
    /* if(chatType !== 'pinned' && topMessage && !historyStorage.history.slice.includes(topMessage)) {
      topMessage = 0;
    } */

    if(stack) {
      this.chat.appImManager.clickIfSponsoredMessage(stack.message);
    }

    let followingUnread: boolean;
    let readMaxId = 0, savedPosition: ReturnType<AppImManager['getChatSavedPosition']>, overrideAdditionMsgId: number;
    if(!isTarget) {
      if(!samePeer) {
        savedPosition = this.chat.appImManager.getChatSavedPosition(this.chat);
      }

      if(savedPosition) {

      } else if(this.chat.type === ChatType.Search) {
        lastMsgFullMid = topMessageFullMid;
      } else if(topMessageFullMid !== EMPTY_FULL_MID) {
        let dialog: Awaited<ReturnType<Chat['getDialogOrTopic']>>;
        if(!options.savedReaction) {
          [readMaxId, dialog] = await m(Promise.all([
            this.managers.appMessagesManager.getReadMaxIdIfUnread(peerId, this.chat.threadId),
            this.chat.getDialogOrTopic()
          ]));
        }

        if(/* dialog.unread_count */
          readMaxId &&
          !samePeer &&
          (!dialog || (!isSavedDialog(dialog) && dialog.unread_count !== 1))
        ) {
          const foundSlice = historyStorage.history.findSliceOffset(readMaxId);
          if(foundSlice && foundSlice.slice.isEnd(SliceEnd.Bottom)) {
            overrideAdditionMsgId = foundSlice.slice[foundSlice.offset - 25] || foundSlice.slice[0] || readMaxId;
          }

          followingUnread = !isTarget;
          lastMsgFullMid = makeFullMid(peerId, readMaxId);
        } else {
          lastMsgFullMid = topMessageFullMid;
        }
      }
    }

    const isGoingToBottomEnd = lastMsgFullMid === topMessageFullMid || (lastMsgFullMid === EMPTY_FULL_MID && !followingUnread);
    const isJump = lastMsgFullMid !== topMessageFullMid/*  && overrideAdditionMsgId === undefined */;

    if(isGoingToBottomEnd && lastMsgFullMid !== EMPTY_FULL_MID) {
      const message = this.chat.getMessage(lastMsgFullMid);
      if(!message) {
        this.log('fix going to bottom end without existing message', lastMsgFullMid);
        lastMsgFullMid = EMPTY_FULL_MID;
      }
    }

    if(startParam === undefined && await m(this.chat.isStartButtonNeeded())) {
      startParam = BOT_START_PARAM;
    }

    if(samePeer && sameSearch) {
      if(stack && lastMsgFullMid !== EMPTY_FULL_MID && stack.peerId === peerId) {
        this.followStack.push(makeFullMid(stack.peerId, stack.mid));
      }

      const mounted = await m(this.getMountedBubble(lastMsgFullMid));
      let bubble = mounted?.bubble;
      if(!bubble && this.skippedMids.has(lastMsgFullMid)) {
        bubble = this.findNextMountedBubbleByMsgId(lastMsgFullMid, false) || this.findNextMountedBubbleByMsgId(lastMsgFullMid, true);
      }

      if(bubble) {
        if(isTarget) {
          this.scrollToBubble(bubble, 'center');
          this.highlightBubble(bubble);
          this.chat.dispatchEvent('setPeer', lastMsgId, false);
        } else if(topMessageFullMid !== EMPTY_FULL_MID && !isJump) {
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
              lastMsgFullMid,
              middleware,
              mediaTimestamp: options.mediaTimestamp
            });
          });
        }

        // * set draft if already in this peer
        if(options.text) {
          this.managers.appDraftsManager.setDraft(this.peerId, this.chat.threadId, options.text);
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
      log('setPeer peerId:', peerId, historyStorage, lastMsgFullMid, topMessageFullMid);
    }

    // add last message, bc in getHistory will load < max_id
    const additionalMid = isJump || [ChatType.Search, ChatType.Scheduled].includes(chatType) || this.chat.isRestricted ? undefined : overrideAdditionMsgId ?? splitFullMid(topMessageFullMid).mid;
    const additionalFullMid = additionalMid ? makeFullMid(peerId, additionalMid) : undefined;

    let maxBubbleFullMid = EMPTY_FULL_MID;
    if(samePeer) {
      const el = this.getBubbleByPoint('bottom'); // ! this may not work if being called when chat is hidden
      // this.chat.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el);
      if(el) {
        maxBubbleFullMid = getBubbleFullMid(el);
      }

      if(!maxBubbleFullMid) {
        const rendered = this.getRenderedHistory('desc', true);
        maxBubbleFullMid = rendered[0] || EMPTY_FULL_MID;
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

    const canScroll = samePeer && sameSearch;
    // const haveToScrollToBubble = (topMessage && (isJump || samePeer)) || isTarget;
    const haveToScrollToBubble = canScroll || (topMessageFullMid !== EMPTY_FULL_MID && isJump) || isTarget;
    const fromUp = maxBubbleFullMid !== EMPTY_FULL_MID && (lastMsgFullMid === EMPTY_FULL_MID/*  || lastMsgId < 0 */ || await (async() => {
      const historyStorage = await this.chat.getHistoryStorage();
      const slicedArray = historyStorage.searchHistory || historyStorage.history;
      if(slicedArray === historyStorage.searchHistory) {
        const lastIndex = slicedArray.first.indexOf(lastMsgFullMid);
        const maxIndex = slicedArray.first.indexOf(maxBubbleFullMid);
        return lastIndex < maxIndex;
      } else {
        return splitFullMid(maxBubbleFullMid).mid < splitFullMid(lastMsgFullMid).mid;
      }
    })());
    const scrollFromDown = !fromUp && canScroll;
    const scrollFromUp = !scrollFromDown && fromUp && canScroll/*  && (samePeer || forwardingUnread) */;
    this.willScrollOnLoad = scrollFromDown || scrollFromUp;

    this.setPeerOptions = {
      lastMsgFullMid,
      topMessageFullMid,
      savedPosition
    };

    if(!samePeer) {
      this.ranks = undefined;
      this.processRanks = undefined;
      this.canShowRanks = false;

      let canShowRanks = this.chat.isMegagroup, chatId = this.peerId.toChatId();
      if(this.chat.type === ChatType.Saved && !this.chat.threadId.isUser()) {
        const chat = apiManagerProxy.getChat(chatId = this.chat.threadId.toChatId());
        canShowRanks = chat?._ === 'channel';
      }

      if(canShowRanks) {
        this.canShowRanks = true;
        const processRanks = this.processRanks = new Set();

        const promise = this.managers.acknowledged.appProfileManager.getParticipants({
          id: chatId,
          filter: {_: 'channelParticipantsAdmins'},
          limit: 100
        });
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
      result = await m(this.getHistory1(
        !isJump && !additionalFullMid && lastMsgFullMid === topMessageFullMid ? EMPTY_FULL_MID : lastMsgFullMid,
        true,
        isJump,
        additionalFullMid
      ));
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
      peerId,
      isTarget,
      isJump,
      lastMsgId,
      startParam,
      middleware,
      text: options.text,
      entities: options.entities
    };

    if(!cached && !samePeer) {
      await m(this.chat.finishPeerChange(finishPeerChangeOptions));
      this.scrollable.replaceChildren();
      this.preloader.attach(this.container);
    }

    animationIntersector.lockGroup(this.chat.animationGroup);
    const setPeerPromise = m(promise).then(async() => {
      log.warn('promise fulfilled');

      const mountedByLastMsgId = haveToScrollToBubble ? await m(lastMsgFullMid !== EMPTY_FULL_MID ? this.getMountedBubble(lastMsgFullMid) : {bubble: this.getLastBubble()}) : undefined;
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

      const scrollable = this.scrollable;
      scrollable.lastScrollDirection = 0;
      scrollable.lastScrollPosition = 0;
      scrollable.replaceChildren(chatInner);

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

      const afterSetPromise = Promise.all([
        setPeerPromise,
        getHeavyAnimationPromise()
      ]);

      // if(dialog && lastMsgID && lastMsgID !== topMessage && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
      if(savedPosition) {
        scrollable.setScrollPositionSilently(savedPosition.top);
      } else if(haveToScrollToBubble) {
        let unsetPadding: () => void;
        if(scrollFromDown) {
          scrollable.setScrollPositionSilently(99999);
        } else if(scrollFromUp) {
          const set = this.setTopPadding();
          if(set.isPaddingNeeded) {
            unsetPadding = set.unsetPadding;
          }

          scrollable.setScrollPositionSilently(0);
        }

        // const mountedByLastMsgId = lastMsgId ? this.getMountedBubble(lastMsgId) : {bubble: this.getLastBubble()};
        let bubble: HTMLElement = (followingUnread && this.firstUnreadBubble) || mountedByLastMsgId?.bubble;
        const foundTarget = !!bubble?.parentElement;
        if(!foundTarget) {
          bubble = this.findNextMountedBubbleByMsgId(lastMsgFullMid, false) || this.findNextMountedBubbleByMsgId(lastMsgFullMid, true);
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

          if(!followingUnread && isTarget && foundTarget) {
            this.highlightBubble(bubble);
          }
        }

        if(isTarget && !foundTarget) {
          afterSetPromise.then(() => {
            toastNew({langPackKey: 'MessageNotFound'});
          });
        }

        if(unsetPadding) {
          (promise || Promise.resolve()).then(() => {
            unsetPadding();
          });
        }
      } else {
        scrollable.setScrollPositionSilently(99999);
      }

      scrollable.updateThumb(scrollable.lastScrollPosition);

      // if(!cached) {
      this.onRenderScrollSet();
      // }

      this.onScroll();

      afterSetPromise.then(() => { // check whether list isn't full
        if(!middleware()) {
          return;
        }

        // scrollable.checkForTriggers();
        scrollable.onScroll(); // * have to refresh scroll position, not just check with previous position

        if(options.mediaTimestamp !== undefined) {
          // ! :(
          const p = cached && !samePeer && liteMode.isAvailable('animations') && this.chat.appImManager.chats.length > 1 ?
            pause(400) :
            Promise.resolve();
          p.then(() => {
            return this.playMediaWithTimestampAndMid({
              lastMsgFullMid,
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
          samePeer,
          savedPosition
        })
      ]).then(() => {
        log('scrolledAllDown:', scrollable.loadedAll.bottom);
        if(scrollable.loadedAll.bottom && topMessageFullMid !== EMPTY_FULL_MID && !this.unreaded.size) {
          this.onScrolledAllDown();
        }
      });

      if(chatType === ChatType.Chat && !this.chat.isForumTopic) {
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
    lastMsgFullMid,
    mediaTimestamp
  }: {
    middleware: () => boolean,
    lastMsgFullMid: FullMid,
    mediaTimestamp: number
  }) {
    this.getMountedBubble(lastMsgFullMid).then((mounted) => {
      if(!middleware() || !mounted) {
        return;
      }

      this.playMediaWithTimestamp(mounted.bubble, mediaTimestamp);
    });
  }

  public playMediaWithTimestamp(element: HTMLElement, timestamp: number) {
    const bubble = findUpClassName(element, 'bubble');
    const groupedItem = findUpClassName(element, 'grouped-item');
    const groupedItemMid = groupedItem ? +groupedItem.dataset.mid : +bubble.dataset.textMid;
    let attachment = bubble.querySelector<HTMLElement>('.attachment');
    if(attachment) {
      if(groupedItemMid) {
        attachment = attachment.querySelector(`[data-mid="${groupedItemMid}"]`);
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
        this.chat.setMessageId({lastMsgId: replyToMid, mediaTimestamp: timestamp});
      } else {
        this.chat.appImManager.setInnerPeer({
          stack: this.chat.appImManager.getStackFromElement(bubble),
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
      const fetchReactions = () => {
        if(!middleware()) return;

        const rendered = this.getRenderedHistory(undefined, true);
        const map: Map<PeerId, Set<number>> = new Map();
        for(const fullMid of rendered) {
          let message = this.chat.getMessage(fullMid);
          if(message?._ !== 'message') {
            continue;
          }

          message = apiManagerProxy.getGroupsFirstMessage(message);
          const {peerId, mid} = message;

          let mids = map.get(peerId);
          if(!mids) {
            map.set(peerId, mids = new Set());
          }

          mids.add(mid);
        }

        const promises = [...map.entries()].map(([peerId, mids]) => {
          return this.managers.appReactionsManager.getMessagesReactions(peerId, [...mids]);
        });

        const promise = Promise.all(promises);
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
    // lastMsgId,
    // topMessage,
    afterSetPromise,
    savedPosition,
    samePeer
  }: {
    // lastMsgId: number,
    // topMessage: number,
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
    if(this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion) {
      const {peerId, threadId} = this.chat;
      const historyMaxId = await this.chat.getHistoryMaxId();
      this.managers.appMessagesManager.readHistory(peerId, historyMaxId, threadId, true);
    }
  }

  public async finishPeerChange() {
    const [isBroadcast, canWrite, isLikeGroup] = await Promise.all([
      this.chat.isBroadcast,
      this.chat.canSend(),
      this.chat.isLikeGroup
    ]);

    return () => {
      this.chatInner.classList.toggle('has-rights', canWrite);
      this.container.classList.toggle('is-chat-input-hidden', !canWrite);

      [this.chatInner, this.remover].forEach((element) => {
        element.classList.toggle('is-chat', isLikeGroup);
        element.classList.toggle('is-broadcast', isBroadcast);
      });

      this.createResizeObserver();
    };
  }

  private processBatch = async(...args: Parameters<ChatBubbles['batchProcessor']['process']>) => {
    let [loadQueue, m, log] = args;

    const filterQueue = (queue: typeof loadQueue) => {
      return queue.filter((details) => {
        // message can be deleted during rendering
        return details &&
          this.getBubble(makeFullMid(details.message)) === details.bubble &&
          !this.changedMids.has(details.message.mid);
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
    let newLastMid = newLastGroup?.lastMid;

    // * fix slicing sponsored before render
    const sponsoredItem = loadQueue.find(({message}) => (message as Message.message).pFlags.sponsored);
    if(sponsoredItem) {
      newLastMid = sponsoredItem.message.mid;
    }

    const changedTop = firstMid !== newFirstMid;
    const changedBottom = !!lastGroup && lastMid !== newLastMid; // if has no groups then save bottom scroll position

    const firstItem = loadQueue?.[0];
    const firstReverse = firstItem?.reverse;
    const isOneSide = loadQueue.every(({reverse}) => reverse === firstReverse);
    // const reverse = loadQueue[0]?.reverse;
    const reverse = isOneSide ? firstReverse : changedTop && !changedBottom;

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

    // * это нужно для того, чтобы если захочет подгрузить reply или какое-либо сообщение, то скролл не прервался и не сдвинулся
    // * если добавить этот промис - в таком случае нужно сделать, чтобы скроллило к последнему сообщению после рендера
    // * например, к рекламе
    promises.push(getHeavyAnimationPromise());

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

    if(loadQueue.some((details) => details.canAnimateLadder)) {
      this.messagesQueueOnRenderAdditional?.();
    }

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
    message: Message.message | Message.messageService,
    reverse: boolean
  }/*  & {
    unmountIfFound?: boolean
  } */>) {
    let modifiedGroups: typeof groups;

    if(this.chat.type === ChatType.Scheduled) {
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

    items.forEach(({bubble, message, reverse}) => {
      this.bubbleGroups.prepareForGrouping(bubble, message, reverse);
    });

    const groups = this.bubbleGroups.groupUngrouped();

    const avatarPromises = Array.from(groups).map((group) => {
      const firstItem = group.firstItem;
      if(!firstItem) {
        return;
      }

      const shouldHaveAvatar = this.chat.isAvatarNeeded(firstItem.message);
      if(shouldHaveAvatar) {
        if(group.avatar) {
          return;
        }

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

  public getBubble(peerId: PeerId | string, mid?: number) {
    let fullMid: string;
    if(mid) {
      fullMid = makeFullMid(peerId as PeerId, mid);
    } else {
      fullMid = peerId as string;
    }

    return this.bubbles[fullMid];
  }

  private async safeRenderMessage({
    message,
    reverse,
    bubble,
    updatePosition = true,
    processResult,
    canAnimateLadder
  }: {
    message: Message.message | Message.messageService,
    reverse?: boolean,
    bubble?: HTMLElement,
    updatePosition?: boolean,
    processResult?: (result: ReturnType<ChatBubbles['renderMessage']>, bubble: HTMLElement) => typeof result,
    canAnimateLadder?: boolean
  }) {
    const fullMid = makeFullMid(message);
    if(!message || this.renderingMessages.has(fullMid) || (this.getBubble(fullMid) && !bubble)) {
      return;
    }

    const middlewareHelper = getMiddleware();
    const middleware = middlewareHelper.get();
    const realMiddleware = this.getMiddleware();
    realMiddleware.onClean(() => {
      (this.chat.destroyPromise || this.chat.setPeerPromise || Promise.resolve()).then(() => {
        middlewareHelper.destroy();
      });
    });

    let result: Awaited<ReturnType<ChatBubbles['renderMessage']>> & {
      updatePosition: typeof updatePosition,
      canAnimateLadder?: boolean
    };
    try {
      this.renderingMessages.add(fullMid);

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
        this.skippedMids.delete(fullMid);

        this.bubblesToEject.add(bubble);
        this.bubblesToReplace.delete(bubble);
        this.bubblesToReplace.set(newBubble, bubble);
        this.bubbleGroups.changeBubbleByBubble(bubble, newBubble);
      }

      bubble = this.bubbles[fullMid] = newBubble;
      let originalPromise = this.renderMessage(message, reverse, bubble, middleware);
      if(processResult) {
        originalPromise = processResult(originalPromise, bubble);
      }

      const promise = originalPromise.then((r) => ((r && realMiddleware() ? {...r, updatePosition, canAnimateLadder} : undefined) as typeof result));

      this.renderMessagesQueue(promise.catch(() => undefined as any));

      result = await promise;
      if(!realMiddleware()) {
        return;
      }

      if(!result) {
        this.skippedMids.add(fullMid);
      }
    } catch(err) {
      this.log.error('renderMessage error:', err);
    }

    if(!realMiddleware()) {
      return;
    }

    this.renderingMessages.delete(fullMid);
    return result;
  }

  private setBubbleSendingStatus(bubble: HTMLElement, status?: 'sending' | 'error' | 'sent' | 'read', first?: boolean) {
    !first && bubble.classList.remove('is-sending', 'is-error', 'is-sent', 'is-read');
    status && bubble.classList.add('is-' + status);
    bubble.querySelectorAll('.time, .time-inner').forEach((element) => {
      const isReplacingFirst = !!element.querySelector('.time-sending-status');
      if(!status) {
        if(isReplacingFirst) {
          element.firstElementChild.remove();
        }

        return;
      }

      let icon: Icon;
      if(status === 'error') icon = 'sendingerror';
      else if(status === 'sending') icon = 'sending';
      else if(status === 'sent') icon = 'check';
      else icon = 'checks';

      const newIcon = Icon(icon, 'time-sending-status');
      if(isReplacingFirst) {
        element.firstElementChild.replaceWith(newIcon);
      } else {
        element.prepend(newIcon);
      }
    });
  }

  private setBubbleRepliesCount(bubble: HTMLElement, count: number) {
    if(this.chat.threadId) return;
    bubble.querySelectorAll('.time, .time-inner').forEach((element) => {
      let previous = element.querySelector('.time-replies');
      if(!count) {
        previous?.remove();
        return;
      }

      if(!previous) {
        previous = document.createElement('span');
        previous.classList.add('time-replies');
        previous.append(document.createTextNode(''), Icon('reply_filled', 'time-replies-icon', 'time-icon'));
      }

      previous.firstChild.textContent = numberThousandSplitter(count);

      if(!previous.parentElement) {
        element.prepend(previous);
      }
    });
  }

  private setUnreadObserver(type: 'history' | 'content', bubble: HTMLElement, mid?: number, element: HTMLElement = bubble) {
    mid ??= (bubble as any).maxBubbleMid;
    // this.log('not our message', message, message.pFlags.unread);
    this.observer.observe(element, type === 'history' ? this.unreadedObserverCallback : this.unreadedContentObserverCallback);
    (type === 'history' ? this.unreaded : this.unreadedContent).set(element, mid);
  }

  private modifyBubble = async(callback: () => void) => {
    const setBatch = !this.batchingModifying;
    (this.batchingModifying ??= []).push(callback);
    if(setBatch) {
      pause(0).then(async() => {
        await getHeavyAnimationPromise();
        const callbacks = this.batchingModifying;
        const scrollSaver = this.createScrollSaver(false);
        scrollSaver.save();
        callbacks.forEach((callback) => callback());
        scrollSaver.restore();
        this.batchingModifying = undefined;
      });
    }
  };

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
    let groupedMids: number[], reactionsMessage: Message.message;
    const groupedMessages = groupedId ? apiManagerProxy.getMessagesByGroupedId(groupedId) : undefined;

    const groupedMustBeRenderedFull = this.chat.type !== ChatType.Pinned;

    if(groupedId && groupedMustBeRenderedFull) { // will render only first album's message
      groupedMids = groupedMessages.map((message) => message.mid);
      const mainMessage = getMainGroupedMessage(groupedMessages);
      if(message.mid !== mainMessage.mid) {
        return;
      }
    }

    const maxBubbleMid = groupedMids ? Math.max(...groupedMids) : message.mid;
    (bubble as any).maxBubbleMid = maxBubbleMid;

    if(isMessage) {
      reactionsMessage = groupedId ? getMainGroupedMessage(groupedMessages) : message;
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

    await addPaidServiceMessage({
      isAnyGroup: this.chat.isAnyGroup,
      bubble,
      message,
      our,
      peerId: this.peerId,
      groupedMessages
    });


    let isInUnread = !our &&
      !message.pFlags.out &&
      message.pFlags.unread;

    const unreadMention = isMentionUnread(message);
    const unreadReactions = getUnreadReactions(message);

    if(!isInUnread && this.chat.peerId.isAnyChat()) {
      const readMaxId = await this.managers.appMessagesManager.getReadMaxIdIfUnread(this.chat.peerId, this.chat.threadId);
      if(readMaxId !== undefined && readMaxId < maxBubbleMid) {
        isInUnread = true;
      }
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

    const isStoryMention = isMessage && (message.media as MessageMedia.messageMediaStory)?.pFlags?.via_mention;
    const regularAsService = !!isStoryMention;
    let returnService: boolean;

    if(regularAsService || (!isMessage && (!message.action || !SERVICE_AS_REGULAR.has(message.action._)))) {
      const action = (message as Message.messageService).action;
      if(action) {
        const _ = action._;

        const ignoreAction = IGNORE_ACTIONS.get(_);
        if(ignoreAction && (ignoreAction === true || ignoreAction(message as Message.messageService))) {
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
        const isGiftCode = action._ === 'messageActionGiftCode';
        let promise: Promise<any>;
        if(action._ === 'messageActionGiftStars' || action._ === 'messageActionPrizeStars') {
          const content = bubbleContainer.cloneNode(false) as HTMLElement;
          content.classList.add('has-service-before');

          s.append(await wrapMessageActionTextNew({message, middleware}));

          const isSent = message.fromId === rootScope.myId;
          const isPrize = action._ === 'messageActionPrizeStars';

          let subtitle: HTMLElement;
          if(isPrize) {
            subtitle = i18n(
              'Action.StarGiveawayPrize',
              [+action.stars, await wrapPeerTitle({peerId: getPeerId(action.boost_peer)})]
            );
          } else {
            subtitle = i18n(isSent ? 'ActionGiftStarsSubtitle' : 'ActionGiftStarsSubtitleYou', [await wrapPeerTitle({peerId: message.peerId})]);
          }

          this.wrapSomeSolid(() => PremiumGiftBubble({
            rlottieOptions: {
              middleware
            },
            assetName: 'Gift3',
            title: i18n(isPrize ? 'BoostingCongratulations' : 'ActionGiftStarsTitle', [action.stars]),
            subtitle,
            buttonText: i18n('ActionGiftPremiumView'),
            buttonCallback: async() => {
              PopupPayment.create({
                message: message as Message.message,
                noPaymentForm: true,
                transaction: {
                  _: 'starsTransaction',
                  date: message.date,
                  id: action.transaction_id || (isSent ? '' : '1'),
                  peer: {
                    _: 'starsTransactionPeer',
                    peer: isPrize ? action.boost_peer : {
                      _: 'peerUser',
                      user_id: isSent ? message.peerId : rootScope.myId
                    }
                  },
                  pFlags: {
                    gift: isPrize ? undefined : true
                  },
                  stars: formatStarsAmount(action.stars),
                  giveaway_post_id: isPrize ? action.giveaway_msg_id : undefined
                }
              });
            }
          }), content, middleware);

          bubbleContainer.after(content);
        } else if(isGiftCode && !shouldDisplayGiftCodeAsGift(action)) {
          const isUnclaimed = action.pFlags.unclaimed;
          const isGiveaway = action.pFlags.via_giveaway;
          const title = i18n(isUnclaimed ? 'BoostingUnclaimedPrize' : 'BoostingCongratulations');
          const subtitle = document.createElement('span');
          subtitle.append(
            i18n(
              isUnclaimed ? 'BoostingYouHaveUnclaimedPrize' : (isGiveaway ? 'BoostingReceivedPrizeFrom' : (action.boost_peer ? 'BoostingReceivedGiftFrom' : 'BoostingReceivedGiftNoName')),
              action.boost_peer ? [await wrapPeerTitle({peerId: getPeerId(action.boost_peer)})] : undefined
            ),
            document.createElement('br'),
            document.createElement('br'),
            i18n(
              isUnclaimed ? 'BoostingUnclaimedPrizeDuration' : (isGiveaway ? 'BoostingReceivedPrizeDuration' : 'BoostingReceivedGiftDuration'),
              [formatMonthsDuration(action.months, true)]
            )
          );

          const assetName = getGiftAssetName(action.months);

          this.wrapSomeSolid(() => PremiumGiftBubble({
            rlottieOptions: {middleware},
            assetName,
            title,
            subtitle,
            buttonText: i18n('BoostingReceivedGiftOpenBtn'),
            buttonCallback: () => {
              PopupElement.createPopup(PopupGiftLink, action.slug);
            }
          }), bubbleContainer, middleware);
        } else if(action._ === 'messageActionChannelMigrateFrom') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.chat_id.toPeerId(true), wrapOptions});
          s.append(i18n('ChatMigration.From', [peerTitle.element]));
        } else if(action._ === 'messageActionChatMigrateTo') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.channel_id.toPeerId(true), wrapOptions});
          s.append(i18n('ChatMigration.To', [peerTitle.element]));
        } else if(action._ === 'messageActionPaidMessagesPrice') {
          const isFree = !+action.stars;
          s.append(i18n(
            isFree ? 'PaidMessages.GroupPriceChangedFree' : 'PaidMessages.GroupPriceChanged',
            [+action.stars]
          ));
        } else if(action._ === 'messageActionPaidMessagesRefunded') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: this.peerId, onlyFirstName: true, wrapOptions});

          s.append(i18n(
            our ? 'PaidMessages.StarsRefundedByYou' : 'PaidMessages.StarsRefundedToYou',
            [+action.stars, peerTitle.element]
          ));
        } else {
          promise = wrapMessageActionTextNew({
            message,
            ...wrapOptions
          }).then((el) => s.append(el));
        }

        if(action._ === 'messageActionGiftPremium' || (isGiftCode && shouldDisplayGiftCodeAsGift(action))) {
          const content = bubbleContainer.cloneNode(false) as HTMLElement;
          content.classList.add('has-service-before');

          const months = action.months;
          const assetName = getGiftAssetName(months);

          const title = i18n('ActionGiftPremiumTitle2', [formatMonthsDuration(months, false)]);
          const subtitle =
            action.message ?
              wrapRichText(action.message.text, {entities: action.message.entities}) :
              i18n('ActionGiftPremiumSubtitle2');

          this.wrapSomeSolid(() => PremiumGiftBubble({
            rlottieOptions: {middleware},
            assetName,
            title,
            subtitle,
            buttonText: i18n(isGiftCode && message.fromId === message.peerId ? 'GiftPremiumUseGiftBtn' : 'ActionGiftPremiumView'),
            buttonCallback: () => {
              if(isGiftCode) {
                const link: InternalLink.InternalLinkGiftCode = {
                  _: INTERNAL_LINK_TYPE.GIFT_CODE,
                  slug: action.slug,
                  stack: this.chat.appImManager.getStackFromElement(bubble)
                };

                internalLinkProcessor.processGiftCodeLink(link);
                return;
              }

              PopupPremium.show({
                gift: action,
                peerId: this.peerId,
                isOut: !!message.pFlags.out
              });
            }
          }), content, middleware);

          bubbleContainer.after(content);
        } else if(action._ === 'messageActionChannelJoined') {
          bubble.classList.add('is-similar-channels');

          const c = document.createElement('div');
          c.classList.add('bubble-similar-channels');

          let visible = false;
          const toggle = (force = !visible, noAnimation?: boolean) => {
            if(force === visible) {
              return;
            }

            visible = force;

            if(force && !c.parentElement) {
              bubbleContainer.after(c);
            }

            if(!liteMode.isAvailable('animations')) {
              noAnimation = true;
            }

            let scrollSaver: ScrollSaver;
            if(bubble.isConnected) {
              scrollSaver = this.createScrollSaver(true);
              scrollSaver.save();
            }

            const options: KeyframeAnimationOptions = {duration: noAnimation ? 0 : 300, fill: 'forwards', easing: 'cubic-bezier(.4, .0, .2, 1)'};
            const keyframes: Keyframe[] = [{height: '0'/* , transform: 'scale(0)', opacity: '0' */}, {height: '9.125rem'/* , transform: 'scale(1)', opacity: '1' */}];
            if(!force) keyframes.reverse();
            const animation = c.animate(keyframes, options);
            if(scrollSaver) this.animateSomethingWithScroll(animation.finished, scrollSaver);
            if(!force) animation.finished.then(() => {
              if(visible === force) {
                c.remove();
              }
            });

            updateHidden(!force);
          };

          const deferred = deferredPromise<void>();

          const updateHidden = async(hidden: boolean) => {
            const state = await apiManagerProxy.getState();
            if(hidden) state.hiddenSimilarChannels.push(peerId);
            else indexOfAndSplice(state.hiddenSimilarChannels, peerId);
            await this.managers.appStateManager.pushToState('hiddenSimilarChannels', state.hiddenSimilarChannels);
          };

          const peerId = this.chat.peerId;
          let cached: boolean;
          this.wrapSomeSolid(
            () => SimilarChannels({
              chatId: peerId.toChatId(),
              onClose: () => {
                toggle(false);
              },
              onAcked: (_cached) => {
                cached = _cached;
                if(!cached) {
                  deferred.resolve();
                }
              },
              onReady: async() => {
                bubbleContainer.classList.add('is-clickable');
                await getHeavyAnimationPromise();

                const state = await apiManagerProxy.getState();
                if(!state.hiddenSimilarChannels.includes(peerId)) {
                  toggle(true, cached);
                }

                if(cached) {
                  deferred.resolve();
                }

                attachClickEvent(bubbleContainer, () => {
                  toggle();
                });
              },
              onEmpty: () => {
                if(deferred.isFulfilled) {
                  toggle(false);
                }

                deferred.resolve();
              }
            }),
            c,
            middleware
          );

          loadPromises.push(deferred);
        } else if(action._ === 'messageActionStarGift' || action._ === 'messageActionStarGiftUnique') {
          const container = document.createElement('div');
          container.classList.add('bubble-star-gift-container');
          bubbleContainer.after(container);

          const gift = await this.managers.appGiftsManager.wrapGiftFromMessage(message as Message.messageService)
          this.wrapSomeSolid(() => StarGiftBubble({
            gift,
            fromId: getPeerId(gift.saved.from_id),
            asUpgrade: gift.isIncoming && gift.isUpgradedBySender && !(action._ === 'messageActionStarGift' && action.pFlags.upgraded),
            ownerId: gift.isIncoming ? undefined : message.peerId,
            wrapStickerOptions: {
              middleware,
              lazyLoadQueue: this.lazyLoadQueue,
              group: this.chat.animationGroup,
              scrollable: this.scrollable,
              liteModeKey: 'stickers_chat',
              play: true,
              loop: false
            },
            onViewClick: async() => {
              if(action._ === 'messageActionStarGift' && action.upgrade_msg_id) {
                const upgradeMsg = await this.managers.appMessagesManager.getMessageById(action.upgrade_msg_id);
                const upgradedGift = await this.managers.appGiftsManager.wrapGiftFromMessage(upgradeMsg as Message.messageService);
                PopupElement.createPopup(PopupStarGiftInfo, upgradedGift);
              } else {
                PopupElement.createPopup(PopupStarGiftInfo, gift)
              }
            }
          }), container, middleware)
        }

        loadPromises.push(promise);
      } else if(isStoryMention) {
        const messageMedia = message.media as MessageMedia.messageMediaStory;
        const storyPeerId = getPeerId(messageMedia.peer);
        const storyId = messageMedia.id;
        const isMyStory = storyPeerId === rootScope.myId;

        const result = await modifyAckedPromise(this.managers.acknowledged.appStoriesManager.getStoryById(storyPeerId, storyId));
        if(!result.cached) {
          s.append(i18n('Loading'));
          (result.result as Promise<any>).then(() => {
            this.safeRenderMessage({
              message,
              reverse: true,
              bubble
            });
          });
        } else if(!result.result) {
          let elem: HTMLElement;
          if(isMyStory) elem = i18n('ExpiredStoryMentionYou', [await wrapPeerTitle({peerId: message.peerId})]);
          else elem = i18n('ExpiredStoryMention');
          const icon = Icon('bomb', 'expired-story-icon');
          s.append(icon, elem);
        } else {
          s.classList.add('bubble-story-mention-wrapper');

          const avatarContainer = document.createElement('div');
          avatarContainer.classList.add('bubble-story-mention-avatar-container');

          const avatar = avatarNew({
            middleware,
            size: 100,
            peerId: storyPeerId,
            lazyLoadQueue: this.lazyLoadQueue,
            withStories: true,
            storyId,
            storyColors: {
              read: 'rgba(255, 255, 255, .3)'
            }
          });
          avatar.node.dataset.storyId = '' + storyId;
          loadPromises.push(avatar.readyThumbPromise);

          const deferred = deferredPromise<void>();
          loadPromises.push(deferred);
          callbackify(result.result, (storyItem) => {
            if(!middleware() || !storyItem || storyItem.pFlags.noforwards) {
              deferred.resolve();
              return;
            }

            createRoot((dispose) => {
              middleware.onClean(() => {
                deferred.resolve();
                dispose();
              });

              const {container, ready} = wrapStoryMedia({
                peerId: storyPeerId,
                storyItem: storyItem,
                forPreview: true,
                noInfo: true,
                lazyLoadQueue: this.lazyLoadQueue,
                withPreloader: true,
                noAspecter: true
              });

              createEffect(() => {
                if(ready()) {
                  deferred.resolve();
                  (container as HTMLElement).classList.add('bubble-story-mention-preview');
                  attachClickEvent(avatarContainer, (e) => {
                    cancelEvent(e);
                    createStoriesViewerWithPeer({peerId: storyPeerId, id: storyId, target: () => container as HTMLElement});
                  }, {listenerSetter: this.listenerSetter});
                  avatarContainer.append(container as HTMLElement);
                }
              });
            });
          });

          avatarContainer.append(avatar.node);

          const text = i18n(
            isMyStory ? 'StoryMentionYou' : 'StoryMention',
            [await wrapPeerTitle({peerId: isMyStory ? message.peerId : storyPeerId})]
          );
          text.classList.add('bubble-story-mention-text');

          const button = Button('bubble-service-button bubble-story-mention-button', {noRipple: true, text: 'StoryMentionView'});
          attachClickEvent(button, () => {
            simulateClickEvent(avatar.node);
            // createStoriesViewerWithPeer({peerId: storyPeerId, id: storyId});
          }, {listenerSetter: this.listenerSetter});

          s.append(avatarContainer, text, button);
        }
      }
      bubbleContainer.append(s);

      if((message as Message.messageService).pFlags.is_single) { // * Ignore 'Discussion started'
        bubble.classList.add('is-group-last');
      }

      returnService = true;
    }

    const setUnreadObserver = isInUnread && this.observer ? this.setUnreadObserver.bind(this, 'history', bubble, maxBubbleMid) : undefined;

    const isBroadcast = this.chat.isBroadcast;
    if(returnService) {
      setUnreadObserver?.();
      return ret;
    }

    if(!isBroadcast) {
      setUnreadObserver?.();
    }

    if(this.observer && (unreadMention || unreadReactions)) {
      this.setUnreadObserver('content', bubble, reactionsMessage.mid);
    }

    const isSponsored = (message as Message.message).pFlags.sponsored;
    const sponsoredMessage = (message as Message.message).sponsoredMessage;
    const factCheck = /* !!isSponsored === !sponsoredMessage &&  */isMessage && message.factcheck;

    let messageMedia: MessageMedia = isMessage && message.media;
    let needToSetHTML = true;
    let messageMessage: string, totalEntities: MessageEntity[], messageWithMessage: Message.message, groupedTextMessage: Message.message;
    if(isMessage) {
      if(groupedId && groupedMustBeRenderedFull) {
        const t = groupedTextMessage = getGroupedText(groupedMessages);
        messageMessage = t?.message || '';
        // totalEntities = t.entities;
        totalEntities = t?.totalEntities || [];
        messageWithMessage = groupedTextMessage;
      } else {
        messageMessage = message.message;
        // totalEntities = message.entities;
        totalEntities = message.totalEntities;
        messageWithMessage = message;
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
    if(totalEntities && !messageMedia && !factCheck) {
      const emojiEntities: (MessageEntity.messageEntityCustomEmoji | MessageEntity.messageEntityEmoji)[] = [];
      for(let i = 0, length = totalEntities.length; i < length; ++i) {
        const entity = totalEntities[i];
        if(entity._ === 'messageEntityCustomEmoji') {
          ++i;
          emojiEntities.push(entity);
        } else if(entity._ === 'messageEntityEmoji') {
          emojiEntities.push(entity);
        }
      }

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

    let maxMediaTimestamp = getMediaDurationFromMessage(groupedTextMessage || message as Message.message);
    if(groupedTextMessage && needToSetHTML) {
      bubble.dataset.textMid = '' + groupedTextMessage.mid;
    }

    let replyTo = message.reply_to;
    if(replyTo?._ === 'messageReplyHeader') {
      const replyToPeerId = replyTo.reply_to_peer_id ? getPeerId(replyTo.reply_to_peer_id) : this.peerId;
      bubble.dataset.replyToPeerId = '' + replyToPeerId;
      bubble.dataset.replyToMid = '' + message.reply_to_mid;

      if(maxMediaTimestamp === undefined) {
        const originalMessage = apiManagerProxy.getMessageByPeer(replyToPeerId, message.reply_to_mid);
        if(originalMessage) {
          maxMediaTimestamp = getMediaDurationFromMessage(originalMessage as Message.message);
        } else {
          // this.managers.appMessagesManager.fetchMessageReplyTo(message);
          // this.needUpdate.push({replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid});
          maxMediaTimestamp = Infinity;
        }
      }
    } else if(replyTo) {
      bubble.dataset.replyToPeerId = '' + getPeerId(replyTo.peer);
      bubble.dataset.replyToStoryId = '' + replyTo.story_id;
    }

    const getRichTextOptions = (entities?: MessageEntity[]): Parameters<typeof wrapRichText>[1] => ({
      entities,
      passEntities: this.passEntities,
      loadPromises,
      lazyLoadQueue: this.lazyLoadQueue,
      customEmojiSize,
      middleware,
      animationGroup: this.chat.animationGroup,
      maxMediaTimestamp,
      textColor: 'primary-text-color',
      passMaskedLinks: !!(message as Message.message).sponsoredMessage
    });

    const canTranslate = !bigEmojis && !our && this.chat.type !== ChatType.Search;
    const translatableParams: Parameters<typeof TranslatableMessage>[0] = canTranslate ? {
      peerId: message.peerId,
      middleware,
      observeElement: bubble,
      observer: this.observer,
      onTranslation: this.modifyBubble,
      richTextOptions: getRichTextOptions()
    } : undefined;

    const richText = messageMessage ? (
      !canTranslate ?
        wrapRichText(messageMessage, getRichTextOptions(totalEntities)) :
        TranslatableMessage({
          message: messageWithMessage,
          ...translatableParams
        })
      ) : undefined;

    let isMessageEmpty = !messageMessage && !isSponsored && !factCheck/*  && (!topicNameButtonContainer || isStandaloneMedia) */;
    let mediaRequiresMessageDiv = false;

    let canHaveTail = true;
    let canHavePlainMediaTail = false;
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

        isMessageEmpty = true;
        bubble.classList.add('emoji-big');
        isStandaloneMedia = true;
        canHaveTail = false;
        needToSetHTML = false;
      }

      bubble.classList.add('can-have-big-emoji');
    }

    if(needToSetHTML) {
      setInnerHTML(messageDiv, richText);
    }

    const isOut = this.chat.isOutMessage(message);
    const haveRTLChar = isRTL(messageMessage, true);

    let timeSpan: HTMLElement, _clearfix: HTMLElement;
    if(!isSponsored) {
      timeSpan = bubble.timeSpan = MessageRender.setTime({
        chat: this.chat,
        chatType: this.chat.type,
        groupedMessagesCount: groupedMessages?.length,
        message,
        reactionsMessage,
        isOut,
        middleware,
        loadPromises
      });

      let _clearfix: HTMLElement;
      appendBubbleTime(bubble, messageDiv, () => {
        messageDiv.append(timeSpan, _clearfix ??= clearfix());
      });

      if(I18n.isRTL ? !endsWithRTL(messageMessage) : haveRTLChar) {
        timeSpan.classList.add('is-block');
      }

      if(isBroadcast) {
        setUnreadObserver?.(timeSpan);
      }
    } else {
      bubble.classList.add('is-sponsored');
    }

    bubbleContainer.prepend(messageDiv);

    let topicNameButtonContainer: HTMLElement;
    if(isMessage && (this.chat.isAllMessagesForum || (this.chat.hashtagType === 'my' && isOut))) {
      const result = await wrapTopicNameButton({
        peerId: message.peerId,
        threadId: getMessageThreadId(message, this.chat.isForum),
        lastMsgId: message.mid,
        wrapOptions: {
          middleware
        },
        withIcons: true,
        dialog: true,
        noLink: this.chat.type === ChatType.Search
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

      if(!message.fwd_from?.saved_from_msg_id && this.chat.type !== ChatType.Pinned) {
        const forward = document.createElement('div');
        forward.classList.add('bubble-beside-button', 'with-hover', 'forward');
        forward.append(Icon('forward_filled'));
        bubbleContainer.append(forward);
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
      replyMarkupRows.forEach((row, idx, arr) => {
        const buttons = row.buttons;
        const isLastRow = idx === arr.length - 1;

        const rowDiv = document.createElement('div');
        rowDiv.classList.add('reply-markup-row');

        buttons.forEach((button, idx, arr) => {
          const isFirst = idx === 0;
          const isLast = idx === arr.length - 1;
          const {text, buttonEl, buttonIcon, onClick} = wrapKeyboardButton({
            button,
            chat: this.chat,
            message: message as Message.message,
            noTextInject: true
          });

          if(!buttonEl) {
            return;
          }

          if(onClick) {
            onClickMap.set(buttonEl, onClick);
          }

          if(isLastRow) {
            if(isFirst) {
              buttonEl.classList.add('is-first');
            }

            if(isLast) {
              buttonEl.classList.add('is-last');
            }
          }

          buttonEl.classList.add('reply-markup-button', 'rp');
          const t = document.createElement('span');
          t.classList.add('reply-markup-button-text');
          t.append(text);

          // const after = document.createElement('div');
          // after.classList.add('reply-markup-button-after');

          ripple(buttonEl);
          buttonEl.append(...[buttonIcon, t/* , after */].filter(Boolean));

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

    if(isOutgoing && !message.error) {
      bubble.classList.add('is-outgoing');
      if((message as Message.message).reactions) {
        bubble.dataset.ignoreReactions = '1';
      }
    }

    const messageWithReplies = isMessage && await this.managers.appMessagesManager.getMessageWithCommentReplies(message);
    const withReplies = !!messageWithReplies && message.mid > 0;

    if(withReplies) {
      bubble.classList.add('with-replies');
    }

    const fwdFrom = isMessage && message.fwd_from;
    const fwdFromId = isMessage && message.fwdFromId;
    const _isForwardOfForward = this.chat.isForwardOfForward(message);

    let nameContainer: HTMLElement = bubbleContainer;

    const hasPostAuthor = isMessage && message.post_author && !this.chat.isLikeGroup;
    const canHideNameIfMedia = !message.viaBotId &&
      (message.fromId === rootScope.myId || !message.pFlags.out) &&
      (!hasPostAuthor || !fwdFrom) &&
      !_isForwardOfForward/*  &&
      !fwdFromId */;
      // (!getFwdFromName(fwdFrom) || !fwdFromId);

    const invertMedia = isMessage && message.pFlags.invert_media;
    if(invertMedia) {
      bubble.classList.add('invert-media');
    }

    let factCheckBox: HTMLElement;
    if(factCheck) {
      createRoot((dispose) => {
        middleware.onDestroy(dispose);

        const getCountry = () => I18n.countriesList.find((country) => country.iso2 === factCheck.country);
        const getCountryName = () => {
          const country = getCountry();
          return country.name || country.default_name;
        };

        const [textWithEntities, setTextWithEntities] = createSignal<TextWithEntities>();

        const onFactCheck = (factCheck: FactCheck) => {
          setTextWithEntities(factCheck.text);
        };

        if(!factCheck.text) {
          this.managers.appMessagesManager.getFactCheck(message.peerId, message.mid)
          .then((factCheck) => {
            this.modifyBubble(() => {
              onFactCheck(factCheck);
            });
          });
        } else {
          onFactCheck(factCheck);
        }

        WebPageBox({
          footer: {
            content: i18n('FactCheckFooter', [getCountryName()]),
            text: true
          },
          name: {
            content: i18n('FactCheck'),
            tip: {
              content: i18n('FactCheckWhat'),
              onClick: (e) => {
                showTooltip({
                  element: e.target as HTMLElement,
                  container: this.container,
                  vertical: 'top',
                  textElement: i18n('FactCheckToast', [getCountryName()])
                });
              }
            }
          },
          get text() {
            if(!textWithEntities()) {
              return i18n('Loading');
            }

            const {text, entities} = wrapTextWithEntities(textWithEntities());
            return wrapRichText(text, {entities});
          },
          ref: (box) => {
            factCheckBox = box;
            if(timeSpan) {
              timeSpan.before(box);
            } else {
              messageDiv.append(box);
            }
          },
          minContent: true
        });
      });
      const box = document.createElement('div');
      box.classList.add('bubble-fact-check', 'quote-like', 'quote-like-hoverable');
    }

    const canPossiblyHavePlainMediaTail = isMessageEmpty || invertMedia;

    let storyFromPeerId: PeerId, noAttachmentDivNeeded = false, processedWebPage = false,
      isRound = false, searchContext: MediaSearchContext;
    const globalMediaDeferred = deferredPromise<HTMLMediaElement>();
    // media
    if(messageMedia) {
      attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');

      switch(messageMedia._) {
        case 'messageMediaPhotoExternal':
        case 'messageMediaPhoto': {
          const photo = messageMedia.photo;

          canHavePlainMediaTail = canPossiblyHavePlainMediaTail;

          if(canHideNameIfMedia) {
            bubble.classList.add('hide-name');
          }

          bubble.classList.add('photo');

          if(groupedMustBeRenderedFull && groupedId && groupedMids.length !== 1) {
            bubble.classList.add('is-album', 'is-grouped');
            wrapAlbum({
              messages: groupedMessages,
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
          noAttachmentDivNeeded = true;
          attachmentDiv = undefined;

          const webPage: WebPage = messageMedia.webpage;
          if(webPage._ !== 'webPage') {
            break;
          }

          processedWebPage = true;
          const storyAttribute = webPage.attributes?.find((attribute) => attribute._ === 'webPageAttributeStory') as WebPageAttribute.webPageAttributeStory;
          const storyPeerId = storyAttribute && getPeerId(storyAttribute.peer);
          const storyId = storyAttribute?.id;

          if(storyAttribute) {
            const replyContainer = await this.getStoryReplyIfExpired(storyPeerId, storyId, true);
            if(replyContainer === null) {
              // bubble.classList.add('is-expired-story');
              // timeSpan.before(replyContainer);
              // messageDiv.classList.add('expired-story-message');
              break;
            }
          }

          const starGiftAttribute = webPage.attributes?.find((attr) => attr._ === 'webPageAttributeUniqueStarGift')

          const props: Parameters<typeof WebPageBox>[0] = {};
          const boxRefs: ((box: HTMLAnchorElement) => void)[] = [];

          const wrapped = wrapUrl(webPage.url);
          const hasSafeUrl = (wrapped.onclick && !UNSAFE_ANCHOR_LINK_TYPES.has(wrapped.onclick)) || isSponsored;
          if(hasSafeUrl) {
            boxRefs.push((box) => {
              box.setAttribute('safe', '1');
            });

            if(isSponsored) {
              messageDiv.classList.add('margin-bigger');
              const wrapped = wrapUrl(sponsoredMessage.url);

              props.footer = {
                content: wrapEmojiText(sponsoredMessage.button_text),
                link: !wrapped.onclick,
                ref: (viewButton) => this.observer.observe(viewButton, this.viewsObserverCallback)
              };

              boxRefs.push((box) => {
                // if(!wrapped.onclick) {
                //   box.href = wrapped.url;
                //   setBlankToAnchor(box);
                // }

                (box as any).callback = () => {
                  this.chat.appImManager.onSponsoredBoxClick(message as Message.message);
                };
              });
            } else {
              const langPackKey = webPageTypes[webPage.type] || 'OpenMessage';

              props.footer = {
                content: i18n(langPackKey)
              };

              boxRefs.push((box) => {
                box.dataset.callback = wrapped.onclick;
              });
            }
          } else {
            const isUnsafe = !messageMedia.pFlags.safe;
            boxRefs.push((box) => {
              setBlankToAnchor(box);

              if(isUnsafe) {
                box.dataset.callback = 'showMaskedAlert';
              }
            });
          }

          if(wrapped?.url && !isSponsored) {
            boxRefs.push((box) => {
              box.href = wrapped.url;
            });
          }

          bubble.classList.add('has-webpage', 'single-media');

          const sponsoredMedia = sponsoredMessage?.media;

          let preview: HTMLDivElement;
          const doc = webPage.document as MyDocument;
          const hasLargeMedia = !!webPage.pFlags.has_large_media;
          const hasSmallMedia = !!(hasLargeMedia && messageMedia.pFlags.force_small_media);
          const sponsoredPhoto = sponsoredMessage && getSponsoredPhoto(sponsoredMessage);
          const photo = (sponsoredPhoto || webPage.photo) as Photo.photo;
          // const willHaveSponsoredAvatar = sponsoredMessage && (getPeerId(sponsoredMessage.from_id) !== NULL_PEER_ID || sponsoredPhoto);
          // const willHaveSponsoredPhoto = sponsoredMessage && sponsoredMessage.pFlags.show_peer_photo && willHaveSponsoredAvatar;
          const willHaveSponsoredPhoto = !!sponsoredPhoto;
          const willHaveMedia = !!(photo || doc || storyAttribute || willHaveSponsoredPhoto || starGiftAttribute);
          if(willHaveMedia) {
            preview = document.createElement('div');
            props.media = {
              content: preview,
              position: 'top'
            };
          }

          const lazyLoadQueue = sponsoredMedia ? undefined : this.lazyLoadQueue;

          if(doc) {
            if(doc.type === 'gif' || doc.type === 'video' || doc.type === 'round') {
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
                lazyLoadQueue,
                middleware: this.getMiddleware(),
                isOut,
                group: this.chat.animationGroup,
                loadPromises,
                autoDownload: this.chat.autoDownload,
                noInfo: message.mid < 0 && !sponsoredMedia,
                observer: this.observer,
                onLoad: this.onVideoLoad,
                setShowControlsOn: bubble
              });
            } else {
              const docDiv = await wrapDocument({
                message: message as Message.message,
                autoDownloadSize: this.chat.autoDownload.file,
                lazyLoadQueue,
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
              props.media.hasDocument = true;
            }
          }

          if(webPage.site_name || sponsoredMessage) {
            let smth: HTMLElement | DocumentFragment;
            if(sponsoredMessage) {
              smth = i18n(sponsoredMessage.pFlags.recommended ? 'SponsoredMessageRecommended' : 'SponsoredMessage');
              smth.classList.add('text-capitalize');
            } else if(webPageTypesSiteNames[webPage.type]) {
              smth = i18n(webPageTypesSiteNames[webPage.type]);
            } else {
              smth = wrapEmojiText(webPage.site_name);
            }

            if(!sponsoredMessage) {
              const html = wrapRichText(webPage.url);
              const a = htmlToDocumentFragment(html).firstElementChild as any;
              a.replaceChildren(smth);
              smth = a;
            }

            props.name = {
              content: smth,
              tip: sponsoredMessage && sponsoredMessage.pFlags.can_report && {
                content: i18n('SponsoredMessageAdWhatIsThis'),
                onClick: (e) => {
                  cancelEvent(e);
                  PopupElement.createPopup(PopupAboutAd);
                }
              }
            };
          }

          const title = wrapWebPageTitle(webPage);
          if(title.textContent || sponsoredMessage) {
            props.title = sponsoredMessage ? wrapEmojiText(sponsoredMessage.title) : title;
          }

          const description = wrapWebPageDescription(webPage, getRichTextOptions(webPage.entities), isSponsored);
          if(description.textContent) {
            props.text = description;
          }

          let isSquare = false;
          if(willHaveSponsoredPhoto || (photo && !doc && !starGiftAttribute)) {
            bubble.classList.add('photo');

            const squareBoxSize = 48;
            const size: PhotoSize.photoSize = (!sponsoredMessage || sponsoredMedia) && photo.sizes[photo.sizes.length - 1] as any;
            if((!size || (size.w === size.h && !hasLargeMedia) || hasSmallMedia) && (props.name || props.title || props.text)) {
              bubble.classList.add('is-square-photo');
              props.media.photoSize = 'square';
              isSquare = true;
              preview.style.width = preview.style.height = `${squareBoxSize}px`;
              // setAttachmentSize({
              //   photo,
              //   element: preview,
              //   boxWidth: squareBoxSize,
              //   boxHeight: squareBoxSize,
              //   noZoom: false
              // });
            } else if(size.h > size.w && !hasLargeMedia) {
              bubble.classList.add('is-vertical-photo');
              props.media.photoSize = 'vertical';
            }

            /* const p = sponsoredPhoto?._ === 'photo' ? sponsoredPhoto : photo;

            if(!p) {
              const photoIsPeer = sponsoredPhoto && sponsoredPhoto._ !== 'photo';
              const {node, readyThumbPromise} = avatarNew({
                middleware,
                size: squareBoxSize,
                lazyLoadQueue: this.lazyLoadQueue,
                peerId: photoIsPeer ? sponsoredPhoto.id.toPeerId(true) : (!sponsoredPhoto ? getPeerId(sponsoredMessage.from_id) : undefined),
                peer: photoIsPeer ? sponsoredPhoto : undefined
              });
              node.classList.add('avatar-full');
              preview.append(node);
              readyThumbPromise && loadPromises.push(readyThumbPromise);
            } else  */wrapPhoto({
              photo/* : p */,
              message,
              container: preview,
              boxWidth: isSquare ? 0 : mediaSizes.active.webpage.width,
              boxHeight: isSquare ? 0 : mediaSizes.active.webpage.height,
              isOut,
              lazyLoadQueue,
              middleware,
              loadPromises,
              withoutPreloader: isSquare,
              autoDownloadSize: this.chat.autoDownload.photo
            });
          }

          if(storyAttribute) {
            bubble.classList.add('photo', 'story');
            const size = mediaSizes.active.webpage;

            // set container dimensions before the story is loaded
            setAttachmentSize({
              photo: {
                _: 'photo',
                id: 0,
                sizes: [{
                  _: 'photoSize',
                  w: 180,
                  h: 320,
                  type: 'q',
                  size: 0
                }],
                pFlags: {},
                access_hash: 0,
                file_reference: [],
                date: 0,
                dc_id: 0
              },
              element: preview,
              boxWidth: size.width,
              boxHeight: size.height,
              message: message as Message.message
            });

            this.wrapStory({
              message: message as Message.message,
              bubble,
              storyPeerId,
              storyId,
              container: preview,
              middleware,
              loadPromises,
              boxWidth: size.width,
              boxHeight: size.height
            });
          }

          if(starGiftAttribute) {
            bubble.classList.add('gift');
            const gift = await this.managers.appGiftsManager.wrapGiftFromWebPage(starGiftAttribute);
            preview.style.width = '240px';
            preview.style.height = '240px';
            this.wrapSomeSolid(() => UniqueStarGiftWebPageBox({
              gift,
              wrapStickerOptions: {
                play: true,
                loop: false,
                managers: this.managers,
                middleware,
                lazyLoadQueue,
                group: this.chat.animationGroup
              }
            }), preview, middleware)
            props.text = undefined
          }

          if(preview) {
            props.media.position = invertMedia || isSquare ? 'top' : 'bottom';
          }

          createRoot((dispose) => {
            middleware.onDestroy(dispose);
            WebPageBox({
              ...props,
              ref: (box) => {
                boxRefs.forEach((ref) => ref(box));
                if(factCheckBox && !invertMedia) {
                  factCheckBox.before(box);
                } else if(timeSpan) {
                  if(invertMedia) {
                    timeSpan.parentElement.prepend(box);
                    box.parentElement.classList.add('mt-bigger');
                  } else timeSpan.before(box);
                } else {
                  messageDiv.append(box);
                }
              },
              clickable: true
            });
          });

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
            setAttachmentSize({
              photo: doc,
              element: attachmentDiv,
              boxWidth: boxSize.width,
              boxHeight: boxSize.height
            });
            // let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.minWidth = attachmentDiv.style.width;
            bubbleContainer.style.minHeight = attachmentDiv.style.height;
            // appPhotosManager.setAttachmentSize(doc, bubble);
            const noPremium = messageMedia?.pFlags?.nopremium;
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
              noPremium,
              scrollable: this.scrollable,
              showPremiumInfo: () => {
                const a = anchorCallback(() => {
                  hideToast();
                  PopupElement.createPopup(PopupStickers, doc.stickerSetInput, undefined, this.chat.input).show();
                });

                toastNew({
                  langPackKey: 'Sticker.Premium.Click.Info',
                  langPackArguments: [a]
                });
              }
            });

            const effectThumb = getStickerEffectThumb(doc);
            if((effectThumb || isEmoji) && (isInUnread || isOutgoing)/*  || true */) {
              this.observer.observe(bubble, this.stickerEffectObserverCallback);
            }
          } else if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round'/*  && doc.size <= 20e6 */) {
            // this.log('never get free 2', doc);

            isRound = doc.type === 'round';
            if(isRound) {
              isStandaloneMedia = true;
            }

            if(isRound/*  || isMessageEmpty */) {
              // canHaveTail = false;
            } else {
              canHavePlainMediaTail = canPossiblyHavePlainMediaTail;
            }

            if(canHideNameIfMedia) {
              bubble.classList.add('hide-name');
            }

            bubble.classList.add(isRound ? 'round' : 'video');
            if(groupedMustBeRenderedFull && groupedId && groupedMids.length !== 1) {
              bubble.classList.add('is-album', 'is-grouped');

              wrapAlbum({
                messages: groupedMessages,
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
                searchContext: isRound ? searchContext = {
                  peerId: this.peerId,
                  inputFilter: {_: 'inputMessagesFilterRoundVoice'},
                  threadId: this.chat.threadId,
                  useSearch: !(message as Message.message).pFlags.is_scheduled,
                  isScheduled: (message as Message.message).pFlags.is_scheduled
                } : undefined,
                noInfo: message.mid <= 0,
                noAutoplayAttribute: !!messageMedia.pFlags.spoiler,
                observer: this.observer,
                onLoad: this.onVideoLoad,
                setShowControlsOn: bubble,
                onGlobalMedia: (media) => {
                  globalMediaDeferred.resolve(media);
                }
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
              albumMustBeRenderedFull: groupedMustBeRenderedFull,
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
              richTextFragment: richText,
              richTextOptions: getRichTextOptions(),
              canTranscribeVoice: true,
              translatableParams,
              factCheckBox,
              isOut
            });

            const bubbleBackground = document.createElement('div');
            bubbleBackground.classList.add('bubble-content-background');
            bubbleContainer.prepend(bubbleBackground);

            if(newNameContainer) {
              nameContainer = newNameContainer;
            }

            const lastContainer = messageDiv.lastElementChild.querySelector('.document-message') || messageDiv.lastElementChild.querySelector('.document, .audio');
            if(lastContainer) {
              appendBubbleTime(
                bubble,
                lastContainer as HTMLElement,
                () => lastContainer.append(timeSpan, _clearfix ??= clearfix())
              );
            }

            mediaRequiresMessageDiv = true;
            const addClassName = (!(['photo', 'pdf'] as MyDocument['type'][]).includes(doc.type) ? doc.type || 'document' : 'document') + '-message';
            bubble.classList.add(addClassName);

            if(addClassName !== 'document-message') {
              bubble.classList.add('min-content');
            }

            if(!bubble.classList.contains('is-multiple-documents')) {
              bubble.classList.add('is-single-document');
            }

            noAttachmentDivNeeded = true;
          }

          break;
        }

        case 'messageMediaCall': {
          const action = messageMedia.action;
          const div = document.createElement('div');
          div.classList.add('bubble-call');
          div.append(Icon(action.pFlags.video ? 'videocamera' : 'phone', 'bubble-call-icon'));

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

          subtitle.prepend(Icon('arrow_next', 'bubble-call-arrow', 'bubble-call-arrow-' + (action.duration !== undefined ? 'green' : 'red')));

          appendBubbleTime(bubble, subtitle, () => subtitle.append(timeSpan));

          div.append(title, subtitle);

          noAttachmentDivNeeded = true;

          mediaRequiresMessageDiv = true;
          bubble.classList.add('call-message');
          messageDiv.append(div);

          break;
        }

        case 'messageMediaContact': {
          const contact = messageMedia;
          const contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerId = '' + contact.user_id;

          noAttachmentDivNeeded = true;

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

          const avatarElem = avatarNew({
            middleware,
            size: 54,
            lazyLoadQueue: this.lazyLoadQueue,
            peerId: contact.user_id.toPeerId(),
            peerTitle: contact.user_id ? undefined : (fullName.trim() ? fullName : I18n.format('AttachContact', true)[0])
          });

          contactDiv.prepend(avatarElem.node);

          mediaRequiresMessageDiv = true;
          bubble.classList.add('contact-message');
          messageDiv.append(contactDiv);

          break;
        }

        case 'messageMediaPoll': {
          mediaRequiresMessageDiv = true;

          const pollElement = wrapPoll({
            message: message as Message.message,
            managers: this.managers,
            middleware,
            translatableParams,
            richTextOptions: getRichTextOptions()
          });
          messageDiv.prepend(pollElement);
          bubble.classList.add('poll-message');

          break;
        }

        case 'messageMediaPaidMedia':
        case 'messageMediaInvoice': {
          type I = MessageMedia.messageMediaInvoice;
          type P = MessageMedia.messageMediaPaidMedia;
          type M = Photo.photo | Document.document | WebDocument;
          const pFlags = (messageMedia as I).pFlags || {};
          const isTest = pFlags.test;
          const isInvoice = messageMedia._ === 'messageMediaInvoice';
          const extendedMedia = (Array.isArray(messageMedia.extended_media) ? messageMedia.extended_media : [messageMedia.extended_media]).filter(Boolean);
          const isAlreadyPaid = extendedMedia[0]?._ === 'messageExtendedMedia';
          const isNotPaid = extendedMedia[0]?._ === 'messageExtendedMediaPreview';

          if(!isInvoice) {
            bubble.classList.add('single-media');
            if(canHideNameIfMedia) {
              bubble.classList.add('hide-name');
            }

            canHavePlainMediaTail = canPossiblyHavePlainMediaTail;
          }

          let innerMedia: M | M[], videoTimes: HTMLElement[];
          if(isInvoice) {
            innerMedia = (messageMedia as I).photo;
          } else if(isAlreadyPaid) {
            innerMedia = extendedMedia.map((media) => {
              return getMediaFromMessage(media as any as Message.message) as M;
            });
          }

          const wrappedPrice = isInvoice ?
            paymentsWrapCurrencyAmount((messageMedia as I).total_amount, (messageMedia as I).currency) :
            paymentsWrapCurrencyAmount((messageMedia as P).stars_amount, STARS_CURRENCY);
          let priceEl: HTMLElement;
          if(!extendedMedia.length || (!isInvoice && isAlreadyPaid)) {
            priceEl = document.createElement(innerMedia ? 'span' : 'div');
            const f = document.createDocumentFragment();
            const l = i18n((messageMedia as I).receipt_msg_id ? 'PaymentReceipt' : (isTest ? 'PaymentTestInvoice' : 'PaymentInvoice'));
            l.classList.add('text-uppercase');
            const joiner = ' ' + NBSP;
            const p = document.createElement('span');
            p.classList.add('text-bold');
            p.append(wrappedPrice);
            f.append(p);
            if(isInvoice) {
              p.append(joiner);
              f.append(l);
            } else {
              priceEl.classList.add('other-side');
            }
            if(isTest && (messageMedia as I).receipt_msg_id) {
              const a = document.createElement('span');
              a.classList.add('text-uppercase', 'pre-wrap');
              a.append(joiner + '(Test)');
              f.append(a);
            }
            setInnerHTML(priceEl, f);
          } else if(isNotPaid) {
            attachmentDiv.classList.add('is-buy');
            priceEl = document.createElement('span');
            priceEl.classList.add('extended-media-buy');
            if(isInvoice) {
              priceEl.append(
                Icon('premium_lock', 'extended-media-buy-icon'),
                i18n('Checkout.PayPrice', [wrappedPrice])
              );
            } else {
              priceEl.append(i18n('PaidMedia.Unlock', [wrappedPrice]));
            }

            videoTimes = extendedMedia.map((extendedMedia) => {
              const videoDuration = (extendedMedia as MessageExtendedMedia.messageExtendedMediaPreview).video_duration;
              if(videoDuration === undefined) {
                return;
              }

              const videoTime = document.createElement('span');
              videoTime.classList.add('video-time');
              videoTime.textContent = toHHMMSS(videoDuration, false);
              return videoTime;
            });

            if(videoTimes.length === 1 && videoTimes[0]) {
              attachmentDiv.append(videoTimes[0]);
            }
          }

          if(isNotPaid) {
            type P = MessageExtendedMedia.messageExtendedMediaPreview;
            innerMedia = extendedMedia.map((extendedMedia) => {
              return generatePhotoForExtendedMediaPreview(extendedMedia as P);
            });
          }

          if(Array.isArray(innerMedia) && innerMedia.length === 1) {
            innerMedia = innerMedia[0];
          }

          if(innerMedia) {
            const mediaSize = extendedMedia.length ? mediaSizes.active.extendedInvoice : mediaSizes.active.invoice;
            if(Array.isArray(innerMedia)) {
              bubble.classList.add('is-album', 'photo');
              wrapAlbum({
                media: innerMedia as (Photo.photo | Document.document)[],
                attachmentDiv,
                middleware: this.getMiddleware(),
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue,
                chat: this.chat,
                loadPromises,
                autoDownload: this.chat.autoDownload,
                spoilered: !isAlreadyPaid,
                videoTimes,
                uploadingFileName: (message as Message.message).uploadingFileName
              });
            } else if(innerMedia._ === 'document') {
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
                message: message as Message.message,
                observer: this.observer,
                onLoad: this.onVideoLoad,
                setShowControlsOn: bubble,
                uploadingFileName: (message as Message.message).uploadingFileName[0]
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
              if(!extendedMedia.length || (!isInvoice && isAlreadyPaid)) {
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

            if(extendedMedia.length === 1) {
              const {width, height} = attachmentDiv.style;
              const {canvas, readyResult} = DotRenderer.create({
                width: parseInt(width),
                height: parseInt(height),
                middleware,
                animationGroup: this.chat.animationGroup
              });
              loadPromises?.push(readyResult as Promise<any>);
              attachmentDiv.append(canvas);
            }
          }

          let titleDiv: HTMLElement;
          if(isInvoice) {
            titleDiv = document.createElement('div');
            titleDiv.classList.add('bubble-primary-color');
            setInnerHTML(titleDiv, wrapEmojiText((messageMedia as I).title));
          }

          let richText: HTMLElement | DocumentFragment;
          if(isInvoice) {
            richText = isAlreadyPaid ? undefined : wrapEmojiText((messageMedia as I).description);
          }

          messageDiv.prepend(...[titleDiv, richText].filter(Boolean));
          attachmentDiv.append(...[(!innerMedia || !isInvoice) && priceEl].filter(Boolean));

          if(!isInvoice) {}
          else if(!richText) canHaveTail = false;
          else mediaRequiresMessageDiv = true;
          bubble.classList.add('is-invoice');

          break;
        }

        case 'messageMediaGeoLive':
        case 'messageMediaVenue':
        case 'messageMediaGeo': {
          const _canHaveTail = wrapGeo({
            attachmentDiv,
            bubble,
            loadPromises,
            message: message as Message.message,
            messageDiv,
            messageMedia,
            middleware,
            timeSpan,
            updateLocationOnEdit: this.updateLocationOnEdit,
            wrapOptions
          });

          if(_canHaveTail !== undefined) {
            canHaveTail = _canHaveTail;
          }

          break;
        }

        case 'messageMediaStory': {
          const storyId = messageMedia.id;
          const storyPeerId = getPeerId(messageMedia.peer);

          const replyContainer = await this.getStoryReplyIfExpired(storyPeerId, storyId, false, true);
          if(replyContainer) {
            bubble.classList.add('is-expired-story');
            // attachmentDiv = replyContainer;
            mediaRequiresMessageDiv = true;
            messageDiv.append(replyContainer);
            messageDiv.classList.add('expired-story-message', 'is-empty');
            break;
          }

          bubble.classList.add('photo', 'story');
          if(withReplies) {
            setAttachmentSize({
              size: makeMediaSize(EXPAND_TEXT_WIDTH, mediaSizes.active.regular.height),
              boxWidth: mediaSizes.active.regular.width,
              boxHeight: mediaSizes.active.regular.height,
              message,
              element: attachmentDiv
            });
          } else {
            this.setStoryContainerDimensions(attachmentDiv);
          }

          if(isMessageEmpty) {
            canHaveTail = false;
          }

          storyFromPeerId = storyPeerId;
          this.wrapStory({
            message: message as Message.message,
            bubble,
            storyPeerId,
            storyId,
            container: attachmentDiv,
            middleware,
            loadPromises
          });

          break;
        }

        case 'messageMediaGiveawayResults':
        case 'messageMediaGiveaway': {
          const giveaway = messageMedia;

          if(giveaway._ === 'messageMediaGiveawayResults') {
            replyTo = undefined;
          }

          mediaRequiresMessageDiv = true;
          bubble.classList.add('is-giveaway');
          noAttachmentDivNeeded = true;
          const button = this.makeViewButton({text: 'BoostingHowItWork'});
          const container = document.createElement('div');
          messageDiv.before(container, button);
          attachClickEvent(button, () => {
            onGiveawayClick(message as Message.message);
          });
          this.wrapSomeSolid(
            () => Giveaway({
              giveaway,
              loadPromises
            }),
            container,
            middleware
          );
          break;
        }

        default:
          attachmentDiv = undefined;
          mediaRequiresMessageDiv = true;
          noAttachmentDivNeeded = true;
          messageDiv.replaceChildren(i18n(UNSUPPORTED_LANG_PACK_KEY));
          bubble.timeAppenders[0].callback();
          this.log.warn('unrecognized media type:', messageMedia._, message);
          break;
      }

      if(noAttachmentDivNeeded) {
        attachmentDiv = undefined;
      } else {
        if(invertMedia) messageDiv.after(attachmentDiv);
        else messageDiv.before(attachmentDiv);

        const width = attachmentDiv.style.width;
        if(width) {
          bubbleContainer.style.maxWidth = `min(100%, ${width})`;
        }
      }

      if(canHavePlainMediaTail && !withReplies) {
        bubble.classList.add('has-plain-media-tail');
      }
    }

    const isFloatingTime = timeSpan && ((isMessageEmpty && !mediaRequiresMessageDiv) || (invertMedia && !processedWebPage));
    if(isMessageEmpty && !mediaRequiresMessageDiv) {
      messageDiv.remove();
      bubble.classList.add('is-message-empty');
    } else {
      if(attachmentDiv) {
        attachmentDiv.classList.add(invertMedia ? 'no-brt' : 'no-brb');
        messageDiv.classList.add(invertMedia ? 'mb-shorter' : 'mt-shorter');
      }
    }

    if(isFloatingTime) {
      timeSpan.classList.add('is-floating');
      bubble.classList.add('has-floating-time');
      // bubble.timeAppenders = [];
      appendBubbleTime(bubble, bubbleContainer, () => bubbleContainer.append(timeSpan));
    }

    if(isStandaloneMedia) {
      bubble.classList.add('just-media');
    }

    if(sponsoredMessage) {
      const canReport = sponsoredMessage.pFlags.can_report;
      const buttons = document.createElement('div');
      buttons.classList.add('bubble-beside-button', 'bubble-beside-button-top');
      let hideButton: HTMLElement;
      if(canReport) {
        buttons.classList.add('bubble-sponsored-buttons');
        hideButton = ButtonIcon('close bubble-sponsored-buttons-button', {noRipple: true});
        const hr = document.createElement('div');
        hr.classList.add('bubble-sponsored-buttons-delimiter');
        const menu = ButtonIcon('more bubble-sponsored-buttons-button', {noRipple: true});
        buttons.append(hideButton, hr, menu);

        attachClickEvent(menu, (e) => {
          this.chat.contextMenu.onContextMenu(e as MouseEvent);
        });
      } else {
        hideButton = buttons;
        hideButton.append(Icon('close'));
        buttons.classList.add('bubble-sponsored-hide');
      }
      bubbleContainer.prepend(buttons);
      bubble.classList.add('with-beside-button');
      attachClickEvent(hideButton, () => {
        PopupPremium.show({feature: 'no_ads'});
      });
    }

    let savedFrom = '';

    if(isStandaloneMedia || !isOut || (message as Message.message).fwdFromId) {
      this.chat.appImManager.setPeerColorToElement({
        peerId: (message as Message.message).fwdFromId || message.fromId,
        element: bubble,
        messageHighlighting: isStandaloneMedia,
        colorAsOut: isOut,
        color: sponsoredMessage?.color
      });
    }

    // const needName = ((peerId.isAnyChat() && (peerId !== message.fromId || our)) && message.fromId !== rootScope.myId) || message.viaBotId;
    const needName = ((message.fromId !== rootScope.myId || !isOut) && this.chat.isLikeGroup) ||
      message.viaBotId ||
      storyFromPeerId;
    if(needName || fwdFrom || replyTo || topicNameButtonContainer) { // chat
      let title: HTMLElement;
      let titleVia: typeof title;
      let noColor: boolean;
      const peerIdForColor = message.fromId;

      const isForwardFromChannel = message.from_id?._ === 'peerChannel' && message.fromId === fwdFromId;
      const fwdFromName = getFwdFromName(fwdFrom);
      const hasTwoTitles = _isForwardOfForward && !isOut && fwdFrom.from_name && fwdFrom.saved_from_name;

      let mustHaveName = !!(message.viaBotId/*  || topicNameButtonContainer */) || storyFromPeerId;
      const isHidden = !!(fwdFrom && (!fwdFrom.from_id || fwdFromName));
      if(message.viaBotId) {
        titleVia = document.createElement('span');
        titleVia.innerText = '@' + (await this.managers.appPeersManager.getPeerUsername(message.viaBotId));
        titleVia.classList.add('peer-title');
      }

      let isForward = !!(storyFromPeerId || fwdFromId || fwdFrom);
      if(isForward && this.chat.type === ChatType.Saved && fwdFromId === rootScope.myId) {
        isForward = false;
      }

      if(isHidden && !fwdFromId) {
        title = document.createElement('span');
        title.classList.add('peer-title');
        setInnerHTML(title, wrapEmojiText(fwdFrom.from_name || fwdFromName));
        bubble.classList.add('hidden-profile');
      } else {
        const titlePeerId = storyFromPeerId || fwdFromId || message.fromId;
        title = this.createTitle(titlePeerId, wrapOptions, isForward).element;
      }

      let replyContainer: HTMLElement;
      if(
        isMessage &&
        (
          replyTo?._ === 'messageReplyStoryHeader' || (
            message.reply_to_mid &&
            message.reply_to_mid !== this.chat.threadId
          ) || replyTo?.reply_from
        ) &&
        (!this.chat.isAllMessagesForum || (replyTo as MessageReplyHeader.messageReplyHeader).reply_to_top_id)
      ) {
        replyContainer = await MessageRender.setReply({
          chat: this.chat,
          bubble,
          bubbleContainer,
          message,
          appendCallback: (container) => {
            nameContainer.prepend(container);
            if(!isMessageEmpty && (!attachmentDiv || invertMedia)) {
              container.classList.add('mb-shorter');
            }

            if(attachmentDiv) {
              attachmentDiv.classList.add('no-brt');
            }
          },
          middleware,
          lazyLoadQueue: this.lazyLoadQueue,
          needUpdate: this.needUpdate,
          isStandaloneMedia,
          isOut
        });
      }

      // this.log(title);

      let nameDiv: HTMLElement;
      if(isForward) {
        const isRegularSaved = this.peerId === rootScope.myId && (!this.chat.threadId || !isForwardOfForward(message) /* !isOut || this.chat.threadId === fwdFromId */);
        if(!isRegularSaved && !isForwardFromChannel) {
          bubble.classList.add('forwarded');
        }

        if((message as Message.message).savedFrom) {
          savedFrom = (message as Message.message).savedFrom;
          title.dataset.savedFrom = savedFrom;
        }

        nameDiv = document.createElement('div');
        const titlePeerId = storyFromPeerId || fwdFromId;
        title.dataset.peerId = '' + titlePeerId;

        if(
          (isRegularSaved || this.peerId === REPLIES_PEER_ID || isForwardFromChannel) &&
          !isStandaloneMedia &&
          !hasTwoTitles &&
          !_isForwardOfForward &&
          !storyFromPeerId
        ) {
          nameDiv.classList.add('colored-name');
          nameDiv.append(title);
        } else {
          mustHaveName ||= true;
          bubble.classList.remove('hide-name');
          const firstArgs: FormatterArguments = [title];

          if(titlePeerId) {
            const avatar = avatarNew({
              middleware,
              size: 20,
              lazyLoadQueue: this.lazyLoadQueue,
              peerId: titlePeerId,
              isDialog: false
            });

            avatar.node.classList.add('bubble-name-forwarded-avatar');
            // loadPromises.push(avatar.readyThumbPromise);
            firstArgs.unshift(avatar.node);
          } else {
            title.classList.add('text-normal');
          }

          if(isStandaloneMedia || true) {
            const br = document.createElement('br');
            br.classList.add('hide-ol');
            firstArgs.unshift(br);
          }

          let nameKey: LangPackKey;
          const nameArgs: FormatterArguments = [firstArgs];
          if(fwdFrom?.post_author) {
            nameKey = storyFromPeerId ? 'ForwardedStoryFromAuthor1' : 'ForwardedFromAuthor';
            const s = document.createElement('span');
            s.append(wrapEmojiText(fwdFrom.post_author));
            nameArgs.push(s);
          } else {
            nameKey = storyFromPeerId ? 'ForwardedStoryFrom1' : 'ForwardedFrom';
          }

          const span = i18n(nameKey, nameArgs);
          span.classList.add('bubble-name-forwarded');
          nameDiv.append(span);

          if(hasTwoTitles) {
            let title: HTMLElement;
            if(fwdFromName) {
              title = document.createElement('span');
              title.classList.add('peer-title');
              title.style.color = 'var(--message-primary-color)';
              title.dataset.peerId = '' + NULL_PEER_ID;
              title.append(wrapEmojiText(fwdFromName));
            } else {
              const peerId = getPeerId(fwdFrom.saved_from_id);
              const {element, textColorProperty} = this.createTitle(peerId, wrapOptions, false);
              element.style.color = `rgb(var(--${textColorProperty}))`;
              title = element;
            }

            const line = document.createElement('div');
            line.classList.add('name-first-line');
            line.append(title);
            nameDiv.prepend(line);
          }
        }
      } else if(!message.viaBotId) {
        if(!isStandaloneMedia && needName) {
          nameDiv = document.createElement('div');
          nameDiv.append(title);

          if(!noColor) {
            const peer = apiManagerProxy.getPeer(peerIdForColor);
            const pFlags = (peer as User.user)?.pFlags;
            if(pFlags && (pFlags.scam || pFlags.fake)) {
              nameDiv.append(generateFakeIcon(pFlags.scam));
            }

            if(!our) {
              nameDiv.classList.add('colored-name');
            }

            nameDiv.dataset.peerId = '' + peerIdForColor;
          }
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

      if(nameDiv && !bubble.classList.contains('hide-name')) {
        nameDiv.classList.add('name');
        setDirection(nameDiv);

        const updateMessageDiv = (insertedElement: HTMLElement) => {
          if(messageDiv && insertedElement.nextElementSibling === messageDiv) {
            insertedElement.classList.add('next-is-message');
          }
        };

        if(isStandaloneMedia) {
          const newNameContainer = document.createElement('div');
          newNameContainer.classList.add('name-with-reply', 'floating-part');
          nameContainer.prepend(newNameContainer);
          updateMessageDiv(newNameContainer);
          nameContainer = newNameContainer;
        } else {
          nameDiv.classList.add('floating-part');
        }

        nameContainer.prepend(nameDiv);
        if(!isStandaloneMedia) {
          updateMessageDiv(nameDiv);
        }

        if(isStandaloneMedia && replyContainer) {
          nameDiv.after(replyContainer);
        }
      } else if(isStandaloneMedia && replyContainer) {
        replyContainer.classList.add('floating-part');
      }

      const firstElement = nameDiv?.firstElementChild as HTMLElement || title;
      if(
        this.canShowRanks &&
        title &&
        !isHidden &&
        !fwdFromId
        // (!fwdFromId || (message.post_author && !this.chat.getPostAuthor(message)))
      ) {
        const processRank = () => {
          const rank = this.ranks.get(message.fromId);
          if(!rank) {
            return;
          }

          this.wrapTitleAndRank(firstElement, rank);
        };

        const postAuthor = hasPostAuthor && (message as Message.message).post_author/*  || fwdFrom?.post_author */;
        if(postAuthor) {
          this.wrapTitleAndRank(firstElement, postAuthor);
        } else if(this.ranks) {
          processRank();
        } else {
          const processRanks = this.processRanks;
          processRanks.add(processRank);

          middleware.onDestroy(() => {
            processRanks.delete(processRank);
          });
        }
      } else if(this.chat.isMegagroup && !message.fromId.isUser() && (message as Message.message).views) {
        this.wrapTitleAndRank(firstElement, 0);
      }

      if(topicNameButtonContainer && isStandaloneMedia) {
        if(!attachmentDiv) {
          this.log.error('no attachment div?', bubble, message);
          debugger;
        } else {
          attachmentDiv.after(topicNameButtonContainer);
        }
      }

      if(mustHaveName) {
        bubble.classList.add('must-have-name');
      }
    } else {
      bubble.classList.add('hide-name');
    }

    if(this.chat.type === ChatType.Pinned) {
      savedFrom = makeFullMid(this.chat.peerId, message.mid);
    }

    const isThreadStarter = messageWithReplies && messageWithReplies.mid === this.chat.threadId;
    if(isThreadStarter) {
      bubble.classList.add('is-thread-starter', 'is-group-last');
    }

    if(savedFrom && (this.chat.type === ChatType.Pinned || fwdFrom.saved_from_msg_id) && this.peerId !== REPLIES_PEER_ID) {
      const goto = document.createElement('div');
      goto.classList.add('bubble-beside-button', 'with-hover', 'goto-original');
      goto.append(Icon('arrow_next'));
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
        lazyLoadQueue: this.lazyLoadQueue,
        middleware
      });

      if(isFooter) {
        canHaveTail = true;
      } else {
        bubble.classList.add('with-beside-replies');
      }
    } else if(isMessage && message.replies && this.chat.isAnyGroup) {
      const replies = message.replies;
      this.setBubbleRepliesCount(bubble, replies.replies);
    }

    if(isMessage) {
      this.appendReactionsElementToBubble(bubble, message, reactionsMessage, undefined, loadPromises);
    }

    if(canHaveTail && !isRound) {
      bubble.classList.add('can-have-tail');
    }
    if(canHaveTail || isRound) {
      bubbleContainer.append(generateTail());
    }

    if(our && (this.peerId !== rootScope.myId || isOut)) {
      if(message.pFlags.unread || isOutgoing) this.unreadOut.add(message.mid);
      let status: Parameters<ChatBubbles['setBubbleSendingStatus']>[1];
      if(message.error) status = 'error';
      else if(isOutgoing) status = 'sending';
      else status = message.pFlags.unread || (message as Message.message).pFlags.is_scheduled ? 'sent' : 'read';

      if(isOut || (status !== 'sent' && status !== 'read')) {
        this.setBubbleSendingStatus(bubble, status, true);
      }
    }

    if(isMessage) {
      createRoot((dispose) => {
        middleware.onDestroy(dispose);

        createEffect(() => {
          bubble.classList.toggle('no-forwards', !this.canForward(message));
        });
      });
    }

    if(isMessage && message.effect && (isInUnread || isOutgoing)) {
      this.observer.observe(bubble, this.messageEffectObserverCallback);
    }


    if(isRound) {
      wrapRoundVideoBubble({
        bubble,
        message: message as Message.message,
        globalMediaDeferred,
        searchContext
      });
    }

    this.addMessageSpoilerOverlay({
      mid: message.mid,
      messageDiv,
      middleware,
      loadPromises,
      canTranslate
    });

    return ret;
  }

  private async addMessageSpoilerOverlay({mid, messageDiv, middleware, loadPromises, canTranslate}: AddMessageSpoilerOverlayParams) {
    if(IS_FIREFOX) return; // Firefox has very poor performance when drawing on canvas
    if(canTranslate && loadPromises) await Promise.all(loadPromises); // TranslatableMessage delays the moment when content appears in the DOM

    if(!messageDiv.querySelector('.spoiler-text')) return;

    const spoilerOverlay = createMessageSpoilerOverlay({
      mid: mid,
      messageElement: messageDiv,
      animationGroup: this.chat.animationGroup
    }, SolidJSHotReloadGuardProvider);

    messageDiv.append(spoilerOverlay.element);
    middleware.onDestroy(() => {
      spoilerOverlay.dispose();
    });

    await Promise.all(loadPromises);
    spoilerOverlay.controls.update(); // For chats that have custom theme differing from the one from settings
  }

  public canForward(message: Message.message | Message.messageService) {
    if(message?._ !== 'message' || message.pFlags.noforwards) {
      return false;
    }

    if(message.peerId.isUser()) {
      return true;
    }

    if((usePeer(message.peerId) as MTChat.channel).pFlags.noforwards) {
      return false;
    }

    return true;
  }

  private appendReactionsElementToBubble(
    bubble: HTMLElement,
    message: Message.message,
    reactionsMessage: Message.message,
    changedResults?: ReactionCount[],
    loadPromises?: Promise<any>[]
  ) {
    if(this.peerId.isUser() && USER_REACTIONS_INLINE/*  || true */) {
      return;
    }

    if(!reactionsMessage?.reactions || !reactionsMessage.reactions.results.length) {
      return;
    }

    // message = this.appMessagesManager.getMessageWithReactions(message);

    const reactionsElement = new ReactionsElement();
    reactionsElement.init({
      context: reactionsMessage,
      type: ReactionLayoutType.Block,
      middleware: bubble.middlewareHelper.get(),
      animationGroup: this.chat.animationGroup,
      lazyLoadQueue: this.lazyLoadQueue
    });
    reactionsElement.render(changedResults);

    if(bubble.classList.contains('has-floating-time')) {
      bubble.querySelector('.bubble-content-wrapper').append(reactionsElement);
    } else {
      const timeSpan = bubble.timeSpan;
      const messageDiv = bubble.querySelector('.message');

      appendBubbleTime(bubble, reactionsElement, () => reactionsElement.append(timeSpan));

      if(bubble.classList.contains('is-multiple-documents')) {
        const documentContainer = messageDiv.lastElementChild as HTMLElement;
        let documentMessageDiv = documentContainer.querySelector('.document-message');

        if(!documentMessageDiv) {
          documentMessageDiv = document.createElement('div');
          documentMessageDiv.classList.add('document-message');
          documentContainer.querySelector('.document-wrapper').append(documentMessageDiv);
        }

        documentMessageDiv.append(reactionsElement);
      } else {
        messageDiv.append(reactionsElement);
      }
    }
  }

  private setStoryContainerDimensions(container: HTMLElement) {
    const ratio = 9 / 16;
    const height = 256;
    const width = height * ratio;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
  }

  private async getStoryReplyIfExpired(storyPeerId: PeerId, storyId: number, isWebPage: boolean, noBorder?: boolean) {
    const result = await this.managers.acknowledged.appStoriesManager.getStoryById(storyPeerId, storyId);
    if(result.cached && !(await result.result)) {
      if(isWebPage) {
        return null;
      }

      const peerTitle = await wrapPeerTitle({peerId: storyPeerId});
      const {container, fillPromise} = wrapReply({
        title: isWebPage ? peerTitle : undefined,
        subtitle: isWebPage ? undefined : i18n('ExpiredStorySubtitle', [peerTitle]),
        isStoryExpired: true,
        noBorder
      });

      return container;
    }
  }

  private wrapSomeSolid(func: () => JSX.Element, container: HTMLElement, middleware: Middleware) {
    const dispose = render(func, container);
    middleware.onClean(dispose);
  }

  private wrapStory({
    message,
    bubble,
    storyPeerId: peerId,
    storyId,
    container,
    middleware,
    loadPromises,
    boxWidth,
    boxHeight
  }: {
    message: Message.message,
    bubble: HTMLElement,
    storyPeerId: PeerId,
    storyId: number,
    container: HTMLElement,
    middleware: Middleware,
    loadPromises: Promise<any>[],
    boxWidth?: number,
    boxHeight?: number
  }) {
    container.dataset.storyPeerId = '' + peerId;
    container.dataset.storyId = '' + storyId;
    this.wrapSomeSolid(() => {
      return StoryPreview({
        message,
        peerId,
        storyId,
        boxWidth,
        boxHeight,
        lazyLoadQueue: this.lazyLoadQueue,
        // group: this.chat.animationGroup,
        autoDownload: this.chat.autoDownload,
        loadPromises,
        canAutoplay: false,
        onExpiredStory: async() => {
          await getHeavyAnimationPromise(); // wait for scroll to end
          message = this.chat.getMessageByPeer(message.peerId, message.mid) as Message.message;
          this.safeRenderMessage({
            message,
            reverse: true,
            bubble
          });
        },
        withPreloader: true
      });
    }, container, middleware);
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

  private createTitle(peerId: PeerId, wrapOptions: WrapSomethingOptions, isForward?: boolean) {
    const colorIndex = getPeerColorIndexByPeer(apiManagerProxy.getPeer(peerId));
    let textColorProperty: string;
    if(colorIndex !== -1) {
      textColorProperty = `peer-${colorIndex}-color-rgb`;
    }

    return {
      element: new PeerTitle({
        peerId,
        withPremiumIcon: !isForward,
        wrapOptions: {
          ...wrapOptions,
          textColor: textColorProperty
        }
      }).element,
      textColorProperty
    };
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
    const log = false || true ? this.log.bindPrefix('perform-' + (Math.random() * 1000 | 0)) : undefined;
    log?.('start', this.chatInner.parentElement, historyResult);

    let history = (historyResult as HistoryResult).messages || historyResult.history;
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
        return this.safeRenderMessage({
          message,
          reverse,
          canAnimateLadder: true
        });
      }
    };

    const messages = /* await Promise.all */(history.map((mid) => {
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
        const {lastMsgFullMid, topMessageFullMid, savedPosition} = this.setPeerOptions;
        this.setPeerOptions = undefined;
        // ! warning
        if((lastMsgFullMid === EMPTY_FULL_MID && !savedPosition) || (topMessageFullMid !== EMPTY_FULL_MID && this.getBubble(topMessageFullMid)) || lastMsgFullMid === topMessageFullMid) {
          isEnd.bottom = true;
        }
      }

      if(isEnd.top) setLoadedPromises.push(this.setLoaded('top', true));
      if(isEnd.bottom) setLoadedPromises.push(this.setLoaded('bottom', true));
    }

    if(setLoadedPromises.length) {
      await Promise.all(setLoadedPromises);
    }

    let promises: Promise<any>[] = [];
    if(this.chat.type === ChatType.Search && false) {
      const length = history.length;
      if(reverse) for(let i = 0; i < length; ++i) promises.push(cb(messages[i]));
      else for(let i = length - 1; i >= 0; --i) promises.push(cb(messages[i]));
    } else {
      promises = messages.map(cb);
    }

    // cannot combine them into one promise
    promises.length && await Promise.all(promises);
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
            scrollHeight: this.scrollable.scrollSize,
            clientHeight: this.scrollable.clientSize
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
      ...this.chat.requestHistoryOptionsPart,
      offsetId: 0,
      limit: 2,
      addOffset: -1,
      offsetDate: timestamp
    }).then((history) => {
      if(!history?.messages?.length) {
        this.log.error('no history!');
        return;
      } else if(this.peerId !== peerId) {
        return;
      }

      this.chat.setMessageId({lastMsgId: (history.messages[0] as MyMessage).mid});
      // console.log('got history date:', history);
    });
  };

  public requestHistory(offsetId: number | FullMid, limit: number, backLimit: number): Promise<AckedResult<HistoryResult>>  {
    let offsetPeerId: PeerId;
    if(typeof(offsetId) === 'string') {
      const {peerId, mid} = splitFullMid(offsetId);
      offsetPeerId = peerId;
      offsetId = mid;
    }

    // const middleware = this.getMiddleware();
    if([ChatType.Chat, ChatType.Discussion, ChatType.Saved, ChatType.Search].includes(this.chat.type)) {
      return this.managers.acknowledged.appMessagesManager.getHistory({
        ...this.chat.requestHistoryOptionsPart,
        offsetPeerId,
        offsetId,
        limit,
        backLimit
      });
    } else if(this.chat.type === ChatType.Pinned) {
      return this.managers.acknowledged.appMessagesManager.getHistory({
        peerId: this.peerId,
        inputFilter: {_: 'inputMessagesFilterPinned'},
        offsetPeerId,
        offsetId,
        limit,
        backLimit
      });
    } else if(this.chat.type === ChatType.Scheduled) {
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

  private async animateAsLadder(additionalFullMid: FullMid, additionalFullMids: FullMid[], isAdditionalRender: boolean, backLimit: number, maxId: FullMid) {
    /* const middleware = this.getMiddleware();
    await this.ladderDeferred; */

    const log = this.log.bindPrefix('ladder');
    if(this.chat.setPeerPromise && !this.resolveLadderAnimation) {
      log.warn('will be delayed');
      // @ts-ignore
      this.resolveLadderAnimation = this.animateAsLadder.bind(this, additionalFullMid, additionalFullMids, isAdditionalRender, backLimit, maxId);
      return;
    }

    /* if(!middleware()) {
      return;
    } */

    const fullMids = this.getRenderedHistory('desc');

    if(!fullMids.length) {
      log.warn('no bubbles');
      return;
    }

    let sortedFullMids = fullMids.slice();

    if(isAdditionalRender && additionalFullMids.length) {
      sortedFullMids = sortedFullMids.filter((fullMid) => !additionalFullMids.includes(fullMid));
    }

    let targetMid: FullMid;
    if(backLimit) {
      targetMid = maxId || sortedFullMids[0]; // * on discussion enter
    } else {
      if(additionalFullMid) {
        targetMid = additionalFullMid;
      } else { // * if maxId === 0
        targetMid = sortedFullMids[0];
      }
    }

    const topIds = sortedFullMids.slice(sortedFullMids.findIndex((mid) => targetMid > mid));
    const middleIds = isAdditionalRender ? [] : [targetMid];
    const bottomIds = isAdditionalRender ? [] : sortedFullMids.slice(0, sortedFullMids.findIndex((mid) => targetMid >= mid)).reverse();

    if(DEBUG) {
      log('targeting mid:', targetMid, maxId, additionalFullMid, topIds, bottomIds);
    }

    const setBubbles: HTMLElement[] = [];

    this.chatInner.classList.add('zoom-fading');
    const delay = isAdditionalRender ? 10 : 40;
    const offsetIndex = isAdditionalRender ? 0 : 1;
    const animateAsLadder = (fullMids: string[], offsetIndex = 0) => {
      const animationPromise = deferredPromise<void>();
      let lastMsDelay = 0;
      fullMids.forEach((fullMid, idx) => {
        const bubble = this.getBubble(fullMid);
        if(!bubble || this.skippedMids.has(fullMid)) {
          log.warn('no bubble by mid:', fullMid);
          return;
        }

        lastMsDelay = ((idx + offsetIndex) || 0.1) * delay;
        // lastMsDelay = (idx + offsetIndex) * delay;
        // lastMsDelay = (idx || 0.1) * 1000;

        const contentWrapper = bubble.lastElementChild as HTMLElement;
        if(!contentWrapper) {
          log.warn('bubble not ready yet', fullMid, this.batchProcessor);
          return;
        }

        const elementsToAnimate: HTMLElement[] = [contentWrapper];
        const item = this.bubbleGroups.getItemByBubble(bubble);
        if(item && item.group.avatar && item.group.lastItem === item) {
          elementsToAnimate.push(item.group.avatar.node);
        }

        elementsToAnimate.forEach((element) => {
          element.classList.add('zoom-fade', 'can-zoom-fade');
          element.style.setProperty('transition-delay', lastMsDelay + 'ms', 'important');
        });

        if(idx === (fullMids.length - 1)) {
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

      if(!fullMids.length) {
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

      const TRANSITION_TIME = 300;
      const timeout = Math.max(...delays) + TRANSITION_TIME;
      dispatchHeavyAnimationEvent(promise, timeout)
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
    type: 'group' | 'saved' | 'noMessages' | 'noScheduledMessages' | 'greeting' | 'restricted' | 'premiumRequired' | 'paidMessages',
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

    if(title) {
      title.classList.add('center', BASE_CLASS + '-title');
      elements.push(title);
    }

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
      let subtitle = i18n('NoMessagesGreetingsDescription');

      // findAndSplice(this.messagesQueue, q => q.bubble === bubble);

      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add(BASE_CLASS + '-sticker');

      const middleware = this.getMiddleware();

      const promises = Promise.all([
        this.managers.appStickersManager.getGreetingSticker(),
        this.managers.appProfileManager.getProfile(message.peerId.toUserId())
      ]);
      await promises.then(async([doc, userFull]) => {
        if(!middleware()) return;

        const intro = userFull.business_intro;
        if(intro) {
          if(intro.title) {
            const _title = document.createElement('span');
            _title.append(wrapEmojiText(intro.title));
            _title.className = title.className;
            elements[elements.indexOf(title)] = _title;
          }

          if(intro.description) {
            subtitle = document.createElement('span');
            subtitle.append(wrapEmojiText(intro.description));
          }

          if(intro.sticker) {
            doc = intro.sticker as MyDocument;
          }

          const bubbleContainer = bubble.querySelector('.bubble-content');
          const content = bubbleContainer.cloneNode(false) as HTMLElement;
          const service = bubbleContainer.querySelector('.service-msg').cloneNode(false) as HTMLElement;

          service.append(i18n(
            intro.title || intro.description ? 'ChatEmpty.BusinessIntro.How' : 'ChatEmpty.BusinessIntro.Sticker.How',
            [
              await wrapPeerTitle({peerId: message.peerId, onlyFirstName: true}),
              anchorCallback(() => {
                PopupPremium.show();
              })
            ]
          ));

          content.classList.add('has-service-before');
          content.append(service);
          bubbleContainer.after(content);
          bubble.classList.add('wider');
        }

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
          this.chat.input.emoticonsDropdown.onMediaClick({target: e.target}, undefined, undefined, true);
        });

        return Promise.all(loadPromises);
      });

      // this.renderMessagesQueue({
      //   message,
      //   bubble,
      //   reverse: false,
      //   promises: [loadPromise]
      // });

      subtitle.classList.add('center', BASE_CLASS + '-subtitle');

      elements.push(subtitle, stickerDiv);
    } else if(type === 'premiumRequired') {
      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add(BASE_CLASS + '-sticker');
      stickerDiv.append(Icon('premium_restrict'));

      const subtitle = i18n('Chat.PremiumRequired', [await wrapPeerTitle({peerId: this.peerId, onlyFirstName: true})]);
      subtitle.classList.add('center', BASE_CLASS + '-subtitle');

      const button = Button('bubble-service-button', {noRipple: true, text: 'Chat.PremiumRequiredButton'});
      attachClickEvent(button, () => {
        PopupPremium.show();
      });

      elements.push(stickerDiv, subtitle, button);
    } else if(type === 'paidMessages') {
      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add(BASE_CLASS + '-sticker');
      stickerDiv.append(Icon('premium_restrict'));

      const starsAmount = await this.managers.appPeersManager.getStarsAmount(this.peerId); // should be cached probably here

      const starsElement = document.createElement('span');
      starsElement.classList.add(BASE_CLASS + '-stars')
      starsElement.append(
        Icon('star', BASE_CLASS + '-star-icon'),
        numberThousandSplitterForStars(starsAmount)
      );

      const subtitle = i18n('PaidMessages.NewChatDescription', [
        await wrapPeerTitle({peerId: this.peerId, onlyFirstName: true}),
        starsElement
      ]);
      subtitle.classList.add('center', BASE_CLASS + '-subtitle');

      const button = Button('bubble-service-button overflow-hidden', {noRipple: true, text: 'BuyStars'});
      button.append(Sparkles({isDiv: true, mode: 'button'}));
      attachClickEvent(button, () => {
        PopupElement.createPopup(PopupStars);
      });

      elements.push(stickerDiv, subtitle, button);
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
          const i = Icon('check', BASE_CLASS + '-list-check');
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
    animate?: boolean
  ) {
    const isSponsored = !!(message as Message.message).pFlags.sponsored;

    const onClearedBefore = () => {
      this.log.warn('local message was cleared before render', message);
    };

    const p: Parameters<ChatBubbles['safeRenderMessage']>[0]['processResult'] = async(result) => {
      const {bubble} = await result;
      if(!bubble) {
        onClearedBefore();
        return result;
      }

      const fullMid = makeFullMid(message);

      const middleware = bubble.middlewareHelper.get();
      const m = middlewarePromise(middleware);

      (bubble as any).message = message;

      bubble.classList.add('is-group-last', 'is-group-first');

      const updatePosition = () => {
        if(this.updatePlaceholderPosition === updatePosition) {
          this.updatePlaceholderPosition = undefined;
        }

        if(!middleware() || this.getBubble(fullMid) !== bubble) {
          onClearedBefore();
          return;
        }

        appendTo[method](appendWhat);
      };

      if(!isSponsored) {
        bubble.classList.add('bubble-first');
        bubble.classList.remove('can-have-tail', 'is-in');
      }

      const elements: (Node | string)[] = [];
      const isBot = this.chat.isBot;
      const appendWhat = bubble;
      let renderPromise: Promise<any>,
        appendTo = this.container,
        method: 'append' | 'prepend' = 'append';
      if(this.chat.isRestricted) {
        renderPromise = this.renderEmptyPlaceholder('restricted', bubble, message, elements);
      } else if(isSponsored) {
        bubble.classList.add('avoid-selection');

        /* const sponsoredMessage =  */this.sponsoredMessage = (message as Message.message).sponsoredMessage;
        // const peerId = getPeerId(sponsoredMessage.from_id);
        // const photo = getSponsoredPhoto(sponsoredMessage);
        // const willHaveAvatar = peerId !== NULL_PEER_ID || photo;
        // if(sponsoredMessage.pFlags.show_peer_photo && willHaveAvatar) {
        //   const photoIsPeer = photo && photo._ !== 'photo';
        //   const bubbleGroup = new BubbleGroup(this.chat);
        //   appendWhat = bubbleGroup.container;
        //   bubbleGroup.container.classList.add('bubbles-group-sponsored');
        //   bubbleGroup.createAvatar(message as Message.message, {
        //     peerId: photoIsPeer ? photo.id.toPeerId(true) : (!photo ? peerId : undefined),
        //     peer: photoIsPeer ? photo : undefined
        //   });

        //   if(photo && !photoIsPeer) {
        //     wrapPhotoToAvatar(bubbleGroup.avatar, photo as Photo.photo);
        //   }

        //   if(photo) {
        //     bubbleGroup.container.dataset.toCallback = '1';
        //   }

        //   bubbleGroup.container.append(bubble);
        // }

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
      } else if(this.chat.isAnyGroup && (apiManagerProxy.getPeer(this.peerId) as MTChat.chat).pFlags.creator) {
        renderPromise = this.renderEmptyPlaceholder('group', bubble, message, elements);
      } else if(this.chat.type === ChatType.Scheduled) {
        renderPromise = this.renderEmptyPlaceholder('noScheduledMessages', bubble, message, elements);
      } else if(rootScope.myId === this.peerId) {
        renderPromise = this.renderEmptyPlaceholder('saved', bubble, message, elements);
      } else if(this.peerId.isUser() && !isBot && await m(this.chat.canSend()) && this.chat.type === ChatType.Chat) {
        const requirement = await this.managers.appUsersManager.getRequirementToContact(this.peerId.toUserId());
        if(requirement._ === 'requirementToContactPremium') {
          renderPromise = this.renderEmptyPlaceholder('premiumRequired', bubble, message, elements);
        } else if(
          requirement._ === 'requirementToContactPaidMessages' &&
          !(await this.managers.appProfileManager.hasBussinesIntro(this.peerId.toUserId()) && this.chat.starsAmount <= +this.chat.stars())
        ) {
          renderPromise = this.renderEmptyPlaceholder('paidMessages', bubble, message, elements);
        } else {
          renderPromise = this.renderEmptyPlaceholder('greeting', bubble, message, elements);
        }
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
        const additionalFullMids = this.getRenderedHistory('asc');
        indexOfAndSplice(additionalFullMids, fullMid);
        this.animateAsLadder(fullMid, additionalFullMids, false, 0, EMPTY_FULL_MID);
      }

      bubble.middlewareHelper.onDestroy(() => {
        if(this.emptyPlaceholderBubble === bubble) {
          this.emptyPlaceholderBubble = undefined;
        }
      });

      this.emptyPlaceholderBubble = bubble;

      return result;
    };

    return this.safeRenderMessage({
      message,
      reverse: !isSponsored,
      updatePosition: false,
      processResult: p,
      canAnimateLadder: true
    });
  }

  private makeViewButton<T extends Parameters<typeof Button>[1]>(options: T) {
    const button = Button('btn-primary btn-primary-transparent bubble-view-button', options);
    const text = button.querySelector('.i18n');
    if(text) {
      text.classList.add('bubble-view-button-text');
    }
    return button;
  }

  private generateLocalMessageId(addOffset = 0) {
    // const INCREMENT = 0x10;
    const offset = (this.chat.type === ChatType.Scheduled ? -1 : 0) + addOffset;
    // offset = generateMessageId(offset);
    // id: -Math.abs(+this.peerId * INCREMENT + offset),
    const id = -Math.abs(offset);
    // const mid = -Math.abs(generateMessageId(id));
    const mid = id;
    return {id, mid};
  }

  private async generateLocalFirstMessage<T extends boolean>(
    service?: T,
    fill?: (message: GenerateLocalMessageType<T>) => void,
    addOffset = 0
  ): Promise<GenerateLocalMessageType<T>> {
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

    const fullMids = invisible.map(({element}) => getBubbleFullMid(element));

    let scrollSaver: ScrollSaver;
    if(/* !!invisibleTop.length !== !!invisibleBottom.length &&  */!ignoreScrollSaving) {
      scrollSaver = this.createScrollSaver(!!invisibleTop.length);
      scrollSaver.save();
    }

    log('slicing mids', fullMids);
    this.deleteMessagesByIds(fullMids, false, true);

    if(scrollSaver) {
      scrollSaver.restore();
    } else if(invisibleTop.length) {
      this.scrollable.lastScrollPosition = this.scrollable.scrollPosition;
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

    if(this.scrollable.loadedAll.bottom && this.scrollable.loadedAll.top) {
      setPeerLanguageLoaded(this.peerId);
    }

    if(!checkPlaceholders) {
      return;
    }

    if(!this.chat.isRestricted) {
      if(side === 'bottom' && this.chat.isBroadcast && this.chat.type === ChatType.Chat/*  && false */) {
        this.toggleSponsoredMessage(value);
      }

      if(side === 'top' && value && this.chat.isBot) {
        return this.renderBotPlaceholder();
      }
    }

    return this.checkIfEmptyPlaceholderNeeded();
  }

  private async toggleSponsoredMessage(value: boolean) {
    const log = this.log.bindPrefix('sponsored-' + (Math.random() * 1000 | 0));
    log('checking', value);
    const {mid} = this.generateLocalMessageId(SPONSORED_MESSAGE_ID_OFFSET);
    const fullMid = makeFullMid(this.peerId, mid);
    if(value) {
      const middleware = this.getMiddleware(() => {
        return this.scrollable.loadedAll.bottom && this.getSponsoredMessagePromise === promise;
      });

      const promise = this.getSponsoredMessagePromise = this.managers.appMessagesManager.getSponsoredMessage(this.peerId)
      .then((sponsoredMessages) => {
        if(!middleware() || sponsoredMessages._ === 'messages.sponsoredMessagesEmpty') {
          return;
        }

        const sponsoredMessage = sponsoredMessages.messages[0];
        if(!sponsoredMessage) {
          log('no message');
          return;
        }

        const messagePromise = this.generateLocalFirstMessage(false, (message) => {
          message.message = '';
          message.from_id = {_: 'peerUser', user_id: NULL_PEER_ID};
          message.pFlags.sponsored = true;
          message.pFlags.invert_media = true;
          message.sponsoredMessage = sponsoredMessage;

          const sponsoredMedia = sponsoredMessage.media;

          const localWebPage: WebPage.webPage = {
            _: 'webPage',
            id: message.mid,
            pFlags: {
              has_large_media: !!sponsoredMedia || undefined
            },
            url: '',
            display_url: '',
            hash: 0,
            description: sponsoredMessage.message,
            entities: sponsoredMessage.entities,
            document: (sponsoredMedia as MessageMedia.messageMediaDocument)?.document,
            photo: (sponsoredMedia as MessageMedia.messageMediaPhoto)?.photo
          };

          message.media = {
            _: 'messageMediaWebPage',
            pFlags: {
              force_large_media: !!sponsoredMedia || undefined
            },
            webpage: localWebPage
          };
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
      this.deleteMessagesByIds([fullMid], false);
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
        (this.chat.type === ChatType.Scheduled && !this.getRenderedLength()) ||
        !(await this.chat.getHistoryStorage()).count
      )
    ) {
      this.log('inject empty peer placeholder');

      const message = await this.generateLocalFirstMessage(true);
      return {renderPromise: this.processLocalMessageRender(message)};
    }
  }

  public getHistory1(maxId?: FullMid, reverse?: boolean, isBackLimit?: boolean, additionalFullMid?: FullMid, justLoad?: boolean) {
    const middleware = this.getMiddleware(justLoad ? undefined : () => {
      return (reverse ? this.getHistoryTopPromise : this.getHistoryBottomPromise) === waitPromise;
    });

    const result = this.getHistory(maxId, reverse, isBackLimit, additionalFullMid, justLoad, middleware);
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
        if(this.chat.type === ChatType.Chat/*  || this.chat.type === 'discussion' */) {
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
   * @param additionalFullMid for the last message
   * @param justLoad do not render
   */
  public async getHistory(
    maxId: FullMid = EMPTY_FULL_MID,
    reverse = false,
    isBackLimit = false,
    additionalFullMid?: FullMid,
    justLoad = false,
    middleware?: () => boolean
  ): Promise<{cached: boolean, promise: Promise<void>, waitPromise: Promise<any>}> {
    const peerId = this.peerId;

    const isBroadcast = this.chat.isBroadcast;
    // console.time('appImManager call getHistory');
    const pageCount = Math.min(40, windowSize.height / 40/*  * 1.25 */ | 0);
    // const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = isBroadcast ? 20 : (this.getRenderedHistory(undefined, true).length > 0 ? Math.max(35, pageCount) : pageCount);
    // const realLoadCount = pageCount;//const realLoadCount = 50;
    let loadCount = realLoadCount;

    /* if(TEST_SCROLL) {
      //loadCount = 1;
      if(Object.keys(this.bubbles).length > 0)
      return {cached: false, promise: Promise.resolve(true)};
    } */
    // if(TEST_SCROLL !== undefined) {
    //   if(TEST_SCROLL) {
    //     if(Object.keys(this.bubbles).length > 0) {
    //       --TEST_SCROLL;
    //     }
    //   } else {
    //     return {cached: false, promise: Promise.resolve(), waitPromise: Promise.resolve()};
    //   }
    // }

    // //console.time('render history total');

    let backLimit = 0;
    if(isBackLimit) {
      backLimit = loadCount;

      if(!reverse) { // if not jump
        loadCount = 0;
        // maxId = this.appMessagesManager.incrementMessageId(maxId, 1);
      }
    }

    let additionalFullMids: FullMid[];
    if(additionalFullMid && !isBackLimit) {
      if(this.chat.type === ChatType.Pinned) {
        additionalFullMids = [additionalFullMid];
      } else {
        const historyStorage = await this.chat.getHistoryStorage();
        const slicedArray = historyStorage.history;
        const slice = slicedArray.slice;
        if(slice.isEnd(SliceEnd.Bottom) && !slice.isEnd(SliceEnd.Both)) {
          const {mid, peerId} = splitFullMid(additionalFullMid);
          const sliced = slicedArray.sliceMe(mid, 0, loadCount);
          if(sliced) {
            additionalFullMids = [additionalFullMid, ...sliced.slice.map((mid) => makeFullMid(peerId, mid))];
          } else {
            additionalFullMids = slice.slice(0, loadCount).map((mid) => makeFullMid(peerId, mid));
          }

          // * filter last album, because we don't know is it the last item
          for(let i = additionalFullMids.length - 1; i >= 0; --i) {
            const message = this.chat.getMessage(additionalFullMids[i]);
            if((message as Message.message)?.grouped_id) additionalFullMids.splice(i, 1);
            else break;
          }

          loadCount = Math.max(0, loadCount - additionalFullMids.length);
          maxId = additionalFullMids[additionalFullMids.length - 1] || maxId;
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
    const isAdditionRender = !!additionalFullMids?.length;
    // const isFirstMessageRender = (this.isFirstLoad && backLimit && !result.cached) || (isAdditionRender && loadCount > 0);
    const isFirstMessageRender = this.isFirstLoad && !result.cached && (isAdditionRender || loadCount > 0);
    if(isAdditionRender) {
      resultPromise = result.result;

      result = {
        cached: true,
        result: Promise.resolve({history: additionalFullMids.map((fullMid) => splitFullMid(fullMid).mid)})
      };

      // additionMsgID = 0;
    }

    this.isFirstLoad = false;

    const processResult = async(historyResult: Awaited<typeof result['result']>) => {
      if((historyResult as HistoryResult).isEnd?.top) {
        // * synchronize bot placeholder & user premium appearance
        await this.managers.appProfileManager.getProfileByPeerId(peerId);

        // await this.setLoaded('top', true);
      }
    };

    const sup = (historyResult: Awaited<typeof result['result']>) => {
      return getHeavyAnimationPromise().then(() => {
        return processResult(historyResult);
      }).then(() => {
        if(!isAdditionRender && additionalFullMid) {
          historyResult.history.unshift(splitFullMid(additionalFullMid).mid);
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

        const promise = this.animateAsLadder(additionalFullMid, additionalFullMids, isAdditionRender, backLimit, maxId);
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
    if(!(this.chat.type === ChatType.Chat || this.chat.type === ChatType.Discussion)) {
      return;
    }

    if(this.attachedUnreadBubble) {
      return;
    }

    const middleware = this.getMiddleware();

    const {peerId, threadId} = this.chat;

    const historyMaxId = await this.chat.getHistoryMaxId();
    let readMaxId = await this.managers.appMessagesManager.getReadMaxIdIfUnread(peerId, threadId);
    if(!readMaxId || !middleware()) return;

    readMaxId = this.getRenderedHistory('asc', true)
    .filter((fullMid) => !this.getBubble(fullMid).classList.contains('is-out'))
    .map((fullMid) => splitFullMid(fullMid).mid)
    .find((mid) => mid > readMaxId);

    if(!readMaxId) {
      return;
    }

    const bubble = this.getBubble(peerId, readMaxId);
    if(!bubble) {
      return;
    }

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

  public deleteEmptyDateGroups() {
    let deleted = false;
    for(const i in this.dateMessages) {
      const dateMessage = this.dateMessages[i];

      if(dateMessage.groupsLength) {
        continue;
      }

      dateMessage.container.remove();
      this.stickyIntersector?.unobserve(dateMessage.container, dateMessage.div);
      delete this.dateMessages[i];
      deleted = true;

      // * no sense in it
      /* if(dateMessage.div === this.previousStickyDate) {
        this.previousStickyDate = undefined;
      } */
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

export function generateTail(asSpan?: boolean) {
  if(asSpan) {
    const span = document.createElement('span');
    span.classList.add('bubble-tail');
    return span;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 11 20');
  svg.setAttributeNS(null, 'width', '11');
  svg.setAttributeNS(null, 'height', '20');
  svg.classList.add('bubble-tail');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#message-tail-filled');
  // use.classList.add('bubble-tail-use');

  svg.append(use);

  return svg;
}
