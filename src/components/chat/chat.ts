/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatRights} from '../../lib/appManagers/appChatsManager';
import type {RequestWebViewOptions} from '../../lib/appManagers/appAttachMenuBotsManager';
import type {HistoryStorageKey, MessageSendingParams, MessagesStorageKey, RequestHistoryOptions} from '../../lib/appManagers/appMessagesManager';
import {AppImManager, APP_TABS, ChatSetPeerOptions} from '../../lib/appManagers/appImManager';
import EventListenerBase from '../../helpers/eventListenerBase';
import {logger, LogTypes} from '../../lib/logger';
import rootScope from '../../lib/rootScope';
import appSidebarRight from '../sidebarRight';
import ChatBubbles, {FullMid, splitFullMid} from './bubbles';
import ChatContextMenu from './contextMenu';
import ChatInput from './input';
import ChatSelection from './selection';
import ChatTopbar from './topbar';
import {NULL_PEER_ID, REPLIES_PEER_ID, SEND_PAID_WITH_STARS_DELAY} from '../../lib/mtproto/mtproto_config';
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
import {Message, WallPaper, Chat as MTChat, Reaction, AvailableReaction, ChatFull, MessageEntity, PaymentsPaymentForm} from '../../layer';
import animationIntersector, {AnimationItemGroup} from '../animationIntersector';
import {getColorsFromWallPaper} from '../../helpers/color';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import deferredPromise, {CancellablePromise, bindPromiseToDeferred} from '../../helpers/cancellablePromise';
import {isDialog} from '../../lib/appManagers/utils/dialogs/isDialog';
import getDialogKey from '../../lib/appManagers/utils/dialogs/getDialogKey';
import getHistoryStorageKey, {getHistoryStorageType} from '../../lib/appManagers/utils/messages/getHistoryStorageKey';
import isForwardOfForward from '../../lib/appManagers/utils/messages/isForwardOfForward';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {SendReactionOptions} from '../../lib/appManagers/appReactionsManager';
import {MiddlewareHelper, getMiddleware} from '../../helpers/middleware';
import {Accessor, createEffect, createRoot, createSignal, on, untrack} from 'solid-js';
import TopbarSearch from './topbarSearch';
import createUnifiedSignal from '../../helpers/solid/createUnifiedSignal';
import liteMode from '../../helpers/liteMode';
import {useFullPeer} from '../../stores/fullPeers';
import {useAppState} from '../../stores/appState';
import {unwrap} from 'solid-js/store';
import {averageColorFromCanvas, averageColorFromImage} from '../../helpers/averageColor';
import highlightingColor from '../../helpers/highlightingColor';
import callbackify from '../../helpers/callbackify';
import useIsNightTheme from '../../hooks/useIsNightTheme';
import useStars, {setReservedStars} from '../../stores/stars';
import PopupElement from '../popups';
import PopupStars from '../popups/stars';
import {getPendingPaidReactionKey, PENDING_PAID_REACTION_SENT_ABORT_REASON, PENDING_PAID_REACTIONS} from './reactions';
import ChatBackgroundStore from '../../lib/chatBackgroundStore';
import appDownloadManager from '../../lib/appManagers/appDownloadManager';
import showUndoablePaidTooltip, {paidReactionLangKeys} from './undoablePaidTooltip';
import namedPromises from '../../helpers/namedPromises';
import {getCurrentNewMediaPopup} from '../popups/newMedia';

export enum ChatType {
  Chat = 'chat',
  Pinned = 'pinned',
  Discussion = 'discussion',
  Scheduled = 'scheduled',
  Stories = 'stories',
  Saved = 'saved',
  Search = 'search'
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

  public wasAlreadyUsed: boolean;
  // public initPeerId = 0;

  // * will be also used for RequestHistoryOptions
  public peerId: PeerId;
  public threadId: number;
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
  public historyStorageKey: HistoryStorageKey;
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

