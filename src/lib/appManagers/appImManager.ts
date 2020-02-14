import apiManager from '../mtproto/apiManager';
import { $rootScope, isElementInViewport, numberWithCommas, findUpClassName, formatNumber, placeCaretAtEnd, calcImageInBox, findUpTag, getRichValue, getRichValueWithCaret, getSelectedText, langPack } from "../utils";
import appUsersManager from "./appUsersManager";
import appMessagesManager from "./appMessagesManager";
import appPeersManager from "./appPeersManager";
import appProfileManager from "./appProfileManager";
//import { ProgressivePreloader, wrapDocument, wrapSticker, wrapVideo, wrapPhoto, openBtnMenu, LazyLoadQueue } from "../../components/misc";
import appDialogsManager from "./appDialogsManager";
import { RichTextProcessor } from "../richtextprocessor";
import appPhotosManager from "./appPhotosManager";
import appSidebarRight from './appSidebarRight';
import Scrollable from '../../components/scrollable';

import { logger } from "../polyfill";
import lottieLoader from "../lottieLoader";
import appMediaViewer from "./appMediaViewer";
import appSidebarLeft from "./appSidebarLeft";
import appChatsManager from "./appChatsManager";
import appMessagesIDsManager from "./appMessagesIDsManager";
import apiUpdatesManager from './apiUpdatesManager';
import initEmoticonsDropdown, { EMOTICONSSTICKERGROUP } from '../../components/emoticonsDropdown';
import LazyLoadQueue from '../../components/lazyLoadQueue';
import { wrapDocument, wrapPhoto, wrapVideo, wrapSticker } from '../../components/wrappers';
import ProgressivePreloader from '../../components/preloader';
import { openBtnMenu } from '../../components/misc';
import appWebPagesManager from './appWebPagesManager';

console.log('appImManager included!');

let testScroll = false;

class ScrollPosition {
  public previousScrollHeightMinusTop = 0;
  public readyFor = 'up';
  public container: HTMLElement;

  constructor(public node: HTMLElement) {
    this.container = node.parentElement;
  }

  /* public restore() {
    if(!this.scroll) return;
    //console.log('restore', this.readyFor, this.previousScrollHeightMinusTop);

    //if(this.readyFor === 'up') {
      this.scroll.update(true);

      //console.log('restore 2', this.node.scrollHeight, (this.node.scrollHeight
        //- this.previousScrollHeightMinusTop) + 'px')

      this.scroll.scroll({y: (this.node.scrollHeight
        - this.previousScrollHeightMinusTop) + 'px'});
    //}
  
    // 'down' doesn't need to be special cased unless the
    // content was flowing upwards, which would only happen
    // if the container is position: absolute, bottom: 0 for
    // a Facebook messages effect
  }

  public prepareFor(direction: string) {
    if(!this.scroll) return;

    this.readyFor = direction || 'up';

    this.scroll.update(true);
    let pos = this.scroll.scroll();
    this.previousScrollHeightMinusTop = this.node.scrollHeight
      - pos.position.y;
  } */

  public restore() {
    //console.log('scrollPosition restore 2', this.node.scrollHeight, (this.node.scrollHeight
      //- this.previousScrollHeightMinusTop) + 'px', this.container);

    //if(this.readyFor === 'up') {
      this.container.scrollTop = this.node.scrollHeight
        - this.previousScrollHeightMinusTop;
    //}
  
    // 'down' doesn't need to be special cased unless the
    // content was flowing upwards, which would only happen
    // if the container is position: absolute, bottom: 0 for
    // a Facebook messages effect
  }

  public prepareFor(direction: string) {
    this.readyFor = direction || 'up';
    this.previousScrollHeightMinusTop = this.node.scrollHeight
      - this.container.scrollTop;

    //console.log('scrollPosition prepareFor', direction, this.node.scrollHeight, this.previousScrollHeightMinusTop + 'px')
  }
}

class ChatInput {
  public pageEl = document.querySelector('.page-chats') as HTMLDivElement;
  public messageInput = document.getElementById('input-message') as HTMLDivElement/* HTMLInputElement */;
  public fileInput = document.getElementById('input-file') as HTMLInputElement;
  public inputMessageContainer = document.getElementsByClassName('input-message-container')[0] as HTMLDivElement;
  public inputScroll = new Scrollable(this.inputMessageContainer);
  public btnSend = document.getElementById('btn-send') as HTMLButtonElement;
  public emoticonsDropdown: HTMLDivElement = null;
  public emoticonsTimeout: number = 0;
  public toggleEmoticons: HTMLButtonElement;
  public emoticonsLazyLoadQueue: LazyLoadQueue = null;
  public lastUrl = '';
  public lastTimeType = 0;

  public attachMenu: {
    container?: HTMLButtonElement,
    media?: HTMLDivElement,
    document?: HTMLDivElement,
    poll?: HTMLDivElement
  } = {};

  public attachMediaPopUp: {
    container?: HTMLDivElement,
    titleEl?: HTMLDivElement,
    sendBtn?: HTMLButtonElement,
    mediaContainer?: HTMLDivElement,
    captionInput?: HTMLInputElement
  } = {};

  public willSendWebPage: any = null;

