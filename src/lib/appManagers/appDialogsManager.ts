import AvatarElement from "../../components/avatar";
import DialogsContextMenu from "../../components/dialogsContextMenu";
import { horizontalMenu } from "../../components/horizontalMenu";
import { attachContextMenuListener, putPreloader } from "../../components/misc";
import { ripple } from "../../components/ripple";
//import Scrollable from "../../components/scrollable";
import Scrollable, { ScrollableX, SliceSides } from "../../components/scrollable";
import { formatDateAccordingToToday } from "../../helpers/date";
import { escapeRegExp } from "../../helpers/string";
import { isSafari } from "../../helpers/userAgent";
import { logger, LogLevels } from "../logger";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import { findUpClassName, findUpTag, positionElementByIndex } from "../../helpers/dom";
import appImManager from "./appImManager";
import appMessagesManager, { Dialog } from "./appMessagesManager";
import {MyDialogFilter as DialogFilter} from "../storages/filters";
import appPeersManager from './appPeersManager';
import appStateManager from "./appStateManager";
import appUsersManager, { User } from "./appUsersManager";
import Button from "../../components/button";
import SetTransition from "../../components/singleTransition";
import sessionStorage from '../sessionStorage';
import apiUpdatesManager from "./apiUpdatesManager";
import appDraftsManager, { MyDraftMessage } from "./appDraftsManager";
import ProgressivePreloader from "../../components/preloader";
import App from "../../config/app";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";

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

class ConnectionStatusComponent {
  public static CHANGE_STATE_DELAY = 1000;

  private statusContainer: HTMLElement;
  private statusEl: HTMLElement;
  private statusPreloader: ProgressivePreloader;

  private currentText = '';

  private connecting = false;
  private updating = false;

  private log: ReturnType<typeof logger>;

  private setFirstConnectionTimeout: number;
  private setStateTimeout: number;

