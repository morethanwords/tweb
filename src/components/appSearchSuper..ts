/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppMessagesManager, MyInputMessagesFilter, MyMessage} from '../lib/appManagers/appMessagesManager';
import appDialogsManager, {DIALOG_LIST_ELEMENT_TAG, Some4} from '../lib/appManagers/appDialogsManager';
import {logger} from '../lib/logger';
import rootScope from '../lib/rootScope';
import {SearchGroup, SearchGroupType} from './appSearch';
import {horizontalMenu} from './horizontalMenu';
import LazyLoadQueue from './lazyLoadQueue';
import {putPreloader} from './putPreloader';
import ripple from './ripple';
import Scrollable, {ScrollableX} from './scrollable';
import useHeavyAnimationCheck, {getHeavyAnimationPromise} from '../hooks/useHeavyAnimationCheck';
import I18n, {LangPackKey, i18n, join} from '../lib/langPack';
import findUpClassName from '../helpers/dom/findUpClassName';
import {getMiddleware, Middleware, MiddlewareHelper} from '../helpers/middleware';
import {ChannelParticipant, Chat, ChatFull, ChatParticipant, Document, Message, MessageMedia, MessagesChats, Peer, Photo, StoryItem, Update, User, UserFull, WebPage} from '../layer';
import SortedUserList from './sortedUserList';
import findUpTag from '../helpers/dom/findUpTag';
import appSidebarRight from './sidebarRight';
import mediaSizes from '../helpers/mediaSizes';
import appImManager from '../lib/appManagers/appImManager';
import positionElementByIndex from '../helpers/dom/positionElementByIndex';
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
import findAndSpliceAll from '../helpers/array/findAndSpliceAll';
import deferredPromise from '../helpers/cancellablePromise';
import {createRoot} from 'solid-js';
import StoriesProfileList from './stories/profileList';
import Button from './button';
import anchorCallback from '../helpers/dom/anchorCallback';
import PopupPremium from './popups/premium';
import {ChatType} from './chat/chat';
import getFwdFromName from '../lib/appManagers/utils/messages/getFwdFromName';
import SidebarSlider from './slider';
import setBlankToAnchor from '../lib/richTextProcessor/setBlankToAnchor';
import cancelClickOrNextIfNotClick from '../helpers/dom/cancelClickOrNextIfNotClick';
import createElementFromMarkup from '../helpers/createElementFromMarkup';
import numberThousandSplitter from '../helpers/number/numberThousandSplitter';
import {StarGiftsProfileTab} from './sidebarRight/tabs/stargifts';
import {getFirstChild, resolveFirst} from '@solid-primitives/refs';
import SortedDialogList from './sortedDialogList';

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

export type SearchSuperMediaType = 'stories' | 'members' | 'media' |
  'files' | 'links' | 'music' | 'chats' | 'voice' | 'groups' | 'similar' |
  'savedDialogs' | 'saved' | 'channels' | 'apps' | 'gifts';
export type SearchSuperMediaTab = {
  inputFilter?: SearchSuperType,
  name: LangPackKey,
  type: SearchSuperMediaType,
  contentTab?: HTMLElement,
  menuTab?: HTMLElement,
  menuTabName?: HTMLElement;
  scroll?: {scrollTop: number, scrollHeight: number}
};

type SearchSuperLoadTypeOptions = {
  mediaTab: SearchSuperMediaTab,
  justLoad: boolean,
  loadCount: number,
  middleware: Middleware,
  side: 'top' | 'bottom'
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
  private storyItem: StoryItem.storyItem;
  // private isSavedDialog: boolean;

  constructor(
    private attachTo: HTMLElement,
    private searchSuper: AppSearchSuper,
    private listenerSetter: ListenerSetter,
    private storiesPinned: boolean
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

      const isStory = !!findUpClassName(e.target, 'search-super-content-stories');

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
        this.message = isStory ? undefined : await this.managers.appMessagesManager.getMessageByPeer(this.peerId, this.mid);
        this.storyItem = isStory ? await this.managers.appStoriesManager.getStoryById(this.peerId, this.mid) : undefined;
        this.noForwards = isStory || (searchSuper.selection.isSelecting ?
          this.searchSuper.selection.selectionForwardBtn.classList.contains('hide') :
          !(await this.managers.appMessagesManager.canForward(this.message)));
        this.selectedMessages = !isStory && searchSuper.selection.isSelecting ? await searchSuper.selection.getSelectedMessages() : undefined;
        // this.isSavedDialog = !!(searchSuper.searchContext.peerId === rootScope.myId && searchSuper.searchContext.threadId);

        const f = await Promise.all(this.buttons.map(async(button) => {
          let good: boolean;

          if(this.searchSuper.selection.isSelecting && !button.withSelection) {
            good = false;
          } else {
            good = button.verify ? !!(await button.verify()) : true;
          }

          button.element.classList.toggle('hide', !good);
          return good;
        }));

        if(!f.some((v) => v)) {
          return;
        }

        item.classList.add('menu-open');

        positionMenu(e, this.element);
        contextMenuController.openBtnMenu(this.element, () => {
          item.classList.remove('menu-open');
        });
      };

      r();
    };

    attachContextMenuListener({
      element: attachTo,
      callback: onContextMenu as any,
      listenerSetter
    });
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
      verify: () => !this.storyItem,
      withSelection: true
    }, {
      icon: 'archive',
      text: 'Archive',
      onClick: () => this.onStoryTogglePinClick(false),
      verify: () => this.storyItem && this.storyItem.pFlags.pinned && this.managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unarchive',
      text: 'Unarchive',
      onClick: () => this.onStoryTogglePinClick(true),
      verify: () => this.storyItem && !this.storyItem.pFlags.pinned && this.managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'pin',
      text: 'ChatList.Context.Pin',
      onClick: () => this.onStoryToggleToTopClick(true),
      verify: () => this.storiesPinned && this.storyItem && this.storyItem.pinnedIndex === undefined && this.managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'unpin',
      text: 'ChatList.Context.Unpin',
      onClick: () => this.onStoryToggleToTopClick(false),
      verify: () => this.storiesPinned && this.storyItem && this.storyItem.pinnedIndex !== undefined && this.managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'pin')
    }, {
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: this.onSelectClick,
      verify: () => !this.isSelected && (!this.storyItem || this.storyItem.pFlags.out),
      withSelection: true
    }, {
      icon: 'select',
      text: 'Message.Context.Selection.Clear',
      onClick: this.onClearSelectionClick,
      verify: () => this.isSelected,
      withSelection: true
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => {
        if(this.storyItem) {
          return this.managers.appStoriesManager.hasRights(this.peerId, this.storyItem.id, 'delete');
        }

        return !this.searchSuper.selection.isSelecting && this.managers.appMessagesManager.canDeleteMessage(this.message);
      }
    }, {
      icon: 'delete',
      className: 'danger',
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
      threadId: this.searchSuper.mediaTab.type === 'saved' ? this.searchSuper.searchContext.peerId : this.searchSuper.searchContext.threadId
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
    if(this.storyItem) {
      this.searchSuper.selection.onDeleteStoriesClick([this.storyItem.id]);
    } else if(this.searchSuper.selection.isSelecting) {
      simulateClickEvent(this.searchSuper.selection.selectionDeleteBtn);
    } else {
      PopupElement.createPopup(
        PopupDeleteMessages,
        this.peerId,
        [this.mid],
        ChatType.Chat
      );
    }
  };

  private onStoryTogglePinClick = (pin: boolean) => {
    this.searchSuper.selection.onPinClick([this.storyItem.id], pin);
  };

  private onStoryToggleToTopClick = (pin: boolean) => {
    this.searchSuper.selection.onPinToTopClick([this.storyItem.id], pin);
  };
}

