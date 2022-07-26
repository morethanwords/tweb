/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppImManager, ChatSavedPosition } from "../../lib/appManagers/appImManager";
import type { HistoryResult, MyMessage } from "../../lib/appManagers/appMessagesManager";
import type { MyDocument } from "../../lib/appManagers/appDocsManager";
import type Chat from "./chat";
import { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import IS_TOUCH_SUPPORTED from "../../environment/touchSupport";
import { logger } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import BubbleGroups from "./bubbleGroups";
import PopupDatePicker from "../popups/datePicker";
import PopupForward from "../popups/forward";
import PopupStickers from "../popups/stickers";
import ProgressivePreloader from "../preloader";
import Scrollable, { SliceSides } from "../scrollable";
import StickyIntersector from "../stickyIntersector";
import animationIntersector from "../animationIntersector";
import mediaSizes from "../../helpers/mediaSizes";
import { IS_ANDROID, IS_APPLE, IS_MOBILE, IS_SAFARI } from "../../environment/userAgent";
import I18n, { FormatterArguments, i18n, langPack, LangPackKey, UNSUPPORTED_LANG_PACK_KEY, _i18n } from "../../lib/langPack";
import AvatarElement from "../avatar";
import ripple from "../ripple";
import { wrapAlbum, wrapPhoto, wrapVideo, wrapDocument, wrapSticker, wrapPoll, wrapGroupedDocuments } from "../wrappers";
import { MessageRender } from "./messageRender";
import LazyLoadQueue from "../lazyLoadQueue";
import ListenerSetter from "../../helpers/listenerSetter";
import PollElement from "../poll";
import AudioElement from "../audio";
import { ChatInvite, Document, Message, MessageEntity,  MessageMedia,  MessageReplyHeader, Photo, PhotoSize, ReactionCount, ReplyMarkup, SponsoredMessage, Update, User, WebPage } from "../../layer";
import { BOT_START_PARAM, NULL_PEER_ID, REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { FocusDirection, ScrollStartCallbackDimensions } from "../../helpers/fastSmoothScroll";
import useHeavyAnimationCheck, { getHeavyAnimationPromise, dispatchHeavyAnimationEvent, interruptHeavyAnimation } from "../../hooks/useHeavyAnimationCheck";
import { fastRaf, fastRafPromise } from "../../helpers/schedulers";
import deferredPromise from "../../helpers/cancellablePromise";
import RepliesElement from "./replies";
import DEBUG from "../../config/debug";
import { SliceEnd } from "../../helpers/slicedArray";
import PeerTitle from "../peerTitle";
import findUpClassName from "../../helpers/dom/findUpClassName";
import findUpTag from "../../helpers/dom/findUpTag";
import { toast, toastNew } from "../toast";
import { getElementByPoint } from "../../helpers/dom/getElementByPoint";
import { getMiddleware } from "../../helpers/middleware";
import cancelEvent from "../../helpers/dom/cancelEvent";
import { attachClickEvent, simulateClickEvent } from "../../helpers/dom/clickEvent";
import htmlToDocumentFragment from "../../helpers/dom/htmlToDocumentFragment";
import reflowScrollableElement from "../../helpers/dom/reflowScrollableElement";
import replaceContent from "../../helpers/dom/replaceContent";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import whichChild from "../../helpers/dom/whichChild";
import { cancelAnimationByKey } from "../../helpers/animation";
import assumeType from "../../helpers/assumeType";
import debounce, { DebounceReturnType } from "../../helpers/schedulers/debounce";
import { SEND_WHEN_ONLINE_TIMESTAMP } from "../../lib/mtproto/constants";
import windowSize from "../../helpers/windowSize";
import { formatPhoneNumber } from "../../helpers/formatPhoneNumber";
import AppMediaViewer from "../appMediaViewer";
import SetTransition from "../singleTransition";
import handleHorizontalSwipe from "../../helpers/dom/handleHorizontalSwipe";
import findUpAttribute from "../../helpers/dom/findUpAttribute";
import findUpAsChild from "../../helpers/dom/findUpAsChild";
import formatCallDuration from "../../helpers/formatCallDuration";
import IS_CALL_SUPPORTED from "../../environment/callSupport";
import Button from "../button";
import { CallType } from "../../lib/calls/types";
import getVisibleRect from "../../helpers/dom/getVisibleRect";
import PopupJoinChatInvite from "../popups/joinChatInvite";
import { InternalLink, INTERNAL_LINK_TYPE } from "../../lib/appManagers/internalLink";
import ReactionsElement, { REACTIONS_ELEMENTS } from "./reactions";
import type ReactionElement from "./reaction";
import RLottiePlayer from "../../lib/rlottie/rlottiePlayer";
import pause from "../../helpers/schedulers/pause";
import ScrollSaver from "../../helpers/scrollSaver";
import getObjectKeysAndSort from "../../helpers/object/getObjectKeysAndSort";
import forEachReverse from "../../helpers/array/forEachReverse";
import formatNumber from "../../helpers/number/formatNumber";
import getViewportSlice from "../../helpers/dom/getViewportSlice";
import SuperIntersectionObserver from "../../helpers/dom/superIntersectionObserver";
import generateFakeIcon from "../generateFakeIcon";
import copyFromElement from "../../helpers/dom/copyFromElement";
import PopupElement from "../popups";
import setAttachmentSize from "../../helpers/setAttachmentSize";
import wrapWebPageDescription from "../wrappers/webPageDescription";
import wrapWebPageTitle from "../wrappers/webPageTitle";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";
import wrapRichText from "../../lib/richTextProcessor/wrapRichText";
import wrapMessageActionTextNew from "../wrappers/messageActionTextNew";
import isMentionUnread from "../../lib/appManagers/utils/messages/isMentionUnread";
import getMediaFromMessage from "../../lib/appManagers/utils/messages/getMediaFromMessage";
import getPeerColorById from "../../lib/appManagers/utils/peers/getPeerColorById";
import getPeerId from "../../lib/appManagers/utils/peers/getPeerId";
import getServerMessageId from "../../lib/appManagers/utils/messageId/getServerMessageId";
import generateMessageId from "../../lib/appManagers/utils/messageId/generateMessageId";
import { AppManagers } from "../../lib/appManagers/managers";
import { Awaited } from "../../types";
import idleController from "../../helpers/idleController";
import overlayCounter from "../../helpers/overlayCounter";
import { cancelContextMenuOpening } from "../../helpers/dom/attachContextMenuListener";
import contextMenuController from "../../helpers/contextMenuController";
import { AckedResult } from "../../lib/mtproto/superMessagePort";
import middlewarePromise from "../../helpers/middlewarePromise";
import { EmoticonsDropdown } from "../emoticonsDropdown";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import noop from "../../helpers/noop";
import getAlbumText from "../../lib/appManagers/utils/messages/getAlbumText";
import paymentsWrapCurrencyAmount from "../../helpers/paymentsWrapCurrencyAmount";
import PopupPayment from "../popups/payment";

const USE_MEDIA_TAILS = false;
const IGNORE_ACTIONS: Set<Message.messageService['action']['_']> = new Set([
  'messageActionHistoryClear',
  'messageActionChatCreate'/* ,
  'messageActionChannelMigrateFrom' */
]);

export const SERVICE_AS_REGULAR: Set<Message.messageService['action']['_']> = new Set();

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
const DO_NOT_UPDATE_MESSAGE_VIEWS = false;
const DO_NOT_UPDATE_MESSAGE_REACTIONS = false;
const DO_NOT_UPDATE_MESSAGE_REPLY = false;

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

  //public messagesCount: number = -1;

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

  public messagesQueuePromise: Promise<void> = null;
  private messagesQueue: ReturnType<ChatBubbles['safeRenderMessage']>[] = [];
  // private messagesQueueOnRender: () => void = null;
  private messagesQueueOnRenderAdditional: () => void = null;

  private firstUnreadBubble: HTMLElement = null;
  private attachedUnreadBubble: boolean;

  public lazyLoadQueue: LazyLoadQueue;

  private middleware = getMiddleware();

  private log: ReturnType<typeof logger>;

  public listenerSetter: ListenerSetter;

  private replyFollowHistory: number[] = [];

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
  private observer: SuperIntersectionObserver;

  private renderingMessages: Set<number> = new Set();
  private setPeerCached: boolean;
  private attachPlaceholderOnRender: () => void;

  private bubblesToEject: Set<HTMLElement> = new Set();
  private bubblesToReplace: Map<HTMLElement, HTMLElement> = new Map(); // TO -> FROM
  private updatePlaceholderPosition: () => void;
  private setPeerOptions: {lastMsgId: number; topMessage: number;};

  private setPeerTempId: number = 0;

  private renderNewPromises: Set<Promise<any>> = new Set();

  // private reactions: Map<number, ReactionsElement>;

  constructor(
    private chat: Chat, 
    private managers: AppManagers
  ) {
    this.log = this.chat.log;
    //this.chat.log.error('Bubbles construction');
    
    this.listenerSetter = new ListenerSetter();

    this.constructBubbles();

    // * constructor end

    this.bubbleGroups = new BubbleGroups(this.chat);
    this.preloader = new ProgressivePreloader({
      cancelable: false
    });
    this.lazyLoadQueue = new LazyLoadQueue();
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
          group === foundItem?.group 
          || (group === this.bubbleGroups.getLastGroup() && group.items.length === 1 && newItem.dateTimestamp === item.dateTimestamp) 
          || (this.peerId === rootScope.myId && sequential && newItem.dateTimestamp === item.dateTimestamp)
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
          const div = bubble.querySelector(`.document-container[data-mid="${tempId}"] .document`);
          if(div) {
            const container = findUpClassName(div, 'document-container');

            if(!tempMessage.media?.document?.thumbs?.length && doc.thumbs?.length) {
              getHeavyAnimationPromise().then(async() => {
                const timeSpan = div.querySelector('.time');
                const newDiv = await wrapDocument({message});
                div.replaceWith(newDiv);
                
                if(timeSpan) {
                  newDiv.querySelector('.document-size').append(timeSpan);
                }
              });
            }

            if(container) {
              container.dataset.mid = '' + mid;
            }
          }

          const element = bubble.querySelector(`audio-element[data-mid="${tempId}"], .document[data-doc-id="${tempId}"], .media-round[data-mid="${tempId}"]`) as HTMLElement;
          if(element) {
            if(element instanceof AudioElement || element.classList.contains('media-round')) {
              element.dataset.mid = '' + message.mid;
              delete element.dataset.isOutgoing;
              (element as any).message = message;
              (element as any).onLoad(true);
            } else {
              element.dataset.docId = '' + doc.id;
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

      this.safeRenderMessage(message, true, bubble);
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

    if(this.chat.type !== 'scheduled' && !DO_NOT_UPDATE_MESSAGE_REACTIONS/*  && false */) {
      this.listenerSetter.add(rootScope)('messages_reactions', async(arr) => {
        let scrollSaver: ScrollSaver;

        const a = arr.map(async({message, changedResults}) => {
          if(this.peerId !== message.peerId) {
            return;
          }

          const result = await this.getMountedBubble(message.mid, message);
          if(!result) {
            return;
          }

          return {bubble: result.bubble, message, changedResults};
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
          if(obj.replyMid === mid && obj.replyToPeerId === peerId) {
            this.needUpdate.splice(idx, 1)[0];
            filtered.push(obj);
          }
        });

        filtered.forEach(async({mid, replyMid, replyToPeerId}) => {
          const bubble = this.bubbles[mid];
          if(!bubble) return;

          const message = (await this.chat.getMessage(mid)) as Message.message;
          
          MessageRender.setReply({
            chat: this.chat,
            bubble,
            message
          });
        });
      });
    });

    attachClickEvent(this.scrollable.container, this.onBubblesClick, {listenerSetter: this.listenerSetter});
    // this.listenerSetter.add(this.bubblesContainer)('click', this.onBubblesClick/* , {capture: true, passive: false} */);

    this.listenerSetter.add(this.scrollable.container)('mousedown', (e) => {
      if(e.button !== 0) return;
      
      const code: HTMLElement = findUpTag(e.target, 'CODE');
      if(code) {
        cancelEvent(e);
        copyFromElement(code);
        toastNew({langPackKey: 'TextCopied'});
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

    if(!IS_SAFARI) {
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

      if(middleware && middleware()) {
        this.lazyLoadQueue.unlock();
        this.lazyLoadQueue.refresh();

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

    if(this.chat.type !== 'pinned' && this.chat.type !== 'scheduled') {
      if(!IS_MOBILE) {
        this.listenerSetter.add(container)('dblclick', async(e) => {
          if(this.chat.selection.isSelecting || 
            !(await this.chat.canSend())) {
            return;
          }
          
          const target = e.target as HTMLElement;
          const bubble = target.classList.contains('bubble') ? 
            target : 
            (target.classList.contains('document-selection') ? target.parentElement : null);
          if(bubble && !bubble.classList.contains('bubble-first')) {
            const mid = +bubble.dataset.mid;
            const message = await this.chat.getMessage(mid);
            if(message.pFlags.is_outgoing) {
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
        handleHorizontalSwipe({
          element: container,
          verifyTouchTarget: async(e) => {
            if(this.chat.selection.isSelecting || !(await this.chat.canSend())) {
              return false;
            }
  
            // cancelEvent(e);
            target = findUpClassName(e.target, 'bubble');
            if(target) {
              SetTransition(target, className, true, 250);
              void target.offsetLeft; // reflow
  
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
          onSwipe: (xDiff, yDiff) => {
            shouldReply = xDiff >= replyAfter;
  
            if(shouldReply && !icon.classList.contains('is-visible')) {
              icon.classList.add('is-visible');
            }
            icon.style.opacity = '' + Math.min(1, xDiff / replyAfter);
  
            const x = -Math.max(0, Math.min(MAX, xDiff));
            target.style.transform = `translateX(${x}px)`;
            cancelContextMenuOpening();
          },
          onReset: () => {
            const _target = target;
            SetTransition(_target, className, false, 250, () => {
              if(icon.parentElement === _target) {
                icon.classList.remove('is-visible');
                icon.remove();
              }
            });
  
            fastRaf(() => {
              _target.style.transform = ``;
  
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
  }

  public constructPeerHelpers() {
    // will call when message is sent (only 1)
    this.listenerSetter.add(rootScope)('history_append', async({storageKey, message}) => {
      if(storageKey !== this.chat.messagesStorageKey) return;

      if(!this.scrollable.loadedAll.bottom) {
        this.chat.setMessageId();
      } else {
        this.renderNewMessage(message, true);
      }

      if(rootScope.settings.animationsEnabled) {
        const gradientRenderer = this.chat.gradientRenderer;
        if(gradientRenderer) {
          gradientRenderer.toNextPosition();
        }
      }
    });

    this.listenerSetter.add(rootScope)('history_multiappend', (message) => {
      if(this.peerId !== message.peerId) return;
      this.renderNewMessage(message);
    });
    
    this.listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
      if(peerId === this.peerId) {
        this.deleteMessagesByIds(Array.from(msgs));
      }
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
      if(dialogs[this.peerId]) {
        this.chat.input.setUnreadCount();
      }
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        this.chat.input.setUnreadCount();
      }
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      if(this.peerId === chatId.toPeerId(true)) {
        const hadRights = this.chatInner.classList.contains('has-rights');
        const hasRights = await this.chat.canSend();

        if(hadRights !== hasRights) {
          const callbacks = await Promise.all([
            this.finishPeerChange(),
            this.chat.input.finishPeerChange(),
          ]);

          callbacks.forEach((callback) => callback());
        }
      }
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

        awaited.forEach(({bubble, message}) => {
          if(this.bubbles[message.mid] !== bubble) {
            return;
          }
          
          this.safeRenderMessage(message, true, bubble);
        });
      }
    });

    !DO_NOT_UPDATE_MESSAGE_VIEWS && this.listenerSetter.add(rootScope)('messages_views', (arr) => {
      fastRaf(() => {
        let scrollSaver: ScrollSaver;
        for(const {peerId, views, mid} of arr) {
          if(this.peerId !== peerId) continue;

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

        if(scrollSaver) {
          scrollSaver.restore();
        }
      });
    });

    this.observer = new SuperIntersectionObserver({root: this.scrollable.container});

    this.listenerSetter.add(this.chat.appImManager)('chat_changing', ({to}) => {
      const freeze = to !== this.chat;

      const cb = () => {
        this.observer.toggleObservingNew(freeze);
      };

      if(!freeze) {
        setTimeout(() => {
          cb();
        }, 400);
      } else {
        cb();
      }
    });

    this.sendViewCountersDebounced = debounce(() => {
      const mids = [...this.viewsMids];
      this.viewsMids.clear();

      this.managers.appMessagesManager.incrementMessageViews(this.peerId, mids);
    }, 1000, false, true);
  }

  private get peerId() {
    return this.chat.peerId;
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
        if(sponsoredMessage && sponsoredMessage.random_id) {
          delete sponsoredMessage.random_id;
          this.managers.appChatsManager.viewSponsoredMessage(this.peerId.toChatId(), sponsoredMessage.random_id);
        }
      }
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
        //this.log('resize after RAF', part);
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
          //if(isSafari) { // * fix opening keyboard while ESG is active 
            part = -realDiff;
          //}

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
    if(content && !this.chat.selection.isSelecting) {
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

        let message = (await this.chat.getMessage(+bubble.dataset.mid)) as Message.message;
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
            group: CHAT_ANIMATION_GROUP,
            withThumb: false,
            needFadeIn: false
          }).then(({render}) => render).then((player) => {
            assumeType<RLottiePlayer>(player);
            if(!middleware()) {
              return;
            }

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

              this.managers.appReactionsManager.sendReaction(message, availableReaction.reaction);
              this.unhoverPrevious();
            }, {listenerSetter: this.listenerSetter});
          });
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
    SetTransition(hoverReaction, 'is-visible', visible, 200, visible ? undefined : () => {
      hoverReaction.remove();
    }, 2);
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

  public constructPinnedHelpers() {
    this.listenerSetter.add(rootScope)('peer_pinned_messages', (e) => {
      const {peerId, mids, pinned} = e;
      if(peerId !== this.peerId) return;

      if(mids) {
        if(!pinned) {
          this.deleteMessagesByIds(mids);
        }
      }
    });
  }

  public constructScheduledHelpers() {
    const onUpdate = async() => {
      this.chat.topbar.setTitle((await this.managers.appMessagesManager.getScheduledMessagesStorage(this.peerId)).size);
    };

    this.listenerSetter.add(rootScope)('scheduled_new', (message) => {
      if(message.peerId !== this.peerId) return;

      this.renderNewMessage(message);
      onUpdate();
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', ({peerId, mids}) => {
      if(peerId !== this.peerId) return;

      this.deleteMessagesByIds(mids);
      onUpdate();
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

    if(bubble.classList.contains('is-date') && findUpClassName(target, 'bubble-content')) {
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
      //console.log('bubble click', e);

      if(IS_TOUCH_SUPPORTED && this.chat.selection.selectedText) {
        this.chat.selection.selectedText = undefined;
        return;
      }

      //this.chatSelection.toggleByBubble(bubble);
      this.chat.selection.toggleByElement(findUpClassName(target, 'grouped-item') || bubble);
      return;
    }

    const contactDiv: HTMLElement = findUpClassName(target, 'contact');
    if(contactDiv) {
      this.chat.appImManager.setInnerPeer({
        peerId: contactDiv.dataset.peerId.toPeerId()
      });
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

      new PopupPayment(message as Message.message);
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

    const commentsDiv: HTMLElement = findUpClassName(target, 'replies');
    if(commentsDiv) {
      const bubbleMid = +bubble.dataset.mid;
      if(this.peerId === REPLIES_PEER_ID) {
        const message = await this.chat.getMessage(bubbleMid) as Message.message;
        const peerId = getPeerId(message.reply_to.reply_to_peer_id);
        const threadId = message.reply_to.reply_to_top_id;
        const lastMsgId = message.fwd_from.saved_from_msg_id;
        this.chat.appImManager.openThread(peerId, lastMsgId, threadId);
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
        const message = el.innerText + ' ';
        this.managers.appDraftsManager.setDraft(this.peerId, this.chat.threadId, message);
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
              new PopupPayment(message as Message.message, this.peerId, +bubble.dataset.mid);
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

    //this.log('chatInner click:', target);
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
        new PopupStickers(doc.stickerSetInput).show();
      }

      return;
    }

    const documentDiv = findUpClassName(target, 'document-with-thumb');
    if((target.tagName === 'IMG' && !target.classList.contains('emoji') && !target.classList.contains('document-thumb')) 
      || target.classList.contains('album-item')
      // || isVideoComponentElement
      || (target.tagName === 'VIDEO' && !bubble.classList.contains('round'))
      || (documentDiv && !documentDiv.querySelector('.preloader-container'))
      || target.classList.contains('canvas-thumbnail')) {
      const groupedItem = findUpClassName(target, 'album-item') || findUpClassName(target, 'document-container');
      const preloader = (groupedItem || bubble).querySelector<HTMLElement>('.preloader-container');
      if(preloader) {
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
        //if(!this.scrollable.visibleElements.find((e) => e.element === this.bubbles[id])) return false;

        const message = await this.chat.getMessage(mid);
        const media = getMediaFromMessage(message);
        
        return media && f(media) && mid;
      }))).filter(Boolean).sort((a, b) => a - b);

      ids.forEach((id) => {
        let selector: string;
        if(documentDiv) {
          selector = '.document-container';
        } else {
          const withTail = this.bubbles[id].classList.contains('with-media-tail');
          selector = '.album-item video, .album-item img, .preview video, .preview img, ';
          if(withTail) {
            selector += '.bubble__media-container';
          } else {
            selector += '.attachment video, .attachment img';
          }
        }

        const elements = Array.from(this.bubbles[id].querySelectorAll(selector)) as HTMLElement[];
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
          const hasAspecter = !!this.bubbles[id].querySelector('.media-container-aspecter');
          elements.forEach((element) => {
            if(hasAspecter && !findUpClassName(element, 'media-container-aspecter')) return;
            let albumItem = findUpClassName(element, 'album-item');
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

      let idx = targets.findIndex((t) => t.mid === messageId);

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
      .openMedia(message, targets[idx].element, 0, true, targets.slice(0, idx), targets.slice(idx + 1));
      
      //appMediaViewer.openMedia(message, target as HTMLImageElement);
      return;
    }
    
    if(['IMG', 'DIV', 'SPAN'/* , 'A' */].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');
    
    if(['DIV', 'SPAN'].indexOf(target.tagName) !== -1/*  || target.tagName === 'A' */) {
      if(target.classList.contains('goto-original')) {
        const savedFrom = bubble.dataset.savedFrom;
        const [peerId, mid] = savedFrom.split('_');
        ////this.log('savedFrom', peerId, msgID);
        this.chat.appImManager.setInnerPeer({
          peerId: peerId.toPeerId(), 
          lastMsgId: +mid
        });
        return;
      } else if(target.classList.contains('forward')) {
        const mid = +bubble.dataset.mid;
        const message = await this.managers.appMessagesManager.getMessageByPeer(this.peerId, mid);
        new PopupForward({
          [this.peerId]: await this.managers.appMessagesManager.getMidsByMessage(message)
        });
        //appSidebarRight.forwardTab.open([mid]);
        return;
      }
      
      let isReplyClick = false;
      
      try {
        isReplyClick = !!findUpClassName(e.target, 'reply');
      } catch(err) {}
      
      if(isReplyClick && bubble.classList.contains('is-reply')/*  || bubble.classList.contains('forwarded') */) {
        const bubbleMid = +bubble.dataset.mid;
        this.replyFollowHistory.push(bubbleMid);

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
        //this.chat.setMessageId(, originalMessageId);
      }
    }
    
    //console.log('chatInner click', e);
  };

  public async onGoDownClick() {
    if(!this.replyFollowHistory.length) {
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
    const slice = this.replyFollowHistory.slice();
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
        this.replyFollowHistory.splice(this.replyFollowHistory.indexOf(mid), 1);
      }
    });

    this.replyFollowHistory.sort((a, b) => b - a);

    const mid = this.replyFollowHistory.pop();
    this.chat.setMessageId(mid);
  }

  public getBubbleByPoint(verticalSide: 'top' | 'bottom') {
    let element = getElementByPoint(this.scrollable.container, verticalSide, 'center');
    /* if(element) {
      if(element.classList.contains('bubbles-date-group')) {
        const children = Array.from(element.children) as HTMLElement[];
        if(verticalSide === 'top') {
          element = children[this.stickyIntersector ? 2 : 1];
        } else {
          element = children[children.length - 1];
        }
      } else {
        element = findUpClassName(element, 'bubble');
        if(element && element.classList.contains('is-date')) {
          element = element.nextElementSibling as HTMLElement;
        }
      }
    } */
    if(element) element = findUpClassName(element, 'bubble');

    return element;
  }

  public async getGroupedBubble(groupId: string) {
    const mids = await this.managers.appMessagesManager.getMidsByAlbum(groupId);
    for(const mid of mids) {
      if(this.bubbles[mid] && !this.skippedMids.has(mid)) {
        // const maxId = Math.max(...mids); // * because in scheduled album can be rendered by lowest mid during sending
        return {
          bubble: this.bubbles[mid], 
          mid: mid,
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
    if(!bubble) return;

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
    //this.log('loadMoreHistory', top);
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
    if(!history.length) return;
    
    if(top) {
      if(DEBUG) {
        this.log('Will load more (up) history by id:', history[0], 'maxId:', history[history.length - 1], justLoad/* , history */);
      }

      this.getHistory1(history[0], true, undefined, undefined, justLoad);
    } else {
      //let dialog = this.appMessagesManager.getDialogByPeerId(this.peerId)[0];
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

  public onScroll = (ignoreHeavyAnimation?: boolean, scrollDimensions?: ScrollStartCallbackDimensions) => {
    // return;

    if(this.isHeavyAnimationInProgress) {
      if(this.sliceViewportDebounced) {
        this.sliceViewportDebounced.clearTimeout();
      }

      // * В таком случае, кнопка не будет моргать если чат в самом низу, и правильно отработает случай написания нового сообщения и проскролла вниз
      if(this.scrolledDown && !ignoreHeavyAnimation) {
        return;
      }
    } else {
      if(this.chat.topbar.pinnedMessage) {
        this.chat.topbar.pinnedMessage.setCorrectIndexThrottled(this.scrollable.lastScrollDirection);
      }
  
      if(this.sliceViewportDebounced) {
        this.sliceViewportDebounced();
      }
  
      this.setStickyDateManually();
    }
    
    //lottieLoader.checkAnimations(false, 'chat');

    if(scrollDimensions && scrollDimensions.distanceToEnd < SCROLLED_DOWN_THRESHOLD && this.scrolledDown) {
      return;
    }

    const distanceToEnd = scrollDimensions?.distanceToEnd ?? this.scrollable.getDistanceToEnd();
    if(/* !IS_TOUCH_SUPPORTED &&  */(this.scrollable.lastScrollDirection !== 0 && distanceToEnd > 0) || scrollDimensions) {
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
    
    if(distanceToEnd < SCROLLED_DOWN_THRESHOLD && (this.scrollable.loadedAll.bottom || this.chat.setPeerPromise || !this.peerId)) {
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
    //this.scrollable.attachSentinels(undefined, 300);

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
    
    ///////this.log('updateUnreadByDialog', maxId, dialog, this.unreadOut);
    
    for(const msgId of this.unreadOut) {
      if(msgId > 0 && msgId <= maxId) {
        const bubble = this.bubbles[msgId];
        if(bubble) {
          this.unreadOut.delete(msgId);

          if(bubble.classList.contains('is-outgoing')) {
            continue;
          }
          
          bubble.classList.remove('is-sent', 'is-sending', 'is-outgoing'); // is-sending can be when there are bulk of updates (e.g. sending command to Stickers bot)
          bubble.classList.add('is-read');
        }
      }
    }
  }
  
  public deleteMessagesByIds(mids: number[], permanent = true, ignoreOnScroll?: boolean) {
    let deleted = false;
    mids.forEach((mid) => {
      const bubble = this.bubbles[mid];
      if(!bubble) return;
      
      deleted = true;
      /* const mounted = this.getMountedBubble(mid);
      if(!mounted) return; */

      delete this.bubbles[mid];
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
      }

      if(this.emptyPlaceholderBubble === bubble) {
        this.emptyPlaceholderBubble = undefined;
      }

      // this.reactions.delete(mid);
    });

    if(!deleted) {
      return;
    }

    this.scrollable.ignoreNextScrollEvent();
    if(permanent && this.chat.selection.isSelecting) {
      this.chat.selection.deleteSelectedMids(this.peerId, mids);
    }
    
    animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP);
    this.deleteEmptyDateGroups();

    if(!ignoreOnScroll) {
      this.scrollable.onScroll();
      // this.onScroll();
    }
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
      //this.log('renderNewMessagesByIds: seems search is active, skipping render:', mids);
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

    if(this.chat.threadId) {
      const replyTo = message?.reply_to as MessageReplyHeader;
      if(!(replyTo && (replyTo.reply_to_top_id || replyTo.reply_to_msg_id) === this.chat.threadId)) {
        return;
      }
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
        //this.log('renderNewMessagesByIDs: messagesQueuePromise after', this.scrollable.isScrolledDown);
        //this.scrollable.scrollTo(this.scrollable.scrollHeight, 'top', true, true, 5000);
        //const bubble = this.bubbles[Math.max(...mids)];

        let bubble: HTMLElement;
        if(this.chat.type === 'scheduled') {
          bubble = this.bubbles[message.mid];
        }

        const promise = bubble ? this.scrollToBubbleEnd(bubble) : this.scrollToEnd();
        if(isPaddingNeeded) {
          // it will be called only once even if was set multiple times (that won't happen)
          promise.then(unsetPadding);
        }

        //this.scrollable.scrollIntoViewNew(this.chatInner, 'end');

        /* setTimeout(() => {
          this.log('messagesQueuePromise afterafter:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        }, 10); */
      });
    }

    return promise;
  }

  public getLastBubble() {
    const group = this.bubbleGroups.getLastGroup();
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
      if(item.group.firstItem === item && whichChild(item.group.container) === (this.stickyIntersector ? STICKY_OFFSET : 1)) {
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

    let margin = 4; // * 4 = .25rem
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
    date.setHours(0, 0, 0);
    return {date, dateTimestamp: date.getTime()};
  }

  public getDateContainerByTimestamp(timestamp: number) {
    const {date, dateTimestamp} = this.getDateForDateContainer(timestamp);
    if(!this.dateMessages[dateTimestamp]) {
      const bubble = this.createDateBubble(timestamp, date);
      // bubble.classList.add('is-sticky');
      const fakeBubble = this.createDateBubble(timestamp, date);
      fakeBubble.classList.add('is-fake');

      const container = document.createElement('section');
      container.className = 'bubbles-date-group';
      container.append(bubble, fakeBubble);

      this.dateMessages[dateTimestamp] = {
        div: bubble,
        container,
        firstTimestamp: date.getTime()
      };

      const haveTimestamps = getObjectKeysAndSort(this.dateMessages, 'asc');
      let i = 0, length = haveTimestamps.length, insertBefore: HTMLElement; // there can be 'first bubble' (e.g. bot description) so can't insert by index
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

      if(this.stickyIntersector) {
        this.stickyIntersector.observeStickyHeaderChanges(container);
      }

      if(this.chatInner.parentElement) {
        this.container.classList.add('has-groups');
      }
    }

    return this.dateMessages[dateTimestamp];
  }

  private destroyScrollable() {
    this.scrollable.destroy();
  }

  public destroy() {
    //this.chat.log.error('Bubbles destroying');

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
    this.bubbles = {}; // clean it before so sponsored message won't be deleted faster on peer changing
    ////console.time('appImManager cleanup');
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
    
    this.messagesQueue.length = 0;
    this.messagesQueuePromise = null;
    
    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;
    this.fetchNewPromise = undefined;
    this.getSponsoredMessagePromise = undefined;
    
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

    this.middleware.clean();
    
    this.onAnimateLadder = undefined;
    this.resolveLadderAnimation = undefined;
    this.attachPlaceholderOnRender = undefined;
    this.emptyPlaceholderBubble = undefined;
    this.sponsoredMessage = undefined;
    this.previousStickyDate = undefined;

    this.scrollingToBubble = undefined;
    ////console.timeEnd('appImManager cleanup');

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
      bubble.remove();

      if(this.emptyPlaceholderBubble === bubble) {
        this.emptyPlaceholderBubble = undefined;
      }
    }
  }

  public async setPeer(samePeer: boolean, peerId: PeerId, lastMsgId?: number, startParam?: string): Promise<{cached?: boolean, promise: Chat['setPeerPromise']}> {
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
      await m(this.chat.onChangePeer(m));
    }

    /* if(samePeer && this.chat.setPeerPromise) {
      return {cached: true, promise: this.chat.setPeerPromise};
    } */

    const chatType = this.chat.type;

    if(chatType === 'scheduled' || this.chat.isRestricted) {
      lastMsgId = 0;
    }

    const historyStorage = await m(this.chat.getHistoryStorage());
    let topMessage = chatType === 'pinned' ? await m(this.managers.appMessagesManager.getPinnedMessagesMaxId(peerId)) : historyStorage.maxId ?? 0;
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
        const dialog = await m(this.managers.appMessagesManager.getDialogOnly(peerId));
        if(/* dialog.unread_count */readMaxId && !samePeer && (!dialog || dialog.unread_count !== 1)) {
          const foundSlice = historyStorage.history.findSliceOffset(readMaxId);
          if(foundSlice && foundSlice.slice.isEnd(SliceEnd.Bottom)) {
            overrideAdditionMsgId = foundSlice.slice[foundSlice.offset - 25] || foundSlice.slice[0] || readMaxId;
          }

          followingUnread = !isTarget;
          lastMsgId = readMaxId;
        } else {
          lastMsgId = topMessage;
          //lastMsgID = topMessage;
        }
      }
    }

    const isJump = lastMsgId !== topMessage/*  && overrideAdditionMsgId === undefined */;

    if(startParam === undefined && await m(this.chat.isStartButtonNeeded())) {
      startParam = BOT_START_PARAM;
    }

    if(samePeer) {
      const mounted = await m(this.getMountedBubble(lastMsgId));
      if(mounted) {
        if(isTarget) {
          this.scrollToBubble(mounted.bubble, 'center');
          this.highlightBubble(mounted.bubble);
          this.chat.dispatchEvent('setPeer', lastMsgId, false);
        } else if(topMessage && !isJump) {
          //log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          // scrollable.setScrollTopSilently(scrollable.scrollHeight);
          this.scrollToEnd();
          this.chat.dispatchEvent('setPeer', lastMsgId, true);
        }

        if(startParam !== undefined) {
          this.chat.input.setStartParam(startParam);
        }
        
        return null;
      }
    } else {
      if(this.peerId) { // * set new queue id if new peer (setting not from 0)
        this.lazyLoadQueue.queueId = ++queueId;
        this.managers.apiFileManager.setQueueId(this.chat.bubbles.lazyLoadQueue.queueId);
      }

      this.replyFollowHistory.length = 0;

      this.passEntities = {
        messageEntityBotCommand: await m(this.managers.appPeersManager.isAnyGroup(peerId)) || await m(this.managers.appUsersManager.isBot(peerId))
      };
    }

    if(DEBUG) {
      log('setPeer peerId:', peerId, historyStorage, lastMsgId, topMessage);
    }

    // add last message, bc in getHistory will load < max_id
    const additionMsgId = overrideAdditionMsgId ?? (isJump || chatType === 'scheduled' || this.chat.isRestricted ? 0 : topMessage);

    let maxBubbleId = 0;
    if(samePeer) {
      let el = this.getBubbleByPoint('bottom'); // ! this may not work if being called when chat is hidden
      //this.chat.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el);
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
      topMessage
    };

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

    if(!cached && !samePeer) {
      await m(this.chat.finishPeerChange(isTarget, isJump, lastMsgId, startParam));
      this.scrollable.container.textContent = '';
      // oldContainer.textContent = '';
      //oldChatInner.remove();
      this.preloader.attach(this.container);
    }

    /* this.ladderDeferred && this.ladderDeferred.resolve();
    this.ladderDeferred = deferredPromise<void>(); */

    animationIntersector.lockGroup(CHAT_ANIMATION_GROUP);
    const setPeerPromise = m(promise).then(async() => {
      log.warn('promise fulfilled');

      let mountedByLastMsgId = haveToScrollToBubble ? await m(lastMsgId ? this.getMountedBubble(lastMsgId) : {bubble: this.getLastBubble()}) : undefined;
      if(cached && !samePeer) {
        log.warn('finishing peer change');
        await m(this.chat.finishPeerChange(isTarget, isJump, lastMsgId, startParam)); // * костыль
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

      if(this.attachPlaceholderOnRender) {
        this.attachPlaceholderOnRender();
      }

      if(!isTarget && this.chat.type === 'chat' && this.chat.topbar.pinnedMessage) {
        this.chat.topbar.pinnedMessage.setCorrectIndex(0);
      }

      this.container.classList.toggle('has-groups', !!Object.keys(this.dateMessages).length);

      log.warn('mounted chat', this.chatInner === chatInner, this.chatInner.parentElement, performance.now() - perf);

      animationIntersector.unlockGroup(CHAT_ANIMATION_GROUP);
      animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP/* , true */);

      //fastRaf(() => {
        this.lazyLoadQueue.unlock();
      //});

      //if(dialog && lastMsgID && lastMsgID !== topMessage && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
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

      const afterSetPromise = Promise.all([setPeerPromise, getHeavyAnimationPromise()]);
      afterSetPromise.then(() => { // check whether list isn't full
        scrollable.checkForTriggers();

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
        }),
      ]).then(() => {
        log('scrolledAllDown:', scrollable.loadedAll.bottom);
        //if(!this.unreaded.length && dialog) { // lol
        if(scrollable.loadedAll.bottom && topMessage && !this.unreaded.size) { // lol
          this.onScrolledAllDown();
        }
      });

      if(chatType === 'chat') {
        const dialog = await m(this.managers.appMessagesManager.getDialogOnly(peerId));
        if(dialog?.pFlags.unread_mark) {
          this.managers.appMessagesManager.markDialogUnread(peerId, true);
        }
      }

      //this.chatInner.classList.remove('disable-hover', 'is-scrolling'); // warning, performance!
    }).catch((err) => {
      log.error('getHistory promise error:', err);
      if(!middleware()) {
        this.preloader.detach();
      }

      throw err;
    });

    return {cached, promise: setPeerPromise};
  }

  private async setFetchReactionsInterval(afterSetPromise: Promise<any>) {
    const middleware = this.getMiddleware();
    const needReactionsInterval = await this.managers.appPeersManager.isChannel(this.peerId);
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
    const middleware = this.getMiddleware();
    const peerId = this.peerId;

    const needFetchInterval = await this.managers.appMessagesManager.isFetchIntervalNeeded(peerId);
    const needFetchNew = savedPosition || needFetchInterval;
    if(!needFetchNew) {
      return;
    }

    await afterSetPromise;
    if(!middleware()) {
      return;
    }

    this.setLoaded('bottom', false);
    this.scrollable.checkForTriggers();

    if(!needFetchInterval) {
      return;
    }

    const f = () => {
      this.fetchNewPromise = new Promise<void>(async(resolve) => {
        if(!middleware() || !(await this.managers.appMessagesManager.isFetchIntervalNeeded(peerId))) {
          resolve();
          return;
        }

        this.managers.appMessagesManager.getNewHistory(peerId, this.chat.threadId).then((result) => {
          if(!middleware() || !result) {
            resolve();
            return;
          }

          const {isBottomEnd} = result;
          if(this.scrollable.loadedAll.bottom && this.scrollable.loadedAll.bottom !== isBottomEnd) {
            this.setLoaded('bottom', isBottomEnd);
            this.onScroll();
          }

          setTimeout(f, 30e3);
          resolve();
        });
      }).finally(() => {
        this.fetchNewPromise = undefined;
      });
    };
    
    if(samePeer) {
      setTimeout(f, 30e3);
    } else {
      f();
    }
  }

  public async onScrolledAllDown() {
    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      const historyMaxId = await this.chat.getHistoryMaxId();
      this.managers.appMessagesManager.readHistory(this.peerId, historyMaxId, this.chat.threadId, true);
    }
  }

  public async finishPeerChange() {
    const [isChannel, canWrite, isAnyGroup] = await Promise.all([
      this.managers.appPeersManager.isChannel(this.peerId),
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

  public renderMessagesQueue(options: ChatBubbles['messagesQueue'][0]) {
    this.messagesQueue.push(options);
    return this.setMessagesQueuePromise();    
  }

  public setMessagesQueuePromise() {
    if(!this.messagesQueue.length) return Promise.resolve();

    if(this.messagesQueuePromise) {
      return this.messagesQueuePromise;
    }
    
    const middleware = this.getMiddleware();
    const log = this.log.bindPrefix('queue');
    const possibleError = PEER_CHANGED_ERROR;
    const m = middlewarePromise(middleware, possibleError);

    const processQueue = async(): Promise<void> => {
      log('start');

      // if(!this.chat.setPeerPromise) {
      //   await pause(10000000);
      // }

      const renderQueue = this.messagesQueue.slice();
      this.messagesQueue.length = 0;

      const renderQueuePromises = renderQueue.map((promise) => {
        const perf = performance.now();
        promise.then((details) => {
          log('render message time', performance.now() - perf, details);
        });

        return promise;
      });

      let loadQueue = await m(Promise.all(renderQueuePromises));
      const filterQueue = (queue: typeof loadQueue) => {
        return queue.filter((details) => {
          // message can be deleted during rendering
          return details && this.bubbles[details.bubble.dataset.mid] === details.bubble;
        });
      };

      loadQueue = filterQueue(loadQueue);

      log('messages rendered');

      const reverse = loadQueue[0]?.reverse;

      const {groups, avatarPromises} = this.groupBubbles(loadQueue.filter((details) => details.updatePosition));

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
      await m(Promise.all([...promises, this.setUnreadDelimiter()])); // не нашёл места лучше
      await m(fastRafPromise()); // have to be the last
      log('media promises end');

      loadQueue = filterQueue(loadQueue);

      const {restoreScroll, scrollSaver} = this.prepareToSaveScroll(reverse);
      // if(this.messagesQueueOnRender) {
        // this.messagesQueueOnRender();
      // }

      if(this.messagesQueueOnRenderAdditional) {
        this.messagesQueueOnRenderAdditional();
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
        item.mounted = false;
        if(!groups.includes(item.group)) {
          groups.push(item.group);
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

      if(this.updatePlaceholderPosition) {
        this.updatePlaceholderPosition();
      }

      if(restoreScroll) {
        restoreScroll();
      }

      // this.setStickyDateManually();
      
      if(this.messagesQueue.length) {
        log('have new messages to render');
        return processQueue();
      } else {
        log('end');
      }
    };

    log('setting pause');
    const promise = this.messagesQueuePromise = m(pause(0)).then(processQueue).finally(() => {
      if(this.messagesQueuePromise === promise) {
        this.messagesQueuePromise = null;
      }
    });

    return promise;
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
    return this.middleware.get(additionalCallback);
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

    const middleware = this.getMiddleware();

    let result: Awaited<ReturnType<ChatBubbles['renderMessage']>> & {updatePosition: typeof updatePosition};
    try {
      this.renderingMessages.add(message.mid);

      // const groupedId = (message as Message.message).grouped_id;
      const newBubble = document.createElement('div');
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
        this.skippedMids.delete(message.mid);

        this.bubblesToEject.add(bubble);
        this.bubblesToReplace.delete(bubble);
        this.bubblesToReplace.set(newBubble, bubble);
        this.bubbleGroups.changeBubbleByBubble(bubble, newBubble);
      }

      bubble = this.bubbles[message.mid] = newBubble;
      let originalPromise = this.renderMessage(message, reverse, bubble);
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
  
  // reverse means top
  private async renderMessage(
    message: Message.message | Message.messageService, 
    reverse = false, 
    bubble: HTMLElement
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
    messageDiv.classList.add('message');
    
    let bubbleContainer: HTMLDivElement;
    let contentWrapper: HTMLElement;
    
    contentWrapper = document.createElement('div');
    contentWrapper.classList.add('bubble-content-wrapper');
    
    bubbleContainer = document.createElement('div');
    bubbleContainer.classList.add('bubble-content');
    
    bubble.classList.add('bubble');
    contentWrapper.append(bubbleContainer);
    bubble.append(contentWrapper);

    if(!our && !message.pFlags.out && this.observer) {
      //this.log('not our message', message, message.pFlags.unread);
      const isUnread = message.pFlags.unread || 
        isMentionUnread(message)/*  || 
        (this.historyStorage.readMaxId !== undefined && this.historyStorage.readMaxId < message.mid) */;
      if(isUnread) {
        this.observer.observe(bubble, this.unreadedObserverCallback);
        this.unreaded.set(bubble, message.mid);
      }
    }

    const loadPromises: Promise<any>[] = [];
    const ret = {
      bubble,
      promises: loadPromises,
      message,
      reverse
    };

    if(message._ === 'messageService' && (!message.action || !SERVICE_AS_REGULAR.has(message.action._))) {
      const action = message.action;
      if(action) {
        const _ = action._;
        if(IGNORE_ACTIONS.has(_) || (langPack.hasOwnProperty(_) && !langPack[_])) {
          return;
        }
      }

      bubble.className = 'bubble service';

      bubbleContainer.innerHTML = '';
      const s = document.createElement('div');
      s.classList.add('service-msg');
      if(action) {
        let promise: Promise<any>;
        if(action._ === 'messageActionChannelMigrateFrom') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.chat_id.toPeerId(true)});
          s.append(i18n('ChatMigration.From', [peerTitle.element]));
        } else if(action._ === 'messageActionChatMigrateTo') {
          const peerTitle = new PeerTitle();
          promise = peerTitle.update({peerId: action.channel_id.toPeerId(true)});
          s.append(i18n('ChatMigration.To', [peerTitle.element]));
        } else {
          s.append(await wrapMessageActionTextNew(message));
        }
      }
      bubbleContainer.append(s);

      if(message.pFlags.is_single) { // * Ignore 'Discussion started'
        bubble.classList.add('is-group-last');
      }

      return ret;
    }

    let messageMedia: MessageMedia = isMessage && message.media;

    let messageMessage: string, totalEntities: MessageEntity[];
    if(isMessage) {
      if((messageMedia as MessageMedia.messageMediaDocument)?.document && 
        !['video', 'gif'].includes(((messageMedia as MessageMedia.messageMediaDocument).document as MyDocument).type)) {
        // * just filter these cases for documents caption
      } else if(groupedId && albumMustBeRenderedFull) {
        const t = getAlbumText(albumMessages);
        messageMessage = t.message;
        //totalEntities = t.entities;
        totalEntities = t.totalEntities;
      } else if(((messageMedia as MessageMedia.messageMediaDocument)?.document as MyDocument)?.type !== 'sticker') {
        messageMessage = message.message;
        //totalEntities = message.entities;
        totalEntities = message.totalEntities;
      }
    } else {
      if(message.action._ === 'messageActionPhoneCall') {
        messageMedia = {
          _: 'messageMediaCall',
          action: message.action
        };
      }
    }
    
    /* let richText = wrapRichText(messageMessage, {
      entities: totalEntities
    }); */
    let richText = wrapRichText(messageMessage, {
      entities: totalEntities,
      passEntities: this.passEntities
    });

    let canHaveTail = true;
    let isStandaloneMedia = false;
    let needToSetHTML = true;
    if(totalEntities && !messageMedia) {
      let emojiEntities = totalEntities.filter((e) => e._ === 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc, curr) => acc + curr.length, 0);
      
      if(emojiStrLength === strLength && emojiEntities.length <= 3 && totalEntities.length === emojiEntities.length) {
        if(rootScope.settings.emoji.big) {
          let sticker = await this.managers.appStickersManager.getAnimatedEmojiSticker(messageMessage);
          if(emojiEntities.length === 1 && !messageMedia && sticker) {
            messageMedia = {
              _: 'messageMediaDocument',
              document: sticker
            };
          } else {
            let attachmentDiv = document.createElement('div');
            attachmentDiv.classList.add('attachment');
            
            setInnerHTML(attachmentDiv, richText);
            
            bubble.classList.add('emoji-' + emojiEntities.length + 'x');
            
            bubbleContainer.append(attachmentDiv);
          }

          bubble.classList.add('is-message-empty', 'emoji-big');
          isStandaloneMedia = true;
          canHaveTail = false;
          needToSetHTML = false;
        }
        
        bubble.classList.add('can-have-big-emoji');
      }
      
      /* if(strLength === emojiStrLength) {
        messageDiv.classList.add('emoji-only');
        messageDiv.classList.add('message-empty');
      } */
    }

    if(needToSetHTML) {
      setInnerHTML(messageDiv, richText);
    }

    const timeSpan = MessageRender.setTime({
      chatType: this.chat.type, 
      message,
      reactionsMessage
    });
    messageDiv.append(timeSpan);
    bubbleContainer.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad

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
    if(replyMarkup && replyMarkup._ === 'replyInlineMarkup' && replyMarkup.rows && replyMarkup.rows.length) {
      const rows = replyMarkup.rows;

      const containerDiv = document.createElement('div');
      containerDiv.classList.add('reply-markup');
      rows.forEach((row) => {
        const buttons = row.buttons;
        if(!buttons || !buttons.length) return;

        const rowDiv = document.createElement('div');
        rowDiv.classList.add('reply-markup-row');

        buttons.forEach((button) => {
          let text: DocumentFragment | HTMLElement | string = wrapRichText(button.text, {noLinks: true, noLinebreaks: true});

          let buttonEl: HTMLButtonElement | HTMLAnchorElement;
          
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
              attachClickEvent(buttonEl, (e) => {
                cancelEvent(e);

                const botId = message.viaBotId || message.fromId;
                let promise: Promise<PeerId>;
                if(button.pFlags.same_peer) promise = Promise.resolve(this.peerId);
                else promise = this.managers.appInlineBotsManager.checkSwitchReturn(botId).then((peerId) => {
                  if(peerId) {
                    return peerId;
                  }
                  
                  return new Promise<PeerId>((resolve, reject) => {
                    const popup = new PopupForward({
                      [this.peerId]: []
                    }, (peerId) => {
                      resolve(peerId);
                    }, true);

                    popup.addEventListener('close', () => {
                      reject();
                    });
                  });
                });
                
                promise.then((peerId) => {
                  const threadId = this.peerId === peerId ? this.chat.threadId : undefined;
                  this.chat.appImManager.setInnerPeer({peerId});
                  this.managers.appInlineBotsManager.switchInlineQuery(peerId, threadId, botId, button.query);
                });
              });
              break;
            }

            case 'keyboardButtonBuy': {
              buttonEl = document.createElement('button');
              buttonEl.classList.add('is-buy');

              if(messageMedia?._ === 'messageMediaInvoice') {
                if(messageMedia.receipt_msg_id) {
                  text = i18n('Message.ReplyActionButtonShowReceipt');
                }
              }

              break;
            }

            default: {
              buttonEl = document.createElement('button');
              break;
            }
          }
          
          buttonEl.classList.add('reply-markup-button', 'rp', 'tgico');
          if(typeof(text) === 'string') {
            buttonEl.insertAdjacentHTML('beforeend', text);
          } else {
            buttonEl.append(text);
          }

          ripple(buttonEl);

          rowDiv.append(buttonEl);
        });

        containerDiv.append(rowDiv);
      });

      attachClickEvent(containerDiv, (e) => {
        let target = e.target as HTMLElement;
        
        if(!target.classList.contains('reply-markup-button')) target = findUpClassName(target, 'reply-markup-button');
        if(
          !target 
          || target.classList.contains('is-link') 
          || target.classList.contains('is-switch-inline')
          || target.classList.contains('is-buy')
        ) return;

        cancelEvent(e);

        const column = whichChild(target);
        const row = rows[whichChild(target.parentElement)];

        if(!row.buttons || !row.buttons[column]) {
          this.log.warn('no such button', row, column, message);
          return;
        }

        const button = row.buttons[column];
        this.managers.appInlineBotsManager.callbackButtonClick(this.peerId, message.mid, button).then((callbackAnswer) => {
          if(typeof callbackAnswer.message === 'string' && callbackAnswer.message.length) {
            toast(wrapRichText(callbackAnswer.message, {noLinks: true, noLinebreaks: true}));
          }
          
          //console.log('callbackButtonClick callbackAnswer:', callbackAnswer);
        });
      });

      canHaveTail = false;
      bubble.classList.add('with-reply-markup');
      contentWrapper.append(containerDiv);
    }
    
    const isOutgoing = message.pFlags.is_outgoing/*  && this.peerId !== rootScope.myId */;
    if(our) {
      if(message.pFlags.unread || isOutgoing) this.unreadOut.add(message.mid);
      let status = '';
      if(isOutgoing) status = 'is-sending';
      else status = message.pFlags.unread || (message as Message.message).pFlags.is_scheduled ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    }

    if(isOutgoing) {
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

    // media
    if(messageMedia/*  && messageMedia._ === 'messageMediaPhoto' */) {
      let attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');
      
      if(!messageMessage) {
        bubble.classList.add('is-message-empty');
      }
      
      let processingWebPage = false;
      
      /* if(isMessage)  */switch(messageMedia._) {
        case 'messageMediaPhoto': {
          const photo = messageMedia.photo;
          ////////this.log('messageMediaPhoto', photo);

          if(!messageMessage) {
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
              autoDownload: this.chat.autoDownload,
            });

            break;
          }
          
          const withTail = !IS_ANDROID && canHaveTail && !withReplies && USE_MEDIA_TAILS;
          if(withTail) bubble.classList.add('with-media-tail');
          wrapPhoto({
            photo: photo as Photo.photo, 
            message,
            container: attachmentDiv,
            withTail, 
            isOut, 
            lazyLoadQueue: this.lazyLoadQueue,
            middleware: this.getMiddleware(),
            loadPromises,
            autoDownloadSize: this.chat.autoDownload.photo,
          });

          break;
        }
        
        case 'messageMediaWebPage': {
          processingWebPage = true;
          
          let webPage: WebPage = messageMedia.webpage;
          ////////this.log('messageMediaWebPage', webpage);
          if(webPage._ !== 'webPage') {
            break;
          } 
          
          bubble.classList.add('webpage');
          
          let box = document.createElement('div');
          box.classList.add('web');
          
          let quote = document.createElement('div');
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

          let quoteTextDiv = document.createElement('div');
          quoteTextDiv.classList.add('quote-text');
          
          const doc = webPage.document as MyDocument;
          if(doc) {
            if(doc.type === 'gif' || doc.type === 'video' || doc.type === 'round') {
              //if(doc.size <= 20e6) {
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
                group: CHAT_ANIMATION_GROUP,
                loadPromises,
                autoDownload: this.chat.autoDownload,
              });
              //}
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
                }
              });
              preview.append(docDiv);
              preview.classList.add('preview-with-document');
              quoteTextDiv.classList.add('has-document');
              //messageDiv.classList.add((webpage.type || 'document') + '-message');
              //doc = null;
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
            let titleDiv = document.createElement('div');
            titleDiv.classList.add('title');
            const strong = document.createElement('strong');
            setInnerHTML(strong, title);
            titleDiv.append(strong);
            quoteTextDiv.append(titleDiv);
            t = titleDiv;
          }

          const description = wrapWebPageDescription(webPage);
          if(description.textContent) {
            let textDiv = document.createElement('div');
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
              autoDownloadSize: this.chat.autoDownload.photo,
            });
          }
          
          box.append(quote);
          
          //bubble.prepend(box);
          // if(timeSpan.parentElement === messageDiv) {
            messageDiv.insertBefore(box, timeSpan);
          // } else {
          //   messageDiv.append(box);
          // }
          
          //this.log('night running', bubble.scrollHeight);
          
          break;
        }
        
        case 'messageMediaDocument': {
          const doc = messageMedia.document as MyDocument;

          //this.log('messageMediaDocument', doc, bubble);
          
          if(doc.sticker/*  && doc.size <= 1e6 */) {
            bubble.classList.add('sticker');
            canHaveTail = false;
            isStandaloneMedia = true;
            
            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }
            
            const sizes = mediaSizes.active;
            const size = bubble.classList.contains('emoji-big') ? sizes.emojiSticker : (doc.animated ? sizes.animatedSticker : sizes.staticSticker);
            setAttachmentSize(doc, attachmentDiv, size.width, size.height);
            //let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.minWidth = attachmentDiv.style.width;
            bubbleContainer.style.minHeight = attachmentDiv.style.height;
            //appPhotosManager.setAttachmentSize(doc, bubble);
            wrapSticker({
              doc, 
              div: attachmentDiv,
              middleware: this.getMiddleware(),
              lazyLoadQueue: this.lazyLoadQueue,
              group: CHAT_ANIMATION_GROUP,
              //play: !!message.pending || !multipleRender,
              play: true,
              loop: true,
              emoji: bubble.classList.contains('emoji-big') ? messageMessage : undefined,
              withThumb: true,
              loadPromises
            });
          } else if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round'/*  && doc.size <= 20e6 */) {
            //this.log('never get free 2', doc);

            const isRound = doc.type === 'round';
            if(isRound) {
              isStandaloneMedia = true;
            }

            if(isRound || !messageMessage) {
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
                middleware: this.getMiddleware(),
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue,
                chat: this.chat,
                loadPromises,
                autoDownload: this.chat.autoDownload,
              });
            } else {
              const withTail = !IS_ANDROID && !IS_APPLE && !isRound && canHaveTail && !withReplies && USE_MEDIA_TAILS;
              if(withTail) bubble.classList.add('with-media-tail');
              wrapVideo({
                doc, 
                container: attachmentDiv, 
                message: message as Message.message, 
                boxWidth: mediaSizes.active.regular.width,
                boxHeight: mediaSizes.active.regular.height, 
                withTail, 
                isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: this.getMiddleware(),
                group: CHAT_ANIMATION_GROUP,
                loadPromises,
                autoDownload: this.chat.autoDownload,
                searchContext: isRound ? {
                  peerId: this.peerId,
                  inputFilter: {_: 'inputMessagesFilterRoundVoice'},
                  threadId: this.chat.threadId,
                  useSearch: !(message as Message.message).pFlags.is_scheduled,
                  isScheduled: (message as Message.message).pFlags.is_scheduled
                } : undefined,
              });
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
              sizeType: 'documentName'
            });

            if(newNameContainer) {
              nameContainer = newNameContainer;
            }

            const lastContainer = messageDiv.lastElementChild.querySelector('.document-message, .document-size, .audio');
            // lastContainer && lastContainer.append(timeSpan.cloneNode(true));
            lastContainer && lastContainer.append(timeSpan);

            bubble.classList.remove('is-message-empty');
            messageDiv.classList.add((!(['photo', 'pdf'] as MyDocument['type'][]).includes(doc.type) ? doc.type || 'document' : 'document') + '-message');
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
            subtitle.append(formatCallDuration(action.duration));
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
          //this.log('wrapping contact', message);

          const contact = messageMedia;
          const contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerId = '' + contact.user_id;

          processingWebPage = true;

          const contactDetails = document.createElement('div');
          contactDetails.className = 'contact-details';
          const contactNameDiv = document.createElement('div');
          contactNameDiv.className = 'contact-name';
          contactNameDiv.append(
            wrapEmojiText([
              contact.first_name,
              contact.last_name
            ].filter(Boolean).join(' '))
          );

          const contactNumberDiv = document.createElement('div');
          contactNumberDiv.className = 'contact-number';
          contactNumberDiv.textContent = contact.phone_number ? '+' + formatPhoneNumber(contact.phone_number).formatted : 'Unknown phone number';

          contactDiv.append(contactDetails);
          contactDetails.append(contactNameDiv, contactNumberDiv);

          const avatarElem = new AvatarElement();
          avatarElem.updateWithOptions({
            lazyLoadQueue: this.lazyLoadQueue,
            peerId: contact.user_id.toPeerId()
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
          const photo = messageMedia.photo;

          const priceEl = document.createElement(photo ? 'span' : 'div');
          const f = document.createDocumentFragment();
          const l = i18n(messageMedia.receipt_msg_id ? 'PaymentReceipt' : (isTest ? 'PaymentTestInvoice' : 'PaymentInvoice'));
          l.classList.add('text-uppercase');
          const joiner = ' ‎';
          const p = document.createElement('span');
          p.classList.add('text-bold');
          p.textContent = paymentsWrapCurrencyAmount(messageMedia.total_amount, messageMedia.currency) + joiner;
          f.append(p, l);
          if(isTest && messageMedia.receipt_msg_id) {
            const a = document.createElement('span');
            a.classList.add('text-uppercase', 'pre-wrap');
            a.append(joiner + '(Test)');
            f.append(a);
          }
          setInnerHTML(priceEl, f);

          if(photo) {
            const mediaSize = mediaSizes.active.invoice;
            wrapPhoto({
              photo, 
              container: attachmentDiv,
              withTail: false, 
              isOut, 
              lazyLoadQueue: this.lazyLoadQueue,
              middleware: this.getMiddleware(),
              loadPromises,
              boxWidth: mediaSize.width,
              boxHeight: mediaSize.height
            });

            bubble.classList.add('photo');

            priceEl.classList.add('video-time');
            attachmentDiv.append(priceEl);
          } else {
            attachmentDiv = undefined;
          }

          const titleDiv = document.createElement('div');
          titleDiv.classList.add('bubble-primary-color');
          setInnerHTML(titleDiv, wrapEmojiText(messageMedia.title));
          
          const richText = wrapEmojiText(messageMedia.description);
          messageDiv.prepend(...[titleDiv, !photo && priceEl, richText].filter(Boolean));

          bubble.classList.remove('is-message-empty');
          bubble.classList.add('is-invoice');

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

    let savedFrom = '';
    
    // const needName = ((peerId.isAnyChat() && (peerId !== message.fromId || our)) && message.fromId !== rootScope.myId) || message.viaBotId;
    const needName = (message.fromId !== rootScope.myId && this.chat.isAnyGroup) || message.viaBotId || (message as Message.message).pFlags.sponsored;
    if(needName || fwdFrom || message.reply_to_mid) { // chat
      let title: HTMLElement | DocumentFragment;
      let titleVia: typeof title;

      const isForwardFromChannel = message.from_id && message.from_id._ === 'peerChannel' && message.fromId === fwdFromId;
      
      let isHidden = fwdFrom && !fwdFrom.from_id;
      if(message.viaBotId) {
        titleVia = document.createElement('span');
        titleVia.innerText = '@' + (await this.managers.appUsersManager.getUser(message.viaBotId)).username;
        titleVia.classList.add('peer-title');
        bubble.classList.add('must-have-name');
      }
      
      if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = document.createElement('span');
        setInnerHTML(title, wrapEmojiText(fwdFrom.from_name));
        title.classList.add('peer-title');
        //title = fwdFrom.from_name;
        bubble.classList.add('hidden-profile');
      } else {
        title = new PeerTitle({peerId: fwdFromId || message.fromId}).element;
      }

      if(message.reply_to_mid && message.reply_to_mid !== this.chat.threadId && isMessage) {
        await MessageRender.setReply({
          chat: this.chat,
          bubble,
          bubbleContainer,
          message
        });
      }
      
      //this.log(title);
      
      let nameDiv: HTMLElement;
      if((fwdFromId || fwdFrom)) {
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
          nameDiv.append(title);
        } else {
          /* const fromTitle = message.fromId === this.myID || appPeersManager.isBroadcast(fwdFromId || message.fromId) ? '' : `<div class="name" data-peer-id="${message.fromId}" style="color: ${appPeersManager.getPeerColorByID(message.fromId, false)};">${appPeersManager.getPeerTitle(message.fromId)}</div>`;
          nameDiv.innerHTML = fromTitle + 'Forwarded from ' + title; */
          const args: FormatterArguments = [title];
          if(isStandaloneMedia) {
            args.unshift(document.createElement('br'));
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

      if(nameDiv) {
        nameDiv.classList.add('name');
        nameContainer.append(nameDiv);
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

  private appendReactionsElementToBubble(bubble: HTMLElement, message: Message.message, reactionsMessage: Message.message, changedResults?: ReactionCount[]) {
    if(this.peerId.isUser()/*  || true */) {
      return;
    }

    if(!reactionsMessage?.reactions || !reactionsMessage.reactions.results.length) {
      return;
    }

    // message = this.appMessagesManager.getMessageWithReactions(message);

    const reactionsElement = new ReactionsElement();
    reactionsElement.init(reactionsMessage, 'block');
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

  private prepareToSaveScroll(reverse?: boolean) {
    const isMounted = !!this.chatInner.parentElement;
    if(!isMounted) {
      return {};
    }

    const log = this.log.bindPrefix('prepareToSaveScroll');
    log('save');
    const scrollSaver = this.createScrollSaver(reverse);
    scrollSaver.save(); // * let's save scroll position by point before the slicing, not after
    
    if(this.getRenderedLength() && !this.chat.setPeerPromise) {
      const viewportSlice = this.getViewportSlice();
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

  public async performHistoryResult(historyResult: HistoryResult | {history: (Message.message | Message.messageService | number)[]}, reverse: boolean) {
    const log = false ? this.log.bindPrefix('perform-' + (Math.random() * 1000 | 0)) : undefined;
    log && log('start', this.chatInner.parentElement);

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
        const {lastMsgId, topMessage} = this.setPeerOptions;
        this.setPeerOptions = undefined;
        if(!lastMsgId || this.bubbles[topMessage] || lastMsgId === topMessage) {
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

    if(this.scrollable.loadedAll.top && this.messagesQueueOnRenderAdditional) {
      this.messagesQueueOnRenderAdditional();

      if(this.messagesQueueOnRenderAdditional) {
        this.messagesQueueOnRenderAdditional();
      }
    }

    log && log('performHistoryResult end');
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
    this.managers.appMessagesManager.requestHistory(peerId, 0, 2, -1, timestamp, this.chat.threadId).then((history) => {
      if(!history?.messages?.length) {
        this.log.error('no history!');
        return;
      } else if(this.peerId !== peerId) {
        return;
      }

      this.chat.setMessageId((history.messages[0] as MyMessage).mid);
      //console.log('got history date:', history);
    });
  };

  public requestHistory(maxId: number, loadCount: number, backLimit: number) {
    //const middleware = this.getMiddleware();
    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      return this.managers.acknowledged.appMessagesManager.getHistory(this.peerId, maxId, loadCount, backLimit, this.chat.threadId);
    } else if(this.chat.type === 'pinned') {
      return this.managers.acknowledged.appMessagesManager.getSearch({
        peerId: this.peerId, 
        inputFilter: {_: 'inputMessagesFilterPinned'}, 
        maxId, 
        limit: loadCount, 
        backLimit
      }).then((ackedResult) => {
        return {
          cached: ackedResult.cached,
          result: Promise.resolve(ackedResult.result).then((value) => {
            return {history: value.history.map((m) => m.mid)};
          })
        };
      });
    } else if(this.chat.type === 'scheduled') {
      return this.managers.acknowledged.appMessagesManager.getScheduledMessages(this.peerId).then((ackedResult) => {
        // this.setLoaded('top', true);
        // this.setLoaded('bottom', true);
        return {
          cached: ackedResult.cached,
          result: Promise.resolve(ackedResult.result).then((mids) => ({history: mids.slice().reverse()}))
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
        //lastMsDelay = (idx + offsetIndex) * delay;
        //lastMsDelay = (idx || 0.1) * 1000;

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
          group: CHAT_ANIMATION_GROUP,
          //play: !!message.pending || !multipleRender,
          play: true,
          loop: true,
          withThumb: true,
          loadPromises
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

  private async processLocalMessageRender(message: Message.message | Message.messageService, animate?: boolean) {
    const isSponsored = !!(message as Message.message).pFlags.sponsored;
    const middleware = this.getMiddleware();
    const m = middlewarePromise(middleware);
    return this.safeRenderMessage(message, isSponsored ? false : true, undefined, isSponsored, async(result) => {
      const {bubble} = await m(result);
      if(!bubble) {
        return result;
      }

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
      const isBot = await m(this.managers.appPeersManager.isBot(this.peerId));
      let renderPromise: Promise<any>, appendTo = this.container, method: 'append' | 'prepend' = 'append';
      if(this.chat.isRestricted) {
        renderPromise = this.renderEmptyPlaceholder('restricted', bubble, message, elements);
      } else if(isSponsored) {
        let text: LangPackKey, mid: number, startParam: string, callback: () => void;

        bubble.classList.add('avoid-selection');

        const sponsoredMessage = this.sponsoredMessage = (message as Message.message).sponsoredMessage;
        const peerId = getPeerId(sponsoredMessage.from_id);
        // const peer = this.appPeersManager.getPeer(peerId);
        if(sponsoredMessage.channel_post) {
          text = 'OpenChannelPost';
          mid = generateMessageId(sponsoredMessage.channel_post);
        } else if(sponsoredMessage.start_param || isBot) {
          text = 'Chat.Message.ViewBot';
          startParam = sponsoredMessage.start_param;
        } else {
          text = await this.managers.appPeersManager.isAnyGroup(peerId) ? 'Chat.Message.ViewGroup' : 'Chat.Message.ViewChannel';
        }

        if(sponsoredMessage.chat_invite) {
          callback = () => {
            new PopupJoinChatInvite(sponsoredMessage.chat_invite_hash, sponsoredMessage.chat_invite as ChatInvite.chatInvite);
          };
        } else if(sponsoredMessage.chat_invite_hash) {
          callback = () => {
            const link: InternalLink = {
              _: INTERNAL_LINK_TYPE.JOIN_CHAT,
              invite: sponsoredMessage.chat_invite_hash
            };
            
            this.chat.appImManager.processInternalLink(link);
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

        const button = Button('btn-primary btn-primary-transparent bubble-view-button', {
          text
        });

        this.observer.observe(button, this.viewsObserverCallback);

        if(callback) {
          attachClickEvent(button, callback);
        }

        bubble.querySelector('.bubble-content').prepend(button);

        return result;
      } else if(isBot && message._ === 'message') {
        const b = document.createElement('b');
        b.append(i18n('BotInfoTitle'));
        elements.push(b, '\n\n');
        appendTo = this.chatInner;
        method = 'prepend';
      } else if(await m(this.managers.appPeersManager.isAnyGroup(this.peerId)) && (await m(this.managers.appPeersManager.getPeer(this.peerId))).pFlags.creator) {
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

      // if(!isSponsored) {
        this.emptyPlaceholderBubble = bubble;
      // }

      return result;
    });
  }

  private generateLocalMessageId(addOffset = 0) {
    // const INCREMENT = 0x10;
    let offset = (this.chat.type === 'scheduled' ? -1 : 0) + addOffset;
    // offset = generateMessageId(offset);
    // id: -Math.abs(+this.peerId * INCREMENT + offset),
    const id = -Math.abs(offset);
    const mid = -Math.abs(generateMessageId(id));
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

    fill && fill(message);

    const savedMessages = await this.managers.appMessagesManager.saveMessages([message], {storage: new Map() as any});
    message = savedMessages[0];
    message.mid = mid;
    return message as any;
  }

  public getViewportSlice() {
    // this.log.trace('viewport slice');
    return getViewportSlice({
      overflowElement: this.scrollable.container, 
      selector: '.bubbles-date-group .bubble:not(.is-date)',
      extraSize: Math.max(700, windowSize.height) * 2
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

    if(invisibleTop.length) {
      this.setLoaded('top', false);
      this.getHistoryTopPromise = undefined;
    }

    if(invisibleBottom.length) {
      this.setLoaded('bottom', false);
      this.getHistoryBottomPromise = undefined;
    }

    const mids = invisible.map(({element}) => +element.dataset.mid);

    let scrollSaver: ScrollSaver;
    if(!!invisibleTop.length !== !!invisibleBottom.length && !ignoreScrollSaving) {
      scrollSaver = this.createScrollSaver(!!invisibleTop.length);
      scrollSaver.save();
    }
    
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
    const slice = this.getViewportSlice();
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

    // return;

    if(!checkPlaceholders) {
      return;
    }

    if(!this.chat.isRestricted) {
      if(side === 'bottom' && await this.managers.appPeersManager.isBroadcast(this.peerId)/*  && false */) {
        this.toggleSponsoredMessage(value);
      }
  
      if(side === 'top' && value && await this.managers.appPeersManager.isBot(this.peerId)) {
        return this.renderBotPlaceholder();
      }
    }

    return this.checkIfEmptyPlaceholderNeeded();
  }

  private async toggleSponsoredMessage(value: boolean) {
    const _log = this.log.bindPrefix('sponsored');
    _log('checking');
    const {mid} = this.generateLocalMessageId(SPONSORED_MESSAGE_ID_OFFSET);
    if(value) {
      const middleware = this.getMiddleware(() => {
        return this.scrollable.loadedAll.bottom && !this.bubbles[mid] && this.getSponsoredMessagePromise === promise;
      });

      const promise = this.getSponsoredMessagePromise = this.managers.appChatsManager.getSponsoredMessage(this.peerId.toChatId())
      .then(async(sponsoredMessages) => {
        const sponsoredMessage = sponsoredMessages.messages[0];
        if(!sponsoredMessage) {
          _log('no message');
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
          _log('rendering', message);
          const promise = this.performHistoryResult({history: [message]}, false);
        });
      }).finally(() => {
        this.getSponsoredMessagePromise = undefined;
      });
    } else {
      _log('clearing rendered', mid);
      this.deleteMessagesByIds([mid]);
      this.getSponsoredMessagePromise = undefined;
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
        message.message = userFull.bot_info.description;
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
        !(await this.chat.getHistoryStorage()).count || 
        (
          !Object.keys(this.bubbles).length || 
          // ! WARNING ! ! ! ! ! ! REPLACE LINE ABOVE WITH THESE
          Object.keys(this.bubbles).length && 
          !this.getRenderedLength()
        ) ||
        (this.chat.type === 'scheduled' && !Object.keys(this.bubbles).length)
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
        //if(!isFirstMessageRender) {
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
            //}
          }
        //}
      }
    });

    return result;
  }

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

    const isBroadcast = await this.managers.appPeersManager.isBroadcast(peerId);
    //console.time('appImManager call getHistory');
    const pageCount = Math.min(30, windowSize.height / 40/*  * 1.25 */ | 0);
    //const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = isBroadcast ? 20 : (Object.keys(this.bubbles).length > 0 ? Math.max(35, pageCount) : pageCount);
    //const realLoadCount = pageCount;//const realLoadCount = 50;
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
    
    ////console.time('render history total');
    
    let backLimit = 0;
    if(isBackLimit) {
      backLimit = loadCount;

      if(!reverse) { // if not jump
        loadCount = 0;
        //maxId = this.appMessagesManager.incrementMessageId(maxId, 1);
      }
    }

    let additionMsgIds: number[];
    if(additionMsgId && !isBackLimit) {
      if(this.chat.type === 'pinned') {
        additionMsgIds = [additionMsgId];
      } else {
        const historyStorage = await this.chat.getHistoryStorage();
        const slice = historyStorage.history.slice;
        if(slice.length < loadCount && !slice.isEnd(SliceEnd.Both)) {
          additionMsgIds = slice.slice();

          // * filter last album, because we don't know is it the last item
          for(let i = additionMsgIds.length - 1; i >= 0; --i) {
            const message = await this.chat.getMessage(additionMsgIds[i]);
            if((message as Message.message)?.grouped_id) additionMsgIds.splice(i, 1);
            else break;
          }

          maxId = additionMsgIds[additionMsgIds.length - 1] || maxId;
        }
      }
    }

    /* const result = additionMsgID ? 
      {history: [additionMsgID]} : 
      appMessagesManager.getHistory(this.peerId, maxId, loadCount, backLimit); */
    let result: AckedResult<MyHistoryResult> = await this.requestHistory(maxId, loadCount, backLimit) as any;
    let resultPromise: typeof result['result'];

    //const isFirstMessageRender = !!additionMsgID && result.cached && !appMessagesManager.getMessage(additionMsgID).grouped_id;
    const isAdditionRender = additionMsgIds?.length && !result.cached;
    const isFirstMessageRender = (this.isFirstLoad && backLimit && !result.cached) || isAdditionRender;
    if(isAdditionRender) {
      resultPromise = result.result;

      result = {
        cached: true,
        result: Promise.resolve({history: additionMsgIds})
      };

      //additionMsgID = 0;
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

    if(isFirstMessageRender && rootScope.settings.animationsEnabled/*  && false */) {
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
      let bubble = this.bubbles[readMaxId];
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
