//import apiManager from '../mtproto/apiManager';
import animationIntersector from '../../components/animationIntersector';
import { horizontalMenu } from '../../components/horizontalMenu';
import appSidebarLeft from "../../components/sidebarLeft";
import appSidebarRight, { AppSidebarRight, RIGHT_COLUMN_ACTIVE_CLASSNAME } from '../../components/sidebarRight';
import mediaSizes, { ScreenSize } from '../../helpers/mediaSizes';
import { logger, LogLevels } from "../logger";
import apiManager from '../mtproto/mtprotoworker';
import { MOUNT_CLASS_TO } from '../mtproto/mtproto_config';
import rootScope from '../rootScope';
import apiUpdatesManager from './apiUpdatesManager';
import appUsersManager from "./appUsersManager";
import Chat, { ChatType } from '../../components/chat/chat';
import appChatsManager from './appChatsManager';
import appDocsManager from './appDocsManager';
import appInlineBotsManager from './AppInlineBotsManager';
import appMessagesManager from './appMessagesManager';
import appPeersManager from './appPeersManager';
import appPhotosManager from './appPhotosManager';
import appProfileManager from './appProfileManager';
import appStickersManager from './appStickersManager';
import appWebPagesManager from './appWebPagesManager';
import { cancelEvent, placeCaretAtEnd } from '../../helpers/dom';
import PopupNewMedia from '../../components/popupNewMedia';
import { TransitionSlider } from '../../components/transition';
import { numberWithCommas } from '../../helpers/number';
import MarkupTooltip from '../../components/chat/markupTooltip';
import { isTouchSupported } from '../../helpers/touchSupport';
import appPollsManager from './appPollsManager';

//console.log('appImManager included33!');

appSidebarLeft; // just to include

const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export const CHAT_ANIMATION_GROUP = 'chat';

export class AppImManager {
  public columnEl = document.getElementById('column-center') as HTMLDivElement;
  public chatsContainer: HTMLElement;

  public chatsSelectTab: ReturnType<typeof horizontalMenu>;

  public offline = false;
  public updateStatusInterval = 0;

  public log: ReturnType<typeof logger>;

  public setPeerPromise: Promise<void> = null;

  private mainColumns: HTMLElement;
  public _selectTab: ReturnType<typeof horizontalMenu>;
  public tabID = -1;
  //private closeBtn: HTMLButtonElement;// = this.topbar.querySelector('.sidebar-close-button') as HTMLButtonElement;
  public hideRightSidebar = false;
  
  private chats: Chat[] = [];

  public markupTooltip: MarkupTooltip;

  get myID() {
    return rootScope.myID;
  }

  get chat(): Chat {
    return this.chats[this.chats.length - 1];
  }

  constructor() {
    apiUpdatesManager.attach();

    this.log = logger('IM', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);

    this.mainColumns = this.columnEl.parentElement;
    this._selectTab = horizontalMenu(null, this.mainColumns);
    this.selectTab(0);
    
    window.addEventListener('blur', () => {
      animationIntersector.checkAnimations(true);
      
      this.offline = rootScope.idle.isIDLE = true;
      this.updateStatus();
      clearInterval(this.updateStatusInterval);
      
      window.addEventListener('focus', () => {
        this.offline = rootScope.idle.isIDLE = false;
        this.updateStatus();
        this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);

        // в обратном порядке
        animationIntersector.checkAnimations(false);
      }, {once: true});
    });
    
    /* this.closeBtn.addEventListener('click', (e) => {
      cancelEvent(e);

      if(mediaSizes.isMobile) {
        //this.setPeer(0);
        this.selectTab(0);
      } else {
        const isNowOpen = document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME);

        if(isNowOpen && document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
          appSidebarRight.toggleSidebar(false, false);
          this.hideRightSidebar = isNowOpen;
        } else if(this.hideRightSidebar) {
          appSidebarRight.toggleSidebar(true);
        }
      }
    }); */
    
    this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
    this.updateStatus();

    this.chatsContainer = document.createElement('div');
    this.chatsContainer.classList.add('chats-container', 'tabs-container');

    this.chatsSelectTab = TransitionSlider(this.chatsContainer, 'navigation', 250, (id) => {

    });
    
    this.columnEl.append(this.chatsContainer);
    
    this.createNewChat();
    this.chatsSelectTab(0);

