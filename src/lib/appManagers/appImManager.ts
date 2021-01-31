//import apiManager from '../mtproto/apiManager';
import animationIntersector from '../../components/animationIntersector';
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
import appInlineBotsManager from './appInlineBotsManager';
import appMessagesManager from './appMessagesManager';
import appPeersManager from './appPeersManager';
import appPhotosManager from './appPhotosManager';
import appProfileManager from './appProfileManager';
import appStickersManager from './appStickersManager';
import appWebPagesManager from './appWebPagesManager';
import { cancelEvent, getFilesFromEvent, placeCaretAtEnd } from '../../helpers/dom';
import PopupNewMedia from '../../components/popups/newMedia';
import { numberThousandSplitter } from '../../helpers/number';
import MarkupTooltip from '../../components/chat/markupTooltip';
import { isTouchSupported } from '../../helpers/touchSupport';
import appPollsManager from './appPollsManager';
import SetTransition from '../../components/singleTransition';
import ChatDragAndDrop from '../../components/chat/dragAndDrop';
import { debounce, pause } from '../../helpers/schedulers';
import lottieLoader from '../lottieLoader';
import useHeavyAnimationCheck, { dispatchHeavyAnimationEvent } from '../../hooks/useHeavyAnimationCheck';
import appDraftsManager from './appDraftsManager';
import serverTimeManager from '../mtproto/serverTimeManager';
import sessionStorage from '../sessionStorage';
import { renderImageFromUrl } from '../../components/misc';
import appDownloadManager from './appDownloadManager';
import appStateManager, { AppStateManager } from './appStateManager';

//console.log('appImManager included33!');

appSidebarLeft; // just to include

const LEFT_COLUMN_ACTIVE_CLASSNAME = 'is-left-column-shown';

export const CHAT_ANIMATION_GROUP = 'chat';
const FOCUS_EVENT_NAME = isTouchSupported ? 'touchstart' : 'mousemove';

export class AppImManager {
  public columnEl = document.getElementById('column-center') as HTMLDivElement;
  public chatsContainer: HTMLElement;

  public offline = false;
  public updateStatusInterval = 0;

  public log: ReturnType<typeof logger>;

  public setPeerPromise: Promise<void> = null;

  public tabId = -1;
  public hideRightSidebar = false;
  
  private chats: Chat[] = [];
  private prevTab: HTMLElement;
  private chatsSelectTabDebounced: () => void;
  
  public markupTooltip: MarkupTooltip;

  get myId() {
    return rootScope.myId;
  }

  get chat(): Chat {
    return this.chats[this.chats.length - 1];
  }

  constructor() {
    apiUpdatesManager.attach();

    this.log = logger('IM', LogLevels.log | LogLevels.warn | LogLevels.debug | LogLevels.error);

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

    // * Prevent setting online after reloading page
    window.addEventListener(FOCUS_EVENT_NAME, () => {
      this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
      this.updateStatus();
    }, {once: true, passive: true});

    this.chatsContainer = document.createElement('div');
    this.chatsContainer.classList.add('chats-container', 'tabs-container');
    this.chatsContainer.dataset.animation = 'navigation';

    this.columnEl.append(this.chatsContainer);
    
    this.createNewChat();
    this.chatsSelectTab(this.chat.container);

    window.addEventListener('hashchange', (e) => {
      const hash = location.hash;
      const splitted = hash.split('?');

      if(!splitted[1]) {
        return;
      }

      const params: any = {};
      splitted[1].split('&').forEach(item => {
        params[item.split('=')[0]] = decodeURIComponent(item.split('=')[1]);
      });

      this.log('hashchange', splitted[0], params);

      switch(splitted[0]) {
        case '#/im': {
          const p = params.p;
          if(p[0] === '@') {
            let postId = params.post !== undefined ? appMessagesManager.generateMessageId(+params.post) : undefined;
            appUsersManager.resolveUsername(p).then(peer => {
              const isUser = peer._ == 'user';
              const peerId = isUser ? peer.id : -peer.id;

              this.setInnerPeer(peerId, postId);
            });
          }
        }
      }

      location.hash = '';
    });

    this.setSettings();
    rootScope.on('settings_updated', () => this.setSettings());

    useHeavyAnimationCheck(() => {
      animationIntersector.setOnlyOnePlayableGroup('lock');
      animationIntersector.checkAnimations(true);
    }, () => {
      animationIntersector.setOnlyOnePlayableGroup('');
      animationIntersector.checkAnimations(false);
    });

    const isDefaultBackground = rootScope.settings.background.blur === AppStateManager.STATE_INIT.settings.background.blur && 
      rootScope.settings.background.slug === AppStateManager.STATE_INIT.settings.background.slug;
    if(!isDefaultBackground) {
      appDownloadManager.cacheStorage.getFile('background-image').then(blob => {
        this.setBackground(URL.createObjectURL(blob), false);
      });
    } else {
      this.setBackground('');
    }

    /* rootScope.on('peer_changing', (chat) => {
      this.saveChatPosition(chat);
    });

    sessionStorage.get('chatPositions').then((c) => {
      sessionStorage.setToCache('chatPositions', c || {});
    }); */
  }

