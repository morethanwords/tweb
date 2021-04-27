/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

//import apiManager from '../mtproto/apiManager';
import animationIntersector from '../../components/animationIntersector';
import appSidebarLeft, { LEFT_COLUMN_ACTIVE_CLASSNAME } from "../../components/sidebarLeft";
import appSidebarRight, { RIGHT_COLUMN_ACTIVE_CLASSNAME } from '../../components/sidebarRight';
import mediaSizes, { ScreenSize } from '../../helpers/mediaSizes';
import { logger, LogTypes } from "../logger";
import apiManager from '../mtproto/mtprotoworker';
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
import { blurActiveElement, cancelEvent, disableTransition, placeCaretAtEnd, replaceContent, whichChild } from '../../helpers/dom';
import PopupNewMedia from '../../components/popups/newMedia';
import MarkupTooltip from '../../components/chat/markupTooltip';
import { isTouchSupported } from '../../helpers/touchSupport';
import appPollsManager from './appPollsManager';
import SetTransition from '../../components/singleTransition';
import ChatDragAndDrop from '../../components/chat/dragAndDrop';
import { debounce, pause, doubleRaf } from '../../helpers/schedulers';
import lottieLoader from '../lottieLoader';
import useHeavyAnimationCheck, { dispatchHeavyAnimationEvent } from '../../hooks/useHeavyAnimationCheck';
import appDraftsManager from './appDraftsManager';
import serverTimeManager from '../mtproto/serverTimeManager';
import sessionStorage from '../sessionStorage';
import appDownloadManager from './appDownloadManager';
import appStateManager, { AppStateManager } from './appStateManager';
import { MOUNT_CLASS_TO } from '../../config/debug';
import appNavigationController from '../../components/appNavigationController';
import appNotificationsManager from './appNotificationsManager';
import AppPrivateSearchTab from '../../components/sidebarRight/tabs/search';
import { i18n, LangPackKey } from '../langPack';
import { SendMessageAction } from '../../layer';
import { hslaStringToHex } from '../../helpers/color';
import { copy, getObjectKeysAndSort } from '../../helpers/object';
import { getFilesFromEvent } from '../../helpers/files';
import PeerTitle from '../../components/peerTitle';
import PopupPeer from '../../components/popups/peer';

//console.log('appImManager included33!');

appSidebarLeft; // just to include

export const CHAT_ANIMATION_GROUP = 'chat';
const FOCUS_EVENT_NAME = isTouchSupported ? 'touchstart' : 'mousemove';

export type ChatSavedPosition = {
  mids: number[], 
  top: number
};

export class AppImManager {
  public columnEl = document.getElementById('column-center') as HTMLDivElement;
  public chatsContainer: HTMLElement;

  public offline = false;
  public updateStatusInterval = 0;

  public log: ReturnType<typeof logger>;

  public setPeerPromise: Promise<void> = null;

  public tabId = -1;
  
  public chats: Chat[] = [];
  private prevTab: HTMLElement;
  private chatsSelectTabDebounced: () => void;
  
  public markupTooltip: MarkupTooltip;
  private themeColorElem: Element;
  private backgroundPromises: {[slug: string]: Promise<string>} = {};

  get myId() {
    return rootScope.myId;
  }

  get chat(): Chat {
    return this.chats[this.chats.length - 1];
  }

