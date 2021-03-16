import type { AppNotificationsManager } from "../../lib/appManagers/appNotificationsManager";
import type { AppChatsManager } from "../../lib/appManagers/appChatsManager";
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
import type { ServerTimeManager } from "../../lib/mtproto/serverTimeManager";
import type sessionStorage from '../../lib/sessionStorage';
import EventListenerBase from "../../helpers/eventListenerBase";
import { logger, LogLevels } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import appSidebarRight, { AppSidebarRight } from "../sidebarRight";
import ChatBubbles from "./bubbles";
import ChatContextMenu from "./contextMenu";
import ChatInput from "./input";
import ChatSelection from "./selection";
import ChatTopbar from "./topbar";
import { REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { renderImageFromUrl } from "../misc";
import SetTransition from "../singleTransition";
import { fastRaf } from "../../helpers/schedulers";
import AppPrivateSearchTab from "../sidebarRight/tabs/search";
import type { State } from "../../lib/appManagers/appStateManager";

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

  public wasAlreadyUsed = false;
  public initPeerId = 0;
  public peerId = 0;
  public threadId: number;
  public setPeerPromise: Promise<void>;
  public peerChanged: boolean;

  public log: ReturnType<typeof logger>;

  public type: ChatType = 'chat';

  public noAutoDownloadMedia: boolean;
  
  constructor(public appImManager: AppImManager, public appChatsManager: AppChatsManager, public appDocsManager: AppDocsManager, public appInlineBotsManager: AppInlineBotsManager, public appMessagesManager: AppMessagesManager, public appPeersManager: AppPeersManager, public appPhotosManager: AppPhotosManager, public appProfileManager: AppProfileManager, public appStickersManager: AppStickersManager, public appUsersManager: AppUsersManager, public appWebPagesManager: AppWebPagesManager, public appPollsManager: AppPollsManager, public apiManager: ApiManagerProxy, public appDraftsManager: AppDraftsManager, public serverTimeManager: ServerTimeManager, public storage: typeof sessionStorage, public appNotificationsManager: AppNotificationsManager) {
    super();

    this.container = document.createElement('div');
    this.container.classList.add('chat');

    this.backgroundEl = document.createElement('div');
    this.backgroundEl.classList.add('chat-background');

    // * constructor end

    this.log = logger('CHAT', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);
    //this.log.error('Chat construction');

    this.container.append(this.backgroundEl);
    this.appImManager.chatsContainer.append(this.container);
  }

  public setBackground(url: string): Promise<void> {
    const item = document.createElement('div');
    item.classList.add('chat-background-item');

    return new Promise<void>((resolve) => {
      const cb = () => {
        const prev = this.backgroundEl.children[this.backgroundEl.childElementCount - 1] as HTMLElement;
        this.backgroundEl.append(item);

        // * одного недостаточно, при обновлении страницы все равно фон появляется неплавно
        // ! с requestAnimationFrame лучше, но все равно иногда моргает, так что использую два фаста.
        fastRaf(() => {
          fastRaf(() => {
            SetTransition(item, 'is-visible', true, 200, prev ? () => {
              prev.remove();
            } : null);
          });
        });

        resolve();
      };

      if(url) {
        renderImageFromUrl(item, url, cb);
      } else {
        cb();
      }
    });
  }

  public setType(type: ChatType) {
    this.type = type;

    if(this.type === 'scheduled') {
      this.getMessagesStorage = () => this.appMessagesManager.getScheduledMessagesStorage(this.peerId);
      //this.getMessage = (mid) => this.appMessagesManager.getMessageFromStorage(this.appMessagesManager.getScheduledMessagesStorage(this.peerId), mid);
    }
  }

  public init(peerId: number) {
    this.initPeerId = peerId;

    this.topbar = new ChatTopbar(this, appSidebarRight, this.appMessagesManager, this.appPeersManager, this.appChatsManager, this.appNotificationsManager);
    this.bubbles = new ChatBubbles(this, this.appMessagesManager, this.appStickersManager, this.appUsersManager, this.appInlineBotsManager, this.appPhotosManager, this.appDocsManager, this.appPeersManager, this.appChatsManager, this.storage);
    this.input = new ChatInput(this, this.appMessagesManager, this.appDocsManager, this.appChatsManager, this.appPeersManager, this.appWebPagesManager, this.appImManager, this.appDraftsManager, this.serverTimeManager, this.appNotificationsManager);
    this.selection = new ChatSelection(this, this.bubbles, this.input, this.appMessagesManager);
    this.contextMenu = new ChatContextMenu(this.bubbles.bubblesContainer, this, this.appMessagesManager, this.appChatsManager, this.appPeersManager, this.appPollsManager);

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

    this.container.classList.add('type-' + this.type);
    this.container.append(this.topbar.container, this.bubbles.bubblesContainer, this.input.chatInput);

    this.bubbles.listenerSetter.add(rootScope, 'dialog_migrate', ({migrateFrom, migrateTo}) => {
      if(this.peerId === migrateFrom) {
        this.setPeer(migrateTo);
      }
    });

    this.bubbles.listenerSetter.add(rootScope, 'dialog_drop', (e) => {
      if(e.peerId === this.peerId) {
        this.appImManager.setPeer(0);
      }
    });
  }

  public destroy() {
    //const perf = performance.now();

    this.topbar.destroy();
    this.bubbles.destroy();
    this.input.destroy();

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

  public setPeer(peerId: number, lastMsgId?: number) {
    if(this.init) {
      this.init(peerId);
      this.init = null;
    }

    const samePeer = this.peerId === peerId;
    if(!samePeer) {
      rootScope.broadcast('peer_changing', this);
      this.peerId = peerId;
    }

    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(!peerId) {
      appSidebarRight.toggleSidebar(false);
      this.cleanup(true);
      this.topbar.setPeer(peerId);
      this.bubbles.setPeer(peerId);
      rootScope.broadcast('peer_changed', peerId);

      return;
    }

    // set new
    if(!samePeer) {
      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      if(searchTab) {
        searchTab.close();
      }

      appSidebarRight.sharedMediaTab.setPeer(peerId, this.threadId);
      this.input.clearHelper(); // костыль
      this.selection.cleanup(); // TODO: REFACTOR !!!!!!
      this.setAutoDownloadMedia();
    }

    this.peerChanged = samePeer;

    const result = this.bubbles.setPeer(peerId, lastMsgId);
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

    appSidebarRight.sharedMediaTab.setLoadMutex(this.setPeerPromise);
    appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
    /* this.setPeerPromise.then(() => {
      appSidebarRight.sharedMediaTab.loadSidebarMedia(false);
    }); */

    return result;
  }

  public setAutoDownloadMedia() {
    let type: keyof State['settings']['autoDownload'];
    if(this.peerId < 0) {
      if(this.appPeersManager.isBroadcast(this.peerId)) {
        type = 'channels';
      } else {
        type = 'groups';
      }
    } else {
      if(this.appUsersManager.isContact(this.peerId)) {
        type = 'contacts';
      } else {
        type = 'private';
      }
    }

    this.noAutoDownloadMedia = !rootScope.settings.autoDownload[type];
  }

  public setMessageId(messageId?: number) {
    return this.setPeer(this.peerId, messageId);
  }

  public finishPeerChange(isTarget: boolean, isJump: boolean, lastMsgId: number) {
    if(this.peerChanged) return;

    let peerId = this.peerId;
    this.peerChanged = true;

    this.cleanup(false);

    this.topbar.setPeer(peerId);
    this.topbar.finishPeerChange(isTarget, isJump, lastMsgId);
    this.bubbles.finishPeerChange();
    this.input.finishPeerChange();

    appSidebarRight.sharedMediaTab.fillProfileElements();

    this.log.setPrefix('CHAT-' + peerId + '-' + this.type);

    rootScope.broadcast('peer_changed', peerId);
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
}