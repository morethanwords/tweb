import { AppImManager, CHAT_ANIMATION_GROUP } from "../../lib/appManagers/appImManager";
import type { AppMessagesManager, Dialog, HistoryResult } from "../../lib/appManagers/appMessagesManager";
import type { AppSidebarRight } from "../sidebarRight";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/AppInlineBotsManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { AppDocsManager } from "../../lib/appManagers/appDocsManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import { findUpClassName, cancelEvent, findUpTag, CLICK_EVENT_NAME, whichChild } from "../../helpers/dom";
import { getObjectKeysAndSort } from "../../helpers/object";
import { isTouchSupported } from "../../helpers/touchSupport";
import { logger, LogLevels } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import AppMediaViewer from "../appMediaViewer";
import BubbleGroups from "../bubbleGroups";
import Button from "../button";
import PopupDatePicker from "../popupDatepicker";
import PopupForward from "../popupForward";
import PopupStickers from "../popupStickers";
import ProgressivePreloader from "../preloader";
import Scrollable from "../scrollable";
import StickyIntersector from "../stickyIntersector";
import ChatContextMenu from "./contextMenu";
import ChatSelection from "./selection";
import animationIntersector from "../animationIntersector";
import { months } from "../../helpers/date";
import RichTextProcessor from "../../lib/richtextprocessor";
import mediaSizes from "../../helpers/mediaSizes";
import { isAndroid, isApple, isSafari } from "../../helpers/userAgent";
import { langPack } from "../../lib/langPack";
import AudioElement from "../audio";
import AvatarElement from "../avatar";
import { formatPhoneNumber } from "../misc";
import { ripple } from "../ripple";
import { wrapAlbum, wrapPhoto, wrapVideo, wrapDocument, wrapSticker, wrapPoll, wrapReply } from "../wrappers";
import { MessageRender } from "./messageRender";
import LazyLoadQueue from "../lazyLoadQueue";
import { AppChatsManager } from "../../lib/appManagers/appChatsManager";
import Chat from "./chat";
import ListenerSetter from "../../helpers/listenerSetter";

const IGNORE_ACTIONS = ['messageActionHistoryClear'];

const TEST_SCROLL_TIMES: number = undefined;
let TEST_SCROLL = TEST_SCROLL_TIMES;



export default class ChatBubbles {
  bubblesContainer: HTMLDivElement;
  chatInner: HTMLDivElement;
  goDownBtn: HTMLButtonElement;
  
  scrollable: Scrollable;
  scroll: HTMLElement;

  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;

  public peerID = 0;

  public unreadOut = new Set<number>();
  public needUpdate: {replyMid: number, mid: number}[] = []; // if need wrapSingleMessage

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

  public bubbleGroups = new BubbleGroups();

  private preloader: ProgressivePreloader = null;
  
  private scrolledAll: boolean;
  private scrolledAllDown: boolean;

  private loadedTopTimes = 0;
  private loadedBottomTimes = 0;

  public messagesQueuePromise: Promise<void> = null;
  private messagesQueue: {message: any, bubble: HTMLDivElement, reverse: boolean, promises: Promise<void>[]}[] = [];
  private messagesQueueOnRender: () => void = null;

  private firstUnreadBubble: HTMLDivElement = null;
  private attachedUnreadBubble: boolean;

  public lazyLoadQueue = new LazyLoadQueue();

  private cleanupObj = {cleaned: false};

  private log: ReturnType<typeof logger>;

  public listenerSetter: ListenerSetter;