  public starsAmount: number | undefined;

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
      const emoticon = _fullPeer.theme_emoticon || (wallPaper && wallPaper.settings?.emoticon);

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

    const fullPeer = useFullPeer(() => this.peerId);
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
      if(dialog.peerId === this.peerId && (isDialog(dialog) || this.threadId === getDialogKey(dialog))) {
        this.appImManager.setPeer({isDeleting: true});
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('chat_update', async(chatId) => {
      const {peerId} = this;
      if(peerId.isAnyChat() && peerId.toChatId() === chatId) {
        const {
          starsAmount,
          isAnonymousSending
        } = await namedPromises({
          starsAmount: this.managers.appChatsManager.getStarsAmount(chatId),
          isAnonymousSending: this.managers.appMessagesManager.isAnonymousSending(peerId)
        });

        if(peerId === this.peerId) {
          this.isAnonymousSending = isAnonymousSending;
          this.starsAmount = starsAmount;
          this.input.setStarsAmount(starsAmount);
          getCurrentNewMediaPopup()?.setStarsAmount(starsAmount);
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
          threadId: this.threadId,
          canFilterSender: this.isAnyGroup,
          query,
          filterPeerId,
          reaction,
          onClose: () => {
            this.searchSignal(undefined);
          },
          onDatePick: (timestamp) => {
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

    createRoot((dispose) => {
      this.middlewareHelper.get().onDestroy(dispose);
      this.stars = useStars();
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

    this.changeHistoryStorageKey(undefined);

    // this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup(helperToo = true) {
    this.input?.cleanup(helperToo);
    this.topbar?.cleanup();
    this.selection?.cleanup();

    if(this.ignoreSearchCleaning) this.ignoreSearchCleaning = undefined;
    else this.searchSignal?.(undefined);
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

    const isForum = apiManagerProxy.isForum(peerId);

    if(threadId && !isForum) {
      options.type = options.peerId === rootScope.myId ? ChatType.Saved : ChatType.Discussion;
    }

    if(options.query) {
      options.type = ChatType.Search;
    }

    const type = options.type ?? ChatType.Chat;
    this.setType(type);

    const [
      noForwards,
      isRestricted,
      isLikeGroup,
      isRealGroup,
      _,
      isMegagroup,
      isBroadcast,
      isChannel,
      isBot,
      isAnonymousSending,
      isUserBlocked,
      isPremiumRequired,
      starsAmount
    ] = await m(Promise.all([
      this.managers.appPeersManager.noForwards(peerId),
      this.managers.appPeersManager.isPeerRestricted(peerId),
      this._isLikeGroup(peerId),
      this.managers.appPeersManager.isAnyGroup(peerId),
      this.setAutoDownloadMedia(),
      this.managers.appPeersManager.isMegagroup(peerId),
      this.managers.appPeersManager.isBroadcast(peerId),
      this.managers.appPeersManager.isChannel(peerId),
      this.managers.appPeersManager.isBot(peerId),
      this.managers.appMessagesManager.isAnonymousSending(peerId),
      peerId.isUser() && this.managers.appProfileManager.isCachedUserBlocked(peerId),
      this.isPremiumRequiredToContact(peerId),
      this.managers.appPeersManager.getStarsAmount(peerId)
    ]));

    // ! WARNING: TEMPORARY, HAVE TO GET TOPIC
    if(isForum && threadId) {
      await m(this.managers.dialogsStorage.getForumTopicOrReload(peerId, threadId));
    }

    this.noForwards = noForwards;
    this.isRestricted = isRestricted;
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
    this.starsAmount = starsAmount;

    if(this.selection) {
      this.selection.isScheduled = type === ChatType.Scheduled;
    }

    this.messagesStorageKey = `${this.peerId}_${this.type === ChatType.Scheduled ? 'scheduled' : 'history'}`;

    // this.container && this.container.classList.toggle('no-forwards', this.noForwards);

    if(!this.excludeParts.sharedMedia) {
      this.sharedMediaTab = appSidebarRight.createSharedMediaTab();
      this.sharedMediaTabs.push(this.sharedMediaTab);
      this.sharedMediaTab.setPeer(peerId, threadId);
    }

    this.input?.clearHelper(); // костыль
    this.selection?.cleanup(); // TODO: REFACTOR !!!!!!
  }

  public get requestHistoryOptionsPart(): RequestHistoryOptions {
    const options: RequestHistoryOptions = {
      peerId: this.peerId,
      threadId: this.threadId
    };

    CHAT_SEARCH_KEYS.forEach((key) => {
      // @ts-ignore
      options[key] = this[key];
    });

    if(this.hashtagType && this.hashtagType !== 'this') {
      options.peerId = NULL_PEER_ID;
      options.threadId = undefined;
    }

    return options;
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
      this.middlewareHelper.clean();
    } else if(this.setPeerPromise) {
      return;
    }

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
    const newKey = getHistoryStorageKey({
      type: getHistoryStorageType(requestHistoryOptionsPart),
      ...requestHistoryOptionsPart
    });
    this.changeHistoryStorageKey(newKey);

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

  private changeHistoryStorageKey(key: HistoryStorageKey) {
    if(this.historyStorageKey === key) {
      return;
    }

    if(this.historyStorageKey) {
      this.managers.appMessagesManager.toggleHistoryKeySubscription(this.historyStorageKey, false);
    }

    this.historyStorageKey = key;
    if(this.historyStorageKey) {
      this.managers.appMessagesManager.toggleHistoryKeySubscription(this.historyStorageKey, true);
    }
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

  public async setAutoDownloadMedia() {
    this.autoDownload = await getAutoDownloadSettingsByPeerId(this.peerId);
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

    const promises = [
      this.topbar?.finishPeerChange(options),
      this.bubbles?.finishPeerChange(),
      this.input?.finishPeerChange(options),
      sharedMediaTab?.fillProfileElements(),
      this.handleBackgrounds()
    ];

    const callbacksPromise = Promise.all(promises);

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
    return this.managers.appMessagesManager.getHistoryStorageTransferable({
      ...this.requestHistoryOptionsPart,
      threadId: ignoreThreadId ? undefined : this.threadId
    }).then((historyStorageTransferable) => {
      return {
        ...historyStorageTransferable,
        history: SlicedArray.fromJSON<number>(historyStorageTransferable.historySerialized),
        searchHistory: historyStorageTransferable.searchHistorySerialized && SlicedArray.fromJSON<string>(historyStorageTransferable.searchHistorySerialized)
      };
    });
  }

  public getDialogOrTopic() {
    return this.managers.dialogsStorage.getAnyDialog(this.peerId, (this.isForum || this.type === ChatType.Saved) && this.threadId);
  }

  public getHistoryMaxId() {
    return this.getHistoryStorage().then((historyStorage) => historyStorage.maxId);
  }

  // * used to define need of avatars
  public _isLikeGroup(peerId: PeerId) {
    return peerId === rootScope.myId ||
      peerId === REPLIES_PEER_ID ||
      (this.type === ChatType.Search && this.hashtagType !== 'this') ||
      this.managers.appPeersManager.isLikeGroup(peerId);
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
      if(!isBot) {
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
      updateStickersetOrder: rootScope.settings.stickers.dynamicPackOrder,
      ...(this.input && {
        ...(this.input.getReplyTo() || false),
        scheduleDate: this.input.scheduleDate,
        silent: this.input.sendSilent,
        sendAsPeerId: this.input.sendAsPeerId,
        effect: this.input.effect()
      }),
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

  public isAvatarNeeded(message: Message.message | Message.messageService) {
    return this.isLikeGroup && !this.isOutMessage(message);
  }

  public isPinnedMessagesNeeded() {
    return this.type === ChatType.Chat || this.isForum;
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
          peerId: this.peerId
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
}
