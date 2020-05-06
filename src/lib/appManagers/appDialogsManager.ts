import { langPack, findUpClassName, $rootScope, escapeRegExp, whichChild } from "../utils";
import appImManager, { AppImManager } from "./appImManager";
import appPeersManager from './appPeersManager';
import appMessagesManager, { AppMessagesManager, Dialog } from "./appMessagesManager";
import appUsersManager, { User } from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ripple, putPreloader } from "../../components/misc";
//import Scrollable from "../../components/scrollable";
import Scrollable from "../../components/scrollable_new";
import appProfileManager from "./appProfileManager";
import { logger } from "../polyfill";

type DialogDom = {
  avatarDiv: HTMLDivElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadMessagesSpan: HTMLSpanElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLDivElement,
  listEl: HTMLLIElement
};

let testScroll = false;

export class AppDialogsManager {
  public chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatListArchived = document.getElementById('dialogs-archived') as HTMLUListElement;
  public pinnedDelimiter: HTMLDivElement;
  /* public chatsHidden: Scrollable["hiddenElements"];
  public chatsVisible: Scrollable["visibleElements"];
  public chatsArchivedHidden: Scrollable["hiddenElements"];
  public chatsArchivedVisible: Scrollable["visibleElements"]; */
  
  public doms: {[peerID: number]: DialogDom} = {};
  public domsArchived: {[peerID: number]: DialogDom} = {};
  public lastActiveListElement: HTMLElement = null;

  private rippleCallback: (value?: boolean | PromiseLike<boolean>) => void = null;
  private lastClickID = 0;
  private lastGoodClickID = 0;

  public chatsArchivedContainer = document.getElementById('chats-archived-container') as HTMLDivElement;
  public chatsContainer = document.getElementById('chats-container') as HTMLDivElement;
  private chatsArchivedOffsetIndex = 0;
  private chatsOffsetIndex = 0;
  private chatsPreloader: HTMLDivElement;
  //private chatsLoadCount = 0;
  //private loadDialogsPromise: Promise<any>;
  private loadDialogsPromise: ReturnType<AppMessagesManager["getConversations"]>;

  private loadedAll = false;
  private loadedArchivedAll = false;

  public scroll: Scrollable = null;
  public scrollArchived: Scrollable = null;

  private log = logger('DIALOGS');