  constructor(private chat: Chat, private appMessagesManager: AppMessagesManager, private appSidebarRight: AppSidebarRight, private appStickersManager: AppStickersManager, private appUsersManager: AppUsersManager, private appInlineBotsManager: AppInlineBotsManager, private appPhotosManager: AppPhotosManager, private appDocsManager: AppDocsManager, private appPeersManager: AppPeersManager, private appChatsManager: AppChatsManager) {
    this.chat.log.error('Bubbles construction');
    
    this.listenerSetter = new ListenerSetter();

    this.bubblesContainer = document.createElement('div');
    this.bubblesContainer.classList.add('bubbles', 'scrolled-down');

    this.chatInner = document.createElement('div');
    this.chatInner.classList.add('bubbles-inner');

    this.goDownBtn = Button('bubbles-go-down btn-corner z-depth-1 hide', {icon: 'down'});

    this.bubblesContainer.append(this.chatInner, this.goDownBtn);

    this.setScroll();

    // * constructor end

    this.log = this.chat.log;
    this.preloader = new ProgressivePreloader(null, false);

    // * events

    // will call when message is sent (only 1)
    this.listenerSetter.add(rootScope, 'history_append', (e) => {
      let details = e.detail;

      if(!this.scrolledAllDown) {
        this.chat.setPeer(this.peerID, 0);
      } else {
        this.renderNewMessagesByIDs([details.messageID], true);
      }
    });
    
    // will call when sent for update pos
    this.listenerSetter.add(rootScope, 'history_update', (e) => {
      let details = e.detail;
      
      if(details.mid && details.peerID == this.peerID) {
        let mid = details.mid;
        
        let bubble = this.bubbles[mid];
        if(!bubble) return;
        
        let message = appMessagesManager.getMessage(mid);
        //this.log('history_update', this.bubbles[mid], mid, message);

        let dateMessage = this.getDateContainerByMessage(message, false);
        dateMessage.container.append(bubble);

        this.bubbleGroups.addBubble(bubble, message, false);

        //this.renderMessage(message, false, false, bubble);
      }
    });

    this.listenerSetter.add(rootScope, 'history_multiappend', (e) => {
      const msgIDsByPeer = e.detail;

      for(const peerID in msgIDsByPeer) {
        appSidebarRight.sharedMediaTab.renderNewMessages(+peerID, msgIDsByPeer[peerID]);
      }

      if(!(this.peerID in msgIDsByPeer)) return;
      const msgIDs = msgIDsByPeer[this.peerID];
      this.renderNewMessagesByIDs(msgIDs);
    });
    
    this.listenerSetter.add(rootScope, 'history_delete', (e) => {
      const {peerID, msgs} = e.detail;

      const mids = Object.keys(msgs).map(s => +s);
      appSidebarRight.sharedMediaTab.deleteDeletedMessages(peerID, mids);

      if(peerID == this.peerID) {
        this.deleteMessagesByIDs(mids);
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_flush', (e) => {
      let peerID: number = e.detail.peerID;
      if(this.peerID == peerID) {
        this.deleteMessagesByIDs(Object.keys(this.bubbles).map(m => +m));
      }
    });

    // Calls when message successfully sent and we have an ID
    this.listenerSetter.add(rootScope, 'message_sent', (e) => {
      const {tempID, mid} = e.detail;
      
      this.log('message_sent', e.detail);

      const message = this.appMessagesManager.getMessage(mid);

      appSidebarRight.sharedMediaTab.renderNewMessages(message.peerID, [mid]);
      
      const bubble = this.bubbles[tempID];
      if(bubble) {
        this.bubbles[mid] = bubble;
        
        /////this.log('message_sent', bubble);

        // set new mids to album items for mediaViewer
        if(message.grouped_id) {
          const items = bubble.querySelectorAll('.album-item');
          const groupIDs = getObjectKeysAndSort(appMessagesManager.groupedMessagesStorage[message.grouped_id]);
          (Array.from(items) as HTMLElement[]).forEach((item, idx) => {
            item.dataset.mid = '' + groupIDs[idx];
          });
        }

        if(message.media?.poll) {
          const newPoll = message.media.poll;
          const pollElement = bubble.querySelector('poll-element');
          if(pollElement) {
            pollElement.setAttribute('poll-id', newPoll.id);
            pollElement.setAttribute('message-id', '' + mid);
          }
        }

        if(['audio', 'voice'].includes(message.media?.document?.type)) {
          const audio = bubble.querySelector('audio-element');
          audio.setAttribute('doc-id', message.media.document.id);
          audio.setAttribute('message-id', '' + mid);
        }

        bubble.classList.remove('is-sending');
        bubble.classList.add('is-sent');
        bubble.dataset.mid = '' + mid;

        this.bubbleGroups.removeBubble(bubble, tempID);

        if(message.media?.webpage && !bubble.querySelector('.web')) {
          const mounted = this.getMountedBubble(mid);
          if(!mounted) return;
          this.renderMessage(mounted.message, true, false, mounted.bubble, false);
        }
        
        delete this.bubbles[tempID];
      } else {
        this.log.warn('message_sent there is no bubble', e.detail);
      }

      if(this.unreadOut.has(tempID)) {
        this.unreadOut.delete(tempID);
        this.unreadOut.add(mid);
      }
    });

    this.listenerSetter.add(rootScope, 'message_edit', (e) => {
      const {peerID, mid} = e.detail;
      
      if(peerID != this.peerID) return;
      const mounted = this.getMountedBubble(mid);
      if(!mounted) return;
      this.renderMessage(mounted.message, true, false, mounted.bubble, false);
    });

    this.listenerSetter.add(rootScope, 'album_edit', (e) => {
      const {peerID, groupID, deletedMids} = e.detail;
      
      if(peerID != this.peerID) return;
      const mids = appMessagesManager.getMidsByAlbum(groupID);
      const maxID = Math.max(...mids.concat(deletedMids));
      if(!this.bubbles[maxID]) return;

      const renderMaxID = getObjectKeysAndSort(appMessagesManager.groupedMessagesStorage[groupID], 'asc').pop();
      this.renderMessage(appMessagesManager.getMessage(renderMaxID), true, false, this.bubbles[maxID], false);
    });

    this.listenerSetter.add(rootScope, 'messages_downloaded', (e) => {
      const mids: number[] = e.detail;
      
      mids.forEach(mid => {
        /* const promise = (this.scrollable.scrollLocked && this.scrollable.scrollLockedPromise) || Promise.resolve();
        promise.then(() => {

        }); */
        this.needUpdate.forEachReverse((obj, idx) => {
          if(obj.replyMid == mid) {
            const {mid, replyMid} = this.needUpdate.splice(idx, 1)[0];
            
            //this.log('messages_downloaded', mid, replyMid, i, this.needUpdate, this.needUpdate.length, mids, this.bubbles[mid]);
            const bubble = this.bubbles[mid];
            if(!bubble) return;
            
            const message = appMessagesManager.getMessage(mid);
            
            const repliedMessage = appMessagesManager.getMessage(replyMid);
            if(repliedMessage.deleted) { // чтобы не пыталось бесконечно загрузить удалённое сообщение
              delete message.reply_to_mid; // WARNING!
            }
            
            this.renderMessage(message, true, false, bubble, false);
            //this.renderMessage(message, true, true, bubble, false);
          }
        });
      });
    });

    this.listenerSetter.add(rootScope, 'dialog_drop', (e) => {
      if(e.detail.peerID == this.peerID) {
        this.chat.setPeer(0);
      }
    });

    this.listenerSetter.add(rootScope, 'dialog_unread', (e) => {
      const info = e.detail;

      const dialog = appMessagesManager.getDialogByPeerID(info.peerID)[0];
      if(dialog) {
        if(dialog.peerID == this.peerID) {
          this.updateUnreadByDialog(dialog);
        }
      }
    });

    this.listenerSetter.add(this.bubblesContainer, 'click', (e) => {
      let target = e.target as HTMLElement;
      let bubble: HTMLElement = null;
      try {
        bubble = findUpClassName(target, 'bubble');
      } catch(err) {}
      
      if(!bubble) return;

      if(bubble.classList.contains('is-date') && findUpClassName(target, 'bubble__container')) {
        if(bubble.classList.contains('is-sticky') && !this.chatInner.classList.contains('is-scrolling')) {
          return;
        }

        for(const timestamp in this.dateMessages) {
          const d = this.dateMessages[timestamp];
          if(d.div == bubble) {
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
        this.chat.selection.toggleByBubble(findUpClassName(target, 'album-item') || bubble);
        return;
      }

      const contactDiv: HTMLElement = findUpClassName(target, 'contact');
      if(contactDiv) {
        this.chat.appImManager.setInnerPeer(+contactDiv.dataset.peerID);
        return;
      }

      //this.log('chatInner click:', target);
      const isVideoComponentElement = target.tagName == 'SPAN';
      /* if(isVideoComponentElement) {
        const video = target.parentElement.querySelector('video') as HTMLElement;
        if(video) {
          video.click(); // hot-fix for time and play button
          return;
        }
      } */

      if(bubble.classList.contains('sticker') && target.parentElement.classList.contains('attachment')) {
        const messageID = +bubble.dataset.mid;
        const message = appMessagesManager.getMessage(messageID);

        const doc = message.media?.document;

        if(doc?.stickerSetInput) {
          new PopupStickers(doc.stickerSetInput).show();
        }

        return;
      }

      if((target.tagName == 'IMG' && !target.classList.contains('emoji') && target.parentElement.tagName != "AVATAR-ELEMENT" && !target.classList.contains('document-thumb')) 
        || target.classList.contains('album-item')
        || isVideoComponentElement
        || (target.tagName == 'VIDEO' && !bubble.classList.contains('round'))) {
        let messageID = +findUpClassName(target, 'album-item')?.dataset.mid || +bubble.dataset.mid;
        let message = appMessagesManager.getMessage(messageID);
        if(!message) {
          this.log.warn('no message by messageID:', messageID);
          return;
        }

        let targets: {element: HTMLElement, mid: number}[] = [];
        let ids = Object.keys(this.bubbles).map(k => +k).filter(id => {
          //if(!this.scrollable.visibleElements.find(e => e.element == this.bubbles[id])) return false;
  
          let message = appMessagesManager.getMessage(id);
          
          return message.media && (message.media.photo || (message.media.document && (message.media.document.type == 'video' || message.media.document.type == 'gif')) || (message.media.webpage && (message.media.webpage.document || message.media.webpage.photo)));
        }).sort((a, b) => a - b);

        ids.forEach(id => {
          let withTail = this.bubbles[id].classList.contains('with-media-tail');
          let str = '.album-item img, .album-item video, .preview img, .preview video, ';
          if(withTail) {
            str += '.bubble__media-container';
          } else {
            str += '.attachment img, .attachment video';
          }

          let elements = this.bubbles[id].querySelectorAll(str) as NodeListOf<HTMLElement>;
          Array.from(elements).forEach((element: HTMLElement) => {
            let albumItem = findUpClassName(element, 'album-item');
            targets.push({
              element,
              mid: +albumItem?.dataset.mid || id
            });
          });
        });

        targets.sort((a, b) => a.mid - b.mid);

        let idx = targets.findIndex(t => t.mid == messageID);

        this.log('open mediaViewer single with ids:', ids, idx, targets);

        if(!targets[idx]) {
          this.log('no target for media viewer!', target);
          return;
        }

        new AppMediaViewer().openMedia(message, targets[idx].element, true, 
          targets.slice(0, idx), targets.slice(idx + 1)/* , !message.grouped_id */);
        
        cancelEvent(e);
        //appMediaViewer.openMedia(message, target as HTMLImageElement);
        return;
      }
      
      if(['IMG', 'DIV', "AVATAR-ELEMENT"].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');
      
      if(target.tagName == 'DIV' || target.tagName == "AVATAR-ELEMENT") {
        if(target.classList.contains('goto-original')) {
          let savedFrom = bubble.dataset.savedFrom;
          let splitted = savedFrom.split('_');
          let peerID = +splitted[0];
          let msgID = +splitted[1];
          ////this.log('savedFrom', peerID, msgID);
          this.chat.appImManager.setInnerPeer(peerID, msgID);
          return;
        } else if(target.classList.contains('forward')) {
          const mid = +bubble.dataset.mid;
          new PopupForward([mid]);
          //appSidebarRight.forwardTab.open([mid]);
          return;
        } else if(target.classList.contains('name')) {
          let peerID = +target.dataset.peerID;
          
          if(peerID) {
            this.chat.appImManager.setInnerPeer(peerID);
          }

          return;
        } else if(target.tagName == "AVATAR-ELEMENT") {
          let peerID = +target.getAttribute('peer');
          
          if(peerID) {
            this.chat.appImManager.setInnerPeer(peerID);
          }

          return;
        }
        
        let isReplyClick = false;
        
        try {
          isReplyClick = !!findUpClassName(e.target, 'reply');
        } catch(err) {}
        
        if(isReplyClick && bubble.classList.contains('is-reply')/*  || bubble.classList.contains('forwarded') */) {
          let originalMessageID = +bubble.getAttribute('data-original-mid');
          this.chat.setPeer(this.peerID, originalMessageID);
        }
      } else if(target.tagName == 'IMG' && target.parentElement.tagName == "AVATAR-ELEMENT") {
        let peerID = +target.parentElement.getAttribute('peer');
        
        if(peerID) {
          this.chat.appImManager.setInnerPeer(peerID);
        }
      }
      
      //console.log('chatInner click', e);
    }, {capture: true, passive: false});

    this.listenerSetter.add(this.goDownBtn, CLICK_EVENT_NAME, (e) => {
      cancelEvent(e);
      const dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
      
      if(dialog) {
        this.chat.setPeer(this.peerID/* , dialog.top_message */);
      } else {
        this.log('will scroll down 3');
        this.scroll.scrollTop = this.scroll.scrollHeight;
      }
    });
    
    this.stickyIntersector = new StickyIntersector(this.scrollable.container, (stuck, target) => {
      for(const timestamp in this.dateMessages) {
        const dateMessage = this.dateMessages[timestamp];
        if(dateMessage.container == target) {
          dateMessage.div.classList.toggle('is-sticky', stuck);
          break;
        }
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
          this.unreaded.findAndSplice(id => id == mid);
        }
      });

      if(readed.length) {
        const max = Math.max(...readed);

        let length = readed.length;
        for(let i = this.unreaded.length - 1; i >= 0; --i) {
          const mid = this.unreaded[i];
          if(mid < max) {
            length++;
            this.unreaded.splice(i, 1);
          }
        }

        this.log('will readHistory by ids:', max, length);
        
        /* if(this.peerID < 0) {
          max = appMessagesIDsManager.getMessageIDInfo(max)[0];
        } */

        //appMessagesManager.readMessages(readed);
        /* false && */ appMessagesManager.readHistory(this.peerID, max).catch((err: any) => {
          this.log.error('readHistory err:', err);
          appMessagesManager.readHistory(this.peerID, max);
        });
      }
    });
  }

  public getAlbumBubble(groupID: string) {
    const group = this.appMessagesManager.groupedMessagesStorage[groupID];
    for(const mid in group) {
      if(this.bubbles[mid]) {
        return {
          bubble: this.bubbles[mid], 
          message: this.appMessagesManager.getMessage(+mid)
        };
      }
    }

    return null;
  }

  public getBubbleAlbumItems(bubble: HTMLElement) {
    return Array.from(bubble.querySelectorAll('.album-item')) as HTMLElement[];
  }

  public getMountedBubble(mid: number) {
    const message = this.appMessagesManager.getMessage(mid);

    const bubble = this.bubbles[mid];
    if(!bubble && message.grouped_id) {
      const a = this.getAlbumBubble(message.grouped_id);
      if(a) return a;
    }
    if(!bubble) return;

    return {bubble, message};
  }

  private findNextMountedBubbleByMsgID(mid: number) {
    return this.bubbles[getObjectKeysAndSort(this.bubbles).find(id => {
      if(id < mid) return false;
      return !!this.bubbles[id]?.parentElement;
    })];
  }

  public loadMoreHistory(top: boolean, justLoad = false) {
    //this.log('loadMoreHistory', top);
    if(!this.peerID || /* TEST_SCROLL || */ this.chat.setPeerPromise || (top && this.getHistoryTopPromise) || (!top && this.getHistoryBottomPromise)) return;

    // warning, если иды только отрицательные то вниз не попадёт (хотя мб и так не попадёт)
    let history = Object.keys(this.bubbles).map(id => +id).filter(id => id > 0).sort((a, b) => a - b);
    if(!history.length) return;
    
    if(top && !this.scrolledAll) {
      this.log('Will load more (up) history by id:', history[0], 'maxID:', history[history.length - 1], history);
      /* if(history.length == 75) {
        this.log('load more', this.scrollable.scrollHeight, this.scrollable.scrollTop, this.scrollable);
        return;
      } */
      /* false &&  */this.getHistory(history[0], true, undefined, undefined, justLoad);
    }

    if(this.scrolledAllDown) return;
    
    let dialog = this.appMessagesManager.getDialogByPeerID(this.peerID)[0];
    
    // if scroll down after search
    if(!top && (!dialog || history.indexOf(dialog.top_message) === -1)) {
      this.log('Will load more (down) history by maxID:', history[history.length - 1], history);
      /* false &&  */this.getHistory(history[history.length - 1], false, true, undefined, justLoad);
    }
  }

  public onScroll = () => {
    // * В таком случае, кнопка не будет моргать если чат в самом низу, и правильно отработает случай написания нового сообщения и проскролла вниз
    if(this.scrollable.scrollLocked && this.scrolledDown) return;
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
    
    if(this.scrollable.isScrolledDown) {
      this.bubblesContainer.classList.add('scrolled-down');
      this.scrolledDown = true;
    } else if(this.bubblesContainer.classList.contains('scrolled-down')) {
      this.bubblesContainer.classList.remove('scrolled-down');
      this.scrolledDown = false;
    }

    this.chat.topbar.pinnedMessage.setCorrectIndex(this.scrollable.lastScrollDirection);
  };

  public setScroll() {
    this.scrollable = new Scrollable(this.bubblesContainer/* .firstElementChild */ as HTMLElement, 'IM', 300);

    /* const getScrollOffset = () => {
      //return Math.round(Math.max(300, appPhotosManager.windowH / 1.5));
      return 300; 
    };

    window.addEventListener('resize', () => {
      this.scrollable.onScrollOffset = getScrollOffset();
    });

    this.scrollable = new Scrollable(this.bubblesContainer, 'y', 'IM', this.chatInner, getScrollOffset()); */
    this.scroll = this.scrollable.container;

    this.bubblesContainer/* .firstElementChild */.append(this.goDownBtn);
    
    this.scrollable.onAdditionalScroll = this.onScroll;
    this.scrollable.onScrolledTop = () => this.loadMoreHistory(true);
    this.scrollable.onScrolledBottom = () => this.loadMoreHistory(false);
    //this.scrollable.attachSentinels(undefined, 300);

    this.bubblesContainer.classList.add('scrolled-down');

    if(isTouchSupported) {
      this.scroll.addEventListener('touchmove', () => {
        if(this.isScrollingTimeout) {
          clearTimeout(this.isScrollingTimeout);
        } else if(!this.chatInner.classList.contains('is-scrolling')) {
          this.chatInner.classList.add('is-scrolling');
        }
      }, {passive: true});

      this.scroll.addEventListener('touchend', () => {
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

  public updateUnreadByDialog(dialog: Dialog) {
    let maxID = this.peerID == rootScope.myID ? dialog.read_inbox_max_id : dialog.read_outbox_max_id;
    
    ///////this.log('updateUnreadByDialog', maxID, dialog, this.unreadOut);
    
    for(let msgID of this.unreadOut) {
      if(msgID > 0 && msgID <= maxID) {
        let bubble = this.bubbles[msgID];
        if(bubble) {
          bubble.classList.remove('is-sent');
          bubble.classList.add('is-read');
        }
        
        this.unreadOut.delete(msgID);
      }
    }
  }
  
  public deleteMessagesByIDs(mids: number[]) {
    mids.forEach(mid => {
      if(!(mid in this.bubbles)) return;
      
      /* const mounted = this.getMountedBubble(mid);
      if(!mounted) return; */

      const bubble = this.bubbles[mid];
      delete this.bubbles[mid];

      if(this.firstUnreadBubble == bubble) {
        this.firstUnreadBubble = null;
      }

      this.bubbleGroups.removeBubble(bubble, mid);
      this.unreadedObserver.unobserve(bubble);
      //this.unreaded.findAndSplice(mid => mid == id);
      bubble.remove();
      //bubble.remove();
    });
    
    animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP);
    this.deleteEmptyDateGroups();
  }
  
  public renderNewMessagesByIDs(msgIDs: number[], scrolledDown = this.scrolledDown) {
    if(!this.scrolledAllDown) { // seems search active or sliced
      this.log('seems search is active, skipping render:', msgIDs);
      return;
    }
    
    msgIDs.forEach((msgID: number) => {
      let message = this.appMessagesManager.getMessage(msgID);
      
      /////////this.log('got new message to append:', message);
      
      //this.unreaded.push(msgID);
      this.renderMessage(message);
    });
    
    //if(scrolledDown) this.scrollable.scrollTop = this.scrollable.scrollHeight;
    if(this.messagesQueuePromise && scrolledDown) {
      if(this.scrollable.isScrolledDown && !this.scrollable.scrollLocked) {
        //this.log('renderNewMessagesByIDs: messagesQueuePromise before will set prev max');
        this.scrollable.scrollTo(this.scrollable.scrollHeight - 1, 'top', false, true);
      }
      
      this.messagesQueuePromise.then(() => {
        //this.log('renderNewMessagesByIDs: messagesQueuePromise after', this.scrollable.isScrolledDown);
        this.scrollable.scrollTo(this.scrollable.scrollHeight, 'top', true, true);

        /* setTimeout(() => {
          this.log('messagesQueuePromise afterafter:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        }, 10); */
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
      let str = '';
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if(today.getTime() == date.getTime()) {
        str = 'Today';
      } else {
        str = months[date.getMonth()] + ' ' + date.getDate();

        if(date.getFullYear() != today.getFullYear()) {
          str += ', ' + date.getFullYear();
        }
      }
      
      const div = document.createElement('div');
      div.className = 'bubble service is-date';
      div.innerHTML = `<div class="bubble__container"><div class="service-msg">${str}</div></div>`;
      ////////this.log('need to render date message', dateTimestamp, str);

      const container = document.createElement('div');
      container.className = 'bubbles-date-group';
      
      this.dateMessages[dateTimestamp] = {
        div,
        container,
        firstTimestamp: date.getTime()
      };

      container.append(div);

      if(reverse) {
        this.chatInner.prepend(container);
      } else {
        this.chatInner.append(container);
      }

      this.stickyIntersector.observeStickyHeaderChanges(container);
    }

    return this.dateMessages[dateTimestamp];
  }

  public destroy() {
    this.chat.log.error('Bubbles destroying');

    this.scrollable.onScrolledTop = this.scrollable.onScrolledBottom = this.scrollable.onAdditionalScroll = null;

    this.listenerSetter.removeAll();

    this.lazyLoadQueue.clear();
    this.unreadedObserver.disconnect();
    this.stickyIntersector.disconnect();

    delete this.lazyLoadQueue;
    delete this.unreadedObserver;
    delete this.stickyIntersector;
  }

  public cleanup(bubblesToo = false) {
    ////console.time('appImManager cleanup');
    this.scrolledAll = false;
    this.scrolledAllDown = false;

    if(TEST_SCROLL !== undefined) {
      TEST_SCROLL = TEST_SCROLL_TIMES;
    }

    this.bubbles = {};
    this.dateMessages = {};
    this.bubbleGroups.cleanup();
    this.unreadOut.clear();
    this.needUpdate.length = 0;
    //this.lazyLoadQueue.clear();
    
    //this.chatInputC.replyElements.cancelBtn.click();

    // clear messages
    if(bubblesToo) {
      this.scrollable.container.innerHTML = '';
    }

    this.firstUnreadBubble = null;
    this.attachedUnreadBubble = false;

    this.messagesQueue.length = 0;
    this.messagesQueuePromise = null;

    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;

    this.stickyIntersector.disconnect();
    
    this.unreadedObserver.disconnect();
    this.unreaded.length = 0;

    this.loadedTopTimes = this.loadedBottomTimes = 0;

    this.cleanupObj.cleaned = true;
    this.cleanupObj = {cleaned: false};

    ////console.timeEnd('appImManager cleanup');
  }

  public setPeer(peerID: number, lastMsgID?: number): {cached?: boolean, promise: Chat['setPeerPromise']} {
    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(peerID == 0) {
      this.goDownBtn.classList.add('hide');
      this.cleanup(true);
      this.peerID = 0;
      return null;
    }

    const samePeer = this.peerID == peerID;

    const dialog = this.appMessagesManager.getDialogByPeerID(peerID)[0] || null;
    let topMessage = lastMsgID <= 0 ? lastMsgID : dialog?.top_message ?? 0; // убрать + 1 после создания базы референсов
    const isTarget = lastMsgID !== undefined;
    // @ts-ignore
    /* if(topMessage && dialog && dialog.top_message == topMessage && dialog.refetchTopMessage) {
      // @ts-ignore
      dialog.refetchTopMessage = false;
      topMessage += 1;
    } */
    if(!isTarget && dialog) {
      if(dialog.unread_count && !samePeer) {
        lastMsgID = dialog.read_inbox_max_id;
      } else {
        lastMsgID = dialog.top_message;
        //lastMsgID = topMessage;
      }
    }
    
    if(samePeer) {
      const mounted = this.getMountedBubble(lastMsgID);
      if(mounted) {
        if(isTarget) {
          this.scrollable.scrollIntoView(mounted.bubble);
          this.highlightBubble(mounted.bubble);
        } else if(dialog && lastMsgID == topMessage) {
          //this.log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          this.scroll.scrollTop = this.scroll.scrollHeight;
        }
        
        return null;
      }
    } else {
      this.peerID = peerID;
    }

    this.log('setPeer peerID:', this.peerID, dialog, lastMsgID, topMessage);

    const isJump = lastMsgID != topMessage;
    // add last message, bc in getHistory will load < max_id
    const additionMsgID = isJump ? 0 : topMessage;

    /* this.setPeerPromise = null;
    this.preloader.detach();
    return true; */

    //////appSidebarRight.toggleSidebar(true);

    const maxBubbleID = samePeer && Math.max(...Object.keys(this.bubbles).map(mid => +mid));

    const oldChatInner = this.chatInner;
    this.cleanup();
    this.chatInner = document.createElement('div');
    this.chatInner.className = oldChatInner.className;
    this.chatInner.classList.add('disable-hover', 'is-scrolling');

    if(!samePeer) {
      this.lazyLoadQueue.clear();
    }

    this.lazyLoadQueue.lock();

    const {promise, cached} = this.getHistory(lastMsgID, true, isJump, additionMsgID);

    // clear 
    if(!cached) {
      this.scrollable.container.innerHTML = '';
      //oldChatInner.remove();

      this.preloader.attach(this.bubblesContainer);
    }

    //console.timeEnd('appImManager setPeer pre promise');
    
    animationIntersector.lockGroup(CHAT_ANIMATION_GROUP);
    const setPeerPromise = promise.then(() => {
      ////this.log('setPeer removing preloader');

      if(cached) {
        this.scrollable.container.innerHTML = '';
        //oldChatInner.remove();
      } else {
        this.preloader.detach();
      }

      this.scrollable.container.append(this.chatInner);
      animationIntersector.unlockGroup(CHAT_ANIMATION_GROUP);
      animationIntersector.checkAnimations(false, CHAT_ANIMATION_GROUP/* , true */);
      //this.scrollable.attachSentinels();
      //this.scrollable.container.insertBefore(this.chatInner, this.scrollable.container.lastElementChild);

      this.lazyLoadQueue.unlock();

      //if(dialog && lastMsgID && lastMsgID != topMessage && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
      if(dialog && (isTarget || (lastMsgID != topMessage)) && (this.bubbles[lastMsgID] || this.firstUnreadBubble)) {
        if(this.scrollable.scrollLocked) {
          clearTimeout(this.scrollable.scrollLocked);
          this.scrollable.scrollLocked = 0;
        }
        
        const fromUp = maxBubbleID > 0 && (maxBubbleID < lastMsgID || lastMsgID < 0);
        const forwardingUnread = dialog.read_inbox_max_id == lastMsgID && !isTarget;
        if(!fromUp && (samePeer || forwardingUnread)) {
          this.scrollable.scrollTop = this.scrollable.scrollHeight;
        }

        let bubble: HTMLElement = forwardingUnread ? (this.firstUnreadBubble || this.bubbles[lastMsgID]) : this.bubbles[lastMsgID];
        if(!bubble?.parentElement) {
          bubble = this.findNextMountedBubbleByMsgID(lastMsgID);
        }

        this.scrollable.scrollIntoView(bubble, samePeer/* , fromUp */);
        if(!forwardingUnread) {
          this.highlightBubble(bubble);
        }
      } else {
        this.scrollable.scrollTop = this.scrollable.scrollHeight;
      }

      // warning
      if(!lastMsgID || this.bubbles[topMessage] || lastMsgID == topMessage) {
        this.scrolledAllDown = true;
      }

      this.log('scrolledAllDown:', this.scrolledAllDown);

      //if(!this.unreaded.length && dialog) { // lol
      if(this.scrolledAllDown && dialog) { // lol
        this.appMessagesManager.readHistory(peerID, dialog.top_message);
      }

      if(dialog?.pFlags?.unread_mark) {
        this.appMessagesManager.markDialogUnread(peerID, true);
      }

      this.chatInner.classList.remove('disable-hover', 'is-scrolling'); // warning, performance!

      //console.timeEnd('appImManager setPeer');
    }).catch(err => {
      this.log.error('getHistory promise error:', err);
      this.preloader.detach();
      throw err;
    });

    return {cached, promise: setPeerPromise};
  }

  public finishPeerChange() {
    let peerID = this.peerID;

    //this.topbar.setPeer(peerID);

    const isAnyGroup = this.appPeersManager.isAnyGroup(peerID);
    const isChannel = this.appPeersManager.isChannel(peerID);
    const isBroadcast = this.appPeersManager.isBroadcast(peerID);
    
    const canWrite = this.appMessagesManager.canWriteToPeer(peerID);
    
    this.chatInner.classList.toggle('has-rights', canWrite);
    this.bubblesContainer.classList.toggle('is-chat-input-hidden', !canWrite);

    this.chatInner.classList.toggle('is-chat', isAnyGroup || peerID == rootScope.myID);
    this.chatInner.classList.toggle('is-channel', isChannel);
    this.goDownBtn.classList.toggle('is-broadcast', isBroadcast);

    window.requestAnimationFrame(() => {
      this.goDownBtn.classList.remove('hide');
    });
  }

  public renderMessagesQueue(message: any, bubble: HTMLDivElement, reverse: boolean) {
    /* let dateMessage = this.getDateContainerByMessage(message, reverse);
    if(reverse) dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
    else dateMessage.container.append(bubble);
    return; */

    //this.log('renderMessagesQueue');

    let promises: Promise<any>[] = [];
    (Array.from(bubble.querySelectorAll('img, video')) as HTMLImageElement[]).forEach(el => {
      if(el instanceof HTMLVideoElement) {
        if(!el.src) {
          //this.log.warn('no source', el, source, 'src', source.src);
          return;
        } else if(el.readyState >= 4) return;
      } else if(el.complete || !el.src) return;

      let promise = new Promise((resolve, reject) => {
        let r: () => boolean;
        let onLoad = () => {
          clearTimeout(timeout);
          resolve();

          // lol
          el.removeEventListener(el instanceof HTMLVideoElement ? 'canplay' : 'load', onLoad);
        };

        if(el instanceof HTMLVideoElement) {
          el.addEventListener('canplay', onLoad);
          r = () => el.readyState >= 1;
        } else {
          el.addEventListener('load', onLoad);
          r = () => el.complete;
        }

        // for safari
        let c = () => r() ? onLoad() : window.requestAnimationFrame(c);
        window.requestAnimationFrame(c);

        let timeout = setTimeout(() => {
          // @ts-ignore
          //this.log.error('did not called', el, el.parentElement, el.complete, el.readyState, src);
          resolve();
        }, 1500);
      });

      promises.push(promise);
    });

    this.messagesQueue.push({message, bubble, reverse, promises});

    if(!this.messagesQueuePromise) {
      this.messagesQueuePromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          const chatInner = this.chatInner;
          const queue = this.messagesQueue.slice();
          this.messagesQueue.length = 0;

          const promises = queue.reduce((acc, {promises}) => acc.concat(promises), []);

          // * это нужно для того, чтобы если захочет подгрузить reply или какое-либо сообщение, то скролл не прервался
          if(this.scrollable.scrollLocked) {
            promises.push(this.scrollable.scrollLockedPromise);
          }

          //this.log('promises to call', promises, queue);
          Promise.all(promises).then(() => {
            if(this.chatInner != chatInner) {
              //this.log.warn('chatInner changed!', this.chatInner, chatInner);
              return reject('chatInner changed!');
            }

            if(this.messagesQueueOnRender) {
              this.messagesQueueOnRender();
            }

            queue.forEach(({message, bubble, reverse}) => {
              const dateMessage = this.getDateContainerByMessage(message, reverse);
              if(reverse) {
                dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
              } else {
                dateMessage.container.append(bubble);
              }
            });

            resolve();
            this.messagesQueuePromise = null;
          }, reject);
        }, 0);
      });
    }
  }

  // * will change .cleaned in cleanup() and new instance will be created
  public getMiddleware() {
    const cleanupObj = this.cleanupObj;
    return () => {
      return !cleanupObj.cleaned;
    };
  }
  
  // reverse means top
  public renderMessage(message: any, reverse = false, multipleRender = false, bubble: HTMLDivElement = null, updatePosition = true) {
    this.log.debug('message to render:', message);
    //return;
    if(message.deleted) return;
    else if(message.grouped_id) { // will render only last album's message
      const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
      const maxID = Math.max(...Object.keys(storage).map(i => +i));
      if(message.mid < maxID) {
        return;
      }
    }
    
    const peerID = this.peerID;
    const our = message.fromID == rootScope.myID;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    //messageDiv.innerText = message.message;

    let bubbleContainer: HTMLDivElement;
    
    // bubble
    if(!bubble) {
      bubbleContainer = document.createElement('div');
      bubbleContainer.classList.add('bubble__container');
      
      bubble = document.createElement('div');
      bubble.classList.add('bubble');
      bubble.appendChild(bubbleContainer);

      if(!our) {
        //this.log('not our message', message, message.pFlags.unread);
        if(message.pFlags.unread) {
          this.unreadedObserver.observe(bubble); 
          if(!this.unreaded.indexOf(message.mid)) {
            this.unreaded.push(message.mid);
          }
        }
      }
    } else {
      const save = ['is-highlighted'];
      const wasClassNames = bubble.className.split(' ');
      const classNames = ['bubble'].concat(save.filter(c => wasClassNames.includes(c)));
      bubble.className = classNames.join(' ');

      bubbleContainer = bubble.lastElementChild as HTMLDivElement;
      bubbleContainer.innerHTML = '';
      //bubbleContainer.style.marginBottom = '';
      bubbleContainer.style.cssText = '';

      if(bubble == this.firstUnreadBubble) {
        bubble.classList.add('is-first-unread');
      }

      // * Нужно очистить прошлую информацию, полезно если удалить последний элемент из альбома в ПОСЛЕДНЕМ БАББЛЕ ГРУППЫ (видно по аватару)
      const originalMid = +bubble.dataset.mid;
      if(+message.mid != originalMid) {
        this.bubbleGroups.removeBubble(bubble, originalMid);

        if(!updatePosition) {
          this.bubbleGroups.addBubble(bubble, message, reverse);
        }
      }

      delete this.bubbles[originalMid];
      //bubble.innerHTML = '';
    }

    // ! reset due to album edit or delete item
    this.bubbles[+message.mid] = bubble;
    bubble.dataset.mid = message.mid;

    if(this.chat.selection.isSelecting) {
      this.chat.selection.toggleBubbleCheckbox(bubble, true);
    }

    if(message._ == 'messageService') {
      let action = message.action;
      let _ = action._;
      if(IGNORE_ACTIONS.includes(_) || (langPack.hasOwnProperty(_) && !langPack[_])) {
        return bubble;
      }

      bubble.className = 'bubble service';

      bubbleContainer.innerHTML = `<div class="service-msg">${message.rReply}</div>`;

      if(updatePosition) {
        this.renderMessagesQueue(message, bubble, reverse);
      }

      return bubble;
    }

    let messageMedia = message.media;

    let messageMessage: string, totalEntities: any[];
    if(message.grouped_id) {
      const t = this.appMessagesManager.getAlbumText(message.grouped_id);
      messageMessage = t.message;
      totalEntities = t.totalEntities;
    } else if(messageMedia?.document?.type != 'sticker') {
      messageMessage = message.message;
      totalEntities = message.totalEntities;
    }
    
    let richText = RichTextProcessor.wrapRichText(messageMessage, {
      entities: totalEntities
    });
    
    if(totalEntities && !messageMedia) {
      let emojiEntities = totalEntities.filter((e: any) => e._ == 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
      
      if(emojiStrLength == strLength && emojiEntities.length <= 3) {
        let sticker = this.appStickersManager.getAnimatedEmojiSticker(messageMessage);
        if(emojiEntities.length == 1 && !messageMedia && sticker) {
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
      } else {
        messageDiv.innerHTML = richText;
      }
      
      /* if(strLength == emojiStrLength) {
        messageDiv.classList.add('emoji-only');
        messageDiv.classList.add('message-empty');
      } */
    } else {
      messageDiv.innerHTML = richText;
    }
    
    const timeSpan = MessageRender.setTime(message, bubble, bubbleContainer, messageDiv);
    bubbleContainer.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad

    if(message.reply_markup && message.reply_markup._ == 'replyInlineMarkup' && message.reply_markup.rows && message.reply_markup.rows.length) {
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
              const from = this.appUsersManager.getUser(message.fromID);
              const unsafe = !(from && from.pFlags && from.pFlags.verified);
              const url = RichTextProcessor.wrapUrl(button.url, unsafe);
              buttonEl = document.createElement('a');
              buttonEl.href = url;
              buttonEl.rel = 'noopener noreferrer';
              buttonEl.target = '_blank';
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

      containerDiv.addEventListener(CLICK_EVENT_NAME, (e) => {
        cancelEvent(e);
        let target = e.target as HTMLElement;

        if(!target.classList.contains('reply-markup-button')) target = findUpClassName(target, 'reply-markup-button');
        if(!target) return;

        const column = whichChild(target);
        const row = rows[whichChild(target.parentElement)];

        if(!row.buttons || !row.buttons[column]) {
          this.log.warn('no such button', row, column, message);
          return;
        }

        const button = row.buttons[column];
        this.appInlineBotsManager.callbackButtonClick(message.mid, button);
      });

      const offset = rows.length * 45 + 'px';
      bubbleContainer.style.marginBottom = offset;
      containerDiv.style.bottom = '-' + offset;

      bubbleContainer.prepend(containerDiv);
    }
    
    if(our) {
      if(message.pFlags.unread || message.mid < 0) this.unreadOut.add(message.mid); // message.mid < 0 added 11.02.2020
      let status = '';
      if(message.mid < 0) status = 'is-sending';
      else status = message.pFlags.unread ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    }

    const isOut = our && (!message.fwd_from || this.peerID != rootScope.myID);
    
    // media
    if(messageMedia/*  && messageMedia._ == 'messageMediaPhoto' */) {
      let attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');
      
      if(!messageMessage) {
        bubble.classList.add('is-message-empty');
      }
      
      let processingWebPage = false;
      
      switch(messageMedia._) {
        case 'messageMediaPending': {
          let pending = messageMedia;
          let preloader = pending.preloader as ProgressivePreloader;
          
          switch(pending.type) {
            case 'album': {
              this.log('will wrap pending album');

              bubble.classList.add('hide-name', 'photo', 'is-album');
              wrapAlbum({
                groupID: '' + message.id, 
                attachmentDiv,
                uploading: true,
                isOut: true
              });

              break;
            }

            case 'photo': {
              //if(pending.size < 5e6) {
                const photo = this.appPhotosManager.getPhoto(message.id);
                //if(photo._ == 'photoEmpty') break;
                this.log('will wrap pending photo:', pending, message, photo);
                const tailSupported = !isAndroid;
                if(tailSupported) bubble.classList.add('with-media-tail');
                wrapPhoto(photo, message, attachmentDiv, undefined, undefined, tailSupported, true, this.lazyLoadQueue, null);

                bubble.classList.add('hide-name', 'photo');
              //}

              break;
            }

            case 'video': {
              //if(pending.size < 5e6) {
                let doc = this.appDocsManager.getDoc(message.id);
                //if(doc._ == 'documentEmpty') break;
                this.log('will wrap pending video:', pending, message, doc);
                const tailSupported = !isAndroid && !isApple && doc.type != 'round';
                if(tailSupported) bubble.classList.add('with-media-tail');
                wrapVideo({
                  doc, 
                  container: attachmentDiv, 
                  message, 
                  boxWidth: mediaSizes.active.regular.width,
                  boxHeight: mediaSizes.active.regular.height, 
                  withTail: tailSupported, 
                  isOut: isOut,
                  lazyLoadQueue: this.lazyLoadQueue,
                  middleware: null,
                  group: CHAT_ANIMATION_GROUP
                });

                preloader.attach(attachmentDiv, false);
                bubble.classList.add('hide-name', 'video');
              //}
              break;
            }
            
            case 'audio':
            case 'voice':
            case 'document': {
              const doc = this.appDocsManager.getDoc(message.id);
              //if(doc._ == 'documentEmpty') break;
              this.log('will wrap pending doc:', doc);
              const docDiv = wrapDocument(doc, false, true, message.id);

              if(doc.type == 'audio' || doc.type == 'voice') {
                (docDiv as AudioElement).preloader = preloader;
              } else {
                const icoDiv = docDiv.querySelector('.audio-download, .document-ico');
                preloader.attach(icoDiv, false);
              }

              if(pending.type == 'voice') {
                bubble.classList.add('bubble-audio');
              }
              
              bubble.classList.remove('is-message-empty');
              messageDiv.classList.add((pending.type || 'document') + '-message');
              messageDiv.append(docDiv);
              processingWebPage = true;
              break;
            }
            
          }
          
          break;
        }
        
        case 'messageMediaPhoto': {
          const photo = messageMedia.photo;
          ////////this.log('messageMediaPhoto', photo);
          
          bubble.classList.add('hide-name', 'photo');
          const tailSupported = !isAndroid;

          const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
          if(message.grouped_id && Object.keys(storage).length != 1) {
            bubble.classList.add('is-album');
            wrapAlbum({
              groupID: message.grouped_id, 
              attachmentDiv,
              middleware: this.getMiddleware(),
              isOut: our,
              lazyLoadQueue: this.lazyLoadQueue
            });

            break;
          }

          if(tailSupported) bubble.classList.add('with-media-tail');
          wrapPhoto(photo, message, attachmentDiv, undefined, undefined, tailSupported, isOut, this.lazyLoadQueue, this.getMiddleware());

          break;
        }
        
        case 'messageMediaWebPage': {
          processingWebPage = true;
          
          let webpage = messageMedia.webpage;
          ////////this.log('messageMediaWebPage', webpage);
          if(webpage._ == 'webPageEmpty') {
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
            
            if(doc.type == 'gif' || doc.type == 'video') {
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
                group: CHAT_ANIMATION_GROUP
              });
              //}
            } else {
              const docDiv = wrapDocument(doc, false, false, message.mid);
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
            if(size.w == size.h && quoteTextDiv.childElementCount) {
              bubble.classList.add('is-square-photo');
            } else if(size.h > size.w) {
              bubble.classList.add('is-vertical-photo');
            }

            wrapPhoto(webpage.photo, message, preview, mediaSizes.active.webpage.width, mediaSizes.active.webpage.height, false, isOut, this.lazyLoadQueue, this.getMiddleware());
          }
          
          box.append(quote);
          
          //bubble.prepend(box);
          bubbleContainer.prepend(timeSpan, box);
          
          //this.log('night running', bubble.scrollHeight);
          
          break;
        }
        
        case 'messageMediaDocument': {
          let doc = messageMedia.document;

          //this.log('messageMediaDocument', doc, bubble);
          
          if(doc.sticker/*  && doc.size <= 1e6 */) {
            bubble.classList.add('sticker');
            
            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }
            
            let size = bubble.classList.contains('emoji-big') ? 140 : 200;
            this.appPhotosManager.setAttachmentSize(doc, attachmentDiv, size, size, true);
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
              withThumb: true
            });

            break;
          } else if(doc.type == 'video' || doc.type == 'gif' || doc.type == 'round'/*  && doc.size <= 20e6 */) {
            //this.log('never get free 2', doc);
            
            bubble.classList.add('hide-name', doc.type == 'round' ? 'round' : 'video');
            const storage = this.appMessagesManager.groupedMessagesStorage[message.grouped_id];
            if(message.grouped_id && Object.keys(storage).length != 1) {
              bubble.classList.add('is-album');
  
              wrapAlbum({
                groupID: message.grouped_id, 
                attachmentDiv,
                middleware: this.getMiddleware(),
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue
              });
            } else {
              const tailSupported = !isAndroid && !isApple && doc.type != 'round';
              if(tailSupported) bubble.classList.add('with-media-tail');
              wrapVideo({
                doc, 
                container: attachmentDiv, 
                message, 
                boxWidth: mediaSizes.active.regular.width,
                boxHeight: mediaSizes.active.regular.height, 
                withTail: tailSupported, 
                isOut: isOut,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: this.getMiddleware(),
                group: CHAT_ANIMATION_GROUP
              });
            }
            
            break;
          } else {
            const docDiv = wrapDocument(doc, false, false, message.mid);
            
            bubble.classList.remove('is-message-empty');
            messageDiv.append(docDiv);
            messageDiv.classList.add((doc.type != 'photo' ? doc.type || 'document' : 'document') + '-message');
            processingWebPage = true;
            
            break;
          }

          break;
        }

        case 'messageMediaContact': {
          //this.log('wrapping contact', message);

          const contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerID = '' + messageMedia.user_id;

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
          avatarElem.setAttribute('peer', '' + message.media.user_id);
          avatarElem.classList.add('contact-avatar');

          contactDiv.prepend(avatarElem);

          bubble.classList.remove('is-message-empty');
          messageDiv.classList.add('contact-message');
          messageDiv.append(contactDiv);

          break;
        }

        case 'messageMediaPoll': {
          bubble.classList.remove('is-message-empty');
          
          const pollElement = wrapPoll(message.media.poll.id, message.mid);
          messageDiv.prepend(pollElement);
          messageDiv.classList.add('poll-message');

          break;
        }
        
        default:
        bubble.classList.remove('is-message-empty');
        messageDiv.innerHTML = 'unrecognized media type: ' + message.media._;
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
    
    if((this.peerID < 0 && !our) || message.fwd_from || message.reply_to_mid) { // chat
      let title = this.appPeersManager.getPeerTitle(message.fwdFromID || message.fromID);

      const isForwardFromChannel = message.from_id && message.from_id._ == 'peerChannel' && message.fromID == message.fwdFromID;
      
      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = RichTextProcessor.wrapEmojiText(message.fwd_from.from_name);
        //title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      }
      
      //this.log(title);
      
      if((message.fwdFromID || message.fwd_from)) {
        if(this.peerID != rootScope.myID && !isForwardFromChannel) {
          bubble.classList.add('forwarded');
        }
        
        if(message.savedFrom) {
          let goto = document.createElement('div');
          goto.classList.add('bubble-beside-button', 'goto-original', 'tgico-next');
          bubbleContainer.append(goto);
          bubble.dataset.savedFrom = message.savedFrom;
          bubble.classList.add('with-beside-button');
        }
        
        if(!bubble.classList.contains('sticker')) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.dataset.peerID = message.fwdFromID;

          if(this.peerID == rootScope.myID || isForwardFromChannel) {
            nameDiv.style.color = this.appPeersManager.getPeerColorByID(message.fwdFromID, false);
            nameDiv.innerHTML = title;
          } else {
            /* const fromTitle = message.fromID == this.myID || appPeersManager.isBroadcast(message.fwdFromID || message.fromID) ? '' : `<div class="name" data-peer-i-d="${message.fromID}" style="color: ${appPeersManager.getPeerColorByID(message.fromID, false)};">${appPeersManager.getPeerTitle(message.fromID)}</div>`;
            nameDiv.innerHTML = fromTitle + 'Forwarded from ' + title; */
            nameDiv.innerHTML = 'Forwarded from ' + title;
          }
          
          bubbleContainer.append(nameDiv);
        }
      } else {
        if(message.reply_to_mid) {
          let originalMessage = this.appMessagesManager.getMessage(message.reply_to_mid);
          let originalPeerTitle = this.appPeersManager.getPeerTitle(originalMessage.fromID || originalMessage.fwdFromID, true) || '';
          
          /////////this.log('message to render reply', originalMessage, originalPeerTitle, bubble, message);
          
          // need to download separately
          if(originalMessage._ == 'messageEmpty') {
            //////////this.log('message to render reply empty, need download', message, message.reply_to_mid);
            this.appMessagesManager.wrapSingleMessage(message.reply_to_mid);
            this.needUpdate.push({replyMid: message.reply_to_mid, mid: message.mid});
            
            originalPeerTitle = 'Loading...';
          }
          
          if(originalMessage.mid) {
            bubble.setAttribute('data-original-mid', originalMessage.mid);
          } else {
            bubble.setAttribute('data-original-mid', message.reply_to_mid);
          }
          
          bubbleContainer.append(wrapReply(originalPeerTitle, originalMessage.message || '', originalMessage));
          bubble.classList.add('is-reply');
        }
        
        if(!bubble.classList.contains('sticker') && (peerID < 0 && peerID != message.fromID)) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.innerHTML = title;
          nameDiv.style.color = this.appPeersManager.getPeerColorByID(message.fromID, false);
          nameDiv.dataset.peerID = message.fromID;
          bubbleContainer.append(nameDiv);
        } else /* if(!message.reply_to_mid) */ {
          bubble.classList.add('hide-name');
        }
      }
      
      if((!our && this.peerID < 0 && (!this.appPeersManager.isChannel(this.peerID) || this.appPeersManager.isMegagroup(this.peerID))) 
        || (this.peerID == rootScope.myID && !message.reply_to_mid)) {
        let avatarElem = new AvatarElement();
        avatarElem.classList.add('user-avatar');

        if(!message.fwdFromID && message.fwd_from && message.fwd_from.from_name) {
          avatarElem.setAttribute('peer-title', /* '🔥 FF 🔥' */message.fwd_from.from_name);
        }

        avatarElem.setAttribute('peer', '' + (((message.fwd_from && this.peerID == rootScope.myID) || isForwardFromChannel ? message.fwdFromID : message.fromID) || 0));
        avatarElem.update();
        
        //this.log('exec loadDialogPhoto', message);

        bubbleContainer.append(avatarElem);
      }
    } else {
      bubble.classList.add('hide-name');
    }
    
    bubble.classList.add(isOut ? 'is-out' : 'is-in');
    if(updatePosition) {
      this.bubbleGroups.addBubble(bubble, message, reverse);

      this.renderMessagesQueue(message, bubble, reverse);
    } else {
      this.bubbleGroups.updateGroupByMessageID(message.mid);
    }

    return bubble;
  }

  public performHistoryResult(history: number[], reverse: boolean, isBackLimit: boolean, additionMsgID?: number) {
    // commented bot getProfile in getHistory!
    if(!history/* .filter((id: number) => id > 0) */.length) {
      if(!isBackLimit) {
        this.scrolledAll = true;
      } else {
        this.scrolledAllDown = true;
      }
    }

    history = history.slice(); // need

    if(additionMsgID) {
      history.unshift(additionMsgID);
    }

    /* if(testScroll && additionMsgID) {
      for(let i = 0; i < 3; ++i) {
        let _history = history.slice();
        setTimeout(() => {
          this.performHistoryResult(_history, reverse, isBackLimit, 0, resetPromises);
        }, 0);
      }
    } */

    let dialog = this.appMessagesManager.getDialogByPeerID(this.peerID)[0];
    if(dialog && dialog.top_message) {
      for(let mid of history) {
        if(mid == dialog.top_message) {
          this.scrolledAllDown = true;
          break;
        }
      }
    }

    //console.time('appImManager render history');

    return new Promise<boolean>((resolve, reject) => {
      //await new Promise((resolve) => setTimeout(resolve, 1e3));

      //this.log('performHistoryResult: will render some messages:', history.length);

      const method = (reverse ? history.shift : history.pop).bind(history);

      //const padding = 99999;
      const realLength = this.scrollable.container.childElementCount;
      let previousScrollHeightMinusTop: number/* , previousScrollHeight: number */;
      if(realLength > 0 && (reverse || isSafari)) { // for safari need set when scrolling bottom too
        this.messagesQueueOnRender = () => {
          const {scrollTop, scrollHeight} = this.scrollable;

          //previousScrollHeight = scrollHeight + padding;
          previousScrollHeightMinusTop = reverse ? scrollHeight - scrollTop : scrollTop;

          //this.chatInner.style.paddingTop = padding + 'px';
          /* if(reverse) {
            previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
          } else {
            previousScrollHeightMinusTop = scrollTop;
          } */

          //this.log('performHistoryResult: messagesQueueOnRender, scrollTop:', scrollTop, scrollHeight, previousScrollHeightMinusTop);
          this.messagesQueueOnRender = undefined;
        };
      }

      while(history.length) {
        let message = this.appMessagesManager.getMessage(method());
        this.renderMessage(message, reverse, true);
      }

      (this.messagesQueuePromise || Promise.resolve())
      //.then(() => new Promise(resolve => setTimeout(resolve, 100)))
      .then(() => {
        if(previousScrollHeightMinusTop !== undefined) {
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

          // touchSupport for safari iOS
          isTouchSupported && isApple && (this.scrollable.container.style.overflow = 'hidden');
          this.scrollable.scrollTop = newScrollTop;
          //this.scrollable.scrollTop = this.scrollable.scrollHeight;
          isTouchSupported && isApple && (this.scrollable.container.style.overflow = '');

          //this.log('performHistoryResult: have set up scrollTop:', newScrollTop, this.scrollable.scrollTop);
        }

        resolve(true);
      }, reject);
    }).then(() => {
      //console.timeEnd('appImManager render history');

      return true;
    });
  }

  onDatePick = (timestamp: number) => {
    const peerID = this.peerID;
    this.appMessagesManager.requestHistory(peerID, 0, 2, -1, timestamp).then(history => {
      if(!history?.messages?.length) {
        this.log.error('no history!');
        return;
      } else if(this.peerID != peerID) {
        return;
      }

      this.chat.setPeer(this.peerID, history.messages[0].mid);
      //console.log('got history date:', history);
    });
  };

  /**
   * Load and render history
   * @param maxID max message id
   * @param reverse 'true' means up
   * @param isBackLimit is search
   * @param additionMsgID for the last message
   * @param justLoad do not render
   */
  public getHistory(maxID = 0, reverse = false, isBackLimit = false, additionMsgID = 0, justLoad = false): {cached: boolean, promise: Promise<boolean>} {
    const peerID = this.peerID;

    //console.time('appImManager call getHistory');
    const pageCount = this.appPhotosManager.windowH / 38/*  * 1.25 */ | 0;
    //const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = Object.keys(this.bubbles).length > 0 || additionMsgID ? Math.max(40, pageCount) : pageCount;//const realLoadCount = 50;
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
        maxID += 1;
      }
    }

