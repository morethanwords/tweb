/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager, HistoryResult, HistoryStorage, MyMessage } from "../../lib/appManagers/appMessagesManager";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/appInlineBotsManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { MyDocument } from "../../lib/appManagers/appDocsManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppDraftsManager } from "../../lib/appManagers/appDraftsManager";
import type { AppMessagesIdsManager } from "../../lib/appManagers/appMessagesIdsManager";
import type Chat from "./chat";
import { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import { getObjectKeysAndSort } from "../../helpers/object";
import { isTouchSupported } from "../../helpers/touchSupport";
import { logger } from "../../lib/logger";
import rootScope, { BroadcastEvents } from "../../lib/rootScope";
import AppMediaViewer from "../appMediaViewer";
import BubbleGroups from "./bubbleGroups";
import PopupDatePicker from "../popups/datePicker";
import PopupForward from "../popups/forward";
import PopupStickers from "../popups/stickers";
import ProgressivePreloader from "../preloader";
import Scrollable, { SliceSides } from "../scrollable";
import StickyIntersector from "../stickyIntersector";
import animationIntersector from "../animationIntersector";
import RichTextProcessor from "../../lib/richtextprocessor";
import mediaSizes from "../../helpers/mediaSizes";
import { isAndroid, isApple, isMobile, isSafari } from "../../helpers/userAgent";
import I18n, { i18n, langPack } from "../../lib/langPack";
import AvatarElement from "../avatar";
import { formatPhoneNumber } from "../misc";
import { ripple } from "../ripple";
import { wrapAlbum, wrapPhoto, wrapVideo, wrapDocument, wrapSticker, wrapPoll, wrapGroupedDocuments } from "../wrappers";
import { MessageRender } from "./messageRender";
import LazyLoadQueue from "../lazyLoadQueue";
import ListenerSetter from "../../helpers/listenerSetter";
import PollElement from "../poll";
import AudioElement from "../audio";
import { Message, MessageEntity,  MessageReplyHeader, Photo, PhotoSize, ReplyMarkup, Update, WebPage } from "../../layer";
import { REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { FocusDirection } from "../../helpers/fastSmoothScroll";
import useHeavyAnimationCheck, { getHeavyAnimationPromise, dispatchHeavyAnimationEvent, interruptHeavyAnimation } from "../../hooks/useHeavyAnimationCheck";
import { fastRaf, fastRafPromise } from "../../helpers/schedulers";
import { deferredPromise } from "../../helpers/cancellablePromise";
import RepliesElement from "./replies";
import DEBUG from "../../config/debug";
import { SliceEnd } from "../../helpers/slicedArray";
import serverTimeManager from "../../lib/mtproto/serverTimeManager";
import PeerTitle from "../peerTitle";
import { forEachReverse } from "../../helpers/array";
import findUpClassName from "../../helpers/dom/findUpClassName";
import findUpTag from "../../helpers/dom/findUpTag";
import { toast } from "../toast";
import { getElementByPoint } from "../../helpers/dom/getElementByPoint";
import { getMiddleware } from "../../helpers/middleware";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import htmlToDocumentFragment from "../../helpers/dom/htmlToDocumentFragment";
import positionElementByIndex from "../../helpers/dom/positionElementByIndex";
import reflowScrollableElement from "../../helpers/dom/reflowScrollableElement";
import replaceContent from "../../helpers/dom/replaceContent";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import whichChild from "../../helpers/dom/whichChild";
import { cancelAnimationByKey } from "../../helpers/animation";
import assumeType from "../../helpers/assumeType";
import { EmoticonsDropdown } from "../emoticonsDropdown";
import debounce from "../../helpers/schedulers/debounce";
import { formatNumber } from "../../helpers/number";

const USE_MEDIA_TAILS = false;
const IGNORE_ACTIONS: Set<Message.messageService['action']['_']> = new Set([
  'messageActionHistoryClear',
  'messageActionChatCreate'/* ,
  'messageActionChannelMigrateFrom' */
]);

const TEST_SCROLL_TIMES: number = undefined;
let TEST_SCROLL = TEST_SCROLL_TIMES;

let queueId = 0;

type GenerateLocalMessageType<IsService> = IsService extends true ? Message.messageService : Message.message;

export default class ChatBubbles {
  public bubblesContainer: HTMLDivElement;
  private chatInner: HTMLDivElement;
  public scrollable: Scrollable;

  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;

  public peerId = 0;
  //public messagesCount: number = -1;

  private unreadOut = new Set<number>();
  public needUpdate: {replyToPeerId: number, replyMid: number, mid: number}[] = []; // if need wrapSingleMessage

  public bubbles: {[mid: string]: HTMLDivElement} = {};
  public skippedMids: Set<number> = new Set();
  private dateMessages: {[timestamp: number]: { 
    div: HTMLDivElement, 
    firstTimestamp: number, 
    container: HTMLDivElement,
    timeout?: number 
  }} = {};

  private scrolledDown = true;
  private isScrollingTimeout = 0;

  private stickyIntersector: StickyIntersector;

  private unreadedObserver: IntersectionObserver;
  private unreaded: Map<HTMLElement, number> = new Map();
  private unreadedSeen: Set<number> = new Set();
  private readPromise: Promise<void>;

  private bubbleGroups: BubbleGroups;

  private preloader: ProgressivePreloader = null;
  
  private loadedTopTimes = 0;
  private loadedBottomTimes = 0;

  private messagesQueuePromise: Promise<void> = null;
  private messagesQueue: {message: any, bubble: HTMLElement, reverse: boolean, promises: Promise<void>[]}[] = [];
  private messagesQueueOnRender: () => void = null;
  private messagesQueueOnRenderAdditional: () => void = null;

  private firstUnreadBubble: HTMLDivElement = null;
  private attachedUnreadBubble: boolean;

  public lazyLoadQueue: LazyLoadQueue;

  private middleware = getMiddleware();

  private log: ReturnType<typeof logger>;

  public listenerSetter: ListenerSetter;

  private replyFollowHistory: number[] = [];

  private isHeavyAnimationInProgress = false;
  private scrollingToNewBubble: HTMLElement;

  private isFirstLoad = true;
  private needReflowScroll: boolean;

  private fetchNewPromise: Promise<void>;
  private historyStorage: HistoryStorage;

  private passEntities: Partial<{
    [_ in MessageEntity['_']]: boolean
  }> = {};

  private onAnimateLadder: () => Promise<any> | void;
  // private ladderDeferred: CancellablePromise<void>;
  private resolveLadderAnimation: () => Promise<any>;
  private emptyPlaceholderMid: number;

  private viewsObserver: IntersectionObserver;
  private viewsMids: Set<number> = new Set();
  private sendViewCountersDebounced: () => Promise<void>;

  constructor(private chat: Chat, 
    private appMessagesManager: AppMessagesManager, 
    private appStickersManager: AppStickersManager, 
    private appUsersManager: AppUsersManager, 
    private appInlineBotsManager: AppInlineBotsManager, 
    private appPhotosManager: AppPhotosManager, 
    private appPeersManager: AppPeersManager,
    private appProfileManager: AppProfileManager,
    private appDraftsManager: AppDraftsManager,
    private appMessagesIdsManager: AppMessagesIdsManager
  ) {
    //this.chat.log.error('Bubbles construction');
    
    this.listenerSetter = new ListenerSetter();

    this.bubblesContainer = document.createElement('div');
    this.bubblesContainer.classList.add('bubbles', 'scrolled-down');

    this.chatInner = document.createElement('div');
    this.chatInner.classList.add('bubbles-inner');

    this.setScroll();

    this.bubblesContainer.append(this.scrollable.container);

    // * constructor end

    this.log = this.chat.log;
    this.bubbleGroups = new BubbleGroups(this.chat);
    this.preloader = new ProgressivePreloader({
      cancelable: false
    });
    this.lazyLoadQueue = new LazyLoadQueue();
    this.lazyLoadQueue.queueId = ++queueId;

    // * events

    // will call when sent for update pos
    this.listenerSetter.add(rootScope)('history_update', (e) => {
      const {storage, peerId, mid} = e;
      
      if(mid && peerId === this.peerId && this.chat.getMessagesStorage() === storage) {
        const bubble = this.bubbles[mid];
        if(!bubble) return;

        const message = this.chat.getMessage(mid);
        
        if(+bubble.dataset.timestamp >= (message.date + serverTimeManager.serverTimeOffset - 1)) {
          //this.bubbleGroups.addBubble(bubble, message, false); // ! TEMP COMMENTED
          return;
        }

        this.setBubblePosition(bubble, message, false);
        //this.log('history_update', this.bubbles[mid], mid, message);

        if(this.scrollingToNewBubble) {
          this.scrollToBubbleEnd();
        }

        //this.renderMessage(message, false, false, bubble);
      }
    });

    //this.listenerSetter.add(rootScope)('')

    this.listenerSetter.add(rootScope)('dialog_flush', (e) => {
      let peerId: number = e.peerId;
      if(this.peerId === peerId) {
        this.deleteMessagesByIds(Object.keys(this.bubbles).map(m => +m));
      }
    });

    // Calls when message successfully sent and we have an id
    this.listenerSetter.add(rootScope)('message_sent', (e) => {
      const {storage, tempId, tempMessage, mid} = e;

      // ! can't use peerId to validate here, because id can be the same in 'scheduled' and 'chat' types
      if(this.chat.getMessagesStorage() !== storage) {
        return;
      }
      
      //this.log('message_sent', e);

      const mounted = this.getMountedBubble(tempId, tempMessage) || this.getMountedBubble(mid);
      if(mounted) {
        const message = this.chat.getMessage(mid);
        const bubble = mounted.bubble;
        //this.bubbles[mid] = bubble;
        
        /////this.log('message_sent', bubble);

        if(message.replies) {
          const repliesElement = bubble.querySelector('replies-element') as RepliesElement;
          if(repliesElement) {
            repliesElement.message = message;
            repliesElement.init();
          }
        }

        if(message.media?.document && !message.media.document.type) {
          const div = bubble.querySelector(`.document-container[data-mid="${tempId}"] .document`);
          if(div) {
            div.replaceWith(wrapDocument({message}));
          }
        }

        // set new mids to album items for mediaViewer
        if(message.grouped_id) {
          const item = (bubble.querySelector(`.grouped-item[data-mid="${tempId}"]`) as HTMLElement) || bubble; // * it can be .document-container
          if(item) {
            item.dataset.mid = '' + mid;
          }
        }

        if(message.media?.poll) {
          const pollElement = bubble.querySelector('poll-element') as PollElement;
          if(pollElement) {
            const newPoll = message.media.poll;
            pollElement.message = message;
            pollElement.setAttribute('poll-id', newPoll.id);
            pollElement.setAttribute('message-id', '' + mid);
          }
        }

        if(message.media?.document) {
          const element = bubble.querySelector(`audio-element[message-id="${tempId}"], .document[data-doc-id="${tempId}"]`) as HTMLElement;
          if(element) {
            if(element instanceof AudioElement) {
              element.setAttribute('doc-id', message.media.document.id);
              element.setAttribute('message-id', '' + mid);
              element.message = message;
              element.onLoad(true);
            } else {
              element.dataset.docId = message.media.document.id;
            }
          }
        }

        /* bubble.classList.remove('is-sending');
        bubble.classList.add('is-sent');
        bubble.dataset.mid = '' + mid;

        this.bubbleGroups.removeBubble(bubble, tempId); */

        if(message.media?.webpage && !bubble.querySelector('.web')) {
          getHeavyAnimationPromise().then(() => {
            this.safeRenderMessage(message, true, false, bubble, false);
            this.scrollToBubbleIfLast(bubble);
          });
          /* const mounted = this.getMountedBubble(mid);
          if(!mounted) return;
          this.renderMessage(mounted.message, true, false, mounted.bubble, false); */
        }
        
        //delete this.bubbles[tempId];
      } else {
        this.log.warn('message_sent there is no bubble', e);
      }

      const bubbles = this.bubbles;
      if(bubbles[tempId]) {
        const bubble = bubbles[tempId];
        bubbles[mid] = bubble;
        delete bubbles[tempId];

        //getHeavyAnimationPromise().then(() => {
          fastRaf(() => {
            if(bubble.classList.contains('is-sending')) {
              bubble.classList.remove('is-sending');
              bubble.classList.add(this.peerId === rootScope.myId && this.chat.type !== 'scheduled' ? 'is-read' : 'is-sent');
            }
          });
        //});

        bubble.dataset.mid = '' + mid;
      }

      if(this.unreadOut.has(tempId)) {
        this.unreadOut.delete(tempId);
        this.unreadOut.add(mid);
      }

      // * check timing of scheduled message
      if(this.chat.type === 'scheduled') {
        const timestamp = Date.now() / 1000 | 0;
        const maxTimestamp = tempMessage.date - 10;
        //this.log('scheduled timing:', timestamp, maxTimestamp);
        if(timestamp >= maxTimestamp) {
          this.deleteMessagesByIds([mid]);
        }
      }
    });

    this.listenerSetter.add(rootScope)('message_edit', (e) => {
      // fastRaf(() => {
        const {storage, peerId, mid} = e;
      
        if(peerId !== this.peerId || storage !== this.chat.getMessagesStorage()) return;
        const mounted = this.getMountedBubble(mid);
        if(!mounted) return;

        const updatePosition = this.chat.type === 'scheduled';
        const scrolledDown = this.scrolledDown;
        this.safeRenderMessage(mounted.message, true, false, mounted.bubble, updatePosition);
        if(scrolledDown) {
          this.scrollToBubbleIfLast(mounted.bubble);
        }

        if(updatePosition) {
          (this.messagesQueuePromise || Promise.resolve()).then(() => {
            this.deleteEmptyDateGroups();
          });
        }
      // });
    });

    this.listenerSetter.add(rootScope)('album_edit', (e) => {
      //fastRaf(() => { // ! can't use delayed smth here, need original bubble to be edited
        const {peerId, groupId, deletedMids} = e;
      
        if(peerId !== this.peerId) return;
        const mids = this.appMessagesManager.getMidsByAlbum(groupId);
        const renderedId = mids.concat(deletedMids).find(mid => this.bubbles[mid]);
        if(!renderedId) return;

        const renderMaxId = getObjectKeysAndSort(this.appMessagesManager.groupedMessagesStorage[groupId], 'asc').pop();

        this.safeRenderMessage(this.chat.getMessage(renderMaxId), true, false, this.bubbles[renderedId], false);
      //});
    });

    this.listenerSetter.add(rootScope)('messages_downloaded', (e) => {
      const {peerId, mids} = e;

      const middleware = this.getMiddleware();
      getHeavyAnimationPromise().then(() => {
        if(!middleware()) return;

        (mids as number[]).forEach(mid => {
          /* const promise = (this.scrollable.scrollLocked && this.scrollable.scrollLockedPromise) || Promise.resolve();
          promise.then(() => {
  
          }); */
          forEachReverse(this.needUpdate, (obj, idx) => {
            if(obj.replyMid === mid && obj.replyToPeerId === peerId) {
              const {mid, replyMid} = this.needUpdate.splice(idx, 1)[0];
              
              //this.log('messages_downloaded', mid, replyMid, i, this.needUpdate, this.needUpdate.length, mids, this.bubbles[mid]);
              const bubble = this.bubbles[mid];
              if(!bubble) return;
              
              const message = this.chat.getMessage(mid);
              
              const repliedMessage = this.appMessagesManager.getMessageByPeer(obj.replyToPeerId, replyMid);
              if(repliedMessage.deleted) { // ! чтобы не пыталось бесконечно загрузить удалённое сообщение
                delete message.reply_to_mid; // ! WARNING!
              }
              
              MessageRender.setReply({
                chat: this.chat,
                bubble,
                message
              });
            }
          });
        });
      });
    });

    this.listenerSetter.add(this.bubblesContainer)('click', this.onBubblesClick/* , {capture: true, passive: false} */);

    if(DEBUG) {
      this.listenerSetter.add(this.bubblesContainer)('dblclick', (e) => {
        const bubble = findUpClassName(e.target, 'grouped-item') || findUpClassName(e.target, 'bubble');
        if(bubble) {
          const mid = +bubble.dataset.mid
          this.log('debug message:', this.chat.getMessage(mid));
          this.highlightBubble(bubble);
        }
      });
    }

    if(!isMobile) {
      this.listenerSetter.add(this.bubblesContainer)('dblclick', (e) => {
        if(this.chat.selection.isSelecting || 
          !this.appMessagesManager.canWriteToPeer(this.peerId, this.chat.threadId)) {
          return;
        }
        
        const target = e.target as HTMLElement;
        const bubble = target.classList.contains('bubble') ? 
          target : 
          (target.classList.contains('document-selection') ? target.parentElement : null);
        if(bubble && !bubble.classList.contains('bubble-first')) {
          const mid = +bubble.dataset.mid;
          const message = this.chat.getMessage(mid);
          if(message.pFlags.is_outgoing) {
            return;
          }
          
          this.chat.input.initMessageReply(mid);
        }
      });
    }

    /* if(false)  */this.stickyIntersector = new StickyIntersector(this.scrollable.container, (stuck, target) => {
      for(const timestamp in this.dateMessages) {
        const dateMessage = this.dateMessages[timestamp];
        if(dateMessage.container === target) {
          dateMessage.div.classList.toggle('is-sticky', stuck);
          break;
        }
      }
    });


    let middleware: ReturnType<ChatBubbles['getMiddleware']>;
    useHeavyAnimationCheck(() => {
      this.isHeavyAnimationInProgress = true;
      this.lazyLoadQueue.lock();
      middleware = this.getMiddleware();
    }, () => {
      this.isHeavyAnimationInProgress = false;

      if(middleware && middleware()) {
        this.lazyLoadQueue.unlock();
        this.lazyLoadQueue.refresh();
      }

      middleware = null;
    }, this.listenerSetter);
  }

  public constructPeerHelpers() {
    // will call when message is sent (only 1)
    this.listenerSetter.add(rootScope)('history_append', (e) => {
      const {peerId, storage, mid} = e;

      if(peerId !== this.peerId || storage !== this.chat.getMessagesStorage()) return;

      if(!this.scrollable.loadedAll.bottom) {
        this.chat.setMessageId();
      } else {
        this.renderNewMessagesByIds([mid], true);
      }
    });

    this.listenerSetter.add(rootScope)('history_multiappend', (msgIdsByPeer) => {
      if(!(this.peerId in msgIdsByPeer)) return;
      const msgIds = Array.from(msgIdsByPeer[this.peerId]).slice().sort((a, b) => b - a);
      this.renderNewMessagesByIds(msgIds);
    });
    
    this.listenerSetter.add(rootScope)('history_delete', (e) => {
      const {peerId, msgs} = e;

      const mids = Object.keys(msgs).map(s => +s);

      if(peerId === this.peerId) {
        this.deleteMessagesByIds(mids);
      }
    });

    this.listenerSetter.add(rootScope)('dialog_unread', (e) => {
      const info = e;

      if(info.peerId === this.peerId) {
        this.chat.input.setUnreadCount();
        this.updateUnreadByDialog();
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (e) => {
      const dialogs = e;

      if(dialogs[this.peerId]) {
        this.chat.input.setUnreadCount();
      }
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        this.chat.input.setUnreadCount();
      }
    });

    this.listenerSetter.add(rootScope)('chat_update', (e) => {
      const chatId: number = e;
      if(this.peerId === -chatId) {
        const hadRights = this.chatInner.classList.contains('has-rights');
        const hasRights = this.appMessagesManager.canWriteToPeer(this.peerId, this.chat.threadId);

        if(hadRights !== hasRights) {
          this.finishPeerChange();
          this.chat.input.updateMessageInput();
        }
      }
    });

    this.listenerSetter.add(rootScope)('settings_updated', (e: BroadcastEvents['settings_updated']) => {
      if(e.key === 'settings.emoji.big') {
        const isScrolledDown = this.scrollable.isScrolledDown;
        if(!isScrolledDown) {
          this.setMessagesQueuePromise();
        }
        
        const mids = getObjectKeysAndSort(this.bubbles, 'desc');
        mids.forEach(mid => {
          const bubble = this.bubbles[mid];
          if(bubble.classList.contains('can-have-big-emoji')) {
            const message = this.chat.getMessage(mid);
            this.safeRenderMessage(message, undefined, false, bubble);
            // this.bubbleGroups.addBubble(bubble, message, false);
          }
        });

        if(isScrolledDown) {
          this.scrollable.scrollTop = 99999;
        } else {
          this.performHistoryResult([], true, false, undefined);
        }
      }
    });

    this.listenerSetter.add(rootScope)('message_views', (e) => {
      if(this.peerId !== e.peerId) return;

      fastRaf(() => {
        const bubble = this.bubbles[e.mid];
        if(!bubble) return;

        const postViewsElements = Array.from(bubble.querySelectorAll('.post-views')) as HTMLElement[];
        if(postViewsElements.length) {
          const str = formatNumber(e.views, 1);
          let different = false;
          postViewsElements.forEach(postViews => {
            if(different || postViews.innerHTML !== str) {
              different = true;
              postViews.innerHTML = str;
            }
          });
        }
      });
    });

    this.unreadedObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          const mid = this.unreaded.get(target as HTMLElement);
          this.onUnreadedInViewport(target, mid);
        }
      });
    });

    this.viewsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          this.viewsMids.add(+(entry.target as HTMLElement).dataset.mid);
          this.viewsObserver.unobserve(entry.target);
          this.sendViewCountersDebounced();
        }
      });
    });

    this.sendViewCountersDebounced = debounce(() => {
      const mids = [...this.viewsMids];
      this.viewsMids.clear();

      this.appMessagesManager.incrementMessageViews(this.peerId, mids);
    }, 1000, false, true);

    if('ResizeObserver' in window) {
      let wasHeight = this.scrollable.container.offsetHeight;
      let resizing = false;
      let skip = false;
      let scrolled = 0;
      let part = 0;
      let rAF = 0;

      const onResizeEnd = () => {
        const height = this.scrollable.container.offsetHeight;
        const isScrolledDown = this.scrollable.isScrolledDown;
        if(height !== wasHeight && (!skip || !isScrolledDown)) { // * fix opening keyboard while ESG is active, offsetHeight will change right between 'start' and this first frame
          part += wasHeight - height;
        }

        /* if(DEBUG) {
          this.log('resize end', scrolled, part, this.scrollable.scrollTop, height, wasHeight, this.scrollable.isScrolledDown);
        } */

        if(part) {
          this.scrollable.scrollTop += Math.round(part);
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

      const processEntries = (entries: any) => {
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
          this.scrollable.scrollTop = needScrollTop;
        }
        
        setEndRAF(false);

        part = _part;
        wasHeight = height;
      };

      // @ts-ignore
      const resizeObserver = new ResizeObserver(processEntries);
      resizeObserver.observe(this.bubblesContainer);
    }
  }

  public getRenderedLength() {
    return Object.keys(this.bubbles).length - this.skippedMids.size;
  }

  private onUnreadedInViewport(target: HTMLElement, mid: number) {
    this.unreadedSeen.add(mid);
    this.unreadedObserver.unobserve(target);
    this.unreaded.delete(target);
    this.readUnreaded();
  }

  private readUnreaded() {
    if(this.readPromise) return;

    const middleware = this.getMiddleware();
    this.readPromise = rootScope.idle.focusPromise.then(() => {
      if(!middleware()) return;
      let maxId = Math.max(...Array.from(this.unreadedSeen));

      // ? if message with maxId is not rendered ?
      if(this.scrollable.loadedAll.bottom) {
        const bubblesMaxId = Math.max(...Object.keys(this.bubbles).map(i => +i));
        if(maxId >= bubblesMaxId) {
          maxId = Math.max(this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId).maxId || 0, maxId);
        }
      }

      this.unreaded.forEach((mid, target) => {
        if(mid <= maxId) {
          this.onUnreadedInViewport(target, mid);
        }
      });

      this.unreadedSeen.clear();

      if(DEBUG) {
        this.log('will readHistory by maxId:', maxId);
      }

      // return;
      
      return this.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId).catch((err: any) => {
        this.log.error('readHistory err:', err);
        this.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId);
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
    const onUpdate = () => {
      this.chat.topbar.setTitle(Object.keys(this.appMessagesManager.getScheduledMessagesStorage(this.peerId)).length);
    };

    this.listenerSetter.add(rootScope)('scheduled_new', (e) => {
      const {peerId, mid} = e;
      if(peerId !== this.peerId) return;

      this.renderNewMessagesByIds([mid]);
      onUpdate();
    });

    this.listenerSetter.add(rootScope)('scheduled_delete', (e) => {
      const {peerId, mids} = e;
      if(peerId !== this.peerId) return;

      this.deleteMessagesByIds(mids);
      onUpdate();
    });
  }

  public onBubblesClick = (e: Event) => {
    let target = e.target as HTMLElement;
    let bubble: HTMLElement = null;
    try {
      bubble = findUpClassName(target, 'bubble');
    } catch(err) {}
    
    if(!bubble) return;

    if(bubble.classList.contains('is-date') && findUpClassName(target, 'bubble-content')) {
      if(bubble.classList.contains('is-sticky') && !this.chatInner.classList.contains('is-scrolling')) {
        return;
      }

      for(const timestamp in this.dateMessages) {
        const d = this.dateMessages[timestamp];
        if(d.div === bubble) {
          new PopupDatePicker(new Date(+timestamp), this.onDatePick).show();
          break;
        }
      }

      return;
    }

    if(!isTouchSupported && findUpClassName(target, 'time')) {
      this.chat.selection.toggleByBubble(bubble);
      return;
    }

    // ! Trusted - due to audio autoclick
    if(this.chat.selection.isSelecting && e.isTrusted) {
      if(bubble.classList.contains('service') && bubble.dataset.mid === undefined) {
        return;
      }

      cancelEvent(e);
      //console.log('bubble click', e);

      if(isTouchSupported && this.chat.selection.selectedText) {
        this.chat.selection.selectedText = undefined;
        return;
      }

      //this.chatSelection.toggleByBubble(bubble);
      this.chat.selection.toggleByBubble(findUpClassName(target, 'grouped-item') || bubble);
      return;
    }

    const contactDiv: HTMLElement = findUpClassName(target, 'contact');
    if(contactDiv) {
      this.chat.appImManager.setInnerPeer(+contactDiv.dataset.peerId);
      return;
    }

    const commentsDiv: HTMLElement = findUpClassName(target, 'replies');
    if(commentsDiv) {
      const bubbleMid = +bubble.dataset.mid;
      if(this.peerId === REPLIES_PEER_ID) {
        const message = this.chat.getMessage(bubbleMid) as Message.message;
        const peerId = this.appPeersManager.getPeerId(message.reply_to.reply_to_peer_id);
        const threadId = message.reply_to.reply_to_top_id;
        const lastMsgId = message.fwd_from.saved_from_msg_id;
        this.chat.appImManager.openThread(peerId, lastMsgId, threadId);
      } else {
        const message = this.appMessagesManager.filterMessages(this.chat.getMessage(bubbleMid), message => !!(message as Message.message).replies)[0] as Message.message;
        const replies = message.replies;
        if(replies) {
          this.appMessagesManager.getDiscussionMessage(this.peerId, message.mid).then(message => {
            this.chat.appImManager.setInnerPeer(-replies.channel_id, undefined, 'discussion', (message as MyMessage).mid);
          });
        }
      }

      return;
    }

    const nameDiv = findUpClassName(target, 'peer-title') || findUpClassName(target, 'name') || findUpTag(target, 'AVATAR-ELEMENT');
    if(nameDiv) {
      target = nameDiv || target;
      const peerId = +(target.dataset.peerId || target.getAttribute('peer'));
      const savedFrom = target.dataset.savedFrom;
      if(nameDiv.classList.contains('is-via')) {
        const message = '@' + this.appUsersManager.getUser(peerId).username + ' ';
        this.appDraftsManager.setDraft(this.peerId, this.chat.threadId, message);
        cancelEvent(e);
      } else if(savedFrom) {
        const splitted = savedFrom.split('_');
        const peerId = +splitted[0];
        const msgId = +splitted[1];

        this.chat.appImManager.setInnerPeer(peerId, msgId);
      } else {
        if(peerId) {
          this.chat.appImManager.setInnerPeer(peerId);
        } else {
          toast(I18n.format('HidAccount', true));
        }
      }

      return;
    }

    //this.log('chatInner click:', target);
    const isVideoComponentElement = target.tagName === 'SPAN';
    /* if(isVideoComponentElement) {
      const video = target.parentElement.querySelector('video') as HTMLElement;
      if(video) {
        video.click(); // hot-fix for time and play button
        return;
      }
    } */

    if(bubble.classList.contains('sticker') && target.parentElement.classList.contains('attachment')) {
      const messageId = +bubble.dataset.mid;
      const message = this.chat.getMessage(messageId);

      const doc = message.media?.document;

      if(doc?.stickerSetInput) {
        new PopupStickers(doc.stickerSetInput).show();
      }

      return;
    }

    if((target.tagName === 'IMG' && !target.classList.contains('emoji') && !target.classList.contains('document-thumb')) 
      || target.classList.contains('album-item')
      || isVideoComponentElement
      || (target.tagName === 'VIDEO' && !bubble.classList.contains('round'))) {
      let messageId = +findUpClassName(target, 'album-item')?.dataset.mid || +bubble.dataset.mid;
      let message = this.chat.getMessage(messageId);
      if(!message) {
        this.log.warn('no message by messageId:', messageId);
        return;
      }

      let targets: {element: HTMLElement, mid: number, peerId: number}[] = [];
      let ids = Object.keys(this.bubbles).map(k => +k).filter(id => {
        //if(!this.scrollable.visibleElements.find(e => e.element === this.bubbles[id])) return false;

        let message = this.chat.getMessage(id);
        
        return message.media && (message.media.photo || (message.media.document && (message.media.document.type === 'video' || message.media.document.type === 'gif')) || (message.media.webpage && (message.media.webpage.document || message.media.webpage.photo)));
      }).sort((a, b) => a - b);

      ids.forEach(id => {
        let withTail = this.bubbles[id].classList.contains('with-media-tail');
        let str = '.album-item video, .album-item img, .preview video, .preview img, ';
        if(withTail) {
          str += '.bubble__media-container';
        } else {
          str += '.attachment video, .attachment img';
        }

        const hasAspecter = !!this.bubbles[id].querySelector('.media-container-aspecter');
        let elements = this.bubbles[id].querySelectorAll(str) as NodeListOf<HTMLElement>;
        const parents: Set<HTMLElement> = new Set();
        Array.from(elements).forEach((element: HTMLElement) => {
          if(hasAspecter && !findUpClassName(element, 'media-container-aspecter')) return;
          let albumItem = findUpClassName(element, 'album-item');
          const parent = albumItem || element.parentElement;
          if(parents.has(parent)) return;
          parents.add(parent);
          targets.push({
            element,
            mid: +albumItem?.dataset.mid || id,
            peerId: this.peerId
          });
        });
      });

      targets.sort((a, b) => a.mid - b.mid);

      let idx = targets.findIndex(t => t.mid === messageId);

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
        inputFilter: 'inputMessagesFilterPhotoVideo'
      })
      .openMedia(message, targets[idx].element, 0, true, targets.slice(0, idx), targets.slice(idx + 1));
      
      cancelEvent(e);
      //appMediaViewer.openMedia(message, target as HTMLImageElement);
      return;
    }
    
    if(['IMG', 'DIV', 'SPAN'/* , 'A' */].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');
    
    if(['DIV', 'SPAN'].indexOf(target.tagName) !== -1/*  || target.tagName === 'A' */) {
      if(target.classList.contains('goto-original')) {
        const savedFrom = bubble.dataset.savedFrom;
        const splitted = savedFrom.split('_');
        const peerId = +splitted[0];
        const msgId = +splitted[1];
        ////this.log('savedFrom', peerId, msgID);
        this.chat.appImManager.setInnerPeer(peerId, msgId);
        return;
      } else if(target.classList.contains('forward')) {
        const mid = +bubble.dataset.mid;
        const message = this.appMessagesManager.getMessageByPeer(this.peerId, mid);
        new PopupForward(this.peerId, this.appMessagesManager.getMidsByMessage(message));
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

        const message = this.chat.getMessage(bubbleMid) as Message.message;

        const replyToPeerId = message.reply_to.reply_to_peer_id ? this.appPeersManager.getPeerId(message.reply_to.reply_to_peer_id) : this.peerId;
        const replyToMid = message.reply_to.reply_to_msg_id;

        this.chat.appImManager.setInnerPeer(replyToPeerId, replyToMid, this.chat.type, this.chat.threadId);

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

  public onGoDownClick() {
    if(this.replyFollowHistory.length) {
      forEachReverse(this.replyFollowHistory, (mid, idx) => {
        const bubble = this.bubbles[mid];
        let bad = true;
        if(bubble) {
          const rect = bubble.getBoundingClientRect();
          bad = (this.appPhotosManager.windowH / 2) > rect.top;
        } else {
          const message = this.chat.getMessage(mid);
          if(!message.deleted) {
            bad = false;
          }
        }
  
        if(bad) {
          this.replyFollowHistory.splice(idx, 1);
        }
      });

      this.replyFollowHistory.sort((a, b) => b - a);

      const mid = this.replyFollowHistory.pop();
      this.chat.setMessageId(mid);
    } else {
      this.chat.setMessageId(/* , dialog.top_message */);
      // const dialog = this.appMessagesManager.getDialogByPeerId(this.peerId)[0];
      
      // if(dialog) {
      //   this.chat.setPeer(this.peerId/* , dialog.top_message */);
      // } else {
      //   this.log('will scroll down 3');
      //   this.scroll.scrollTop = this.scroll.scrollHeight;
      // }
    }
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

  public getGroupedBubble(groupId: string) {
    const group = this.appMessagesManager.groupedMessagesStorage[groupId];
    for(const mid in group) {
      if(this.bubbles[mid]) {
        const maxId = Math.max(...Object.keys(group).map(id => +id)); // * because in scheduled album can be rendered by lowest mid during sending
        return {
          bubble: this.bubbles[mid], 
          mid: +mid,
          message: this.chat.getMessage(maxId)
        };
      }
    }

    return null;
  }

  public getBubbleGroupedItems(bubble: HTMLElement) {
    return Array.from(bubble.querySelectorAll('.grouped-item')) as HTMLElement[];
  }

  public getMountedBubble(mid: number, message = this.chat.getMessage(mid)) {
    if(message.grouped_id && this.appMessagesManager.getMidsByAlbum(message.grouped_id).length > 1) {
      const a = this.getGroupedBubble(message.grouped_id);
      if(a) {
        a.bubble = a.bubble.querySelector(`.document-container[data-mid="${mid}"]`) || a.bubble;
        return a;
      }
    }

    const bubble = this.bubbles[mid];
    if(!bubble) return;

    return {bubble, mid, message};
  }

  private findNextMountedBubbleByMsgId(mid: number) {
    return this.bubbles[getObjectKeysAndSort(this.bubbles).find(id => {
      if(id < mid) return false;
      return !!this.bubbles[id]?.parentElement;
    })];
  }

  public loadMoreHistory(top: boolean, justLoad = false) {
    //this.log('loadMoreHistory', top);
    if(!this.peerId || 
      /* TEST_SCROLL || */ 
      this.chat.setPeerPromise || 
      this.isHeavyAnimationInProgress || 
      (top && (this.getHistoryTopPromise || this.scrollable.loadedAll.top)) || 
      (!top && (this.getHistoryBottomPromise || this.scrollable.loadedAll.bottom))
    ) {
      return;
    }

    // warning, если иды только отрицательные то вниз не попадёт (хотя мб и так не попадёт)
    const history = Object.keys(this.bubbles).map(id => +id).sort((a, b) => a - b);
    if(!history.length) return;
    
    if(top) {
      if(DEBUG) {
        this.log('Will load more (up) history by id:', history[0], 'maxId:', history[history.length - 1], justLoad/* , history */);
      }

      /* if(history.length === 75) {
        this.log('load more', this.scrollable.scrollHeight, this.scrollable.scrollTop, this.scrollable);
        return;
      } */
      /* false &&  */this.getHistory(history[0], true, undefined, undefined, justLoad);
    } else {
      //let dialog = this.appMessagesManager.getDialogByPeerId(this.peerId)[0];
      const historyStorage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
          
      // if scroll down after search
      if(history.indexOf(historyStorage.maxId) !== -1) {
        this.setLoaded('bottom', true);
        return;
      }

      if(DEBUG) {
        this.log('Will load more (down) history by id:', history[history.length - 1], justLoad/* , history */);
      }

      /* false &&  */this.getHistory(history[history.length - 1], false, true, undefined, justLoad);
    }
  }

  public onScroll = () => {
    //return;
    
    // * В таком случае, кнопка не будет моргать если чат в самом низу, и правильно отработает случай написания нового сообщения и проскролла вниз
    if(this.isHeavyAnimationInProgress && this.scrolledDown) return;
      //lottieLoader.checkAnimations(false, 'chat');

    if(!isTouchSupported) {
      if(this.isScrollingTimeout) {
        clearTimeout(this.isScrollingTimeout);
      } else if(!this.chatInner.classList.contains('is-scrolling')) {
        this.chatInner.classList.add('is-scrolling');
      }
  
      this.isScrollingTimeout = window.setTimeout(() => {
        this.chatInner.classList.remove('is-scrolling');
        this.isScrollingTimeout = 0;
      }, 1350);
    }
    
    if(this.scrollable.getDistanceToEnd() < 300 && this.scrollable.loadedAll.bottom) {
      this.bubblesContainer.classList.add('scrolled-down');
      this.scrolledDown = true;
    } else if(this.bubblesContainer.classList.contains('scrolled-down')) {
      this.bubblesContainer.classList.remove('scrolled-down');
      this.scrolledDown = false;
    }

    if(this.chat.topbar.pinnedMessage) {
      this.chat.topbar.pinnedMessage.setCorrectIndex(this.scrollable.lastScrollDirection);
    }
  };

  public setScroll() {
    this.scrollable = new Scrollable(null, 'IM', /* 10300 */300);
    this.setLoaded('top', false);
    this.setLoaded('bottom', false);

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

    if(isTouchSupported) {
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

  public updateUnreadByDialog() {
    const historyStorage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
    const maxId = this.peerId === rootScope.myId ? historyStorage.readMaxId : historyStorage.readOutboxMaxId;
    
    ///////this.log('updateUnreadByDialog', maxId, dialog, this.unreadOut);
    
    for(const msgId of this.unreadOut) {
      if(msgId > 0 && msgId <= maxId) {
        const bubble = this.bubbles[msgId];
        if(bubble) {
          bubble.classList.remove('is-sent', 'is-sending'); // is-sending can be when there are bulk of updates (e.g. sending command to Stickers bot)
          bubble.classList.add('is-read');
        }
        
        this.unreadOut.delete(msgId);
      }
    }
  }
  
  public deleteMessagesByIds(mids: number[], permanent = true) {
    mids.forEach(mid => {
      if(!(mid in this.bubbles)) return;
      
      /* const mounted = this.getMountedBubble(mid);
      if(!mounted) return; */

      const bubble = this.bubbles[mid];
      delete this.bubbles[mid];
      this.skippedMids.delete(mid);

      if(this.firstUnreadBubble === bubble) {
        this.firstUnreadBubble = null;
      }

      this.bubbleGroups.removeBubble(bubble);
      if(this.unreadedObserver) {
        this.unreadedObserver.unobserve(bubble);
        this.unreaded.delete(bubble);
      }
      if(this.viewsObserver) {
        this.viewsObserver.unobserve(bubble);
        this.viewsMids.delete(mid);
      }
      //this.unreaded.findAndSplice(mid => mid === id);
      bubble.remove();
      //bubble.remove();

      if(this.emptyPlaceholderMid === mid) {
        this.emptyPlaceholderMid = undefined;
      }
    });

    if(permanent && this.chat.selection.isSelecting) {
      this.chat.selection.deleteSelectedMids(mids);
    }
    
    animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP);
    this.deleteEmptyDateGroups();
  }
  
  public renderNewMessagesByIds(mids: number[], scrolledDown = this.scrolledDown) {
    if(!this.scrollable.loadedAll.bottom) { // seems search active or sliced
      //this.log('renderNewMessagesByIds: seems search is active, skipping render:', mids);
      return;
    }

    if(this.chat.threadId) {
      mids = mids.filter(mid => {
        const message = this.chat.getMessage(mid);
        const replyTo = message.reply_to as MessageReplyHeader;
        return replyTo && (replyTo.reply_to_top_id || replyTo.reply_to_msg_id) === this.chat.threadId;
      });
    }

    mids = mids.filter(mid => !this.bubbles[mid]);
    // ! should scroll even without new messages
    /* if(!mids.length) {
      return;
    } */

    const promise = this.performHistoryResult(mids, false, true);
    if(scrolledDown) {
      promise.then(() => {
        //this.log('renderNewMessagesByIDs: messagesQueuePromise after', this.scrollable.isScrolledDown);
        //this.scrollable.scrollTo(this.scrollable.scrollHeight, 'top', true, true, 5000);
        //const bubble = this.bubbles[Math.max(...mids)];
        this.scrollToBubbleEnd();

        //this.scrollable.scrollIntoViewNew(this.chatInner, 'end');

        /* setTimeout(() => {
          this.log('messagesQueuePromise afterafter:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        }, 10); */
      });
    }
  }

  public scrollToBubble(
    element: HTMLElement, 
    position: ScrollLogicalPosition,
    forceDirection?: FocusDirection,
    forceDuration?: number
  ) {
    // * 4 = .25rem
    const bubble = findUpClassName(element, 'bubble');

    // * if it's a start, then scroll to start of the group
    if(position === 'center' && whichChild(bubble) === (this.stickyIntersector ? 2 : 1)) {
      const dateGroup = bubble.parentElement;
      if(whichChild(dateGroup) === 0) {
        element = dateGroup;
        position = 'start';
      }
    }

    return this.scrollable.scrollIntoViewNew(element, position, 4, undefined, forceDirection, forceDuration);
  }

  public scrollToBubbleEnd(bubble?: HTMLElement) {
    if(!bubble) {
      const lastDateGroup = this.getLastDateGroup();
      if(lastDateGroup) {
        bubble = lastDateGroup.lastElementChild as HTMLElement;
      }
    }
    /* if(DEBUG) {
      this.log('scrollToNewLastBubble: will scroll into view:', bubble);
    } */

    if(bubble) {
      this.scrollingToNewBubble = bubble;
      this.scrollToBubble(bubble, 'end').then(() => {
        this.scrollingToNewBubble = null;
      });
    }
  }

  // ! can't get it by chatInner.lastElementChild because placeholder can be the last...
  private getLastDateGroup() {
    let lastTime = 0, lastElem: HTMLElement;
    for(const i in this.dateMessages) {
      const dateMessage = this.dateMessages[i];
      if(dateMessage.firstTimestamp > lastTime) {
        lastElem = dateMessage.container;
        lastTime = dateMessage.firstTimestamp;
      }
    }

    return lastElem;
  }

  public scrollToBubbleIfLast(bubble: HTMLElement) {
    if(bubble.parentElement.lastElementChild === bubble && 
      this.getLastDateGroup().parentElement.lastElementChild === bubble.parentElement) {
      this.scrollToBubbleEnd(bubble);
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

  public getDateContainerByMessage(message: any, reverse: boolean) {
    const date = new Date(message.date * 1000);
    date.setHours(0, 0, 0);
    const dateTimestamp = date.getTime();
    if(!(dateTimestamp in this.dateMessages)) {
      let dateElement: HTMLElement;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if(today.getTime() === date.getTime()) {
        dateElement = i18n(this.chat.type === 'scheduled' ? 'Chat.Date.ScheduledForToday' : 'Date.Today');
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

        if(this.chat.type === 'scheduled') {
          dateElement = i18n('Chat.Date.ScheduledFor', [dateElement]);
        }
      }

      /* if(this.chat.type === 'scheduled') {
        str = 'Scheduled for ' + str;
      } */
      
      const div = document.createElement('div');
      div.className = 'bubble service is-date';
      const bubbleContent = document.createElement('div');
      bubbleContent.classList.add('bubble-content');
      const serviceMsg = document.createElement('div');
      serviceMsg.classList.add('service-msg');

      serviceMsg.append(dateElement);

      bubbleContent.append(serviceMsg);
      div.append(bubbleContent);
      ////////this.log('need to render date message', dateTimestamp, str);

      const container = document.createElement('div');
      container.className = 'bubbles-date-group';

      const haveTimestamps = getObjectKeysAndSort(this.dateMessages, 'asc');
      let i = 0;
      for(; i < haveTimestamps.length; ++i) {
        const t = haveTimestamps[i];
        if(dateTimestamp < t) {
          break;
        }
      }
      
      this.dateMessages[dateTimestamp] = {
        div,
        container,
        firstTimestamp: date.getTime()
      };

      container.append(div);

      positionElementByIndex(container, this.chatInner, i);

      /* if(reverse) {
        this.chatInner.prepend(container);
      } else {
        this.chatInner.append(container);
      } */

      if(this.stickyIntersector) {
        this.stickyIntersector.observeStickyHeaderChanges(container);
      }
    }

    return this.dateMessages[dateTimestamp];
  }

  public destroy() {
    //this.chat.log.error('Bubbles destroying');

    this.scrollable.onScrolledTop = this.scrollable.onScrolledBottom = this.scrollable.onAdditionalScroll = null;

    this.listenerSetter.removeAll();

    this.lazyLoadQueue.clear();
    this.unreadedObserver && this.unreadedObserver.disconnect();
    this.viewsObserver && this.viewsObserver.disconnect();
    this.stickyIntersector && this.stickyIntersector.disconnect();

    delete this.lazyLoadQueue;
    this.unreadedObserver && delete this.unreadedObserver;
    this.viewsObserver && delete this.viewsObserver;
    this.stickyIntersector && delete this.stickyIntersector;
  }

  public cleanup(bubblesToo = false) {
    ////console.time('appImManager cleanup');
    this.setLoaded('top', false);
    this.setLoaded('bottom', false);

    // cancel scroll
    cancelAnimationByKey(this.scrollable.container);

    // do not wait ending of previous scale animation
    interruptHeavyAnimation();

    if(TEST_SCROLL !== undefined) {
      TEST_SCROLL = TEST_SCROLL_TIMES;
    }

    this.bubbles = {};
    this.skippedMids.clear();
    this.dateMessages = {};
    this.bubbleGroups.cleanup();
    this.unreadOut.clear();
    this.needUpdate.length = 0;
    this.lazyLoadQueue.clear();
    
    // clear messages
    if(bubblesToo) {
      this.scrollable.container.textContent = '';
    }
    
    this.firstUnreadBubble = null;
    this.attachedUnreadBubble = false;
    
    this.messagesQueue.length = 0;
    this.messagesQueuePromise = null;
    
    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;
    this.fetchNewPromise = undefined;
    
    if(this.stickyIntersector) {
      this.stickyIntersector.disconnect();
    }
    
    if(this.unreadedObserver) {
      this.unreadedObserver.disconnect();
      this.unreaded.clear();
      this.unreadedSeen.clear();
      this.readPromise = undefined;
    }

    if(this.viewsObserver) {
      this.viewsObserver.disconnect();
      this.viewsMids.clear();
    }
    
    this.loadedTopTimes = this.loadedBottomTimes = 0;
    
    this.middleware.clean();
    
    this.onAnimateLadder = undefined;
    this.resolveLadderAnimation = undefined;
    this.emptyPlaceholderMid = undefined;
    ////console.timeEnd('appImManager cleanup');
  }

  public setPeer(peerId: number, lastMsgId?: number): {cached?: boolean, promise: Chat['setPeerPromise']} {
    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(!peerId) {
      this.cleanup(true);
      this.peerId = 0;
      return null;
    }

    const samePeer = this.peerId === peerId;

    /* if(samePeer && this.chat.setPeerPromise) {
      return {cached: true, promise: this.chat.setPeerPromise};
    } */

    this.historyStorage = this.appMessagesManager.getHistoryStorage(peerId, this.chat.threadId);
    let topMessage = this.chat.type === 'pinned' ? this.appMessagesManager.pinnedMessages[peerId].maxId : this.historyStorage.maxId ?? 0;
    const isTarget = lastMsgId !== undefined;

    // * this one will fix topMessage for null message in history (e.g. channel comments with only 1 comment and it is a topMessage)
    /* if(this.chat.type !== 'pinned' && topMessage && !historyStorage.history.slice.includes(topMessage)) {
      topMessage = 0;
    } */

    let readMaxId = 0, savedPosition: ReturnType<AppImManager['getChatSavedPosition']>;
    if(!isTarget) {
      if(!samePeer) {
        savedPosition = this.chat.appImManager.getChatSavedPosition(this.chat);
      }

      if(savedPosition) {
        
      } else if(topMessage) {
        readMaxId = this.appMessagesManager.getReadMaxIdIfUnread(peerId, this.chat.threadId);
        if(/* dialog.unread_count */readMaxId && !samePeer) {
          lastMsgId = readMaxId;
        } else {
          lastMsgId = topMessage;
          //lastMsgID = topMessage;
        }
      }
    }

    const isJump = lastMsgId !== topMessage;
    
    if(samePeer) {
      const mounted = this.getMountedBubble(lastMsgId);
      if(mounted) {
        if(isTarget) {
          this.scrollToBubble(mounted.bubble, 'center');
          this.highlightBubble(mounted.bubble);
          this.chat.dispatchEvent('setPeer', lastMsgId, false);
        } else if(topMessage && !isJump) {
          //this.log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          this.scrollable.scrollTop = this.scrollable.scrollHeight;
          this.chat.dispatchEvent('setPeer', lastMsgId, true);
        }
        
        return null;
      }
    } else {
      if(this.peerId) { // * set new queue id if new peer (setting not from 0)
        this.lazyLoadQueue.queueId = ++queueId;
        this.chat.apiManager.setQueueId(this.chat.bubbles.lazyLoadQueue.queueId);
      }

      this.peerId = peerId;
      this.replyFollowHistory.length = 0;

      this.passEntities = {
        messageEntityBotCommand: this.appPeersManager.isAnyGroup(this.peerId) || this.appUsersManager.isBot(this.peerId)
      };
    }

    if(DEBUG) {
      this.log('setPeer peerId:', this.peerId, this.historyStorage, lastMsgId, topMessage);
    }

    // add last message, bc in getHistory will load < max_id
    const additionMsgId = isJump || this.chat.type === 'scheduled' ? 0 : topMessage;

    /* this.setPeerPromise = null;
    this.preloader.detach();
    return true; */

    //////appSidebarRight.toggleSidebar(true);

    let maxBubbleId = 0;
    if(samePeer) {
      let el = this.getBubbleByPoint('bottom'); // ! this may not work if being called when chat is hidden
      //this.chat.log('[PM]: setCorrectIndex: get last element perf:', performance.now() - perf, el);
      if(el) {
        maxBubbleId = +el.dataset.mid;
      }

      if(maxBubbleId <= 0) {
        maxBubbleId = Math.max(...Object.keys(this.bubbles).map(mid => +mid));
      }
    } else {
      this.isFirstLoad = true;
    }

    const oldChatInner = this.chatInner;
    this.cleanup();
    this.chatInner = document.createElement('div');
    if(samePeer) {
      this.chatInner.className = oldChatInner.className;
      this.chatInner.classList.remove('disable-hover', 'is-scrolling');
    } else {
      this.chatInner.classList.add('bubbles-inner');
    }

    this.lazyLoadQueue.lock();

    let result: ReturnType<ChatBubbles['getHistory']>;
    if(!savedPosition) {
      result = this.getHistory(lastMsgId, true, isJump, additionMsgId);
    } else {
      result = {
        promise: getHeavyAnimationPromise().then(() => {
          return this.performHistoryResult(savedPosition.mids, true, false, undefined);
        }) as any,
        cached: true
      };
    }

    const {promise, cached} = result;

    // clear 
    if(!cached) {
      if(!samePeer) {
        this.scrollable.container.textContent = '';
        //oldChatInner.remove();
        this.chat.finishPeerChange(isTarget, isJump, lastMsgId);
        this.preloader.attach(this.bubblesContainer);
      }
    }

    //console.timeEnd('appImManager setPeer pre promise');
    /* this.ladderDeferred && this.ladderDeferred.resolve();
    this.ladderDeferred = deferredPromise<void>(); */
    
    animationIntersector.lockGroup(CHAT_ANIMATION_GROUP);
    const setPeerPromise = promise.then(() => {
      ////this.log('setPeer removing preloader');

      if(cached) {
        if(!samePeer) {
          this.chat.finishPeerChange(isTarget, isJump, lastMsgId); // * костыль
        }
      } else {
        this.preloader.detach();
      }

      if(this.resolveLadderAnimation) {
        this.resolveLadderAnimation();
        this.resolveLadderAnimation = undefined;
      }

      // this.ladderDeferred.resolve();

      this.scrollable.lastScrollDirection = 0;
      this.scrollable.lastScrollTop = 0;
      replaceContent(this.scrollable.container, this.chatInner);

      animationIntersector.unlockGroup(CHAT_ANIMATION_GROUP);
      animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP/* , true */);

      //fastRaf(() => {
        this.lazyLoadQueue.unlock();
      //});

      //if(dialog && lastMsgID && lastMsgID !== topMessage && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
      if(savedPosition) {
        this.scrollable.scrollTop = savedPosition.top;
        /* const mountedByLastMsgId = this.getMountedBubble(lastMsgId);
        let bubble: HTMLElement = mountedByLastMsgId?.bubble;
        if(!bubble?.parentElement) {
          bubble = this.findNextMountedBubbleByMsgId(lastMsgId);
        }

        if(bubble) {
          const top = bubble.getBoundingClientRect().top;
          const distance = savedPosition.top - top;
          this.scrollable.scrollTop += distance;
        } */
      } else if((topMessage && isJump) || isTarget) {
        const fromUp = maxBubbleId > 0 && (maxBubbleId < lastMsgId || lastMsgId < 0);
        const followingUnread = readMaxId === lastMsgId && !isTarget;
        if(!fromUp && samePeer) {
          this.scrollable.scrollTop = 99999;
        } else if(fromUp/*  && (samePeer || forwardingUnread) */) {
          this.scrollable.scrollTop = 0;
        }

        const mountedByLastMsgId = this.getMountedBubble(lastMsgId);
        let bubble: HTMLElement = (followingUnread && this.firstUnreadBubble) || mountedByLastMsgId?.bubble;
        if(!bubble?.parentElement) {
          bubble = this.findNextMountedBubbleByMsgId(lastMsgId);
        }
        
        // ! sometimes there can be no bubble
        if(bubble) {
          this.scrollToBubble(bubble, followingUnread ? 'start' : 'center', !samePeer ? FocusDirection.Static : undefined);
          if(!followingUnread) {
            this.highlightBubble(bubble);
          }
        }
      } else {
        this.scrollable.scrollTop = 99999;
      }

      this.onScroll();

      const middleware = this.getMiddleware();
      const afterSetPromise = Promise.all([setPeerPromise, getHeavyAnimationPromise()]);
      afterSetPromise.then(() => { // check whether list isn't full
        this.scrollable.checkForTriggers();
      });

      this.chat.dispatchEvent('setPeer', lastMsgId, !isJump);

      const needFetchInterval = this.appMessagesManager.isFetchIntervalNeeded(peerId);
      const needFetchNew = savedPosition || needFetchInterval;
      if(!needFetchNew) {
        // warning
        if(!lastMsgId || this.bubbles[topMessage] || lastMsgId === topMessage) {
          this.setLoaded('bottom', true);
        }
      } else {
        afterSetPromise.then(() => {
          if(!middleware()) {
            return;
          }

          this.scrollable.checkForTriggers();

          if(needFetchInterval) {
            const f = () => {
              this.fetchNewPromise = new Promise<void>((resolve) => {
                if(!middleware() || !this.appMessagesManager.isFetchIntervalNeeded(peerId)) {
                  resolve();
                  return;
                }
  
                this.appMessagesManager.getNewHistory(peerId, this.chat.threadId).then((historyStorage) => {
                  if(!middleware() || !historyStorage) {
                    resolve();
                    return;
                  }
  
                  const slice = historyStorage.history.slice;
                  const isBottomEnd = slice.isEnd(SliceEnd.Bottom);
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
        });
      }
      
      this.log('scrolledAllDown:', this.scrollable.loadedAll.bottom);

      //if(!this.unreaded.length && dialog) { // lol
      if(this.scrollable.loadedAll.bottom && topMessage && !this.unreaded.size) { // lol
        this.onScrolledAllDown();
      }

      if(this.chat.type === 'chat') {
        const dialog = this.appMessagesManager.getDialogOnly(peerId);
        if(dialog?.pFlags.unread_mark) {
          this.appMessagesManager.markDialogUnread(peerId, true);
        }
      }

      //this.chatInner.classList.remove('disable-hover', 'is-scrolling'); // warning, performance!

      /* if(!document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
        return new Promise<void>((resolve) => fastRaf(resolve));
      } */
      //console.timeEnd('appImManager setPeer');
    }).catch(err => {
      this.log.error('getHistory promise error:', err);
      this.preloader.detach();
      throw err;
    });

    return {cached, promise: setPeerPromise};
  }

  public onScrolledAllDown() {
    if(this.chat.type === 'chat' || this.chat.type === 'discussion') {
      const storage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
      this.appMessagesManager.readHistory(this.peerId, storage.maxId, this.chat.threadId, true);
    }
  }

  public finishPeerChange() {
    const peerId = this.peerId;
    const isChannel = this.appPeersManager.isChannel(peerId);
    const canWrite = this.appMessagesManager.canWriteToPeer(peerId, this.chat.threadId);
    
    this.chatInner.classList.toggle('has-rights', canWrite);
    this.bubblesContainer.classList.toggle('is-chat-input-hidden', !canWrite);

    this.chatInner.classList.toggle('is-chat', this.chat.isAnyGroup());
    this.chatInner.classList.toggle('is-channel', isChannel);
  }

  public renderMessagesQueue(message: any, bubble: HTMLElement, reverse: boolean, promises: Promise<any>[]) {
    /* let dateMessage = this.getDateContainerByMessage(message, reverse);
    if(reverse) dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
    else dateMessage.container.append(bubble);
    return; */

    /* if(DEBUG && message.mid === 4314759167) {
      this.log('renderMessagesQueue', message, bubble, reverse, promises);
    } */

    this.messagesQueue.push({message, bubble, reverse, promises});

    this.setMessagesQueuePromise();    
  }

  public setMessagesQueuePromise() {
    if(this.messagesQueuePromise || !this.messagesQueue.length) return;

    this.messagesQueuePromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        const queue = this.messagesQueue.slice();
        this.messagesQueue.length = 0;

        const promises = queue.reduce((acc, {promises}) => acc.concat(promises), []);

        // * это нужно для того, чтобы если захочет подгрузить reply или какое-либо сообщение, то скролл не прервался
        // * если добавить этот промис - в таком случае нужно сделать, чтобы скроллило к последнему сообщению после рендера
        // promises.push(getHeavyAnimationPromise());

        this.log('promises to call', promises, queue, this.isHeavyAnimationInProgress);
        const middleware = this.getMiddleware();
        Promise.all(promises).then(() => {
          if(!middleware()) {
            throw 'setMessagesQueuePromise: peer changed!';
          }

          if(this.messagesQueueOnRender) {
            this.messagesQueueOnRender();
          }

          if(this.messagesQueueOnRenderAdditional) {
            this.messagesQueueOnRenderAdditional();
          }

          queue.forEach(({message, bubble, reverse}) => {
            this.setBubblePosition(bubble, message, reverse);
          });

          //setTimeout(() => {
            resolve();
          //}, 500);
          this.messagesQueuePromise = null;

          if(this.messagesQueue.length) {
            this.setMessagesQueuePromise();
          }

          this.setUnreadDelimiter(); // не нашёл места лучше
        }).catch(reject);
      }, 0);
    });

    //this.messagesQueuePromise.catch(() => {});
  }

  public setBubblePosition(bubble: HTMLElement, message: any, reverse: boolean) {
    if(message.id < 0) {
      this.chatInner.prepend(bubble);
      return;
    }

    const dateMessage = this.getDateContainerByMessage(message, reverse);
    if(this.chat.type === 'scheduled' || this.chat.type === 'pinned'/*  || true */) { // ! TEMP COMMENTED
      const offset = this.stickyIntersector ? 2 : 1;
      let children = Array.from(dateMessage.container.children).slice(offset) as HTMLElement[];
      let i = 0, foundMidOnSameTimestamp = 0;
      for(; i < children.length; ++i) {
        const t = children[i];
        const timestamp = +t.dataset.timestamp;
        if(message.date < timestamp) {
          break;
        } else if(message.date === timestamp) {
          foundMidOnSameTimestamp = +t.dataset.mid;
        }
        
        if(foundMidOnSameTimestamp && message.mid < foundMidOnSameTimestamp) {
          break;
        }
      }
  
      // * 1 for date, 1 for date sentinel
      let index = offset + i;
      /* if(bubble.parentElement) { // * if already mounted
        const currentIndex = whichChild(bubble);
        if(index > currentIndex) {
          index -= 1; // * minus for already mounted
        }
      } */
  
      positionElementByIndex(bubble, dateMessage.container, index);
    } else {
      if(reverse) {
        dateMessage.container.insertBefore(bubble, dateMessage.container.children[this.stickyIntersector ? 1 : 0].nextSibling);
      } else {
        dateMessage.container.append(bubble);
      }
    }

    if(message._ === 'message') {
      this.bubbleGroups.addBubble(bubble, message, reverse);
    } else {
      bubble.classList.add('is-group-first', 'is-group-last');
    }
  }

  public getMiddleware() {
    return this.middleware.get();
  }
  
  // reverse means top
  private renderMessage(message: any, reverse = false, multipleRender = false, bubble: HTMLDivElement = null, updatePosition = true) {
    /* if(DEBUG) {
      this.log.debug('message to render:', message);
    } */
    if(!bubble && this.bubbles[message.mid]) {
      return;
    }

    //return;
    const albumMustBeRenderedFull = this.chat.type !== 'pinned';
    if(message.deleted) return;
    else if(message.grouped_id && albumMustBeRenderedFull) { // will render only last album's message
      const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
      const maxId = Math.max(...Object.keys(storage).map(i => +i));
      if(message.mid < maxId) {
        return;
      }
    }
    
    const peerId = this.peerId;
    // * can't use 'message.pFlags.out' here because this check will be used to define side of message (left-right)
    const our = message.fromId === rootScope.myId || (message.pFlags.out && this.appPeersManager.isMegagroup(this.peerId));
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    //messageDiv.innerText = message.message;

    let bubbleContainer: HTMLDivElement;
    let contentWrapper: HTMLElement;
    
    // bubble
    if(!bubble) {
      contentWrapper = document.createElement('div');
      contentWrapper.classList.add('bubble-content-wrapper');
      
      bubbleContainer = document.createElement('div');
      bubbleContainer.classList.add('bubble-content');
      
      bubble = document.createElement('div');
      bubble.classList.add('bubble');
      contentWrapper.appendChild(bubbleContainer);
      bubble.appendChild(contentWrapper);

      if(!our && !message.pFlags.out && this.unreadedObserver) {
        //this.log('not our message', message, message.pFlags.unread);
        const isUnread = message.pFlags.unread || (this.historyStorage.readMaxId !== undefined && this.historyStorage.readMaxId < message.mid);
        if(isUnread) {
          this.unreadedObserver.observe(bubble); 
          this.unreaded.set(bubble, message.mid);
        }
      }
    } else {
      const save = ['is-highlighted', 'is-group-first', 'is-group-last'];
      const wasClassNames = bubble.className.split(' ');
      const classNames = ['bubble'].concat(save.filter(c => wasClassNames.includes(c)));
      bubble.className = classNames.join(' ');

      contentWrapper = bubble.lastElementChild as HTMLElement;
      bubbleContainer = contentWrapper.firstElementChild as HTMLDivElement;
      bubbleContainer.innerHTML = '';
      bubbleContainer.style.cssText = '';
      contentWrapper.innerHTML = '';
      contentWrapper.appendChild(bubbleContainer);
      //bubbleContainer.style.marginBottom = '';
      const transitionDelay = contentWrapper.style.transitionDelay;
      contentWrapper.style.cssText = '';
      contentWrapper.style.transitionDelay = transitionDelay;

      if(bubble === this.firstUnreadBubble) {
        bubble.classList.add('is-first-unread');
      }

      // * Нужно очистить прошлую информацию, полезно если удалить последний элемент из альбома в ПОСЛЕДНЕМ БАББЛЕ ГРУППЫ (видно по аватару)
      const originalMid = +bubble.dataset.mid;
      const sameMid = +message.mid === originalMid;
      /* if(updatePosition) {
        bubble.remove(); // * for positionElementByIndex
      } */

      if(!sameMid) {
        delete this.bubbles[originalMid];
        this.skippedMids.delete(originalMid);
      }

      //bubble.innerHTML = '';
    }

    // ! reset due to album edit or delete item
    this.bubbles[+message.mid] = bubble;
    bubble.dataset.mid = message.mid;
    bubble.dataset.timestamp = message.date;

    const loadPromises: Promise<any>[] = [];

    if(message._ === 'messageService') {
      assumeType<Message.messageService>(message);

      const action = message.action;
      if(action) {
        const _ = action._;
        if(IGNORE_ACTIONS.has(_) || (langPack.hasOwnProperty(_) && !langPack[_])) {
          this.skippedMids.add(+message.mid);
          return bubble;
        }
      }

      bubble.className = 'bubble service';

      bubbleContainer.innerHTML = '';
      const s = document.createElement('div');
      s.classList.add('service-msg');
      if(action) {
        if(action._ === 'messageActionChannelMigrateFrom') {
          s.append(i18n('ChatMigration.From', [new PeerTitle({peerId: -action.chat_id}).element]));
        } else if(action._ === 'messageActionChatMigrateTo') {
          s.append(i18n('ChatMigration.To', [new PeerTitle({peerId: -action.channel_id}).element]));
        } else {
          s.append(this.appMessagesManager.wrapMessageActionTextNew(message));
        }
      }
      bubbleContainer.append(s);

      if(updatePosition) {
        this.renderMessagesQueue(message, bubble, reverse, loadPromises);

        if(message.pFlags.is_single) { // * Ignore 'Discussion started'
          bubble.classList.add('is-group-last');
        }
      }

      return bubble;
    }

    let messageMedia = message.media;

    let messageMessage: string, totalEntities: MessageEntity[];
    if(messageMedia?.document && !['video', 'gif'].includes(messageMedia.document.type)) {
      // * just filter these cases for documents caption
    } else if(message.grouped_id && albumMustBeRenderedFull) {
      const t = this.appMessagesManager.getAlbumText(message.grouped_id);
      messageMessage = t.message;
      //totalEntities = t.entities;
      totalEntities = t.totalEntities;
    } else if(messageMedia?.document?.type !== 'sticker') {
      messageMessage = message.message;
      //totalEntities = message.entities;
      totalEntities = message.totalEntities;
    }
    
    /* let richText = RichTextProcessor.wrapRichText(messageMessage, {
      entities: totalEntities
    }); */
    let richText = RichTextProcessor.wrapRichText(messageMessage, {
      entities: totalEntities,
      passEntities: this.passEntities
    });

    let canHaveTail = true;
    
    let needToSetHTML = true;
    if(totalEntities && !messageMedia) {
      let emojiEntities = totalEntities.filter((e) => e._ === 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
      
      if(emojiStrLength === strLength && emojiEntities.length <= 3) {
        if(rootScope.settings.emoji.big) {
          let sticker = this.appStickersManager.getAnimatedEmojiSticker(messageMessage);
          if(emojiEntities.length === 1 && !messageMedia && sticker) {
            messageMedia = {
              _: 'messageMediaDocument',
              document: sticker
            };
          } else {
            let attachmentDiv = document.createElement('div');
            attachmentDiv.classList.add('attachment');
            
            attachmentDiv.innerHTML = richText;
            
            bubble.classList.add('emoji-' + emojiEntities.length + 'x');
            
            bubbleContainer.append(attachmentDiv);
          }

          bubble.classList.add('is-message-empty', 'emoji-big');
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
    
    const timeSpan = MessageRender.setTime(this.chat, message, bubble, bubbleContainer, messageDiv);
    bubbleContainer.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad

    if(message.views && !message.pFlags.is_outgoing && this.viewsObserver) {
      this.viewsObserver.observe(bubble);
    }

    if(message.reply_markup && message.reply_markup._ === 'replyInlineMarkup' && message.reply_markup.rows && message.reply_markup.rows.length) {
      const rows = (message.reply_markup as ReplyMarkup.replyKeyboardMarkup).rows;

      const containerDiv = document.createElement('div');
      containerDiv.classList.add('reply-markup');
      rows.forEach((row) => {
        const buttons = row.buttons;
        if(!buttons || !buttons.length) return;

        const rowDiv = document.createElement('div');
        rowDiv.classList.add('reply-markup-row');

        buttons.forEach((button) => {
          const text = RichTextProcessor.wrapRichText(button.text, {noLinks: true, noLinebreaks: true});

          let buttonEl: HTMLButtonElement | HTMLAnchorElement;
          
          switch(button._) {
            case 'keyboardButtonUrl': {
              const r = RichTextProcessor.wrapRichText(' ', {
                entities: [{
                  _: 'messageEntityTextUrl',
                  length: 1,
                  offset: 0,
                  url: button.url
                }]
              });

              buttonEl = htmlToDocumentFragment(r).firstElementChild as HTMLAnchorElement;
              buttonEl.classList.add('is-link', 'tgico');

              break;
            }

            case 'keyboardButtonSwitchInline': {
              buttonEl = document.createElement('button');
              buttonEl.classList.add('is-switch-inline'/* , 'tgico' */);
              const i = document.createElement('i');
              i.classList.add('forward-icon');
              i.innerHTML = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
                <defs>
                  <path d="M13.55 3.24L13.64 3.25L13.73 3.27L13.81 3.29L13.9 3.32L13.98 3.35L14.06 3.39L14.14 3.43L14.22 3.48L14.29 3.53L14.36 3.59L14.43 3.64L22.23 10.85L22.36 10.99L22.48 11.15L22.57 11.31L22.64 11.48L22.69 11.66L22.72 11.85L22.73 12.04L22.71 12.22L22.67 12.41L22.61 12.59L22.53 12.76L22.42 12.93L22.29 13.09L22.23 13.15L14.43 20.36L14.28 20.48L14.12 20.58L13.95 20.66L13.77 20.72L13.58 20.76L13.4 20.77L13.22 20.76L13.03 20.73L12.85 20.68L12.68 20.61L12.52 20.52L12.36 20.4L12.22 20.27L12.16 20.2L12.1 20.13L12.05 20.05L12.01 19.98L11.96 19.9L11.93 19.82L11.89 19.73L11.87 19.65L11.84 19.56L11.83 19.47L11.81 19.39L11.81 19.3L11.8 19.2L11.8 16.42L11 16.49L10.23 16.58L9.51 16.71L8.82 16.88L8.18 17.09L7.57 17.33L7.01 17.6L6.48 17.91L5.99 18.26L5.55 18.64L5.14 19.05L4.77 19.51L4.43 19.99L4.29 20.23L4.21 20.35L4.11 20.47L4 20.57L3.88 20.65L3.75 20.72L3.62 20.78L3.48 20.82L3.33 20.84L3.19 20.84L3.04 20.83L2.9 20.79L2.75 20.74L2.62 20.68L2.53 20.62L2.45 20.56L2.38 20.5L2.31 20.43L2.25 20.36L2.2 20.28L2.15 20.19L2.11 20.11L2.07 20.02L2.04 19.92L2.02 19.83L2.01 19.73L2 19.63L2.04 17.99L2.19 16.46L2.46 15.05L2.85 13.75L3.35 12.58L3.97 11.53L4.7 10.6L5.55 9.8L6.51 9.12L7.59 8.56L8.77 8.13L10.07 7.83L11.48 7.65L11.8 7.63L11.8 4.8L11.91 4.56L12.02 4.35L12.14 4.16L12.25 3.98L12.37 3.82L12.48 3.68L12.61 3.56L12.73 3.46L12.85 3.38L12.98 3.31L13.11 3.27L13.24 3.24L13.37 3.23L13.46 3.23L13.55 3.24Z" id="b13RmHDQtl"></path>
                </defs>
                <use xlink:href="#b13RmHDQtl" opacity="1" fill="#fff" fill-opacity="1"></use>
              </svg>`;
              buttonEl.append(i);
              attachClickEvent(buttonEl, (e) => {
                cancelEvent(e);

                const botId = message.viaBotId || message.fromId;
                let promise: Promise<number>;
                if(button.pFlags.same_peer) promise = Promise.resolve(this.peerId);
                else promise = this.appInlineBotsManager.checkSwitchReturn(botId).then(peerId => {
                  if(peerId) {
                    return peerId;
                  }
                  
                  return new Promise<number>((resolve, reject) => {
                    new PopupForward(this.peerId, [], (peerId) => {
                      resolve(peerId);
                    }, () => {
                      reject();
                    }, true);
                  });
                });
                
                promise.then(peerId => {
                  const threadId = this.peerId === peerId ? this.chat.threadId : undefined;
                  this.appInlineBotsManager.switchInlineQuery(peerId, threadId, botId, button.query);
                });
              });
              break;
            }

            default: {
              buttonEl = document.createElement('button');
              break;
            }
          }
          
          buttonEl.classList.add('reply-markup-button', 'rp');
          buttonEl.insertAdjacentHTML('beforeend', text);

          ripple(buttonEl);

          rowDiv.append(buttonEl);
        });

        containerDiv.append(rowDiv);
      });

      attachClickEvent(containerDiv, (e) => {
        let target = e.target as HTMLElement;
        
        if(!target.classList.contains('reply-markup-button')) target = findUpClassName(target, 'reply-markup-button');
        if(!target || target.classList.contains('is-link') || target.classList.contains('is-switch-inline')) return;

        cancelEvent(e);

        const column = whichChild(target);
        const row = rows[whichChild(target.parentElement)];

        if(!row.buttons || !row.buttons[column]) {
          this.log.warn('no such button', row, column, message);
          return;
        }

        const button = row.buttons[column];
        this.appInlineBotsManager.callbackButtonClick(this.peerId, message.mid, button);
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
      else status = message.pFlags.unread ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    }

    const messageWithReplies = this.appMessagesManager.getMessageWithReplies(message);
    const withReplies = !!messageWithReplies && message.mid > 0;

    if(withReplies) {
      bubble.classList.add('with-replies');
    }

    const isOut = our && (!message.fwd_from || this.peerId !== rootScope.myId);
    let nameContainer: HTMLElement = bubbleContainer;
    
    // media
    if(messageMedia/*  && messageMedia._ === 'messageMediaPhoto' */) {
      let attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');
      
      if(!messageMessage) {
        bubble.classList.add('is-message-empty');
      }
      
      let processingWebPage = false;
      
      switch(messageMedia._) {
        case 'messageMediaPhoto': {
          const photo = messageMedia.photo;
          ////////this.log('messageMediaPhoto', photo);

          if(!messageMessage) {
            canHaveTail = false;
          }
          
          bubble.classList.add('hide-name', 'photo');
          
          const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
          if(message.grouped_id && Object.keys(storage).length !== 1 && albumMustBeRenderedFull) {
            bubble.classList.add('is-album', 'is-grouped');
            wrapAlbum({
              groupId: message.grouped_id, 
              attachmentDiv,
              middleware: this.getMiddleware(),
              isOut: our,
              lazyLoadQueue: this.lazyLoadQueue,
              chat: this.chat,
              loadPromises,
              noAutoDownload: this.chat.noAutoDownloadMedia,
            });
            
            break;
          }
          
          const withTail = !isAndroid && canHaveTail && !withReplies && USE_MEDIA_TAILS;
          if(withTail) bubble.classList.add('with-media-tail');
          wrapPhoto({
            photo, 
            message,
            container: attachmentDiv,
            withTail, 
            isOut, 
            lazyLoadQueue: this.lazyLoadQueue,
            middleware: this.getMiddleware(),
            loadPromises,
            noAutoDownload: this.chat.noAutoDownloadMedia,
          });

          break;
        }
        
        case 'messageMediaWebPage': {
          processingWebPage = true;
          
          let webpage: WebPage = messageMedia.webpage;
          ////////this.log('messageMediaWebPage', webpage);
          if(webpage._ !== 'webPage') {
            break;
          } 
          
          bubble.classList.add('webpage');
          
          let box = document.createElement('div');
          box.classList.add('web');
          
          let quote = document.createElement('div');
          quote.classList.add('quote');

          let previewResizer: HTMLDivElement, preview: HTMLDivElement;
          const photo: Photo.photo = webpage.photo as any;
          if(photo || webpage.document) {
            previewResizer = document.createElement('div');
            previewResizer.classList.add('preview-resizer');
            preview = document.createElement('div');
            preview.classList.add('preview');
            previewResizer.append(preview);
          }
          
          const doc = webpage.document as MyDocument;
          if(doc) {
            if(doc.type === 'gif' || doc.type === 'video') {
              //if(doc.size <= 20e6) {
              bubble.classList.add('video');
              wrapVideo({
                doc, 
                container: preview, 
                message, 
                boxWidth: mediaSizes.active.webpage.width,
                boxHeight: mediaSizes.active.webpage.height,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: this.getMiddleware(),
                isOut,
                group: CHAT_ANIMATION_GROUP,
                loadPromises,
                noAutoDownload: this.chat.noAutoDownloadMedia,
              });
              //}
            } else {
              const docDiv = wrapDocument({
                message,
                noAutoDownload: this.chat.noAutoDownloadMedia,
                lazyLoadQueue: this.lazyLoadQueue
              });
              preview.append(docDiv);
              preview.classList.add('preview-with-document');
              //messageDiv.classList.add((webpage.type || 'document') + '-message');
              //doc = null;
            }
          }
          
          let quoteTextDiv = document.createElement('div');
          quoteTextDiv.classList.add('quote-text');

          if(previewResizer) {
            quoteTextDiv.append(previewResizer);
          }

          let t: HTMLElement;
          if(webpage.site_name) {
            const html = RichTextProcessor.wrapRichText(webpage.url);
            const a: HTMLAnchorElement = htmlToDocumentFragment(html).firstElementChild as any;
            a.classList.add('webpage-name');
            setInnerHTML(a, RichTextProcessor.wrapEmojiText(webpage.site_name));
            quoteTextDiv.append(a);
            t = a;
          }

          if(webpage.rTitle) {
            let titleDiv = document.createElement('div');
            titleDiv.classList.add('title');
            setInnerHTML(titleDiv, webpage.rTitle);
            quoteTextDiv.append(titleDiv);
            t = titleDiv;
          }

          if(webpage.rDescription) {
            let textDiv = document.createElement('div');
            textDiv.classList.add('text');
            setInnerHTML(textDiv, webpage.rDescription);
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
              this.appPhotosManager.setAttachmentSize(photo, preview, 48, 48, false);

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
              noAutoDownload: this.chat.noAutoDownloadMedia,
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
          let doc = messageMedia.document;

          //this.log('messageMediaDocument', doc, bubble);
          
          if(doc.sticker/*  && doc.size <= 1e6 */) {
            bubble.classList.add('sticker');
            canHaveTail = false;
            
            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }
            
            const sizes = mediaSizes.active;
            const size = bubble.classList.contains('emoji-big') ? sizes.emojiSticker : (doc.animated ? sizes.animatedSticker : sizes.staticSticker);
            this.appPhotosManager.setAttachmentSize(doc, attachmentDiv, size.width, size.height);
            //let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.height = attachmentDiv.style.height;
            bubbleContainer.style.width = attachmentDiv.style.width;
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

            break;
          } else if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round'/*  && doc.size <= 20e6 */) {
            //this.log('never get free 2', doc);

            if(doc.type === 'round' || !messageMessage) {
              canHaveTail = false;
            }
            
            bubble.classList.add('hide-name', doc.type === 'round' ? 'round' : 'video');
            const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
            if(message.grouped_id && Object.keys(storage).length !== 1 && albumMustBeRenderedFull) {
              bubble.classList.add('is-album', 'is-grouped');
  
              wrapAlbum({
                groupId: message.grouped_id, 
                attachmentDiv,
                middleware: this.getMiddleware(),
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue,
                chat: this.chat,
                loadPromises,
                noAutoDownload: this.chat.noAutoDownloadMedia,
              });
            } else {
              const withTail = !isAndroid && !isApple && doc.type !== 'round' && canHaveTail && !withReplies && USE_MEDIA_TAILS;
              if(withTail) bubble.classList.add('with-media-tail');
              wrapVideo({
                doc, 
                container: attachmentDiv, 
                message, 
                boxWidth: mediaSizes.active.regular.width,
                boxHeight: mediaSizes.active.regular.height, 
                withTail, 
                isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: this.getMiddleware(),
                group: CHAT_ANIMATION_GROUP,
                loadPromises,
                noAutoDownload: this.chat.noAutoDownloadMedia,
              });
            }
            
            break;
          } else {
            const newNameContainer = wrapGroupedDocuments({
              albumMustBeRenderedFull,
              message,
              bubble,
              messageDiv,
              chat: this.chat,
              loadPromises,
              noAutoDownload: this.chat.noAutoDownloadMedia,
              lazyLoadQueue: this.lazyLoadQueue
            });

            if(newNameContainer) {
              nameContainer = newNameContainer;
            }

            const lastContainer = messageDiv.lastElementChild.querySelector('.document-message, .document-size, .audio');
            lastContainer && lastContainer.append(timeSpan.cloneNode(true));

            bubble.classList.remove('is-message-empty');
            messageDiv.classList.add((!(['photo', 'pdf'] as MyDocument['type'][]).includes(doc.type) ? doc.type || 'document' : 'document') + '-message');
            processingWebPage = true;
            
            break;
          }

          break;
        }

        case 'messageMediaContact': {
          //this.log('wrapping contact', message);

          const contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerId = '' + messageMedia.user_id;

          messageDiv.classList.add('contact-message');
          processingWebPage = true;

          const texts = [];
          if(message.media.first_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.first_name));
          if(message.media.last_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.last_name));

          contactDiv.innerHTML = `
            <div class="contact-details">
              <div class="contact-name">${texts.join(' ')}</div>
              <div class="contact-number">${message.media.phone_number ? '+' + formatPhoneNumber(message.media.phone_number).formatted : 'Unknown phone number'}</div>
            </div>`;

          const avatarElem = new AvatarElement();
          //avatarElem.lazyLoadQueue = this.lazyLoadQueue;
          avatarElem.setAttribute('peer', '' + message.media.user_id);
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
        
        default:
          bubble.classList.remove('is-message-empty');
          messageDiv.innerHTML = '<i class="media-not-supported">This message is currently not supported on Telegram Web. Try <a href="https://desktop.telegram.org/" target="_blank">desktop.telegram.org</a></i>';
          messageDiv.append(timeSpan);
          this.log.warn('unrecognized media type:', message.media._, message);
          break;
      }
      
      if(!processingWebPage) {
        bubbleContainer.append(attachmentDiv);
      }

      /* if(bubble.classList.contains('is-message-empty') && (bubble.classList.contains('photo') || bubble.classList.contains('video'))) {
        bubble.classList.add('no-tail');

        if(!bubble.classList.contains('with-media-tail')) {
          bubble.classList.add('use-border-radius');
        }
      } */
    }

    if(this.chat.selection.isSelecting) {
      this.chat.selection.toggleBubbleCheckbox(bubble, true);
    }

    let savedFrom = '';
    
    const needName = ((peerId < 0 && (peerId !== message.fromId || our)) && message.fromId !== rootScope.myId) || message.viaBotId;
    if(needName || message.fwd_from || message.reply_to_mid) { // chat
      let title: HTMLSpanElement;

      const isForwardFromChannel = message.from_id && message.from_id._ === 'peerChannel' && message.fromId === message.fwdFromId;
      
      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(message.viaBotId) {
        title = document.createElement('span');
        title.innerText = '@' + this.appUsersManager.getUser(message.viaBotId).username;
      } else if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = document.createElement('span');
        title.innerHTML = RichTextProcessor.wrapEmojiText(message.fwd_from.from_name);
        title.classList.add('peer-title');
        //title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      } else {
        title = new PeerTitle({peerId: message.viaBotId || message.fwdFromId || message.fromId}).element;
      }
      
      //this.log(title);
      
      if(message.viaBotId) {
        if(!bubble.classList.contains('sticker')) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name', 'is-via');
          nameDiv.dataset.peerId = message.viaBotId;
          nameDiv.append(i18n('ViaBot'), ' ', title);
          nameContainer.append(nameDiv);
        } else {
          bubble.classList.add('hide-name');
        }
      } else if((message.fwdFromId || message.fwd_from)) {
        if(this.peerId !== rootScope.myId && !isForwardFromChannel) {
          bubble.classList.add('forwarded');
        }
        
        if(message.savedFrom) {
          savedFrom = message.savedFrom;
        }
        
        if(!bubble.classList.contains('sticker')) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.dataset.peerId = message.fwdFromId;

          if(this.peerId === rootScope.myId || this.peerId === REPLIES_PEER_ID || isForwardFromChannel) {
            nameDiv.style.color = this.appPeersManager.getPeerColorById(message.fwdFromId, false);
            nameDiv.append(title);
          } else {
            /* const fromTitle = message.fromId === this.myID || appPeersManager.isBroadcast(message.fwdFromId || message.fromId) ? '' : `<div class="name" data-peer-id="${message.fromId}" style="color: ${appPeersManager.getPeerColorByID(message.fromId, false)};">${appPeersManager.getPeerTitle(message.fromId)}</div>`;
            nameDiv.innerHTML = fromTitle + 'Forwarded from ' + title; */
            nameDiv.append(i18n('ForwardedFrom', [title]));

            if(savedFrom) {
              nameDiv.dataset.savedFrom = savedFrom;
            }
          }
          
          nameContainer.append(nameDiv);
        }
      } else {
        if(!bubble.classList.contains('sticker') && needName) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.append(title);

          if(!our) {
            nameDiv.style.color = this.appPeersManager.getPeerColorById(message.fromId, false);
          }

          nameDiv.dataset.peerId = message.fromId;
          nameContainer.append(nameDiv);
        } else /* if(!message.reply_to_mid) */ {
          bubble.classList.add('hide-name');
        }
      }

      if(message.reply_to_mid && message.reply_to_mid !== this.chat.threadId) {
        MessageRender.setReply({
          chat: this.chat,
          bubble,
          bubbleContainer,
          message
        });
      }
      
      const needAvatar = this.chat.isAnyGroup() && !isOut;
      if(needAvatar) {
        let avatarElem = new AvatarElement();
        //avatarElem.lazyLoadQueue = this.lazyLoadQueue;
        avatarElem.classList.add('user-avatar', 'avatar-40');
        avatarElem.loadPromises = loadPromises;

        if(!message.fwdFromId && message.fwd_from && message.fwd_from.from_name) {
          avatarElem.setAttribute('peer-title', /* '🔥 FF 🔥' */message.fwd_from.from_name);
        }

        avatarElem.setAttribute('peer', '' + (((message.fwd_from && (this.peerId === rootScope.myId || this.peerId === REPLIES_PEER_ID)) || isForwardFromChannel ? message.fwdFromId : message.fromId) || 0));
        //avatarElem.update();
        
        //this.log('exec loadDialogPhoto', message);

        contentWrapper.append(avatarElem);
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

    if(savedFrom && (this.chat.type === 'pinned' || message.fwd_from.saved_from_msg_id) && this.peerId !== REPLIES_PEER_ID) {
      const goto = document.createElement('div');
      goto.classList.add('bubble-beside-button', 'goto-original', 'tgico-arrow_next');
      bubbleContainer.append(goto);
      bubble.dataset.savedFrom = savedFrom;
      bubble.classList.add('with-beside-button');
    }
    
    bubble.classList.add(isOut ? 'is-out' : 'is-in');
    if(updatePosition) {
      this.renderMessagesQueue(message, bubble, reverse, loadPromises);
    }

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

    if(canHaveTail) {
      bubble.classList.add('can-have-tail');

      bubbleContainer.append(generateTail());
    }

    return bubble;
  }

  private safeRenderMessage(message: any, reverse?: boolean, multipleRender?: boolean, bubble?: HTMLDivElement, updatePosition?: boolean) {
    try {
      return this.renderMessage(message, reverse, multipleRender, bubble, updatePosition);
    } catch(err) {
      this.log.error('renderMessage error:', err);
    }
  }

  public async performHistoryResult(history: number[], reverse: boolean, isBackLimit: boolean, additionMsgId?: number) {
    // commented bot getProfile in getHistory!
    // if(!history/* .filter((id: number) => id > 0) */.length) {
    //   if(!isBackLimit) {
    //     this.scrollable.loadedAll.top = true;

    //     /* if(this.chat.type === 'discussion') {
    //       const serviceStartMessageId = this.appMessagesManager.threadsServiceMessagesIdsStorage[this.peerId + '_' + this.chat.threadId];
    //       if(serviceStartMessageId) history.push(serviceStartMessageId);
    //       history.push(this.chat.threadId);
    //     } */
    //   } else {
    //     this.scrollable.loadedAll.bottom = true;
    //   }
    // }

    history = history.slice(); // need

    if(additionMsgId) {
      history.unshift(additionMsgId);
    }

    /* if(testScroll && additionMsgID) {
      for(let i = 0; i < 3; ++i) {
        let _history = history.slice();
        setTimeout(() => {
          this.performHistoryResult(_history, reverse, isBackLimit, 0, resetPromises);
        }, 0);
      }
    } */

    //console.time('appImManager render history');

    //await new Promise((resolve) => setTimeout(resolve, 1e3));

    /* if(DEBUG) {
      this.log('performHistoryResult: will render some messages:', history.length, this.isHeavyAnimationInProgress, this.messagesQueuePromise);
    } */

    //const padding = 10000;
    //const realLength = this.scrollable.container.childElementCount;
    let previousScrollHeightMinusTop: number/* , previousScrollHeight: number */;
    //if(realLength > 0/*  && (reverse || isSafari) */) { // for safari need set when scrolling bottom too
    //if(!this.scrollable.isHeavyScrolling) {
      this.messagesQueueOnRender = () => {
        const {scrollTop, scrollHeight} = this.scrollable;

        //previousScrollHeight = scrollHeight;
        //previousScrollHeight = scrollHeight + padding;
        previousScrollHeightMinusTop = reverse ? scrollHeight - scrollTop : scrollTop;

        //this.chatInner.style.paddingTop = padding + 'px';
        /* if(reverse) {
          previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
        } else {
          previousScrollHeightMinusTop = scrollTop;
        } */

        /* if(DEBUG) {
          this.log('performHistoryResult: messagesQueueOnRender, scrollTop:', scrollTop, scrollHeight, previousScrollHeightMinusTop);
        } */
        this.messagesQueueOnRender = undefined;
      };
    //}
    //}

    if(this.needReflowScroll) {
      reflowScrollableElement(this.scrollable.container);
      this.needReflowScroll = false;
    }

    const cb = (mid: number) => {
      const message = this.chat.getMessage(mid);
      if(message.id > 0) {
        this.safeRenderMessage(message, reverse, true);
      } else {
        this.processLocalMessageRender(message);
      }
    };

    const length = history.length;
    if(reverse) for(let i = 0; i < length; ++i) cb(history[i]);
    else for(let i = length - 1; i >= 0; --i) cb(history[i]);

    if(this.chat.type !== 'scheduled') {
      const historyStorage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
      const firstSlice = historyStorage.history.first;
      const lastSlice = historyStorage.history.last;
      if(firstSlice.isEnd(SliceEnd.Bottom) && (!firstSlice.length || history.includes(firstSlice[0]))) {
        this.setLoaded('bottom', true, false);
      }
      
      if(lastSlice.isEnd(SliceEnd.Top) && (!lastSlice.length || history.includes(lastSlice[lastSlice.length - 1]))) {
        this.setLoaded('top', true, false);
      }
    } else {
      this.setLoaded('top', true);
      this.setLoaded('bottom', true);
    }

    await this.messagesQueuePromise;//.then(() => new Promise(resolve => setTimeout(resolve, 100)))

    if(this.scrollable.loadedAll.top && this.messagesQueueOnRenderAdditional) {
      this.messagesQueueOnRenderAdditional();

      if(this.messagesQueueOnRenderAdditional) {
        this.messagesQueueOnRenderAdditional();
      }
    }

    if(previousScrollHeightMinusTop !== undefined) {
      /* const scrollHeight = this.scrollable.scrollHeight;
      const addedHeight = scrollHeight - previousScrollHeight;
      
      this.chatInner.style.paddingTop = (10000 - addedHeight) + 'px'; */
      /* const scrollHeight = this.scrollable.scrollHeight;
      const addedHeight = scrollHeight - previousScrollHeight;
      
      this.chatInner.style.paddingTop = (padding - addedHeight) + 'px';
      
      //const newScrollTop = reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
      const newScrollTop = reverse ? scrollHeight - addedHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
      this.log('performHistoryResult: will set scrollTop', 
      previousScrollHeightMinusTop, this.scrollable.scrollHeight, 
      newScrollTop, this.scrollable.container.clientHeight); */
      //const newScrollTop = reverse ? scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
      const newScrollTop = reverse ? this.scrollable.scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
      
      /* if(DEBUG) {
        this.log('performHistoryResult: will set up scrollTop:', newScrollTop, this.isHeavyAnimationInProgress);
      } */

      // touchSupport for safari iOS
      //isTouchSupported && isApple && (this.scrollable.container.style.overflow = 'hidden');
      this.scrollable.scrollTop = newScrollTop;
      //this.scrollable.scrollTop = this.scrollable.scrollHeight;
      //isTouchSupported && isApple && (this.scrollable.container.style.overflow = '');

      if(isSafari/*  && !isAppleMobile */) { // * fix blinking and jumping
        reflowScrollableElement(this.scrollable.container);
      }

      /* if(DEBUG) {
        this.log('performHistoryResult: have set up scrollTop:', newScrollTop, this.scrollable.scrollTop, this.scrollable.scrollHeight, this.isHeavyAnimationInProgress);
      } */
    }

    return true;
  }

  onDatePick = (timestamp: number) => {
    const peerId = this.peerId;
    this.appMessagesManager.requestHistory(peerId, 0, 2, -1, timestamp, this.chat.threadId).then(history => {
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
      return this.appMessagesManager.getHistory(this.peerId, maxId, loadCount, backLimit, this.chat.threadId);
    } else if(this.chat.type === 'pinned') {
      const promise = this.appMessagesManager.getSearch({
        peerId: this.peerId, 
        inputFilter: {_: 'inputMessagesFilterPinned'}, 
        maxId, 
        limit: loadCount, 
        backLimit
      })
      .then(value => ({history: value.history.map(m => m.mid)}));

      return promise;
    } else if(this.chat.type === 'scheduled') {
      return this.appMessagesManager.getScheduledMessages(this.peerId).then(mids => {
        // this.setLoaded('top', true);
        // this.setLoaded('bottom', true);
        return {history: mids.slice().reverse()};
      });
    }
  }

  private async animateAsLadder(additionMsgId: number, additionMsgIds: number[], isAdditionRender: boolean, backLimit: number, maxId: number) {
    /* const middleware = this.getMiddleware();
    await this.ladderDeferred; */

    if(this.chat.setPeerPromise && !this.resolveLadderAnimation) {
      // @ts-ignore
      this.resolveLadderAnimation = this.animateAsLadder.bind(this, additionMsgId, additionMsgIds, isAdditionRender, backLimit, maxId);
      return;
    }

    /* if(!middleware()) {
      return;
    } */

    if(!Object.keys(this.bubbles).length) {
      return;
    }

    let sortedMids = getObjectKeysAndSort(this.bubbles, 'desc');

    if(isAdditionRender && additionMsgIds.length) {
      sortedMids = sortedMids.filter(mid => !additionMsgIds.includes(mid));
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

    const topIds = sortedMids.slice(sortedMids.findIndex(mid => targetMid > mid));
    const middleIds = isAdditionRender ? [] : [targetMid];
    const bottomIds = isAdditionRender ? [] : sortedMids.slice(0, sortedMids.findIndex(mid => targetMid >= mid)).reverse();
    
    if(DEBUG) {
      this.log('getHistory: targeting mid:', targetMid, maxId, additionMsgId, 
        topIds.map(m => this.appMessagesIdsManager.getServerMessageId(m)), 
        bottomIds.map(m => this.appMessagesIdsManager.getServerMessageId(m)));
    }

    const setBubbles: HTMLElement[] = [];

    this.chatInner.classList.add('zoom-fading');
    const delay = isAdditionRender ? 10 : 40;
    const offsetIndex = isAdditionRender ? 0 : 1;
    const animateAsLadder = (mids: number[], offsetIndex = 0) => {
      const animationPromise = deferredPromise<void>();
      let lastMsDelay = 0;
      mids.forEach((mid, idx) => {
        if(!this.bubbles[mid] || this.skippedMids.has(mid)) {
          this.log.warn('animateAsLadder: no bubble by mid:', mid);
          return;
        }

        const contentWrapper = this.bubbles[mid].lastElementChild as HTMLElement;

        lastMsDelay = ((idx + offsetIndex) || 0.1) * delay;
        //lastMsDelay = (idx + offsetIndex) * delay;
        //lastMsDelay = (idx || 0.1) * 1000;
        
        contentWrapper.classList.add('zoom-fade');
        contentWrapper.style.transitionDelay = lastMsDelay + 'ms';

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
        
        //this.log('supa', bubble);

        setBubbles.push(contentWrapper);
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

    // fastRaf(() => {
    fastRaf(() => {
      setBubbles.forEach(contentWrapper => {
        contentWrapper.classList.remove('zoom-fade');
      });
    });
    // });

    let promise: Promise<any>;
    if(topIds.length || middleIds.length || bottomIds.length) {
      promise = Promise.all(promises);

      dispatchHeavyAnimationEvent(promise, Math.max(...delays) + 200) // * 200 - transition time
      .then(() => { 
        fastRaf(() => {
          setBubbles.forEach(contentWrapper => {
            contentWrapper.style.transitionDelay = '';
          });

          this.chatInner.classList.remove('zoom-fading');
        });

        // ! в хроме, каким-то образом из-за zoom-fade класса начинает прыгать скролл при подгрузке сообщений вверх, 
        // ! т.е. скролл не ставится, так же, как в сафари при translateZ на блок выше scrollable
        if(!isSafari) {
          this.needReflowScroll = true;
        }
      });
    }

    return promise;
  }

  private renderEmptyPlaceholder(type: 'group' | 'saved' | 'noMessages' | 'noScheduledMessages' | 'greeting', bubble: HTMLElement, message: any, elements: (Node | string)[]) {
    const BASE_CLASS = 'empty-bubble-placeholder';
    bubble.classList.add(BASE_CLASS, BASE_CLASS + '-' + type);

    let title: HTMLElement; 
    if(type === 'group') title = i18n('GroupEmptyTitle1');
    else if(type === 'saved') title = i18n('ChatYourSelfTitle');
    else if(type === 'noMessages' || type === 'greeting') title = i18n('NoMessages');
    else if(type === 'noScheduledMessages') title = i18n('NoScheduledMessages');
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

      this.messagesQueue.findAndSplice(q => q.bubble === bubble);

      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add(BASE_CLASS + '-sticker');

      const middleware = this.getMiddleware();
      
      const loadPromise = this.appStickersManager.getGreetingSticker().then(doc => {
        if(!middleware()) return;

        const loadPromises: Promise<any>[] = [];
        wrapSticker({
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

      this.renderMessagesQueue(message, bubble, false, [loadPromise]);

      elements.push(subtitle, stickerDiv);
    }

    if(listElements) {
      elements.push(
        ...listElements.map(elem => {
          const span = document.createElement('span');
          span.classList.add(BASE_CLASS + '-list-item');
          span.append(elem);
          return span;
        })
      );
  
      if(type === 'group') {
        listElements.forEach(elem => {
          const i = document.createElement('span');
          i.classList.add('tgico-check');
          elem.prepend(i);
        });
      } else if(type === 'saved') {
        listElements.forEach(elem => {
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

  private processLocalMessageRender(message: Message.message | Message.messageService) {
    const bubble = this.safeRenderMessage(message, undefined, undefined, undefined, false);
    bubble.classList.add('bubble-first', 'is-group-last', 'is-group-first');
    bubble.classList.remove('can-have-tail', 'is-in');

    const messageDiv = bubble.querySelector('.message, .service-msg');
    const elements: (Node | string)[] = [];
    const isBot = this.appPeersManager.isBot(this.peerId);
    if(isBot && message._ === 'message') {
      const b = document.createElement('b');
      b.append(i18n('BotInfoTitle'));
      elements.push(b, '\n\n');
    } else if(this.appPeersManager.isAnyGroup(this.peerId) && this.appPeersManager.getPeer(this.peerId).pFlags.creator) {
      this.renderEmptyPlaceholder('group', bubble, message, elements);
    } else if(rootScope.myId === this.peerId) {
      this.renderEmptyPlaceholder('saved', bubble, message, elements);
    } else if(this.peerId > 0 && !isBot && this.appMessagesManager.canWriteToPeer(this.peerId) && this.chat.type === 'chat') {
      this.renderEmptyPlaceholder('greeting', bubble, message, elements);
    } else if(this.chat.type === 'scheduled') {
      this.renderEmptyPlaceholder('noScheduledMessages', bubble, message, elements);
    } else {
      this.renderEmptyPlaceholder('noMessages', bubble, message, elements);
    }

    /* for(let i = 1; i < elements.length; i += 2) {
      elements.splice(i, 0, '\n');
    } */

    messageDiv.prepend(...elements);
    
    if(this.messagesQueueOnRenderAdditional) {
      this.onAnimateLadder = () => {
        this.chatInner.prepend(bubble);
        this.onAnimateLadder = undefined;

        // need raf here because animation won't fire if this message is single
        if(!this.messagesQueuePromise) {
          return fastRafPromise();
        }
      };
    } else {
      this.chatInner.prepend(bubble);
    }

    this.emptyPlaceholderMid = message.mid;
  }

  private generateLocalFirstMessage<T extends boolean>(service?: T, fill?: (message: GenerateLocalMessageType<T>) => void): GenerateLocalMessageType<T> {
    const offset = this.appMessagesIdsManager.generateMessageId(this.chat.type === 'scheduled' ? -1 : 0);

    const message: Omit<Message.message | Message.messageService, 'message'> & {message?: string} = {
      _: service ? 'messageService' : 'message',
      date: 0,
      id: -(this.peerId + offset),
      peer_id: this.appPeersManager.getOutputPeer(this.peerId),
      pFlags: {}
    };

    if(!service) {
      message.message = '';
    }

    assumeType<GenerateLocalMessageType<T>>(message);

    fill && fill(message);

    this.appMessagesManager.saveMessages([message]);
    return message;
  }

  private setLoaded(side: SliceSides, value: boolean, checkPlaceholders = true) {
    const willChange = this.scrollable.loadedAll[side] !== value;
    if(!willChange) {
      return;
    }

    this.scrollable.loadedAll[side] = value;

    /* if(!checkPlaceholders) {
      return;
    } */

    if(side === 'top' && value && this.appUsersManager.isBot(this.peerId)) {
      this.log('inject bot description');

      const middleware = this.getMiddleware();
      return this.appProfileManager.getProfile(this.peerId).then(userFull => {
        if(!middleware()) {
          return;
        }

        if(!userFull.bot_info?.description) {
          this.checkIfEmptyPlaceholderNeeded();
          return;
        }

        const message = this.generateLocalFirstMessage(false, message => {
          message.message = userFull.bot_info.description;
        });

        this.processLocalMessageRender(message);
      });
    }

    this.checkIfEmptyPlaceholderNeeded();
  }

  public checkIfEmptyPlaceholderNeeded() {
    if(this.scrollable.loadedAll.top && 
      this.scrollable.loadedAll.bottom && 
      this.emptyPlaceholderMid === undefined && 
      (
        !this.appMessagesManager.getHistoryStorage(this.peerId).count || 
        (
          Object.keys(this.bubbles).length && 
          !this.getRenderedLength()
        ) ||
        (this.chat.type === 'scheduled' && !Object.keys(this.bubbles).length)
      )
    ) {
      this.log('inject empty peer placeholder');

      const message = this.generateLocalFirstMessage(true);
      this.processLocalMessageRender(message);

      return true;
    }

    return false;
  }

  /**
   * Load and render history
   * @param maxId max message id
   * @param reverse 'true' means up
   * @param isBackLimit is search
   * @param additionMsgId for the last message
   * @param justLoad do not render
   */
  public getHistory(maxId = 0, reverse = false, isBackLimit = false, additionMsgId = 0, justLoad = false): {cached: boolean, promise: Promise<boolean>} {
    const peerId = this.peerId;

    //console.time('appImManager call getHistory');
    const pageCount = Math.min(30, this.appPhotosManager.windowH / 38/*  * 1.25 */ | 0);
    //const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = Object.keys(this.bubbles).length > 0/*  || additionMsgId */ ? Math.max(40, pageCount) : pageCount;//const realLoadCount = 50;
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
        return {cached: false, promise: Promise.resolve(true)};
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
        const historyStorage = this.appMessagesManager.getHistoryStorage(peerId, this.chat.threadId);
        const slice = historyStorage.history.slice;
        if(slice.length < loadCount && !slice.isEnd(SliceEnd.Both)) {
          additionMsgIds = slice.slice();

          // * filter last album, because we don't know is it the last item
          for(let i = additionMsgIds.length - 1; i >= 0; --i) {
            const message = this.chat.getMessage(additionMsgIds[i]);
            if(message.grouped_id) additionMsgIds.splice(i, 1);
            else break;
          }

          maxId = additionMsgIds[additionMsgIds.length - 1] || maxId;
        }
      }
    }

    /* const result = additionMsgID ? 
      {history: [additionMsgID]} : 
      appMessagesManager.getHistory(this.peerId, maxId, loadCount, backLimit); */
    let result: ReturnType<AppMessagesManager['getHistory']> | {history: number[]} = this.requestHistory(maxId, loadCount, backLimit) as any;
    let resultPromise: Promise<any>;

    //const isFirstMessageRender = !!additionMsgID && result instanceof Promise && !appMessagesManager.getMessage(additionMsgID).grouped_id;
    const isAdditionRender = additionMsgIds?.length && result instanceof Promise;
    const isFirstMessageRender = (this.isFirstLoad && backLimit && result instanceof Promise) || isAdditionRender;
    if(isAdditionRender) {
      resultPromise = result as Promise<any>;
      result = {history: additionMsgIds};
      //additionMsgID = 0;
    }

    this.isFirstLoad = false;

    const processResult = async(historyResult: typeof result) => {
      if('offsetIdOffset' in historyResult && historyResult.history.isEnd(SliceEnd.Top)) {
        if(this.chat.type === 'discussion') { // * inject discussion start
          //this.log('discussion got history', loadCount, backLimit, historyResult, isTopEnd);
          const serviceStartMessageId = this.appMessagesManager.threadsServiceMessagesIdsStorage[this.peerId + '_' + this.chat.threadId];
          if(serviceStartMessageId) historyResult.history.push(serviceStartMessageId);
          historyResult.history.push(...this.chat.getMidsByMid(this.chat.threadId).reverse());
        }

        await this.setLoaded('top', true);
      }
    };

    const sup = (result: HistoryResult) => {
      /* if(maxId && result.history?.length) {
        if(this.bubbles[maxId]) {
          result.history.findAndSplice(mid => mid === maxId);  
        }
      } */

      ////console.timeEnd('render history total');
      
      return getHeavyAnimationPromise().then(() => {
        return processResult(result);
      }).then(() => {
        return this.performHistoryResult(result.history || [], reverse, isBackLimit, !isAdditionRender && additionMsgId);
      });
    };

    const processPromise = (result: Promise<HistoryResult>) => {
      const promise = result.then((result) => {
        //this.log('getHistory not cached result by maxId:', maxId, reverse, isBackLimit, result, peerId, justLoad);

        if(reverse ? this.getHistoryTopPromise !== promise : this.getHistoryBottomPromise !== promise) {
          this.log.warn('getHistory: peer changed');
          ////console.timeEnd('render history total');
          return Promise.reject();
        }

        if(justLoad) {
          this.scrollable.onScroll(); // нужно делать из-за ранней прогрузки
          return true;
        }
        //console.timeEnd('appImManager call getHistory');

        return sup(result);
      }, (err) => {
        this.log.error('getHistory error:', err);
        throw err;
      });
      
      return promise;
    };

    let promise: Promise<boolean>, cached: boolean;
    if(result instanceof Promise) {
      cached = false;
      promise = processPromise(result);
    } else if(justLoad) {
      return null;
    } else {
      cached = true;
      //this.log('getHistory cached result by maxId:', maxId, reverse, isBackLimit, result, peerId, justLoad);
      promise = sup(result as HistoryResult);
      //return (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);
      //return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
    }

    const waitPromise = isAdditionRender ? processPromise(resultPromise) : promise;

    if(isFirstMessageRender && rootScope.settings.animationsEnabled/*  && false */) {
      let times = isAdditionRender ? 2 : 1;
      this.messagesQueueOnRenderAdditional = () => {
        this.log('ship went past rocks of magnets');

        if(--times) return;

        this.messagesQueueOnRenderAdditional = undefined;
        
        const promise = this.animateAsLadder(additionMsgId, additionMsgIds, isAdditionRender, backLimit, maxId);
        (promise || Promise.resolve()).then(() => {
          setTimeout(() => { // preload messages
            this.loadMoreHistory(reverse, true);
          }, 0);
        });
      };
    } else {
      this.messagesQueueOnRenderAdditional = undefined;
    }

    (reverse ? this.getHistoryTopPromise = waitPromise : this.getHistoryBottomPromise = waitPromise);
    waitPromise.then(() => {
      (reverse ? this.getHistoryTopPromise = undefined : this.getHistoryBottomPromise = undefined);
    });

    if(justLoad) {
      return null;
    }

    /* false &&  */!isFirstMessageRender && promise.then(() => {
      if(reverse) {
        this.loadedTopTimes++;
        this.loadedBottomTimes = Math.max(0, --this.loadedBottomTimes);
      } else {
        this.loadedBottomTimes++;
        this.loadedTopTimes = Math.max(0, --this.loadedTopTimes);
      }

      let ids: number[];
      if((reverse && this.loadedTopTimes > 2) || (!reverse && this.loadedBottomTimes > 2)) {
        ids = getObjectKeysAndSort(this.bubbles);
      }

      //let removeCount = loadCount / 2;
      const safeCount = realLoadCount * 2; // cause i've been runningrunningrunning all day
      //this.log('getHistory: slice loadedTimes:', reverse, pageCount, this.loadedTopTimes, this.loadedBottomTimes, ids?.length, safeCount);
      if(ids && ids.length > safeCount) {
        if(reverse) {
          //ids = ids.slice(-removeCount);
          //ids = ids.slice(removeCount * 2);
          ids = ids.slice(safeCount);
          this.setLoaded('bottom', false);

          //this.log('getHistory: slice bottom messages:', ids.length, loadCount);
          //this.getHistoryBottomPromise = undefined; // !WARNING, это нужно для обратной загрузки истории, если запрос словил флуд
        } else {
          //ids = ids.slice(0, removeCount);
          //ids = ids.slice(0, ids.length - (removeCount * 2));
          ids = ids.slice(0, ids.length - safeCount);
          this.setLoaded('top', false);

          //this.log('getHistory: slice up messages:', ids.length, loadCount);
          //this.getHistoryTopPromise = undefined; // !WARNING, это нужно для обратной загрузки истории, если запрос словил флуд
        }

        //this.log('getHistory: will slice ids:', ids, reverse);

        this.deleteMessagesByIds(ids, false);
      }
    });

    promise.then(() => {
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
    });

    return {cached, promise};
  }

  public setUnreadDelimiter() {
    if(!(this.chat.type === 'chat' || this.chat.type === 'discussion')) {
      return;
    }

    if(this.attachedUnreadBubble) {
      return;
    }

    const historyStorage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
    let readMaxId = this.appMessagesManager.getReadMaxIdIfUnread(this.peerId, this.chat.threadId);
    if(!readMaxId) return;

    readMaxId = Object.keys(this.bubbles)
    .filter(mid => !this.bubbles[mid].classList.contains('is-out'))
    .map(i => +i)
    .sort((a, b) => a - b)
    .find(i => i > readMaxId);

    if(readMaxId && this.bubbles[readMaxId]) {
      let bubble = this.bubbles[readMaxId];
      if(this.firstUnreadBubble && this.firstUnreadBubble !== bubble) {
        this.firstUnreadBubble.classList.remove('is-first-unread');
        this.firstUnreadBubble = null;
      }

      if(readMaxId !== historyStorage.maxId) {
        bubble.classList.add('is-first-unread');
      }

      this.firstUnreadBubble = bubble;
      this.attachedUnreadBubble = true;
    }
  }

  public deleteEmptyDateGroups() {
    const mustBeCount = 1 + +!!this.stickyIntersector;
    for(const i in this.dateMessages) {
      const dateMessage = this.dateMessages[i];

      if(dateMessage.container.childElementCount === mustBeCount) { // only date div + sentinel div
        dateMessage.container.remove();
        if(this.stickyIntersector) {
          this.stickyIntersector.unobserve(dateMessage.container, dateMessage.div);
        }
        delete this.dateMessages[i];
      }
    }

    this.checkIfEmptyPlaceholderNeeded();
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
