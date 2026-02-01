/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDialogFilter} from '@lib/storages/filters';
import type {Dialog, ForumTopic, MyMessage, RequestHistoryOptions, SavedDialog} from '@appManagers/appMessagesManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {State} from '@config/state';
import type {AnyDialog} from '@lib/storages/dialogs';
import type {CustomEmojiRendererElement} from '@customEmoji/renderer';
import PopupElement from '@components/popups';
import DialogsContextMenu from '@components/dialogsContextMenu';
import {horizontalMenu, horizontalMenuObjArgs} from '@components/horizontalMenu';
import ripple from '@components/ripple';
import Scrollable, {ScrollableX} from '@components/scrollable';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {IS_MOBILE_SAFARI} from '@environment/userAgent';
import {logger, LogTypes} from '@lib/logger';
import rootScope from '@lib/rootScope';
import appImManager, {AppImManager, APP_TABS} from '@lib/appImManager';
import Button from '@components/button';
import SetTransition from '@components/singleTransition';
import {MyDraftMessage} from '@appManagers/appDraftsManager';
import {MOUNT_CLASS_TO} from '@config/debug';
import PeerTitle, {changeTitleEmojiColor} from '@components/peerTitle';
import I18n, {FormatterArguments, i18n, LangPackKey, _i18n} from '@lib/langPack';
import findUpTag from '@helpers/dom/findUpTag';
import lottieLoader from '@rlottie/lottieLoader';
import wrapPhoto from '@components/wrappers/photo';
import AppEditFolderTab from '@components/sidebarLeft/tabs/editFolder';
import appSidebarLeft from '@components/sidebarLeft';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import replaceContent from '@helpers/dom/replaceContent';
import ConnectionStatusComponent from '@components/connectionStatus';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {fastRafPromise} from '@helpers/schedulers';
import SortedUserList from '@components/sortedUserList';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import handleTabSwipe from '@helpers/dom/handleTabSwipe';
import windowSize from '@helpers/windowSize';
import isInDOM from '@helpers/dom/isInDOM';
import {setSendingStatus} from '@components/sendingStatus';
import {SortedElementBase} from '@helpers/sortedList';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, NULL_PEER_ID, REAL_FOLDERS} from '@appManagers/constants';
import groupCallActiveIcon from '@components/groupCallActiveIcon';
import {Chat, ChatlistsChatlistUpdates, DialogFilter, Message, MessageMedia, MessageReplyHeader} from '@layer';
import mediaSizes from '@helpers/mediaSizes';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {AppManagers} from '@lib/managers';
import appSidebarRight from '@components/sidebarRight';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import wrapMessageForReply, {WrapMessageForReplyOptions} from '@components/wrappers/messageForReply';
import isMessageRestricted, {isMessageSensitive} from '@appManagers/utils/messages/isMessageRestricted';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getMessageSenderPeerIdOrName from '@appManagers/utils/messages/getMessageSenderPeerIdOrName';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import getProxiedManagers from '@lib/getProxiedManagers';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import middlewarePromise from '@helpers/middlewarePromise';
import appDownloadManager from '@lib/appDownloadManager';
import groupCallsController from '@lib/calls/groupCallsController';
import callsController from '@lib/calls/callsController';
import cancelEvent from '@helpers/dom/cancelEvent';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';
import apiManagerProxy from '@lib/apiManagerProxy';
import filterAsync from '@helpers/array/filterAsync';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import whichChild from '@helpers/dom/whichChild';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import Row, {RowMediaSizeType} from '@components/row'
import SettingSection from '@components/settingSection';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import formatNumber from '@helpers/number/formatNumber';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMedia';
import {dispatchHeavyAnimationEvent} from '@hooks/useHeavyAnimationCheck';
import shake from '@helpers/dom/shake';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import AppChatFoldersTab from '@components/sidebarLeft/tabs/chatFolders';
import eachTimeout from '@helpers/eachTimeout';
import PopupSharedFolderInvite from '@components/popups/sharedFolderInvite';
import showLimitPopup from '@components/popups/limit';
import StoriesList from '@components/stories/list';
import {render} from 'solid-js/web';
import {avatarNew} from '@components/avatarNew';
import Icon from '@components/icon';
import setBadgeContent from '@helpers/setBadgeContent';
import createBadge from '@helpers/createBadge';
import {isDialog, isForumTopic, isMonoforumDialog, isSavedDialog} from '@appManagers/utils/dialogs/isDialog';
import {ChatType} from '@components/chat/chat';
import rtmpCallsController from '@lib/calls/rtmpCallsController';
import IS_LIVE_STREAM_SUPPORTED from '@environment/liveStreamSupport';
import {WrapRichTextOptions} from '@richTextProcessor/wrapRichText';
import createFolderContextMenu from '@helpers/dom/createFolderContextMenu';
import {useAppSettings} from '@stores/appSettings';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import {unwrap} from 'solid-js/store';
import wrapMediaSpoiler from '@components/wrappers/mediaSpoiler';
import type {MonoforumDialog} from '@lib/storages/monoforumDialogs';
import {renderPendingSuggestion} from '@components/sidebarLeft/pendingSuggestion';
import {useHasFolders} from '@stores/foldersSidebar';
import {useAppState} from '@stores/appState';
import {BADGE_TRANSITION_TIME} from '@components/autonomousDialogList/constants';
import {AutonomousDialogList} from '@components/autonomousDialogList/dialogs';
import {PossibleDialog} from '@components/autonomousDialogList/base';
import {ForumTab} from '@components/forumTab/forumTab';
import {fillForumTabRegister} from '@components/forumTab/fillRegister';
import LazyLoadQueue from '@components/lazyLoadQueue';
import {fastSmoothScrollToStart} from '@helpers/fastSmoothScroll';


export const DIALOG_LIST_ELEMENT_TAG = 'A';
const DIALOG_LOAD_COUNT = 20;

export type DialogDom = {
  avatarEl: ReturnType<typeof avatarNew>,
  captionDiv: HTMLElement,
  titleSpan: HTMLSpanElement,
  titleSpanContainer: HTMLSpanElement,
  statusSpan: HTMLSpanElement,
  lastTimeSpan: HTMLSpanElement,
  pinnedBadge?: HTMLElement,
  unreadBadge?: HTMLElement,
  unreadAvatarBadge?: HTMLElement,
  callIcon?: ReturnType<typeof groupCallActiveIcon>,
  mentionsBadge?: HTMLElement,
  reactionsBadge?: HTMLElement,
  lastMessageSpan: HTMLSpanElement,
  containerEl: HTMLElement,
  listEl: HTMLElement,
  subtitleEl: HTMLElement,
  mutedIcon?: HTMLElement,

  titleWrapOptions?: WrapSomethingOptions;

  setLastMessagePromise?: CancellablePromise<void>,
  setUnreadMessagePromise?: CancellablePromise<void>
};

interface SortedDialog extends SortedElementBase<PeerId> {
  dom: DialogDom,
  dialogElement: DialogElement
}