  public setBackground(url: string, broadcastEvent = true): Promise<void> {
    const promises = this.chats.map(chat => chat.setBackground(url));
    return promises[promises.length - 1].then(() => {
      if(broadcastEvent) {
        rootScope.broadcast('background_change');
      }
    });
  }

  /* public saveChatPosition(chat: Chat) {
    const bubble = chat.bubbles.getBubbleByPoint('top');
    if(bubble) {
      const top = bubble.getBoundingClientRect().top;
      
      this.log('saving position by bubble:', bubble, top);

      const key = chat.peerId + (chat.threadId ? '_' + chat.threadId : '');

      const chatPositions = sessionStorage.getFromCache('chatPositions');
      chatPositions[key] = {
        mid: +bubble.dataset.mid,
        top
      };
      sessionStorage.set({chatPositions});
    }
  }

  public getChatSavedPosition(chat: Chat) {
    const key = chat.peerId + (chat.threadId ? '_' + chat.threadId : '');
    return sessionStorage.getFromCache('chatPositions')[key];
  } */

  private setSettings() {
    document.documentElement.style.setProperty('--messages-text-size', rootScope.settings.messagesTextSize + 'px');

    document.body.classList.toggle('animation-level-0', !rootScope.settings.animationsEnabled);
    document.body.classList.toggle('animation-level-1', false);
    document.body.classList.toggle('animation-level-2', rootScope.settings.animationsEnabled);

    this.chatsSelectTabDebounced = debounce(() => {
      const topbar = this.chat.topbar;
      if(topbar.pinnedMessage) { // * буду молиться богам, чтобы это ничего не сломало, но это исправляет получение пиннеда после анимации
        topbar.pinnedMessage.setCorrectIndex(0);
      }

      apiManager.setQueueId(this.chat.bubbles.lazyLoadQueue.queueId);
    }, rootScope.settings.animationsEnabled ? 250 : 0, false, true);

    lottieLoader.setLoop(rootScope.settings.stickers.loop);
    animationIntersector.checkAnimations(false);
  }

  // * не могу использовать тут TransitionSlider, так как мне нужен отрисованный блок рядом 
  // * (или под текущим чатом) чтобы правильно отрендерить чат (напр. scrollTop)
  private chatsSelectTab(tab: HTMLElement) {
    if(this.prevTab === tab) {
      return;
    }

    if(this.prevTab) {
      this.prevTab.classList.remove('active');
      this.chatsSelectTabDebounced();

      if(rootScope.settings.animationsEnabled) { // ! нужно переделать на animation, так как при лаге анимация будет длиться не 250мс
        dispatchHeavyAnimationEvent(pause(250), 250);
      }
    }

    tab.classList.add('active');
    this.prevTab = tab;
  }

