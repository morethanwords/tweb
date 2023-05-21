/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyInputMessagesFilter, MyMessage} from '../lib/appManagers/appMessagesManager';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG} from '../lib/appManagers/appDialogsManager';
import {logger} from '../lib/logger';
import rootScope from '../lib/rootScope';
import {SearchGroup, SearchGroupType} from './appSearch';
import {horizontalMenu} from './horizontalMenu';
import LazyLoadQueue from './lazyLoadQueue';
import {putPreloader} from './putPreloader';
import ripple from './ripple';
import Scrollable, {ScrollableX} from './scrollable';
import useHeavyAnimationCheck, {getHeavyAnimationPromise} from '../hooks/useHeavyAnimationCheck';
import I18n, {LangPackKey, i18n} from '../lib/langPack';
import findUpClassName from '../helpers/dom/findUpClassName';
import {getMiddleware, Middleware, MiddlewareHelper} from '../helpers/middleware';
import {ChannelParticipant, Chat, ChatFull, ChatParticipant, ChatParticipants, Document, Message, MessageMedia, Photo, Update, User, WebPage} from '../layer';
import SortedUserList from './sortedUserList';
import findUpTag from '../helpers/dom/findUpTag';
import appSidebarRight from './sidebarRight';
import mediaSizes from '../helpers/mediaSizes';
import appImManager from '../lib/appManagers/appImManager';
import positionElementByIndex from '../helpers/dom/positionElementByIndex';
import cleanSearchText from '../helpers/cleanSearchText';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import handleTabSwipe from '../helpers/dom/handleTabSwipe';
import windowSize from '../helpers/windowSize';
import {formatPhoneNumber} from '../helpers/formatPhoneNumber';
import {ButtonMenuItemOptions, ButtonMenuSync} from './buttonMenu';
import PopupForward from './popups/forward';
import PopupDeleteMessages from './popups/deleteMessages';
import Row from './row';
import htmlToDocumentFragment from '../helpers/dom/htmlToDocumentFragment';
import {SearchSelection} from './chat/selection';
import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent, simulateClickEvent} from '../helpers/dom/clickEvent';
import {MyDocument} from '../lib/appManagers/appDocsManager';
import AppMediaViewer from './appMediaViewer';
import lockTouchScroll from '../helpers/dom/lockTouchScroll';
import copy from '../helpers/object/copy';
import getObjectKeysAndSort from '../helpers/object/getObjectKeysAndSort';
import safeAssign from '../helpers/object/safeAssign';
import escapeRegExp from '../helpers/string/escapeRegExp';
import findAndSplice from '../helpers/array/findAndSplice';
import {ScrollStartCallbackDimensions} from '../helpers/fastSmoothScroll';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import {AppManagers} from '../lib/appManagers/managers';
import choosePhotoSize from '../lib/appManagers/utils/photos/choosePhotoSize';
import wrapWebPageDescription from './wrappers/webPageDescription';
import wrapWebPageTitle from './wrappers/webPageTitle';
import wrapAbbreviation from '../lib/richTextProcessor/wrapAbbreviation';
import matchUrl from '../lib/richTextProcessor/matchUrl';
import wrapPlainText from '../lib/richTextProcessor/wrapPlainText';
import wrapRichText from '../lib/richTextProcessor/wrapRichText';
import wrapSenderToPeer from './wrappers/senderToPeer';
import wrapSentTime from './wrappers/sentTime';
import getMediaFromMessage from '../lib/appManagers/utils/messages/getMediaFromMessage';
import filterMessagesByInputFilter from '../lib/appManagers/utils/messages/filterMessagesByInputFilter';
import getChatMembersString from './wrappers/getChatMembersString';
import getUserStatusString from './wrappers/getUserStatusString';
import getParticipantPeerId from '../lib/appManagers/utils/chats/getParticipantPeerId';
import {Awaited} from '../types';
import {attachContextMenuListener} from '../helpers/dom/attachContextMenuListener';
import contextMenuController from '../helpers/contextMenuController';
import positionMenu from '../helpers/positionMenu';
import apiManagerProxy from '../lib/mtproto/mtprotoworker';
import ListenerSetter from '../helpers/listenerSetter';
import SwipeHandler from './swipeHandler';
import wrapDocument from './wrappers/document';
import wrapPhoto from './wrappers/photo';
import wrapVideo from './wrappers/video';
import noop from '../helpers/noop';
import wrapMediaSpoiler, {onMediaSpoilerClick} from './wrappers/mediaSpoiler';
import filterAsync from '../helpers/array/filterAsync';
import ChatContextMenu from './chat/contextMenu';
import PopupElement from './popups';
import getParticipantRank from '../lib/appManagers/utils/chats/getParticipantRank';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import createParticipantContextMenu from '../helpers/dom/createParticipantContextMenu';

// const testScroll = false;

export type SearchSuperType = MyInputMessagesFilter/*  | 'members' */;
export type SearchSuperContext = {
  peerId: PeerId,
  inputFilter: {_: MyInputMessagesFilter},
  query?: string,
  maxId?: number,
  folderId?: number,
  threadId?: number,
  date?: number,
  nextRate?: number,
  minDate?: number,
  maxDate?: number
};

export type SearchSuperMediaType = 'members' | 'media' | 'files' | 'links' | 'music' | 'chats' | 'voice' | 'groups';
export type SearchSuperMediaTab = {
  inputFilter: SearchSuperType,
  name: LangPackKey,
  type: SearchSuperMediaType,
  contentTab?: HTMLElement,
  menuTab?: HTMLElement,
  scroll?: {scrollTop: number, scrollHeight: number}
};

class SearchContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>, withSelection?: true})[];
  private element: HTMLElement;
  private target: HTMLElement;
  private peerId: PeerId;
  private mid: number;
  private isSelected: boolean;
  private managers: AppManagers;
  private noForwards: boolean;
  private message: MyMessage;
  private selectedMessages: MyMessage[];

  constructor(
    private attachTo: HTMLElement,
    private searchSuper: AppSearchSuper,
    private listenerSetter: ListenerSetter
  ) {
    this.managers = searchSuper.managers;

    const onContextMenu: Parameters<typeof attachContextMenuListener>[0]['callback'] = (e) => {
      if(this.init) {
        this.init();
        this.init = null;
      }

      let item: HTMLElement;
      try {
        item = findUpClassName(e.target, 'search-super-item');
      } catch(e) {}

      if(!item) return;

      if(e instanceof MouseEvent) e.preventDefault();
      if(this.element.classList.contains('active')) {
        return false;
      }
      if(e instanceof MouseEvent) e.cancelBubble = true;

      const r = async() => {
        this.target = item;
        this.peerId = item.dataset.peerId.toPeerId();
        this.mid = +item.dataset.mid;
        this.isSelected = searchSuper.selection.isMidSelected(this.peerId, this.mid);
        this.message = await this.managers.appMessagesManager.getMessageByPeer(this.peerId, this.mid);
        this.noForwards = searchSuper.selection.isSelecting ?
          this.searchSuper.selection.selectionForwardBtn.classList.contains('hide') :
          !(await this.managers.appMessagesManager.canForward(this.message));
        this.selectedMessages = searchSuper.selection.isSelecting ? await searchSuper.selection.getSelectedMessages() : undefined;

        await Promise.all(this.buttons.map(async(button) => {
          let good: boolean;

          if(this.searchSuper.selection.isSelecting && !button.withSelection) {
            good = false;
          } else {
            good = button.verify ? !!(await button.verify()) : true;
          }

          button.element.classList.toggle('hide', !good);
        }));

        item.classList.add('menu-open');

        positionMenu(e, this.element);
        contextMenuController.openBtnMenu(this.element, () => {
          item.classList.remove('menu-open');
        });
      };

      r();
    };

    if(IS_TOUCH_SUPPORTED) {

    } else {
      attachContextMenuListener({
        element: attachTo,
        callback: onContextMenu as any,
        listenerSetter
      });
    }
  }

  private init() {
    this.buttons = [{
      icon: 'forward',
      text: 'Forward',
      onClick: this.onForwardClick,
      verify: () => !this.noForwards
    }, {
      icon: 'forward',
      text: 'Message.Context.Selection.Forward',
      onClick: this.onForwardClick,
      verify: () => this.searchSuper.selection.isSelecting && !this.noForwards,
      withSelection: true
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.message, this.noForwards),
      verify: () => !this.searchSuper.selection.isSelecting && ChatContextMenu.canDownload(this.message, undefined, this.noForwards)
    }, {
      icon: 'download',
      text: 'Message.Context.Selection.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.selectedMessages, this.noForwards),
      verify: () => this.searchSuper.selection.isSelecting && ChatContextMenu.canDownload(this.selectedMessages, undefined, this.noForwards),
      withSelection: true
    }, {
      icon: 'message',
      text: 'Message.Context.Goto',
      onClick: this.onGotoClick,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: this.onSelectClick,
      verify: () => !this.isSelected,
      withSelection: true
    }, {
      icon: 'select',
      text: 'Message.Context.Selection.Clear',
      onClick: this.onClearSelectionClick,
      verify: () => this.isSelected,
      withSelection: true
    }, {
      icon: 'delete danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => !this.searchSuper.selection.isSelecting && this.managers.appMessagesManager.canDeleteMessage(this.message)
    }, {
      icon: 'delete danger',
      text: 'Message.Context.Selection.Delete',
      onClick: this.onDeleteClick,
      verify: () => this.searchSuper.selection.isSelecting && this.searchSuper.selection.selectionDeleteBtn && !this.searchSuper.selection.selectionDeleteBtn.classList.contains('hide'),
      withSelection: true
    }];

    this.element = ButtonMenuSync({buttons: this.buttons, listenerSetter: this.listenerSetter});
    this.element.classList.add('search-contextmenu', 'contextmenu');
    document.getElementById('page-chats').append(this.element);
  }

  private onGotoClick = () => {
    appImManager.setInnerPeer({
      peerId: this.peerId,
      lastMsgId: this.mid,
      threadId: this.searchSuper.searchContext.threadId
    });
  };

  private onForwardClick = () => {
    if(this.searchSuper.selection.isSelecting) {
      simulateClickEvent(this.searchSuper.selection.selectionForwardBtn);
    } else {
      PopupElement.createPopup(PopupForward, {
        [this.peerId]: [this.mid]
      });
    }
  };

  private onSelectClick = () => {
    this.searchSuper.selection.toggleByElement(this.target);
  };

  private onClearSelectionClick = () => {
    this.searchSuper.selection.cancelSelection();
  };

  private onDeleteClick = () => {
    if(this.searchSuper.selection.isSelecting) {
      simulateClickEvent(this.searchSuper.selection.selectionDeleteBtn);
    } else {
      PopupElement.createPopup(
        PopupDeleteMessages,
        this.peerId,
        [this.mid],
        'chat'
      );
    }
  };
}

export type ProcessSearchSuperResult = {
  message: Message.message,
  middleware: Middleware,
  promises: Promise<any>[],
  elemsToAppend: {element: HTMLElement, message: any}[],
  inputFilter: MyInputMessagesFilter,
  searchGroup?: SearchGroup
};

export default class AppSearchSuper {
  public tabs: {[t in SearchSuperType]: HTMLDivElement} = {} as any;

  public mediaTab: SearchSuperMediaTab;

  public container: HTMLElement;
  public nav: HTMLElement;
  public navScrollableContainer: HTMLDivElement;
  public tabsContainer: HTMLElement;
  public navScrollable: ScrollableX;
  private tabsMenu: HTMLElement;
  private prevTabId = -1;

  private lazyLoadQueue = new LazyLoadQueue();
  public middleware = getMiddleware();

  public historyStorage: Partial<{[type in SearchSuperType]: {mid: number, peerId: PeerId}[]}> = {};
  public usedFromHistory: Partial<{[type in SearchSuperType]: number}> = {};

  public searchContext: SearchSuperContext;
  public loadMutex: Promise<any> = Promise.resolve();

  private nextRates: Partial<{[type in SearchSuperType]: number}> = {};
  private loadPromises: Partial<{[type in SearchSuperType]: Promise<void>}> = {};
  private loaded: Partial<{[type in SearchSuperType]: boolean}> = {};
  private loadedChats = false;
  private firstLoad = true;

  private log = logger('SEARCH-SUPER');
  public selectTab: ReturnType<typeof horizontalMenu>;

  private monthContainers: Partial<{
    [type in SearchSuperType]: {
      [timestamp: number]: {
        container: HTMLElement,
        items: HTMLElement
      }
    }
  }> = {};

  private searchGroupMedia: SearchGroup;

  public mediaTabsMap: Map<SearchSuperMediaType, SearchSuperMediaTab> = new Map();

  private membersList: SortedUserList;
  private membersParticipantMap: Map<PeerId, ChatParticipant | ChannelParticipant>;
  private membersMiddlewareHelper: MiddlewareHelper;

  private skipScroll: boolean;

  // * arguments
  public mediaTabs: SearchSuperMediaTab[];
  public scrollable: Scrollable;
  public searchGroups?: {[group in SearchGroupType]: SearchGroup};
  public asChatList? = false;
  public groupByMonth? = true;
  public hideEmptyTabs? = true;
  public onChangeTab?: (mediaTab: SearchSuperMediaTab) => void;
  public showSender? = false;

  private searchContextMenu: SearchContextMenu;
  public selection: SearchSelection;

  public scrollStartCallback: (dimensions: ScrollStartCallbackDimensions) => void;

  public managers: AppManagers;
  private loadFirstTimePromise: Promise<void>;

  private listenerSetter: ListenerSetter;
  private swipeHandler: SwipeHandler;

