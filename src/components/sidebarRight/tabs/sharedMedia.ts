import { limitSymbols } from "../../../helpers/string";
import appImManager from "../../../lib/appManagers/appImManager";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { logger } from "../../../lib/logger";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import rootScope from "../../../lib/rootScope";
import AppMediaViewer from "../../appMediaViewer";
import AvatarElement from "../../avatar";
import { horizontalMenu } from "../../horizontalMenu";
import LazyLoadQueue from "../../lazyLoadQueue";
import { putPreloader, renderImageFromUrl } from "../../misc";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";
import { wrapDocument } from "../../wrappers";

const testScroll = false;

let setText = (text: string, el: HTMLDivElement) => {
  window.requestAnimationFrame(() => {
    if(el.childElementCount > 1) {
      el.firstElementChild.remove();
    }
    
    let p = document.createElement('p');
    p.innerHTML = text;
    el.prepend(p);
    
    el.style.display = '';
  });
};

type SharedMediaType = /* 'inputMessagesFilterContacts' |  */'inputMessagesFilterEmpty' | 'inputMessagesFilterPhotoVideo' | 'inputMessagesFilterDocument' | 'inputMessagesFilterUrl' | 'inputMessagesFilterMusic';

// TODO: отредактированное сообщение не изменится

export default class AppSharedMediaTab implements SliderTab {
  public container: HTMLElement;
  public closeBtn: HTMLElement;

  private peerId = 0;

  public profileContentEl: HTMLDivElement;
  public contentContainer: HTMLDivElement;
  public profileElements: {
    avatar: AvatarElement,
    name: HTMLDivElement,
    subtitle: HTMLDivElement,
    bio: HTMLDivElement,
    username: HTMLDivElement,
    phone: HTMLDivElement,
    notificationsRow: HTMLDivElement,
    notificationsCheckbox: HTMLInputElement,
    notificationsStatus: HTMLParagraphElement
  } = {} as any;
  public sharedMedia: {
    [t in SharedMediaType]: HTMLDivElement
  } = {} as any;
  
  private loadSidebarMediaPromises: {[type: string]: Promise<void>} = {};
  private loadedAllMedia: {[type: string]: boolean} = {};
  
  public sharedMediaTypes: SharedMediaType[] = [
    //'members',
    'inputMessagesFilterEmpty',
    //'inputMessagesFilterContacts', 
    'inputMessagesFilterPhotoVideo', 
    'inputMessagesFilterDocument', 
    'inputMessagesFilterUrl', 
    'inputMessagesFilterMusic'
  ];
  public sharedMediaType: SharedMediaType = 'inputMessagesFilterPhotoVideo';
  private sharedMediaSelected: HTMLDivElement = null;
  
  private lazyLoadQueue = new LazyLoadQueue();
  
  public historiesStorage: {
    [peerId: number]: Partial<{
      [type in SharedMediaType]: number[]
    }>
  } = {};
  public usedFromHistory: Partial<{
    [type in SharedMediaType]: number
  }> = {};

  public scroll: Scrollable = null;

  private profileTabs: HTMLUListElement;
  private prevTabId = -1;
  
  private mediaDivsByIds: {
    [mid: number]: HTMLDivElement
  } = {};
  
  public urlsToRevoke: string[] = [];

  private loadMutex: Promise<any> = Promise.resolve();

  private log = logger('SM'/* , LogLevels.error */);
  setPeerStatusInterval: number;
  cleaned: boolean;