  private init() {
    document.addEventListener('paste', this.onDocumentPaste, true);
    
    const onKeyDown = (e: KeyboardEvent) => {
      if(rootScope.overlayIsActive) return;
      
      const target = e.target as HTMLElement;
      
      //if(target.tagName == 'INPUT') return;
      
      //this.log('onkeydown', e, document.activeElement);

      const chat = this.chat;

      if(e.key === 'Escape') {
        let cancel = true;
        if(this.markupTooltip?.container?.classList.contains('is-visible')) {
          this.markupTooltip.hide();
        } else if(chat.selection.isSelecting) {
          chat.selection.cancelSelection();
        } else if(chat.container.classList.contains('is-helper-active')) {
          chat.input.replyElements.cancelBtn.click();
        } else if(chat.peerId !== 0) { // hide current dialog
          this.setPeer(0);
        } else {
          cancel = false;
        }

        // * cancel event for safari, because if application is in fullscreen, browser will try to exit fullscreen
        if(cancel) {
          cancelEvent(e);
        }
      } else if(e.key === 'Meta' || e.key === 'Control') {
        return;
      } else if(e.code === "KeyC" && (e.ctrlKey || e.metaKey) && target.tagName !== 'INPUT') {
        return;
      } else if(e.code === 'ArrowUp') {
        if(!chat.input.editMsgId && chat.input.isInputEmpty()) {
          const history = appMessagesManager.getHistoryStorage(chat.peerId, chat.threadId);
          if(history.history.length) {
            let goodMid: number;
            for(const mid of history.history) {
              const message = chat.getMessage(mid);
              const good = this.myId === chat.peerId ? message.fromId === this.myId : message.pFlags.out;

              if(good) {
                if(appMessagesManager.canEditMessage(chat.getMessage(mid), 'text')) {
                  goodMid = mid;
                  break;
                }

                // * this check will allow editing only last message
                //break;
              }
            }
  
            if(goodMid) {
              chat.input.initMessageEditing(goodMid);
              cancelEvent(e); // * prevent from scrolling
            }
          }
        }
      }
      
      if(chat.input.messageInput && e.target !== chat.input.messageInput && target.tagName !== 'INPUT' && !target.hasAttribute('contenteditable') && !isTouchSupported) {
        chat.input.messageInput.focus();
        placeCaretAtEnd(chat.input.messageInput);
      }
    };
    
    document.body.addEventListener('keydown', onKeyDown);

    rootScope.addEventListener('history_multiappend', (e) => {
      const msgIdsByPeer = e;

      for(const peerId in msgIdsByPeer) {
        appSidebarRight.sharedMediaTab.renderNewMessages(+peerId, msgIdsByPeer[peerId]);
      }
    });
    
    rootScope.addEventListener('history_delete', (e) => {
      const {peerId, msgs} = e;

      const mids = Object.keys(msgs).map(s => +s);
      appSidebarRight.sharedMediaTab.deleteDeletedMessages(peerId, mids);
    });

    // Calls when message successfully sent and we have an id
    rootScope.addEventListener('message_sent', (e) => {
      const {storage, tempId, mid} = e;
      const message = appMessagesManager.getMessageFromStorage(storage, mid);
      appSidebarRight.sharedMediaTab.renderNewMessages(message.peerId, [mid]);
    });

    if(!isTouchSupported) {
      this.attachDragAndDropListeners();
    }

    //if(!isTouchSupported) {
      this.markupTooltip = new MarkupTooltip(this);
      this.markupTooltip.handleSelection();
    //}
  }

  private attachDragAndDropListeners() {
    const drops: ChatDragAndDrop[] = [];
    let mounted = false;
    const toggle = async(e: DragEvent, mount: boolean) => {
      if(mount == mounted) return;

      const _types = e.dataTransfer.types;
      // @ts-ignore
      const isFiles = _types.contains ? _types.contains('Files') : _types.indexOf('Files') >= 0;

      if(!isFiles || !this.canDrag()) { // * skip dragging text case
        counter = 0;
        return;
      }

      if(mount && !drops.length) {
        const types: string[] = await getFilesFromEvent(e, true)
        const force = isFiles && !types.length; // * can't get file items not from 'drop' on Safari
        
        const foundMedia = types.filter(t => ['image', 'video'].includes(t.split('/')[0])).length;
        const foundDocuments = types.length - foundMedia;
  
        this.log('drag files', types);
        
        if(types.length || force) {
          drops.push(new ChatDragAndDrop(dropsContainer, {
            icon: 'dragfiles',
            header: 'Drop files here to send them',
            subtitle: 'without compression',
            onDrop: (e: DragEvent) => {
              toggle(e, false);
              appImManager.log('drop', e);
              appImManager.onDocumentPaste(e, 'document');
            }
          }));
        }
  
        if((foundMedia && !foundDocuments) || force) {
          drops.push(new ChatDragAndDrop(dropsContainer, {
            icon: 'dragmedia',
            header: 'Drop files here to send them',
            subtitle: 'in a quick way',
            onDrop: (e: DragEvent) => {
              toggle(e, false);
              appImManager.log('drop', e);
              appImManager.onDocumentPaste(e, 'media');
            }
          }));
        }
  
        this.chat.container.append(dropsContainer);
      }

      //if(!mount) return;

      SetTransition(dropsContainer, 'is-visible', mount, 200, () => {
        if(!mount) {
          drops.forEach(drop => {
            drop.destroy();
          });

          drops.length = 0;
        }
      });

      if(mount) {
        drops.forEach(drop => {
          drop.setPath();
        });
      } else {
        counter = 0;
      }

      document.body.classList.toggle('is-dragging', mount);
      mounted = mount;
    };

    /* document.body.addEventListener('dragover', (e) => {
      cancelEvent(e);
    }); */

    let counter = 0;
    document.body.addEventListener('dragenter', (e) => {
      counter++;
    });

    document.body.addEventListener('dragover', (e) => {
      //this.log('dragover', e/* , e.dataTransfer.types[0] */);
      toggle(e, true);
      cancelEvent(e);
    });

    document.body.addEventListener('dragleave', (e) => {
      //this.log('dragleave', e, counter);
      //if((e.pageX <= 0 || e.pageX >= appPhotosManager.windowW) || (e.pageY <= 0 || e.pageY >= appPhotosManager.windowH)) {
      counter--;
      if(counter === 0) { 
      //if(!findUpClassName(e.target, 'drops-container')) {
        toggle(e, false);
      }
    });

    const dropsContainer = document.createElement('div');
    dropsContainer.classList.add('drops-container');
  }

