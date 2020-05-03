//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { $rootScope, isElementInViewport, numberWithCommas, findUpClassName, formatNumber, placeCaretAtEnd, findUpTag, langPack } from "../utils";
import appUsersManager from "./appUsersManager";
import appMessagesManager from "./appMessagesManager";
import appPeersManager from "./appPeersManager";
import appProfileManager from "./appProfileManager";
import appDialogsManager from "./appDialogsManager";
import { RichTextProcessor } from "../richtextprocessor";
import appPhotosManager from "./appPhotosManager";
import appSidebarRight from './appSidebarRight';

import { logger } from "../polyfill";
import lottieLoader from "../lottieLoader";
import appMediaViewer from "./appMediaViewer";
import appSidebarLeft from "./appSidebarLeft";
import appChatsManager from "./appChatsManager";
import appMessagesIDsManager from "./appMessagesIDsManager";
import apiUpdatesManager from './apiUpdatesManager';
import { wrapDocument, wrapPhoto, wrapVideo, wrapSticker, wrapReply, wrapAlbum } from '../../components/wrappers';
import ProgressivePreloader from '../../components/preloader';
import { openBtnMenu, formatPhoneNumber } from '../../components/misc';
import { ChatInput } from '../../components/chatInput';
//import Scrollable from '../../components/scrollable';
import Scrollable from '../../components/scrollable_new';
import BubbleGroups from '../../components/bubbleGroups';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import appDocsManager from './appDocsManager';

console.log('appImManager included!');

appSidebarLeft; // just to include

let testScroll = false;

export class AppImManager {
  public pageEl = document.querySelector('.page-chats') as HTMLDivElement;
  public btnMute = this.pageEl.querySelector('.tool-mute') as HTMLButtonElement;
  public btnMenuMute = this.pageEl.querySelector('.menu-mute') as HTMLButtonElement;
  public avatarEl = document.getElementById('im-avatar') as HTMLDivElement;
  public titleEl = document.getElementById('im-title') as HTMLDivElement;
  public subtitleEl = document.getElementById('im-subtitle') as HTMLDivElement;
  public bubblesContainer = document.getElementById('bubbles') as HTMLDivElement;
  public chatInner = document.getElementById('bubbles-inner') as HTMLDivElement;
  public searchBtn = this.pageEl.querySelector('.chat-search-button') as HTMLButtonElement;
  public goDownBtn = this.pageEl.querySelector('#bubbles-go-down') as HTMLButtonElement;
  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;
  
  public chatInputC: ChatInput = null;
  
  public myID = 0;
  public peerID = 0;
  public muted = false;
  
  public bubbles: {[mid: number]: HTMLDivElement} = {};
  public dateMessages: {[timestamp: number]: { 
    div: HTMLDivElement, 
    firstTimestamp: number, 
    container: HTMLDivElement,
    timeout?: number 
  }} = {};
  public unreadOut = new Set<number>();
  public needUpdate: {replyMid: number, mid: number}[] = []; // if need wrapSingleMessage
  
  public offline = false;
  public updateStatusInterval = 0;
  
  public pinnedMsgID = 0;
  private pinnedMessageContainer = this.pageEl.querySelector('.pinned-message') as HTMLDivElement;
  private pinnedMessageContent = this.pinnedMessageContainer.querySelector('.pinned-message-subtitle') as HTMLDivElement;
  
  private firstTopMsgID = 0;
  
  public lazyLoadQueue = new LazyLoadQueue();
  
  public scroll: HTMLDivElement = null;
  public scrollable: Scrollable = null;

  public log: ReturnType<typeof logger>;
  
  private preloader: ProgressivePreloader = null;
  
  private typingTimeouts: {[peerID: number]: number} = {};
  private typingUsers: {[userID: number]: number} = {} // to peerID
  
  private topbar = document.getElementById('topbar') as HTMLDivElement;
  private chatInput = document.getElementById('chat-input') as HTMLDivElement;
  private scrolledAll: boolean;
  private scrolledAllDown: boolean;
  
  public contextMenu = document.getElementById('bubble-contextmenu') as HTMLDivElement;
  private contextMenuPin = this.contextMenu.querySelector('.menu-pin') as HTMLDivElement;
  private contextMenuEdit = this.contextMenu.querySelector('.menu-edit') as HTMLDivElement;
  private contextMenuMsgID: number;
  
  private popupDeleteMessage: {
    popupEl?: HTMLDivElement,
    deleteBothBtn?: HTMLButtonElement,
    deleteMeBtn?: HTMLButtonElement,
    cancelBtn?: HTMLButtonElement
  } = {};
  
  private setPeerPromise: Promise<boolean> = null;
  
  public bubbleGroups = new BubbleGroups();

  private scrolledDown = true;
  private onScrollRAF = 0;
  private isScrollingTimeout = 0;

  private datesIntersectionObserver: IntersectionObserver = null;
  private lastDateMessageDiv: HTMLDivElement = null;

  private unreadedObserver: IntersectionObserver = null;

  private loadedTopTimes = 0;
  private loadedBottomTimes = 0;
  
