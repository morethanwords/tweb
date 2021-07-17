/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import AvatarElement from "../../components/avatar";
import DialogsContextMenu from "../../components/dialogsContextMenu";
import { horizontalMenu } from "../../components/horizontalMenu";
import { attachContextMenuListener, putPreloader } from "../../components/misc";
import { ripple } from "../../components/ripple";
//import Scrollable from "../../components/scrollable";
import Scrollable, { ScrollableX, SliceSides } from "../../components/scrollable";
import { formatDateAccordingToTodayNew } from "../../helpers/date";
import { isSafari } from "../../helpers/userAgent";
import { logger, LogTypes } from "../logger";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appPeersManager from './appPeersManager';
import appImManager from "./appImManager";
import appMessagesManager, { Dialog } from "./appMessagesManager";
import {MyDialogFilter as DialogFilter} from "../storages/filters";
import appStateManager, { State } from "./appStateManager";
import appUsersManager from "./appUsersManager";
import Button from "../../components/button";
import SetTransition from "../../components/singleTransition";
import appDraftsManager, { MyDraftMessage } from "./appDraftsManager";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";
import appNotificationsManager from "./appNotificationsManager";
import PeerTitle from "../../components/peerTitle";
import I18n, { FormatterArguments, i18n, LangPackKey, _i18n } from "../langPack";
import findUpTag from "../../helpers/dom/findUpTag";
import { LazyLoadQueueIntersector } from "../../components/lazyLoadQueue";
import lottieLoader from "../lottieLoader";
import { wrapLocalSticker } from "../../components/wrappers";
import AppEditFolderTab from "../../components/sidebarLeft/tabs/editFolder";
import appSidebarLeft from "../../components/sidebarLeft";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import positionElementByIndex from "../../helpers/dom/positionElementByIndex";
import replaceContent from "../../helpers/dom/replaceContent";
import ConnectionStatusComponent from "../../components/connectionStatus";
import appChatsManager from "./appChatsManager";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import { fastRafPromise } from "../../helpers/schedulers";

export type DialogDom = {
  avatarEl: AvatarElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  titleSpanContainer: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadMessagesSpan: HTMLSpanElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLElement,
  listEl: HTMLLIElement,
  muteAnimationTimeout?: number
};

//const testScroll = false;
//let testTopSlice = 1;

export class AppDialogsManager {
  private chatList: HTMLUListElement;

  private doms: {[peerId: number]: DialogDom} = {};

  private chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;
  private chatsPreloader: HTMLElement;

  private loadDialogsPromise: Promise<any>;

