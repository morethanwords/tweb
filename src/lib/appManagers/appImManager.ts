//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
import { $rootScope, numberWithCommas, findUpClassName, formatNumber, placeCaretAtEnd, findUpTag, langPack, whichChild, cancelEvent, getObjectKeysAndSort } from "../utils";
import appUsersManager from "./appUsersManager";
import appMessagesManager, { Dialog } from "./appMessagesManager";
import appPeersManager from "./appPeersManager";
import appProfileManager from "./appProfileManager";
import appDialogsManager from "./appDialogsManager";
import { RichTextProcessor } from "../richtextprocessor";
import appPhotosManager from "./appPhotosManager";
import appSidebarRight from './appSidebarRight';

import { logger, LogLevels } from "../logger";
import appMediaViewer from "./appMediaViewer";
import appSidebarLeft from "./appSidebarLeft";
import appChatsManager, { Channel, Chat } from "./appChatsManager";
import { wrapDocument, wrapPhoto, wrapVideo, wrapSticker, wrapReply, wrapAlbum, wrapPoll } from '../../components/wrappers';
import ProgressivePreloader from '../../components/preloader';
import { formatPhoneNumber, parseMenuButtonsTo } from '../../components/misc';
import { ChatInput } from '../../components/chat/input';
//import Scrollable from '../../components/scrollable';
import Scrollable from '../../components/scrollable_new';
import BubbleGroups from '../../components/bubbleGroups';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import appDocsManager from './appDocsManager';
import appForward from '../../components/appForward';
import appStickersManager from './appStickersManager';
import AvatarElement from '../../components/avatar';
import appInlineBotsManager from './AppInlineBotsManager';
import StickyIntersector from '../../components/stickyIntersector';
import { mediaSizes, touchSupport, isAndroid, isApple } from '../config';
import animationIntersector from '../../components/animationIntersector';
import PopupStickers from '../../components/popupStickers';
import PopupDatePicker from '../../components/popupDatepicker';
import appPollsManager from './appPollsManager';
import { ripple } from '../../components/ripple';
import { horizontalMenu } from '../../components/horizontalMenu';
import AudioElement from '../../components/audio';
import { InputNotifyPeer, InputPeerNotifySettings } from '../../layer';
import { ChatAudio } from '../../components/chat/audio';
import { ChatContextMenu } from '../../components/chat/contextMenu';
import { ChatSearch } from '../../components/chat/search';

//console.log('appImManager included33!');

appSidebarLeft; // just to include

const testScroll = false;

const ANIMATIONGROUP = 'chat';

export class AppImManager {
  public columnEl = document.getElementById('column-center') as HTMLDivElement;
  public btnJoin = this.columnEl.querySelector('.chat-join') as HTMLButtonElement;
  public btnMute = this.columnEl.querySelector('.chat-mute-button') as HTMLButtonElement;
  public avatarEl = document.getElementById('im-avatar') as AvatarElement;
  public titleEl = document.getElementById('im-title') as HTMLDivElement;
  public subtitleEl = document.getElementById('im-subtitle') as HTMLDivElement;
  public bubblesContainer = document.getElementById('bubbles') as HTMLDivElement;
  public chatInner = document.getElementById('bubbles-inner') as HTMLDivElement;
  public searchBtn = this.columnEl.querySelector('.chat-search-button') as HTMLButtonElement;
  public goDownBtn = this.columnEl.querySelector('#bubbles-go-down') as HTMLButtonElement;
  private getHistoryTopPromise: Promise<boolean>;
  private getHistoryBottomPromise: Promise<boolean>;
  
  public chatInputC: ChatInput;
  public chatAudio: ChatAudio;

  private menuButtons: {
    search: HTMLButtonElement
    mute: HTMLButtonElement,
    delete: HTMLButtonElement
  } = {} as any;
  
  public myID = 0;
  public peerID = 0;

  public bubbles: {[mid: string]: HTMLDivElement} = {};
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
  private pinnedMessageContainer: HTMLDivElement = null;
  
  public lazyLoadQueue = new LazyLoadQueue();
  
  public scroll: HTMLElement = null;
  public scrollable: Scrollable = null;

  public log: ReturnType<typeof logger>;
  
  private preloader: ProgressivePreloader = null;
  
  private typingTimeouts: {[peerID: number]: number} = {};
  private typingUsers: {[userID: number]: number} = {} // to peerID
  
  public topbar = document.getElementById('topbar') as HTMLDivElement;
  public chatInput = document.getElementById('chat-input') as HTMLDivElement;
  public chatInfo = this.columnEl.querySelector('.chat-info') as HTMLDivElement;
  private scrolledAll: boolean;
  private scrolledAllDown: boolean;
  
  public contextMenu = new ChatContextMenu(this.bubblesContainer);
  
  private setPeerPromise: Promise<boolean> = null;
  
  public bubbleGroups = new BubbleGroups();

  private scrolledDown = true;
  private onScrollRAF = 0;
  private isScrollingTimeout = 0;

  private unreadedObserver: IntersectionObserver = null;
  private unreaded: number[] = [];

  private loadedTopTimes = 0;
  private loadedBottomTimes = 0;

  private messagesQueuePromise: Promise<void> = null;
  private messagesQueue: {message: any, bubble: HTMLDivElement, reverse: boolean, promises: Promise<void>[]}[] = [];
  private messagesQueueOnRender: () => void = null;

  private peerChanged: boolean;
  private firstUnreadBubble: HTMLDivElement = null;
  private attachedUnreadBubble: boolean;

  private stickyIntersector: StickyIntersector = null;

  private cleanupID = 0;

  public selectTab = horizontalMenu(null, document.getElementById('main-columns'));
  private closeBtn = this.topbar.querySelector('.sidebar-close-button') as HTMLButtonElement;

