import type {MyDialogFilter} from '@lib/storages/filters';
import type {Dialog, ForumTopic, MyMessage, RequestHistoryOptions, SavedDialog} from '@appManagers/appMessagesManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {State} from '@config/state';
import type {AnyDialog} from '@lib/storages/dialogs';
import type {CustomEmojiRendererElement} from '@customEmoji/renderer';
import PopupElementTsx from '@components/popups/indexTsx';
import DialogsContextMenu from '@components/dialogsContextMenu';
import DialogsSelection from '@components/dialogsSelection';
import type {DialogsSelectionBase} from '@components/dialogsSelectionBase';
import DotRenderer from '@components/dotRenderer';
import {setChatListForumOpen, useChatListNarrow, useFolderTagsShown} from '@stores/folderTags';
import {horizontalMenuObjArgs} from '@components/horizontalMenu';
import Scrollable from '@components/scrollable';
import {ScrollableContextValue} from '@components/scrollable2';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import {logger, LogTypes} from '@lib/logger';
import rootScope from '@lib/rootScope';
import appImManager, {AppImManager} from '@lib/appImManager';
import {APP_TABS} from '@lib/appColumns';
import Button from '@components/button';
import SetTransition from '@components/singleTransition';
import {MyDraftMessage} from '@appManagers/appDraftsManager';
import {MOUNT_CLASS_TO} from '@config/debug';
import Modes from '@config/modes';
import {changeTitleEmojiColor} from '@components/peerTitle';
import I18n, {FormatterArguments, i18n, LangPackKey, _i18n} from '@lib/langPack';
import findUpClassName from '@helpers/dom/findUpClassName';
import findUpTag from '@helpers/dom/findUpTag';
import lottieLoader from '@lib/lottie/lottieLoader';
import wrapPhoto from '@components/wrappers/photo';
import {AppEditFolderTab} from '@components/solidJsTabs/tabs';
import appSidebarLeft from '@components/sidebarLeft';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import replaceContent from '@helpers/dom/replaceContent';
import {getAnimatedOptions} from '@helpers/dom/crossfadeContent';
import liteMode from '@helpers/liteMode';
import highlightText from '@helpers/dom/textHighlight';
import ConnectionStatusComponent from '@components/connectionStatus';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {doubleRaf, fastRafPromise} from '@helpers/schedulers';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import handleTabSwipe from '@helpers/dom/handleTabSwipe';
import {ChatlistContacts, createChatlistContacts} from '@components/sidebarLeft/chatlistContacts';
import {setSendingStatus} from '@components/sendingStatus';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, NULL_PEER_ID, REAL_FOLDERS} from '@appManagers/constants';
import {ChatlistsChatlistUpdates, DialogFilter, Message, MessageMedia, MessageReplyHeader, Photo} from '@layer';
import mediaSizes from '@helpers/mediaSizes';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {AppManagers, TabManagers} from '@lib/managers';
import appSidebarRight from '@components/sidebarRight';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import renderDialogSubtitleParts from '@components/wrappers/dialogSubtitle';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import getMessageForReplyContent from '@components/wrappers/messageForReplyContent';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import isMessageRestricted, {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getMessageSenderPeerIdOrName from '@appManagers/utils/messages/getMessageSenderPeerIdOrName';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import getProxiedManagers from '@lib/getProxiedManagers';
import deferredPromise from '@helpers/cancellablePromise';
import middlewarePromise from '@helpers/middlewarePromise';
import appDownloadManager from '@lib/appDownloadManager';
import groupCallsController from '@lib/calls/groupCallsController';
import callsController from '@lib/calls/callsController';
import conferenceInvitesController from '@lib/calls/conferenceInvitesController';
import cancelEvent from '@helpers/dom/cancelEvent';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import apiManagerProxy from '@lib/apiManagerProxy';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import getDialogMentionBadgeState from '@helpers/dialogMentionBadgeState';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import formatNumber from '@helpers/number/formatNumber';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMediaTab';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';
import shake from '@helpers/dom/shake';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import {AppChatFoldersTab} from '@components/solidJsTabs/tabs';
import eachTimeout from '@helpers/eachTimeout';
import showSharedFolderInvitePopup from '@components/popups/sharedFolderInvite';
import showChatPreviewPopup, {chatPreviewAnchorFromDialogRow} from '@components/popups/chatPreview';
import showLimitPopup from '@components/popups/limit';
import StoriesList from '@components/stories/list';
import {render} from 'solid-js/web';
import Icon from '@components/icon';
import {isDialog, isForumTopic, isMonoforumDialog, isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import {ChatType} from '@components/chat/chatType';
import rtmpCallsController from '@lib/calls/rtmpCallsController';
import IS_LIVE_STREAM_SUPPORTED from '@environment/liveStreamSupport';
import createFolderContextMenu from '@helpers/dom/createFolderContextMenu';
import {useAppSettings} from '@stores/appSettings';
import {unwrap} from 'solid-js/store';
import wrapMediaSpoiler from '@components/wrappers/mediaSpoiler';
import type {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import {renderPendingSuggestion} from '@components/sidebarLeft/pendingSuggestion';
import {renderNewAuthorization} from '@components/sidebarLeft/newAuthorization';
import {renderUnreadOnlyBar} from '@components/sidebarLeft/unreadOnlyBar';
import useChatListUnreadOnly from '@stores/chatListUnreadOnly';
import {useHasFolders} from '@stores/foldersSidebar';
import {useAppState} from '@stores/appState';
import {BADGE_TRANSITION_TIME} from '@components/autonomousDialogList/constants';
import {AutonomousDialogList} from '@components/autonomousDialogList/dialogs';
import {PossibleDialog, setDialogTyping} from '@components/autonomousDialogList/base';
import {ForumTab} from '@components/forumTab/forumTab';
import findForumTabByPeerId from '@components/forumTab/findForumTabByPeerId';
import shouldOpenForumAsNavigationTab from '@components/forumTab/communityOpenMode';
import isCommunityChat from '@appManagers/utils/communities/isCommunity';
import {getCommunityPeerSubtitle} from '@components/communities/communityPeerStatus';
import {fillForumTabRegister} from '@components/forumTab/fillRegister';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {fastSmoothScrollToStart} from '@helpers/fastSmoothScroll';
import ArchiveDialog, {archiveDialogTagName} from '@components/archiveDialog';
import {createArchiveDialogContextMenu} from '@components/archiveDialogContextMenu';
import {children, createEffect, createRoot, createSignal, on, untrack} from 'solid-js';
import useFolders from '@stores/folders';
import FoldersTabs from '@components/foldersTabs';
import clamp from '@helpers/number/clamp';
import debounce from '@helpers/schedulers/debounce';
import confirmationPopup from '@components/confirmationPopup';
import ListenerSetter from '@helpers/listenerSetter';
import type {PopupPeerHandle} from '@components/popups/peer';
import {toastNew} from '@components/toast';
import {
  renderChatlistTopNotification,
  type ChatlistTopNotificationController
} from '@components/sidebarLeft/chatlistTopNotification';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {DialogElement, findDialogListElement, setPromiseMiddleware, disposeTextHighlight, setDialogSubtitle, isRenderedSubtitleIntact, getFolderTitleTextColor} from '@components/dialogElement';
import type {DialogDom, DialogElementOptions} from '@components/dialogElement';
import createStyleRule from '@helpers/dom/createStyleRule';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';

// below this many dialogs the sidebar looks empty, so contacts are offered under the chat list
const MIN_DIALOGS_WITHOUT_CONTACTS = 10;

// const testScroll = false;
// let testTopSlice = 1;

type FilterRendered = {
  id: number,
  container: HTMLElement,
  scrollable: Scrollable,
  topNotification?: ChatlistTopNotificationController,
  topNotificationContainer?: HTMLElement,
  topNotificationData?: {
    _: 'chatlistUpdates',
    chatlistUpdates: ChatlistsChatlistUpdates
  }
};

type GetDialogOptions = {
  threadOrSavedId?: number;
  monoforumParentPeerId?: number;
};

type InitDialogAdditionalOptions = {
  isBatch?: boolean,
  dialog?: AnyDialog,
  lastMessage?: MyMessage,
  onInitPromise?: (promise: Promise<unknown>) => void
};

const TEST_TOP_NOTIFICATION = true ? undefined : (): ChatlistsChatlistUpdates => ({
  _: 'chatlists.chatlistUpdates',
  chats: [],
  users: [],
  missing_peers: [{
    _: 'peerUser',
    user_id: rootScope.myId.toUserId()
  }]
});


/**
 * Which selection governs which chat list. The main list and the archive share one (the chats of
 * whichever folder is on screen); an open forum tab has its own, for its topics - so a row is asked
 * about through the list it is in rather than through one selection everybody knows.
 */
const SELECTION_BY_LIST: WeakMap<HTMLElement, DialogsSelectionBase> = new WeakMap();

export class AppDialogsManager {
  public chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;

  /** Selecting several chats at once and acting on all of them, from the list that is on screen */
  public selection = new DialogsSelection({
    managers: rootScope.managers,
    // * the bar stands in for the header of whichever sidebar tab the list on screen lives in -
    // * the main one, the archive - so it is taken from that list rather than looked up by name
    getHeader: () => {
      const tab = findUpClassName(this.xd?.sortedList?.list, 'sidebar-slider-item') ||
        appSidebarLeft.sidebarEl.querySelector('.item-main');
      return tab?.querySelector('.sidebar-header');
    },
    getFilterId: () => this.filterId,
    getSortedList: () => this.xd?.sortedList,
    getDialogKey: (element) => this.xd?.getDialogKeyFromElement(element),
    isListNarrow: () => this.isChatListNarrow(),
    // the archive is a tab of its own beside the main one, so the drag is listened for over both
    listContainer: this.chatsContainer?.closest<HTMLElement>('.sidebar-slider')
  });

  private log = logger('DIALOGS', LogTypes.Log | LogTypes.Error | LogTypes.Warn | LogTypes.Debug);

  public contextMenu: DialogsContextMenu;

  public filterId: number;
  public folders: {[k in 'menu' | 'container' | 'menuScrollContainer' | 'menuGradient']: HTMLElement} = {
    menu: undefined,
    menuScrollContainer: undefined,
    menuGradient: undefined,
    container: document.getElementById('folders-container')
  };
  private filtersRendered: {
    [filterId: string]: FilterRendered
  } = {};
  private showFiltersPromise: Promise<void>;

  private lastActiveElements: Set<HTMLElement> = new Set();

  private contactsPlaceholder: ChatlistContacts;

  private initedListeners = false;

  public onListLengthChange: () => Promise<void>;
  private allChatsIntlElement: I18n.IntlElement;

  private emptyDialogsPlaceholderSubtitle: I18n.IntlElement;
  private updateContactsLengthPromise: Promise<number>;

  private filtersNavigationItem: NavigationItem;

  private managers: TabManagers;

  public doNotRenderChatList: boolean;
  public isFirstDialogsLoad: boolean;

  private stateMiddlewareHelper: MiddlewareHelper;

  private forumsTabs: Map<PeerId, ForumTab>;
  private forumsSlider: HTMLElement;
  private forumTabByPeerIdPromises = new Map<PeerId, Promise<void>>();
  private openForumTab: ForumTab;
  private forumNavigationItem: NavigationItem;

  public xd: AutonomousDialogList;
  public xds: {[filterId: number]: AutonomousDialogList} = {};
  // * the fades the open list is built again behind (`refillListFaded`), and which change of the
  // * mode they are of
  private listRefillAnimations: Animation[] = [];
  private listRefillGeneration = 0;
  // * the bar over the list follows the rows it tells about, which change behind a fade - not the mode
  private unreadOnlyBarShown = createSignal(false);
  private unreadOnlyBarContainer: HTMLElement;
  // * what the list fades through while it is built again (`refillListFaded`)
  private listCover: HTMLElement;

  public cancelChatlistUpdatesFetching: () => void;
  public fetchChatlistUpdates: () => void;

  private storiesListContainer: HTMLDivElement;
  private bottomPart: HTMLDivElement;
  private disposeStories: () => void;
  public resizeStoriesList: () => void;

  private suggestionContainer: HTMLElement;
  private authorizationContainer: HTMLElement;
  private foldersOverlay: HTMLElement;

  private lazyLoadQueue: LazyLoadQueue;

  public start() {
    const managers = this.managers = getProxiedManagers();

    this.contextMenu = new DialogsContextMenu(managers);
    this.stateMiddlewareHelper = getMiddleware();
    this.lazyLoadQueue = new LazyLoadQueue(5, true);

    // this.onListLengthChange = debounce(this._onListLengthChange, 100, false, true);
    this.onListLengthChange = () => void this._onListLengthChange();

    const bottomPart = this.bottomPart = document.createElement('div');
    bottomPart.classList.add('connection-status-bottom');
    bottomPart.append(this.folders.container);

    // Single absolute overlay sitting above the chatlist (#folders-container) that hosts every
    // panel currently rendered there: pending suggestion, folder tabs scrollable, gradient.
    // The panels flow naturally inside; only the overlay itself is absolutely positioned, so a
    // new panel above the tabs just stacks instead of overlapping (see _leftSidebar.scss).
    this.foldersOverlay = document.createElement('div');
    this.foldersOverlay.classList.add('chatlist-overlay');
    bottomPart.prepend(this.foldersOverlay);

    this.listCover = document.createElement('div');
    this.listCover.classList.add('chatlist-cover');

    // Surface the overlay's live height so the chatlist below can leave matching top padding —
    // .folders-scrollable reads var(--chatlist-overlay-height) for its padding-top. Given to the
    // scrollables alone: set on the container, it restyled the whole chat list on every frame a
    // plate in the overlay grew or shrank (createStyleRule)
    const overlayHeightRule = createStyleRule(bottomPart, '#folders-container .folders-scrollable');
    new ResizeObserver((entries) => {
      const height = entries[0].borderBoxSize?.[0]?.blockSize ?? entries[0].contentRect.height;
      overlayHeightRule.set('--chatlist-overlay-height', height + 'px');
    }).observe(this.foldersOverlay);

    const storiesListContainer = this.storiesListContainer = document.createElement('div');
    storiesListContainer.classList.add('stories-list');

    fillForumTabRegister();

    this.forumsTabs = new Map();
    this.forumsSlider = document.createElement('div');
    this.forumsSlider.classList.add('topics-slider');

    this.chatsContainer.parentElement.parentElement.append(this.forumsSlider);

    if(IS_TOUCH_SUPPORTED) {
      handleTabSwipe({
        element: this.folders.container,
        onSwipe: (xDiff) => {
          const folders = useFolders();
          const prevIndex = folders.selectedFolderIndex();
          const newIndex = clamp(
            xDiff < 0 ? prevIndex + 1 : prevIndex - 1,
            0,
            folders.folderItems.length - 1
          );
          folders.onClick()(newIndex);
        },
        verifyTouchTarget: () => {
          return !this.forumTab;
        }
      });
    }

    this.allChatsIntlElement = new I18n.IntlElement({
      key: 'FilterAllChatsShort'
    });

    rootScope.addEventListener('state_cleared', () => {
      this.setUnreadOnly(false);
      const clearCurrent = REAL_FOLDERS.has(this.filterId);
      this.xd.loadedDialogsAtLeastOnce = false;
      this.isFirstDialogsLoad = true;
      this.showFiltersPromise = undefined;

      if(clearCurrent) {
        this.xd.clear();
        this.onTabChange();
      }

      this.onStateLoaded(useAppState()[0]);
    });

    createRoot(() => {
      let scrollableContext: ScrollableContextValue;
      const element = FoldersTabs({
        scrollableProps: {
          class: 'folders-tabs-scrollable hide',
          ref: (ref) => {
            this.folders.menuScrollContainer = ref;
          },
          scrollableProps: {
            contextRef: (ref) => scrollableContext = ref
          }
        },
        menuProps: {
          id: 'folders-tabs',
          ref: (ref) => {
            this.folders.menu = ref;
            this.onRef(scrollableContext);
          }
        },
        gradientProps: {
          className: 'folders-tabs-gradient',
          color: 'surface',
          smaller: true,
          ref: (ref) => {
            this.folders.menuGradient = ref;
            ref.classList.add('hide');
          }
        }
      });

      const resolvedChildren = children(() => element).toArray();
      this.foldersOverlay.append(...resolvedChildren as any);
    });

    // * under the folder tabs, the last thing over the list
    const unreadOnlyBarContainer = this.unreadOnlyBarContainer = document.createElement('div');
    this.foldersOverlay.append(unreadOnlyBarContainer);
    renderUnreadOnlyBar(unreadOnlyBarContainer, {
      shown: this.unreadOnlyBarShown[0],
      onShowAll: () => this.showAllChatsFrom(unreadOnlyBarContainer)
    });

    const [appState] = useAppState();
    const [appSettings, setAppSettings] = useAppSettings();
    // * it should've had a better place :(
    appMediaPlaybackController.setPlaybackParams(unwrap(appSettings.playbackParams));
    // Persist the normalized params back once — `setPlaybackParams` clamps a stale >1
    // `volume` to [0, 1] and migrates the excess into the voice-only `boost`, so this
    // rewrites a corrupted stored value (e.g. volume: 1.04) instead of waiting for a change.
    setAppSettings('playbackParams', appMediaPlaybackController.getPlaybackParams());
    appMediaPlaybackController.addEventListener('playbackParams', (params) => {
      setAppSettings('playbackParams', params);
    });

    mediaSizes.addEventListener('resize', () => {
      this.changeFiltersAllChatsKey();
    });

    this.chatsContainer.append(bottomPart);

    setTimeout(() => {
      lottieLoader.loadLottieWorkers();
    }, 200);

    PopupElementTsx.MANAGERS = rootScope.managers = managers;
    appDownloadManager.construct(managers);
    appDownloadManager.showPollCancelConfirmation = (randomId: string) => this.showPollCancelConfirmation(randomId);
    appSidebarLeft.construct(managers);
    appSidebarRight.construct(managers);
    groupCallsController.construct(managers);
    callsController.construct(managers);
    conferenceInvitesController.construct(managers);
    appImManager.construct(managers);
    if(IS_LIVE_STREAM_SUPPORTED) rtmpCallsController.construct(managers);
    new ConnectionStatusComponent().construct(managers, this.chatsContainer, appSidebarLeft.inputSearch);

    // start

    this.xd = this.xds[this.filterId];

    appSidebarLeft.onCollapsedChange();
    this.onStateLoaded(appState);
  }

  /**
   * The tab is about to move to another account: the lists of this one go - every folder but All,
   * whose list is emptied - with the forum tabs, the stories and the selection made in them.
   * The navigation entries they pushed are dropped by the switch with the rest of the stack.
   */
  public closeForAccountSwitch() {
    this.stateMiddlewareHelper.clean();
    this.selection.cancelSelection();
    this.cancelChatlistUpdatesFetching?.();
    this.cancelChatlistUpdatesFetching =
      this.fetchChatlistUpdates =
      undefined;

    this.forumsTabs.forEach((forumTab) => forumTab.onCloseAfterTimeout());
    this.forumsTabs.clear();
    this.forumTabByPeerIdPromises.clear();
    if(this.forumTab) {
      this.forumTab = undefined;
      appSidebarLeft.sidebarEl.classList.remove('is-forum-visible');
      this.onSomeDrawerToggle?.();
      this.onChatListNarrowChange();
    }

    this.forumNavigationItem =
      this.filtersNavigationItem =
      undefined;

    this.disposeStories?.();
    this.disposeStories =
      this.resizeStoriesList =
      undefined;

    this.contactsPlaceholder && this.removeContactsPlaceholder();
    this.updateContactsLengthPromise = undefined;
    this.lastActiveElements.clear();

    for(const id in this.filtersRendered) {
      +id !== FOLDER_ID_ALL && this.destroyFilter(+id);
    }

    // * the folders sidebar lists them too: at once, with their lists
    useFolders().resetForAccountSwitch();
    this.filterId = FOLDER_ID_ALL;
    this.xd = this.xds[FOLDER_ID_ALL];
    this.xd.clear();
  }

  // * the counterpart of closeForAccountSwitch, once the tab is on the new account
  public openAfterAccountSwitch() {
    // * All is made anew rather than refilled: its list keeps more of the account than its rows - the
    // * archive above them, the communities projected into it - and fetches it as it is made
    this.destroyFilter(FOLDER_ID_ALL);
    this.addAllChatsFilter();
    this.xd = this.xds[FOLDER_ID_ALL];

    appSidebarLeft.onCollapsedChange();
    // * a new list is loaded the way the first one was: once, by picking its folder
    this.isFirstDialogsLoad = true;
    this.showFiltersPromise = undefined;
    this.onStateLoaded(useAppState()[0]);
    // * an account without folders adds none, and nothing else would hide the previous one's tabs
    this.onFiltersLengthChange();
  }

  private addAllChatsFilter() {
    this.addFilter({
      id: FOLDER_ID_ALL,
      title: {_: 'textWithEntities', text: '', entities: []},
      localId: FOLDER_ID_ALL
    });
  }

  private destroyFilter(filterId: number) {
    const elements = this.filtersRendered[filterId];
    elements.topNotification?.dispose();
    elements.container.remove();

    this.xds[filterId].destroy();
    delete this.xds[filterId];
    delete this.filtersRendered[filterId];
  }

  private onRef(scrollableContext: ScrollableContextValue) {
    this.setFilterId(FOLDER_ID_ALL);
    this.addAllChatsFilter();

    const {setSelectedFolderId, onClick, setOnClick, folderItems} = useFolders();
    const selectFolderByIndex = async(index: number) => {
      const id = folderItems[index]?.filter.id ?? FOLDER_ID_ALL;
      const wasFilterId = this.filterId;

      if(!await this.canOpenFolder(id)) {
        return false;
      }

      if(!IS_MOBILE_SAFARI) {
        if(index) {
          if(!this.filtersNavigationItem) {
            this.filtersNavigationItem = {
              type: 'filters',
              onPop: () => {
                onClick()(0);
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

      if(wasFilterId === id) {
        fastSmoothScrollToStart(this.xds[id].scrollable.container, 'y');
        return;
      }

      setSelectedFolderId(id);

      this.xds[id].clear();
      const promise = this.setFilterIdAndChangeTab(id);
      if(wasFilterId !== -1) {
        return promise;
      }
    };

    this.foldersOverlay.append(this.folders.menuScrollContainer);
    const selectTab = horizontalMenuObjArgs({
      tabs: this.folders.menu,
      content: this.folders.container,
      onClick: selectFolderByIndex,
      onTransitionEnd: () => {
        for(const folderId in this.xds) {
          if(+folderId !== this.filterId) {
            this.xds[folderId].clear();
          }
        }
      },
      scrollableX: scrollableContext,
      onChange: ({element, active}) => {
        const renderer: CustomEmojiRendererElement = element?.querySelector('custom-emoji-renderer-element');
        renderer?.setTextColor(getFolderTitleTextColor(active));
      }
    });

    setOnClick(() => selectTab);

    createFolderContextMenu({
      appSidebarLeft,
      appDialogsManager: this,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: this.managers,
      className: 'menu-horizontal-div-item',
      listenTo: this.folders.menu
    });
  }

  /**
   * Shows only unread chats, or every chat again - of the open folder, or of `filterId`, which is
   * then opened. A chat read while only unread ones are shown stays until the list is built again
   */
  public async setUnreadOnly(value: boolean, filterId = this.filterId) {
    const [unreadOnly, setUnreadOnly] = useChatListUnreadOnly();
    if(unreadOnly() === value && filterId === this.filterId) {
      return;
    }

    // * nothing changes for a folder that cannot be opened. Opening one closes what is open in the
    // * left sidebar first, and the archive closed gives the list back to the folder it was opened
    // * from - which may be this very one, so whether a folder is opened is asked again after
    if(filterId !== this.filterId && !await this.canOpenFolder(filterId)) {
      return;
    }

    const opensFolder = filterId !== this.filterId;
    if(unreadOnly() === value && !opensFolder) {
      return;
    }

    const generation = ++this.listRefillGeneration;
    setUnreadOnly(value);
    // * the selection belongs to the list as it was when it was made, and the list is built again:
    // * a chat it holds may be out of sight now, and still acted on
    this.selection.cancelSelection();

    // * a list that is not on screen is built again when it is opened. The archive is never filtered
    for(const id in this.xds) {
      if(+id !== FOLDER_ID_ARCHIVE && this.xds[id] !== this.xd) {
        this.xds[id].clear();
      }
    }

    if(!opensFolder && this.filterId !== FOLDER_ID_ARCHIVE) {
      void this.refillListFaded(this.xd, value, generation);
      return;
    }

    if(opensFolder) {
      // * the list leaving for the folder keeps its place under the bar that comes, until it is
      // * opened again (`onTabChange`)
      const leaving = this.xd.scrollable.container;
      leaving.style.paddingTop = getComputedStyle(leaving).paddingTop;
      const {folderItems, onClick} = useFolders();
      onClick()(folderItems.findIndex((item) => item.id === filterId));
    }

    // * the bar comes in place, over the list that slides away; a refill cut short ends here
    const [isBarShown, setBarShown] = this.unreadOnlyBarShown;
    const barComes = value && !isBarShown() && liteMode.isAvailable('animations');
    setBarShown(value);
    this.endListRefill();
    if(barComes) {
      this.fadeForRefill([[this.unreadOnlyBarContainer, 1]], 200);
    }
  }

  /**
   * Whether the folder can be opened - it may be over the limit, and whatever is open in the left
   * sidebar (a global search, stacked tabs) is closed first, the natural way: a tab that needs
   * confirmation still asks, and declined, the folder stays closed
   */
  private async canOpenFolder(filterId: number) {
    const available = this.filterId === -1 ||
      REAL_FOLDERS.has(filterId) ||
      (await rootScope.managers.filtersStorage.isFilterIdAvailable(filterId) ?? true);
    if(!available) {
      showLimitPopup('folders');
      return false;
    }

    return appSidebarLeft.closeEverythingInsideNaturally();
  }

  /**
   * Builds the open list again behind a fade through: what it showed fades out, and what it shows
   * now fades in as soon as its first page is there. It fades through the column's colour laid
   * over the rows (`.chatlist-cover`), not the rows' own opacity: an opacity animation on the
   * list makes the browser lift all of it into a layer of its own first, and a long list started
   * its fade late and then jumped. The bar over the list changes in between, at its full height,
   * so the rows are never seen moving down or up for it. A first page that takes its time (every
   * dialog is still being loaded) brings the skeleton of a loading list in
   */
  private async refillListFaded(xd: AutonomousDialogList, unreadOnly: boolean, generation: number) {
    const [isBarShown, setBarShown] = this.unreadOnlyBarShown;
    const bar = this.unreadOnlyBarContainer;
    const cover = this.listCover;
    if(!liteMode.isAvailable('animations')) {
      this.endListRefill();
      setBarShown(unreadOnly);
      await this.rebuildList(xd, generation);
      return;
    }

    if(!cover.isConnected) {
      this.bottomPart.append(cover);
    }

    // * the bar leaves with the rows it tells about; staying, it is brought back from a fade cut short
    const fadingOut = this.fadeForRefill(isBarShown() ? [[cover, 1], [bar, unreadOnly ? 1 : 0]] : [[cover, 1]], 150);
    try {
      await Promise.all(fadingOut.map((animation) => animation.finished));
    } catch{ // * cancelled by the next one
      return;
    }

    // * a bar that comes is held unseen while the rows load, to fade in with them
    if(unreadOnly && !isBarShown()) {
      this.fadeForRefill([[cover, 1], [bar, 0]], 0);
    }

    setBarShown(unreadOnly);
    // * another folder was opened meanwhile - in the mode already, and this list has left
    if(this.xd !== xd) {
      this.endListRefill();
      return;
    }

    await this.rebuildList(xd, generation);
    if(generation !== this.listRefillGeneration) {
      return;
    }

    // * the new rows are painted first: a fade started under their rendering is seen half done
    await doubleRaf();
    if(generation !== this.listRefillGeneration) {
      return;
    }

    const fadingIn = this.fadeForRefill(unreadOnly ? [[cover, 0], [bar, 1]] : [[cover, 0]], 200);
    try {
      await Promise.all(fadingIn.map((animation) => animation.finished));
    } catch{
      return;
    }

    if(generation === this.listRefillGeneration) {
      this.endListRefill();
    }
  }

  /**
   * Builds the list again, and waits for its first page - or, when that takes its time (every
   * dialog is still being loaded), brings the skeleton of a loading list in and waits no more
   */
  private async rebuildList(xd: AutonomousDialogList, generation: number) {
    let isLoaded = false;
    const loading = xd.fullReset()?.then(() => isLoaded = true, () => isLoaded = true);
    const isSlow = await Promise.race([
      loading?.then(() => false),
      pause(200).then(() => true)
    ]);

    // * the loading lets go of the skeleton when it ends, so it is never left over the list
    if(isSlow && !isLoaded && generation === this.listRefillGeneration) {
      xd.loadedDialogsAtLeastOnce = false;
      xd.checkForDialogsPlaceholder();
    }
  }

  // * nothing held by a refill any more: the cover goes, and the bar is at its own opacity
  private endListRefill() {
    this.listCover.remove();
    this.fadeForRefill([], 0);
  }

  /**
   * Fades each element to its opacity - from where a fade cut short has left it, or else from the
   * other end - and ends the fades that are not asked for any more. A fade to nothing holds at its
   * end: the cover and the bar rest at full opacity
   */
  private fadeForRefill(targets: [HTMLElement, number][], duration: number) {
    const fading = new Set(this.listRefillAnimations.map((animation) => (animation.effect as KeyframeEffect).target));
    const from = targets.map(([element, to]) => fading.has(element) ? +getComputedStyle(element).opacity : 1 - to);
    this.listRefillAnimations.forEach((animation) => animation.cancel());
    return this.listRefillAnimations = targets.map(([element, to], idx) => element.animate(
      [{opacity: from[idx]}, {opacity: to}],
      {...getAnimatedOptions(duration), fill: to ? 'none' : 'forwards'}
    ));
  }

  /**
   * Every chat again, from a control that leaves with the unread ones: the focus it had goes to
   * the open folder, in whichever of the two places folders are, or else to the list
   */
  private showAllChatsFrom(control: HTMLElement) {
    const hadFocus = Modes.a11y && control.contains(document.activeElement);
    this.setUnreadOnly(false);
    if(!hadFocus) {
      return;
    }

    const folders = document.querySelectorAll<HTMLElement>('#folders-tabs .menu-horizontal-div-item.active, .folders-sidebar__folder-item--selected');
    (Array.from(folders).find((element) => element.offsetParent) || this.xd.scrollable.container).focus();
  }

  private _renderStories() {
    this.chatsContainer.parentElement.parentElement.firstElementChild.after(this.storiesListContainer);
    return StoriesList({
      foldInto: document.querySelector('.item-main .input-search input'),
      setScrolledOn: this.chatsContainer,
      getScrollable: () => this.xd.scrollable.container,
      listenWheelOn: this.bottomPart,
      offsetX: -1,
      resizeCallback: (callback) => {
        this.resizeStoriesList = callback;
      },
      onExpand: () => {
        const container = this.xd.scrollable.container;
        container.classList.add('scrolled-start');
        fastSmoothScrollToStart(container, 'y');
      }
    });
  }

  private renderStories() {
    this.disposeStories = render(() => this._renderStories(), this.storiesListContainer);
  }

  public get chatList() {
    return this.xd.sortedList.list;
  }

  /** The forum open over the chat list - the list narrows under it (`isChatListNarrow`) */
  public get forumTab() {
    return this.openForumTab;
  }

  public set forumTab(forumTab: ForumTab) {
    this.openForumTab = forumTab;
    setChatListForumOpen(!!forumTab);
  }

  /**
   * Whether the chat list is down to its avatars - a forum tab is open over it, or the sidebar is
   * collapsed (`useChatListNarrow`). The rows then carry their unread count on the avatar, have no
   * room for their folder tags, and cannot be selected: they could not be told apart, nor open the
   * lane a selected row makes for its checkbox.
   */
  public isChatListNarrow() {
    return untrack(useChatListNarrow());
  }

  /** Ends a selection of chats that the list has narrowed under (see `isChatListNarrow`) */
  public onChatListNarrowChange() {
    if(this.selection.isSelecting && this.isChatListNarrow()) {
      this.selection.cancelSelection();
    }
  }

  // * a reload of the folders updates them one by one
  private scheduleFolderTagsRefresh = debounce(() => this.refreshFolderTags(), 0, false, true);

  /** Hands every row with folder tags its dialog again, with the indexes the folders have now */
  private refreshFolderTags() {
    if(!untrack(useFolderTagsShown())) {
      return;
    }

    const elementsByPeerId = new Map<PeerId, DialogElement[]>();
    for(const filterId in this.xds) {
      const sortedList = this.xds[filterId].sortedList;
      if(!sortedList) continue;
      for(const [peerId, element] of sortedList.getAllDialogElementsMap()) {
        if(!element.folderTags) continue;
        let elements = elementsByPeerId.get(peerId);
        if(!elements) elementsByPeerId.set(peerId, elements = []);
        elements.push(element);
      }
    }

    for(const [peerId, elements] of elementsByPeerId) {
      this.managers.appMessagesManager.getDialogOnly(peerId).then((dialog) => {
        if(!dialog) return;
        elements.forEach((element) => element.folderTags?.setDialog(dialog));
      });
    }
  }

  /** The selection a row belongs to, or nothing when its list has none (a picker, a panel) */
  public getSelectionForRow(row: HTMLElement) {
    const list = row?.parentElement;
    return list ? SELECTION_BY_LIST.get(list) : undefined;
  }

  public setFilterId(filterId: number) {
    // * the selection belongs to the list it was made in, and every action it offers is about that
    // * list (pinning, archiving), so it does not survive a move to another one
    if(filterId !== this.filterId) {
      this.selection.cancelSelection();
    }

    this.filterId = filterId;
  }

  public async setFilterIdAndChangeTab(filterId: number) {
    this.setFilterId(filterId);
    return this.onTabChange();
  }

  private initListeners() {
    rootScope.addEventListener('folder_unread', async(folder) => {
      if(folder.id < 0) {
        const dialogElement = this.xd.getDialogElement(folder.id);
        if(!dialogElement) {
          return;
        }

        this.setUnreadMessagesN({
          dialog: await this.managers.dialogsStorage.getDialogOnly(folder.id),
          dialogElement
        });
      }
    });

    rootScope.addEventListener('contacts_update', (userId) => {
      this.processContact(userId.toPeerId());
    });

    appImManager.addEventListener('peer_changed', ({peerId, threadId, monoforumThreadId, isForum}) => {
      const options: Parameters<AppImManager['isSamePeer']>[0] = {
        peerId,
        monoforumThreadId,
        threadId: isForum || rootScope.myId ? threadId : undefined
      };

      const getOptionsForElement = (element: HTMLElement) => {
        const elementThreadId = +element?.dataset?.threadId || undefined;
        const elementPeerId = element?.dataset?.peerId?.toPeerId();
        const monoforumParentPeerId = +element?.dataset?.monoforumParentPeerId || undefined;

        return {
          peerId: monoforumParentPeerId || elementPeerId,
          threadId: elementThreadId,
          monoforumThreadId: monoforumParentPeerId ? elementPeerId : undefined
        };
      };

      for(const element of this.lastActiveElements) {
        if(!appImManager.isSamePeer(getOptionsForElement(element), options)) {
          this.setDialogActive(element, false);
        }
      }

      const dialogElements = [
        this.xd?.getDialogElement(peerId),
        this.forumTab?.xd?.getDialogElement(
          threadId || monoforumThreadId || peerId
        )
      ].filter(Boolean);

      dialogElements.forEach(dialogElement => {
        const element = dialogElement?.dom?.listEl;
        if(!element) return;

        const optionsForElement = getOptionsForElement(element);
        if(
          appImManager.isSamePeer(optionsForElement, options) ||
          apiManagerProxy.isBotforum(optionsForElement.peerId) && optionsForElement.peerId === options.peerId
        ) {
          this.setDialogActive(element, true);
        }
      });
      // this.log('peer_changed total time:', performance.now() - perf);
    });

    rootScope.addEventListener('filter_update', async(filter) => {
      if(REAL_FOLDERS.has(filter.id)) {
        return;
      }

      if(!this.filtersRendered[filter.id]) {
        this.addFilter(filter);
      }
    });

    // * the folders a chat is in are read off its dialog, which a row only gets anew with an update
    // * of the chat: a folder that changes what it holds - or its place, which renames its index -
    // * leaves every row with the tags of before
    (['filter_update', 'filter_new', 'filter_delete', 'filter_order'] as const).forEach((type) => {
      rootScope.addEventListener(type, this.scheduleFolderTagsRefresh);
    });

    createRoot(() => {
      const shown = useFolderTagsShown();
      createEffect(on(shown, (shown) => {
        shown && this.scheduleFolderTagsRefresh();
      }, {defer: true}));
    });

    rootScope.addEventListener('filter_delete', (filter) => {
      if(!this.filtersRendered[filter.id]) return;

      this.destroyFilter(filter.id);
      this.onFiltersLengthChange();
    });

    rootScope.addEventListener('filter_order', async(order) => {
      order = order.slice();
      indexOfAndSplice(order, FOLDER_ID_ARCHIVE);

      const r = await Promise.all(order.map(async(filterId) => {
        const [indexKey, filter] = await Promise.all([
          this.managers.dialogsStorage.getDialogIndexKeyByFilterId(filterId),
          this.managers.filtersStorage.getFilter(filterId)
        ]);

        return {indexKey, filter};
      }));

      order.forEach((filterId, idx) => {
        const {indexKey, filter} = r[idx];
        const renderedFilter = this.filtersRendered[filterId];

        this.xds[filterId].setIndexKey(indexKey);

        positionElementByIndex(renderedFilter.container, this.folders.container, filter.localId);
      });
    });
  }

  public getTextColor(active: boolean) {
    return active ? 'white' : 'secondary-text-color';
  }

  public getPrimaryColor(active: boolean) {
    return active ? 'white' : 'primary-color';
  }

  public setDialogActiveStatus(listEl: HTMLElement, active: boolean) {
    listEl.classList.toggle('active', active);

    const customEmojiRenderers = listEl.querySelectorAll<CustomEmojiRendererElement>('.custom-emoji-renderer');
    customEmojiRenderers.forEach((customEmojiRenderer) => {
      customEmojiRenderer.setTextColor(this.getTextColor(active));
    });

    const dom = (listEl as any).dialogDom as DialogDom;
    if(dom?.titleWrapOptions) {
      dom.titleWrapOptions.textColor = this.getTextColor(active);
    }

    changeTitleEmojiColor(listEl, this.getPrimaryColor(active));

    // the subtitle's text spoilers are painted on a canvas — CSS can't recolor them
    DotRenderer.setInlineSpoilersTextColor(listEl, this.getTextColor(active));
  }

  public setDialogActive(listEl: HTMLElement, active: boolean) {
    this.setDialogActiveStatus(listEl, active);
    listEl.classList.toggle(
      'is-forum-open',
      this.forumTab?.peerId === listEl.dataset.peerId.toPeerId() &&
        !listEl.dataset.threadId &&
        !listEl.dataset.isAllChats);
    if(active) {
      this.lastActiveElements.add(listEl);
    } else {
      this.lastActiveElements.delete(listEl);
    }
  }

  private async onStateLoaded(state: State) {
    const managers = bindManagersToSession(this.managers);
    this.stateMiddlewareHelper.clean();
    const middleware = this.stateMiddlewareHelper.get();
    const filtersArr = state.filtersArr;
    const haveFilters = filtersArr.length > REAL_FOLDERS.size;
    // const filter = filtersArr.find((filter) => filter.id !== FOLDER_ID_ARCHIVE);

    this.disposeStories?.();
    this.disposeStories =
      this.resizeStoriesList =
      undefined;

    const {onClick: _onClick, hydrateFilters} = useFolders();
    const onClick = untrack(_onClick);

    const addFilters = async(filters: MyDialogFilter[]) => {
      for(const filter of filters) {
        this.addFilter(filter);
      }

      await untrack(() => hydrateFilters(filters));
    };

    let addFiltersPromise: Promise<any>;
    if(haveFilters) {
      await addFilters(filtersArr);
    } else {
      addFiltersPromise = managers.filtersStorage.getDialogFilters().then(addFilters);
    }

    this.doNotRenderChatList = true;
    this.isFirstDialogsLoad = true;

    const wrapPromiseWithMiddleware = middlewarePromise(middleware);
    try {
      await wrapPromiseWithMiddleware(this.xd.preloadDialogs());
    } catch(err) {

    }

    // show the placeholder before the filters, and then will reset to the default tab again
    if(!haveFilters) {
      onClick(0, false);
    }

    addFiltersPromise && await wrapPromiseWithMiddleware(addFiltersPromise);

    this.renderStories();
    this.doNotRenderChatList = undefined;

    this.filterId = -1;
    onClick(0, false);

    if(!this.initedListeners) {
      this.initListeners();
      this.initedListeners = true;
    }

    haveFilters && this.showFiltersPromise && await wrapPromiseWithMiddleware(this.showFiltersPromise);

    managers.appNotificationsManager.getNotifyPeerTypeSettings();

    // await (await m(loadDialogsPromise)).renderPromise.catch(noop);
    managers.appMessagesManager.fillConversations();

    if(!this.suggestionContainer) {
      this.suggestionContainer = document.createElement('div');
      this.foldersOverlay.prepend(this.suggestionContainer);
      renderPendingSuggestion(this.suggestionContainer);
    }

    if(!this.authorizationContainer) {
      this.authorizationContainer = document.createElement('div');
      this.foldersOverlay.prepend(this.authorizationContainer);
      renderNewAuthorization(this.authorizationContainer);
    }
  }

  public onTabChange = () => {
    const {filterId} = this;
    this.xd = this.xds[filterId];
    this.xd.reset();
    // * held where it was while it left under a bar that came (`setUnreadOnly`)
    this.xd.scrollable.container.style.paddingTop = '';

    this.cancelChatlistUpdatesFetching?.();
    this.cancelChatlistUpdatesFetching = undefined;
    this.fetchChatlistUpdates = undefined;

    const promise = this.xd.onChatsScroll();

    if(!REAL_FOLDERS.has(filterId)) {
      Promise.all([
        this.managers.filtersStorage.getFilter(filterId),
        this.managers.apiManager.getAppConfig()
        // promise.then(({renderPromise}) => renderPromise).catch(() => {})
      ]).then(([filter, appConfig]) => {
        if(TEST_TOP_NOTIFICATION ? false : filter?._ !== 'dialogFilterChatlist' || this.filterId !== filterId) {
          return;
        }

        const updatePeriod = (appConfig.chatlist_update_period ?? 3600) * 1000;
        const filterRendered = this.filtersRendered[filterId];
        let updatedTime = filterRendered.topNotification && !TEST_TOP_NOTIFICATION ?
          (filter as DialogFilter.dialogFilterChatlist).updatedTime || 0 :
          0;
        let fetching = false;

        this.fetchChatlistUpdates = () => {
          updatedTime = Date.now();

          if(fetching) {
            return;
          }

          fetching = true;
          const promise = TEST_TOP_NOTIFICATION ?
            Promise.resolve(TEST_TOP_NOTIFICATION()) :
            this.managers.filtersStorage.getChatlistUpdates(filterId);
          promise.catch(() => undefined as ChatlistsChatlistUpdates)
          .then((chatlistUpdates) => {
            if(this.filterId !== filterId || this.filtersRendered[filterId] !== filterRendered) {
              return;
            }

            const length = chatlistUpdates ? chatlistUpdates.missing_peers.length : 0;
            if(length) {
              this.createTopNotification(filterRendered);
              filterRendered.topNotificationData = {
                _: 'chatlistUpdates',
                chatlistUpdates
              };

              const topNotification = filterRendered.topNotification;

              const tt = i18n('ChatsNew', [length]);
              tt.classList.add('primary');
              const t = i18n('ChatList.SharedFolder.Title', [tt]);
              topNotification.setTitle(t);
              topNotification.setSubtitle(i18n('ChatList.SharedFolder.Subtitle'));
            }

            this.toggleTopNotification(filterRendered, !!length);
          }).finally(() => {
            fetching = false;
          });
        };

        this.cancelChatlistUpdatesFetching = eachTimeout(this.fetchChatlistUpdates, () => {
          const elapsedTime = Date.now() - updatedTime;
          return updatePeriod - elapsedTime;
        }, false);
      });
    }

    return promise;
  };

  public l(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const xd = this.xds[filter.id] = new AutonomousDialogList({filterId: filter.id, appDialogsManager: this});
    const {scrollable, list} = xd.generateScrollable(filter);
    this.setListClickListener({list, onFound: null, withContext: true, withArchiveContext: filter.id === FOLDER_ID_ALL});

    return {ul: list, xd, scrollable};
  }

  private createTopNotification(filterRendered: FilterRendered) {
    if(filterRendered.topNotification) return;

    const topNotificationContainer = filterRendered.topNotificationContainer = document.createElement('div');
    topNotificationContainer.classList.add('chatlist-top-notification-container');
    filterRendered.topNotification = renderChatlistTopNotification(topNotificationContainer, {
      onClick: async() => {
        const data = filterRendered.topNotificationData;
        if(data._ === 'chatlistUpdates') {
          showSharedFolderInvitePopup({
            chatlistInvite: {
              ...data.chatlistUpdates,
              already_peers: [],
              _: 'chatlists.chatlistInviteAlready',
              filter_id: filterRendered.id
            },
            updating: true
          });
        }
      },
      contextMenu: {
        buttons: [{
          icon: 'hide',
          text: 'HideAboveTheList',
          onClick: () => {
            this.managers.filtersStorage.hideChatlistUpdates(filterRendered.id).then(() => {
              if(this.filterId === filterRendered.id) {
                this.fetchChatlistUpdates?.();
              }
            });
          },
          verify: () => filterRendered.topNotificationData?._ === 'chatlistUpdates'
        }]
      }
    });
  }

  private toggleTopNotification(filterRendered: FilterRendered, forwards: boolean) {
    if(!forwards && !filterRendered.topNotification) {
      return;
    }

    let isMounted = true;
    if(forwards) {
      isMounted = !!filterRendered.topNotificationContainer.parentElement;
      if(!isMounted) {
        filterRendered.scrollable.prepend(filterRendered.topNotificationContainer);
      }
    }

    SetTransition({
      element: filterRendered.topNotificationContainer,
      className: 'is-visible',
      duration: 250,
      forwards,
      useRafs: isMounted ? 0 : 2,
      onTransitionEnd: forwards ? undefined : () => {
        filterRendered.topNotification.dispose();
        filterRendered.topNotificationContainer.remove();
        filterRendered.topNotification =
          filterRendered.topNotificationContainer =
          filterRendered.topNotificationData = undefined;
      }
    });
  }

  private addFilter(filter: Pick<MyDialogFilter, 'title' | 'id' | 'localId'>) {
    const {id} = filter;
    if(id === FOLDER_ID_ARCHIVE) {
      return;
    }

    const renderedFilter = this.filtersRendered[id];
    if(renderedFilter) {
      positionElementByIndex(renderedFilter.container, this.folders.container, filter.localId);
      return;
    }

    const {ul, scrollable} = this.l(filter);
    scrollable.container.classList.add('tabs-tab', 'chatlist-parts', 'folders-scrollable');
    scrollable.attachBorderListeners();

    /* const parts = document.createElement('div');
    parts.classList.add('chatlist-parts'); */

    const top = document.createElement('div');
    top.classList.add('chatlist-top');

    const bottom = document.createElement('div');
    bottom.classList.add('chatlist-bottom');

    top.append(ul);
    scrollable.append(top, bottom);
    /* parts.append(top, bottom);
    scrollable.container.append(parts); */

    const div = scrollable.container;
    // this.folders.container.append(div);
    positionElementByIndex(scrollable.container, this.folders.container, filter.localId);

    this.filtersRendered[id] = {
      id,
      container: div,
      scrollable
    };

    this.onFiltersLengthChange();
  }

  private changeFiltersAllChatsKey() {
    const scrollable = this.folders.menuScrollContainer.firstElementChild;
    const key: LangPackKey = scrollable.scrollWidth > scrollable.clientWidth ? 'FilterAllChatsShort' : 'FilterAllChats';
    this.allChatsIntlElement.compareAndUpdate({key});
  }

  private onFiltersLengthChange() {
    let promise = this.showFiltersPromise;
    return promise ??= this.showFiltersPromise = pause(0).then(() => {
      if(this.showFiltersPromise !== promise) {
        return;
      }

      const length = Object.keys(this.filtersRendered).length;
      const show = length > 1;
      const wasShowing = !this.folders.menuScrollContainer.classList.contains('hide');

      if(show !== wasShowing) {
        this.folders.menuScrollContainer.classList.toggle('hide', !show);
        this.folders.menuGradient.classList.toggle('hide', !show);
        this.chatsContainer.classList.toggle('has-filters', show);
      }

      const [, setHasFolders] = useHasFolders();
      setHasFolders(show);

      this.changeFiltersAllChatsKey();

      this.showFiltersPromise = undefined;
    });
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
    if(this.filterId === FOLDER_ID_ARCHIVE) {
      return;
    }

    const chatList = this.chatList;
    const part = chatList.parentElement as HTMLElement;
    let placeholderContainer = (Array.from(part.children) as HTMLElement[]).find((el) => el.matches('.empty-placeholder'));
    // const needPlaceholder = this.xd.scrollable.loadedAll.bottom && !chatList.childElementCount || true;
    const needPlaceholder = !this.xd.sortedList.itemsLength();
    // chatList.style.display = 'none';
    const type: 'dialogs' | 'folder' | 'unread' = useChatListUnreadOnly()[0]() ?
      'unread' :
      this.filterId ? 'folder' : 'dialogs';

    // * the list may have switched between every chat and unread ones under its placeholder
    if(placeholderContainer && (!needPlaceholder || part.dataset.placeholderType !== type)) {
      part.classList.remove('with-placeholder');
      placeholderContainer.remove();
      placeholderContainer = undefined;
    }

    if(!needPlaceholder || placeholderContainer) {
      return;
    }

    let placeholder: ReturnType<AppDialogsManager['generateEmptyPlaceholder']>;
    if(type === 'dialogs') {
      placeholder = this.generateEmptyPlaceholder({
        title: 'ChatList.Main.EmptyPlaceholder.Title',
        classNameType: type
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
      // * no unread chats looks exactly like an empty folder: only what it says and its button differ
      const isUnread = type === 'unread';
      placeholder = this.generateEmptyPlaceholder({
        title: isUnread ? 'ChatList.UnreadOnly.Empty' : 'FilterNoChatsToDisplay',
        subtitle: isUnread ? 'ChatList.UnreadOnly.EmptyInfo' : 'FilterNoChatsToDisplayInfo',
        classNameType: 'folder'
      });

      placeholderContainer = placeholder.container;

      const div = document.createElement('div');
      const emoji = '📂';
      const size = 128;
      wrapStickerEmoji({
        div,
        emoji: emoji,
        width: size,
        height: size
      });

      placeholderContainer.prepend(div);

      const button = Button('btn-primary btn-color-primary btn-control', isUnread ? {
        text: 'ChatList.ShowAllChats'
      } : {
        text: 'FilterHeaderEdit',
        icon: 'settings'
      });

      attachClickEvent(button, isUnread ? () => this.showAllChatsFrom(button) : async() => {
        const filter = await this.managers.filtersStorage.getFilter(this.filterId);
        appSidebarLeft.createTab(AppEditFolderTab).open({...AppEditFolderTab.getInitArgs(), initFilter: filter});
      });

      placeholderContainer.append(button);
    }

    part.append(placeholderContainer);
    part.classList.add('with-placeholder');
    part.dataset.placeholderType = type;
  }

  private updateContactsLength(updatePartClassName: boolean) {
    return this.updateContactsLengthPromise ??= this.managers.appUsersManager.getContacts().then((users) => {
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
    const parts = this.chatList.parentElement.parentElement;
    parts.classList.remove('with-contacts');
    this.contactsPlaceholder.element.remove();
    this.contactsPlaceholder.destroy();
    this.contactsPlaceholder = undefined;
  }

  /** The chat list scrolled to its end — render the next page of contacts, if they are shown. */
  public loadContacts = () => {
    this.contactsPlaceholder?.loadMore();
  };

  /** A dialog for this peer appeared or went away — the contacts below the chat list follow. */
  public processContact = (peerId: PeerId) => {
    this.contactsPlaceholder?.processContact(peerId);
  };

  private _onListLengthChange = () => {
    this.checkIfPlaceholderNeeded();

    if(this.filterId !== FOLDER_ID_ALL) return;

    // return;
    const count = this.xd?.sortedList.itemsLength() || 0;

    // * a short list of unread chats is not a short list of chats: no contacts to start one with
    if(count >= MIN_DIALOGS_WITHOUT_CONTACTS || useChatListUnreadOnly()[0]()) {
      if(this.contactsPlaceholder) {
        this.removeContactsPlaceholder();
      }

      return;
    } else if(this.contactsPlaceholder) return;

    const chatList = this.chatList;
    const parts = chatList.parentElement.parentElement;
    const bottom = chatList.parentElement.nextElementSibling as HTMLElement;
    parts.classList.add('with-contacts');

    this.contactsPlaceholder = createChatlistContacts({
      managers: this.managers,
      onLengthChange: () => this.updateContactsLength(true),
      attachToList: (list) => this.setListClickListener({list})
    });

    bottom.append(this.contactsPlaceholder.element);
  };

  public onSomeDrawerToggle?: () => void;

  public async toggleForumTab(newTab?: ForumTab, hideTab = this.forumTab) {
    if(!hideTab && !newTab) {
      return;
    }

    if(hideTab) {
      this.xd.getListElement(hideTab.peerId)
      ?.classList.remove('is-forum-open');
    }

    if(hideTab === newTab) {
      newTab = undefined;
    }

    if(newTab) {
      appSidebarLeft.closeSearch();
    }

    hideTab?.toggle(false);
    const promise = newTab?.toggle(true);
    if(hideTab === this.forumTab) {
      this.forumTab = newTab;
      this.onSomeDrawerToggle?.();
      this.onChatListNarrowChange();
    }

    if(newTab) {
      this.xd.getListElement(newTab.peerId)
      ?.classList.add('is-forum-open');

      appImManager.selectTab(APP_TABS.CHATLIST);
    }

    if(promise) {
      await promise;
    }

    if(newTab && !this.forumNavigationItem) {
      this.forumNavigationItem = {
        type: 'forum',
        onPop: () => {
          this.forumNavigationItem = undefined;
          this.toggleForumTab();
        }
      };

      appNavigationController.pushItem(this.forumNavigationItem);
    } else if(!newTab && this.forumNavigationItem) {
      appNavigationController.removeItem(this.forumNavigationItem);
      this.forumNavigationItem = undefined;
    }

    const forwards = !!newTab;
    const useRafs = promise ? 2 : undefined;
    this.xd.toggleAvatarUnreadBadges(forwards, useRafs);

    this.transitionDrawersParent(forwards, useRafs);
  }

  private transitionDrawersParent(forwards: boolean, useRafs?: number) {
    const deferred = deferredPromise<void>();
    const duration = 300;
    SetTransition({
      element: appSidebarLeft.sidebarEl,
      className: 'is-forum-visible',
      duration,
      forwards,
      useRafs,
      onTransitionEnd: () => {
        deferred.resolve();
      }
    });

    dispatchHeavyAnimationEvent(deferred, duration).then(() => deferred.resolve());
  }

  public hasForumOpenFor(peerId: PeerId) {
    return !!this.forumsTabs.get(peerId);
  }

  public toggleForumTabByPeerId(
    peerId: PeerId,
    show?: boolean,
    asInnerIfAsMessages?: boolean,
    ForumTabConstructorOverride?: typeof ForumTab
  ) {
    // * the forum opens for the account it was asked on, and not at all once the tab is on another: a run
    // * queued behind another one for the same peer included
    const managers = bindManagersToSession(this.managers);
    const previousPromise = this.forumTabByPeerIdPromises.get(peerId);
    const run = () => this.toggleForumTabByPeerIdInternal(
      peerId,
      managers,
      show,
      asInnerIfAsMessages,
      ForumTabConstructorOverride
    );
    const promise = previousPromise ?
      previousPromise.then(run, run) :
      run();
    this.forumTabByPeerIdPromises.set(peerId, promise);

    const cleanup = () => {
      if(this.forumTabByPeerIdPromises.get(peerId) === promise) {
        this.forumTabByPeerIdPromises.delete(peerId);
      }
    };
    promise.then(cleanup, cleanup);
    return promise;
  }

  private async toggleForumTabByPeerIdInternal(
    peerId: PeerId,
    managers: AppManagers,
    show?: boolean,
    asInnerIfAsMessages?: boolean,
    ForumTabConstructorOverride?: typeof ForumTab
  ) {
    if(isSessionLeaving(getManagersSession(managers))) {
      return;
    }

    if(peerId === rootScope.myId) {
      const tab = appSidebarLeft.getTab(AppSharedMediaTab);
      if(show === true || (show === undefined && !tab)) {
        AppSharedMediaTab.open(appSidebarLeft, peerId, {noProfile: true});
      } else {
        if(tab?.peerId === peerId) {
          tab.close();
        }

        appImManager.setPeer({peerId});
      }

      return;
    }

    const chat = !peerId.isUser() ?
      apiManagerProxy.getChat(peerId.toChatId()) :
      undefined;
    const community = isCommunityChat(chat) ? chat : undefined;
    const isCommunity = !!community;
    const canOpenCommunity = community?._ === 'communityForbidden' ||
      (
        community?._ === 'community' &&
        !community.pFlags.left
      );
    let ForumTabConstructor = ForumTabConstructorOverride;
    if(!ForumTabConstructor) {
      if(canOpenCommunity) {
        ({CommunityForumTab: ForumTabConstructor} = await import(
          '@components/forumTab/communityForumTab'
        ));
      } else {
        ForumTabConstructor = ForumTab.register.getEntry(peerId);
      }
    }
    if(!ForumTabConstructor) return;

    const dialog = await managers.dialogsStorage.getDialogOnly(peerId);
    const viewAsMessages = dialog && !!dialog.pFlags.view_forum_as_messages;
    if(viewAsMessages) {
      const isSamePeer = appImManager.chat?.peerId === peerId;
      appImManager[isSamePeer || !asInnerIfAsMessages ? 'setPeer' : 'setInnerPeer']({
        type: ChatType.Chat,
        peerId
      });
      return;
    }

    const history = appSidebarLeft.getHistory();
    const lastTab = history[history.length - 1];
    let forumTab: ForumTab;
    const asNavigationTab = shouldOpenForumAsNavigationTab({
      hasNavigationHistory: !!lastTab,
      isCommunity,
      isNarrowScreen: mediaSizes.isLessThanFloatingLeftSidebar
    });
    if(asNavigationTab) {
      const isSameTab = lastTab instanceof ForumTab &&
        lastTab.peerId === peerId;
      const existingTab = findForumTabByPeerId(history, peerId);
      if(show === false) {
        if(isSameTab) {
          lastTab.close();
        }
        return;
      }

      if(isSameTab) {
        appSidebarLeft.closeSearch();
        if(show) {
          shake(lastTab.container);
        }
        return;
      }

      if(existingTab) {
        if(!await appSidebarLeft.closeTabsUntilTab(existingTab)) {
          return;
        }

        appSidebarLeft.closeSearch();
        return;
      }

      forumTab = appSidebarLeft.createTab(ForumTabConstructor);
      appSidebarLeft.closeSearch();
      const openPromise = forumTab.open({peerId, managers});
      if(isCommunity && mediaSizes.isLessThanFloatingLeftSidebar) {
        appImManager.selectTab(APP_TABS.CHATLIST);
      }
      await openPromise;
      return;
    }

    forumTab = this.forumsTabs.get(peerId);
    const isSameTab = this.forumTab && this.forumTab === forumTab;
    show ??= !isSameTab;
    if(show === isSameTab) {
      if(show) {
        appSidebarLeft.closeSearch();
        shake(forumTab.container);
      }

      return;
    }

    if(show && !forumTab) {
      forumTab = new ForumTabConstructor(undefined);
      forumTab.init({peerId, managers});

      this.forumsTabs.set(peerId, forumTab);
      this.forumsSlider.append(forumTab.container);

      forumTab.managers = managers;
      forumTab.eventListener.addEventListener('destroy', () => {
        this.forumsTabs.delete(peerId);
      });
    }

    return this.toggleForumTab(forumTab);
  }

  public openDialogInNewTab(element: HTMLElement) {
    const peerId = element.dataset.peerId.toPeerId();
    const lastMsgId = +element.dataset.mid || undefined;
    const threadId = +element.dataset.threadId || undefined;

    const params = new URLSearchParams();
    params.set('p', '' + peerId);
    const communityId = +element.dataset.communityId || undefined;
    if(communityId && peerId === communityId.toChatId().toPeerId(true)) {
      params.set('community', '1');
    }
    if(lastMsgId) params.set('message', '' + lastMsgId);
    if(threadId) params.set('thread', '' + threadId);
    const url = `#/im?${params.toString()}`;
    window.open(url, '_blank');
  }

  public setListClickListener({
    list,
    onFound,
    withContext = false,
    withArchiveContext = false,
    autonomous = false,
    openInner = false,
    selection = this.selection
  }: {
    list: HTMLElement,
    onFound?: (target: HTMLElement) => void | boolean,
    withContext?: boolean,
    withArchiveContext?: boolean,
    autonomous?: boolean,
    openInner?: boolean,
    /** what selecting a row of THIS list means - a forum tab selects its topics, not chats */
    selection?: DialogsSelectionBase
  }) {
    SELECTION_BY_LIST.set(list, selection);

    let lastActiveListElement: HTMLElement;

    const setPeerFunc = (openInner ? appImManager.setInnerPeer : appImManager.setPeer).bind(appImManager);

    const findAvatarWithStories = (target: EventTarget) => {
      return (target as HTMLElement).closest('.avatar.has-stories') as HTMLElement;
    };

    const getOpenStoryCallback = (target: EventTarget) => {
      const avatar = findAvatarWithStories(target);

      if(avatar) return () => {
        appImManager.openStoriesFromAvatar(avatar);
      };

      const archiveAvatar = (target as HTMLElement).closest('.archive-dialog-with-stories') as HTMLElement;
      const archiveDialog = (target as HTMLElement).closest(archiveDialogTagName);

      if(archiveAvatar && archiveDialog instanceof ArchiveDialog) return () => {
        archiveDialog.controls?.openStory?.();
      };
    }

    const isOpeningStoriesDisabled = () => appSidebarLeft.isCollapsed() && !appSidebarLeft.hasSomethingOpenInside();

    let willOpenStory = false;

    const setWillOpenStory = (e: Event) => willOpenStory = !isOpeningStoriesDisabled() && !!getOpenStoryCallback(e.target);
    const isDialogListAction = (target: EventTarget) => {
      return !!(target as HTMLElement).closest?.('[data-dialog-list-action]');
    };

    list.dataset.autonomous = '' + +autonomous;

    // * While chats are being selected a press on a row can also be the start of a reorder of the
    // * pinned block (attachPinnedDialogsReorder), and a drag must not toggle the row it moves - so
    // * in that mode, and only there, the press is acted upon when it ends. The click that ends a
    // * real drag is swallowed by `Sortable`, which is what keeps the selection as it was.
    let pendingPress: () => void;
    const onPress = (e: MouseEvent) => {
      this.log('dialogs click list');
      const target = e.target as HTMLElement;

      const archiveElem = findUpTag(target, archiveDialogTagName);
      if(archiveElem) {
        appSidebarLeft.openArchiveTab();
        return;
      }

      const elem = findDialogListElement(target);

      if(!elem) {
        return;
      }

      const peerId = elem.dataset.peerId.toPeerId();
      const lastMsgId = +elem.dataset.mid || undefined;
      const threadId = +elem.dataset.threadId || undefined;
      const monoforumParentPeerId = +elem.dataset.monoforumParentPeerId || undefined;
      const searchQuery = lastMsgId ? elem.dataset.searchQuery : undefined;

      const openChat = () => setPeerFunc({
        peerId: monoforumParentPeerId || peerId,
        monoforumThreadId: monoforumParentPeerId ? peerId : undefined,
        lastMsgId,
        threadId: threadId,
        highlight: searchQuery ? {type: 'search', query: searchQuery} : undefined
      });

      if(selection.isSelecting && selection.canSelect(elem)) {
        selection.toggleByElement(elem);
        return;
      }

      const isSponsored = elem.dataset.sponsored === 'true';
      if(isSponsored) {
        const chip = elem.querySelector('.sponsored-peer-chip');
        // if click was inside chip, open menu
        const rect = chip.getBoundingClientRect();
        if(e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          if(!IS_TOUCH_SUPPORTED) {
            simulateClickEvent(chip as HTMLElement);
          }
          return;
        }
      }

      if(onFound?.(elem) === false) {
        return;
      }

      const community = !peerId.isUser() ?
        apiManagerProxy.getChat(peerId.toChatId()) :
        undefined;
      if(
        community?._ === 'community' &&
        !community.pFlags.left &&
        !threadId
      ) {
        if(e.ctrlKey || e.metaKey) {
          this.openDialogInNewTab(elem);
          cancelEvent(e);
          return;
        }

        const isFromRightSidebar = appSidebarRight.sidebarEl.contains(elem);
        this.toggleForumTabByPeerId(
          peerId,
          isFromRightSidebar ? true : undefined,
          false
        );
        return;
      }

      // Shift+click → floating chat preview (tdesktop-style). Bypasses chat selection and
      // forum-tab toggling. Ctrl/Cmd (new-tab) takes precedence and is handled below.
      // Snapshot the anchor *now* — virtual scroll reuses DOM nodes and may yank this
      // element offscreen by the time the popup constructor runs.
      if(e.shiftKey && !e.ctrlKey && !e.metaKey && !autonomous) {
        showChatPreviewPopup({
          peerId: monoforumParentPeerId || peerId,
          monoforumThreadId: monoforumParentPeerId ? peerId : undefined,
          threadId,
          lastMsgId,
          anchor: chatPreviewAnchorFromDialogRow(elem)
        });
        cancelEvent(e);
        return;
      }

      const peer = apiManagerProxy.getPeer(peerId);

      const linkedChat = peer?._ === 'channel' && peer?.pFlags?.monoforum && peer?.linked_monoforum_id ?
        apiManagerProxy.getChat(peer.linked_monoforum_id) :
        undefined;

      if(
        linkedChat?._ === 'channel' &&
        linkedChat?.admin_rights?.pFlags?.manage_direct_messages &&
        !elem.dataset.isAllChats &&
        !lastMsgId &&
        !e.shiftKey
      ) {
        this.toggleForumTabByPeerId(peerId).then(() => {
          if(appImManager.chat?.peerId?.toChatId() !== linkedChat?.id && !mediaSizes.isLessThanFloatingLeftSidebar) openChat();
        });
        return;
      }

      if(peer?._ === 'user' && peer?.pFlags?.bot_forum_view && !lastMsgId && !threadId && !elem.dataset.isAllChats && !e.shiftKey) {
        this.toggleForumTabByPeerId(peerId).then(() => {
          if(appImManager.chat?.peerId?.toUserId() !== peer.id && !mediaSizes.isLessThanFloatingLeftSidebar) openChat();
        });
        return;
      }

      const isForum = !!elem.querySelector('.is-forum');
      if(isForum && !e.shiftKey && !lastMsgId) {
        this.toggleForumTabByPeerId(peerId, undefined, false);
        return;
      }

      if(e.ctrlKey || e.metaKey) {
        // TODO: How about opening a monoforum in new tab?
        this.openDialogInNewTab(elem);
        cancelEvent(e);
        return;
      }

      if(autonomous) {
        const sameElement = lastActiveListElement === elem;
        if(lastActiveListElement && !sameElement) {
          this.setDialogActiveStatus(lastActiveListElement, false);
        }

        if(elem) {
          this.setDialogActiveStatus(elem, true);
          lastActiveListElement = elem;
          this.lastActiveElements.add(elem);
        }
      }

      if(
        (!threadId && !monoforumParentPeerId || lastMsgId) &&
        this.xd.sortedList.list === list &&
        this.xd !== this.xds[FOLDER_ID_ARCHIVE]
      ) {
        this.toggleForumTab();
      }

      openChat();
    };
    list.addEventListener('mousedown', (e) => {
      pendingPress = undefined;
      if(
        e.button !== 0 ||
        setWillOpenStory(e) ||
        isDialogListAction(e.target)
      ) {
        return;
      }

      // * `AppSelection` listens for the press itself - it is what turns a drag from here into a
      // * selection of the rows it crosses - so this only holds the row's own toggle back until the
      // * press ends, or the drag would toggle the row it started on
      const selectable = selection.isSelecting && findDialogListElement(e.target);
      if(selectable && selection.canSelect(selectable)) {
        pendingPress = () => onPress(e);
        return;
      }

      onPress(e);
    }, {capture: true});

    // cancel link click
    // ! do not change it to attachClickEvent
    list.addEventListener('click', (e) => {
      if(isDialogListAction(e.target)) {
        return;
      }

      // Native links activate with a click alone from a keyboard or assistive
      // technology. Pointer activation already ran on mousedown — and so did the
      // guard that lives in that listener rather than in `onPress`, so the story
      // check has to be repeated here. `e.button` is 0 for a keyboard click and
      // `isDialogListAction` is already ruled out above.
      if(Modes.a11y && e.detail === 0 && !setWillOpenStory(e)) {
        onPress(e);
      }

      if(e.button === 0) {
        cancelEvent(e);
      }

      const press = pendingPress;
      pendingPress = undefined;
      press?.();

      if(!willOpenStory || isOpeningStoriesDisabled()) return;

      const callback = getOpenStoryCallback(e.target);
      callback?.();
    }, {capture: true});

    if(withContext) {
      this.contextMenu.attach(list);
    }

    if(withArchiveContext) {
      createArchiveDialogContextMenu({
        element: list
      });
    }
  }

  public createChatList(options: {
    // avatarSize?: number,
    // handheldsSize?: number,
    // size?: number,
    new?: boolean,
    dialogSize?: number,
    ignoreClick?: boolean
  } = {}) {
    const list = document.createElement('ul');
    // Legacy layout host: its direct children are native links, not li elements.
    // Keep those links exposed without announcing an invalid list structure.
    list.setAttribute('role', 'presentation');
    list.classList.add('chatlist'/* ,
      'chatlist-avatar-' + (options.avatarSize || 54) *//* , 'chatlist-' + (options.size || 72) */);

    if(options.new) {
      list.classList.add('chatlist-new');
    }

    if(options.dialogSize) {
      list.classList.add('chatlist-' + options.dialogSize);
    }

    // if(options.ignoreClick) {
    //   list.classList.add('disable-hover');
    // }

    /* if(options.handheldsSize) {
      list.classList.add('chatlist-handhelds-' + options.handheldsSize);
    } */

    return list;
  }

  public setLastMessageN(options: Parameters<AppDialogsManager['setLastMessage']>[0]) {
    const promise = this.setLastMessage(options);
    return promise.catch((err: ApiError) => {
      if(err?.type !== 'MIDDLEWARE') {
        this.log.error('set last message error', err);
      }
    });
  }

  // what to show instead of the last message when there is none at all
  private getEmptySubtitle(peerId: PeerId, listEl: HTMLElement) {
    if(apiManagerProxy.isBotforum(peerId)) {
      return i18n('NoMessagesYet');
    }

    if(!listEl.dataset.communityDialog) {
      return;
    }

    // a community bot has no history until its chat is started
    const peer = apiManagerProxy.getPeer(peerId);
    return peer?._ === 'user' && peer.pFlags.bot ?
      getCommunityPeerSubtitle(peer) :
      undefined;
  }

  private getLastMessageForDialog(dialog: PossibleDialog, lastMessage?: Message.message | Message.messageService) {
    let draftMessage: MyDraftMessage;
    const {peerId, draft} = dialog as Dialog;
    const peer = apiManagerProxy.getPeer(peerId);
    const isMonoforumParent = peer?._ === 'channel' && peer.pFlags?.monoforum;

    if(!lastMessage) {
      if(
        draft?._ === 'draftMessage' && !isMonoforumParent && (
          !peerId.isAnyChat() ||
          isForumTopic(dialog) ||
          !apiManagerProxy.isForum(peerId)
        )
      ) {
        draftMessage = draft;
      }

      lastMessage = (dialog as Dialog).topMessage;
      if(lastMessage?.mid !== dialog.top_message) {
        const trueLastMessage = apiManagerProxy.getMessageByPeer((dialog as MonoforumDialog)?.parentPeerId || peerId, dialog.top_message);
        if(trueLastMessage && (trueLastMessage as Message.messageService).action?._ !== 'messageActionChannelJoined') {
          lastMessage = trueLastMessage;
        }
      }
    }

    return {lastMessage, draftMessage};
  }

  /**
   * Everything the subtitle is rendered from, flattened into a comparable string.
   * `textColor` is deliberately left out: `setDialogActiveStatus` recolors the
   * already rendered custom emoji itself, so becoming (in)active must not cost
   * a re-render.
   */
  private getLastMessageRenderKey(options: {
    peerId: PeerId,
    isSaved: boolean,
    lastMessage?: Message.message | Message.messageService,
    draftMessage?: MyDraftMessage,
    highlightWord?: string,
    noForwardIcon?: boolean,
    subtitlePeerId?: PeerId,
    isRestricted?: boolean,
    isSensitive?: boolean
  }) {
    const {lastMessage, draftMessage} = options;
    const message = lastMessage as Message.message;
    const media = lastMessage && getMediaFromMessage(lastMessage, true);
    const messageMedia = message?.media as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument;
    const draftContent = draftMessage && getMessageForReplyContent(draftMessage);

    return [
      options.peerId,
      options.isSaved,
      options.highlightWord,
      options.noForwardIcon,
      options.subtitlePeerId,
      options.isRestricted,
      options.isSensitive,
      draftMessage?.date,
      draftMessage?.message,
      draftContent?.text,
      draftContent?.entities && JSON.stringify(
        draftContent.entities,
        (_key, value) => typeof(value) === 'bigint' ? value.toString() : value
      ),
      lastMessage?._,
      lastMessage?.peerId,
      lastMessage?.mid,
      lastMessage?.date,
      message?.edit_date,
      message?.fromId,
      message?.fwdFromId,
      message?.reply_to?._,
      (media as Photo.photo | MyDocument)?.id,
      (media as MyDocument)?.type,
      messageMedia?.pFlags?.spoiler,
      (messageMedia as MessageMedia.messageMediaPhoto)?.ttl_seconds,
      message?.message
    ].join('\x01');
  }

  private async setLastMessage({
    dialog,
    lastMessage: _lastMessage,
    dialogElement,
    highlightWord,
    isBatch = false,
    setUnread = false,
    noForwardIcon,
    setMessageId = true,
    subtitlePeerId
  }: {
    dialog: PossibleDialog,
    lastMessage?: Message.message | Message.messageService,
    dialogElement?: DialogElement,
    highlightWord?: string,
    isBatch?: boolean,
    setUnread?: boolean,
    noForwardIcon?: boolean,
    setMessageId?: boolean,
    subtitlePeerId?: PeerId
  }) {
    if(!dialogElement) {
      dialogElement = this.xd.getDialogElement(dialog.peerId);

      if(!dialogElement) {
        return;
      }
    }

    const {dom} = dialogElement;
    const {peerId} = dialog;
    const isSaved = isSavedDialog(dialog);

    const {deferred: promise, middleware} = setPromiseMiddleware(dom, 'setLastMessagePromise');

    const {draftMessage, lastMessage} = this.getLastMessageForDialog(dialog, _lastMessage);

    const isSearch = setUnread !== null && !setUnread;
    // * do not uncomment `setUnread` - unsetTyping right after this call will interrupt setting unread badges
    if(/* setUnread */!isSearch) {
      this.setUnreadMessagesN({dialog, dialogElement, isBatch, setLastMessagePromise: promise});
    }

    const isRestricted = !!lastMessage && isMessageRestricted(lastMessage as Message.message);
    const isSensitive = !!lastMessage && isMessageSensitive(lastMessage as Message.message);

    const renderKey = this.getLastMessageRenderKey({
      peerId,
      isSaved,
      lastMessage,
      draftMessage,
      highlightWord,
      noForwardIcon,
      subtitlePeerId,
      isRestricted,
      isSensitive
    });
    // * the key is dropped for the whole render and only restored once the new
    // * subtitle is in the DOM, so a render interrupted by the middleware can
    // * never leave a stale key behind
    const previousRenderParts = dom.lastMessageRenderParts;
    const canSkipRender = dom.lastMessageRenderKey === renderKey &&
      isRenderedSubtitleIntact(dom);
    delete dom.lastMessageRenderKey;
    delete dom.lastMessageRenderParts;

    // * as in tdesktop, the row's activity holds the line: a message arriving, an edit or a draft
    // * does not push "typing…" out of the row. The subtitle it would have shown is rendered once the
    // * activity is over, by the `unsetTyping` that clears the flag before asking for this render
    const keepTyping = dom.showsActivity;

    if(!lastMessage && !draftMessage && !subtitlePeerId/*  || (lastMessage._ === 'messageService' && !lastMessage.rReply) */) {
      // * not guarded by the key: the placeholder also depends on the peer being a
      // * botforum / community dialog, and rendering it costs a single element
      const emptySubtitle = this.getEmptySubtitle(peerId, dom.listEl);

      if(!keepTyping) {
        disposeTextHighlight(dom);
        setDialogSubtitle(dom, emptySubtitle ? [emptySubtitle] : []);
      }

      dom.lastTimeSpan.replaceChildren();
      delete dom.listEl.dataset.mid;
      delete dom.listEl.dataset.searchQuery;

      promise.resolve();
      return;
    }

    // set it before content so won't have bug in appSearch
    if(isSearch && setMessageId && lastMessage) {
      dom.listEl.dataset.mid = '' + lastMessage.mid;

      const replyTo = lastMessage.reply_to as MessageReplyHeader.messageReplyHeader;
      if(replyTo?.pFlags?.forum_topic) {
        dom.listEl.dataset.threadId = '' + getMessageThreadId(lastMessage);
      }
    }

    // * the click on the row carries the query on to the chat, so the found text
    // * lights up in the bubble too
    if(highlightWord) dom.listEl.dataset.searchQuery = highlightWord;
    else delete dom.listEl.dataset.searchQuery;

    let renderedParts = canSkipRender ? previousRenderParts : undefined;

    if(!canSkipRender && !keepTyping) {
      let mediaContainer: HTMLElement;
      const mediaParts: (Promise<HTMLElement> | HTMLElement)[] = [];

      if(lastMessage && !draftMessage && !isRestricted) {
        const media = getMediaFromMessage(lastMessage, true);
        const videoTypes: Set<MyDocument['type']> = new Set(['video', 'gif', 'round']);
        if(media && (media._ === 'photo' || videoTypes.has(media.type)) && !(((lastMessage as Message.message).media) as MessageMedia.messageMediaPhoto)?.ttl_seconds) {
          const spoiler = ((lastMessage as Message.message).media as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument)?.pFlags?.spoiler;
          const size = choosePhotoSize(media, 20, 20);

          if(size._ !== 'photoSizeEmpty') {
            mediaContainer = document.createElement('div');
            mediaContainer.classList.add('dialog-subtitle-media');

            if((media as MyDocument).type === 'round') {
              mediaContainer.classList.add('is-round');
            }

            mediaParts.push(wrapPhoto({
              photo: media,
              message: lastMessage,
              container: mediaContainer,
              withoutPreloader: true,
              size
            }).then(() => {
              if(spoiler || isSensitive) {
                return wrapMediaSpoiler({
                  media: media,
                  width: 20,
                  height: 20,
                  multiply: 0.1,
                  middleware: this.stateMiddlewareHelper.get(),
                  animationGroup: 'none'
                }).then((el) => {
                  mediaContainer.append(el);
                  return mediaContainer;
                });
              }

              return mediaContainer
            }));

            if(videoTypes.has((media as MyDocument).type)) {
              const playIcon = Icon('play_filled', 'dialog-subtitle-media-play');
              mediaContainer.append(playIcon);
            }
          }
        }
      }

      const withoutMediaType = !!mediaContainer && !!(lastMessage as Message.message)?.message;
      const parts = await renderDialogSubtitleParts({
        peerId,
        isSaved,
        lastMessage,
        draftMessage,
        noForwardIcon,
        mediaParts,
        withoutMediaType,
        withoutMessageIcon: !!mediaContainer,
        prependPeerId: subtitlePeerId,
        middleware,
        messageRenderer: wrapMessageForReply,
        peerTitleRenderer: wrapPeerTitle,
        textColor: this.getTextColor(
          dom.listEl.classList.contains('active')
        )
      });
      dom.lastMessageSpan.classList.add('dialog-subtitle-parts');
      disposeTextHighlight(dom);
      setDialogSubtitle(dom, parts);
      renderedParts = parts;

      // * the last part is the message text itself (the ones before are the sender, the
      // * draft label, media thumbs) — that is where the query was matched
      if(highlightWord && lastMessage) {
        dom.textHighlight = highlightText({
          container: parts[parts.length - 1],
          match: {type: 'search', query: highlightWord}
        });
      }
    }

    // * the label is relative to the current day, so it is refreshed even when
    // * the subtitle itself was left alone
    if(lastMessage || draftMessage/*  && lastMessage._ !== 'draftMessage' */) {
      const date = draftMessage ? Math.max(draftMessage.date, lastMessage?.date || 0) : lastMessage.date;
      replaceContent(dom.lastTimeSpan, formatDateAccordingToTodayNew(new Date(date * 1000)));
    } else dom.lastTimeSpan.textContent = '';

    // * nothing was rendered under the activity, so there is no key to skip the next render by
    if(!keepTyping) {
      dom.lastMessageRenderKey = renderKey;
      dom.lastMessageRenderParts = renderedParts;
    }

    promise.resolve();
  }

  public setUnreadMessagesN(options: Parameters<AppDialogsManager['setUnreadMessages']>[0]) {
    return this.setUnreadMessages(options).catch(() => {});
  }

  private async setUnreadMessages({
    dialog,
    dialogElement,
    isBatch = false,
    setLastMessagePromise
  }: {
    dialog: PossibleDialog,
    dialogElement: DialogElement,
    isBatch?: boolean,
    setLastMessagePromise?: Promise<void>
  }) {
    const {dom} = dialogElement;
    if(!dom) {
      // this.log.error('setUnreadMessages no dom!', dialog);
      return;
    }

    // * every update of the dialog comes through here, and with it the folders the chat is now in
    dialogElement.folderTags?.setDialog(dialog);

    const isTopic = isForumTopic(dialog);
    const isSaved = isSavedDialog(dialog);
    const isMonoforumThread = isMonoforumDialog(dialog);
    const isAllChats = !!dialogElement?.dom?.listEl?.dataset?.isAllChats;
    const {deferred, middleware} = setPromiseMiddleware(dom, 'setUnreadMessagePromise');

    const {peerId} = dialog;
    const promises = Promise.all([
      this.managers.appNotificationsManager.isPeerLocalMuted({peerId: peerId, respectType: true, threadId: isTopic ? dialog.id : undefined}),
      !isSaved ? this.getLastMessageForDialog(dialog) : undefined,
      isTopic || isSaved ? !!dialog.pFlags.pinned : this.managers.dialogsStorage.isDialogPinned(peerId, this.filterId),
      this.managers.appMessagesManager.isDialogUnread(dialog),
      peerId.isAnyChat() && !isTopic ? this.managers.acknowledged.dialogsStorage.getForumUnreadCount(peerId, true).then((result) => {
        if(result.cached) {
          return result.result;
        } else {
          result.result.then(() => {
            this.setUnreadMessagesN({dialog, dialogElement});
          });

          return {count: 0, hasUnmuted: false};
        }
      }).catch(() => undefined as {count: number, hasUnmuted: boolean}) : undefined
    ]);

    let [isMuted, m, isPinned, isDialogUnread, forumUnreadCount] = await middleware(promises);
    const {count: unreadTopicsCount, hasUnmuted: hasUnmutedTopic} = forumUnreadCount || {};

    const {draftMessage, lastMessage} = m || {};
    let setStatusMessage: MyMessage;
    if(!draftMessage && lastMessage && lastMessage.pFlags.out && lastMessage.peerId !== rootScope.myId) {
      setStatusMessage = lastMessage;
    }

    const unreadCount = unreadTopicsCount ?? (isSaved ? 0 : dialog.unread_count);
    if(unreadTopicsCount !== undefined) {
      isDialogUnread = !!unreadCount;
    }

    if(isTopic && !isDialogUnread) {
      isDialogUnread = !getServerMessageId(dialog.read_inbox_max_id);
    }

    if(isAllChats) {
      isDialogUnread = false;
    }

    // dom.messageEl.classList.toggle('has-badge', hasBadge);

    // * have to await all promises before modifying something

    if(setLastMessagePromise) {
      try {
        await middleware(setLastMessagePromise);
      } catch(err) {
        return;
      }
    }

    const transitionDuration = isBatch ? 0 : BADGE_TRANSITION_TIME;

    dom.listEl.classList.toggle('no-unmuted-topic', !isMuted && hasUnmutedTopic !== undefined && !hasUnmutedTopic);

    setSendingStatus(dom.statusSpan, isTopic && dialog.pFlags.closed ? 'premium_lock' : setStatusMessage, !isBatch);

    // if(isTopic) {
    //   dom.statusSpan.parentElement.classList.toggle('is-closed', !!dialog.pFlags.closed);
    // }

    const hasPinnedBadge = isPinned && !isMonoforumThread && !isAllChats;
    const hasUnreadBadge = isDialogUnread;
    const hasUnreadAvatarBadge = dialogElement.isMainList !== false &&
      this.xd !== this.xds[FOLDER_ID_ARCHIVE] &&
      !isTopic &&
      !isMonoforumThread &&
      !isAllChats &&
      this.isChatListNarrow() &&
      isDialogUnread;
    // * `unreadCount` counts the unread topics for a forum, so the mention state
    // * must be derived from it too — not from `dialog.unread_count`
    const {isMention, hasMentionsBadge} = getDialogMentionBadgeState({
      unreadCount,
      unreadMessagesCount: (dialog as Dialog | ForumTopic).unread_count,
      unreadMentionsCount: isSaved || isMonoforumThread ? 0 : dialog.unread_mentions_count,
      hasUnreadBadge
    });
    const hasReactionsBadge = isSaved ? false : !!dialog.unread_reactions_count;
    const hasPollVotesBadge = isSaved || isMonoforumThread ? false : !!(dialog as Dialog | ForumTopic).unread_poll_votes_count;
    // * a bot's main mini app opens right from its row in the chat list, as in the official apps -
    // * where the row has nothing unread to show in its place
    dialogElement.hasBotMainApp = peerId.isUser() && !!apiManagerProxy.getUser(peerId.toUserId())?.pFlags?.bot_has_main_app;
    const hasBotAppButton = !!dialogElement.isMainList &&
      dialogElement.hasBotMainApp &&
      !hasUnreadBadge &&
      !hasMentionsBadge &&
      !hasReactionsBadge &&
      !hasPollVotesBadge;
    let unreadBadgeText: string;
    if(hasUnreadBadge) {
      // dom.unreadMessagesSpan.innerText = '' + (unreadCount ? formatNumber(unreadCount, 1) : ' ');
      unreadBadgeText = isMention ? '@' : '' + (unreadCount ? formatNumber(unreadCount, 1) : ' ');
    }

    dialogElement.setBadgeState({
      muted: isMuted,
      pinned: hasPinnedBadge,
      unread: hasUnreadBadge,
      unreadText: unreadBadgeText,
      unreadCount,
      unreadMention: isMention,
      unreadAvatar: hasUnreadAvatarBadge,
      unreadAvatarText: unreadBadgeText || undefined,
      mentions: hasMentionsBadge,
      reactions: hasReactionsBadge,
      pollVotes: hasPollVotesBadge,
      botApp: hasBotAppButton,
      transitionDuration
    });

    if(isTopic && dom.unreadBadge) {
      const notVisited = isDialogUnread && unreadBadgeText === ' ';
      dom.unreadBadge.classList.toggle('not-visited', notVisited);
    }

    // if(isPinned && !isUnread && !isMention) {
    //   dom.unreadBadge.classList.add('badge-icon', 'dialog-pinned-icon');
    //   dom.unreadBadge.replaceChildren(Icon('chatspinned'));
    // } else if(dom.unreadBadge) {
    //   dom.unreadBadge.classList.remove('badge-icon', 'dialog-pinned-icon');
    //   if(!unreadBadgeText) {
    //     dom.unreadBadge.replaceChildren();
    //   }
    // }

    deferred.resolve();
  }

  private async getDialog(dialog: AnyDialog | PeerId, {threadOrSavedId, monoforumParentPeerId}: GetDialogOptions = {}) {
    const managers = bindManagersToSession(this.managers);
    if(typeof(dialog) !== 'object') {
      let originalDialog: AnyDialog | MonoforumDialog;
      if(monoforumParentPeerId) {
        originalDialog = await managers.monoforumDialogsStorage.getDialogByParent(monoforumParentPeerId, dialog);

        if(!originalDialog) return {
          peerId: dialog || NULL_PEER_ID,
          pFlags: {}
        } as MonoforumDialog;
      } else if(threadOrSavedId) {
        if(dialog === rootScope.myId) {
          originalDialog = await managers.dialogsStorage.getAnyDialog(dialog, threadOrSavedId);
          if(!originalDialog) {
            const peerId = dialog || NULL_PEER_ID;
            return {
              peerId,
              pFlags: {}
            } as any as SavedDialog;
          }
        } else {
          originalDialog = await managers.dialogsStorage.getForumTopic(dialog, threadOrSavedId);
          if(!originalDialog) {
            const peerId = dialog || NULL_PEER_ID;
            return {
              peerId,
              pFlags: {}
            } as any as ForumTopic;
          }
        }
      } else {
        originalDialog = await managers.appMessagesManager.getDialogOnly(dialog);
        if(!originalDialog) {
          const peerId = dialog || NULL_PEER_ID;
          return {
            peerId,
            peer: await managers.appPeersManager.getOutputPeer(peerId),
            pFlags: {}
          } as any as Dialog;
        }
      }

      return originalDialog;
    }

    return dialog as AnyDialog;
  }

  public addListDialog(options: Parameters<AppDialogsManager['addDialogNew']>[0] & InitDialogAdditionalOptions) {
    options.autonomous = false;
    options.withStories = true;

    const ret = this.addDialogNew(options);

    if(ret) {
      const promise = this.initDialog(ret, options);
      options.loadPromises?.push(promise);
      options.onInitPromise?.(promise);
    }

    if(ret && this.lazyLoadQueue) {
      const div = ret.dom.listEl;
      const lazyLoadElement: Parameters<AppDialogsManager['lazyLoadQueue']['push']>[0] = {
        div,
        load: async() => {
          const managers = bindManagersToSession(this.managers);
          await pause(200);
          if(!this.lazyLoadQueue.intersector.isVisible(div)) {
            this.lazyLoadQueue.push(lazyLoadElement); // * to process again
            return;
          }

          const getHistoryOptions: RequestHistoryOptions = {
            peerId: options.monoforumParentPeerId || options.peerId,
            threadId: options.threadId,
            monoforumThreadId: options.monoforumParentPeerId ? options.peerId : undefined,
            limit: 50
          };

          const readMaxId = await managers.appMessagesManager.getReadMaxIdIfUnread(
            options.peerId,
            options.threadId
          );

          if(readMaxId) {
            const limit = Math.floor(getHistoryOptions.limit / 2);
            await managers.appMessagesManager.getHistory({
              ...getHistoryOptions,
              offsetId: readMaxId || undefined,
              backLimit: readMaxId ? limit : undefined,
              limit
            });
          }

          return managers.appMessagesManager.getHistory(getHistoryOptions);
        }
      };

      this.lazyLoadQueue.push(lazyLoadElement);
      ret.middlewareHelper.onDestroy(() => {
        this.lazyLoadQueue.delete(lazyLoadElement);
      });
    }

    return ret;
  }

  public initDialog(dialogElement: DialogElement, options: Parameters<AppDialogsManager['addDialogNew']>[0] & InitDialogAdditionalOptions) {
    const managers = bindManagersToSession(this.managers);
    const {peerId} = options;
    const getDialogPromise = this.getDialog(options.dialog || peerId, {
      threadOrSavedId: options.threadId,
      monoforumParentPeerId: options.monoforumParentPeerId
    });

    const promise = getDialogPromise.then((dialog) => {
      const promises: (Promise<any> | void)[] = [];
      const isUser = peerId.isUser();
      if(!isUser && isDialog(dialog)) {
        promises.push(this.xd.processDialogForCallStatus(peerId, dialogElement.dom));
      }

      if(peerId !== rootScope.myId && isUser) {
        promises.push(managers.appUsersManager.getUserStatus(peerId.toUserId()).then((status) => {
          if(status?._ === 'userStatusOnline') {
            this.xd.setOnlineStatus(dialogElement.dom.avatarEl.node, true);
          }
        }));
      }

      promises.push(this.setLastMessageN({
        dialog,
        dialogElement: dialogElement,
        isBatch: options.isBatch,
        lastMessage: options.lastMessage,
        setUnread: true
      }));

      const allPromise = Promise.all(promises);

      // * a row built while the peer is already typing gets no `peer_typings` event
      // * of its own, so the indicator has to be restored here — after the subtitle
      // * is rendered, and off the returned promise so it never delays the row
      allPromise.then(() => setDialogTyping({
        dom: dialogElement.dom,
        peerId,
        threadId: isForumTopic(dialog) ? dialog.id : undefined
      })).catch(noop);

      return allPromise;
    });

    return promise;
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
    const ret = this.addDialogNew({
      ...options,
      ...getMessageSenderPeerIdOrName(message),
      peerId
    });

    this.setLastMessageN({
      dialog: {_: 'dialog', peerId} as any,
      lastMessage: message,
      dialogElement: ret,
      highlightWord: query
    });

    if(message.peerId !== peerId) {
      ret.dom.listEl.dataset.peerId = '' + message.peerId;
    }

    return ret;
  }

  public addDialogNew(options: DialogElementOptions & {container?: HTMLElement | Scrollable | false, append?: boolean}) {
    const d = new DialogElement({
      autonomous: !!options.container,
      avatarSize: 'bigger',
      ...options
      // avatarSize: !options.avatarSize || options.avatarSize >= 54 ? 'bigger' : 'abitbigger',
    });
    (d.container as any).dialogElement = d;

    if(options.container) {
      const method = options.append === false ? 'prepend' : 'append';
      options.container[method](d.container);
    }

    return d;
    // return this.addDialog(options.peerId, options.container, options.rippleEnabled, options.onlyFirstName, options.meAsSaved, options.append, options.avatarSize, options.autonomous, options.lazyLoadQueue, options.loadPromises, options.fromName, options.noIcons);
  }

  private showPollCancelConfirmation(randomId: string) {
    const managers = bindManagersToSession(this.managers);
    const listenerSetter = new ListenerSetter;
    let popup: PopupPeerHandle;

    const onSent = () => {
      toastNew({
        langPackKey: 'CancelPollConfirm.Timeout'
      });
    }

    listenerSetter.add(rootScope)('message_sent', ({tempMessage}) => {
      if(tempMessage?.random_id === randomId) {
        popup?.hide();
        onSent();
      }
    });

    confirmationPopup({
      titleLangKey: 'CancelPollConfirm.Title',
      descriptionLangKey: 'CancelPollConfirm.Description',
      button: {
        langKey: 'CancelPollConfirm.Button'
      },
      onPopup: (p: PopupPeerHandle) => {
        popup = p;
      }
    }).then(() => {
      managers.appMessagesManager.cancelPendingMessage(randomId).then((wasCanceled) => {
        if(!wasCanceled) {
          onSent();
        }
      });
    }, noop).finally(() => {
      listenerSetter.removeAll();
    });
  }
}

// made once: a hot update keeps it and moves it onto the edited class (see @helpers/hotRegistry)
const appDialogsManager = new AppDialogsManager();
MOUNT_CLASS_TO.appDialogsManager = appDialogsManager;
registerHotReloadGuard({appDialogsManager});
export default appDialogsManager;

if(import.meta.hot) import.meta.hot.accept();