  private scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogTypes.Log | LogTypes.Error | LogTypes.Warn | LogTypes.Debug);

  private contextMenu = new DialogsContextMenu();

  public chatLists: {[filterId: number]: HTMLUListElement} = {};
  public scrollables: {[filterId: number]: Scrollable} = {};
  public filterId: number;
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
  private showFiltersPromise: Promise<void>;
  private allUnreadCount: HTMLElement;

  private accumulateArchivedTimeout: number;

  //private topOffsetIndex = 0;

  private sliceTimeout: number;
  private reorderDialogsTimeout: number;

  private lastActiveElements: Set<HTMLElement> = new Set();

  private offsets: {top: number, bottom: number} = {top: 0, bottom: 0};

  constructor() {
    this.chatsPreloader = putPreloader(null, true);

    this.allUnreadCount = this.folders.menu.querySelector('.badge');
    
    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    const bottomPart = document.createElement('div');
    bottomPart.classList.add('connection-status-bottom');
    bottomPart.append(this.folders.container);

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

    this.filterId = 0;
    this.addFilter({
      id: this.filterId,
      title: '',
      titleEl: i18n('ChatList.Filter.AllChats'),
      orderIndex: 0
    });

    this.chatList = this.chatLists[this.filterId];
    this.scroll = this.scrollables[this.filterId];

    /* if(testScroll) {
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
    } */

    rootScope.addEventListener('user_update', (userId) => {
      //console.log('updating user:', user, dialog);
      
      const dom = this.getDialogDom(userId);
      if(dom && !appUsersManager.isBot(userId) && userId !== rootScope.myId) {
        const user = appUsersManager.getUser(userId);
        const online = user.status?._ === 'userStatusOnline';
        dom.avatarEl.classList.toggle('is-online', online);
      }
    });

    /* rootScope.$on('dialog_top', (e) => {
      const dialog = e;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setFiltersUnreadCount();
    }); */

    rootScope.addEventListener('dialog_flush', (e) => {
      const peerId: number = e.peerId;
      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(dialog) {
        this.setLastMessage(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.addEventListener('dialogs_multiupdate', (e) => {
      const dialogs = e;

      for(const id in dialogs) {
        const dialog = dialogs[id];
        this.updateDialog(dialog);
      }

      this.validateForFilter();
      this.setFiltersUnreadCount();
    });

    rootScope.addEventListener('dialog_drop', (e) => {
      const {peerId} = e;

      this.deleteDialog(peerId);
      this.setFiltersUnreadCount();
    });

    rootScope.addEventListener('dialog_unread', (e) => {
      const info = e;

      const dialog = appMessagesManager.getDialogOnly(info.peerId);
      if(dialog) {
        this.setUnreadMessages(dialog);
        this.validateForFilter();
        this.setFiltersUnreadCount();
      }
    });

    rootScope.addEventListener('dialog_notify_settings', (dialog) => {
      this.setUnreadMessages(dialog); // возможно это не нужно, но нужно менять is-muted
    });

    rootScope.addEventListener('dialog_draft', (e) => {
      const dialog = appMessagesManager.getDialogOnly(e.peerId);
      if(dialog) {
        this.updateDialog(dialog);
      }
    });

    rootScope.addEventListener('peer_changed', (e) => {
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

    rootScope.addEventListener('filter_update', (e) => {
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

    rootScope.addEventListener('filter_delete', (e) => {
      const filter: DialogFilter = e;
      const elements = this.filtersRendered[filter.id];
      if(!elements) return;

      // set tab
      //(this.folders.menu.firstElementChild.children[Math.max(0, filter.id - 2)] as HTMLElement).click();
      (this.folders.menu.firstElementChild as HTMLElement).click();

      elements.container.remove();
      elements.menu.remove();
      
      delete this.chatLists[filter.id];
      delete this.scrollables[filter.id];
      delete this.filtersRendered[filter.id];

      if(Object.keys(this.filtersRendered).length <= 1) {
        this.folders.menuScrollContainer.classList.add('hide');
      }
    });

    rootScope.addEventListener('filter_order', (e) => {
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

    rootScope.addEventListener('peer_typings', (e) => {
      const {peerId, typings} = e;

      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(!dialog) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    rootScope.addEventListener('state_cleared', () => {
      //setTimeout(() => 
      appStateManager.getState().then((state) => {
        appUsersManager.clear();
        appChatsManager.clear();
        
        const filtersStorage = appMessagesManager.filtersStorage;
        const filters = filtersStorage.filters;
        for(const filterId in filters) { // delete filters
          rootScope.dispatchEvent('updateDialogFilter', {
            _: 'updateDialogFilter',
            id: +filterId,
          });
        }

        appMessagesManager.clear();

        /* const clearPromises: Promise<any>[] = [];
        for(const name in appStateManager.storagesResults) {
          const results = appStateManager.storagesResults[name as keyof AppStateManager['storages']];
          const storage = appStateManager.storages[name as keyof AppStateManager['storages']];
          results.length = 0;
          clearPromises.push(storage.clear());
        } */

        this.validateForFilter();

        this.onStateLoaded(state);
      })//, 5000);
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
    appMessagesManager.construct();
    appStateManager.getState().then((state) => {
      return this.onStateLoaded(state);
    }).then(() => {
      //return;
      
      const isLoadedMain = appMessagesManager.dialogsStorage.isDialogsLoaded(0);
      const isLoadedArchive = appMessagesManager.dialogsStorage.isDialogsLoaded(1);
      const wasLoaded = isLoadedMain || isLoadedArchive;
      const a: Promise<any> = isLoadedMain ? Promise.resolve() : appMessagesManager.getConversationsAll('', 0);
      const b: Promise<any> = isLoadedArchive ? Promise.resolve() : appMessagesManager.getConversationsAll('', 1);
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

    setTimeout(() => {
      lottieLoader.loadLottieWorkers();
    }, 200);
  }

  private async onStateLoaded(state: State) {
    appNotificationsManager.getNotifyPeerTypeSettings();
      
    const renderFiltersPromise = appMessagesManager.filtersStorage.getDialogFilters().then((filters) => {
      for(const filter of filters) {
        this.addFilter(filter);
      }
    });

    if(state.filters && Object.keys(state.filters).length) {
      await renderFiltersPromise;
      if(this.showFiltersPromise) {
        await this.showFiltersPromise;
      }
    }

    if(appStateManager.storagesResults.dialogs.length) {
      appDraftsManager.addMissedDialogs();
    }

    return this.loadDialogs();
  }

  /* private getOffset(side: 'top' | 'bottom'): {index: number, pos: number} {
    if(!this.scroll.loadedAll[side]) {
      const element = (side === 'top' ? this.chatList.firstElementChild : this.chatList.lastElementChild) as HTMLElement;
      if(element) {
        const peerId = +element.dataset.peerId;
        const dialog = appMessagesManager.getDialogByPeerId(peerId);
        return {index: dialog[0].index, pos: dialog[1]};
      }
    }

    return {index: 0, pos: -1};
  } */
  private getOffsetIndex(side: 'top' | 'bottom') {
    return {index: this.scroll.loadedAll[side] ? 0 : this.offsets[side]};
  }

  private isDialogMustBeInViewport(dialog: Dialog) {
    if(dialog.migratedTo !== undefined) return false;
    //return true;
    const topOffset = this.getOffsetIndex('top');
    const bottomOffset = this.getOffsetIndex('bottom');
    
    if(!topOffset.index && !bottomOffset.index) {
      return true;
    }
    
    const index = dialog.index;
    return (!topOffset.index || index <= topOffset.index) && (!bottomOffset.index || index >= bottomOffset.index);
  }

  private deleteDialog(peerId: number) {
    const dom = this.getDialogDom(peerId);
    if(dom) {
      dom.listEl.remove();
      delete this.doms[peerId];

      this.onListLengthChange();

      return true;
    }

    return false;
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
          this.onListLengthChange();
        } else {
          return;
        }
      }
    } else {
      this.deleteDialog(dialog.peerId);
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

  public onTabChange = () => {
    this.doms = {};
    this.scroll = this.scrollables[this.filterId];
    this.scroll.loadedAll.top = true;
    this.scroll.loadedAll.bottom = false;
    this.offsets.top = this.offsets.bottom = 0;
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
      const isMuted = appNotificationsManager.isPeerLocalMuted(dialog.peerId, true);

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
        this.deleteDialog(peerId);
      }
    }
  }

  public generateScrollable(list: HTMLUListElement, filterId: number) {
    const scrollable = new Scrollable(null, 'CL', 500);
    scrollable.container.addEventListener('scroll', this.onChatsRegularScroll);
    scrollable.container.dataset.filterId = '' + filterId;
    scrollable.container.append(list);
    scrollable.onScrolledTop = this.onChatsScrollTop;
    scrollable.onScrolledBottom = this.onChatsScroll;
    scrollable.setVirtualContainer(list);

    this.chatLists[filterId] = list;
    this.scrollables[filterId] = scrollable;

    return scrollable;
  }

  private addFilter(filter: Pick<DialogFilter, 'title' | 'id' | 'orderIndex'> & Partial<{titleEl: HTMLElement}>) {
    if(this.filtersRendered[filter.id]) return;

    const menuTab = document.createElement('div');
    menuTab.classList.add('menu-horizontal-div-item');
    const span = document.createElement('span');
    const titleSpan = document.createElement('span');
    titleSpan.classList.add('text-super');
    if(filter.titleEl) titleSpan.append(filter.titleEl);
    else titleSpan.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    const unreadSpan = document.createElement('div');
    unreadSpan.classList.add('badge', 'badge-20', 'badge-primary');
    const i = document.createElement('i');
    span.append(titleSpan, unreadSpan, i);
    menuTab.append(span);
    ripple(menuTab);

    const containerToAppend = this.folders.menu as HTMLElement;
    positionElementByIndex(menuTab, containerToAppend, filter.orderIndex);
    //containerToAppend.append(li);

    const ul = this.createChatList();
    const scrollable = this.generateScrollable(ul, filter.id);
    const div = scrollable.container;
    //this.folders.container.append(div);
    positionElementByIndex(scrollable.container, this.folders.container, filter.orderIndex);

    this.setListClickListener(ul, null, true);

    this.filtersRendered[filter.id] = {
      menu: menuTab,
      container: div,
      unread: unreadSpan,
      title: titleSpan
    };

    if(!this.showFiltersPromise && Object.keys(this.filtersRendered).length > 1) {
      this.showFiltersPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          this.showFiltersPromise = undefined;
          if(Object.keys(this.filtersRendered).length > 1) {
            this.folders.menuScrollContainer.classList.remove('hide');
            this.setFiltersUnreadCount();
          }
          resolve();
        }, 0);
      });
    }
  }

  private loadDialogs(side: SliceSides = 'bottom') {
    /* if(testScroll) {
      return;
    } */
    
    if(this.loadDialogsPromise/*  || 1 === 1 */) return this.loadDialogsPromise;

    const promise = new Promise<void>(async(resolve) => {
      if(!this.chatList.childElementCount) {
        const container = this.chatList.parentElement;
        container.append(this.chatsPreloader);
      }
  
      //return;
  
      const filterId = this.filterId;
      let loadCount = 30/*this.chatsLoadCount */;
      let offsetIndex = 0;
      
      const {index: currentOffsetIndex} = this.getOffsetIndex(side);
      if(currentOffsetIndex) {
        if(side === 'top') {
          const storage = appMessagesManager.dialogsStorage.getFolder(filterId);
          const index = storage.findIndex(dialog => dialog.index <= currentOffsetIndex);
          const needIndex = Math.max(0, index - loadCount);
          loadCount = index - needIndex;
          offsetIndex = storage[needIndex].index + 1;
        } else {
          offsetIndex = currentOffsetIndex;
        }
      }
      
      //let offset = storage[storage.length - 1]?.index || 0;
  
      try {
        //console.time('getDialogs time');
  
        const getConversationPromise = (this.filterId > 1 ? appUsersManager.getContacts() as Promise<any> : Promise.resolve()).then(() => {
          return appMessagesManager.getConversations('', offsetIndex, loadCount, filterId);
        });
  
        const result = await getConversationPromise;
  
        if(this.loadDialogsPromise !== promise) {
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

        const offsetDialog = result.dialogs[side === 'top' ? 0 : result.dialogs.length - 1];
        if(offsetDialog) {
          this.offsets[side] = offsetDialog.index;
        }

        this.onListLengthChange();
  
        this.log.debug('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, this.chatList.childElementCount);
  
        setTimeout(() => {
          this.scroll.onScroll();
        }, 0);
      } catch(err) {
        this.log.error(err);
      }
      
      this.chatsPreloader.remove();
      resolve();
    }).finally(() => {
      this.loadDialogsPromise = undefined;
    });

    return this.loadDialogsPromise = promise;
  }

  private generateEmptyPlaceholder(options: {
    title: LangPackKey,
    subtitle?: LangPackKey,
    subtitleArgs?: FormatterArguments,
    classNameType: string
  }) {
    const BASE_CLASS = 'empty-placeholder';
    const container = document.createElement('div');
    container.classList.add(BASE_CLASS, BASE_CLASS + '-' + options.classNameType);
    
    const header = document.createElement('div');
    header.classList.add(BASE_CLASS + '-header');
    _i18n(header, options.title);

    const subtitle = document.createElement('div');
    subtitle.classList.add(BASE_CLASS + '-subtitle');
    if(options.subtitle) {
      _i18n(subtitle, options.subtitle, options.subtitleArgs);
    }

    container.append(header, subtitle);

    return {container, header, subtitle};
  }

  private onListLengthChange = () => {
    //return;
    if(this.filterId === 1) {
      return;
    }

    let placeholderContainer = (Array.from(this.chatList.parentElement.children) as HTMLElement[]).find(el => el.matches('.empty-placeholder'));
    const needPlaceholder = this.scroll.loadedAll.bottom && !this.chatList.childElementCount/*  || true */;
    // this.chatList.style.display = 'none';

    if(needPlaceholder && placeholderContainer) {
      return;
    } else if(!needPlaceholder) {
      if(placeholderContainer) {
        placeholderContainer.remove();
      }

      return;
    }

    let placeholder: ReturnType<AppDialogsManager['generateEmptyPlaceholder']>;
    if(!this.filterId) {
      placeholder = this.generateEmptyPlaceholder({
        title: 'ChatList.Main.EmptyPlaceholder.Title',
        classNameType: 'dialogs'
      });
      
      placeholderContainer = placeholder.container;
      
      const img = document.createElement('img');
      img.classList.add('empty-placeholder-dialogs-icon');
      
      Promise.all([
        appUsersManager.getContacts().then(users => {
          let key: LangPackKey, args: FormatterArguments;

          if(users.length) {
            key = 'ChatList.Main.EmptyPlaceholder.Subtitle';
            args = [i18n('Contacts.Count', [users.length])];
          } else {
            key = 'ChatList.Main.EmptyPlaceholder.SubtitleNoContacts';
            args = [];
          }

          const subtitleEl = new I18n.IntlElement({
            key,
            args,
            element: placeholder.subtitle
          });
        }),
        renderImageFromUrlPromise(img, 'assets/img/EmptyChats.svg'),
        fastRafPromise()
      ]).then(() => {
        placeholderContainer.classList.add('visible');
      });

      placeholderContainer.prepend(img);
    } else {
      placeholder = this.generateEmptyPlaceholder({
        title: 'FilterNoChatsToDisplay',
        subtitle: 'FilterNoChatsToDisplayInfo',
        classNameType: 'folder'
      });

      placeholderContainer = placeholder.container;

      placeholderContainer.prepend(wrapLocalSticker({
        emoji: '📂',
        width: 128,
        height: 128
      }).container)

      const button = Button('btn-primary btn-color-primary btn-control tgico', {
        text: 'FilterHeaderEdit',
        icon: 'settings'
      });

      attachClickEvent(button, () => {
        new AppEditFolderTab(appSidebarLeft).open(appMessagesManager.filtersStorage.filters[this.filterId]);
      });

      placeholderContainer.append(button);
    }

    this.chatList.parentElement.append(placeholderContainer);
  };

  public onChatsRegularScroll = () => {
    if(this.sliceTimeout) clearTimeout(this.sliceTimeout);
    this.sliceTimeout = window.setTimeout(() => {
      this.sliceTimeout = undefined;
      
      if(this.reorderDialogsTimeout) {
        this.onChatsRegularScroll();
        return;
      }

      if(!this.chatList.childElementCount) {
        return;
      }

      /* const observer = new IntersectionObserver((entries) => {
        const 
      });

      Array.from(this.chatList.children).forEach(el => {
        observer.observe(el);
      }); */

      const scrollTopWas = this.scroll.scrollTop;

      const firstElementChild = this.chatList.firstElementChild;
      const rectContainer = this.scroll.container.getBoundingClientRect();
      const rectTarget = firstElementChild.getBoundingClientRect();
      const children = Array.from(this.scroll.splitUp.children) as HTMLElement[];

      // const padding = 8;
      // const offsetTop = this.folders.container.offsetTop;
      let offsetTop = this.scroll.splitUp.offsetTop;
      if(offsetTop && scrollTopWas < offsetTop) offsetTop -= scrollTopWas;
      // const offsetTop = scrollTopWas < padding ? padding - scrollTopWas : 0;
      const firstY = rectContainer.y + offsetTop;
      const lastY = rectContainer.y/*  - 8 */; // 8px - .chatlist padding-bottom
      
      const firstElement = findUpTag(document.elementFromPoint(Math.ceil(rectTarget.x), Math.ceil(firstY + 1)), firstElementChild.tagName) as HTMLElement;
      const lastElement = findUpTag(document.elementFromPoint(Math.ceil(rectTarget.x), Math.floor(lastY + rectContainer.height - 1)), firstElementChild.tagName) as HTMLElement;

      //alert('got element:' + rect.y);

      if(!firstElement || !lastElement) {
        return;
      }

      //alert('got element:' + !!firstElement);

      const firstElementRect = firstElement.getBoundingClientRect();
      const elementOverflow = firstElementRect.y - firstY;

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
        this.scroll.loadedAll.top = false;
      }

      if(sliceFromEnd.length) {
        this.scroll.loadedAll.bottom = false;
      }

      sliced.push(...sliceFromStart);
      sliced.push(...sliceFromEnd);

      sliced.forEach(el => {
        const peerId = +el.dataset.peerId;
        this.deleteDialog(peerId);
      });

      this.setOffsets();

      //this.log('[slicer] elements', firstElement, lastElement, rect, sliced, sliceFromStart.length, sliceFromEnd.length);

      //this.log('[slicer] reset scrollTop', this.scroll.scrollTop, firstElement.offsetTop, firstElementRect.y, rect.y, elementOverflow);

      //alert('left length:' + children.length);

      this.scroll.scrollTop = firstElement.offsetTop - elementOverflow;
      /* const firstElementRect = firstElement.getBoundingClientRect();
      const scrollTop =  */

      //this.scroll.scrollIntoView(firstElement, false);
    }, 200);
  };

  private setOffsets() {
    const firstDialog = this.getDialogFromElement(this.chatList.firstElementChild as HTMLElement);
    const lastDialog = this.getDialogFromElement(this.chatList.lastElementChild as HTMLElement);

    this.offsets.top = firstDialog.index;
    this.offsets.bottom = lastDialog.index;
  }

  private getDialogFromElement(element: HTMLElement) {
    return appMessagesManager.getDialogOnly(+element.dataset.peerId);
  }

  public onChatsScrollTop = () => {
    this.onChatsScroll('top');
  };
  
  public onChatsScroll = (side: SliceSides = 'bottom') => {
    if(this.scroll.loadedAll[side] || this.loadDialogsPromise) return;
    this.log('onChatsScroll', side);
    this.loadDialogs(side);
  };

  public setListClickListener(list: HTMLUListElement, onFound?: () => void, withContext = false, autonomous = false, openInner = false) {
    let lastActiveListElement: HTMLElement;

    const setPeerFunc = (openInner ? appImManager.setInnerPeer : appImManager.setPeer).bind(appImManager);

    list.dataset.autonomous = '' + +autonomous;
    list.addEventListener('mousedown', (e) => {
      if(e.button !== 0) return;
      //cancelEvent(e);

      this.log('dialogs click list');
      const target = e.target as HTMLElement;
      const elem = findUpTag(target, 'LI');

      if(!elem) {
        return;
      }

      if(autonomous) {
        const sameElement = lastActiveListElement === elem;
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

        const peerId = +elem.dataset.peerId;
        const lastMsgId = +elem.dataset.mid || undefined;

        setPeerFunc(peerId, lastMsgId);
      } else {
        setPeerFunc(0);
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

  public createChatList(/* options: {
    avatarSize?: number,
    handheldsSize?: number,
    //size?: number,
  } = {} */) {
    const list = document.createElement('ul');
    list.classList.add('chatlist'/* , 
      'chatlist-avatar-' + (options.avatarSize || 54) *//* , 'chatlist-' + (options.size || 72) */);

    /* if(options.handheldsSize) {
      list.classList.add('chatlist-handhelds-' + options.handheldsSize);
    } */

    return list;
  }

  private reorderDialogs() {
    //const perf = performance.now();
    if(this.reorderDialogsTimeout) {
      window.cancelAnimationFrame(this.reorderDialogsTimeout);
    }
    
    this.reorderDialogsTimeout = window.requestAnimationFrame(() => {
      this.reorderDialogsTimeout = 0;
      const dialogs = appMessagesManager.dialogsStorage.getFolder(this.filterId);

      const currentOrder = (Array.from(this.chatList.children) as HTMLElement[]).map(el => +el.dataset.peerId);

      const {index} = this.getOffsetIndex('top');
      const pos = dialogs.findIndex(dialog => dialog.index <= index);

      const offset = Math.max(0, pos);
      dialogs.forEach((dialog, index) => {
        const dom = this.getDialogDom(dialog.peerId);
        if(!dom) {
          return;
        }
  
        const needIndex = index - offset;
        if(needIndex > currentOrder.length) {
          this.deleteDialog(dialog.peerId);
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

      dom.lastMessageSpan.textContent = '';
      if(highlightWord && lastMessage.message) {
        dom.lastMessageSpan.append(appMessagesManager.wrapMessageForReply(lastMessage, undefined, undefined, false, highlightWord));
      } else if(draftMessage) {
        dom.lastMessageSpan.append(appMessagesManager.wrapMessageForReply(draftMessage));
      } else if(!lastMessage.deleted) {
        dom.lastMessageSpan.append(appMessagesManager.wrapMessageForReply(lastMessage));
      }
  
      /* if(lastMessage.from_id === auth.id) { // You:  */
      if(draftMessage) {
        const bold = document.createElement('b');
        bold.classList.add('danger');
        bold.append(i18n('Draft'));
        bold.append(': ');
        dom.lastMessageSpan.prepend(bold);
      } else if(peer._ !== 'peerUser' && peerId !== lastMessage.fromId && !lastMessage.action) {
        const sender = appPeersManager.getPeer(lastMessage.fromId);
        if(sender && sender.id) {
          const senderBold = document.createElement('b');

          if(sender.id === rootScope.myId) {
            senderBold.append(i18n('FromYou'));
          } else {
            //str = sender.first_name || sender.last_name || sender.username;
            senderBold.append(new PeerTitle({
              peerId: lastMessage.fromId,
              onlyFirstName: true,
            }).element);
          }

          senderBold.append(': ');
          //console.log(sender, senderBold.innerText);
          dom.lastMessageSpan.prepend(senderBold);
        } //////// else console.log('no sender', lastMessage, peerId);
      }
    }

    if(!lastMessage.deleted || draftMessage/*  && lastMessage._ !== 'draftMessage' */) {
      const date = draftMessage ? Math.max(draftMessage.date, lastMessage.date || 0) : lastMessage.date;
      dom.lastTimeSpan.textContent = '';
      dom.lastTimeSpan.append(formatDateAccordingToTodayNew(new Date(date * 1000)));
    } else dom.lastTimeSpan.textContent = '';

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

    const isMuted = appNotificationsManager.isPeerLocalMuted(dialog.peerId, true);
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
      rootScope.dispatchEvent('dialogs_archived_unread', {count: sum});
    }, 0);
  }

  private getDialogDom(peerId: number) {
    return this.doms[peerId];
  }

  public addDialogNew(options: {
    dialog: Dialog | number,
    container?: HTMLUListElement | Scrollable | false,
    drawStatus?: boolean,
    rippleEnabled?: boolean,
    onlyFirstName?: boolean,
    meAsSaved?: boolean,
    append?: boolean,
    avatarSize?: number,
    autonomous?: boolean,
    lazyLoadQueue?: LazyLoadQueueIntersector,
  }) {
    return this.addDialog(options.dialog, options.container, options.drawStatus, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append, options.avatarSize, options.autonomous, options.lazyLoadQueue);
  }

  public addDialog(_dialog: Dialog | number, container?: HTMLUListElement | Scrollable | false, drawStatus = true, rippleEnabled = true, onlyFirstName = false, meAsSaved = true, append = true, avatarSize = 54, autonomous = !!container, lazyLoadQueue?: LazyLoadQueueIntersector) {
    let dialog: Dialog;
    
    if(typeof(_dialog) === 'number') {
      let originalDialog = appMessagesManager.getDialogOnly(_dialog);
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

    if(container === undefined) {
      if(this.doms[peerId] || dialog.migratedTo !== undefined) return;

      const filter = appMessagesManager.filtersStorage.filters[this.filterId];
      if((filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || (!filter && this.filterId !== dialog.folder_id)) {
        return;
      }
    }

    const avatarEl = new AvatarElement();
    avatarEl.lazyLoadQueue = lazyLoadQueue;
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

    const peerTitle = new PeerTitle({
      peerId,
      dialog: meAsSaved,
      onlyFirstName,
      plainText: false
    });

    titleSpanContainer.append(peerTitle.element);
    //p.classList.add('')

    // в других случаях иконка верификации не нужна (а первый - это главные чатлисты)
    //if(!container) {
      const peer = appPeersManager.getPeer(peerId);

      // for muted icon
      titleSpanContainer.classList.add('tgico'); // * эта строка будет актуальна только для !container, но ладно

      if(peer?.pFlags?.verified) {
        titleSpanContainer.classList.add('is-verified');
        titleSpanContainer.append(generateVerifiedIcon());
      }
    //}
    
    const span = document.createElement('span');
    span.classList.add('user-last-message');
    span.setAttribute('dir', 'auto');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    const li = document.createElement('li');
    if(rippleEnabled) {
      ripple(li);
    }

    li.append(avatarEl, captionDiv);
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
      titleSpan: peerTitle.element,
      titleSpanContainer,
      statusSpan,
      lastTimeSpan,
      unreadMessagesSpan,
      lastMessageSpan: span,
      containerEl: li,
      listEl: li
    };

    /* let good = false;
    for(const folderId in this.chatLists) {
      if(this.chatLists[folderId] === container) {
        good = true;
      }
    } */
    const method: 'append' | 'prepend' = append ? 'append' : 'prepend';
    if(container === undefined/*  || good */) {
      this.scroll[method](li);

      this.doms[dialog.peerId] = dom;

      /* if(container) {
        container.append(li);
      } */

      const isMuted = appNotificationsManager.isPeerLocalMuted(dialog.peerId, true);
      if(isMuted) {
        li.classList.add('is-muted');
      }

      this.setLastMessage(dialog);
    } else if(container) {
      container[method](li);
    }

    if(!autonomous && appImManager.chat?.peerId === peerId) {
      li.classList.add('active');
      this.lastActiveElements.add(li);
    } 
    
    return {dom, dialog};
  }

  public setTyping(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerId);
    if(!dom) {
      return;
    }

    let typingElement = dom.lastMessageSpan.querySelector('.peer-typing-container') as HTMLElement;
    if(typingElement) {
      appImManager.getPeerTyping(dialog.peerId, typingElement);
    } else {
      typingElement = appImManager.getPeerTyping(dialog.peerId);
      replaceContent(dom.lastMessageSpan, typingElement);
      dom.lastMessageSpan.classList.add('user-typing');
    }
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

export function generateVerifiedIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttributeNS(null, 'viewBox', '0 0 24 24');
  svg.setAttributeNS(null, 'width', '24');
  svg.setAttributeNS(null, 'height', '24');
  svg.classList.add('verified-icon');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS(null, 'href', '#verified-background');
  use.classList.add('verified-background');

  const use2 = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use2.setAttributeNS(null, 'href', '#verified-check');
  use2.classList.add('verified-check');

  svg.append(use, use2);

  return svg;
}

const appDialogsManager = new AppDialogsManager();
MOUNT_CLASS_TO.appDialogsManager = appDialogsManager;
export default appDialogsManager;