  constructor() {
    this.log = logger('IM', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);
    this.chatInputC = new ChatInput();
    this.preloader = new ProgressivePreloader(null, false);
    this.selectTab(0);
    parseMenuButtonsTo(this.menuButtons, this.columnEl.querySelector('.chat-more-button').firstElementChild.children);
    
    this.chatAudio = new ChatAudio();
    this.topbar.insertBefore(this.chatAudio.container, this.chatInfo.nextElementSibling);

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

      if(!this.scrolledAllDown) {
        this.setPeer(this.peerID, 0);
      } else {
        this.renderNewMessagesByIDs([details.messageID], true);
      }
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

    $rootScope.$on('dialog_flush', (e: CustomEvent) => {
      let peerID: number = e.detail.peerID;
      if(this.peerID == peerID) {
        this.deleteMessagesByIDs(Object.keys(this.bubbles).map(m => +m));
      }
    });

    $rootScope.$on('chat_update', (e: CustomEvent) => {
      const peerID: number = e.detail;
      if(this.peerID == -peerID) {
        const chat = appChatsManager.getChat(peerID) as Channel | Chat;
        
        this.btnJoin.classList.toggle('hide', !chat?.pFlags?.left);
      }
    });
    
    // Calls when message successfully sent and we have an ID
    $rootScope.$on('message_sent', (e: CustomEvent) => {
      const {tempID, mid} = e.detail;
      
      this.log('message_sent', e.detail);

      // set cached url to media
      const message = appMessagesManager.getMessage(mid);
      if(message.media) {
        if(message.media.photo) {
          const photo = appPhotosManager.getPhoto(tempID);
          if(/* photo._ != 'photoEmpty' */photo) {
            const newPhoto = message.media.photo;
            newPhoto.downloaded = photo.downloaded;
            newPhoto.url = photo.url;
          }
        } else if(message.media.document) {
          const doc = appDocsManager.getDoc(tempID);
          if(/* doc._ != 'documentEmpty' &&  */doc?.type && doc.type != 'sticker') {
            const newDoc = message.media.document;
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
          let groupIDs = getObjectKeysAndSort(appMessagesManager.groupedMessagesStorage[message.grouped_id]);
          (Array.from(items) as HTMLElement[]).forEach((item, idx) => {
            item.dataset.mid = '' + groupIDs[idx];
          });
        }

        if(message.media?.poll) {
          const newPoll = message.media.poll;
          const pollElement = bubble.querySelector('poll-element');
          if(pollElement) {
            pollElement.setAttribute('poll-id', newPoll.id);
            pollElement.setAttribute('message-id', mid);
            delete appPollsManager.polls[tempID];
            delete appPollsManager.results[tempID];
          }
        }

        if(['audio', 'voice'].includes(message.media?.document?.type)) {
          const audio = bubble.querySelector('audio-element');
          audio.setAttribute('doc-id', message.media.document.id);
          audio.setAttribute('message-id', '' + mid);
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
      const mids: number[] = e.detail;
      
      const pinnedMessage = appMessagesManager.getPinnedMessage(this.peerID);
      mids.forEach(mid => {
        if(pinnedMessage.mid == mid) {
          (this.messagesQueuePromise || Promise.resolve()).then(() => {
            this.setPinnedMessage(pinnedMessage);
          });
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
      animationIntersector.checkAnimations(true);
      
      this.offline = $rootScope.idle.isIDLE = true;
      this.updateStatus();
      clearInterval(this.updateStatusInterval);
      
      window.addEventListener('focus', () => {
        this.offline = $rootScope.idle.isIDLE = false;
        this.updateStatus();
        this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);

        // в обратном порядке
        animationIntersector.checkAnimations(false);
      }, {once: true});
    });
    
    this.topbar.addEventListener('click', (e) => {
      const pinned: HTMLElement = findUpClassName(e.target, 'pinned-container');
      if(pinned) {
        cancelEvent(e);
        
        const mid = +pinned.dataset.mid;
        const message = appMessagesManager.getMessage(mid);

        this.setPeer(message.peerID, mid);
      } else {
        appSidebarRight.toggleSidebar(true);
      }
    });
    
    this.bubblesContainer.addEventListener('click', (e) => {
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

        for(let timestamp in this.dateMessages) {
          let d = this.dateMessages[timestamp];
          if(d.div == bubble) {
            new PopupDatePicker(new Date(+timestamp), this.onDatePick).show();
            break;
          }
        }

        return;
      }

      let contactDiv: HTMLElement = findUpClassName(target, 'contact');
      if(contactDiv) {
        this.setPeer(+contactDiv.dataset.peerID);
        return;
      }

      //this.log('chatInner click:', target);
      if(target.tagName == 'SPAN') {
        let video = (target.parentElement.querySelector('video') as HTMLElement);
        if(video) {
          video.click(); // hot-fix for time and play button
        }
        
        return;
      }

      if(bubble.classList.contains('sticker') && target.parentElement.classList.contains('attachment')) {
        const messageID = +bubble.dataset.mid;
        const message = appMessagesManager.getMessage(messageID);

        const doc = message.media?.document;

        if(doc?.stickerSetInput) {
          new PopupStickers(doc.stickerSetInput).show();
        }

        return;
      }

      if((target.tagName == 'IMG' && !target.classList.contains('emoji') && target.parentElement.tagName != "AVATAR-ELEMENT") 
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

        appMediaViewer.openMedia(message, targets[idx].element, true, 
          this.scroll.parentElement, targets.slice(0, idx), targets.slice(idx + 1)/* , !message.grouped_id */);
        
        //appMediaViewer.openMedia(message, target as HTMLImageElement);
      }
      
      if(['IMG', 'DIV', "AVATAR-ELEMENT"].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');
      
      if(target.tagName == 'DIV' || target.tagName == "AVATAR-ELEMENT") {
        if(target.classList.contains('goto-original')) {
          let savedFrom = bubble.dataset.savedFrom;
          let splitted = savedFrom.split('_');
          let peerID = +splitted[0];
          let msgID = +splitted[1];
          ////this.log('savedFrom', peerID, msgID);
          this.setPeer(peerID, msgID);
          return;
        } else if(target.classList.contains('forward')) {
          const mid = +bubble.dataset.mid;
          appForward.init([mid]);
          return;
        } else if(target.classList.contains('name')) {
          let peerID = +target.dataset.peerID;
          
          if(!isNaN(peerID)) {
            this.setPeer(peerID);
          }
          
          return;
        } else if(target.tagName == "AVATAR-ELEMENT") {
          let peerID = +target.getAttribute('peer');
          
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
      } else if(target.tagName == 'IMG' && target.parentElement.tagName == "AVATAR-ELEMENT") {
        let peerID = +target.parentElement.getAttribute('peer');
        
        if(!isNaN(peerID)) {
          this.setPeer(peerID);
        }
      }
      
      //console.log('chatInner click', e);
    });

    this.closeBtn.addEventListener('click', (e) => {
      cancelEvent(e);
      this.setPeer(0);
    });
    
    this.searchBtn.addEventListener('click', (e) => {
      cancelEvent(e);
      if(this.peerID) {
        appSidebarRight.beginSearch();
      }
    });

    this.btnMute.addEventListener('click', (e) => {
      cancelEvent(e);
      this.mutePeer(this.peerID);
    });

    this.btnJoin.addEventListener('click', (e) => {
      cancelEvent(e);

      this.btnJoin.setAttribute('disabled', 'true');
      appChatsManager.joinChannel(-this.peerID).finally(() => {
        this.btnJoin.removeAttribute('disabled');
      });
    });
    
    this.menuButtons.mute.addEventListener('click', (e) => {
      this.mutePeer(this.peerID);
    });

    this.menuButtons.search.addEventListener('click', (e) => {
      new ChatSearch();
    });
    
    let onKeyDown = (e: KeyboardEvent) => {
      let target = e.target as HTMLElement;
      
      //if(target.tagName == 'INPUT') return;
      
      //this.log('onkeydown', e);
      
      if(this.chatInputC.attachMediaPopUp.container.classList.contains('active')) {
        if(target.tagName != 'INPUT') {
          this.chatInputC.attachMediaPopUp.captionInput.focus();
        }
        
        if(e.key == 'Enter' && !touchSupport) {
          this.chatInputC.attachMediaPopUp.sendBtn.click();
        } else if(e.key == 'Escape') {
          this.chatInputC.attachMediaPopUp.container.classList.remove('active');
        }
        
        return;
      }
      
      if(e.key == 'Escape') {
        if(appMediaViewer.wholeDiv.classList.contains('active')) {
          appMediaViewer.buttons.close.click();
        } else if(appForward.container.classList.contains('active')) {
          appForward.close();
        } else if(this.chatInputC.replyElements.container.classList.contains('active')) {
          this.chatInputC.replyElements.cancelBtn.click();
        } else if(this.peerID != 0) { // hide current dialog
          this.setPeer(0);
        }
      } else if(e.key == 'Meta' || e.key == 'Control') {
        return;
      } else if(e.code == "KeyC" && (e.ctrlKey || e.metaKey) && target.tagName != 'INPUT') {
        return;
      }
      
      if(e.target != this.chatInputC.messageInput && target.tagName != 'INPUT') {
        this.chatInputC.messageInput.focus();
        placeCaretAtEnd(this.chatInputC.messageInput);
      }
    };
    
    document.body.addEventListener('keydown', onKeyDown);
    
    this.goDownBtn.addEventListener('click', () => {
      let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
      
      if(dialog) {
        this.setPeer(this.peerID/* , dialog.top_message */);
      } else {
        this.log('will scroll down 3');
        this.scroll.scrollTop = this.scroll.scrollHeight;
      }
    });
    
    this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
    this.updateStatus();
    setInterval(() => this.setPeerStatus(), 60e3);
    
    this.setScroll();
    //apiUpdatesManager.attach();

    this.stickyIntersector = new StickyIntersector(this.scrollable.container, (stuck, target) => {
      for(let timestamp in this.dateMessages) {
        let dateMessage = this.dateMessages[timestamp];
        if(dateMessage.container == target) {
          dateMessage.div.classList.toggle('is-sticky', stuck);
          break;
        }
      }
    });

    this.unreadedObserver = new IntersectionObserver((entries) => {
      if(this.offline) {
        return;
      }

      let readed: number[] = [];
    
      entries.forEach(entry => {
        if(entry.isIntersecting) {
          let target = entry.target as HTMLElement;
          let mid = +target.dataset.mid;
          readed.push(mid);
          this.unreadedObserver.unobserve(target);
          this.unreaded.findAndSplice(id => id == mid);
        }
      });

      if(readed.length) {
        let max = Math.max(...readed);

        let length = readed.length;
        for(let i = this.unreaded.length - 1; i >= 0; --i) {
          let mid = this.unreaded[i];
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
        /* false && */ appMessagesManager.readHistory(this.peerID, max, length).catch((err: any) => {
          this.log.error('readHistory err:', err);
          appMessagesManager.readHistory(this.peerID, max, length);
        });
      }
    });
  }

  onDatePick = (timestamp: number) => {
    const peerID = this.peerID;
    appMessagesManager.requestHistory(peerID, 0, 2, -1, timestamp).then(history => {
      if(!history?.messages?.length) {
        this.log.error('no history!');
        return;
      } else if(this.peerID != peerID) {
        return;
      }

      appImManager.setPeer(this.peerID, history.messages[0].mid);
      //console.log('got history date:', history);
    });
  };

  public setPinnedMessage(message: any) {
    /////this.log('setting pinned message', message);
    //return;
    const height = 52;
    const scrollTop = this.scrollable.container.scrollTop;
    const newPinned = wrapReply('Pinned Message', message.message, message, true);
    newPinned.dataset.mid = '' + message.mid;
    newPinned.classList.add('pinned-container');

    const close = document.createElement('button');
    close.classList.add('pinned-message-close', 'btn-icon', 'tgico-close');
    close.addEventListener('click', (e) => {
      cancelEvent(e);
      const scrollTop = this.scrollable.scrollTop;
      newPinned.remove();
      this.topbar.classList.remove('is-pinned-shown');

      this.pinnedMessageContainer = null;
      this.scrollable.scrollTop = scrollTop - height;
    }, {once: true});
    newPinned.append(close);

    this.topbar.insertBefore(newPinned, this.btnJoin);
    this.topbar.classList.add('is-pinned-shown');

    if(this.pinnedMessageContainer) {
      this.pinnedMessageContainer.remove();
    }
    
    this.pinnedMessageContainer = newPinned;
    //this.pinnedMessageContent.innerHTML = message.rReply;
    this.scrollable.scrollTop = scrollTop + height;
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

  public loadMoreHistory(top: boolean, justLoad = false) {
    //this.log('loadMoreHistory', top);
    if(!this.peerID || testScroll || this.setPeerPromise || (top && this.getHistoryTopPromise) || (!top && this.getHistoryBottomPromise)) return;

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
    
    let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
    
    // if scroll down after search
    if(!top && (!dialog || history.indexOf(dialog.top_message) === -1)) {
      this.log('Will load more (down) history by maxID:', history[history.length - 1], history);
      /* false &&  */this.getHistory(history[history.length - 1], false, true, undefined, justLoad);
    }
  }
  
  public onScroll(e: Event) {
    if(this.onScrollRAF) window.cancelAnimationFrame(this.onScrollRAF);

    //if(this.scrollable.scrollLocked) return;

    this.onScrollRAF = window.requestAnimationFrame(() => {
      //lottieLoader.checkAnimations(false, 'chat');

      if(!touchSupport) {
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
      
      if(this.scroll.scrollHeight - Math.round(this.scroll.scrollTop + this.scroll.offsetHeight) <= 1/* <= 5 */) {
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
    this.scrollable = new Scrollable(this.bubblesContainer, 'y', 'IM', this.chatInner, 300);

    /* const getScrollOffset = () => {
      //return Math.round(Math.max(300, appPhotosManager.windowH / 1.5));
      return 300; 
    };

    window.addEventListener('resize', () => {
      this.scrollable.onScrollOffset = getScrollOffset();
    });

    this.scrollable = new Scrollable(this.bubblesContainer, 'y', 'IM', this.chatInner, getScrollOffset()); */
    this.scroll = this.scrollable.container;
    
    this.bubblesContainer.append(this.goDownBtn);
    
    this.scrollable.onScrolledTop = () => this.loadMoreHistory(true);
    this.scrollable.onScrolledBottom = () => this.loadMoreHistory(false);
    //this.scrollable.attachSentinels(undefined, 300);

    this.scroll.addEventListener('scroll', this.onScroll.bind(this));
    this.scroll.parentElement.classList.add('scrolled-down');

    if(touchSupport) {
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

      appProfileManager.getChatFull(chat.id).then((chatInfo: any) => {
        this.log('chatInfo res:', chatInfo);

        let participants_count = chatInfo.participants_count || (chatInfo.participants && chatInfo.participants.participants && chatInfo.participants.participants.length);
        if(participants_count) {
          let subtitle = numberWithCommas(participants_count) + ' ' + (isChannel ? 'followers' : 'members');

          this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = subtitle;

          if(participants_count < 2) return;
          appChatsManager.getOnlines(chat.id).then(onlines => {
            if(onlines > 1) {
              subtitle += ', ' + numberWithCommas(onlines) + ' online';
            }
  
            this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = subtitle;
          });
        }
      });
    } else if(!appUsersManager.isBot(this.peerID)) { // user
      let user = appUsersManager.getUser(this.peerID);
      
      if(this.myID == this.peerID) {
        this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = '';
      } else if(user && user.status) {
        let subtitle = appUsersManager.getUserStatusString(user.id);

        if(subtitle == 'online') {
          this.subtitleEl.classList.add('online');
          appSidebarRight.profileElements.subtitle.classList.add('online');
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
    } else {
      this.subtitleEl.innerText = 'bot';
      appSidebarRight.profileElements.subtitle.innerText = 'bot';
    }
  }
  
  public cleanup(bubblesToo = false) {
    ////console.time('appImManager cleanup');
    this.scrolledAll = false;
    this.scrolledAllDown = false;

    this.bubbles = {};
    this.dateMessages = {};
    this.bubbleGroups.cleanup();
    this.unreadOut.clear();
    this.needUpdate.length = 0;
    //this.lazyLoadQueue.clear();
    
    // clear input 
    this.chatInputC.messageInput.innerHTML = '';
    this.chatInputC.replyElements.cancelBtn.click();

    // clear messages
    if(bubblesToo) {
      this.scrollable.container.innerHTML = '';
    }

    this.peerChanged = false;
    this.firstUnreadBubble = null;
    this.attachedUnreadBubble = false;

    this.messagesQueue.length = 0;
    this.messagesQueuePromise = null;

    this.getHistoryTopPromise = this.getHistoryBottomPromise = undefined;

    this.stickyIntersector.disconnect();
    
    this.unreadedObserver.disconnect();
    this.unreaded.length = 0;

    this.loadedTopTimes = this.loadedBottomTimes = 0;

    this.cleanupID++;

    ////console.timeEnd('appImManager cleanup');
  }

  private findMountedBubbleByMsgID(mid: number) {
    return this.bubbles[getObjectKeysAndSort(this.bubbles).find(id => {
      if(id < mid) return false;
      return !!this.bubbles[id]?.parentElement;
    })];
  }
  
  public setPeer(peerID: number, lastMsgID?: number) {
    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(peerID == 0) {
      appSidebarRight.toggleSidebar(false);
      this.topbar.style.display = this.chatInput.style.display = this.goDownBtn.style.display = 'none';
      this.cleanup(true);
      this.peerID = $rootScope.selectedPeerID = 0;
      $rootScope.$broadcast('peer_changed', this.peerID);
      if(mediaSizes.isMobile) {
        this.selectTab(0);
      }
      return false;
    }
    
    const samePeer = this.peerID == peerID;
    
    if(this.setPeerPromise && samePeer) return this.setPeerPromise;

    const dialog = appMessagesManager.getDialogByPeerID(peerID)[0] || null;
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
      if(this.bubbles[lastMsgID]) {
        if(isTarget) {
          const bubble = this.findMountedBubbleByMsgID(lastMsgID);
          this.scrollable.scrollIntoView(bubble);
          this.highlightBubble(bubble);
        } else if(dialog && lastMsgID == topMessage) {
          this.log('will scroll down', this.scroll.scrollTop, this.scroll.scrollHeight);
          this.scroll.scrollTop = this.scroll.scrollHeight;
        }
        
        return true;
      }
    } else {
      appSidebarRight.searchCloseBtn.click();
    }

    // set new
    this.peerID = $rootScope.selectedPeerID = peerID;

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
    this.chatInner.id = 'bubbles-inner';
    this.scrollable.appendTo = this.chatInner;
    this.chatInner.className = oldChatInner.className;
    this.chatInner.classList.add('disable-hover', 'is-scrolling');

    if(!samePeer) {
      this.lazyLoadQueue.clear();
    }

    this.lazyLoadQueue.lock();

    const {promise, cached} = this.getHistory(lastMsgID, true, isJump, additionMsgID);

    if(!samePeer) {
      appSidebarRight.setPeer(this.peerID);
    } else {
      this.peerChanged = true;
    }

    // clear 
    if(!cached) {
      this.scrollable.container.innerHTML = '';
      //oldChatInner.remove();

      if(!samePeer) {
        this.finishPeerChange();
      }

      this.preloader.attach(this.bubblesContainer);

      if(mediaSizes.isMobile) {
        this.selectTab(1);
      }
    }

    //console.timeEnd('appImManager setPeer pre promise');
    
    animationIntersector.lockGroup(ANIMATIONGROUP);
    this.setPeerPromise = Promise.all([
      promise.then(() => {
        ////this.log('setPeer removing preloader');

        if(cached) {
          this.scrollable.container.innerHTML = '';
          //oldChatInner.remove();

          if(!samePeer) {
            this.finishPeerChange();
          }

          if(mediaSizes.isMobile) {
            this.selectTab(1);
          }
        } else {
          this.preloader.detach();
        }

        this.scrollable.container.append(this.chatInner);
        animationIntersector.unlockGroup(ANIMATIONGROUP);
        animationIntersector.checkAnimations(false, ANIMATIONGROUP/* , true */);
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
            bubble = this.findMountedBubbleByMsgID(lastMsgID);
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
          appMessagesManager.readHistory(peerID, dialog.top_message);
        }

        if(dialog?.pFlags?.unread_mark) {
          appMessagesManager.markDialogUnread(peerID, true);
        }

        this.chatInner.classList.remove('disable-hover', 'is-scrolling'); // warning, performance!

        //console.timeEnd('appImManager setPeer');

        return true;
      }).catch(err => {
        this.log.error('getHistory promise error:', err);
        throw err;
      })
    ]).catch(err => {
      this.log.error('setPeer promises error:', err);
      this.preloader.detach();
      //oldChatInner.remove();
      return false;
    }).then(res => {
      if(this.peerID == peerID) {
        this.setPeerPromise = null;
      }

      return !!res;
    });

    //if(this.messagesQueuePromise) {
      //appSidebarRight.setLoadMutex(this.setPeerPromise);
    //}

    appSidebarRight.setLoadMutex(this.setPeerPromise);
    appSidebarRight.loadSidebarMedia(true);

    return this.setPeerPromise;
  }

  public finishPeerChange() {
    if(this.peerChanged) return;

    let peerID = this.peerID;
    this.peerChanged = true;

    this.avatarEl.setAttribute('peer', '' + this.peerID);
    this.avatarEl.update();

    const isAnyGroup = appPeersManager.isAnyGroup(peerID);
    const isChannel = appPeersManager.isChannel(peerID);
    const hasRights = isChannel && appChatsManager.hasRights(-peerID, 'send');
    this.chatInner.classList.toggle('has-rights', hasRights);

    this.chatInput.style.display = !isChannel || hasRights ? '' : 'none';

    this.topbar.classList.remove('is-pinned-shown');
    this.topbar.style.display = '';

    this.chatInner.classList.toggle('is-chat', isAnyGroup || peerID == this.myID);
    this.chatInner.classList.toggle('is-channel', isChannel);

    this.btnMute.classList.toggle('hide', !appPeersManager.isBroadcast(peerID));
    this.btnJoin.classList.toggle('hide', !appChatsManager.getChat(-this.peerID)?.pFlags?.left);
    
    this.menuButtons.mute.style.display = this.myID == this.peerID ? 'none' : '';

    const pinned = appMessagesManager.getPinnedMessage(peerID);
    if(pinned && !pinned.deleted) {
      this.setPinnedMessage(pinned);
    } else if(this.pinnedMessageContainer) {
      this.pinnedMessageContainer.remove();
      this.pinnedMessageContainer = null;
    }

    window.requestAnimationFrame(() => {
      let title = '';
      if(this.peerID == this.myID) title = 'Saved Messages';
      else title = appPeersManager.getPeerTitle(this.peerID);
      this.titleEl.innerHTML = appSidebarRight.profileElements.name.innerHTML = title;

      this.goDownBtn.style.display = '';

      this.setPeerStatus(true);
    });

    appSidebarRight.fillProfileElements();

    $rootScope.$broadcast('peer_changed', this.peerID);
  }
  
  public updateUnreadByDialog(dialog: Dialog) {
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
  
  public deleteMessagesByIDs(msgIDs: number[]) {
    msgIDs.forEach(id => {
      if(!(id in this.bubbles)) return;
      
      let bubble = this.bubbles[id];
      delete this.bubbles[id];

      if(this.firstUnreadBubble == bubble) {
        this.firstUnreadBubble = null;
      }

      this.bubbleGroups.removeBubble(bubble, id);
      this.unreadedObserver.unobserve(bubble);
      //this.unreaded.findAndSplice(mid => mid == id);
      this.scrollable.removeElement(bubble);
      //bubble.remove();
    });
    
    animationIntersector.checkAnimations(false, ANIMATIONGROUP);
    this.deleteEmptyDateGroups();
  }
  
  public renderNewMessagesByIDs(msgIDs: number[], scrolledDown = this.scrolledDown) {
    if(!this.scrolledAllDown) { // seems search active or sliced
      this.log('seems search is active, skipping render:', msgIDs);
      return;
    }
    
    msgIDs.forEach((msgID: number) => {
      let message = appMessagesManager.getMessage(msgID);
      
      /////////this.log('got new message to append:', message);
      
      //this.unreaded.push(msgID);
      this.renderMessage(message);
    });
    
    //if(scrolledDown) this.scrollable.scrollTop = this.scrollable.scrollHeight;
    if(this.messagesQueuePromise && scrolledDown) {
      this.scrollable.scrollTo(this.scrollable.scrollHeight - 1, false, true);
      this.messagesQueuePromise.then(() => {
        this.log('messagesQueuePromise after:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        this.scrollable.scrollTo(this.scrollable.scrollHeight, true, true);

        setTimeout(() => {
          this.log('messagesQueuePromise afterafter:', this.chatInner.childElementCount, this.scrollable.scrollHeight);
        }, 10);
      });
    }
  }

  public highlightBubble(element: HTMLElement) {
    if(element.dataset.timeout) {
      clearTimeout(+element.dataset.timeout);
      element.classList.remove('is-selected');
      void element.offsetWidth; // reflow
    }

    element.classList.add('is-selected');
    element.dataset.timeout = '' + setTimeout(() => {
      element.classList.remove('is-selected');
      delete element.dataset.timeout;
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
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
        this.scrollable.prepend(container, false);
      } else {
        this.scrollable.append(container, false);
      }

      this.stickyIntersector.observeStickyHeaderChanges(container);
    }

    return this.dateMessages[dateTimestamp];
  }

  public renderMessagesQueue(message: any, bubble: HTMLDivElement, reverse: boolean) {
    /* let dateMessage = this.getDateContainerByMessage(message, reverse);
    if(reverse) dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
    else dateMessage.container.append(bubble);
    return; */

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
          let chatInner = this.chatInner;
          let queue = this.messagesQueue.slice();
          this.messagesQueue.length = 0;

          let promises = queue.reduce((acc, {promises}) => acc.concat(promises), []);
          //console.log('promises to call', promises, queue);
          Promise.all(promises).then(() => {
            if(this.chatInner != chatInner) {
              //this.log.warn('chatInner changed!', this.chatInner, chatInner);
              return reject('chatInner changed!');
            }

            if(this.messagesQueueOnRender) {
              this.messagesQueueOnRender();
            }

            queue.forEach(({message, bubble, reverse}) => {
              let dateMessage = this.getDateContainerByMessage(message, reverse);
              if(reverse) {
                dateMessage.container.insertBefore(bubble, dateMessage.div.nextSibling);
                //this.scrollable.prepareElement(bubble, false);
              } else {
                dateMessage.container.append(bubble);
                //this.scrollable.prepareElement(bubble, true);
              }
            });

            resolve();
            this.messagesQueuePromise = null;
          }, reject);
        }, 0);
      });
    }
  }

  private getMiddleware() {
    let cleanupID = this.cleanupID;
    return () => {
      return this.cleanupID == cleanupID;
    };
  }
  
  // reverse means top
  public renderMessage(message: any, reverse = false, multipleRender = false, bubble: HTMLDivElement = null, updatePosition = true) {
    this.log.debug('message to render:', message);
    //return;
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
      bubbleContainer.style.marginBottom = '';

      if(bubble == this.firstUnreadBubble) {
        bubble.classList.add('is-first-unread');
      }
      //bubble.innerHTML = '';
    }

    bubble.dataset.mid = message.mid;

    if(message._ == 'messageService') {
      let action = message.action;
      let _ = action._;
      if(langPack.hasOwnProperty(_) && !langPack[_]) {
        return bubble;
      }

      bubble.className = 'bubble service';

      let title = appPeersManager.getPeerTitle(message.fromID);
      let name = document.createElement('div');
      name.classList.add('name');
      name.dataset.peerID = message.fromID;
      name.innerHTML = title;

      let str = '';
      if(action.message) {
        str = RichTextProcessor.wrapRichText(action.message, {noLinebreaks: true});
      } else {
        if(_ == "messageActionPhoneCall") {
          _ += '.' + action.type;
        }
  
        // @ts-ignore
        let l = langPack[_];
        if(!l) {
          l = '[' + _ + ']';
        }

        str = l[0].toUpperCase() == l[0] ? l : (name.innerText ? name.outerHTML + ' ' : '') + l;
      }
      
      bubbleContainer.innerHTML = `<div class="service-msg">${str}</div>`;

      if(updatePosition) {
        this.renderMessagesQueue(message, bubble, reverse);
      }

      return bubble;
    }
    
    // time section
    
    let date = new Date(message.date * 1000);
    let time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);
    
    if(message.views) {
      bubble.classList.add('channel-post');
      time = formatNumber(message.views, 1) + ' <i class="tgico-channelviews"></i> ' + time;

      if(!message.savedFrom) {
        let forward = document.createElement('div');
        forward.classList.add('bubble-beside-button', 'forward');
        forward.innerHTML = `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
          <defs>
            <path d="M13.55 3.24L13.64 3.25L13.73 3.27L13.81 3.29L13.9 3.32L13.98 3.35L14.06 3.39L14.14 3.43L14.22 3.48L14.29 3.53L14.36 3.59L14.43 3.64L22.23 10.85L22.36 10.99L22.48 11.15L22.57 11.31L22.64 11.48L22.69 11.66L22.72 11.85L22.73 12.04L22.71 12.22L22.67 12.41L22.61 12.59L22.53 12.76L22.42 12.93L22.29 13.09L22.23 13.15L14.43 20.36L14.28 20.48L14.12 20.58L13.95 20.66L13.77 20.72L13.58 20.76L13.4 20.77L13.22 20.76L13.03 20.73L12.85 20.68L12.68 20.61L12.52 20.52L12.36 20.4L12.22 20.27L12.16 20.2L12.1 20.13L12.05 20.05L12.01 19.98L11.96 19.9L11.93 19.82L11.89 19.73L11.87 19.65L11.84 19.56L11.83 19.47L11.81 19.39L11.81 19.3L11.8 19.2L11.8 16.42L11 16.49L10.23 16.58L9.51 16.71L8.82 16.88L8.18 17.09L7.57 17.33L7.01 17.6L6.48 17.91L5.99 18.26L5.55 18.64L5.14 19.05L4.77 19.51L4.43 19.99L4.29 20.23L4.21 20.35L4.11 20.47L4 20.57L3.88 20.65L3.75 20.72L3.62 20.78L3.48 20.82L3.33 20.84L3.19 20.84L3.04 20.83L2.9 20.79L2.75 20.74L2.62 20.68L2.53 20.62L2.45 20.56L2.38 20.5L2.31 20.43L2.25 20.36L2.2 20.28L2.15 20.19L2.11 20.11L2.07 20.02L2.04 19.92L2.02 19.83L2.01 19.73L2 19.63L2.04 17.99L2.19 16.46L2.46 15.05L2.85 13.75L3.35 12.58L3.97 11.53L4.7 10.6L5.55 9.8L6.51 9.12L7.59 8.56L8.77 8.13L10.07 7.83L11.48 7.65L11.8 7.63L11.8 4.8L11.91 4.56L12.02 4.35L12.14 4.16L12.25 3.98L12.37 3.82L12.48 3.68L12.61 3.56L12.73 3.46L12.85 3.38L12.98 3.31L13.11 3.27L13.24 3.24L13.37 3.23L13.46 3.23L13.55 3.24Z" id="b13RmHDQtl"></path>
          </defs>
          <use xlink:href="#b13RmHDQtl" opacity="1" fill="#fff" fill-opacity="1"></use>
        </svg>`;
        bubbleContainer.append(forward);
        bubble.classList.add('with-beside-button');
      }
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
    
    let messageMedia = message.media;

    if(totalEntities && !messageMedia) {
      let emojiEntities = totalEntities.filter((e: any) => e._ == 'messageEntityEmoji');
      let strLength = messageMessage.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
      
      if(emojiStrLength == strLength && emojiEntities.length <= 3) {
        let sticker = appStickersManager.getAnimatedEmojiSticker(messageMessage);
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
    
    timeSpan.appendChild(timeInner);
    messageDiv.append(timeSpan);
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
              const from = appUsersManager.getUser(message.fromID);
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

      containerDiv.addEventListener('click', (e) => {
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
        appInlineBotsManager.callbackButtonClick(message.mid, button);
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
    } else {
      //this.log('not our message', message, message.pFlags.unread);
      if(message.pFlags.unread) {
        this.unreadedObserver.observe(bubble); 
        if(!this.unreaded.indexOf(message.mid)) {
          this.unreaded.push(message.mid);
        }
      }
    }

    const isOut = our && (!message.fwd_from || this.peerID != this.myID);
    
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
                const photo = appPhotosManager.getPhoto(message.id);
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
                let doc = appDocsManager.getDoc(message.id);
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
                  group: ANIMATIONGROUP
                });

                preloader.attach(attachmentDiv, false);
                bubble.classList.add('hide-name', 'video');
              //}
              break;
            }
            
            case 'audio':
            case 'voice':
            case 'document': {
              const doc = appDocsManager.getDoc(message.id);
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
          let photo = messageMedia.photo;
          ////////this.log('messageMediaPhoto', photo);
          
          bubble.classList.add('hide-name', 'photo');
          const tailSupported = !isAndroid;
          if(tailSupported) bubble.classList.add('with-media-tail');

          if(message.grouped_id) {
            bubble.classList.add('is-album');

            let storage = appMessagesManager.groupedMessagesStorage[message.grouped_id];
            if(Object.keys(storage).length != 1) {
              wrapAlbum({
                groupID: message.grouped_id, 
                attachmentDiv,
                middleware: this.getMiddleware(),
                isOut: our,
                lazyLoadQueue: this.lazyLoadQueue
              });

              break;
            }
          }

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
          box.classList.add('box', 'web');
          
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
                group: ANIMATIONGROUP
              });
              //}
            } else {
              doc = null;
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

          if(webpage.title) {
            let titleDiv = document.createElement('div');
            titleDiv.classList.add('title');
            titleDiv.innerHTML = RichTextProcessor.wrapRichText(webpage.title);
            quoteTextDiv.append(titleDiv);
          }

          if(webpage.description) {
            let textDiv = document.createElement('div');
            textDiv.classList.add('text');
            textDiv.innerHTML = RichTextProcessor.wrapRichText(webpage.description);
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
            appPhotosManager.setAttachmentSize(doc, attachmentDiv, size, size, true);
            //let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubbleContainer.style.height = attachmentDiv.style.height;
            bubbleContainer.style.width = attachmentDiv.style.width;
            //appPhotosManager.setAttachmentSize(doc, bubble);
            wrapSticker({
              doc, 
              div: attachmentDiv,
              middleware: this.getMiddleware(),
              lazyLoadQueue: this.lazyLoadQueue,
              group: ANIMATIONGROUP,
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
            if(message.grouped_id) {
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
                group: ANIMATIONGROUP
              });
            }
            
            break;
          } else if(doc.mime_type == 'audio/ogg') {
            let docDiv = wrapDocument(doc, false, false, message.mid);
            
            bubble.classList.remove('is-message-empty');
            
            bubble.classList.add('bubble-audio');
            messageDiv.append(docDiv);
            processingWebPage = true;
            
            break;
          } else {
            let docDiv = wrapDocument(doc, false, false, message.mid);
            
            bubble.classList.remove('is-message-empty');
            messageDiv.append(docDiv);
            messageDiv.classList.add((doc.type || 'document') + '-message');
            processingWebPage = true;
            
            break;
          }

          break;
        }

        case 'messageMediaContact': {
          //this.log('wrapping contact', message);

          let contactDiv = document.createElement('div');
          contactDiv.classList.add('contact');
          contactDiv.dataset.peerID = '' + messageMedia.user_id;

          messageDiv.classList.add('contact-message');
          processingWebPage = true;

          let texts = [];
          if(message.media.first_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.first_name));
          if(message.media.last_name) texts.push(RichTextProcessor.wrapEmojiText(message.media.last_name));

          contactDiv.innerHTML = `
            <div class="contact-details">
              <div class="contact-name">${texts.join(' ')}</div>
              <div class="contact-number">${message.media.phone_number ? '+' + formatPhoneNumber(message.media.phone_number).formatted : 'Unknown phone number'}</div>
            </div>`;

          let avatarElem = new AvatarElement();
          avatarElem.setAttribute('peer', '' + message.media.user_id);
          avatarElem.classList.add('contact-avatar');

          contactDiv.prepend(avatarElem);

          bubble.classList.remove('is-message-empty');
          messageDiv.append(contactDiv);

          break;
        }

        case 'messageMediaPoll': {
          bubble.classList.remove('is-message-empty');
          
          let pollElement = wrapPoll(message.media.poll.id, message.mid);
          messageDiv.prepend(pollElement);

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
      let title = appPeersManager.getPeerTitle(message.fwdFromID || message.fromID);

      const isForwardFromChannel = !message.fromID && message.fwd_from;
      
      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(isHidden) {
        ///////this.log('message to render hidden', message);
        title = RichTextProcessor.wrapEmojiText(message.fwd_from.from_name);
        //title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      }
      
      //this.log(title);
      
      if((message.fwdFromID || message.fwd_from)) {
        if(this.peerID != this.myID) {
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

          if(this.peerID == this.myID || isForwardFromChannel) {
            nameDiv.style.color = appPeersManager.getPeerColorByID(message.fwdFromID, false);
            nameDiv.innerHTML = title;
          } else {
            nameDiv.innerHTML = 'Forwarded from ' + title;
          }
          
          bubbleContainer.append(nameDiv);
        }
      } else {
        if(message.reply_to_mid) {
          let originalMessage = appMessagesManager.getMessage(message.reply_to_mid);
          let originalPeerTitle = appPeersManager.getPeerTitle(originalMessage.fromID || originalMessage.fwdFromID, true) || '';
          
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
          
          bubbleContainer.append(wrapReply(originalPeerTitle, originalMessage.message || '', originalMessage));
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
      
      if((!our && this.peerID < 0 && (!appPeersManager.isChannel(this.peerID) || appPeersManager.isMegagroup(this.peerID))) 
        || (this.peerID == this.myID && !message.reply_to_mid)) {
        let avatarElem = new AvatarElement();
        avatarElem.classList.add('user-avatar');

        if(!message.fromID && message.fwd_from && message.fwd_from.from_name) {
          avatarElem.setAttribute('peer-title', message.fwd_from.from_name);
        }

        avatarElem.setAttribute('peer', '' + (((message.fwd_from && this.peerID == this.myID) || isForwardFromChannel ? message.fwdFromID : message.fromID) || 0));
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

  public performHistoryResult(history: number[], reverse: boolean, isBackLimit: boolean, additionMsgID: number) {
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

    let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
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
      let method = (reverse ? history.shift : history.pop).bind(history);

      let realLength = this.scrollable.length;
      let previousScrollHeightMinusTop: number;
      if(realLength > 0 && reverse) { // for safari need set when scrolling bottom too
        this.messagesQueueOnRender = () => {
          let scrollTop = this.scrollable.scrollTop;

          previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
          //this.chatInner.style.height = '100%';
          //previousScrollHeightMinusTop = 0;
          /* if(reverse) {
            previousScrollHeightMinusTop = this.scrollable.scrollHeight - scrollTop;
          } else {
            previousScrollHeightMinusTop = scrollTop;
          } */

          this.log('performHistoryResult: messagesQueueOnRender, scrollTop:', scrollTop, previousScrollHeightMinusTop);
          this.messagesQueueOnRender = undefined;
        };
      }

      while(history.length) {
        let message = appMessagesManager.getMessage(method());
        this.renderMessage(message, reverse, true);
      }

      (this.messagesQueuePromise || Promise.resolve()).then(() => {
        if(previousScrollHeightMinusTop !== undefined) {
          const newScrollTop = reverse ? this.scrollable.scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
          this.log('performHistoryResult: will set scrollTop', this.scrollable.scrollHeight, newScrollTop, this.scrollable.container.clientHeight);

          // touchSupport for safari iOS
          touchSupport && isApple && (this.scrollable.container.style.overflow = 'hidden');
          this.scrollable.scrollTop = newScrollTop;
          touchSupport && isApple && (this.scrollable.container.style.overflow = '');
        }

        resolve(true);
      }, reject);
    }).then(() => {
      //console.timeEnd('appImManager render history');

      return true;
    });
  }

  // reverse means scroll up
  public getHistory(maxID = 0, reverse = false, isBackLimit = false, additionMsgID = 0, justLoad = false): {cached: boolean, promise: Promise<boolean>} {
    const peerID = this.peerID;

    //console.time('appImManager call getHistory');
    const pageCount = appPhotosManager.windowH / 38/*  * 1.25 */ | 0;
    //const loadCount = Object.keys(this.bubbles).length > 0 ? 50 : pageCount;
    const realLoadCount = Object.keys(this.bubbles).length > 0 ? Math.max(40, pageCount) : pageCount;//const realLoadCount = 50;
    let loadCount = realLoadCount;
    
    if(testScroll) {
      //loadCount = 1;
      if(Object.keys(this.bubbles).length > 0)
      return {cached: false, promise: Promise.resolve(true)};
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

    const result = appMessagesManager.getHistory(this.peerID, maxID, loadCount, backLimit);

    let promise: Promise<boolean>, cached: boolean;
    if(result instanceof Promise) {
      cached = false;
      promise = result.then((result) => {
        this.log('getHistory not cached result by maxID:', maxID, reverse, isBackLimit, result, peerID, justLoad);
        
        if(justLoad) {
          this.scrollable.onScroll(); // нужно делать из-за ранней прогрузки
          return true;
        }
        //console.timeEnd('appImManager call getHistory');
        
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          ////console.timeEnd('render history total');
          return Promise.reject();
        }
        
        ////console.timeEnd('render history total');
        
        return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID);
      }, (err) => {
        this.log.error('getHistory error:', err);
        return false;
      });
    } else if(justLoad) {
      return null;
    } else {
      cached = true;
      this.log('getHistory cached result by maxID:', maxID, reverse, isBackLimit, result, peerID, justLoad);
      promise = this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID);
      //return (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);
      //return this.performHistoryResult(result.history || [], reverse, isBackLimit, additionMsgID, true);
    }

    (reverse ? this.getHistoryTopPromise = promise : this.getHistoryBottomPromise = promise);

    promise.finally(() => {
      (reverse ? this.getHistoryTopPromise = undefined : this.getHistoryBottomPromise = undefined);
    });

    if(justLoad) {
      return null;
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
        ids = getObjectKeysAndSort(this.bubbles);
      }

      //let removeCount = loadCount / 2;
      const safeCount = realLoadCount * 2; // cause i've been runningrunningrunning all day
      this.log('getHistory: slice loadedTimes:', reverse, pageCount, this.loadedTopTimes, this.loadedBottomTimes, ids && ids.length, safeCount);
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

        this.deleteMessagesByIDs(ids);
      }

      this.setUnreadDelimiter(); // не нашёл места лучше

      // preload more
      setTimeout(() => {
        this.loadMoreHistory(true, true);
        this.loadMoreHistory(false, true);
      }, 0);
    });

    return {cached, promise};
  }

  public setUnreadDelimiter() {
    if(this.attachedUnreadBubble) {
      return;
    }

    let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
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
  
  public setMutedState(muted = false) {
    appSidebarRight.profileElements.notificationsCheckbox.checked = !muted;
    appSidebarRight.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';

    if(appPeersManager.isBroadcast(this.peerID)) { // not human
      this.btnMute.classList.remove('tgico-mute', 'tgico-unmute');
      this.btnMute.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
      this.btnMute.style.display = '';
    } else {
      this.btnMute.style.display = 'none';
    }

    const menuButton = this.menuButtons.mute;
    menuButton.classList.remove('tgico-mute', 'tgico-unmute');
    menuButton.classList.add(muted ? 'tgico-unmute' : 'tgico-mute');
    let rp = menuButton.firstElementChild;
    menuButton.innerText = muted ? 'Unmute' : 'Mute';
    rp && menuButton.appendChild(rp);
  }
  
  public mutePeer(peerID: number) {
    let inputPeer = appPeersManager.getInputPeerByID(peerID);
    let inputNotifyPeer: InputNotifyPeer.inputNotifyPeer = {
      _: 'inputNotifyPeer',
      peer: inputPeer
    };
    
    let settings: InputPeerNotifySettings = {
      _: 'inputPeerNotifySettings',
      flags: 0,
      mute_until: 0
    };

    let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
    let muted = true;
    if(dialog && dialog.notify_settings) {
      muted = dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
    }
    
    if(!muted) {
      settings.flags |= 1 << 2;
      settings.mute_until = 2147483647;
    } else {
      settings.flags |= 2;
    }
    
    apiManager.invokeApi('account.updateNotifySettings', {
      peer: inputNotifyPeer,
      settings: settings
    }).then(bool => {
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
      case 'updateChatUserTyping': {
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
        
        this.typingTimeouts[peerID] = window.setTimeout(() => {
          this.typingTimeouts[peerID] = 0;
          delete this.typingUsers[update.user_id];
          
          if(dialog) {
            appDialogsManager.unsetTyping(dialog);
          }
          
          // лень просчитывать случаи
          this.setPeerStatus();
        }, 6000);

        break;
      }
      
      case 'updateNotifySettings': {
        let {peer, notify_settings} = update;
        
        // peer was NotifyPeer
        peer = peer.peer;
        
        let peerID = appPeersManager.getPeerID(peer);
        
        let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
        if(dialog) {
          dialog.notify_settings = notify_settings;
          $rootScope.$broadcast('dialog_notify_settings', peerID);
        }
        
        if(peerID == this.peerID) {
          let muted = notify_settings.mute_until ? new Date(notify_settings.mute_until * 1000) > new Date() : false;
          this.setMutedState(muted);
        }
        
        /////this.log('updateNotifySettings', peerID, notify_settings);
        break;
      }
    }
  }
}

const appImManager = new AppImManager();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appImManager = appImManager;
}
export default appImManager;
