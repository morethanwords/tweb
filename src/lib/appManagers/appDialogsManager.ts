import { findUpClassName, $rootScope, escapeRegExp, whichChild, findUpTag, cancelEvent } from "../utils";
import appImManager, { AppImManager } from "./appImManager";
import appPeersManager from './appPeersManager';
import appMessagesManager, { AppMessagesManager, Dialog } from "./appMessagesManager";
import appUsersManager, { User } from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ripple, putPreloader, positionMenu, openBtnMenu } from "../../components/misc";
//import Scrollable from "../../components/scrollable";
import Scrollable from "../../components/scrollable_new";
import { logger } from "../polyfill";
import appChatsManager from "./appChatsManager";
import AvatarElement from "../../components/avatar";

type DialogDom = {
  avatarEl: AvatarElement,
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

class PopupElement {
  protected element = document.createElement('div');
  protected container = document.createElement('div');
  protected header = document.createElement('div');
  protected title = document.createElement('div');

  constructor(className: string) {
    this.element.classList.add('popup');
    this.element.className = 'popup' + (className ? ' ' + className : '');
    this.container.classList.add('popup-container', 'z-depth-1');

    this.header.classList.add('popup-header');
    this.title.classList.add('popup-title');

    this.header.append(this.title);
    this.container.append(this.header);
    this.element.append(this.container);
  }

  public show() {
    document.body.append(this.element);
    void this.element.offsetWidth; // reflow
    this.element.classList.add('active');
  }

  public destroy() {
    this.element.classList.remove('active');
    setTimeout(() => {
      this.element.remove();
    }, 1000);
  }
}

type PopupPeerButton = {
  text: string,
  callback?: () => void,
  isDanger?: true,
  isCancel?: true
};

class PopupPeer extends PopupElement {
  constructor(private className: string, options: Partial<{
    peerID: number,
    title: string,
    description: string,
    buttons: Array<PopupPeerButton>
  }> = {}) {
    super('popup-peer' + (className ? ' ' + className : ''));

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + options.peerID);
    avatarEl.classList.add('peer-avatar');

    this.title.innerText = options.title || '';
    this.header.prepend(avatarEl);

    let p = document.createElement('p');
    p.classList.add('popup-description');
    p.innerHTML = options.description;

    let buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add('popup-buttons');

    let buttons = options.buttons.map(b => {
      let button = document.createElement('button');
      ripple(button);
      button.className = 'btn' + (b.isDanger ? ' danger' : '');
      button.innerHTML =  b.text;

      if(b.callback) {
        button.addEventListener('click', () => {
          b.callback();
          this.destroy();
        });
      } else if(b.isCancel) {
        button.addEventListener('click', () => {
          this.destroy();
        });
      }

      return button;
    });

    buttonsDiv.append(...buttons);

    this.container.append(p, buttonsDiv);
  }
}

class DialogsContextMenu {
  private element = document.getElementById('dialogs-contextmenu') as HTMLDivElement;
  private buttons: {
    archive: HTMLButtonElement,
    pin: HTMLButtonElement,
    mute: HTMLButtonElement,
    unread: HTMLButtonElement,
    delete: HTMLButtonElement,
    //clear: HTMLButtonElement,
  } = {} as any;
  private selectedID: number;
  private peerType: 'channel' | 'chat' | 'megagroup' | 'group' | 'saved';