  public init() {
    this.container = document.getElementById('shared-media-container');
    this.closeBtn = this.container.querySelector('.sidebar-close-button');

    this.profileContentEl = this.container.querySelector('.profile-content');
    this.contentContainer = this.container.querySelector('.content-container');
    this.profileElements = {
      avatar: this.profileContentEl.querySelector('.profile-avatar'),
      name: this.profileContentEl.querySelector('.profile-name'),
      subtitle: this.profileContentEl.querySelector('.profile-subtitle'),
      bio: this.profileContentEl.querySelector('.profile-row-bio'),
      username: this.profileContentEl.querySelector('.profile-row-username'),
      phone: this.profileContentEl.querySelector('.profile-row-phone'),
      notificationsRow: this.profileContentEl.querySelector('.profile-row-notifications'),
      notificationsCheckbox: this.profileContentEl.querySelector('#profile-notifications'),
      notificationsStatus: this.profileContentEl.querySelector('.profile-row-notifications > p')
    };

    this.sharedMedia = {
      //contentMembers: this.profileContentEl.querySelector('#content-members'),
      //inputMessagesFilterEmpty: null,
      inputMessagesFilterPhotoVideo: this.profileContentEl.querySelector('#content-media'),
      inputMessagesFilterDocument: this.profileContentEl.querySelector('#content-docs'),
      inputMessagesFilterUrl: this.profileContentEl.querySelector('#content-links'),
      inputMessagesFilterMusic: this.profileContentEl.querySelector('#content-audio'),
    } as any;

    let container = this.profileContentEl.querySelector('.content-container .tabs-container') as HTMLDivElement;
    this.profileTabs = this.profileContentEl.querySelector('.profile-tabs');
    
    this.scroll = new Scrollable(this.container, 'SR', 400);
    this.scroll.onScrolledBottom = () => {
      if(this.sharedMediaSelected && this.sharedMediaSelected.childElementCount/* && false */) {
        //this.log('onScrolledBottom will load media');
        this.loadSidebarMedia(true);
      }
    };
    //this.scroll.attachSentinels(undefined, 400);
    
    horizontalMenu(this.profileTabs, container, (id, tabContent) => {
      if(this.prevTabId == id) return;

      if(this.prevTabId != -1) {
        this.onTransitionStart();
      }
      
      this.sharedMediaType = this.sharedMediaTypes[id];
      this.sharedMediaSelected = tabContent.firstElementChild as HTMLDivElement;

      if(this.prevTabId != -1 && this.profileTabs.offsetTop) {
        this.scroll.scrollTop -= this.profileTabs.offsetTop;
      }

      /* this.log('setVirtualContainer', id, this.sharedMediaSelected, this.sharedMediaSelected.childElementCount);
      this.scroll.setVirtualContainer(this.sharedMediaSelected); */

      if(this.prevTabId != -1 && !this.sharedMediaSelected.childElementCount) { // quick brown fix
        //this.contentContainer.classList.remove('loaded');
        this.loadSidebarMedia(true);
      }

      this.prevTabId = id;
    }, () => {
      this.scroll.onScroll();
      this.onTransitionEnd();
    });

    this.sharedMedia.inputMessagesFilterPhotoVideo.addEventListener('click', (e) => {
      const target = e.target as HTMLDivElement;
      
      const messageId = +target.dataset.mid;
      if(!messageId) {
        this.log.warn('no messageId by click on target:', target);
        return;
      }
      
      const message = appMessagesManager.getMessage(messageId);
      
      const ids = Object.keys(this.mediaDivsByIds).map(k => +k).sort((a, b) => a - b);
      const idx = ids.findIndex(i => i == messageId);
      
      const targets = ids.map(id => {
        const element = this.mediaDivsByIds[id] as HTMLElement;
        //element = element.querySelector('img') || element;
        return {element, mid: id};
      });
      
      new AppMediaViewer().openMedia(message, target, false, targets.slice(idx + 1).reverse(), targets.slice(0, idx).reverse(), true);
    });
    
    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appMessagesManager.mutePeer(this.peerId);
    });

    rootScope.on('dialog_notify_settings', (e) => {
      if(this.peerId == e.detail) {
        const muted = appMessagesManager.isPeerMuted(this.peerId);
        this.profileElements.notificationsCheckbox.checked = !muted;
        this.profileElements.notificationsStatus.innerText = muted ? 'Disabled' : 'Enabled';
      }
    });

    rootScope.on('peer_typings', (e) => {
      const {peerId} = e.detail;

      if(this.peerId == peerId) {
        this.setPeerStatus();
      }
    });

    rootScope.on('user_update', (e) => {
      const userId = e.detail;

      if(this.peerId == userId) {
        this.setPeerStatus();
      }
    });

    this.setPeerStatusInterval = window.setInterval(this.setPeerStatus, 60e3);

    /* this.closeBtn.addEventListener('click', () => {
      this.toggleSidebar(false);
    }); */
  }

  public setPeerStatus = (needClear = false) => {
    if(!this.peerId) return;

    const peerId = this.peerId;
    if(needClear) {
      this.profileElements.subtitle.innerHTML = '';
    }

    appImManager.getPeerStatus(this.peerId).then((subtitle) => {
      if(peerId != this.peerId) {
        return;
      }

      this.profileElements.subtitle.innerHTML = subtitle;
    });
  };

  public renderNewMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;
    
    mids = mids.slice().reverse(); // ! because it will be ascend sorted array
    for(const sharedMediaType of this.sharedMediaTypes) {
      const filtered = this.filterMessagesByType(mids, sharedMediaType);
      if(filtered.length) {
        if(this.historiesStorage[peerId][sharedMediaType]) {
          this.historiesStorage[peerId][sharedMediaType].unshift(...mids);
        }

        if(this.peerId == peerId && this.usedFromHistory[sharedMediaType] !== -1) {
          this.usedFromHistory[sharedMediaType] += filtered.length;
          this.performSearchResult(filtered, sharedMediaType, false);
        }

        break;
      }
    }
  }

  public deleteDeletedMessages(peerId: number, mids: number[]) {
    if(this.init) return; // * not inited yet

    if(!this.historiesStorage[peerId]) return;

    for(const mid of mids) {
      for(const sharedMediaType of this.sharedMediaTypes) {
        if(!this.historiesStorage[peerId][sharedMediaType]) continue;

        const history = this.historiesStorage[peerId][sharedMediaType];
        const idx = history.findIndex(m => m == mid);
        if(idx !== -1) {
          history.splice(idx, 1);

          if(this.peerId == peerId) {
            const container = this.sharedMedia[sharedMediaType];
            const div = container.querySelector(`div[data-mid="${mid}"]`);
            if(div) {
              if(sharedMediaType == 'inputMessagesFilterPhotoVideo') {
                delete this.mediaDivsByIds[mid];
              }
  
              div.remove();
            }
  
            if(this.usedFromHistory[sharedMediaType] >= (idx + 1)) {
              this.usedFromHistory[sharedMediaType]--;
            }
          }

          break;
        }
      }
    }

    this.scroll.onScroll();
  }

  private onTransitionStart = () => {
    // Jolly Cobra's // Workaround for scrollable content flickering during animation.
    const container = this.scroll.container;
    if(container.style.overflowY !== 'hidden') {
      const scrollBarWidth = container.offsetWidth - container.clientWidth;
      container.style.overflowY = 'hidden';
      container.style.paddingRight = `${scrollBarWidth}px`;
    }
  };

  private onTransitionEnd = () => {
    // Jolly Cobra's // Workaround for scrollable content flickering during animation.
    const container = this.scroll.container;
    container.style.overflowY = '';
    container.style.paddingRight = '0';
  };

  public filterMessagesByType(ids: number[], type: SharedMediaType) {
    let messages: any[] = [];

    if(type != 'inputMessagesFilterUrl') {
      for(let mid of ids) {
        let message = appMessagesManager.getMessage(mid);
        if(message.media) messages.push(message);
      }
    } else {
      messages = ids.slice().map(mid => appMessagesManager.getMessage(mid));
    }

    let filtered: any[] = [];

    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        for(let message of messages) {
          let media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);
          if(!media) {
            //this.log('no media!', message);
            continue;
          }
          
          if(media._ == 'document' && media.type != 'video'/*  && media.type != 'gif' */) {
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
        this.log('inputMessagesFilterUrl', messages);
        for(let message of messages) {
          //if((message.media.webpage && message.media.webpage._ != 'webPageEmpty')) {
            filtered.push(message);
          //}
        }
        
        break;
      }

      case 'inputMessagesFilterMusic': {
        for(let message of messages) {
          if(!message.media.document || message.media.document.type != 'audio') {
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
  
  public async performSearchResult(messages: any[], type: SharedMediaType, append = true) {
    const peerId = this.peerId;
    const elemsToAppend: HTMLElement[] = [];
    const promises: Promise<any>[] = [];
    const sharedMediaDiv = this.sharedMedia[type];

    /* for(let contentType in contentToSharedMap) {
      if(contentToSharedMap[contentType as ContentType] == type) {
        sharedMediaDiv = this.sharedMedia[contentType as ContentType];
      }
    } */

    // https://core.telegram.org/type/MessagesFilter
    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        for(const message of messages) {
          const media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);

          const div = document.createElement('div');
          div.classList.add('grid-item');
          div.dataset.mid = '' + message.mid;
          //console.log(message, photo);

          const isPhoto = media._ == 'photo';
          
          const photo = isPhoto ? appPhotosManager.getPhoto(media.id) : null;
          let isDownloaded: boolean;
          if(photo) {
            isDownloaded = photo.downloaded > 0;
          } else {
            const cachedThumb = appPhotosManager.getDocumentCachedThumb(media.id);
            isDownloaded = cachedThumb?.downloaded > 0;
          }
          
          //this.log('inputMessagesFilterPhotoVideo', message, media);

          if(!isPhoto) {
            const span = document.createElement('span');
            span.classList.add('video-time');
            div.append(span);

            if(media.type != 'gif') {
              span.innerText = (media.duration + '').toHHMMSS(false);

              /* const spanPlay = document.createElement('span');
              spanPlay.classList.add('video-play', 'tgico-largeplay', 'btn-circle', 'position-center');
              div.append(spanPlay); */
            } else {
              span.innerText = 'GIF';
            }
          }
          
          const load = () => appPhotosManager.preloadPhoto(isPhoto ? media.id : media, appPhotosManager.choosePhotoSize(media, 200, 200))
          .then(() => {
            if(appImManager.chat.peerId != peerId) {
              this.log.warn('peer changed');
              return;
            }

            const url = (photo && photo.url) || appPhotosManager.getDocumentCachedThumb(media.id).url;
            if(url) {
              //if(needBlur) return;
              
              const needBlurCallback = needBlur ? () => {
                //void img.offsetLeft; // reflow
                img.style.opacity = '';

                if(thumb) {
                  window.setTimeout(() => {
                    thumb.remove();
                  }, 200);
                }
              } : undefined;
              renderImageFromUrl(img, url, needBlurCallback);
            }
          });
          
          let thumb: HTMLImageElement;
          const sizes = media.sizes || media.thumbs;
          
          const willHaveThumb = !isDownloaded && sizes && sizes[0].bytes;
          if(willHaveThumb) {
            thumb = new Image();
            thumb.classList.add('grid-item-media', 'thumbnail');
            thumb.dataset.mid = '' + message.mid;
            appPhotosManager.setAttachmentPreview(sizes[0].bytes, thumb, false, false);
            div.append(thumb);
          }

          const needBlur = !isDownloaded || !willHaveThumb;
          const img = new Image();
          img.dataset.mid = '' + message.mid;
          img.classList.add('grid-item-media');
          if(needBlur) img.style.opacity = '0';
          div.append(img);

          if(isDownloaded || willHaveThumb) {
            const promise = new Promise((resolve, reject) => {
              (thumb || img).addEventListener('load', () => {
                clearTimeout(timeout);
                resolve();
              });

              const timeout = setTimeout(() => {
                this.log('didn\'t load', thumb, media, isDownloaded, sizes);
                reject();
              }, 1e3);
            });

            promises.push(promise);
          }

          if(sizes?.length) {
            if(isDownloaded) load();
            else this.lazyLoadQueue.push({div, load});
          }

          elemsToAppend.push(div);
          this.mediaDivsByIds[message.mid] = div;
        }
        
        break;
      }
      
      case 'inputMessagesFilterMusic':
      case 'inputMessagesFilterDocument': {
        for(const message of messages) {
          const div = wrapDocument(message.media.document, true, false, message.mid, 400);
          div.dataset.mid = '' + message.mid;
          elemsToAppend.push(div);
        }
        break;
      }
      
      case 'inputMessagesFilterUrl': {
        for(let message of messages) {
          let webpage: any;

          if(message.media?.webpage && message.media.webpage._ != 'webPageEmpty') {
            webpage = message.media.webpage;
          } else {
            const entity = message.totalEntities.find((e: any) => e._ == 'messageEntityUrl' || e._ == 'messageEntityTextUrl');
            let url: string, display_url: string, sliced: string;

            if(!entity) {
              this.log.error('NO ENTITY:', message);
              const match = RichTextProcessor.matchUrl(message.message);
              if(!match) {
                this.log.error('NO ENTITY AND NO MATCH:', message);
                continue;
              }

              url = match[0];
            } else {
              sliced = message.message.slice(entity.offset, entity.offset + entity.length);
            }

            if(entity?._ == 'messageEntityTextUrl') {
              url = entity.url;
              //display_url = sliced;
            } else {
              url = url || sliced;
            }

            display_url = url;

            const same = message.message == url;
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
          div.dataset.mid = '' + message.mid;
          
          let previewDiv = document.createElement('div');
          previewDiv.classList.add('preview');
          
          //this.log('wrapping webpage', webpage);
          
          previewDiv.innerHTML = RichTextProcessor.getAbbreviation(webpage.title || webpage.display_url || webpage.description || webpage.url, true);
          previewDiv.classList.add('empty');
          if(webpage.photo) {
            let load = () => appPhotosManager.preloadPhoto(webpage.photo.id, appPhotosManager.choosePhotoSize(webpage.photo, 60, 60))
            .then(() => {
              if(appImManager.chat.peerId != peerId) {
                this.log.warn('peer changed');
                return;
              }

              previewDiv.classList.remove('empty');

              previewDiv.innerText = '';
              renderImageFromUrl(previewDiv, webpage.photo.url);
            });
            
            this.lazyLoadQueue.push({div: previewDiv, load});
          }
          
          let title = webpage.rTitle || '';
          let subtitle = webpage.rDescription || '';
          let url = RichTextProcessor.wrapRichText(webpage.url || '');
          
          if(!title) {
            //title = new URL(webpage.url).hostname;
            title = RichTextProcessor.wrapPlainText(webpage.display_url.split('/', 1)[0]);
          }

          if(webpage.description?.includes('Еще в начале')) {
            this.log.error('FROM THE START', webpage);
          }
          
          div.append(previewDiv);
          div.insertAdjacentHTML('beforeend', `
          <div class="title">${title}</button>
          <div class="subtitle">${subtitle}</div>
          <div class="url">${url}</div>
          `);
          
          if(div.innerText.trim().length) {
            elemsToAppend.push(div);
          }
          
        }
        
        break;
      }

      default:
        //console.warn('death is my friend', messages);
        break;
    }

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    if(promises.length) {
      await Promise.all(promises);
      if(this.peerId != peerId) {
        this.log.warn('peer changed');
        return;
      }
    }
    
    if(elemsToAppend.length) {
      sharedMediaDiv[append ? 'append' : 'prepend'](...elemsToAppend);
    }
    
    if(sharedMediaDiv) {
      const parent = sharedMediaDiv.parentElement;
      Array.from(parent.children).slice(1).forEach(child => {
        child.remove();
      });

      //this.contentContainer.classList.add('loaded');

      if(!messages.length && !sharedMediaDiv.childElementCount) {
        const div = document.createElement('div');
        div.innerText = 'Nothing interesting here yet...';
        div.classList.add('position-center', 'text-center', 'content-empty', 'no-select');

        parent.append(div);
      }
    }
  }
  
  public loadSidebarMedia(single = false, justLoad = false) {
    if(testScroll/*  || 1 == 1 */) {
      return;
    }
    
    this.log('loadSidebarMedia', single, this.peerId, this.loadSidebarMediaPromises);
    
    const peerId = this.peerId;
    
    let typesToLoad = single ? [this.sharedMediaType] : this.sharedMediaTypes;
    typesToLoad = typesToLoad.filter(type => !this.loadedAllMedia[type] 
      || this.usedFromHistory[type] < this.historiesStorage[peerId][type].length);

    if(!typesToLoad.length) return;

    const loadCount = justLoad ? 50 : Math.round((appPhotosManager.windowH / 130 | 0) * 3 * 1.25); // that's good for all types
    
    const historyStorage = this.historiesStorage[peerId] ?? (this.historiesStorage[peerId] = {});

    const promises = typesToLoad.map(type => {
      if(this.loadSidebarMediaPromises[type]) return this.loadSidebarMediaPromises[type];
      
      const history = historyStorage[type] ?? (historyStorage[type] = []);

      const logStr = 'loadSidebarMedia [' + type + ']: ';

      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length && !justLoad) {
        let messages: any[] = [];
        let used = Math.max(0, this.usedFromHistory[type]);
        let slicedLength = 0;

        do {
          let ids = history.slice(used, used + loadCount);
          this.log(logStr + 'will render from cache', used, history, ids, loadCount);
          used += ids.length;
          slicedLength += ids.length;

          messages.push(...this.filterMessagesByType(ids, type));
        } while(slicedLength < loadCount && used < history.length);
        
        // если перебор
        /* if(slicedLength > loadCount) {
          let diff = messages.length - loadCount;
          messages = messages.slice(0, messages.length - diff);
          used -= diff;
        } */

        this.usedFromHistory[type] = used;
        //if(messages.length) {
          return this.performSearchResult(messages, type);
        //}

        return Promise.resolve();
      }
      
      // заливать новую картинку сюда только после полной отправки!
      let maxId = history[history.length - 1] || 0;
      
      this.log(logStr + 'search house of glass pre', type, maxId);
      
      //let loadCount = history.length ? 50 : 15;
      return this.loadSidebarMediaPromises[type] = appMessagesManager.getSearch(peerId, '', {_: type}, maxId, loadCount)
      .then(value => {
        history.push(...value.history);
        
        this.log(logStr + 'search house of glass', type, value);

        if(appImManager.chat.peerId != peerId) {
          this.log.warn('peer changed');
          return;
        }

        // ! Фикс случая, когда не загружаются документы при открытой панели разработчиков (происходит из-за того, что не совпадают критерии отбора документов в getSearch)
        if(value.history.length < loadCount) {
        //if((value.count || history.length == value.count) && history.length >= value.count) {
          this.log(logStr + 'loaded all media', value, loadCount);
          this.loadedAllMedia[type] = true;
        }

        if(justLoad) {
          return Promise.resolve();
        }

        this.usedFromHistory[type] = history.length;

        if(!this.loadedAllMedia[type]) {
          this.loadSidebarMediaPromises[type].then(() => {
            setTimeout(() => {
              this.log('will preload more');
              this.loadSidebarMedia(true, true).then(() => {
                this.log('preloaded more');
                this.scroll.checkForTriggers();
              });
            }, 0);
          });
        }

        //if(value.history.length) {
          return this.performSearchResult(this.filterMessagesByType(value.history, type), type);
        //}
      }).catch(err => {
        this.log.error('load error:', err);
      }).finally(() => {
        this.loadSidebarMediaPromises[type] = null;
      });
    });
    
    return Promise.all(promises).catch(err => {
      this.log.error('Load error all promises:', err);
    });
  }

  public cleanup() {
    this.loadSidebarMediaPromises = {};
    this.loadedAllMedia = {};

    this.prevTabId = -1;
    this.mediaDivsByIds = {};
    this.lazyLoadQueue.clear();

    this.sharedMediaTypes.forEach(type => {
      this.usedFromHistory[type] = -1;
    });

    this.sharedMediaType = 'inputMessagesFilterPhotoVideo';
    this.cleaned = true;
  }

  public cleanupHTML() {
    //this.contentContainer.classList.remove('loaded');

    //this.profileContentEl.parentElement.scrollTop = 0;
    this.profileElements.bio.style.display = 'none';
    this.profileElements.phone.style.display = 'none';
    this.profileElements.username.style.display = 'none';
    this.profileElements.notificationsRow.style.display = '';
    this.profileElements.notificationsCheckbox.checked = true;
    this.profileElements.notificationsStatus.innerText = 'Enabled';

    if(this.urlsToRevoke.length) {
      this.urlsToRevoke.forEach(url => {
        URL.revokeObjectURL(url);
      });
      this.urlsToRevoke.length = 0;
    }

    (Object.keys(this.sharedMedia) as SharedMediaType[]).forEach(sharedMediaType => {
      this.sharedMedia[sharedMediaType].innerHTML = '';
      
      if(!this.historiesStorage[this.peerId] || !this.historiesStorage[this.peerId][sharedMediaType]) {
        const parent = this.sharedMedia[sharedMediaType].parentElement;
        if(!testScroll) {
          if(!parent.querySelector('.preloader')) {
            putPreloader(parent, true);
          }
        }

        const empty = parent.querySelector('.content-empty');
        if(empty) {
          empty.remove();
        }
      }
    });

    if(testScroll) {
      for(let i = 0; i < 1500; ++i) {
        let div = document.createElement('div');
        div.insertAdjacentHTML('beforeend', `<img class="media-image" src="assets/img/camomile.jpg">`);
        div.classList.add('grid-item');
        div.dataset.id = '' + (i / 3 | 0);
        //div.innerText = '' + (i / 3 | 0);
        this.sharedMedia.inputMessagesFilterPhotoVideo.append(div);
      }
    }

    (this.profileTabs.firstElementChild.children[1] as HTMLLIElement).click(); // set media
  }

  public setLoadMutex(promise: Promise<any>) {
    this.loadMutex = promise;
  }

  public setPeer(peerId: number) {
    if(this.peerId == peerId) return;

    if(this.init) {
      this.init();
      this.init = null;
    }

    this.peerId = peerId;
    this.cleanup();
  }

  public fillProfileElements() {
    if(!this.cleaned) return;
    this.cleaned = false;
    
    const peerId = this.peerId;

    this.cleanupHTML();

    this.profileElements.avatar.setAttribute('peer', '' + peerId);

    // username
    if(peerId != rootScope.myId) {
      let username = appPeersManager.getPeerUsername(peerId);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerId), this.profileElements.username);
      }
      
      let dialog = appMessagesManager.getDialogByPeerId(peerId)[0];
      if(dialog) {
        let muted = false;
        if(dialog.notify_settings && dialog.notify_settings.mute_until) {
          muted = new Date(dialog.notify_settings.mute_until * 1000) > new Date();
        }
      }
    } else {
      window.requestAnimationFrame(() => {
        this.profileElements.notificationsRow.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerId > 0) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerId);
      if(user.phone && peerId != rootScope.myId) {
        setText(user.rPhone, this.profileElements.phone);
      }
      
      appProfileManager.getProfile(peerId).then(userFull => {
        if(this.peerId != peerId) {
          this.log.warn('peer changed');
          return;
        }
        
        if(userFull.rAbout && peerId != rootScope.myId) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
      });
    } else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerId) ? 'none' : '';
      let chat = appPeersManager.getPeer(peerId);
      
      appProfileManager.getChatFull(chat.id).then((chatFull) => {
        if(this.peerId != peerId) {
          this.log.warn('peer changed');
          return;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }
      });
    }

    let title: string;
    if(peerId == rootScope.myId) title = 'Saved Messages';
    else title = appPeersManager.getPeerTitle(peerId);
    this.profileElements.name.innerHTML = title;

    this.setPeerStatus(true);
  }

  /* onOpen() {
    this.scroll.onScroll();
  } */

  onOpenAfterTimeout() {
    this.scroll.onScroll();
  }
}