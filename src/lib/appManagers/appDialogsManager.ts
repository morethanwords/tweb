/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDialogFilter} from '../storages/filters';
import type {Dialog, ForumTopic, MyMessage, SavedDialog} from './appMessagesManager';
import type {MyDocument} from './appDocsManager';
import type {State} from '../../config/state';
import type {AnyDialog} from '../storages/dialogs';
import type {CustomEmojiRendererElement} from '../customEmoji/renderer';
import PopupElement from '../../components/popups';
import DialogsContextMenu from '../../components/dialogsContextMenu';
import {horizontalMenu} from '../../components/horizontalMenu';
import ripple from '../../components/ripple';
import Scrollable, {ScrollableX, SliceSides} from '../../components/scrollable';
import {formatDateAccordingToTodayNew} from '../../helpers/date';
import {IS_MOBILE_SAFARI, IS_SAFARI} from '../../environment/userAgent';
import {logger, LogTypes} from '../logger';
import rootScope from '../rootScope';
import appImManager, {AppImManager, APP_TABS} from './appImManager';
import Button from '../../components/button';
import SetTransition from '../../components/singleTransition';
import {MyDraftMessage} from './appDraftsManager';
import {MOUNT_CLASS_TO} from '../../config/debug';
import PeerTitle, {changeTitleEmojiColor} from '../../components/peerTitle';
import I18n, {FormatterArguments, i18n, LangPackKey, _i18n} from '../langPack';
import findUpTag from '../../helpers/dom/findUpTag';
import lottieLoader from '../rlottie/lottieLoader';
import wrapPhoto from '../../components/wrappers/photo';
import AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import appSidebarLeft from '../../components/sidebarLeft';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import replaceContent from '../../helpers/dom/replaceContent';
import ConnectionStatusComponent from '../../components/connectionStatus';
import {renderImageFromUrlPromise} from '../../helpers/dom/renderImageFromUrl';
import {doubleRaf, fastRafConventional, fastRafPromise} from '../../helpers/schedulers';
import SortedUserList from '../../components/sortedUserList';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import handleTabSwipe from '../../helpers/dom/handleTabSwipe';
import windowSize from '../../helpers/windowSize';
import isInDOM from '../../helpers/dom/isInDOM';
import {setSendingStatus} from '../../components/sendingStatus';
import SortedList, {SortedElementBase} from '../../helpers/sortedList';
import debounce from '../../helpers/schedulers/debounce';
import {CAN_HIDE_TOPIC, FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, NULL_PEER_ID, REAL_FOLDERS} from '../mtproto/mtproto_config';
import groupCallActiveIcon from '../../components/groupCallActiveIcon';
import {Chat, ChatlistsChatlistUpdates, DialogFilter, Message, MessageReplyHeader} from '../../layer';
import IS_GROUP_CALL_SUPPORTED from '../../environment/groupCallSupport';
import mediaSizes from '../../helpers/mediaSizes';
import appNavigationController, {NavigationItem} from '../../components/appNavigationController';
import appMediaPlaybackController from '../../components/appMediaPlaybackController';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {AppManagers} from './managers';
import appSidebarRight from '../../components/sidebarRight';
import choosePhotoSize from './utils/photos/choosePhotoSize';
import wrapEmojiText from '../richTextProcessor/wrapEmojiText';
import wrapMessageForReply, {WrapMessageForReplyOptions} from '../../components/wrappers/messageForReply';
import isMessageRestricted from './utils/messages/isMessageRestricted';
import getMediaFromMessage from './utils/messages/getMediaFromMessage';
import getMessageSenderPeerIdOrName from './utils/messages/getMessageSenderPeerIdOrName';
import wrapStickerEmoji from '../../components/wrappers/stickerEmoji';
import getDialogIndexKey from './utils/dialogs/getDialogIndexKey';
import getProxiedManagers from './getProxiedManagers';
import getDialogIndex from './utils/dialogs/getDialogIndex';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import wrapPeerTitle from '../../components/wrappers/peerTitle';
import middlewarePromise from '../../helpers/middlewarePromise';
import appDownloadManager from './appDownloadManager';
import groupCallsController from '../calls/groupCallsController';
import callsController from '../calls/callsController';
import cancelEvent from '../../helpers/dom/cancelEvent';
import noop from '../../helpers/noop';
import DialogsPlaceholder from '../../helpers/dialogsPlaceholder';
import pause from '../../helpers/schedulers/pause';
import apiManagerProxy from '../mtproto/mtprotoworker';
import filterAsync from '../../helpers/array/filterAsync';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import whichChild from '../../helpers/dom/whichChild';
import {getMiddleware, MiddlewareHelper} from '../../helpers/middleware';
import makeError from '../../helpers/makeError';
import getUnsafeRandomInt from '../../helpers/number/getUnsafeRandomInt';
import Row, {RowMediaSizeType} from '../../components/row'
import SettingSection from '../../components/settingSection';
import {SliderSuperTabEventable} from '../../components/sliderTab';
import safeAssign from '../../helpers/object/safeAssign';
import ListenerSetter from '../../helpers/listenerSetter';
import ButtonMenuToggle from '../../components/buttonMenuToggle';
import getMessageThreadId from './utils/messages/getMessageThreadId';
import formatNumber from '../../helpers/number/formatNumber';
import AppSharedMediaTab from '../../components/sidebarRight/tabs/sharedMedia';
import {dispatchHeavyAnimationEvent} from '../../hooks/useHeavyAnimationCheck';
import shake from '../../helpers/dom/shake';
import AppEditTopicTab from '../../components/sidebarRight/tabs/editTopic';
import getServerMessageId from './utils/messageId/getServerMessageId';
import AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import eachTimeout from '../../helpers/eachTimeout';
import PopupSharedFolderInvite from '../../components/popups/sharedFolderInvite';
import showLimitPopup from '../../components/popups/limit';
import StoriesList from '../../components/stories/list';
import {render} from 'solid-js/web';
import {avatarNew} from '../../components/avatarNew';
import Icon from '../../components/icon';
import setBadgeContent from '../../helpers/setBadgeContent';
import createBadge from '../../helpers/createBadge';
import {isDialog, isForumTopic, isSavedDialog} from './utils/dialogs/isDialog';
import {ChatType} from '../../components/chat/chat';
import PopupDeleteDialog from '../../components/popups/deleteDialog';
import rtmpCallsController from '../calls/rtmpCallsController';
import IS_LIVE_STREAM_SUPPORTED from '../../environment/liveStreamSupport';
import {WrapRichTextOptions} from '../richTextProcessor/wrapRichText';
import createFolderContextMenu from '../../helpers/dom/createFolderContextMenu';
import {useAppSettings} from '../../stores/appSettings';
import wrapFolderTitle from '../../components/wrappers/folderTitle';
import {SequentialCursorFetcher, SequentialCursorFetcherResult} from '../../helpers/sequentialCursorFetcher';
import SortedDialogList from '../../components/sortedDialogList';
import throttle from '../../helpers/schedulers/throttle';

