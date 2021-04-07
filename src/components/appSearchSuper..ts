import { formatDateAccordingToToday, months } from "../helpers/date";
import { positionElementByIndex } from "../helpers/dom";
import { copy, getObjectKeysAndSort, safeAssign } from "../helpers/object";
import { escapeRegExp, limitSymbols } from "../helpers/string";
import appChatsManager from "../lib/appManagers/appChatsManager";
import appDialogsManager from "../lib/appManagers/appDialogsManager";
import appMessagesManager, { MyInputMessagesFilter, MyMessage } from "../lib/appManagers/appMessagesManager";
import appPeersManager from "../lib/appManagers/appPeersManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import appStateManager from "../lib/appManagers/appStateManager";
import appUsersManager from "../lib/appManagers/appUsersManager";
import { logger } from "../lib/logger";
import RichTextProcessor from "../lib/richtextprocessor";
import rootScope from "../lib/rootScope";
import searchIndexManager from "../lib/searchIndexManager";
import AppMediaViewer from "./appMediaViewer";
import { SearchGroup, SearchGroupType } from "./appSearch";
import { horizontalMenu } from "./horizontalMenu";
import LazyLoadQueue from "./lazyLoadQueue";
import { putPreloader, formatPhoneNumber } from "./misc";
import { ripple } from "./ripple";
import Scrollable, { ScrollableX } from "./scrollable";
import { wrapDocument, wrapPhoto, wrapVideo } from "./wrappers";
import useHeavyAnimationCheck, { getHeavyAnimationPromise } from "../hooks/useHeavyAnimationCheck";
import { isSafari } from "../helpers/userAgent";
import { LangPackKey, i18n } from "../lib/langPack";
import findUpClassName from "../helpers/dom/findUpClassName";
import { getMiddleware } from "../helpers/middleware";

//const testScroll = false;

export type SearchSuperType = MyInputMessagesFilter/*  | 'members' */;
export type SearchSuperContext = {
  peerId: number,
  inputFilter: MyInputMessagesFilter,
  query?: string,
  maxId?: number,
  folderId?: number,
  threadId?: number,
  date?: number,
  nextRate?: number,
  minDate?: number,
  maxDate?: number
};

export type SearchSuperMediaType = 'members' | 'media' | 'files' | 'links' | 'music' | 'chats' | 'voice';
export type SearchSuperMediaTab = {
  inputFilter: SearchSuperType,
  name: LangPackKey,
  type: SearchSuperMediaType,
  contentTab?: HTMLElement,
  menuTab?: HTMLElement,
  scroll?: {scrollTop: number, scrollHeight: number}
};

export default class AppSearchSuper {
  public tabs: {[t in SearchSuperType]: HTMLDivElement} = {} as any;

  public mediaTab: SearchSuperMediaTab;
  public tabSelected: HTMLElement;

  public container: HTMLElement;
  public nav: HTMLElement;
  private tabsContainer: HTMLElement;
  private tabsMenu: HTMLElement;
  private prevTabId = -1;
  
  private lazyLoadQueue = new LazyLoadQueue();
  public middleware = getMiddleware();

  public historyStorage: Partial<{[type in SearchSuperType]: {mid: number, peerId: number}[]}> = {};
  public usedFromHistory: Partial<{[type in SearchSuperType]: number}> = {};
  public urlsToRevoke: string[] = [];

  private searchContext: SearchSuperContext;
  public loadMutex: Promise<any> = Promise.resolve();

  private nextRates: Partial<{[type in SearchSuperType]: number}> = {};
  private loadPromises: Partial<{[type in SearchSuperType]: Promise<void>}> = {};
  private loaded: Partial<{[type in SearchSuperType]: boolean}> = {};
  private loadedChats = false;

  private log = logger('SEARCH-SUPER');
  public selectTab: ReturnType<typeof horizontalMenu>;
  
  private monthContainers: Partial<{
    [type in SearchSuperType]: {
      [timestamp: number]: {
        container: HTMLElement,
        items: HTMLElement
      }
    }
  }> = {};

  private searchGroupMedia: SearchGroup;

  public mediaTabsMap: Map<SearchSuperMediaType, SearchSuperMediaTab> = new Map();

  // * arguments
  public mediaTabs: SearchSuperMediaTab[];
  public scrollable: Scrollable;
  public searchGroups?: {[group in SearchGroupType]: SearchGroup};
  public asChatList? = false;
  public groupByMonth? = true;
  public hideEmptyTabs? = true;