  constructor(options: Pick<AppSearchSuper, 'mediaTabs' | 'scrollable' | 'searchGroups' | 'asChatList' | 'groupByMonth' | 'hideEmptyTabs' | 'onChangeTab' | 'showSender' | 'managers'>) {
    safeAssign(this, options);

    this.container = document.createElement('div');
    this.container.classList.add('search-super');

    this.listenerSetter = new ListenerSetter();
    this.searchContextMenu = new SearchContextMenu(this.container, this, this.listenerSetter);
    this.selection = new SearchSelection(this, this.managers, this.listenerSetter);

    const navScrollableContainer = this.navScrollableContainer = document.createElement('div');
    navScrollableContainer.classList.add('search-super-tabs-scrollable', 'menu-horizontal-scrollable', 'sticky');

    const navScrollable = this.navScrollable = new ScrollableX(navScrollableContainer);
    navScrollable.container.classList.add('search-super-nav-scrollable');

    const nav = this.nav = document.createElement('nav');
    nav.classList.add('search-super-tabs', 'menu-horizontal-div');
    this.tabsMenu = nav;

    navScrollable.container.append(nav);

    for(const mediaTab of this.mediaTabs) {
      const menuTab = document.createElement('div');
      menuTab.classList.add('menu-horizontal-div-item');
      const span = document.createElement('span');
      const i = document.createElement('i');

      span.append(i18n(mediaTab.name));
      span.append(i);

      menuTab.append(span);

      ripple(menuTab);

      this.tabsMenu.append(menuTab);

      this.mediaTabsMap.set(mediaTab.type, mediaTab);

      mediaTab.menuTab = menuTab;
    }

    this.tabsContainer = document.createElement('div');
    this.tabsContainer.classList.add('search-super-tabs-container', 'tabs-container');

    let unlockScroll: ReturnType<typeof lockTouchScroll>;
    if(IS_TOUCH_SUPPORTED) {
      this.swipeHandler = handleTabSwipe({
        element: this.tabsContainer,
        onSwipe: (xDiff, yDiff, e) => {
          xDiff *= -1;
          yDiff *= -1;
          const prevId = this.selectTab.prevId();
          const children = Array.from(this.tabsMenu.children) as HTMLElement[];
          let idx: number;
          if(xDiff > 0) {
            for(let i = prevId + 1; i < children.length; ++i) {
              if(!children[i].classList.contains('hide')) {
                idx = i;
                break;
              }
            }
          } else {
            for(let i = prevId - 1; i >= 0; --i) {
              if(!children[i].classList.contains('hide')) {
                idx = i;
                break;
              }
            }
          }

          if(idx !== undefined) {
            unlockScroll = lockTouchScroll(this.tabsContainer);
            this.selectTab(idx);
          }
        },
        verifyTouchTarget: (e) => {
          return !findUpClassName(e.target, 'scrollable-x');
        }
      });
    }

    for(const mediaTab of this.mediaTabs) {
      const container = document.createElement('div');
      container.classList.add('search-super-container-' + mediaTab.type, 'tabs-tab');

      const content = document.createElement('div');
      content.classList.add('search-super-content-' + mediaTab.type);

      container.append(content);

      this.tabsContainer.append(container);

      this.tabs[mediaTab.inputFilter] = content;

      mediaTab.contentTab = content;
    }

    this.container.append(navScrollableContainer, this.tabsContainer);

    // * construct end

    this.searchGroupMedia = new SearchGroup(false, 'messages', true);

    this.scrollable.onScrolledBottom = () => {
      if(this.mediaTab.contentTab && this.canLoadMediaTab(this.mediaTab)/* && false */) {
        // this.log('onScrolledBottom will load media');
        this.load(true);
      }
    };
    // this.scroll.attachSentinels(undefined, 400);

    this.selectTab = horizontalMenu(this.tabsMenu, this.tabsContainer, (id, tabContent, animate) => {
      if(this.prevTabId === id && !this.skipScroll) {
        this.scrollable.scrollIntoViewNew({
          element: this.container,
          position: 'start',
          startCallback: this.scrollStartCallback
        });
        return;
      }

      const newMediaTab = this.mediaTabs[id];
      if(this.onChangeTab) {
        this.onChangeTab(newMediaTab);
      }

      const fromMediaTab = this.mediaTab;
      this.mediaTab = newMediaTab;

      if(this.prevTabId !== -1 && animate) {
        this.onTransitionStart();
      }

      if(this.skipScroll) {
        this.skipScroll = false;
      } else {
        const offsetTop = this.container.offsetTop;
        let scrollTop = this.scrollable.scrollTop;
        if(scrollTop < offsetTop) {
          this.scrollable.scrollIntoViewNew({
            element: this.container,
            position: 'start',
            startCallback: this.scrollStartCallback
          });
          scrollTop = offsetTop;
        }

        fromMediaTab.scroll = {scrollTop: scrollTop, scrollHeight: this.scrollable.scrollHeight};

        if(newMediaTab.scroll === undefined) {
          const rect = this.container.getBoundingClientRect();
          const rect2 = this.container.parentElement.getBoundingClientRect();
          const diff = rect.y - rect2.y;

          if(scrollTop > diff) {
            newMediaTab.scroll = {scrollTop: diff, scrollHeight: 0};
          }
        }

        if(newMediaTab.scroll) {
          const diff = fromMediaTab.scroll.scrollTop - newMediaTab.scroll.scrollTop;
          // console.log('what you gonna do', this.goingHard, diff);

          // this.scrollable.scrollTop = scrollTop;
          if(diff/*  && diff < 0 */) {
            /* if(diff > -(fromMediaTab.contentTab.scrollHeight + this.nav.scrollHeight)) {
              fromMediaTab.contentTab.style.transform = `translateY(${diff}px)`;
              this.scrollable.scrollTop = scrollTop - diff;
            } else { */
            newMediaTab.contentTab.style.transform = `translateY(${diff}px)`;
            // }
          }
        }
      }

      /* if(this.prevTabId !== -1 && nav.offsetTop) {
        this.scrollable.scrollTop -= nav.offsetTop;
      } */

      /* this.log('setVirtualContainer', id, this.sharedMediaSelected, this.sharedMediaSelected.childElementCount);
      this.scroll.setVirtualContainer(this.sharedMediaSelected); */

      if(this.prevTabId !== -1 && !newMediaTab.contentTab.childElementCount) { // quick brown fix
        // this.contentContainer.classList.remove('loaded');
        this.load(true);
      }

      this.prevTabId = id;
    }, () => {
      this.scrollable.onScroll();

      // console.log('what y', this.tabSelected.style.transform);
      if(this.mediaTab.scroll !== undefined) {
        this.mediaTab.contentTab.style.transform = '';
        this.scrollable.scrollTop = this.mediaTab.scroll.scrollTop;
      }

      if(unlockScroll) {
        unlockScroll();
        unlockScroll = undefined;
      }

      this.onTransitionEnd();
    }, undefined, navScrollable, this.listenerSetter);

    attachClickEvent(this.tabsContainer, (e) => {
      if(this.selection.isSelecting) {
        cancelEvent(e);
        this.selection.toggleByElement(findUpClassName(e.target, 'search-super-item'));
      }
    }, {capture: true, passive: false, listenerSetter: this.listenerSetter});

    const onMediaClick = async(className: string, targetClassName: string, inputFilter: MyInputMessagesFilter, e: MouseEvent) => {
      const target = findUpClassName(e.target as HTMLDivElement, className);
      if(!target) return;

      const mid = +target.dataset.mid;
      if(!mid) {
        this.log.warn('no messageId by click on target:', target);
        return;
      }

      const mediaSpoiler: HTMLElement = target.querySelector('.media-spoiler-container');
      if(mediaSpoiler) {
        onMediaSpoilerClick({
          event: e,
          mediaSpoiler
        })
        return;
      }

      const peerId = target.dataset.peerId.toPeerId();

      const targets = (Array.from(this.tabs[inputFilter].querySelectorAll('.' + targetClassName)) as HTMLElement[]).map((el) => {
        const containerEl = findUpClassName(el, className);
        return {
          element: el,
          mid: +containerEl.dataset.mid,
          peerId: containerEl.dataset.peerId.toPeerId()
        };
      });

      // const ids = Object.keys(this.mediaDivsByIds).map((k) => +k).sort((a, b) => a - b);
      const idx = targets.findIndex((item) => item.mid === mid && item.peerId === peerId);

      const message = await this.managers.appMessagesManager.getMessageByPeer(peerId, mid);
      new AppMediaViewer()
      .setSearchContext(this.copySearchContext(inputFilter))
      .openMedia({
        message,
        target: targets[idx].element,
        fromRight: 0,
        reverse: false,
        prevTargets: targets.slice(0, idx),
        nextTargets: targets.slice(idx + 1)
      });
    };

    attachClickEvent(this.tabs.inputMessagesFilterPhotoVideo, onMediaClick.bind(null, 'grid-item', 'grid-item', 'inputMessagesFilterPhotoVideo'), {listenerSetter: this.listenerSetter});
    attachClickEvent(this.tabs.inputMessagesFilterDocument, onMediaClick.bind(null, 'document-with-thumb', 'media-container', 'inputMessagesFilterDocument'), {listenerSetter: this.listenerSetter});

    /* attachClickEvent(this.tabs.inputMessagesFilterUrl, (e) => {
      const target = e.target as HTMLElement;
      if(target.tagName === 'A') {
        return;
      }

      try {
        const a = findUpClassName(target, 'row').querySelector('.anchor-url:last-child') as HTMLAnchorElement;
        a.click();
      } catch(err) {}
    }); */

    this.mediaTab = this.mediaTabs[0];

    useHeavyAnimationCheck(() => {
      this.lazyLoadQueue.lock();
    }, () => {
      this.lazyLoadQueue.unlockAndRefresh(); // ! maybe not so efficient
    }, this.listenerSetter);
  }