  constructor() {
    this.toggleEmoticons = this.pageEl.querySelector('.toggle-emoticons') as HTMLButtonElement;

    this.attachMenu.container = document.getElementById('attach-file') as HTMLButtonElement;
    this.attachMenu.media = this.attachMenu.container.querySelector('.menu-media') as HTMLDivElement;
    this.attachMenu.document = this.attachMenu.container.querySelector('.menu-document') as HTMLDivElement;
    this.attachMenu.poll = this.attachMenu.container.querySelector('.menu-poll') as HTMLDivElement;

    this.attachMediaPopUp.container = this.pageEl.querySelector('.popup-send-photo') as HTMLDivElement;
    this.attachMediaPopUp.titleEl = this.attachMediaPopUp.container.querySelector('.popup-title') as HTMLDivElement;
    this.attachMediaPopUp.sendBtn = this.attachMediaPopUp.container.querySelector('.btn-primary') as HTMLButtonElement;
    this.attachMediaPopUp.mediaContainer = this.attachMediaPopUp.container.querySelector('.popup-photo') as HTMLDivElement;
    this.attachMediaPopUp.captionInput = this.attachMediaPopUp.container.querySelector('input') as HTMLInputElement;

    this.messageInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if(e.key == 'Enter') {
        /* if(e.ctrlKey || e.metaKey) {
          this.messageInput.innerHTML += '<br>';
          placeCaretAtEnd(this.message)
          return;
        } */

        if(e.shiftKey || e.ctrlKey || e.metaKey) {
          return;
        }
  
        this.sendMessage();
      }
    });

    this.messageInput.addEventListener('input', (e) => {
      //console.log('messageInput input', this.messageInput.innerText, this.serializeNodes(Array.from(this.messageInput.childNodes)));
  
      let value = this.messageInput.innerText;
  
      let entities = RichTextProcessor.parseEntities(value);
      //console.log('messageInput entities', entities);
  
      let entityUrl = entities.find(e => e._ == 'messageEntityUrl');
      if(entityUrl) { // need to get webpage
        let url = value.slice(entityUrl.offset, entityUrl.offset + entityUrl.length);
  
        //console.log('messageInput url:', url);
  
        if(this.lastUrl != url) {
          this.lastUrl = url;
          this.willSendWebPage = null;
          apiManager.invokeApi('messages.getWebPage', {
            url: url,
            hash: 0
          }).then((webpage: any) => {
            appWebPagesManager.saveWebPage(webpage);
            if(this.lastUrl != url) return;
            //console.log(webpage);
  
            appImManager.replyElements.titleEl.innerHTML = RichTextProcessor.wrapEmojiText(webpage.site_name || webpage.title || '');
            appImManager.replyElements.subtitleEl.innerHTML = RichTextProcessor.wrapEmojiText(webpage.description || webpage.url || '');
            appImManager.replyElements.container.classList.add('active');
            appImManager.replyToMsgID = 0;
            appImManager.noWebPage = false;
            this.willSendWebPage = webpage;
          });
        }
      }
  
      if(!value.trim() && !this.serializeNodes(Array.from(this.messageInput.childNodes)).trim()) {
        this.messageInput.innerHTML = '';
        this.btnSend.classList.remove('tgico-send');
        this.btnSend.classList.add('tgico-microphone2');
  
        appImManager.setTyping('sendMessageCancelAction');
      } else if(!this.btnSend.classList.contains('tgico-send')) {
        this.btnSend.classList.add('tgico-send');
        this.btnSend.classList.remove('tgico-microphone2');
  
        let time = Date.now();
        if(time - this.lastTimeType >= 6000) {
          this.lastTimeType = time;
          appImManager.setTyping('sendMessageTypingAction');
        }
      }
    });

    if(!RichTextProcessor.emojiSupported) {
      this.messageInput.addEventListener('copy', (e) => {
        const selection = document.getSelection();
        
        let range = selection.getRangeAt(0);
        let ancestorContainer = range.commonAncestorContainer;
    
        let str = '';
    
        let selectedNodes = Array.from(ancestorContainer.childNodes).slice(range.startOffset, range.endOffset);
        if(selectedNodes.length) {
          str = this.serializeNodes(selectedNodes);
        } else {
          str = selection.toString();
        }
    
        //console.log('messageInput copy', str, ancestorContainer.childNodes, range);
  
        //let str = getRichValueWithCaret(this.messageInput);
        //console.log('messageInput childNode copy:', str);
    
        // @ts-ignore
        event.clipboardData.setData('text/plain', str);
        event.preventDefault();
      });
    }
    
    this.messageInput.addEventListener('paste', (e) => {
      //console.log('messageInput paste');

      e.preventDefault();
      // @ts-ignore
      let text = (e.originalEvent || e).clipboardData.getData('text/plain');
  
      // console.log('messageInput paste', text);
      text = RichTextProcessor.wrapEmojiText(text);
  
      // console.log('messageInput paste after', text);
  
      // @ts-ignore
      //let html = (e.originalEvent || e).clipboardData.getData('text/html');
  
      // @ts-ignore
      //console.log('paste text', text, );
      window.document.execCommand('insertHTML', false, text);
    });

    let attachFile = (file: File) => {
      console.log('selected file:', file, typeof(file));

      willAttachFile = file;
  
      this.fileInput.value = '';

      this.attachMediaPopUp.captionInput.value = '';
      this.attachMediaPopUp.mediaContainer.innerHTML = '';
      this.attachMediaPopUp.mediaContainer.style.width = '';
      this.attachMediaPopUp.mediaContainer.style.height = '';
      this.attachMediaPopUp.mediaContainer.classList.remove('is-document');

      switch(willAttach) {
        case 'media': {
          let img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => {
            willAttachWidth = img.naturalWidth;
            willAttachHeight = img.naturalHeight;

            let {w, h} = calcImageInBox(willAttachWidth, willAttachHeight, 378, 256);
            this.attachMediaPopUp.mediaContainer.style.width = w + 'px';
            this.attachMediaPopUp.mediaContainer.style.height = h + 'px';
            this.attachMediaPopUp.mediaContainer.append(img);
          };

          this.attachMediaPopUp.titleEl.innerText = 'Send Photo';
          this.attachMediaPopUp.container.classList.add('active');

          break;
        }

        case 'document': {
          let docDiv = wrapDocument({
            file: file,
            file_name: file.name || '',
            size: file.size,
            type: ['image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp'].indexOf(file.type) !== -1 ? 'photo' : 'doc'
          } as any, false);

          this.attachMediaPopUp.titleEl.innerText = 'Send File';

          this.attachMediaPopUp.mediaContainer.append(docDiv);
          this.attachMediaPopUp.mediaContainer.classList.add('is-document');
          this.attachMediaPopUp.container.classList.add('active');
          break;
        }
      }
    };

    let willAttach = '';
    let willAttachFile: File = null;
    let willAttachWidth = 0, willAttachHeight = 0;
    this.fileInput.addEventListener('change', (e) => {
      var file = (e.target as HTMLInputElement & EventTarget).files[0];
      if(!file) {
        return;
      }
      
      attachFile(file);
    }, false);

    this.attachMenu.media.addEventListener('click', () => {
      willAttach = 'media';
      this.fileInput.click();
    });

    this.attachMenu.document.addEventListener('click', () => {
      willAttach = 'document';
      this.fileInput.click();
    });

    document.addEventListener('paste', (event) => {
      if(!appImManager.peerID || this.attachMediaPopUp.container.classList.contains('active')) {
        return;
      }

      //console.log('document paste');

      // @ts-ignore
      var items = (event.clipboardData || event.originalEvent.clipboardData).items;
      //console.log('item', event.clipboardData.getData());
      for(let i = 0; i < items.length; ++i) {
        if(items[i].kind == 'file') {
          event.preventDefault()
          event.cancelBubble = true;
          event.stopPropagation();

          let file = items[i].getAsFile();
          //console.log(items[i], file);
          if(!file) continue;

          willAttach = file.type.indexOf('image/') === 0 ? 'media' : "document";
          attachFile(file);
        }
      }
    }, true);

    this.attachMediaPopUp.sendBtn.addEventListener('click', () => {
      this.attachMediaPopUp.container.classList.remove('active');
      let caption = this.attachMediaPopUp.captionInput.value;

      appMessagesManager.sendFile(appImManager.peerID, willAttachFile, {
        isMedia: true, 
        caption,
        width: willAttachWidth,
        height: willAttachHeight
      });
      appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;
    });

    this.btnSend.addEventListener('click', () => {
      if(this.btnSend.classList.contains('tgico-send')) {
        this.sendMessage();
      }
    });

    this.toggleEmoticons.onmouseover = (e) => {
      clearTimeout(this.emoticonsTimeout);
      this.emoticonsTimeout = setTimeout(() => {
        if(!this.emoticonsDropdown) {
          let res = initEmoticonsDropdown(this.pageEl, appImManager, 
            appMessagesManager, this.messageInput, this.toggleEmoticons, this.btnSend);
          
          this.emoticonsDropdown = res.dropdown;
          this.emoticonsLazyLoadQueue = res.lazyLoadQueue;

          this.toggleEmoticons.onmouseout = this.emoticonsDropdown.onmouseout = (e) => {
            clearTimeout(this.emoticonsTimeout);
            this.emoticonsTimeout = setTimeout(() => {
              this.emoticonsDropdown.classList.remove('active');
              this.toggleEmoticons.classList.remove('active');
              lottieLoader.checkAnimations(true, EMOTICONSSTICKERGROUP);
            }, 200);
          };

          this.emoticonsDropdown.onmouseover = (e) => {
            clearTimeout(this.emoticonsTimeout);
          };
        } else {
          this.emoticonsDropdown.classList.add('active');
          this.emoticonsLazyLoadQueue.check();
        }
    
        this.toggleEmoticons.classList.add('active');

        lottieLoader.checkAnimations(false, EMOTICONSSTICKERGROUP);
      }, 0/* 200 */);
    };
  }
  
  public serializeNodes(nodes: Node[]): string {
    return nodes.reduce((str, child: any) => {
      //console.log('childNode', str, child, typeof(child), typeof(child) === 'string', child.innerText);

      if(typeof(child) === 'object' && child.textContent) return str += child.textContent;
      if(child.innerText) return str += child.innerText;
      if(child.tagName == 'IMG' && child.classList && child.classList.contains('emoji')) return str += child.getAttribute('alt');

      return str;
    }, '');
  };

  public sendMessage() {
    //let str = this.serializeNodes(Array.from(this.messageInput.childNodes));
    let str = getRichValue(this.messageInput);

    //console.log('childnode str after:', str/* , getRichValue(this.messageInput) */);

    //return;
    this.lastUrl = '';
    appMessagesManager.sendText(appImManager.peerID, str, {
      replyToMsgID: appImManager.replyToMsgID == 0 ? undefined : appImManager.replyToMsgID,
      noWebPage: appImManager.noWebPage,
      webPage: this.willSendWebPage
    });
    appImManager.replyToMsgID = 0;
    appImManager.noWebPage = false;
    appImManager.replyElements.container.classList.remove('active');
    appImManager.scroll.scrollTop = appImManager.scroll.scrollHeight;
    this.willSendWebPage = null;
    this.messageInput.innerText = '';

    this.btnSend.classList.remove('tgico-send');
    this.btnSend.classList.add('tgico-microphone2');
  };
}