  constructor(options: Pick<AppSearchSuper, 'mediaTabs' | 'scrollable' | 'searchGroups' | 'asChatList' | 'groupByMonth' | 'hideEmptyTabs'>) {
    safeAssign(this, options);

    this.container = document.createElement('div');
    this.container.classList.add('search-super');

    const navScrollableContainer = document.createElement('div');
    navScrollableContainer.classList.add('search-super-tabs-scrollable', 'menu-horizontal-scrollable');

    const navScrollable = new ScrollableX(navScrollableContainer);

    const nav = this.nav = document.createElement('nav');
    nav.classList.add('search-super-tabs', 'menu-horizontal-div');
    this.tabsMenu = nav;

    navScrollable.container.append(nav);

    for(const mediaTab of this.mediaTabs) {
      const menuTab = document.createElement('div');
      menuTab.classList.add('menu-horizontal-div-item');
      const span = document.createElement('span');
      const i = document.createElement('i');

      span.append(i18n(mediaTab.name));
      span.append(i);

      menuTab.append(span);

      ripple(menuTab);

      this.tabsMenu.append(menuTab);

      this.mediaTabsMap.set(mediaTab.type, mediaTab);

      mediaTab.menuTab = menuTab;
    }

    this.tabsContainer = document.createElement('div');
    this.tabsContainer.classList.add('search-super-tabs-container', 'tabs-container');

    for(const mediaTab of this.mediaTabs) {
      const container = document.createElement('div');
      container.classList.add('search-super-container-' + mediaTab.type);

      const content = document.createElement('div');
      content.classList.add('search-super-content-' + mediaTab.type);

      container.append(content);

      this.tabsContainer.append(container);

      this.tabs[mediaTab.inputFilter] = content;

      mediaTab.contentTab = content;
    }

    this.container.append(navScrollableContainer, this.tabsContainer);

    // * construct end

    this.searchGroupMedia = new SearchGroup('', 'messages', true);

    this.scrollable.onScrolledBottom = () => {
      if(this.tabSelected && this.tabSelected.childElementCount/* && false */) {
        //this.log('onScrolledBottom will load media');
        this.load(true);
      }
    };
    //this.scroll.attachSentinels(undefined, 400);

    this.selectTab = horizontalMenu(this.tabsMenu, this.tabsContainer, (id, tabContent) => {
      if(this.prevTabId === id) return;

      if(this.prevTabId !== -1) {
        this.onTransitionStart();
      }
      
      this.mediaTab.scroll = {scrollTop: this.scrollable.scrollTop, scrollHeight: this.scrollable.scrollHeight};

      const newMediaTab = this.mediaTabs[id];
      this.tabSelected = tabContent.firstElementChild as HTMLDivElement;

      if(newMediaTab.scroll === undefined) {
        const rect = this.container.getBoundingClientRect();
        const rect2 = this.container.parentElement.getBoundingClientRect();
        const diff = rect.y - rect2.y;

        if(this.scrollable.scrollTop > diff) {
          newMediaTab.scroll = {scrollTop: diff, scrollHeight: 0};
        }
      }

      if(newMediaTab.scroll) {
        const diff = this.mediaTab.scroll.scrollTop - newMediaTab.scroll.scrollTop;
        //console.log('what you gonna do', this.goingHard, diff);

        if(diff/*  && diff < 0 */) {
          this.tabSelected.style.transform = `translateY(${diff}px)`;
        }
      }

      this.mediaTab = newMediaTab;
      
      /* if(this.prevTabId !== -1 && nav.offsetTop) {
        this.scrollable.scrollTop -= nav.offsetTop;
      } */

      /* this.log('setVirtualContainer', id, this.sharedMediaSelected, this.sharedMediaSelected.childElementCount);
      this.scroll.setVirtualContainer(this.sharedMediaSelected); */

      if(this.prevTabId !== -1 && !this.tabSelected.childElementCount) { // quick brown fix
        //this.contentContainer.classList.remove('loaded');
        this.load(true);
      }

      this.prevTabId = id;
    }, () => {
      this.scrollable.onScroll();
      
      //console.log('what y', this.tabSelected.style.transform);
      if(this.mediaTab.scroll !== undefined) {
        this.tabSelected.style.transform = '';
        this.scrollable.scrollTop = this.mediaTab.scroll.scrollTop;
      }

      this.onTransitionEnd();
    }, undefined, navScrollable);

    this.tabs.inputMessagesFilterPhotoVideo.addEventListener('click', (e) => {
      const target = findUpClassName(e.target as HTMLDivElement, 'grid-item');
      
      const mid = +target.dataset.mid;
      if(!mid) {
        this.log.warn('no messageId by click on target:', target);
        return;
      }

      const peerId = +target.dataset.peerId;

      const targets = (Array.from(this.tabs.inputMessagesFilterPhotoVideo.querySelectorAll('.grid-item')) as HTMLElement[]).map(el => {
        return {element: el, mid: +el.dataset.mid, peerId: +el.dataset.peerId};
      });

      //const ids = Object.keys(this.mediaDivsByIds).map(k => +k).sort((a, b) => a - b);
      const idx = targets.findIndex(item => item.mid === mid && item.peerId === peerId);
      
      const message = appMessagesManager.getMessageByPeer(peerId, mid);
      new AppMediaViewer()
      .setSearchContext(this.copySearchContext(this.mediaTab.inputFilter))
      .openMedia(message, target, 0, false, targets.slice(0, idx), targets.slice(idx + 1));
    });

    this.mediaTab = this.mediaTabs[0];

    useHeavyAnimationCheck(() => {
      this.lazyLoadQueue.lock();
    }, () => {
      this.lazyLoadQueue.unlockAndRefresh(); // ! maybe not so efficient
    });
  }