export const DIALOG_LIST_ELEMENT_TAG = 'A';
const DIALOG_LOAD_COUNT = 10;

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

const BADGE_SIZE = 22;
const BADGE_TRANSITION_TIME = 250;


const avatarSizeMap: {[k in DialogElementSize]?: number} = {
  bigger: 54,
  abitbigger: 42,
  small: 32
};

export type DialogElementSize = RowMediaSizeType;
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
  wrapOptions: WrapSomethingOptions,
  isMainList?: boolean,
  withStories?: boolean,
  controlled?: boolean
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
    wrapOptions = {},
    isMainList,
    withStories,
    controlled
  }: DialogElementOptions) {
    super({
      clickable: true,
      noRipple: !rippleEnabled,
      havePadding: !threadId,
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

    const avatar = isForumTopic ? undefined : avatarNew({
      middleware: this.middlewareHelper.get(),
      size: avatarSizeMap[avatarSize],

      lazyLoadQueue: newWrapOptions.lazyLoadQueue,
      isDialog: !!meAsSaved,
      peerId: fromName ? NULL_PEER_ID : usePeerId,
      peerTitle: fromName,
      withStories,
      wrapOptions: newWrapOptions,
      meAsNotes: isSavedDialog
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

    const isActive = !autonomous &&
      appImManager.chat &&
      appImManager.isSamePeer(appImManager.chat, {peerId, threadId: threadId, type: isSavedDialog ? ChatType.Saved : ChatType.Chat});

    const peerTitle = new PeerTitle();
    const peerTitlePromise = peerTitle.update({
      peerId: usePeerId,
      fromName,
      dialog: meAsSaved,
      onlyFirstName,
      withIcons: !noIcons,
      threadId: isSavedDialog ? undefined : threadId,
      wrapOptions: {
        textColor: appDialogsManager.getPrimaryColor(isActive),
        ...newWrapOptions
      },
      meAsNotes: isSavedDialog
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
    if(threadId) {
      li.dataset.threadId = '' + threadId;
    }

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
      subtitleEl: this.subtitleRow
    };

    // this will never happen for migrated legacy chat
    if(!autonomous) {
      (li as any).dialogDom = dom;

      if(isMainList && appDialogsManager.forumTab?.peerId === peerId && !threadId) {
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

class ForumTab extends SliderSuperTabEventable {
  private rows: HTMLElement;
  private subtitle: HTMLElement;

  public peerId: PeerId;
  private firstTime: boolean;

  private log: ReturnType<typeof logger>;

  private xd: Some3;

  public async toggle(value: boolean) {
    if(this.init2) {
      await this.init2();
    }

    SetTransition({
      element: this.container,
      className: 'is-visible',
      forwards: value,
      duration: 300,
      onTransitionEnd: !value ? () => {
        this.onCloseAfterTimeout();
      } : undefined,
      useRafs: this.firstTime ? (this.firstTime = undefined, 2) : undefined
    });
  }

  private _close = () => {
    if(!this.slider) {
      appDialogsManager.toggleForumTab(undefined, this);
    } else {
      this.close();
    }
  };

  public init(options: {
    peerId: PeerId,
    managers: AppManagers
  }) {
    safeAssign(this, options);

    this.log = logger('FORUM');
    this.firstTime = true;
    this.container.classList.add('topics-container');

    const isFloating = !this.slider;
    if(isFloating) {
      this.closeBtn.replaceChildren(Icon('close'));
      this.container.classList.add('active', 'is-floating');

      attachClickEvent(this.closeBtn, this._close, {listenerSetter: this.listenerSetter});
    }

    this.rows = document.createElement('div');
    this.rows.classList.add('sidebar-header__rows');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('sidebar-header__subtitle');

    this.title.replaceWith(this.rows);
    this.rows.append(this.title, this.subtitle);

    this.xd = new Some3(this.peerId, isFloating ? 80 : 0);
    this.xd.scrollable = this.scrollable;
    this.xd.sortedList = new SortedDialogList({
      itemSize: 64,
      noAvatar: true,
      appDialogsManager,
      scrollable: this.scrollable,
      managers: this.managers,
      log: this.log,
      requestItemForIdx: this.xd.requestItemForIdx,
      onListShrinked: this.xd.onListShrinked,
      indexKey: 'index_0',
      virtualFilterId: this.peerId
    });

    const list = this.xd.sortedList.list;
    appDialogsManager.setListClickListener({list, onFound: null, withContext: true});
    this.scrollable.append(list);
    this.xd.bindScrollable();

    const btnMenu = ButtonMenuToggle({
      listenerSetter: this.listenerSetter,
      direction: 'bottom-left',
      buttons: [{
        icon: 'add',
        text: 'ForumTopic.Context.New',
        onClick: () => {
          appSidebarLeft.createTab(AppEditTopicTab).open(this.peerId);
        },
        separatorDown: true,
        verify: () => this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'manage_topics')
      }, {
        icon: 'info',
        text: 'ForumTopic.Context.Info',
        onClick: () => {
          AppSharedMediaTab.open(appSidebarLeft, this.peerId);
        }
      }, {
        icon: 'message',
        text: 'ForumTopic.Context.ShowAsMessages',
        onClick: this.viewAsMessages,
        verify: () => {
          const chat = appImManager.chat;
          return !chat || !appImManager.isSamePeer(chat, this.getOptionsForMessages());
        }
      }, {
        icon: 'adduser',
        text: 'ForumTopic.Context.AddMember',
        onClick: () => {},
        verify: () => false && this.managers.appChatsManager.hasRights(this.peerId.toChatId(), 'invite_users')
      }, {
        icon: 'logout',
        danger: true,
        text: 'LeaveMegaMenu',
        onClick: () => {
          PopupElement.createPopup(PopupDeleteDialog, this.peerId, undefined, (promise) => {
            this._close();
          });
        },
        separator: true,
        verify: async() => !!(await this.managers.appMessagesManager.getDialogOnly(this.peerId))
      }]
    });

    this.listenerSetter.add(rootScope)('history_reload', (peerId) => {
      if(this.peerId !== peerId) {
        return;
      }

      this.xd.fullReset();
    });

    this.listenerSetter.add(rootScope)('chat_update', (chatId) => {
      if(this.peerId !== chatId.toPeerId(true)) {
        return;
      }

      const chat = apiManagerProxy.getChat(chatId);
      if(!(chat as Chat.channel).pFlags.forum) {
        appDialogsManager.toggleForumTab(undefined, this);
      }
    });

    if(IS_TOUCH_SUPPORTED) {
      handleTabSwipe({
        element: this.container,
        onSwipe: () => {
          appDialogsManager.toggleForumTab(undefined, this);
        },
        middleware: this.middlewareHelper.get()
      });
    }

    this.header.append(btnMenu);

    if(!isFloating) {
      return this.init2();
    }
  }

  public async init2() {
    this.init2 = undefined;

    const middleware = this.middlewareHelper.get();
    const peerId = this.peerId;

    this.managers.apiUpdatesManager.subscribeToChannelUpdates(this.peerId.toChatId());
    middleware.onDestroy(() => {
      this.managers.apiUpdatesManager.unsubscribeFromChannelUpdates(this.peerId.toChatId());
    });

    const peerTitlePromise = wrapPeerTitle({
      peerId,
      dialog: true,
      wrapOptions: {middleware}
    });

    const setStatusPromise = appImManager.setPeerStatus({
      peerId,
      element: this.subtitle,
      needClear: true,
      useWhitespace: false,
      middleware,
      noTyping: true
    });

    // this.managers.dialogsStorage.getForumTopics(this.peerId).then((messagesForumTopics) => {
    //   console.log(messagesForumTopics);

    //   const promises = messagesForumTopics.topics.map((forumTopic) => {
    //     return this.sortedDialogList.add(forumTopic.id);
    //   });

    //   return Promise.all(promises);
    // }).then(() => {
    //   this.dialogsPlaceholder.detach(this.sortedDialogList.getAll().size);
    // });

    this.xd.onChatsScroll();

    return Promise.all([
      peerTitlePromise,
      setStatusPromise
      // this.xd.onChatsScroll().then((loadResult) => {
      //   return loadResult.cached ? loadResult.renderPromise : undefined
      // })
    ]).then(([
      peerTitle,
      setStatus
      // _
    ]) => {
      if(!middleware()) {
        return;
      }

      this.title.append(peerTitle);
      setStatus?.();
    });
  }

  public onCloseAfterTimeout() {
    super.onCloseAfterTimeout();
    this.xd.destroy();
  }

  public getOptionsForMessages(): Parameters<AppImManager['isSamePeer']>[0] {
    return {
      peerId: this.peerId,
      type: ChatType.Chat
    };
  }

  public viewAsMessages = async() => {
    const chat = appImManager.chat;
    const peerId = this.peerId;
    this._close();
    await this.managers.appChatsManager.toggleViewForumAsMessages(peerId.toChatId(), true);
    appImManager[chat?.peerId === peerId ? 'setPeer' : 'setInnerPeer'](this.getOptionsForMessages());
  };
}

const NOT_IMPLEMENTED_ERROR = new Error('not implemented');

type DialogKey = any;
class Some<T extends AnyDialog = AnyDialog> {
  public sortedList: SortedDialogList;
  public scrollable: Scrollable;
  public loadedDialogsAtLeastOnce: boolean;
  public needPlaceholderAtFirstTime: boolean;
  // protected offsets: {top: number, bottom: number};
  protected indexKey: ReturnType<typeof getDialogIndexKey>;
  protected sliceTimeout: number;
  protected managers: AppManagers;
  protected listenerSetter: ListenerSetter;
  protected loadDialogsPromise: Promise<{cached: boolean, renderPromise: Some2['loadDialogsRenderPromise']}>;
  protected loadDialogsRenderPromise: Promise<void>;
  protected placeholder: DialogsPlaceholder;
  protected log: ReturnType<typeof logger>;
  protected placeholderOptions: ConstructorParameters<typeof DialogsPlaceholder>[0];

  protected cursorFetcher = new SequentialCursorFetcher((cursor: number) => this.loadDialogs(cursor));
  protected hasReachedTheEnd = false;

  protected skipMigrated = true;

  public requestItemForIdx = (idx: number, itemsLength?: number) => {
    this.cursorFetcher.fetchUntil(idx + 1, itemsLength);
  }

  public onListShrinked = () => {
    const items = this.sortedList.getSortedItems();
    const last = items[items.length - 1];

    console.log('[my-debug] list shrinked: count, index :>> ', items.length, last?.index);

    this.cursorFetcher.setFetchedItemsCount(items.length);
    this.cursorFetcher.setNeededCount(items.length);
    this.cursorFetcher.setCursor(last?.index);

    // Make sure the current request is canceled so the cursor is not overriden to a bigger page
    this.loadDialogsDeferred.reject();
  }

  constructor() {
    this.log = logger('CL');
    this.managers = rootScope.managers;
    this.listenerSetter = new ListenerSetter();
  }

  public setIndexKey(indexKey: Some['indexKey']) {
    this.indexKey = indexKey;
    this.sortedList.indexKey = indexKey;
  }

  protected deleteDialogByKey(key: DialogKey) {
    this.sortedList.delete(key);
  }

  public deleteDialog(dialog: T) {
    return this.deleteDialogByKey(this.getDialogKey(dialog));
  }

  /**
   * @returns {boolean} Returns true if a new dialog was just added
   */
  private addOrDeleteDialogIfNeeded(dialog: T, key: any) {
    if(!this.canUpdateDialog(dialog)) {
      this.deleteDialog(dialog);
      return false;
    }

    if(!this.sortedList.has(key)) {
      this.sortedList.add(key);
      return true;
    }

    return false;
  }

  public updateDialog(dialog: T) {
    const key = this.getDialogKey(dialog);

    if(this.addOrDeleteDialogIfNeeded(dialog, key)) return;

    const dialogElement = this.getDialogElement(key);
    if(!dialogElement) {
      return;
    }

    appDialogsManager.setLastMessageN({
      dialog,
      dialogElement,
      setUnread: true
    });
    this.sortedList.update(key);
  }

  protected canUpdateDialog(dialog: T) {
    const sortedItems = this.sortedList.getSortedItems();
    const last = sortedItems[sortedItems.length - 1];

    const bottomIndex = last?.index;
    const dialogIndex = getDialogIndex(dialog);

    return !last || dialogIndex >= bottomIndex || this.hasReachedTheEnd;
  }

  public onChatsScroll() {
    this.requestItemForIdx(0);
  };

  protected onScrolledBottom() {
    console.log('[my-debug] try to fetch more');
    this.cursorFetcher.tryToFetchMore();
  }

  public createPlaceholder(): DialogsPlaceholder {
    const placeholder = this.placeholder = new DialogsPlaceholder(this.placeholderOptions);
    const getRectFrom = this.getRectFromForPlaceholder();
    placeholder.attach({
      container: this.sortedList.list.parentElement,
      getRectFrom,
      onRemove: () => {
        if(this.placeholder === placeholder) {
          this.placeholder = undefined;

          // The dialogs placeholder is a little taller than the container, so we need to update the scrollbar
          this.scrollable?.onScroll?.();
        }
      },
      blockScrollable: this.scrollable
    });

    return placeholder;
  }

  private loadDialogsDeferred: CancellablePromise<SequentialCursorFetcherResult<number>>;

  public async loadDialogs(offsetIndex?: number) {
    this.loadDialogsDeferred = deferredPromise();

    this.loadDialogsInner(offsetIndex)
    .then(
      this.loadDialogsDeferred.resolve.bind(this.loadDialogsDeferred),
      this.loadDialogsDeferred.reject.bind(this.loadDialogsDeferred)
    );

    return this.loadDialogsDeferred;
  }

  public getDialogKey(dialog: T): DialogKey {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getDialogKeyFromElement(element: HTMLElement): DialogKey {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getRectFromForPlaceholder(): Parameters<DialogsPlaceholder['attach']>[0]['getRectFrom'] {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public getDialogFromElement(element: HTMLElement): Promise<T> {
    throw NOT_IMPLEMENTED_ERROR;
  }

  protected getFilterId(): number {
    throw NOT_IMPLEMENTED_ERROR;
  }

  public checkForDialogsPlaceholder() {
    if(this.placeholder || this.loadedDialogsAtLeastOnce) return;

    this.placeholder = this.createPlaceholder();
  }

  private guessLoadCount() {
    // Make sure we have some scroll even when the screen is very huge
    return Math.max(windowSize.height / 64 * 1.25 | 0, DIALOG_LOAD_COUNT);
  }

  public async preloadDialogs() {
    const filterId = this.getFilterId();

    await this.managers.acknowledged.dialogsStorage.getDialogs({
      offsetIndex: 0,
      limit: this.guessLoadCount(),
      filterId,
      skipMigrated: this.skipMigrated
    });

    this.checkForDialogsPlaceholder();
  }

  // /**
  //  * The request might randomly get delayed even if it is cached, so it is good to have a placholder in this case
  //  */
  // private putPlaceholderIfRequestIsTooLong<T>(promise: Promise<T> | T) {
  //   if(!(promise instanceof Promise)) return promise;

  //   const SMALL_TIMEOUT = 5;

  //   const timeout = self.setTimeout(() => {
  //     if(this.sortedList.itemsLength()) return;

  //     this.placeholder = this.createPlaceholder();
  //   }, SMALL_TIMEOUT);

  //   promise?.finally(() => {
  //     self.clearTimeout(timeout);
  //   });

  //   return promise;
  // }

  public async loadDialogsInner(offsetIndex?: number): Promise<SequentialCursorFetcherResult<number>> {
    const filterId = this.getFilterId();

    this.checkForDialogsPlaceholder();

    console.log('[my-debug] loadDialogs offsetIndex :>> ', offsetIndex);

    /**
     * The first time getDialogs might return `count: null`, which is not good for this
     * infinite loading implementation, that's why we're refetching after 0.5 seconds to
     * make sure we get the latest total count of dialogs to properly render the whole list
     */
    let shouldRefetch = false;
    if(appDialogsManager.isFirstDialogsLoad && !offsetIndex) {
      appDialogsManager.isFirstDialogsLoad = false;
      shouldRefetch = true;
    }

    const ackedResult = await this.managers.acknowledged.dialogsStorage.getDialogs({
      offsetIndex,
      limit: this.guessLoadCount(),
      filterId,
      skipMigrated: this.skipMigrated
    });

    const result = await ackedResult.result;

    console.log('[my-debug] loadDialogs result :>> ', result);

    if(shouldRefetch) {
      setTimeout(async() => {
        console.log('[my-debug] Refetching dialogs bug');
        const {totalCount} = await this.loadDialogsInner();
        this.cursorFetcher.setFetchedItemsCount(totalCount);
      }, 500);
    }

    const newOffsetIndex = result.dialogs.reduce((prev, curr) => {
      const index = getDialogIndex(curr, this.indexKey)
      return index < prev ? index : prev;
    }, offsetIndex || Infinity);

    const items = await Promise.all(result.dialogs.map(async dialog => {
      const key = this.getDialogKey(dialog as T);

      return this.sortedList.createItemForKey(key);
    }));

    if(this.loadDialogsDeferred?.isRejected) throw new Error();

    this.loadedDialogsAtLeastOnce = true;
    this.hasReachedTheEnd = !!result.isEnd;

    this.sortedList.addDeferredItems(items, result.count || 0);

    this.placeholder?.detach(this.sortedList.itemsLength());

    return {
      cursor: newOffsetIndex === Infinity ? undefined : newOffsetIndex,
      count: result.dialogs.length,
      totalCount: this.sortedList.itemsLength() // Note that at some point we might add duplicates
    };
  }

  public async setTyping(dialog: T) {
    const key = this.getDialogKey(dialog);
    const dom = this.getDialogDom(key);
    if(!dom) {
      return;
    }

    const oldTypingElement = dom.lastMessageSpan.querySelector('.peer-typing-container') as HTMLElement;
    const newTypingElement = await appImManager.getPeerTyping(
      dialog.peerId,
      oldTypingElement,
      isForumTopic(dialog) ? dialog.id : undefined
    );
    if(!oldTypingElement && newTypingElement) {
      replaceContent(dom.lastMessageSpan, newTypingElement);
      dom.lastMessageSpan.classList.add('user-typing');
    }
  }

  public unsetTyping(dialog: T) {
    const key = this.getDialogKey(dialog);
    const dialogElement = this.getDialogElement(key);
    if(!dialogElement) {
      return;
    }

    dialogElement.dom.lastMessageSpan.classList.remove('user-typing');
    appDialogsManager.setLastMessageN({
      dialog,
      lastMessage: null,
      dialogElement,
      setUnread: null
    });
  }

  public getDialogDom(key: DialogKey) {
    // return this.doms[peerId];
    const element = this.sortedList.get(key);
    return element?.dom;
  }

  public getDialogElement(key: DialogKey) {
    const element = this.sortedList.get(key);
    return element;
  }

  public bindScrollable() {
    this.scrollable.onScrolledBottom = throttle(() => {
      this.onScrolledBottom();
    }, 200, false);
  }

  public clear() {
    this.sortedList.clear();
    this.placeholder?.remove();
    this.loadDialogsDeferred?.reject();
    this.cursorFetcher.reset();
    this.hasReachedTheEnd = false;
  }

  public reset() {
    this.loadDialogsRenderPromise = undefined;
    this.loadDialogsPromise = undefined;
  }

  public fullReset() {
    this.reset();
    this.clear();
    return this.onChatsScroll();
  }

  public destroy() {
    this.clear();
    this.scrollable.destroy();
    this.listenerSetter.removeAll();
    this.sortedList?.destroy();
  }
}

class Some3 extends Some<ForumTopic> {
  constructor(public peerId: PeerId, public paddingX: number) {
    super();

    this.skipMigrated = !!CAN_HIDE_TOPIC;

    this.placeholderOptions = {
      avatarSize: 0,
      marginVertical: 5,
      totalHeight: 64
    };

    this.listenerSetter.add(rootScope)('peer_typings', async({peerId, threadId, typings}) => {
      if(!threadId || this.peerId !== peerId) {
        return;
      }

      const dialog = await this.managers.dialogsStorage.getForumTopic(peerId, threadId);

      if(!dialog) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      for(const [peerId, {dialog, topics}] of dialogs) {
        if(peerId !== this.peerId || !topics?.size) {
          continue;
        }

        topics.forEach((forumTopic) => {
          this.updateDialog(forumTopic);
        });
      }
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      appDialogsManager.setUnreadMessagesN({dialog, dialogElement: this.getDialogElement(this.getDialogKey(dialog))});
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', async(dialog) => {
      if(dialog.peerId !== this.peerId) {
        return;
      }

      if(isDialog(dialog)) {
        const all = this.sortedList.getAll();
        const entries = [...all.entries()];
        const promises = entries.map(([id]) => this.managers.dialogsStorage.getForumTopic(this.peerId, id));
        const topics = await Promise.all(promises);
        entries.forEach(([id, element], idx) => {
          appDialogsManager.setUnreadMessagesN({dialog: topics[idx], dialogElement: element}); // возможно это не нужно, но нужно менять is-muted
        });

        return;
      }

      appDialogsManager.setUnreadMessagesN({dialog, dialogElement: this.getDialogElement(this.getDialogKey(dialog))}); // возможно это не нужно, но нужно менять is-muted
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop, peerId}) => {
      if(!isForumTopic(dialog) || dialog.peerId !== this.peerId) {
        return;
      }

      if(drop) {
        this.deleteDialog(dialog);
      } else {
        this.updateDialog(dialog);
      }
    });
  }

  public getDialogKey(dialog: ForumTopic) {
    return dialog.id;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.threadId;
  }

  public getRectFromForPlaceholder() {
    return (): DOMRectEditable => {
      const sidebarRect = appSidebarLeft.rect;
      const paddingY = 56;
      return {
        top: paddingY,
        right: sidebarRect.right,
        bottom: 0,
        left: this.paddingX,
        width: sidebarRect.width - this.paddingX,
        height: sidebarRect.height - paddingY
      };
    };
  }

  public getDialogFromElement(element: HTMLElement) {
    return this.managers.dialogsStorage.getForumTopic(+element.dataset.peerId, +element.dataset.threadId);
  }

  protected getFilterId() {
    return this.peerId;
  }

  protected canUpdateDialog(dialog: ForumTopic): boolean {
    if(dialog.pFlags.hidden) return false;
    return super.canUpdateDialog(dialog);
  }
}

export class Some2 extends Some<Dialog> {
  constructor(protected filterId: number) {
    super();

    this.needPlaceholderAtFirstTime = true;

    this.listenerSetter.add(rootScope)('peer_typings', async({peerId, typings}) => {
      const [dialog, isForum] = await Promise.all([
        this.managers.appMessagesManager.getDialogOnly(peerId),
        this.managers.appPeersManager.isForum(peerId)
      ]);

      if(!dialog || isForum) return;

      if(typings.length) {
        this.setTyping(dialog);
      } else {
        this.unsetTyping(dialog);
      }
    });

    this.listenerSetter.add(rootScope)('user_update', async(userId) => {
      if(!this.isActive) {
        return;
      }

      const peerId = userId.toPeerId();
      const dom = this.getDialogDom(peerId);
      if(!dom) {
        return;
      }

      const status = await this.managers.appUsersManager.getUserStatus(userId);
      const online = status?._ === 'userStatusOnline';
      this.setOnlineStatus(dom.avatarEl.node, online);
    });

    this.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const peerId = chatId.toPeerId(true);
      this.processDialogForCallStatus(peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
      if(!this.isActive || !dialog) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      if(!this.isActive) {
        return;
      }

      for(const [peerId, {dialog, topics}] of dialogs) {
        if(!isDialog(dialog)) {
          continue;
        }

        this.updateDialog(dialog);
        appDialogsManager.processContact?.(peerId.toPeerId());
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
      appDialogsManager.processContact?.(dialog.peerId);
    });

    this.listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      if(!this.isActive || !isDialog(dialog)) {
        return;
      }

      this.updateDialog(dialog);
    });

    this.listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop, peerId}) => {
      if(!this.isActive || isForumTopic(dialog)) {
        return;
      }

      if(drop) {
        this.deleteDialog(dialog);
      } else {
        this.updateDialog(dialog);
      }

      appDialogsManager.processContact?.(peerId);
    });

    this.listenerSetter.add(rootScope)('filter_update', async(filter) => {
      if(this.isActive && filter.id === this.filterId && !REAL_FOLDERS.has(filter.id)) {
        const dialogs = await this.managers.dialogsStorage.getCachedDialogs(true);
        await this.validateListForFilter();
        for(let i = 0, length = dialogs.length; i < length; ++i) {
          const dialog = dialogs[i];
          this.updateDialog(dialog);
        }

        if(appDialogsManager.filterId === this.filterId) {
          appDialogsManager.fetchChatlistUpdates?.();
        }
      }
    });
  }

  private get isActive() {
    return appDialogsManager.xd === this;
  }

  public getRectFromForPlaceholder() {
    return this.filterId === FOLDER_ID_ARCHIVE ? appDialogsManager.chatsContainer : appDialogsManager.folders.container;
  }

  protected getFilterId() {
    return this.filterId;
  }

  public setOnlineStatus(element: HTMLElement, online: boolean) {
    const className = 'is-online';
    const hasClassName = element.classList.contains(className);
    !hasClassName && online && element.classList.add(className);
    SetTransition({
      element: element,
      className: 'is-visible',
      forwards: online,
      duration: 250,
      onTransitionEnd: online ? undefined : () => {
        element.classList.remove(className);
      },
      useRafs: online && !hasClassName ? 2 : 0
    });
  }

  public generateScrollable(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const filterId = filter.id;
    const scrollable = new Scrollable(null, 'CL', 500);
    scrollable.container.dataset.filterId = '' + filterId;

    console.log('[my-debug] sorted dialog list created');
    const indexKey = getDialogIndexKey(filter.localId);
    const sortedDialogList = new SortedDialogList({
      appDialogsManager,
      managers: rootScope.managers,
      log: this.log,
      scrollable: scrollable,
      indexKey,
      requestItemForIdx: this.requestItemForIdx,
      onListShrinked: this.onListShrinked,
      itemSize: 72,
      onListLengthChange: () => {
        console.log('[my-debug] onListLengthChange :>> ', sortedDialogList.itemsLength());
        scrollable.onSizeChange();
        appDialogsManager.onListLengthChange?.();
      }
    });

    this.scrollable = scrollable;
    this.sortedList = sortedDialogList;
    this.setIndexKey(indexKey);
    this.bindScrollable();

    // list.classList.add('hide');
    // scrollable.container.style.backgroundColor = '#' + (Math.random() * (16 ** 6 - 1) | 0).toString(16);

    return {scrollable, list: sortedDialogList.list};
  }

  public testDialogForFilter(dialog: Dialog) {
    if(!REAL_FOLDERS.has(this.filterId) ? getDialogIndex(dialog, this.indexKey) === undefined : this.filterId !== dialog.folder_id) {
      return false;
    }

    return true;
  }

  /**
   * Удалит неподходящие чаты из списка, но не добавит их(!)
   */
  public async validateListForFilter() {
    this.sortedList.getAll().forEach(async(_, key) => {
      const dialog = await rootScope.managers.appMessagesManager.getDialogOnly(key);
      if(!this.testDialogForFilter(dialog)) {
        this.deleteDialog(dialog);
      }
    });
  }

  public updateDialog(dialog: Dialog) {
    if(!this.testDialogForFilter(dialog)) {
      if(this.getDialogElement(dialog.peerId)) {
        this.deleteDialog(dialog);
      }

      return;
    }

    return super.updateDialog(dialog);
  }

  public setCallStatus(dom: DialogDom, visible: boolean) {
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

    SetTransition({
      element: dom.callIcon.canvas,
      className: 'is-visible',
      forwards: visible,
      duration: BADGE_TRANSITION_TIME,
      onTransitionEnd: visible ? undefined : () => {
        dom.callIcon.canvas.remove();
        dom.callIcon = undefined;
      },
      useRafs: visible ? 2 : 0
    });
  }

  public processDialogForCallStatus(peerId: PeerId, dom?: DialogDom) {
    if(!IS_GROUP_CALL_SUPPORTED) {
      return;
    }

    if(!dom) dom = this.getDialogDom(peerId);
    if(!dom) return;

    const chat = apiManagerProxy.getChat(peerId.toChatId()) as Chat.chat | Chat.channel;
    this.setCallStatus(dom, !!(chat.pFlags.call_active && chat.pFlags.call_not_empty));
  }

  protected onScrolledBottom() {
    super.onScrolledBottom();

    if(this.hasReachedTheEnd) {
      appDialogsManager.loadContacts?.();
    }
  }

  public toggleAvatarUnreadBadges(value: boolean, useRafs: number) {
    if(!value) {
      this.sortedList.getAll().forEach((dialogElement) => {
        const {dom} = dialogElement;
        if(!dom.unreadAvatarBadge) {
          return;
        }

        dialogElement.toggleBadgeByKey('unreadAvatarBadge', false, false, false);
      });

      return;
    }

    const reuseClassNames = ['unread', 'mention'];
    this.sortedList.getAll().forEach((dialogElement) => {
      const {dom} = dialogElement;
      const unreadContent = dom.unreadBadge?.textContent;
      if(
        !unreadContent ||
        dom.unreadBadge.classList.contains('backwards') ||
        dom.unreadBadge.classList.contains('dialog-pinned-icon')
      ) {
        return;
      }

      const isUnreadAvatarBadgeMounted = !!dom.unreadAvatarBadge;
      dialogElement.createUnreadAvatarBadge();
      dialogElement.toggleBadgeByKey('unreadAvatarBadge', true, isUnreadAvatarBadgeMounted);
      dom.unreadAvatarBadge.textContent = unreadContent;
      const unreadAvatarBadgeClassList = dom.unreadAvatarBadge.classList;
      const unreadBadgeClassList = dom.unreadBadge.classList;
      reuseClassNames.forEach((className) => {
        unreadAvatarBadgeClassList.toggle(className, unreadBadgeClassList.contains(className));
      });
    });
  }

  public getDialogKey(dialog: Dialog) {
    return dialog.peerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return rootScope.managers.appMessagesManager.getDialogOnly(element.dataset.peerId.toPeerId());
  }

  protected canUpdateDialog(dialog: Dialog): boolean {
    if(dialog.migratedTo !== undefined || !this.testDialogForFilter(dialog)) return false;
    return super.canUpdateDialog(dialog);
  }
}

export class Some4 extends Some<SavedDialog> {
  public onAnyUpdate: () => void;

  constructor() {
    super();

    // this.listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => {
    //   if(!dialog) {
    //     return;
    //   }

    //   this.updateDialog(dialog);
    // });

    this.listenerSetter.add(rootScope)('dialogs_multiupdate', (dialogs) => {
      let hasAnyUpdate = false;
      for(const [peerId, {saved}] of dialogs) {
        saved?.forEach((dialog) => {
          hasAnyUpdate = true;
          this.updateDialog(dialog);
        });
      }

      if(hasAnyUpdate) {
        this.onAnyUpdate?.();
      }
    });

    this.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(!isSavedDialog(dialog)) {
        return;
      }

      this.deleteDialogByKey(this.getDialogKey(dialog));
      this.onAnyUpdate?.();
    });
  }

  public getRectFromForPlaceholder() {
    return appDialogsManager.chatsContainer;
  }

  protected getFilterId() {
    return rootScope.myId;
  }

  public getDialogKey(dialog: SavedDialog) {
    return dialog.savedPeerId;
  }

  public getDialogKeyFromElement(element: HTMLElement) {
    return +element.dataset.peerId;
  }

  public getDialogFromElement(element: HTMLElement) {
    return rootScope.managers.dialogsStorage.getAnyDialog(element.dataset.peerId.toPeerId(), element.dataset.threadId.toPeerId()) as Promise<SavedDialog>;
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

  private contextMenu: DialogsContextMenu;

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

  public xd: Some2;
  public xds: {[filterId: number]: Some2} = {};

  public cancelChatlistUpdatesFetching: () => void;
  public fetchChatlistUpdates: () => void;

  private storiesListContainer: HTMLDivElement;
  private bottomPart: HTMLDivElement;
  private disposeStories: () => void;
  public resizeStoriesList: () => void;

  public start() {
    const managers = this.managers = getProxiedManagers();

    this.contextMenu = new DialogsContextMenu(managers);
    this.stateMiddlewareHelper = getMiddleware();

    this.folders.menuScrollContainer = this.folders.menu.parentElement;

    // this.onListLengthChange = debounce(this._onListLengthChange, 100, false, true);
    this.onListLengthChange = () => void this._onListLengthChange();

    const bottomPart = this.bottomPart = document.createElement('div');
    bottomPart.classList.add('connection-status-bottom');
    bottomPart.append(this.folders.container);

    const storiesListContainer = this.storiesListContainer = document.createElement('div');
    storiesListContainer.classList.add('stories-list');

    this.forumsTabs = new Map();
    this.forumsSlider = document.createElement('div');
    this.forumsSlider.classList.add('topics-slider');
    this.chatsContainer.parentElement.parentElement.append(this.forumsSlider);

    // appSidebarLeft.onOpenTab = () => {
    //   return this.toggleForumTab();
    // };

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
      // setTimeout(() =>
      apiManagerProxy.getState().then(async(state) => {
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

        this.onStateLoaded(state);
      })// , 5000);
    });

    this.setFilterId(FOLDER_ID_ALL);
    this.addFilter({
      id: FOLDER_ID_ALL,
      title: {_: 'textWithEntities', text: '', entities: []},
      localId: FOLDER_ID_ALL
    });

    const foldersScrollable = new ScrollableX(this.folders.menuScrollContainer);
    bottomPart.prepend(this.folders.menuScrollContainer);
    const selectTab = this.selectTab = horizontalMenu(this.folders.menu, this.folders.container, async(id, tabContent) => {
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

      if(wasFilterId === id) return;

      this.xds[id].clear();
      const promise = this.setFilterIdAndChangeTab(id).then(() => {
        // if(cached) {
        //   return renderPromise;
        // }
      });

      if(wasFilterId !== -1) {
        return promise;
      }
    }, () => {
      for(const folderId in this.xds) {
        if(+folderId !== this.filterId) {
          this.xds[folderId].clear();
        }
      }
    }, undefined, foldersScrollable);

    createFolderContextMenu({
      appSidebarLeft,
      AppChatFoldersTab,
      AppEditFolderTab,
      managers: this.managers,
      className: 'menu-horizontal-div-item',
      listenTo: this.folders.menu
    });

    apiManagerProxy.getState().then((state) => {
      const [appSettings, setAppSettings] = useAppSettings();
      // * it should've had a better place :(
      appMediaPlaybackController.setPlaybackParams(appSettings.playbackParams);
      appMediaPlaybackController.addEventListener('playbackParams', (params) => {
        setAppSettings('playbackParams', params);
      });

      return this.onStateLoaded(state);
    })/* .then(() => {
      const isLoadedMain = this.managers.appMessagesManager.dialogsStorage.isDialogsLoaded(0);
      const isLoadedArchive = this.managers.appMessagesManager.dialogsStorage.isDialogsLoaded(1);
      const wasLoaded = isLoadedMain || isLoadedArchive;
      const a: Promise<any> = isLoadedMain ? Promise.resolve() : this.managers.appMessagesManager.getConversationsAll('', 0);
      const b: Promise<any> = isLoadedArchive ? Promise.resolve() : this.managers.appMessagesManager.getConversationsAll('', 1);
      a.finally(() => {
        b.then(() => {
          if(wasLoaded) {
            (apiUpdatesManager.updatesState.syncLoading || Promise.resolve()).then(() => {
              this.managers.appMessagesManager.refreshConversations();
            });
          }
        });
      });
    }) */;

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

    appImManager.addEventListener('peer_changed', ({peerId, threadId, isForum}) => {
      const options: Parameters<AppImManager['isSamePeer']>[0] = {peerId, threadId: isForum || rootScope.myId ? threadId : undefined};
      // const perf = performance.now();
      for(const element of this.lastActiveElements) {
        const elementThreadId = +element.dataset.threadId || undefined;
        const elementPeerId = element.dataset.peerId.toPeerId();
        if(!appImManager.isSamePeer({peerId: elementPeerId, threadId: elementThreadId}, options)) {
          this.setDialogActive(element, false);
        }
      }

      const elements = Array.from(document.querySelectorAll(`[data-autonomous="0"] .chatlist-chat[data-peer-id="${peerId}"]`)) as HTMLElement[];
      elements.forEach((element) => {
        const elementThreadId = +element.dataset.threadId || undefined;
        if(appImManager.isSamePeer({peerId, threadId: elementThreadId}, options)) {
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
      setInnerHTML(elements.title, await wrapFolderTitle(filter.title, elements.middlewareHelper.get()));
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
      customEmojiRenderer.textColor = this.getTextColor(active);
    });

    changeTitleEmojiColor(listEl, this.getPrimaryColor(active));
  }

  public setDialogActive(listEl: HTMLElement, active: boolean) {
    const dom = (listEl as any).dialogDom as DialogDom;
    this.setDialogActiveStatus(listEl, active);
    listEl.classList.toggle('is-forum-open', this.forumTab?.peerId === listEl.dataset.peerId.toPeerId() && !listEl.dataset.threadId);
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

    const {unreadUnmutedCount, unreadCount} = await this.managers.dialogsStorage.getFolderUnreadCount(filterId);

    unreadSpan.classList.toggle('badge-gray', !unreadUnmutedCount);
    const count = filterId === FOLDER_ID_ALL ? unreadUnmutedCount : unreadCount;
    setBadgeContent(unreadSpan, count ? '' + count : '');
  }

  private setFiltersUnreadCount() {
    for(const filterId in this.filtersRendered) {
      this.setFilterUnreadCount(+filterId);
    }
  }

  public l(filter: Parameters<AppDialogsManager['addFilter']>[0]) {
    const xd = this.xds[filter.id] = new Some2(filter.id);
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
    else setInnerHTML(titleSpan, wrapFolderTitle(filter.title, middlewareHelper.get(), true));
    const unreadSpan = createBadge('div', 20, 'primary');
    const i = document.createElement('i');
    span.append(titleSpan, unreadSpan, i);
    ripple(menuTab);
    menuTab.append(span);

    menuTab.dataset.filterId = '' + id;

    positionElementByIndex(menuTab, containerToAppend, filter.localId);
    // containerToAppend.append(li);

    const {ul, scrollable} = this.l(filter);
    scrollable.container.classList.add('tabs-tab', 'chatlist-parts');

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

  public onForumTabToggle?: () => void;

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
      this.onForumTabToggle?.();
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

    const deferred = deferredPromise<void>();
    const duration = 300;
    SetTransition({
      element: this.forumsSlider.parentElement,
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

      forumTab = appSidebarLeft.createTab(ForumTab);
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
      forumTab = new ForumTab(undefined);
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

      if(onFound?.(elem) === false) {
        return;
      }

      const isForum = !!elem.querySelector('.is-forum');
      if(isForum && !e.shiftKey && !lastMsgId) {
        this.toggleForumTabByPeerId(peerId, undefined, false);
        return;
      }

      if(e.ctrlKey || e.metaKey) {
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
        (!threadId || lastMsgId) &&
        this.xd.sortedList.list === list &&
        this.xd !== this.xds[FOLDER_ID_ARCHIVE]
      ) {
        this.toggleForumTab();
      }

      setPeerFunc({
        peerId,
        lastMsgId,
        threadId: threadId
      });
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

  private getLastMessageForDialog(dialog: AnyDialog, lastMessage?: Message.message | Message.messageService) {
    let draftMessage: MyDraftMessage;
    const {peerId, draft} = dialog as Dialog;
    if(!lastMessage) {
      if(
        draft?._ === 'draftMessage' && (
          !peerId.isAnyChat() ||
          isForumTopic(dialog) ||
          !apiManagerProxy.isForum(peerId)
        )
      ) {
        draftMessage = draft;
      }

      lastMessage = (dialog as Dialog).topMessage;
      if(lastMessage?.mid !== dialog.top_message) {
        const trueLastMessage = apiManagerProxy.getMessageByPeer(peerId, dialog.top_message);
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
    dialog: AnyDialog,
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
            }).then(() => mediaContainer));

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
    dialog: AnyDialog,
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

    const hasPinnedBadge = isPinned;
    const isPinnedBadgeMounted = !!dom.pinnedBadge;
    if(hasPinnedBadge) {
      dialogElement.createPinnedBadge();
    }

    const hasUnreadBadge = isDialogUnread;
    const isUnreadBadgeMounted = !!dom.unreadBadge;
    if(hasUnreadBadge) {
      dialogElement.createUnreadBadge();
    }

    const hasUnreadAvatarBadge = this.xd !== this.xds[FOLDER_ID_ARCHIVE] && !isTopic && (!!this.forumTab || appSidebarLeft.isCollapsed()) && this.xd.getDialogElement(peerId) === dialogElement && isDialogUnread;

    const isUnreadAvatarBadgeMounted = !!dom.unreadAvatarBadge;
    if(hasUnreadAvatarBadge) {
      dialogElement.createUnreadAvatarBadge();
    }

    const hasMentionsBadge = isSaved ? false : (dialog.unread_mentions_count && (dialog.unread_mentions_count > 1 || dialog.unread_count > 1));
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
    if(!isSaved && dialog.unread_mentions_count && unreadCount === 1) {
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

  private async getDialog(dialog: AnyDialog | PeerId, threadOrSavedId?: number) {
    if(typeof(dialog) !== 'object') {
      let originalDialog: AnyDialog;
      if(threadOrSavedId) {
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

  public addListDialog(options: Parameters<AppDialogsManager['addDialogNew']>[0] & {isBatch?: boolean}) {
    options.autonomous = false;
    options.withStories = true;

    const ret = this.addDialogNew(options);

    if(ret) {
      const promise = this.initDialog(ret, options);
      options.loadPromises?.push(promise);
    }

    return ret;
  }

  public initDialog(dialogElement: DialogElement, options: Parameters<AppDialogsManager['addDialogNew']>[0] & {isBatch?: boolean}) {
    const {peerId} = options;
    const getDialogPromise = this.getDialog(peerId, options.threadId);

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