function setPromiseMiddleware<T extends {[smth in K as K]?: CancellablePromise<void>}, K extends keyof T>(obj: T, key: K) {
  const oldPromise: CancellablePromise<void> = obj[key] as any;
  oldPromise?.reject();

  // @ts-ignore
  const deferred = obj[key] = deferredPromise<void>();
  deferred.catch(() => {}).finally(() => {
    if((obj[key] as any) === deferred) {
      delete obj[key];
    }
  });

  const middleware = middlewarePromise(() => (obj[key] as any) === deferred);
  return {deferred, middleware};
}

function getFolderTitleTextColor(active: boolean) {
  return active ? 'primary-color' : 'secondary-text-color';
}

const BADGE_SIZE = 22;


const avatarSizeMap: {[k in DialogElementSize]?: number} = {
  bigger: 54,
  abitbigger: 42,
  small: 32
};

export type DialogElementSize = RowMediaSizeType;
export type AsAllChatsType = 'monoforum' | 'topics';

type DialogElementOptions = {
  peerId: PeerId,
  rippleEnabled?: boolean,
  onlyFirstName?: boolean,
  meAsSaved?: boolean,
  avatarSize?: RowMediaSizeType,
  autonomous?: boolean,
  loadPromises?: Promise<any>[],
  fromName?: string,
  noIcons?: boolean,
  threadId?: number,
  monoforumParentPeerId?: PeerId,
  wrapOptions: WrapSomethingOptions,
  isMainList?: boolean,
  withStories?: boolean,
  controlled?: boolean,
  dontSetActive?: boolean,
  asAllChats?: AsAllChatsType,
  autoDeletePeriod?: number,
};

export class DialogElement extends Row {
  private static BADGE_ORDER: Parameters<DialogElement['toggleBadgeByKey']>[0][] = ['reactionsBadge', 'mentionsBadge', 'unreadBadge', 'pinnedBadge'];
  public dom: DialogDom;
  public middlewareHelper: MiddlewareHelper;

  constructor({
    peerId,
    rippleEnabled = true,
    onlyFirstName = false,
    meAsSaved = true,
    avatarSize = 'bigger',
    autonomous,
    loadPromises,
    fromName,
    noIcons,
    threadId,
    monoforumParentPeerId,
    wrapOptions = {},
    isMainList,
    withStories,
    controlled,
    dontSetActive,
    asAllChats,
    autoDeletePeriod
  }: DialogElementOptions) {
    super({
      clickable: true,
      noRipple: !rippleEnabled,
      havePadding: !threadId && asAllChats !== 'topics',
      title: true,
      titleRightSecondary: true,
      subtitle: true,
      subtitleRight: true,
      noWrap: true,
      asLink: true
    });

    this.subtitleRight.remove();

    const wrapMiddleware = wrapOptions?.middleware;
    this.middlewareHelper = wrapMiddleware ? wrapOptions.middleware.create() : (controlled ? getMiddleware() : undefined);

    const newWrapOptions: WrapSomethingOptions = {
      ...wrapOptions
    };

    if(this.middlewareHelper) {
      newWrapOptions.middleware = this.middlewareHelper.get();
    }

    const isSavedDialog = !!threadId && peerId === rootScope.myId;
    const isForumTopic = !!threadId && !isSavedDialog;

    const usePeerId = isSavedDialog ? threadId : peerId;

    const avatar = isForumTopic || asAllChats === 'topics' ? undefined : avatarNew({
      middleware: this.middlewareHelper.get(),
      size: avatarSizeMap[avatarSize],

      lazyLoadQueue: newWrapOptions.lazyLoadQueue,
      isDialog: !!meAsSaved,
      peerId: fromName ? NULL_PEER_ID : usePeerId,
      peerTitle: fromName,
      withStories,
      wrapOptions: newWrapOptions,
      meAsNotes: isSavedDialog,
      asAllChats: asAllChats === 'monoforum',
      autoDeletePeriod
    });
    loadPromises?.push(avatar?.readyThumbPromise);
    const avatarEl = avatar?.node;
    if(avatarEl) {
      avatarEl.classList.add('dialog-avatar');
      this.applyMediaElement(avatarEl, avatarSize);
    }

    const captionDiv = this.container;

    const titleSpanContainer = this.title;
    titleSpanContainer.classList.add('user-title');

    this.titleRow.classList.add('dialog-title');

    const isActive = !dontSetActive && !autonomous &&
      appImManager.chat &&
      appImManager.isSamePeer(appImManager.chat, {
        peerId: monoforumParentPeerId || peerId,
        monoforumThreadId: monoforumParentPeerId ? peerId : undefined,
        threadId: threadId,
        type: isSavedDialog ? ChatType.Saved : ChatType.Chat
      });

    let titleWrapOptions: WrapSomethingOptions;

    const peerTitle = new PeerTitle();
    const peerTitlePromise = peerTitle.update({
      peerId: usePeerId,
      fromName,
      dialog: meAsSaved,
      onlyFirstName,
      withIcons: !noIcons,
      threadId: isSavedDialog ? undefined : threadId,
      wrapOptions: titleWrapOptions = {
        textColor: appDialogsManager.getTextColor(isActive),
        ...newWrapOptions
      },
      iconsColor: appDialogsManager.getPrimaryColor(isActive),
      meAsNotes: isSavedDialog,
      asAllChats
    });

    loadPromises?.push(peerTitlePromise);
    titleSpanContainer.append(peerTitle.element);

    // const titleIconsPromise = generateTitleIcons(peerId).then((elements) => {
    //   titleSpanContainer.append(...elements);
    // });

    // if(loadPromises) {
    //   loadPromises.push(titleIconsPromise);
    // }
    // }

    const span = this.subtitle;
    // span.classList.add('user-last-message');

    const li = this.container;
    li.classList.add('chatlist-chat', 'chatlist-chat-' + avatarSize);
    if(!autonomous) {
      (li as HTMLAnchorElement).href = '#' + peerId;
    }
    // if(rippleEnabled) {
    //   ripple(li);
    // }

    if(avatarSize === 'bigger') {
      this.container.classList.add('row-big');
    } else if(avatarSize === 'small') {
      this.container.classList.add('row-small');
    }

    li.dataset.peerId = '' + peerId;

    if(threadId) li.dataset.threadId = '' + threadId;
    if(monoforumParentPeerId) li.dataset.monoforumParentPeerId = '' + monoforumParentPeerId;
    if(asAllChats) li.dataset.isAllChats = 'true';


    const statusSpan = document.createElement('span');
    statusSpan.classList.add('message-status', 'sending-status'/* , 'transition', 'reveal' */);

    const lastTimeSpan = document.createElement('span');
    lastTimeSpan.classList.add('message-time');

    const rightSpan = this.titleRight;
    rightSpan.classList.add('dialog-title-details');
    rightSpan.append(statusSpan, lastTimeSpan);

    this.subtitleRow.classList.add('dialog-subtitle', 'has-multiple-badges');

    // if(I18n.isRTL) {
    //   // this.subtitle.dir = '';
    //   // this.subtitle.dir = 'rtl';
    // }

    const dom: DialogDom = this.dom = {
      avatarEl: avatar,
      captionDiv,
      titleSpan: peerTitle.element,
      titleSpanContainer,
      statusSpan,
      lastTimeSpan,
      lastMessageSpan: span,
      containerEl: li,
      listEl: li,
      subtitleEl: this.subtitleRow,
      titleWrapOptions
    };

    // this will never happen for migrated legacy chat
    if(!autonomous) {
      (li as any).dialogDom = dom;

      if(isMainList && !asAllChats && appDialogsManager.forumTab?.peerId === peerId && !threadId) {
        li.classList.add('is-forum-open');
      }
    }

    if(isActive) {
      appDialogsManager.setDialogActive(li, true);
    }
  }

