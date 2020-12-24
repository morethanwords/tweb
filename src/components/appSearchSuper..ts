import { limitSymbols } from "../helpers/string";
import appMessagesManager, { MyInputMessagesFilter } from "../lib/appManagers/appMessagesManager";
import appPhotosManager from "../lib/appManagers/appPhotosManager";
import RichTextProcessor from "../lib/richtextprocessor";
import AppMediaViewer from "./appMediaViewer";
import { horizontalMenu } from "./horizontalMenu";
import LazyLoadQueue from "./lazyLoadQueue";
import { renderImageFromUrl, putPreloader } from "./misc";
import { ripple } from "./ripple";
import Scrollable from "./scrollable";
import { wrapDocument } from "./wrappers";

const testScroll = false;

export default class AppSearchSuper {
  public tabs: {[t in MyInputMessagesFilter]: HTMLDivElement} = {} as any;

  public type: MyInputMessagesFilter;
  public tabSelected: HTMLElement;

  public container: HTMLElement;
  private tabsContainer: HTMLElement;
  private tabsMenu: HTMLUListElement;
  private prevTabId = -1;
  
  public mediaDivsByIds: {[mid: number]: HTMLDivElement} = {};

  private lazyLoadQueue = new LazyLoadQueue();

  public historyStorage: Partial<{[type in MyInputMessagesFilter]: number[]}> = {};
  public usedFromHistory: Partial<{[type in MyInputMessagesFilter]: number}> = {};
  public urlsToRevoke: string[] = [];

  private peerId = 0;
  private threadId = 0;
  private query = '';
  public loadMutex: Promise<any> = Promise.resolve();

  private loadPromises: Partial<{[type in MyInputMessagesFilter]: Promise<void>}> = {};
  private loaded: Partial<{[type in MyInputMessagesFilter]: boolean}> = {};

  constructor(public types: {inputFilter: MyInputMessagesFilter, name: string}[], public scrollable: Scrollable) {
    this.container = document.createElement('div');
    this.container.classList.add('search-super');

    const nav = document.createElement('nav');
    nav.classList.add('search-super-tabs', 'menu-horizontal');
    this.tabsMenu = document.createElement('ul');
    nav.append(this.tabsMenu);

    for(const type of types) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      const i = document.createElement('i');

      span.innerText = type.name;
      span.append(i);

      li.append(span);

      ripple(li);

      this.tabsMenu.append(li);
    }

    this.tabsContainer = document.createElement('div');
    this.tabsContainer.classList.add('search-super-tabs-container', 'tabs-container');

    for(const type of types) {
      const container = document.createElement('div');
      container.classList.add('search-super-container-' + type.name.toLowerCase());

      const content = document.createElement('div');
      content.classList.add('search-super-content-' + type.name.toLowerCase());

      container.append(content);

      this.tabsContainer.append(container);

      this.tabs[type.inputFilter] = content;
    }

    this.container.append(nav, this.tabsContainer);

    // * construct end

    this.scrollable.onScrolledBottom = () => {
      if(this.tabSelected && this.tabSelected.childElementCount/* && false */) {
        //this.log('onScrolledBottom will load media');
        this.load(true);
      }
    };
    //this.scroll.attachSentinels(undefined, 400);
    
    horizontalMenu(this.tabsMenu, this.tabsContainer, (id, tabContent) => {
      if(this.prevTabId == id) return;

      if(this.prevTabId != -1) {
        this.onTransitionStart();
      }
      
      this.type = this.types[id].inputFilter;
      this.tabSelected = tabContent.firstElementChild as HTMLDivElement;

      if(this.prevTabId != -1 && nav.offsetTop) {
        this.scrollable.scrollTop -= nav.offsetTop;
      }

      /* this.log('setVirtualContainer', id, this.sharedMediaSelected, this.sharedMediaSelected.childElementCount);
      this.scroll.setVirtualContainer(this.sharedMediaSelected); */

      if(this.prevTabId != -1 && !this.tabSelected.childElementCount) { // quick brown fix
        //this.contentContainer.classList.remove('loaded');
        this.load(true);
      }

      this.prevTabId = id;
    }, () => {
      this.scrollable.onScroll();
      this.onTransitionEnd();
    });

