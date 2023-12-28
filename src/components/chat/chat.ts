/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../../lib/appManagers/appChatsManager';
import type {RequestWebViewOptions} from '../../lib/appManagers/appAttachMenuBotsManager';
import type {MessageSendingParams, MessagesStorageKey} from '../../lib/appManagers/appMessagesManager';
import {AppImManager, APP_TABS, ChatSetPeerOptions} from '../../lib/appManagers/appImManager';
import EventListenerBase from '../../helpers/eventListenerBase';
import {logger, LogTypes} from '../../lib/logger';
import rootScope from '../../lib/rootScope';
import appSidebarRight from '../sidebarRight';
import ChatBubbles from './bubbles';
import ChatContextMenu from './contextMenu';
import ChatInput from './input';
import ChatSelection from './selection';
import ChatTopbar from './topbar';
import {NULL_PEER_ID, REPLIES_PEER_ID} from '../../lib/mtproto/mtproto_config';
import SetTransition from '../singleTransition';
import AppPrivateSearchTab from '../sidebarRight/tabs/search';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import ChatSearch from './search';
import IS_TOUCH_SUPPORTED from '../../environment/touchSupport';
import getAutoDownloadSettingsByPeerId, {ChatAutoDownloadSettings} from '../../helpers/autoDownload';
import ChatBackgroundGradientRenderer from './gradientRenderer';
import ChatBackgroundPatternRenderer from './patternRenderer';
import pause from '../../helpers/schedulers/pause';
import {AppManagers} from '../../lib/appManagers/managers';
import SlicedArray from '../../helpers/slicedArray';
import themeController from '../../helpers/themeController';
import AppSharedMediaTab from '../sidebarRight/tabs/sharedMedia';
import noop from '../../helpers/noop';
import middlewarePromise from '../../helpers/middlewarePromise';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {Message, WallPaper} from '../../layer';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import {getColorsFromWallPaper} from '../../helpers/color';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';

export type ChatType = 'chat' | 'pinned' | 'discussion' | 'scheduled' | 'stories';