  public destroy() {
    this.middlewareHelper?.destroy();
  }

  public remove() {
    this.destroy();
    this.dom.listEl.remove();
  }

  public createPinnedBadge() {
    if(this.dom.pinnedBadge) return;
    const badge = this.dom.pinnedBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-icon badge-${BADGE_SIZE} dialog-subtitle-badge-pinned`;
    badge.append(Icon('chatspinned'));
    this.dom.subtitleEl.append(badge);
  }

  public createUnreadBadge() {
    if(this.dom.unreadBadge) return;
    const badge = this.dom.unreadBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} dialog-subtitle-badge-unread`;
    this.dom.subtitleEl.append(badge);
  }

  public createUnreadAvatarBadge() {
    if(this.dom.unreadAvatarBadge) return;
    const badge = this.dom.unreadAvatarBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} avatar-badge`;
    this.dom.listEl.append(badge);
  }

  public createMentionsBadge() {
    if(this.dom.mentionsBadge) return;
    const badge = this.dom.mentionsBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} mention mention-badge dialog-subtitle-badge-mention`;
    badge.innerText = '@';
    this.dom.subtitleEl.append(badge);
  }

  public createReactionsBadge() {
    if(this.dom.reactionsBadge) return;
    const badge = this.dom.reactionsBadge = document.createElement('div');
    badge.className = `dialog-subtitle-badge badge badge-${BADGE_SIZE} reaction-badge dialog-subtitle-badge-reaction`;
    badge.append(Icon('reactions_filled'));
    this.dom.subtitleEl.append(badge);
  }

  public toggleBadgeByKey(
    key: Extract<keyof DialogDom, 'unreadBadge' | 'unreadAvatarBadge' | 'mentionsBadge' | 'reactionsBadge' | 'pinnedBadge'>,
    hasBadge: boolean,
    justCreated: boolean,
    batch?: boolean
  ) {
    SetTransition({
      element: this.dom[key],
      className: 'is-visible',
      forwards: hasBadge,
      duration: batch ? 0 : BADGE_TRANSITION_TIME,
      onTransitionEnd: hasBadge ? undefined : () => {
        this.dom[key].remove();
        delete this.dom[key];
      },
      useRafs: !justCreated || !isInDOM(this.dom[key]) ? 2 : 0
    });
  }
}

// const testScroll = false;
// let testTopSlice = 1;

type FilterRendered = {
  id: number,
  menu: HTMLElement,
  container: HTMLElement,
  unread: HTMLElement,
  title: HTMLElement,
  scrollable: Scrollable,
  topNotification?: Row,
  topNotificationContainer?: HTMLElement,
  topNotificationData?: {
    _: 'chatlistUpdates',
    chatlistUpdates: ChatlistsChatlistUpdates
  },
  middlewareHelper: MiddlewareHelper,
};

type GetDialogOptions = {
  threadOrSavedId?: number;
  monoforumParentPeerId?: number;
};