  constructor() {
    apiUpdatesManager.attach();

    this.log = logger('IM', LogTypes.Log | LogTypes.Warn | LogTypes.Debug | LogTypes.Error);

    this.selectTab(0);
    
    window.addEventListener('blur', () => {
      animationIntersector.checkAnimations(true);
      
      this.offline = rootScope.idle.isIDLE = true;
      this.updateStatus();
      clearInterval(this.updateStatusInterval);
      rootScope.broadcast('idle', rootScope.idle.isIDLE);
      
      window.addEventListener('focus', () => {
        this.offline = rootScope.idle.isIDLE = false;
        this.updateStatus();
        this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
        
        // в обратном порядке
        animationIntersector.checkAnimations(false);

        rootScope.broadcast('idle', rootScope.idle.isIDLE);
      }, {once: true});
    });

    // * Prevent setting online after reloading page
    window.addEventListener(FOCUS_EVENT_NAME, () => {
      this.updateStatusInterval = window.setInterval(() => this.updateStatus(), 50e3);
      this.updateStatus();

      this.offline = rootScope.idle.isIDLE = false;
      rootScope.broadcast('idle', rootScope.idle.isIDLE);
    }, {once: true, passive: true});

    this.chatsContainer = document.createElement('div');
    this.chatsContainer.classList.add('chats-container', 'tabs-container');
    this.chatsContainer.dataset.animation = 'navigation';

    this.columnEl.append(this.chatsContainer);
    
    this.createNewChat();
    this.chatsSelectTab(this.chat.container);

    appNavigationController.onHashChange = this.onHashChange;
    //window.addEventListener('hashchange', this.onHashChange);

    this.setSettings();
    rootScope.on('settings_updated', this.setSettings);

    useHeavyAnimationCheck(() => {
      animationIntersector.setOnlyOnePlayableGroup('lock');
      animationIntersector.checkAnimations(true);
    }, () => {
      animationIntersector.setOnlyOnePlayableGroup('');
      animationIntersector.checkAnimations(false);
    });

    this.applyCurrentTheme();

    // * fix simultaneous opened both sidebars, can happen when floating sidebar is opened with left sidebar
    mediaSizes.addEventListener('changeScreen', (from, to) => {
      if(document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME) 
        && document.body.classList.contains(RIGHT_COLUMN_ACTIVE_CLASSNAME)) {
        appSidebarRight.toggleSidebar(false);
      }
    });

    rootScope.on('history_focus', (e) => {
      const {peerId, mid} = e;
      this.setInnerPeer(peerId, mid);
    });

    rootScope.on('peer_changing', (chat) => {
      this.saveChatPosition(chat);
    });

    sessionStorage.get('chatPositions').then((c) => {
      sessionStorage.setToCache('chatPositions', c || {});
    });

