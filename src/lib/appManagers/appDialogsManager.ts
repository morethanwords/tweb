/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type DialogsStorage from "../storages/dialogs";
import type {MyDialogFilter as DialogFilter, MyDialogFilter} from "../storages/filters";
import type { LazyLoadQueueIntersector } from "../../components/lazyLoadQueue";
import AvatarElement from "../../components/avatar";
import DialogsContextMenu from "../../components/dialogsContextMenu";
import { horizontalMenu } from "../../components/horizontalMenu";
import { attachContextMenuListener, putPreloader } from "../../components/misc";
import ripple from "../../components/ripple";
//import Scrollable from "../../components/scrollable";
import Scrollable, { ScrollableX, SliceSides } from "../../components/scrollable";
import { formatDateAccordingToTodayNew } from "../../helpers/date";
import { IS_MOBILE_SAFARI, IS_SAFARI } from "../../environment/userAgent";
import { logger, LogTypes } from "../logger";
import { RichTextProcessor } from "../richtextprocessor";
import rootScope from "../rootScope";
import appPeersManager from './appPeersManager';
import appImManager from "./appImManager";
import appMessagesManager, { Dialog, MyMessage } from "./appMessagesManager";
import appStateManager, { State } from "./appStateManager";
import appUsersManager, { User } from "./appUsersManager";
import Button from "../../components/button";
import SetTransition from "../../components/singleTransition";
import appDraftsManager, { MyDraftMessage } from "./appDraftsManager";
import DEBUG, { MOUNT_CLASS_TO } from "../../config/debug";
import appNotificationsManager from "./appNotificationsManager";
import PeerTitle from "../../components/peerTitle";
import I18n, { FormatterArguments, i18n, LangPackKey, _i18n } from "../langPack";
import findUpTag from "../../helpers/dom/findUpTag";
import lottieLoader from "../rlottie/lottieLoader";
import { wrapLocalSticker, wrapPhoto } from "../../components/wrappers";
import AppEditFolderTab from "../../components/sidebarLeft/tabs/editFolder";
import appSidebarLeft, { SettingSection } from "../../components/sidebarLeft";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import positionElementByIndex from "../../helpers/dom/positionElementByIndex";
import replaceContent from "../../helpers/dom/replaceContent";
import ConnectionStatusComponent from "../../components/connectionStatus";
import appChatsManager from "./appChatsManager";
import { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import { fastRafConventional, fastRafPromise } from "../../helpers/schedulers";
import SortedUserList from "../../components/sortedUserList";
import { IS_TOUCH_SUPPORTED } from "../../environment/touchSupport";
import handleTabSwipe from "../../helpers/dom/handleTabSwipe";
import windowSize from "../../helpers/windowSize";
import isInDOM from "../../helpers/dom/isInDOM";
import appPhotosManager, { MyPhoto } from "./appPhotosManager";
import { MyDocument } from "./appDocsManager";
import { setSendingStatus } from "../../components/sendingStatus";
import SortedList, { SortedElementBase } from "../../helpers/sortedList";
import debounce from "../../helpers/schedulers/debounce";
import { NULL_PEER_ID } from "../mtproto/mtproto_config";
import groupCallActiveIcon from "../../components/groupCallActiveIcon";
import { Chat, NotifyPeer } from "../../layer";
import IS_GROUP_CALL_SUPPORTED from "../../environment/groupCallSupport";
import mediaSizes from "../../helpers/mediaSizes";
import appNavigationController, { NavigationItem } from "../../components/appNavigationController";
import assumeType from "../../helpers/assumeType";
import generateTitleIcons from "../../components/generateTitleIcons";
import appMediaPlaybackController from "../../components/appMediaPlaybackController";

export type DialogDom = {
  avatarEl: AvatarElement,
  captionDiv: HTMLDivElement,
  titleSpan: HTMLSpanElement,
  titleSpanContainer: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  unreadBadge: HTMLElement,
  callIcon?: ReturnType<typeof groupCallActiveIcon>,
  mentionsBadge?: HTMLElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLElement,
  listEl: HTMLLIElement,
  subtitleEl: HTMLElement
};

interface SortedDialog extends SortedElementBase {
  dom: DialogDom,
  loadPromises?: Promise<any>[]
}

class SortedDialogList extends SortedList<SortedDialog> {
  constructor(
    public list: HTMLUListElement, 
    public indexKey: ReturnType<DialogsStorage['getDialogIndexKey']>,
    public onListLengthChange?: () => void
  ) {
    super({
      getIndex: (element) => appMessagesManager.getDialogOnly(element.id)[this.indexKey],
      onDelete: (element) => {
        element.dom.listEl.remove();
        this.onListLengthChange && this.onListLengthChange();
      },
      onSort: (element, idx) => {
        const willChangeLength = element.dom.listEl.parentElement !== this.list;
        positionElementByIndex(element.dom.listEl, this.list, idx);

        if(willChangeLength) {
          this.onListLengthChange && this.onListLengthChange();
        }
      },
      onElementCreate: (base, batch) => {
        const loadPromises: Promise<any>[] = batch ? [] : undefined;

        const {dom} = appDialogsManager.addListDialog({dialog: base.id, loadPromises, isBatch: batch});
        (base as SortedDialog).dom = dom;

        if(loadPromises?.length) {
          (base as SortedDialog).loadPromises = loadPromises;
          Promise.all(loadPromises).finally(() => {
            delete (base as SortedDialog).loadPromises;
          });
        }

        return base as SortedDialog;
      },
      updateElementWith: fastRafConventional
    });
  }

  public clear() {
    this.list.innerHTML = '';
    super.clear();
  }
}

//const testScroll = false;
//let testTopSlice = 1;

export class AppDialogsManager {
  private chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;
  private chatsPreloader: HTMLElement;

  private loadDialogsPromise: Promise<any>;

  private scroll: Scrollable = null;
  
  private log = logger('DIALOGS', LogTypes.Log | LogTypes.Error | LogTypes.Warn | LogTypes.Debug);

  private contextMenu = new DialogsContextMenu();

  public sortedList: SortedDialogList;
  public sortedLists: {[filterId: number]: SortedDialogList} = {};
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

  private sliceTimeout: number;

  private lastActiveElements: Set<HTMLElement> = new Set();

  private offsets: {top: number, bottom: number} = {top: 0, bottom: 0};
  
  private loadContacts: () => void;
  private processContact: (peerId: PeerId) => void;

  private indexKey: ReturnType<DialogsStorage['getDialogIndexKey']>;

  private initedListeners = false;

  private onListLengthChange: () => Promise<void>;
  private loadedDialogsAtLeastOnce = false;
  private allChatsIntlElement: I18n.IntlElement;

  private emptyDialogsPlaceholderSubtitle: I18n.IntlElement;
  private updateContactsLengthPromise: Promise<number>;

  private filtersNavigationItem: NavigationItem;

  constructor() {
    this.chatsPreloader = putPreloader(null, true);

    this.allUnreadCount = this.folders.menu.querySelector('.badge');
    
    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    this.onListLengthChange = debounce(this._onListLengthChange, 100, false, true);

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

    if(IS_TOUCH_SUPPORTED) {
      handleTabSwipe({
        element: this.folders.container,
        onSwipe: (xDiff) => {
          const prevId = selectTab.prevId();
          selectTab(xDiff > 0 ? prevId + 1 : prevId - 1);
        }
      });
    }

    this.allChatsIntlElement = new I18n.IntlElement({
      key: 'FilterAllChatsShort'
    });
    this.setFilterId(0);
    this.addFilter({
      id: this.filterId,
      title: '',
      titleEl: this.allChatsIntlElement.element,
      orderIndex: 0
    });

    this.sortedList = this.sortedLists[this.filterId];
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

    rootScope.addEventListener('state_cleared', () => {
      //setTimeout(() => 
      appStateManager.getState().then((state) => {
        this.loadedDialogsAtLeastOnce = false;

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

        this.sortedList.clear();
        this.onTabChange();
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

      if(!IS_MOBILE_SAFARI) {
        if(id) {
          if(!this.filtersNavigationItem) {
            this.filtersNavigationItem = {
              type: 'filters',
              onPop: () => {
                selectTab(0);
                this.filtersNavigationItem = undefined;
              }
            };
    
            appNavigationController.spliceItems(1, 0, this.filtersNavigationItem);
          }
        } else if(this.filtersNavigationItem) {
          appNavigationController.removeItem(this.filtersNavigationItem);
          this.filtersNavigationItem = undefined;
        }
      }

      if(this.filterId === id) return;

      this.sortedLists[id].clear();
      this.setFilterId(id);
      this.onTabChange();
    }, () => {
      for(const folderId in this.sortedLists) {
        if(+folderId !== this.filterId) {
          this.sortedLists[folderId].clear();
        }
      }
    }, undefined, foldersScrollable);

    //selectTab(0);
    (this.folders.menu.firstElementChild as HTMLElement).click();
    appMessagesManager.construct();
    appStateManager.getState().then((state) => {
      // * it should've had a better place :(
      appMediaPlaybackController.setPlaybackParams(state.playbackParams);
      rootScope.addEventListener('media_playback_params', (params) => {
        appStateManager.pushToState('playbackParams', params);
      });
      
      return this.onStateLoaded(state);
    })/* .then(() => {
      const isLoadedMain = appMessagesManager.dialogsStorage.isDialogsLoaded(0);
      const isLoadedArchive = appMessagesManager.dialogsStorage.isDialogsLoaded(1);
      const wasLoaded = isLoadedMain || isLoadedArchive;
      const a: Promise<any> = isLoadedMain ? Promise.resolve() : appMessagesManager.getConversationsAll('', 0);
      const b: Promise<any> = isLoadedArchive ? Promise.resolve() : appMessagesManager.getConversationsAll('', 1);
      a.finally(() => {
        b.then(() => {
          if(wasLoaded) {
            (apiUpdatesManager.updatesState.syncLoading || Promise.resolve()).then(() => {
              appMessagesManager.refreshConversations();
            });
          }
        });
      });
    }) */;

    mediaSizes.addEventListener('resize', () => {
      this.changeFiltersAllChatsKey();
    });

    new ConnectionStatusComponent(this.chatsContainer);
    this.chatsContainer.append(bottomPart);

    setTimeout(() => {
      lottieLoader.loadLottieWorkers();
    }, 200);
  }

  public get chatList() {
    return this.sortedList.list;
  }

  public setFilterId(filterId: number) {
    this.filterId = filterId;
    this.indexKey = appMessagesManager.dialogsStorage ? appMessagesManager.dialogsStorage.getDialogIndexKey(this.filterId) : 'index';
    rootScope.filterId = filterId;
  }

  private setOnlineStatus(element: HTMLElement, online: boolean) {
    const className = 'is-online';
    const hasClassName = element.classList.contains(className);
    !hasClassName && online && element.classList.add(className);
    SetTransition(element, 'is-visible', online, 250, online ? undefined : () => {
      element.classList.remove(className);
    }, online && !hasClassName ? 2 : 0);
  }

  private initListeners() {
    rootScope.addEventListener('user_update', (userId) => {
      //console.log('updating user:', user, dialog);
      
      const peerId = userId.toPeerId();
      const dom = this.getDialogDom(peerId);
      if(dom && !appUsersManager.isBot(userId) && peerId !== rootScope.myId) {
        const user = appUsersManager.getUser(userId);
        const online = user.status?._ === 'userStatusOnline';
        this.setOnlineStatus(dom.avatarEl, online);
      }
    });

    rootScope.addEventListener('chat_update', (chatId) => {
      const peerId = chatId.toPeerId(true);
      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(dialog) {
        this.processDialogForCallStatus(dialog);
      }
    });

    /* rootScope.$on('dialog_top', (e) => {
      const dialog = e;

      this.setLastMessage(dialog);
      this.setDialogPosition(dialog);

      this.setFiltersUnreadCount();
    }); */

    rootScope.addEventListener('folder_unread', (folder) => {
      this.setFilterUnreadCount(folder.id);
    });

    rootScope.addEventListener('contacts_update', (userId) => {
      this.processContact && this.processContact(userId.toPeerId());
    });

    rootScope.addEventListener('dialog_flush', ({peerId}) => {
      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(dialog) {
        this.setLastMessage(dialog, undefined, undefined, undefined, undefined, undefined, true);
        this.validateDialogForFilter(dialog);
        this.setFiltersUnreadCount();
      }
    });

    rootScope.addEventListener('dialogs_multiupdate', (dialogs) => {
      for(const peerId in dialogs) {
        const dialog = dialogs[peerId];
        this.updateDialog(dialog);

        if(this.processContact) {
          this.processContact(peerId.toPeerId());
        }

        this.validateDialogForFilter(dialog);
      }
    });

    rootScope.addEventListener('dialog_drop', ({peerId}) => {
      this.deleteDialog(peerId);

      if(this.processContact) {
        this.processContact(peerId);
      }
    });

    rootScope.addEventListener('dialog_unread', ({peerId}) => {
      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(dialog) {
        this.setUnreadMessages(dialog);
        this.validateDialogForFilter(dialog);
      }
    });

    rootScope.addEventListener('dialog_notify_settings', (dialog) => {
      this.validateDialogForFilter(dialog);
      this.setUnreadMessages(dialog); // возможно это не нужно, но нужно менять is-muted
      this.setFiltersUnreadCount();
    });

    rootScope.addEventListener('dialog_draft', ({dialog, drop, peerId}) => {
      if(drop) {
        this.sortedList.delete(peerId);
      } else {
        this.updateDialog(dialog);
      }

      if(this.processContact) {
        this.processContact(peerId);
      }
    });

    rootScope.addEventListener('peer_changed', (peerId) => {
      //const perf = performance.now();
      for(const element of this.lastActiveElements) {
        if(element.dataset.peerId.toPeerId() !== peerId) {
          this.setDialogActive(element, false);
        }
      }

      const elements = Array.from(document.querySelectorAll(`[data-autonomous="0"] li[data-peer-id="${peerId}"]`)) as HTMLElement[];
      elements.forEach(element => {
        this.setDialogActive(element, true);
      });
      //this.log('peer_changed total time:', performance.now() - perf);
    });

    rootScope.addEventListener('filter_update', (filter) => {
      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
        return;
      } else if(filter.id === this.filterId) { // это нет тут смысла вызывать, так как будет dialogs_multiupdate
        const dialogs = appMessagesManager.dialogsStorage.getCachedDialogs(true);
        this.validateListForFilter();
        for(let i = 0, length = dialogs.length; i < length; ++i) {
          const dialog = dialogs[i];
          this.updateDialog(dialog);
        }
      }

      const elements = this.filtersRendered[filter.id];
      elements.title.innerHTML = RichTextProcessor.wrapEmojiText(filter.title);
    });

    rootScope.addEventListener('filter_delete', (filter) => {
      const elements = this.filtersRendered[filter.id];
      if(!elements) return;

      // set tab
      //(this.folders.menu.firstElementChild.children[Math.max(0, filter.id - 2)] as HTMLElement).click();
      (this.folders.menu.firstElementChild as HTMLElement).click();

      elements.container.remove();
      elements.menu.remove();
      
      delete this.sortedLists[filter.id];
      delete this.scrollables[filter.id];
      delete this.filtersRendered[filter.id];

      this.onFiltersLengthChange();
    });

    rootScope.addEventListener('filter_order', (order) => {
      const containerToAppend = this.folders.menu as HTMLElement;
      order.forEach((filterId) => {
        const filter = appMessagesManager.filtersStorage.getFilter(filterId);
        const renderedFilter = this.filtersRendered[filterId];

        const sortedList = this.sortedLists[filterId];
        sortedList.indexKey = appMessagesManager.dialogsStorage.getDialogIndexKey(filterId);

        positionElementByIndex(renderedFilter.menu, containerToAppend, filter.orderIndex);
        positionElementByIndex(renderedFilter.container, this.folders.container, filter.orderIndex);
      });

      this.indexKey = appMessagesManager.dialogsStorage.getDialogIndexKey(this.filterId);

      /* if(this.filterId) {
        const tabIndex = order.indexOf(this.filterId) + 1;
        selectTab.prevId = tabIndex;
      } */
    });

    rootScope.addEventListener('peer_typings', ({peerId, typings}) => {
      const dialog = appMessagesManager.getDialogOnly(peerId);
      if(!dialog) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });
  }

  private setDialogActive(listEl: HTMLElement, active: boolean) {
    // @ts-ignore
    const dom = listEl.dialogDom as DialogDom;
    listEl.classList.toggle('active', active);
    if(active) {
      this.lastActiveElements.add(listEl);
    } else {
      this.lastActiveElements.delete(listEl);
    }

    if(dom?.callIcon) {
      dom.callIcon.setActive(active);
    }
  }

  private async onStateLoaded(state: State) {
    if(state.notifySettings) {
      for(const key in state.notifySettings) {
        assumeType<Exclude<NotifyPeer['_'], 'notifyPeer'>>(key);
        appNotificationsManager.savePeerSettings({
          key,
          settings: state.notifySettings[key]
        });
      }
    }

    appNotificationsManager.getNotifyPeerTypeSettings();

    if(!this.initedListeners) {
      this.initListeners();
      this.initedListeners = true;
    }
      
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

    return this.onChatsScroll().then(() => {
      appMessagesManager.fillConversations();
    });
  }

  /* private getOffset(side: 'top' | 'bottom'): {index: number, pos: number} {
    if(!this.scroll.loadedAll[side]) {
      const element = (side === 'top' ? this.chatList.firstElementChild : this.chatList.lastElementChild) as HTMLElement;
      if(element) {
        const peerId = element.dataset.peerId;
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
    if(dialog.migratedTo !== undefined || !this.testDialogForFilter(dialog)) return false;
    //return true;
    const topOffset = this.getOffsetIndex('top');
    const bottomOffset = this.getOffsetIndex('bottom');
    
    if(!topOffset.index && !bottomOffset.index) {
      return true;
    }
    
    const index = dialog[this.indexKey];
    return (!topOffset.index || index <= topOffset.index) && (!bottomOffset.index || index >= bottomOffset.index);
  }

  private deleteDialog(peerId: PeerId) {
    this.sortedList.delete(peerId);
  }

  private updateDialog(dialog: Dialog) {
    if(this.isDialogMustBeInViewport(dialog)) {
      if(!this.sortedList.has(dialog.peerId)) {
        this.sortedList.add(dialog.peerId);
        return;
      }
    } else {
      this.deleteDialog(dialog.peerId);
      return;
    }

    const dom = this.getDialogDom(dialog.peerId);
    if(dom) {
      this.setLastMessage(dialog, undefined, dom, undefined, undefined, undefined, true);
      this.sortedList.update(dialog.peerId);
    }
  }

  public onTabChange = () => {
    this.scroll = this.scrollables[this.filterId];
    this.scroll.loadedAll.top = true;
    this.scroll.loadedAll.bottom = false;
    this.offsets.top = this.offsets.bottom = 0;
    this.loadDialogsPromise = undefined;
    this.sortedList = this.sortedLists[this.filterId];
    this.onChatsScroll();
  };

  private setFilterUnreadCount(filterId: number) {
    const unreadSpan = filterId === 0 ? this.allUnreadCount : this.filtersRendered[filterId]?.unread;
    if(!unreadSpan) {
      return;
    }

    const folder = appMessagesManager.dialogsStorage.getFolder(filterId);
    const foundUnmuted = filterId === 0 || !!folder.dialogs.find(dialog => {
      return (dialog.unread_count || dialog.pFlags.unread_mark) && !appNotificationsManager.isPeerLocalMuted(dialog.peerId, true);
    });
    
    unreadSpan.classList.toggle('badge-gray', !foundUnmuted);
    
    const sum = folder.unreadDialogsCount;
    unreadSpan.innerText = sum ? '' + sum : '';
  }

  private setFiltersUnreadCount() {
    for(const filterId in this.filtersRendered) {
      this.setFilterUnreadCount(+filterId);
    }
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  private validateListForFilter() {
    const filter = appMessagesManager.filtersStorage.getFilter(this.filterId) || null;
    this.sortedList.getAll().forEach((element) => {
      const dialog = appMessagesManager.getDialogOnly(element.id);
      if(!this.testDialogForFilter(dialog, filter)) {
        this.deleteDialog(element.id);
      }
    });
  }

  /**
   * Удалит неподходящий чат из списка, но не добавит его(!)
   */
  private validateDialogForFilter(dialog: Dialog, filter?: MyDialogFilter) {
    if(!this.getDialogDom(dialog.peerId)) {
      return;
    }

    if(!this.testDialogForFilter(dialog, filter)) {
      this.deleteDialog(dialog.peerId);
    }
  }

  public testDialogForFilter(dialog: Dialog, filter = appMessagesManager.filtersStorage.getFilter(this.filterId)) {
    if(!dialog || 
      (filter && !appMessagesManager.filtersStorage.testDialogForFilter(dialog, filter)) || 
      (!filter && this.filterId !== dialog.folder_id)) {
      return false;
    }

    return true;
  }

  public generateScrollable(list: HTMLUListElement, filterId: number) {
    const scrollable = new Scrollable(null, 'CL', 500);
    scrollable.container.addEventListener('scroll', this.onChatsRegularScroll);
    scrollable.container.dataset.filterId = '' + filterId;
    scrollable.onScrolledTop = this.onChatsScrollTop;
    scrollable.onScrolledBottom = this.onChatsScroll;
    scrollable.setVirtualContainer(list);

    const sortedDialogList = new SortedDialogList(
      list, 
      appMessagesManager.dialogsStorage ? appMessagesManager.dialogsStorage.getDialogIndexKey(filterId) : 'index',
      this.onListLengthChange
    );

    this.scrollables[filterId] = scrollable;
    this.sortedLists[filterId] = sortedDialogList;

    // list.classList.add('hide');
    // scrollable.container.style.backgroundColor = '#' + (Math.random() * (16 ** 6 - 1) | 0).toString(16);

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
    ripple(menuTab);
    menuTab.append(span);

    const containerToAppend = this.folders.menu as HTMLElement;
    positionElementByIndex(menuTab, containerToAppend, filter.orderIndex);
    //containerToAppend.append(li);

    const ul = this.createChatList();
    const scrollable = this.generateScrollable(ul, filter.id);

    scrollable.container.classList.add('tabs-tab', 'chatlist-parts');

    /* const parts = document.createElement('div');
    parts.classList.add('chatlist-parts'); */
    
    const top = document.createElement('div');
    top.classList.add('chatlist-top');
    
    const bottom = document.createElement('div');
    bottom.classList.add('chatlist-bottom');

    top.append(ul);
    scrollable.container.append(top, bottom);
    /* parts.append(top, bottom);
    scrollable.container.append(parts); */
    
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

    this.onFiltersLengthChange();
  }

  private changeFiltersAllChatsKey() {
    const scrollable = this.folders.menuScrollContainer.firstElementChild;
    const key: LangPackKey = scrollable.scrollWidth > scrollable.clientWidth ? 'FilterAllChatsShort' : 'FilterAllChats';
    this.allChatsIntlElement.compareAndUpdate({key});
  }

  private onFiltersLengthChange() {
    if(!this.showFiltersPromise) {
      this.showFiltersPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          const length = Object.keys(this.filtersRendered).length;
          const show = length > 1;
          const wasShowing = !this.folders.menuScrollContainer.classList.contains('hide');

          if(show !== wasShowing) {
            this.folders.menuScrollContainer.classList.toggle('hide', !show);
            if(show && !wasShowing) {
              this.setFiltersUnreadCount();
            }

            this.chatsContainer.classList.toggle('has-filters', show);
          }

          this.changeFiltersAllChatsKey();

          this.showFiltersPromise = undefined;
          resolve();
        }, 0);
      });
    }

    return this.showFiltersPromise;
  }

  private loadDialogs(side: SliceSides) {
    /* if(testScroll) {
      return;
    } */
    
    if(this.loadDialogsPromise/*  || 1 === 1 */) return this.loadDialogsPromise;

    const promise = new Promise<void>(async(resolve) => {
      const {chatList, filterId, indexKey} = this;

      //return;
  
      // let loadCount = 30/*this.chatsLoadCount */;
      let loadCount = windowSize.height / 72 * 1.25 | 0;
      let offsetIndex = 0;
      
      const {index: currentOffsetIndex} = this.getOffsetIndex(side);
      if(currentOffsetIndex) {
        if(side === 'top') {
          const storage = appMessagesManager.dialogsStorage.getFolderDialogs(filterId, true);
          const index = storage.findIndex(dialog => dialog[indexKey] <= currentOffsetIndex);
          const needIndex = Math.max(0, index - loadCount);
          loadCount = index - needIndex;
          offsetIndex = storage[needIndex][indexKey] + 1;
        } else {
          offsetIndex = currentOffsetIndex;
        }
      }
      
      //let offset = storage[storage.length - 1]?.index || 0;
  
      try {
        //console.time('getDialogs time');
  
        const getConversationsResult = appMessagesManager.getConversations('', offsetIndex, loadCount, filterId, true);
        if(!getConversationsResult.cached && !chatList.childElementCount) {
          const container = chatList.parentElement;
          container.append(this.chatsPreloader);
        }
  
        const result = await getConversationsResult.promise;
  
        if(this.loadDialogsPromise !== promise) {
          return;
        }
  
        //console.timeEnd('getDialogs time');
  
        // * loaded all
        //if(!result.dialogs.length || chatList.childElementCount === result.count) {
        // !result.dialogs.length не подходит, так как при супердревном диалоге getConversations его не выдаст.
        //if(chatList.childElementCount === result.count) {
        if(side === 'bottom') {
          if(result.isEnd) {
            this.scroll.loadedAll[side] = true;
          }
        } else if(result.isTopEnd) {
          this.scroll.loadedAll[side] = true;
        }

        this.loadedDialogsAtLeastOnce = true;
        
        if(result.dialogs.length) {
          const dialogs = side === 'top' ? result.dialogs.slice().reverse() : result.dialogs;
  
          const loadPromises: Promise<any>[] = [];

          const callbacks: (() => void)[] = [];
          const cccc = (callback: () => void) => {
            callbacks.push(callback);
          };

          dialogs.forEach((dialog) => {
            // :(
            const isBuggedDialog = !appMessagesManager.getDialogOnly(dialog.peerId);
            if(isBuggedDialog) {
              return;
            }

            const element = this.sortedList.add(dialog.peerId, true, cccc, false);
            if(element.loadPromises) {
              loadPromises.push(...element.loadPromises);
            }
          });

          await Promise.all(loadPromises).finally();

          callbacks.forEach(callback => callback());
        } else {
          this.onListLengthChange();
        }

        const offsetDialog = result.dialogs[side === 'top' ? 0 : result.dialogs.length - 1];
        if(offsetDialog) {
          this.offsets[side] = offsetDialog[indexKey];
        }

        this.log.debug('getDialogs ' + loadCount + ' dialogs by offset:', offsetIndex, result, chatList.childElementCount);
  
        setTimeout(() => {
          this.scroll.onScroll();
        }, 0);
      } catch(err) {
        this.log.error(err);
      }
      
      if(this.chatsPreloader.parentElement) {
        this.chatsPreloader.remove();
      }
      
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

  private checkIfPlaceholderNeeded() {
    if(this.filterId === 1) {
      return;
    }

    const chatList = this.chatList;
    const part = chatList.parentElement as HTMLElement;
    let placeholderContainer = (Array.from(part.children) as HTMLElement[]).find(el => el.matches('.empty-placeholder'));
    const needPlaceholder = this.scroll.loadedAll.bottom && !chatList.childElementCount/*  || true */;
    // chatList.style.display = 'none';

    if(needPlaceholder && placeholderContainer) {
      return;
    } else if(!needPlaceholder) {
      if(placeholderContainer) {
        part.classList.remove('with-placeholder');
        placeholderContainer.remove();
      }

      return;
    }

    let placeholder: ReturnType<AppDialogsManager['generateEmptyPlaceholder']>, type: 'dialogs' | 'folder';
    if(!this.filterId) {
      placeholder = this.generateEmptyPlaceholder({
        title: 'ChatList.Main.EmptyPlaceholder.Title',
        classNameType: type = 'dialogs'
      });
      
      placeholderContainer = placeholder.container;
      
      const img = document.createElement('img');
      img.classList.add('empty-placeholder-dialogs-icon');

      this.emptyDialogsPlaceholderSubtitle = new I18n.IntlElement({
        element: placeholder.subtitle
      });
      
      Promise.all([
        this.updateContactsLength(false),
        renderImageFromUrlPromise(img, 'assets/img/EmptyChats.svg'),
        fastRafPromise()
      ]).then(([usersLength]) => {
        placeholderContainer.classList.add('visible');
        part.classList.toggle('has-contacts', !!usersLength);
      });

      placeholderContainer.prepend(img);
    } else {
      placeholder = this.generateEmptyPlaceholder({
        title: 'FilterNoChatsToDisplay',
        subtitle: 'FilterNoChatsToDisplayInfo',
        classNameType: type = 'folder'
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
        new AppEditFolderTab(appSidebarLeft).open(appMessagesManager.filtersStorage.getFilter(this.filterId));
      });

      placeholderContainer.append(button);
    }

    part.append(placeholderContainer);
    part.classList.add('with-placeholder');
    part.dataset.placeholderType = type;
  }

  private updateContactsLength(updatePartClassName: boolean) {
    if(this.updateContactsLengthPromise) return this.updateContactsLengthPromise;
    return this.updateContactsLengthPromise = appUsersManager.getContacts().then(users => {
      const subtitle = this.emptyDialogsPlaceholderSubtitle;
      if(subtitle) {
        let key: LangPackKey, args: FormatterArguments;
        
        if(users.length/*  && false */) {
          key = 'ChatList.Main.EmptyPlaceholder.Subtitle';
          args = [i18n('Contacts.Count', [users.length])];
        } else {
          key = 'ChatList.Main.EmptyPlaceholder.SubtitleNoContacts';
          args = [];
        }

        subtitle.compareAndUpdate({
          key,
          args
        });
      }

      if(updatePartClassName) {
        const chatList = this.chatList;
        const part = chatList.parentElement as HTMLElement;
        part.classList.toggle('has-contacts', !!users.length);
      }

      this.updateContactsLengthPromise = undefined;
      
      return users.length;
    });
  }

  private removeContactsPlaceholder() {
    const chatList = this.chatList;
    const parts = chatList.parentElement.parentElement;
    const bottom = chatList.parentElement.nextElementSibling as HTMLElement;
    parts.classList.remove('with-contacts');
    bottom.innerHTML = '';
    this.loadContacts = undefined;
    this.processContact = undefined;
  }

  private _onListLengthChange = () => {
    if(!this.loadedDialogsAtLeastOnce) {
      return;
    }

    this.checkIfPlaceholderNeeded();

    if(this.filterId > 0) return;

    const chatList = this.chatList;
    const count = chatList.childElementCount;

    const parts = chatList.parentElement.parentElement;
    const bottom = chatList.parentElement.nextElementSibling as HTMLElement;
    const hasContacts = !!bottom.childElementCount;
    if(count >= 10) {
      if(hasContacts) {
        this.removeContactsPlaceholder();
      }

      return;
    } else if(hasContacts) return;

    parts.classList.add('with-contacts');

    const section = new SettingSection({
      name: 'Contacts',
      noDelimiter: true,
      fakeGradientDelimiter: true
    });

    section.container.classList.add('hide');

    appUsersManager.getContactsPeerIds(undefined, undefined, 'online').then(contacts => {
      let ready = false;
      const onListLengthChange = () => {
        if(ready) {
          section.container.classList.toggle('hide', !sortedUserList.list.childElementCount);
        }

        this.updateContactsLength(true);
      };

      const sortedUserList = new SortedUserList({
        avatarSize: 42, 
        createChatListOptions: {
          dialogSize: 48,
          new: true
        },
        autonomous: false, 
        onListLengthChange
      });

      this.loadContacts = () => {
        const pageCount = windowSize.height / 60 | 0;
        const arr = contacts.splice(0, pageCount).filter(this.verifyPeerIdForContacts);

        arr.forEach((peerId) => {
          sortedUserList.add(peerId);
        });

        if(!contacts.length) {
          this.loadContacts = undefined;
        }
      };

      this.loadContacts();

      this.processContact = (peerId) => {
        if(peerId.isAnyChat()) {
          return;
        }

        const good = this.verifyPeerIdForContacts(peerId);
        const added = sortedUserList.has(peerId);
        if(!added && good) sortedUserList.add(peerId);
        else if(added && !good) sortedUserList.delete(peerId);
      };

      const list = sortedUserList.list;
      list.classList.add('chatlist-new');
      this.setListClickListener(list);
      section.content.append(list);

      ready = true;
      onListLengthChange();
    });

    bottom.append(section.container);
  };

  private verifyPeerIdForContacts = (peerId: PeerId) => {
    return peerId.isContact() && !appMessagesManager.getDialogOnly(peerId);
  };

  public onChatsRegularScroll = () => {
    // return;

    if(this.sliceTimeout) clearTimeout(this.sliceTimeout);
    this.sliceTimeout = window.setTimeout(() => {
      this.sliceTimeout = undefined;

      if(!this.chatList.childElementCount || this.processContact) {
        return;
      }

      /* const observer = new IntersectionObserver((entries) => {
        const 
      });

      Array.from(this.chatList.children).forEach(el => {
        observer.observe(el);
      }); */

      fastRafConventional(() => {

      const perf = performance.now();

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

      const sliceFromStart = IS_SAFARI ? [] : children.slice(0, Math.max(0, firstIndex - saveLength));
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
        const peerId = el.dataset.peerId.toPeerId();
        this.deleteDialog(peerId);
      });

      this.setOffsets();

      //this.log('[slicer] elements', firstElement, lastElement, rect, sliced, sliceFromStart.length, sliceFromEnd.length);

      //this.log('[slicer] reset scrollTop', this.scroll.scrollTop, firstElement.offsetTop, firstElementRect.y, rect.y, elementOverflow);

      //alert('left length:' + children.length);

      this.scroll.scrollTop = firstElement.offsetTop - elementOverflow;

      this.log('slice time', performance.now() - perf);
      /* const firstElementRect = firstElement.getBoundingClientRect();
      const scrollTop =  */

      //this.scroll.scrollIntoView(firstElement, false);
    });
    }, 200);
  };

  private setOffsets() {
    const chatList = this.chatList;
    const firstDialog = this.getDialogFromElement(chatList.firstElementChild as HTMLElement);
    const lastDialog = this.getDialogFromElement(chatList.lastElementChild as HTMLElement);

    const indexKey = this.indexKey;
    this.offsets.top = firstDialog[indexKey];
    this.offsets.bottom = lastDialog[indexKey];
  }

  private getDialogFromElement(element: HTMLElement) {
    return appMessagesManager.getDialogOnly(element.dataset.peerId.toPeerId());
  }

  public onChatsScrollTop = () => {
    return this.onChatsScroll('top');
  };
  
  public onChatsScroll = (side: SliceSides = 'bottom') => {
    if(this.scroll.loadedAll[side]) {
      if(this.loadContacts) {
        this.loadContacts();
      }

      return Promise.resolve();
    } else if(this.loadDialogsPromise) return this.loadDialogsPromise;

    this.log('onChatsScroll', side);
    return this.loadDialogs(side);
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

        const peerId = elem.dataset.peerId.toPeerId();
        const lastMsgId = +elem.dataset.mid || undefined;

        setPeerFunc({
          peerId, lastMsgId
        });
      } else {
        setPeerFunc();
      }
    }, {capture: true});

    if(DEBUG) {
      list.addEventListener('dblclick', (e) => {
        const li = findUpTag(e.target, 'LI');
        if(li) {
          const peerId = li.dataset.peerId.toPeerId();
          this.log('debug dialog:', appMessagesManager.getDialogByPeerId(peerId));
        }
      });
    }

    if(withContext) {
      attachContextMenuListener(list, this.contextMenu.onContextMenu);
    }
  }

  public createChatList(options: {
    // avatarSize?: number,
    // handheldsSize?: number,
    // size?: number,
    new?: boolean,
    dialogSize?: number
  } = {}) {
    const list = document.createElement('ul');
    list.classList.add('chatlist'/* , 
      'chatlist-avatar-' + (options.avatarSize || 54) *//* , 'chatlist-' + (options.size || 72) */);

    if(options.new) {
      list.classList.add('chatlist-new');
    }

    if(options.dialogSize) {
      list.classList.add('chatlist-' + options.dialogSize);
    }

    /* if(options.handheldsSize) {
      list.classList.add('chatlist-handhelds-' + options.handheldsSize);
    } */

    return list;
  }

  public setLastMessage(
    dialog: Dialog, 
    lastMessage?: any, 
    dom?: DialogDom, 
    highlightWord?: string, 
    loadPromises?: Promise<any>[],
    isBatch = false,
    setUnread = false
  ) {
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

      if(setUnread) {
        this.setUnreadMessages(dialog, dom, isBatch);
      }

      return;
    }

    const peerId = dialog.peerId;
    const isRestricted = lastMessage && appMessagesManager.isRestricted(lastMessage);
    //let peerId = appMessagesManager.getMessagePeer(lastMessage);

    //console.log('setting last message:', lastMessage);

    /* if(!dom.lastMessageSpan.classList.contains('user-typing')) */ {

      let mediaContainer: HTMLElement;
      if(!lastMessage.deleted && !draftMessage && !isRestricted) {
        const media: MyDocument | MyPhoto = appMessagesManager.getMediaFromMessage(lastMessage);
        const videoTypes: Set<MyDocument['type']> = new Set(['video', 'gif', 'round']);
        if(media && (media._ === 'photo' || videoTypes.has(media.type))) {
          const size = appPhotosManager.choosePhotoSize(media, 20, 20);

          if(size._ !== 'photoSizeEmpty') {
            mediaContainer = document.createElement('div');
            mediaContainer.classList.add('dialog-subtitle-media');

            if((media as MyDocument).type === 'round') {
              mediaContainer.classList.add('is-round');
            }
            
            wrapPhoto({
              photo: media,
              message: lastMessage,
              container: mediaContainer,
              withoutPreloader: true,
              size,
              loadPromises
            });

            if(videoTypes.has((media as MyDocument).type)) {
              const playIcon = document.createElement('span');
              playIcon.classList.add('tgico-play');

              mediaContainer.append(playIcon);
            }
          }
        }
      }

      const withoutMediaType = !!mediaContainer && !!lastMessage?.message;

      let fragment: DocumentFragment;
      if(highlightWord && lastMessage.message) {
        fragment = appMessagesManager.wrapMessageForReply(lastMessage, undefined, undefined, false, highlightWord, withoutMediaType);
      } else if(draftMessage) {
        fragment = appMessagesManager.wrapMessageForReply(draftMessage);
      } else if(!lastMessage.deleted) {
        fragment = appMessagesManager.wrapMessageForReply(lastMessage, undefined, undefined, false, undefined, withoutMediaType);
      } else { // rare case
        fragment = document.createDocumentFragment();
      }

      if(mediaContainer) {
        fragment.prepend(mediaContainer);
      }

      replaceContent(dom.lastMessageSpan, fragment);
  
      /* if(lastMessage.from_id === auth.id) { // You:  */
      if(draftMessage) {
        const bold = document.createElement('b');
        bold.classList.add('danger');
        bold.append(i18n('Draft'), ': ');
        dom.lastMessageSpan.prepend(bold);
      } else if(peerId.isAnyChat() && peerId !== lastMessage.fromId && !lastMessage.action) {
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
      replaceContent(dom.lastTimeSpan, formatDateAccordingToTodayNew(new Date(date * 1000)));
    } else dom.lastTimeSpan.textContent = '';

    if(setUnread !== null) {
      if(setUnread) {
        this.setUnreadMessages(dialog, dom, isBatch);
      } else { // means search
        dom.listEl.dataset.mid = lastMessage.mid;
      }
    }
  }

  private setUnreadMessages(dialog: Dialog, dom = this.getDialogDom(dialog.peerId), isBatch = false) {
    if(!dom) {
      //this.log.error('setUnreadMessages no dom!', dialog);
      return;
    }

    if(!isBatch) {
      const isMuted = appNotificationsManager.isPeerLocalMuted(dialog.peerId, true);
      const wasMuted = dom.listEl.classList.contains('is-muted');
      if(isMuted !== wasMuted) {
        SetTransition(dom.listEl, 'is-muted', isMuted, 200);
      }
    }

    let setStatusMessage: MyMessage;
    if(dialog.draft?._ !== 'draftMessage') {
      const lastMessage: MyMessage = appMessagesManager.getMessageByPeer(dialog.peerId, dialog.top_message);
      if(!lastMessage.deleted && lastMessage.pFlags.out && lastMessage.peerId !== rootScope.myId) {
        setStatusMessage = lastMessage;
      }
    }

    setSendingStatus(dom.statusSpan, setStatusMessage, true);

    const filter = appMessagesManager.filtersStorage.getFilter(this.filterId);
    let isPinned: boolean;
    if(filter) {
      isPinned = filter.pinnedPeerIds.indexOf(dialog.peerId) !== -1;
    } else {
      isPinned = !!dialog.pFlags.pinned;
    }

    const isDialogUnread = appMessagesManager.isDialogUnread(dialog);
    const hasUnreadBadge = isPinned || isDialogUnread;
    // dom.messageEl.classList.toggle('has-badge', hasBadge);

    const isUnreadBadgeMounted = isInDOM(dom.unreadBadge);
    if(hasUnreadBadge && !isUnreadBadgeMounted) {
      dom.subtitleEl.append(dom.unreadBadge);
    }

    const hasMentionsBadge = dialog.unread_mentions_count && (dialog.unread_mentions_count > 1 || dialog.unread_count > 1);
    const isMentionBadgeMounted = dom.mentionsBadge && isInDOM(dom.mentionsBadge);
    if(hasMentionsBadge) {
      if(!dom.mentionsBadge) {
        dom.mentionsBadge = document.createElement('div');
        dom.mentionsBadge.className = 'dialog-subtitle-badge badge badge-24 mention mention-badge';
        dom.mentionsBadge.innerText = '@';
        dom.subtitleEl.insertBefore(dom.mentionsBadge, dom.lastMessageSpan.nextSibling);
      }
    }

    const transitionDuration = isBatch ? 0 : 200;

    SetTransition(dom.unreadBadge, 'is-visible', hasUnreadBadge, transitionDuration, hasUnreadBadge ? undefined : () => {
      dom.unreadBadge.remove();
    }, !isUnreadBadgeMounted ? 2 : 0);

    if(dom.mentionsBadge) {
      SetTransition(dom.mentionsBadge, 'is-visible', hasMentionsBadge, transitionDuration, hasMentionsBadge ? undefined : () => {
        dom.mentionsBadge.remove();
        delete dom.mentionsBadge;
      }, !isMentionBadgeMounted ? 2 : 0);
    }

    if(!hasUnreadBadge) {
      return;
    }

    if(isPinned) {
      dom.unreadBadge.classList.add('tgico-chatspinned', 'tgico');
    } else {
      dom.unreadBadge.classList.remove('tgico-chatspinned', 'tgico');
    }

    let isUnread = true, isMention = false;
    if(dialog.unread_mentions_count && dialog.unread_count === 1) {
      dom.unreadBadge.innerText = '@';
      isMention = true;
      // dom.unreadBadge.classList.add('tgico-mention', 'tgico');
    } else if(isDialogUnread) {
      //dom.unreadMessagesSpan.innerText = '' + (dialog.unread_count ? formatNumber(dialog.unread_count, 1) : ' ');
      dom.unreadBadge.innerText = '' + (dialog.unread_count || ' ');
    } else {
      dom.unreadBadge.innerText = '';
      isUnread = false;
    }

    dom.unreadBadge.classList.toggle('unread', isUnread);
    dom.unreadBadge.classList.toggle('mention', isMention);
  }

  private getDialogDom(peerId: PeerId) {
    // return this.doms[peerId];
    const element = this.sortedList.get(peerId);
    return element?.dom;
  }

  private getDialog(dialog: Dialog | PeerId): Dialog {
    if(typeof(dialog) !== 'object') {
      const originalDialog = appMessagesManager.getDialogOnly(dialog);
      if(!originalDialog) {
        const peerId = dialog || NULL_PEER_ID;
        return {
          peerId,
          peer: appPeersManager.getOutputPeer(peerId),
          pFlags: {}
        } as any;
      }

      return originalDialog;
    }
    
    return dialog as Dialog;
  }

  private setCallStatus(dom: DialogDom, visible: boolean) {
    let {callIcon, listEl} = dom;
    if(!callIcon && visible) {
      const {canvas, startAnimation} = dom.callIcon = callIcon = groupCallActiveIcon(listEl.classList.contains('active'));
      canvas.classList.add('dialog-group-call-icon');
      listEl.append(canvas);
      startAnimation();
    }

    if(!callIcon) {
      return;
    }

    SetTransition(dom.callIcon.canvas, 'is-visible', visible, 200, visible ? undefined : () => {
      dom.callIcon.canvas.remove();
      dom.callIcon = undefined;
    }, visible ? 2 : 0);
  }

  public addListDialog(options: Parameters<AppDialogsManager['addDialogNew']>[0] & {isBatch?: boolean}) {
    const dialog = this.getDialog(options.dialog);

    options.autonomous = false;

    const ret = this.addDialogNew(options);

    if(ret) {
      const {peerId} = dialog;
      const isMuted = appNotificationsManager.isPeerLocalMuted(peerId, true);
      if(isMuted) {
        ret.dom.listEl.classList.add('is-muted');
      }

      if(!peerId.isUser()) {
        this.processDialogForCallStatus(dialog, ret.dom);
      }

      this.setLastMessage(dialog, undefined, ret.dom, undefined, options.loadPromises, options.isBatch, true);
    }

    return ret;
  }

  private processDialogForCallStatus(dialog: Dialog, dom?: DialogDom) {
    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    if(!dom) dom = this.getDialogDom(dialog.peerId);
    if(!dom) return;
    
    const chat: Chat.chat | Chat.channel = appChatsManager.getChat(dialog.peerId.toChatId());
    this.setCallStatus(dom, !!(chat.pFlags.call_active && chat.pFlags.call_not_empty));
  }

  /**
   * use for rendering search result
   */
  public addDialogAndSetLastMessage(options: Omit<Parameters<AppDialogsManager['addDialogNew']>[0], 'dialog'> & {
    message: MyMessage, 
    peerId: PeerId,
    query?: string
  }) {
    const {peerId, message, query} = options;
    const ret = appDialogsManager.addDialogNew({
      ...options,
      ...appMessagesManager.getMessageSenderPeerIdOrName(message),
      dialog: this.getDialog(peerId),
    });

    this.setLastMessage(ret.dialog, message, ret.dom, query);

    if(message.peerId !== peerId) {
      ret.dom.listEl.dataset.peerId = '' + message.peerId;
    }

    return ret;
  }

  public addDialogNew(options: {
    dialog: Parameters<AppDialogsManager['addDialog']>[0],
    container?: Parameters<AppDialogsManager['addDialog']>[1],
    drawStatus?: boolean,
    rippleEnabled?: boolean,
    onlyFirstName?: boolean,
    meAsSaved?: boolean,
    append?: boolean,
    avatarSize?: number,
    autonomous?: boolean,
    lazyLoadQueue?: LazyLoadQueueIntersector,
    loadPromises?: Promise<any>[],
    fromName?: string
  }) {
    return this.addDialog(options.dialog, options.container, options.drawStatus, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append, options.avatarSize, options.autonomous, options.lazyLoadQueue, options.loadPromises, options.fromName);
  }

  public addDialog(
    _dialog: Parameters<AppDialogsManager['getDialog']>[0], 
    container?: HTMLElement | Scrollable | DocumentFragment | false, 
    drawStatus = true, 
    rippleEnabled = true, 
    onlyFirstName = false, 
    meAsSaved = true, 
    append = true, 
    avatarSize = 54, 
    autonomous = !!container, 
    lazyLoadQueue?: LazyLoadQueueIntersector,
    loadPromises?: Promise<any>[],
    fromName?: string
  ) {
    const dialog = this.getDialog(_dialog);
    const peerId = dialog.peerId;

    const avatarEl = new AvatarElement();
    avatarEl.classList.add('dialog-avatar', 'avatar-' + avatarSize);
    avatarEl.updateWithOptions({
      loadPromises,
      lazyLoadQueue,
      isDialog: !!meAsSaved,
      peerId,
      peerTitle: fromName
    });

    if(drawStatus && peerId !== rootScope.myId && peerId.isUser()) {
      const user = appUsersManager.getUser(peerId);
      if(user.status?._ === 'userStatusOnline') {
        this.setOnlineStatus(avatarEl, true);
      }
    }

    const captionDiv = document.createElement('div');
    captionDiv.classList.add('user-caption');

    const titleSpanContainer = document.createElement('span');
    titleSpanContainer.classList.add('user-title');

    const peerTitle = new PeerTitle({
      peerId,
      fromName,
      dialog: meAsSaved,
      onlyFirstName,
      plainText: false
    });

    titleSpanContainer.append(peerTitle.element);
    //p.classList.add('')

    // в других случаях иконка верификации не нужна (а первый - это главные чатлисты)
    //if(!container) {
      
      // for muted icon
      titleSpanContainer.classList.add('tgico'); // * эта строка будет актуальна только для !container, но ладно
      
      titleSpanContainer.append(...generateTitleIcons(peerId));
    //}
    
    const span = document.createElement('span');
    span.classList.add('user-last-message');
    span.setAttribute('dir', 'auto');

    //captionDiv.append(titleSpan);
    //captionDiv.append(span);

    const li = document.createElement('li');
    li.classList.add('chatlist-chat');
    if(rippleEnabled) {
      ripple(li);
    }

    li.append(avatarEl, captionDiv);
    li.dataset.peerId = '' + peerId;

    const statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status', 'sending-status'/* , 'transition', 'reveal' */);

    const lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    const unreadBadge = document.createElement('div');
    unreadBadge.className = 'dialog-subtitle-badge badge badge-24';

    const titleP = document.createElement('p');
    titleP.classList.add('dialog-title');

    const rightSpan = document.createElement('span');
    rightSpan.classList.add('dialog-title-details');
    rightSpan.append(statusSpan, lastTimeSpan);
    titleP.append(titleSpanContainer, rightSpan);

    const subtitleEl = document.createElement('p');
    subtitleEl.classList.add('dialog-subtitle');
    subtitleEl.append(span);

    captionDiv.append(titleP, subtitleEl);

    const dom: DialogDom = {
      avatarEl,
      captionDiv,
      titleSpan: peerTitle.element,
      titleSpanContainer,
      statusSpan,
      lastTimeSpan,
      unreadBadge,
      lastMessageSpan: span,
      containerEl: li,
      listEl: li,
      subtitleEl
    };

    /* let good = false;
    for(const folderId in this.chatLists) {
      if(this.chatLists[folderId] === container) {
        good = true;
      }
    } */
    if(container) {
      const method = append ? 'append' : 'prepend';
      container[method](li);
    }

    if(!autonomous) {
      // @ts-ignore
      li.dialogDom = dom;

      if(appImManager.chat?.peerId === peerId) {
        this.setDialogActive(li, true);
      }
    } 
    
    return {dom, dialog};
  }

  public setTyping(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerId);
    if(!dom) {
      return;
    }

    const oldTypingElement = dom.lastMessageSpan.querySelector('.peer-typing-container') as HTMLElement;
    const newTypingElement = appImManager.getPeerTyping(dialog.peerId, oldTypingElement);
    if(!oldTypingElement && newTypingElement) {
      replaceContent(dom.lastMessageSpan, newTypingElement);
      dom.lastMessageSpan.classList.add('user-typing');
    }
  }

  public unsetTyping(dialog: Dialog) {
    const dom = this.getDialogDom(dialog.peerId);
    if(!dom) {
      return;
    }

    dom.lastMessageSpan.classList.remove('user-typing');
    this.setLastMessage(dialog, null, dom, undefined, undefined, undefined, null);
  }
}

const appDialogsManager = new AppDialogsManager();
MOUNT_CLASS_TO.appDialogsManager = appDialogsManager;
export default appDialogsManager;