  constructor() {
    /* if(!lottieLoader.loaded) {
      lottieLoader.loadLottie();
    } */
    
    this.log = logger('IM');
    
    this.chatInputC = new ChatInput();
    
    this.preloader = new ProgressivePreloader(null, false);
    
    this.popupDeleteMessage.popupEl = this.pageEl.querySelector('.popup-delete-message') as HTMLDivElement;
    this.popupDeleteMessage.deleteBothBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-delete-both') as HTMLButtonElement;
    this.popupDeleteMessage.deleteMeBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-delete-me') as HTMLButtonElement;
    this.popupDeleteMessage.cancelBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-close') as HTMLButtonElement;
    
    apiManager.getUserID().then((id) => {
      this.myID = $rootScope.myID = id;
    });

    $rootScope.$on('user_auth', (e: CustomEvent) => {
      let userAuth = e.detail;
      this.myID = $rootScope.myID = userAuth ? userAuth.id : 0;
    });
    
    // will call when message is sent (only 1)
    $rootScope.$on('history_append', (e: CustomEvent) => {
      let details = e.detail;
      
      this.renderNewMessagesByIDs([details.messageID]);
    });
    
    // will call when sent for update pos
    $rootScope.$on('history_update', (e: CustomEvent) => {
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
    
    $rootScope.$on('history_multiappend', (e: CustomEvent) => {
      let msgIDsByPeer = e.detail;
      if(!(this.peerID in msgIDsByPeer)) return;
      
      let msgIDs = msgIDsByPeer[this.peerID];
      
      this.renderNewMessagesByIDs(msgIDs);
    });
    
    $rootScope.$on('history_delete', (e: CustomEvent) => {
      let detail: {
        peerID: string,
        msgs: {[x: number]: boolean}
      } = e.detail;
      
      this.deleteMessagesByIDs(Object.keys(detail.msgs).map(s => +s));
    });
    
    // Calls when message successfully sent and we have an ID
    $rootScope.$on('message_sent', (e: CustomEvent) => {
      let {tempID, mid} = e.detail;
      
      this.log('message_sent', e.detail);

      // set cached url to media
      let message = appMessagesManager.getMessage(mid);
      if(message.media) {
        if(message.media.photo) {
          let photo = appPhotosManager.getPhoto(tempID);
          if(photo) {
            let newPhoto = message.media.photo;
            newPhoto.downloaded = photo.downloaded;
            newPhoto.url = photo.url;
          }
        } else if(message.media.document) {
          let doc = appDocsManager.getDoc(tempID);
          if(doc && doc.type && doc.type != 'sticker') {
            let newDoc = message.media.document;
            newDoc.downloaded = doc.downloaded;
            newDoc.url = doc.url;
          }
        }
      }
      
      let bubble = this.bubbles[tempID];
      if(bubble) {
        this.bubbles[mid] = bubble;
        
        /////this.log('message_sent', bubble);

        // set new mids to album items for mediaViewer
        if(message.grouped_id) {
          let items = bubble.querySelectorAll('.album-item');
          let groupIDs = Object.keys(appMessagesManager.groupedMessagesStorage[message.grouped_id]).map(i => +i).sort((a, b) => a - b);
          (Array.from(items) as HTMLElement[]).forEach((item, idx) => {
            item.dataset.mid = '' + groupIDs[idx];
          });
        }

        bubble.classList.remove('is-sending');
        bubble.classList.add('is-sent');
        bubble.dataset.mid = mid;

        this.bubbleGroups.removeBubble(bubble, tempID);
        
        delete this.bubbles[tempID];
      } else {
        this.log.warn('message_sent there is no bubble', e.detail);
      }

      if(this.unreadOut.has(tempID)) {
        this.unreadOut.delete(tempID);
        this.unreadOut.add(mid);
      }
    });
    
    $rootScope.$on('message_edit', (e: CustomEvent) => {
      let {peerID, mid, id, justMedia} = e.detail;
      
      if(peerID != this.peerID) return;
      let message = appMessagesManager.getMessage(mid);
      
      let bubble = this.bubbles[mid];
      if(!bubble && message.grouped_id) {
        let a = this.getAlbumBubble(message.grouped_id);
        bubble = a.bubble;
        message = a.message;
      }
      if(!bubble) return;
      
      this.renderMessage(message, true, false, bubble, false);
    });
    
    $rootScope.$on('messages_downloaded', (e: CustomEvent) => {
      let mids: number[] = e.detail;
      
      mids.forEach(mid => {
        if(this.pinnedMsgID == mid) {
          let message = appMessagesManager.getMessage(mid);
          /////this.log('setting pinned message', message);
          this.pinnedMessageContainer.dataset.mid = '' + mid;
          this.pinnedMessageContainer.style.display = '';
          this.pinnedMessageContent.innerHTML = RichTextProcessor.wrapEmojiText(message.message);
        }
        
        this.needUpdate.forEachReverse((obj, idx) => {
          if(obj.replyMid == mid) {
            let {mid, replyMid} = this.needUpdate.splice(idx, 1)[0];
            
            //this.log('messages_downloaded', mid, replyMid, i, this.needUpdate, this.needUpdate.length, mids, this.bubbles[mid]);
            let bubble = this.bubbles[mid];
            if(!bubble) return;
            
            let message = appMessagesManager.getMessage(mid);
            
            let repliedMessage = appMessagesManager.getMessage(replyMid);
            if(repliedMessage.deleted) { // чтобы не пыталось бесконечно загрузить удалённое сообщение
              delete message.reply_to_mid; // WARNING!
            }
            
            this.renderMessage(message, true, false, bubble, false);
            //this.renderMessage(message, true, true, bubble, false);
          }
        });
      });
    });
    
    $rootScope.$on('apiUpdate', (e: CustomEvent) => {
      let update = e.detail;
      
      this.handleUpdate(update);
    });
    
    window.addEventListener('blur', () => {
      lottieLoader.checkAnimations(true);
      
      this.offline = true;
      this.updateStatus();
      clearInterval(this.updateStatusInterval);
      
      window.addEventListener('focus', () => {
        lottieLoader.checkAnimations(false);
        
        this.offline = false;
        this.updateStatus();
        this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
      }, {once: true});
    });
    
    (this.pageEl.querySelector('.person') as HTMLDivElement).addEventListener('click', (e) => {
      appSidebarRight.toggleSidebar(true);
    });
    
    this.chatInner.addEventListener('click', (e) => {
      let target = e.target as HTMLElement;
      let bubble: HTMLDivElement = null;
      try {
        bubble = findUpClassName(e.target, 'bubble');
      } catch(err) {}
      
      if(!bubble) return;

      if((target.tagName == 'IMG' && !target.classList.contains('emoji') && !target.parentElement.classList.contains('user-avatar')) 
        || target.tagName == 'image' 
        || target.classList.contains('album-item')
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
          let bubble = this.bubbles[id];

          let elements = this.bubbles[id].querySelectorAll('.attachment img, .preview img, video, .bubble__media-container') as NodeListOf<HTMLElement>;
          Array.from(elements).forEach((element: HTMLElement) => {
            let albumItem = findUpClassName(element, 'album-item');
            targets.push({
              element,
              mid: +albumItem?.dataset.mid || id
            });
          });
        });

        let idx = targets.findIndex(t => t.mid == messageID);

        this.log('open mediaViewer single with ids:', ids, idx, targets);

        appMediaViewer.openMedia(message, targets[idx].element, true, 
          this.scroll.parentElement, targets.slice(0, idx), targets.slice(idx + 1)/* , !message.grouped_id */);
        
        //appMediaViewer.openMedia(message, target as HTMLImageElement);
      }
      
      if(['IMG', 'DIV'].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');
      
      if(target.tagName == 'DIV') {
        if(target.classList.contains('forward')) {
          let savedFrom = bubble.dataset.savedFrom;
          let splitted = savedFrom.split('_');
          let peerID = +splitted[0];
          let msgID = +splitted[1];
          ////this.log('savedFrom', peerID, msgID);
          this.setPeer(peerID, msgID, true);
          return;
        } else if(target.classList.contains('user-avatar') || target.classList.contains('name')) {
          let peerID = +target.dataset.peerID;
          
          if(!isNaN(peerID)) {
            this.setPeer(peerID);
          }
          
          return;
        }
        
        let isReplyClick = false;
        
        try {
          isReplyClick = !!findUpClassName(e.target, 'reply');
        } catch(err) {}
        
        if(isReplyClick && bubble.classList.contains('is-reply')/*  || bubble.classList.contains('forwarded') */) {
          let originalMessageID = +bubble.getAttribute('data-original-mid');
          this.setPeer(this.peerID, originalMessageID);
        }
      } else if(target.tagName == 'IMG' && target.parentElement.classList.contains('user-avatar')) {
        let peerID = +target.parentElement.dataset.peerID;
        
        if(!isNaN(peerID)) {
          this.setPeer(peerID);
        }
      }
      
      //console.log('chatInner click', e);
    });
    
    this.searchBtn.addEventListener('click', (e) => {
      if(this.peerID) {
        appSidebarRight.beginSearch();
        //appSidebarLeft.archivedCount;
        //appSidebarLeft.beginSearch(this.peerID);
      }
    });
    
    this.pinnedMessageContainer.addEventListener('click', (e) => {
      e.preventDefault();
      e.cancelBubble = true;
      
      let mid = +this.pinnedMessageContainer.getAttribute('data-mid');
      this.setPeer(this.peerID, mid);
    });
    
    this.btnMenuMute.addEventListener('click', () => this.mutePeer());
    this.btnMute.addEventListener('click', () => this.mutePeer());
    
    let onKeyDown = (e: KeyboardEvent) => {
      let target = e.target as HTMLElement;
      
      //if(target.tagName == 'INPUT') return;
      
      //this.log('onkeydown', e);
      
      if(this.chatInputC.attachMediaPopUp.container.classList.contains('active')) {
        if(target.tagName != 'INPUT') {
          this.chatInputC.attachMediaPopUp.captionInput.focus();
        }
        
        if(e.key == 'Enter') {
          this.chatInputC.attachMediaPopUp.sendBtn.click();
        } else if(e.key == 'Escape') {
          this.chatInputC.attachMediaPopUp.container.classList.remove('active');
        }
        
        return;
      }
      
      if(e.key == 'Meta' || e.key == 'Control') {
        return;
      } else if(e.key == 'c' && (e.ctrlKey || e.metaKey) && target.tagName != 'INPUT') {
        return;
      }
      
      if(e.target != this.chatInputC.messageInput && target.tagName != 'INPUT') {
        this.chatInputC.messageInput.focus();
        placeCaretAtEnd(this.chatInputC.messageInput);
      }
    };
    
    document.body.addEventListener('keydown', onKeyDown);
    
    this.chatInner.addEventListener('contextmenu', e => {
      let bubble: HTMLDivElement = null;
      
      try {
        bubble = findUpClassName(e.target, 'bubble__container');
      } catch(e) {}
      
      if(bubble) {
        bubble = bubble.parentElement as HTMLDivElement; // bc container

        e.preventDefault();
        e.cancelBubble = true;
        
        let msgID = 0;
        for(let id in this.bubbles) {
          if(this.bubbles[id] === bubble) {
            msgID = +id;
            break;
          }
        }
        
        if(!msgID) return;
        
        if(this.myID == this.peerID || (this.peerID < 0 && !appPeersManager.isChannel(this.peerID) && !appPeersManager.isMegagroup(this.peerID))) {
          this.contextMenuPin.style.display = '';
        } else this.contextMenuPin.style.display = 'none';
        
        this.contextMenuMsgID = msgID;
        
        let side = bubble.classList.contains('is-in') ? 'left' : 'right';
        
        this.contextMenuEdit.style.display = side == 'right' ? '' : 'none';
        
        this.contextMenu.classList.remove('bottom-left', 'bottom-right');
        this.contextMenu.classList.add(side == 'left' ? 'bottom-right' : 'bottom-left');
        
        let {clientX, clientY} = e;
        
        this.contextMenu.style.left = (side == 'right' ? clientX - this.contextMenu.scrollWidth : clientX) + 'px';
        if((clientY + this.contextMenu.scrollHeight) > window.innerHeight) {
          this.contextMenu.style.top = (window.innerHeight - this.contextMenu.scrollHeight) + 'px';
        } else {
          this.contextMenu.style.top = clientY + 'px';
        }
        
        //this.contextMenu.classList.add('active');
        openBtnMenu(this.contextMenu);
        
        /////this.log('contextmenu', e, bubble, msgID, side);
      }
    });
    
    this.contextMenu.querySelector('.menu-copy').addEventListener('click', () => {
      let message = appMessagesManager.getMessage(this.contextMenuMsgID);
      
      let str = message ? message.message : '';
      
      var textArea = document.createElement("textarea");
      textArea.value = str;
      textArea.style.position = "fixed";  //avoid scrolling to bottom
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Oops, unable to copy', err);
      }
      
      document.body.removeChild(textArea);
    });
    
    this.contextMenu.querySelector('.menu-delete').addEventListener('click', () => {
      if(this.peerID == this.myID) {
        this.popupDeleteMessage.deleteBothBtn.style.display = 'none';
        this.popupDeleteMessage.deleteMeBtn.innerText = 'DELETE';
      } else {
        this.popupDeleteMessage.deleteBothBtn.style.display = '';
        this.popupDeleteMessage.deleteMeBtn.innerText = 'DELETE JUST FOR ME';
        
        if(this.peerID > 0) {
          let title = appPeersManager.getPeerTitle(this.peerID);
          this.popupDeleteMessage.deleteBothBtn.innerHTML = 'DELETE FOR ME AND ' + title;
        } else {
          this.popupDeleteMessage.deleteBothBtn.innerText = 'DELETE FOR ALL';
        }
      }
      
      this.popupDeleteMessage.popupEl.classList.add('active');
    });
    
    this.contextMenu.querySelector('.menu-reply').addEventListener('click', () => {
      let message = appMessagesManager.getMessage(this.contextMenuMsgID);
      this.chatInputC.setTopInfo(appPeersManager.getPeerTitle(message.fromID, true), message.message, undefined, message.media);
      this.chatInputC.replyToMsgID = this.contextMenuMsgID;
      this.chatInputC.editMsgID = 0;
    });
    
    this.contextMenuEdit.addEventListener('click', () => {
      let message = appMessagesManager.getMessage(this.contextMenuMsgID);
      this.chatInputC.setTopInfo('Editing', message.message, message.message, message.media);
      this.chatInputC.replyToMsgID = 0;
      this.chatInputC.editMsgID = this.contextMenuMsgID;
    });
    
    this.contextMenuPin.addEventListener('click', () => {
      apiManager.invokeApi('messages.updatePinnedMessage', {
        flags: 0,
        peer: appPeersManager.getInputPeerByID(this.peerID),
        id: this.contextMenuMsgID
      }).then(updates => {
        /////this.log('pinned updates:', updates);
        apiUpdatesManager.processUpdateMessage(updates);
      });
    });
    
    this.popupDeleteMessage.deleteBothBtn.addEventListener('click', () => {
      this.deleteMessages(true);
      this.popupDeleteMessage.cancelBtn.click();
    });
    
    this.popupDeleteMessage.deleteMeBtn.addEventListener('click', () => {
      this.deleteMessages(false);
      this.popupDeleteMessage.cancelBtn.click();
    });
    
    this.goDownBtn.addEventListener('click', () => {
      let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
      
      if(dialog) {
        this.setPeer(this.peerID, dialog.top_message);
      } else {
        this.log('will scroll down 3');
        this.scroll.scrollTop = this.scroll.scrollHeight;
      }
    });
    
    this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
    this.updateStatus();
    setInterval(() => this.setPeerStatus(), 60e3);
    
    this.setScroll();
    apiUpdatesManager.attach();

    this.datesIntersectionObserver = new IntersectionObserver((entries) => {
      //this.log('intersection', entries);

      let entry = entries.filter(entry => entry.boundingClientRect.top < 0).sort((a, b) => b.boundingClientRect.top - a.boundingClientRect.top)[0];
      if(!entry) return;
      let container = entry.isIntersecting ? entry.target : entry.target.nextElementSibling;
      for(let timestamp in this.dateMessages) {
        let dateMessage = this.dateMessages[timestamp];
        if(dateMessage.container == container) {
          if(this.lastDateMessageDiv) {
            this.lastDateMessageDiv.classList.remove('is-sticky');
          }

          dateMessage.div.classList.add('is-sticky');
          this.lastDateMessageDiv = dateMessage.div;
          break;
        }
      }
    }/* , {root: this.chatInner} */);

    this.unreadedObserver = new IntersectionObserver((entries) => {
      let readed: number[] = [];
    
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          let target = entry.target as HTMLElement;
          let mid = +target.dataset.mid;
          readed.push(mid);
          this.unreadedObserver.unobserve(target);
        }
      });