  private canDrag() {
    const peerId = this.chat?.peerId;
    return !(!peerId || rootScope.overlayIsActive || (peerId < 0 && !appChatsManager.hasRights(peerId, 'send', 'send_media')));
  }

  private onDocumentPaste = (e: ClipboardEvent | DragEvent, attachType?: 'media' | 'document') => {
    if(!this.canDrag()) return;

    //console.log('document paste');
    //console.log('item', event.clipboardData.getData());

    if(e instanceof DragEvent) {
      const _types = e.dataTransfer.types;
      // @ts-ignore
      const isFiles = _types.contains ? _types.contains('Files') : _types.indexOf('Files') >= 0;
      if(isFiles) {
        cancelEvent(e);
      }
    }
    
    getFilesFromEvent(e).then((files: File[]) => {
      if(files.length) {
        if(attachType == 'media' && files.find(file => !['image', 'video'].includes(file.type.split('/')[0]))) {
          attachType = 'document';
        }
  
        const chatInput = this.chat.input;
        chatInput.willAttachType = attachType || (files[0].type.indexOf('image/') === 0 ? 'media' : "document");
        new PopupNewMedia(this.chat, files, chatInput.willAttachType);
      }
    });
  };

  public selectTab(id: number) {
    document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME, id === 0);

    const prevTabId = this.tabId;

    this.log('selectTab', id, prevTabId);

    if(prevTabId !== -1 && prevTabId !== id && rootScope.settings.animationsEnabled) {
      const transitionTime = mediaSizes.isMobile ? 250 : 200;
      dispatchHeavyAnimationEvent(pause(transitionTime), transitionTime);
    }

    this.tabId = id;
    if(mediaSizes.isMobile && prevTabId === 2 && id === 1) {
      //appSidebarRight.toggleSidebar(false);
      document.body.classList.remove(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    }

    rootScope.broadcast('im_tab_change', id);

    //this._selectTab(id, mediaSizes.isMobile);
    //document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, id == 2);
  }
  
  public updateStatus() {
    if(!this.myId) return Promise.resolve();
    
    appUsersManager.setUserStatus(this.myId, this.offline);
    return apiManager.invokeApi('account.updateStatus', {offline: this.offline});
  }

  private createNewChat() {
    const chat = new Chat(this, appChatsManager, appDocsManager, appInlineBotsManager, appMessagesManager, appPeersManager, appPhotosManager, appProfileManager, appStickersManager, appUsersManager, appWebPagesManager, appPollsManager, apiManager, appDraftsManager, serverTimeManager, sessionStorage);

    if(this.chats.length) {
      chat.backgroundEl.append(this.chat.backgroundEl.lastElementChild.cloneNode(true));
    }

    this.chats.push(chat);
  }

  private spliceChats(fromIndex: number, justReturn = true) {
    if(fromIndex >= this.chats.length) return;

    if(this.chats.length > 1 && justReturn) {
      rootScope.broadcast('peer_changing', this.chat);
    }

    const spliced = this.chats.splice(fromIndex, this.chats.length - fromIndex);

    // * fix middle chat z-index on animation
    if(spliced.length > 1) {
      spliced.slice(0, -1).forEach(chat => {
        chat.container.remove();
      });
    }

    this.chatsSelectTab(this.chat.container);

    if(justReturn) {
      rootScope.broadcast('peer_changed', this.chat.peerId);

      if(appSidebarRight.historyTabIds[appSidebarRight.historyTabIds.length - 1] === AppSidebarRight.SLIDERITEMSIDS.search) {
        appSidebarRight.closeTab(AppSidebarRight.SLIDERITEMSIDS.search);
      }
  
      appSidebarRight.sharedMediaTab.setPeer(this.chat.peerId, this.chat.threadId);
      appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
      appSidebarRight.sharedMediaTab.fillProfileElements();
      
      /* setTimeout(() => {
        appSidebarRight.sharedMediaTab.loadSidebarMedia(false);
      }); */
    }
    
    setTimeout(() => {
      //chat.setPeer(0);
      spliced.forEach(chat => {
        chat.destroy();
      });
    }, 250);
  }