  constructor(private attachTo: HTMLElement[]) {
    (Array.from(this.element.querySelectorAll('.btn-menu-item')) as HTMLElement[]).forEach(el => {
      let name = el.className.match(/ menu-(.+?) /)[1];
      // @ts-ignore
      this.buttons[name] = el;
    });

    const onContextMenu = (e: MouseEvent) => {
      let li: HTMLDivElement = null;
      
      try {
        li = findUpTag(e.target, 'LI');
      } catch(e) {}
      
      if(!li) return;

      e.preventDefault();

      if(this.element.classList.contains('active')) {
        /* this.element.classList.remove('active');
        this.element.parentElement.classList.remove('menu-open'); */
        return false;
      }
      
      e.cancelBubble = true;

      this.selectedID = +li.getAttribute('data-peerID');
      const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      const notOurDialog = dialog.peerID != $rootScope.myID;

      // archive button
      if(notOurDialog) {
        const button = this.buttons.archive;
        let text = '';
        if(dialog.folder_id == 1) {
          text = 'Unarchive chat';
          button.classList.remove('tgico-archive');
        } else {
          text = 'Archive chat';
          button.classList.add('tgico-archive');
        }
        button.innerText = text;
        this.buttons.archive.style.display = '';
      } else {
        this.buttons.archive.style.display = 'none';
      }
      
      // pin button
      {
        const button = this.buttons.pin;
        let text = '';
        if(dialog.pFlags?.pinned) {
          text = 'Unpin from top';
          button.classList.remove('tgico-pin');
        } else {
          text = 'Pin to top';
          button.classList.add('tgico-pin');
        }
        button.innerText = text;
      }

      // mute button
      if(notOurDialog) {
        const button = this.buttons.mute;
        let text = '';
        if(dialog.notify_settings && dialog.notify_settings.mute_until > (Date.now() / 1000 | 0)) {
          text = 'Enable notifications';
          button.classList.remove('tgico-mute');
        } else {
          text = 'Disable notifications';
          button.classList.add('tgico-mute');
        }
        button.innerText = text;
        this.buttons.mute.style.display = '';
      } else {
        this.buttons.mute.style.display = 'none';
      }

      // unread button
      {
        const button = this.buttons.unread;
        let text = '';
        if(dialog.pFlags?.unread_mark) {
          text = 'Mark as read';
          button.classList.add('tgico-message');
        } else {
          text = 'Mark as unread';
          button.classList.remove('tgico-message');
        }
        button.innerText = text;
      }

      /* // clear history button
      if(appPeersManager.isChannel(this.selectedID)) {
        this.buttons.clear.style.display = 'none';
      } else {
        this.buttons.clear.style.display = '';
      } */

      // delete button
      let deleteButtonText = '';
      if(appPeersManager.isMegagroup(this.selectedID)) {
        deleteButtonText = 'Leave group';
        this.peerType = 'megagroup';
      } else if(appPeersManager.isChannel(this.selectedID)) {
        deleteButtonText = 'Leave channel';
        this.peerType = 'channel';
      } else if(this.selectedID < 0) {
        deleteButtonText = 'Delete and leave';
        this.peerType = 'group';
      } else {
        deleteButtonText = 'Delete chat';
        this.peerType = this.selectedID == $rootScope.myID ? 'saved' : 'chat';
      }
      this.buttons.delete.innerText = deleteButtonText;

      li.classList.add('menu-open');
      positionMenu(e, this.element);
      openBtnMenu(this.element, () => {
        li.classList.remove('menu-open');
      });
    };

    this.attachTo.forEach(el => {
      el.addEventListener('contextmenu', onContextMenu);
    });

    this.buttons.archive.addEventListener('click', () => {
      let dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      if(dialog) {
        appMessagesManager.editPeerFolders([dialog.peerID], +!dialog.folder_id);
      }
    });

    this.buttons.pin.addEventListener('click', () => {
      appMessagesManager.toggleDialogPin(this.selectedID);
    });

    this.buttons.mute.addEventListener('click', () => {
      appImManager.mutePeer(this.selectedID);
    });

    this.buttons.unread.addEventListener('click', () => {
      appMessagesManager.markDialogUnread(this.selectedID);
    });

    this.buttons.delete.addEventListener('click', () => {
      let firstName = appPeersManager.getPeerTitle(this.selectedID, false, true);

      let callback = (justClear: boolean) => {
        appMessagesManager.flushHistory(this.selectedID, justClear);
      };

      let title: string, description: string, buttons: PopupPeerButton[];
      switch(this.peerType) {
        case 'channel': {
          title = 'Leave Channel?';
          description = `Are you sure you want to leave this channel?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: () => callback(true)
          }];

          break;
        }

        case 'megagroup': {
          title = 'Leave Group?';
          description = `Are you sure you want to leave this group?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: () => callback(true)
          }];

          break;
        }

        case 'chat': {
          title = 'Delete Chat?';
          description = `Are you sure you want to delete chat with <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE FOR ME AND ' + firstName,
            isDanger: true,
            callback: () => callback(false)
          }, {
            text: 'DELETE JUST FOR ME',
            isDanger: true,
            callback: () => callback(true)
          }];

          break;
        }

        case 'saved': {
          title = 'Delete Saved Messages?';
          description = `Are you sure you want to delete all your saved messages?`;
          buttons = [{
            text: 'DELETE SAVED MESSAGES',
            isDanger: true,
            callback: () => callback(false)
          }];

          break;
        }

        case 'group': {
          title = 'Delete and leave Group?';
          description = `Are you sure you want to delete all message history and leave <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE AND LEAVE ' + firstName,
            isDanger: true,
            callback: () => callback(true)
          }];

          break;
        }
      }

      buttons.push({
        text: 'CANCEL',
        isCancel: true
      });

      let popup = new PopupPeer('popup-delete-chat', {
        peerID: this.selectedID,
        title: title,
        description: description,
        buttons: buttons
      });

      popup.show();
    });
  }
}

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
  private chatsPreloader: HTMLDivElement;
  //private chatsLoadCount = 0;
  //private loadDialogsPromise: Promise<any>;
  private loadDialogsPromise: ReturnType<AppMessagesManager["getConversations"]>;

  private loadedAll = false;
  private loadedArchivedAll = false;

  public scroll: Scrollable = null;
  public scrollArchived: Scrollable = null;

  private log = logger('DIALOGS');

  private contextMenu = new DialogsContextMenu([this.chatList, this.chatListArchived]);

  constructor() {
    this.chatsPreloader = putPreloader(null, true);
    
    this.pinnedDelimiter = document.createElement('div');
    this.pinnedDelimiter.classList.add('pinned-delimiter');
    this.pinnedDelimiter.appendChild(document.createElement('span'));

    this.scroll = new Scrollable(this.chatsContainer, 'y', 'CL', this.chatList, 500);
    this.scroll.setVirtualContainer(this.chatList);
    this.scroll.onScrolledBottom = this.onChatsScroll.bind(this);
    //this.scroll.attachSentinels();

    this.scrollArchived = new Scrollable(this.chatsArchivedContainer, 'y', 'CLA', this.chatListArchived, 500);
    this.scrollArchived.setVirtualContainer(this.chatListArchived);
    this.scrollArchived.onScrolledBottom = this.onChatsArchivedScroll.bind(this);
    ///this.scroll.attachSentinels();

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
            dom.avatarEl.classList.add('is-online');
          } else {
            dom.avatarEl.classList.remove('is-online');
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

      this.setPinnedDelimiter();
    });

    $rootScope.$on('dialog_flush', (e: CustomEvent) => {
      let peerID: number = e.detail.peerID;
      let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
      if(dialog) {
        this.setLastMessage(dialog);
      }
    });

    $rootScope.$on('dialogs_multiupdate', (e: CustomEvent) => {
      let dialogs = e.detail;

      for(let id in dialogs) {
        let dialog = dialogs[id];

        /////console.log('updating dialog:', dialog);

        if(!(dialog.peerID in this.doms)) {
          this.addDialog(dialog);
        } 

        this.setLastMessage(dialog);
        this.setDialogPosition(dialog);
      }

      this.setPinnedDelimiter();
    });

    $rootScope.$on('dialog_drop', (e: CustomEvent) => {
      let {peerID, dialog} = e.detail;

      let dom = this.getDialogDom(peerID);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[peerID];
        (dialog.folder_id == 1 ? this.scrollArchived : this.scroll).reorder();
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

    $rootScope.$on('peer_changed', (e: CustomEvent) => {
      let peerID = e.detail;

      let lastPeerID = this.lastActiveListElement && +this.lastActiveListElement.getAttribute('data-peerID');
      if(this.lastActiveListElement && lastPeerID != peerID) {
        this.lastActiveListElement.classList.remove('active');
        this.lastActiveListElement = null;
      }
    
      if(lastPeerID != peerID) {
        let dom = this.getDialogDom(peerID);
        if(dom) {
          this.lastActiveListElement = dom.listEl;
          dom.listEl.classList.add('active');
        }
      }
    });

    appMessagesManager.loaded.then(() => {
      this.loadDialogs().then(result => {
        this.setPinnedDelimiter();
        //appSidebarLeft.onChatsScroll();
        this.loadDialogs(true);
      });
    });
  }

  public async loadDialogs(archived = false) {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;
    
    (archived ? this.chatsArchivedContainer : this.chatsContainer).append(this.chatsPreloader);

    let storage = appMessagesManager.dialogsStorage[+archived] || [];
    let offsetIndex = 0;
    
    for(let i = storage.length - 1; i >= 0; --i) {
      let dialog = storage[i];
      if(this.getDialogDom(dialog.peerID)) {
        offsetIndex = dialog.index;
        break;
      }
    }
    //let offset = storage[storage.length - 1]?.index || 0;

    try {
      console.time('getDialogs time');

      let loadCount = 50/*this.chatsLoadCount */;
      this.loadDialogsPromise = appMessagesManager.getConversations(offsetIndex, loadCount, +archived);
      
      let result = await this.loadDialogsPromise;

      console.timeEnd('getDialogs time');
      
      if(result && result.dialogs && result.dialogs.length) {
        result.dialogs.forEach((dialog: any) => {
          this.addDialog(dialog);
        });
      }

      if(!result.dialogs.length || (archived ? this.scrollArchived.length == result.count : this.scroll.length == result.count)) { // loaded all
        if(archived) this.loadedArchivedAll = true;
        else this.loadedAll = true;
      }

      this.log('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, this.scroll.length, archived);
      this.scroll.onScroll();
    } catch(err) {
      this.log.error(err);
    }
    
    this.chatsPreloader.remove();
    this.loadDialogsPromise = undefined;
  }
  
  public onChatsScroll() {
    if(this.loadedAll || this.loadDialogsPromise) return;
    
    this.loadDialogs();
  }

  public onChatsArchivedScroll() {
    if(this.loadedArchivedAll || this.loadDialogsPromise) return;
    
    this.loadDialogs(true);
  }

  public setListClickListener(list: HTMLUListElement, onFound?: () => void) {
    list.addEventListener('click', (e: Event) => {
      cancelEvent(e);

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

      let result: ReturnType<AppImManager['setPeer']>;
      //console.log('appDialogsManager: lock lazyLoadQueue');
      if(elem) {
        if(onFound) onFound();

        let peerID = +elem.getAttribute('data-peerID');
        let lastMsgID = +elem.dataset.mid || undefined;

        if(!samePeer) {
          elem.classList.add('active');
          this.lastActiveListElement = elem;
        }

        result = appImManager.setPeer(peerID, lastMsgID);

        /* if(result instanceof Promise) {
          this.lastGoodClickID = this.lastClickID;
          appImManager.lazyLoadQueue.lock();
        } */
      } else {
        result = appImManager.setPeer(0);
      }
    }, {capture: true});
  }

  public setDialogPosition(dialog: Dialog) {
    let pos = appMessagesManager.getDialogByPeerID(dialog.peerID)[1];
    let dom = this.getDialogDom(dialog.peerID);
    let prevPos = whichChild(dom.listEl);

    let wrongFolder = (dialog.folder_id == 1 && this.chatList == dom.listEl.parentElement) || (dialog.folder_id == 0 && this.chatListArchived == dom.listEl.parentElement);
    if(wrongFolder) prevPos = 0xFFFF;

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

    (dialog.folder_id == 1 ? this.scrollArchived : this.scroll).reorder();

    this.log('setDialogPosition:', dialog, dom, pos);
  }

  public setPinnedDelimiter() {
    let index = -1;
    let dialogs = appMessagesManager.dialogsStorage[0];
    for(let dialog of dialogs) {
      if(dialog.pFlags?.pinned) {
        index++;
      }
    }

    let currentIndex = (this.pinnedDelimiter.parentElement && whichChild(this.pinnedDelimiter.parentElement)) ?? -1;

    if(index == currentIndex) return;

    let children = this.chatList.children;

    let modifying: HTMLElement[] = [];
    if(currentIndex != -1 && children.length > currentIndex) {
      let li = children[currentIndex] as HTMLElement;
      modifying.push(li);
    }

    if(index != -1 && children.length > index) {
      let li = children[index] as HTMLElement;
      modifying.push(li);
      li.append(this.pinnedDelimiter);
    } else {
      this.pinnedDelimiter.remove();
    }
      
    modifying.forEach(elem => {
      this.scroll.updateElement(elem);
    });
  }

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom, highlightWord?: string) {
    if(!lastMessage) {
      lastMessage = appMessagesManager.getMessage(dialog.top_message);
    }

    ///////console.log('setlastMessage:', lastMessage);
    if(!dom) {
      dom = this.getDialogDom(dialog.peerID);
    }

    if(lastMessage._ == 'messageEmpty') {
      dom.lastMessageSpan.innerHTML = '';
      dom.lastTimeSpan.innerHTML = '';
      delete dom.listEl.dataset.mid;
      return;
    }

    let peer = dialog.peer;
    let peerID = dialog.peerID;
    //let peerID = appMessagesManager.getMessagePeer(lastMessage);

    //console.log('setting last message:', lastMessage);

    /* if(!dom.lastMessageSpan.classList.contains('user-typing')) */ {

      if(highlightWord && lastMessage.message) {
        let lastMessageText = appMessagesManager.getRichReplyText(lastMessage, '');

        let messageText = lastMessage.message;
        let entities = RichTextProcessor.parseEntities(messageText.replace(/\n/g, ' '), {noLinebreakers: true});
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
    
        let messageWrapped = RichTextProcessor.wrapRichText(messageText, {
          noLinebreakers: true, 
          entities: entities, 
          noTextFormat: true
        });

        dom.lastMessageSpan.innerHTML = lastMessageText + messageWrapped;
      } else if(!lastMessage.deleted) {
        dom.lastMessageSpan.innerHTML = lastMessage.rReply;
      } else {
        dom.lastMessageSpan.innerHTML = '';
      }
  
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

    if(!lastMessage.deleted) {
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
    } else dom.lastTimeSpan.innerHTML = '';

    if((this.doms[peerID] || this.domsArchived[peerID]) == dom) {
      this.setUnreadMessages(dialog);
    } else { // means search
      dom.listEl.dataset.mid = lastMessage.mid;
    }
  }

  public setUnreadMessages(dialog: Dialog) {
    let dom = this.getDialogDom(dialog.peerID);

    let lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && !lastMessage.deleted && 
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

    dom.unreadMessagesSpan.innerText = '';
    dom.unreadMessagesSpan.classList.remove('tgico-pinnedchat');
    if(dialog.unread_count || dialog.pFlags.unread_mark) {
      dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count || ' ');
      //dom.unreadMessagesSpan.classList.remove('tgico-pinnedchat');
      dom.unreadMessagesSpan.classList.add(new Date(dialog.notify_settings.mute_until * 1000) > new Date() ? 
      'unread-muted' : 'unread');
    } else if(dialog.pFlags.pinned && dialog.folder_id == 0) {
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

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', '1');
    avatarEl.setAttribute('peer', '' + peerID);
    avatarEl.classList.add('dialog-avatar');

    if(drawStatus && peerID != $rootScope.myID && dialog.peer) {
      let peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          let user = appUsersManager.getUser(peerID);
          //console.log('found user', user);
  
          if(user.status && user.status._ == 'userStatusOnline') {
            avatarEl.classList.add('is-online');
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

    if(peerID < 0) {
      let chat = appChatsManager.getChat(-peerID);
      if(chat && chat.pFlags && chat.pFlags.verified) {
        titleSpan.classList.add('is-verified');
      }
    } else {
      let user = appUsersManager.getUser(peerID);
      if(user && user.pFlags && user.pFlags.verified) {
        titleSpan.classList.add('is-verified');
      }
    }

    if(peerID == $rootScope.myID) {
      title = onlyFirstName ? 'Saved' : 'Saved Messages';
    } 

    titleSpan.innerHTML = title;
    //p.classList.add('')
    
    let span = document.createElement('span');
    span.classList.add('user-last-message');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    let paddingDiv = document.createElement('div');
    paddingDiv.classList.add('rp');
    paddingDiv.append(avatarEl, captionDiv);

    if(rippleEnabled) {
      ripple(paddingDiv);
      /* ripple(paddingDiv, (id) => {
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
      }); */
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
      avatarEl,
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