  constructor(chatsContainer: HTMLElement) {
    this.log = logger('CS');
  
    this.statusContainer = document.createElement('div');
    this.statusContainer.classList.add('connection-status');

    this.statusEl = Button('btn-primary bg-warning connection-status-button', {noRipple: true});
    this.statusPreloader = new ProgressivePreloader({cancelable: false});
    this.statusPreloader.constructContainer({color: 'transparent', bold: true});
    this.statusContainer.append(this.statusEl);

    chatsContainer.prepend(this.statusContainer);

    rootScope.on('connection_status_change', (e) => {
      const status = e;
      console.log(status);

      this.setConnectionStatus();
    });

    rootScope.on('state_synchronizing', (e) => {
      const channelId = e;
      if(!channelId) {
        this.updating = true;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    rootScope.on('state_synchronized', (e) => {
      const channelId = e;
      DEBUG && this.log('state_synchronized', channelId);
      if(!channelId) {
        this.updating = false;
        DEBUG && this.log('updating', this.updating);
        this.setState();
      }
    });

    this.setFirstConnectionTimeout = window.setTimeout(this.setConnectionStatus, ConnectionStatusComponent.CHANGE_STATE_DELAY + 1e3);

    /* let bool = true;
    document.addEventListener('dblclick', () => {
      rootScope.broadcast('connection_status_change', {
        dcId: 2,
        isFileDownload: false,
        isFileNetworker: false,
        isFileUpload: false,
        name: "NET-2",
        online: bool = !bool,
        _: "networkerStatus"
      });
    }); */
  }

  private setConnectionStatus = () => {
    sessionStorage.get('dc').then(baseDcId => {
      if(!baseDcId) {
        baseDcId = App.baseDcId;
      }
      
      if(this.setFirstConnectionTimeout) {
        clearTimeout(this.setFirstConnectionTimeout);
        this.setFirstConnectionTimeout = 0;
      }

      const status = rootScope.connectionStatus['NET-' + baseDcId];
      const online = status && status.online;

      if(this.connecting && online) {
        apiUpdatesManager.forceGetDifference();
      }

      this.connecting = !online;
      DEBUG && this.log('connecting', this.connecting);
      this.setState();
    });
  };

  private setStatusText = (text: string) => {
    if(this.currentText === text) return;
    this.statusEl.innerText = this.currentText = text;
    this.statusPreloader.attach(this.statusEl);
  };

  private setState = () => {
    const timeout = ConnectionStatusComponent.CHANGE_STATE_DELAY;
    if(this.connecting) {
      this.setStatusText('Waiting for network...');
    } else if(this.updating) {
      this.setStatusText('Updating...');
    }

    DEBUG && this.log('setState', this.connecting || this.updating);
    window.requestAnimationFrame(() => {
      if(this.setStateTimeout) clearTimeout(this.setStateTimeout);

      const cb = () => {
        SetTransition(this.statusContainer, 'is-shown', this.connecting || this.updating, 200);
        this.setStateTimeout = 0;
        DEBUG && this.log('setState: isShown:', this.connecting || this.updating);
      };

      this.setStateTimeout = window.setTimeout(cb, timeout);
      //cb();
      /* if(timeout) this.setStateTimeout = window.setTimeout(cb, timeout);
      else cb(); */
    });
  };
}

export class AppDialogsManager {
  public _chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatList = this._chatList;
  public chatListArchived: HTMLUListElement;

  public doms: {[peerId: number]: DialogDom} = {};

  public chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;
  private chatsPreloader: HTMLElement;

  public loadDialogsPromise: Promise<any>;

  public scroll: Scrollable = null;
  public _scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogLevels.log | LogLevels.error | LogLevels.warn | LogLevels.debug);

  public contextMenu = new DialogsContextMenu();

  public chatLists: {[filterId: number]: HTMLUListElement};
  public filterId = 0;
  private folders: {[k in 'menu' | 'container' | 'menuScrollContainer']: HTMLElement} = {
    menu: document.getElementById('folders-tabs'),
    menuScrollContainer: null,
    container: document.getElementById('folders-container')
  };
  private filtersRendered: {
    [filterId: string]: {
      menu: HTMLElement, 
      container: HTMLElement,
      unread: HTMLElement,
      title: HTMLElement
    }
  } = {};
  private showFiltersTimeout: number;
  private allUnreadCount: HTMLElement;

  private accumulateArchivedTimeout: number;

  //private topOffsetIndex = 0;

  private sliceTimeout: number;
  private reorderDialogsTimeout: number;

  private lastActiveElements: Set<HTMLElement> = new Set();

  constructor() {
    this.chatListArchived = document.createElement('ul');
    this.chatListArchived.id = 'dialogs-archived';

    this.chatLists = {
      0: this.chatList,
      1: this.chatListArchived
    };

    this.chatsPreloader = putPreloader(null, true);

    this.allUnreadCount = this.folders.menu.querySelector('.badge');
    
    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    const bottomPart = document.createElement('div');
    bottomPart.classList.add('connection-status-bottom');
    bottomPart.append(this.folders.container);

    this.scroll = this._scroll = new Scrollable(bottomPart, 'CL', 500);
    this.scroll.container.addEventListener('scroll', this.onChatsRegularScroll);
    this.scroll.onScrolledTop = this.onChatsScrollTop;
    this.scroll.onScrolledBottom = this.onChatsScroll;
    this.scroll.setVirtualContainer(this.chatList);
    //this.scroll.attachSentinels();

    /* if(isTouchSupported && isSafari) {
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
    } */

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

    rootScope.on('user_update', (e) => {
      const userId = e;
      const user = appUsersManager.getUser(userId);
      const dialog = appMessagesManager.getDialogByPeerId(user.id)[0];
      //console.log('updating user:', user, dialog);

      if(dialog && !appUsersManager.isBot(dialog.peerId) && dialog.peerId !== rootScope.myId) {
        const online = user.status?._ === 'userStatusOnline';
        const dom = this.getDialogDom(dialog.peerId);

        if(dom) {
          dom.avatarEl.classList.toggle('is-online', online);
        }
      }
    });

    /* rootScope.$on('dialog_top', (e) => {
      const dialog = e;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setFiltersUnreadCount();
    }); */

    rootScope.on('dialog_flush', (e) => {
      const peerId: number = e.peerId;
      const dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
      if(dialog) {
        this.setLastMessage(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.on('dialogs_multiupdate', (e) => {
      const dialogs = e;

      for(const id in dialogs) {
        const dialog = dialogs[id];
        this.updateDialog(dialog);
      }

      this.validateForFilter();
      this.setFiltersUnreadCount();
    });

    rootScope.on('dialog_drop', (e) => {
      const {peerId, dialog} = e;

      const dom = this.getDialogDom(peerId);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[peerId];
      }

      this.setFiltersUnreadCount();
    });

    rootScope.on('dialog_unread', (e) => {
      const info = e;

      const dialog = appMessagesManager.getDialogByPeerId(info.peerId)[0];
      if(dialog) {
        this.setUnreadMessages(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.on('dialog_notify_settings', e => {
      const dialog = appMessagesManager.getDialogByPeerId(e)[0];
      if(dialog) {
        this.setUnreadMessages(dialog); // возможно это не нужно, но нужно менять is-muted
      }
    });

    rootScope.on('dialog_draft', (e) => {
      const dialog = appMessagesManager.getDialogByPeerId(e.peerId)[0];
      if(dialog) {
        this.updateDialog(dialog);
      }
    });

    rootScope.on('peer_changed', (e) => {
      const peerId = e;

      //const perf = performance.now();
      for(const element of this.lastActiveElements) {
        if(+element.dataset.peerId !== peerId) {
          element.classList.remove('active');
          this.lastActiveElements.delete(element);
        }
      }

      const elements = Array.from(document.querySelectorAll(`[data-autonomous="0"] li[data-peer-id="${peerId}"]`)) as HTMLElement[];
      elements.forEach(element => {
        element.classList.add('active');
        this.lastActiveElements.add(element);
      });
      //this.log('peer_changed total time:', performance.now() - perf);
    });

    rootScope.on('filter_update', (e) => {
      const filter: DialogFilter = e;
      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
        return;
      } else if(filter.id === this.filterId) { // это нет тут смысла вызывать, так как будет dialogs_multiupdate
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

    rootScope.on('filter_delete', (e) => {
      const filter: DialogFilter = e;
      const elements = this.filtersRendered[filter.id];
      if(!elements) return;

      // set tab
      //(this.folders.menu.firstElementChild.children[Math.max(0, filter.id - 2)] as HTMLElement).click();
      (this.folders.menu.firstElementChild as HTMLElement).click();

      elements.container.remove();
      elements.menu.remove();
      
      delete this.chatLists[filter.id];
      delete this.filtersRendered[filter.id];

      if(!Object.keys(this.filtersRendered).length) {
        this.folders.menuScrollContainer.classList.add('hide');
      }
    });

    rootScope.on('filter_order', (e) => {
      const order = e;
      
      const containerToAppend = this.folders.menu as HTMLElement;
      order.forEach((filterId) => {
        const filter = appMessagesManager.filtersStorage.filters[filterId];
        const renderedFilter = this.filtersRendered[filterId];

        positionElementByIndex(renderedFilter.menu, containerToAppend, filter.orderIndex);
        positionElementByIndex(renderedFilter.container, this.folders.container, filter.orderIndex);
      });

      /* if(this.filterId) {
        const tabIndex = order.indexOf(this.filterId) + 1;
        selectTab.prevId = tabIndex;
      } */
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId, typings} = e;

      const dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
      if(!dialog) return;

      if(typings.length) {
        this.setTyping(dialog, appUsersManager.getUser(typings[0]));
      } else {
        this.unsetTyping(dialog);
      }
    });

    const foldersScrollable = new ScrollableX(this.folders.menuScrollContainer);
    bottomPart.prepend(this.folders.menuScrollContainer);
    const selectTab = horizontalMenu(this.folders.menu, this.folders.container, (id, tabContent) => {
      /* if(id !== 0) {
        id += 1;
      } */

      id = +tabContent.dataset.filterId || 0;

      if(this.filterId === id) return;

      this.chatLists[id].innerHTML = '';
      this.scroll.setVirtualContainer(this.chatLists[id]);
      this.filterId = id;
      this.onTabChange();
    }, () => {
      for(const folderId in this.chatLists) {
        if(+folderId !== this.filterId) {
          this.chatLists[folderId].innerHTML = '';
        }
      }
    }, undefined, foldersScrollable);

    //selectTab(0);
    (this.folders.menu.firstElementChild as HTMLElement).click();
    appStateManager.getState().then((state) => {
      const getFiltersPromise = appMessagesManager.filtersStorage.getDialogFilters();
      getFiltersPromise.then((filters) => {
        for(const filter of filters) {
          this.addFilter(filter);
        }
      });

      if(state.dialogs?.length) {
        appDraftsManager.getAllDrafts();
        appDraftsManager.addMissedDialogs();
      }

      return this.loadDialogs();
    }).then(() => {
      const allDialogsLoaded = appMessagesManager.dialogsStorage.allDialogsLoaded;
      const wasLoaded = allDialogsLoaded[0] || allDialogsLoaded[1];
      const a: Promise<any> = allDialogsLoaded[0] ? Promise.resolve() : appMessagesManager.getConversationsAll('', 0);
      const b: Promise<any> = allDialogsLoaded[1] ? Promise.resolve() : appMessagesManager.getConversationsAll('', 1);
      a.finally(() => {
        b.then(() => {
          this.accumulateArchivedUnread();

          if(wasLoaded) {
            (apiUpdatesManager.updatesState.syncLoading || Promise.resolve()).then(() => {
              appMessagesManager.refreshConversations();
            });
          }
        });
      });
    });

    new ConnectionStatusComponent(this.chatsContainer);
    this.chatsContainer.append(bottomPart);

    /* const mutationObserver = new MutationObserver((mutationList, observer) => {

    });

    mutationObserver.observe */
  }

  private getOffset(side: 'top' | 'bottom'): {index: number, pos: number} {
    if(!this.scroll.loadedAll[side]) {
      const element = (side === 'top' ? this.chatList.firstElementChild : this.chatList.lastElementChild) as HTMLElement;
      if(element) {
        const peerId = +element.dataset.peerId;
        const dialog = appMessagesManager.getDialogByPeerId(peerId);
        return {index: dialog[0].index, pos: dialog[1]};
      }
    }

    return {index: 0, pos: -1};
  }

  private isDialogMustBeInViewport(dialog: Dialog) {
    //return true;
    const topOffset = this.getOffset('top');
    const bottomOffset = this.getOffset('bottom');
    
    if(!topOffset.index && !bottomOffset.index) {
      return true;
    }
    
    const index = dialog.index;
    return (!topOffset.index || index <= topOffset.index) && (!bottomOffset.index || index >= bottomOffset.index);
  }

  private updateDialog(dialog: Dialog) {
    if(!dialog) {
      return;
    }

    if(this.isDialogMustBeInViewport(dialog)) {
      if(!this.doms.hasOwnProperty(dialog.peerId)) {
        const ret = this.addDialogNew({dialog});
        if(ret) {
          const idx = appMessagesManager.getDialogByPeerId(dialog.peerId)[1];
          positionElementByIndex(ret.dom.listEl, this.chatList, idx);
        } else {
          return;
        }
      }
    } else {
      const dom = this.getDialogDom(dialog.peerId);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[dialog.peerId];
      }

      return;
    }

    /* const topOffset = this.getOffset('top');
    if(topOffset.index && dialog.index > topOffset.index) {
      const dom = this.getDialogDom(dialog.peerId);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[dialog.peerId];
      }

      return;
    }

    if(!this.doms.hasOwnProperty(dialog.peerId)) {
      this.addDialogNew({dialog});
    } */

    if(this.getDialogDom(dialog.peerId)) {
      this.setLastMessage(dialog);
      this.reorderDialogs();
    }
  }

  onTabChange = () => {
    this.doms = {};
    this.scroll.loadedAll.top = true;
    this.scroll.loadedAll.bottom = false;
    this.loadDialogsPromise = undefined;
    this.chatList = this.chatLists[this.filterId];
    this.loadDialogs();
  };

  private setFilterUnreadCount(filterId: number, folder?: Dialog[]) {
    const unreadSpan = filterId === 0 ? this.allUnreadCount : this.filtersRendered[filterId]?.unread;
    if(!unreadSpan) {
      return;
    }

    folder = folder || appMessagesManager.dialogsStorage.getFolder(filterId);
    let mutedCount = 0;
    let notMutedCount = 0;
    folder.forEach(dialog => {
      const isMuted = appMessagesManager.isDialogMuted(dialog);

      if(isMuted && filterId === 0) {
        return;
      }

      const value = +!!dialog.unread_count || +dialog.pFlags.unread_mark || 0; // * unread_mark can be undefined
      if(isMuted) mutedCount += value;
      else notMutedCount += value;
    });
    
    unreadSpan.classList.toggle('badge-gray', mutedCount && !notMutedCount);
    
    const sum = mutedCount + notMutedCount;
    unreadSpan.innerText = sum ? '' + sum : '';
  }

  private setFiltersUnreadCount() {
    for(const filterId in this.filtersRendered) {
      this.setFilterUnreadCount(+filterId);
    }

    this.setFilterUnreadCount(0);
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  private validateForFilter() {
    // !WARNING, возможно это было зачем-то, но комментарий исправил архивирование
    //if(this.filterId === 0) return;

    const folder = appMessagesManager.dialogsStorage.getFolder(this.filterId);
    for(const _peerId in this.doms) {
      const peerId = +_peerId;

      // если больше не подходит по фильтру, удаляем
      if(folder.findIndex((dialog) => dialog.peerId === peerId) === -1) {
        const listEl = this.doms[peerId].listEl;
        listEl.remove();
        delete this.doms[peerId];
      }
    }
  }

  private addFilter(filter: DialogFilter) {
    if(this.filtersRendered[filter.id]) return;

    const menuTab = document.createElement('div');
    menuTab.classList.add('menu-horizontal-div-item');
    const span = document.createElement('span');
    const titleSpan = document.createElement('span');
    titleSpan.classList.add('text-super');
    titleSpan.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    const unreadSpan = document.createElement('div');
    unreadSpan.classList.add('badge', 'badge-20', 'badge-blue');
    const i = document.createElement('i');
    span.append(titleSpan, unreadSpan, i);
    menuTab.append(span);
    ripple(menuTab);

    const containerToAppend = this.folders.menu as HTMLElement;
    positionElementByIndex(menuTab, containerToAppend, filter.orderIndex);
    //containerToAppend.append(li);

    const ul = document.createElement('ul');
    const div = document.createElement('div');
    div.append(ul);
    div.dataset.filterId = '' + filter.id;
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
      menu: menuTab,
      container: div,
      unread: unreadSpan,
      title: titleSpan
    };
  }

  private loadDialogs(side: SliceSides = 'bottom') {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 === 1 */) return this.loadDialogsPromise;

    const promise = new Promise<void>(async(resolve, reject) => {
      if(!this.chatList.childElementCount) {
        const container = this.chatList.parentElement;
        container.append(this.chatsPreloader);
      }
  
      //return;
  
      const filterId = this.filterId;
      let loadCount = 30/*this.chatsLoadCount */;
  
      const storage = appMessagesManager.dialogsStorage.getFolder(filterId);
      let offsetIndex = 0;
  
      if(side === 'top') {
        const element = this.chatList.firstElementChild as HTMLElement;
        if(element) {
          const peerId = +element.dataset.peerId;
          const index = storage.findIndex(dialog => dialog.peerId === peerId);
          const needIndex = Math.max(0, index - loadCount);
          loadCount = index - needIndex;
          offsetIndex = storage[needIndex].index + 1;
        }
      } else {
        const element = this.chatList.lastElementChild as HTMLElement;
        if(element) {
          const peerId = +element.dataset.peerId;
          const dialog = storage.find(dialog => dialog.peerId === peerId);
          offsetIndex = dialog.index;
        }
      }
      
      //let offset = storage[storage.length - 1]?.index || 0;
  
      try {
        //console.time('getDialogs time');
  
        const getConversationPromise = (this.filterId > 1 ? appUsersManager.getContacts() as Promise<any> : Promise.resolve()).then(() => {
          return appMessagesManager.getConversations('', offsetIndex, loadCount, filterId);
        });
  
        const result = await getConversationPromise;
  
        if(this.filterId !== filterId) {
          return;
        }
  
        //console.timeEnd('getDialogs time');
  
        // * loaded all
        //if(!result.dialogs.length || this.chatList.childElementCount === result.count) {
        // !result.dialogs.length не подходит, так как при супердревном диалоге getConversations его не выдаст.
        //if(this.chatList.childElementCount === result.count) {
        if(side === 'bottom') {
          if(result.isEnd) {
            this.scroll.loadedAll[side] = true;
          }
        } else {
          const storage = appMessagesManager.dialogsStorage.getFolder(filterId);
          if(!result.dialogs.length || (storage.length && storage[0].index < offsetIndex)) {
            this.scroll.loadedAll[side] = true;
          }
        }
        
        if(result.dialogs.length) {
          const dialogs = side === 'top' ? result.dialogs.slice().reverse() : result.dialogs;
  
          dialogs.forEach((dialog) => {
            this.addDialogNew({
              dialog,
              append: side === 'bottom'
            });
          });
        }
  
        this.log.debug('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, this.chatList.childElementCount);
  
        setTimeout(() => {
          this.scroll.onScroll();
        }, 0);
      } catch(err) {
        this.log.error(err);
      }
      
      this.chatsPreloader.remove();
      resolve();
    });

    return this.loadDialogsPromise = promise.finally(() => {
      this.loadDialogsPromise = undefined;
    });
  }

  public onChatsRegularScroll = () => {
    if(this.sliceTimeout) clearTimeout(this.sliceTimeout);
    this.sliceTimeout = window.setTimeout(() => {
      this.sliceTimeout = undefined;

      /* const observer = new IntersectionObserver((entries) => {
        const 
      });

      Array.from(this.chatList.children).forEach(el => {
        observer.observe(el);
      }); */

      //const scrollTopWas = this.scroll.scrollTop;

      const rect = this.scroll.container.getBoundingClientRect();
      const children = Array.from(this.scroll.splitUp.children) as HTMLElement[];
      const firstElement = findUpTag(document.elementFromPoint(Math.ceil(rect.x), Math.ceil(rect.y + 1)), 'LI') as HTMLElement;
      const lastElement = findUpTag(document.elementFromPoint(Math.ceil(rect.x), Math.floor(rect.y + rect.height - 1)), 'LI') as HTMLElement;

      //alert('got element:' + rect.y);

      if(!firstElement || !lastElement) {
        return;
      }

      //alert('got element:' + !!firstElement);

      const firstElementRect = firstElement.getBoundingClientRect();
      const elementOverflow = firstElementRect.y - rect.y;

      const sliced: HTMLElement[] = [];
      const firstIndex = children.indexOf(firstElement);
      const lastIndex = children.indexOf(lastElement);

      const saveLength = 10;

      const sliceFromStart = isSafari ? [] : children.slice(0, Math.max(0, firstIndex - saveLength));
      const sliceFromEnd = children.slice(lastIndex + saveLength);

      /* if(sliceFromStart.length !== sliceFromEnd.length) {
        console.log('not equal', sliceFromStart.length, sliceFromEnd.length);
      }

      if(sliceFromStart.length > sliceFromEnd.length) {
        const diff = sliceFromStart.length - sliceFromEnd.length;
        sliceFromStart.splice(0, diff);
      } else if(sliceFromEnd.length > sliceFromStart.length) {
        const diff = sliceFromEnd.length - sliceFromStart.length;
        sliceFromEnd.splice(sliceFromEnd.length - diff, diff);
      } */

      if(sliceFromStart.length) {
        this.scroll.loadedAll['top'] = false;
      }

      if(sliceFromEnd.length) {
        this.scroll.loadedAll['bottom'] = false;
      }

      sliced.push(...sliceFromStart);
      sliced.push(...sliceFromEnd);

      sliced.forEach(el => {
        el.remove();
        const peerId = +el.dataset.peerId;
        delete this.doms[peerId];
      });

      //this.log('[slicer] elements', firstElement, lastElement, rect, sliced, sliceFromStart.length, sliceFromEnd.length);

      //this.log('[slicer] reset scrollTop', this.scroll.scrollTop, firstElement.offsetTop, firstElementRect.y, rect.y, elementOverflow);

      //alert('left length:' + children.length);

      this.scroll.scrollTop = firstElement.offsetTop - elementOverflow;
      /* const firstElementRect = firstElement.getBoundingClientRect();
      const scrollTop =  */

      //this.scroll.scrollIntoView(firstElement, false);
    }, 200);
  };

  public onChatsScrollTop = () => {
    this.onChatsScroll('top');
  };
  
  public onChatsScroll = (side: SliceSides = 'bottom') => {
    if(this.scroll.loadedAll[side] || this.loadDialogsPromise) return;
    this.log('onChatsScroll', side);
    this.loadDialogs(side);
  };

  public setListClickListener(list: HTMLUListElement, onFound?: () => void, withContext = false, autonomous = false) {
    let lastActiveListElement: HTMLElement;

    list.dataset.autonomous = '' + +autonomous;
    list.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      //cancelEvent(e);

      this.log('dialogs click list');
      let target = e.target as HTMLElement;
      let elem = target.classList.contains('rp') ? target : findUpClassName(target, 'rp');

      if(!elem) {
        return;
      }

      elem = elem.parentElement;

      if(autonomous) {
        let sameElement = lastActiveListElement === elem;
        if(lastActiveListElement && !sameElement) {
          lastActiveListElement.classList.remove('active');
        }

        if(elem) {
          elem.classList.add('active');
          lastActiveListElement = elem;
          this.lastActiveElements.add(elem);
        }
      }

      if(elem) {
        if(onFound) onFound();

        let peerId = +elem.dataset.peerId;
        let lastMsgId = +elem.dataset.mid || undefined;

        appImManager.setPeer(peerId, lastMsgId);
      } else {
        appImManager.setPeer(0);
      }
    }, {capture: true});

    if(DEBUG) {
      list.addEventListener('dblclick', (e) => {
        const li = findUpTag(e.target, 'LI');
        if(li) {
          const peerId = +li.dataset.peerId;
          this.log('debug dialog:', appMessagesManager.getDialogByPeerId(peerId));
        }
      });
    }

    if(withContext) {
      attachContextMenuListener(list, this.contextMenu.onContextMenu);
    }
  }

  private reorderDialogs() {
    //const perf = performance.now();
    if(this.reorderDialogsTimeout) {
      window.cancelAnimationFrame(this.reorderDialogsTimeout);
    }
    
    this.reorderDialogsTimeout = window.requestAnimationFrame(() => {
      this.reorderDialogsTimeout = 0;
      const offset = Math.max(0, this.getOffset('top').pos);
  
      const dialogs = appMessagesManager.dialogsStorage.getFolder(this.filterId);
      const currentOrder = (Array.from(this.chatList.children) as HTMLElement[]).map(el => +el.dataset.peerId);
  
      dialogs.forEach((dialog, index) => {
        const dom = this.getDialogDom(dialog.peerId);
        if(!dom) {
          return;
        }
  
        const needIndex = index - offset;
        if(needIndex > currentOrder.length) {
          dom.listEl.remove();
          delete this.doms[dialog.peerId];
          return;
        }

        const peerIdByIndex = currentOrder[needIndex];
  
        if(peerIdByIndex !== dialog.peerId) {
          if(positionElementByIndex(dom.listEl, this.chatList, needIndex)) {
            this.log.debug('setDialogPosition:', dialog, dom, peerIdByIndex, needIndex);
          }
        }
      });
  
      //this.log('Reorder time:', performance.now() - perf);
    });
  }

  public setLastMessage(dialog: Dialog, lastMessage?: any, dom?: DialogDom, highlightWord?: string) {
    ///////console.log('setlastMessage:', lastMessage);
    if(!dom) {
      dom = this.getDialogDom(dialog.peerId);

      if(!dom) {
        //this.log.error('no dom for dialog:', dialog, lastMessage, dom, highlightWord);
        return;
      }
    }

    let draftMessage: MyDraftMessage;
    if(!lastMessage) {
      if(dialog.draft && dialog.draft._ === 'draftMessage') {
        draftMessage = dialog.draft;
      }
      
      lastMessage = appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
    }

    if(lastMessage._ === 'messageEmpty'/*  || (lastMessage._ === 'messageService' && !lastMessage.rReply) */) {
      dom.lastMessageSpan.innerHTML = '';
      dom.lastTimeSpan.innerHTML = '';
      delete dom.listEl.dataset.mid;
      return;
    }

    let peer = dialog.peer;
    let peerId = dialog.peerId;
    //let peerId = appMessagesManager.getMessagePeer(lastMessage);

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
      } else if(draftMessage) {
        dom.lastMessageSpan.innerHTML = draftMessage.rReply;
      } else if(!lastMessage.deleted) {
        dom.lastMessageSpan.innerHTML = lastMessage.rReply;
      } else {
        dom.lastMessageSpan.innerHTML = '';
      }
  
      /* if(lastMessage.from_id === auth.id) { // You:  */
      if(draftMessage) {
        const bold = document.createElement('b');
        bold.classList.add('danger');
        bold.innerHTML = 'Draft: ';
        dom.lastMessageSpan.prepend(bold);
      } else if(peer._ !== 'peerUser' && peerId !== lastMessage.fromId && !lastMessage.action) {
        const sender = appPeersManager.getPeer(lastMessage.fromId);
        if(sender && sender.id) {
          const senderBold = document.createElement('b');

          let str = '';
          if(sender.id === rootScope.myId) {
            str = 'You';
          } else {
            //str = sender.first_name || sender.last_name || sender.username;
            str = appPeersManager.getPeerTitle(lastMessage.fromId, true, true);
          }

          //senderBold.innerText = str + ': ';
          senderBold.innerHTML = RichTextProcessor.wrapRichText(str, {noLinebreaks: true, noLinks: true}) + ': ';
          //console.log(sender, senderBold.innerText);
          dom.lastMessageSpan.prepend(senderBold);
        } //////// else console.log('no sender', lastMessage, peerId);
      }
    }

    if(!lastMessage.deleted || draftMessage/*  && lastMessage._ !== 'draftMessage' */) {
      const date = draftMessage ? Math.max(draftMessage.date, lastMessage.date || 0) : lastMessage.date;
      dom.lastTimeSpan.innerHTML = formatDateAccordingToToday(new Date(date * 1000));
    } else dom.lastTimeSpan.innerHTML = '';

    if(this.doms[peerId] === dom) {
      this.setUnreadMessages(dialog);
    } else { // means search
      dom.listEl.dataset.mid = lastMessage.mid;
    }
  }

  private setUnreadMessages(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerId);

    if(dialog.folder_id === 1) {
      this.accumulateArchivedUnread();
    }

    if(!dom) {
      //this.log.error('setUnreadMessages no dom!', dialog);
      return;
    }

    const isMuted = appMessagesManager.isDialogMuted(dialog);
    const wasMuted = dom.listEl.classList.contains('is-muted');
    if(isMuted !== wasMuted) {
      SetTransition(dom.listEl, 'is-muted', isMuted, 200);
    }

    const lastMessage = dialog.draft && dialog.draft._ === 'draftMessage' ? 
      dialog.draft : 
      appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
    if(lastMessage._ !== 'messageEmpty' && !lastMessage.deleted && 
      lastMessage.pFlags.out && lastMessage.peerId !== rootScope.myId/*  && 
      dialog.read_outbox_max_id */) { // maybe comment, 06.20.2020
      const outgoing = (lastMessage.pFlags && lastMessage.pFlags.unread)
        /*  && dialog.read_outbox_max_id !== 0 */; // maybe uncomment, 31.01.2020
    
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

    const filter = appMessagesManager.filtersStorage.filters[this.filterId];
    let isPinned: boolean;
    if(filter) {
      isPinned = filter.pinned_peers.findIndex(peerId => peerId === dialog.peerId) !== -1;
    } else {
      isPinned = !!dialog.pFlags.pinned;
    }

    if(isPinned) {
      dom.unreadMessagesSpan.classList.add('tgico-chatspinned', 'tgico');
    } else {
      dom.unreadMessagesSpan.classList.remove('tgico-chatspinned', 'tgico');
    }

    if(dialog.unread_count || dialog.pFlags.unread_mark) {
      //dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count ? formatNumber(dialog.unread_count, 1) : ' ');
      dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count || ' ');
      dom.unreadMessagesSpan.classList.add('unread');
    } else {
      dom.unreadMessagesSpan.classList.remove('unread');
    }
  }

  private accumulateArchivedUnread() {
    if(this.accumulateArchivedTimeout) return;
    this.accumulateArchivedTimeout = window.setTimeout(() => {
      this.accumulateArchivedTimeout = 0;
      const dialogs = appMessagesManager.dialogsStorage.getFolder(1);
      const sum = dialogs.reduce((acc, dialog) => acc + dialog.unread_count, 0);
      rootScope.broadcast('dialogs_archived_unread', {count: sum});
    }, 0);
  }

  private getDialogDom(peerId: number) {
    return this.doms[peerId];
  }

  public addDialogNew(options: {
    dialog: Dialog | number,
    container?: HTMLUListElement | Scrollable,
    drawStatus?: boolean,
    rippleEnabled?: boolean,
    onlyFirstName?: boolean,
    meAsSaved?: boolean,
    append?: boolean,
    avatarSize?: number,
    autonomous?: boolean
  }) {
    return this.addDialog(options.dialog, options.container, options.drawStatus, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append, options.avatarSize, options.autonomous);
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement | Scrollable, drawStatus = true, rippleEnabled = true, onlyFirstName = false, meAsSaved = true, append = true, avatarSize = 54, autonomous = !!container) {
    let dialog: Dialog;
    
    if(typeof(_dialog) === 'number') {
      let originalDialog = appMessagesManager.getDialogByPeerId(_dialog)[0];
      if(!originalDialog) {
        originalDialog = {
          peerId: _dialog,
          peer: appPeersManager.getOutputPeer(_dialog),
          pFlags: {}
        } as any;
      }

      dialog = originalDialog;
    } else {
      dialog = _dialog;
    }

    const peerId: number = dialog.peerId;

    if(!container) {
      if(this.doms[peerId]) return;

      const filter = appMessagesManager.filtersStorage.filters[this.filterId];
      if((filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || (!filter && this.filterId !== dialog.folder_id)) {
        return;
      }
    }

    let title = appPeersManager.getPeerTitle(peerId, false, onlyFirstName);

    const avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', meAsSaved ? '1' : '0');
    avatarEl.setAttribute('peer', '' + peerId);
    avatarEl.classList.add('dialog-avatar', 'avatar-' + avatarSize);

    if(drawStatus && peerId !== rootScope.myId && dialog.peer) {
      const peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          const user = appUsersManager.getUser(peerId);
          //console.log('found user', user);
  
          if(user.status && user.status._ === 'userStatusOnline') {
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

    if(peerId === rootScope.myId && meAsSaved) {
      title = onlyFirstName ? 'Saved' : 'Saved Messages';
    } 

    titleSpan.innerHTML = title;
    titleSpanContainer.append(titleSpan);
    //p.classList.add('')

    // в других случаях иконка верификации не нужна (а первый - это главные чатлисты)
    //if(!container) {
      const peer = appPeersManager.getPeer(peerId);

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
    }

    const li = document.createElement('li');
    li.append(paddingDiv);
    li.dataset.peerId = '' + peerId;

    const statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status');

    const lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    const unreadMessagesSpan = document.createElement('div');
    unreadMessagesSpan.className = 'dialog-subtitle-badge badge badge-24';

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
    for(const folderId in this.chatLists) {
      if(this.chatLists[folderId] === container) {
        good = true;
      }
    } */
    const method: 'append' | 'prepend' = append ? 'append' : 'prepend';
    if(!container/*  || good */) {
      this.scroll[method](li);

      this.doms[dialog.peerId] = dom;

      /* if(container) {
        container.append(li);
      } */

      const isMuted = appMessagesManager.isDialogMuted(dialog);
      if(isMuted) {
        li.classList.add('is-muted');
      }

      this.setLastMessage(dialog);
    } else {
      container[method](li);
    }

    if(!autonomous && appImManager.chat?.peerId === peerId) {
      li.classList.add('active');
      this.lastActiveElements.add(li);
    } 
    
    return {dom, dialog};
  }

  public setTyping(dialog: Dialog, user: User) {
    const dom = this.getDialogDom(dialog.peerId);
    if(!dom) {
      return;
    }

    let str = '';
    if(dialog.peerId < 0) {
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
    const dom = this.getDialogDom(dialog.peerId);
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