  public setPeer(peerId: number, lastMsgId?: number): boolean {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const chat = this.chat;
    const chatIndex = this.chats.indexOf(chat);

    if(!peerId) {
      if(chatIndex > 0) {
        this.spliceChats(chatIndex);
        return;
      } else if(mediaSizes.activeScreen === ScreenSize.medium) { // * floating sidebar case
        const isNowOpen = document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME);

        if(isNowOpen && document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
          appSidebarRight.toggleSidebar(false, false);
          this.selectTab(0);
          this.hideRightSidebar = isNowOpen;
        } else if(this.hideRightSidebar) {
          appSidebarRight.toggleSidebar(true);
        }

        return;
      }
    } else if(chatIndex > 0 && chat.peerId && chat.peerId !== peerId) {
      this.spliceChats(1, false);
      return this.setPeer(peerId, lastMsgId);
    }

    // * don't reset peer if returning
    if(peerId === chat.peerId && mediaSizes.activeScreen === ScreenSize.mobile && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
      this.selectTab(1);
      return false;
    }

    if(peerId || mediaSizes.activeScreen !== ScreenSize.mobile) {
      const result = chat.setPeer(peerId, lastMsgId);

      // * wait for cached render
      const promise = result?.cached ? result.promise : Promise.resolve();
      if(peerId) {
        promise.then(() => {
          //window.requestAnimationFrame(() => {
          setTimeout(() => { // * setTimeout is better here
            if(this.hideRightSidebar) {
              appSidebarRight.toggleSidebar(true);
              this.hideRightSidebar = false;
            }
        
            setTimeout(() => {
              this.chatsSelectTab(this.chat.container);
            }, 0);
            this.selectTab(1);
          }, 0);
        });
      }
    }

    if(!peerId) {
      this.selectTab(0);
      return false;
    }
  }

  public setInnerPeer(peerId: number, lastMsgId?: number, type: ChatType = 'chat', threadId?: number) {
    // * prevent opening already opened peer
    const existingIndex = this.chats.findIndex(chat => chat.peerId === peerId && chat.type === type);
    if(existingIndex !== -1) {
      this.spliceChats(existingIndex + 1);
      return this.setPeer(peerId, lastMsgId);
    }

    const chat = this.chat;
    if(!chat.init) { // * use first not inited chat
      this.createNewChat();
    }

    if(type) {
      this.chat.setType(type);

      if(threadId) {
        this.chat.threadId = threadId;
      }
    }

    //this.chatsSelectTab(this.chat.container);

    return this.setPeer(peerId, lastMsgId);
  }

  public openScheduled(peerId: number) {
    this.setInnerPeer(peerId, undefined, 'scheduled');
  }

  public async getPeerStatus(peerId: number) {
    let subtitle = '';
    if(!peerId) return subtitle;

    if(peerId < 0) { // not human
      const chat = appPeersManager.getPeer(peerId);

      const chatInfo = await appProfileManager.getChatFull(chat.id) as any;
      this.chat.log('chatInfo res:', chatInfo);

      const participants_count = chatInfo.participants_count || (chatInfo.participants && chatInfo.participants.participants && chatInfo.participants.participants.length) || 1;
      //if(participants_count) {
        subtitle = appChatsManager.getChatMembersString(-peerId);

        if(participants_count < 2) return subtitle;
        const onlines = await appChatsManager.getOnlines(chat.id);
        if(onlines > 1) {
          subtitle += ', ' + numberThousandSplitter(onlines, ' ') + ' online';
        }
  
        return subtitle;
      //}
    } else { // user
      const user = appUsersManager.getUser(peerId);
      
      if(rootScope.myId == peerId) {
        return '';
      } else if(user) {
        subtitle = appUsersManager.getUserStatusString(user.id);

        if(!appUsersManager.isBot(peerId)) {
          const typings = appChatsManager.typingsInPeer[peerId];
          if(typings && typings.length) {
            return '<span class="online">typing...</span>';
          } else if(subtitle == 'online') {
            return `<span class="online">${subtitle}</span>`;
          } else {
            return subtitle;
          }
        } else {
          return subtitle;
        }
      }
    }
  }
}

const appImManager = new AppImManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appImManager = appImManager);
export default appImManager;
