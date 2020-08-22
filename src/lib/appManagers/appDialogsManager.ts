import { findUpClassName, $rootScope, escapeRegExp, whichChild, findUpTag, cancelEvent, formatNumber } from "../utils";
import appImManager, { AppImManager } from "./appImManager";
import appPeersManager from './appPeersManager';
import appMessagesManager, { AppMessagesManager, Dialog, DialogFilter } from "./appMessagesManager";
import appUsersManager, { User } from "./appUsersManager";
import { RichTextProcessor } from "../richtextprocessor";
import { ripple, putPreloader, positionMenu, openBtnMenu, parseMenuButtonsTo, horizontalMenu, attachContextMenuListener } from "../../components/misc";
//import Scrollable from "../../components/scrollable";
import Scrollable from "../../components/scrollable_new";
import { logger, LogLevels } from "../logger";
import appChatsManager from "./appChatsManager";
import AvatarElement from "../../components/avatar";
import { PopupButton, PopupPeer } from "../../components/popup";
import { SliderTab } from "../../components/slider";
import appStateManager from "./appStateManager";
import { touchSupport, isSafari } from "../config";

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

const testScroll = false;
const USEPINNEDDELIMITER = false;

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
  private filterID: number;

  constructor() {
    parseMenuButtonsTo(this.buttons, this.element.children);

    this.buttons.archive.addEventListener('click', () => {
      let dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      if(dialog) {
        appMessagesManager.editPeerFolders([dialog.peerID], +!dialog.folder_id);
      }
    });

    this.buttons.pin.addEventListener('click', () => {
      appMessagesManager.toggleDialogPin(this.selectedID, this.filterID);
    });

    this.buttons.mute.addEventListener('click', () => {
      appImManager.mutePeer(this.selectedID);
    });

    this.buttons.unread.addEventListener('click', () => {
      const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
      if(!dialog) return;

      if(dialog.unread_count) {
        appMessagesManager.readHistory(this.selectedID, dialog.top_message);
        appMessagesManager.markDialogUnread(this.selectedID, true);
      } else {
        appMessagesManager.markDialogUnread(this.selectedID);
      }
    });

    this.buttons.delete.addEventListener('click', () => {
      let firstName = appPeersManager.getPeerTitle(this.selectedID, false, true);

      let callbackFlush = (justClear: boolean) => {
        appMessagesManager.flushHistory(this.selectedID, justClear);
      };

      let callbackLeave = () => {
        appChatsManager.leaveChannel(-this.selectedID);
      };

      let title: string, description: string, buttons: PopupButton[];
      switch(this.peerType) {
        case 'channel': {
          title = 'Leave Channel?';
          description = `Are you sure you want to leave this channel?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: callbackLeave
          }];

          break;
        }

        case 'megagroup': {
          title = 'Leave Group?';
          description = `Are you sure you want to leave this group?`;
          buttons = [{
            text: 'LEAVE ' + firstName,
            isDanger: true,
            callback: callbackLeave
          }];

          break;
        }

        case 'chat': {
          title = 'Delete Chat?';
          description = `Are you sure you want to delete chat with <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE FOR ME AND ' + firstName,
            isDanger: true,
            callback: () => callbackFlush(false)
          }, {
            text: 'DELETE JUST FOR ME',
            isDanger: true,
            callback: () => callbackFlush(true)
          }];

          break;
        }

        case 'saved': {
          title = 'Delete Saved Messages?';
          description = `Are you sure you want to delete all your saved messages?`;
          buttons = [{
            text: 'DELETE SAVED MESSAGES',
            isDanger: true,
            callback: () => callbackFlush(false)
          }];

          break;
        }

        case 'group': {
          title = 'Delete and leave Group?';
          description = `Are you sure you want to delete all message history and leave <b>${firstName}</b>?`;
          buttons = [{
            text: 'DELETE AND LEAVE ' + firstName,
            isDanger: true,
            callback: () => callbackFlush(true)
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

  onContextMenu = (e: MouseEvent | Touch) => {
    let li: HTMLElement = null;
    
    try {
      li = findUpTag(e.target, 'LI');
    } catch(e) {}
    
    if(!li) return;

    if(e instanceof MouseEvent) e.preventDefault();
    if(this.element.classList.contains('active')) {
      return false;
    }
    if(e instanceof MouseEvent) e.cancelBubble = true;

    this.filterID = appDialogsManager.filterID;

    this.selectedID = +li.getAttribute('data-peerID');
    const dialog = appMessagesManager.getDialogByPeerID(this.selectedID)[0];
    const notOurDialog = dialog.peerID != $rootScope.myID;

    // archive button
    if(notOurDialog) {
      const button = this.buttons.archive;
      const condition = dialog.folder_id == 1;
      button.classList.toggle('flip-icon', condition);
      button.innerText = condition ? 'Unarchive' : 'Archive';
      this.buttons.archive.style.display = '';
    } else {
      this.buttons.archive.style.display = 'none';
    }
    
    // pin button
    {
      const button = this.buttons.pin;
      //const condition = !!dialog.pFlags?.pinned;
      const condition = this.filterID > 1 ? appMessagesManager.filtersStorage.filters[this.filterID].pinned_peers.includes(dialog.peerID) : !!dialog.pFlags?.pinned;
      button.classList.toggle('flip-icon', condition);
      button.innerText = condition ? 'Unpin' : 'Pin';
    }

    // mute button
    if(notOurDialog) {
      const button = this.buttons.mute;
      const condition = dialog.notify_settings && dialog.notify_settings.mute_until > (Date.now() / 1000 | 0);
      button.classList.toggle('flip-icon', condition);
      button.innerText = condition ? 'Unmute' : 'Mute';
      this.buttons.mute.style.display = '';
    } else {
      this.buttons.mute.style.display = 'none';
    }

    // unread button
    {
      const button = this.buttons.unread;
      const condition = !!(dialog.pFlags?.unread_mark || dialog.unread_count);
      button.classList.toggle('flip-icon', condition);
      button.innerText = condition ? 'Mark as Read' : 'Mark as Unread';
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
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave group';
      this.peerType = 'megagroup';
    } else if(appPeersManager.isChannel(this.selectedID)) {
      deleteButtonText = 'Leave';
      //deleteButtonText = 'Leave channel';
      this.peerType = 'channel';
    } else if(this.selectedID < 0) {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete and leave';
      this.peerType = 'group';
    } else {
      deleteButtonText = 'Delete';
      //deleteButtonText = 'Delete chat';
      this.peerType = this.selectedID == $rootScope.myID ? 'saved' : 'chat';
    }
    this.buttons.delete.innerText = deleteButtonText;

    li.classList.add('menu-open');
    positionMenu(e, this.element);
    openBtnMenu(this.element, () => {
      li.classList.remove('menu-open');
    });
  };
}

export class AppArchivedTab implements SliderTab {
  public container = document.getElementById('chats-archived-container') as HTMLDivElement;
  public chatList = document.getElementById('dialogs-archived') as HTMLUListElement;
  public scroll: Scrollable = null;
  public loadedAll: boolean;
  public loadDialogsPromise: Promise<any>;
  public wasFilterID: number;

  init() {
    this.scroll = new Scrollable(this.container, 'y', 'CLA', this.chatList, 500);
    this.scroll.setVirtualContainer(this.chatList);
    this.scroll.onScrolledBottom = appDialogsManager.onChatsScroll;
    ///this.scroll.attachSentinels();

    appDialogsManager.setListClickListener(this.chatList, null, true);

    window.addEventListener('resize', () => {
      setTimeout(appDialogsManager.onChatsScroll, 0);
    });
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.wasFilterID = appDialogsManager.filterID;
    appDialogsManager.scroll = this.scroll;
    appDialogsManager.filterID = 1;
    appDialogsManager.onTabChange();
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    appDialogsManager.chatLists[this.wasFilterID].innerHTML = '';
  }

  onClose() {
    appDialogsManager.scroll = appDialogsManager._scroll;
    appDialogsManager.filterID = this.wasFilterID;
    appDialogsManager.onTabChange();
  }

  onCloseAfterTimeout() {
    this.chatList.innerHTML = '';
  }
}

export const archivedTab = new AppArchivedTab();

export class AppDialogsManager {
  public _chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatList = this._chatList;
  
  public pinnedDelimiter: HTMLDivElement;
  /* public chatsHidden: Scrollable["hiddenElements"];
  public chatsVisible: Scrollable["visibleElements"];
  public chatsArchivedHidden: Scrollable["hiddenElements"];
  public chatsArchivedVisible: Scrollable["visibleElements"]; */
  
  public doms: {[peerID: number]: DialogDom} = {};
  public lastActiveListElement: HTMLElement = null;

  /* private rippleCallback: (value?: boolean | PromiseLike<boolean>) => void = null;
  private lastClickID = 0;
  private lastGoodClickID = 0; */

  public chatsContainer = document.getElementById('chats-container') as HTMLDivElement;
  private chatsPreloader: HTMLDivElement;

  public loadDialogsPromise: Promise<any>;
  public loadedAll = false;

  public scroll: Scrollable = null;
  public _scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogLevels.log | LogLevels.error | LogLevels.warn | LogLevels.debug);

  public contextMenu = new DialogsContextMenu();

  public chatLists: {[filterID: number]: HTMLUListElement} = {
    0: this.chatList,
    1: archivedTab.chatList
  };
  public filterID = 0;
  private folders: {[k in 'menu' | 'container' | 'menuScrollContainer']: HTMLElement} = {
    menu: document.getElementById('folders-tabs'),
    menuScrollContainer: null,
    container: document.getElementById('folders-container')
  };
  private filtersRendered: {
    [filterID: string]: {
      menu: HTMLElement, 
      container: HTMLElement,
      unread: HTMLElement
    }
  } = {};
  private showFiltersTimeout: number;
  private allUnreadCount: HTMLElement;

  private accumulateArchivedTimeout: number;

  constructor() {
    this.chatsPreloader = putPreloader(null, true);

    this.allUnreadCount = this.folders.menu.querySelector('.unread-count');
    
    if(USEPINNEDDELIMITER) {
      this.pinnedDelimiter = document.createElement('div');
      this.pinnedDelimiter.classList.add('pinned-delimiter');
      this.pinnedDelimiter.appendChild(document.createElement('span'));
    }

    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    this.scroll = this._scroll = new Scrollable(this.chatsContainer, 'y', 'CL', this.chatList, 500);
    this.scroll.onScrolledBottom = this.onChatsScroll;
    this.scroll.setVirtualContainer(this.chatList);
    //this.scroll.attachSentinels();

    if(touchSupport && isSafari) {
      let allowUp: boolean, allowDown: boolean, slideBeginY: number;
      const container = this.scroll.container;
      container.addEventListener('touchstart', (event) => {
        allowUp = container.scrollTop > 0;
        allowDown = (container.scrollTop < container.scrollHeight - container.clientHeight);
        // @ts-ignore
        slideBeginY = event.pageY;
      });
      
      container.addEventListener('touchmove', (event: any) => {
        var up = (event.pageY > slideBeginY);
        var down = (event.pageY < slideBeginY);
        slideBeginY = event.pageY;
        if((up && allowUp) || (down && allowDown)) {
          event.stopPropagation();
        } else if(up || down) {
          event.preventDefault();
        }
      });
    }

    this.setListClickListener(this.chatList, null, true);

    if(testScroll) {
      let i = 0;
      let add = () => {
        let li = document.createElement('li');
        li.dataset.id = '' + i;
        li.id = '' + i;
        li.innerHTML = `<div class="rp"><avatar-element style="background-color: rgb(166, 149, 231); font-size: 0px;"><img src="assets/img/pepe.jpg"></avatar-element><div class="user-caption"><p><span class="user-title">${i}</span><span><span class="message-status"></span><span class="message-time">18:33</span></span></p><p><span class="user-last-message"><b>-_-_-_-: </b>qweasd</span><span></span></p></div></div>`;
        i++;
        this.scroll.append(li);
      };
      for(let i = 0; i < 100; ++i) {
        add();
      }
      (window as any).addElement = add;
    }

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

      if($rootScope.selectedPeerID == user.id) {
        appImManager.setPeerStatus();
      }
    });

    $rootScope.$on('dialog_top', (e: CustomEvent) => {
      let dialog: any = e.detail;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setPinnedDelimiter();
      this.setFiltersUnreadCount();
    });

    $rootScope.$on('dialog_flush', (e: CustomEvent) => {
      let peerID: number = e.detail.peerID;
      let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
      if(dialog) {
        this.setLastMessage(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    $rootScope.$on('dialogs_multiupdate', (e: CustomEvent) => {
      const dialogs = e.detail;

      for(const id in dialogs) {
        const dialog = dialogs[id];
        this.updateDialog(dialog);
      }

      this.setPinnedDelimiter();
      this.validateForFilter();
      this.setFiltersUnreadCount();
    });

    $rootScope.$on('dialog_drop', (e: CustomEvent) => {
      let {peerID, dialog} = e.detail;

      let dom = this.getDialogDom(peerID);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[peerID];
        this.scroll.reorder();
      }

      this.setFiltersUnreadCount();
    });

    $rootScope.$on('dialog_unread', (e: CustomEvent) => {
      let info: {
        peerID: number,
        count: number
      } = e.detail;

      let dialog = appMessagesManager.getDialogByPeerID(info.peerID)[0];
      if(dialog) {
        this.setUnreadMessages(dialog);

        if(dialog.peerID == $rootScope.selectedPeerID) {
          appImManager.updateUnreadByDialog(dialog);
        }

        this.validateForFilter();
        this.setFiltersUnreadCount();
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

    $rootScope.$on('filter_update', (e: CustomEvent) => {
      const filter: DialogFilter = e.detail;
      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
      } else if(filter.id == this.filterID) { // это нет тут смысла вызывать, так как будет dialogs_multiupdate
        //this.validateForFilter();
        const folder = appMessagesManager.dialogsStorage.getFolder(filter.id);
        this.validateForFilter();
        for(let i = 0, length = folder.length; i < length; ++i) {
          const dialog = folder[i];
          this.updateDialog(dialog);
        }
        this.setFiltersUnreadCount();
      }
    });

    $rootScope.$on('filter_delete', (e: CustomEvent) => {
      const filter: DialogFilter = e.detail;
      const elements = this.filtersRendered[filter.id];
      if(!elements) return;

      // set tab
      //(this.folders.menu.firstElementChild.children[Math.max(0, filter.id - 2)] as HTMLElement).click();
      (this.folders.menu.firstElementChild.children[0] as HTMLElement).click();

      elements.container.remove();
      elements.menu.remove();
      
      delete this.chatLists[filter.id];
      delete this.filtersRendered[filter.id];

      if(!Object.keys(this.filtersRendered).length) {
        this.folders.menuScrollContainer.classList.add('hide');
      }
    });

    /* $rootScope.$on('filter_pinned_order', (e: CustomEvent) => {
      const {order, id} = e.detail as {order: number[], id: number};
      if(this.prevTabID != id) {
        return;
      }

      for(const peerID of order) {
        this.updateDialog(appMessagesManager.getDialogByPeerID(peerID)[0]);
      }
    }); */

    new Scrollable(this.folders.menuScrollContainer, 'x');
    this.chatsContainer.prepend(this.folders.menuScrollContainer);
    const selectTab = horizontalMenu(this.folders.menu, this.folders.container, (id, tabContent) => {
      /* if(id != 0) {
        id += 1;
      } */

      id = +tabContent.dataset.filterID || 0;

      if(this.filterID == id) return;

      this.chatLists[id].innerHTML = '';
      this.scroll.setVirtualContainer(this.chatLists[id]);
      this.filterID = id;
      this.onTabChange();
    }, () => {
      for(const folderID in this.chatLists) {
        if(+folderID != this.filterID) {
          this.chatLists[folderID].innerHTML = '';
        }
      }
    });

    //selectTab(0);
    (this.folders.menu.firstElementChild.firstElementChild as HTMLElement).click();

    /* false &&  */appStateManager.loadSavedState().then(() => {
      return appMessagesManager.filtersStorage.getDialogFilters();
    }).then(filters => {
      for(const filterID in filters) {
        this.addFilter(filters[filterID]);
      }

      return this.loadDialogs(this.filterID);
    }).then(result => {
      this.setPinnedDelimiter();
      //appSidebarLeft.onChatsScroll();
      this.loadDialogs(1);
    });
  }

  private updateDialog(dialog: Dialog) {
    if(!dialog) {
      return;
    }

    if(!this.doms.hasOwnProperty(dialog.peerID)) {
      this.addDialog(dialog);
    }

    if(this.getDialogDom(dialog.peerID)) {
      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);
    }
  }

  onTabChange = () => {
    this.doms = {};
    this.loadedAll = false;
    this.lastActiveListElement = null;
    this.chatList = this.chatLists[this.filterID];
    this.loadDialogs(this.filterID);
  };

  public setFilterUnreadCount(filterID: number, folder?: Dialog[]) {
    const unreadSpan = filterID == 0 ? this.allUnreadCount : this.filtersRendered[filterID]?.unread;
    if(!unreadSpan) {
      return;
    }

    folder = folder || appMessagesManager.dialogsStorage.getFolder(filterID);
    const sum = folder.reduce((acc, dialog) => acc + +!!dialog.unread_count, 0);
    
    unreadSpan.innerText = sum ? '' + sum : '';
  }

  public setFiltersUnreadCount() {
    for(const filterID in this.filtersRendered) {
      this.setFilterUnreadCount(+filterID);
    }

    this.setFilterUnreadCount(0);
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  public validateForFilter() {
    if(this.filterID == 0) return;

    const folder = appMessagesManager.dialogsStorage.getFolder(this.filterID);
    let affected = false;
    for(const _peerID in this.doms) {
      const peerID = +_peerID;

      // если больше не подходит по фильтру, удаляем
      if(folder.findIndex((dialog) => dialog.peerID == peerID) === -1) {
        const listEl = this.doms[peerID].listEl;
        listEl.remove();
        affected = true;

        if(this.lastActiveListElement == listEl) {
          this.lastActiveListElement = null;
        }
      }
    }

    if(affected) {
      this.scroll.reorder();
    }
  }

  public addFilter(filter: DialogFilter) {
    if(this.filtersRendered[filter.id]) return;

    const li = document.createElement('li');
    const span = document.createElement('span');
    span.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    const unreadSpan = document.createElement('span');
    unreadSpan.classList.add('unread-count');
    li.append(span, unreadSpan);
    ripple(li);
  
    this.folders.menu.firstElementChild.append(li);

    const ul = document.createElement('ul');
    const div = document.createElement('div');
    div.append(ul);
    div.dataset.filterID = '' + filter.id;
    this.folders.container.append(div);

    this.chatLists[filter.id] = ul;
    this.setListClickListener(ul, null, true);

    if(!this.showFiltersTimeout) {
      this.showFiltersTimeout = setTimeout(() => {
        this.showFiltersTimeout = 0;
        this.folders.menuScrollContainer.classList.remove('hide');
        this.setFiltersUnreadCount();
      }, 0);
    }

    this.filtersRendered[filter.id] = {
      menu: li,
      container: div,
      unread: unreadSpan
    };
  }

  public async loadDialogs(folderID: number) {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;
    
    if(!this.chatList.childElementCount) {
      const container = this.chatList.parentElement;
      container.append(this.chatsPreloader);
    }

    const storage = appMessagesManager.dialogsStorage.getFolder(folderID);
    let offsetIndex = 0;
    
    for(let i = storage.length - 1; i >= 0; --i) {
      const dialog = storage[i];
      if(this.getDialogDom(dialog.peerID)) {
        offsetIndex = dialog.index;
        break;
      }
    }
    //let offset = storage[storage.length - 1]?.index || 0;

    try {
      //console.time('getDialogs time');

      const loadCount = 50/*this.chatsLoadCount */;

      const getConversationPromise = (this.filterID > 1 ? appUsersManager.getContacts() as Promise<any> : Promise.resolve()).then(() => {
        return appMessagesManager.getConversations('', offsetIndex, loadCount, folderID);
      });

      this.loadDialogsPromise = getConversationPromise;
      
      const result = await getConversationPromise;

      //console.timeEnd('getDialogs time');
      
      if(result && result.dialogs && result.dialogs.length) {
        result.dialogs.forEach((dialog: any) => {
          this.addDialog(dialog);
        });
      }

      if(!result.dialogs.length || this.chatList.childElementCount == result.count) { // loaded all
        this.loadedAll = true;
      }

      this.log.debug('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, this.chatList.childElementCount);
      this.scroll.onScroll();
    } catch(err) {
      this.log.error(err);
    }
    
    this.chatsPreloader.remove();
    this.loadDialogsPromise = undefined;
  }
  
  onChatsScroll = () => {
    if(this.loadedAll || this.loadDialogsPromise) return;
    this.log('onChatsScroll');
    this.loadDialogs(this.filterID);
  }

  public setListClickListener(list: HTMLUListElement, onFound?: () => void, withContext = false) {
    list.addEventListener('click', (e: Event) => {
      cancelEvent(e);

      this.log('dialogs click list');
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

    if(withContext) {
      attachContextMenuListener(list, this.contextMenu.onContextMenu);
    }
  }

  public setDialogPosition(dialog: Dialog, pos?: number) {
    const dom = this.getDialogDom(dialog.peerID);
    if(!dom) {
      return;
    }

    if(pos === undefined) {
      pos = appMessagesManager.dialogsStorage.getDialog(dialog.peerID, this.filterID)[1];
    }

    let prevPos = whichChild(dom.listEl);

    /* let wrongFolder = (dialog.folder_id == 1 && this.chatList == dom.listEl.parentElement) || (dialog.folder_id == 0 && this.chatListArchived == dom.listEl.parentElement);
    let wrongFolder = false;
    if(wrongFolder) prevPos = 0xFFFF; */

    if(prevPos == pos) {
      return;
    } else if(prevPos < pos) { // was higher
      pos += 1;
    }
    
    const chatList = this.chatList;
    if(chatList.childElementCount > pos) {
      chatList.insertBefore(dom.listEl, chatList.children[pos]);
    } else {
      chatList.append(dom.listEl);
    }

    this.scroll.reorder();

    this.log.debug('setDialogPosition:', dialog, dom, pos);
  }

  public setPinnedDelimiter() {
    if(!USEPINNEDDELIMITER) return;

    let index = -1;
    let dialogs = appMessagesManager.dialogsStorage.getFolder(0);
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

      if(!dom) {
        //this.log.error('no dom for dialog:', dialog, lastMessage, dom, highlightWord);
        return;
      }
    }

    if(lastMessage._ == 'messageEmpty' || (lastMessage._ == 'messageService' && !lastMessage.rReply)) {
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

    if(this.doms[peerID] == dom) {
      this.setUnreadMessages(dialog);
    } else { // means search
      dom.listEl.dataset.mid = lastMessage.mid;
    }
  }

  public setUnreadMessages(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerID);

    if(dialog.folder_id == 1) {
      this.accumulateArchivedUnread();
    }

    if(!dom) {
      //this.log.error('setUnreadMessages no dom!', dialog);
      return;
    }

    const lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && !lastMessage.deleted && 
      lastMessage.from_id == $rootScope.myID && lastMessage.peerID != $rootScope.myID && 
      dialog.read_outbox_max_id) { // maybe comment, 06.20.2020
      const outgoing = (lastMessage.pFlags && lastMessage.pFlags.unread)
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

    const filter = appMessagesManager.filtersStorage.filters[this.filterID];
    let isPinned: boolean;
    if(filter) {
      isPinned = filter.pinned_peers.findIndex(peerID => peerID == dialog.peerID) !== -1;
    } else {
      isPinned = !!dialog.pFlags.pinned;
    }

    if(dialog.unread_count || dialog.pFlags.unread_mark) {
      //dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count ? formatNumber(dialog.unread_count, 1) : ' ');
      dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count || ' ');
      dom.unreadMessagesSpan.classList.add((dialog.notify_settings?.mute_until * 1000) > Date.now() ? 
      'unread-muted' : 'unread');
    } else if(isPinned) {
      dom.unreadMessagesSpan.classList.remove('unread', 'unread-muted');
      dom.unreadMessagesSpan.classList.add('tgico-pinnedchat');
    }
  }

  public accumulateArchivedUnread() {
    if(this.accumulateArchivedTimeout) return;
    this.accumulateArchivedTimeout = setTimeout(() => {
      this.accumulateArchivedTimeout = 0;
      const dialogs = appMessagesManager.dialogsStorage.getFolder(1);
      const sum = dialogs.reduce((acc, dialog) => acc + dialog.unread_count, 0);
      $rootScope.$broadcast('dialogs_archived_unread', {count: sum});
    }, 0);
  }

  public getDialogDom(peerID: number) {
    return this.doms[peerID];
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement | Scrollable, drawStatus = true, rippleEnabled = true, onlyFirstName = false, meAsSaved = true) {
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

    if(!container) {
      if(this.doms[peerID]) return;

      const filter = appMessagesManager.filtersStorage.filters[this.filterID];
      if((filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || (!filter && this.filterID != dialog.folder_id)) {
        return;
      }
    }

    let title = appPeersManager.getPeerTitle(peerID, false, onlyFirstName);

    let avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', meAsSaved ? '1' : '0');
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

    // в других случаях иконка верификации не нужна (а первый - это главные чатлисты)
    if(!container) {
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
    }

    if(peerID == $rootScope.myID && meAsSaved) {
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

    /* let good = false;
    for(const folderID in this.chatLists) {
      if(this.chatLists[folderID] == container) {
        good = true;
      }
    } */
    if(!container/*  || good */) {
      this.scroll.append(li);

      this.doms[dialog.peerID] = dom;

      if($rootScope.selectedPeerID == peerID) {
        li.classList.add('active');
        this.lastActiveListElement = li;
      }

      /* if(container) {
        container.append(li);
      } */

      this.setLastMessage(dialog);
    } else {
      container.append(li);
    }
    
    return {dom, dialog};
  }

  public setTyping(dialog: Dialog, user: User) {
    const dom = this.getDialogDom(dialog.peerID);
    if(!dom) {
      return;
    }

    let str = '';
    if(dialog.peerID < 0) {
      let s = user.rFirstName || user.username;
      if(!s) return;
      str = s + ' ';
    } 

    const senderBold = document.createElement('i');
    str += 'typing...';
    senderBold.innerHTML = str;

    dom.lastMessageSpan.innerHTML = '';
    dom.lastMessageSpan.append(senderBold);
    dom.lastMessageSpan.classList.add('user-typing');
  }

  public unsetTyping(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerID);
    if(!dom) {
      return;
    }

    dom.lastMessageSpan.classList.remove('user-typing');
    this.setLastMessage(dialog, null, dom);
  }
}

const appDialogsManager = new AppDialogsManager();
export default appDialogsManager;