    this.tabs.inputMessagesFilterPhotoVideo.addEventListener('click', (e) => {
      const target = e.target as HTMLDivElement;
      
      const messageId = +target.dataset.mid;
      if(!messageId) {
        console.warn('no messageId by click on target:', target);
        return;
      }
      
      const message = appMessagesManager.getMessageByPeer(this.peerId, messageId);
      
      const ids = Object.keys(this.mediaDivsByIds).map(k => +k).sort((a, b) => a - b);
      const idx = ids.findIndex(i => i == messageId);
      
      const targets = ids.map(id => {
        const element = this.mediaDivsByIds[id] as HTMLElement;
        //element = element.querySelector('img') || element;
        return {element, mid: id};
      });
      
      new AppMediaViewer().openMedia(message, target, false, targets.slice(idx + 1).reverse(), targets.slice(0, idx).reverse(), true/* , this.threadId */);
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
    container.style.overflowY = '';
    container.style.paddingRight = '0';
    this.container.classList.remove('sliding');
  };

  public filterMessagesByType(ids: number[], type: MyInputMessagesFilter) {
    let messages: any[] = [];

    if(type != 'inputMessagesFilterUrl') {
      for(let mid of ids) {
        let message = appMessagesManager.getMessageByPeer(this.peerId, mid);
        if(message.media) messages.push(message);
      }
    } else {
      messages = ids.slice().map(mid => appMessagesManager.getMessageByPeer(this.peerId, mid));
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
        console.log('inputMessagesFilterUrl', messages);
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
  
  public async performSearchResult(messages: any[], type: MyInputMessagesFilter, append = true) {
    const peerId = this.peerId;
    const threadId = this.threadId;
    const elemsToAppend: HTMLElement[] = [];
    const promises: Promise<any>[] = [];
    const sharedMediaDiv = this.tabs[type];

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
            if(this.peerId != peerId || this.threadId != threadId) {
              console.warn('peer changed');
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
            const promise = new Promise<void>((resolve, reject) => {
              (thumb || img).addEventListener('load', () => {
                clearTimeout(timeout);
                resolve();
              });

              const timeout = setTimeout(() => {
                //console.log('didn\'t load', thumb, media, isDownloaded, sizes);
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
          const div = wrapDocument({
            message,
            withTime: true,
            fontWeight: 400
          });
          if(message.media.document.type === 'audio') {
            div.classList.add('audio-48');
          }
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
            const entity = message.totalEntities ? message.totalEntities.find((e: any) => e._ == 'messageEntityUrl' || e._ == 'messageEntityTextUrl') : null;
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
              if(this.peerId != peerId || this.threadId != threadId) {
                console.warn('peer changed');
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

          /* if(webpage.description?.includes('Еще в начале')) {
            console.error('FROM THE START', webpage);
          } */
          
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
      if(this.peerId !== peerId || this.threadId !== threadId) {
        console.warn('peer changed');
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
  
  public load(single = false, justLoad = false) {
    if(testScroll/*  || 1 == 1 */) {
      return;
    }
    
    console.log('loadSidebarMedia', single, this.peerId, this.loadPromises);
    
    const peerId = this.peerId;
    const threadId = this.threadId;
    
    let typesToLoad = single ? [this.type] : this.types.filter(t => t.inputFilter !== this.type && t.inputFilter !== 'inputMessagesFilterEmpty').map(t => t.inputFilter);
    typesToLoad = typesToLoad.filter(type => !this.loaded[type] 
      || this.usedFromHistory[type] < this.historyStorage[type].length);

    if(!typesToLoad.length) return;

    const loadCount = justLoad ? 50 : Math.round((appPhotosManager.windowH / 130 | 0) * 3 * 1.25); // that's good for all types
    
    const historyStorage = this.historyStorage ?? (this.historyStorage = {});

    const promises = typesToLoad.map(type => {
      if(this.loadPromises[type]) return this.loadPromises[type];
      
      const history = historyStorage[type] ?? (historyStorage[type] = []);

      const logStr = 'loadSidebarMedia [' + type + ']: ';

      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length && !justLoad) {
        let messages: any[] = [];
        let used = Math.max(0, this.usedFromHistory[type]);
        let slicedLength = 0;

        do {
          let ids = history.slice(used, used + loadCount);
          console.log(logStr + 'will render from cache', used, history, ids, loadCount);
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
      
      let maxId = history[history.length - 1] || 0;
      
      console.log(logStr + 'search house of glass pre', type, maxId);
      
      //let loadCount = history.length ? 50 : 15;
      return this.loadPromises[type] = appMessagesManager.getSearch(peerId, '', {_: type}, maxId, loadCount, undefined, undefined/* , this.threadId */)
      .then(value => {
        const mids = value.history.map(message => message.mid);
        history.push(...mids);
        
        console.log(logStr + 'search house of glass', type, value);

        if(this.peerId !== peerId || this.threadId !== threadId) {
          //console.warn('peer changed');
          return;
        }

        // ! Фикс случая, когда не загружаются документы при открытой панели разработчиков (происходит из-за того, что не совпадают критерии отбора документов в getSearch)
        if(value.history.length < loadCount) {
        //if((value.count || history.length == value.count) && history.length >= value.count) {
          console.log(logStr + 'loaded all media', value, loadCount);
          this.loaded[type] = true;
        }

        if(justLoad) {
          return Promise.resolve();
        }

        this.usedFromHistory[type] = history.length;

        if(!this.loaded[type]) {
          this.loadPromises[type].then(() => {
            setTimeout(() => {
              console.log('will preload more');
              const promise = this.load(true, true);
              if(promise) {
                promise.then(() => {
                  console.log('preloaded more');
                  this.scrollable.checkForTriggers();
                });
              }
            }, 0);
          });
        }

        //if(value.history.length) {
          return this.performSearchResult(this.filterMessagesByType(mids, type), type);
        //}
      }).catch(err => {
        console.error('load error:', err);
      }).finally(() => {
        this.loadPromises[type] = null;
      });
    });
    
    return Promise.all(promises).catch(err => {
      console.error('Load error all promises:', err);
    });
  }

  public cleanup() {
    this.loadPromises = {};
    this.loaded = {};

    this.prevTabId = -1;
    this.mediaDivsByIds = {};
    this.lazyLoadQueue.clear();

    this.types.forEach(type => {
      this.usedFromHistory[type.inputFilter] = -1;
    });

    this.type = 'inputMessagesFilterPhotoVideo';
  }

  public cleanupHTML() {
    if(this.urlsToRevoke.length) {
      this.urlsToRevoke.forEach(url => {
        URL.revokeObjectURL(url);
      });
      this.urlsToRevoke.length = 0;
    }

    (Object.keys(this.tabs) as MyInputMessagesFilter[]).forEach(sharedMediaType => {
      this.tabs[sharedMediaType].innerHTML = '';
      
      if(!this.historyStorage || !this.historyStorage[sharedMediaType]) {
        const parent = this.tabs[sharedMediaType].parentElement;
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
        this.tabs.inputMessagesFilterPhotoVideo.append(div);
      }
    }

    (this.tabsMenu.firstElementChild as HTMLLIElement).click(); // set media
  }

  public setQuery(peerId: number, query: string, threadId: number, historyStorage: AppSearchSuper['historyStorage'] = {}) {
    this.peerId = peerId;
    this.query = query;
    this.threadId = threadId;
    this.historyStorage = historyStorage;

    this.cleanup();
  }
}