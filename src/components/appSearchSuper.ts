import type {AppMessagesManager, MyInputMessagesFilter, MyMessage, RequestHistoryOptions} from '@appManagers/appMessagesManager';
import {getOverlayRoot} from '@helpers/appWindow';
import {DIALOG_LIST_ELEMENT_TAG, DialogDom} from '@components/dialogElement';
import {logger} from '@lib/logger';
import rootScope from '@lib/rootScope';
import {commitSearchGroups, createSearchGroup, destroySearchRows, getSearchTransitionDuration, SearchGroup, SearchGroupType} from '@components/searchGroup';
import {horizontalMenu} from '@components/horizontalMenu';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {putPreloader} from '@components/putPreloader';
import noop from '@helpers/noop';
import {reapplyTextHighlights} from '@helpers/dom/textHighlight';
import Scrollable from '@components/scrollable';
import {ScrollableContextValue} from '@components/scrollable2';
import useHeavyAnimationCheck, {getHeavyAnimationPromise} from '@hooks/useHeavyAnimationCheck';
import I18n, {LangPackKey, i18n, join} from '@lib/langPack';
import findUpClassName from '@helpers/dom/findUpClassName';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import cancelEvent from '@helpers/dom/cancelEvent';
import {getMiddleware, Middleware, MiddlewareHelper} from '@helpers/middleware';
import {BotMenuButton, BotPreviewMedia, ChannelParticipant, Chat, ChatFull, ChatParticipant, ChatParticipants, Document, Message, MessageMedia, MessagesChats, MessagesFilter, Peer, Photo, StoryItem, Update, User, UserFull, UsersUsers, WebPage} from '@layer';
import SortedUserList, {SortedUserListRank} from '@components/sortedUserList';
import findUpTag from '@helpers/dom/findUpTag';
import mediaSizes from '@helpers/mediaSizes';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import handleTabSwipe from '@helpers/dom/handleTabSwipe';
import windowSize from '@helpers/windowSize';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import {ButtonMenuItemOptions, ButtonMenuSync} from '@components/buttonMenu';
import showDeleteMessagesPopup from '@components/popups/deleteMessages';
import {renderSearchWebPageRow} from '@components/searchWebPageRow';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import {SearchSelection} from '@components/chat/selection';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import {makeGridMediaAccessible} from '@helpers/dom/mediaPreviewAccessibility';
import {MyDocument} from '@appManagers/appDocsManager';
import lockTouchScroll from '@helpers/dom/lockTouchScroll';
import copy from '@helpers/object/copy';
import safeAssign from '@helpers/object/safeAssign';
import ScrollableRefiller from '@helpers/scrollableRefiller';
import findAndSplice from '@helpers/array/findAndSplice';
import {ScrollStartCallbackDimensions} from '@helpers/fastSmoothScroll';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {ReadingManagers} from '@lib/managers';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import wrapWebPageDescription from '@components/wrappers/webPageDescription';
import wrapWebPageTitle from '@components/wrappers/webPageTitle';
import wrapAbbreviation from '@richTextProcessor/wrapAbbreviation';
import matchUrl from '@richTextProcessor/matchUrl';
import wrapPlainText from '@richTextProcessor/wrapPlainText';
import wrapRichText from '@richTextProcessor/wrapRichText';
import wrapSenderToPeer from '@components/wrappers/senderToPeer';
import wrapSentTime from '@components/wrappers/sentTime';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import filterMessagesByInputFilter from '@appManagers/utils/messages/filterMessagesByInputFilter';
import getChatMembersString from '@components/wrappers/getChatMembersString';
import getUserStatusString from '@components/wrappers/getUserStatusString';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {attachContextMenuListener} from '@helpers/dom/attachContextMenuListener';
import contextMenuController from '@helpers/contextMenuController';
import positionMenu from '@helpers/positionMenu';
import apiManagerProxy from '@lib/apiManagerProxy';
import ListenerSetter from '@helpers/listenerSetter';
import SwipeHandler from '@components/swipeHandler';
import wrapDocument from '@components/wrappers/document';
import wrapPhoto from '@components/wrappers/photo';
import wrapVideo from '@components/wrappers/video';
import attachMediaPeekListeners, {getMessageMediaPeekSource} from '@components/mediaPeek';
import wrapMediaSpoiler, {hasMediaSpoiler, hasSensitiveSpoiler, onMediaSpoilerClick} from '@components/wrappers/mediaSpoiler';
import filterAsync from '@helpers/array/filterAsync';
import ChatContextMenu, {getSponsoredMessageButtons} from '@components/chat/contextMenu';
import getParticipantRank from '@appManagers/utils/chats/getParticipantRank';
import {canEditMemberTag, getMemberTagRole} from '@appManagers/utils/chats/memberTag';
import hasRights from '@appManagers/utils/chats/hasRights';
import openEditMemberTag from '@components/memberTag/openEditMemberTag';
import {FOLDER_ID_ARCHIVE, NULL_PEER_ID} from '@appManagers/constants';
import createParticipantContextMenu from '@helpers/dom/createParticipantContextMenu';
import findAndSpliceAll from '@helpers/array/findAndSpliceAll';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {children, createEffect, createRoot, For, on} from 'solid-js';
import {StoriesProfileList, isStoryReorderTarget} from '@components/stories/profileList';
import {StoriesContextActions} from '@components/stories/store';
import Button from '@components/button';
import anchorCallback from '@helpers/dom/anchorCallback';
import {ChatType} from './chat/chatType';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import SidebarSlider from '@components/slider';
import cancelClickOrNextIfNotClick from '@helpers/dom/cancelClickOrNextIfNotClick';
import createElementFromMarkup from '@helpers/createElementFromMarkup';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {ALL_COLLECTIONS_ID, StarGiftsProfileActions, StarGiftsProfileStore} from '@components/stargifts/profileStore';
import {getFirstChild} from '@solid-primitives/refs';
import SortedDialogList from '@components/sortedDialogList';
import Icon from '@components/icon';
import {showAdReport} from '@components/popups/reportAd';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {isSensitive} from '@helpers/restrictions';
import {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import {MediaSearchContext} from '@components/appMediaPlaybackController';
import {StarGiftsProfileTab} from '@components/stargifts/profileList';
import {MyStarGift} from '@appManagers/appGiftsManager';
import wrapSticker from '@components/wrappers/sticker';
import {unwrap} from 'solid-js/store';
import {usePeer} from '@stores/peers';
import {useAppState} from '@stores/appState';
import {AutonomousSavedDialogList} from '@components/autonomousDialogList/savedDialogs';
import liteMode from '@helpers/liteMode';
import {wrapGlobalPostsSearch} from './sidebarLeft/globalPostsSearch';
import createMiddleware from '@helpers/solid/createMiddleware';
import Tabs from '@components/tabs';
import Section from '@components/section';
import copyMessageMediaWithFeedback from '@components/copyMessageMediaWithFeedback';
import createTopPeersList from '@components/topPeersList';
import {fastRaf} from '@helpers/schedulers';
import pause from '@helpers/schedulers/pause';
import flatten from '@helpers/array/flatten';
import {CROSS_FADE_KEYFRAMES, getAnimatedOptions} from '@helpers/dom/crossfadeContent';
import {SearchSuperMediaInputFilter} from '@components/sharedMediaFilters';
import {getMediaTypeForProfileTab, orderMediaTabsByMain, ProfileTabMediaType} from '@components/sharedMediaProfileTab';
import {supportsSharedMediaScrollDate} from '@components/sharedMediaScrollDate';
import createSharedMediaScrollDateBadge from '@components/sharedMediaScrollDateBadge';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import type appSidebarRight from '@components/sidebarRight';
import type AppMediaViewer from '@components/mediaViewer';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import verifyMenuItem from '@helpers/verifyMenuItem';

// The call log is searched by the Calls tab, never by shared media — and unlike
// every other filter its constructor is not just its id (it carries `pFlags`),
// so a media tab could not build one from `{_: inputFilter}` anyway.
export type SearchSuperType = Exclude<MyInputMessagesFilter, 'inputMessagesFilterPhoneCalls'>/*  | 'members' */;
export type SearchSuperContext = {
  peerId: PeerId,
  inputFilter: {_: MyInputMessagesFilter},
  query?: string,
  maxId?: number,
  folderId?: number,
  threadId?: number,
  monoforumThreadId?: PeerId,
  date?: number,
  nextRate?: number,
  minDate?: number,
  maxDate?: number
} & Pick<RequestHistoryOptions, 'chatType' | 'communityId'>;

export type SearchSuperMediaType = 'stories' | 'members' | 'media' |
  'files' | 'links' | 'music' | 'chats' | 'voice' | 'gifs' | 'groups' | 'similar' |
  'savedDialogs' | 'saved' | 'channels' | 'apps' | 'gifts' | 'posts' | 'botPreviews';
export type SearchSuperMediaTab = {
  inputFilter?: SearchSuperType,
  name: LangPackKey,
  type: SearchSuperMediaType,
  contentTab?: HTMLElement,
  itemsTab?: HTMLElement,
  menuTab?: HTMLElement,
  menuTabName?: HTMLElement,
  scroll?: {scrollTop: number, scrollHeight: number},
  hideOn?: HTMLElement
};

export type SearchSuperMediaCounters = {
  photos: number,
  videos: number
};

// * a tab whose visibility follows its message counter — an empty one is hidden (see loadFirstTime)
export function isCounterDrivenMediaTab(mediaTab: SearchSuperMediaTab) {
  return !!mediaTab.inputFilter && mediaTab.inputFilter !== 'inputMessagesFilterEmpty';
}

type SearchSuperCommittedMediaFilterState = {
  inputFilter: SearchSuperMediaInputFilter,
  loaded: boolean,
  nextRate: number,
  counter: number,
  scroll: SearchSuperMediaTab['scroll']
};

type SearchSuperLoadTypeOptions = {
  mediaTab: SearchSuperMediaTab,
  justLoad: boolean,
  loadCount: number,
  middleware: Middleware,
  side: 'top' | 'bottom'
};

// * a preview is a photo or a video
function getBotPreviewMedia({media}: BotPreviewMedia) {
  return (media as MessageMedia.messageMediaPhoto).photo as Photo.photo ||
    (media as MessageMedia.messageMediaDocument).document as Document.document;
}

type PerformSearchResultArgs = {
  messages: (Message.message | Message.messageService)[];
  mediaTab: SearchSuperMediaTab;
  append?: boolean;
};

class SearchContextMenu {
  private buttons: (ButtonMenuItemOptions & {verify?: () => boolean | Promise<boolean>, withSelection?: true})[];
  private element: HTMLElement;
  private target: HTMLElement;
  private peerId: PeerId;
  private mid: number;
  private isSelected: boolean;
  private managers: ReadingManagers;
  private noForwards: boolean;
  private message: MyMessage;
  private selectedMessages: MyMessage[];
  private copyMediaButton: ButtonMenuItemOptions & {
    verify?: () => boolean | Promise<boolean>
  };

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

      // stories have their own context menu in StoriesProfileTab
      const isStory = !!findUpClassName(e.target, 'search-super-content-stories');
      if(isStory) return;

      if(!item) return;

      // cross-realm-safe `instanceof MouseEvent` (excludes touch, survives the Document PiP window)
      if(!('touches' in e)) e.preventDefault();
      if(this.element.classList.contains('active')) {
        return false;
      }
      if(!('touches' in e)) e.cancelBubble = true;

      const r = async() => {
        const managers = bindManagersToSession(this.managers);
        this.target = item;
        this.peerId = item.dataset.peerId.toPeerId();
        this.mid = +item.dataset.mid;
        this.isSelected = searchSuper.selection.isMidSelected(this.peerId, this.mid);
        this.message = await managers.appMessagesManager.getMessageByPeer(this.peerId, this.mid);
        this.noForwards = searchSuper.selection.isSelecting ?
          this.searchSuper.selection.selectionForwardBtn.classList.contains('hide') :
          !(await managers.appMessagesManager.canForward(this.message));
        this.selectedMessages = searchSuper.selection.isSelecting ? await searchSuper.selection.getSelectedMessages() : undefined;
        // this.isSavedDialog = !!(searchSuper.searchContext.peerId === rootScope.myId && searchSuper.searchContext.threadId);

        const f = await Promise.all(this.buttons.map(async(button) => {
          let good: boolean;

          if(this.searchSuper.selection.isSelecting && !button.withSelection) {
            good = false;
          } else {
            good = await verifyMenuItem(button);
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
    }, this.copyMediaButton = {
      icon: 'copy',
      text: 'MediaViewer.Context.Copy',
      onClick: this.onCopyMediaClick,
      verify: () => !this.searchSuper.selection.isSelecting &&
        ChatContextMenu.canCopyMedia(this.message, undefined, this.noForwards, this.attachTo),
      keepOpen: true
    }, {
      icon: 'download',
      text: 'MediaViewer.Context.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.message, this.noForwards, this.attachTo),
      verify: () => !this.searchSuper.selection.isSelecting && ChatContextMenu.canDownload(this.message, undefined, this.noForwards, this.attachTo)
    }, {
      icon: 'download',
      text: 'Message.Context.Selection.Download',
      onClick: () => ChatContextMenu.onDownloadClick(this.selectedMessages, this.noForwards, this.attachTo),
      verify: () => this.searchSuper.selection.isSelecting && ChatContextMenu.canDownload(this.selectedMessages, undefined, this.noForwards, this.attachTo),
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
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: this.onDeleteClick,
      verify: () => !this.searchSuper.selection.isSelecting && this.managers.appMessagesManager.canDeleteMessage(this.message)
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
    getOverlayRoot().append(this.element);
  }

  private onGotoClick = () => {
    hotReloadGuard.appImManager.setInnerPeer({
      peerId: this.peerId,
      lastMsgId: this.mid,
      threadId: this.searchSuper.mediaTab.type === 'saved' ? this.searchSuper.searchContext.peerId : this.searchSuper.searchContext.threadId
    });
  };

  private onCopyMediaClick = () => {
    copyMessageMediaWithFeedback({
      message: this.message,
      button: this.copyMediaButton
    });
  };

  private onForwardClick = () => {
    if(this.searchSuper.selection.isSelecting) {
      simulateClickEvent(this.searchSuper.selection.selectionForwardBtn);
    } else {
      hotReloadGuard.showForwardPopup({
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
      showDeleteMessagesPopup(
        this.peerId,
        [this.mid],
        ChatType.Chat
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
  searchGroup?: SearchGroup,
  mediaTab: SearchSuperMediaTab
};

/** What stands in a tab's container next to its content - a preloader, a "nothing found" - and not the ghost over it */
function getTabExtras(tabContainer: HTMLElement) {
  return (Array.from(tabContainer.children) as HTMLElement[])
  .slice(1)
  .filter((child) => !child.classList.contains('search-super-ghost'));
}

/**
 * A tab with nothing in it: no items, and no more in its containers than the way down to them - not the
 * media tab with the group of messages a query found, which stands beside its grid
 */
function isMediaTabBlank({contentTab, itemsTab}: SearchSuperMediaTab) {
  if(itemsTab.childElementCount) {
    return false;
  }

  for(let element = itemsTab; element !== contentTab; element = element.parentElement) {
    if(element.parentElement.childElementCount !== 1) {
      return false;
    }
  }

  return true;
}

/**
 * The middleware of what a search shows for a query. A new query makes the last one's stale at once -
 * its loads stop where they are - while what it rendered can live on (`next(true)`): a held tab
 * (`holdTab`) goes on showing it until the new results take its place and it is let go (`release`).
 * A query's middleware is cleaned when it ends, as one middleware for all of them was; the destructors
 * registered on it (a video's source) run with the search (`destroy`)
 */
class QueryMiddleware {
  private helper: MiddlewareHelper;
  private middleware: Middleware;
  private retired: MiddlewareHelper[] = [];
  private ended: MiddlewareHelper[] = [];
  private destroyed: boolean;

  constructor() {
    this.start();
  }

  private start() {
    const helper = this.helper = getMiddleware();
    this.middleware = helper.get(() => this.helper === helper);
  }

  public get() {
    return this.middleware;
  }

  public next(keepAlive?: boolean) {
    const previous = this.helper;
    this.start();
    if(keepAlive) {
      this.retired.push(previous);
    } else {
      this.end(previous);
    }
  }

  private end(helper: MiddlewareHelper) {
    // * a transition can outlive the search
    if(this.destroyed) {
      helper.destroy();
      return;
    }

    helper.clean();
    this.ended.push(helper);
  }

  /** The queries before this one that were kept alive on screen, to be let go (`release`) once they are off it */
  public takeRetired() {
    return this.retired.splice(0, this.retired.length);
  }

  public release(helpers: MiddlewareHelper[]) {
    helpers.forEach((helper) => this.end(helper));
  }

  public destroy() {
    this.destroyed = true;
    this.release(this.takeRetired());
    this.ended.splice(0, this.ended.length).forEach((helper) => helper.destroy());
    this.helper.destroy();
  }
}

// * how long a held tab (`changeQuery`) waits for its new results before it shows what it has
const SEARCH_RESULTS_WAIT = 1500;
// * and how long, after that, a part of them that is late keeps what it showed before
const SEARCH_RESULTS_WAIT_LATE = 4500;
// * how long the pointer rests on a tab before the tab starts loading (`prefetchMediaTab`): not one it passes over
const TAB_PREFETCH_HOVER_DELAY = 100;
// * the tabs that load ahead of being opened - not posts, whose search spends a quota, nor stories, gifts or
// * saved dialogs, whose lists follow the scroll
const PREFETCHED_MEDIA_TYPES: Set<SearchSuperMediaType> = new Set([
  'media',
  'saved',
  'files',
  'links',
  'music',
  'voice',
  'gifs',
  'channels',
  'apps',
  'members',
  'groups',
  'similar',
  'botPreviews'
]);
// * the tabs whose loaders show nothing until they are through: held with nothing in them (`holdTab`), they show
// * the preloader the message tabs have (`cleanupHTML`) - not gifts, stories or posts, which show their own
const PRELOADED_MEDIA_TYPES: Set<SearchSuperMediaType> = new Set([
  'channels',
  'apps',
  'members',
  'groups',
  'similar',
  'botPreviews'
]);
// * the tabs laid out as the media tab is, a grid of square thumbs
const GRID_MEDIA_TYPES: Set<SearchSuperMediaType> = new Set([
  'media',
  'gifs',
  'botPreviews'
]);

export default class AppSearchSuper {
  public tabs: {[t in SearchSuperType]: HTMLDivElement} = {} as any;

  public mediaTab: SearchSuperMediaTab;

  public container: HTMLElement;
  public nav: HTMLElement;
  public navScrollableContainer: HTMLDivElement;
  public tabsContainer: HTMLElement;
  private disposeNav: () => void;
  private tabsMenu: HTMLElement;
  private prevTabId = -1;

  private lazyLoadQueue = new LazyLoadQueue();
  public middleware = new QueryMiddleware();
  // * a query is being changed with what the tab shows held on screen (`changeQuery`)
  private isHoldingQuery: boolean;

  public historyStorage: Partial<{[type in SearchSuperType]: {mid: number, peerId: PeerId}[]}> = {};
  public usedFromHistory: Partial<{[type in SearchSuperType]: number}> = {};

  public searchContext: SearchSuperContext;
  public loadMutex: Promise<any>;

  private nextRates: Partial<{[type in SearchSuperMediaType]: number}> = {};
  private loadPromises: Partial<{[type in SearchSuperMediaType]: Promise<any>}> = {};
  private loaded: Partial<{[type in SearchSuperMediaType]: boolean}> = {};
  private refiller: ScrollableRefiller<SearchSuperMediaType>;
  private loadedChats = false;
  // * the chats tab's own part of a query's load, settled once it has rendered (or failed): the groups
  // * of found chats, the top peers, recent search. Made with the query, the load starts it (`loadChats`)
  private loadChatsPromise: CancellablePromise<void> = deferredPromise<void>();
  private firstLoad = true;
  // * what a tab showed before the query it is loading: kept over it until the new results are there
  private tabGhosts: Map<SearchSuperMediaTab, HTMLElement> = new Map();

  private log = logger('SEARCH-SUPER');
  public selectTab: ReturnType<typeof horizontalMenu>;


  private searchGroupMedia: SearchGroup;

  public mediaTabsMap: Map<SearchSuperMediaType, SearchSuperMediaTab> = new Map();

  private membersList: SortedUserList;
  private membersParticipantMap: Map<PeerId, ChatParticipant | ChannelParticipant>;
  private membersMiddlewareHelper: MiddlewareHelper;

  public storiesActions: StoriesContextActions;
  public storiesSetAlbum: (albumId: number | undefined, skipAnimation?: boolean) => void;
  private _loadSavedDialogs: (side: 'top' | 'bottom') => Promise<any>;

  private _loadMoreApps: () => Promise<void>;
  // * what the bot previews' grid shows, in its order
  private botPreviews: BotPreviewMedia[];

  private skipScroll: boolean;

  // * arguments
  public mediaTabs: SearchSuperMediaTab[];
  private mediaTabsDefaultOrder: SearchSuperMediaTab[];
  public mainMediaTabType: ProfileTabMediaType;
  public scrollable: Scrollable;
  public searchGroups?: {[group in SearchGroupType]: SearchGroup};
  public asChatList? = false;
  public hideEmptyTabs? = true;
  public onChangeTab?: (mediaTab: SearchSuperMediaTab) => void;
  public showSender? = false;
  public useMainProfileTab?: boolean;
  private searchContextMenu: SearchContextMenu;
  public selection: SearchSelection;

  public scrollStartCallback: (dimensions: ScrollStartCallbackDimensions) => void;
  public scrollOffset: number;

  public managers: ReadingManagers;
  private loadFirstTimePromise: Promise<void>;
  private mediaFilterChangeId = 0;
  private mediaFilterCommittedInputFilter: SearchSuperMediaInputFilter;
  private mediaFilterCommittedState: SearchSuperCommittedMediaFilterState;
  private mediaFilterStagingItemsTab: HTMLDivElement;
  private mediaCountersRefreshId = 0;
  private mediaCountersVersion = 0;
  private scrollDateBadge: ReturnType<typeof createSharedMediaScrollDateBadge>;

  private listenerSetter: ListenerSetter;
  private swipeHandler: SwipeHandler;

  public storiesArchive: boolean;

  public counters: Partial<{[type in SearchSuperMediaType]: number}> = {};
  public onLengthChange: (type: SearchSuperMediaType, length: number) => void;
  public onMediaCountersChange: (counters?: SearchSuperMediaCounters) => void;
  private mediaCounters: Partial<SearchSuperMediaCounters> = {};

  public openSavedDialogsInner: boolean;

  public slider: SidebarSlider;

  public stargiftsStore: StarGiftsProfileStore;
  public stargiftsActions: StarGiftsProfileActions;
  public stargiftsSetCollection: (collectionId: number) => void;
  private stargiftsStopReorder: () => void;
  private menuGradient: HTMLElement;

  constructor(options: Pick<
    AppSearchSuper,
    'mediaTabs' |
    'scrollable' |
    'searchGroups' |
    'asChatList' |
    'hideEmptyTabs' |
    'onChangeTab' |
    'showSender' |
    'managers' |
    'scrollOffset'
  > & Partial<Pick<AppSearchSuper, 'storiesArchive' | 'onLengthChange' | 'onMediaCountersChange' | 'openSavedDialogsInner' | 'slider' | 'useMainProfileTab'>>) {
    safeAssign(this, options);
    this.mediaTabsDefaultOrder = [...this.mediaTabs];

    this.refiller = new ScrollableRefiller({
      scrollable: this.scrollable,
      getProgress: (type) => this.getMediaTabProgress(type)
    });

    this.slider ??= hotReloadGuard.appSidebarRight;

    this.container = document.createElement('div');
    this.container.classList.add('search-super');

    this.listenerSetter = new ListenerSetter();
    this.searchContextMenu = new SearchContextMenu(this.container, this, this.listenerSetter);
    this.selection = new SearchSelection(this, this.managers, this.listenerSetter);

    let navScrollableContext: ScrollableContextValue;
    // the tabs are reordered and hidden by hand later on, so they are rendered once and
    // kept as plain elements — no `For`, nothing reactive to fight with
    const navScrollableContainer = this.navScrollableContainer = createRoot((dispose) => {
      this.disposeNav = dispose;
      return Tabs.MenuScrollable({
        class: 'search-super-tabs-scrollable sticky',
        scrollableProps: {
          class: 'search-super-nav-scrollable',
          contextRef: (context) => navScrollableContext = context
        },
        children: Tabs.Menu({
          class: 'search-super-tabs',
          ref: (ref) => this.tabsMenu = this.nav = ref,
          children: this.mediaTabs.map((mediaTab) => {
            this.mediaTabsMap.set(mediaTab.type, mediaTab);
            return Tabs.MenuTab({
              ripple: true,
              ref: (ref) => mediaTab.menuTab = ref,
              children: (mediaTab.menuTabName = i18n(mediaTab.name))
            });
          })
        })
      });
    }) as HTMLDivElement;

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

          const prevChild = this.mediaTabs[prevId];
          if(prevChild.type === 'gifts' && this.stargiftsActions?.handleSwipe(xDiff, this.stargiftsSetCollection)) {
            return
          }

          if(prevChild.type === 'stories' && this.storiesActions?.handleSwipe(xDiff, this.storiesSetAlbum)) {
            return
          }

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
          return !findUpClassName(e.target, 'scrollable-x') && !isStoryReorderTarget(e.target);
        }
      });
    }

    const noSectionTypes: Set<SearchSuperMediaType> = new Set([
      ...GRID_MEDIA_TYPES,
      'stories',
      'gifts',
      'chats',
      'channels',
      'apps',
      'posts'
    ]);
    for(const mediaTab of this.mediaTabs) {
      const container = document.createElement('div');
      container.classList.add('search-super-tab-container', 'search-super-container-' + mediaTab.type, 'tabs-tab');

      const content = document.createElement('div');
      content.classList.add('search-super-content-container', 'search-super-content-' + mediaTab.type);

      container.append(content);

      const useSection = !noSectionTypes.has(mediaTab.type);
      let itemsContainer = content;
      if(useSection) {
        const items = document.createElement('div');
        createRoot(() => {
          Section({
            noDelimiter: true,
            class: 'hide',
            ref: (ref) => {
              content.append(mediaTab.hideOn = ref);
            },
            children: [items]
          });
        });
        itemsContainer = items;
      } else if(GRID_MEDIA_TYPES.has(mediaTab.type)) {
        const grid = document.createElement('div');
        grid.classList.add('search-super-content-media-grid');
        content.append(grid);
        itemsContainer = grid;
      }

      this.tabsContainer.append(container);

      const {inputFilter} = mediaTab;
      if(inputFilter) {
        this.tabs[inputFilter] = itemsContainer;
      }

      mediaTab.contentTab = content;
      mediaTab.itemsTab = itemsContainer;
    }

    this.container.append(
      this.menuGradient = Tabs.MenuGradient({
        color: 'background',
        className: 'search-super-tabs-gradient'
      }) as HTMLElement,
      navScrollableContainer,
      this.tabsContainer
    );

    // * construct end

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


      const fromMediaTab = this.mediaTab;
      this.mediaTab = newMediaTab;
      // * the collections' reorder is of their list: it ends as another is shown, whose selection may take the row
      if(fromMediaTab?.type === 'gifts' && newMediaTab !== fromMediaTab) {
        this.stargiftsStopReorder?.();
      }

      if(!supportsSharedMediaScrollDate(newMediaTab.type)) {
        this.scrollDateBadge?.hide();
      }

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

      // * the tab a query opens on is loaded by whoever set the query, a tab opened after that loads here -
      // * after the first load too, though a query resets `prevTabId`
      if(
        fromMediaTab !== newMediaTab &&
        (this.prevTabId !== -1 || !this.firstLoad) &&
        !newMediaTab.itemsTab.childElementCount
      ) {
        // * one with nothing in it yet gets its results at once, over what stands in it (a preloader) - those
        // * it has been loading already (`prefetchMediaTab`) too
        if(
          isMediaTabBlank(newMediaTab) &&
          (this.loadPromises[newMediaTab.type] || this.canLoadMediaTab(newMediaTab))
        ) {
          this.loadHeld(newMediaTab);
        } else {
          this.load(true);
        }
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
    }, undefined, navScrollableContext, this.listenerSetter);

    // * a tab the pointer rests on or presses starts loading, so that it is all there, or nearer, when it slides in
    let hoveredMediaTab: SearchSuperMediaTab, hoverTimeout: number;
    const getMenuMediaTab = (target: EventTarget) => {
      const menuTab = findUpAsChild(target as HTMLElement, this.tabsMenu);
      return menuTab && this.mediaTabs.find((mediaTab) => mediaTab.menuTab === menuTab);
    };
    const setHoveredMediaTab = (mediaTab: SearchSuperMediaTab) => {
      if(hoveredMediaTab === mediaTab) {
        return;
      }

      hoveredMediaTab = mediaTab;
      clearTimeout(hoverTimeout);
      if(mediaTab) {
        hoverTimeout = window.setTimeout(() => this.prefetchMediaTab(mediaTab), TAB_PREFETCH_HOVER_DELAY);
      }
    };
    // * by the pointer's moves, not `pointerover`: the menu scrolling the chosen tab to its middle brings
    // * another one under a pointer that stays where it is
    this.listenerSetter.add(this.tabsMenu)('pointermove', (e) => {
      if(e.pointerType === 'mouse') {
        setHoveredMediaTab(getMenuMediaTab(e.target));
      }
    });
    this.listenerSetter.add(this.tabsMenu)('pointerleave', () => setHoveredMediaTab(undefined));
    // * the click comes on the way up; arrow keys (`attachTabList`) open a tab as they focus it
    this.listenerSetter.add(this.tabsMenu)('pointerdown', (e) => {
      const mediaTab = getMenuMediaTab(e.target);
      mediaTab && this.prefetchMediaTab(mediaTab);
    });
    this.listenerSetter.addCleanup(() => clearTimeout(hoverTimeout));

    attachClickEvent(this.tabsContainer, (e) => {
      if(this.selection.isSelecting) {
        const item = findUpClassName(e.target, 'search-super-item');
        this.selection.cancelElementClick(e, item, cancelClickOrNextIfNotClick);
        this.selection.toggleByElement(item);
      }
    }, {capture: true, passive: false, listenerSetter: this.listenerSetter});

    // * a media still behind its spoiler (a sensitive one's included) is revealed by the click, not opened
    const revealMediaSpoiler = (target: HTMLElement, e: MouseEvent) => {
      const mediaSpoiler: HTMLElement = target.querySelector('.media-spoiler-container');
      if(mediaSpoiler) {
        onMediaSpoilerClick({
          event: e,
          mediaSpoiler
        });
      }

      return !!mediaSpoiler;
    };

    const onMediaClick = async(className: string, targetClassName: string, inputFilter: SearchSuperType, e: MouseEvent) => {
      const target = findUpClassName(e.target as HTMLDivElement, className);
      if(!target) return;

      const mid = +target.dataset.mid;
      if(!mid) {
        this.log.warn('no messageId by click on target:', target);
        return;
      }

      if(revealMediaSpoiler(target, e)) {
        return;
      }

      const peerId = target.dataset.peerId.toPeerId();
      const message = await this.getItemMessage(target);
      if(!target.isConnected) {
        return;
      }

      const skipSensitive = this.isMessageSensitive(message as Message.message);

      const targets = (Array.from(this.tabs[inputFilter].querySelectorAll('.' + targetClassName)) as HTMLElement[]).map((el) => {
        const containerEl = findUpClassName(el, className);
        if(skipSensitive && hasSensitiveSpoiler(containerEl)) {
          return;
        }

        return {
          element: el,
          mid: +containerEl.dataset.mid,
          peerId: containerEl.dataset.peerId.toPeerId()
        };
      }).filter(Boolean);

      // const ids = Object.keys(this.mediaDivsByIds).map((k) => +k).sort((a, b) => a - b);
      const idx = targets.findIndex((item) => item.mid === mid && item.peerId === peerId);

      const mediaTab = this.mediaTabs.find((mediaTab) => mediaTab.inputFilter === inputFilter);
      new hotReloadGuard.AppMediaViewer()
      .setSearchContext(this.copySearchContext(inputFilter, this.nextRates[mediaTab.type], skipSensitive))
      .openMedia({
        message,
        target: targets[idx].element,
        fromRight: 0,
        reverse: false,
        prevTargets: targets.slice(0, idx),
        nextTargets: targets.slice(idx + 1)
      });
    };

    // * the grids of the messages' media; the media tab's own waits while its filter is being changed
    (['media', 'gifs'] as SearchSuperMediaType[]).forEach((type) => {
      const mediaTab = this.mediaTabsMap.get(type);
      if(!mediaTab?.itemsTab) {
        return;
      }

      const isStaging = () => type === 'media' && !!this.mediaFilterStagingItemsTab;
      attachClickEvent(
        mediaTab.itemsTab,
        (e) => {
          if(isStaging()) return;
          return onMediaClick('grid-item', 'grid-item', mediaTab.inputFilter, e);
        },
        {listenerSetter: this.listenerSetter}
      );
      attachMediaPeekListeners({
        listenTo: mediaTab.itemsTab,
        listenerSetter: this.listenerSetter,
        findTarget: (target) => {
          // * a press while selecting selects
          if(this.selection?.isSelecting || isStaging()) return;
          const element = findUpClassName(target, 'grid-item');
          return element && !hasMediaSpoiler(element) ? element : undefined;
        },
        getSource: async(element) => getMessageMediaPeekSource(await this.getItemMessage(element))
      });
    });

    const botPreviewsTab = this.mediaTabsMap.get('botPreviews');
    botPreviewsTab && attachClickEvent(
      botPreviewsTab.itemsTab,
      (e) => {
        const element = findUpClassName(e.target, 'grid-item');
        if(element && !revealMediaSpoiler(element, e)) {
          this.openBotPreview(element);
        }
      },
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
      getElementPosition: this.scrollOffset ? ({elementPosition}) => elementPosition - this.scrollOffset : undefined
    });
  }

  private onTransitionStart = () => {
    this.container.classList.add('sliding');
  };

  private onTransitionEnd = () => {
    this.container.classList.remove('sliding');
  };

  public getFirstVisibleMediaTab() {
    return this.mediaTabs.find((mediaTab) => !mediaTab.menuTab.classList.contains('hide'));
  }

  public setMainMediaTab(type?: ProfileTabMediaType) {
    this.mainMediaTabType = type;
    const ordered = orderMediaTabsByMain(
      this.mediaTabsDefaultOrder,
      type,
      (mediaTab) => !mediaTab.menuTab.classList.contains('hide')
    );
    if(ordered.every((mediaTab, index) => this.mediaTabs[index] === mediaTab)) {
      return;
    }

    this.mediaTabs.splice(0, this.mediaTabs.length, ...ordered);
    this.nav.append(...ordered.map((mediaTab) => mediaTab.menuTab));
    this.tabsContainer.append(...ordered.map((mediaTab) => mediaTab.contentTab.parentElement));

    if(this.prevTabId !== -1) {
      this.prevTabId = this.mediaTabs.indexOf(this.mediaTab);
    }
  }

  public setCounter(type: SearchSuperMediaType, count: number) {
    this.counters[type] = count;

    if(type === 'media') {
      const inputFilter = this.mediaTabsMap.get('media')?.inputFilter;
      if(inputFilter === 'inputMessagesFilterPhotos') {
        this.setMediaCounters({photos: count});
      } else if(inputFilter === 'inputMessagesFilterVideo') {
        this.setMediaCounters({videos: count});
      }
    }

    this.updateMediaTabVisibility(type);
    this.onLengthChange?.(type, count);
  }

  // * counter-driven tabs are hidden while empty (see loadFirstTime), so they have to appear
  // * (and disappear) on the fly when their counter crosses zero
  private updateMediaTabVisibility(type: SearchSuperMediaType) {
    if(!this.hideEmptyTabs || this.firstLoad) {
      return;
    }

    const mediaTab = this.mediaTabsMap.get(type);
    if(!mediaTab || !isCounterDrivenMediaTab(mediaTab)) {
      return;
    }

    this.setMediaTabHidden(mediaTab, !this.counters[type]);
  }

  /** A tab coming or going once the tabs are laid out (`loadFirstTime`): one that comes into none is opened */
  private setMediaTabHidden(mediaTab: SearchSuperMediaTab, hide: boolean) {
    if(mediaTab.menuTab.classList.contains('hide') === hide) {
      return;
    }

    mediaTab.menuTab.classList.toggle('hide', hide);

    let needChangeActive: boolean;
    if(hide) {
      needChangeActive = mediaTab.menuTab.classList.contains('active');
      mediaTab.menuTab.classList.remove('active');
    } else {
      // * there was nothing to select when every tab was empty; opened by nobody's hand, it leaves the profile
      // * where it was scrolled, as the first tab does (`loadFirstTime`)
      needChangeActive = !this.mediaTabs.some((tab) => tab.menuTab.classList.contains('active'));
      if(needChangeActive) {
        this.skipScroll = true;
      }
    }

    this.updateContainerHidden(needChangeActive);

    if(
      needChangeActive &&
      this.mediaTab &&
      !this.mediaTab.menuTab.classList.contains('hide') &&
      this.canLoadMediaTab(this.mediaTab)
    ) {
      this.load(true);
    }
  }

  private setMediaTabName(mediaTab: SearchSuperMediaTab, name: LangPackKey) {
    if(mediaTab.name === name) {
      return;
    }

    mediaTab.name = name;
    mediaTab.menuTabName.replaceWith(mediaTab.menuTabName = i18n(name));
  }

  private setMediaCounters(counters: Partial<SearchSuperMediaCounters>) {
    Object.assign(this.mediaCounters, counters);
    ++this.mediaCountersVersion;
    const {photos, videos} = this.mediaCounters;
    if(photos === undefined || videos === undefined) {
      return;
    }

    this.onMediaCountersChange?.({photos, videos});
  }

  public updateMediaCountersByMessage(message: MyMessage, difference: 1 | -1) {
    const key = this.filterMessagesByType([message], 'inputMessagesFilterPhotos').length ?
      'photos' :
      this.filterMessagesByType([message], 'inputMessagesFilterVideo').length ? 'videos' : undefined;
    if(!key || this.mediaCounters[key] === undefined) {
      return;
    }

    this.setMediaCounters({
      [key]: Math.max(0, this.mediaCounters[key] + difference)
    });
  }

  public async refreshMediaCounters() {
    const refreshId = ++this.mediaCountersRefreshId;
    const version = this.mediaCountersVersion;
    const middleware = this.middleware.get();

    try {
      const counters = await this.getSearchCounters([{
        _: 'inputMessagesFilterPhotos'
      }, {
        _: 'inputMessagesFilterVideo'
      }], false);
      if(
        refreshId !== this.mediaCountersRefreshId ||
        version !== this.mediaCountersVersion ||
        !middleware()
      ) {
        return;
      }

      const photos = counters.find((counter) => counter.filter._ === 'inputMessagesFilterPhotos')?.count;
      const videos = counters.find((counter) => counter.filter._ === 'inputMessagesFilterVideo')?.count;
      this.setMediaCounters({photos, videos});
    } catch(err) {
      this.log.error('refresh media counters error:', err);
    }
  }

  public async setMediaInputFilter(inputFilter: SearchSuperMediaInputFilter): Promise<SearchSuperMediaInputFilter | void> {
    const changeId = ++this.mediaFilterChangeId;
    const wasChanging = !!this.mediaFilterCommittedState;
    await this.loadPromises.media;

    const mediaTab = this.mediaTabsMap.get('media');
    if(!mediaTab || changeId !== this.mediaFilterChangeId) {
      return;
    }

    const committedInputFilter = this.mediaFilterCommittedInputFilter ??= mediaTab.inputFilter as SearchSuperMediaInputFilter;
    if(!wasChanging && committedInputFilter === inputFilter) {
      return;
    }

    const itemsTab = mediaTab.itemsTab as HTMLDivElement;
    this.mediaFilterCommittedState ??= {
      inputFilter: committedInputFilter,
      loaded: this.loaded.media,
      nextRate: this.nextRates.media,
      counter: this.counters.media,
      scroll: mediaTab.scroll
    };

    if(inputFilter === committedInputFilter || this.mediaTab !== mediaTab) {
      this.restoreCommittedMediaFilterState(mediaTab, itemsTab);
      return committedInputFilter;
    }

    const stagingItemsTab = itemsTab.cloneNode(false) as HTMLDivElement;
    this.mediaFilterStagingItemsTab = stagingItemsTab;
    mediaTab.inputFilter = inputFilter;
    this.tabs[inputFilter] = stagingItemsTab;
    this.searchContext.inputFilter = {_: inputFilter};
    this.historyStorage[inputFilter] = [];
    this.usedFromHistory[inputFilter] = -1;
    // * the counters the refiller watches just went back to the start, and it
    // * only re-arms on a HIGHER number — without this the media tab would never
    // * refill again for the rest of this peer
    this.refiller.reset('media');
    this.loaded.media = false;
    this.nextRates.media = 0;
    delete this.counters.media;

    mediaTab.scroll = undefined;

    let loadResult: Awaited<ReturnType<AppSearchSuper['load']>>;
    try {
      loadResult = await this.load(true);
    } catch(err) {
      this.log.error('media filter load error:', err);
    }

    if(changeId !== this.mediaFilterChangeId) {
      this.discardMediaFilterStagingItemsTab(stagingItemsTab);
      return;
    }

    if(!Array.isArray(loadResult) || typeof loadResult[0] !== 'number') {
      this.discardMediaFilterStagingItemsTab(stagingItemsTab);
      this.restoreCommittedMediaFilterState(mediaTab, itemsTab);
      return committedInputFilter;
    }

    await new Promise<void>((resolve) => fastRaf(() => {
      if(changeId !== this.mediaFilterChangeId) {
        this.discardMediaFilterStagingItemsTab(stagingItemsTab);
        resolve();
        return;
      }

      this.removeFromLazyLoadQueue(itemsTab);
      itemsTab.replaceChildren(...Array.from(stagingItemsTab.children));
      this.tabs[inputFilter] = itemsTab;
      this.mediaFilterCommittedInputFilter = inputFilter;
      this.mediaFilterCommittedState = undefined;

      const parent = mediaTab.contentTab.parentElement;
      getTabExtras(parent).forEach((element) => element.remove());
      if(!itemsTab.childElementCount) {
        parent.append(this.createNothingFoundElement());
      }

      if(this.mediaTab === mediaTab) {
        this.scrollToStart();
      }

      this.lazyLoadQueue.refresh();
      this.mediaFilterStagingItemsTab = undefined;
      resolve();
    }));
  }

  private restoreCommittedMediaFilterState(mediaTab: SearchSuperMediaTab, itemsTab: HTMLDivElement) {
    const state = this.mediaFilterCommittedState;
    if(!state) {
      return;
    }

    const pendingInputFilter = mediaTab.inputFilter;
    if(pendingInputFilter !== state.inputFilter && this.tabs[pendingInputFilter] !== itemsTab) {
      delete this.tabs[pendingInputFilter];
    }

    mediaTab.inputFilter = state.inputFilter;
    mediaTab.scroll = state.scroll;
    this.refiller.reset('media'); // same swap the other way round — the counters it watches are a different filter's now
    this.tabs[state.inputFilter] = itemsTab;
    this.searchContext.inputFilter = {_: state.inputFilter};
    this.loaded.media = state.loaded;
    this.nextRates.media = state.nextRate;
    this.counters.media = state.counter;
    this.mediaFilterCommittedInputFilter = state.inputFilter;
    this.mediaFilterCommittedState = undefined;
  }

  private discardMediaFilterStagingItemsTab(itemsTab: HTMLDivElement) {
    this.removeFromLazyLoadQueue(itemsTab);
    if(this.mediaFilterStagingItemsTab === itemsTab) {
      this.mediaFilterStagingItemsTab = undefined;
    }
  }

  private removeFromLazyLoadQueue(container: HTMLElement) {
    Array.from(container.children).forEach((element) => {
      this.lazyLoadQueue.delete({div: element as HTMLElement});
    });
  }

  private createNothingFoundElement() {
    const div = document.createElement('div');
    div.append(i18n('Chat.Search.NothingFound'));
    div.classList.add('position-center', 'text-center', 'content-empty', 'no-select');
    return div;
  }

  public filterMessagesByType(messages: MyMessage[], type: SearchSuperType): MyMessage[] {
    return filterMessagesByInputFilter({inputFilter: type, messages: messages, limit: messages.length});
  }

  private async processEmptyFilter({message, mediaTab, middleware}: ProcessSearchSuperResult) {
    const isSaved = mediaTab.type === 'saved';
    const query = this.searchContext.query;

    let peerId = message.peerId;
    if(isSaved) {
      peerId = message.fromId;
    }
    peerId = await this.managers.appPeersManager.getPeerMigratedTo(peerId) || peerId;
    // * the query that asked is over: no row for it, under the next one's middleware or words
    if(!middleware()) {
      return;
    }

    const loadPromises: Promise<any>[] = [];
    // * put in whole, with the others of its page (`performSearchResult`)
    const dialogElement = hotReloadGuard.appDialogsManager.addDialogNew({
      dontSetActive: true,
      peerId,
      container: false,
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
    const setLastMessagePromise = hotReloadGuard.appDialogsManager.setLastMessageN({
      dialog: {
        _: 'dialog',
        peerId
      } as any,
      lastMessage: message,
      dialogElement,
      highlightWord: query,
      noForwardIcon: isSaved
    });

    loadPromises.push(setLastMessagePromise);
    return Promise.all(loadPromises).then(() => {
      return {element: dialogElement.container, message};
    });
  }

  // * the message a `search-super-item` shows
  private getItemMessage(item: HTMLElement) {
    return this.managers.appMessagesManager.getMessageByPeer(item.dataset.peerId.toPeerId(), +item.dataset.mid);
  }

  private async processPhotoVideoFilter({message, promises, middleware}: ProcessSearchSuperResult) {
    const sensitive = this.isMessageSensitive(message);
    const element = await this.wrapGridMedia({
      media: getMediaFromMessage(message, true),
      message,
      middleware,
      promises,
      spoiler: !!(message.media as MessageMedia.messageMediaPhoto).pFlags.spoiler,
      sensitive
    });

    return {element, message};
  }

  /** A thumb of a media grid: a photo, or the still of a video or a GIF */
  private async wrapGridMedia({media, message, middleware, promises, spoiler, sensitive}: {
    media: Photo.photo | Document.document,
    message?: Message.message,
    middleware: Middleware,
    promises: Promise<any>[],
    spoiler?: boolean,
    sensitive?: boolean
  }) {
    const div = document.createElement('div');
    div.classList.add('grid-item');

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

    if(spoiler || sensitive) {
      const mediaSpoiler = await wrapMediaSpoiler({
        animationGroup: 'chat',
        media,
        middleware,
        sensitive,
        width: 140,
        height: 140,
        multiply: 0.3
      });

      div.append(mediaSpoiler);
    }

    // * after the spoiler: a reveal button in it is the control till the spoiler goes
    makeGridMediaAccessible(div, media);

    [
      wrapped.images.thumb,
      wrapped.images.full
    ].filter(Boolean).forEach((image) => {
      image.classList.add('grid-item-media');
    });

    promises.push(wrapped.loadPromises.thumb);

    return div;
  }

  private async processDocumentFilter({message, inputFilter, middleware}: ProcessSearchSuperResult) {
    const document = getMediaFromMessage(message, true) as Document.document;
    const showSender = this.showSender || (['voice', 'round'] as MyDocument['type'][]).includes(document.type);

    const div = await wrapDocument({
      message,
      middleware,
      withTime: !showSender,
      fontWeight: 400,
      voiceAsMusic: true,
      clickable: true,
      showSender,
      searchContext: this.copySearchContext(inputFilter, this.nextRates.files, false),
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
      // * a URL reads left to right in any language
      a.dir = 'ltr';
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

    const row = renderSearchWebPageRow({
      title,
      titleRight: wrapSentTime(message),
      subtitle: subtitleFragment,
      media: previewDiv,
      link: aIsAnchor ? {
        href: a.href,
        onClick: a.getAttribute('onclick'),
        targetBlank: a.target === '_blank'
      } : undefined,
      middleware
    });

    if(row.innerText.trim().length) {
      return {message, element: row};
    }
  }

  public async performSearchResult({messages, mediaTab, append = true}: PerformSearchResultArgs) {
    const elemsToAppend: {element: HTMLElement, message: any}[] = [];
    const sharedMediaDiv: HTMLElement = mediaTab.contentTab;
    const promises: Promise<any>[] = [];
    const middleware = this.middleware.get();
    const isSaved = mediaTab.type === 'saved';
    let inputFilter = mediaTab.inputFilter;

    await getHeavyAnimationPromise();
    // * the query that asked is over: the search's context and its group of found media are the next one's
    if(!middleware()) {
      return 0;
    }

    let searchGroup: SearchGroup;
    if(inputFilter === 'inputMessagesFilterPhotoVideo' && !!this.searchContext.query.trim()) {
      inputFilter = 'inputMessagesFilterEmpty';
      searchGroup = this.searchGroupMedia ??= createSearchGroup({type: 'messages', middleware});
      if(searchGroup.container.parentElement !== sharedMediaDiv) {
        sharedMediaDiv.append(searchGroup.container);
      }
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

      case 'inputMessagesFilterPhotos':
      case 'inputMessagesFilterPhotoVideo':
      case 'inputMessagesFilterVideo':
      case 'inputMessagesFilterGif': {
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

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    if(promises.length) {
      await Promise.all(promises);
    }

    // * rendered aside while they waited (subtitles, avatars): the rows of a query that is over go, not
    // * into a group's list, which is the next query's by now
    if(!middleware()) {
      // this.log.warn('peer changed');
      if(searchGroup) {
        destroySearchRows(elemsToAppend.map(({element}) => element));
      }

      return 0;
    }

    const length = elemsToAppend.length;

    if(length) {
      const method = append ? 'append' : 'prepend';
      const threadId = isSaved ? this.searchContext.peerId : undefined;
      // * a group's rows are dialogs - not the items the search's own selection and menu take
      const container = searchGroup ? searchGroup.list : this.tabs[inputFilter];
      // * a page more of what is shown fades in; the first one comes in with its tab or group
      const fadeIn = !!container.childElementCount &&
        !searchGroup?.isDrafting &&
        !this.tabGhosts.has(mediaTab) &&
        this.canAnimateResults(mediaTab);
      const fadeInOptions = fadeIn && getAnimatedOptions(getSearchTransitionDuration());
      elemsToAppend.forEach((details) => {
        const {element, message} = details;
        if(!message) {
          debugger;
        }

        if(!searchGroup) {
          element.classList.add('search-super-item');
          element.dataset.mid = '' + message.mid;
          element.dataset.peerId = '' + message.peerId;
          element.dataset.timestamp = '' + message.date;
          threadId && (element.dataset.threadId = '' + threadId);
        }

        container[method](element);
        if(fadeIn) {
          element.animate(CROSS_FADE_KEYFRAMES, fadeInOptions);
        }

        if(this.selection?.isSelecting && !searchGroup) {
          this.selection.toggleElementCheckbox(element, true);
        }
      });

      if(isSaved) {
        let chatlist = sharedMediaDiv.querySelector<HTMLElement>('.chatlist');
        if(!chatlist) {
          chatlist = hotReloadGuard.appDialogsManager.createChatList({new: true});
          container.append(chatlist);

          hotReloadGuard.appDialogsManager.setListClickListener({
            list: chatlist,
            onFound: (el) => {
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

    // * the messages group stays with a notice of nothing found in the chats tab
    const showSearchGroupAnyway = mediaTab.type === 'chats' && searchGroup?.createPlaceholder;
    if(searchGroup && (searchGroup.list.childElementCount || showSearchGroupAnyway)) {
      searchGroup.setActive();

      if(!searchGroup.list.childElementCount && searchGroup.createPlaceholder) searchGroup.addPlaceholder(searchGroup.createPlaceholder());
    }

    // if(type !== 'inputMessagesFilterEmpty') {
    this.afterPerforming(inputFilter === 'inputMessagesFilterEmpty' ? 1 : length, mediaTab);
    // }

    return length;
  }

  private afterPerforming(length: number, mediaTab: SearchSuperMediaTab) {
    const contentTab = mediaTab.contentTab;
    if(!contentTab) {
      return;
    }

    if(mediaTab.type === 'media' && this.mediaFilterStagingItemsTab) {
      return;
    }

    if(mediaTab.hideOn) {
      mediaTab.hideOn.classList.remove('hide');
    }

    const parent = contentTab.parentElement;
    getTabExtras(parent).forEach((child) => {
      child.remove();
    });

    // this.contentContainer.classList.add('loaded');

    if(!length && !mediaTab.itemsTab.childElementCount) {
      parent.append(this.createNothingFoundElement());
    }
  }

  private loadChats() {
    const renderedPeerIds: Set<PeerId> = new Set();
    const middleware = this.middleware.get();

    const groups = this.getSearchGroupsList();
    groups.forEach((group) => group.clear());
    // * only when they are not in place: a custom element put in again (the notice of nothing found) starts over
    const tabElement = this.tabs.inputMessagesFilterEmpty;
    if(groups.some((group, idx) => tabElement.children[idx] !== group.container)) {
      tabElement.append(...groups.map((group) => group.container));
    }

    const query = this.searchContext.query;
    const isArchive = this.searchContext.folderId === FOLDER_ID_ARCHIVE;
    if(query && !this.searchContext.peerId && !this.searchContext.communityId) {
      const addDialogSubtitle = async(dom: DialogDom, peerId: PeerId) => {
        const managers = bindManagersToSession(this.managers);
        const peer = await managers.appPeersManager.getPeer(peerId);
        if(peerId === rootScope.myId) {
          dom.lastMessageSpan.append(i18n('Presence.YourChat'));
        } else {
          let username = await managers.appPeersManager.getPeerUsername(peerId);
          if(!username) {
            const user = await managers.appUsersManager.getUser(peerId);
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

          // * a handle or a phone number reads left to right in any language, and apart from the count
          let usernameElement: HTMLElement;
          if(username) {
            usernameElement = document.createElement('span');
            usernameElement.dir = 'ltr';
            usernameElement.textContent = username;
          }

          const toJoin: (Node | string)[] = [
            usernameElement
          ];

          if(/* showMembersCount &&  */((peer as Chat.channel).participants_count || (peer as any).participants)) {
            toJoin.push(await getChatMembersString(peerId.toChatId()));
          }

          dom.lastMessageSpan.append(...join(toJoin.filter(Boolean), false));
        }
      }

      // * settles once its rows have their subtitles and their avatars' first pictures, to be shown whole
      const setResults = (results: PeerId[], group: SearchGroup) => {
        const promises: Promise<any>[] = [];
        results.forEach((peerId) => {
          if(renderedPeerIds.has(peerId)) {
            return;
          }

          renderedPeerIds.add(peerId);

          const loadPromises: Promise<any>[] = [];
          const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
            peerId: peerId,
            container: group.list,
            avatarSize: 'abitbigger',
            autonomous: group.autonomous,
            wrapOptions: {
              middleware
            },
            withStories: true,
            loadPromises
          });
          promises.push(addDialogSubtitle(dom, peerId), ...loadPromises);
        });

        group.toggle();
        return Promise.all(promises);
      };

      const onLoad = <T>(arg: T) => {
        if(!middleware()) {
          return;
        }

        // this.loadedContacts = true;

        return arg;
      };

      // * inside the archive only its own chats are found: no contacts, global or sponsored results
      if(isArchive) {
        return this.managers.dialogsStorage.searchFolderDialogs(query, FOLDER_ID_ARCHIVE)
        .then(onLoad)
        .then((peerIds) => {
          if(peerIds) {
            return setResults(peerIds, this.searchGroups.contacts);
          }
        });
      }

      return Promise.all([
        this.managers.appUsersManager.getContactsPeerIds(query, true, undefined, 10)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            return setResults(contacts, this.searchGroups.contacts);
          }
        }),

        this.managers.appChatsManager.getSponsoredPeers(query)
        .then(onLoad)
        .then((peers) => {
          if(!peers?.length) return;

          const promises: Promise<any>[] = [];
          for(const peer of peers.reverse()) {
            const loadPromises: Promise<any>[] = [];
            const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
              peerId: peer.peer,
              container: this.searchGroups.globalContacts.list,
              append: false,
              avatarSize: 'abitbigger',
              autonomous: this.searchGroups.globalContacts.autonomous,
              wrapOptions: {
                middleware
              },
              loadPromises
            });

            dom.containerEl.dataset.sponsored = 'true';

            const chip = ButtonMenuToggle({
              listenerSetter: this.listenerSetter,
              appendTo: getOverlayRoot(),
              buttons: getSponsoredMessageButtons({
                message: peer,
                handleReportAd: () => {
                  showAdReport(peer);
                }
              }),
              onOpen: (e, element) => {
                // position menu
                const rect = chip.getBoundingClientRect();
                const bodyRect = getOverlayRoot().getBoundingClientRect();
                // * `bottom-left` holds the menu by its inline end, the chip's end edge - its left one in RTL
                element.style.insetInlineEnd = `${I18n.getIsRTL() ? rect.left : bodyRect.width - (rect.left + rect.width)}px`;
                element.style.top = `${rect.top + rect.height + 8}px`;
              },
              direction: 'bottom-left'
            });
            chip.classList.add('sponsored-peer-chip');

            chip.replaceChildren(
              i18n('SponsoredMessageAd'),
              Icon('more')
            )

            dom.lastTimeSpan.appendChild(chip)

            promises.push(addDialogSubtitle(dom, peer.peer), ...loadPromises);
          }

          return Promise.all(promises);
        }),

        this.managers.appUsersManager.searchContacts(query, 20)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            const promises = [
              setResults(contacts.my_results, this.searchGroups.contacts),
              setResults(contacts.results/* .concat(contacts.results, contacts.results, contacts.results) */, this.searchGroups.globalContacts)
            ];

            this.searchGroups.globalContacts.container.classList.add('is-short');

            if(this.searchGroups.globalContacts.list.childElementCount > 3) {
              this.searchGroups.globalContacts.needShowMoreButton('is-short');
            }

            return Promise.all(promises);
          }
        }),

        this.managers.dialogsStorage.getDialogs({query, offsetIndex: 0, limit: 20, filterId: 0})
        .then(onLoad)
        .then((value) => {
          if(value) {
            return setResults(value.dialogs.map((d) => d.peerId), this.searchGroups.contacts);
          }
        })
      ]);
    } else if(!this.searchContext.peerId && !this.searchContext.communityId && !this.searchContext.minDate && !isArchive) {
      const [appState] = useAppState();
      const renderRecentSearch = (setActive = true) => {
        if(!middleware()) {
          return;
        }

        this.searchGroups.recent.list.replaceChildren();

        // * the rows' subtitles and avatars, for the group to be shown whole
        const promises: Promise<any>[] = [];
        createRoot((dispose) => {
          middleware.onClean(dispose);

          // Keep this panel's order until it reopens, but apply removals immediately.
          const recentSearch = unwrap(appState.recentSearch).slice();
          const arr = For({
            get each() {
              return recentSearch.filter((peerId) => appState.recentSearch.includes(peerId));
            },
            children: (peerId) => {
              const middlewareHelper = createMiddleware();
              const loadPromises: Promise<any>[] = [];
              const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
                peerId: peerId,
                container: false,
                meAsSaved: true,
                avatarSize: 'abitbigger',
                autonomous: true,
                wrapOptions: {
                  middleware: middlewareHelper.get()
                },
                withStories: true,
                loadPromises
              });
              promises.push((async() => {
                dom.lastMessageSpan.append(await (peerId.isUser() ?
                  Promise.resolve(getUserStatusString(await this.managers.appUsersManager.getUser(peerId.toUserId()))) :
                  getChatMembersString(peerId.toChatId())));
              })(), ...loadPromises);

              return dom.containerEl;
            }
          });

          const elements = children(() => arr);
          // * shown on while the next query is held, but no more its own: `list` is that query's draft by then
          createEffect(() => {
            if(!middleware()) return;
            this.searchGroups.recent.list.replaceChildren(...(elements.toArray() as HTMLElement[]));
          });

          createEffect(() => {
            if(!middleware()) return;
            if(!appState.recentSearch.length) {
              this.searchGroups.recent.clear();
            } else if(setActive) {
              this.searchGroups.recent.setActive();
            }
          });
        });

        return Promise.all(promises);
      };

      return Promise.all([
        createTopPeersList({
          middleware,
          onFound: close,
          group: this.searchGroups.people,
          modifyPeers: (peers) => {
            peers = peers.slice(0, 15);
            const idx = peers.findIndex((peer) => peer.id === rootScope.myId);
            if(idx !== -1) {
              peers = peers.slice();
              peers.splice(idx, 1);
            }

            return peers;
          }
        }).promise,

        renderRecentSearch()
      ]);
    } else return Promise.resolve();
  }

  private async loadMembers({mediaTab}: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
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
          managers,
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
          // * a tag I may change opens its editor instead of the chat
          if(chatId && findUpClassName(e.target, 'member-tag-editable')) {
            cancelEvent(e);
            openEditMemberTag(chatId, peerId, membersParticipantMap.get(peerId));
            return;
          }

          let promise: Promise<any> = Promise.resolve();
          if(this.slider === hotReloadGuard.appSidebarRight && mediaSizes.isMobile) {
            promise = (this.slider as typeof appSidebarRight).toggleSidebar(false);
          }

          promise.then(() => {
            hotReloadGuard.appImManager.setInnerPeer({peerId});
          });
        });
        mediaTab.itemsTab.append(membersList.list);
        this.afterPerforming(1, mediaTab);

        if(chatId) {
          const middleware = membersMiddlewareHelper.get();
          createParticipantContextMenu({
            chatId,
            listenTo: membersList.list,
            participants: this.membersParticipantMap,
            slider: this.slider,
            middleware
          });

          const deleteByPeerId = (peerId: PeerId) => {
            membersList.ranks.delete(peerId);
            membersList.delete(peerId);
            membersParticipantMap.delete(peerId);
            this.setCounter(mediaTab.type, this.counters[mediaTab.type] - 1);
          };

          const renderParticipant = (participant: ChannelParticipant | ChatParticipant) => {
            renderParticipants([participant]);
            this.setCounter(mediaTab.type, this.counters[mediaTab.type] + 1);
          };

          // * the group's say on tags changed (its own rules, my rights as an admin): every row tells
          // * anew whether its tag opens the editor. Nothing else a chat update brings touches them
          const getTagRights = () => {
            const chat = apiManagerProxy.getChat(chatId);
            return [hasRights(chat, 'edit_rank'), hasRights(chat, 'manage_ranks')].join();
          };
          let tagRights = getTagRights();
          const onChatUpdate = (_chatId: ChatId) => {
            const rights = chatId === _chatId && getTagRights();
            if(!rights || rights === tagRights) {
              return;
            }

            tagRights = rights;
            renderParticipants(Array.from(membersParticipantMap.values()));
          };
          rootScope.addEventListener('chat_update', onChatUpdate);
          middleware.onClean(() => {
            rootScope.removeEventListener('chat_update', onChatUpdate);
          });

          if(apiManagerProxy.getChat(chatId)._ === 'chat') {
            const onChatFullUpdate = async(_chatId: ChatId) => {
              if(chatId !== _chatId) {
                return;
              }

              const chatFull = await this.managers.appProfileManager.getChatFull(chatId) as ChatFull.chatFull;
              if(!middleware()) {
                return;
              }

              const participants = chatFull.participants as ChatParticipants.chatParticipants;
              const processedPeerIds = new Set<PeerId>();
              for(const participant of participants.participants) {
                const peerId = participant.user_id.toPeerId(false);
                processedPeerIds.add(peerId);
                renderParticipant(participant);
              }

              membersParticipantMap.forEach((participant, peerId) => {
                if(!processedPeerIds.has(peerId)) {
                  deleteByPeerId(peerId);
                }
              });
            };
            rootScope.addEventListener('chat_full_update', onChatFullUpdate);
            middleware.onClean(() => {
              rootScope.removeEventListener('chat_full_update', onChatFullUpdate);
            });
          } else {
            // * a supergroup's tag changed: that row redrawn with it
            const onParticipantRank = ({chatId: _chatId, userId, rank}: {chatId: ChatId, userId: UserId, rank: string}) => {
              const peerId = userId.toPeerId(false);
              const participant = membersParticipantMap.get(peerId);
              if(chatId !== _chatId || !participant) {
                return;
              }

              renderParticipants([{...participant, rank: rank || undefined} as ChannelParticipant]);
            };
            rootScope.addEventListener('chat_participant_rank', onParticipantRank);
            middleware.onClean(() => {
              rootScope.removeEventListener('chat_participant_rank', onParticipantRank);
            });

            const onParticipantUpdate = (update: Update.updateChannelParticipant) => {
              if(chatId !== update.channel_id) {
                return;
              }

              const peerId = getParticipantPeerId(update.prev_participant || update.new_participant);
              const wasRendered = membersList.has(peerId);
              if(wasRendered || (update.new_participant as ChannelParticipant.channelParticipantBanned).pFlags?.left) {
                deleteByPeerId(peerId);
              }

              if((!update.prev_participant || wasRendered) && update.new_participant) {
                renderParticipant(update.new_participant);
              }
            };
            rootScope.addEventListener('chat_participant', onParticipantUpdate);
            middleware.onClean(() => {
              rootScope.removeEventListener('chat_participant', onParticipantUpdate);
            });
          }
        }
      }

      const chat = chatId && apiManagerProxy.getChat(chatId);
      const peerIds: {
        peerId: PeerId,
        rank: SortedUserListRank,
        participant: typeof participants[0]
      }[] = participants.map((participant) => {
        const peerId = userId ? (participant as Chat.chat).id.toPeerId(true) : getParticipantPeerId(participant as ChannelParticipant);
        if(chatId ? peerId.isAnyChat() : peerId.isUser()) {
          return;
        }

        let rank: SortedUserListRank;
        if(chatId) {
          const _participant = participant as ChannelParticipant;
          const role = getMemberTagRole(_participant);
          const editable = canEditMemberTag(chat, peerId, rootScope.myId, _participant);
          // * my own row with no tag offers one, as long as I am a plain member (an admin's reads "admin")
          rank = {rank: getParticipantRank(_participant), role, editable};
          if(rank.rank === undefined && !(editable && peerId === rootScope.myId && role === 'member')) {
            rank = undefined;
          }
        }

        return {
          peerId,
          rank,
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
        } else {
          membersList.ranks.delete(peerId);
        }

        membersParticipantMap.set(peerId, participant as ChannelParticipant);
        if(membersList.has(peerId)) {
          membersList.update(peerId);
        } else {
          membersList.add(peerId);
        }
      }
    };

    if(userId) {
      const LOAD_COUNT = !this.membersList ? 50 : 200;
      promise = managers.appUsersManager.getCommonChats(userId, LOAD_COUNT, this.nextRates[mediaTab.type]).then((messagesChats) => {
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
    } else if(await managers.appChatsManager.isChannel(chatId)) {
      const LOAD_COUNT = !this.membersList ? 50 : 200;
      promise = managers.appProfileManager.getChannelParticipants({
        id: chatId,
        limit: LOAD_COUNT,
        offset: this.nextRates[mediaTab.type]
      }).then((participants) => {
        if(!middleware()) {
          return;
        }

        const list = mediaTab.itemsTab.firstElementChild as HTMLUListElement;
        this.nextRates[mediaTab.type] = (list ? list.childElementCount : 0) + participants.participants.length;

        if(participants.participants.length < LOAD_COUNT) {
          this.loaded[mediaTab.type] = true;
        }

        this.setCounter(mediaTab.type, participants.count);

        return renderParticipants(participants.participants);
      });
    } else {
      promise = managers.appProfileManager.getChatFull(chatId).then((chatFull) => {
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

  private loadStories({mediaTab}: SearchSuperLoadTypeOptions) {
    if(this.storiesActions) {
      return this.storiesActions.load();
    }

    const middleware = this.middleware.get();
    const promise = deferredPromise<void>();
    createRoot((dispose) => {
      middleware.onClean(() => {
        this.storiesActions = undefined;
        this.storiesSetAlbum = undefined;
        dispose();
        promise.reject();
      });

      const {render: storiesList, actions, setAlbum} = StoriesProfileList({
        peerId: this.searchContext.peerId,
        pinned: !this.storiesArchive,
        archive: this.storiesArchive,
        scrollable: this.scrollable,
        listenerSetter: this.listenerSetter,
        withSelection: true,
        selectionMount: this.navScrollableContainer,
        onReady: () => {
          promise.resolve();
          mediaTab.contentTab.append(getFirstChild(storiesList, v => v instanceof Element) as Element);
          this.afterPerforming(1, mediaTab);
        },
        onLoad: (loaded: boolean) => {
          this.loaded[mediaTab.type] = loaded;
        },
        onCountChange: (length: number) => {
          this.setCounter(mediaTab.type, length);
        }
      });
      this.storiesActions = actions;
      this.storiesSetAlbum = setAlbum;
      this.storiesActions.load();
    });
    return promise;
  }

  /**
   * The peers like the one in view: a channel's similar channels, a bot's similar bots. Without Premium the
   * server gives a part of them, with the count of them all
   */
  private async getSimilarPeers(managers: ReadingManagers = this.managers) {
    const {peerId} = this.searchContext;
    const result = peerId.isUser() ?
      await managers.appBotsManager.getBotRecommendations(peerId.toUserId()) :
      await managers.appChatsManager.getChannelRecommendations(peerId.toChatId());
    const peers: (User | Chat)[] = 'users' in result ? result.users : result.chats;
    const count = (result as UsersUsers.usersUsersSlice | MessagesChats.messagesChatsSlice).count ?? peers.length;
    return {peers, count};
  }

  private async loadSimilarPeers({mediaTab}: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
    const middlewareHelper = this.middleware.get().create();
    const isBots = this.searchContext.peerId.isUser();

    const renderPeers = async(peers: (User | Chat)[], middleware: Middleware) => {
      const chatlist = hotReloadGuard.appDialogsManager.createChatList({new: true});

      const promises = peers.map(async(peer) => {
        const loadPromises: Promise<any>[] = [];
        const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
          peerId: peer.id.toPeerId(!isBots),
          container: chatlist,
          avatarSize: 'abitbigger',
          autonomous: false,
          wrapOptions: {
            middleware
          },
          loadPromises
        });
        dom.lastMessageSpan.append(isBots ?
          getUserStatusString(peer as User.user) :
          await getChatMembersString(peer.id, managers, peer as Chat));

        return Promise.all(loadPromises);
      });

      hotReloadGuard.appDialogsManager.setListClickListener({list: chatlist, autonomous: true});

      await Promise.all(promises);
      return chatlist;
    };

    const createPaywall = (limit: number) => {
      const wall = document.createElement('div');
      wall.classList.add('similar-channels-paywall');
      const btn = Button('btn-primary btn-color-primary', {icon: 'premium_unlock_filled', text: isBots ? 'MoreSimilarBotsButton' : 'UnlockSimilar'});
      btn.classList.add('similar-channels-paywall-button');
      const onClick = () => hotReloadGuard.showPremiumPopup();
      const anchor = anchorCallback(onClick);
      attachClickEvent(btn, onClick);
      anchor.classList.add('primary');
      const subtitle = i18n(isBots ? 'SimilarBots.Unlock' : 'SimilarChannels.Unlock', [limit, anchor]);
      subtitle.classList.add('similar-channels-paywall-subtitle');
      wall.append(btn, subtitle);
      return wall;
    };

    // * the rows on screen live until the next list takes their place: a premium toggle leaves them
    // * there while it loads, and rows torn down before that lose their layout in view
    let paywall: HTMLElement, wasPremium: boolean, shownRowsHelper: MiddlewareHelper;
    const onPremium = async(isPremium: boolean) => {
      if(wasPremium === isPremium) {
        return;
      }

      wasPremium = isPremium;
      middlewareHelper.clean();
      const middleware = middlewareHelper.get();
      const rowsHelper = this.middleware.get().create();

      const [{peers, count}, premiumLimit, isPremiumFeaturesHidden] = await Promise.all([
        this.getSimilarPeers(managers),
        managers.apiManager.getLimit('recommendedChannels', true),
        apiManagerProxy.isPremiumFeaturesHidden()
      ]);

      const chatlist = await renderPeers(peers, rowsHelper.get());
      if(!middleware()) {
        rowsHelper.destroy();
        return;
      }

      mediaTab.itemsTab.replaceChildren(chatlist);
      shownRowsHelper?.destroy();
      shownRowsHelper = rowsHelper;
      this.afterPerforming(1, mediaTab);
      this.loaded[mediaTab.type] = true;
      this.setCounter(mediaTab.type, count);

      // * offered only when there are more of them than came (tdesktop)
      if(!isPremium && !isPremiumFeaturesHidden && count > peers.length) {
        paywall ||= createPaywall(premiumLimit);
        mediaTab.itemsTab.append(paywall);
      }
    };

    rootScope.addEventListener('premium_toggle', onPremium);
    this.middleware.get().onClean(() => {
      rootScope.removeEventListener('premium_toggle', onPremium);
    });

    return onPremium(rootScope.premium);
  }

  /** The screenshots and videos a bot shows in its profile, in the grid the media tab has */
  private async loadBotPreviews({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
    let previews: BotPreviewMedia[];
    try {
      previews = (await managers.appBotsManager.getPreviewMedias(this.searchContext.peerId.toUserId()))
      .filter((preview) => getBotPreviewMedia(preview));
    } catch(err) {
      // * not an empty answer: the tab stays unloaded, and opening or scrolling it asks again
      this.log.error('bot previews error:', err);
      return;
    }

    if(!middleware()) return;

    // * a bot marked sensitive has its previews covered, as a profile's shared media are
    const sensitive = this.isPeerSensitive(this.searchContext.peerId);
    const promises: Promise<any>[] = [];
    const elements = await Promise.all(previews.map((preview) => {
      return this.wrapGridMedia({media: getBotPreviewMedia(preview), middleware, promises, sensitive});
    }));

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    // * a picture that did not come does not keep the others out
    await Promise.all(promises).catch(noop);
    if(!middleware()) return;

    this.botPreviews = previews;
    mediaTab.itemsTab.replaceChildren(...elements);
    this.loaded[mediaTab.type] = true;
    this.setCounter(mediaTab.type, previews.length);
    this.afterPerforming(previews.length, mediaTab);
  }

  /**
   * A bot's preview in the media viewer, the others beside it - each in a message of its own that stands
   * nowhere else, as an Instant View page's media are. It is only looked at: nothing to forward or save
   */
  private async openBotPreview(element: HTMLElement) {
    const managers = bindManagersToSession(this.managers);
    const middleware = this.middleware.get();
    const {peerId} = this.searchContext;
    const previews = this.botPreviews;
    const children = Array.from(element.parentElement.children) as HTMLElement[];
    if(!previews?.[children.indexOf(element)]) {
      return;
    }

    // * the viewer pages past those still behind the sensitive-content cover, as the shared media's does
    const shown = previews.map((preview, idx) => ({preview, element: children[idx]}))
    .filter((item) => !hasSensitiveSpoiler(item.element));
    const index = shown.findIndex((item) => item.element === element);
    if(index === -1) {
      return;
    }

    const targets: AppMediaViewer['target'][] = await Promise.all(shown.map(async({preview, element: tile}, idx) => {
      const message = await managers.appMessagesManager.generateStandaloneOutgoingMessage(peerId);
      message.media = preview.media;
      message.id = message.mid = 0;
      message.date = preview.date;
      message.fromId = peerId;
      message.pFlags.noforwards = true;
      return {element: tile, mid: 0, peerId, index: idx, message};
    }));

    if(!middleware() || !element.isConnected) {
      return;
    }

    // * of no chat, as an Instant View's: a photo the bot sends meanwhile does not join the list
    new hotReloadGuard.AppMediaViewer(true)
    .setSearchContext({peerId: NULL_PEER_ID, inputFilter: {_: 'inputMessagesFilterEmpty'}, useSearch: false})
    .openMedia({
      message: targets[index].message,
      index,
      target: element,
      fromRight: 0,
      reverse: false,
      prevTargets: targets.slice(0, index),
      nextTargets: targets.slice(index + 1)
    });
  }

  private async loadSavedDialogs({mediaTab, middleware, side}: SearchSuperLoadTypeOptions) {
    if(this._loadSavedDialogs) {
      return this._loadSavedDialogs(side);
    }

    const xd = new AutonomousSavedDialogList({appDialogsManager: hotReloadGuard.appDialogsManager});
    xd.scrollable = this.scrollable;
    xd.sortedList = new SortedDialogList({
      appDialogsManager: hotReloadGuard.appDialogsManager,
      managers: this.managers,
      log: this.log,
      requestItemForIdx: xd.requestItemForIdx,
      onListShrinked: xd.onListShrinked,
      itemSize: 72,
      scrollable: this.scrollable,
      indexKey: 'index_0',
      virtualFilterId: rootScope.myId,
      extraPaddingBottom: 0
    });

    const list = xd.sortedList.list;

    hotReloadGuard.appDialogsManager.setListClickListener({
      list,
      withContext: true,
      openInner: this.openSavedDialogsInner
    });

    // the pinned sublists of Saved Messages reorder like the pinned chats of a folder
    xd.attachPinnedReorder();

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

    mediaTab.itemsTab.append(list);
    this.afterPerforming(1, mediaTab);

    const loadSavedDialogs = this._loadSavedDialogs = () => Promise.resolve(xd.onChatsScroll());
    middleware.onClean(() => {
      xd.destroy();
      if(this._loadSavedDialogs === loadSavedDialogs) {
        this._loadSavedDialogs = undefined;
      }
    });

    return xd.onChatsScroll();
  }

  /** Puts the rows in once they all have their subtitles and avatars - a page more of them fading in */
  private async renderPeerDialogs(peerIds: PeerId[], group: SearchGroup, middleware: Middleware, type?: 'bots' | 'channels') {
    const managers = bindManagersToSession(this.managers);
    if(!middleware()) return;

    const rows = await Promise.all(peerIds.map(async(peerId) => {
      const loadPromises: Promise<any>[] = [];
      const {dom} = hotReloadGuard.appDialogsManager.addDialogNew({
        peerId,
        container: false,
        autonomous: true,
        avatarSize: 'abitbigger',
        wrapOptions: {
          middleware
        },
        loadPromises
      });
      const [peer, username] = await Promise.all([
        managers.appPeersManager.getPeer(peerId),
        managers.appPeersManager.getPeerUsername(peerId)
      ]);

      if('participants_count' in peer) {
        dom.lastMessageSpan.append(await getChatMembersString(peerId.toChatId()));
      } else if('bot_active_users' in peer) {
        dom.lastMessageSpan.append(i18n('BotUsers', [numberThousandSplitter(peer.bot_active_users)]));
      } else if(username) {
        dom.lastMessageSpan.append('@' + username);
      } else if(type === 'bots') {
        dom.lastMessageSpan.append(i18n('UnknownBotUsers'));
      }

      // * a picture that did not come does not keep its row out
      await Promise.all(loadPromises).catch(noop);
      return dom.containerEl;
    }));

    if(!middleware()) {
      destroySearchRows(rows);
      return;
    }

    const fadeIn = !!group.list.childElementCount && group.list.isConnected && liteMode.isAvailable('animations');
    group.list.append(...rows);
    if(fadeIn) {
      const options = getAnimatedOptions(getSearchTransitionDuration());
      rows.forEach((row) => row.animate(CROSS_FADE_KEYFRAMES, options));
    }
  }

  /**
   * Puts a tab's groups in together once their rows are there: one whose rows could not be had (a request of its
   * failed) stays out, and the others go in all the same. False when the query is over by then
   */
  private async appendRenderedGroups(mediaTab: SearchSuperMediaTab, middleware: Middleware, rendering: [SearchGroup, Promise<any>][]) {
    const isRendered = await Promise.all(rendering.map(([, promise]) => promise.then(() => true, (err) => {
      this.log.error('search group error:', err);
      return false;
    })));
    if(!middleware()) {
      return false;
    }

    mediaTab.itemsTab.append(...rendering.filter((_, idx) => isRendered[idx]).map(([group]) => group.container));
    return true;
  }

  private async loadChannels({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
    if(this.searchContext.query) {
      const group = createSearchGroup({name: 'Channels', type: 'channels', middleware});
      group.setActive();
      group.nameEl.style.display = 'none';

      // * the server returns channels only; the check below stays as a guard
      const SEARCH_LIMIT = 200;
      const {results: globalResults} = await managers.appUsersManager.searchContacts(this.searchContext.query, SEARCH_LIMIT, 'broadcasts');
      const filteredResultsWithUndefined = await Promise.all(
        globalResults.map(async(user) => await managers.appPeersManager.isBroadcast(user) ? user : undefined)
      );
      const filteredResults = filteredResultsWithUndefined.filter(Boolean);

      await this.renderPeerDialogs(filteredResults.map((user) => user.toPeerId(true)), group, middleware);
      if(!middleware()) return;

      if(filteredResults.length) {
        mediaTab.itemsTab.append(group.container);
      }
      this.afterPerforming(filteredResults.length, mediaTab);

      this.loaded[mediaTab.type] = true;
      return;
    }

    const dialogs = await managers.dialogsStorage.getCachedDialogs();
    const channelDialogsWithUndefined = await Promise.all(dialogs.map(async(dialog) => await managers.appPeersManager.isBroadcast(dialog.peerId) ? dialog : undefined));
    const channelDialogs = channelDialogsWithUndefined.filter(Boolean);

    // * the groups go in together, once they have their rows - not the joined channels before the similar ones
    const rendering: [SearchGroup, Promise<any>][] = [];
    if(channelDialogs.length) {
      const group = createSearchGroup({name: 'Chat.Search.JoinedChannels', type: 'channels', middleware});
      group.setActive();

      const SHOW_MORE_LIMIT = 5;
      if(channelDialogs.length > SHOW_MORE_LIMIT) group.needShowMoreButton();

      rendering.push([group, this.renderPeerDialogs(channelDialogs.map((dialog) => dialog.peerId), group, middleware)]);
    }

    // * on top of the joined ones: failing, it leaves them be
    const recommendations = await managers.appChatsManager.getChannelRecommendations().catch((err): undefined => {
      this.log.error('channel recommendations error:', err);
      return undefined;
    });
    if(!middleware()) return;

    if(recommendations?.chats.length) {
      const group = createSearchGroup({name: 'SimilarChannels', type: 'channels', middleware});
      group.setActive();

      rendering.push([group, this.renderPeerDialogs(recommendations.chats.map((chat) => chat.id.toPeerId(true)), group, middleware)]);
    }

    if(!await this.appendRenderedGroups(mediaTab, middleware, rendering)) return;

    this.afterPerforming(1, mediaTab);
    this.loaded[mediaTab.type] = true;
  }

  private async loadApps({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
    if(this._loadMoreApps) {
      return this._loadMoreApps();
    }

    const onClick = (el: HTMLElement): boolean => {
      (async() => {
        const peerId = el.dataset.peerId.toPeerId();
        const userFull = await this.managers.appProfileManager.getProfile(peerId);
        hotReloadGuard.appImManager.openWebApp({
          botId: peerId.toUserId(),
          url: (userFull.bot_info.menu_button as BotMenuButton.botMenuButton).url,
          buttonText: (userFull.bot_info.menu_button as BotMenuButton.botMenuButton).text,
          fromBotMenu: true,
          peerId
        });
      })();
      return false;
    };

    if(this.searchContext.query) {
      const group = createSearchGroup({name: 'ChatList.Filter.Bots', type: 'apps', onFound: onClick, middleware});
      group.setActive();

      // * the server returns bots only; the check below stays as a guard
      const SEARCH_LIMIT = 200;
      const {results: globalResults} = await managers.appUsersManager.searchContacts(this.searchContext.query, SEARCH_LIMIT, 'bots');
      const filteredResultsWithUndefined = await Promise.all(
        globalResults.map(async(user) => await managers.appPeersManager.isBot(user) ? user : undefined)
      );
      const filteredResults = filteredResultsWithUndefined.filter(Boolean);

      await this.renderPeerDialogs(filteredResults.map((user) => user.toPeerId(false)), group, middleware, 'bots');
      if(!middleware()) return;

      if(filteredResults.length) {
        mediaTab.itemsTab.append(group.container);
      }
      this.afterPerforming(filteredResults.length, mediaTab);

      this.loaded[mediaTab.type] = true;
      return;
    }

    const myTopApps = await managers.appUsersManager.getTopPeers('bots_app');
    // * the next query's load would take a paging callback made here for its own (`_loadMoreApps`)
    if(!middleware()) return;

    // * the groups go in together, once they have their rows - not the first one before the popular apps
    const rendering: [SearchGroup, Promise<any>][] = [];
    if(myTopApps.length) {
      const group = createSearchGroup({name: 'MiniApps.Apps', type: 'apps', onFound: onClick, middleware});
      group.setActive();

      const SHOW_MORE_LIMIT = 5;
      if(myTopApps.length > SHOW_MORE_LIMIT) group.needShowMoreButton();

      rendering.push([group, this.renderPeerDialogs(myTopApps.map((app) => app.id.toPeerId(false)), group, middleware, 'bots')]);
    }

    const group = createSearchGroup({name: 'MiniApps.Popular', type: 'apps', onFound: onClick, middleware});
    group.setActive();

    type GetPopularAppsResult = ReturnType<typeof rootScope.managers.appAttachMenuBotsManager.getPopularAppBots>;
    let currentOffset: string = '', loadPromise: GetPopularAppsResult;
    const APPS_LIMIT_PER_LOAD = 20;

    const loadMoreApps = async() => {
      if(
        loadPromise ||
        !middleware() ||
        currentOffset === undefined
      ) return;

      loadPromise = rootScope.managers.appAttachMenuBotsManager.getPopularAppBots(currentOffset, APPS_LIMIT_PER_LOAD);
      const {nextOffset, userIds} = await loadPromise;

      await this.renderPeerDialogs(userIds.map((id) => id.toPeerId(false)), group, middleware, 'bots');
      // * a query that is over marks nothing loaded: `loaded` is the next one's by now
      if(!middleware()) return;

      currentOffset = nextOffset || undefined;
      loadPromise = undefined;

      if(!currentOffset) {
        this.loaded[mediaTab.type] = true;
      }
    }

    this._loadMoreApps = loadMoreApps;
    // * a held query's middleware is let go after the next one has set its own
    middleware.onClean(() => {
      if(this._loadMoreApps === loadMoreApps) {
        this._loadMoreApps = undefined;
      }
    });

    rendering.push([group, loadMoreApps()]);
    if(!await this.appendRenderedGroups(mediaTab, middleware, rendering)) return;

    this.afterPerforming(1, mediaTab);
  }

  globalPostsSearch: ReturnType<typeof wrapGlobalPostsSearch>;
  private async loadPosts({mediaTab, middleware}: SearchSuperLoadTypeOptions) {
    if(!this.globalPostsSearch) {
      this.globalPostsSearch = wrapGlobalPostsSearch({
        middleware,
        query: this.searchContext.query
      });
      mediaTab.itemsTab.append(this.globalPostsSearch.dom);
    }

    this.globalPostsSearch.loadMore();
  }

  private loadGifts(): Promise<void> {
    const mediaTab = this.mediaTabsMap.get('gifts');
    if(!mediaTab) return Promise.resolve();

    if(!this.stargiftsStore) {
      const middleware = this.middleware.get();
      createRoot((dispose) => {
        middleware.onClean(() => dispose());

        const scrollTarget = this.scrollable.container;

        const {render: giftsList, store, actions, setCollection, stopReorder} = StarGiftsProfileTab({
          peerId: this.searchContext.peerId,
          scrollParent: scrollTarget,
          selectionMount: this.navScrollableContainer,
          // * the media's selection, kept as the tabs are swiped, gives the row up - at once, or its transition would
          // * take the row's classes off the reorder's bar as it ends; a stories' plate gives way by itself
          onReorderStart: () => {
            if(this.selection?.isSelecting) {
              this.selection.cancelSelection(true);
            }
          },
          onCountChange: (count) => {
            this.setCounter('gifts', count);

            mediaTab.menuTab.classList.toggle('hide', count === 0);
            let needChangeActive = false
            if(count === 0) {
              needChangeActive = mediaTab.menuTab.classList.contains('active');
              mediaTab.menuTab.classList.remove('active');
            }
            this.updateContainerHidden(needChangeActive);
          }
        });
        createEffect(on(() => store.items, (items) => {
          if(items.length > 0 && store.chosenCollection === ALL_COLLECTIONS_ID) {
            this.setPinnedGifts(unwrap(items));
          }
        }))
        this.stargiftsStore = store;
        this.stargiftsActions = actions;
        this.stargiftsSetCollection = setCollection;
        this.stargiftsStopReorder = stopReorder;

        mediaTab.itemsTab.append(getFirstChild(giftsList, (v) => v instanceof Element) as Element);

        if(this.mediaTab?.type === 'gifts') {
          this.onChangeTab?.(this.mediaTab);
        }
      });
      return Promise.resolve();
    }

    if(this.stargiftsStore.loading || this.stargiftsStore.loaded) {
      return Promise.resolve();
    }

    return this.stargiftsActions.loadNext();
  }

  private loadType(options: SearchSuperLoadTypeOptions) {
    const managers = bindManagersToSession(this.managers);
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
      promise = this.loadSimilarPeers(options);
    } else if(type === 'botPreviews') {
      promise = this.loadBotPreviews(options);
    } else if(type === 'savedDialogs') {
      promise = this.loadSavedDialogs(options);
    } else if(type === 'channels') {
      promise = this.loadChannels(options);
    } else if(type === 'apps') {
      promise = this.loadApps(options);
    } else if(type === 'posts') {
      promise = this.loadPosts(options);
    } else if(type === 'gifts') {
      promise = this.loadGifts();
    }

    if(promise) {
      return this.loadPromises[type] = promise.finally(() => {
        if(!middleware()) {
          return;
        }

        this.loadPromises[type] = null;

        this.refiller.schedule(type, middleware);
      });
    }

    const history = this.historyStorage[inputFilter] ??= [];

    if(inputFilter === 'inputMessagesFilterEmpty' && !history.length && type !== 'saved') {
      if(!this.loadedChats) {
        const loadChatsPromise = this.loadChatsPromise;
        this.loadChats().then(() => loadChatsPromise.resolve(), () => loadChatsPromise.resolve());
        this.loadedChats = true;
      }

      if(
        !this.searchContext.query.trim() &&
        !this.searchContext.peerId &&
        !this.searchContext.communityId &&
        !this.searchContext.minDate &&
        this.searchContext.folderId !== FOLDER_ID_ARCHIVE
      ) {
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

          // * a mid can have no message behind it (deleted, or a synthetic bound), skip such holes
          const notFilteredMessages = ids.map((m) => apiManagerProxy.getMessageByPeer(m.peerId, m.mid)).filter(Boolean);
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
        return this.performSearchResult({messages, mediaTab}).finally(() => {
          this.refiller.schedule(type, middleware);
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
      const value = await managers.appMessagesManager.getHistory(options);

      let messages = value.messages;
      if(!messages && value.history/*  && mediaTab.type === 'saved' */) {
        messages = value.history.map((mid) => apiManagerProxy.getMessageByPeer(options.peerId, mid));
      }

      // * a mid can have no message behind it (deleted, or a synthetic bound), skip such holes
      messages = messages.filter(Boolean);

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
                  this.refiller.schedule(type, middleware);
                });
              }
            }
          }, 0);
        });
      }

      // if(value.history.length) {
      return this.performSearchResult({messages: this.filterMessagesByType(messages, inputFilter), mediaTab});
      // }
    }).catch((err) => {
      this.log.error('load error:', err);
    }).finally(() => {
      // * not the next query's load of the tab, which another load has to wait for
      if(this.loadPromises[type] === promise) {
        this.loadPromises[type] = null;
      }
    });

    return promise;
  }

  /**
   * How far a tab has got, for `ScrollableRefiller`: fetched messages plus the
   * ones already rendered out of them. Both only ever grow within a peer (and
   * `cleanup` resets the refiller along with them), which is what makes the
   * refill chain terminate.
   *
   * This is the exact state behind `canLoadMediaTab`'s second clause: the
   * `justLoad` preload grows `historyStorage` WITHOUT rendering, and the only
   * thing that renders the remainder into a list too short to scroll is the
   * chain. A tab with no `inputFilter` — saved dialogs, stories, gifts, apps,
   * posts — has no such state and no cache to drain, so it reports a flat 0 and
   * gets the one check after a load that asks "is the viewport full yet"; its
   * list owns whatever paging comes after that.
   */
  private getMediaTabProgress(type: SearchSuperMediaType) {
    const inputFilter = this.mediaTabsMap.get(type)?.inputFilter;
    if(!inputFilter) {
      return 0;
    }

    return Math.max(0, this.usedFromHistory[inputFilter] ?? 0) + (this.historyStorage[inputFilter]?.length ?? 0);
  }

  private canLoadMediaTab(mediaTab: SearchSuperMediaTab) {
    if(mediaTab.type === 'gifts') {
      return !this.stargiftsStore || (!this.stargiftsStore.loading && !this.stargiftsStore.loaded);
    }

    const inputFilter = mediaTab.inputFilter;
    return !this.loaded[mediaTab.type] || (this.historyStorage[inputFilter] && this.usedFromHistory[inputFilter] < this.historyStorage[inputFilter].length);
  }

  private isPeerSensitive(peerId: PeerId) {
    return isSensitive((usePeer(peerId) as User.user)?.restriction_reason || []);
  }

  private isMessageSensitive(message: Message.message) {
    return this.isPeerSensitive(message.peerId) || isMessageSensitive(message);
  }

  public getSearchCounters(filters: MessagesFilter[], canCache = true) {
    const {peerId, threadId} = this.searchContext;
    return this.managers.appMessagesManager.getSearchCounters(peerId, filters, canCache, threadId);
  }

  private async loadFirstTime() {
    const middleware = this.middleware.get();
    const {peerId, threadId} = this.searchContext;
    if(!this.hideEmptyTabs) {
      return;
    }

    const mediaTabs = this.mediaTabs.filter(isCounterDrivenMediaTab);
    const filterTypes = new Set(mediaTabs.map((mediaTab) => mediaTab.inputFilter));
    if(this.mediaTabsMap.has('media')) {
      filterTypes.add('inputMessagesFilterPhotos');
      filterTypes.add('inputMessagesFilterVideo');
    }
    const filters = Array.from(filterTypes, (inputFilter) => ({_: inputFilter} as MessagesFilter));

    // * the similar peers are a request of their own, which the other tabs do not wait for: their tab comes
    // * with the others if they are there by then, and after them if not (tdesktop, Android)
    let canViewSimilar: boolean;
    const canViewSimilarPromise = this.canViewSimilar().then((canView) => canViewSimilar = canView);

    const [
      counters,
      canViewSavedDialogs,
      canViewSaved,
      canViewMembers,
      canViewGroups,
      canViewStories,
      canViewGifts,
      canViewBotPreviews,
      profileTabsData,
      maybePinnedGifts
    ] = await Promise.all([
      this.getSearchCounters(filters),
      this.canViewSavedDialogs(),
      this.canViewSaved(),
      this.canViewMembers(),
      this.canViewGroups(),
      this.canViewStories(),
      this.canViewGifts(),
      this.canViewBotPreviews(),
      this.getProfileTabsData(),
      peerId === rootScope.myId && this.managers.appGiftsManager.getPinnedGifts(peerId)
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

    if(this.mediaTabsMap.has('media')) {
      const photos = counters.find((counter) => counter.filter._ === 'inputMessagesFilterPhotos')?.count;
      const videos = counters.find((counter) => counter.filter._ === 'inputMessagesFilterVideo')?.count;
      this.setMediaCounters({photos, videos});
    }

    let count = 0;
    mediaTabs.forEach((mediaTab) => {
      const counter = counters.find((c) => c.filter._ === mediaTab.inputFilter);

      mediaTab.menuTab.classList.toggle('hide', !counter.count);
      mediaTab.menuTab.classList.remove('active');
      // mediaTab.contentTab.classList.toggle('hide', !counter.count);

      this.setCounter(mediaTab.type, counter.count);

      if(counter.count) {
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
    const botPreviewsTab = this.mediaTabsMap.get('botPreviews');

    const giftsCount = profileTabsData.giftsCount ?? 0;
    const showGiftsTab = canViewGifts && giftsCount !== 0;

    const a: [SearchSuperMediaTab, boolean][] = [
      [savedDialogsTab, canViewSavedDialogs],
      [savedTab, canViewSaved],
      [storiesTab, canViewStories],
      [membersTab, canViewMembers],
      [groupsTab, canViewGroups],
      [similarTab, !!canViewSimilar],
      [giftsTab, showGiftsTab],
      [botPreviewsTab, canViewBotPreviews]
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
      this.setMediaTabName(storiesTab, peerId.isUser() ? 'Stories' : 'ProfileStories');
    }

    if(similarTab) {
      this.setMediaTabName(similarTab, peerId.isUser() ? 'SimilarBots' : 'SimilarChannels');
      if(canViewSimilar === undefined) {
        canViewSimilarPromise.then((canView) => {
          if(canView && middleware()) {
            this.setMediaTabHidden(similarTab, false);
          }
        });
      }
    }

    if(maybePinnedGifts) {
      this.setPinnedGifts(maybePinnedGifts);
    }

    const mainMediaTabType = getMediaTypeForProfileTab(profileTabsData.mainTab);
    this.setMainMediaTab(mainMediaTabType);
    // * open on the first visible tab, the main one leading (tdesktop, Android)
    const firstMediaTab = this.getFirstVisibleMediaTab();

    this.toggleContainerHidden(!firstMediaTab);
    if(firstMediaTab) {
      this.skipScroll = true;
      this.selectTab(this.mediaTabs.indexOf(firstMediaTab), false);
      // * and it comes in whole, once its first page is in - not as an empty section filling up
      if(isMediaTabBlank(firstMediaTab) && this.canLoadMediaTab(firstMediaTab)) {
        this.loadHeld(firstMediaTab);
      }
      // firstMediaTab.menuTab.classList.add('active');

      const isSingle = count <= 1;
      this.navScrollableContainer.classList.toggle('is-single', isSingle);
      this.menuGradient.classList.toggle('hide', isSingle);
    }
  }

  private toggleContainerHidden(hidden: boolean) {
    this.container.classList.toggle('hide', hidden);
    this.container.parentElement.classList.toggle('search-empty', hidden);
  }

  private updateContainerHidden(changeActive = false) {
    this.setMainMediaTab(this.mainMediaTabType);
    const visibleTabs = this.mediaTabs.filter((tab) => !tab.menuTab.classList.contains('hide'));
    this.toggleContainerHidden(visibleTabs.length === 0);
    const isSingle = visibleTabs.length <= 1;
    this.navScrollableContainer.classList.toggle('is-single', isSingle);
    this.menuGradient.classList.toggle('hide', isSingle);
    if(changeActive && visibleTabs.length) {
      this.selectTab(this.mediaTabs.indexOf(visibleTabs[0]), false);
    }
  }

  private getSearchGroupsList() {
    return this.searchGroups ? Object.values(this.searchGroups) : [];
  }

  private canAnimateResults(mediaTab: SearchSuperMediaTab) {
    return this.mediaTab === mediaTab &&
      liteMode.isAvailable('animations') &&
      !document.hidden &&
      this.container.isConnected;
  }

  /**
   * A new query for the search on screen. What the tab in view shows stays until the new results
   * are in (`holdTab`) and then gives way to them in one go - instead of the tab going blank and
   * filling up piece by piece. The other tabs are emptied, as `cleanupHTML` does
   */
  public changeQuery(query: Parameters<AppSearchSuper['setQuery']>[0]) {
    const mediaTab = this.mediaTab;
    this.holdTab(mediaTab);
    this.cleanupHTML(mediaTab);
    this.isHoldingQuery = true;
    this.setQuery(query);
    this.isHoldingQuery = false;
    this.revealWhenLoaded(mediaTab, this.load(true), true);
  }

  /**
   * The first load of a tab opened with nothing in it, or the one under way for it already: its results come in
   * at once, over what it showed
   */
  private loadHeld(mediaTab: SearchSuperMediaTab) {
    this.holdTab(mediaTab);
    this.revealWhenLoaded(mediaTab, this.loadPromises[mediaTab.type] || this.load(true));
  }

  /**
   * Loads a tab about to be opened - pointed at or pressed - out of sight, as opening it would: one
   * with nothing in it yet, once the query's first load is through. Opened while that runs, it is held for it
   */
  private prefetchMediaTab(mediaTab: SearchSuperMediaTab) {
    if(
      mediaTab === this.mediaTab ||
      this.firstLoad ||
      !PREFETCHED_MEDIA_TYPES.has(mediaTab.type) ||
      !isMediaTabBlank(mediaTab) ||
      !this.canLoadMediaTab(mediaTab)
    ) {
      return;
    }

    this.loadType({
      mediaTab,
      justLoad: false,
      loadCount: this.getLoadCount(),
      middleware: this.middleware.get(),
      side: 'bottom'
    }).catch((err) => {
      this.log.error('prefetch error:', err);
    });
  }

  /** A screenful of items and more, or a page ahead of the scroll (`justLoad`) */
  private getLoadCount(justLoad?: boolean) {
    return justLoad ? 50 : Math.round((windowSize.height / 130 | 0) * 3 * 1.25); // that's good for all types
  }

  /**
   * Keeps what a tab shows on screen while it loads: the chats tab's groups take the new rows aside
   * (`startDraft`), any other tab's content is moved as it is into a look-alike of its containers laid
   * over the tab (a ghost), the new content filling the tab hidden under it (`is-holding`)
   */
  private holdTab(mediaTab: SearchSuperMediaTab) {
    if(mediaTab.type === 'chats') {
      this.getSearchGroupsList().forEach((group) => group.startDraft());
      return;
    }

    const tabContainer = mediaTab.contentTab.parentElement;
    tabContainer.classList.add('is-holding');
    // * still on screen: the query before this one did not get its results either
    if(this.tabGhosts.has(mediaTab)) {
      return;
    }

    const {itemsTab} = mediaTab;
    const ghostOf = (element: HTMLElement): HTMLElement => {
      const clone = element.cloneNode(false) as HTMLElement;
      clone.removeAttribute('id');
      if(element === itemsTab) {
        clone.append(...Array.from(element.childNodes));
      } else {
        Array.from(element.children).forEach((child) => {
          clone.append(child.contains(itemsTab) ? ghostOf(child as HTMLElement) : child);
        });
      }

      return clone;
    };

    // * the content, and what stands next to it: a preloader, a "nothing found"
    const isBlank = isMediaTabBlank(mediaTab);
    const extras = Array.from(tabContainer.children).filter((child) => child !== mediaTab.contentTab);
    const ghost = this.createGhost(tabContainer, [ghostOf(mediaTab.contentTab), ...extras]);
    if(isBlank && !extras.length && PRELOADED_MEDIA_TYPES.has(mediaTab.type)) {
      putPreloader(ghost, true);
    }

    this.tabGhosts.set(mediaTab, ghost);
  }

  /** What a tab showed, laid over it (`.search-super-ghost`) */
  private createGhost(tabContainer: HTMLElement, content: Element[]) {
    const ghost = document.createElement('div');
    ghost.classList.add('search-super-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.append(...content);
    tabContainer.append(ghost);
    // * the rows were moved into it: their highlights of the query are found again
    reapplyTextHighlights(ghost);
    return ghost;
  }

  /** The tab's own content fades in under what it showed, which fades out and goes */
  private crossfadeFromGhost(tabContainer: HTMLElement, ghost: HTMLElement, onEnd: () => void) {
    const drop = () => {
      this.dropGhost(ghost);
      onEnd();
    };

    const options = getAnimatedOptions(getSearchTransitionDuration());
    Array.from(tabContainer.children).forEach((child) => {
      if(child !== ghost) {
        (child as HTMLElement).animate(CROSS_FADE_KEYFRAMES, options);
      }
    });
    ghost.animate(CROSS_FADE_KEYFRAMES.slice().reverse(), {...options, fill: 'forwards'}).finished.then(drop, drop);
  }

  /**
   * Shows what a held tab (`holdTab`) has loaded once it is all there. The chats tab gets its found
   * chats and its messages apart: if one of them takes too long, the other is shown, the slow one's
   * group holding what it showed until its own results come - or until even that has taken too long,
   * and then its group goes on adding what comes after (a draft that `merge`s)
   */
  private revealWhenLoaded(mediaTab: SearchSuperMediaTab, promise: Promise<any>, isNewQuery?: boolean) {
    const middleware = this.middleware.get();
    const settle = (promise: Promise<any>) => promise.then(() => {}, () => {});
    if(mediaTab.type !== 'chats') {
      // * only the results of the query before are kept no longer than that: a tab that showed nothing
      // * (`loadHeld`) has nothing to keep and waits for all of its own, as long as a late part would
      const wait = isNewQuery ? SEARCH_RESULTS_WAIT : SEARCH_RESULTS_WAIT + SEARCH_RESULTS_WAIT_LATE;
      Promise.race([settle(promise), pause(wait)]).then(() => {
        if(middleware()) {
          // * only a new query's reveal lets the queries before it go: a tab opened empty held none of theirs
          this.revealTab(mediaTab, {resetScroll: isNewQuery, isLast: isNewQuery});
        }
      });
      return;
    }

    const {messages, ...chats} = this.searchGroups;
    const parts = [{
      groups: [messages],
      // * the tab's own load is its first page of messages
      loaded: settle(promise)
    }, {
      groups: Object.values(chats),
      // * started by that load (`loadChats`)
      loaded: settle(this.loadChatsPromise)
    }].map((part) => {
      const state = {...part, isDone: false, isShown: false};
      state.loaded.then(() => state.isDone = true);
      return state;
    });

    let resetScroll = isNewQuery;
    const reveal = (revealed: typeof parts, merge?: boolean) => {
      revealed.forEach((part) => part.isShown = true);
      this.revealTab(mediaTab, {
        // * a part alone changes its own groups, the rest of the tab is not crossfaded with them
        groups: revealed.length === parts.length ? undefined : flatten(revealed.map((part) => part.groups)),
        resetScroll,
        merge,
        isLast: isNewQuery && !merge && parts.every((part) => part.isShown)
      });
      resetScroll = false;
    };

    Promise.race([Promise.all(parts.map((part) => part.loaded)), pause(SEARCH_RESULTS_WAIT)]).then(() => {
      if(!middleware()) {
        return;
      }

      const done = parts.filter((part) => part.isDone);
      if(done.length) {
        reveal(done);
      }

      parts.filter((part) => !part.isDone).forEach((part) => {
        Promise.race([part.loaded, pause(SEARCH_RESULTS_WAIT_LATE)]).then(() => {
          if(!middleware()) {
            return;
          }

          if(part.isDone) {
            reveal([part]);
            return;
          }

          // * shown as it is, the rest added as it comes
          reveal([part]);
          part.groups.forEach((group) => group.startDraft(true));
          part.loaded.then(() => {
            if(middleware()) {
              reveal([part], true);
            }
          });
        });
      });
    });
  }

  /**
   * Puts what a held tab has loaded in place of what it showed: the chats tab's `groups` (all of them
   * by default), any other tab's ghost. The queries held on screen are let go after the `isLast` one
   */
  private revealTab(mediaTab: SearchSuperMediaTab, {resetScroll, merge, groups, isLast}: {
    resetScroll?: boolean,
    merge?: boolean,
    groups?: SearchGroup[],
    isLast?: boolean
  } = {}) {
    const animate = this.canAnimateResults(mediaTab);
    if(resetScroll && this.mediaTab === mediaTab) {
      this.scrollable.scrollPosition = 0;
    }

    // * the queries whose results were held on screen go once they are off it
    const retired = isLast ? this.middleware.takeRetired() : [];
    const release = () => this.middleware.release(retired);

    if(mediaTab.type === 'chats') {
      const isWhole = !groups;
      groups ??= this.getSearchGroupsList();
      const wasShown = this.getSearchGroupsList().some((group) => group.isShown);
      // * groups coming or going would move all there is below them: the tab crossfades as a whole
      if(animate && isWhole && !merge && wasShown && groups.some((group) => group.isShown !== group.willShow)) {
        const tabContainer = mediaTab.contentTab.parentElement;
        const content = mediaTab.contentTab.cloneNode(false) as HTMLElement;
        content.append(...groups.filter((group) => group.isShown).map((group) => group.ghost()));
        const ghost = this.createGhost(tabContainer, [content]);
        commitSearchGroups(groups, {animate: false});
        this.crossfadeFromGhost(tabContainer, ghost, release);
        return;
      }

      commitSearchGroups(groups, {
        animate,
        // * nothing around to make room in: the groups that come fade in where they stand
        fadeOnly: !wasShown
      }).then(release);
      return;
    }

    const tabContainer = mediaTab.contentTab.parentElement;
    tabContainer.classList.remove('is-holding');
    const ghost = this.tabGhosts.get(mediaTab);
    if(!ghost) {
      release();
      return;
    }

    this.tabGhosts.delete(mediaTab);
    if(!animate) {
      this.dropGhost(ghost);
      release();
      return;
    }

    this.crossfadeFromGhost(tabContainer, ghost, release);
  }

  private dropGhost(ghost: HTMLElement) {
    const rows = Array.from(ghost.querySelectorAll(DIALOG_LIST_ELEMENT_TAG)).filter((row) => (row as any).dialogElement);
    destroySearchRows(rows);
    ghost.remove();
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

    const loadCount = this.getLoadCount(justLoad);

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


  public setPinnedGifts(gifts: MyStarGift[]) {
    const giftsTab = this.mediaTabsMap.get('gifts')
    const menuTabName = giftsTab?.menuTabName
    if(!menuTabName) return;
    menuTabName.classList.add('search-super-pinned-gifts-wrap');
    Promise.all(gifts.slice(0, 3).map(async(gift) => {
      const div = document.createElement('div');
      await wrapSticker({
        div,
        static: true,
        doc: gift.sticker,
        middleware: this.middleware.get(),
        width: 18,
        height: 18
      }).then(({render}) => render);
      return div
    })).then((gifts) => {
      let wrap = menuTabName.querySelector('.search-super-pinned-gifts')
      if(gifts.length === 0) {
        wrap?.remove();
        return;
      }

      if(!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'search-super-pinned-gifts';
        menuTabName.append(wrap);
      }
      wrap.replaceChildren(...gifts);
    })
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

    if(peerId === rootScope.myId) {
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

  // * a profile of a bot (not a topic of it)
  private isBotProfile() {
    const {peerId, threadId} = this.searchContext;
    return !threadId && peerId.isUser() && !!apiManagerProxy.getUser(peerId.toUserId())?.pFlags.bot;
  }

  public async canViewSimilar() {
    const {peerId, threadId} = this.searchContext;
    if(!this.mediaTabsMap.has('similar') || threadId || (peerId.isUser() && !this.isBotProfile())) {
      return false;
    }

    try {
      const {peers} = await this.getSimilarPeers();
      return !!peers.length;
    } catch(err) {
      return false;
    }
  }

  public async canViewBotPreviews() {
    if(!this.mediaTabsMap.has('botPreviews') || !this.isBotProfile()) {
      return false;
    }

    const userFull = await this.managers.appProfileManager.getProfile(this.searchContext.peerId.toUserId());
    return !!userFull.bot_info?.pFlags.has_preview_medias;
  }

  public canViewGifts() {
    return !this.searchContext.threadId && this.mediaTabsMap.has('gifts');
  }

  public async getProfileTabsData() {
    const {peerId, threadId} = this.searchContext;
    if(threadId) {
      return {};
    }

    const full = await this.managers.appProfileManager.getProfileByPeerId(peerId);
    const profile = full as UserFull.userFull | ChatFull.channelFull;
    return {
      giftsCount: profile.stargifts_count ?? 0,
      mainTab: this.useMainProfileTab ? profile.main_tab : undefined
    };
  }

  public cleanup() {
    ++this.mediaFilterChangeId;
    ++this.mediaCountersRefreshId;
    ++this.mediaCountersVersion;
    this.mediaCounters = {};
    this.onMediaCountersChange?.();
    this.mediaFilterCommittedState = undefined;
    this.mediaFilterStagingItemsTab = undefined;
    const mediaTab = this.mediaTabsMap.get('media');
    if(mediaTab?.inputFilter && mediaTab.itemsTab) {
      this.mediaFilterCommittedInputFilter = mediaTab.inputFilter as SearchSuperMediaInputFilter;
      this.tabs[mediaTab.inputFilter] = mediaTab.itemsTab as HTMLDivElement;
    }
    this.loadPromises = {};
    this.loaded = {};
    this.refiller.reset();
    this.loadedChats = false;
    this.nextRates = {};
    this.firstLoad = true;
    this.prevTabId = -1;
    this.counters = {};
    this.setMainMediaTab();

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

    this.middleware.next(this.isHoldingQuery);
    this.loadFirstTimePromise = undefined;
    this.loadChatsPromise = deferredPromise<void>();
    this.searchGroupMedia = undefined;
    this.cleanScrollPositions();

    this.membersList = undefined;
    this.membersParticipantMap = undefined;
    this.membersMiddlewareHelper?.destroy();
    this.membersMiddlewareHelper = undefined;
    this.globalPostsSearch = undefined;
    // * the last query's paging, whose middleware may be let go only once its results are off screen
    this._loadMoreApps = undefined;
    this._loadSavedDialogs = undefined;
    this.botPreviews = undefined;
  }

  public cleanScrollPositions() {
    this.mediaTabs.forEach((mediaTab) => {
      mediaTab.scroll = undefined;
    });
  }

  public updateScrollDateBadge(canShow: boolean) {
    const mediaTab = this.mediaTab;
    if(!canShow || !supportsSharedMediaScrollDate(mediaTab?.type)) {
      this.scrollDateBadge?.hide();
      return;
    }

    this.scrollDateBadge ??= createSharedMediaScrollDateBadge({
      mount: (element) => this.tabsContainer.before(element),
      getAnchorTop: () => this.navScrollableContainer.getBoundingClientRect().bottom,
      getItems: () => {
        const mediaTab = this.mediaTab;
        return mediaTab.type === 'stories' ?
          mediaTab.contentTab.querySelectorAll<HTMLElement>('.stories-album-content .search-super-item[data-timestamp]') :
          mediaTab.itemsTab.children;
      }
    });
    this.scrollDateBadge.update(true);
  }

  /**
   * Empties the tabs for a new query or peer. `keep` is the tab held on screen (`changeQuery`): the
   * chats tab's groups stay where they are, getting the new rows aside, and the scroll stays until the
   * new results are shown
   */
  public cleanupHTML(keep?: SearchSuperMediaTab) {
    this.scrollDateBadge?.reset();

    this.mediaTabs.forEach((tab) => {
      if(tab === keep && tab.type === 'chats') {
        return;
      }

      // * held for a query that is over (`loadHeld`, opened and left before it was shown): what it waited
      // * for is not coming, and the next load must not fill it out of sight
      const ghost = tab !== keep && this.tabGhosts.get(tab);
      if(ghost) {
        this.tabGhosts.delete(tab);
        this.dropGhost(ghost);
        tab.contentTab.parentElement.classList.remove('is-holding');
      }

      tab.itemsTab.replaceChildren();
      if(tab.type === 'chats') {
        // * out of the tab with it, not to come back with what they showed when it loads again
        this.getSearchGroupsList().forEach((group) => {
          group.discardDraft();
          group.clear();
        });
      }

      if(tab.hideOn) {
        tab.hideOn.classList.add('hide');
      }

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
        const extras = getTabExtras(parent);
        if(!extras.some((element) => element.classList.contains('preloader'))) {
          putPreloader(parent, true);
        }

        extras.find((element) => element.classList.contains('content-empty'))?.remove();
      }
    });

    // * the media tab's group of messages is made for each query; one held in a ghost leaves with it
    const searchGroupMedia = this.searchGroupMedia;
    if(searchGroupMedia && !searchGroupMedia.container.closest('.search-super-ghost')) {
      searchGroupMedia.clear();
      searchGroupMedia.container.remove();
    }

    if(!keep) {
      this.scrollable.scrollPosition = 0;
    }
  }

  private copySearchContext(newInputFilter: MyInputMessagesFilter, nextRate: number, skipSensitive: boolean) {
    const context = copy(this.searchContext) as MediaSearchContext;
    context.inputFilter = {_: newInputFilter};
    context.nextRate = nextRate;
    context.skipSensitive = skipSensitive;
    return context;
  }

  public setQuery({peerId, query, threadId, historyStorage, folderId, minDate, maxDate, chatType, communityId}: {
    peerId: PeerId,
    query?: string,
    threadId?: number,
    historyStorage?: AppSearchSuper['historyStorage'],
    folderId?: number,
    minDate?: number,
    maxDate?: number
  } & Pick<RequestHistoryOptions, 'chatType' | 'communityId'>) {
    this.searchContext = {
      peerId,
      query: query || '',
      inputFilter: {_: this.mediaTab.inputFilter},
      threadId,
      folderId,
      minDate,
      maxDate,
      chatType,
      communityId
    };

    this.historyStorage = historyStorage ?? {};

    this.cleanup();
  }

  public destroy() {
    this.getSearchGroupsList().forEach((group) => group.discardDraft());
    this.tabGhosts.forEach((ghost) => this.dropGhost(ghost));
    this.tabGhosts.clear();
    this.cleanup();
    // * cleaning ends what is loading, the destructors registered on it (a video's source) run only here
    this.middleware.destroy();
    this.listenerSetter.removeAll();
    this.disposeNav?.();
    this.disposeNav = undefined;
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

// a method edited here takes effect on the open shared media and search tabs, without a reload (see @helpers/hotRegistry)
if(import.meta.hot) import.meta.hot.accept();