      if(readed.length) {
        let max = Math.max(...readed);
        let min = Math.min(...readed);
        
        if(this.peerID < 0) {
          max = appMessagesIDsManager.getMessageIDInfo(max)[0];
          min = appMessagesIDsManager.getMessageIDInfo(min)[0];
        }
        
        //appMessagesManager.readMessages(readed);
        appMessagesManager.readHistory(this.peerID, max, min).catch((err: any) => {
          this.log.error('readHistory err:', err);
          appMessagesManager.readHistory(this.peerID, max, min);
        });
      }
    });
  }
  
  public deleteMessages(revoke = false) {
    let flags = revoke ? 1 : 0;
    let ids = [this.contextMenuMsgID];
    
    apiManager.invokeApi('messages.deleteMessages', {
      flags: flags,
      revoke: revoke,
      id: ids
    }).then((affectedMessages: any) => {
      /////this.log('deleted messages:', affectedMessages);
      
      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updatePts',
          pts: affectedMessages.pts,
          pts_count: affectedMessages.pts_count
        }
      });
      
      apiUpdatesManager.processUpdateMessage({
        _: 'updateShort',
        update: {
          _: 'updateDeleteMessages',
          messages: ids
        }
      });
    });
  }
  
  public updateStatus() {
    if(!this.myID) return Promise.resolve();
    
    appUsersManager.setUserStatus(this.myID, this.offline);
    return apiManager.invokeApi('account.updateStatus', {offline: this.offline});
  }

  public getAlbumBubble(groupID: string) {
    let group = appMessagesManager.groupedMessagesStorage[groupID];
    for(let i in group) {
      let mid = +i;
      if(this.bubbles[mid]) return {
        bubble: this.bubbles[mid], 
        message: appMessagesManager.getMessage(mid)
      };
    }

    return null;
  }

  public loadMoreHistory(top: boolean) {
    this.log('loadMoreHistory', top);
    if(!this.peerID || testScroll || this.setPeerPromise || (top && this.getHistoryTopPromise) || (!top && this.getHistoryBottomPromise)) return;

    let history = Object.keys(this.bubbles).map(id => +id).sort((a, b) => a - b);
    if(!history.length) return;
    
    /* let history = appMessagesManager.historiesStorage[this.peerID].history;
    let length = history.length; */
    
    // filter negative ids
    let lastBadIndex = -1;
    for(let i = 0; i < history.length; ++i) {
      if(history[i] <= 0) lastBadIndex = i;
      else break;
    }
    if(lastBadIndex != -1) {
      history = history.slice(lastBadIndex + 1);
    }
    
    if(top && !this.scrolledAll) {
      this.log('Will load more (up) history by id:', history[0], 'maxID:', history[history.length - 1], history);
      /* false &&  */this.getHistory(history[0], true);
    }

    if(this.scrolledAllDown) return;
    
    let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
    /* if(!dialog) {
      this.log.warn('no dialog for load history');
      return;
    } */
    
    // if scroll down after search
    if(!top && (!dialog || history.indexOf(dialog.top_message) === -1)) {
      this.log('Will load more (down) history by maxID:', history[history.length - 1], history);
      /* false &&  */this.getHistory(history[history.length - 1], false, true);
    }
  }
  
  public onScroll() {
    if(this.onScrollRAF) window.cancelAnimationFrame(this.onScrollRAF);

    this.onScrollRAF = window.requestAnimationFrame(() => {
      lottieLoader.checkAnimations(false, 'chat');

      if(this.isScrollingTimeout) {
        clearTimeout(this.isScrollingTimeout);
      } else {
        this.chatInner.classList.add('is-scrolling');
      }

      this.isScrollingTimeout = setTimeout(() => {
        this.chatInner.classList.remove('is-scrolling');
        this.isScrollingTimeout = 0;
      }, 300);
      
      if(this.scroll.scrollHeight - (this.scroll.scrollTop + this.scroll.offsetHeight) == 0/* <= 5 */) {
        this.scroll.parentElement.classList.add('scrolled-down');
        this.scrolledDown = true;
      } else if(this.scroll.parentElement.classList.contains('scrolled-down')) {
        this.scroll.parentElement.classList.remove('scrolled-down');
        this.scrolledDown = false;
      }

      this.onScrollRAF = 0;
    });
  }
  
  public setScroll() {
    this.scrollable = new Scrollable(this.bubblesContainer, 'y', 750, 'IM', this.chatInner/* 1500 */, 300);
    this.scroll = this.scrollable.container;

    this.bubblesContainer.append(this.goDownBtn);
    
    //this.scrollable.setVirtualContainer(this.chatInner);
    this.scrollable.onScrolledTop = () => this.loadMoreHistory(true);
    this.scrollable.onScrolledBottom = () => this.loadMoreHistory(false);

    this.scroll.addEventListener('scroll', this.onScroll.bind(this));
    this.scroll.parentElement.classList.add('scrolled-down');
  }
  
  public setPeerStatus(needClear = false) {
    if(!this.myID) return;

    if(this.peerID < 0) { // not human
      let chat = appPeersManager.getPeer(this.peerID);
      let isChannel = appPeersManager.isChannel(this.peerID) && !appPeersManager.isMegagroup(this.peerID);
      
      this.subtitleEl.classList.remove('online');
      appSidebarRight.profileElements.subtitle.classList.remove('online');
      ///////this.log('setPeerStatus', chat);

      if(needClear) {
        this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = '';
      }

      Promise.all([
        appPeersManager.isMegagroup(this.peerID) ? apiManager.invokeApi('messages.getOnlines', {
          peer: appPeersManager.getInputPeerByID(this.peerID)
        }) as Promise<any> : Promise.resolve(),
        // will redirect if wrong
        appProfileManager.getChatFull(chat.id)
      ]).then(results => {
        let [chatOnlines, chatInfo] = results;
        
        let onlines = chatOnlines ? chatOnlines.onlines : 1;
        
        ///////////this.log('chatInfo res:', chatInfo);
        
        if(chatInfo.pinned_msg_id) { // request pinned message
          this.pinnedMsgID = chatInfo.pinned_msg_id;
          appMessagesManager.wrapSingleMessage(chatInfo.pinned_msg_id);
        }
        
        let participants_count = chatInfo.participants_count || chatInfo.participants.participants.length;
        let subtitle = numberWithCommas(participants_count) + ' ' + (isChannel ? 'subscribers' : 'members');
        
        if(onlines > 1) {
          subtitle += ', ' + numberWithCommas(onlines) + ' online';
        }
        
        this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = subtitle;
      });
    } else if(!appUsersManager.isBot(this.peerID)) { // user
      let user = appUsersManager.getUser(this.peerID);
      
      if(this.myID == this.peerID) {
        this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = '';
      } else if(user && user.status) {
        let subtitle = '';
        switch(user.status._) {
          case 'userStatusRecently': {
            subtitle += 'last seen recently';
            break;
          }
          
          case 'userStatusOffline': {
            subtitle = 'last seen ';
          
            let date = user.status.was_online;
            let now = Date.now() / 1000;
            
            if((now - date) < 60) {
              subtitle += ' just now';
            } else if((now - date) < 3600) {
              subtitle += ((now - date) / 60 | 0) + ' minutes ago';
            } else if(now - date < 86400) {
              subtitle += ((now - date) / 3600 | 0) + ' hours ago';
            } else {
              let d = new Date(date * 1000);
              subtitle += ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + ' at ' + 
              ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
            }
            
            break;
          }

          case 'userStatusOnline': {
            this.subtitleEl.classList.add('online');
            appSidebarRight.profileElements.subtitle.classList.add('online');
            subtitle = 'online';
            break;
          }
        }
        
        appSidebarRight.profileElements.subtitle.innerText = subtitle;
        
        if(this.typingUsers[this.peerID] == this.peerID) {
          this.subtitleEl.innerText = 'typing...';
          this.subtitleEl.classList.add('online');
        } else {
          this.subtitleEl.innerText = subtitle;

          if(subtitle != 'online') {
            this.subtitleEl.classList.remove('online');
            appSidebarRight.profileElements.subtitle.classList.remove('online');
          }
        }
      }
    }
  }
  
  public cleanup() {
    ////console.time('appImManager cleanup');
    this.peerID = $rootScope.selectedPeerID = 0;
    this.scrolledAll = false;
    this.scrolledAllDown = false;
    this.muted = false;
    
    /* for(let i in this.bubbles) {
      let bubble = this.bubbles[i];
      bubble.remove();
    } */
    this.bubbles = {};
    this.dateMessages = {};
    this.bubbleGroups.cleanup();
    this.unreadOut.clear();
    this.needUpdate.length = 0;
    this.lazyLoadQueue.clear();
    
    // clear input 
    this.chatInputC.messageInput.innerHTML = '';
    this.chatInputC.replyElements.cancelBtn.click();
    
    // clear messages
    this.chatInner.innerHTML = '';

    lottieLoader.checkAnimations(false, 'chat', true);

    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;
    
    //this.scrollable.setVirtualContainer(this.chatInner);
    this.scrollable.setVirtualContainer(null);

    this.datesIntersectionObserver.disconnect();
    this.lastDateMessageDiv = null;
    
    this.unreadedObserver.disconnect();

    this.loadedTopTimes = this.loadedBottomTimes = 0;

    ////console.timeEnd('appImManager cleanup');
  }
  
  public setPeer(peerID: number, lastMsgID = 0, forwarding = false, fromClick = false) {
    console.time('appImManager setPeer');
    console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(peerID == 0) {
      appSidebarRight.toggleSidebar(false);
      this.topbar.style.display = this.chatInput.style.display = this.goDownBtn.style.display = 'none';
      this.cleanup();
      return false;
    }
    
    let samePeer = this.peerID == peerID;
    
    if(this.setPeerPromise && samePeer) return this.setPeerPromise;
    
    if(lastMsgID) {
      appMessagesManager.readHistory(peerID, lastMsgID); // lol
    }
    
    if(samePeer) {
      if(!testScroll && !lastMsgID) {
        return true;
      }
      
      if(this.bubbles[lastMsgID]) {
        let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
        
        if(dialog && lastMsgID == dialog.top_message) {
          this.log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          this.scroll.scrollTop = this.scroll.scrollHeight;
        } else {
          //this.bubbles[lastMsgID].scrollIntoView();
          this.scrollable.scrollIntoView(this.bubbles[lastMsgID]);
        }
        
        return true;
      }
    } else {
      appSidebarRight.searchCloseBtn.click();
    }
    
    // clear 
    this.cleanup();
    
    // set new
    this.peerID = $rootScope.selectedPeerID = peerID;
    
    // no dialog
    /* if(!appMessagesManager.getDialogByPeerID(this.peerID).length) {
      this.log.error('No dialog by peerID:', this.peerID);
      return Promise.reject();
    } */
    
    let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0] || null;
    //////this.log('setPeer peerID:', this.peerID, dialog, lastMsgID);
    appProfileManager.putPhoto(this.avatarEl, this.peerID);
    appProfileManager.putPhoto(appSidebarRight.profileElements.avatar, this.peerID);

    this.firstTopMsgID = dialog ? dialog.top_message : 0;
    
    this.chatInner.style.visibility = 'hidden';
    this.chatInput.style.display = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID) ? 'none' : '';
    this.topbar.style.display = '';
    if(appPeersManager.isAnyGroup(peerID)) this.chatInner.classList.add('is-chat');
    else this.chatInner.classList.remove('is-chat');
    if(appPeersManager.isChannel(peerID)) this.chatInner.classList.add('is-channel');
    else this.chatInner.classList.remove('is-channel');
    this.pinnedMessageContainer.style.display = 'none';
    window.requestAnimationFrame(() => {
      //this.chatInner.style.visibility = 'hidden';

      let title = '';
      if(this.peerID == this.myID) title = 'Saved Messages';
      else title = appPeersManager.getPeerTitle(this.peerID);
      //this.titleEl.innerHTML = appSidebarRight.profileElements.name.innerHTML = dom.titleSpan.innerHTML;
      this.titleEl.innerHTML = appSidebarRight.profileElements.name.innerHTML = title;
      this.goDownBtn.style.display = '';
      //this.topbar.style.display = this.goDownBtn.style.display = '';
      //this.chatInput.style.display = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID) ? 'none' : '';
      //appSidebarRight.toggleSidebar(true);
      
      //if(appPeersManager.isAnyGroup(peerID)) this.chatInner.classList.add('is-chat');
      //else this.chatInner.classList.remove('is-chat');

      if(!fromClick) {
        if(!samePeer && appDialogsManager.lastActiveListElement) {
          appDialogsManager.lastActiveListElement.classList.remove('active');
        }
    
        let dom = appDialogsManager.getDialogDom(this.peerID);
        if(dom) {
          appDialogsManager.lastActiveListElement = dom.listEl;
          dom.listEl.classList.add('active');
        }
      }

      this.setPeerStatus(true);
    });

    // add last message, bc in getHistory will load < max_id
    let additionMsgID = 0;
    if(lastMsgID && !forwarding) additionMsgID = lastMsgID;
    else if(dialog && dialog.top_message) additionMsgID = dialog.top_message;

    /* this.setPeerPromise = null;
    this.preloader.detach();
    return true; */

    //////appSidebarRight.toggleSidebar(true);

    console.timeEnd('appImManager setPeer pre promise');
    this.preloader.attach(this.bubblesContainer);
    return this.setPeerPromise = Promise.all([
      this.getHistory(forwarding ? lastMsgID + 1 : lastMsgID, true, false, additionMsgID).then(() => {
        ////this.log('setPeer removing preloader');

        if(lastMsgID) {
          if(!dialog || lastMsgID != dialog.top_message) {
            let bubble = this.bubbles[lastMsgID];
            
            if(bubble) this.bubbles[lastMsgID].scrollIntoView();
            else this.log.warn('no bubble by lastMsgID:', lastMsgID);
          } else {
            this.log('will scroll down 2');
            this.scroll.scrollTop = this.scroll.scrollHeight;
          }
        }
        
        /* this.onScroll();
        this.scrollable.onScroll();*/
        
        this.preloader.detach();
        this.chatInner.style.visibility = '';

        console.timeEnd('appImManager setPeer');
        
        //setTimeout(() => {
        //appSidebarRight.fillProfileElements();
        //appSidebarRight.loadSidebarMedia(true);
        //}, 500);
        
        return true;
      })/* .catch(err => {
        this.log.error(err);
      }) */,
      
      appSidebarRight.fillProfileElements()/* ,
      appSidebarRight.loadSidebarMedia(true) */
    ]).catch(err => {
      this.log.error('setPeer promises error:', err);
      this.preloader.detach();
      return false;
    }).then(res => {
      if(this.peerID == peerID) {
        this.setPeerPromise = null;
      }

      return !!res;
    });
  }
  
  public setTyping(action: any): Promise<boolean> {
    if(!this.peerID) return Promise.resolve(false);
    
    if(typeof(action) == 'string') {
      action = {_: action};
    }
    
    let input = appPeersManager.getInputPeerByID(this.peerID);
    return apiManager.invokeApi('messages.setTyping', {
      peer: input,
      action: action
    }) as Promise<boolean>;
  }
  
  public updateUnreadByDialog(dialog: any) {
    let maxID = this.peerID == this.myID ? dialog.read_inbox_max_id : dialog.read_outbox_max_id;
    
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
  
  public deleteMessagesByIDs(msgIDs: number[], forever = true) {
    msgIDs.forEach(id => {
      if(this.firstTopMsgID == id && forever) {
        let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
        
        if(dialog) {
          ///////this.log('setting firstTopMsgID after delete:', id, dialog.top_message, dialog);
          this.firstTopMsgID = dialog.top_message;
        }
      }
      
      if(!(id in this.bubbles)) return;
      
      let bubble = this.bubbles[id];
      delete this.bubbles[id];

      this.unreadedObserver.unobserve(bubble);
      this.scrollable.removeElement(bubble);
      //bubble.remove();
    });
    
    lottieLoader.checkAnimations();
    this.deleteEmptyDateGroups();
  }
  
  public renderNewMessagesByIDs(msgIDs: number[]) {
    if(!this.bubbles[this.firstTopMsgID] && Object.keys(this.bubbles).length) { // seems search active
      //////this.log('seems search is active, skipping render:', msgIDs);
      return;
    }
    
    let scrolledDown = this.scrolledDown;
    msgIDs.forEach((msgID: number) => {
      let message = appMessagesManager.getMessage(msgID);
      
      /////////this.log('got new message to append:', message);
      
      //this.unreaded.push(msgID);
      this.renderMessage(message);
    });
    if(scrolledDown) this.scrollable.scrollTop = this.scrollable.scrollHeight;
  }

  public getDateContainerByMessage(message: any, reverse: boolean) {
    let date = new Date(message.date * 1000);
    let justDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    let dateTimestamp = justDate.getTime();
    if(!(dateTimestamp in this.dateMessages)) {
      let str = '';
      
      let today = new Date();
      today.setHours(0);
      today.setMinutes(0);
      today.setSeconds(0);
      
      if(today < date) {
        str = 'Today';
      } else {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        str = justDate.getFullYear() == new Date().getFullYear() ? 
        months[justDate.getMonth()] + ' ' + justDate.getDate() : 
        justDate.toISOString().split('T')[0].split('-').reverse().join('.');
      }
      
      let div = document.createElement('div');
      div.className = 'bubble service is-date';
      div.innerHTML = `<div class="bubble__container"><div class="service-msg">${str}</div></div>`;
      ////////this.log('need to render date message', dateTimestamp, str);

      let container = document.createElement('div');
      container.className = 'bubbles-date-group';
      
      this.dateMessages[dateTimestamp] = {
        div,
        container,
        firstTimestamp: date.getTime()
      };

      container.append(div);
      //this.scrollable.prepareElement(div, false);

      if(reverse) {
        //let scrollTopPrevious = this.scrollable.scrollTop;
        this.scrollable.prepend(container, false);

        /* if(!scrollTopPrevious) {
          this.scrollable.scrollTop += container.scrollHeight;
        } */
      } else {
        this.scrollable.append(container, false);
      }

      this.datesIntersectionObserver.observe(container);
    }

    return this.dateMessages[dateTimestamp];
  }
  
  // reverse means top
  public renderMessage(message: any, reverse = false, multipleRender = false, bubble: HTMLDivElement = null, updatePosition = true) {
    this.log('message to render:', message);
    if(message.deleted) return;
    else if(message.grouped_id) { // will render only last album's message
      let storage = appMessagesManager.groupedMessagesStorage[message.grouped_id];
      let maxID = Math.max(...Object.keys(storage).map(i => +i));
      if(message.mid < maxID) {
        return;
      }
    }
    
    let peerID = this.peerID;
    let our = message.fromID == this.myID;
    
    let messageDiv = document.createElement('div');
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
      this.bubbles[+message.mid] = bubble;
    } else {
      bubble.className = 'bubble';
      bubbleContainer = bubble.firstElementChild as HTMLDivElement;
      bubbleContainer.innerHTML = '';
      //bubble.innerHTML = '';
    }

    bubble.dataset.mid = message.mid;

    if(message._ == 'messageService') {
      bubble.className = 'bubble service';
      
      let action = message.action;
      
      let title = appPeersManager.getPeerTitle(message.fromID);
      let name = document.createElement('div');
      name.classList.add('name');
      name.dataset.peerID = message.fromID;
      name.innerHTML = title;
      
      let _ = action._;
      if(_ == "messageActionPhoneCall") {
        _ += '.' + action.type;
      }
      // @ts-ignore
      let str = (name.innerText ? name.outerHTML + ' ' : '') + langPack[_];
      bubbleContainer.innerHTML = `<div class="service-msg">${str}</div>`;

      /* if(!updatePosition) {
        if(!multipleRender) {
          this.scrollPosition.restore();  // лагает из-за этого
        }
      } else if(reverse) {
        this.scrollable.prepend(bubble);
      } else {
        this.scrollable.append(bubble);
      } */

      let dateContainer = this.getDateContainerByMessage(message, reverse);
      if(!updatePosition) {

      } else if(reverse) {
        dateContainer.container.insertBefore(bubble, dateContainer.div.nextSibling);
        //this.scrollable.prepareElement(bubble, false);
      } else {
        dateContainer.container.append(bubble);
        //this.scrollable.prepareElement(bubble, true);
      }

      return bubble;
    }
    
    // time section
    
    let date = new Date(message.date * 1000);
    let time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
    
    if(message.views) {
      bubble.classList.add('channel-post');
      time = formatNumber(message.views, 1) + ' <i class="tgico-channelviews"></i> ' + time;
    }
    
    if(message.edit_date) {
      bubble.classList.add('is-edited');
      time = '<i class="edited">edited</i> ' + time;
    }
    
    let timeSpan = document.createElement('span');
    timeSpan.classList.add('time');
    
    let timeInner = document.createElement('div');
    timeInner.classList.add('inner', 'tgico');
    timeInner.innerHTML = time;

    let messageMessage: string, totalEntities: any[];
    if(message.grouped_id) {
      let group = appMessagesManager.groupedMessagesStorage[message.grouped_id];
      let foundMessages = 0;
      for(let i in group) {
        let m = group[i];
        if(m.message) {
          if(++foundMessages > 1) break;
          messageMessage = m.message;
          totalEntities = m.totalEntities;
        }  
      }

      if(foundMessages > 1) {
        messageMessage = undefined;
        totalEntities = undefined;
      }
    }
    
    if(!messageMessage && !totalEntities) {
      messageMessage = message.message;
      totalEntities = message.totalEntities;
    }
    
    let richText = RichTextProcessor.wrapRichText(messageMessage, {
      entities: totalEntities
    });
    
    if(totalEntities) {
      let emojiEntities = totalEntities.filter((e: any) => e._ == 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
      
      if(emojiStrLength == strLength && emojiEntities.length <= 3) {
        let attachmentDiv = document.createElement('div');
        attachmentDiv.classList.add('attachment');
        
        attachmentDiv.innerHTML = richText;
        
        bubble.classList.add('is-message-empty', 'emoji-' + emojiEntities.length + 'x', 'emoji-big');
        
        bubbleContainer.append(attachmentDiv);
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
    
    timeSpan.appendChild(timeInner);
    messageDiv.append(timeSpan);
    bubbleContainer.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad
    
    if(our) {
      if(message.pFlags.unread || message.mid < 0) this.unreadOut.add(message.mid); // message.mid < 0 added 11.02.2020
      let status = '';
      if(message.mid < 0) status = 'is-sending';
      else status = message.pFlags.unread ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    } else {
      //this.log('not our message', message, message.pFlags.unread);
      if(message.pFlags.unread) {
        this.unreadedObserver.observe(bubble); 
      }
    }
    
    // media
    if(message.media) {
      let attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');
      
      if(!messageMessage) {
        bubble.classList.add('is-message-empty');
      }
      
      let processingWebPage = false;
      
      switch(message.media._) {
        case 'messageMediaPending': {
          let pending = message.media;
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
                this.log('will wrap pending photo:', pending, message, appPhotosManager.getPhoto(message.id));
                wrapPhoto(message.id, message, attachmentDiv, undefined, undefined, true, true, this.lazyLoadQueue, null);

                bubble.classList.add('hide-name', 'photo');
              //}

              break;
            }

            case 'video': {
              //if(pending.size < 5e6) {
                let doc = appDocsManager.getDoc(message.id);
                this.log('will wrap pending video:', pending, message, doc);
                wrapVideo({
                  doc, 
                  container: attachmentDiv, 
                  message, 
                  boxWidth: 380,
                  boxHeight: 380, 
                  withTail: doc.type != 'round', 
                  isOut: our,
                  lazyLoadQueue: this.lazyLoadQueue,
                  middleware: null
                });

                preloader.attach(attachmentDiv, false);
                bubble.classList.add('hide-name', 'video');
              //}
              break;
            }
            
            case 'audio':
            case 'document': {
              let docDiv = wrapDocument(pending, false, true);
              
              let icoDiv = docDiv.querySelector('.document-ico');
              preloader.attach(icoDiv, false);
              
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
          let photo = message.media.photo;
          ////////this.log('messageMediaPhoto', photo);
          
          bubble.classList.add('hide-name', 'photo');
          if(message.grouped_id) {
            bubble.classList.add('is-album');

            wrapAlbum({
              groupID: message.grouped_id, 
              attachmentDiv,
              middleware: () => {
                return this.peerID == peerID;
              },
              isOut: our,
              lazyLoadQueue: this.lazyLoadQueue
            });
          } else {
            wrapPhoto(photo.id, message, attachmentDiv, undefined, undefined, true, our, this.lazyLoadQueue, () => {
              return this.peerID == peerID;
            });
          }

          break;
        }
        
        case 'messageMediaWebPage': {
          processingWebPage = true;
          
          let webpage = message.media.webpage;
          ////////this.log('messageMediaWebPage', webpage);
          if(webpage._ == 'webPageEmpty') {
            break;
          } 
          
          bubble.classList.add('webpage');
          
          let box = document.createElement('div');
          box.classList.add('box', 'web');
          
          let quote = document.createElement('div');
          quote.classList.add('quote');
          
          let nameEl = document.createElement('a');
          nameEl.classList.add('name');
          
          let titleDiv = document.createElement('div');
          titleDiv.classList.add('title');
          
          let textDiv = document.createElement('div');
          textDiv.classList.add('text');
          
          let preview: HTMLDivElement = null;
          if(webpage.photo || webpage.document) {
            preview = document.createElement('div');
            preview.classList.add('preview');
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
                boxWidth: 380,
                boxHeight: 300,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: () => {
                  return this.peerID == peerID;
                }
              });
              //}
            } else {
              doc = null;
            }
          }
          
          if(webpage.photo && !doc) {
            bubble.classList.add('photo');

            wrapPhoto(webpage.photo.id, message, preview, 380, 300, false, null, this.lazyLoadQueue, () => {
              return this.peerID == peerID;
            });
          }
          
          if(preview) {
            quote.append(preview);
          }
          
          nameEl.setAttribute('target', '_blank');
          nameEl.href = webpage.url || '#';
          nameEl.innerHTML = webpage.site_name ? RichTextProcessor.wrapEmojiText(webpage.site_name) : '';
          
          if(webpage.description) {
            textDiv.innerHTML = RichTextProcessor.wrapRichText(webpage.description);
          }
          
          if(webpage.title) {
            titleDiv.innerHTML = RichTextProcessor.wrapRichText(webpage.title);
          }
          
          quote.append(nameEl, titleDiv, textDiv);
          box.append(quote);
          
          //bubble.prepend(box);
          bubbleContainer.prepend(timeSpan, box);
          
          //this.log('night running', bubble.scrollHeight);
          
          break;
        }
        
        case 'messageMediaDocument': {
          let doc = message.media.document;

          this.log('messageMediaDocument', doc, bubble);
          
          if(doc.sticker/*  && doc.size <= 1e6 */) {
            bubble.classList.add('sticker');
            
            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }
            
            appPhotosManager.setAttachmentSize(doc, attachmentDiv, undefined, undefined, true);
            //let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.height = attachmentDiv.style.height;
            bubbleContainer.style.width = attachmentDiv.style.width;
            //appPhotosManager.setAttachmentSize(doc, bubble);
            wrapSticker(doc, attachmentDiv, () => {
              if(this.peerID != peerID) {
                this.log.warn('peer changed, canceling sticker attach');
                return false;
              }
              
              return true;
            }, this.lazyLoadQueue, 'chat', false, !!message.pending || !multipleRender);

            break;
          } else if(doc.type == 'video' || doc.type == 'gif' || doc.type == 'round'/*  && doc.size <= 20e6 */) {
            this.log('never get free 2', doc);
            
            if(doc.type == 'round') {
              bubble.classList.add('round');
            }
            
            bubble.classList.add('hide-name', 'video');
            if(message.grouped_id) {
              bubble.classList.add('is-album');
  
              wrapAlbum({
                groupID: message.grouped_id, 
                attachmentDiv,
                middleware: () => {
                  return this.peerID == peerID;
                },
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue
              });
            } else {
              wrapVideo({
                doc, 
                container: attachmentDiv, 
                message, 
                boxWidth: 380,
                boxHeight: 380, 
                withTail: doc.type != 'round', 
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue,
                middleware: () => {
                  return this.peerID == peerID;
                }
              });
            }
            
            break;
          } else if(doc.mime_type == 'audio/ogg') {
            let docDiv = wrapDocument(doc);
            
            bubble.classList.remove('is-message-empty');
            
            bubble.classList.add('bubble-audio');
            messageDiv.append(docDiv);
            processingWebPage = true;
            
            break;
          } else {
            let docDiv = wrapDocument(doc);
            
            bubble.classList.remove('is-message-empty');
            messageDiv.append(docDiv);
            messageDiv.classList.add((doc.type || 'document') + '-message');
            processingWebPage = true;
            
            break;
          }

          break;
        }

        case 'messageMediaContact': {
          this.log('wrapping contact', message);

          let contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          messageDiv.classList.add('contact-message');
          processingWebPage = true;

          let texts = [];
          if(message.media.first_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.first_name));
          if(message.media.last_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.last_name));

          contactDiv.innerHTML = `
            <div class="contact-avatar user-avatar"><img src="blob:https://192.168.0.105:9000/803514b4-4a46-4125-984f-ca8f86405ef2"></div>
            <div class="contact-details">
              <div class="contact-name">${texts.join(' ')}</div>
              <div class="contact-number">${message.media.phone_number ? '+' + formatPhoneNumber(message.media.phone_number).formatted : 'Unknown phone number'}</div>
            </div>`;

          bubble.classList.remove('is-message-empty');
          messageDiv.append(contactDiv);

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
    }
    
    if((this.peerID < 0 && !our) || message.fwd_from || message.reply_to_mid) { // chat
      let title = appPeersManager.getPeerTitle(message.fwdFromID || message.fromID);
      
      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      }
      
      //this.log(title);
      
      if(message.fwdFromID || message.fwd_from) {
        bubble.classList.add('forwarded');
        
        if(message.savedFrom) {
          let fwd = document.createElement('div');
          fwd.classList.add('forward'/* , 'tgico-forward' */);
          fwd.innerHTML = `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
          <defs><path d="M13.55 3.24L13.64 3.25L13.73 3.27L13.81 3.29L13.9 3.32L13.98 3.35L14.06 3.39L14.14 3.43L14.22 3.48L14.29 3.53L14.36 3.59L14.43 3.64L22.23 10.85L22.36 10.99L22.48 11.15L22.57 11.31L22.64 11.48L22.69 11.66L22.72 11.85L22.73 12.04L22.71 12.22L22.67 12.41L22.61 12.59L22.53 12.76L22.42 12.93L22.29 13.09L22.23 13.15L14.43 20.36L14.28 20.48L14.12 20.58L13.95 20.66L13.77 20.72L13.58 20.76L13.4 20.77L13.22 20.76L13.03 20.73L12.85 20.68L12.68 20.61L12.52 20.52L12.36 20.4L12.22 20.27L12.16 20.2L12.1 20.13L12.05 20.05L12.01 19.98L11.96 19.9L11.93 19.82L11.89 19.73L11.87 19.65L11.84 19.56L11.83 19.47L11.81 19.39L11.81 19.3L11.8 19.2L11.8 16.42L11 16.49L10.23 16.58L9.51 16.71L8.82 16.88L8.18 17.09L7.57 17.33L7.01 17.6L6.48 17.91L5.99 18.26L5.55 18.64L5.14 19.05L4.77 19.51L4.43 19.99L4.29 20.23L4.21 20.35L4.11 20.47L4 20.57L3.88 20.65L3.75 20.72L3.62 20.78L3.48 20.82L3.33 20.84L3.19 20.84L3.04 20.83L2.9 20.79L2.75 20.74L2.62 20.68L2.53 20.62L2.45 20.56L2.38 20.5L2.31 20.43L2.25 20.36L2.2 20.28L2.15 20.19L2.11 20.11L2.07 20.02L2.04 19.92L2.02 19.83L2.01 19.73L2 19.63L2.04 17.99L2.19 16.46L2.46 15.05L2.85 13.75L3.35 12.58L3.97 11.53L4.7 10.6L5.55 9.8L6.51 9.12L7.59 8.56L8.77 8.13L10.07 7.83L11.48 7.65L11.8 7.63L11.8 4.8L11.91 4.56L12.02 4.35L12.14 4.16L12.25 3.98L12.37 3.82L12.48 3.68L12.61 3.56L12.73 3.46L12.85 3.38L12.98 3.31L13.11 3.27L13.24 3.24L13.37 3.23L13.46 3.23L13.55 3.24Z" id="b13RmHDQtl"></path></defs><use xlink:href="#b13RmHDQtl" opacity="1" fill="#fff" fill-opacity="1"></use></svg>`;
          bubbleContainer.append(fwd);
          bubble.dataset.savedFrom = message.savedFrom;
        }
        
        if(!bubble.classList.contains('sticker')) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.innerHTML = 'Forwarded from ' + title;
          nameDiv.dataset.peerID = message.fwdFromID;
          //nameDiv.style.color = appPeersManager.getPeerColorByID(message.fromID, false);
          bubbleContainer.append(nameDiv);
        }
      } else {
        if(message.reply_to_mid) {
          let originalMessage = appMessagesManager.getMessage(message.reply_to_mid);
          let originalPeerTitle = appPeersManager.getPeerTitle(originalMessage.fromID, true) || '';
          
          /////////this.log('message to render reply', originalMessage, originalPeerTitle, bubble, message);
          
          // need to download separately
          if(originalMessage._ == 'messageEmpty') {
            //////////this.log('message to render reply empty, need download', message, message.reply_to_mid);
            appMessagesManager.wrapSingleMessage(message.reply_to_mid);
            this.needUpdate.push({replyMid: message.reply_to_mid, mid: message.mid});
            
            originalPeerTitle = 'Loading...';
          }
          
          if(originalMessage.mid) {
            bubble.setAttribute('data-original-mid', originalMessage.mid);
          } else {
            bubble.setAttribute('data-original-mid', message.reply_to_mid);
          }
          
          bubbleContainer.append(wrapReply(originalPeerTitle, originalMessage.message || '', originalMessage.media));
          bubble.classList.add('is-reply');
        }
        
        if(!bubble.classList.contains('sticker') && (peerID < 0 && peerID != message.fromID)) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.innerHTML = title;
          nameDiv.style.color = appPeersManager.getPeerColorByID(message.fromID, false);
          nameDiv.dataset.peerID = message.fromID;
          bubbleContainer.append(nameDiv);
        } else /* if(!message.reply_to_mid) */ {
          bubble.classList.add('hide-name');
        }
      }
      
      if(!our && this.peerID < 0 && (!appPeersManager.isChannel(this.peerID) || appPeersManager.isMegagroup(this.peerID))) {
        let avatarDiv = document.createElement('div');
        avatarDiv.classList.add('user-avatar');
        
        /////////this.log('exec loadDialogPhoto', message);
        if(message.fromID) { // if no - user hidden
          appProfileManager.putPhoto(avatarDiv, message.fromID);
        } else if(!title && message.fwd_from && message.fwd_from.from_name) {
          title = message.fwd_from.from_name;
          
          appProfileManager.putPhoto(avatarDiv, 0, false, title);
        }
        
        avatarDiv.dataset.peerID = message.fromID;
        
        bubbleContainer.append(avatarDiv);
      }
    } else {
      bubble.classList.add('hide-name');
    }
    
    bubble.classList.add(our ? 'is-out' : 'is-in');
    if(updatePosition) {
      this.bubbleGroups.addBubble(bubble, message, reverse);
      
      //window.requestAnimationFrame(() => {
        /* if(reverse) {
          this.scrollable.prependByBatch(bubble);
        } else {
          this.scrollable.appendByBatch(bubble);
        } */
        // раскомментировать ////// если рендер должен быть в другой функции (если хочешь сделать через requestAnimationFrame)
        //////if(!multipleRender) {
          /* if(reverse) {
            this.scrollable.prepend(bubble);
          } else {
            this.scrollable.append(bubble);
          } */
        //////}
      //});
      
      let dateMessage = this.getDateContainerByMessage(message, reverse);
      if(reverse) {
        dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
        //this.scrollable.prepareElement(bubble, false);
      } else {
        dateMessage.container.append(bubble);
        //this.scrollable.prepareElement(bubble, true);
      }
    } else {
      this.bubbleGroups.updateGroupByMessageID(message.mid);
    }
    
    /* if(bubble.classList.contains('webpage')) {
      this.log('night running', bubble, bubble.scrollHeight);
    } */

    return bubble;
  }

  public performHistoryResult(history: number[], reverse: boolean, isBackLimit: boolean, additionMsgID: number, resetPromises = false) {
    // commented bot getProfile in getHistory!
    if(!history/* .filter((id: number) => id > 0) */.length) {
      if(!isBackLimit) {
        this.scrolledAll = true;
      } else {
        this.scrolledAllDown = true;
      }
    }

    //history = history.slice(); // need

    if(additionMsgID) {
      history.unshift(additionMsgID);
    }

    if(testScroll && additionMsgID) {
      for(let i = 0; i < 3; ++i) {
        let _history = history.slice();
        setTimeout(() => {
          this.performHistoryResult(_history, reverse, isBackLimit, 0, resetPromises);
        }, (i + 1) * 2500);
      }
    }

    console.time('appImManager render history');

    let firstLoad = !!this.setPeerPromise && false;

    let peerID = this.peerID;
    return new Promise<boolean>((resolve, reject) => {
      let resolved = false;
      /* let bubbles: HTMLDivElement[] = [];
      method((msgID) => {
        let message = appMessagesManager.getMessage(msgID);
        let bubble = this.renderMessage(message, reverse, true);
        bubbles.push(bubble);
      }); */

      //let leftHeightToScroll = this.scrollable.innerHeight;

      //console.timeEnd('appImManager: pre render start');

      //this.log('start performHistoryResult, scrollTop:', this.scrollable.scrollTop, this.scrollable.scrollHeight, this.scrollable.innerHeight);

      let method = (reverse ? history.shift : history.pop).bind(history);

      let renderedFirstScreen = !!this.scrollable.scrollTop;
      let r = () => {
        //let bubble = bubbles.shift();
        //if(!bubble && !resolved) return resolve();
        //if(!history.length) return resolve(true);

        /* let msgID = result.history.shift();
        if(!msgID && !resolved) return resolve();
        let message = appMessagesManager.getMessage(msgID); */
        
        if(this.peerID != peerID) {
          return reject('peer changed');
        }

        //let startTime = Date.now();
        //let elapsedTime = 0;
        //do {
          //let msgID = history.shift();
          let msgID = method();
          if(!msgID) {
            if(resetPromises) {
              (reverse ? this.getHistoryTopPromise = undefined : this.getHistoryBottomPromise = undefined);
            }

            if(!resolved) {
              resolve(true);
            }

            return;
          }

          let message = appMessagesManager.getMessage(msgID);
          let bubble = this.renderMessage(message, reverse, true);
          if(bubble) {
            if(reverse) {
              ////////this.scrollable.prepend(bubble);

              //this.log('performHistoryResult scrollTop', this.scrollable.scrollTop, bubble.scrollHeight);

              /* if(innerHeight >= 0) {
                let height = bubble.scrollHeight;
                innerHeight -= height;
                this.scrollable.scrollTop += height;
              } */

              if(!renderedFirstScreen) {
                if(!this.scrollable.scrollTop) {
                  let height = bubble.scrollHeight;
                  //let height = Math.ceil(bubble.getBoundingClientRect().height);
                  this.scrollable.scrollTop += height;
                  //innerHeight -= height;
                }
                /* if(leftHeightToScroll >= 0) {
                  let height = bubble.scrollHeight;
                  leftHeightToScroll -= height;
                  this.scrollable.scrollTop += height;
                } */ else {
                  renderedFirstScreen = true;
                  resolve();
                  resolved = true;
                }
              }
            } else {
              ////////this.scrollable.append(bubble);
            }
          }
        //} while(cached && !this.scrollable.scrollTop);
        //} while((elapsedTime = Date.now() - startTime) < 3);

        /* let bubble = this.renderMessage(message, reverse, true);
        if(!bubble) return r();

        if(reverse) {
          this.scrollable.prepend(bubble);
  
          if(!this.scrollable.scrollTop) {
            let height = bubble.scrollHeight;
            this.scrollable.scrollTop += height;
            //innerHeight -= height;
          } else if(!resolved) {
            resolve();
            resolved = true;
          }
        } else {
          this.scrollable.append(bubble);
        } */

        firstLoad ? window.requestAnimationFrame(r) : r();
      };
  
      firstLoad ? window.requestAnimationFrame(r) : r();
      //r();
      /* method((msgID) => {
        let message = appMessagesManager.getMessage(msgID);
        
        window.requestAnimationFrame(() => {
          this.renderMessage(message, reverse, true);
        });
      }); */
    }).then(() => {
      console.timeEnd('appImManager render history');

      return true;
    });
  }
  
  // reverse means scroll up
  public getHistory(maxID = 0, reverse = false, isBackLimit = false, additionMsgID = 0) {
    let peerID = this.peerID;

    //console.time('appImManager call getHistory');
    
    let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
    if(!maxID && dialog && dialog.top_message) {
      maxID = dialog.top_message/*  + 1 */;
    }
    
    let pageCount = this.bubblesContainer.clientHeight / 38/*  * 1.25 */ | 0;
    //let loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    let realLoadCount = 50;
    let loadCount = realLoadCount;
    
    if(testScroll) {
      //loadCount = 1;
      if(Object.keys(this.bubbles).length > 0)
      return Promise.resolve(true);
    }
    
    ////console.time('render history total');
    
    let backLimit = 0;
    if(isBackLimit) {
      backLimit = loadCount;
      loadCount = 0;
      maxID += 1;
    }

    let result = appMessagesManager.getHistory(this.peerID, maxID, loadCount, backLimit);
    /* if(!(result instanceof Promise)) {
      let _result = result;
      $rootScope.$broadcast('history_request'); // for ripple
      result = new Promise((resolve, reject) => setTimeout(() => resolve(_result), 150));
    } */

    let promise: Promise<boolean>;
    if(result instanceof Promise) {
      promise = result.then((result) => {
        this.log('getHistory result by maxID:', maxID, reverse, isBackLimit, result);
        
        //console.timeEnd('appImManager call getHistory');
        
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          ////console.timeEnd('render history total');
          return Promise.reject();
        }
        
        ////console.timeEnd('render history total');
        
        return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
      }, (err) => {
        this.log.error('getHistory error:', err);
        (reverse ? this.getHistoryTopPromise = undefined : this.getHistoryBottomPromise = undefined);
        return false;
      });

      (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);
    } else {
      promise = this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
      //return (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);
      //return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
    }

    /* false &&  */promise.then(() => {
      if(reverse) {
        this.loadedTopTimes++;
        this.loadedBottomTimes = Math.max(0, --this.loadedBottomTimes);
      } else {
        this.loadedBottomTimes++;
        this.loadedTopTimes = Math.max(0, --this.loadedTopTimes);
      }

      let ids: number[];
      if((reverse && this.loadedTopTimes > 2) || (!reverse && this.loadedBottomTimes > 2)) {
        ids = Object.keys(this.bubbles).map(i => +i).sort((a, b) => a - b);
      }

      this.log('getHistory: slice loadedTimes:', reverse, pageCount, this.loadedTopTimes, this.loadedBottomTimes, ids && ids.length);

      let removeCount = loadCount / 2;
      let safeCount = realLoadCount * 2;
      if(ids && ids.length > safeCount) {
        if(reverse) {
          //ids = ids.slice(-removeCount);
          //ids = ids.slice(removeCount * 2);
          ids = ids.slice(safeCount);
          this.scrolledAllDown = false;
        } else {
          //ids = ids.slice(0, removeCount);
          //ids = ids.slice(0, ids.length - (removeCount * 2));
          ids = ids.slice(0, ids.length - safeCount);
          this.scrolledAll = false;
          this.log('getHistory: slice bottom: to:', ids.length, loadCount);
        }

        this.log('getHistory: will slice ids:', ids, reverse);

        this.deleteMessagesByIDs(ids, false);
        /* ids.forEach(id => {
          this.bubbles[id].remove();
          delete this.bubbles[id];
        });

        this.deleteEmptyDateGroups(); */
      }
    });

    return promise;
  }

  public deleteEmptyDateGroups() {
    for(let i in this.dateMessages) {
      let dateMessage = this.dateMessages[i];

      if(dateMessage.container.childElementCount == 1) { // only date div
        dateMessage.container.remove();
        this.datesIntersectionObserver.unobserve(dateMessage.container);
        delete this.dateMessages[i];
      }
    }
  }
  
  public setMutedState(muted = false) {
    appSidebarRight.profileElements.notificationsCheckbox.checked = !muted;
    appSidebarRight.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';
    
    let peerID = this.peerID;
    
    this.muted = muted;
    if(peerID < 0) { // not human
      let isChannel = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID);
      if(isChannel) {
        this.btnMute.classList.remove('tgico-mute', 'tgico-unmute');
        this.btnMute.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
        this.btnMute.style.display = '';
      } else {
        this.btnMute.style.display = 'none';
      }
    } else {
      this.btnMute.style.display = 'none';
    }
    
    this.btnMenuMute.classList.remove('tgico-mute', 'tgico-unmute');
    this.btnMenuMute.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
    let rp = this.btnMenuMute.firstElementChild;
    this.btnMenuMute.innerText = muted ? 'Unmute' : 'Mute';
    this.btnMenuMute.appendChild(rp);
  }
  
  public mutePeer() {
    let inputPeer = appPeersManager.getInputPeerByID(this.peerID);
    let inputNotifyPeer = {
      _: 'inputNotifyPeer',
      peer: inputPeer
    };
    
    let settings = {
      _: 'inputPeerNotifySettings',
      flags: 0,
      mute_until: 0
    };
    
    if(!this.muted) {
      settings.flags |= 1 << 2;
      settings.mute_until = 2147483646;
    } else {
      settings.flags |= 2;
    }
    
    apiManager.invokeApi('account.updateNotifySettings', {
      peer: inputNotifyPeer,
      settings: settings
    }).then(res => {
      this.handleUpdate({_: 'updateNotifySettings', peer: inputNotifyPeer, notify_settings: settings});
    });
    
    /* return apiManager.invokeApi('account.getNotifySettings', {
      peer: inputNotifyPeer
    }).then((settings: any) => {
      settings.flags |= 2 << 1;
      settings.mute_until = 2000000000; // 2147483646
      
      return apiManager.invokeApi('account.updateNotifySettings', {
        peer: inputNotifyPeer,
        settings: Object.assign(settings, {
          _: 'inputPeerNotifySettings'
        })
      }).then(res => {
        this.log('mute result:', res);
      });
    }); */
    
  }
  
  public handleUpdate(update: any) {
    switch(update._) {
      case 'updateUserTyping':
      case 'updateChatUserTyping':
      if(this.myID == update.user_id) {
        return;
      }
      
      var peerID = update._ == 'updateUserTyping' ? update.user_id : -update.chat_id;
      this.typingUsers[update.user_id] = peerID;
      
      if(!appUsersManager.hasUser(update.user_id)) {
        if(update.chat_id && appChatsManager.hasChat(update.chat_id) && !appChatsManager.isChannel(update.chat_id)) {
          appProfileManager.getChatFull(update.chat_id);
        }
        
        //return;
      }
      
      appUsersManager.forceUserOnline(update.user_id);
      
      let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
      let currentPeer = this.peerID == peerID;
      
      if(this.typingTimeouts[peerID]) clearTimeout(this.typingTimeouts[peerID]);
      else if(dialog) {
        appDialogsManager.setTyping(dialog, appUsersManager.getUser(update.user_id));
        
        if(currentPeer) { // user
          this.setPeerStatus();
        }
      }
      
      this.typingTimeouts[peerID] = setTimeout(() => {
        this.typingTimeouts[peerID] = 0;
        delete this.typingUsers[update.user_id];
        
        if(dialog) {
          appDialogsManager.unsetTyping(dialog);
        }
        
        // лень просчитывать случаи
        this.setPeerStatus();
      }, 6000);
      break;
      
      case 'updateNotifySettings': {
        let {peer, notify_settings} = update;
        
        // peer was NotifyPeer
        peer = peer.peer;
        
        let peerID = appPeersManager.getPeerID(peer);
        
        let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
        if(dialog) {
          dialog.notify_settings = notify_settings;
        }
        
        if(peerID == this.peerID) {
          let muted = notify_settings.mute_until ? new Date(notify_settings.mute_until * 1000) > new Date() : false;
          this.setMutedState(muted);
        }
        
        /////this.log('updateNotifySettings', peerID, notify_settings);
        break;
      }
      
      case 'updateChatPinnedMessage':
      case 'updateUserPinnedMessage': {
        let {id} = update;
        
        /////this.log('updateUserPinnedMessage', update);
        
        this.pinnedMsgID = id;
        // hz nado li tut appMessagesIDsManager.getFullMessageID(update.max_id, channelID);
        let peerID = update.user_id || -update.chat_id || -update.channel_id;
        if(peerID == this.peerID) {
          appMessagesManager.wrapSingleMessage(id);
        }
        
        break;
      }
    }
  }
}

const appImManager = new AppImManager();
export default appImManager;