export default class Chat extends EventListenerBase<{
  setPeer: (mid: number, isTopMessage: boolean) => void
}> {
  public container: HTMLElement;
  public backgroundEl: HTMLElement;

  public topbar: ChatTopbar;
  public bubbles: ChatBubbles;
  public input: ChatInput;
  public selection: ChatSelection;
  public contextMenu: ChatContextMenu;
  public search: ChatSearch;

  public wasAlreadyUsed: boolean;
  // public initPeerId = 0;
  public peerId: PeerId;
  public threadId: number;
  public setPeerPromise: Promise<void>;
  public peerChanged: boolean;

  public log: ReturnType<typeof logger>;

  public type: ChatType;
  public messagesStorageKey: MessagesStorageKey;
  public isStandalone: boolean;

  public noForwards: boolean;

  public inited: boolean;

  public isRestricted: boolean;
  public autoDownload: ChatAutoDownloadSettings;

  public gradientRenderer: ChatBackgroundGradientRenderer;
  public patternRenderer: ChatBackgroundPatternRenderer;
  public gradientCanvas: HTMLCanvasElement;
  public patternCanvas: HTMLCanvasElement;
  public backgroundTempId: number;
  public setBackgroundPromise: Promise<void>;
  public sharedMediaTab: AppSharedMediaTab;
  public sharedMediaTabs: AppSharedMediaTab[];
  // public renderDarkPattern: () => Promise<void>;

  public isBot: boolean;
  public isChannel: boolean;
  public isBroadcast: boolean;
  public isAnyGroup: boolean;
  public isMegagroup: boolean;
  public isForum: boolean;
  public isAllMessagesForum: boolean;
  public isAnonymousSending: boolean;
  public isUserBlocked: boolean;

  public animationGroup: AnimationItemGroup;

  public destroyPromise: CancellablePromise<void>;

  constructor(
    public appImManager: AppImManager,
    public managers: AppManagers,
    public isMainChat: boolean,
    public excludeParts: Partial<{
      elements: boolean,
      sharedMedia: boolean
    }> = {}
  ) {
    super();

    this.log = logger('CHAT', LogTypes.Log | LogTypes.Warn | LogTypes.Debug | LogTypes.Error);
    // this.log = logger('CHAT', LogTypes.Warn | LogTypes.Error);
    this.log.warn('constructor');

    this.type = 'chat';
    this.animationGroup = `chat-${Math.round(Math.random() * 65535)}`;

    if(!this.excludeParts.elements) {
      this.container = document.createElement('div');
      this.container.classList.add('chat', 'tabs-tab');

      this.backgroundEl = document.createElement('div');
      this.backgroundEl.classList.add('chat-background');

      this.container.append(this.backgroundEl);
    }

    this.peerId = NULL_PEER_ID;

    this.backgroundTempId = 0;
    this.sharedMediaTabs = [];
  }

  public setBackground(url: string, skipAnimation?: boolean): Promise<void> {
    const theme = themeController.getTheme();
    const themeSettings = theme.settings;
    const wallPaper = themeSettings.wallpaper;
    const colors = getColorsFromWallPaper(wallPaper);

    let item: HTMLElement;
    const isColorBackground = !!colors && !(wallPaper as WallPaper.wallPaper).slug && !wallPaper.settings.intensity;
    if(
      isColorBackground &&
      document.documentElement.style.cursor === 'grabbing' &&
      this.gradientRenderer &&
      !this.patternRenderer
    ) {
      this.gradientCanvas.dataset.colors = colors;
      this.gradientRenderer.init(this.gradientCanvas);
      return Promise.resolve();
    }

    const tempId = ++this.backgroundTempId;

    const previousGradientRenderer = this.gradientRenderer;
    const previousPatternRenderer = this.patternRenderer;
    const previousGradientCanvas = this.gradientCanvas;
    const previousPatternCanvas = this.patternCanvas;

    this.gradientRenderer =
      this.patternRenderer =
      this.gradientCanvas =
      this.patternCanvas =
      // this.renderDarkPattern =
      undefined;

    const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
    const isDarkPattern = !!intensity && intensity < 0;

    let patternRenderer: ChatBackgroundPatternRenderer;
    let patternCanvas = item?.firstElementChild as HTMLCanvasElement;
    let gradientCanvas: HTMLCanvasElement;
    if(!item) {
      item = document.createElement('div');
      item.classList.add('chat-background-item');

      if(url) {
        if(intensity) {
          item.classList.add('is-pattern');

          const rect = this.appImManager.chatsContainer.getBoundingClientRect();
          patternRenderer = this.patternRenderer = ChatBackgroundPatternRenderer.getInstance({
            url,
            width: rect.width,
            height: rect.height,
            mask: isDarkPattern
          });

          patternCanvas = this.patternCanvas = patternRenderer.createCanvas();
          patternCanvas.classList.add('chat-background-item-canvas', 'chat-background-item-pattern-canvas');

          if(isDarkPattern) {
            item.classList.add('is-dark');
          }

          // if(isDarkPattern) {
          //   this.renderDarkPattern = () => {
          //     return patternRenderer.exportCanvasPatternToImage(patternCanvas).then((url) => {
          //       if(this.backgroundTempId !== tempId) {
          //         return;
          //       }

          //       gradientCanvas.style.webkitMaskImage = `url(${url})`;
          //     });
          //   };
          // }
        } else {
          item.classList.add('is-image');
        }
      } else {
        item.classList.add('is-color');
      }
    }

    let gradientRenderer: ChatBackgroundGradientRenderer;
    if(colors) {
      // if(color.includes(',')) {
      const {canvas, gradientRenderer: _gradientRenderer} = ChatBackgroundGradientRenderer.create(colors);
      gradientRenderer = this.gradientRenderer = _gradientRenderer;
      gradientCanvas = this.gradientCanvas = canvas;
      gradientCanvas.classList.add('chat-background-item-canvas', 'chat-background-item-color-canvas');

      // if(liteMode.isAvailable('animations')) {
      //   gradientRenderer.scrollAnimate(true);
      // }
      // } else {
      //   item.style.backgroundColor = color;
      //   item.style.backgroundImage = 'none';
      // }
    }

    if(patternRenderer) {
      const setOpacityTo = isDarkPattern ? gradientCanvas : patternCanvas;
      let opacityMax = Math.abs(intensity) * (isDarkPattern ? .5 : 1);
      if(isDarkPattern) {
        opacityMax = Math.max(0.3, opacityMax);
      }
      setOpacityTo.style.setProperty('--opacity-max', '' + opacityMax);
    }

    const promise = new Promise<void>((resolve) => {
      const cb = () => {
        if(this.backgroundTempId !== tempId) {
          if(patternRenderer) {
            patternRenderer.cleanup(patternCanvas);
          }

          if(gradientRenderer) {
            gradientRenderer.cleanup();
          }

          return;
        }

        const prev = this.backgroundEl.lastElementChild as HTMLElement;

        if(prev === item) {
          resolve();
          return;
        }

        const append = [
          gradientCanvas,
          // isDarkPattern && this.renderDarkPattern ? undefined : patternCanvas
          patternCanvas
        ].filter(Boolean);
        if(append.length) {
          item.append(...append);
        }

        this.backgroundEl.append(item);

        SetTransition({
          element: item,
          className: 'is-visible',
          forwards: true,
          duration: !skipAnimation ? 200 : 0,
          onTransitionEnd: prev ? () => {
            previousPatternRenderer?.cleanup(previousPatternCanvas);
            previousGradientRenderer?.cleanup();

            prev.remove();
          } : null,
          useRafs: 2
        });

        resolve();
      };

      if(patternRenderer) {
        const renderPatternPromise = patternRenderer.renderToCanvas(patternCanvas);
        renderPatternPromise.then(() => {
          if(this.backgroundTempId !== tempId) {
            return;
          }

          // let promise: Promise<any>;
          // if(isDarkPattern && this.renderDarkPattern) {
          //   promise = this.renderDarkPattern();
          // } else {
          // const promise = Promise.resolve();
          // }

          // promise.then(cb);
          cb();
        });
      } else if(url) {
        renderImageFromUrl(item, url, cb);
      } else {
        cb();
      }
    });

    return this.setBackgroundPromise = Promise.race([
      pause(500),
      promise
    ]);
  }

  public setType(type: ChatType) {
    this.type = type;
  }

  public init(/* peerId: PeerId */) {
    // this.initPeerId = peerId;

    this.topbar = new ChatTopbar(this, appSidebarRight, this.managers);
    this.bubbles = new ChatBubbles(this, this.managers);
    this.input = new ChatInput(this, this.appImManager, this.managers, 'chat-input-main');
    this.contextMenu = new ChatContextMenu(this, this.managers);
    this.selection = new ChatSelection(this, this.bubbles, this.input, this.managers);

    this.topbar.constructUtils();
    this.topbar.constructPeerHelpers();

    this.topbar.construct();
    this.input.construct();

    this.bubbles.constructPeerHelpers();
    this.input.constructPeerHelpers();

    if(!IS_TOUCH_SUPPORTED) {
      this.bubbles.setReactionsHoverListeners();
    }

    this.bubbles.attachContainerListeners();

    this.container.append(this.topbar.container, this.bubbles.container, this.input.chatInput);

    this.bubbles.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
      if(this.peerId === migrateFrom) {
        this.setPeer({peerId: migrateTo});
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
      if(dialog.peerId === this.peerId && (dialog._ === 'dialog' || this.threadId === dialog.id)) {
        this.appImManager.setPeer();
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const {peerId} = this;
      if(peerId.isAnyChat() && peerId.toChatId() === chatId) {
        const isAnonymousSending = await this.managers.appMessagesManager.isAnonymousSending(peerId);
        if(peerId === this.peerId) {
          this.isAnonymousSending = isAnonymousSending;
        }
      }
    });

    const freezeObservers = (freeze: boolean) => {
      const cb = () => {
        this.bubbles.observer?.toggleObservingNew(freeze);
        animationIntersector.toggleIntersectionGroup(this.animationGroup, freeze);
        if(freeze) {
          animationIntersector.checkAnimations(freeze, this.animationGroup);
        }
      };

      if(!freeze) {
        setTimeout(() => {
          cb();
        }, 400);
      } else {
        cb();
      }
    };

    this.bubbles.listenerSetter.add(this.appImManager)('chat_changing', ({to}) => {
      freezeObservers(to !== this);
    });

    this.bubbles.listenerSetter.add(this.appImManager)('tab_changing', (tabId) => {
      freezeObservers(this.appImManager.chat !== this || (tabId !== APP_TABS.CHAT && mediaSizes.activeScreen === ScreenSize.mobile));
    });
  }

  public beforeDestroy() {
    this.destroyPromise = deferredPromise();
    this.bubbles.cleanup();
  }

  private cleanupBackground() {
    ++this.backgroundTempId;
    this.patternRenderer?.cleanup(this.patternCanvas);
    this.gradientRenderer?.cleanup();
    this.patternRenderer = this.gradientRenderer = undefined;
  }

  public destroy() {
    // const perf = performance.now();

    this.destroyPromise?.resolve();
    this.destroySharedMediaTab();
    this.topbar?.destroy();
    this.bubbles?.destroy();
    this.input?.destroy();
    this.contextMenu?.destroy();
    this.selection?.attachListeners(undefined, undefined);

    this.cleanupBackground();

    this.topbar =
      this.bubbles =
      this.input =
      this.contextMenu =
      this.selection =
      undefined;

    this.container?.remove();

    // this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup(helperToo = true) {
    this.input?.cleanup(helperToo);
    this.topbar?.cleanup();
    this.selection?.cleanup();
  }

  public get isForumTopic() {
    return !!(this.isForum && this.threadId);
  }

  public async onChangePeer(options: ChatSetPeerOptions, m: ReturnType<typeof middlewarePromise>) {
    const {peerId, threadId} = options;

    if(!this.excludeParts.elements) {
      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      searchTab?.close();
    }

    const [
      noForwards,
      isRestricted,
      isAnyGroup,
      _,
      isMegagroup,
      isBroadcast,
      isChannel,
      isBot,
      isForum,
      isAnonymousSending,
      isUserBlocked
    ] = await m(Promise.all([
      this.managers.appPeersManager.noForwards(peerId),
      this.managers.appPeersManager.isPeerRestricted(peerId),
      this._isAnyGroup(peerId),
      this.setAutoDownloadMedia(),
      this.managers.appPeersManager.isMegagroup(peerId),
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.isChannel(peerId),
      this.managers.appPeersManager.isBot(peerId),
      this.managers.appPeersManager.isForum(peerId),
      this.managers.appMessagesManager.isAnonymousSending(peerId),
      peerId.isUser() && this.managers.appProfileManager.isCachedUserBlocked(peerId)
    ]));

    // ! WARNING: TEMPORARY, HAVE TO GET TOPIC
    if(isForum && threadId) {
      await m(this.managers.dialogsStorage.getForumTopicOrReload(peerId, threadId));
    }

    this.noForwards = noForwards;
    this.isRestricted = isRestricted;
    this.isAnyGroup = isAnyGroup;
    this.isMegagroup = isMegagroup;
    this.isBroadcast = isBroadcast;
    this.isChannel = isChannel;
    this.isBot = isBot;
    this.isForum = isForum;
    this.isAllMessagesForum = isForum && !threadId;
    this.isAnonymousSending = isAnonymousSending;
    this.isUserBlocked = isUserBlocked;

    if(threadId && !this.isForum) {
      options.type = 'discussion';
    }

    const type = options.type ?? 'chat';
    this.setType(type);
    if(this.selection) {
      this.selection.isScheduled = type === 'scheduled';
    }

    this.messagesStorageKey = `${this.peerId}_${this.type === 'scheduled' ? 'scheduled' : 'history'}`;

    this.container && this.container.classList.toggle('no-forwards', this.noForwards);

    if(!this.excludeParts.sharedMedia) {
      this.sharedMediaTab = appSidebarRight.createSharedMediaTab();
      this.sharedMediaTabs.push(this.sharedMediaTab);
      this.sharedMediaTab.setPeer(peerId, threadId);
    }

    this.input?.clearHelper(); // костыль
    this.selection?.cleanup(); // TODO: REFACTOR !!!!!!
  }

  public setPeer(options: ChatSetPeerOptions) {
    const {peerId, threadId} = options;
    if(!peerId) {
      this.inited = undefined;
    } else if(!this.inited) {
      if(this.init) {
        this.init(/* peerId */);
        this.init = null;
      }

      this.inited = true;
    }

    const samePeer = this.appImManager.isSamePeer(this, options);
    if(!samePeer) {
      this.appImManager.dispatchEvent('peer_changing', this);
      this.peerId = peerId || NULL_PEER_ID;
      this.threadId = threadId;
    } else if(this.setPeerPromise) {
      return;
    }

    if(!peerId) {
      appSidebarRight.toggleSidebar(false);
      this.cleanup(true);
      this.bubbles.setPeer({samePeer: false, peerId});
      this.peerId = 0;
      this.appImManager.dispatchEvent('peer_changed', this);

      if(!this.excludeParts.sharedMedia) {
        appSidebarRight.replaceSharedMediaTab();
        this.destroySharedMediaTab();
        this.sharedMediaTab = undefined;
      }

      return;
    }

    this.peerChanged = samePeer;

    const bubblesSetPeerPromise = this.bubbles.setPeer({...options, samePeer});
    const setPeerPromise = this.setPeerPromise = bubblesSetPeerPromise.then((result) => {
      return result.promise;
    }).catch(noop).finally(() => {
      if(this.setPeerPromise === setPeerPromise) {
        this.setPeerPromise = null;
      }
    });

    return bubblesSetPeerPromise;
  }

  public destroySharedMediaTab(tab = this.sharedMediaTab) {
    if(!tab) {
      return;
    }

    indexOfAndSplice(this.sharedMediaTabs, tab);
    tab.destroy();
  }

  public async setAutoDownloadMedia() {
    this.autoDownload = await getAutoDownloadSettingsByPeerId(this.peerId);
  }

  public setMessageId(messageId?: number, mediaTimestamp?: number) {
    return this.setPeer({
      peerId: this.peerId,
      threadId: this.threadId,
      lastMsgId: messageId,
      mediaTimestamp
    });
  }

  public async finishPeerChange(options: {
    peerId: PeerId,
    isTarget?: boolean,
    isJump?: boolean,
    lastMsgId?: number,
    startParam?: string,
    middleware: () => boolean
  }) {
    if(this.peerChanged) return;

    const peerId = this.peerId;
    this.peerChanged = true;
    this.wasAlreadyUsed = true;

    const {middleware} = options;

    this.cleanup(false);

    const sharedMediaTab = this.sharedMediaTab;

    const callbacksPromise = Promise.all([
      this.topbar?.finishPeerChange(options),
      this.bubbles?.finishPeerChange(),
      this.input?.finishPeerChange(options),
      sharedMediaTab?.fillProfileElements()
    ]);

    const callbacks = await callbacksPromise;
    sharedMediaTab?.loadSidebarMedia(true);

    if(!middleware()) {
      return;
    }

    callbacks.forEach((callback) => {
      callback?.();
    });

    if(sharedMediaTab) {
      appSidebarRight.replaceSharedMediaTab(sharedMediaTab);
      this.sharedMediaTabs.filter((tab) => tab !== sharedMediaTab).forEach((tab) => this.destroySharedMediaTab(tab));
    }

    if(this.container) {
      this.container.dataset.type = this.type;
    }

    this.log.setPrefix('CHAT-' + peerId + '-' + this.type);

    if(this.isMainChat) {
      this.appImManager.dispatchEvent('peer_changed', this);
    }
  }

  public getMessage(mid: number) {
    return apiManagerProxy.getMessageFromStorage(this.messagesStorageKey, mid);
  }

  public async getMidsByMid(mid: number) {
    return this.managers.appMessagesManager.getMidsByMessage(this.getMessage(mid));
  }

  public getHistoryStorage(ignoreThreadId?: boolean) {
    return this.managers.appMessagesManager.getHistoryStorageTransferable(this.peerId, ignoreThreadId ? undefined : this.threadId)
    .then((historyStorageTransferable) => {
      return {
        ...historyStorageTransferable,
        history: SlicedArray.fromJSON<number>(historyStorageTransferable.historySerialized)
      }
    });
  }

  public getDialogOrTopic() {
    return this.isForum && this.threadId ? this.managers.dialogsStorage.getForumTopic(this.peerId, this.threadId) : this.managers.dialogsStorage.getDialogOnly(this.peerId);
  }

  public getHistoryMaxId() {
    return this.getHistoryStorage().then((historyStorage) => historyStorage.maxId);
  }

  public _isAnyGroup(peerId: PeerId) {
    return peerId === rootScope.myId || peerId === REPLIES_PEER_ID || this.managers.appPeersManager.isAnyGroup(peerId);
  }

  public initSearch(query?: string) {
    if(!this.peerId) return;

    if(mediaSizes.isMobile) {
      if(!this.search) {
        this.search = new ChatSearch(this.topbar, this, query);
      } else {
        this.search.setQuery(query);
      }
    } else {
      let tab = appSidebarRight.getTab(AppPrivateSearchTab);
      tab ||= appSidebarRight.createTab(AppPrivateSearchTab);

      tab.open(this.peerId, this.threadId, this.bubbles.onDatePick, query);
    }
  }

  public canSend(action?: ChatRights) {
    return this.managers.appMessagesManager.canSendToPeer(this.peerId, this.threadId, action);
  }

  public isStartButtonNeeded() {
    return Promise.all([
      this.managers.appPeersManager.isBot(this.peerId),
      this.managers.appMessagesManager.getDialogOnly(this.peerId),
      this.getHistoryStorage(true),
      this.peerId.isUser() ? this.managers.appProfileManager.isCachedUserBlocked(this.peerId.toUserId()) : undefined
    ]).then(([isBot, dialog, historyStorage, isUserBlocked]) => {
      if(!isBot) {
        return false;
      }

      return (!dialog && !historyStorage.history.length) || isUserBlocked;
    });
  }

  public getMessageSendingParams(): MessageSendingParams {
    return {
      peerId: this.peerId,
      threadId: this.threadId,
      updateStickersetOrder: rootScope.settings.stickers.dynamicPackOrder,
      ...(this.input && {
        ...(this.input.getReplyTo() || false),
        scheduleDate: this.input.scheduleDate,
        silent: this.input.sendSilent,
        sendAsPeerId: this.input.sendAsPeerId
      })
    };
  }

  public isOurMessage(message: Message.message | Message.messageService) {
    return message.fromId === rootScope.myId || (!!message.pFlags.out && this.isMegagroup);
  }

  public isOutMessage(message: Message.message | Message.messageService) {
    const fwdFrom = (message as Message.message).fwd_from;
    const isOut = this.isOurMessage(message) && (!fwdFrom || this.peerId !== rootScope.myId);
    return !!isOut;
  }

  public isAvatarNeeded(message: Message.message | Message.messageService) {
    return this.isAnyGroup && !this.isOutMessage(message);
  }

  public isPinnedMessagesNeeded() {
    return this.type === 'chat' || this.isForum;
  }

  public async canGiftPremium() {
    const peerId = this.peerId;
    if(!peerId.isUser()) {
      return false;
    }

    const [canGiftPremium, isPremiumPurchaseBlocked] = await Promise.all([
      this.managers.appProfileManager.canGiftPremium(this.peerId.toUserId()),
      apiManagerProxy.isPremiumPurchaseBlocked()
    ]);

    return peerId.isUser() && canGiftPremium && !isPremiumPurchaseBlocked;
  }

  public async openWebApp(options: Partial<RequestWebViewOptions>) {
    Object.assign(options, this.getMessageSendingParams());
    options.peerId ??= this.peerId;
    return this.appImManager.openWebApp(options);
  }
}
