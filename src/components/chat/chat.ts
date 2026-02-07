/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AdminLog, ChatRights} from '@appManagers/appChatsManager';
import type {RequestWebViewOptions} from '@appManagers/appAttachMenuBotsManager';
import type {HistoryStorageKey, MessageSendingParams, MessagesStorageKey, MyMessage, RequestHistoryOptions} from '@appManagers/appMessagesManager';
import {AppImManager, APP_TABS, ChatSetPeerOptions} from '@lib/appImManager';
import EventListenerBase from '@helpers/eventListenerBase';
import {logger, LogTypes} from '@lib/logger';
import rootScope from '@lib/rootScope';
import appSidebarRight from '@components/sidebarRight';
import ChatBubbles, {FullMid, splitFullMid} from '@components/chat/bubbles';
import ChatContextMenu from '@components/chat/contextMenu';
import ChatInput from '@components/chat/input';
import ChatSelection from '@components/chat/selection';
import ChatTopbar from '@components/chat/topbar';
import {HIDDEN_PEER_ID, NULL_PEER_ID, REPLIES_HIDDEN_CHANNEL_ID, REPLIES_PEER_ID, SEND_PAID_WITH_STARS_DELAY, SERVICE_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import SetTransition from '@components/singleTransition';
import AppPrivateSearchTab from '@components/sidebarRight/tabs/search';
import renderImageFromUrl from '@helpers/dom/renderImageFromUrl';
import mediaSizes, {ScreenSize} from '@helpers/mediaSizes';
import ChatSearch from '@components/chat/search';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';
import ChatBackgroundPatternRenderer from '@components/chat/patternRenderer';
import pause from '@helpers/schedulers/pause';
import {AppManagers} from '@lib/managers';
import SlicedArray from '@helpers/slicedArray';
import themeController from '@helpers/themeController';
import AppSharedMediaTab from '@components/sidebarRight/tabs/sharedMedia';
import noop from '@helpers/noop';
import middlewarePromise from '@helpers/middlewarePromise';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import {Message, WallPaper, Chat as MTChat, Reaction, AvailableReaction, ChatFull, MessageEntity, PaymentsPaymentForm, InputPeer, ChatTheme, UserFull, User, StoriesStealthMode} from '@layer';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import {getColorsFromWallPaper} from '@helpers/color';
import apiManagerProxy from '@lib/apiManagerProxy';
import deferredPromise, {CancellablePromise, bindPromiseToDeferred} from '@helpers/cancellablePromise';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import getDialogKey from '@appManagers/utils/dialogs/getDialogKey';
import getHistoryStorageKey, {getHistoryStorageType} from '@appManagers/utils/messages/getHistoryStorageKey';
import isForwardOfForward from '@appManagers/utils/messages/isForwardOfForward';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {SendReactionOptions} from '@appManagers/appReactionsManager';
import {MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import {Accessor, createEffect, createRoot, createSignal, on, onCleanup, untrack} from 'solid-js';
import TopbarSearch from '@components/chat/topbarSearch';
import createUnifiedSignal from '@helpers/solid/createUnifiedSignal';
import liteMode from '@helpers/liteMode';
import {useFullPeer} from '@stores/fullPeers';
import {useAppConfig, useAppState} from '@stores/appState';
import {unwrap} from 'solid-js/store';
import {averageColorFromCanvas, averageColorFromImage} from '@helpers/averageColor';
import highlightingColor from '@helpers/highlightingColor';
import callbackify from '@helpers/callbackify';
import useIsNightTheme from '@hooks/useIsNightTheme';
import useStars, {setReservedStars} from '@stores/stars';
import PopupElement from '@components/popups';
import PopupStars from '@components/popups/stars';
import {getPendingPaidReactionKey, PENDING_PAID_REACTION_SENT_ABORT_REASON, PENDING_PAID_REACTIONS} from '@components/chat/reactions';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import appDownloadManager from '@lib/appDownloadManager';
import showUndoablePaidTooltip, {paidReactionLangKeys} from '@components/chat/undoablePaidTooltip';
import namedPromises from '@helpers/namedPromises';
import {getCurrentNewMediaPopup} from '@components/popups/newMedia';
import PriceChangedInterceptor from '@components/chat/priceChangedInterceptor';
import {isVerificationBot} from '@components/chat/utils';
import {isSensitive} from '@helpers/restrictions';
import {isTempId} from '@appManagers/utils/messages/isTempId';
import {usePeer} from '@stores/peers';
import {useAppSettings} from '@stores/appSettings';
import useHistoryStorage from '@stores/historyStorages';
import useAutoDownloadSettings, {ChatAutoDownloadSettings} from '@hooks/useAutoDownloadSettings';
import usePeerTranslation from '@hooks/usePeerTranslation';
import debounce from '@helpers/schedulers/debounce';
import appNavigationController from '@components/appNavigationController';
import {LEFT_COLUMN_ACTIVE_CLASSNAME} from '@components/sidebarLeft';
import {AckedResult} from '@lib/superMessagePort';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import hasRights from '@appManagers/utils/chats/hasRights';


export enum ChatType {
  Chat = 'chat',
  Pinned = 'pinned',
  Discussion = 'discussion',
  Scheduled = 'scheduled',
  Stories = 'stories',
  Saved = 'saved',
  Search = 'search',
  Static = 'static',
  Logs = 'logs'
};

export type ChatSearchKeys = Pick<RequestHistoryOptions, 'query' | 'isCacheableSearch' | 'isPublicHashtag' | 'savedReaction' | 'fromPeerId' | 'inputFilter' | 'hashtagType'>;
export const CHAT_SEARCH_KEYS: (keyof ChatSearchKeys)[] = ['query', 'isCacheableSearch', 'isPublicHashtag', 'savedReaction', 'fromPeerId', 'inputFilter', 'hashtagType'];

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

  private priceChangedInterceptor: PriceChangedInterceptor;

  public wasAlreadyUsed: boolean;
  // public initPeerId = 0;

  // * will be also used for RequestHistoryOptions
  public peerId: PeerId;
  public threadId: number;
  public monoforumThreadId: number;
  public savedReaction: (Reaction.reactionCustomEmoji | Reaction.reactionEmoji)[];
  public isPublicHashtag: boolean;
  public isCacheableSearch: boolean;
  public query: string;
  public inputFilter: RequestHistoryOptions['inputFilter'];
  public hashtagType: 'this' | 'my' | 'public';

  public setPeerPromise: Promise<void>;
  public peerChanged: boolean;

  public log: ReturnType<typeof logger>;

  public type: ChatType;
  public messagesStorageKey: MessagesStorageKey;
  public disposeHistoryStorage: () => void;
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

  public isBot: boolean;
  public isChannel: boolean;
  public isBroadcast: boolean;
  public isLikeGroup: boolean;
  public isAnyGroup: boolean;
  public isMegagroup: boolean;
  public isForum: boolean;
  public isAllMessagesForum: boolean;
  public isAnonymousSending: boolean;
  public isUserBlocked: boolean;
  public isPremiumRequired: boolean;
  public isMonoforum: boolean;
  public isBotforum: boolean;
  public canManageDirectMessages: boolean;
  public isTemporaryThread: boolean;
  public noInput: boolean;

  public starsAmount: number | undefined;
  public stealthMode: StoriesStealthMode | undefined;

  public animationGroup: AnimationItemGroup;

  public destroyPromise: CancellablePromise<void>;

  public middlewareHelper: MiddlewareHelper;
  public destroyMiddlewareHelper: MiddlewareHelper;

  public searchSignal: ReturnType<typeof createUnifiedSignal<Parameters<Chat['initSearch']>[0]>>;

  public theme: Parameters<typeof themeController['getThemeSettings']>[0];
  public wallPaper: WallPaper;
  public hadAnyBackground: boolean;

  public ignoreSearchCleaning: boolean;

  public stars: Accessor<Long>;
  public appState: ReturnType<typeof useAppState>[0];
  public setAppState: ReturnType<typeof useAppState>[1];
  public appSettings: ReturnType<typeof useAppSettings>[0];
  public setAppSettings: ReturnType<typeof useAppSettings>[1];
  public appConfig: ReturnType<typeof useAppConfig>;
  public peer: ReturnType<typeof usePeer<PeerId>>;
  public historyStorage: ReturnType<typeof useHistoryStorage>;
  public historyStorageNoThreadId: ReturnType<typeof useHistoryStorage>;
  public peerTranslation: ReturnType<typeof usePeerTranslation>;

  public staticMessages: MyMessage[] = [];

  // public requestHistoryOptionsPart: RequestHistoryOptions;

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

    this.type = ChatType.Chat;
    this.animationGroup = `chat-${Math.round(Math.random() * 65535)}`;
    this.middlewareHelper = getMiddleware();
    this.destroyMiddlewareHelper = getMiddleware();

    this.hadAnyBackground = false;

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

    createRoot((dispose) => {
      this.destroyMiddlewareHelper.onDestroy(dispose);
      this.stars = useStars();
      [this.appState, this.setAppState] = useAppState();
      [this.appSettings, this.setAppSettings] = useAppSettings();
      this.appConfig = useAppConfig();
    });
  }

  public hasBackgroundSet() {
    return !!(this.theme || this.wallPaper);
  }

  public async setBackground({
    url,
    theme,
    wallPaper,
    skipAnimation,
    manual,
    onCachedStatus
  }: {
    url?: string,
    theme?: Chat['theme'],
    wallPaper?: Chat['wallPaper'],
    skipAnimation?: boolean,
    manual?: boolean,
    onCachedStatus?: (cached: boolean) => void
  }): Promise<() => void> {
    this.hadAnyBackground = true;
    const log = this.log.bindPrefix('setBackground');
    log('start');
    const isGlobalTheme = !theme;
    const globalTheme = themeController.getTheme();
    const globalWallPaper = themeController.getThemeSettings(globalTheme).wallpaper;
    const newTheme = theme ?? globalTheme;
    const shouldComputeHighlightingColor = !!(newTheme || !isGlobalTheme || wallPaper);
    if(!wallPaper) {
      const themeSettings = themeController.getThemeSettings(newTheme);
      wallPaper = themeSettings.wallpaper;
    }

    if(this.wallPaper === wallPaper && this.theme === newTheme) {
      log('same background');
      onCachedStatus?.(true);
      return;
    }

    const colors = getColorsFromWallPaper(wallPaper);
    const slug = (wallPaper as WallPaper.wallPaper)?.slug;

    let item: HTMLElement, image: HTMLImageElement;
    const isColorBackground = !!colors && !slug && !wallPaper.settings.intensity;
    if(
      isColorBackground &&
      document.documentElement.style.cursor === 'grabbing' &&
      this.gradientRenderer &&
      !this.patternRenderer
    ) {
      log('just changing color');
      this.gradientCanvas.dataset.colors = colors;
      this.gradientRenderer.init(this.gradientCanvas);
      onCachedStatus?.(true);
      return;
    }

    const tempId = ++this.backgroundTempId;

    if(!url && !isColorBackground) {
      const settings = wallPaper.settings;
      const r = ChatBackgroundStore.getBackground({
        slug,
        canDownload: true,
        managers: this.managers,
        appDownloadManager: appDownloadManager,
        blur: settings && settings.pFlags.blur
      });

      const cached: boolean = !(r instanceof Promise);
      log('getting background, cached', cached);
      onCachedStatus?.(cached);
      skipAnimation ??= cached;
      if(!cached) manual = undefined;
      url = await r;
      if(this.backgroundTempId !== tempId) {
        return;
      }
    } else {
      log('global background');
      onCachedStatus?.(true);
    }

    const previousGradientRenderer = this.gradientRenderer;
    const previousPatternRenderer = this.patternRenderer;
    const previousGradientCanvas = this.gradientCanvas;
    const previousPatternCanvas = this.patternCanvas;
    const previousTheme = this.theme;
    const previousWallPaper = this.wallPaper;

    this.gradientRenderer =
      this.patternRenderer =
      this.gradientCanvas =
      this.patternCanvas =
      this.theme =
      this.wallPaper =
      undefined;

    if(newTheme !== globalTheme) {
      this.theme = theme;
    }

    if(wallPaper !== globalWallPaper) {
      this.wallPaper = wallPaper;
    }

    const isPattern = !!(wallPaper as WallPaper.wallPaper).pFlags.pattern;
    const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
    const isDarkPattern = !!intensity && intensity < 0;

    let patternRenderer: ChatBackgroundPatternRenderer;
    let patternCanvas = item?.firstElementChild as HTMLCanvasElement;
    let gradientCanvas: HTMLCanvasElement;
    if(!item) {
      item = document.createElement('div');
      item.classList.add('chat-background-item');

      if(url) {
        if(isPattern) {
          item.classList.add('is-pattern');

          const rect = this.appImManager.chatsContainer.getBoundingClientRect();
          patternRenderer = this.patternRenderer = ChatBackgroundPatternRenderer.getInstance({
            element: this.appImManager.chatsContainer,
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
        } else {
          image = document.createElement('img');
          image.classList.add('chat-background-item-image');
          item.classList.add('is-image', 'chat-background-item-scalable');
          item.append(image);
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
      gradientCanvas.classList.add('chat-background-item-scalable');

      // if(liteMode.isAvailable('animations')) {
      //   gradientRenderer.scrollAnimate(true);
      // }
      // } else {
      //   item.style.backgroundColor = color;
      //   item.style.backgroundImage = 'none';
      // }
    }

    if(intensity && (!image || themeController.isNight())) {
      let setOpacityTo: HTMLElement;
      if(image) {
        setOpacityTo = image;
      } else {
        setOpacityTo = isDarkPattern ? gradientCanvas : patternCanvas;
      }

      let opacityMax = Math.abs(intensity) * (isDarkPattern ? .5 : 1);
      if(image) {
        opacityMax = Math.max(0.3, 1 - intensity);
      } else if(isDarkPattern) {
        opacityMax = Math.max(0.3, opacityMax);
      }

      setOpacityTo.style.setProperty('--opacity-max', '' + opacityMax);
    }

    const promise = new Promise<() => void>((resolve) => {
      const cb = () => {
        if(this.backgroundTempId !== tempId) {
          patternRenderer?.cleanup(patternCanvas);
          gradientRenderer?.cleanup();
          return;
        }

        const prev = this.backgroundEl.lastElementChild as HTMLElement;
        if(prev === item) {
          return;
        }

        const getHighlightningColor = () => {
          const perf = performance.now();
          let pixel: Uint8ClampedArray;
          if(image) {
            pixel = averageColorFromImage(image);
          } else {
            pixel = averageColorFromCanvas(gradientCanvas);
          }

          const hsla = highlightingColor(Array.from(pixel) as any);
          log('getHighlightningColor', hsla, performance.now() - perf);
          return hsla;
        };

        const append = [
          gradientCanvas,
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
          onTransitionStart: () => {
            const perf = performance.now();
            if(newTheme) {
              themeController.applyTheme(newTheme, this.container);
            }

            if(shouldComputeHighlightingColor) {
              themeController.applyHighlightingColor({hsla: getHighlightningColor(), element: this.container});
            }
            log('transition start time', performance.now() - perf);
          },
          onTransitionEnd: prev ? () => {
            previousPatternRenderer?.cleanup(previousPatternCanvas);
            previousGradientRenderer?.cleanup();

            prev.remove();
          } : null,
          useRafs: 2
        });
      };

      const wrappedCallback = () => {
        log('background is ready', performance.now() - perf);
        if(manual) {
          resolve(cb);
        } else {
          cb();
          resolve(undefined);
        }
      };

      const perf = performance.now();
      if(patternRenderer) {
        patternRenderer.renderToCanvas(patternCanvas).then(wrappedCallback);
      } else if(url) {
        renderImageFromUrl(image, url, wrappedCallback, false);
      } else {
        wrappedCallback();
      }
    });

    if(manual) {
      return promise;
    }

    return this.setBackgroundPromise = Promise.race([
      pause(500),
      promise
    ]).then(() => {
      rootScope.dispatchEvent('chat_background_set');
    }) as any;
  }

  public setBackgroundIfNotSet(options: Parameters<Chat['setBackground']>[0]) {
    if(this.hasBackgroundSet()) {
      return;
    }

    return this.setBackground(options);
  }

  private _handleBackgrounds() {
    const log = this.log.bindPrefix('handleBackgrounds');
    const deferred = deferredPromise<() => void>();
    let manual = true;

    const setBackground = (options: Partial<Parameters<Chat['setBackground']>[0]>) => {
      const promise = this.setBackground({
        manual,
        onCachedStatus: (cached) => {
          if(!cached) {
            deferred.resolve(undefined);
          }
        },
        ...options
      });

      bindPromiseToDeferred(promise, deferred);
      return promise;
    };

    const getThemeByEmoticon = (emoticon: string) => {
      if(!emoticon) {
        return;
      }

      const {accountThemes} = appState;
      return accountThemes.themes?.find((theme) => theme.emoticon === emoticon);
    };

    const maybeResetBackground = () => {
      if(!this.hasBackgroundSet() && this.hadAnyBackground) {
        log('no background');
        deferred.resolve(undefined);
        return;
      }

      log('resetting background');
      setBackground(this.getResetBackgroundOptions());
    };

    const update = () => {
      const _fullPeer = fullPeer();
      if(!_fullPeer) {
        maybeResetBackground();
        return;
      }

      let wallPaper = unwrap((_fullPeer as ChatFull.channelFull).wallpaper);
      const emoticon = (_fullPeer as ChatFull.channelFull).theme_emoticon ||
        ((_fullPeer as UserFull.userFull).theme as ChatTheme.chatTheme)?.emoticon ||
        (wallPaper && wallPaper.settings?.emoticon);

      const theme = unwrap(getThemeByEmoticon(emoticon));
      if(!theme && !wallPaper) {
        maybeResetBackground();
        return;
      }

      // * handle case when theme is in wallpaper
      if(emoticon && theme) {
        wallPaper = undefined;
      }

      log('updating', _fullPeer, theme, wallPaper);

      setBackground({
        theme,
        wallPaper,
        skipAnimation: manual
      });

      const isNightTheme = useIsNightTheme();
      createEffect(on(isNightTheme, update, {defer: true}));
    };

    const fullPeer = useFullPeer(this.peerId);
    const [appState] = useAppState();
    createEffect(() => {
      update();
      manual = false;
    });

    return deferred;
  }

  private handleBackgrounds() {
    if(this.type === ChatType.Stories) {
      return Promise.resolve(noop);
    }

    return createRoot((dispose) => {
      this.middlewareHelper.get().onClean(dispose);
      return this._handleBackgrounds();
    });
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

    this.priceChangedInterceptor = new PriceChangedInterceptor({
      chat: this,
      listenerSetter: this.bubbles.listenerSetter,
      managers: this.managers
    });

    this.topbar.constructUtils();
    this.topbar.constructPeerHelpers();

    this.topbar.construct();
    this.input.construct();

    this.bubbles.constructPeerHelpers();
    this.input.constructPeerHelpers();

    this.priceChangedInterceptor.init();

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
      if(dialog.peerId === this.peerId && (isDialog(dialog) || this.threadId === getDialogKey(dialog))) {
        this.appImManager.setPeer({isDeleting: true});
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('monoforum_dialogs_drop', ({ids, parentPeerId}) => {
      if(parentPeerId === this.peerId && ids.includes(this.monoforumThreadId)) {
        this.appImManager.setPeer({isDeleting: true});
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const {peerId} = this;
      if(peerId.isAnyChat() && peerId.toChatId() === chatId) {
        const {
          starsAmount,
          isAnonymousSending,
          canManageDirectMessages
        } = await namedPromises({
          starsAmount: this.managers.appChatsManager.getStarsAmount(chatId),
          isAnonymousSending: this.managers.appMessagesManager.isAnonymousSending(peerId),
          canManageDirectMessages: this.managers.appPeersManager.canManageDirectMessages(peerId)
        });

        if(peerId === this.peerId) {
          this.canManageDirectMessages = canManageDirectMessages;
          this.isAnonymousSending = isAnonymousSending;
          this.updateStarsAmount(starsAmount);
        }
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('botforum_pending_topic_created', ({peerId, tempId, newId}) => {
      if(peerId !== this.peerId || (this.threadId && this.threadId !== tempId)) return;

      !newId && this.input.clearInput();

      this.setPeer({
        peerId,
        threadId: newId || tempId,
        fromTemporaryThread: !!newId
      });
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

    const setInChatQueryDebounced = debounce((query: string) => {
      this.bubbles.setInChatQuery(query);
    }, 300, false, true);

    const hasInChatQuery = () => this.type === ChatType.Logs;

    this.searchSignal = createUnifiedSignal();
    createRoot((dispose) => {
      this.middlewareHelper.get().onDestroy(dispose);

      const animateElements = async(topbarSearch: HTMLElement, visible: boolean) => {
        const animate = liteMode.isAvailable('animations')/*  && !this.setPeerPromise */;
        const keyframes: Keyframe[] = [{opacity: 0}, {opacity: 1}];
        const options: KeyframeAnimationOptions = {fill: 'forwards', duration: animate ? 200 : 0, easing: 'ease-in-out'};
        if(!visible) {
          keyframes.reverse();
        }

        const elements = this.topbar.container.querySelectorAll<HTMLElement>('.content, .chat-utils');

        const promises: Promise<any>[] = [];
        const promise = topbarSearch.animate(keyframes, options).finished;
        keyframes.reverse();
        const otherPromises = Array.from(elements).map((element) => element.animate(keyframes, options).finished);
        promises.push(promise, ...otherPromises);
        return Promise.all(promises);
      };

      const [needSearch, setNeedSearch] = createSignal(false);
      const [query, setQuery] = createSignal('', {equals: false});
      const [filterPeerId, setFilterPeerId] = createSignal<PeerId>(undefined, {equals: false});
      const [reaction, setReaction] = createSignal<Reaction>(undefined, {equals: false});
      createEffect<HTMLElement>((topbarSearch) => {
        if(!needSearch()) {
          if(!topbarSearch) {
            return;
          }

          animateElements(topbarSearch, false).then(() => {
            topbarSearch.remove();
          });
          return;
        }

        topbarSearch = untrack(() => TopbarSearch({
          chat: this,
          chatType: this.type,
          peerId: this.peerId,
          // TODO: Check here for monoforumThreadId
          threadId: this.threadId,
          canFilterSender: this.type !== ChatType.Logs && this.isAnyGroup,
          query,
          filterPeerId,
          reaction,
          noList: hasInChatQuery(),
          onValueChange: hasInChatQuery() ? setInChatQueryDebounced : undefined,
          onClose: () => {
            this.searchSignal(undefined);
            this.bubbles.setInChatQuery('');
          },
          onDatePick: this.type === ChatType.Logs ? undefined : (timestamp) => {
            this.bubbles.onDatePick(timestamp);
          },
          onActive: (active, showingReactions, isSmallScreen) => {
            const className = 'is-search-active';
            const isActive = !!(active && (showingReactions || isSmallScreen));
            const wasActive = this.container.classList.contains(className);
            if(wasActive === isActive) {
              return;
            }

            const scrollSaver = this.bubbles.createScrollSaver();
            scrollSaver.save();
            this.container.classList.toggle(className, !isSmallScreen && isActive);
            this.topbar.container.classList.toggle('hide-pinned', isSmallScreen);
            scrollSaver.restore();
          },
          onSearchTypeChange: () => {
            this.ignoreSearchCleaning = true;
          }
        })) as HTMLElement;
        this.topbar.container.append(topbarSearch);
        animateElements(topbarSearch, true);
        return topbarSearch;
      });

      createEffect(() => {
        const s = this.searchSignal();
        setQuery(s?.query);
        setFilterPeerId(s?.filterPeerId);
        setReaction(s?.reaction);
        setNeedSearch(!!s);
      });
    });
  }

  public beforeDestroy() {
    this.destroyPromise = deferredPromise();
    this.bubbles.cleanup();
    this.searchSignal?.(undefined);
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
    this.destroyMiddlewareHelper.destroy();

    this.cleanupBackground();

    this.topbar =
      this.bubbles =
      this.input =
      this.contextMenu =
      this.selection =
      undefined;

    this.container?.remove();

    this.changeHistoryStorageKey(undefined, undefined);

    // this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup(helperToo = true) {
    this.input?.cleanup(helperToo);
    this.topbar?.cleanup();
    this.selection?.cleanup();
    this.priceChangedInterceptor?.cleanup();

    if(this.ignoreSearchCleaning) this.ignoreSearchCleaning = undefined;
    else this.searchSignal?.(undefined);
  }

  public get isForumTopic() {
    return !!(this.isForum && this.threadId);
  }

  public get isSensitive() {
    return isSensitive((this.peer as User.user).restriction_reason || []);
  }

  public async onChangePeer(options: ChatSetPeerOptions, m: ReturnType<typeof middlewarePromise>) {
    // spot
    const {peerId, threadId} = options;

    if(!this.excludeParts.elements) {
      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      searchTab?.close();
    }

    const isForum = apiManagerProxy.isForum(peerId);
    const isBotforum = apiManagerProxy.isBotforum(peerId);

    if(threadId && !isForum && !isBotforum) {
      options.type = options.peerId === rootScope.myId ? ChatType.Saved : ChatType.Discussion;
    }

    if(options.query) {
      options.type = ChatType.Search;
    }

    const type = options.type ?? ChatType.Chat;
    this.setType(type);

    const {
      noForwards,
      isRestricted,
      isLikeGroup,
      isRealGroup,
      isMegagroup,
      isBroadcast,
      isChannel,
      isBot,
      isAnonymousSending,
      isUserBlocked,
      isPremiumRequired,
      starsAmount,
      chat,
      canManageDirectMessages
    } = await m(namedPromises({
      noForwards: this.managers.appPeersManager.noForwards(peerId),
      isRestricted: this.managers.appPeersManager.isPeerRestricted(peerId),
      isLikeGroup: this._isLikeGroup(peerId),
      isRealGroup: this.managers.appPeersManager.isAnyGroup(peerId),
      isMegagroup: this.managers.appPeersManager.isMegagroup(peerId),
      isBroadcast: this.managers.appPeersManager.isBroadcast(peerId),
      isChannel: this.managers.appPeersManager.isChannel(peerId),
      isBot: this.managers.appPeersManager.isBot(peerId),
      isAnonymousSending: this.managers.appMessagesManager.isAnonymousSending(peerId),
      isUserBlocked: peerId.isUser() && this.managers.appProfileManager.isCachedUserBlocked(peerId),
      isPremiumRequired: this.isPremiumRequiredToContact(peerId),
      starsAmount: this.managers.acknowledged.appPeersManager.getStarsAmount(peerId),
      chat: peerId.isAnyChat() && this.peer as MTChat,
      canManageDirectMessages: this.managers.appPeersManager.canManageDirectMessages(peerId)
    }, this.log));

    // ! WARNING: TEMPORARY, HAVE TO GET TOPIC
    if(isForum && threadId) {
      await m(this.managers.dialogsStorage.getForumTopicOrReload(peerId, threadId));
    }

    this.noForwards = noForwards;
    this.isLikeGroup = isLikeGroup;
    this.isAnyGroup = isRealGroup;
    this.isMegagroup = isMegagroup;
    this.isBroadcast = isBroadcast;
    this.isChannel = isChannel;
    this.isBot = isBot;
    this.isForum = isForum;
    this.isAllMessagesForum = isForum && !threadId;
    this.isAnonymousSending = isAnonymousSending;
    this.isUserBlocked = isUserBlocked;
    this.isPremiumRequired = isPremiumRequired;
    this.isMonoforum = !!(chat?._ === 'channel' && chat?.pFlags?.monoforum);
    this.isBotforum = isBotforum;
    this.canManageDirectMessages = canManageDirectMessages;

    if(starsAmount.cached) {
      this.starsAmount = await starsAmount.result;
    } else {
      const middleware = this.middlewareHelper.get();
      starsAmount.result.then((starsAmount) => {
        if(!middleware()) {
          return;
        }
        this.updateStarsAmount(starsAmount);
      });
    }

    this.isRestricted = isRestricted;

    if(this.selection) {
      this.selection.isScheduled = type === ChatType.Scheduled;
    }

    this.messagesStorageKey = `${this.peerId}_${this.type === ChatType.Scheduled ? 'scheduled' : 'history'}`;

    // this.container && this.container.classList.toggle('no-forwards', this.noForwards);

    if(!this.excludeParts.sharedMedia) {
      this.sharedMediaTab = appSidebarRight.createSharedMediaTab();
      this.sharedMediaTabs.push(this.sharedMediaTab);
      const linkedMonoforumId = (chat?._ === 'channel' && chat.pFlags?.monoforum && chat.linked_monoforum_id)?.toPeerId?.(true);
      this.sharedMediaTab.setPeer(this.monoforumThreadId || linkedMonoforumId || peerId, threadId);
    }

    this.input?.clearHelper(); // костыль
    this.selection?.cleanup(); // TODO: REFACTOR !!!!!!
  }

  public get requestHistoryOptionsPart(): RequestHistoryOptions {
    const options: RequestHistoryOptions = {
      peerId: this.peerId,
      threadId: this.threadId,
      monoforumThreadId: this.monoforumThreadId
    };

    CHAT_SEARCH_KEYS.forEach((key) => {
      // @ts-ignore
      options[key] = this[key];
    });

    if(this.hashtagType && this.hashtagType !== 'this') {
      options.peerId = NULL_PEER_ID;
      options.threadId = undefined;
      options.monoforumThreadId = undefined;
    }

    return options;
  }

  public setPeer(options: ChatSetPeerOptions) {
    const {peerId, threadId, monoforumThreadId, messages, type} = options;
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
      this.monoforumThreadId = monoforumThreadId;
      this.isTemporaryThread = isTempId(threadId);
      this.noInput = [ChatType.Static, ChatType.Logs].includes(type);
      this.middlewareHelper.clean();

      createRoot((dispose) => {
        this.middlewareHelper.get().onClean(dispose);
        this.peer = usePeer(peerId);
        this.peerTranslation = usePeerTranslation(peerId);

        createEffect(() => {
          this.autoDownload = useAutoDownloadSettings(this.peer, this.appSettings);
        });
      });
    } else if(this.setPeerPromise) {
      return;
    }

    this.staticMessages = messages || [];

    if(!peerId) {
      this.peerId = 0;
      let promise: Promise<any>;

      if(this.hasBackgroundSet() && this === this.appImManager.chats[0]) {
        promise = this.setBackground(this.getResetBackgroundOptions());
      }

      callbackify(promise, () => {
        appSidebarRight.toggleSidebar(false);
        this.cleanup(true);
        this.bubbles.setPeer({peerId, samePeer: false, sameSearch: false});
        this.appImManager.dispatchEvent('peer_changed', this);

        if(!this.excludeParts.sharedMedia) {
          appSidebarRight.replaceSharedMediaTab();
          this.destroySharedMediaTab();
          this.sharedMediaTab = undefined;
        }
      });

      return;
    }

    this.peerChanged = samePeer;

    let sameSearch = true;
    if(!samePeer || CHAT_SEARCH_KEYS.some((key) => options.hasOwnProperty(key))) {
      CHAT_SEARCH_KEYS.forEach((key) => {
        // @ts-ignore
        this[key] = options[key];
      });
      sameSearch = false;
    }

    const {requestHistoryOptionsPart} = this;
    const forKey: Parameters<typeof getHistoryStorageKey>[0] = {
      type: getHistoryStorageType(requestHistoryOptionsPart),
      ...requestHistoryOptionsPart
    };
    this.changeHistoryStorageKey(
      getHistoryStorageKey(forKey),
      getHistoryStorageKey({...forKey, threadId: undefined})
    );

    if(options.fromTemporaryThread) {
      return Promise.resolve({
        cached: true,
        promise: this.finishPeerChange({
          peerId,
          middleware: () => {
            return this.peerId === peerId && this.threadId === threadId;
          }
        })
      });
    }

    const bubblesSetPeerPromise = this.bubbles.setPeer({...options, samePeer, sameSearch});
    const setPeerPromise = this.setPeerPromise = bubblesSetPeerPromise.then((result) => {
      return result.promise;
    }).catch(noop).finally(() => {
      if(this.setPeerPromise === setPeerPromise) {
        this.setPeerPromise = null;
      }
    });

    return bubblesSetPeerPromise;
  }

  private changeHistoryStorageKey(key: HistoryStorageKey, keyNoThreadId: HistoryStorageKey) {
    this.disposeHistoryStorage?.();
    this.disposeHistoryStorage = undefined;
    if(!key) {
      return;
    }

    this.disposeHistoryStorage = createRoot((dispose) => {
      this.historyStorage = useHistoryStorage(key);
      this.historyStorageNoThreadId = useHistoryStorage(keyNoThreadId);

      this.managers.appMessagesManager.toggleHistoryKeySubscription(key, true);
      onCleanup(() => {
        this.managers.appMessagesManager.toggleHistoryKeySubscription(key, false);
      });

      return dispose;
    });
  }

  private getResetBackgroundOptions(): Partial<Parameters<Chat['setBackground']>[0]> {
    return {
      url: this.appImManager.lastBackgroundUrl,
      skipAnimation: true
    };
  }

  public destroySharedMediaTab(tab = this.sharedMediaTab) {
    if(!tab) {
      return;
    }

    indexOfAndSplice(this.sharedMediaTabs, tab);
    tab.destroy();
  }

  public setMessageId(options: Partial<{
    lastMsgId: number,
    lastMsgPeerId: PeerId,
    mediaTimestamp: number,
    type: ChatType
  } & ChatSearchKeys> = {}) {
    return this.setPeer({
      peerId: this.peerId,
      threadId: this.threadId,
      monoforumThreadId: this.monoforumThreadId,
      ...options
    });
  }

  public async finishPeerChange(options: {
    peerId: PeerId,
    isTarget?: boolean,
    isJump?: boolean,
    lastMsgId?: number,
    startParam?: string,
    middleware: () => boolean,
    text?: string,
    entities?: MessageEntity[]
  }) {
    if(this.peerChanged) return;

    const peerId = this.peerId;
    this.peerChanged = true;
    this.wasAlreadyUsed = true;

    const {middleware} = options;

    this.cleanup(false);

    const sharedMediaTab = this.sharedMediaTab;

    const callbacksObj = await namedPromises({
      topbar: this.topbar?.finishPeerChange(options),
      bubbles: this.bubbles?.finishPeerChange(),
      input: this.input?.finishPeerChange(options),
      sharedMedia: sharedMediaTab?.fillProfileElements(),
      backgrounds: this.handleBackgrounds()
    }, this.log);

    const callbacks = Object.values(callbacksObj);
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
      this.container.dataset.type = this.type === ChatType.Search ? 'chat' : this.type;
      this.container.classList.toggle('can-click-date', [ChatType.Chat, ChatType.Discussion, ChatType.Saved].includes(this.type));
    }

    this.log.setPrefix('CHAT-' + peerId + '-' + this.type);

    if(this.isMainChat) {
      this.appImManager.dispatchEvent('peer_changed', this);
    }
  }

  public getMessage(mid: number | FullMid) {
    if(typeof(mid) === 'string') {
      const {peerId, mid: _mid} = splitFullMid(mid);
      return apiManagerProxy.getMessageByPeer(peerId, _mid);
    }

    return apiManagerProxy.getMessageFromStorage(this.messagesStorageKey, mid);
  }

  public getMessageByPeer(peerId: PeerId, mid: number) {
    if(!this.query) {
      return this.getMessage(mid);
    }

    return apiManagerProxy.getMessageByPeer(peerId, mid);
  }

  public async getMidsByMid(peerId: PeerId, mid: number) {
    return this.managers.appMessagesManager.getMidsByMessage(this.getMessageByPeer(peerId, mid));
  }

  public getHistoryStorage(ignoreThreadId?: boolean) {
    return ignoreThreadId ? this.historyStorageNoThreadId : this.historyStorage;
    // return useHistoryStorage(ignoreThreadId ? this.historyStorageKeyNoThreadId : this.historyStorageKey);
    // return this.managers.appMessagesManager.getHistoryStorageTransferable({
    //   ...this.requestHistoryOptionsPart,
    //   threadId: ignoreThreadId ? undefined : this.threadId
    // }).then((historyStorageTransferable) => {
    //   return {
    //     ...historyStorageTransferable,
    //     history: SlicedArray.fromJSON<number>(historyStorageTransferable.historySerialized),
    //     searchHistory: historyStorageTransferable.searchHistorySerialized && SlicedArray.fromJSON<string>(historyStorageTransferable.searchHistorySerialized)
    //   };
    // });
  }

  public hasMessages() {
    const {history} = this.getHistoryStorage(true);
    return !!history.length;
  }

  public getDialogOrTopic() {
    return this.managers.dialogsStorage.getAnyDialog(this.peerId, (this.isForum || this.type === ChatType.Saved) && this.threadId);
  }

  public getHistoryMaxId() {
    return this.getHistoryStorage().maxId;
  }

  // * used to define need of avatars
  public async _isLikeGroup(peerId: PeerId) {
    if(peerId === rootScope.myId) return true;
    if(peerId === REPLIES_PEER_ID) return true;
    if(this.type === ChatType.Search && this.hashtagType !== 'this') return true;
    if(this.type === ChatType.Logs) return true;

    const {isBotforum, isLikeGroup} = await namedPromises({
      isLikeGroup: this.managers.appPeersManager.isLikeGroup(peerId),
      isBotforum: this.managers.appPeersManager.isBotforum(peerId)
    });

    return !isBotforum && isLikeGroup;
  }

  public resetSearch() {
    this.searchSignal?.(undefined);
  }

  public initSearch(options: {query?: string, filterPeerId?: PeerId, reaction?: Reaction} = {}): void {
    if(!this.peerId) return;
    options.query ||= '';
    this.searchSignal(options);
  }

  public canSend(action?: ChatRights) {
    if(isVerificationBot(this.peerId)) return Promise.resolve(false);
    if(this.type === ChatType.Saved && this.threadId !== this.peerId) {
      return Promise.resolve(false);
    }

    return this.managers.appMessagesManager.canSendToPeer(this.peerId, this.threadId, action);
  }

  public isStartButtonNeeded() {
    return Promise.all([
      this.managers.appPeersManager.isBot(this.peerId),
      this.managers.appMessagesManager.getDialogOnly(this.peerId),
      this.getHistoryStorage(true),
      this.peerId.isUser() ? this.managers.appProfileManager.isCachedUserBlocked(this.peerId.toUserId()) : undefined
    ]).then(([isBot, dialog, historyStorage, isUserBlocked]) => {
      if(!isBot || isVerificationBot(this.peerId)) {
        return false;
      }

      return (!dialog && !historyStorage.history.length) || isUserBlocked;
    });
  }

  public isPremiumRequiredToContact(peerId = this.peerId) {
    if(!peerId.isUser()) {
      return Promise.resolve(false);
    }

    return this.managers.appUsersManager.getRequirementToContact(peerId.toUserId(), true)
    .then((requirement) => requirement?._ === 'requirementToContactPremium');
  }

  public getMessageSendingParams(): MessageSendingParams {
    return {
      peerId: this.peerId,
      threadId: this.threadId,
      updateStickersetOrder: this.appSettings.stickers.dynamicPackOrder,
      ...(this.input && {
        ...(this.input.getReplyTo() || false),
        ...(this.input.suggestedPost ? {
          replyToMsgId: this.input.suggestedPost.changeMid
        } : {}),
        scheduleDate: this.input.scheduleDate,
        silent: this.input.sendSilent,
        sendAsPeerId: this.input.sendAsPeerId,
        effect: this.input.effect(),
        suggestedPost: this.input.suggestedPost
      }),
      replyToMonoforumPeerId: this.input?.suggestedPost?.monoforumThreadId || this.input?.getReplyTo()?.replyToMonoforumPeerId || this.monoforumThreadId,
      savedReaction: this.savedReaction
    };
  }

  public isOurMessage(message: Message.message | Message.messageService) {
    if(this.isMegagroup) {
      return !!message.pFlags.out;
    }

    if(message.fromId === rootScope.myId && !message.pFlags.post) {
      return true;
    }

    if((message as Message.message).fwd_from?.pFlags?.saved_out) {
      return true;
      // const peer = apiManagerProxy.getPeer((message as Message.message).fwdFromId);
      // return !(peer as MTChat.channel)?.pFlags?.broadcast;
    }

    return false;
  }

  public isOutMessage(message: Message.message | Message.messageService) {
    const fwdFrom = (message as Message.message).fwd_from;
    const isOut = this.isOurMessage(message) && (!fwdFrom || this.peerId !== rootScope.myId || this.threadId);
    return !!isOut;
  }

  public isPinnedMessagesNeeded() {
    return this.type === ChatType.Chat || (this.isForum && this.type !== ChatType.Static && this.type !== ChatType.Logs);
  }

  public isForwardOfForward(message: Message) {
    // return isForwardOfForward(message);
    let is = isForwardOfForward(message);
    const fwdFrom = (message as Message.message).fwd_from;
    if(
      is &&
      fwdFrom.saved_from_id &&
      this.type === ChatType.Saved ? getPeerId(fwdFrom.saved_from_id) === this.threadId : false
      // getPeerId(fwdFrom.saved_from_id) === (this.type === ChatType.Saved ? this.threadId : this.peerId)
    ) {
      is = false;
    }

    return is;
  }

  public getPostAuthor(message: Message.message) {
    if(this.isLikeGroup) {
      return;
    }

    const fwdFrom = message.fwd_from;
    const isPost = !!(message.pFlags.post || (fwdFrom?.post_author && !this.isOutMessage(message)));
    if(!isPost) {
      return;
    }

    // if(isForwardOfForward(message) && !message.post_author) {
    //   return;
    // }

    // return message.post_author || (fwdFrom && (this.type !== ChatType.Saved || message.fwdFromId !== this.threadId) && fwdFrom.post_author);
    return message.post_author || fwdFrom?.post_author;
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

  public async sendReaction(options: SendReactionOptions) {
    const isPaidReaction = options.reaction._ === 'reactionPaid';
    const count = options.count ?? 1;
    if(isPaidReaction) {
      const key = getPendingPaidReactionKey(options.message as Message.message);
      let pending = PENDING_PAID_REACTIONS.get(key);
      const hadPending = !!pending;
      const requiredStars = (pending ? pending.count() : 0) + count;
      if(+this.stars() < requiredStars) {
        if(pending) {
          pending.abortController.abort();
        }

        PopupElement.createPopup(PopupStars, {
          itemPrice: count,
          onTopup: () => {
            this.sendReaction(options);
          },
          purpose: 'reaction',
          peerId: this.peerId,
          spendPurposePeerId: this.peerId
        });

        return;
      }

      if(!pending) {
        const [count, setCount] = createSignal(0);
        const [sendTime, setSendTime] = createSignal(0);
        const abortController = new AbortController();
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(pending.sendTimeout);
          pending.setSendTime(0);
          PENDING_PAID_REACTIONS.delete(key);

          if(abortController.signal.reason !== PENDING_PAID_REACTION_SENT_ABORT_REASON) {
            setReservedStars((reservedStars) => reservedStars - pending.count());
          }

          rootScope.dispatchEventSingle('messages_reactions', [{
            message: this.getMessageByPeer(options.message.peerId, options.message.mid) as Message.message,
            changedResults: [],
            removedResults: []
          }]);
        });

        PENDING_PAID_REACTIONS.set(key, pending = {
          count,
          setCount,
          sendTime,
          setSendTime,
          sendTimeout: 0,
          abortController
        });
      } else {
        clearTimeout(pending.sendTimeout);
      }

      pending.setCount((_count) => _count + count);
      pending.setSendTime(Date.now() + SEND_PAID_WITH_STARS_DELAY);
      pending.sendTimeout = window.setTimeout(() => {
        const count = pending.count();
        pending.abortController.abort(PENDING_PAID_REACTION_SENT_ABORT_REASON);
        this.managers.appReactionsManager.sendReaction({
          ...options,
          count
        });
      }, SEND_PAID_WITH_STARS_DELAY);

      setReservedStars((reservedStars) => reservedStars + count);

      if(!hadPending) {
        showUndoablePaidTooltip({
          titleCount: pending.count,
          subtitleCount: pending.count,
          sendTime: pending.sendTime,
          onUndo: () => void pending.abortController.abort(),
          ...paidReactionLangKeys
        });
      }
    }

    const messageReactions = await this.managers.appReactionsManager.sendReaction({
      ...options,
      count: isPaidReaction ? 0 : count,
      onlyReturn: isPaidReaction
    });

    if(isPaidReaction) {
      const {message} = options;
      message.reactions = messageReactions;
      rootScope.dispatchEventSingle('messages_reactions', [{
        message: message as Message.message,
        changedResults: [messageReactions.results[0]],
        removedResults: []
      }]);
    }
  }

  public updateStarsAmount(starsAmount: number) {
    this.starsAmount = starsAmount;
    this.input.setStarsAmount(starsAmount);
    getCurrentNewMediaPopup()?.setStarsAmount(starsAmount);
  }

  public async getAutoDeletePeriod(): Promise<AckedResult<number>> {
    try {
      const dialog = await this.managers.dialogsStorage.getDialogOnly(this.peerId);
      if(dialog) return {
        cached: true,
        result: Promise.resolve(dialog.ttl_period)
      };

      const fullPeer = this.peerId.isUser() ?
        await this.managers.acknowledged.appProfileManager.getProfile(this.peerId.toUserId()) :
        await this.managers.acknowledged.appProfileManager.getChatFull(this.peerId.toChatId());

      return {
        cached: fullPeer.cached,
        result: fullPeer.result.then((fullPeer) => fullPeer.ttl_period)
      }
    } catch{
      return {
        cached: true,
        result: Promise.resolve(0)
      };
    }
  }

  public async openAutoDeleteMessagesCustomTimePopup() {
    const {
      popup: {default: AutoDeleteMessagesCustomTimePopup},
      autoDeletePeriod
    } = await namedPromises({
      popup: import('../sidebarLeft/tabs/autoDeleteMessages/customTimePopup'),
      autoDeletePeriod: this.getAutoDeletePeriod().then(ackedResult => ackedResult.result)
    });

    new AutoDeleteMessagesCustomTimePopup({
      HotReloadGuard: SolidJSHotReloadGuardProvider,
      descriptionLangKey: this.isBroadcast ? 'AutoDeleteMessages.InfoChannel' : 'AutoDeleteMessages.InfoChat',
      period: autoDeletePeriod,
      onFinish: (period) => {
        this.managers.appPrivacyManager.setAutoDeletePeriodFor(this.peerId, period);
      }
    }).show();
  }

  public canManageAutoDelete = async() => {
    const specialChats = [REPLIES_PEER_ID, REPLIES_HIDDEN_CHANNEL_ID.toPeerId(), VERIFICATION_CODES_BOT_ID, HIDDEN_PEER_ID, SERVICE_PEER_ID, rootScope.myId];
    if(specialChats.includes(this.peerId)) return false;

    if(this.peerId.isUser()) return true;

    const {chat, isMonoforum}  = await namedPromises({
      chat: this.managers.appChatsManager.getChat(this.peerId.toChatId()),
      isMonoforum: this.managers.appChatsManager.isMonoforum(this.peerId.toChatId())
    });

    return !isMonoforum && hasRights(chat, 'change_info');
  }

  public toggleChatIfMedium() {
    if(mediaSizes.activeScreen === ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
      this.appImManager.setPeer({peerId: this.peerId});
      return true;
    }

    return false;
  }

  public pop() {
    if(this.toggleChatIfMedium()) return;

    const isFirstChat = this.appImManager.chats.indexOf(this) === 0;
    appNavigationController.back(isFirstChat ? 'im' : 'chat');
  }

  /**
   * returns false if this is the only chat
   */
  public popIfMoreThanOne() {
    if(this.toggleChatIfMedium()) return true;

    const isFirstChat = this.appImManager.chats.indexOf(this) === 0;
    if(isFirstChat) return false;

    appNavigationController.back('chat');
    return true;
  }
}