  constructor() {
    this.chatsPreloader = putPreloader(null, true);
    //this.chatsContainer.append(this.chatsPreloader);
    
    this.pinnedDelimiter = document.createElement('div');
    this.pinnedDelimiter.classList.add('pinned-delimiter');
    this.pinnedDelimiter.appendChild(document.createElement('span'));

    //this.chatsLoadCount = Math.round(document.body.scrollHeight / 70 * 1.5);

    let splitOffset = 1110;
    
    this.scroll = new Scrollable(this.chatsContainer, 'y', splitOffset, 'CL', this.chatList, 500);
    this.scroll.setVirtualContainer(this.chatList);
    this.scroll.onScrolledBottom = this.onChatsScroll.bind(this);
    /* this.chatsHidden = this.scroll.hiddenElements;
    this.chatsVisible = this.scroll.visibleElements; */

    this.scrollArchived = new Scrollable(this.chatsArchivedContainer, 'y', splitOffset, 'CLA', this.chatListArchived, 500);
    this.scrollArchived.setVirtualContainer(this.chatListArchived);
    this.scrollArchived.onScrolledBottom = this.onChatsArchivedScroll.bind(this);
    /* this.chatsArchivedHidden = this.scrollArchived.hiddenElements;
    this.chatsArchivedVisible = this.scrollArchived.visibleElements; */
    //this.scrollArchived.container.addEventListener('scroll', this.onChatsArchivedScroll.bind(this));

    //let chatClosedDiv = document.getElementById('chat-closed');

    this.setListClickListener(this.chatList);
    this.setListClickListener(this.chatListArchived);

    if(testScroll) {
      let i = 0;
      let add = () => {
        let li = document.createElement('li');
        li.dataset.id = '' + i;
        li.id = '' + i;
        li.innerHTML = `<div class="rp"><div class="user-avatar" style="background-color: rgb(166, 149, 231); font-size: 0px;"><img src="assets/img/pepe.jpg"></div><div class="user-caption"><p><span class="user-title">${i}</span><span><span class="message-status"></span><span class="message-time">18:33</span></span></p><p><span class="user-last-message"><b>-_-_-_-: </b>qweasd</span><span></span></p></div></div>`;
        i++;
        this.scroll.append(li);
      };
      for(let i = 0; i < 1000; ++i) {
        add();
      }
      (window as any).addElement = add;
    }

    window.addEventListener('resize', () => {
      //this.chatsLoadCount = Math.round(document.body.scrollHeight / 70 * 1.5);
      
      setTimeout(() => {
        this.onChatsArchivedScroll();
      }, 0);
    });

    $rootScope.$on('user_update', (e: CustomEvent) => {
      let userID = e.detail;

      let user = appUsersManager.getUser(userID);

      let dialog = appMessagesManager.getDialogByPeerID(user.id)[0];
      //console.log('updating user:', user, dialog);

      if(dialog && !appUsersManager.isBot(dialog.peerID) && dialog.peerID != $rootScope.myID) {
        let online = user.status && user.status._ == 'userStatusOnline';
        let dom = this.getDialogDom(dialog.peerID);

        if(dom) {
          if(online) {
            dom.avatarDiv.classList.add('is-online');
          } else {
            dom.avatarDiv.classList.remove('is-online');
          }
        }
      }

      if(appImManager.peerID == user.id) {
        appImManager.setPeerStatus();
      }
    });

    $rootScope.$on('dialog_top', (e: CustomEvent) => {
      let dialog: any = e.detail;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);
    });

    $rootScope.$on('dialogs_multiupdate', (e: CustomEvent) => {
      let dialogs = e.detail;

      let performed = 0;
      for(let id in dialogs) {
        let dialog = dialogs[id];

        /////console.log('updating dialog:', dialog);

        ++performed;

        if(!(dialog.peerID in this.doms)) {
          this.addDialog(dialog);
          continue;
        } 

        this.setLastMessage(dialog);
        this.setDialogPosition(dialog);
      }
    });

    $rootScope.$on('dialog_unread', (e: CustomEvent) => {
      let info: {
        peerID: number,
        count: number
      } = e.detail;

      let dialog = appMessagesManager.getDialogByPeerID(info.peerID)[0];
      if(dialog) {
        this.setUnreadMessages(dialog);

        if(dialog.peerID == appImManager.peerID) {
          appImManager.updateUnreadByDialog(dialog);
        }
      }
    });