type InitDialogAdditionalOptions = {
  isBatch?: boolean;
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


export class AppDialogsManager {
  public chatsContainer = document.getElementById('chatlist-container') as HTMLDivElement;

  private log = logger('DIALOGS', LogTypes.Log | LogTypes.Error | LogTypes.Warn | LogTypes.Debug);

  public contextMenu: DialogsContextMenu;

  public filterId: number;
  public folders: {[k in 'menu' | 'container' | 'menuScrollContainer']: HTMLElement} = {
    menu: document.getElementById('folders-tabs'),
    menuScrollContainer: null,
    container: document.getElementById('folders-container')
  };
  private filtersRendered: {
    [filterId: string]: FilterRendered
  } = {};
  private showFiltersPromise: Promise<void>;

  private lastActiveElements: Set<HTMLElement> = new Set();

  public loadContacts: () => void;
  public processContact: (peerId: PeerId) => void;

  private initedListeners = false;

  public onListLengthChange: () => Promise<void>;
  private allChatsIntlElement: I18n.IntlElement;

  private emptyDialogsPlaceholderSubtitle: I18n.IntlElement;
  private updateContactsLengthPromise: Promise<number>;

  private filtersNavigationItem: NavigationItem;

  private managers: AppManagers;
  private selectTab: ReturnType<typeof horizontalMenu>;

  public doNotRenderChatList: boolean;
  public isFirstDialogsLoad: boolean;

  private stateMiddlewareHelper: MiddlewareHelper;

  private forumsTabs: Map<PeerId, ForumTab>;
  private forumsSlider: HTMLElement;
  public forumTab: ForumTab;
  private forumNavigationItem: NavigationItem;

  public xd: AutonomousDialogList;
  public xds: {[filterId: number]: AutonomousDialogList} = {};

  public cancelChatlistUpdatesFetching: () => void;
  public fetchChatlistUpdates: () => void;

  private storiesListContainer: HTMLDivElement;
  private bottomPart: HTMLDivElement;
  private disposeStories: () => void;
  public resizeStoriesList: () => void;

  private suggestionContainer: HTMLElement;

  private lazyLoadQueue: LazyLoadQueue;

  public start() {
    const managers = this.managers = getProxiedManagers();

    this.contextMenu = new DialogsContextMenu(managers);
    this.stateMiddlewareHelper = getMiddleware();
    this.lazyLoadQueue = new LazyLoadQueue(5, true);

    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    // this.onListLengthChange = debounce(this._onListLengthChange, 100, false, true);
    this.onListLengthChange = () => void this._onListLengthChange();

    const bottomPart = this.bottomPart = document.createElement('div');
    bottomPart.classList.add('connection-status-bottom');
    bottomPart.append(this.folders.container);

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
          const prevId = selectTab.prevId();
          selectTab(xDiff < 0 ? prevId + 1 : prevId - 1);
        },
        verifyTouchTarget: () => {
          return !this.forumTab;
        }
      });
    }

    this.allChatsIntlElement = new I18n.IntlElement({
      key: 'FilterAllChatsShort'
    });

    rootScope.addEventListener('premium_toggle', async(isPremium) => {
      if(isPremium) {
        return;
      }

      const isFolderAvailable = await this.managers.filtersStorage.isFilterIdAvailable(this.filterId);
      if(!isFolderAvailable) {
        selectTab(whichChild(this.filtersRendered[FOLDER_ID_ALL].menu), false);
      }
    });

    rootScope.addEventListener('state_cleared', () => {
      const clearCurrent = REAL_FOLDERS.has(this.filterId);
      this.xd.loadedDialogsAtLeastOnce = false;
      this.showFiltersPromise = undefined;

      /* const clearPromises: Promise<any>[] = [];
      for(const name in this.managers.appStateManager.storagesResults) {
        const results = this.managers.appStateManager.storagesResults[name as keyof AppStateManager['storages']];
        const storage = this.managers.appStateManager.storages[name as keyof AppStateManager['storages']];
        results.length = 0;
        clearPromises.push(storage.clear());
      } */

      if(clearCurrent) {
        this.xd.clear();
        this.onTabChange();
      }

      this.onStateLoaded(useAppState()[0]);
    });

    this.setFilterId(FOLDER_ID_ALL);
    this.addFilter({
      id: FOLDER_ID_ALL,
      title: {_: 'textWithEntities', text: '', entities: []},
      localId: FOLDER_ID_ALL
    });

    const foldersScrollable = new ScrollableX(this.folders.menuScrollContainer);
    bottomPart.prepend(this.folders.menuScrollContainer);
    const selectTab = this.selectTab = horizontalMenuObjArgs({
      tabs: this.folders.menu,
      content: this.folders.container,
      onClick: async(id, tabContent) => {
        /* if(id !== 0) {
          id += 1;
        } */

        const _id = id;
        id = +tabContent.dataset.filterId || FOLDER_ID_ALL;

        rootScope.dispatchEventSingle('changing_folder_from_chatlist', id);

        const isFilterAvailable = this.filterId === -1 || REAL_FOLDERS.has(id) || await this.managers.filtersStorage.isFilterIdAvailable(id);
        if(!isFilterAvailable) {
          showLimitPopup('folders');
          return false;
        }

        const wasFilterId = this.filterId;
        if(!IS_MOBILE_SAFARI) {
          if(_id) {
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

        if(wasFilterId === id) {
          fastSmoothScrollToStart(this.xds[id].scrollable.container, 'y');
          return;
        }

        this.xds[id].clear();
        const promise = this.setFilterIdAndChangeTab(id).then(() => {
          // if(cached) {
          //   return renderPromise;
          // }
        });

        if(wasFilterId !== -1) {
          return promise;
        }
      },
      onTransitionEnd: () => {
        for(const folderId in this.xds) {
          if(+folderId !== this.filterId) {
            this.xds[folderId].clear();
          }
        }
      },
      scrollableX: foldersScrollable,
      onChange: ({element, active}) => {
        const renderer: CustomEmojiRendererElement = element?.querySelector('custom-emoji-renderer-element');
        renderer?.setTextColor(getFolderTitleTextColor(active));
      }
    });

    createFolderContextMenu({
      appSidebarLeft,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: this.managers,
      className: 'menu-horizontal-div-item',
      listenTo: this.folders.menu
    });

    const [appState] = useAppState();
    const [appSettings, setAppSettings] = useAppSettings();
    // * it should've had a better place :(
    appMediaPlaybackController.setPlaybackParams(unwrap(appSettings.playbackParams));
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

    PopupElement.MANAGERS = rootScope.managers = managers;
    appDownloadManager.construct(managers);
    appSidebarLeft.construct(managers);
    appSidebarRight.construct(managers);
    groupCallsController.construct(managers);
    callsController.construct(managers);
    appImManager.construct(managers);
    if(IS_LIVE_STREAM_SUPPORTED) rtmpCallsController.construct(managers);
    new ConnectionStatusComponent().construct(managers, this.chatsContainer, appSidebarLeft.inputSearch);

    // start

    this.xd = this.xds[this.filterId];

    appSidebarLeft.onCollapsedChange();
    this.onStateLoaded(appState);
    // selectTab(0, false);
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
      }
    });
  }

  private renderStories() {
    this.disposeStories = render(() => this._renderStories(), this.storiesListContainer);
  }

  public get chatList() {
    return this.xd.sortedList.list;
  }

  public setFilterId(filterId: number) {
    this.filterId = filterId;
  }

  public async setFilterIdAndChangeTab(filterId: number) {
    this.setFilterId(filterId);
    return this.onTabChange();
  }

  private initListeners() {
    rootScope.addEventListener('dialog_flush', ({dialog}) => {
      if(!dialog) {
        return;
      }

      this.setFiltersUnreadCount();
    });

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
      } else {
        this.setFilterUnreadCount(folder.id);
      }
    });

    rootScope.addEventListener('contacts_update', (userId) => {
      this.processContact?.(userId.toPeerId());
    });

    appImManager.addEventListener('peer_changed', ({peerId, threadId, monoforumThreadId, isForum}) => {
      const options: Parameters<AppImManager['isSamePeer']>[0] = {peerId, monoforumThreadId, threadId: isForum || rootScope.myId ? threadId : undefined};

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
        this.xd?.sortedList?.get?.(peerId), this.forumTab?.xd?.sortedList?.get(threadId || monoforumThreadId || peerId)
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
        return;
      }

      const elements = this.filtersRendered[filter.id];
      const active = this.filterId === filter.id;
      setInnerHTML(elements.title, await wrapFolderTitle(filter.title, elements.middlewareHelper.get(), false, {textColor: getFolderTitleTextColor(active)}));
    });

    rootScope.addEventListener('filter_delete', (filter) => {
      const elements = this.filtersRendered[filter.id];
      if(!elements) return;

      // set tab
      // (this.folders.menu.firstElementChild.children[Math.max(0, filter.id - 2)] as HTMLElement).click();
      elements.container.remove();
      elements.menu.remove();
      elements.middlewareHelper.destroy();

      this.xds[filter.id].destroy();
      delete this.xds[filter.id];
      delete this.filtersRendered[filter.id];

      this.onFiltersLengthChange();

      if(this.filterId === filter.id) {
        this.selectTab(0, false);
      }
    });

    rootScope.addEventListener('filter_order', async(order) => {
      order = order.slice();
      indexOfAndSplice(order, FOLDER_ID_ARCHIVE);

      const containerToAppend = this.folders.menu as HTMLElement;
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

        positionElementByIndex(renderedFilter.menu, containerToAppend, filter.localId);
        positionElementByIndex(renderedFilter.container, this.folders.container, filter.localId);
      });

      /* if(this.filterId) {
        const tabIndex = order.indexOf(this.filterId) + 1;
        selectTab.prevId = tabIndex;
      } */
    });

    rootScope.addEventListener('filter_joined', (filter) => {
      const filterRendered = this.filtersRendered[filter.id];
      this.selectTab(filterRendered.menu);
    });

    rootScope.addEventListener('changing_folder_from_sidebar', ({id, dontAnimate}) => {
      const filterRendered = this.filtersRendered[id];
      this.selectTab(filterRendered.menu, !dontAnimate);
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
  }

  public setDialogActive(listEl: HTMLElement, active: boolean) {
    const dom = (listEl as any).dialogDom as DialogDom;
    this.setDialogActiveStatus(listEl, active);
    listEl.classList.toggle('is-forum-open', this.forumTab?.peerId === listEl.dataset.peerId.toPeerId() && !listEl.dataset.threadId && !listEl.dataset.isAllChats);
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
    this.stateMiddlewareHelper.clean();
    const middleware = this.stateMiddlewareHelper.get();
    const filtersArr = state.filtersArr;
    const haveFilters = filtersArr.length > REAL_FOLDERS.size;
    // const filter = filtersArr.find((filter) => filter.id !== FOLDER_ID_ARCHIVE);

    this.disposeStories?.();
    this.disposeStories =
      this.resizeStoriesList =
      undefined;

    const addFilters = (filters: MyDialogFilter[]) => {
      for(const filter of filters) {
        this.addFilter(filter);
      }
      appSidebarLeft.foldersSidebarControls?.hydrateFilters?.(filters);
    };

    let addFiltersPromise: Promise<any>;
    if(haveFilters) {
      addFilters(filtersArr);
    } else {
      addFiltersPromise = this.managers.filtersStorage.getDialogFilters().then(addFilters);
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
      this.selectTab(0, false);
    }

    addFiltersPromise && await wrapPromiseWithMiddleware(addFiltersPromise);
    // this.folders.menu.children[0].classList.add('active');

    this.renderStories();
    this.doNotRenderChatList = undefined;

    this.filterId = -1;
    this.selectTab(0, false);

    if(!this.initedListeners) {
      this.initListeners();
      this.initedListeners = true;
    }

    haveFilters && this.showFiltersPromise && await wrapPromiseWithMiddleware(this.showFiltersPromise);

    this.managers.appNotificationsManager.getNotifyPeerTypeSettings();

    // await (await m(loadDialogsPromise)).renderPromise.catch(noop);
    this.managers.appMessagesManager.fillConversations();

    if(!this.suggestionContainer) {
      this.suggestionContainer = document.createElement('div');
      this.folders.container.parentElement.prepend(this.suggestionContainer);
      renderPendingSuggestion(this.suggestionContainer);
    }
  }

  /* private getOffset(side: 'top' | 'bottom'): {index: number, pos: number} {
    if(!this.scroll.loadedAll[side]) {
      const element = (side === 'top' ? this.chatList.firstElementChild : this.chatList.lastElementChild) as HTMLElement;
      if(element) {
        const peerId = element.dataset.peerId;
        const dialog = this.managers.appMessagesManager.getDialogByPeerId(peerId);
        return {index: dialog[0].index, pos: dialog[1]};
      }
    }

    return {index: 0, pos: -1};
  } */

  public onTabChange = () => {
    const {filterId} = this;
    this.xd = this.xds[filterId];
    this.xd.reset();

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
              topNotification.title.replaceChildren(t);
              topNotification.subtitle.replaceChildren(i18n('ChatList.SharedFolder.Subtitle'));
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

  private async setFilterUnreadCount(filterId: number) {
    // if(filterId === FOLDER_ID_ALL) {
    //   return;
    // }

    const unreadSpan = this.filtersRendered[filterId]?.unread;
    if(!unreadSpan) {
      return;
    }

    const {
      unreadUnmutedCount,
      unreadCount,
      unreadMentionsCount
    } = await this.managers.dialogsStorage.getFolderUnreadCount(filterId);

    unreadSpan.classList.toggle('badge-gray', !unreadUnmutedCount && !unreadMentionsCount);
    const count = filterId === FOLDER_ID_ALL ? unreadUnmutedCount : unreadCount;
    setBadgeContent(unreadSpan, count ? '' + count : '');
  }

  private setFiltersUnreadCount() {
    for(const filterId in this.filtersRendered) {
      this.setFilterUnreadCount(+filterId);
    }
  }

  public l(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const xd = this.xds[filter.id] = new AutonomousDialogList({filterId: filter.id, appDialogsManager: this});
    const {scrollable, list} = xd.generateScrollable(filter);
    this.setListClickListener({list, onFound: null, withContext: true});

    return {ul: list, xd, scrollable};
  }

  private createTopNotification(filterRendered: FilterRendered) {
    if(filterRendered.topNotification) return;

    const topNotificationContainer = filterRendered.topNotificationContainer = document.createElement('div');
    topNotificationContainer.classList.add('chatlist-top-notification-container');
    const topNotification: FilterRendered['topNotification'] = filterRendered.topNotification = new Row({
      title: true,
      subtitle: true,
      clickable: async() => {
        const data = filterRendered.topNotificationData;
        if(data._ === 'chatlistUpdates') {
          PopupElement.createPopup(PopupSharedFolderInvite, {
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
      },
      icon: 'next'
    });
    topNotification.container.classList.add('chatlist-top-notification');

    topNotificationContainer.append(topNotification.container);
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

    const containerToAppend = this.folders.menu as HTMLElement;
    const renderedFilter = this.filtersRendered[id];
    if(renderedFilter) {
      positionElementByIndex(renderedFilter.menu, containerToAppend, filter.localId);
      positionElementByIndex(renderedFilter.container, this.folders.container, filter.localId);
      return;
    }

    const middlewareHelper = getMiddleware();

    const menuTab = document.createElement('div');
    menuTab.classList.add('menu-horizontal-div-item');
    const span = document.createElement('span');
    span.classList.add('menu-horizontal-div-item-span');
    const titleSpan = document.createElement('span');
    titleSpan.classList.add('text-super');
    if(id === FOLDER_ID_ALL) titleSpan.append(this.allChatsIntlElement.element);
    else setInnerHTML(titleSpan, wrapFolderTitle(filter.title, middlewareHelper.get(), true, {textColor: 'secondary-text-color'}));
    const unreadSpan = createBadge('div', 20, 'primary');
    const i = document.createElement('i');
    span.append(titleSpan, unreadSpan, i);
    ripple(menuTab);
    menuTab.append(span);

    menuTab.dataset.filterId = '' + id;

    positionElementByIndex(menuTab, containerToAppend, filter.localId);
    // containerToAppend.append(li);

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
      menu: menuTab,
      container: div,
      unread: unreadSpan,
      title: titleSpan,
      scrollable,
      middlewareHelper
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
        if(show && !wasShowing) {
          this.setFiltersUnreadCount();
        }

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

      const button = Button('btn-primary btn-color-primary btn-control', {
        text: 'FilterHeaderEdit',
        icon: 'settings'
      });

      attachClickEvent(button, async() => {
        const tab = appSidebarLeft.createTab(AppEditFolderTab);
        tab.setInitFilter(await this.managers.filtersStorage.getFilter(this.filterId));
        tab.open();
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
    const chatList = this.chatList;
    const parts = chatList.parentElement.parentElement;
    const bottom = chatList.parentElement.nextElementSibling as HTMLElement;
    parts.classList.remove('with-contacts');
    bottom.replaceChildren();
    this.loadContacts = undefined;
    this.processContact = undefined;
  }

  private _onListLengthChange = () => {
    this.checkIfPlaceholderNeeded();

    if(this.filterId !== FOLDER_ID_ALL) return;

    // return;
    const chatList = this.chatList;
    const count = this.xd?.sortedList.itemsLength() || 0;

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

    section.container.classList.add('sidebar-left-contacts-section', 'hide');

    this.managers.appUsersManager.getContactsPeerIds(undefined, undefined, 'online').then((contacts) => {
      let ready = false;
      const onListLengthChange = () => {
        if(ready) {
          section.container.classList.toggle('hide', !sortedUserList.list.childElementCount);
        }

        this.updateContactsLength(true);
      };

      const sortedUserList = new SortedUserList({
        avatarSize: 'abitbigger',
        createChatListOptions: {
          dialogSize: 48,
          new: true
        },
        autonomous: false,
        onListLengthChange,
        managers: this.managers,
        middleware: undefined
      });

      this.loadContacts = () => {
        const pageCount = windowSize.height / 60 | 0;
        const promise = filterAsync(contacts.splice(0, pageCount), this.verifyPeerIdForContacts);

        promise.then((arr) => {
          arr.forEach((peerId) => {
            sortedUserList.add(peerId);
          });
        });

        if(!contacts.length) {
          this.loadContacts = undefined;
        }
      };

      this.loadContacts();

      this.processContact = async(peerId) => {
        if(peerId.isAnyChat()) {
          return;
        }

        const good = await this.verifyPeerIdForContacts(peerId);
        const added = sortedUserList.has(peerId);
        if(!added && good) sortedUserList.add(peerId);
        else if(added && !good) sortedUserList.delete(peerId);
      };

      const list = sortedUserList.list;
      list.classList.add('chatlist-new');
      this.setListClickListener({list});
      section.content.append(list);

      ready = true;
      onListLengthChange();
    });

    bottom.append(section.container);
  };

  private verifyPeerIdForContacts = async(peerId: PeerId) => {
    const [isContact, dialog] = await Promise.all([
      this.managers.appPeersManager.isContact(peerId),
      this.managers.appMessagesManager.getDialogOnly(peerId)
    ]);

    return isContact && !dialog;
  };

  public onSomeDrawerToggle?: () => void;

  public async toggleForumTab(newTab?: ForumTab, hideTab = this.forumTab) {
    if(!hideTab && !newTab) {
      return;
    }

    if(hideTab) {
      const dialogElement = this.xd.getDialogElement(hideTab.peerId);
      if(dialogElement) {
        dialogElement.dom.listEl.classList.remove('is-forum-open');
      }
    }

    if(hideTab === newTab) {
      newTab = undefined;
    }

    hideTab?.toggle(false);
    const promise = newTab?.toggle(true);
    if(hideTab === this.forumTab) {
      this.forumTab = newTab;
      this.onSomeDrawerToggle?.();
    }

    if(newTab) {
      const dialogElement = this.xd.getDialogElement(newTab.peerId);
      if(dialogElement) {
        dialogElement.dom.listEl.classList.add('is-forum-open');
      }

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

  public async toggleForumTabByPeerId(peerId: PeerId, show?: boolean, asInnerIfAsMessages?: boolean) {
    if(peerId === rootScope.myId) {
      const tab = appSidebarLeft.getTab(AppSharedMediaTab);
      if(show === true || (show === undefined && !tab)) {
        AppSharedMediaTab.open(appSidebarLeft, peerId, true);
      } else {
        if(tab?.peerId === peerId) {
          tab.close();
        }

        appImManager.setPeer({peerId});
      }

      return;
    }

    const {managers} = this;
    const history = appSidebarLeft.getHistory();
    const lastTab = history[history.length - 1];

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

    let forumTab: ForumTab;
    if(lastTab/*  && !(lastTab instanceof AppArchivedTab) */) {
      if(lastTab instanceof ForumTab && lastTab.peerId === peerId && show) {
        shake(lastTab.container);
        return;
      }

      const ForumTabConstructor = ForumTab.register.getEntry(peerId);
      if(!ForumTabConstructor) return;

      forumTab = appSidebarLeft.createTab(ForumTabConstructor);
      forumTab.open({peerId, managers});
      return;
    }

    forumTab = this.forumsTabs.get(peerId);
    const isSameTab = this.forumTab && this.forumTab === forumTab;
    show ??= !isSameTab;
    if(show === isSameTab) {
      if(show) {
        shake(forumTab.container);
      }

      return;
    }

    if(show && !forumTab) {
      const ForumTabConstructor = ForumTab.register.getEntry(peerId);
      if(!ForumTabConstructor) return;

      forumTab = new ForumTabConstructor(undefined);
      forumTab.init({peerId, managers});

      this.forumsTabs.set(peerId, forumTab);
      this.forumsSlider.append(forumTab.container);

      forumTab.managers = this.managers;
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
    if(lastMsgId) params.set('message', '' + lastMsgId);
    if(threadId) params.set('thread', '' + threadId);
    const url = `#/im?${params.toString()}`;
    window.open(url, '_blank');
  }

  public setListClickListener({
    list,
    onFound,
    withContext = false,
    autonomous = false,
    openInner = false
  }: {
    list: HTMLElement,
    onFound?: (target: HTMLElement) => void | boolean,
    withContext?: boolean,
    autonomous?: boolean,
    openInner?: boolean
  }) {
    let lastActiveListElement: HTMLElement;

    const setPeerFunc = (openInner ? appImManager.setInnerPeer : appImManager.setPeer).bind(appImManager);

    const findAvatarWithStories = (target: EventTarget) => {
      return (target as HTMLElement).closest('.avatar.has-stories') as HTMLElement;
    };
    const isOpeningStoriesDisabled = () => appSidebarLeft.isCollapsed() && !appSidebarLeft.hasSomethingOpenInside();

    list.dataset.autonomous = '' + +autonomous;
    list.addEventListener('mousedown', (e) => {
      if(
        e.button !== 0 ||
        (!isOpeningStoriesDisabled() && findAvatarWithStories(e.target))
      ) {
        return;
      }

      this.log('dialogs click list');
      const target = e.target as HTMLElement;
      const elem = findUpTag(target, DIALOG_LIST_ELEMENT_TAG);

      if(!elem) {
        return;
      }

      const peerId = elem.dataset.peerId.toPeerId();
      const lastMsgId = +elem.dataset.mid || undefined;
      const threadId = +elem.dataset.threadId || undefined;
      const monoforumParentPeerId = +elem.dataset.monoforumParentPeerId || undefined;

      const openChat = () => setPeerFunc({
        peerId: monoforumParentPeerId || peerId,
        monoforumThreadId: monoforumParentPeerId ? peerId : undefined,
        lastMsgId,
        threadId: threadId
      });

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
    }, {capture: true});

    // cancel link click
    // ! do not change it to attachClickEvent
    list.addEventListener('click', (e) => {
      if(e.button === 0) {
        cancelEvent(e);
      }

      if(isOpeningStoriesDisabled()) return;
      const avatar = findAvatarWithStories(e.target);
      avatar && appImManager.openStoriesFromAvatar(avatar);
    }, {capture: true});

    if(withContext) {
      this.contextMenu.attach(list);
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

  private async setLastMessage({
    dialog,
    lastMessage: _lastMessage,
    dialogElement,
    highlightWord,
    isBatch = false,
    setUnread = false,
    noForwardIcon
  }: {
    dialog: PossibleDialog,
    lastMessage?: Message.message | Message.messageService,
    dialogElement?: DialogElement,
    highlightWord?: string,
    isBatch?: boolean,
    setUnread?: boolean,
    noForwardIcon?: boolean
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

    if(!lastMessage && !draftMessage/*  || (lastMessage._ === 'messageService' && !lastMessage.rReply) */) {
      dom.lastMessageSpan.replaceChildren();
      dom.lastTimeSpan.replaceChildren();
      delete dom.listEl.dataset.mid;

      promise.resolve();
      return;
    }

    // set it before content so won't have bug in appSearch
    if(isSearch && lastMessage) {
      dom.listEl.dataset.mid = '' + lastMessage.mid;

      const replyTo = lastMessage.reply_to as MessageReplyHeader.messageReplyHeader;
      if(replyTo?.pFlags?.forum_topic) {
        dom.listEl.dataset.threadId = '' + getMessageThreadId(lastMessage);
      }
    }

    const isRestricted = !!lastMessage && isMessageRestricted(lastMessage as Message.message);
    const isSensitive = !!lastMessage && isMessageSensitive(lastMessage as Message.message);

    /* if(!dom.lastMessageSpan.classList.contains('user-typing')) */ {
      let mediaContainer: HTMLElement;
      let willPrepend: (Promise<any> | HTMLElement)[] = [];
      let icon: Icon;
      if(draftMessage) {

      } else if((lastMessage as Message.message)?.fwdFromId && !isSaved && !noForwardIcon) {
        icon = 'forward_filled';
      } else if((lastMessage as Message.message)?.reply_to?._ === 'messageReplyStoryHeader') {
        icon = 'storyreply';
      }

      if(icon) {
        const span = Icon(icon, 'dialog-subtitle-ico', 'dialog-subtitle-ico-' + icon);
        willPrepend.push(span);
      }

      if(lastMessage && !draftMessage && !isRestricted) {
        const media = getMediaFromMessage(lastMessage, true);
        const videoTypes: Set<MyDocument['type']> = new Set(['video', 'gif', 'round']);
        if(media && (media._ === 'photo' || videoTypes.has(media.type))) {
          const spoiler = ((lastMessage as Message.message).media as MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument)?.pFlags?.spoiler;
          const size = choosePhotoSize(media, 20, 20);

          if(size._ !== 'photoSizeEmpty') {
            mediaContainer = document.createElement('div');
            mediaContainer.classList.add('dialog-subtitle-media');

            if((media as MyDocument).type === 'round') {
              mediaContainer.classList.add('is-round');
            }

            willPrepend.push(wrapPhoto({
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
              const playIcon = Icon('play', 'dialog-subtitle-media-play');
              mediaContainer.append(playIcon);
            }
          }
        }
      }

      /* if(lastMessage.from_id === auth.id) { // You:  */
      if(draftMessage) {
        const span = document.createElement('span');
        span.classList.add('danger');
        span.append(i18n('Draft'), ': ');
        willPrepend.unshift(span);
      } else if(peerId.isAnyChat() && peerId !== lastMessage.fromId && !(lastMessage as Message.messageService).action) {
        const span = document.createElement('span');
        span.classList.add('primary-text');

        if(lastMessage.fromId === rootScope.myId) {
          span.append(i18n('FromYou'));
          willPrepend.unshift(span);
        } else {
          // str = sender.first_name || sender.last_name || sender.username;
          const p = middleware(wrapPeerTitle({
            peerId: lastMessage.fromId,
            onlyFirstName: true
          })).then((element) => {
            span.prepend(element);
            return span;
          }, noop);

          willPrepend.unshift(p);
        }

        span.append(': ');
        // console.log(sender, senderBold.innerText);
      }

      const withoutMediaType = !!mediaContainer && !!(lastMessage as Message.message)?.message;
      const wrapMessageForReplyOptions: Partial<WrapMessageForReplyOptions & WrapRichTextOptions> = {
        textColor: this.getTextColor(dom.listEl.classList.contains('active'))
      };

      let fragment: DocumentFragment, wrapResult: ReturnType<typeof wrapMessageForReply>;
      if(highlightWord && (lastMessage as Message.message)?.message) {
        wrapResult = wrapMessageForReply({
          ...wrapMessageForReplyOptions,
          message: lastMessage,
          highlightWord,
          withoutMediaType
        });
      } else if(draftMessage) {
        wrapResult = wrapMessageForReply({
          ...wrapMessageForReplyOptions,
          message: draftMessage
        });
      } else if(lastMessage) {
        wrapResult = wrapMessageForReply({
          ...wrapMessageForReplyOptions,
          message: lastMessage,
          withoutMediaType
        });
      } else { // rare case
        fragment = document.createDocumentFragment();
      }

      if(wrapResult) {
        fragment = await middleware(wrapResult);
      }

      if(willPrepend.length) {
        willPrepend = await middleware(Promise.all(willPrepend));
        // fragment.prepend(...(willPrepend as HTMLElement[]));
      }

      // const flex = !!mediaContainer && (willPrepend as HTMLElement[])[0] === mediaContainer;
      const flex = true;
      dom.lastMessageSpan.classList.toggle('dialog-subtitle-flex', flex);
      if(flex) {
        const parts = [...willPrepend, fragment].map((part, idx, arr) => {
          const span = document.createElement('span');
          span.classList.add('dialog-subtitle-span');
          // if(part !== mediaContainer) {
          span.classList.add('dialog-subtitle-span-overflow');
          // }
          if(idx === (arr.length - 1)) {
            span.classList.add('dialog-subtitle-span-last');
            span.dir = 'auto';
          }
          span.append(part as HTMLElement);
          // setInnerHTML(span, part as HTMLElement);
          return span;
        });
        dom.lastMessageSpan.replaceChildren(...parts);
        // dom.lastMessageSpan.replaceChildren(...[mediaContainer, span].filter(Boolean));
      } else {
        replaceContent(dom.lastMessageSpan, fragment);
      }
    }

    if(lastMessage || draftMessage/*  && lastMessage._ !== 'draftMessage' */) {
      const date = draftMessage ? Math.max(draftMessage.date, lastMessage?.date || 0) : lastMessage.date;
      replaceContent(dom.lastTimeSpan, formatDateAccordingToTodayNew(new Date(date * 1000)));
    } else dom.lastTimeSpan.textContent = '';

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
    const wasMuted = dom.listEl.classList.contains('is-muted') && !dom.listEl.classList.contains('backwards');

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

    if(isMuted !== wasMuted) {
      if(isMuted && !dom.mutedIcon) {
        dom.mutedIcon = Icon('nosound', 'dialog-muted-icon');
        dom.titleSpanContainer.append(dom.mutedIcon);
      }

      SetTransition({
        element: dom.listEl,
        className: 'is-muted',
        forwards: isMuted,
        duration: transitionDuration,
        onTransitionEnd: !isMuted ? (() => {
          dom.mutedIcon.remove();
          delete dom.mutedIcon;
        }) : undefined
      });
    }

    setSendingStatus(dom.statusSpan, isTopic && dialog.pFlags.closed ? 'premium_lock' : setStatusMessage, true);

    // if(isTopic) {
    //   dom.statusSpan.parentElement.classList.toggle('is-closed', !!dialog.pFlags.closed);
    // }

    const hasPinnedBadge = isPinned && !isMonoforumThread && !isAllChats;
    const isPinnedBadgeMounted = !!dom.pinnedBadge;
    if(hasPinnedBadge) {
      dialogElement.createPinnedBadge();
    }

    const hasUnreadBadge = isDialogUnread;
    const isUnreadBadgeMounted = !!dom.unreadBadge;
    if(hasUnreadBadge) {
      dialogElement.createUnreadBadge();
    }

    const hasUnreadAvatarBadge = this.xd !== this.xds[FOLDER_ID_ARCHIVE] && !isTopic && !isMonoforumThread && !isAllChats && (!!this.forumTab || appSidebarLeft.isCollapsed()) && isDialogUnread;

    const isUnreadAvatarBadgeMounted = !!dom.unreadAvatarBadge;
    if(hasUnreadAvatarBadge) {
      dialogElement.createUnreadAvatarBadge();
    }

    const hasMentionsBadge = isSaved || isMonoforumThread ? false : (dialog.unread_mentions_count && (dialog.unread_mentions_count > 1 || dialog.unread_count > 1));
    const isMentionsBadgeMounted = !!dom.mentionsBadge;
    if(hasMentionsBadge) {
      dialogElement.createMentionsBadge();
    }

    const hasReactionsBadge = isSaved ? false : !!dialog.unread_reactions_count;
    const isReactionsBadgeMounted = !!dom.reactionsBadge;
    if(hasReactionsBadge) {
      dialogElement.createReactionsBadge();
    }

    const badgesLength = [hasPinnedBadge, hasUnreadBadge, hasMentionsBadge, hasReactionsBadge].filter(Boolean).length;
    SetTransition({
      element: dialogElement.subtitleRow,
      className: 'has-only-pinned-badge',
      forwards: hasPinnedBadge && badgesLength === 1,
      duration: isBatch ? 0 : BADGE_TRANSITION_TIME
    });

    const a: [Parameters<DialogElement['toggleBadgeByKey']>[0], boolean, boolean][] = [
      ['pinnedBadge', hasPinnedBadge, isPinnedBadgeMounted],
      ['unreadBadge', hasUnreadBadge, isUnreadBadgeMounted],
      ['unreadAvatarBadge', hasUnreadAvatarBadge, isUnreadAvatarBadgeMounted],
      ['mentionsBadge', hasMentionsBadge, isMentionsBadgeMounted],
      ['reactionsBadge', hasReactionsBadge, isReactionsBadgeMounted]
    ];

    a.forEach(([key, hasBadge, isBadgeMounted]) => {
      const badge = dom[key];
      if(!badge) {
        return;
      }

      dialogElement.toggleBadgeByKey(key, hasBadge, isBadgeMounted, isBatch);
    });

    if(!hasUnreadBadge) {
      deferred.resolve();
      return;
    }

    let isUnread = true, isMention = false, unreadBadgeText: string;
    if(!isSaved && !isMonoforumThread && dialog.unread_mentions_count && unreadCount === 1) {
      unreadBadgeText = '@';
      isMention = true;
    } else if(isDialogUnread) {
      // dom.unreadMessagesSpan.innerText = '' + (unreadCount ? formatNumber(unreadCount, 1) : ' ');
      unreadBadgeText = '' + (unreadCount ? formatNumber(unreadCount, 1) : ' ');
    } else {
      unreadBadgeText = '';
      isUnread = false;
    }

    if(isTopic) {
      const notVisited = isDialogUnread && unreadBadgeText === ' ';
      dom.unreadBadge.classList.toggle('not-visited', notVisited);
    }

    const b: Array<[HTMLElement, string]> = [
      dom.unreadBadge && [dom.unreadBadge, unreadBadgeText],
      dom.unreadAvatarBadge && [dom.unreadAvatarBadge, unreadBadgeText || undefined]
    ];

    b.filter(Boolean).forEach(([badge, text]) => {
      if(text !== undefined) {
        badge.innerText = unreadBadgeText;
      }

      badge.classList.toggle('unread', isUnread);
      badge.classList.toggle('mention', isMention);
    });

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
    if(typeof(dialog) !== 'object') {
      let originalDialog: AnyDialog | MonoforumDialog;
      if(monoforumParentPeerId) {
        originalDialog = await this.managers.monoforumDialogsStorage.getDialogByParent(monoforumParentPeerId, dialog);

        if(!originalDialog) return {
          peerId: dialog || NULL_PEER_ID,
          pFlags: {}
        } as MonoforumDialog;
      } else if(threadOrSavedId) {
        if(dialog === rootScope.myId) {
          originalDialog = await this.managers.dialogsStorage.getAnyDialog(dialog, threadOrSavedId);
          if(!originalDialog) {
            const peerId = dialog || NULL_PEER_ID;
            return {
              peerId,
              pFlags: {}
            } as any as SavedDialog;
          }
        } else {
          originalDialog = await this.managers.dialogsStorage.getForumTopic(dialog, threadOrSavedId);
          if(!originalDialog) {
            const peerId = dialog || NULL_PEER_ID;
            return {
              peerId,
              pFlags: {}
            } as any as ForumTopic;
          }
        }
      } else {
        originalDialog = await this.managers.appMessagesManager.getDialogOnly(dialog);
        if(!originalDialog) {
          const peerId = dialog || NULL_PEER_ID;
          return {
            peerId,
            peer: await this.managers.appPeersManager.getOutputPeer(peerId),
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
    }

    if(ret && this.lazyLoadQueue) {
      const div = ret.dom.listEl;
      const lazyLoadElement: Parameters<AppDialogsManager['lazyLoadQueue']['push']>[0] = {
        div,
        load: async() => {
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

          const readMaxId = await this.managers.appMessagesManager.getReadMaxIdIfUnread(
            options.peerId,
            options.threadId
          );

          if(readMaxId) {
            const limit = Math.floor(getHistoryOptions.limit / 2);
            await this.managers.appMessagesManager.getHistory({
              ...getHistoryOptions,
              offsetId: readMaxId || undefined,
              backLimit: readMaxId ? limit : undefined,
              limit
            });
          }

          return this.managers.appMessagesManager.getHistory(getHistoryOptions);
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
    const {peerId} = options;
    const getDialogPromise = this.getDialog(peerId, {threadOrSavedId: options.threadId, monoforumParentPeerId: options.monoforumParentPeerId});

    const promise = getDialogPromise.then((dialog) => {
      const promises: (Promise<any> | void)[] = [];
      const isUser = peerId.isUser();
      if(!isUser && isDialog(dialog)) {
        promises.push(this.xd.processDialogForCallStatus(peerId, dialogElement.dom));
      }

      if(peerId !== rootScope.myId && isUser) {
        promises.push(this.managers.appUsersManager.getUserStatus(peerId.toUserId()).then((status) => {
          if(status?._ === 'userStatusOnline') {
            this.xd.setOnlineStatus(dialogElement.dom.avatarEl.node, true);
          }
        }));
      }

      promises.push(this.setLastMessageN({
        dialog,
        dialogElement: dialogElement,
        isBatch: options.isBatch,
        setUnread: true
      }));

      return Promise.all(promises);
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
}


const appDialogsManager = new AppDialogsManager();
MOUNT_CLASS_TO.appDialogsManager = appDialogsManager;
export default appDialogsManager;