  private onTransitionStart = () => {
    // Jolly Cobra's // Workaround for scrollable content flickering during animation.
    const container = this.scrollable.container;
    if(container.style.overflowY !== 'hidden') {
      const scrollBarWidth = container.offsetWidth - container.clientWidth;
      container.style.overflowY = 'hidden';
      container.style.paddingRight = `${scrollBarWidth}px`;
      this.container.classList.add('sliding');
    }
  };

  private onTransitionEnd = () => {
    // Jolly Cobra's // Workaround for scrollable content flickering during animation.
    const container = this.scrollable.container;

    if(isSafari) { // ! safari doesn't respect sticky header, so it flicks when overflow is changing
      container.style.display = 'none';
    }

    container.style.overflowY = '';

    if(isSafari) {
      void container.offsetLeft; // reflow
      container.style.display = '';
    }

    container.style.paddingRight = '0';
    this.container.classList.remove('sliding');
  };

  public filterMessagesByType(messages: any[], type: SearchSuperType): MyMessage[] {
    if(type === 'inputMessagesFilterEmpty') return messages;

    if(type !== 'inputMessagesFilterUrl') {
      messages = messages.filter(message => !!message.media);
    }

    /* if(!this.peerId) {
      messages = messages.filter(message => {
        if(message.peerId === rootScope.myId) {
          return true;
        }

        const dialog = appMessagesManager.getDialogByPeerId(message.fromId)[0];
        return dialog && dialog.folder_id === 0;
      });
    } */

    let filtered: any[] = [];

    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        for(let message of messages) {
          let media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);
          if(!media) {
            //this.log('no media!', message);
            continue;
          }
          
          if(media._ === 'document' && media.type !== 'video'/*  && media.type !== 'gif' */) {
            //this.log('broken video', media);
            continue;
          }

          filtered.push(message);
        }
        