    this.loadDialogs().then(result => {
      //appSidebarLeft.onChatsScroll();
      this.loadDialogs(true);
    });
  }

  public async loadDialogs(archived = false) {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;
    
    (archived ? this.chatsArchivedContainer : this.chatsContainer).append(this.chatsPreloader);
    
    //let offset = appMessagesManager.generateDialogIndex();/* appMessagesManager.dialogsNum */;

    let offset = archived ? this.chatsArchivedOffsetIndex : this.chatsOffsetIndex;
    //let offset = 0;

    let scroll = archived ? this.scrollArchived : this.scroll;

    try {
      console.time('getDialogs time');

      let loadCount = 50/*this.chatsLoadCount */;
      this.loadDialogsPromise = appMessagesManager.getConversations(offset, loadCount, +archived);
      
      let result = await this.loadDialogsPromise;

      console.timeEnd('getDialogs time');
      
      if(result && result.dialogs && result.dialogs.length) {
        let index = result.dialogs[result.dialogs.length - 1].index;

        if(archived) this.chatsArchivedOffsetIndex = index;
        else this.chatsOffsetIndex = index;

        result.dialogs.forEach((dialog: any) => {
          this.addDialog(dialog);
        });
      }

      if(!result.dialogs.length || (archived ? this.scrollArchived.length == result.count : this.scroll.length == result.count)) { // loaded all
        if(archived) this.loadedArchivedAll = true;
        else this.loadedAll = true;
      }

      /* if(archived) {
        let count = result.count;
        this.archivedCount.innerText = '' + count;
      } */

      this.log('getDialogs ' + loadCount + ' dialogs by offset:', offset, result, this.scroll.length);
      this.scroll.onScroll();
    } catch(err) {
      this.log.error(err);
    }
    
    this.chatsPreloader.remove();
    this.loadDialogsPromise = undefined;
  }
  
  public onChatsScroll() {
    if(this.loadedAll /* || this.scroll.hiddenElements.down.length > 0 */ || this.loadDialogsPromise/*  || 1 == 1 */) return;
    
    this.loadDialogs();
  }

  public onChatsArchivedScroll() {
    if(this.loadedArchivedAll /* || this.scrollArchived.hiddenElements.down.length > 0 */ || this.loadDialogsPromise/*  || 1 == 1 */) return;
    
    this.loadDialogs(true);
  }

  public setListClickListener(list: HTMLUListElement, onFound?: () => void) {
    list.addEventListener('click', (e: Event) => {
      //return;
      console.log('dialogs click list');
      let target = e.target as HTMLElement;
      let elem = target.classList.contains('rp') ? target : findUpClassName(target, 'rp');

      if(!elem) {
        return;
      }

      elem = elem.parentElement;

      let samePeer = this.lastActiveListElement == elem;

      if(this.lastActiveListElement && !samePeer) {
        this.lastActiveListElement.classList.remove('active');
      }

      let startTime = Date.now();
      let result: ReturnType<AppImManager['setPeer']>;
      //console.log('appDialogsManager: lock lazyLoadQueue');
      if(elem) {
        /* if(chatClosedDiv) {
          chatClosedDiv.style.display = 'none';
        } */

        if(onFound) onFound();

        let peerID = +elem.getAttribute('data-peerID');
        let lastMsgID = +elem.dataset.mid;

        if(!samePeer) {
          elem.classList.add('active');
          this.lastActiveListElement = elem;
        }

        result = appImManager.setPeer(peerID, lastMsgID, false, true);

        if(result instanceof Promise) {
          this.lastGoodClickID = this.lastClickID;
          appImManager.lazyLoadQueue.lock();
        }
      } else /* if(chatClosedDiv) */ {
        result = appImManager.setPeer(0);
        //chatClosedDiv.style.display = '';
      }

      /* if(!(result instanceof Promise)) { // if click on same dialog
        this.rippleCallback();
        this.rippleCallback = null;
      } */

      /* promise.then(() => {
        appImManager.lazyLoadQueue.unlock();
      }); */

      /* promise.then(() => {
        let length = appImManager.lazyLoadQueue.length();
        console.log('pre ripple callback', length);

        if(length) {
          setTimeout(() => {
            this.rippleCallback();
          }, length * 25);
        } else {
          let elapsedTime = Date.now() - startTime;
          this.rippleCallback(elapsedTime > 200);
        }
      }); */
    });
  }

  public setDialogPosition(dialog: any) {
    let pos = appMessagesManager.getDialogByPeerID(dialog.peerID)[1];
    let dom = this.getDialogDom(dialog.peerID);
    let prevPos = whichChild(dom.listEl);
    if(prevPos == pos) {
      return;
    } else if(prevPos < pos) { // was higher
      pos += 1;
    }
    
    let chatList = dialog.folder_id == 1 ? this.chatListArchived : this.chatList;
    if(chatList.childElementCount > pos) {
      chatList.insertBefore(dom.listEl, chatList.children[pos]);
    } else {
      chatList.append(dom.listEl);
    }

    // fix order
    (Array.from(chatList.children) as HTMLElement[]).forEach((el, idx) => {
      el.dataset.virtual = '' + idx;
    });

    this.log('setDialogPosition:', dialog, dom, pos);
  }

  /* public sortDom(archived = false) {
    //if(archived) return;

    let dialogs = appMessagesManager.dialogsStorage.dialogs.slice();

    let inUpper: Scrollable['hiddenElements']['up'] = [];
    let inBottom: Scrollable['hiddenElements']['down'] = [];
    let inVisible: Scrollable['visibleElements'] = [];
    let pinnedDialogs = [];

    let sorted = dialogs;

    if(!archived) {
      for(let i = 0; i < dialogs.length; ++i) {
        let dialog = dialogs[i];
        if(!dialog.pFlags.pinned) break;
        pinnedDialogs.push(dialog);
      }

      if(pinnedDialogs.length) {
        let dom = this.getDialogDom(pinnedDialogs[pinnedDialogs.length - 1].peerID);
        if(dom) {
          dom.listEl.append(this.pinnedDelimiter);
        }
      } else {
        if(this.pinnedDelimiter.parentElement) {
          this.pinnedDelimiter.parentElement.removeChild(this.pinnedDelimiter);
        }
      }

      sorted = sorted.filter((d: any) => !d.pFlags.pinned && d.folder_id != 1);
    } else {
      sorted = sorted.filter((d: any) => d.folder_id == 1);
    }

    sorted = sorted.sort((a: any, b: any) => {
      let timeA = appMessagesManager.getMessage(a.top_message).date;
      let timeB = appMessagesManager.getMessage(b.top_message).date;

      return timeB - timeA;
    });

    if(!archived) {
      sorted = pinnedDialogs.concat(sorted);
    }

    //console.log('sortDom', sorted, this.chatsHidden, this.chatsHidden.up, this.chatsHidden.down);

    let chatList = archived ? this.chatListArchived : this.chatList;
    let chatsHidden = archived ? this.chatsArchivedHidden : this.chatsHidden;
    let chatsVisible = archived ? this.chatsArchivedVisible : this.chatsVisible;

    let hiddenLength: number = chatsHidden.up.length;
    let inViewportLength = chatList.childElementCount;
    let concated = chatsHidden.up.concat(chatsVisible, chatsHidden.down);

    //console.log('sortDom clearing innerHTML', archived, hiddenLength, inViewportLength);

    chatList.innerHTML = '';

    let inViewportIndex = 0;
    sorted.forEach((d: any, idx) => {
      let dom = this.getDialogDom(d.peerID);
      if(!dom) return;

      let child = concated.find((obj: any) => obj.element == dom.listEl);
      if(!child) {
        return this.log.error('no child by listEl:', dom.listEl, archived, concated);
      }

      if(inUpper.length < hiddenLength) {
        inUpper.push(child);
      } else if(inViewportIndex <= inViewportLength - 1) {
        chatList.append(dom.listEl);
        inVisible.push(child);
        ++inViewportIndex;
      } else {
        inBottom.push(child);
      }
    });

    //console.log('sortDom', sorted.length, inUpper.length, chatList.childElementCount, inBottom.length);

    chatsHidden.up = inUpper;
    chatsVisible.length = 0;
    chatsVisible.push(...inVisible);
    chatsHidden.down = inBottom;
  } */

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom, highlightWord?: string) {
    if(!lastMessage) {
      lastMessage = appMessagesManager.getMessage(dialog.top_message);
    }

    ///////console.log('setlastMessage:', lastMessage);

    if(lastMessage._ == 'messageEmpty') return;

    if(!dom) {
      dom = this.getDialogDom(dialog.peerID);
    }

    let peer = dialog.peer;
    let peerID = dialog.peerID;
    //let peerID = appMessagesManager.getMessagePeer(lastMessage);

    //console.log('setting last message:', lastMessage);

    /* if(!dom.lastMessageSpan.classList.contains('user-typing')) */ {
      let lastMessageText = '';

      if(lastMessage.media) {
        switch(lastMessage.media._) {
          case 'messageMediaPhoto':
            lastMessageText += '<i>' + (lastMessage.grouped_id ? 'Album' : 'Photo') + (lastMessage.message ? ', ' : '') + '</i>';
            break;
          case 'messageMediaGeo':
            lastMessageText += '<i>Geolocation</i>';
            break;
          case 'messageMediaDocument':
            let document = lastMessage.media.document;
  
            let found = false;
            for(let attribute of document.attributes) {
              if(found) break;
  
              switch(attribute._) {
                case 'documentAttributeSticker':
                  lastMessageText += RichTextProcessor.wrapRichText(attribute.alt) + '<i>Sticker</i>';
                  found = true;
                  break;
                case 'documentAttributeFilename':
                  lastMessageText += '<i>' + attribute.file_name + '</i>';
                  found = true;
                  break;
                /* default:
                  console.warn('Got unknown document type!', lastMessage);
                  break; */
              }
            }
  
            if(document.type == 'video') {
              lastMessageText = '<i>Video' + (lastMessage.message ? ', ' : '') + '</i>';
              found = true;
            } else if(document.type == 'voice') {
              lastMessageText = '<i>Voice message</i>';
              found = true;
            } else if(document.type == 'gif') {
              lastMessageText = '<i>GIF' + (lastMessage.message ? ', ' : '') + '</i>';
              found = true;
            } else if(document.type == 'round') {
              lastMessageText = '<i>Video message' + (lastMessage.message ? ', ' : '') + '</i>';
              found = true;
            }
  
            if(found) {
              break;
            }
  
          default:
            ///////console.warn('Got unknown lastMessage.media type!', lastMessage);
            break;
        }
      }

      if(lastMessage.action) {
        let action = lastMessage.action;

        console.log('lastMessage action:', action);

        let suffix = '';
        let _ = action._;
        if(_ == "messageActionPhoneCall") {
          _ += '.' + action.type;

          let duration = action.duration;
          if(duration) {
            let d = [];

            d.push(duration % 60 + ' s');
            if(duration >= 60) d.push((duration / 60 | 0) + ' min');
            //if(duration >= 3600) d.push((duration / 3600 | 0) + ' h');
            suffix = ' (' + d.reverse().join(' ') + ')';
          }
        }

        // @ts-ignore
        lastMessageText = '<i>' + langPack[_] + suffix + '</i>';
      }

      let messageText = lastMessage.message;
      let messageWrapped = '';
      if(messageText) {
        let entities = RichTextProcessor.parseEntities(messageText.replace(/\n/g, ' '), {noLinebreakers: true});
        if(highlightWord) {
          let regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
          let match: any;

          if(!entities) entities = [];
          let found = false;
          while((match = regExp.exec(messageText)) !== null) {
            entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
            found = true;
          }
  
          if(found) {
            entities.sort((a: any, b: any) => a.offset - b.offset);
          }
        }
  
        messageWrapped = RichTextProcessor.wrapRichText(messageText, {
          noLinebreakers: true, 
          entities: entities, 
          noTextFormat: true
        });
      }

      dom.lastMessageSpan.innerHTML = lastMessageText + messageWrapped;
  
      /* if(lastMessage.from_id == auth.id) { // You:  */
      if(peer._ != 'peerUser' && peerID != -lastMessage.from_id) {
        let sender = appUsersManager.getUser(lastMessage.from_id);
        if(sender && sender.id) {
          let senderBold = document.createElement('b');

          let str = '';
          if(sender.id == $rootScope.myID) {
            str = 'You';
          } else {
            str = sender.first_name || sender.last_name || sender.username;
          }

          //senderBold.innerText = str + ': ';
          senderBold.innerHTML = RichTextProcessor.wrapRichText(str, {noLinebreakers: true}) + ': ';
          //console.log(sender, senderBold.innerText);
          dom.lastMessageSpan.prepend(senderBold);
        } //////// else console.log('no sender', lastMessage, peerID);
      }
    }

    let timeStr = '';
    let timestamp = lastMessage.date;
    let now = Date.now() / 1000;
    let time = new Date(lastMessage.date * 1000);

    if((now - timestamp) < 86400) { // if < 1 day
      timeStr = ('0' + time.getHours()).slice(-2) + 
        ':' + ('0' + time.getMinutes()).slice(-2);
    } else if((now - timestamp) < (86400 * 7)) { // week
      let date = new Date(timestamp * 1000);
      timeStr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    } else {
      let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      timeStr = months[time.getMonth()] + 
        ' ' + ('0' + time.getDate()).slice(-2);
    }

    dom.lastTimeSpan.innerHTML = timeStr;

    dom.listEl.setAttribute('data-mid', lastMessage.mid);

    if(this.doms[peerID] || this.domsArchived[peerID]) {
      this.setUnreadMessages(dialog);
    }
  }

  public setUnreadMessages(dialog: any) {
    let dom = this.getDialogDom(dialog.peerID);

    dom.statusSpan.innerHTML = '';
    let lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && 
      lastMessage.from_id == $rootScope.myID && lastMessage.peerID != $rootScope.myID && 
      dialog.read_outbox_max_id) { // maybe comment, 06.20.2020
      let outgoing = (lastMessage.pFlags && lastMessage.pFlags.unread)
        /*  && dialog.read_outbox_max_id != 0 */; // maybe uncomment, 31.01.2020
    
      //console.log('outgoing', outgoing, lastMessage);
  
      if(outgoing) {
        dom.statusSpan.classList.remove('tgico-checks');
        dom.statusSpan.classList.add('tgico-check');
      } else {
        dom.statusSpan.classList.remove('tgico-check');
        dom.statusSpan.classList.add('tgico-checks');
      }
    } else dom.statusSpan.classList.remove('tgico-check', 'tgico-checks');

    dom.unreadMessagesSpan.innerHTML = '';
    if(dialog.unread_count) {
      dom.unreadMessagesSpan.innerHTML = dialog.unread_count;
      dom.unreadMessagesSpan.classList.remove('tgico-pinnedchat');
      dom.unreadMessagesSpan.classList.add(new Date(dialog.notify_settings.mute_until * 1000) > new Date() ? 
      'unread-muted' : 'unread');
    } else if(dialog.pFlags.pinned) {
      dom.unreadMessagesSpan.classList.remove('unread', 'unread-muted');
      dom.unreadMessagesSpan.classList.add('tgico-pinnedchat');
    }

    // set archived new count
    if(dialog.folder_id == 1) {
      let sum = Object.keys(this.domsArchived).map(p => +p).reduce((acc: number, peerID: number) => {
        let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
        if(dialog) {
          return acc + dialog.unread_count;
        }

        return acc;
      }, 0);

      $rootScope.$broadcast('dialogs_archived_unread', {count: sum});
    }
  }

  public getDialogDom(peerID: number) {
    return this.doms[peerID] || this.domsArchived[peerID];
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement, drawStatus = true, rippleEnabled = true, onlyFirstName = false) {
    let dialog: Dialog;
    
    if(typeof(_dialog) === 'number') {
      let originalDialog = appMessagesManager.getDialogByPeerID(_dialog)[0];
      if(!originalDialog) {
        originalDialog = {
          peerID: _dialog,
          pFlags: {}
        } as any;
      }

      dialog = originalDialog;
    } else {
      dialog = _dialog;
    }

    let peerID: number = dialog.peerID;

    if((this.doms[peerID] || this.domsArchived[peerID]) && !container) return;

    let title = appPeersManager.getPeerTitle(peerID, false, onlyFirstName);

    let avatarDiv = document.createElement('div');
    avatarDiv.classList.add('user-avatar');

    if(drawStatus && peerID != $rootScope.myID && dialog.peer) {
      let peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          let user = appUsersManager.getUser(peerID);
          //console.log('found user', user);
  
          if(user.status && user.status._ == 'userStatusOnline') {
            avatarDiv.classList.add('is-online');
          }
  
          break;
        default:
          break;
      }
    }

    let captionDiv = document.createElement('div');
    captionDiv.classList.add('user-caption');

    let titleSpan = document.createElement('span');
    titleSpan.classList.add('user-title');

    if(peerID == $rootScope.myID) {
      title = onlyFirstName ? 'Saved' : 'Saved Messages';
    } 

    //console.log('trying to load photo for:', title);
    appProfileManager.putPhoto(avatarDiv, dialog.peerID, true);

    titleSpan.innerHTML = title;
    //p.classList.add('')
    
    let span = document.createElement('span');
    span.classList.add('user-last-message');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    let paddingDiv = document.createElement('div');
    paddingDiv.classList.add('rp');
    paddingDiv.append(avatarDiv, captionDiv);

    if(rippleEnabled) {
      ripple(paddingDiv, (id) => {
        this.log('dialogs click element');
        this.lastClickID = id;
  
        return new Promise((resolve, reject) => {
          this.rippleCallback = resolve;
          //setTimeout(() => resolve(), 100);
          //window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
        });
      }, (id) => {
        //console.log('appDialogsManager: ripple onEnd called!');
        if(id == this.lastGoodClickID) {
          appImManager.lazyLoadQueue.unlock();
        }
      });
    }
    

    let li = document.createElement('li');
    li.append(paddingDiv);
    li.setAttribute('data-peerID', '' + peerID);

    let statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status');

    let lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    let unreadMessagesSpan = document.createElement('span');

    let titleP = document.createElement('p');

    let rightSpan = document.createElement('span');
    rightSpan.append(statusSpan, lastTimeSpan);
    titleP.append(titleSpan, rightSpan);

    let messageP = document.createElement('p');
    messageP.append(span, unreadMessagesSpan);

    captionDiv.append(titleP, messageP);

    let dom: DialogDom = {
      avatarDiv,
      captionDiv,
      titleSpan,
      statusSpan,
      lastTimeSpan,
      unreadMessagesSpan,
      lastMessageSpan: span,
      containerEl: paddingDiv,
      listEl: li
    };

    if(!container) {
      if(dialog.folder_id && dialog.folder_id == 1) {
        this.scrollArchived.append(li);
        this.domsArchived[dialog.peerID] = dom;
      } else {
        this.scroll.append(li);
        this.doms[dialog.peerID] = dom;
      }

      if(dialog.pFlags.pinned) {
        li.classList.add('dialog-pinned');
        //this.chatList.insertBefore(this.pinnedDelimiter, li.nextSibling);
        dom.listEl.append(this.pinnedDelimiter);
      }

      this.setLastMessage(dialog);
    } else {
      container.append(li);
    }
    
    return {dom, dialog};
  }

  public setTyping(dialog: Dialog, user: User) {
    let dom = this.getDialogDom(dialog.peerID);

    let str = '';
    if(dialog.peerID < 0) {
      let s = user.rFirstName || user.username;
      if(!s) return;
      str = s + ' ';
    } 

    let senderBold = document.createElement('i');
    str += 'typing...';
    senderBold.innerHTML = str;

    dom.lastMessageSpan.innerHTML = '';
    dom.lastMessageSpan.append(senderBold);
    dom.lastMessageSpan.classList.add('user-typing');
  }

  public unsetTyping(dialog: Dialog) {
    let dom = this.getDialogDom(dialog.peerID);
    dom.lastMessageSpan.classList.remove('user-typing');
    this.setLastMessage(dialog, null, dom);
  }
}

export default new AppDialogsManager();