export class AppImManager {
  public pageEl = document.querySelector('.page-chats') as HTMLDivElement;
  public btnMute = this.pageEl.querySelector('.tool-mute') as HTMLButtonElement;
  public btnMenuMute = this.pageEl.querySelector('.menu-mute') as HTMLButtonElement;
  public avatarEl = document.getElementById('im-avatar') as HTMLDivElement;
  public titleEl = document.getElementById('im-title') as HTMLDivElement;
  public subtitleEl = document.getElementById('im-subtitle') as HTMLDivElement;
  public chatInner = document.getElementById('bubbles-inner') as HTMLDivElement;
  public searchBtn = this.pageEl.querySelector('.chat-search-button') as HTMLButtonElement;
  public goDownBtn = this.pageEl.querySelector('#bubbles-go-down') as HTMLButtonElement;
  public firstContainerDiv: HTMLDivElement;
  public lastContainerDiv: HTMLDivElement;
  private getHistoryPromise: Promise<boolean>;
  private getHistoryTimeout = 0;

  private chatInputC: ChatInput = null;

  public myID = 0;
  public peerID = 0;
  public muted = false;

  public lastDialog: any;
  public bubbles: {[mid: number]: HTMLDivElement} = {};
  public dateMessages: {[timestamp: number]: { div: HTMLDivElement, firstTimestamp: number }} = {};
  public unreaded: number[] = [];
  public unreadOut: number[] = [];
  public needUpdate: {replyMid: number, mid: number}[] = []; // if need wrapSingleMessage
  
  public offline = false;
  public updateStatusInterval = 0;

  public pinnedMsgID = 0;
  private pinnedMessageContainer = this.pageEl.querySelector('.pinned-message') as HTMLDivElement;
  private pinnedMessageContent = this.pinnedMessageContainer.querySelector('.pinned-message-subtitle') as HTMLDivElement;
  
  private firstTopMsgID = 0;

  public loadMediaQueue: Array<() => Promise<void>> = [];
  private loadMediaQueuePromise: Promise<void[]> = null;
  private loadingMedia = 0;
  
  public scroll: HTMLDivElement = null;
  public scrollPosition: ScrollPosition = null;

  public log: ReturnType<typeof logger>;

  private preloader: ProgressivePreloader = null;

  private typingTimeouts: {[peerID: number]: number} = {};
  private typingUsers: {[userID: number]: number} = {} // to peerID

  private topbar: HTMLDivElement = null;
  private chatInput: HTMLDivElement = null;
  private scrolledAll: boolean;
  private scrolledAllDown: boolean;

  public contextMenu = document.getElementById('bubble-contextmenu') as HTMLDivElement;
  private contextMenuPin = this.contextMenu.querySelector('.menu-pin') as HTMLDivElement;
  private contextMenuEdit = this.contextMenu.querySelector('.menu-edit') as HTMLDivElement;
  private contextMenuMsgID: number;

  public replyElements: {
    container?: HTMLDivElement,
    cancelBtn?: HTMLButtonElement,
    titleEl?: HTMLDivElement,
    subtitleEl?: HTMLDivElement
  } = {};

  private popupDeleteMessage: {
    popupEl?: HTMLDivElement,
    deleteBothBtn?: HTMLButtonElement,
    deleteMeBtn?: HTMLButtonElement,
    cancelBtn?: HTMLButtonElement
  } = {};

  public replyToMsgID = 0;
  public noWebPage = false;

