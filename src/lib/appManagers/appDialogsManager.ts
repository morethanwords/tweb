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
import { isApple, isSafari } from "../../helpers/userAgent";
import { logger, LogLevels } from "../logger";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import { findUpClassName, findUpTag, positionElementByIndex } from "../../helpers/dom";
import appImManager, { AppImManager } from "./appImManager";
import appMessagesManager, { Dialog } from "./appMessagesManager";
import {MyDialogFilter as DialogFilter} from "../storages/filters";
import appPeersManager from './appPeersManager';
import appStateManager from "./appStateManager";
import appUsersManager, { User } from "./appUsersManager";
import { App, MOUNT_CLASS_TO } from "../mtproto/mtproto_config";
import Button from "../../components/button";
import SetTransition from "../../components/singleTransition";
import AppStorage from '../storage';
import apiUpdatesManager from "./apiUpdatesManager";

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
  private statusContainer: HTMLElement;
  private statusEl: HTMLElement;
  private statusPreloader: HTMLElement;

  private currentText = '';

  private connecting = false;
  private updating = false;

  private log: ReturnType<typeof logger>;

  constructor(chatsContainer: HTMLElement) {
    this.log = logger('CS');
  
    this.statusContainer = document.createElement('div');
    this.statusContainer.classList.add('connection-status');

    this.statusEl = Button('btn-primary bg-warning connection-status-button', {noRipple: true});
    this.statusPreloader = putPreloader(null, true).firstElementChild as HTMLElement;
    this.statusContainer.append(this.statusEl);

    chatsContainer.prepend(this.statusContainer);

    rootScope.on('connection_status_change', (e) => {
      const status = e.detail;
      console.log(status);

      setConnectionStatus();
    });

    rootScope.on('state_synchronizing', (e) => {
      const channelId = e.detail;
      if(!channelId) {
        this.updating = true;
        this.log('updating', this.updating);
        this.setState();
      }
    });

    rootScope.on('state_synchronized', (e) => {
      const channelId = e.detail;
      this.log('state_synchronized', channelId);
      if(!channelId) {
        this.updating = false;
        this.log('updating', this.updating);
        this.setState();
      }
    });

    const setConnectionStatus = () => {
      AppStorage.get<number>('dc').then(baseDcId => {
        if(!baseDcId) {
          baseDcId = App.baseDcId;
        }
        
        if(setFirstConnectionTimeout) {
          clearTimeout(setFirstConnectionTimeout);
          setFirstConnectionTimeout = 0;
        }

        const status = rootScope.connectionStatus['NET-' + baseDcId];
        const online = status && status.online;

        if(this.connecting && online) {
          apiUpdatesManager.forceGetDifference();
        }

        this.connecting = !online;
        this.log('connecting', this.connecting);
        this.setState();
      });
    };

    let setFirstConnectionTimeout = window.setTimeout(setConnectionStatus, 2e3);

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

  private setStatusText = (text: string) => {
    if(this.currentText == text) return;
    this.statusEl.innerText = this.currentText = text;
    this.statusEl.appendChild(this.statusPreloader);
  };

  private setState = () => {
    if(this.connecting) {
      this.setStatusText('Waiting for network...');
    } else if(this.updating) {
      this.setStatusText('Updating...');
    }

    this.log('setState', this.connecting || this.updating);
    window.requestAnimationFrame(() => {
      SetTransition(this.statusContainer, 'is-shown', this.connecting || this.updating, 200);
    });
  };
}

export class AppDialogsManager {
  public _chatList = document.getElementById('dialogs') as HTMLUListElement;
  public chatList = this._chatList;

  public doms: {[peerId: number]: DialogDom} = {};
  public lastActiveListElement: HTMLElement = null;

  public chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;
  private chatsPreloader: HTMLDivElement;

  public loadDialogsPromise: Promise<any>;