    let additionMsgIDs: number[];
    if(additionMsgID) {
      const historyStorage = this.appMessagesManager.historiesStorage[peerID];
      if(historyStorage && historyStorage.history.length < loadCount) {
        additionMsgIDs = historyStorage.history.slice();

        // * filter last album, because we don't know is this the last item
        for(let i = additionMsgIDs.length - 1; i >= 0; --i) {
          const message = this.appMessagesManager.getMessage(additionMsgIDs[i]);
          if(message.grouped_id) additionMsgIDs.splice(i, 1);
          else break;
        }

        maxID = additionMsgIDs[additionMsgIDs.length - 1] || maxID;
      }
    }

    /* const result = additionMsgID ? 
      {history: [additionMsgID]} : 
      appMessagesManager.getHistory(this.peerID, maxID, loadCount, backLimit); */
    let result: ReturnType<AppMessagesManager['getHistory']> | {history: number[]} = this.appMessagesManager.getHistory(this.peerID, maxID, loadCount, backLimit);
    let resultPromise: Promise<any>;

    //const isFirstMessageRender = !!additionMsgID && result instanceof Promise && !appMessagesManager.getMessage(additionMsgID).grouped_id;
    const isFirstMessageRender = additionMsgIDs?.length;
    if(isFirstMessageRender) {
      resultPromise = result as Promise<any>;
      result = {history: additionMsgIDs};
      //additionMsgID = 0;
    }

