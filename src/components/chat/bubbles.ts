/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager, HistoryResult, MyMessage } from "../../lib/appManagers/appMessagesManager";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/appInlineBotsManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { AppDocsManager } from "../../lib/appManagers/appDocsManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type sessionStorage from '../../lib/sessionStorage';
import type Chat from "./chat";
import { CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import { cancelEvent, whichChild, attachClickEvent, positionElementByIndex, reflowScrollableElement, replaceContent, htmlToDocumentFragment } from "../../helpers/dom";
import { getObjectKeysAndSort } from "../../helpers/object";
import { isTouchSupported } from "../../helpers/touchSupport";
import { logger } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import AppMediaViewer from "../appMediaViewer";
import BubbleGroups from "./bubbleGroups";
import PopupDatePicker from "../popups/datePicker";
import PopupForward from "../popups/forward";
import PopupStickers from "../popups/stickers";
import ProgressivePreloader from "../preloader";
import Scrollable from "../scrollable";
import StickyIntersector from "../stickyIntersector";
import animationIntersector from "../animationIntersector";
import RichTextProcessor from "../../lib/richtextprocessor";
import mediaSizes from "../../helpers/mediaSizes";
import { isAndroid, isApple, isSafari } from "../../helpers/userAgent";
import I18n, { i18n, langPack } from "../../lib/langPack";
import AvatarElement from "../avatar";
import { formatPhoneNumber } from "../misc";
import { ripple } from "../ripple";
import { wrapAlbum, wrapPhoto, wrapVideo, wrapDocument, wrapSticker, wrapPoll, wrapGroupedDocuments } from "../wrappers";
import { MessageRender } from "./messageRender";
import LazyLoadQueue from "../lazyLoadQueue";
import { AppChatsManager } from "../../lib/appManagers/appChatsManager";
import ListenerSetter from "../../helpers/listenerSetter";
import PollElement from "../poll";
import AudioElement from "../audio";
import { Message, MessageEntity,  MessageReplyHeader } from "../../layer";
import { REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { FocusDirection } from "../../helpers/fastSmoothScroll";
import useHeavyAnimationCheck, { getHeavyAnimationPromise, dispatchHeavyAnimationEvent } from "../../hooks/useHeavyAnimationCheck";
import { fastRaf } from "../../helpers/schedulers";
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

const USE_MEDIA_TAILS = false;
const IGNORE_ACTIONS: Message.messageService['action']['_'][] = [/* 'messageActionHistoryClear' */];

const TEST_SCROLL_TIMES: number = undefined;
let TEST_SCROLL = TEST_SCROLL_TIMES;

let queueId = 0;

export default class ChatBubbles {
  bubblesContainer: HTMLDivElement;
  chatInner: HTMLDivElement;
  scrollable: Scrollable;

  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;

  public peerId = 0;
  //public messagesCount: number = -1;

  public unreadOut = new Set<number>();
  public needUpdate: {replyToPeerId: number, replyMid: number, mid: number}[] = []; // if need wrapSingleMessage

  public bubbles: {[mid: string]: HTMLDivElement} = {};
  public dateMessages: {[timestamp: number]: { 
    div: HTMLDivElement, 
    firstTimestamp: number, 
    container: HTMLDivElement,
    timeout?: number 
  }} = {};

  private scrolledDown = true;
  private isScrollingTimeout = 0;

  private stickyIntersector: StickyIntersector;

  private unreadedObserver: IntersectionObserver;
  private unreaded: number[] = [];

  public bubbleGroups: BubbleGroups;

  private preloader: ProgressivePreloader = null;
  
  private loadedTopTimes = 0;
  private loadedBottomTimes = 0;

  public messagesQueuePromise: Promise<void> = null;
  private messagesQueue: {message: any, bubble: HTMLDivElement, reverse: boolean, promises: Promise<void>[]}[] = [];
  private messagesQueueOnRender: () => void = null;
  private messagesQueueOnRenderAdditional: () => void = null;

  private firstUnreadBubble: HTMLDivElement = null;
  private attachedUnreadBubble: boolean;

  public lazyLoadQueue: LazyLoadQueue;

  private middleware = getMiddleware();

  private log: ReturnType<typeof logger>;

  public listenerSetter: ListenerSetter;

  public replyFollowHistory: number[] = [];

  public isHeavyAnimationInProgress = false;
  public scrollingToNewBubble: HTMLElement;

  public isFirstLoad = true;
  private needReflowScroll: boolean;

  constructor(private chat: Chat, private appMessagesManager: AppMessagesManager, private appStickersManager: AppStickersManager, private appUsersManager: AppUsersManager, private appInlineBotsManager: AppInlineBotsManager, private appPhotosManager: AppPhotosManager, private appDocsManager: AppDocsManager, private appPeersManager: AppPeersManager, private appChatsManager: AppChatsManager, private storage: typeof sessionStorage) {
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
    this.listenerSetter.add(rootScope, 'history_update', (e) => {
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
          this.scrollToNewLastBubble();
        }

        //this.renderMessage(message, false, false, bubble);
      }
    });

    //this.listenerSetter.add(rootScope, '')

    this.listenerSetter.add(rootScope, 'dialog_flush', (e) => {
      let peerId: number = e.peerId;
      if(this.peerId === peerId) {
        this.deleteMessagesByIds(Object.keys(this.bubbles).map(m => +m));
      }
    });

    // Calls when message successfully sent and we have an id
    this.listenerSetter.add(rootScope, 'message_sent', (e) => {
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
            this.renderMessage(message, true, false, bubble, false);
          });
          /* const mounted = this.getMountedBubble(mid);
          if(!mounted) return;
          this.renderMessage(mounted.message, true, false, mounted.bubble, false); */
        }
        
        //delete this.bubbles[tempId];
      } else {
        this.log.warn('message_sent there is no bubble', e);
      }

      if(this.bubbles[tempId]) {
        const bubble = this.bubbles[tempId];
        this.bubbles[mid] = bubble;
        delete this.bubbles[tempId];

        //getHeavyAnimationPromise().then(() => {
          fastRaf(() => {
            bubble.classList.remove('is-sending');
            bubble.classList.add(this.peerId === rootScope.myId && this.chat.type !== 'scheduled' ? 'is-read' : 'is-sent');
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

    this.listenerSetter.add(rootScope, 'message_edit', (e) => {
      fastRaf(() => {
        const {storage, peerId, mid} = e;
      
        if(peerId !== this.peerId || storage !== this.chat.getMessagesStorage()) return;
        const mounted = this.getMountedBubble(mid);
        if(!mounted) return;

        const updatePosition = this.chat.type === 'scheduled';
        this.renderMessage(mounted.message, true, false, mounted.bubble, updatePosition);

        if(updatePosition) {
          (this.messagesQueuePromise || Promise.resolve()).then(() => {
            this.deleteEmptyDateGroups();
          });
        }
      });
    });

    this.listenerSetter.add(rootScope, 'album_edit', (e) => {
      //fastRaf(() => { // ! can't use delayed smth here, need original bubble to be edited
        const {peerId, groupId, deletedMids} = e;
      
        if(peerId !== this.peerId) return;
        const mids = this.appMessagesManager.getMidsByAlbum(groupId);
        const renderedId = mids.concat(deletedMids).find(mid => this.bubbles[mid]);
        if(!renderedId) return;

        const renderMaxId = getObjectKeysAndSort(this.appMessagesManager.groupedMessagesStorage[groupId], 'asc').pop();

        this.renderMessage(this.chat.getMessage(renderMaxId), true, false, this.bubbles[renderedId], false);
      //});
    });

    this.listenerSetter.add(rootScope, 'messages_downloaded', (e) => {
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

    this.listenerSetter.add(this.bubblesContainer, 'click', this.onBubblesClick/* , {capture: true, passive: false} */);

    if(DEBUG) {
      this.listenerSetter.add(this.bubblesContainer, 'dblclick', (e) => {
        const bubble = findUpClassName(e.target, 'grouped-item') || findUpClassName(e.target, 'bubble');
        if(bubble) {
          const mid = +bubble.dataset.mid
          this.log('debug message:', this.chat.getMessage(mid));
          this.highlightBubble(bubble);
        }
      });
    }

    this.listenerSetter.add(this.bubblesContainer, 'dblclick', (e) => {
      const bubble = (e.target as HTMLElement).classList.contains('bubble') ? e.target as HTMLElement : null;
      if(bubble) {
        const mid = +bubble.dataset.mid
        this.chat.input.initMessageReply(mid);
      }
    });

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
    this.listenerSetter.add(rootScope, 'history_append', (e) => {
      const {peerId, storage, mid} = e;

      if(peerId !== this.peerId || storage !== this.chat.getMessagesStorage()) return;

      if(!this.scrollable.loadedAll.bottom) {
        this.chat.setMessageId();
      } else {
        this.renderNewMessagesByIds([mid], true);
      }
    });

    this.listenerSetter.add(rootScope, 'history_multiappend', (e) => {
      const msgIdsByPeer = e;

      if(!(this.peerId in msgIdsByPeer)) return;
      const msgIds = Array.from(msgIdsByPeer[this.peerId] as number[]).slice().sort((a, b) => b - a);
      this.renderNewMessagesByIds(msgIds);
    });
    
    this.listenerSetter.add(rootScope, 'history_delete', (e) => {
      const {peerId, msgs} = e;

      const mids = Object.keys(msgs).map(s => +s);

      if(peerId === this.peerId) {
        this.deleteMessagesByIds(mids);
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_unread', (e) => {
      const info = e;

      if(info.peerId === this.peerId) {
        this.chat.input.setUnreadCount();
        this.updateUnreadByDialog();
      }
    });

    this.listenerSetter.add(rootScope, 'dialogs_multiupdate', (e) => {
      const dialogs = e;

      if(dialogs[this.peerId]) {
        this.chat.input.setUnreadCount();
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_notify_settings', (dialog) => {
      if(this.peerId === dialog.peerId) {
        this.chat.input.setUnreadCount();
      }
    });

    this.unreadedObserver = new IntersectionObserver((entries) => {
      if(this.chat.appImManager.offline) { // ! but you can scroll the page without triggering 'focus', need something now
        return;
      }

      const readed: number[] = [];
    
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          const target = entry.target as HTMLElement;
          const mid = +target.dataset.mid;
          readed.push(mid);
          this.unreadedObserver.unobserve(target);
        }
      });

      if(readed.length) {
        let maxId = Math.max(...readed);

        if(this.scrollable.loadedAll.bottom) {
          const bubblesMaxId = Math.max(...Object.keys(this.bubbles).map(i => +i));
          if(maxId >= bubblesMaxId) {
            maxId = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId).maxId || maxId;
          }
        }

        let length = readed.length;
        for(let i = this.unreaded.length - 1; i >= 0; --i) {
          if(this.unreaded[i] <= maxId) {
            length++;
            this.unreaded.splice(i, 1);
          }
        }

        if(DEBUG) {
          this.log('will readHistory by ids:', maxId, length);
        }
        
        /* false && */ this.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId).catch((err: any) => {
          this.log.error('readHistory err:', err);
          this.appMessagesManager.readHistory(this.peerId, maxId, this.chat.threadId);
        });
      }
    });

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

  public constructPinnedHelpers() {
    this.listenerSetter.add(rootScope, 'peer_pinned_messages', (e) => {
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

    this.listenerSetter.add(rootScope, 'scheduled_new', (e) => {
      const {peerId, mid} = e;
      if(peerId !== this.peerId) return;

      this.renderNewMessagesByIds([mid]);
      onUpdate();
    });

    this.listenerSetter.add(rootScope, 'scheduled_delete', (e) => {
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

        this.appMessagesManager.wrapSingleMessage(peerId, threadId).then(() => {
          this.appMessagesManager.generateThreadServiceStartMessage(this.appMessagesManager.getMessageByPeer(peerId, threadId));
          this.chat.appImManager.setInnerPeer(peerId, message.fwd_from.saved_from_msg_id, 'discussion', threadId);
        });
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
      if(savedFrom) {
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

        let elements = this.bubbles[id].querySelectorAll(str) as NodeListOf<HTMLElement>;
        const parents: Set<HTMLElement> = new Set();
        Array.from(elements).forEach((element: HTMLElement) => {
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
        new PopupForward(this.peerId, [mid]);
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
        this.scrollable.loadedAll.bottom = true;
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
    this.scrollable.loadedAll.top = false;
    this.scrollable.loadedAll.bottom = false;

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
          bubble.classList.remove('is-sent');
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

      if(this.firstUnreadBubble === bubble) {
        this.firstUnreadBubble = null;
      }

      this.bubbleGroups.removeBubble(bubble);
      if(this.unreadedObserver) {
        this.unreadedObserver.unobserve(bubble);
      }
      //this.unreaded.findAndSplice(mid => mid === id);
      bubble.remove();
      //bubble.remove();
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
        this.scrollToNewLastBubble();

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

  public scrollToNewLastBubble() {
    const bubble = this.chatInner.lastElementChild.lastElementChild as HTMLElement;

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
    this.stickyIntersector && this.stickyIntersector.disconnect();

    delete this.lazyLoadQueue;
    this.unreadedObserver && delete this.unreadedObserver;
    this.stickyIntersector && delete this.stickyIntersector;
  }

  public cleanup(bubblesToo = false) {
    ////console.time('appImManager cleanup');
    this.scrollable.loadedAll.top = false;
    this.scrollable.loadedAll.bottom = false;

    if(TEST_SCROLL !== undefined) {
      TEST_SCROLL = TEST_SCROLL_TIMES;
    }

    this.bubbles = {};
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

    if(this.stickyIntersector) {
      this.stickyIntersector.disconnect();
    }
    
    if(this.unreadedObserver) {
      this.unreadedObserver.disconnect();
      this.unreaded.length = 0;
    }

    this.loadedTopTimes = this.loadedBottomTimes = 0;

    this.middleware.clean();

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

    const historyStorage = this.appMessagesManager.getHistoryStorage(peerId, this.chat.threadId);
    let topMessage = this.chat.type === 'pinned' ? this.appMessagesManager.pinnedMessages[peerId].maxId : historyStorage.maxId ?? 0;
    const isTarget = lastMsgId !== undefined;

    // * this one will fix topMessage for null message in history (e.g. channel comments with only 1 comment and it is a topMessage)
    if(this.chat.type !== 'pinned' && topMessage && !historyStorage.history.slice.includes(topMessage)) {
      topMessage = 0;
    }

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
    }

    if(DEBUG) {
      this.log('setPeer peerId:', this.peerId, historyStorage, lastMsgId, topMessage);
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

      this.chat.dispatchEvent('setPeer', lastMsgId, !isJump);

      // warning
      if((!lastMsgId && !savedPosition) || this.bubbles[topMessage] || lastMsgId === topMessage) {
        this.scrollable.loadedAll.bottom = true;
      }

      if(savedPosition) {
        Promise.all([setPeerPromise, getHeavyAnimationPromise()]).then(() => {
          this.scrollable.checkForTriggers();
        });
      }

      this.log('scrolledAllDown:', this.scrollable.loadedAll.bottom);

      //if(!this.unreaded.length && dialog) { // lol
      if(this.scrollable.loadedAll.bottom && topMessage) { // lol
        this.onScrolledAllDown();
      }

      if(this.chat.type === 'chat') {
        const dialog = this.appMessagesManager.getDialogByPeerId(peerId)[0];
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
    const canWrite = this.appMessagesManager.canWriteToPeer(peerId);
    
    this.chatInner.classList.toggle('has-rights', canWrite);
    this.bubblesContainer.classList.toggle('is-chat-input-hidden', !canWrite);

    this.chatInner.classList.toggle('is-chat', this.chat.isAnyGroup());
    this.chatInner.classList.toggle('is-channel', isChannel);
  }

  public renderMessagesQueue(message: any, bubble: HTMLDivElement, reverse: boolean, promises: Promise<any>[]) {
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
            return Promise.reject('setMessagesQueuePromise: peer changed!');
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

    this.bubbleGroups.addBubble(bubble, message, reverse);
  }

  public getMiddleware() {
    return this.middleware.get();
  }
  
  // reverse means top
  public renderMessage(message: any, reverse = false, multipleRender = false, bubble: HTMLDivElement = null, updatePosition = true) {
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

      if(!our && !message.pFlags.out) {
        //this.log('not our message', message, message.pFlags.unread);
        if(message.pFlags.unread && this.unreadedObserver) {
          this.unreadedObserver.observe(bubble); 
          if(!this.unreaded.indexOf(message.mid)) {
            this.unreaded.push(message.mid);
          }
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
      }

      //bubble.innerHTML = '';
    }

    // ! reset due to album edit or delete item
    this.bubbles[+message.mid] = bubble;
    bubble.dataset.mid = message.mid;
    bubble.dataset.timestamp = message.date;

    const loadPromises: Promise<any>[] = [];

    if(message._ === 'messageService') {
      let action = message.action;
      let _ = action._;
      if(IGNORE_ACTIONS.includes(_) || (langPack.hasOwnProperty(_) && !langPack[_])) {
        return bubble;
      }

      bubble.className = 'bubble service';

      bubbleContainer.innerHTML = '';
      const s = document.createElement('div');
      s.classList.add('service-msg');
      s.append(this.appMessagesManager.wrapMessageActionTextNew(message));
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
      entities: totalEntities
    });

    let canHaveTail = true;
    
    if(totalEntities && !messageMedia) {
      let emojiEntities = totalEntities.filter((e) => e._ === 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
      
      if(emojiStrLength === strLength && emojiEntities.length <= 3) {
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
      } else {
        messageDiv.innerHTML = richText;
      }
      
      /* if(strLength === emojiStrLength) {
        messageDiv.classList.add('emoji-only');
        messageDiv.classList.add('message-empty');
      } */
    } else {
      messageDiv.innerHTML = richText;
    }
    
    const timeSpan = MessageRender.setTime(this.chat, message, bubble, bubbleContainer, messageDiv);
    bubbleContainer.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad

    if(message.reply_markup && message.reply_markup._ === 'replyInlineMarkup' && message.reply_markup.rows && message.reply_markup.rows.length) {
      const rows = message.reply_markup.rows;

      const containerDiv = document.createElement('div');
      containerDiv.classList.add('reply-markup');
      rows.forEach((row: any) => {
        const buttons = row.buttons;
        if(!buttons || !buttons.length) return;

        const rowDiv = document.createElement('div');
        rowDiv.classList.add('reply-markup-row');

        buttons.forEach((button: any) => {
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

            default: {
              buttonEl = document.createElement('button');
              break;
            }
          }
          
          buttonEl.classList.add('reply-markup-button', 'rp');
          buttonEl.innerHTML = text;

          ripple(buttonEl);

          rowDiv.append(buttonEl);
        });

        containerDiv.append(rowDiv);
      });

      attachClickEvent(containerDiv, (e) => {
        let target = e.target as HTMLElement;
        
        if(!target.classList.contains('reply-markup-button')) target = findUpClassName(target, 'reply-markup-button');
        if(!target || target.classList.contains('is-link')) return;

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

    let messageWithReplies: Message.message;
    let withReplies: boolean;
    if(this.peerId === REPLIES_PEER_ID) {
      messageWithReplies = message;
      withReplies = true;
    } else {
      messageWithReplies = this.appMessagesManager.filterMessages(message, message => !!(message as Message.message).replies)[0] as any;
      withReplies = messageWithReplies && messageWithReplies.replies && messageWithReplies.replies.pFlags.comments && messageWithReplies.replies.channel_id !== 777;
    }

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
          
          let webpage = messageMedia.webpage;
          ////////this.log('messageMediaWebPage', webpage);
          if(webpage._ === 'webPageEmpty') {
            break;
          } 
          
          bubble.classList.add('webpage');
          
          let box = document.createElement('div');
          box.classList.add('web');
          
          let quote = document.createElement('div');
          quote.classList.add('quote');

          let previewResizer: HTMLDivElement, preview: HTMLDivElement;
          if(webpage.photo || webpage.document) {
            previewResizer = document.createElement('div');
            previewResizer.classList.add('preview-resizer');
            preview = document.createElement('div');
            preview.classList.add('preview');
            previewResizer.append(preview);
          }
          
          let doc: any = null;
          if(webpage.document) {
            doc = webpage.document;
            
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
              });
              preview.append(docDiv);
              preview.classList.add('preview-with-document');
              //messageDiv.classList.add((webpage.type || 'document') + '-message');
              //doc = null;
            }
          }
          
          if(previewResizer) {
            quote.append(previewResizer);
          }
          
          let quoteTextDiv = document.createElement('div');
          quoteTextDiv.classList.add('quote-text');

          if(webpage.site_name) {
            let nameEl = document.createElement('a');
            nameEl.classList.add('name');
            nameEl.setAttribute('target', '_blank');
            nameEl.href = webpage.url || '#';
            nameEl.innerHTML = RichTextProcessor.wrapEmojiText(webpage.site_name);
            quoteTextDiv.append(nameEl);
          }

          if(webpage.rTitle) {
            let titleDiv = document.createElement('div');
            titleDiv.classList.add('title');
            titleDiv.innerHTML = webpage.rTitle;
            quoteTextDiv.append(titleDiv);
          }

          if(webpage.rDescription) {
            let textDiv = document.createElement('div');
            textDiv.classList.add('text');
            textDiv.innerHTML = webpage.rDescription;
            quoteTextDiv.append(textDiv);
          }

          quote.append(quoteTextDiv);

          if(webpage.photo && !doc) {
            bubble.classList.add('photo');

            const size = webpage.photo.sizes[webpage.photo.sizes.length - 1];
            let isSquare = false;
            if(size.w === size.h && quoteTextDiv.childElementCount) {
              bubble.classList.add('is-square-photo');
              isSquare = true;
            } else if(size.h > size.w) {
              bubble.classList.add('is-vertical-photo');
            }

            wrapPhoto({
              photo: webpage.photo, 
              message, 
              container: preview, 
              boxWidth: mediaSizes.active.webpage.width, 
              boxHeight: mediaSizes.active.webpage.height, 
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
          messageDiv.insertBefore(box, messageDiv.lastElementChild);
          
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
            
            let size = bubble.classList.contains('emoji-big') ? 140 : 200;
            this.appPhotosManager.setAttachmentSize(doc, attachmentDiv, size, size);
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
              noAutoDownload: this.chat.noAutoDownloadMedia
            });

            if(newNameContainer) {
              nameContainer = newNameContainer;
            }

            const lastContainer = messageDiv.lastElementChild.querySelector('.document-message, .document-size, .audio');
            lastContainer && lastContainer.append(timeSpan.cloneNode(true));

            bubble.classList.remove('is-message-empty');
            messageDiv.classList.add((doc.type !== 'photo' ? doc.type || 'document' : 'document') + '-message');
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
    
    const needName = (peerId < 0 && (peerId !== message.fromId || our)) && message.fromId !== rootScope.myId;
    if(needName || message.fwd_from || message.reply_to_mid) { // chat
      let title: HTMLSpanElement;

      const isForwardFromChannel = message.from_id && message.from_id._ === 'peerChannel' && message.fromId === message.fwdFromId;
      
      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = document.createElement('span');
        title.innerHTML = RichTextProcessor.wrapEmojiText(message.fwd_from.from_name);
        title.classList.add('peer-title');
        //title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      } else {
        title = new PeerTitle({peerId: message.fwdFromId || message.fromId}).element;
      }
      
      //this.log(title);
      
      if((message.fwdFromId || message.fwd_from)) {
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
        loadPromises
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

  public performHistoryResult(history: number[], reverse: boolean, isBackLimit: boolean, additionMsgId?: number) {
    // commented bot getProfile in getHistory!
    if(!history/* .filter((id: number) => id > 0) */.length) {
      if(!isBackLimit) {
        this.scrollable.loadedAll.top = true;

        /* if(this.chat.type === 'discussion') {
          const serviceStartMessageId = this.appMessagesManager.threadsServiceMessagesIdsStorage[this.peerId + '_' + this.chat.threadId];
          if(serviceStartMessageId) history.push(serviceStartMessageId);
          history.push(this.chat.threadId);
        } */
      } else {
        this.scrollable.loadedAll.bottom = true;
      }
    }

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

    const historyStorage = this.appMessagesManager.getHistoryStorage(this.peerId, this.chat.threadId);
    if(history.includes(historyStorage.maxId)) {
      this.scrollable.loadedAll.bottom = true;
    }

    //console.time('appImManager render history');

    return new Promise<boolean>((resolve, reject) => {
      //await new Promise((resolve) => setTimeout(resolve, 1e3));

      /* if(DEBUG) {
        this.log('performHistoryResult: will render some messages:', history.length, this.isHeavyAnimationInProgress, this.messagesQueuePromise);
      } */

      const method = (reverse ? history.shift : history.pop).bind(history);

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

      while(history.length) {
        let message = this.chat.getMessage(method());
        this.renderMessage(message, reverse, true);
      }

      (this.messagesQueuePromise || Promise.resolve())
      //.then(() => new Promise(resolve => setTimeout(resolve, 100)))
      .then(() => {
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

        resolve(true);
      }, reject);
    }).then(() => {
      //console.timeEnd('appImManager render history');

      //return new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 300));
      return true;
    });
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
        this.scrollable.loadedAll.top = true;
        this.scrollable.loadedAll.bottom = true;
        return {history: mids.slice().reverse()};
      });
    }
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
        if(historyStorage.history.length < loadCount && !historyStorage.history.slice.isEnd(SliceEnd.Both)) {
          additionMsgIds = historyStorage.history.slice.slice();

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

    const processResult = (historyResult: typeof result) => {
      if(this.chat.type === 'discussion' && 'offsetIdOffset' in historyResult) {
        //this.log('discussion got history', loadCount, backLimit, historyResult, isTopEnd);

        // * inject discussion start
        if(historyResult.history.isEnd(SliceEnd.Top)) {
          const serviceStartMessageId = this.appMessagesManager.threadsServiceMessagesIdsStorage[this.peerId + '_' + this.chat.threadId];
          if(serviceStartMessageId) historyResult.history.push(serviceStartMessageId);
          historyResult.history.push(...this.chat.getMidsByMid(this.chat.threadId).reverse());
          this.scrollable.loadedAll.top = true;
        }
      }
    };

    const sup = (result: HistoryResult) => {
      /* if(maxId && result.history?.length) {
        if(this.bubbles[maxId]) {
          result.history.findAndSplice(mid => mid === maxId);  
        }
      } */

      processResult(result);
        
      ////console.timeEnd('render history total');
      
      return getHeavyAnimationPromise().then(() => {
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
            topIds.map(m => this.appMessagesManager.getServerMessageId(m)), 
            bottomIds.map(m => this.appMessagesManager.getServerMessageId(m)));
        }

        const setBubbles: HTMLElement[] = [];

        this.chatInner.classList.add('zoom-fading');
        const delay = isAdditionRender ? 10 : 40;
        const offsetIndex = isAdditionRender ? 0 : 1;
        const animateAsLadder = (mids: number[], offsetIndex = 0) => {
          const animationPromise = deferredPromise<void>();
          let lastMsDelay = 0;
          mids.forEach((mid, idx) => {
            if(!this.bubbles[mid]) {
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

        fastRaf(() => {
          setBubbles.forEach(contentWrapper => {
            contentWrapper.classList.remove('zoom-fade');
          });
        });

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
          this.scrollable.loadedAll.bottom = false;

          //this.log('getHistory: slice bottom messages:', ids.length, loadCount);
          //this.getHistoryBottomPromise = undefined; // !WARNING, это нужно для обратной загрузки истории, если запрос словил флуд
        } else {
          //ids = ids.slice(0, removeCount);
          //ids = ids.slice(0, ids.length - (removeCount * 2));
          ids = ids.slice(0, ids.length - safeCount);
          this.scrollable.loadedAll.top = false;

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