  public scroll: Scrollable = null;
  public _scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogLevels.log | LogLevels.error | LogLevels.warn | LogLevels.debug);

  public contextMenu = new DialogsContextMenu();

  public chatLists: {[filterId: number]: HTMLUListElement} = {
    0: this.chatList,
    1: appSidebarLeft.archivedTab.chatList
  };
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

  constructor() {
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
      const userId = e.detail;
      const user = appUsersManager.getUser(userId);
      const dialog = appMessagesManager.getDialogByPeerId(user.id)[0];
      //console.log('updating user:', user, dialog);

      if(dialog && !appUsersManager.isBot(dialog.peerId) && dialog.peerId != rootScope.myId) {
        const online = user.status?._ == 'userStatusOnline';
        const dom = this.getDialogDom(dialog.peerId);

        if(dom) {
          dom.avatarEl.classList.toggle('is-online', online);
        }
      }
    });

    /* rootScope.$on('dialog_top', (e) => {
      const dialog = e.detail;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setFiltersUnreadCount();
    }); */

    rootScope.on('dialog_flush', (e) => {
      const peerId: number = e.detail.peerId;
      const dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
      if(dialog) {
        this.setLastMessage(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.on('dialogs_multiupdate', (e) => {
      const dialogs = e.detail;

      for(const id in dialogs) {
        const dialog = dialogs[id];
        this.updateDialog(dialog);
      }

      this.validateForFilter();
      this.setFiltersUnreadCount();
    });

    rootScope.on('dialog_drop', (e) => {
      const {peerId, dialog} = e.detail;

      const dom = this.getDialogDom(peerId);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[peerId];
      }

      this.setFiltersUnreadCount();
    });

    rootScope.on('dialog_unread', (e) => {
      const info = e.detail;

      const dialog = appMessagesManager.getDialogByPeerId(info.peerId)[0];
      if(dialog) {
        this.setUnreadMessages(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.on('dialog_notify_settings', e => {
      const dialog = appMessagesManager.getDialogByPeerId(e.detail)[0];
      if(dialog) {
        this.setUnreadMessages(dialog); // возможно это не нужно, но нужно менять is-muted
      }
    });

    rootScope.on('peer_changed', (e) => {
      let peerId = e.detail;

      let lastPeerId = this.lastActiveListElement && +this.lastActiveListElement.getAttribute('data-peerId');
      if(this.lastActiveListElement && lastPeerId != peerId) {
        this.lastActiveListElement.classList.remove('active');
        this.lastActiveListElement = null;
      }
    
      if(lastPeerId != peerId) {
        let dom = this.getDialogDom(peerId);
        if(dom) {
          this.lastActiveListElement = dom.listEl;
          dom.listEl.classList.add('active');
        }
      }
    });

    rootScope.on('filter_update', (e) => {
      const filter: DialogFilter = e.detail;
      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
        return;
      } else if(filter.id == this.filterId) { // это нет тут смысла вызывать, так как будет dialogs_multiupdate
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

    rootScope.on('filter_order', (e) => {
      const order = e.detail;
      
      const containerToAppend = this.folders.menu.firstElementChild as HTMLUListElement;
      order.forEach((filterId) => {
        const filter = appMessagesManager.filtersStorage.filters[filterId];
        const renderedFilter = this.filtersRendered[filterId];

        positionElementByIndex(renderedFilter.menu, containerToAppend, filter.orderIndex);
        positionElementByIndex(renderedFilter.container, this.folders.container, filter.orderIndex);
      });

      if(this.filterId) {
        const tabIndex = order.indexOf(this.filterId) + 1;
        selectTab.prevId = tabIndex;
      }
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId, typings} = e.detail;

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
      /* if(id != 0) {
        id += 1;
      } */

      foldersScrollable.scrollIntoView(this.folders.menu.firstElementChild.children[id] as HTMLElement, true, 250);

      id = +tabContent.dataset.filterId || 0;

      if(this.filterId == id) return;

      this.chatLists[id].innerHTML = '';
      this.scroll.setVirtualContainer(this.chatLists[id]);
      this.filterId = id;
      this.onTabChange();
    }, () => {
      for(const folderId in this.chatLists) {
        if(+folderId != this.filterId) {
          this.chatLists[folderId].innerHTML = '';
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
    }).then(() => {
      appMessagesManager.getConversationsAll('', 0).finally(() => {
        appMessagesManager.getConversationsAll('', 1).then(() => {
          this.accumulateArchivedUnread();
        });
      });
    });

    new ConnectionStatusComponent(this.chatsContainer);
    this.chatsContainer.append(bottomPart);

    /* const mutationObserver = new MutationObserver((mutationList, observer) => {

    });

    mutationObserver.observe */
  }

  get topOffsetIndex() {
    if(!this.scroll.loadedAll['top']) {
      const element = this.chatList.firstElementChild;
      if(element) {
        const peerId = +element.getAttribute('data-peerId');
        const dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
        return dialog.index;
      }
    }

    return 0;
  }

  private updateDialog(dialog: Dialog) {
    if(!dialog) {
      return;
    }

    if(this.topOffsetIndex && dialog.index > this.topOffsetIndex) {
      const dom = this.getDialogDom(dialog.peerId);
      if(dom) {
        dom.listEl.remove();
        delete this.doms[dialog.peerId];
      }

      return;
    }

    if(!this.doms.hasOwnProperty(dialog.peerId)) {
      this.addDialogNew({dialog});
    }

    if(this.getDialogDom(dialog.peerId)) {
      this.setLastMessage(dialog);
      this.reorderDialogs();
    }
  }

  onTabChange = () => {
    this.doms = {};
    this.scroll.loadedAll.top = true;
    this.scroll.loadedAll.bottom = false;
    this.lastActiveListElement = null;
    this.loadDialogsPromise = undefined;
    this.chatList = this.chatLists[this.filterId];
    this.loadDialogs();
  };

  private setFilterUnreadCount(filterId: number, folder?: Dialog[]) {
    const unreadSpan = filterId == 0 ? this.allUnreadCount : this.filtersRendered[filterId]?.unread;
    if(!unreadSpan) {
      return;
    }

    folder = folder || appMessagesManager.dialogsStorage.getFolder(filterId);
    const sum = folder.reduce((acc, dialog) => acc + +!!dialog.unread_count, 0);
    
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
    //if(this.filterId == 0) return;

    const folder = appMessagesManager.dialogsStorage.getFolder(this.filterId);
    for(const _peerId in this.doms) {
      const peerId = +_peerId;

      // если больше не подходит по фильтру, удаляем
      if(folder.findIndex((dialog) => dialog.peerId == peerId) === -1) {
        const listEl = this.doms[peerId].listEl;
        listEl.remove();
        delete this.doms[peerId];

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
    unreadSpan.classList.add('badge', 'badge-20', 'badge-blue');
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
      menu: li,
      container: div,
      unread: unreadSpan,
      title: titleSpan
    };
  }

  private loadDialogs(side: SliceSides = 'bottom') {
    if(testScroll) {
      return;
    }
    
    if(this.loadDialogsPromise/*  || 1 == 1 */) return this.loadDialogsPromise;

    const promise = new Promise(async(resolve, reject) => {
      if(!this.chatList.childElementCount) {
        const container = this.chatList.parentElement;
        container.append(this.chatsPreloader);
      }
  
      //return;
  
      const filterId = this.filterId;
      let loadCount = 30/*this.chatsLoadCount */;
  
      const storage = appMessagesManager.dialogsStorage.getFolder(filterId);
      let offsetIndex = 0;
  
      if(side == 'top') {
        const element = this.chatList.firstElementChild;
        if(element) {
          const peerId = +element.getAttribute('data-peerId');
          const index = storage.findIndex(dialog => dialog.peerId == peerId);
          const needIndex = Math.max(0, index - loadCount);
          loadCount = index - needIndex;
          offsetIndex = storage[needIndex].index + 1;
        }
      } else {
        const element = this.chatList.lastElementChild;
        if(element) {
          const peerId = +element.getAttribute('data-peerId');
          const dialog = storage.find(dialog => dialog.peerId == peerId);
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
  
        if(this.filterId != filterId) {
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
          const storage = appMessagesManager.dialogsStorage.getFolder(filterId);
          if(!result.dialogs.length || (storage.length && storage[0].index < offsetIndex)) {
            this.scroll.loadedAll[side] = true;
          }
        }
        
        if(result.dialogs.length) {
          const dialogs = side == 'top' ? result.dialogs.slice().reverse() : result.dialogs;
  
          /* let previousScrollHeightMinusTop: number;
          //if(isApple || true) {
          if(isApple && side == 'top') {
            const {scrollTop, scrollHeight} = this.scroll;
  
            previousScrollHeightMinusTop = side == 'top' ? scrollHeight - scrollTop : scrollTop;
            //this.scroll.scrollLocked = 1;
          } */
  
          dialogs.forEach((dialog) => {
            this.addDialogNew({
              dialog,
              append: side == 'bottom'
            });
          });
  
          /* if(previousScrollHeightMinusTop !== undefined) {
            const newScrollTop = side == 'top' ? this.scroll.scrollHeight - previousScrollHeightMinusTop : previousScrollHeightMinusTop;
  
            // touchSupport for safari iOS
            isTouchSupported && isApple && (this.scroll.container.style.overflow = 'hidden');
            this.scroll.scrollTop = newScrollTop;
            isTouchSupported && isApple && (this.scroll.container.style.overflow = '');
          } */

          //this.scroll.scrollLocked = 0;
          
          //if(side == 'bottom' || true || (testTopSlice-- > 0 && side == 'top')) {
            //setTimeout(() => {
              /* const sliced = this.scroll.slice(side == 'bottom' ? 'top' : 'bottom', 30); // result.dialogs.length
              sliced.forEach(el => {
                const peerId = +el.getAttribute('data-peerId');
                delete this.doms[peerId];
              }); */
            //}, 0);
          //}
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

      const sliceFromStart = isApple ? [] : children.slice(0, Math.max(0, firstIndex - saveLength));
      const sliceFromEnd = children.slice(lastIndex + saveLength);

      /* if(sliceFromStart.length != sliceFromEnd.length) {
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
        const peerId = +el.getAttribute('data-peerId');
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

      if(elem) {
        if(onFound) onFound();

        let peerId = +elem.getAttribute('data-peerId');
        let lastMsgId = +elem.dataset.mid || undefined;

        if(!samePeer) {
          elem.classList.add('active');
          this.lastActiveListElement = elem;
        }

        appImManager.setPeer(peerId, lastMsgId);
      } else {
        appImManager.setPeer(0);
      }
    }, {capture: true});

    if(withContext) {
      attachContextMenuListener(list, this.contextMenu.onContextMenu);
    }
  }

  private reorderDialogs() {
    //const perf = performance.now();
    if(this.reorderDialogsTimeout) return;
    this.reorderDialogsTimeout = window.requestAnimationFrame(() => {
      this.reorderDialogsTimeout = 0;
      let offset = 0;
      if(this.topOffsetIndex) {
        const element = this.chatList.firstElementChild;
        if(element) {
          const peerId = +element.getAttribute('data-peerId');
          const firstDialog = appMessagesManager.getDialogByPeerId(peerId);
          offset = firstDialog[1];
        }
      }
  
      const dialogs = appMessagesManager.dialogsStorage.getFolder(this.filterId);
      const currentOrder = (Array.from(this.chatList.children) as HTMLElement[]).map(el => +el.getAttribute('data-peerId'));
  
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
  
        if(peerIdByIndex != dialog.peerId) {
          if(positionElementByIndex(dom.listEl, this.chatList, needIndex)) {
            this.log.debug('setDialogPosition:', dialog, dom, peerIdByIndex, needIndex);
          }
        }
      });
  
      //this.log('Reorder time:', performance.now() - perf);
    });
  }

  public setLastMessage(dialog: any, lastMessage?: any, dom?: DialogDom, highlightWord?: string) {
    ///////console.log('setlastMessage:', lastMessage);
    if(!dom) {
      dom = this.getDialogDom(dialog.peerId);

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
      } else if(!lastMessage.deleted) {
        dom.lastMessageSpan.innerHTML = lastMessage.rReply;
      } else {
        dom.lastMessageSpan.innerHTML = '';
      }
  
      /* if(lastMessage.from_id == auth.id) { // You:  */
      if(peer._ != 'peerUser' && peerId != lastMessage.fromId && !lastMessage.action) {
        const sender = appPeersManager.getPeer(lastMessage.fromId);
        if(sender && sender.id) {
          const senderBold = document.createElement('b');

          let str = '';
          if(sender.id == rootScope.myId) {
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

    if(!lastMessage.deleted) {
      dom.lastTimeSpan.innerHTML = formatDateAccordingToToday(new Date(lastMessage.date * 1000));
    } else dom.lastTimeSpan.innerHTML = '';

    if(this.doms[peerId] == dom) {
      this.setUnreadMessages(dialog);
    } else { // means search
      dom.listEl.dataset.mid = lastMessage.mid;
    }
  }

  private setUnreadMessages(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerId);

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
      lastMessage.fromId == rootScope.myId && lastMessage.peerId != rootScope.myId/*  && 
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

    const filter = appMessagesManager.filtersStorage.filters[this.filterId];
    let isPinned: boolean;
    if(filter) {
      isPinned = filter.pinned_peers.findIndex(peerId => peerId == dialog.peerId) !== -1;
    } else {
      isPinned = !!dialog.pFlags.pinned;
    }

    if(dialog.unread_count || dialog.pFlags.unread_mark) {
      //dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count ? formatNumber(dialog.unread_count, 1) : ' ');
      dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count || ' ');
      dom.unreadMessagesSpan.classList.add('unread');
    } else {
      dom.unreadMessagesSpan.classList.remove('unread');
      if(isPinned) {
        dom.unreadMessagesSpan.classList.add('tgico-pinnedchat');
      }
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
    avatarSize?: number
  }) {
    return this.addDialog(options.dialog, options.container, options.drawStatus, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append, options.avatarSize);
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement | Scrollable, drawStatus = true, rippleEnabled = true, onlyFirstName = false, meAsSaved = true, append = true, avatarSize = 54) {
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
      if((filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || (!filter && this.filterId != dialog.folder_id)) {
        return;
      }
    }

    let title = appPeersManager.getPeerTitle(peerId, false, onlyFirstName);

    const avatarEl = new AvatarElement();
    avatarEl.setAttribute('dialog', meAsSaved ? '1' : '0');
    avatarEl.setAttribute('peer', '' + peerId);
    avatarEl.classList.add('dialog-avatar', 'avatar-' + avatarSize);

    if(drawStatus && peerId != rootScope.myId && dialog.peer) {
      const peer = dialog.peer;
      
      switch(peer._) {
        case 'peerUser':
          const user = appUsersManager.getUser(peerId);
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

    if(peerId == rootScope.myId && meAsSaved) {
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
    li.setAttribute('data-peerId', '' + peerId);

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
    for(const folderId in this.chatLists) {
      if(this.chatLists[folderId] == container) {
        good = true;
      }
    } */
    const method: 'append' | 'prepend' = append ? 'append' : 'prepend';
    if(!container/*  || good */) {
      this.scroll[method](li);

      this.doms[dialog.peerId] = dom;

      if(appImManager.chat?.peerId == peerId) {
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