        break;
      }

      case 'inputMessagesFilterDocument': {
        for(let message of messages) {
          if(!message.media.document || ['voice', 'audio', 'gif', 'sticker', 'round'].includes(message.media.document.type)) {
            continue;
          }
          
          filtered.push(message);
        }
        break;
      }

      case 'inputMessagesFilterUrl': {
        //this.log('inputMessagesFilterUrl', messages);
        for(let message of messages) {
          //if((message.media.webpage && message.media.webpage._ !== 'webPageEmpty')) {
            filtered.push(message);
          //}
        }
        
        break;
      }

      case 'inputMessagesFilterMusic': {
        for(let message of messages) {
          if(!message.media.document || message.media.document.type !== 'audio') {
            continue;
          }

          filtered.push(message);
        }

        break;
      }

      case 'inputMessagesFilterVoice': {
        for(let message of messages) {
          if(!message.media.document || message.media.document.type !== 'voice') {
            continue;
          }

          filtered.push(message);
        }

        break;
      }

      default:
        break;
    }

    return filtered;
  }
  
  public async performSearchResult(messages: any[], type: SearchSuperType, append = true) {
    const elemsToAppend: {element: HTMLElement, message: any}[] = [];
    const sharedMediaDiv: HTMLElement = this.tabs[type];
    const promises: Promise<any>[] = [];
    const middleware = this.middleware.get();

    await getHeavyAnimationPromise();
    
    let searchGroup: SearchGroup;
    if(type === 'inputMessagesFilterPhotoVideo' && !!this.searchContext.query.trim()) {
      type = 'inputMessagesFilterEmpty';
      searchGroup = this.searchGroupMedia;
      sharedMediaDiv.append(searchGroup.container);
    } else if(type === 'inputMessagesFilterEmpty') {
      searchGroup = this.searchGroups.messages;
    }

    // https://core.telegram.org/type/MessagesFilter
    switch(type) {
      case 'inputMessagesFilterEmpty': {
        for(const message of messages) {
          const {dialog, dom} = appDialogsManager.addDialogNew({
            dialog: message.peerId, 
            container: searchGroup.list, 
            drawStatus: false,
            avatarSize: 54
          });
          appDialogsManager.setLastMessage(dialog, message, dom, this.searchContext.query);
        }

        if(searchGroup.list.childElementCount) {
          searchGroup.setActive();
        }
        break;
      }

      case 'inputMessagesFilterPhotoVideo': {
        for(const message of messages) {
          const media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);

          const div = document.createElement('div');
          div.classList.add('grid-item');
          //this.log(message, photo);

          let wrapped: ReturnType<typeof wrapPhoto>;
          if(media._ !== 'photo') {
            wrapped = wrapVideo({
              doc: media,
              message,
              container: div,
              boxWidth: 0,
              boxHeight: 0,
              lazyLoadQueue: this.lazyLoadQueue,
              middleware,
              onlyPreview: true,
              withoutPreloader: true,
              noPlayButton: true
            }).thumb;
          } else {
            wrapped = wrapPhoto({
              photo: media,
              message,
              container: div,
              boxWidth: 0,
              boxHeight: 0,
              lazyLoadQueue: this.lazyLoadQueue,
              middleware,
              withoutPreloader: true
            });
          }

          [wrapped.images.thumb, wrapped.images.full].filter(Boolean).forEach(image => {
            image.classList.add('grid-item-media');
          });

          promises.push(wrapped.loadPromises.thumb);

          elemsToAppend.push({element: div, message});
        }
        
        break;
      }
      
      case 'inputMessagesFilterVoice':
      case 'inputMessagesFilterMusic':
      case 'inputMessagesFilterDocument': {
        for(const message of messages) {
          const div = wrapDocument({
            message,
            withTime: !this.asChatList,
            fontWeight: 400,
            voiceAsMusic: true,
            showSender: this.asChatList,
            searchContext: this.copySearchContext(type)
          });
          if(message.media.document.type === 'audio') {
            div.classList.add('audio-48');
          }
          elemsToAppend.push({element: div, message});
        }
        break;
      }
      
      case 'inputMessagesFilterUrl': {
        for(let message of messages) {
          let webpage: any;

          if(message.media?.webpage && message.media.webpage._ !== 'webPageEmpty') {
            webpage = message.media.webpage;
          } else {
            const entity = message.totalEntities ? message.totalEntities.find((e: any) => e._ === 'messageEntityUrl' || e._ === 'messageEntityTextUrl') : null;
            let url: string, display_url: string, sliced: string;

            if(!entity) {
              //this.log.error('NO ENTITY:', message);
              const match = RichTextProcessor.matchUrl(message.message);
              if(!match) {
                //this.log.error('NO ENTITY AND NO MATCH:', message);
                continue;
              }

              url = match[0];
            } else {
              sliced = message.message.slice(entity.offset, entity.offset + entity.length);
            }

            if(entity?._ === 'messageEntityTextUrl') {
              url = entity.url;
              //display_url = sliced;
            } else {
              url = url || sliced;
            }

            display_url = url;

            const same = message.message === url;
            if(!url.match(/^(ftp|http|https):\/\//)) {
              display_url = 'https://' + url;
              url = url.includes('@') ? url : 'https://' + url;
            }

            display_url = new URL(display_url).hostname;

            webpage = {
              url,
              display_url
            };

            if(!same) {
              webpage.description = message.message;
              webpage.rDescription = RichTextProcessor.wrapRichText(limitSymbols(message.message, 150, 180));
            }
          }

          let div = document.createElement('div');
          
          let previewDiv = document.createElement('div');
          previewDiv.classList.add('preview');
          
          //this.log('wrapping webpage', webpage);
          
          if(webpage.photo) {
            const res = wrapPhoto({
              container: previewDiv,
              message: null,
              photo: webpage.photo,
              boxWidth: 0,
              boxHeight: 0,
              withoutPreloader: true,
              lazyLoadQueue: this.lazyLoadQueue,
              middleware,
              size: appPhotosManager.choosePhotoSize(webpage.photo, 60, 60, false),
              loadPromises: promises
            });
          } else {
            previewDiv.classList.add('empty');
            previewDiv.innerHTML = RichTextProcessor.getAbbreviation(webpage.title || webpage.display_url || webpage.description || webpage.url, true);
          }
          
          let title = webpage.rTitle || '';
          let subtitle = webpage.rDescription || '';
          let url = RichTextProcessor.wrapRichText(webpage.url || '');
          
          if(!title) {
            //title = new URL(webpage.url).hostname;
            title = RichTextProcessor.wrapPlainText(webpage.display_url.split('/', 1)[0]);
          }

          let sender = this.asChatList ? `<div class="subtitle sender">${appMessagesManager.getSenderToPeerText(message)}</div>` : '';

          let titleAdditionHTML = '';
          if(this.asChatList) {
            titleAdditionHTML = `<div class="sent-time">${formatDateAccordingToToday(new Date(message.date * 1000))}</div>`;
          }

          div.append(previewDiv);
          div.insertAdjacentHTML('beforeend', `
          <div class="title">${title}${titleAdditionHTML}</div>
          <div class="subtitle">${subtitle}</div>
          <div class="url">${url}</div>
          ${sender}
          `);
          
          if(div.innerText.trim().length) {
            elemsToAppend.push({element: div, message});
          }
          
        }
        
        break;
      }

      default:
        //this.log.warn('death is my friend', messages);
        break;
    }

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    if(promises.length) {
      await Promise.all(promises);
      if(!middleware()) {
        //this.log.warn('peer changed');
        return;
      }
    }
    
    if(elemsToAppend.length) {
      const method = append ? 'append' : 'prepend';
      elemsToAppend.forEach(details => {
        const {element, message} = details;
        const monthContainer = this.getMonthContainerByTimestamp(this.groupByMonth ? message.date : 0, type);
        element.classList.add('search-super-item');
        element.dataset.mid = '' + message.mid;
        element.dataset.peerId = '' + message.peerId;
        monthContainer.items[method](element);
      });
    }
    
    //if(type !== 'inputMessagesFilterEmpty') {
      this.afterPerforming(type === 'inputMessagesFilterEmpty' ? 1 : messages.length, sharedMediaDiv);
    //}
  }

  private afterPerforming(length: number, contentTab: HTMLElement) {
    if(contentTab) {
      const parent = contentTab.parentElement;
      Array.from(parent.children).slice(1).forEach(child => {
        child.remove();
      });

      //this.contentContainer.classList.add('loaded');

      if(!length && !contentTab.childElementCount) {
        const div = document.createElement('div');
        div.innerText = 'Nothing interesting here yet...';
        div.classList.add('position-center', 'text-center', 'content-empty', 'no-select');

        parent.append(div);
      }
    }
  }

  private loadChats() {
    const renderedPeerIds: Set<number> = new Set();
    const middleware = this.middleware.get();

    for(let i in this.searchGroups) {
      const group = this.searchGroups[i as SearchGroupType];
      this.tabs.inputMessagesFilterEmpty.append(group.container);
      group.clear();
    }

    const query = this.searchContext.query;
    if(query) {
      const setResults = (results: number[], group: SearchGroup, showMembersCount = false) => {
        results.forEach((peerId) => {
          if(renderedPeerIds.has(peerId)) {
            return;
          }
  
          renderedPeerIds.add(peerId);
  
          const peer = appPeersManager.getPeer(peerId);
  
          //////////this.log('contacts peer', peer);
  
          const {dom} = appDialogsManager.addDialogNew({
            dialog: peerId, 
            container: group.list, 
            drawStatus: false,
            avatarSize: 48,
            autonomous: group.autonomous
          });
  
          if(showMembersCount && (peer.participants_count || peer.participants)) {
            const regExp = new RegExp(`(${escapeRegExp(query)}|${escapeRegExp(searchIndexManager.cleanSearchText(query))})`, 'gi');
            dom.titleSpan.innerHTML = dom.titleSpan.innerHTML.replace(regExp, '<i>$1</i>');
            dom.lastMessageSpan.append(appChatsManager.getChatMembersString(-peerId));
          } else if(peerId === rootScope.myId) {
            dom.lastMessageSpan.append(i18n('Presence.YourChat'));
          } else {
            let username = appPeersManager.getPeerUsername(peerId);
            if(!username) {
              const user = appUsersManager.getUser(peerId);
              if(user && user.phone) {
                username = '+' + formatPhoneNumber(user.phone).formatted;
              }
            } else {
              username = '@' + username;
            }
  
            dom.lastMessageSpan.innerHTML = '<i>' + username + '</i>';
          }
        });
  
        group.toggle();
      };
  
      const onLoad = <T>(arg: T) => {
        if(!middleware()) {
          return;
        }
  
        //this.loadedContacts = true;
  
        return arg;
      };
  
      return Promise.all([
        appUsersManager.getContacts(query, true)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            setResults(contacts, this.searchGroups.contacts, true);
          }
        }),
  
        appUsersManager.searchContacts(query, 20)
        .then(onLoad)
        .then((contacts) => {
          if(contacts) {
            setResults(contacts.my_results, this.searchGroups.contacts, true);
            setResults(contacts.results/* .concat(contacts.results, contacts.results, contacts.results) */, this.searchGroups.globalContacts);

            if(this.searchGroups.globalContacts.nameEl.lastElementChild) {
              this.searchGroups.globalContacts.nameEl.lastElementChild.remove();
            }

            this.searchGroups.globalContacts.container.classList.add('is-short');
            
            if(this.searchGroups.globalContacts.list.childElementCount > 3) {
              const showMore = document.createElement('div');
              showMore.classList.add('search-group__show-more');
              showMore.innerText = 'Show more';
              this.searchGroups.globalContacts.nameEl.append(showMore);
              showMore.addEventListener('click', () => {
                const isShort = this.searchGroups.globalContacts.container.classList.toggle('is-short');
                showMore.innerText = isShort ? 'Show more' : 'Show less';
              });
            }
          }
        }),
  
        appMessagesManager.getConversations(query, 0, 20, 0)
        .then(onLoad)
        .then(value => {
          if(value) {
            setResults(value.dialogs.map(d => d.peerId), this.searchGroups.contacts, true);
          }
        })
      ]);
    } else if(!this.searchContext.peerId && !this.searchContext.minDate) {
      const renderRecentSearch = (setActive = true) => {
        return appStateManager.getState().then(state => {
          if(!middleware()) {
            return;
          }
    
          this.searchGroups.recent.list.innerHTML = '';
    
          state.recentSearch.slice(0, 20).forEach(peerId => {
            let {dialog, dom} = appDialogsManager.addDialogNew({
              dialog: peerId,
              container: this.searchGroups.recent.list,
              drawStatus: false,
              meAsSaved: true,
              avatarSize: 48,
              autonomous: true
            });
    
            dom.lastMessageSpan.append(peerId > 0 ? appUsersManager.getUserStatusString(peerId) : appChatsManager.getChatMembersString(peerId));
          });
    
          if(!state.recentSearch.length) {
            this.searchGroups.recent.clear();
          } else if(setActive) {
            this.searchGroups.recent.setActive();
          }
        });
      };

      return Promise.all([
        appUsersManager.getTopPeers().then(peers => {
          if(!middleware()) return;

          //console.log('got top categories:', categories);
          if(peers.length) {
            peers.forEach((peerId) => {
              appDialogsManager.addDialogNew({
                dialog: peerId, 
                container: this.searchGroups.people.list, 
                drawStatus: false,
                onlyFirstName: true,
                avatarSize: 54,
                autonomous: false
              });
            });
          }
    
          this.searchGroups.people.setActive();
        }),

        renderRecentSearch()
      ]);
    } else return Promise.resolve();
  }

  private loadType(mediaTab: SearchSuperMediaTab, justLoad: boolean, loadCount: number, middleware: () => boolean) {
    const type = mediaTab.inputFilter;

    if(this.loadPromises[type]) {
      return this.loadPromises[type];
    }

    const history = this.historyStorage[type] ?? (this.historyStorage[type] = []);

    if(type === 'inputMessagesFilterEmpty' && !history.length) {
      if(!this.loadedChats) {
        this.loadChats();
        this.loadedChats = true;
      }

      if(!this.searchContext.query.trim() && !this.searchContext.peerId && !this.searchContext.minDate) {
        this.loaded[type] = true;
        return Promise.resolve();
      }
    }

    const logStr = 'load [' + type + ']: ';

    // render from cache
    if(history.length && this.usedFromHistory[type] < history.length && !justLoad) {
      let messages: any[] = [];
      let used = Math.max(0, this.usedFromHistory[type]);
      let slicedLength = 0;

      do {
        let ids = history.slice(used, used + loadCount);
        //this.log(logStr + 'will render from cache', used, history, ids, loadCount);
        used += ids.length;
        slicedLength += ids.length;

        messages.push(...this.filterMessagesByType(ids.map(m => appMessagesManager.getMessageByPeer(m.peerId, m.mid)), type));
      } while(slicedLength < loadCount && used < history.length);
      
      // если перебор
      /* if(slicedLength > loadCount) {
        let diff = messages.length - loadCount;
        messages = messages.slice(0, messages.length - diff);
        used -= diff;
      } */

      this.usedFromHistory[type] = used;
      //if(messages.length) {
        return this.performSearchResult(messages, type).finally(() => {
          setTimeout(() => {
            this.scrollable.checkForTriggers();
          }, 0);
        });
      //}

      return Promise.resolve();
    }
    
    let maxId = history.length ? history[history.length - 1].mid : 0;
    
    //this.log(logStr + 'search house of glass pre', type, maxId);
    
    //let loadCount = history.length ? 50 : 15;
    return this.loadPromises[type] = appMessagesManager.getSearch({
      peerId: this.searchContext.peerId, 
      query: this.searchContext.query,
      inputFilter: {_: type},
      maxId, 
      limit: loadCount,
      nextRate: this.nextRates[type] ?? (this.nextRates[type] = 0),
      threadId: this.searchContext.threadId,
      folderId: this.searchContext.folderId,
      minDate: this.searchContext.minDate,
      maxDate: this.searchContext.maxDate
    }).then(value => {
      history.push(...value.history.map(m => ({mid: m.mid, peerId: m.peerId})));
      
      this.log(logStr + 'search house of glass', type, value);

      if(!middleware()) {
        //this.log.warn('peer changed');
        return;
      }

      // ! Фикс случая, когда не загружаются документы при открытой панели разработчиков (происходит из-за того, что не совпадают критерии отбора документов в getSearch)
      if(value.history.length < loadCount) {
      //if((value.count || history.length === value.count) && history.length >= value.count) {
        //this.log(logStr + 'loaded all media', value, loadCount);
        this.loaded[type] = true;
      }

      this.nextRates[type] = value.next_rate;

      if(justLoad) {
        return Promise.resolve();
      }

      this.usedFromHistory[type] = history.length;

      if(!this.loaded[type]) {
        (this.loadPromises[type] || Promise.resolve()).then(() => {
          setTimeout(() => {
            if(!middleware()) return;
            //this.log('will preload more');
            if(this.mediaTab === mediaTab) {
              const promise = this.load(true, true);
              if(promise) {
                promise.then(() => {
                  if(!middleware()) return;
                  //this.log('preloaded more');
                  setTimeout(() => {
                    this.scrollable.checkForTriggers();
                  }, 0);
                });
              }
            }
          }, 0);
        });
      }

      //if(value.history.length) {
        return this.performSearchResult(this.filterMessagesByType(value.history, type), type);
      //}
    }).catch(err => {
      this.log.error('load error:', err);
    }).finally(() => {
      this.loadPromises[type] = null;
    });
  }
  
  public load(single = false, justLoad = false) {
    // if(testScroll/*  || 1 === 1 */) {
    //   return;
    // }

    //return;
    
    const peerId = this.searchContext.peerId;
    this.log('load', single, peerId, this.loadPromises);
    
    let toLoad = single ? [this.mediaTab] : this.mediaTabs.filter(t => t !== this.mediaTab);
    toLoad = toLoad.filter(mediaTab => {
      const inputFilter = mediaTab.inputFilter;
      return !this.loaded[inputFilter] || (this.historyStorage[inputFilter] && this.usedFromHistory[inputFilter] < this.historyStorage[inputFilter].length);
    });

    if(!toLoad.length) {
      return;
    }

    const loadCount = justLoad ? 50 : Math.round((appPhotosManager.windowH / 130 | 0) * 3 * 1.25); // that's good for all types
    const middleware = this.middleware.get();

    const promises: Promise<any>[] = toLoad.map(mediaTab => {
      return this.loadType(mediaTab, justLoad, loadCount, middleware)
    });
    
    return Promise.all(promises).catch(err => {
      this.log.error('Load error all promises:', err);
    });
  }
  
  public getMonthContainerByTimestamp(timestamp: number, type: SearchSuperType) {
    const date = new Date(timestamp * 1000);
    date.setHours(0, 0, 0);
    date.setDate(1);
    const dateTimestamp = date.getTime();
    const containers = this.monthContainers[type] ?? (this.monthContainers[type] = {});
    if(!(dateTimestamp in containers)) {
      const str = months[date.getMonth()] + ' ' + date.getFullYear();
      
      const container = document.createElement('div');
      container.className = 'search-super-month';

      const name = document.createElement('div');
      name.classList.add('search-super-month-name');
      name.innerText = str;
      container.append(name);

      const items = document.createElement('div');
      items.classList.add('search-super-month-items');

      container.append(name, items);

      const haveTimestamps = getObjectKeysAndSort(containers, 'desc');
      let i = 0;
      for(; i < haveTimestamps.length; ++i) {
        const t = haveTimestamps[i];
        if(dateTimestamp > t) {
          break;
        }
      }
      
      containers[dateTimestamp] = {container, items};
      positionElementByIndex(container, this.tabs[type], i);
    }

    return containers[dateTimestamp];
  }

  public cleanup() {
    this.loadPromises = {};
    this.loaded = {};
    this.loadedChats = false;
    this.nextRates = {};

    this.lazyLoadQueue.clear();

    this.mediaTabs.forEach(mediaTab => {
      this.usedFromHistory[mediaTab.inputFilter] = -1;
    });

    this.middleware.clean();
    this.cleanScrollPositions();
  }

  public cleanScrollPositions() {
    this.mediaTabs.forEach(mediaTab => {
      mediaTab.scroll = undefined;
    });
  }

  public cleanupHTML() {
    if(this.urlsToRevoke.length) {
      this.urlsToRevoke.forEach(url => {
        URL.revokeObjectURL(url);
      });
      this.urlsToRevoke.length = 0;
    }

    this.mediaTabs.forEach((tab) => {
      tab.contentTab.innerHTML = '';

      if(tab.type === 'chats') {
        return;
      }
      
      if(!this.historyStorage[tab.inputFilter]) {
        const parent = tab.contentTab.parentElement;
        //if(!testScroll) {
          if(!parent.querySelector('.preloader')) {
            putPreloader(parent, true);
          }
        //}

        const empty = parent.querySelector('.content-empty');
        if(empty) {
          empty.remove();
        }
      }
    });

    this.monthContainers = {};
    this.searchGroupMedia.clear();
    this.scrollable.scrollTop = 0;

    /* if(testScroll) {
      for(let i = 0; i < 1500; ++i) {
        let div = document.createElement('div');
        div.insertAdjacentHTML('beforeend', `<img class="media-image" src="assets/img/camomile.jpg">`);
        div.classList.add('grid-item');
        div.dataset.id = '' + (i / 3 | 0);
        //div.innerText = '' + (i / 3 | 0);
        this.tabs.inputMessagesFilterPhotoVideo.append(div);
      }
    } */
  }

  private copySearchContext(newInputFilter: MyInputMessagesFilter) {
    const context = copy(this.searchContext);
    context.inputFilter = newInputFilter;
    context.nextRate = this.nextRates[newInputFilter];
    return context;
  }

  public setQuery({peerId, query, threadId, historyStorage, folderId, minDate, maxDate}: {
    peerId: number, 
    query?: string, 
    threadId?: number, 
    historyStorage?: AppSearchSuper['historyStorage'], 
    folderId?: number,
    minDate?: number,
    maxDate?: number
  }) {
    this.searchContext = {
      peerId: peerId || 0,
      query: query || '',
      inputFilter: this.mediaTab.inputFilter,
      threadId,
      folderId,
      minDate,
      maxDate
    };
    
    this.historyStorage = historyStorage ?? {};

    this.cleanup();
  }
}