    //apiUpdatesManager.attach();
  }

  private init() {
    document.addEventListener('paste', this.onDocumentPaste, true);
    
    const onKeyDown = (e: KeyboardEvent) => {
      if(rootScope.overlayIsActive) return;
      
      const target = e.target as HTMLElement;
      
      //if(target.tagName == 'INPUT') return;
      
      //this.log('onkeydown', e, document.activeElement);

      const chat = this.chat;

      if(e.key == 'Escape') {
        let cancel = true;
        if(this.markupTooltip?.container?.classList.contains('is-visible')) {
          this.markupTooltip.hide();
        } else if(chat.selection.isSelecting) {
          chat.selection.cancelSelection();
        } else if(chat.container.classList.contains('is-helper-active')) {
          chat.input.replyElements.cancelBtn.click();
        } else if(chat.peerID != 0) { // hide current dialog
          this.setPeer(0);
        } else {
          cancel = false;
        }

        // * cancel event for safari, because if application is in fullscreen, browser will try to exit fullscreen
        if(cancel) {
          cancelEvent(e);
        }
      } else if(e.key == 'Meta' || e.key == 'Control') {
        return;
      } else if(e.code == "KeyC" && (e.ctrlKey || e.metaKey) && target.tagName != 'INPUT') {
        return;
      } else if(e.code == 'ArrowUp') {
        if(!chat.input.editMsgID) {
          const history = appMessagesManager.historiesStorage[chat.peerID];
          if(history?.history) {
            let goodMid: number;
            for(const mid of history.history) {
              const message = appMessagesManager.getMessage(mid);
              const good = this.myID == chat.peerID ? message.fromID == this.myID : message.pFlags.out;

              if(good) {
                if(appMessagesManager.canEditMessage(mid, 'text')) {
                  goodMid = mid;
                }

                break;
              }
            }
  
            if(goodMid) {
              chat.input.initMessageEditing(goodMid);
              cancelEvent(e); // * prevent from scrolling
            }
          }
        }
      }
      
      if(chat.input.messageInput && e.target != chat.input.messageInput && target.tagName != 'INPUT' && !target.hasAttribute('contenteditable')) {
        chat.input.messageInput.focus();
        placeCaretAtEnd(chat.input.messageInput);
      }
    };
    
    document.body.addEventListener('keydown', onKeyDown);

    if(!isTouchSupported) {
      this.markupTooltip = new MarkupTooltip(this);
      this.markupTooltip.handleSelection();
    }
  }

  private onDocumentPaste = (e: ClipboardEvent) => {
    const peerID = this.chat?.peerID;
    if(!peerID || rootScope.overlayIsActive || (peerID < 0 && !appChatsManager.hasRights(peerID, 'send', 'send_media'))) {
      return;
    }

    //console.log('document paste');

    // @ts-ignore
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    //console.log('item', event.clipboardData.getData());
    //let foundFile = false;
    const chatInput = this.chat.input;
    for(let i = 0; i < items.length; ++i) {
      if(items[i].kind == 'file') {
        e.preventDefault()
        e.cancelBubble = true;
        e.stopPropagation();
        //foundFile = true;

        let file = items[i].getAsFile();
        //console.log(items[i], file);
        if(!file) continue;

        chatInput.willAttachType = file.type.indexOf('image/') === 0 ? 'media' : "document";
        new PopupNewMedia([file], chatInput.willAttachType);
      }
    }
  };

  public selectTab(id: number) {
    document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME, id == 0);

    const prevTabID = this.tabID;
    this.tabID = id;
    if(mediaSizes.isMobile && prevTabID == 2 && id == 1) {
      //appSidebarRight.toggleSidebar(false);
      document.body.classList.remove(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    }

    this._selectTab(id, mediaSizes.isMobile);
    //document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, id == 2);
  }
  
  public updateStatus() {
    if(!this.myID) return Promise.resolve();
    
    appUsersManager.setUserStatus(this.myID, this.offline);
    return apiManager.invokeApi('account.updateStatus', {offline: this.offline});
  }

  private createNewChat() {
    const chat = new Chat(this, appChatsManager, appDocsManager, appInlineBotsManager, appMessagesManager, appPeersManager, appPhotosManager, appProfileManager, appStickersManager, appUsersManager, appWebPagesManager, appSidebarRight, appPollsManager);

    this.chats.push(chat);
  }

  private spliceChats(fromIndex: number, justReturn = true) {
    if(fromIndex >= this.chats.length) return;

    const spliced = this.chats.splice(fromIndex, this.chats.length - fromIndex);

    this.chatsSelectTab(this.chat.container);

    if(justReturn) {
      rootScope.broadcast('peer_changed', this.chat.peerID);

      if(appSidebarRight.historyTabIDs[appSidebarRight.historyTabIDs.length - 1] == AppSidebarRight.SLIDERITEMSIDS.search) {
        appSidebarRight.searchTab.closeBtn?.click();
      }
  
      appSidebarRight.sharedMediaTab.setPeer(this.chat.peerID);
      appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
      appSidebarRight.sharedMediaTab.fillProfileElements();
    }
    
    setTimeout(() => {
      //chat.setPeer(0);
      spliced.forEach(chat => {
        chat.destroy();
      });
    }, 250);
  }

  public setPeer(peerID: number, lastMsgID?: number): boolean {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const chat = this.chat;
    const chatIndex = this.chats.indexOf(chat);

    if(!peerID) {
      if(chatIndex > 0) {
        this.spliceChats(chatIndex);
        return;
      } else if(mediaSizes.activeScreen == ScreenSize.medium) { // * floating sidebar case
        const isNowOpen = document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME);

        if(isNowOpen && document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
          appSidebarRight.toggleSidebar(false, false);
          this.hideRightSidebar = isNowOpen;
        } else if(this.hideRightSidebar) {
          appSidebarRight.toggleSidebar(true);
        }

        return;
      }
    } else if(chatIndex > 0 && chat.peerID && chat.peerID != peerID) {
      this.spliceChats(1, false);
      return this.setPeer(peerID, lastMsgID);
    }

    if(peerID || mediaSizes.activeScreen != ScreenSize.mobile) {
      chat.setPeer(peerID, lastMsgID);
    }

    if(peerID == 0) {
      this.selectTab(0);
      
      document.body.classList.add(LEFT_COLUMN_ACTIVE_CLASSNAME);
      return false;
    }

    document.body.classList.remove(LEFT_COLUMN_ACTIVE_CLASSNAME);
    if(this.hideRightSidebar) {
      appSidebarRight.toggleSidebar(true);
      this.hideRightSidebar = false;
    }

    this.selectTab(1);
  }

  public setInnerPeer(peerID: number, lastMsgID?: number, type: ChatType = 'chat') {
    // * prevent opening already opened peer
    const existingIndex = this.chats.findIndex(chat => chat.peerID == peerID && chat.type == type);
    if(existingIndex !== -1) {
      this.spliceChats(existingIndex + 1);
      return this.setPeer(peerID, lastMsgID);
    }

    this.createNewChat();

    if(type) {
      this.chat.type = type;
    }

    this.chatsSelectTab(this.chat.container);

    return this.setPeer(peerID, lastMsgID);
  }

  public async getPeerStatus(peerID: number) {
    let subtitle = '';
    if(!peerID) return subtitle;

    if(peerID < 0) { // not human
      const chat = appPeersManager.getPeer(peerID);
      const isChannel = appPeersManager.isChannel(peerID) && !appPeersManager.isMegagroup(peerID);

      const chatInfo = await appProfileManager.getChatFull(chat.id) as any;
      this.chat.log('chatInfo res:', chatInfo);

      const participants_count = chatInfo.participants_count || (chatInfo.participants && chatInfo.participants.participants && chatInfo.participants.participants.length);
      if(participants_count) {
        subtitle = numberWithCommas(participants_count) + ' ' + (isChannel ? 'followers' : 'members');

        if(participants_count < 2) return subtitle;
        const onlines = await appChatsManager.getOnlines(chat.id);
        if(onlines > 1) {
          subtitle += ', ' + numberWithCommas(onlines) + ' online';
        }
  
        return subtitle;
      }
    } else if(!appUsersManager.isBot(peerID)) { // user
      const user = appUsersManager.getUser(peerID);
      
      if(rootScope.myID == peerID) {
        return '';
      } else if(user) {
        subtitle = appUsersManager.getUserStatusString(user.id);

        const typings = appChatsManager.typingsInPeer[peerID];
        if(typings && typings.length) {
          return '<span class="online">typing...</span>';
        } else if(subtitle == 'online') {
          return `<span class="online">${subtitle}</span>`;
        } else {
          return subtitle;
        }
      }
    } else {
      return 'bot';
    }
  }
}

const appImManager = new AppImManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appImManager = appImManager);
export default appImManager;
