import type { AppChatsManager } from "../../lib/appManagers/appChatsManager";
import type { AppDocsManager } from "../../lib/appManagers/appDocsManager";
import type { AppImManager } from "../../lib/appManagers/appImManager";
import type { AppInlineBotsManager } from "../../lib/appManagers/AppInlineBotsManager";
import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type { AppPhotosManager } from "../../lib/appManagers/appPhotosManager";
import type { AppPollsManager } from "../../lib/appManagers/appPollsManager";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppStickersManager } from "../../lib/appManagers/appStickersManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { AppWebPagesManager } from "../../lib/appManagers/appWebPagesManager";
import { logger, LogLevels } from "../../lib/logger";
import rootScope from "../../lib/rootScope";
import appSidebarRight, { AppSidebarRight } from "../sidebarRight";
import ChatBubbles from "./bubbles";
import ChatContextMenu from "./contextMenu";
import ChatInput from "./input";
import ChatSelection from "./selection";
import ChatTopbar from "./topbar";

export default class Chat {
  public container: HTMLElement;
  public backgroundEl: HTMLElement;

  public topbar: ChatTopbar;
  public bubbles: ChatBubbles;
  public input: ChatInput;
  public selection: ChatSelection;
  public contextMenu: ChatContextMenu;

  public peerID = 0;
  public setPeerPromise: Promise<void>;
  public peerChanged: boolean;

  public log: ReturnType<typeof logger>; 
  
  constructor(public appImManager: AppImManager, private appChatsManager: AppChatsManager, private appDocsManager: AppDocsManager, private appInlineBotsManager: AppInlineBotsManager, private appMessagesManager: AppMessagesManager, private appPeersManager: AppPeersManager, private appPhotosManager: AppPhotosManager, private appProfileManager: AppProfileManager, private appStickersManager: AppStickersManager, private appUsersManager: AppUsersManager, private appWebPagesManager: AppWebPagesManager, private appSidebarRight: AppSidebarRight, private appPollsManager: AppPollsManager) {
    this.container = document.createElement('div');
    this.container.classList.add('chat');

    this.backgroundEl = document.createElement('div');
    this.backgroundEl.classList.add('chat-background');

    // * constructor end

    this.log = logger('CHAT', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);
    this.log.error('Chat construction');

    this.container.append(this.backgroundEl);
    this.appImManager.chatsContainer.append(this.container);
  }

  private init() {
    this.topbar = new ChatTopbar(this, appSidebarRight, this.appMessagesManager, this.appPeersManager, this.appChatsManager, this.appUsersManager, this.appProfileManager);
    this.bubbles = new ChatBubbles(this, this.appMessagesManager, this.appSidebarRight, this.appStickersManager, this.appUsersManager, this.appInlineBotsManager, this.appPhotosManager, this.appDocsManager, this.appPeersManager, this.appChatsManager);
    this.input = new ChatInput(this, this.appMessagesManager, this.appDocsManager, this.appChatsManager, this.appPeersManager, this.appWebPagesManager, this.appImManager);
    this.selection = new ChatSelection(this.bubbles, this.input, this.appMessagesManager);
    this.contextMenu = new ChatContextMenu(this.bubbles.bubblesContainer, this, this.appMessagesManager, this.appChatsManager, this.appPeersManager, this.appPollsManager);

    this.container.append(this.topbar.container, this.bubbles.bubblesContainer, this.input.chatInput);
  }

  public destroy() {
    const perf = performance.now();

    this.topbar.destroy();
    this.bubbles.destroy();
    this.input.destroy();

    delete this.topbar;
    delete this.bubbles;
    delete this.input;
    delete this.selection;
    delete this.contextMenu;

    this.container.remove();

    this.log.error('Chat destroy time:', performance.now() - perf);
  }

  public cleanup() {
    this.input.cleanup();
    this.selection.cleanup();

    this.peerChanged = false;
  }

  public setPeer(peerID: number, lastMsgID?: number) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    //console.time('appImManager setPeer');
    //console.time('appImManager setPeer pre promise');
    ////console.time('appImManager: pre render start');
    if(peerID == 0) {
      appSidebarRight.toggleSidebar(false);
      this.peerID = peerID;
      this.cleanup();
      this.topbar.setPeer(peerID);
      this.bubbles.setPeer(peerID);
      rootScope.broadcast('peer_changed', peerID);

      return;
    }

    const samePeer = this.peerID == peerID;

    // set new
    if(!samePeer) {
      if(appSidebarRight.historyTabIDs[appSidebarRight.historyTabIDs.length - 1] == AppSidebarRight.SLIDERITEMSIDS.search) {
        appSidebarRight.searchTab.closeBtn?.click();
      }

      this.peerID = peerID;
      appSidebarRight.sharedMediaTab.setPeer(peerID);
      this.cleanup();
    } else {
      this.peerChanged = true;
    }

    const result = this.bubbles.setPeer(peerID, lastMsgID);
    if(!result) {
      return;
    }

    const {cached, promise} = result;

    // clear 
    if(!cached) {
      if(!samePeer) {
        this.finishPeerChange();
      }
    }
    
    //console.timeEnd('appImManager setPeer pre promise');
    
    this.setPeerPromise = promise.then(() => {
      if(cached) {
        if(!samePeer) {
          this.finishPeerChange();
        }
      }
    }).finally(() => {
      if(this.peerID == peerID) {
        this.setPeerPromise = null;
      }
    });

    appSidebarRight.sharedMediaTab.setLoadMutex(this.setPeerPromise);
    appSidebarRight.sharedMediaTab.loadSidebarMedia(true);

    return this.setPeerPromise;
  }

  public finishPeerChange() {
    if(this.peerChanged) return;

    let peerID = this.peerID;
    this.peerChanged = true;

    this.topbar.setPeer(peerID);
    this.bubbles.finishPeerChange();
    this.input.finishPeerChange();

    appSidebarRight.sharedMediaTab.fillProfileElements();

    rootScope.broadcast('peer_changed', this.peerID);
  }
}