  private onTransitionStart = () => {
    this.container.classList.add('sliding');
  };

  private onTransitionEnd = () => {
    this.container.classList.remove('sliding');
  };

  public filterMessagesByType(messages: MyMessage[], type: SearchSuperType): MyMessage[] {
    return filterMessagesByInputFilter(type, messages, messages.length);
  }

  private async processEmptyFilter({message, searchGroup}: ProcessSearchSuperResult) {
    let peerId = message.peerId;
    peerId = await this.managers.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const loadPromises: Promise<any>[] = [];
    const dialogElement = appDialogsManager.addDialogNew({
      peerId,
      container: searchGroup.list,
      avatarSize: 'bigger',
      loadPromises
    });

    const setLastMessagePromise = appDialogsManager.setLastMessageN({
      dialog: {
        _: 'dialog',
        peerId
      } as any,
      lastMessage: message,
      dialogElement,
      highlightWord: this.searchContext.query
    });

    loadPromises.push(setLastMessagePromise);
    return Promise.all(loadPromises).then(noop);
  }

  private async processPhotoVideoFilter({message, promises, middleware}: ProcessSearchSuperResult) {
    const media = getMediaFromMessage(message, true);

    const div = document.createElement('div');
    div.classList.add('grid-item');
    // this.log(message, photo);

    let wrapped: Awaited<ReturnType<typeof wrapPhoto>>;
    const size = choosePhotoSize(media, 200, 200);
    if(media._ !== 'photo') {
      wrapped = await (await wrapVideo({
        doc: media,
        message,
        container: div,
        boxWidth: 0,
        boxHeight: 0,
        lazyLoadQueue: this.lazyLoadQueue,
        middleware,
        onlyPreview: true,
        withoutPreloader: true,
        noPlayButton: true,
        photoSize: size
      })).thumb;
    } else {
      wrapped = await wrapPhoto({
        photo: media,
        message,
        container: div,
        boxWidth: 0,
        boxHeight: 0,
        lazyLoadQueue: this.lazyLoadQueue,
        middleware,
        withoutPreloader: true,
        noBlur: true,
        size
      });
    }

    if((message.media as MessageMedia.messageMediaPhoto).pFlags.spoiler) {
      const mediaSpoiler = await wrapMediaSpoiler({
        animationGroup: 'chat',
        media,
        middleware,
        width: 140,
        height: 140,
        multiply: 0.3
      });

      div.append(mediaSpoiler);
    }

    [
      wrapped.images.thumb,
      wrapped.images.full
    ].filter(Boolean).forEach((image) => {
      image.classList.add('grid-item-media');
    });

    promises.push(wrapped.loadPromises.thumb);

    return {element: div, message};
  }

  private async processDocumentFilter({message, inputFilter}: ProcessSearchSuperResult) {
    const document = getMediaFromMessage(message, true) as Document.document;
    const showSender = this.showSender || (['voice', 'round'] as MyDocument['type'][]).includes(document.type);

    const div = await wrapDocument({
      message,
      withTime: !showSender,
      fontWeight: 400,
      voiceAsMusic: true,
      showSender,
      searchContext: this.copySearchContext(inputFilter),
      lazyLoadQueue: this.lazyLoadQueue,
      autoDownloadSize: 0,
      getSize: () => 320
    });

    if((['audio', 'voice', 'round'] as MyDocument['type'][]).includes(document.type)) {
      div.classList.add('audio-48');
    }

    return {message, element: div};
  }