    (window as any).showMaskedAlert = (element: HTMLAnchorElement, e: Event) => {
      cancelEvent(null);

      const href = element.href;

      const a = element.cloneNode(true) as HTMLAnchorElement;
      a.innerText = href;
      a.removeAttribute('onclick');

      new PopupPeer('popup-masked-url', {
        titleLangKey: 'OpenUrlTitle',
        descriptionLangKey: 'OpenUrlAlert2',
        descriptionLangArgs: [a],
        buttons: [{
          langKey: 'Open',
          callback: () => {
            a.click();
          },
        }]
      }).show();

      return false;
    };
  }

  private onHashChange = () => {
    const hash = location.hash;
    const splitted = hash.split('?');

    if(!splitted[1]) {
      return;
    }

    const params: any = {};
    splitted[1].split('&').forEach(item => {
      params[item.split('=')[0]] = decodeURIComponent(item.split('=')[1]);
    });

    this.log('hashchange', hash, splitted[0], params);

    switch(splitted[0]) {
      case '#/im': {
        const p = params.p;
        let postId = params.post !== undefined ? appMessagesManager.generateMessageId(+params.post) : undefined;

        switch(p[0]) {
          case '@': {
            this.openUsername(p, postId);
            break;
          }

          default: { // peerId
            this.setInnerPeer(postId ? -+p : +p, postId);
            break;
          }
        }
      }
    }

    //appNavigationController.replaceState();
    //location.hash = '';
  };

  public openUsername(username: string, msgId?: number) {
    return appUsersManager.resolveUsername(username).then(peer => {
      const isUser = peer._ === 'user';
      const peerId = isUser ? peer.id : -peer.id;

      return this.setInnerPeer(peerId, msgId);
    });
  }

  public setCurrentBackground(broadcastEvent = false) {
    const theme = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme);

    if(theme.background.type === 'image' || (theme.background.type === 'default' && theme.background.slug)) {
      const defaultTheme = AppStateManager.STATE_INIT.settings.themes.find(t => t.name === theme.name);
      const isDefaultBackground = theme.background.blur === defaultTheme.background.blur && 
        theme.background.slug === defaultTheme.background.slug;

      if(!isDefaultBackground) {
        return this.getBackground(theme.background.slug).then((url) => {
          return this.setBackground(url, broadcastEvent);
        }, () => { // * if NO_ENTRY_FOUND
          theme.background = copy(defaultTheme.background); // * reset background
          return this.setBackground('', true);
        });
      }
    }
    
    return this.setBackground('', broadcastEvent);
  }

  private getBackground(slug: string) {
    if(this.backgroundPromises[slug]) return this.backgroundPromises[slug];
    return this.backgroundPromises[slug] = appDownloadManager.cacheStorage.getFile('backgrounds/' + slug).then(blob => {
      return URL.createObjectURL(blob);
    });
  }

  public setBackground(url: string, broadcastEvent = true): Promise<void> {
    const promises = this.chats.map(chat => chat.setBackground(url));
    return promises[promises.length - 1].then(() => {
      if(broadcastEvent) {
        rootScope.broadcast('background_change');
      }
    });
  }

  public saveChatPosition(chat: Chat) {
    if(!(['chat', 'discussion'] as ChatType[]).includes(chat.type) || !chat.peerId) {
      return;
    }

    //const bubble = chat.bubbles.getBubbleByPoint('top');
    //if(bubble) {
      //const top = bubble.getBoundingClientRect().top;
      const top = chat.bubbles.scrollable.scrollTop;

      const key = chat.peerId + (chat.threadId ? '_' + chat.threadId : '');

      const chatPositions = sessionStorage.getFromCache('chatPositions');
      if(!(chat.bubbles.scrollable.getDistanceToEnd() <= 16 && chat.bubbles.scrollable.loadedAll.bottom) && Object.keys(chat.bubbles.bubbles).length) {
        const position = {
          mids: getObjectKeysAndSort(chat.bubbles.bubbles, 'desc'),
          top
        };

        chatPositions[key] = position;

        this.log('saved chat position:', position);
      } else {
        delete chatPositions[key];

        this.log('deleted chat position');
      }

      sessionStorage.set({chatPositions}, true);
    //}
  }

  public getChatSavedPosition(chat: Chat): ChatSavedPosition {
    if(!(['chat', 'discussion'] as ChatType[]).includes(chat.type) || !chat.peerId) {
      return;
    }
    
    const key = chat.peerId + (chat.threadId ? '_' + chat.threadId : '');
    const cache = sessionStorage.getFromCache('chatPositions');
    return cache && cache[key];
  }

  public applyHighlightningColor() {
    let hsla: string;
    const theme = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme);
    if(theme.background.highlightningColor) {
      hsla = theme.background.highlightningColor;
      document.documentElement.style.setProperty('--message-highlightning-color', hsla);
    } else {
      document.documentElement.style.removeProperty('--message-highlightning-color');
    }

    let themeColor = '#ffffff';
    if(hsla) {
      themeColor = hslaStringToHex(hsla);
    }

    if(this.themeColorElem === undefined) {
      this.themeColorElem = document.head.querySelector('[name="theme-color"]') as Element || null;
    }

    if(this.themeColorElem) {
      this.themeColorElem.setAttribute('content', themeColor);
    }
  }

  public applyCurrentTheme(slug?: string, backgroundUrl?: string, broadcastEvent?: boolean) {
    this.applyHighlightningColor();

    document.documentElement.classList.toggle('night', rootScope.settings.theme === 'night');

    if(backgroundUrl) {
      this.backgroundPromises[slug] = Promise.resolve(backgroundUrl);
    }
    
    return this.setCurrentBackground(broadcastEvent === undefined ? !!slug : broadcastEvent);
  }

  private setSettings = () => {
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
    
    for(const chat of this.chats) {
      chat.setAutoDownloadMedia();
    }
  };

  // * не могу использовать тут TransitionSlider, так как мне нужен отрисованный блок рядом 
  // * (или под текущим чатом) чтобы правильно отрендерить чат (напр. scrollTop)
  private chatsSelectTab(tab: HTMLElement, animate?: boolean) {
    if(this.prevTab === tab) {
      return;
    }

    if(animate === false && this.prevTab) { // * will be used for Safari iOS history swipe
      disableTransition([tab, this.prevTab].filter(Boolean));
    }

    if(this.prevTab) {
      this.prevTab.classList.remove('active');
      this.chatsSelectTabDebounced();

      // ! нужно переделать на animation, так как при лаге анимация будет длиться не 250мс
      if(rootScope.settings.animationsEnabled && animate !== false) { 
        dispatchHeavyAnimationEvent(pause(250 + 150), 250 + 150);
      }

      const prevIdx = whichChild(this.prevTab);
      const idx = whichChild(tab);
      if(idx > prevIdx) {
        appNavigationController.pushItem({
          type: 'chat', 
          onPop: (canAnimate) => {
            this.setPeer(0, undefined, canAnimate);
            blurActiveElement();
          }
        });
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
      
      //if(target.tagName === 'INPUT') return;
      
      //this.log('onkeydown', e, document.activeElement);

      const chat = this.chat;

      if(e.key === 'Meta' || e.key === 'Control') {
        return;
      } else if(e.code === "KeyC" && (e.ctrlKey || e.metaKey) && target.tagName !== 'INPUT') {
        return;
      } else if(e.code === 'ArrowUp') {
        if(!chat.input.editMsgId && chat.input.isInputEmpty()) {
          const history = appMessagesManager.getHistoryStorage(chat.peerId, chat.threadId);
          if(history.history.length) {
            let goodMid: number;
            for(const mid of history.history.slice) {
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
        appSidebarRight.sharedMediaTab.renderNewMessages(+peerId, Array.from(msgIdsByPeer[peerId]));
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
      if(mount === mounted) return;

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
            header: 'Chat.DropTitle',
            subtitle: 'Chat.DropAsFilesDesc',
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
            header: 'Chat.DropTitle',
            subtitle: 'Chat.DropQuickDesc',
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
    return !(!peerId || rootScope.overlayIsActive || (peerId < 0 && !appChatsManager.hasRights(peerId, 'send_media')));
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
        if(attachType === 'media' && files.find(file => !['image', 'video'].includes(file.type.split('/')[0]))) {
          attachType = 'document';
        }
  
        const chatInput = this.chat.input;
        chatInput.willAttachType = attachType || (files[0].type.indexOf('image/') === 0 ? 'media' : "document");
        new PopupNewMedia(this.chat, files, chatInput.willAttachType);
      }
    });
  };

  public selectTab(id: number, animate?: boolean) {
    if(animate === false) { // * will be used for Safari iOS history swipe
      disableTransition([appSidebarLeft.sidebarEl, this.columnEl, appSidebarRight.sidebarEl]);
    }

    document.body.classList.toggle(LEFT_COLUMN_ACTIVE_CLASSNAME, id === 0);

    const prevTabId = this.tabId;

    this.log('selectTab', id, prevTabId);

    let animationPromise: Promise<any> = doubleRaf();
    if(prevTabId !== -1 && prevTabId !== id && rootScope.settings.animationsEnabled && animate !== false) {
      const transitionTime = (mediaSizes.isMobile ? 250 : 200) + 100; // * cause transition time could be > 250ms
      animationPromise = pause(transitionTime);
      dispatchHeavyAnimationEvent(animationPromise, transitionTime);

      this.columnEl.classList.add('disable-hover');
      animationPromise.finally(() => {
        this.columnEl.classList.remove('disable-hover');
      });
    }

    this.tabId = id;
    if(mediaSizes.isMobile && prevTabId === 2 && id < 2) {
      document.body.classList.remove(RIGHT_COLUMN_ACTIVE_CLASSNAME);
    }

    if(prevTabId !== -1 && id > prevTabId) {
      if(id < 2 || !appNavigationController.findItemByType('im')) {
        appNavigationController.pushItem({
          type: 'im', 
          onPop: (canAnimate) => {
            //this.selectTab(prevTabId, !isSafari);
            this.setPeer(0, undefined, canAnimate);
          }
        });
      }
    }

    rootScope.broadcast('im_tab_change', id);

    //this._selectTab(id, mediaSizes.isMobile);
    //document.body.classList.toggle(RIGHT_COLUMN_ACTIVE_CLASSNAME, id === 2);

    return animationPromise;
  }
  
  public updateStatus() {
    if(!this.myId) return Promise.resolve();
    
    appUsersManager.setUserStatus(this.myId, this.offline);
    return apiManager.invokeApi('account.updateStatus', {offline: this.offline});
  }

  private createNewChat() {
    const chat = new Chat(this, appChatsManager, appDocsManager, appInlineBotsManager, appMessagesManager, appPeersManager, appPhotosManager, appProfileManager, appStickersManager, appUsersManager, appWebPagesManager, appPollsManager, apiManager, appDraftsManager, serverTimeManager, sessionStorage, appNotificationsManager);

    if(this.chats.length) {
      chat.backgroundEl.append(this.chat.backgroundEl.lastElementChild.cloneNode(true));
    }

    this.chats.push(chat);
  }

  private spliceChats(fromIndex: number, justReturn = true, animate?: boolean, spliced?: Chat[]) {
    if(fromIndex >= this.chats.length) return;

    if(this.chats.length > 1 && justReturn) {
      rootScope.broadcast('peer_changing', this.chat);
    }

    if(!spliced) {
      spliced = this.chats.splice(fromIndex, this.chats.length - fromIndex);
    }

    // * -1 because one item is being sliced when closing the chat by calling .removeByType
    for(let i = 0; i < spliced.length - 1; ++i) {
      appNavigationController.removeByType('chat', true);
    }

    // * fix middle chat z-index on animation
    if(spliced.length > 1) {
      spliced.slice(0, -1).forEach(chat => {
        chat.container.remove();
      });
    }

    this.chatsSelectTab(this.chat.container, animate);

    if(justReturn) {
      rootScope.broadcast('peer_changed', this.chat.peerId);

      const searchTab = appSidebarRight.getTab(AppPrivateSearchTab);
      if(searchTab) {
        searchTab.close();
      }
  
      const isSet = appSidebarRight.sharedMediaTab.setPeer(this.chat.peerId, this.chat.threadId);
      if(isSet) {
        appSidebarRight.sharedMediaTab.loadSidebarMedia(true);
        appSidebarRight.sharedMediaTab.fillProfileElements();
      }
      
      /* setTimeout(() => {
        appSidebarRight.sharedMediaTab.loadSidebarMedia(false);
      }); */
    }
    
    setTimeout(() => {
      //chat.setPeer(0);
      spliced.forEach(chat => {
        chat.destroy();
      });
    }, 250 + 100);
  }

  public setPeer(peerId: number, lastMsgId?: number, animate?: boolean): boolean {
    if(this.init) {
      this.init();
      this.init = null;
    }

    const chat = this.chat;
    const chatIndex = this.chats.indexOf(chat);

    if(!peerId) {
      if(chatIndex > 0) {
        this.spliceChats(chatIndex, undefined, animate);
        return;
      } else if(mediaSizes.activeScreen === ScreenSize.medium) { // * floating sidebar case
        this.selectTab(+!this.tabId, animate);
        return;
      }
    } else if(chatIndex > 0 && chat.peerId && chat.peerId !== peerId) {
      // const firstChat = this.chats[0];
      // if(firstChat.peerId !== chat.peerId) {
        /* // * slice idx > 0, set background and slice first, so new one will be the first
        const spliced = this.chats.splice(1, this.chats.length - 1);
        this.createNewChat();
        this.chats.splice(0, 1); */
        const spliced = this.chats.splice(1, this.chats.length - 1);
        if(this.chat.peerId === peerId) {
          this.spliceChats(0, true, true, spliced);
          return;
        } else {
          const ret = this.setPeer(peerId, lastMsgId);
          this.spliceChats(0, false, false, spliced);
          return ret;
        }
      // } else {
      //   this.spliceChats(1, false, animate);
      // }

      //return ret;
    }

    // * don't reset peer if returning
    if(peerId === chat.peerId && mediaSizes.activeScreen <= ScreenSize.medium && document.body.classList.contains(LEFT_COLUMN_ACTIVE_CLASSNAME)) {
      this.selectTab(1, animate);
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
            setTimeout(() => {
              this.chatsSelectTab(this.chat.container);
            }, 0);
            this.selectTab(1, animate);
          }, 0);
        });
      }
    }

    if(!peerId) {
      this.selectTab(0, animate);
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

  private getTypingElement(action: SendMessageAction) {
    const el = document.createElement('span');
    el.classList.add('peer-typing');
    el.dataset.action = action._;
    switch(action._) {
      case 'sendMessageTypingAction': {
      //default: {
        const c = 'peer-typing-text';
        el.classList.add(c);
        for(let i = 0; i < 3; ++i) {
          const dot = document.createElement('span');
          dot.className = c + '-dot';
          el.append(dot);
        }
        break;
      }

      case 'sendMessageUploadAudioAction':
      case 'sendMessageUploadDocumentAction':
      case 'sendMessageUploadRoundAction':
      case 'sendMessageUploadVideoAction':
      case 'sendMessageUploadPhotoAction': {
        const c = 'peer-typing-upload';
        el.classList.add(c);
        /* const trail = document.createElement('span');
        trail.className = c + '-trail';
        el.append(trail); */
        break;
      }

      case 'sendMessageRecordAudioAction':
      case 'sendMessageRecordRoundAction':
      case 'sendMessageRecordVideoAction': {
        const c = 'peer-typing-record';
        el.classList.add(c);
        break;
      }
    }

    return el;
  }

  public getPeerTyping(peerId: number, container?: HTMLElement) {
    if(!appUsersManager.isBot(peerId)) {
      const typings = appChatsManager.getPeerTypings(peerId);
      if(!typings || !typings.length) {
        return;
      }

      const typing = typings[0];

      const langPackKeys: {
        [peerType in 'private' | 'chat' | 'multi']?: Partial<{[action in SendMessageAction['_']]: LangPackKey}>
      } = {
        private: {
          'sendMessageTypingAction': 'Peer.Activity.User.TypingText',
          'sendMessageUploadAudioAction': 'Peer.Activity.User.SendingFile',
          'sendMessageUploadDocumentAction': 'Peer.Activity.User.SendingFile',
          'sendMessageUploadPhotoAction': 'Peer.Activity.User.SendingPhoto',
          'sendMessageUploadVideoAction': 'Peer.Activity.User.SendingVideo',
          'sendMessageUploadRoundAction': 'Peer.Activity.User.SendingVideo',
          'sendMessageRecordVideoAction': 'Peer.Activity.User.RecordingVideo',
          'sendMessageRecordAudioAction': 'Peer.Activity.User.RecordingAudio',
          'sendMessageRecordRoundAction': 'Peer.Activity.User.RecordingVideo',
          'sendMessageGamePlayAction': 'Peer.Activity.User.PlayingGame'
        },
        chat: {
          'sendMessageTypingAction': 'Peer.Activity.Chat.TypingText',
          'sendMessageUploadAudioAction': 'Peer.Activity.Chat.SendingFile',
          'sendMessageUploadDocumentAction': 'Peer.Activity.Chat.SendingFile',
          'sendMessageUploadPhotoAction': 'Peer.Activity.Chat.SendingPhoto',
          'sendMessageUploadVideoAction': 'Peer.Activity.Chat.SendingVideo',
          'sendMessageUploadRoundAction': 'Peer.Activity.Chat.SendingVideo',
          'sendMessageRecordVideoAction': 'Peer.Activity.Chat.RecordingVideo',
          'sendMessageRecordAudioAction': 'Peer.Activity.Chat.RecordingAudio',
          'sendMessageRecordRoundAction': 'Peer.Activity.Chat.RecordingVideo',
          'sendMessageGamePlayAction': 'Peer.Activity.Chat.PlayingGame'
        },
        multi: {
          'sendMessageTypingAction': 'Peer.Activity.Chat.Multi.TypingText1',
          'sendMessageUploadAudioAction': 'Peer.Activity.Chat.Multi.SendingFile1',
          'sendMessageUploadDocumentAction': 'Peer.Activity.Chat.Multi.SendingFile1',
          'sendMessageUploadPhotoAction': 'Peer.Activity.Chat.Multi.SendingPhoto1',
          'sendMessageUploadVideoAction': 'Peer.Activity.Chat.Multi.SendingVideo1',
          'sendMessageUploadRoundAction': 'Peer.Activity.Chat.Multi.SendingVideo1',
          'sendMessageRecordVideoAction': 'Peer.Activity.Chat.Multi.RecordingVideo1',
          'sendMessageRecordAudioAction': 'Peer.Activity.Chat.Multi.RecordingAudio1',
          'sendMessageRecordRoundAction': 'Peer.Activity.Chat.Multi.RecordingVideo1',
          'sendMessageGamePlayAction': 'Peer.Activity.Chat.Multi.PlayingGame1'
        }
      };

      const mapa = peerId > 0 ? langPackKeys.private : (typings.length > 1 ? langPackKeys.multi : langPackKeys.chat);
      let action = typing.action;

      if(typings.length > 1) {
        const s: any = {};
        typings.forEach(typing => {
          const type = typing.action._;
          if(s[type] === undefined) s[type] = 0;
          ++s[type];
        });

        if(Object.keys(s).length > 1) {
          action = {
            _: 'sendMessageTypingAction'
          };
        }
      }

      const langPackKey = mapa[action._];
      if(!langPackKey) {
        return;
      }

      if(!container) {
        container = document.createElement('span');
        container.classList.add('online', 'peer-typing-container');
      }

      let typingElement = container.firstElementChild as HTMLElement;
      if(!typingElement) {
        typingElement = this.getTypingElement(action);
        container.prepend(typingElement);
      } else {
        if(typingElement.dataset.action !== action._) {
          typingElement.replaceWith(this.getTypingElement(action));
        }
      }

      let args: any[];
      if(peerId < 0) {
        args = [
          new PeerTitle({peerId: typing.userId, onlyFirstName: true}).element,
          typings.length - 1
        ];
      }
      const descriptionElement = i18n(langPackKey, args);
      descriptionElement.classList.add('peer-typing-description');

      if(container.childElementCount > 1) container.lastElementChild.replaceWith(descriptionElement);
      else container.append(descriptionElement);
      return container;
    }
  }

  public async getPeerStatus(peerId: number) {
    let subtitle: HTMLElement;
    if(!peerId) return '';

    if(peerId < 0) { // not human
      let span = this.getPeerTyping(peerId);
      if(span) {
        return span;
      }

      const chatInfo = await appProfileManager.getChatFull(-peerId) as any;
      this.chat.log('chatInfo res:', chatInfo);

      const participants_count = chatInfo.participants_count || (chatInfo.participants && chatInfo.participants.participants && chatInfo.participants.participants.length) || 1;
      //if(participants_count) {
        subtitle = appChatsManager.getChatMembersString(-peerId);

        if(participants_count < 2) return subtitle;
        /* const onlines = await appChatsManager.getOnlines(chat.id);
        if(onlines > 1) {
          subtitle += ', ' + numberThousandSplitter(onlines) + ' online';
        } */
  
        return subtitle;
      //}
    } else { // user
      const user = appUsersManager.getUser(peerId);
      
      if(rootScope.myId === peerId) {
        return '';
      } else if(user) {
        subtitle = appUsersManager.getUserStatusString(user.id);

        if(!appUsersManager.isBot(peerId)) {
          let span = this.getPeerTyping(peerId);
          if(!span && user.status?._ === 'userStatusOnline') {
            span = document.createElement('span');
            span.classList.add('online');
            span.append(subtitle);
          }

          if(span) {
            return span;
          }
        }
        
        return subtitle;
      }
    }
  }

  public setPeerStatus(peerId: number, element: HTMLElement, needClear: boolean, useWhitespace: boolean, middleware: () => boolean) {
    if(needClear) {
      element.innerHTML = useWhitespace ? '‎' : ''; // ! HERE U CAN FIND WHITESPACE
    }

    // * good good good
    const typingContainer = element.querySelector('.peer-typing-container') as HTMLElement;
    if(typingContainer && this.getPeerTyping(peerId, typingContainer)) {
      return;
    }

    this.getPeerStatus(peerId).then((subtitle) => {
      if(!middleware()) {
        return;
      }

      replaceContent(element, subtitle || (useWhitespace ? '‎' : ''));
    });
  }
}

const appImManager = new AppImManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appImManager = appImManager);
export default appImManager;
