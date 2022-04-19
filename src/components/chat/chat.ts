/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppNotificationsManager } from "../../lib/appManagers/appNotificationsManager";
import type { AppChatsManager, ChatRights } from "../../lib/appManagers/appChatsManager";
import type { AppDocsManager } from "../../lib/appManagers/appDocsManager";
import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/appInlineBotsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { AppPollsManager } from "../../lib/appManagers/appPollsManager";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppWebPagesManager } from "../../lib/appManagers/appWebPagesManager";
import type { ApiManagerProxy } from "../../lib/mtproto/mtprotoworker";
import type { AppDraftsManager } from "../../lib/appManagers/appDraftsManager";
import type { AppEmojiManager } from "../../lib/appManagers/appEmojiManager";
import type { ServerTimeManager } from "../../lib/mtproto/serverTimeManager";
import type { AppMessagesIdsManager } from "../../lib/appManagers/appMessagesIdsManager";
import type { AppGroupCallsManager } from "../../lib/appManagers/appGroupCallsManager";
import type { AppReactionsManager } from "../../lib/appManagers/appReactionsManager";
import type stateStorage from '../../lib/stateStorage';
import EventListenerBase from "../../helpers/eventListenerBase";
import { logger, LogTypes } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import appSidebarRight from "../sidebarRight";
import ChatBubbles from "./bubbles";
import ChatContextMenu from "./contextMenu";
import ChatInput from "./input";
import ChatSelection from "./selection";
import ChatTopbar from "./topbar";
import { BOT_START_PARAM, NULL_PEER_ID, REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import SetTransition from "../singleTransition";
import AppPrivateSearchTab from "../sidebarRight/tabs/search";
import renderImageFromUrl, { renderImageFromUrlPromise } from "../../helpers/dom/renderImageFromUrl";
import mediaSizes from "../../helpers/mediaSizes";
import ChatSearch from "./search";
import { IS_TOUCH_SUPPORTED } from "../../environment/touchSupport";
import getAutoDownloadSettingsByPeerId, { ChatAutoDownloadSettings } from "../../helpers/autoDownload";
import ChatBackgroundGradientRenderer from "./gradientRenderer";
import ChatBackgroundPatternRenderer from "./patternRenderer";
import pause from "../../helpers/schedulers/pause";

export type ChatType = 'chat' | 'pinned' | 'replies' | 'discussion' | 'scheduled';

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
  // public renderDarkPattern: () => Promise<void>;
  
  constructor(
    public appImManager: AppImManager, 
    public appChatsManager: AppChatsManager, 
    public appDocsManager: AppDocsManager, 
    public appInlineBotsManager: AppInlineBotsManager, 
    public appMessagesManager: AppMessagesManager, 
    public appPeersManager: AppPeersManager, 
    public appPhotosManager: AppPhotosManager, 
    public appProfileManager: AppProfileManager, 
    public appStickersManager: AppStickersManager, 
    public appUsersManager: AppUsersManager, 
    public appWebPagesManager: AppWebPagesManager, 
    public appPollsManager: AppPollsManager, 
    public apiManager: ApiManagerProxy, 
    public appDraftsManager: AppDraftsManager, 
    public serverTimeManager: ServerTimeManager, 
    public storage: typeof stateStorage, 
    public appNotificationsManager: AppNotificationsManager,
    public appEmojiManager: AppEmojiManager,
    public appMessagesIdsManager: AppMessagesIdsManager,
    public appGroupCallsManager: AppGroupCallsManager,
    public appReactionsManager: AppReactionsManager
  ) {
    super();

    this.type = 'chat';

    this.container = document.createElement('div');
    this.container.classList.add('chat', 'tabs-tab');

    this.backgroundEl = document.createElement('div');
    this.backgroundEl.classList.add('chat-background');

    // * constructor end

    this.log = logger('CHAT', LogTypes.Log | LogTypes.Warn | LogTypes.Debug | LogTypes.Error);
    //this.log.error('Chat construction');

    this.peerId = NULL_PEER_ID;

    this.container.append(this.backgroundEl);
    this.appImManager.chatsContainer.append(this.container);

    this.backgroundTempId = 0;
  }

  public setBackground(url: string, skipAnimation?: boolean): Promise<void> {
    const theme = rootScope.getTheme();

    let item: HTMLElement;
    const isColorBackground = !!theme.background.color && !theme.background.slug && !theme.background.intensity;
    if(
      isColorBackground && 
      document.documentElement.style.cursor === 'grabbing' && 
      this.gradientRenderer && 
      !this.patternRenderer
    ) {
      this.gradientCanvas.dataset.colors = theme.background.color;
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

    const intensity = theme.background.intensity && theme.background.intensity / 100;
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
          //     return patternRenderer.exportCanvasPatternToImage(patternCanvas).then(url => {
          //       if(this.backgroundTempId !== tempId) {
          //         return;
          //       }
                
          //       gradientCanvas.style.webkitMaskImage = `url(${url})`;
          //     });
          //   };
          // }
        } else if(theme.background.slug) {
          item.classList.add('is-image');
        }
      } else if(theme.background.color) {
        item.classList.add('is-color');
      }
    }

    let gradientRenderer: ChatBackgroundGradientRenderer;
    const color = theme.background.color;
    if(color) {
      // if(color.includes(',')) {
      const {canvas, gradientRenderer: _gradientRenderer} = ChatBackgroundGradientRenderer.create(color);
      gradientRenderer = this.gradientRenderer = _gradientRenderer;
      gradientCanvas = this.gradientCanvas = canvas;
      gradientCanvas.classList.add('chat-background-item-canvas', 'chat-background-item-color-canvas');

      if(rootScope.settings.animationsEnabled) {
        gradientRenderer.scrollAnimate(true);
      }
      // } else {
      //   item.style.backgroundColor = color;
      //   item.style.backgroundImage = 'none';
      // }
    }

    if(patternRenderer) {
      const setOpacityTo = isDarkPattern ? gradientCanvas : patternCanvas;
      setOpacityTo.style.setProperty('--opacity-max', '' + Math.abs(intensity));
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

        SetTransition(item, 'is-visible', true, !skipAnimation ? 200 : 0, prev ? () => {
          if(previousPatternRenderer) {
            previousPatternRenderer.cleanup(previousPatternCanvas);
          }

          if(previousGradientRenderer) {
            previousGradientRenderer.cleanup();
          }

          prev.remove();
        } : null, 2);

        resolve();
      };

      if(patternRenderer) {
        const renderPatternPromise = patternRenderer.renderToCanvas(patternCanvas);
        renderPatternPromise.then(() => {
          if(this.backgroundTempId !== tempId) {
            return;
          }

          let promise: Promise<any>;
          // if(isDarkPattern && this.renderDarkPattern) {
          //   promise = this.renderDarkPattern();
          // } else {
            promise = Promise.resolve();
          // }
          
          promise.then(cb);
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

    if(this.type === 'scheduled') {
      this.getMessagesStorage = () => this.appMessagesManager.getScheduledMessagesStorage(this.peerId);
      //this.getMessage = (mid) => this.appMessagesManager.getMessageFromStorage(this.appMessagesManager.getScheduledMessagesStorage(this.peerId), mid);
    }
  }

  public init(/* peerId: PeerId */) {
    // this.initPeerId = peerId;

    this.topbar = new ChatTopbar(this, appSidebarRight, this.appMessagesManager, this.appPeersManager, this.appChatsManager, this.appNotificationsManager, this.appProfileManager, this.appUsersManager, this.appGroupCallsManager);
    this.bubbles = new ChatBubbles(this, this.appMessagesManager, this.appStickersManager, this.appUsersManager, this.appInlineBotsManager, this.appPhotosManager, this.appPeersManager, this.appProfileManager, this.appDraftsManager, this.appMessagesIdsManager, this.appChatsManager, this.appReactionsManager, this.appWebPagesManager);
    this.input = new ChatInput(this, this.appMessagesManager, this.appMessagesIdsManager, this.appDocsManager, this.appChatsManager, this.appPeersManager, this.appWebPagesManager, this.appImManager, this.appDraftsManager, this.serverTimeManager, this.appNotificationsManager, this.appEmojiManager, this.appUsersManager, this.appInlineBotsManager, this.appProfileManager);
    this.selection = new ChatSelection(this, this.bubbles, this.input, this.appMessagesManager);
    this.contextMenu = new ChatContextMenu(this.bubbles.bubblesContainer, this, this.appMessagesManager, this.appPeersManager, this.appPollsManager, this.appDocsManager, this.appMessagesIdsManager, this.appReactionsManager);

    if(this.type === 'chat') {
      this.topbar.constructUtils();
      this.topbar.constructPeerHelpers();
    } else if(this.type === 'pinned') {
      this.topbar.constructPinnedHelpers();
    } else if(this.type === 'discussion') {
      this.topbar.constructUtils();
      this.topbar.constructDiscussionHelpers();
    }

    this.topbar.construct();
    this.input.construct();

    if(this.type === 'chat') { // * гений в деле, разный порядок из-за разной последовательности действий
      this.bubbles.constructPeerHelpers();
      this.input.constructPeerHelpers();
    } else if(this.type === 'pinned') {
      this.bubbles.constructPinnedHelpers();
      this.input.constructPinnedHelpers();
    } else if(this.type === 'scheduled') {
      this.bubbles.constructScheduledHelpers();
      this.input.constructPeerHelpers();
    } else if(this.type === 'discussion') {
      this.bubbles.constructPeerHelpers();
      this.input.constructPeerHelpers();
    }

    if(this.type !== 'scheduled' && !IS_TOUCH_SUPPORTED) {
      this.bubbles.setReactionsHoverListeners();
    }

    this.container.classList.add('type-' + this.type);
    this.container.append(this.topbar.container, this.bubbles.bubblesContainer, this.input.chatInput);

    this.bubbles.listenerSetter.add(rootScope)('dialog_migrate', ({migrateFrom, migrateTo}) => {
      if(this.peerId === migrateFrom) {
        this.setPeer(migrateTo);
      }
    });

    this.bubbles.listenerSetter.add(rootScope)('dialog_drop', (e) => {
      if(e.peerId === this.peerId) {
        this.appImManager.setPeer();
      }
    });
  }

  public beforeDestroy() {
    this.bubbles.cleanup();
  }

  private cleanupBackground() {
    ++this.backgroundTempId;
    if(this.patternRenderer) {
      this.patternRenderer.cleanup(this.patternCanvas);
      this.patternRenderer = undefined;
    }

    if(this.gradientRenderer) {
      this.gradientRenderer.cleanup();
      this.gradientRenderer = undefined;
    }
  }

  public destroy() {
    //const perf = performance.now();

    this.topbar.destroy();
    this.bubbles.destroy();
    this.input.destroy();
    this.contextMenu && this.contextMenu.destroy();

    this.cleanupBackground();

    delete this.topbar;
    delete this.bubbles;
    delete this.input;
    delete this.selection;
    delete this.contextMenu;

    this.container.remove();

    //this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup(helperToo = true) {
    this.input.cleanup(helperToo);
    this.selection.cleanup();
  }

  public setPeer(peerId: PeerId, lastMsgId?: number, startParam?: string) {
    if(!peerId) {
      this.inited = undefined;
    } else if(!this.inited) {
      if(this.init) {
        this.init(/* peerId */);
        this.init = null;
      }

      this.inited = true;
    }

    const samePeer = this.peerId === peerId;
    if(!samePeer) {
      rootScope.dispatchEvent('peer_changing', this);
      this.peerId = peerId || NULL_PEER_ID;
    } else if(this.setPeerPromise) {
      return;
    }

    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(!peerId) {
      appSidebarRight.toggleSidebar(false);
      this.cleanup(true);
      this.topbar.setPeer(peerId);
      this.bubbles.setPeer(peerId);
      rootScope.dispatchEvent('peer_changed', peerId);

      return;
    }

    // set new
    if(!samePeer) {
      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      if(searchTab) {
        searchTab.close();
      }

      this.noForwards = this.appPeersManager.noForwards(peerId);
      this.isRestricted = this.appPeersManager.isRestricted(peerId);
      this.container.classList.toggle('no-forwards', this.noForwards);

      appSidebarRight.sharedMediaTab.setPeer(peerId, this.threadId);
      this.input.clearHelper(); // костыль
      this.selection.cleanup(); // TODO: REFACTOR !!!!!!
      this.setAutoDownloadMedia();
    }

    this.peerChanged = samePeer;

    if(startParam === undefined && this.isStartButtonNeeded()) {
      startParam = BOT_START_PARAM;
    }

    const result = this.bubbles.setPeer(peerId, lastMsgId, startParam);
    if(!result) {
      return;
    }

    const {promise} = result;

    //console.timeEnd('appImManager setPeer pre promise');
    
    const setPeerPromise = this.setPeerPromise = promise.finally(() => {
      if(this.setPeerPromise === setPeerPromise) {
        this.setPeerPromise = null;
      }
    });

    if(!samePeer) {
      appSidebarRight.sharedMediaTab.setLoadMutex(this.setPeerPromise);
      appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
    }
    /* this.setPeerPromise.then(() => {
      appSidebarRight.sharedMediaTab.loadSidebarMedia(false);
    }); */

    return result;
  }

  public setAutoDownloadMedia() {
    this.autoDownload = getAutoDownloadSettingsByPeerId(this.peerId);
  }

  public setMessageId(messageId?: number) {
    return this.setPeer(this.peerId, messageId);
  }

  public finishPeerChange(isTarget: boolean, isJump: boolean, lastMsgId: number, startParam?: string) {
    if(this.peerChanged) return;

    let peerId = this.peerId;
    this.peerChanged = true;

    this.cleanup(false);

    this.topbar.setPeer(peerId);
    this.topbar.finishPeerChange(isTarget, isJump, lastMsgId);
    this.bubbles.finishPeerChange();
    this.input.finishPeerChange(startParam);

    appSidebarRight.sharedMediaTab.fillProfileElements();

    this.log.setPrefix('CHAT-' + peerId + '-' + this.type);

    rootScope.dispatchEvent('peer_changed', peerId);
    this.wasAlreadyUsed = true;
  }

  public getMessagesStorage() {
    return this.appMessagesManager.getMessagesStorage(this.peerId);
  }

  public getMessage(mid: number) {
    return this.appMessagesManager.getMessageFromStorage(this.getMessagesStorage(), mid);
    //return this.appMessagesManager.getMessageByPeer(this.peerId, mid);
  }

  public getMidsByMid(mid: number) {
    return this.appMessagesManager.getMidsByMessage(this.getMessage(mid));
  }

  public isAnyGroup() {
    return this.peerId === rootScope.myId || this.peerId === REPLIES_PEER_ID || this.appPeersManager.isAnyGroup(this.peerId);
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
      if(!tab) {
        tab = new AppPrivateSearchTab(appSidebarRight);
      }

      tab.open(this.peerId, this.threadId, this.bubbles.onDatePick, query);
    }
  }

  public canSend(action?: ChatRights) {
    return this.appMessagesManager.canSendToPeer(this.peerId, this.threadId, action);
  }

  public isStartButtonNeeded() {
    return this.appPeersManager.isBot(this.peerId) && 
      !this.appMessagesManager.getDialogOnly(this.peerId) && 
      !this.appMessagesManager.getHistoryStorage(this.peerId).history.length;
  }

  public getMessageSendingParams() {
    return {
      threadId: this.threadId,
      replyToMsgId: this.input.replyToMsgId,
      scheduleDate: this.input.scheduleDate,
      sendSilent: this.input.sendSilent,
      sendAsPeerId: this.input.sendAsPeerId
    };
  }
}