    const processPromise = (result: Promise<HistoryResult>) => {
      const promise = result.then((result) => {
        this.log('getHistory not cached result by maxID:', maxID, reverse, isBackLimit, result, peerID, justLoad);

        if(justLoad) {
          this.scrollable.onScroll(); // нужно делать из-за ранней прогрузки
          return true;
        }
        //console.timeEnd('appImManager call getHistory');
        
        if(this.peerID != peerID || (this.getHistoryTopPromise != promise && this.getHistoryBottomPromise != promise)) {
          this.log.warn('peer changed');
          ////console.timeEnd('render history total');
          return Promise.reject();
        }
        
        ////console.timeEnd('render history total');
        
        return this.performHistoryResult(result.history || [], reverse, isBackLimit, !isFirstMessageRender && additionMsgID);
      }, (err) => {
        this.log.error('getHistory error:', err);
        return false;
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
      this.log('getHistory cached result by maxID:', maxID, reverse, isBackLimit, result, peerID, justLoad);
      promise = this.performHistoryResult(result.history || [], reverse, isBackLimit, !isFirstMessageRender && additionMsgID);
      //return (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);
      //return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
    }

    const waitPromise = isFirstMessageRender ? processPromise(resultPromise) : promise;

    if(isFirstMessageRender) {
      waitPromise.then(() => {
        const mids = getObjectKeysAndSort(this.bubbles, 'desc').filter(mid => !additionMsgIDs.includes(mid));
        mids.forEach((mid, idx) => {
          const bubble = this.bubbles[mid];
  
          //if(idx || isSafari) {
            // ! 0.1 = 1ms задержка для Safari, без этого первое сообщение над самым нижним может появиться позже другого с animation-delay, LOL !
            bubble.style.animationDelay = ((idx || 0.1) * 10) + 'ms';
          //}

          bubble.classList.add('zoom-fade');
          bubble.addEventListener('animationend', () => {
            bubble.style.animationDelay = '';
            bubble.classList.remove('zoom-fade');
          }, {once: true});
          //this.log('supa', bubble);
        });

        setTimeout(() => {
          this.loadMoreHistory(true, true);
        }, 0);
      });
    }

    (reverse ? this.getHistoryTopPromise = waitPromise : this.getHistoryBottomPromise = waitPromise);
    waitPromise.finally(() => {
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
      this.log('getHistory: slice loadedTimes:', reverse, pageCount, this.loadedTopTimes, this.loadedBottomTimes, ids?.length, safeCount);
      if(ids && ids.length > safeCount) {
        if(reverse) {
          //ids = ids.slice(-removeCount);
          //ids = ids.slice(removeCount * 2);
          ids = ids.slice(safeCount);
          this.scrolledAllDown = false;

          this.log('getHistory: slice bottom messages:', ids.length, loadCount);
          //this.getHistoryBottomPromise = undefined; // !WARNING, это нужно для обратной загрузки истории, если запрос словил флуд
        } else {
          //ids = ids.slice(0, removeCount);
          //ids = ids.slice(0, ids.length - (removeCount * 2));
          ids = ids.slice(0, ids.length - safeCount);
          this.scrolledAll = false;

          this.log('getHistory: slice up messages:', ids.length, loadCount);
          //this.getHistoryTopPromise = undefined; // !WARNING, это нужно для обратной загрузки истории, если запрос словил флуд
        }

        this.log('getHistory: will slice ids:', ids, reverse);

        this.deleteMessagesByIDs(ids);
      }

      this.setUnreadDelimiter(); // не нашёл места лучше

      // preload more
      //if(!isFirstMessageRender) {
        setTimeout(() => {
          this.loadMoreHistory(true, true);
          this.loadMoreHistory(false, true);
        }, 0);
      //}
    });

    return {cached, promise};
  }

  public setUnreadDelimiter() {
    if(this.attachedUnreadBubble) {
      return;
    }

    let dialog = this.appMessagesManager.getDialogByPeerID(this.peerID)[0];
    if(!dialog?.unread_count) return;

    let maxID = dialog.read_inbox_max_id;
    maxID = Object.keys(this.bubbles).filter(mid => !this.bubbles[mid].classList.contains('is-out')).map(i => +i).sort((a, b) => a - b).find(i => i > maxID);

    if(maxID && this.bubbles[maxID]) {
      let bubble = this.bubbles[maxID];
      if(this.firstUnreadBubble && this.firstUnreadBubble != bubble) {
        this.firstUnreadBubble.classList.remove('is-first-unread');
        this.firstUnreadBubble = null;
      }

      if(maxID != dialog.top_message) {
        bubble.classList.add('is-first-unread');
      }

      this.firstUnreadBubble = bubble;
      this.attachedUnreadBubble = true;
    }
  }

  public deleteEmptyDateGroups() {
    for(let i in this.dateMessages) {
      let dateMessage = this.dateMessages[i];

      if(dateMessage.container.childElementCount == 2) { // only date div + sentinel div
        dateMessage.container.remove();
        this.stickyIntersector.unobserve(dateMessage.container, dateMessage.div);
        delete this.dateMessages[i];
      }
    }
  }
}