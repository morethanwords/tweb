import AvatarElement from "../../components/avatar";
import DialogsContextMenu from "../../components/dialogsContextMenu";
import { horizontalMenu } from "../../components/horizontalMenu";
import { attachContextMenuListener, putPreloader } from "../../components/misc";
import { ripple } from "../../components/ripple";
//import Scrollable from "../../components/scrollable";
import Scrollable, { ScrollableX, SliceSides, SliceSidesContainer } from "../../components/scrollable";
import appSidebarLeft from "../../components/sidebarLeft";
import { formatDateAccordingToToday } from "../../helpers/date";
import { escapeRegExp } from "../../helpers/string";
import { isTouchSupported } from "../../helpers/touchSupport";
import { isSafari } from "../../helpers/userAgent";
import { logger, LogLevels } from "../logger";
import { RichTextProcessor } from "../richtextprocessor";
import $rootScope from "../rootScope";
import { findUpClassName, positionElementByIndex } from "../../helpers/dom";
import appImManager, { AppImManager } from "./appImManager";
import appMessagesManager, { Dialog } from "./appMessagesManager";
import {MyDialogFilter as DialogFilter} from "../storages/filters";
import appPeersManager from './appPeersManager';
import appStateManager from "./appStateManager";
import appUsersManager, { User } from "./appUsersManager";
import { MOUNT_CLASS_TO } from "../mtproto/mtproto_config";

type DialogDom = {
  avatarEl: AvatarElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  titleSpanContainer: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadMessagesSpan: HTMLSpanElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLDivElement,
  listEl: HTMLLIElement,
  muteAnimationTimeout?: number
};

const testScroll = false;
let testTopSlice = 1;

export class AppDialogsManager {
  public _chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatList = this._chatList;

  public doms: {[peerID: number]: DialogDom} = {};
  public lastActiveListElement: HTMLElement = null;

  /* private rippleCallback: (value?: boolean | PromiseLike<boolean>) => void = null;
  private lastClickID = 0;
  private lastGoodClickID = 0; */

  public chatsContainer = document.getElementById('chats-container') as HTMLDivElement;
  private chatsPreloader: HTMLDivElement;

  public loadDialogsPromise: Promise<any>;