  constructor() {
    this.log = logger('IM');

    this.chatInputC = new ChatInput();

    this.preloader = new ProgressivePreloader(null, false);

    this.popupDeleteMessage.popupEl = this.pageEl.querySelector('.popup-delete-message') as HTMLDivElement;
    this.popupDeleteMessage.deleteBothBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-delete-both') as HTMLButtonElement;
    this.popupDeleteMessage.deleteMeBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-delete-me') as HTMLButtonElement;
    this.popupDeleteMessage.cancelBtn = this.popupDeleteMessage.popupEl.querySelector('.popup-close') as HTMLButtonElement;

    this.replyElements.container = this.pageEl.querySelector('.reply-wrapper') as HTMLDivElement;
    this.replyElements.cancelBtn = this.replyElements.container.querySelector('.reply-cancel') as HTMLButtonElement;
    this.replyElements.titleEl = this.replyElements.container.querySelector('.reply-title') as HTMLDivElement;
    this.replyElements.subtitleEl = this.replyElements.container.querySelector('.reply-subtitle') as HTMLDivElement;

    apiManager.getUserID().then((id) => {
      this.myID = id;
    });

    this.topbar = document.getElementById('topbar') as HTMLDivElement;
    this.chatInput = document.getElementById('chat-input') as HTMLDivElement;

    $rootScope.$on('user_auth', (e: CustomEvent) => {
      let userAuth = e.detail;
      this.myID = userAuth ? userAuth.id : 0;
    });

    $rootScope.$on('history_append', (e: CustomEvent) => {
      let details = e.detail;

      this.renderMessagesByIDs([details.messageID]);
    });

    $rootScope.$on('history_update', (e: CustomEvent) => {
      let details = e.detail;

      if(details.mid && details.peerID == this.peerID) {
        let mid = details.mid;

        let bubble = this.bubbles[mid];
        if(!bubble) return;

        let message = appMessagesManager.getMessage(mid);
        //this.log('history_update', this.bubbles[mid], mid, message);
        this.renderMessage(message, false, false, bubble);
      }
    });

    $rootScope.$on('history_multiappend', (e: CustomEvent) => {
      let msgIDsByPeer = e.detail;
      if(!(this.peerID in msgIDsByPeer)) return;

      let msgIDs = msgIDsByPeer[this.peerID];

      this.renderMessagesByIDs(msgIDs);

      appDialogsManager.sortDom();
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

      let bubble = this.bubbles[tempID];
      if(bubble) {
        this.bubbles[mid] = bubble;

        this.log('message_sent', bubble);

        let media = bubble.querySelector('img, video');
        if(media) {
          media.setAttribute('message-id', mid);
        }
        
        bubble.classList.remove('is-sending');
        bubble.classList.add('is-sent');

        delete this.bubbles[tempID];
      } else {
        this.log.warn('message_sent there is no bubble', e.detail);
      }

      let length = this.unreadOut.length;
      for(let i = 0; i < length; i++) {
        if(this.unreadOut[i] == tempID) {
          this.unreadOut[i] = mid;
        }
      }
    });

    $rootScope.$on('message_edit', (e: CustomEvent) => {
      let {peerID, mid, id, justMedia} = e.detail;

      if(peerID != this.peerID) return;

      let bubble = this.bubbles[mid];
      if(!bubble) return;

      let message = appMessagesManager.getMessage(mid);
      this.renderMessage(message, false, false, bubble, false);
    });

    $rootScope.$on('messages_downloaded', (e: CustomEvent) => {
      let mids: number[] = e.detail;
      
      mids.forEach(mid => {
        if(this.pinnedMsgID == mid) {
          let message = appMessagesManager.getMessage(mid);
          this.log('setting pinned message', message);
          this.pinnedMessageContainer.dataset.mid = '' + mid;
          this.pinnedMessageContainer.style.display = '';
          this.pinnedMessageContent.innerHTML = RichTextProcessor.wrapEmojiText(message.message);
        }

        let length = this.needUpdate.length;
        for(let i = length - 1; i >= 0; --i) {
          if(this.needUpdate[i].replyMid == mid) {
            let {mid, replyMid} = this.needUpdate.splice(i, 1)[0];

            //this.log('messages_downloaded', mid, replyMid, i, this.needUpdate, this.needUpdate.length, mids, this.bubbles[mid]);
            let bubble = this.bubbles[mid];
            if(!bubble) return;
  
            let message = appMessagesManager.getMessage(mid);
  
            let repliedMessage = appMessagesManager.getMessage(replyMid);
            if(repliedMessage.deleted) { // чтобы не пыталось бесконечно загрузить удалённое сообщение
              delete message.reply_to_mid; // WARNING!
            }
  
            this.renderMessage(message, false, false, bubble, false);
          }
        }
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

      if(['IMG', 'VIDEO', 'SVG', 'DIV'].indexOf(target.tagName) === -1) target = findUpTag(target, 'DIV');

      /* if(target.tagName == 'VIDEO' && bubble.classList.contains('round')) {
        let video = target as HTMLVideoElement;
        video.currentTime = 0;
        if(video.paused) {
          video.play();
          video.volume = 1;
        } else {
          video.pause();
          video.volume = 0;
        }
        return;
      } */

      if(target.tagName == 'DIV') {
        if(target.classList.contains('forward')) {
          let savedFrom = bubble.dataset.savedFrom;
          let splitted = savedFrom.split('_');
          let peerID = +splitted[0];
          let msgID = +splitted[1];
          this.log('savedFrom', peerID, msgID);
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
          isReplyClick = !!findUpClassName(e.target, 'box');
        } catch(err) {}

        if(isReplyClick && bubble.classList.contains('is-reply')/*  || bubble.classList.contains('forwarded') */) {
          let originalMessageID = +bubble.getAttribute('data-original-mid');
          this.setPeer(this.peerID, originalMessageID);
        }
      } else if(bubble.classList.contains('round')) {
        
      } else if(target.tagName == 'IMG' && target.parentElement.classList.contains('user-avatar')) {
        let peerID = +target.parentElement.dataset.peerID;
          
        if(!isNaN(peerID)) {
          this.setPeer(peerID);
        }
      } else if((target.tagName == 'IMG' && !target.classList.contains('emoji')) || target.tagName == 'VIDEO') {
        let messageID = +target.getAttribute('message-id');
        let message = appMessagesManager.getMessage(messageID);

        if(!message) {
          this.log.warn('no message by messageID:', messageID);
          return;
        }

        appMediaViewer.openMedia(message, true);
      }

      //console.log('chatInner click', e);
    });

    this.searchBtn.addEventListener('click', (e) => {
      if(this.peerID) {
        appSidebarLeft.beginSearch(this.peerID);
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

      this.log('onkeydown', e);

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

    /* this.chatInner.addEventListener('mouseover', () => {
      document.body.addEventListener('keydown', onKeyDown);

      this.log('mouseover');

      this.chatInner.addEventListener('mouseout', () => {
        document.body.removeEventListener('keydown', onKeyDown);
      }, {once: true});
    }); */

    this.chatInner.addEventListener('contextmenu', e => {
      let bubble: HTMLDivElement = null;

      try {
        bubble = findUpClassName(e.target, 'bubble');
      } catch(e) {}

      if(bubble) {
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

        if(this.myID == this.peerID || 
          (this.peerID < 0 && !appPeersManager.isChannel(this.peerID) && !appPeersManager.isMegagroup(this.peerID))) {
          this.contextMenuPin.style.display = '';
        } else this.contextMenuPin.style.display = 'none';

        this.contextMenuMsgID = msgID;

        let side = bubble.parentElement.classList.contains('in') ? 'left' : 'right';

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

        this.log('contextmenu', e, bubble, msgID, side);
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
      let title = appPeersManager.getPeerTitle(message.fromID);
      this.replyElements.titleEl.innerHTML = title;
      this.replyElements.subtitleEl.innerHTML = message.message ? RichTextProcessor.wrapEmojiText(message.message) : '';
      this.replyElements.container.classList.add('active');
      this.replyToMsgID = this.contextMenuMsgID;
    });

    this.contextMenuPin.addEventListener('click', () => {
      apiManager.invokeApi('messages.updatePinnedMessage', {
        flags: 0,
        peer: appPeersManager.getInputPeerByID(this.peerID),
        id: this.contextMenuMsgID
      }).then(updates => {
        this.log('pinned updates:', updates);
        apiUpdatesManager.processUpdateMessage(updates);
      });
    });

    this.replyElements.cancelBtn.addEventListener('click', () => {
      this.replyElements.container.classList.remove('active');
      this.replyToMsgID = 0;
      this.noWebPage = true;
      this.chatInputC.willSendWebPage = null;
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
      if(this.lastDialog) {
        this.setPeer(this.peerID, this.lastDialog.top_message);
      } else {
        this.scroll.scrollTop = this.scroll.scrollHeight;
      }
    });

    this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
    this.updateStatus();
    setInterval(() => this.setPeerStatus(), 60e3);
    
    this.loadMediaQueueProcess();
  }

  public deleteMessages(revoke = false) {
    let flags = revoke ? 1 : 0;
    let ids = [this.contextMenuMsgID];

    apiManager.invokeApi('messages.deleteMessages', {
      flags: flags,
      revoke: revoke,
      id: ids
    }).then((affectedMessages: any) => {
      this.log('deleted messages:', affectedMessages);

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

  public loadMediaQueuePush(cb: () => Promise<void>) {
    this.loadMediaQueue.push(cb);
    this.loadMediaQueueProcess();
  }

  public async loadMediaQueueProcessOld(): Promise<void[]> {
    if(this.loadMediaQueuePromise /* || 1 == 1 */) return this.loadMediaQueuePromise;

    let woo = this.loadMediaQueue.splice(-5, 5).reverse().map(f => f());

    if(woo.length) {
      this.log('Will load more media:', woo.length);

      woo.forEach(async(promise) => {
        try {
          await promise;
        } catch(err) {
          this.log.error('loadMediaQueue error:', err);
        }

        this.loadingMedia--;
      });

      try {
        this.loadMediaQueuePromise = Promise.all(woo);
        await this.loadMediaQueuePromise;
      } catch(err) {
        this.log.error('loadMediaQueue error:', err);
      }
    }

    this.loadMediaQueuePromise = null;
    
    if(this.loadMediaQueue.length) return this.loadMediaQueueProcess();
    return this.loadMediaQueuePromise;
  }

  public async loadMediaQueueProcess(): Promise<void[]> {
    if(this.loadingMedia >= 5) return;

    let item = this.loadMediaQueue.pop();
    if(item) {
      this.loadingMedia++;

      let peerID = this.peerID;

      let promise = item();
      try {
        await promise;
      } catch(err) {
        this.log.error('loadMediaQueue error:', err);
      }

      if(peerID == this.peerID) {
        this.loadingMedia--;
      }
    }
    
    if(this.loadMediaQueue.length) return this.loadMediaQueueProcess();
  }

  public updateStatus() {
    if(!this.myID) return Promise.resolve();

    appUsersManager.setUserStatus(this.myID, this.offline);
    return apiManager.invokeApi('account.updateStatus', {
      offline: this.offline
    }, {noErrorBox: true});
  }

  public onScroll() {
    let length = this.unreaded.length;
    let readed: number[] = [];

    for(let i = length - 1; i >= 0; --i) {
      let msgID = this.unreaded[i];
      let bubble = this.bubbles[msgID];

      if(isElementInViewport(bubble)) {
        readed.push(msgID);
        this.unreaded.splice(i, 1);
      }
    }

    lottieLoader.checkAnimations();

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

    if(this.scroll.scrollHeight - (this.scroll.scrollTop + this.scroll.offsetHeight) == 0/* <= 5 */) {
      this.scroll.parentElement.classList.add('scrolled-down');
    } else if(this.scroll.parentElement.classList.contains('scrolled-down')) {
      this.scroll.parentElement.classList.remove('scrolled-down');
    }

    // load more history
    if(!this.getHistoryPromise && !this.getHistoryTimeout && !testScroll) {
      this.getHistoryTimeout = setTimeout(() => { // must be
        let history = Object.keys(this.bubbles).map(id => +id).sort();

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

        this.getHistoryTimeout = 0;

        let willLoad = false;
        if(!this.scrolledAll) {
          let length = history.length < 10 ? history.length : 10;
          for(let i = 0; i < length; ++i) {
            let msgID = history[i];
    
            let bubble = this.bubbles[msgID];

            if(!bubble) {
              this.log.error('no bubble by msgID:', msgID);
              continue;
            }
    
            if(isElementInViewport(bubble)) {
              willLoad = true;
  
              this.log('Will load more (up) history by id:', history[0], 'maxID:', history[history.length - 1], history, bubble);
              /* false &&  */!testScroll && this.getHistory(history[0], true).then(() => { // uncomment
                this.onScroll();
              }).catch(err => {
                this.log.warn('Could not load more history, err:', err);
              });
    
              break;
            }
          }
        }

        if(this.scrolledAllDown) return;

        let dialog = appMessagesManager.getDialogByPeerID(this.peerID)[0];
        /* if(!dialog) {
          this.log.warn('no dialog for load history');
          return;
        } */

        // if scroll down after search
        if(!willLoad && (!dialog || history.indexOf(/* this.lastDialog */dialog.top_message) === -1)) {
          let lastMsgIDs = history.slice(-10);
          for(let msgID of lastMsgIDs) {
            let bubble = this.bubbles[msgID];
    
            if(isElementInViewport(bubble)) {
              willLoad = true;
  
              this.log('Will load more (down) history by maxID:', lastMsgIDs[lastMsgIDs.length - 1], lastMsgIDs, bubble);
              /* false &&  */!testScroll && this.getHistory(lastMsgIDs[lastMsgIDs.length - 1], false, true).then(() => { // uncomment
                this.onScroll();
              }).catch(err => {
                this.log.warn('Could not load more history, err:', err);
              });
    
              break;
            }
          }
        }
      }, 0);
    }
  }

  public setScroll(scroll: HTMLDivElement) {
    this.scroll = scroll;
    this.scrollPosition = new ScrollPosition(this.chatInner);
    this.scroll.addEventListener('scroll', this.onScroll.bind(this));
    this.scroll.parentElement.classList.add('scrolled-down');
  }

  public setPeerStatus() {
    if(!this.myID) return;

    // set subtitle
    this.subtitleEl.innerText = appSidebarRight.profileElements.subtitle.innerText = '';
    this.subtitleEl.classList.remove('online');
    appSidebarRight.profileElements.subtitle.classList.remove('online');

    if(this.peerID < 0) { // not human
      let chat = appPeersManager.getPeer(this.peerID);
      let isChannel = appPeersManager.isChannel(this.peerID) && !appPeersManager.isMegagroup(this.peerID);

      this.log('setPeerStatus', chat);
    
      Promise.all([
        appPeersManager.isMegagroup(this.peerID) ? apiManager.invokeApi('messages.getOnlines', {
          peer: appPeersManager.getInputPeerByID(this.peerID)
        }) as Promise<any> : Promise.resolve(),
        // will redirect if wrong
        appProfileManager.getChatFull(chat.id)
      ]).then(results => {
        let [chatOnlines, chatInfo] = results;

        let onlines = chatOnlines ? chatOnlines.onlines : 1;

        this.log('chatInfo res:', chatInfo);

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

      //this.subtitleEl.classList.remove('online');

      if(user && user.status && this.myID != this.peerID) {
        let subtitle = '';
        switch(user.status._) {
          case 'userStatusRecently':
            subtitle += 'last seen recently';
            break;
          case 'userStatusOffline':
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
          
          case 'userStatusOnline':
            this.subtitleEl.classList.add('online');
            appSidebarRight.profileElements.subtitle.classList.add('online');
            subtitle = 'online';
            break;
        }

        appSidebarRight.profileElements.subtitle.innerText = subtitle;

        if(this.typingUsers[this.peerID] == this.peerID) {
          this.subtitleEl.innerText = 'typing...';
          this.subtitleEl.classList.add('online');
        } else this.subtitleEl.innerText = subtitle;
      }
    }
  }

  public cleanup() {
    this.peerID = $rootScope.selectedPeerID = 0;
    this.scrolledAll = false;
    this.scrolledAllDown = false;
    this.muted = false;

    if(this.lastContainerDiv) this.lastContainerDiv.remove();
    if(this.firstContainerDiv) this.firstContainerDiv.remove();
    this.lastContainerDiv = undefined;
    this.firstContainerDiv = undefined;

    for(let i in this.bubbles) {
      let bubble = this.bubbles[i];
      bubble.remove();
    }
    this.bubbles = {};
    this.dateMessages = {};
    this.unreaded = [];
    this.unreadOut = [];
    this.loadMediaQueue = [];
    this.loadingMedia = 0;
    this.needUpdate.length = 0;

    lottieLoader.checkAnimations(false, 'chat', true);

    // clear input 
    this.chatInputC.messageInput.innerHTML = '';
    this.replyElements.cancelBtn.click();

    // clear messages
    this.chatInner.innerHTML = '';

    //appSidebarRight.minMediaID = {};
  }

  public setPeer(peerID: number, lastMsgID = 0, forwarding = false) {
    if(peerID == 0) {
      appSidebarRight.toggleSidebar(false);
      this.topbar.style.display = this.chatInput.style.display = this.goDownBtn.style.display = 'none';
      this.cleanup();
      return Promise.resolve(false);
    }

    let samePeer = this.peerID == peerID;

    if(samePeer) {
      if(!testScroll && !lastMsgID) {
        return Promise.resolve(true);
      }

      if(this.bubbles[lastMsgID]) {
        if(this.lastDialog && lastMsgID == this.lastDialog.top_message) {
          this.scroll.scrollTop = this.scroll.scrollHeight;
        } else {
          this.bubbles[lastMsgID].scrollIntoView();
        }

        return Promise.resolve(true);
      }
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

    this.pinnedMessageContainer.style.display = 'none';

    this.preloader.attach(this.chatInner);

    let dialog = this.lastDialog = appMessagesManager.getDialogByPeerID(this.peerID)[0] || null;
    this.log('setPeer peerID:', this.peerID, dialog, lastMsgID);
    appDialogsManager.loadDialogPhoto(this.avatarEl, this.peerID);
    appDialogsManager.loadDialogPhoto(appSidebarRight.profileElements.avatar, this.peerID);
    if(!samePeer && appDialogsManager.lastActiveListElement) {
      appDialogsManager.lastActiveListElement.classList.remove('active');
    }

    this.firstTopMsgID = dialog ? dialog.top_message : 0;

    /* let dom = appDialogsManager.getDialogDom(this.peerID);
    if(!dom) {
      this.log.warn('No rendered dialog by peerID:', this.peerID);
      appDialogsManager.addDialog(dialog);
      dom = appDialogsManager.getDialogDom(this.peerID);
    }
    // warning need check
    dom.listEl.classList.add('active'); */

    this.setPeerStatus();

    //this.titleEl.innerHTML = appSidebarRight.profileElements.name.innerHTML = dom.titleSpan.innerHTML;
    this.titleEl.innerHTML = appSidebarRight.profileElements.name.innerHTML = appPeersManager.getPeerTitle(this.peerID);

    this.topbar.style.display = this.goDownBtn.style.display = '';
    appSidebarRight.toggleSidebar(true);

    this.chatInput.style.display = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID) ? 'none' : '';

    if(appPeersManager.isAnyGroup(peerID)) {
      this.chatInner.classList.add('is-chat');
    } else {
      this.chatInner.classList.remove('is-chat');
    }

    return Promise.all([
      this.getHistory(forwarding ? lastMsgID + 1 : lastMsgID).then(() => {
        this.log('setPeer removing preloader');

        if(lastMsgID) {
          if(!forwarding) {
            let message = appMessagesManager.getMessage(lastMsgID);
            this.log('setPeer render last message:', message, lastMsgID);
            this.renderMessage(message);
          }

          if(!dialog || lastMsgID != dialog.top_message) {
            let bubble = this.bubbles[lastMsgID];
            
            if(bubble) this.bubbles[lastMsgID].scrollIntoView();
            else this.log.warn('no bubble by lastMsgID:', lastMsgID);
          } else {
            this.scroll.scrollTop = this.scroll.scrollHeight;
          }
        } else if(dialog && dialog.top_message) { // add last message, bc in getHistory will load < max_id
          this.renderMessage(appMessagesManager.getMessage(dialog.top_message));
        }
        
        if(this.scroll) {
          this.onScroll();
        }
        
        this.preloader.detach();

        //setTimeout(() => {
          //appSidebarRight.fillProfileElements();
          appSidebarRight.loadSidebarMedia();
        //}, 500);
        
        return true;
      })/* .catch(err => {
        this.log.error(err);
      }) */,

      appSidebarRight.fillProfileElements()
    ]).catch(err => {
      this.log.error('setPeer promises error:', err);
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

    this.log('updateUnreadByDialog', maxID, dialog, this.unreadOut);

    let length = this.unreadOut.length;
    for(let i = length - 1; i >= 0; --i) {
      let msgID = this.unreadOut[i];
      if(msgID > 0 && msgID <= maxID) {
        let bubble = this.bubbles[msgID];
        bubble.classList.remove('is-sent');
        bubble.classList.add('is-read');
        this.unreadOut.splice(i, 1);
      }
    }
  }

  public deleteMessagesByIDs(msgIDs: number[]) {
    msgIDs.forEach(id => {
      if(!(id in this.bubbles)) return;
      
      let bubble = this.bubbles[id];
      let parent = bubble.parentNode as HTMLDivElement;
      delete this.bubbles[id];
      bubble.remove();
      
      if(!parent.childNodes.length) {
        parent.remove();
      }
    });

    lottieLoader.checkAnimations();
  }

  public renderMessagesByIDs(msgIDs: number[]) {
    if(!this.bubbles[this.firstTopMsgID]) { // seems search active
      return;
    }

    msgIDs.forEach((msgID: number) => {
      let message = appMessagesManager.getMessage(msgID);

      this.log('got new message to append:', message);

      //this.unreaded.push(msgID);
      this.renderMessage(message);
    });
  }

  public renderMessage(message: any, reverse = false, multipleRender?: boolean, bubble: HTMLDivElement = null, updatePosition = true) {
    this.log('message to render:', message);
    if(message.deleted) return;

    let peerID = this.peerID;
    let our = message.fromID == this.myID;
  
    let messageDiv = document.createElement('div');
    messageDiv.classList.add('message');

    //messageDiv.innerText = message.message;

    if(!multipleRender) {
      this.scrollPosition.prepareFor(reverse ? 'up' : 'down'); // лагает из-за этого
    }

    // bubble
    if(!bubble) {
      bubble = document.createElement('div');
      bubble.classList.add('bubble');
      this.bubbles[+message.mid] = bubble;
    } else {
      bubble.className = 'bubble';
      bubble.innerHTML = '';
    }
  
    // time section
  
    let date = new Date(message.date * 1000);
    let time = ('0' + date.getHours()).slice(-2) + 
      ':' + ('0' + date.getMinutes()).slice(-2);

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
  
    let richText = RichTextProcessor.wrapRichText(message.message, {
      entities: message.totalEntities
    });

    if(message.totalEntities) {
      let emojiEntities = message.totalEntities.filter((e: any) => e._ == 'messageEntityEmoji');
      let strLength = message.message.length;
      let emojiStrLength = emojiEntities.reduce((acc: number, curr: any) => acc + curr.length, 0);
  
      if(emojiStrLength == strLength && emojiEntities.length <= 3) {
        let attachmentDiv = document.createElement('div');
        attachmentDiv.classList.add('attachment');

        attachmentDiv.innerHTML = richText;

        messageDiv.classList.add('message-empty');
        bubble.classList.add('emoji-' + emojiEntities.length + 'x', 'emoji-big');

        bubble.append(attachmentDiv);
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

    //messageDiv.innerHTML = 'samsung samsung samsung';

    timeSpan.appendChild(timeInner);
    messageDiv.append(timeSpan);
    bubble.prepend(messageDiv);
    //bubble.prepend(timeSpan, messageDiv); // that's bad
  
    if(our) {
      if(message.pFlags.unread || message.mid < 0) this.unreadOut.push(message.mid); // message.mid < 0 added 11.02.2020
      let status = '';
      if(message.mid < 0) status = 'is-sending';
      else status = message.pFlags.unread ? 'is-sent' : 'is-read';
      bubble.classList.add(status);
    } else {
      //this.log('not our message', message, message.pFlags.unread);
      if(message.pFlags.unread) this.unreaded.push(message.mid);
    }

    // media
    if(message.media) {
      let attachmentDiv = document.createElement('div');
      attachmentDiv.classList.add('attachment');

      if(!message.message) {
        messageDiv.classList.add('message-empty');
      }

      let processingWebPage = false;
      switch(message.media._) {
        case 'messageMediaPending': {
          let pending = message.media;
          let preloader = pending.preloader as ProgressivePreloader;

          switch(pending.type) {
            case 'photo': {
              if(pending.size < 5e6) {
                let img = new Image();
                img.src = URL.createObjectURL(pending.file);

                let {w, h} = calcImageInBox(pending.w, pending.h, 380, 380);

                attachmentDiv.style.width = w + 'px';
                attachmentDiv.style.height = h + 'px';
  
                attachmentDiv.append(img);
                preloader.attach(attachmentDiv, false);
                bubble.classList.add('hide-name', 'photo');

                break;
              }
            }

            case 'audio':
            case 'document': {
              let docDiv = wrapDocument(pending);

              let icoDiv = docDiv.querySelector('.document-ico');
              preloader.attach(icoDiv, false);

              messageDiv.classList.remove('message-empty');
              messageDiv.append(docDiv);
              processingWebPage = true;
              break;
            }
              
          }

          break;
        }

        case 'messageMediaPhoto': {
          let photo = message.media.photo;
          this.log('messageMediaPhoto', photo);

          bubble.classList.add('hide-name', 'photo');

          wrapPhoto.call(this, photo, message, attachmentDiv);
          break;
        }

        case 'messageMediaWebPage': {
          processingWebPage = true;

          let webpage = message.media.webpage;
          this.log('messageMediaWebPage', webpage);
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
                wrapVideo.call(this, doc, preview, message);
              //}
            } else {
              doc = null;
            }
          }

          if(webpage.photo && !doc) {
            bubble.classList.add('photo');
            //appPhotosManager.savePhoto(webpage.photo); // hot-fix because no webpage manager

            wrapPhoto.call(this, webpage.photo, message, preview);
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
          bubble.prepend(timeSpan, box);

          //this.log('night running', bubble.scrollHeight);

          break;
        }

        case 'messageMediaDocument': {
          let doc = message.media.document;
          /* if(document.size > 1e6) { // 1mb
            break;
          } */

          this.log('messageMediaDocument', doc);

          if(doc.sticker && doc.size <= 1e6) {
            bubble.classList.add('sticker');

            if(doc.animated) {
              bubble.classList.add('sticker-animated');
            }

            appPhotosManager.setAttachmentSize(doc, attachmentDiv, undefined, undefined, true);
            let preloader = new ProgressivePreloader(attachmentDiv, false);
            bubble.style.height = attachmentDiv.style.height;
            bubble.style.width = attachmentDiv.style.width;
            //appPhotosManager.setAttachmentSize(doc, bubble);
            let load = () => wrapSticker(doc, attachmentDiv, () => {
              if(this.peerID != peerID) {
                this.log.warn('peer changed, canceling sticker attach');
                return false;
              }

              return true;
            }, null, 'chat', false, !!message.pending || !multipleRender).then(() => {
              preloader.detach();
              /* attachmentDiv.style.width = '';
              attachmentDiv.style.height = ''; */
            });

            this.loadMediaQueuePush(load);

            break;
          } else if(doc.mime_type == 'video/mp4' && doc.size <= 20e6) {
            this.log('never get free 2', doc);

            if(doc.type == 'round') {
              bubble.classList.add('round');
            }

            bubble.classList.add('video');
            wrapVideo.call(this, doc, attachmentDiv, message, true, null, false, doc.type == 'round');

            break;
          } else {
            let docDiv = wrapDocument(doc);

            messageDiv.classList.remove('message-empty');
            messageDiv.append(docDiv);
            processingWebPage = true;

            break;
          }
        }
          
        default:
          messageDiv.classList.remove('message-empty');
          messageDiv.innerHTML = 'unrecognized media type: ' + message.media._;
          messageDiv.append(timeSpan);
          this.log.warn('unrecognized media type:', message.media._, message);
          break;
      }

      if(!processingWebPage) {
        bubble.append(attachmentDiv);
      }
    }

    if((this.peerID < 0 && !our) || message.fwd_from || message.reply_to_mid) { // chat
      let title = appPeersManager.getPeerTitle(message.fwdFromID || message.fromID);

      let isHidden = message.fwd_from && !message.fwd_from.from_id && !message.fwd_from.channel_id;
      if(isHidden) {
        this.log('message to render hidden', message);
        title = message.fwd_from.from_name;
        bubble.classList.add('hidden-profile');
      }
      
      //this.log(title);

      if(message.fwdFromID || message.fwd_from) {
        bubble.classList.add('forwarded');

        if(message.savedFrom) {
          let fwd = document.createElement('div');
          fwd.classList.add('forward'/* , 'tgico-forward' */);
          fwd.innerHTML = `
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
            <defs>
              <path d="M13.55 3.24L13.64 3.25L13.73 3.27L13.81 3.29L13.9 3.32L13.98 3.35L14.06 3.39L14.14 3.43L14.22 3.48L14.29 3.53L14.36 3.59L14.43 3.64L22.23 10.85L22.36 10.99L22.48 11.15L22.57 11.31L22.64 11.48L22.69 11.66L22.72 11.85L22.73 12.04L22.71 12.22L22.67 12.41L22.61 12.59L22.53 12.76L22.42 12.93L22.29 13.09L22.23 13.15L14.43 20.36L14.28 20.48L14.12 20.58L13.95 20.66L13.77 20.72L13.58 20.76L13.4 20.77L13.22 20.76L13.03 20.73L12.85 20.68L12.68 20.61L12.52 20.52L12.36 20.4L12.22 20.27L12.16 20.2L12.1 20.13L12.05 20.05L12.01 19.98L11.96 19.9L11.93 19.82L11.89 19.73L11.87 19.65L11.84 19.56L11.83 19.47L11.81 19.39L11.81 19.3L11.8 19.2L11.8 16.42L11 16.49L10.23 16.58L9.51 16.71L8.82 16.88L8.18 17.09L7.57 17.33L7.01 17.6L6.48 17.91L5.99 18.26L5.55 18.64L5.14 19.05L4.77 19.51L4.43 19.99L4.29 20.23L4.21 20.35L4.11 20.47L4 20.57L3.88 20.65L3.75 20.72L3.62 20.78L3.48 20.82L3.33 20.84L3.19 20.84L3.04 20.83L2.9 20.79L2.75 20.74L2.62 20.68L2.53 20.62L2.45 20.56L2.38 20.5L2.31 20.43L2.25 20.36L2.2 20.28L2.15 20.19L2.11 20.11L2.07 20.02L2.04 19.92L2.02 19.83L2.01 19.73L2 19.63L2.04 17.99L2.19 16.46L2.46 15.05L2.85 13.75L3.35 12.58L3.97 11.53L4.7 10.6L5.55 9.8L6.51 9.12L7.59 8.56L8.77 8.13L10.07 7.83L11.48 7.65L11.8 7.63L11.8 4.8L11.91 4.56L12.02 4.35L12.14 4.16L12.25 3.98L12.37 3.82L12.48 3.68L12.61 3.56L12.73 3.46L12.85 3.38L12.98 3.31L13.11 3.27L13.24 3.24L13.37 3.23L13.46 3.23L13.55 3.24Z" id="b13RmHDQtl"></path>
            </defs>
            <use xlink:href="#b13RmHDQtl" opacity="1" fill="#fff" fill-opacity="1"></use>
          </svg>`;
          bubble.append(fwd);
          bubble.dataset.savedFrom = message.savedFrom;
        }

        if(!bubble.classList.contains('sticker')) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.innerHTML = 'Forwarded from ' + title;
          nameDiv.dataset.peerID = message.fwdFromID;
          //nameDiv.style.color = appPeersManager.getPeerColorByID(message.fromID, false);
          bubble.append(nameDiv);
        }
      } else {
        if(message.reply_to_mid) {
          let box = document.createElement('div');
          box.classList.add('box');

          let quote = document.createElement('div');
          quote.classList.add('quote');

          let nameEl = document.createElement('a');
          nameEl.classList.add('name');

          let textDiv = document.createElement('div');
          textDiv.classList.add('text');

          let originalMessage = appMessagesManager.getMessage(message.reply_to_mid);
          let originalPeerTitle = appPeersManager.getPeerTitle(originalMessage.fromID) || '';

          this.log('message to render reply', originalMessage, originalPeerTitle, bubble, message);

          // need to download separately
          if(originalMessage._ == 'messageEmpty') {
            this.log('message to render reply empty, need download', message, message.reply_to_mid);
            appMessagesManager.wrapSingleMessage(message.reply_to_mid);
            this.needUpdate.push({replyMid: message.reply_to_mid, mid: message.mid});

            originalPeerTitle = 'Loading...';
          }

          let originalText = '';
          if(originalMessage.message) {
            originalText = RichTextProcessor.wrapRichText(originalMessage.message, {
              entities: originalMessage.totalEntities
            });
          }

          if(originalMessage.media) {
            switch(originalMessage.media._) {
              case 'messageMediaPhoto':
                if(!originalText) originalText = 'Photo';
                break;
              
              default:
                if(!originalText) originalText = originalMessage.media._;
                break;
            }
          }

          nameEl.innerHTML = originalPeerTitle;
          textDiv.innerHTML = originalText;

          quote.append(nameEl, textDiv);
          box.append(quote);

          if(originalMessage.mid) {
            bubble.setAttribute('data-original-mid', originalMessage.mid);
          } else {
            bubble.setAttribute('data-original-mid', message.reply_to_mid);
          }

          bubble.append(box);
          bubble.classList.add('is-reply');
        }

        /* if(message.media) {
          switch(message.media._) {
            case 'messageMediaWebPage': {
              let nameDiv = document.createElement('div');
              nameDiv.classList.add('name');
              nameDiv.innerText = title;
              bubble.append(nameDiv);
              break;
            }
          }
        } */

        if(!bubble.classList.contains('sticker') && (peerID < 0 && peerID != message.fromID)) {
          let nameDiv = document.createElement('div');
          nameDiv.classList.add('name');
          nameDiv.innerHTML = title;
          nameDiv.style.color = appPeersManager.getPeerColorByID(message.fromID, false);
          nameDiv.dataset.peerID = message.fromID;
          bubble.append(nameDiv);
        } else if(!message.reply_to_mid) {
          bubble.classList.add('hide-name');
        }
  
        //bubble.prepend(avatarDiv);
        /* if(messageDiv.nextElementSibling) {
          bubble.insertBefore(avatarDiv, messageDiv.nextElementSibling);
        } else { */
          
        //}
      }

      if(!our && this.peerID < 0 && 
        (!appPeersManager.isChannel(this.peerID) || appPeersManager.isMegagroup(this.peerID))) {
        let avatarDiv = document.createElement('div');
        avatarDiv.classList.add('user-avatar');
    
        this.log('exec loadDialogPhoto', message);
        if(message.fromID) { // if no - user hidden
          appDialogsManager.loadDialogPhoto(avatarDiv, message.fromID);
        } else if(!title && message.fwd_from && message.fwd_from.from_name) {
          title = message.fwd_from.from_name;
  
          appDialogsManager.loadDialogPhoto(avatarDiv, title);
        }

        avatarDiv.dataset.peerID = message.fromID;
  
        bubble.append(avatarDiv);
      }
    }

    if(message._ == 'messageService') {
      bubble.className = 'service';

      let action = message.action;

      let title = appPeersManager.getPeerTitle(message.fromID);
      let name = document.createElement('div');
      name.classList.add('name');
      name.dataset.peerID = message.fromID;
      name.innerHTML = title;

      // @ts-ignore
      let str = name.outerHTML + ' ' + langPack[action._];
      bubble.innerHTML = `<div class="service-msg">${str}</div>`;
    }
  
    if(updatePosition) {
      let type = our ? 'out' : 'in';
      let containerDiv = reverse ? this.firstContainerDiv : this.lastContainerDiv;
      if(!containerDiv || !containerDiv.classList.contains(type)) {
        /* if(containerDiv) {
          if(reverse) this.chatInner.prepend(containerDiv);
          else this.chatInner.append(containerDiv);
        } */
    
        containerDiv = document.createElement('div');
        containerDiv.classList.add(type);
  
        if(!this.firstContainerDiv) this.firstContainerDiv = containerDiv;
  
        if(reverse) this.firstContainerDiv = containerDiv;
        else this.lastContainerDiv = containerDiv;
      }
  
      if(reverse) {
        /* if(!multipleRender) {
          this.scrollPosition.prepareFor('up'); // лагает из-за этого
        } */
  
        containerDiv.prepend(bubble);
        this.chatInner.prepend(containerDiv);
      } else {
        /* if(!multipleRender) {
          this.scrollPosition.prepareFor('down'); // лагает из-за этого
        } */
  
        containerDiv.append(bubble);
        this.chatInner.append(containerDiv);
      }

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
          const months = ['January', 'February', 'March', 'April', 'May', 'June', 
            'July', 'August', 'September', 'October', 'November', 'December'];
          str = justDate.getFullYear() == new Date().getFullYear() ? 
            months[justDate.getMonth()] + ' ' + justDate.getDate() : 
            justDate.toISOString().split('T')[0].split('-').reverse().join('.');
        }

        let div = document.createElement('div');
        div.classList.add('service');
        div.innerHTML = `<div class="service-msg">${str}</div>`;
        this.log('need to render date message', dateTimestamp, str);
        
        this.dateMessages[dateTimestamp] = {
          div, 
          firstTimestamp: date.getTime()
        };

        //this.chatInner.insertBefore(div, containerDiv);
        containerDiv.insertBefore(div, bubble);
      } else {
        let dateMessage = this.dateMessages[dateTimestamp];
        if(dateMessage.firstTimestamp > date.getTime()) {
          //this.chatInner.insertBefore(dateMessage.div, containerDiv);
          containerDiv.insertBefore(dateMessage.div, bubble);
        }
      }
    }

    /* if(bubble.classList.contains('webpage')) {
      this.log('night running', bubble, bubble.scrollHeight);
    } */

    //return //this.scrollPosition.restore();

    if(!multipleRender) {
      this.scrollPosition.restore();  // лагает из-за этого
    }

    //this.log('history msg', message);
  }

  // reverse means scroll up
  public getHistory(maxID = 0, reverse = false, isBackLimit = false) {
    let peerID = this.peerID;

    if(!maxID && this.lastDialog && this.lastDialog.top_message) {
      maxID = this.lastDialog.top_message/*  + 1 */;
    }

    let loadCount = Object.keys(this.bubbles).length > 0 ? 
      20 : 
      (this.chatInner.parentElement.parentElement.scrollHeight) / 30 * 1.25 | 0;

    if(testScroll) {
      loadCount = 1;
      //if(Object.keys(this.bubbles).length > 0)
      return Promise.resolve(true);
    }

    console.time('render getHistory');
    console.time('render history total');

    let backLimit = 0;
    if(isBackLimit) {
      backLimit = loadCount;
      loadCount = 0;
      maxID += 1;
    }

    return this.getHistoryPromise = appMessagesManager.getHistory(this.peerID, maxID, loadCount, backLimit)
    .then((result: any) => {
      this.log('getHistory result by maxID:', maxID, reverse, isBackLimit, result);

      console.timeEnd('render getHistory');

      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        console.timeEnd('render history total');
        return Promise.reject();
      }

      if(!result || !result.history) {
        console.timeEnd('render history total');
        return true;
      }

      // commented bot getProfile in getHistory!
      if(!result.history/* .filter((id: number) => id > 0) */.length) {
        if(!isBackLimit) {
          this.scrolledAll = true;
        } else {
          this.scrolledAllDown = true;
        }
      }
  
      //this.chatInner.innerHTML = '';

      let history = result.history.slice();
      
      if(reverse) history.reverse();

      console.time('render history');

      if(!isBackLimit) {
        this.scrollPosition.prepareFor(reverse ? 'up' : 'down');
      }
      
      let length = history.length;
      for(let i = length - 1; i >= 0; --i) {
        let msgID = history[i];
  
        let message = appMessagesManager.getMessage(msgID);
  
        this.renderMessage(message, reverse, true);
      }

      if(!isBackLimit) {
        this.scrollPosition.restore();
      }

      console.timeEnd('render history');

      this.getHistoryPromise = undefined;

      console.timeEnd('render history total');

      return true;
    });
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

    let settings: any = {
      _: 'inputPeerNotifySettings',
      flags: 0,
      mute_until: 0
    };

    if(!this.muted) {
      settings.flags |= 2 << 1;
      settings.mute_until = 2147483646;
    } else {
      settings.flags |= 1 << 1;
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
          if(update.chat_id &&
            appChatsManager.hasChat(update.chat_id) &&
            !appChatsManager.isChannel(update.chat_id)) {
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

        this.log('updateNotifySettings', peerID, notify_settings);
        break;
      }

      case 'updateChatPinnedMessage':
      case 'updateUserPinnedMessage': {
        let {id} = update;

        this.log('updateUserPinnedMessage', update);

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