  private async processUrlFilter({message, promises, middleware}: ProcessSearchSuperResult) {
    let webPage = (message.media as MessageMedia.messageMediaWebPage)?.webpage as WebPage.webPage | WebPage.webPageEmpty;

    if(!webPage) {
      const entity = message.totalEntities ? message.totalEntities.find((e: any) => e._ === 'messageEntityUrl' || e._ === 'messageEntityTextUrl') : null;
      let url: string, display_url: string, sliced: string;

      if(!entity) {
        const match = matchUrl(message.message);
        if(!match) {
          return;
        }

        url = match[0];
      } else {
        sliced = message.message.slice(entity.offset, entity.offset + entity.length);
      }

      if(entity?._ === 'messageEntityTextUrl') {
        url = entity.url;
        // display_url = sliced;
      } else {
        url = url || sliced;
      }

      display_url = url;

      const same = message.message === url;
      if(!url.match(/^(ftp|http|https):\/\//)) {
        display_url = 'https://' + url;
        url = url.includes('@') ? url : 'https://' + url;
      }

      display_url = new URL(display_url).hostname;

      webPage = {
        _: 'webPage',
        url,
        display_url,
        id: '',
        hash: 0
      };

      if(!same) {
        webPage.description = message.message;
      }
    }

    if(webPage._ === 'webPageEmpty') {
      return;
    }

    const previewDiv = document.createElement('div');
    previewDiv.classList.add('preview');

    // this.log('wrapping webpage', webpage);

    if(webPage.photo) {
      const res = wrapPhoto({
        container: previewDiv,
        message: null,
        photo: webPage.photo as Photo.photo,
        boxWidth: 0,
        boxHeight: 0,
        withoutPreloader: true,
        lazyLoadQueue: this.lazyLoadQueue,
        middleware,
        size: choosePhotoSize(webPage.photo as Photo.photo, 60, 60, false),
        loadPromises: promises,
        noBlur: true
      });
    } else {
      previewDiv.classList.add('empty');
      setInnerHTML(previewDiv, wrapAbbreviation(webPage.title || webPage.display_url || webPage.description || webPage.url, true));
    }

    const title = wrapWebPageTitle(webPage);

    const subtitleFragment = wrapWebPageDescription(webPage);
    const aFragment = htmlToDocumentFragment(wrapRichText(webPage.url || ''));
    const a = aFragment.firstElementChild;
    if(a instanceof HTMLAnchorElement) {
      try { // can have 'URIError: URI malformed'
        a.innerText = decodeURIComponent(a.href);
      } catch(err) {

      }
    }

    if(subtitleFragment.firstChild) {
      subtitleFragment.append('\n');
    }

    subtitleFragment.append(a);

    if(this.showSender) {
      subtitleFragment.append('\n', await wrapSenderToPeer(message));
    }

    if(!title.textContent) {
      // title = new URL(webpage.url).hostname;
      title.append(wrapPlainText(webPage.display_url.split('/', 1)[0]));
    }

    const row = new Row({
      title,
      titleRight: wrapSentTime(message),
      subtitle: subtitleFragment,
      havePadding: true,
      clickable: true,
      noRipple: true
    });

    row.applyMediaElement(previewDiv, 'big');

    if(row.container.innerText.trim().length) {
      return {message, element: row.container};
    }
  }

  public async performSearchResult(messages: any[], mediaTab: SearchSuperMediaTab, append = true) {
    const elemsToAppend: {element: HTMLElement, message: any}[] = [];
    const sharedMediaDiv: HTMLElement = mediaTab.contentTab;
    const promises: Promise<any>[] = [];
    const middleware = this.middleware.get();
    let inputFilter = mediaTab.inputFilter;

    await getHeavyAnimationPromise();

    let searchGroup: SearchGroup;
    if(inputFilter === 'inputMessagesFilterPhotoVideo' && !!this.searchContext.query.trim()) {
      inputFilter = 'inputMessagesFilterEmpty';
      searchGroup = this.searchGroupMedia;
      sharedMediaDiv.append(searchGroup.container);
    } else if(inputFilter === 'inputMessagesFilterEmpty') {
      searchGroup = this.searchGroups.messages;
    }

    const options: ProcessSearchSuperResult = {
      elemsToAppend,
      inputFilter,
      message: undefined,
      middleware,
      promises,
      searchGroup
    };

    let processCallback: (options: ProcessSearchSuperResult) => any;

    // https://core.telegram.org/type/MessagesFilter
    switch(inputFilter) {
      case 'inputMessagesFilterEmpty': {
        processCallback = this.processEmptyFilter;
        break;
      }

      case 'inputMessagesFilterPhotoVideo': {
        processCallback = this.processPhotoVideoFilter;
        break;
      }

      case 'inputMessagesFilterVoice':
      case 'inputMessagesFilterRoundVoice':
      case 'inputMessagesFilterMusic':
      case 'inputMessagesFilterDocument': {
        processCallback = this.processDocumentFilter;
        break;
      }

      case 'inputMessagesFilterUrl': {
        processCallback = this.processUrlFilter;
        break;
      }

      default:
        // this.log.warn('death is my friend', messages);
        break;
    }

    if(processCallback) {
      processCallback = processCallback.bind(this);

      type K = {element: HTMLElement, message: Message.message | Message.messageService};
      const results: (Promise<K> | K)[] = messages.map(async(message) => {
        try {
          options.message = message;
          return await processCallback(options);
        } catch(err) {
          this.log.error('error rendering filter', inputFilter, options, message, err);
        }
      });

      const awaited = (await Promise.all(results)).filter(Boolean);
      elemsToAppend.push(...awaited);
    }

    if(searchGroup && searchGroup.list.childElementCount) {
      searchGroup.setActive();
    }

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    if(promises.length) {
      await Promise.all(promises);
      if(!middleware()) {
        // this.log.warn('peer changed');
        return;
      }
    }

    if(elemsToAppend.length) {
      const method = append ? 'append' : 'prepend';
      elemsToAppend.forEach((details) => {
        const {element, message} = details;
        if(!message) {
          debugger;
        }

        const monthContainer = this.getMonthContainerByTimestamp(this.groupByMonth ? message.date : 0, inputFilter);
        element.classList.add('search-super-item');
        element.dataset.mid = '' + message.mid;
        element.dataset.peerId = '' + message.peerId;
        monthContainer.items[method](element);

        if(this.selection?.isSelecting) {
          this.selection.toggleElementCheckbox(element, true);
        }
      });
    }

    // if(type !== 'inputMessagesFilterEmpty') {
    this.afterPerforming(inputFilter === 'inputMessagesFilterEmpty' ? 1 : elemsToAppend.length, sharedMediaDiv);
    // }
  }

  private afterPerforming(length: number, contentTab: HTMLElement) {
    if(contentTab) {
      const parent = contentTab.parentElement;
      Array.from(parent.children).slice(1).forEach((child) => {
        child.remove();
      });

      // this.contentContainer.classList.add('loaded');

      if(!length && !contentTab.childElementCount) {
        const div = document.createElement('div');
        div.innerText = 'Nothing interesting here yet...';
        div.classList.add('position-center', 'text-center', 'content-empty', 'no-select');

        parent.append(div);
      }
    }
  }

  private loadChats() {
    const renderedPeerIds: Set<PeerId> = new Set();
    const middleware = this.middleware.get();

    for(const i in this.searchGroups) {
      const group = this.searchGroups[i as SearchGroupType];
      this.tabs.inputMessagesFilterEmpty.append(group.container);
      group.clear();
    }

    const query = this.searchContext.query;
    if(query) {
      const setResults = (results: PeerId[], group: SearchGroup, showMembersCount = false) => {
        results.map((peerId) => {
          if(renderedPeerIds.has(peerId)) {
            return;
          }

          renderedPeerIds.add(peerId);

          const {dom} = appDialogsManager.addDialogNew({
            peerId: peerId,
            container: group.list,
            avatarSize: 'abitbigger',
            autonomous: group.autonomous
          });

          return {dom, peerId};
        }).filter(Boolean).forEach(async({dom, peerId}) => {
          const peer = await this.managers.appPeersManager.getPeer(peerId);
          if(showMembersCount && ((peer as Chat.channel).participants_count || (peer as any).participants)) {
            const regExp = new RegExp(`(${escapeRegExp(query)}|${escapeRegExp(cleanSearchText(query))})`, 'gi');
            dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');
            dom.lastMessageSpan.append(await getChatMembersString(peerId.toChatId()));
          } else if(peerId === rootScope.myId) {
            dom.lastMessageSpan.append(i18n('Presence.YourChat'));
          } else {
            let username = await this.managers.appPeersManager.getPeerUsername(peerId);
            if(!username) {
              const user = await this.managers.appUsersManager.getUser(peerId);
              if(user && user.phone) {
                username = '+' + formatPhoneNumber(user.phone).formatted;
              }
            } else {
              username = '@' + username;
            }

            dom.lastMessageSpan.textContent = username;
          }
        });

        group.toggle();
      };

      const onLoad = <T>(arg: T) => {
        if(!middleware()) {
          return;
        }

        // this.loadedContacts = true;

        return arg;
      };

      return Promise.all([
        this.managers.appUsersManager.getContactsPeerIds(query, true, undefined, 10)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            setResults(contacts, this.searchGroups.contacts, true);
          }
        }),

        this.managers.appUsersManager.searchContacts(query, 20)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            setResults(contacts.my_results, this.searchGroups.contacts, true);
            setResults(contacts.results/* .concat(contacts.results, contacts.results, contacts.results) */, this.searchGroups.globalContacts);

            this.searchGroups.globalContacts.container.classList.add('is-short');

            if(this.searchGroups.globalContacts.nameEl.lastElementChild !== this.searchGroups.globalContacts.nameEl.firstElementChild) {
              this.searchGroups.globalContacts.nameEl.lastElementChild.remove();
            }

            if(this.searchGroups.globalContacts.list.childElementCount > 3) {
              const showMore = document.createElement('div');
              showMore.classList.add('search-group__show-more');
              const intlElement = new I18n.IntlElement({
                key: 'Separator.ShowMore'
              });
              showMore.append(intlElement.element);
              this.searchGroups.globalContacts.nameEl.append(showMore);
              attachClickEvent(showMore, () => {
                const isShort = this.searchGroups.globalContacts.container.classList.toggle('is-short');
                intlElement.key = isShort ? 'Separator.ShowMore' : 'Separator.ShowLess';
                intlElement.update();
              });
            }
          }
        }),

        this.managers.dialogsStorage.getDialogs({query, offsetIndex: 0, limit: 20, filterId: 0})
        .then(onLoad)
        .then((value) => {
          if(value) {
            setResults(value.dialogs.map((d) => d.peerId), this.searchGroups.contacts, true);
          }
        })
      ]);
    } else if(!this.searchContext.peerId && !this.searchContext.minDate) {
      const renderRecentSearch = (setActive = true) => {
        return apiManagerProxy.getState().then((state) => {
          if(!middleware()) {
            return;
          }

          this.searchGroups.recent.list.replaceChildren();

          state.recentSearch.slice(0, 20).forEach(async(peerId) => {
            const {dom} = appDialogsManager.addDialogNew({
              peerId: peerId,
              container: this.searchGroups.recent.list,
              meAsSaved: true,
              avatarSize: 'abitbigger',
              autonomous: true
            });

            dom.lastMessageSpan.append(await (peerId.isUser() ?
              getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId())) :
              getChatMembersString(peerId.toChatId())));
          });

          if(!state.recentSearch.length) {
            this.searchGroups.recent.clear();
          } else if(setActive) {
            this.searchGroups.recent.setActive();
          }
        });
      };

      return Promise.all([
        this.managers.appUsersManager.getTopPeers('correspondents').then((peers) => {
          if(!middleware()) return;

          const idx = peers.findIndex((peer) => peer.id === rootScope.myId);
          if(idx !== -1) {
            peers = peers.slice();
            peers.splice(idx, 1);
          }

          peers.forEach((peer) => {
            const {dom} = appDialogsManager.addDialogNew({
              peerId: peer.id,
              container: this.searchGroups.people.list,
              onlyFirstName: true,
              avatarSize: 'bigger',
              autonomous: false,
              noIcons: this.searchGroups.people.noIcons
            });

            dom.subtitleEl.remove();
          });

          this.searchGroups.people.toggle();
        }),

        renderRecentSearch()
      ]);
    } else return Promise.resolve();
  }

  private async loadMembers(mediaTab: SearchSuperMediaTab) {
    const chatId = mediaTab.type === 'members' ? this.searchContext.peerId.toChatId() : undefined;
    const userId = mediaTab.type === 'groups' ? this.searchContext.peerId.toUserId() : undefined;
    const middleware = this.middleware.get();
    let promise: Promise<void>;

    const renderParticipants = async(participants: (ChatParticipant | ChannelParticipant | Chat)[]) => {
      if(this.loadMutex) {
        await this.loadMutex;

        if(!middleware()) {
          return;
        }
      }

      let membersList = this.membersList,
        membersParticipantMap = this.membersParticipantMap,
        membersMiddlewareHelper = this.membersMiddlewareHelper;
      if(!membersList) {
        membersParticipantMap = this.membersParticipantMap = new Map();
        membersMiddlewareHelper = this.membersMiddlewareHelper = getMiddleware();
        membersList = this.membersList = new SortedUserList({
          lazyLoadQueue: this.lazyLoadQueue,
          rippleEnabled: false,
          managers: this.managers
        });
        attachClickEvent(membersList.list, (e) => {
          const li = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
          if(!li) {
            return;
          }

          const peerId = li.dataset.peerId.toPeerId();
          let promise: Promise<any> = Promise.resolve();
          if(mediaSizes.isMobile) {
            promise = appSidebarRight.toggleSidebar(false);
          }

          promise.then(() => {
            appImManager.setInnerPeer({peerId});
          });
        });
        mediaTab.contentTab.append(membersList.list);
        this.afterPerforming(1, mediaTab.contentTab);

        if(chatId) {
          const middleware = membersMiddlewareHelper.get();
          createParticipantContextMenu({
            chatId,
            listenTo: membersList.list,
            participants: this.membersParticipantMap,
            slider: appSidebarRight,
            middleware
          });

          const onParticipantUpdate = (update: Update.updateChannelParticipant) => {
            const peerId = getParticipantPeerId(update.prev_participant || update.new_participant);
            if(!update.new_participant || (update.new_participant as ChannelParticipant.channelParticipantBanned).pFlags?.left) {
              membersList.delete(peerId);
              membersParticipantMap.delete(peerId);
            } else if(!update.prev_participant && update.new_participant) {
              renderParticipants([update.new_participant]);
            }
          };

          rootScope.addEventListener('chat_participant', onParticipantUpdate);
          middleware.onClean(() => {
            rootScope.removeEventListener('chat_participant', onParticipantUpdate);
          });
        }
      }

      const peerIds: {
        peerId: PeerId,
        rank: ReturnType<typeof getParticipantRank>,
        participant: typeof participants[0]
      }[] = participants.map((participant) => {
        const peerId = userId ? (participant as Chat.chat).id.toPeerId(true) : getParticipantPeerId(participant as ChannelParticipant);
        if(chatId ? peerId.isAnyChat() : peerId.isUser()) {
          return;
        }

        return {
          peerId,
          rank: getParticipantRank(participant as ChannelParticipant) as any,
          participant
        };
      }).filter(Boolean);

      const filtered = await filterAsync(peerIds, async({peerId}) => {
        const peer: User | Chat = await this.managers.appPeersManager.getPeer(peerId);
        if(!middleware()) {
          return false;
        }

        if(!peer || (peer as User.user).pFlags.deleted) {
          return false;
        }

        return true;
      });

      for(const {peerId, rank, participant} of filtered) {
        if(rank) {
          membersList.ranks.set(peerId, rank);
        }

        membersParticipantMap.set(peerId, participant as ChannelParticipant);
        membersList.add(peerId);
      }
    };

    if(userId) {
      const LOAD_COUNT = !this.membersList ? 50 : 200;
      promise = this.managers.appUsersManager.getCommonChats(userId, LOAD_COUNT, this.nextRates[mediaTab.inputFilter]).then((messagesChats) => {
        if(!middleware()) {
          return;
        }

        // const list = mediaTab.contentTab.firstElementChild as HTMLUListElement;
        const lastChat = messagesChats.chats[messagesChats.chats.length - 1];
        this.nextRates[mediaTab.inputFilter] = lastChat?.id as number;

        if(messagesChats.chats.length < LOAD_COUNT) {
          this.loaded[mediaTab.inputFilter] = true;
        }

        return renderParticipants(messagesChats.chats);
      });
    } else if(await this.managers.appChatsManager.isChannel(chatId)) {
      const LOAD_COUNT = !this.membersList ? 50 : 200;
      promise = this.managers.appProfileManager.getChannelParticipants(chatId, undefined, LOAD_COUNT, this.nextRates[mediaTab.inputFilter]).then((participants) => {
        if(!middleware()) {
          return;
        }

        const list = mediaTab.contentTab.firstElementChild as HTMLUListElement;
        this.nextRates[mediaTab.inputFilter] = (list ? list.childElementCount : 0) + participants.participants.length;

        if(participants.participants.length < LOAD_COUNT) {
          this.loaded[mediaTab.inputFilter] = true;
        }

        return renderParticipants(participants.participants);
      });
    } else {
      promise = this.managers.appProfileManager.getChatFull(chatId).then((chatFull) => {
        if(!middleware()) {
          return;
        }

        // console.log('anymore', chatFull);
        this.loaded[mediaTab.inputFilter] = true;
        const participants = (chatFull as ChatFull.chatFull).participants;
        if(participants._ === 'chatParticipantsForbidden') {
          return;
        }

        return renderParticipants(participants.participants);
      });
    }

    return this.loadPromises[mediaTab.inputFilter] = promise.finally(() => {
      if(!middleware()) {
        return;
      }

      this.loadPromises[mediaTab.inputFilter] = null;
    });
  }

  private loadType(mediaTab: SearchSuperMediaTab, justLoad: boolean, loadCount: number, middleware: () => boolean) {
    const type = mediaTab.inputFilter;

    if(this.loadPromises[type]) {
      return this.loadPromises[type];
    }

    if(mediaTab.type === 'members' || mediaTab.type === 'groups') {
      return this.loadMembers(mediaTab);
    }

    const history = this.historyStorage[type] ??= [];

    if(type === 'inputMessagesFilterEmpty' && !history.length) {
      if(!this.loadedChats) {
        this.loadChats();
        this.loadedChats = true;
      }

      if(!this.searchContext.query.trim() && !this.searchContext.peerId && !this.searchContext.minDate) {
        this.loaded[type] = true;
        return Promise.resolve();
      }
    }

    const promise = this.loadPromises[type] = Promise.resolve().then(async() => {
      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length && !justLoad) {
        const messages: any[] = [];
        let used = Math.max(0, this.usedFromHistory[type]);
        let slicedLength = 0;

        do {
          const ids = history.slice(used, used + loadCount);
          used += ids.length;
          slicedLength += ids.length;

          const notFilteredMessages = await Promise.all(ids.map((m) => this.managers.appMessagesManager.getMessageByPeer(m.peerId, m.mid)));

          messages.push(...this.filterMessagesByType(notFilteredMessages, type));
        } while(slicedLength < loadCount && used < history.length);

        // если перебор
        /* if(slicedLength > loadCount) {
          let diff = messages.length - loadCount;
          messages = messages.slice(0, messages.length - diff);
          used -= diff;
        } */

        this.usedFromHistory[type] = used;
        // if(messages.length) {
        return this.performSearchResult(messages, mediaTab).finally(() => {
          setTimeout(() => {
            this.scrollable.checkForTriggers();
          }, 0);
        });
        // }
      }

      const lastItem = history[history.length - 1];
      const offsetId = lastItem?.mid || 0;
      const offsetPeerId = lastItem?.peerId || NULL_PEER_ID;

      const value = await this.managers.appMessagesManager.getHistory({
        ...this.searchContext,
        inputFilter: {_: type},
        offsetId,
        offsetPeerId,
        limit: loadCount,
        nextRate: this.nextRates[type] ??= 0
      });

      // const messages = await Promise.all(value.history.map((mid) => this.managers.appMessagesManager.getMessageByPeer(this.searchContext.peerId, mid)));
      const messages = value.messages;
      history.push(...messages.map((m) => ({mid: m.mid, peerId: m.peerId})));

      if(!middleware()) {
        // this.log.warn('peer changed');
        return;
      }

      // ! Фикс случая, когда не загружаются документы при открытой панели разработчиков (происходит из-за того, что не совпадают критерии отбора документов в getSearch)
      if(
        value.history.length < loadCount ||
        (this.searchContext.folderId !== undefined && !value.nextRate) ||
        // value.history.length === value.count
        value.isEnd.top
      ) {
      // if((value.count || history.length === value.count) && history.length >= value.count) {
        // this.log(logStr + 'loaded all media', value, loadCount);
        this.loaded[type] = true;
      }

      this.nextRates[type] = value.nextRate;

      if(justLoad) {
        return;
      }

      this.usedFromHistory[type] = history.length;

      if(!this.loaded[type]) {
        promise.then(() => {
          setTimeout(() => {
            if(!middleware()) return;
            // this.log('will preload more');
            if(this.mediaTab === mediaTab) {
              const promise = this.load(true, true);
              if(promise) {
                promise.then(() => {
                  if(!middleware()) return;
                  // this.log('preloaded more');
                  setTimeout(() => {
                    this.scrollable.checkForTriggers();
                  }, 0);
                });
              }
            }
          }, 0);
        });
      }

      // if(value.history.length) {
      return this.performSearchResult(this.filterMessagesByType(messages, type), mediaTab);
      // }
    }).catch((err) => {
      this.log.error('load error:', err);
    }).finally(() => {
      this.loadPromises[type] = null;
    });

    return promise;
  }

  private canLoadMediaTab(mediaTab: SearchSuperMediaTab) {
    const inputFilter = mediaTab.inputFilter;
    return !this.loaded[inputFilter] || (this.historyStorage[inputFilter] && this.usedFromHistory[inputFilter] < this.historyStorage[inputFilter].length);
  }

  private async loadFirstTime() {
    const middleware = this.middleware.get();
    const {peerId, threadId} = this.searchContext;
    if(!this.hideEmptyTabs) {
      return;
    }

    const mediaTabs = this.mediaTabs.filter((mediaTab) => mediaTab.inputFilter !== 'inputMessagesFilterEmpty');
    const filters = mediaTabs.map((mediaTab) => ({_: mediaTab.inputFilter}));

    const [counters, canViewMembers, canViewGroups] = await Promise.all([
      this.managers.appMessagesManager.getSearchCounters(peerId, filters, undefined, threadId),
      this.canViewMembers(),
      this.canViewGroups()
    ]);

    if(!middleware()) {
      return;
    }

    if(this.loadMutex) {
      await this.loadMutex;

      if(!middleware()) {
        return;
      }
    }

    let firstMediaTab: SearchSuperMediaTab;
    let count = 0;
    mediaTabs.forEach((mediaTab) => {
      const counter = counters.find((c) => c.filter._ === mediaTab.inputFilter);

      mediaTab.menuTab.classList.toggle('hide', !counter.count);
      mediaTab.menuTab.classList.remove('active');
      // mediaTab.contentTab.classList.toggle('hide', !counter.count);

      if(counter.count) {
        if(firstMediaTab === undefined) {
          firstMediaTab = mediaTab;
        }

        ++count;
      }
    });

    const membersTab = this.mediaTabsMap.get('members');

    const a: [SearchSuperMediaTab, boolean][] = [
      [membersTab, canViewMembers],
      [this.mediaTabsMap.get('groups'), canViewGroups]
    ];

    a.forEach(([tab, value]) => {
      if(!tab) {
        return;
      }

      tab.menuTab.classList.toggle('hide', !value);

      if(value) {
        ++count;
      }
    });

    if(canViewMembers) {
      firstMediaTab = membersTab;
    }

    this.container.classList.toggle('hide', !firstMediaTab);
    this.container.parentElement.classList.toggle('search-empty', !firstMediaTab);
    if(firstMediaTab) {
      this.skipScroll = true;
      this.selectTab(this.mediaTabs.indexOf(firstMediaTab), false);
      // firstMediaTab.menuTab.classList.add('active');

      this.navScrollableContainer.classList.toggle('hide', count <= 1);
    }
  }

  public async load(single = false, justLoad = false) {
    const peerId = this.searchContext.peerId;
    this.log('load', single, peerId, this.loadPromises);
    const middleware = this.middleware.get();

    if(this.firstLoad) {
      await (this.loadFirstTimePromise ??= this.loadFirstTime());
      if(!middleware()) {
        return;
      }

      this.loadFirstTimePromise = undefined;
      this.firstLoad = false;
    }

    let toLoad = single ? [this.mediaTab] : this.mediaTabs.filter((t) => t !== this.mediaTab);
    toLoad = toLoad.filter((mediaTab) => {
      return this.canLoadMediaTab(mediaTab);
    });

    if(peerId.isUser()) {
      findAndSplice(toLoad, (mediaTab) => mediaTab.type === 'members');
    } else {
      findAndSplice(toLoad, (mediaTab) => mediaTab.type === 'groups');
    }

    if(!toLoad.length) {
      return;
    }

    const loadCount = justLoad ? 50 : Math.round((windowSize.height / 130 | 0) * 3 * 1.25); // that's good for all types

    const promises: Promise<any>[] = toLoad.map((mediaTab) => {
      return this.loadType(mediaTab, justLoad, loadCount, middleware);
    });

    return Promise.all(promises).catch((err) => {
      this.log.error('Load error all promises:', err);
    });
  }

  private getMonthContainerByTimestamp(timestamp: number, type: SearchSuperType) {
    const date = new Date(timestamp * 1000);
    date.setHours(0, 0, 0);
    date.setDate(1);
    const dateTimestamp = date.getTime();
    const containers = this.monthContainers[type] ?? (this.monthContainers[type] = {});
    if(!(dateTimestamp in containers)) {
      const container = document.createElement('div');
      container.className = 'search-super-month';

      const name = document.createElement('div');
      name.classList.add('search-super-month-name');

      const options: Intl.DateTimeFormatOptions = {
        month: 'long'
      };

      if(date.getFullYear() !== new Date().getFullYear()) {
        options.year = 'numeric';
      }

      const dateElement = new I18n.IntlDateElement({
        date,
        options
      }).element;
      name.append(dateElement);

      container.append(name);

      const items = document.createElement('div');
      items.classList.add('search-super-month-items');

      container.append(name, items);

      const haveTimestamps = getObjectKeysAndSort(containers, 'desc');
      let i = 0;
      for(; i < haveTimestamps.length; ++i) {
        const t = haveTimestamps[i];
        if(dateTimestamp > t) {
          break;
        }
      }

      containers[dateTimestamp] = {container, items};
      positionElementByIndex(container, this.tabs[type], i);
    }

    return containers[dateTimestamp];
  }

  public canViewMembers() {
    const {peerId} = this.searchContext;
    const isAnyChat = peerId.isAnyChat();
    if(!isAnyChat || !this.mediaTabsMap.has('members')) return Promise.resolve(false);
    const chatId = peerId.toChatId();
    return Promise.all([
      this.managers.appChatsManager.isBroadcast(chatId),
      this.managers.appChatsManager.hasRights(chatId, 'view_participants'),
      this.managers.appChatsManager.isForum(chatId)
    ]).then(([isBroadcast, hasRights, isForum]) => {
      return !isBroadcast && hasRights && (!this.searchContext.threadId || !isForum);
    });
  }

  public async canViewGroups() {
    const {peerId} = this.searchContext;
    if(!peerId.isUser() || !this.mediaTabsMap.has('groups')) return false;
    const userFull = await this.managers.appProfileManager.getProfile(peerId.toUserId());
    return !!userFull.common_chats_count;
  }

  public cleanup() {
    this.loadPromises = {};
    this.loaded = {};
    this.loadedChats = false;
    this.nextRates = {};
    this.firstLoad = true;
    this.prevTabId = -1;

    this.lazyLoadQueue.clear();

    this.mediaTabs.forEach((mediaTab) => {
      this.usedFromHistory[mediaTab.inputFilter] = -1;
    });

    if(this.selection?.isSelecting) {
      this.selection.cancelSelection();
    }

    // * must go to first tab (это костыль)
    /* const membersTab = this.mediaTabsMap.get('members');
    if(membersTab) {
      const tab = this.canViewMembers() ? membersTab : this.mediaTabs[this.mediaTabs.indexOf(membersTab) + 1];
      this.mediaTab = tab;
    } */

    this.middleware.clean();
    this.loadFirstTimePromise = undefined;
    this.cleanScrollPositions();

    this.membersList = undefined;
    this.membersParticipantMap = undefined;
    this.membersMiddlewareHelper?.destroy();
    this.membersMiddlewareHelper = undefined;
  }

  public cleanScrollPositions() {
    this.mediaTabs.forEach((mediaTab) => {
      mediaTab.scroll = undefined;
    });
  }

  public cleanupHTML(goFirst = false) {
    this.mediaTabs.forEach((tab) => {
      tab.contentTab.replaceChildren();

      if(this.hideEmptyTabs) {
        // tab.menuTab.classList.add('hide');
        this.container.classList.add('hide');
        this.container.parentElement.classList.add('search-empty');
      }

      if(tab.type === 'chats') {
        return;
      }

      if(!this.historyStorage[tab.inputFilter]) {
        const parent = tab.contentTab.parentElement;
        // if(!testScroll) {
        if(!parent.querySelector('.preloader')) {
          putPreloader(parent, true);
        }
        // }

        const empty = parent.querySelector('.content-empty');
        if(empty) {
          empty.remove();
        }
      }
    });

    /* if(goFirst) {
      const membersTab = this.mediaTabsMap.get('members');
      if(membersTab) {
        let idx = this.canViewMembers() ? 0 : 1;
        membersTab.menuTab.classList.toggle('hide', idx !== 0);

        this.selectTab(idx, false);
      } else {
        this.selectTab(0, false);
      }
    } */

    this.monthContainers = {};
    this.searchGroupMedia.clear();
    this.scrollable.scrollTop = 0;

    /* if(testScroll) {
      for(let i = 0; i < 1500; ++i) {
        let div = document.createElement('div');
        div.insertAdjacentHTML('beforeend', `<img class="media-image" src="assets/img/camomile.jpg">`);
        div.classList.add('grid-item');
        div.dataset.id = '' + (i / 3 | 0);
        //div.innerText = '' + (i / 3 | 0);
        this.tabs.inputMessagesFilterPhotoVideo.append(div);
      }
    } */
  }

  private copySearchContext(newInputFilter: MyInputMessagesFilter) {
    const context = copy(this.searchContext);
    context.inputFilter = {_: newInputFilter};
    context.nextRate = this.nextRates[newInputFilter];
    return context;
  }

  public setQuery({peerId, query, threadId, historyStorage, folderId, minDate, maxDate}: {
    peerId: PeerId,
    query?: string,
    threadId?: number,
    historyStorage?: AppSearchSuper['historyStorage'],
    folderId?: number,
    minDate?: number,
    maxDate?: number
  }) {
    this.searchContext = {
      peerId,
      query: query || '',
      inputFilter: {_: this.mediaTab.inputFilter},
      threadId,
      folderId,
      minDate,
      maxDate
    };

    this.historyStorage = historyStorage ?? {};

    this.cleanup();
  }

  public destroy() {
    this.cleanup();
    this.listenerSetter.removeAll();
    this.scrollable.destroy();
    this.swipeHandler?.removeListeners();
    this.selection?.cleanup();

    this.scrollStartCallback = undefined;
    this.onChangeTab = undefined;
    this.selectTab = undefined;
    this.searchContextMenu = undefined;
    this.swipeHandler = undefined;
    this.selection = undefined;
  }
}