  public scroll: Scrollable = null;
  public _scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogLevels.log | LogLevels.error | LogLevels.warn | LogLevels.debug);

  public contextMenu = new DialogsContextMenu();

  public chatLists: {[filterID: number]: HTMLUListElement} = {
    0: this.chatList,
    1: appSidebarLeft.archivedTab.chatList
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
      unread: HTMLElement,
      title: HTMLElement
    }
  } = {};
  private showFiltersTimeout: number;
  private allUnreadCount: HTMLElement;

  private accumulateArchivedTimeout: number;

  private topOffsetIndex = 0;

  constructor() {
    this.chatsPreloader = putPreloader(null, true);

    this.allUnreadCount = this.folders.menu.querySelector('.unread-count');
    
    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    this.scroll = this._scroll = new Scrollable(this.chatsContainer, 'CL', 500);
    this.scroll.onScrolledTop = this.onChatsScrollTop;
    this.scroll.onScrolledBottom = this.onChatsScroll;
    this.scroll.setVirtualContainer(this.chatList);
    //this.scroll.attachSentinels();

    if(isTouchSupported && isSafari) {
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
      for(let i = 0; i < 500; ++i) {
        add();
      }
      (window as any).addElement = add;
    }

    $rootScope.$on('user_update', (e) => {
      const userID = e.detail;
      const user = appUsersManager.getUser(userID);
      const dialog = appMessagesManager.getDialogByPeerID(user.id)[0];
      //console.log('updating user:', user, dialog);

      if(dialog && !appUsersManager.isBot(dialog.peerID) && dialog.peerID != $rootScope.myID) {
        const online = user.status?._ == 'userStatusOnline';
        const dom = this.getDialogDom(dialog.peerID);

        if(dom) {
          dom.avatarEl.classList.toggle('is-online', online);
        }
      }

      if($rootScope.selectedPeerID == user.id) {
        appImManager.setPeerStatus();
      }
    });

    /* $rootScope.$on('dialog_top', (e) => {
      const dialog = e.detail;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setFiltersUnreadCount();
    }); */

    $rootScope.$on('dialog_flush', (e) => {
      const peerID: number = e.detail.peerID;
      const dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
      if(dialog) {
        this.setLastMessage(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    $rootScope.$on('dialogs_multiupdate', (e) => {
      const dialogs = e.detail;

      for(const id in dialogs) {
        const dialog = dialogs[id];
        this.updateDialog(dialog);
      }

      this.validateForFilter();
      this.setFiltersUnreadCount();
    });

    $rootScope.$on('dialog_drop', (e) => {
      const {peerID, dialog} = e.detail;

      const dom = this.getDialogDom(peerID);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[peerID];
      }

      this.setFiltersUnreadCount();
    });

    $rootScope.$on('dialog_unread', (e) => {
      const info = e.detail;

      const dialog = appMessagesManager.getDialogByPeerID(info.peerID)[0];
      if(dialog) {
        this.setUnreadMessages(dialog);

        if(dialog.peerID == $rootScope.selectedPeerID) {
          appImManager.updateUnreadByDialog(dialog);
        }

        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    $rootScope.$on('dialog_notify_settings', e => {
      const dialog = appMessagesManager.getDialogByPeerID(e.detail)[0];
      if(dialog) {
        this.setUnreadMessages(dialog); // возможно это не нужно, но нужно менять is-muted
      }
    });

    $rootScope.$on('peer_changed', (e) => {
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

    $rootScope.$on('filter_update', (e) => {
      const filter: DialogFilter = e.detail;
      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
        return;
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

      const elements = this.filtersRendered[filter.id];
      elements.title.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    });

    $rootScope.$on('filter_delete', (e) => {
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

    $rootScope.$on('filter_order', (e) => {
      const order = e.detail;
      
      const containerToAppend = this.folders.menu.firstElementChild as HTMLUListElement;
      order.forEach((filterID) => {
        const filter = appMessagesManager.filtersStorage.filters[filterID];
        const renderedFilter = this.filtersRendered[filterID];

        positionElementByIndex(renderedFilter.menu, containerToAppend, filter.orderIndex);
        positionElementByIndex(renderedFilter.container, this.folders.container, filter.orderIndex);
      });

      if(this.filterID) {
        const tabIndex = order.indexOf(this.filterID) + 1;
        selectTab.prevId = tabIndex;
      }
    });

    const foldersScrollable = new ScrollableX(this.folders.menuScrollContainer);
    this.chatsContainer.prepend(this.folders.menuScrollContainer);
    const selectTab = horizontalMenu(this.folders.menu, this.folders.container, (id, tabContent) => {
      /* if(id != 0) {
        id += 1;
      } */

      foldersScrollable.scrollIntoView(this.folders.menu.firstElementChild.children[id] as HTMLElement, true, 250);

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
    appStateManager.getState().then((state) => {
      const getFiltersPromise = appMessagesManager.filtersStorage.getDialogFilters();
      getFiltersPromise.then((filters) => {
        for(const filter of filters) {
          this.addFilter(filter);
        }
      });

      return this.loadDialogs();
    }).then(result => {
      appMessagesManager.getConversationsAll('', 1).then(() => {
        this.accumulateArchivedUnread();
      });
    });

    /* const mutationObserver = new MutationObserver((mutationList, observer) => {

    });

    mutationObserver.observe */
  }

  private updateDialog(dialog: Dialog) {
    if(!dialog) {
      return;
    }

    if(this.topOffsetIndex && dialog.index > this.topOffsetIndex) {
      const dom = this.getDialogDom(dialog.peerID);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[dialog.peerID];
      }

      return;
    }

    if(!this.doms.hasOwnProperty(dialog.peerID)) {
      this.addDialogNew({dialog});
    }

    if(this.getDialogDom(dialog.peerID)) {
      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);
    }
  }

  onTabChange = () => {
    this.doms = {};
    this.topOffsetIndex = 0;
    this.scroll.loadedAll.top = true;
    this.scroll.loadedAll.bottom = false;
    this.lastActiveListElement = null;
    this.loadDialogsPromise = undefined;
    this.chatList = this.chatLists[this.filterID];
    this.loadDialogs();
  };

  private setFilterUnreadCount(filterID: number, folder?: Dialog[]) {
    const unreadSpan = filterID == 0 ? this.allUnreadCount : this.filtersRendered[filterID]?.unread;
    if(!unreadSpan) {
      return;
    }

    folder = folder || appMessagesManager.dialogsStorage.getFolder(filterID);
    const sum = folder.reduce((acc, dialog) => acc + +!!dialog.unread_count, 0);
    
    unreadSpan.innerText = sum ? '' + sum : '';
  }

  private setFiltersUnreadCount() {
    for(const filterID in this.filtersRendered) {
      this.setFilterUnreadCount(+filterID);
    }

    this.setFilterUnreadCount(0);
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  private validateForFilter() {
    // !WARNING, возможно это было зачем-то, но комментарий исправил архивирование
    //if(this.filterID == 0) return;

    const folder = appMessagesManager.dialogsStorage.getFolder(this.filterID);
    for(const _peerID in this.doms) {
      const peerID = +_peerID;

      // если больше не подходит по фильтру, удаляем
      if(folder.findIndex((dialog) => dialog.peerID == peerID) === -1) {
        const listEl = this.doms[peerID].listEl;
        listEl.remove();
        delete this.doms[peerID];

        if(this.lastActiveListElement == listEl) {
          this.lastActiveListElement = null;
        }
      }
    }
  }

  private addFilter(filter: DialogFilter) {
    if(this.filtersRendered[filter.id]) return;

    const li = document.createElement('li');
    const span = document.createElement('span');
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    const unreadSpan = document.createElement('span');
    unreadSpan.classList.add('unread-count');
    const i = document.createElement('i');
    span.append(titleSpan, unreadSpan, i);
    li.append(span);
    ripple(li);

    const containerToAppend = this.folders.menu.firstElementChild as HTMLUListElement;
    positionElementByIndex(li, containerToAppend, filter.orderIndex);
    //containerToAppend.append(li);

    const ul = document.createElement('ul');
    const div = document.createElement('div');
    div.append(ul);
    div.dataset.filterID = '' + filter.id;
    //this.folders.container.append(div);
    positionElementByIndex(div, this.folders.container, filter.orderIndex);

    this.chatLists[filter.id] = ul;
    this.setListClickListener(ul, null, true);

    if(!this.showFiltersTimeout) {
      this.showFiltersTimeout = window.setTimeout(() => {
        this.showFiltersTimeout = 0;
        this.folders.menuScrollContainer.classList.remove('hide');
        this.setFiltersUnreadCount();
      }, 0);
    }

    this.filtersRendered[filter.id] = {
      menu: li,
      container: div,
      unread: unreadSpan,
      title: titleSpan
    };
  }

  private async loadDialogs(side: SliceSides = 'bottom') {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;
    
    if(!this.chatList.childElementCount) {
      const container = this.chatList.parentElement;
      container.append(this.chatsPreloader);
    }

    //return;

    const filterID = this.filterID;
    let loadCount = 30/*this.chatsLoadCount */;

    const storage = appMessagesManager.dialogsStorage.getFolder(filterID);
    let offsetIndex = 0;

    if(side == 'top') {
      const element = this.chatList.firstElementChild;
      if(element) {
        const peerID = +element.getAttribute('data-peerID');
        const index = storage.findIndex(dialog => dialog.peerID == peerID);
        const needIndex = Math.max(0, index - loadCount);
        loadCount = index - needIndex;
        offsetIndex = storage[needIndex].index + 1;
      }
    } else {
      const element = this.chatList.lastElementChild;
      if(element) {
        const peerID = +element.getAttribute('data-peerID');
        const dialog = storage.find(dialog => dialog.peerID == peerID);
        offsetIndex = dialog.index;
      }
      /* for(let i = storage.length - 1; i >= 0; --i) {
        const dialog = storage[i];
        if(this.getDialogDom(dialog.peerID)) {
          offsetIndex = dialog.index;
          break;
        }
      } */
    }
    
    
    //let offset = storage[storage.length - 1]?.index || 0;

    try {
      //console.time('getDialogs time');

      const getConversationPromise = (this.filterID > 1 ? appUsersManager.getContacts() as Promise<any> : Promise.resolve()).then(() => {
        return appMessagesManager.getConversations('', offsetIndex, loadCount, filterID);
      });

      this.loadDialogsPromise = getConversationPromise;
      
      const result = await getConversationPromise;

      if(this.filterID != filterID) {
        return;
      }

      //console.timeEnd('getDialogs time');

      // * loaded all
      //if(!result.dialogs.length || this.chatList.childElementCount == result.count) {
      // !result.dialogs.length не подходит, так как при супердревном диалоге getConversations его не выдаст.
      //if(this.chatList.childElementCount == result.count) {
      if(side == 'bottom') {
        if(result.isEnd) {
          this.scroll.loadedAll[side] = true;
        }
      } else {
        const storage = appMessagesManager.dialogsStorage.getFolder(filterID);
        if(!result.dialogs.length || (storage.length && storage[0].index < offsetIndex)) {
          this.scroll.loadedAll[side] = true;
        }
      }
      
      if(result.dialogs.length) {
        const dialogs = side == 'top' ? result.dialogs.slice().reverse() : result.dialogs;
        dialogs.forEach((dialog) => {
          this.addDialogNew({
            dialog,
            append: side == 'bottom'
          });
        });

        //if(side == 'bottom' || true || (testTopSlice-- > 0 && side == 'top')) {
          //setTimeout(() => {
            const sliced = this.scroll.slice(side == 'bottom' ? 'top' : 'bottom', 30/* result.dialogs.length */);
            sliced.forEach(el => {
              const peerID = +el.getAttribute('data-peerID');
              delete this.doms[peerID];
            });
          //}, 0);
        //}
      }

      if(!this.scroll.loadedAll['top']) {
        const element = this.chatList.firstElementChild;
        if(element) {
          const peerID = +element.getAttribute('data-peerID');
          const dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
          this.topOffsetIndex = dialog.index;
        }
      } else {
        this.topOffsetIndex = 0;
      }

      this.log.debug('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, this.chatList.childElementCount);

      setTimeout(() => {
        /* setTimeout(() => {
          this.scroll.slice(true);
        }, 100); */
        this.scroll.onScroll();
      }, 0);
    } catch(err) {
      this.log.error(err);
    }
    
    this.chatsPreloader.remove();
    this.loadDialogsPromise = undefined;
  }

  public onChatsScrollTop = () => {
    this.onChatsScroll('top');
  };
  
  public onChatsScroll = (side: SliceSides = 'bottom') => {
    if(this.scroll.loadedAll[side] || this.loadDialogsPromise) return;
    this.log.error('onChatsScroll', side);
    this.loadDialogs(side);
  };

  public setListClickListener(list: HTMLUListElement, onFound?: () => void, withContext = false) {
    list.addEventListener('mousedown', (e) => {
      if(e.button != 0) return;
      //cancelEvent(e);

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

  private setDialogPosition(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerID);
    if(!dom) {
      return;
    }

    let pos = appMessagesManager.dialogsStorage.getDialog(dialog.peerID, this.filterID)[1];
    if(this.topOffsetIndex) {
      const element = this.chatList.firstElementChild;
      if(element) {
        const peerID = +element.getAttribute('data-peerID');
        const firstDialog = appMessagesManager.getDialogByPeerID(peerID);
        pos -= firstDialog[1];
      }
    }

    if(positionElementByIndex(dom.listEl, this.chatList, pos)) {
      this.log.debug('setDialogPosition:', dialog, dom, pos);
    }
  }

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom, highlightWord?: string) {
    ///////console.log('setlastMessage:', lastMessage);
    if(!dom) {
      dom = this.getDialogDom(dialog.peerID);

      if(!dom) {
        //this.log.error('no dom for dialog:', dialog, lastMessage, dom, highlightWord);
        return;
      }
    }

    if(!lastMessage) {
      lastMessage = appMessagesManager.getMessage(dialog.top_message);
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
        let entities = RichTextProcessor.parseEntities(messageText.replace(/\n/g, ' '));
        let regExp = new RegExp(escapeRegExp(highlightWord), 'gi');
        let match: any;

        if(!entities) entities = [];
        let found = false;
        while((match = regExp.exec(messageText)) !== null) {
          entities.push({_: 'messageEntityHighlight', length: highlightWord.length, offset: match.index});
          found = true;
        }
    
        if(found) {
          entities.sort((a, b) => a.offset - b.offset);
        }
    
        let messageWrapped = RichTextProcessor.wrapRichText(messageText, {
          noLinebreaks: true, 
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
      if(peer._ != 'peerUser' && peerID != lastMessage.fromID && !lastMessage.action) {
        const sender = appPeersManager.getPeer(lastMessage.fromID);
        if(sender && sender.id) {
          const senderBold = document.createElement('b');

          let str = '';
          if(sender.id == $rootScope.myID) {
            str = 'You';
          } else {
            //str = sender.first_name || sender.last_name || sender.username;
            str = appPeersManager.getPeerTitle(lastMessage.fromID, true, true);
          }

          //senderBold.innerText = str + ': ';
          senderBold.innerHTML = RichTextProcessor.wrapRichText(str, {noLinebreaks: true, noLinks: true}) + ': ';
          //console.log(sender, senderBold.innerText);
          dom.lastMessageSpan.prepend(senderBold);
        } //////// else console.log('no sender', lastMessage, peerID);
      }
    }

    if(!lastMessage.deleted) {
      dom.lastTimeSpan.innerHTML = formatDateAccordingToToday(new Date(lastMessage.date * 1000));
    } else dom.lastTimeSpan.innerHTML = '';

    if(this.doms[peerID] == dom) {
      this.setUnreadMessages(dialog);
    } else { // means search
      dom.listEl.dataset.mid = lastMessage.mid;
    }
  }

  private setUnreadMessages(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerID);

    if(dialog.folder_id == 1) {
      this.accumulateArchivedUnread();
    }

    if(!dom) {
      //this.log.error('setUnreadMessages no dom!', dialog);
      return;
    }

    const isMuted = (dialog.notify_settings?.mute_until * 1000) > Date.now();
    const wasMuted = dom.listEl.classList.contains('is-muted');
    if(!isMuted && wasMuted) {
      dom.listEl.classList.add('backwards');

      if(dom.muteAnimationTimeout) clearTimeout(dom.muteAnimationTimeout);
      dom.muteAnimationTimeout = window.setTimeout(() => {
        delete dom.muteAnimationTimeout;
        dom.listEl.classList.remove('backwards', 'is-muted');
      }, 200);
    } else {
      dom.listEl.classList.toggle('is-muted', isMuted);
    }

    const lastMessage = appMessagesManager.getMessage(dialog.top_message);
    if(lastMessage._ != 'messageEmpty' && !lastMessage.deleted && 
      lastMessage.fromID == $rootScope.myID && lastMessage.peerID != $rootScope.myID/*  && 
      dialog.read_outbox_max_id */) { // maybe comment, 06.20.2020
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
      dom.unreadMessagesSpan.classList.add('unread');
    } else if(isPinned) {
      dom.unreadMessagesSpan.classList.remove('unread');
      dom.unreadMessagesSpan.classList.add('tgico-pinnedchat');
    }
  }

  private accumulateArchivedUnread() {
    if(this.accumulateArchivedTimeout) return;
    this.accumulateArchivedTimeout = window.setTimeout(() => {
      this.accumulateArchivedTimeout = 0;
      const dialogs = appMessagesManager.dialogsStorage.getFolder(1);
      const sum = dialogs.reduce((acc, dialog) => acc + dialog.unread_count, 0);
      $rootScope.$broadcast('dialogs_archived_unread', {count: sum});
    }, 0);
  }

  private getDialogDom(peerID: number) {
    return this.doms[peerID];
  }

  public addDialogNew(options: {
    dialog: Dialog | number,
    container?: HTMLUListElement | Scrollable,
    drawStatus?: boolean,
    rippleEnabled?: boolean,
    onlyFirstName?: boolean,
    meAsSaved?: boolean,
    append?: boolean
  }) {
    return this.addDialog(options.dialog, options.container, options.drawStatus, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append);
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement | Scrollable, drawStatus = true, rippleEnabled = true, onlyFirstName = false, meAsSaved = true, append = true) {
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

    const peerID: number = dialog.peerID;

    if(!container) {
      if(this.doms[peerID]) return;

      const filter = appMessagesManager.filtersStorage.filters[this.filterID];
      if((filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || (!filter && this.filterID != dialog.folder_id)) {
        return;
      }
    }

    let title = appPeersManager.getPeerTitle(peerID, false, onlyFirstName);

    const avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', meAsSaved ? '1' : '0');
    avatarEl.setAttribute('peer', '' + peerID);
    avatarEl.classList.add('dialog-avatar');

    if(drawStatus && peerID != $rootScope.myID && dialog.peer) {
      const peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          const user = appUsersManager.getUser(peerID);
          //console.log('found user', user);
  
          if(user.status && user.status._ == 'userStatusOnline') {
            avatarEl.classList.add('is-online');
          }
  
          break;
        default:
          break;
      }
    }

    const captionDiv = document.createElement('div');
    captionDiv.classList.add('user-caption');

    const titleSpanContainer = document.createElement('span');
    titleSpanContainer.classList.add('user-title');

    const titleSpan = document.createElement('span');

    if(peerID == $rootScope.myID && meAsSaved) {
      title = onlyFirstName ? 'Saved' : 'Saved Messages';
    } 

    titleSpan.innerHTML = title;
    titleSpanContainer.append(titleSpan);
    //p.classList.add('')

    // в других случаях иконка верификации не нужна (а первый - это главные чатлисты)
    //if(!container) {
      const peer = appPeersManager.getPeer(peerID);

      // for muted icon
      titleSpanContainer.classList.add('tgico'); // * эта строка будет актуальна только для !container, но ладно

      if(peer?.pFlags?.verified) {
        titleSpanContainer.classList.add('is-verified');
        const i = document.createElement('i');
        i.classList.add('verified-icon');
        titleSpanContainer.append(i);
      }
    //}
    
    const span = document.createElement('span');
    span.classList.add('user-last-message');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    const paddingDiv = document.createElement('div');
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
    

    const li = document.createElement('li');
    li.append(paddingDiv);
    li.setAttribute('data-peerID', '' + peerID);

    const statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status');

    const lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    const unreadMessagesSpan = document.createElement('span');
    unreadMessagesSpan.classList.add('dialog-subtitle-badge');

    const titleP = document.createElement('p');
    titleP.classList.add('dialog-title');

    const rightSpan = document.createElement('span');
    rightSpan.classList.add('dialog-title-details');
    rightSpan.append(statusSpan, lastTimeSpan);
    titleP.append(titleSpanContainer, rightSpan);

    const messageP = document.createElement('p');
    messageP.classList.add('dialog-subtitle');
    messageP.append(span, unreadMessagesSpan);

    captionDiv.append(titleP, messageP);

    const dom: DialogDom = {
      avatarEl,
      captionDiv,
      titleSpan,
      titleSpanContainer,
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
    const method: 'append' | 'prepend' = append ? 'append' : 'prepend';
    if(!container/*  || good */) {
      this.scroll[method](li);

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
      container[method](li);
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appDialogsManager = appDialogsManager);
export default appDialogsManager;