export type ProcessSearchSuperResult = {
  message: Message.message,
  middleware: Middleware,
  promises: Promise<any>[],
  elemsToAppend: {element: HTMLElement, message: any}[],
  inputFilter: MyInputMessagesFilter,
  searchGroup?: SearchGroup,
  mediaTab: SearchSuperMediaTab
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
  public loadMutex: Promise<any>;

  private nextRates: Partial<{[type in SearchSuperMediaType]: number}> = {};
  private loadPromises: Partial<{[type in SearchSuperMediaType]: Promise<void>}> = {};
  private loaded: Partial<{[type in SearchSuperMediaType]: boolean}> = {};
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

  private _loadStories: () => Promise<void>;
  private _loadSavedDialogs: (side: 'top' | 'bottom') => Promise<any>;

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
  public scrollOffset: number;

  public managers: AppManagers;
  private loadFirstTimePromise: Promise<void>;

  private listenerSetter: ListenerSetter;
  private swipeHandler: SwipeHandler;

  public onStoriesLengthChange: (length: number) => void;
  public storiesArchive: boolean;

  public counters: Partial<{[type in SearchSuperMediaType]: number}> = {};
  public onLengthChange: (type: SearchSuperMediaType, length: number) => void;

  public openSavedDialogsInner: boolean;

  public slider: SidebarSlider;

  constructor(options: Pick<
    AppSearchSuper,
    'mediaTabs' |
    'scrollable' |
    'searchGroups' |
    'asChatList' |
    'groupByMonth' |
    'hideEmptyTabs' |
    'onChangeTab' |
    'showSender' |
    'managers'
  > & Partial<Pick<AppSearchSuper, 'storiesArchive' | 'onLengthChange' | 'openSavedDialogsInner' | 'slider'>>) {
    safeAssign(this, options);

    this.slider ??= appSidebarRight;

    this.container = document.createElement('div');
    this.container.classList.add('search-super');

    this.listenerSetter = new ListenerSetter();
    this.searchContextMenu = new SearchContextMenu(this.container, this, this.listenerSetter, !this.storiesArchive);
    this.selection = new SearchSelection(this, this.managers, this.listenerSetter);
    if(this.storiesArchive) {
      this.selection.isStoriesArchive = true;
    }

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
      span.classList.add('menu-horizontal-div-item-span');
      const i = document.createElement('i');

      span.append(mediaTab.menuTabName = i18n(mediaTab.name));
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
      container.classList.add('search-super-tab-container', 'search-super-container-' + mediaTab.type, 'tabs-tab');

      const content = document.createElement('div');
      content.classList.add('search-super-content-container', 'search-super-content-' + mediaTab.type);

      container.append(content);

      this.tabsContainer.append(container);

      const {inputFilter} = mediaTab;
      if(inputFilter) {
        this.tabs[inputFilter] = content;
      }

      mediaTab.contentTab = content;
    }

    this.container.append(navScrollableContainer, this.tabsContainer);

    // * construct end

    this.searchGroupMedia = new SearchGroup(false, 'messages', true);

    // this.scrollable.onScrolledTop = () => {
    //   if(this.mediaTab.contentTab && this.canLoadMediaTab(this.mediaTab)/* && false */) {
    //     // this.log('onScrolledTop will load media');
    //     this.load(true, undefined, 'top');
    //   }
    // };

    this.scrollable.onScrolledBottom = () => {
      if(this.mediaTab.contentTab && this.canLoadMediaTab(this.mediaTab)/* && false */) {
        // this.log('onScrolledBottom will load media');
        this.load(true, undefined, 'bottom');
      }
    };
    // this.scroll.attachSentinels(undefined, 400);

    this.selectTab = horizontalMenu(this.tabsMenu, this.tabsContainer, (id, tabContent, animate) => {
      if(this.prevTabId === id && !this.skipScroll) {
        this.scrollToStart();
        return;
      }

      const newMediaTab = this.mediaTabs[id];
      this.onChangeTab?.(newMediaTab);

      if(this.selection) {
        this.selection.isStories = newMediaTab.type === 'stories';
      }

      const fromMediaTab = this.mediaTab;
      this.mediaTab = newMediaTab;

      if(this.prevTabId !== -1 && animate) {
        this.onTransitionStart();
      }

      if(this.skipScroll) {
        this.skipScroll = false;
      } else {
        const offsetTop = this.container.offsetTop - (this.scrollOffset || 0);
        let scrollTop = this.scrollable.scrollPosition;
        if(scrollTop < offsetTop) {
          this.scrollToStart();
          scrollTop = offsetTop;
        }

        fromMediaTab.scroll = {scrollTop: scrollTop, scrollHeight: this.scrollable.scrollSize};

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
        this.scrollable.scrollPosition = this.mediaTab.scroll.scrollTop;
      }

      if(unlockScroll) {
        unlockScroll();
        unlockScroll = undefined;
      }

      this.onTransitionEnd();
    }, undefined, navScrollable, this.listenerSetter);

    attachClickEvent(this.tabsContainer, (e) => {
      if(this.selection.isSelecting) {
        cancelClickOrNextIfNotClick(e);
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

      const mediaTab = this.mediaTabs.find((mediaTab) => mediaTab.inputFilter === inputFilter);
      const message = await this.managers.appMessagesManager.getMessageByPeer(peerId, mid);
      new AppMediaViewer()
      .setSearchContext(this.copySearchContext(inputFilter, this.nextRates[mediaTab.type]))
      .openMedia({
        message,
        target: targets[idx].element,
        fromRight: 0,
        reverse: false,
        prevTargets: targets.slice(0, idx),
        nextTargets: targets.slice(idx + 1)
      });
    };

    this.tabs.inputMessagesFilterPhotoVideo && attachClickEvent(
      this.tabs.inputMessagesFilterPhotoVideo,
      onMediaClick.bind(null, 'grid-item', 'grid-item', 'inputMessagesFilterPhotoVideo'),
      {listenerSetter: this.listenerSetter}
    );
    this.tabs.inputMessagesFilterDocument && attachClickEvent(
      this.tabs.inputMessagesFilterDocument,
      onMediaClick.bind(null, 'document-with-thumb', 'media-container', 'inputMessagesFilterDocument'),
      {listenerSetter: this.listenerSetter}
    );

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

  private scrollToStart() {
    this.scrollable.scrollIntoViewNew({
      element: this.container,
      position: 'start',
      startCallback: this.scrollStartCallback,
      getElementPosition: this.scrollOffset ? ({elementPosition}) => Math.max(0, elementPosition - this.scrollOffset) : undefined
    });
  }

  private onTransitionStart = () => {
    this.container.classList.add('sliding');
  };

  private onTransitionEnd = () => {
    this.container.classList.remove('sliding');
  };

  public setCounter(type: SearchSuperMediaType, count: number) {
    this.counters[type] = count;
    this.onLengthChange?.(type, count);
  }

  public filterMessagesByType(messages: MyMessage[], type: SearchSuperType): MyMessage[] {
    return filterMessagesByInputFilter({inputFilter: type, messages: messages, limit: messages.length});
  }

  private async processEmptyFilter({message, searchGroup, mediaTab}: ProcessSearchSuperResult) {
    const isSaved = mediaTab.type === 'saved';

    let peerId = message.peerId;
    if(isSaved) {
      peerId = message.fromId;
    }
    peerId = await this.managers.appPeersManager.getPeerMigratedTo(peerId) || peerId;

    const middleware = this.middleware.get();

    const loadPromises: Promise<any>[] = [];
    const dialogElement = appDialogsManager.addDialogNew({
      peerId,
      container: searchGroup?.list || false,
      avatarSize: 'bigger',
      loadPromises,
      wrapOptions: {
        middleware
      },
      withStories: true,
      meAsSaved: !isSaved,
      autonomous: isSaved,
      fromName: !peerId ? getFwdFromName(message.fwd_from) : undefined
    });

    const setLastMessagePromise = appDialogsManager.setLastMessageN({
      dialog: {
        _: 'dialog',
        peerId
      } as any,
      lastMessage: message,
      dialogElement,
      highlightWord: this.searchContext.query,
      noForwardIcon: isSaved
    });

    loadPromises.push(setLastMessagePromise);
    return Promise.all(loadPromises).then(() => {
      if(searchGroup) {
        return;
      }

      return {element: dialogElement.container, message};
    });
  }

  private async processPhotoVideoFilter({message, promises, middleware}: ProcessSearchSuperResult) {
    const media = getMediaFromMessage(message, true);

    const div = document.createElement('div');
    div.classList.add('grid-item');
    // this.log(message, photo);

    let wrapped: Awaited<ReturnType<typeof wrapPhoto>>;
    const size = choosePhotoSize(media, 200, 200);
    if(media._ !== 'photo') {
      wrapped = (await wrapVideo({
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
      searchContext: this.copySearchContext(inputFilter, this.nextRates.files),
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
        pFlags: {},
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
    const a = aFragment.firstElementChild as HTMLAnchorElement;
    const aIsAnchor = a instanceof HTMLAnchorElement;
    if(aIsAnchor) {
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
      noRipple: true,
      asLink: aIsAnchor
    });

    if(aIsAnchor) {
      (row.container as HTMLAnchorElement).href = a.href;
      const onClick = a.getAttribute('onclick');
      onClick && row.container.setAttribute('onclick', onClick);
      if(a.target === '_blank') {
        setBlankToAnchor(row.container as HTMLAnchorElement);
      }
    }

    row.applyMediaElement(previewDiv, 'big');

    if(row.container.innerText.trim().length) {
      return {message, element: row.container};
    }
  }

  public async performSearchResult(messages: (Message.message | Message.messageService)[], mediaTab: SearchSuperMediaTab, append = true) {
    const elemsToAppend: {element: HTMLElement, message: any}[] = [];
    const sharedMediaDiv: HTMLElement = mediaTab.contentTab;
    const promises: Promise<any>[] = [];
    const middleware = this.middleware.get();
    const isSaved = mediaTab.type === 'saved';
    let inputFilter = mediaTab.inputFilter;

    await getHeavyAnimationPromise();

    let searchGroup: SearchGroup;
    if(inputFilter === 'inputMessagesFilterPhotoVideo' && !!this.searchContext.query.trim()) {
      inputFilter = 'inputMessagesFilterEmpty';
      searchGroup = this.searchGroupMedia;
      sharedMediaDiv.append(searchGroup.container);
    } else if(inputFilter === 'inputMessagesFilterEmpty' && !isSaved) {
      searchGroup = this.searchGroups.messages;
    }

    const options: ProcessSearchSuperResult = {
      elemsToAppend,
      inputFilter,
      message: undefined,
      middleware,
      promises,
      searchGroup,
      mediaTab
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
          options.message = message as Message.message;
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

    const length = elemsToAppend.length;
    if(length) {
      const method = append ? 'append' : 'prepend';
      const groupByMonth = this.groupByMonth && !isSaved;
      const threadId = isSaved ? this.searchContext.peerId : undefined;
      elemsToAppend.forEach((details) => {
        const {element, message} = details;
        if(!message) {
          debugger;
        }

        const monthContainer = this.getMonthContainerByTimestamp(groupByMonth ? message.date : 0, inputFilter);
        element.classList.add('search-super-item');
        element.dataset.mid = '' + message.mid;
        element.dataset.peerId = '' + message.peerId;
        threadId && (element.dataset.threadId = '' + threadId);
        monthContainer.items[method](element);

        if(this.selection?.isSelecting) {
          this.selection.toggleElementCheckbox(element, true);
        }
      });

      if(isSaved) {
        let chatlist = sharedMediaDiv.querySelector<HTMLElement>('.chatlist');
        if(!chatlist) {
          chatlist = appDialogsManager.createChatList({new: true});
          const monthContainer = this.getMonthContainerByTimestamp(0, inputFilter).container;
          monthContainer.replaceWith(chatlist);
          chatlist.append(monthContainer);

          appDialogsManager.setListClickListener({
            list: chatlist,
            onFound: () => {
              if(this.selection.isSelecting) {
                return false;
              }
            },
            withContext: undefined,
            autonomous: true,
            openInner: true
          });
        }
      }
    }

    // if(type !== 'inputMessagesFilterEmpty') {
    this.afterPerforming(inputFilter === 'inputMessagesFilterEmpty' ? 1 : length, sharedMediaDiv);
    // }
  }

  private afterPerforming(length: number, contentTab: HTMLElement) {
    if(!contentTab) {
      return;
    }

    const parent = contentTab.parentElement;
    Array.from(parent.children).slice(1).forEach((child) => {
      child.remove();
    });

    // this.contentContainer.classList.add('loaded');

    if(!length && !contentTab.childElementCount) {
      const div = document.createElement('div');
      div.append(i18n('Chat.Search.NothingFound'));
      div.classList.add('position-center', 'text-center', 'content-empty', 'no-select');

      parent.append(div);
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
            autonomous: group.autonomous,
            wrapOptions: {
              middleware
            },
            withStories: true
          });

          return {dom, peerId};
        }).filter(Boolean).forEach(async({dom, peerId}) => {
          const peer = await this.managers.appPeersManager.getPeer(peerId);
          if(peerId === rootScope.myId) {
            dom.lastMessageSpan.append(i18n('Presence.YourChat'));
          } else {
            let username = await this.managers.appPeersManager.getPeerUsername(peerId);
            if(!username) {
              const user = await this.managers.appUsersManager.getUser(peerId);
              if(user?.phone) {
                username = '+' + formatPhoneNumber(user.phone).formatted;
              }
            } else {
              username = '@' + username;
            }

            // if(query) {
            //   const regExp = new RegExp(`(${escapeRegExp(query)}|${escapeRegExp(cleanSearchText(query))})`, 'gi');
            //   dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');
            // }

            const toJoin: (Node | string)[] = [
              username
            ];

            if(/* showMembersCount &&  */((peer as Chat.channel).participants_count || (peer as any).participants)) {
              toJoin.push(await getChatMembersString(peerId.toChatId()));
            }

            dom.lastMessageSpan.append(...join(toJoin.filter(Boolean), false));
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
              autonomous: true,
              wrapOptions: {
                middleware
              },
              withStories: true
            });

            dom.lastMessageSpan.append(await (peerId.isUser() ?
              Promise.resolve(getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId()))) :
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

          peers = peers.slice(0, 15);
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
              noIcons: this.searchGroups.people.noIcons,
              wrapOptions: {
                middleware
              },
              withStories: true
            });

            dom.subtitleEl.remove();
          });

          this.searchGroups.people.toggle();
        }),

        renderRecentSearch()
      ]);
    } else return Promise.resolve();
  }

  private async loadMembers({mediaTab}: SearchSuperLoadTypeOptions) {
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
          managers: this.managers,
          middleware
        });
        attachClickEvent(membersList.list, (e) => {
          if(findUpClassName(e.target, 'has-stories')) {
            return;
          }

          const li = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
          if(!li) {
            return;
          }

          const peerId = li.dataset.peerId.toPeerId();
          let promise: Promise<any> = Promise.resolve();
          if(this.slider === appSidebarRight && mediaSizes.isMobile) {
            promise = (this.slider as typeof appSidebarRight).toggleSidebar(false);
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
            slider: this.slider,
            middleware
          });

          const onParticipantUpdate = (update: Update.updateChannelParticipant) => {
            const peerId = getParticipantPeerId(update.prev_participant || update.new_participant);
            const wasRendered = membersList.has(peerId);
            if(wasRendered || (update.new_participant as ChannelParticipant.channelParticipantBanned).pFlags?.left) {
              membersList.ranks.delete(peerId);
              membersList.delete(peerId);
              membersParticipantMap.delete(peerId);
              this.setCounter(mediaTab.type, this.counters[mediaTab.type] - 1);
            }

            if((!update.prev_participant || wasRendered) && update.new_participant) {
              renderParticipants([update.new_participant]);
              this.setCounter(mediaTab.type, this.counters[mediaTab.type] + 1);
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
      promise = this.managers.appUsersManager.getCommonChats(userId, LOAD_COUNT, this.nextRates[mediaTab.type]).then((messagesChats) => {
        if(!middleware()) {
          return;
        }

        const count = (messagesChats as MessagesChats.messagesChatsSlice).count ?? messagesChats.chats.length;
        if(!this.counters[mediaTab.type]) {
          this.setCounter(mediaTab.type, count);
        }

        // const list = mediaTab.contentTab.firstElementChild as HTMLUListElement;
        const lastChat = messagesChats.chats[messagesChats.chats.length - 1];
        this.nextRates[mediaTab.type] = lastChat?.id as number;

        if(messagesChats.chats.length < LOAD_COUNT) {
          this.loaded[mediaTab.type] = true;
        }

        return renderParticipants(messagesChats.chats);
      });
    } else if(await this.managers.appChatsManager.isChannel(chatId)) {
      const LOAD_COUNT = !this.membersList ? 50 : 200;
      promise = this.managers.appProfileManager.getChannelParticipants({
        id: chatId,
        limit: LOAD_COUNT,
        offset: this.nextRates[mediaTab.type]
      }).then((participants) => {
        if(!middleware()) {
          return;
        }

        const list = mediaTab.contentTab.firstElementChild as HTMLUListElement;
        this.nextRates[mediaTab.type] = (list ? list.childElementCount : 0) + participants.participants.length;

        if(participants.participants.length < LOAD_COUNT) {
          this.loaded[mediaTab.type] = true;
        }

        this.setCounter(mediaTab.type, participants.count);

        return renderParticipants(participants.participants);
      });
    } else {
      promise = this.managers.appProfileManager.getChatFull(chatId).then((chatFull) => {
        if(!middleware()) {
          return;
        }

        // console.log('anymore', chatFull);
        this.loaded[mediaTab.type] = true;
        const participants = (chatFull as ChatFull.chatFull).participants;
        if(participants._ === 'chatParticipantsForbidden') {
          return;
        }

        this.setCounter(mediaTab.type, participants.participants.length);

        return renderParticipants(participants.participants);
      });
    }

    return promise;
  }

  private async loadStories({mediaTab}: SearchSuperLoadTypeOptions) {
    if(this._loadStories) {
      return this._loadStories();
    }

    const middleware = this.middleware.get();
    const promise = deferredPromise<void>();
    createRoot((dispose) => {
      middleware.onClean(() => {
        this._loadStories = undefined;
        dispose();
        promise.reject();
      });

      const storiesList = StoriesProfileList({
        peerId: this.searchContext.peerId,
        pinned: !this.storiesArchive,
        archive: this.storiesArchive,
        onReady: () => {
          promise.resolve();

          const res = (storiesList as any)();
          mediaTab.contentTab.append(typeof(res) === 'function' ? res() : res);
          this.afterPerforming(1, mediaTab.contentTab);
        },
        onLoadCallback: (callback) => {
          this._loadStories = async() => {
            const promise = callback();
            const loaded = await promise;
            if(!middleware()) {
              return;
            }

            if(loaded) {
              this.loaded[mediaTab.type] = true;
            }
          };
        },
        onLengthChange: (length) => {
          this.onStoriesLengthChange?.(length);
          this.setCounter(mediaTab.type, length);
        },
        selection: this.selection
      });

      this._loadStories();
    });
    return promise;
  }

  private async loadSimilarChannels({mediaTab}: SearchSuperLoadTypeOptions) {
    const middlewareHelper = this.middleware.get().create();

    const renderChats = async(chats: Chat[], middleware: Middleware) => {
      const chatlist = appDialogsManager.createChatList({new: true});

      const promises = chats.map(async(chat) => {
        const loadPromises: Promise<any>[] = [];
        const {dom} = appDialogsManager.addDialogNew({
          peerId: chat.id.toPeerId(true),
          container: chatlist,
          avatarSize: 'abitbigger',
          autonomous: false,
          wrapOptions: {
            middleware
          },
          loadPromises
        });

        dom.lastMessageSpan.append(await getChatMembersString(chat.id, this.managers, chat));

        return Promise.all(loadPromises);
      });

      await Promise.all(promises);
      return chatlist;
    };

    const createPaywall = (limit: number) => {
      const wall = document.createElement('div');
      wall.classList.add('similar-channels-paywall');
      const btn = Button('btn-primary btn-color-primary', {icon: 'premium_unlock', text: 'UnlockSimilar'});
      btn.classList.add('similar-channels-paywall-button');
      const onClick = () => PopupPremium.show();
      const anchor = anchorCallback(onClick);
      attachClickEvent(btn, onClick);
      anchor.classList.add('primary');
      const subtitle = i18n('SimilarChannels.Unlock', [anchor, limit]);
      subtitle.classList.add('similar-channels-paywall-subtitle');
      wall.append(btn, subtitle);
      return wall;
    };

    let paywall: HTMLElement, wasPremium: boolean;
    const onPremium = async(isPremium: boolean) => {
      if(wasPremium === isPremium) {
        return;
      }

      middlewareHelper.clean();
      const middleware = middlewareHelper.get();

      const [messagesChats, premiumLimit, isPremiumFeaturesHidden] = await Promise.all([
        this.managers.appChatsManager.getChannelRecommendations(this.searchContext.peerId.toChatId()),
        this.managers.apiManager.getLimit('recommendedChannels', true),
        apiManagerProxy.isPremiumFeaturesHidden()
      ]);

      const chatlist = await renderChats(messagesChats.chats, middleware);
      if(!middleware()) {
        return;
      }

      mediaTab.contentTab.replaceChildren(chatlist);
      this.afterPerforming(1, mediaTab.contentTab);
      this.loaded[mediaTab.type] = true;

      const count = (messagesChats as MessagesChats.messagesChatsSlice).count ?? messagesChats.chats.length;
      this.setCounter(mediaTab.type, count);

      if(!isPremium && !isPremiumFeaturesHidden) {
        paywall ||= createPaywall(premiumLimit);
        mediaTab.contentTab.append(paywall);
      }
    };

    rootScope.addEventListener('premium_toggle', onPremium);
    this.middleware.get().onClean(() => {
      rootScope.removeEventListener('premium_toggle', onPremium);
    });

    return onPremium(rootScope.premium);
  }

  private async loadSavedDialogs({mediaTab, middleware, side}: SearchSuperLoadTypeOptions) {
    if(this._loadSavedDialogs) {
      return this._loadSavedDialogs(side);
    }

    const xd = new Some4();
    xd.scrollable = this.scrollable;
    xd.sortedList = new SortedDialogList({
      appDialogsManager,
      managers: this.managers,
      log: this.log,
      requestItemForIdx: xd.requestItemForIdx,
      onListShrinked: xd.onListShrinked,
      itemSize: 72,
      scrollable: this.scrollable,
      indexKey: 'index_0',
      virtualFilterId: rootScope.myId
    });

    const list = xd.sortedList.list;

    appDialogsManager.setListClickListener({
      list,
      withContext: true,
      openInner: this.openSavedDialogsInner
    });

    const getCount = async() => {
      const result = await this.managers.dialogsStorage.getDialogs({filterId: rootScope.myId});
      return result.count;
    };

    const onAnyUpdate = xd.onAnyUpdate = async() => {
      if(!middleware()) return;
      const count = await getCount();
      this.setCounter(mediaTab.type, count);
    };

    onAnyUpdate();

    mediaTab.contentTab.append(list);
    this.afterPerforming(1, mediaTab.contentTab);

    this._loadSavedDialogs = () => Promise.resolve(xd.onChatsScroll());
    middleware.onClean(() => {
      xd.destroy();
      this._loadSavedDialogs = undefined;
    });

    return xd.onChatsScroll();
  }


  private appendShowMoreButton(group: SearchGroup, toggleClassName = 'is-short-5') {
    let shouldShowMore = false;

    const showMoreButton: HTMLDivElement = createElementFromMarkup(`
      <div class="search-group__show-more"></div>
    `);
    group.nameEl.append(showMoreButton);

    updateShowMoreContent();

    attachClickEvent(showMoreButton, () => {
      shouldShowMore = !shouldShowMore;
      updateShowMoreContent();
    });
    function updateShowMoreContent() {
      showMoreButton.replaceChildren(i18n(shouldShowMore ? 'Separator.ShowLess' : 'Separator.ShowMore'));
      group.container.classList.toggle(toggleClassName, !shouldShowMore);
    }
  }

  private async renderPeerDialogs(peerIds: PeerId[], group: SearchGroup, middleware: Middleware, type?: 'bots' | 'channels') {
    if(!middleware()) return;

    for(const peerId of peerIds) {
      const {dom} = appDialogsManager.addDialogNew({
        peerId,
        container: group.list,
        avatarSize: 'abitbigger',
        wrapOptions: {
          middleware
        }
      });

      const peer = await this.managers.appPeersManager.getPeer(peerId);
      const username = await this.managers.appPeersManager.getPeerUsername(peerId);

      if('participants_count' in peer) {
        dom.lastMessageSpan.append(await getChatMembersString(peerId.toChatId()));
      } else if('bot_active_users' in peer) {
        dom.lastMessageSpan.append(i18n('BotUsers', [numberThousandSplitter(peer.bot_active_users)]));
      } else if(username) {
        dom.lastMessageSpan.append('@' + username);
      } else if(type === 'bots') {
        dom.lastMessageSpan.append(i18n('UnknownBotUsers'));
      }
    };
  }

  private async loadChannels({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    if(this.searchContext.query) {
      const group = new SearchGroup('Channels', 'channels');
      group.setActive();
      group.nameEl.style.display = 'none';

      const SEARCH_LIMIT = 200; // will get filtered anyway
      const {results: globalResults} = await this.managers.appUsersManager.searchContacts(this.searchContext.query, SEARCH_LIMIT);
      const filteredResultsWithUndefined = await Promise.all(
        globalResults.map(async(user) => await this.managers.appPeersManager.isBroadcast(user) ? user : undefined)
      );
      const filteredResults = filteredResultsWithUndefined.filter(Boolean);

      this.renderPeerDialogs(filteredResults.map((user) => user.toPeerId(true)), group, middleware);

      if(filteredResults.length) {
        mediaTab.contentTab.append(group.container);
      }
      this.afterPerforming(filteredResults.length, mediaTab.contentTab);

      this.loaded[mediaTab.type] = true;
      return;
    }

    const dialogs = await this.managers.dialogsStorage.getCachedDialogs();
    const channelDialogsWithUndefined = await Promise.all(dialogs.map(async(dialog) => await this.managers.appPeersManager.isBroadcast(dialog.peerId) ? dialog : undefined));
    const channelDialogs = channelDialogsWithUndefined.filter(Boolean);

    if(channelDialogs.length) {
      const group = new SearchGroup('Chat.Search.JoinedChannels', 'channels');
      group.setActive();
      mediaTab.contentTab.append(group.container);

      const SHOW_MORE_LIMIT = 5;
      if(channelDialogs.length > SHOW_MORE_LIMIT) this.appendShowMoreButton(group);

      this.renderPeerDialogs(channelDialogs.map((dialog) => dialog.peerId), group, middleware);
    }

    const recommendations = await this.managers.appChatsManager.getGenericChannelRecommendations();

    if(recommendations.chats.length) {
      const group = new SearchGroup('SimilarChannels', 'channels');
      group.setActive();
      mediaTab.contentTab.append(group.container);

      this.renderPeerDialogs(recommendations.chats.map((chat) => chat.id.toPeerId(true)), group, middleware);
    }

    this.afterPerforming(1, mediaTab.contentTab);
    this.loaded[mediaTab.type] = true;
  }

  private async loadApps({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    if(this.searchContext.query) {
      const group = new SearchGroup('ChatList.Filter.Bots', 'apps');
      group.setActive();

      const SEARCH_LIMIT = 200; // will get filtered anyway
      const {results: globalResults} = await this.managers.appUsersManager.searchContacts(this.searchContext.query, SEARCH_LIMIT);
      const filteredResultsWithUndefined = await Promise.all(
        globalResults.map(async(user) => await this.managers.appPeersManager.isBot(user) ? user : undefined)
      );
      const filteredResults = filteredResultsWithUndefined.filter(Boolean);

      this.renderPeerDialogs(filteredResults.map((user) => user.toPeerId(false)), group, middleware, 'bots');

      if(filteredResults.length) {
        mediaTab.contentTab.append(group.container);
      }
      this.afterPerforming(filteredResults.length, mediaTab.contentTab);

      this.loaded[mediaTab.type] = true;
      return;
    }

    const myTopApps = await rootScope.managers.appUsersManager.getTopPeers('bots_app');

    if(myTopApps.length) {
      const group = new SearchGroup('MiniApps.Apps', 'apps');
      group.setActive();
      mediaTab.contentTab.append(group.container);

      const SHOW_MORE_LIMIT = 5;
      if(myTopApps.length > SHOW_MORE_LIMIT)  this.appendShowMoreButton(group);

      this.renderPeerDialogs(myTopApps.map((app) => app.id.toPeerId(false)), group, middleware, 'bots');
    }

    const group = new SearchGroup('MiniApps.Popular', 'apps');
    group.setActive();
    mediaTab.contentTab.append(group.container);

    type GetPopularAppsResult = ReturnType<typeof rootScope.managers.appAttachMenuBotsManager.getPopularAppBots>;
    let currentOffset: string | null = '', loadPromise: GetPopularAppsResult;
    const APPS_LIMIT_PER_LOAD = 20;

    const loadMoreApps = async() => {
      if(loadPromise || !middleware() || currentOffset === null) return;

      loadPromise = rootScope.managers.appAttachMenuBotsManager.getPopularAppBots(currentOffset, APPS_LIMIT_PER_LOAD);
      const {nextOffset, userIds} = await loadPromise;

      await this.renderPeerDialogs(userIds.map((id) => id.toPeerId(false)), group, middleware, 'bots');

      currentOffset = nextOffset || null;
      loadPromise = undefined;
    }

    const scrollTarget = this.scrollable.container;

    scrollTarget.addEventListener('scroll', () => {
      const offset = 120;
      if(this.mediaTab !== mediaTab) return; // There is one scrollable for all tabs
      if(scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - offset) {
        loadMoreApps();
      }
    });

    await loadMoreApps();

    this.afterPerforming(1, mediaTab.contentTab);
    this.loaded[mediaTab.type] = true;
  }

  private _loadedGifts: true
  private async loadGifts({mediaTab}: SearchSuperLoadTypeOptions) {
    if(!this._loadedGifts) {
      const middleware = this.middleware.get();
      createRoot((dispose) => {
        middleware.onClean(() => dispose());

        const scrollTarget = this.scrollable.container;

        const {render: giftsList, loadNext} = StarGiftsProfileTab({
          peerId: this.searchContext.peerId,
          scrollParent: scrollTarget,
          onCountChange: (count) => {
            this.setCounter('gifts', count);
          }
        });

        scrollTarget.addEventListener('scroll', () => {
          const offset = 400;
          if(this.mediaTab !== mediaTab) return; // There is one scrollable for all tabs
          if(scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - offset) {
            loadNext();
          }
        });

        mediaTab.contentTab.append(getFirstChild(giftsList, v => v instanceof Element) as Element);
      });
      this._loadedGifts = true;
    }

    return Promise.resolve();
  }

  private loadType(options: SearchSuperLoadTypeOptions) {
    const {
      mediaTab,
      justLoad,
      loadCount,
      middleware,
      side
    } = options;
    const {type, inputFilter} = mediaTab;


    let promise = this.loadPromises[type];
    if(promise) {
      return promise;
    }

    if(type === 'members' || type === 'groups') {
      promise = this.loadMembers(options);
    } else if(type === 'stories') {
      promise = this.loadStories(options);
    } else if(type === 'similar') {
      promise = this.loadSimilarChannels(options);
    } else if(type === 'savedDialogs') {
      promise = this.loadSavedDialogs(options);
    } else if(type === 'channels') {
      promise = this.loadChannels(options);
    } else if(type === 'apps') {
      promise = this.loadApps(options);
    } else if(type === 'gifts') {
      promise = this.loadGifts(options);
    }

    if(promise) {
      return this.loadPromises[type] = promise.finally(() => {
        if(!middleware()) {
          return;
        }

        this.loadPromises[type] = null;
      });
    }

    const history = this.historyStorage[inputFilter] ??= [];

    if(inputFilter === 'inputMessagesFilterEmpty' && !history.length && type !== 'saved') {
      if(!this.loadedChats) {
        this.loadChats();
        this.loadedChats = true;
      }

      if(!this.searchContext.query.trim() && !this.searchContext.peerId && !this.searchContext.minDate) {
        this.loaded[type] = true;
        return Promise.resolve();
      }
    }

    promise = this.loadPromises[type] = Promise.resolve().then(async() => {
      // render from cache
      if(history.length && this.usedFromHistory[inputFilter] < history.length && !justLoad) {
        const messages: any[] = [];
        let used = Math.max(0, this.usedFromHistory[inputFilter]);
        let slicedLength = 0;

        do {
          const ids = history.slice(used, used + loadCount);
          used += ids.length;
          slicedLength += ids.length;

          const notFilteredMessages = ids.map((m) => apiManagerProxy.getMessageByPeer(m.peerId, m.mid));
          // const notFilteredMessages = await Promise.all(promises);

          messages.push(...this.filterMessagesByType(notFilteredMessages, inputFilter));
        } while(slicedLength < loadCount && used < history.length);

        // если перебор
        /* if(slicedLength > loadCount) {
          let diff = messages.length - loadCount;
          messages = messages.slice(0, messages.length - diff);
          used -= diff;
        } */

        this.usedFromHistory[inputFilter] = used;
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

      const options: Parameters<AppMessagesManager['getHistory']>[0] = {
        ...this.searchContext,
        inputFilter: {_: inputFilter},
        offsetId,
        offsetPeerId,
        limit: loadCount,
        nextRate: this.nextRates[type] ??= 0,
        ...(type === 'saved' ? {inputFilter: undefined, peerId: rootScope.myId, threadId: this.searchContext.peerId} : {})
      };
      const value = await this.managers.appMessagesManager.getHistory(options);

      let messages = value.messages;
      if(!messages && value.history/*  && mediaTab.type === 'saved' */) {
        messages = value.history.map((mid) => apiManagerProxy.getMessageByPeer(options.peerId, mid));
      }

      history.push(...messages.map((m) => ({mid: m.mid, peerId: m.peerId})));

      if(!this.counters[type]) {
        this.setCounter(type, value.count);
      }

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

      this.usedFromHistory[inputFilter] = history.length;

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
      return this.performSearchResult(this.filterMessagesByType(messages, inputFilter), mediaTab);
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
    return !this.loaded[mediaTab.type] || (this.historyStorage[inputFilter] && this.usedFromHistory[inputFilter] < this.historyStorage[inputFilter].length);
  }

  private async loadFirstTime() {
    const middleware = this.middleware.get();
    const {peerId, threadId} = this.searchContext;
    if(!this.hideEmptyTabs) {
      return;
    }

    const mediaTabs = this.mediaTabs.filter((mediaTab) => mediaTab.inputFilter && mediaTab.inputFilter !== 'inputMessagesFilterEmpty');
    const filters = mediaTabs.map((mediaTab) => ({_: mediaTab.inputFilter}));

    const [
      counters,
      canViewSavedDialogs,
      canViewSaved,
      canViewMembers,
      canViewGroups,
      canViewStories,
      canViewSimilar,
      giftsCount
    ] = await Promise.all([
      this.managers.appMessagesManager.getSearchCounters(peerId, filters, undefined, threadId),
      this.canViewSavedDialogs(),
      this.canViewSaved(),
      this.canViewMembers(),
      this.canViewGroups(),
      this.canViewStories(),
      this.canViewSimilar(),
      this.getGiftsCount()
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

      this.setCounter(mediaTab.type, counter.count);

      if(counter.count) {
        if(firstMediaTab === undefined) {
          firstMediaTab = mediaTab;
        }

        ++count;
      }
    });

    const savedDialogsTab = this.mediaTabsMap.get('savedDialogs');
    const savedTab = this.mediaTabsMap.get('saved');
    const membersTab = this.mediaTabsMap.get('members');
    const storiesTab = this.mediaTabsMap.get('stories');
    const groupsTab = this.mediaTabsMap.get('groups');
    const similarTab = this.mediaTabsMap.get('similar');
    const giftsTab = this.mediaTabsMap.get('gifts');

    const a: [SearchSuperMediaTab, boolean][] = [
      [savedDialogsTab, canViewSavedDialogs],
      [savedTab, canViewSaved],
      [storiesTab, canViewStories],
      [membersTab, canViewMembers],
      [groupsTab, canViewGroups],
      [similarTab, canViewSimilar],
      [giftsTab, giftsCount !== 0]
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

    this.setCounter('gifts', giftsCount);

    if(canViewStories) {
      firstMediaTab = storiesTab;

      const newTitle = i18n(peerId.isUser() ? 'Stories' : 'ProfileStories');
      storiesTab.menuTabName.replaceWith(storiesTab.menuTabName = newTitle);
    }

    if(canViewMembers) {
      firstMediaTab = membersTab;
    }

    if(canViewSavedDialogs) {
      firstMediaTab = savedDialogsTab;
    }

    this.container.classList.toggle('hide', !firstMediaTab);
    this.container.parentElement.classList.toggle('search-empty', !firstMediaTab);
    if(firstMediaTab) {
      this.skipScroll = true;
      this.selectTab(this.mediaTabs.indexOf(firstMediaTab), false);
      // firstMediaTab.menuTab.classList.add('active');

      this.navScrollableContainer.classList.toggle('is-single', count <= 1);
    }
  }

  public async load(single = false, justLoad = false, side: 'top' | 'bottom' = 'bottom') {
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
      findAndSpliceAll(toLoad, (mediaTab) => mediaTab.type === 'groups');
    }

    if(!toLoad.length) {
      return;
    }

    const loadCount = justLoad ? 50 : Math.round((windowSize.height / 130 | 0) * 3 * 1.25); // that's good for all types

    const promises: Promise<any>[] = toLoad.map((mediaTab) => {
      return this.loadType({
        mediaTab,
        justLoad,
        loadCount,
        middleware,
        side
      });
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

  public async canViewSavedDialogs() {
    if(this.searchContext.peerId !== rootScope.myId || this.searchContext.threadId || !this.mediaTabsMap.has('savedDialogs')) {
      return false;
    }

    try {
      await this.managers.dialogsStorage.getDialogs({
        filterId: rootScope.myId
      });

      return true;
    } catch(err) {
      return false;
    }
  }

  public canViewSaved() {
    const {peerId, threadId} = this.searchContext;
    if(threadId || rootScope.myId === peerId) {
      return false;
    }

    return this.managers.appMessagesManager.getHistory({
      peerId: rootScope.myId,
      threadId: this.searchContext.peerId,
      limit: 50
    }).then((historyResult) => {
      return !!historyResult.count;
    }).catch(() => {
      return false;
    });
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

  public async canViewStories() {
    const {peerId, threadId} = this.searchContext;
    if(!this.mediaTabsMap.has('stories') || threadId/*  || !this.onStoriesLengthChange */) {
      return false;
    }

    if(peerId === rootScope.myId && !this.onStoriesLengthChange) {
      return false;
    }

    if(peerId.isUser()) {
      const promise = this.storiesArchive ?
        this.managers.appStoriesManager.getStoriesArchive(peerId, 1) :
        this.managers.appStoriesManager.getPinnedStories(peerId, 1);
      return promise.then(({count}) => !!count).catch(() => false);
    }

    const chatFull = await this.managers.appProfileManager.getChatFull(peerId.toChatId());
    return !!(chatFull as ChatFull.channelFull).pFlags.stories_pinned_available;
  }

  public async canViewSimilar() {
    const {peerId} = this.searchContext;
    if(peerId.isUser()) {
      return false;
    }

    try {
      const messagesChats = await this.managers.appChatsManager.getChannelRecommendations(peerId.toChatId());
      return !!messagesChats.chats.length;
    } catch(err) {
      return false;
    }
  }

  public async getGiftsCount() {
    const {peerId} = this.searchContext
    const full =
      peerId.isUser() ?
        await this.managers.appProfileManager.getProfile(peerId.toUserId()) :
        await this.managers.appProfileManager.getChannelFull(peerId.toChatId());

    return full.stargifts_count ?? 0;
  }

  public cleanup() {
    this.loadPromises = {};
    this.loaded = {};
    this.loadedChats = false;
    this.nextRates = {};
    this.firstLoad = true;
    this.prevTabId = -1;
    this.counters = {};

    this.lazyLoadQueue.clear();

    this.mediaTabs.forEach((mediaTab) => {
      const {inputFilter} = mediaTab;
      if(!inputFilter) {
        return;
      }

      this.usedFromHistory[inputFilter] = -1;
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

      if(tab.inputFilter && !this.historyStorage[tab.inputFilter]) {
        const parent = tab.contentTab.parentElement;
        // if(!testScroll) {
        if(!parent.querySelector('.preloader')) {
          putPreloader(parent, true);
        }
        // }

        const empty = parent.querySelector('.content-empty');
        empty?.remove();
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
    this.scrollable.scrollPosition = 0;

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

  private copySearchContext(newInputFilter: MyInputMessagesFilter, nextRate: number) {
    const context = copy(this.searchContext);
    context.inputFilter = {_: newInputFilter};
    context.nextRate = nextRate;
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

    this.scrollStartCallback =
      this.onChangeTab =
      this.selectTab =
      this.searchContextMenu =
      this.swipeHandler =
      this.selection =
      undefined;
  }
}
