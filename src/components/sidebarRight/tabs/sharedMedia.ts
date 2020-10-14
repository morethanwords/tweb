import appImManager from "../../../lib/appManagers/appImManager";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import appProfileManager from "../../../lib/appManagers/appProfileManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { logger } from "../../../lib/logger";
import { RichTextProcessor } from "../../../lib/richtextprocessor";
import $rootScope from "../../../lib/rootScope";
import { getAbbreviation, limitSymbols } from "../../../lib/utils";
import AppMediaViewer from "../../appMediaViewer";
import AvatarElement from "../../avatar";
import { horizontalMenu } from "../../horizontalMenu";
import LazyLoadQueue from "../../lazyLoadQueue";
import { putPreloader, renderImageFromUrl } from "../../misc";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";
import { wrapAudio, wrapDocument } from "../../wrappers";

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

type ContentType = /* 'contentMembers' |  */'contentMedia' | 'contentDocuments' | 'contentLinks' | 'contentAudio';
type SharedMediaType = /* 'inputMessagesFilterContacts' |  */'inputMessagesFilterEmpty' | 'inputMessagesFilterPhotoVideo' | 'inputMessagesFilterDocument' | 'inputMessagesFilterUrl' | 'inputMessagesFilterMusic';

const contentToSharedMap: {[contentType in ContentType]: SharedMediaType} = {
  //contentMembers: 'inputMessagesFilterContacts',
  contentMedia: 'inputMessagesFilterPhotoVideo',
  contentDocuments: 'inputMessagesFilterDocument',
  contentLinks: 'inputMessagesFilterUrl',
  contentAudio: 'inputMessagesFilterMusic'
};

// TODO: отправленное сообщение с картинкой, или же новое полученное апдейтом сообщение не отобразится в медии
// TODO: по-хорошему, нужно просто сделать апдейты для всего сайдбара

export default class AppSharedMediaTab implements SliderTab {
  public container: HTMLElement;
  public closeBtn: HTMLElement;

  private peerID = 0;

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
    [t in ContentType]: HTMLDivElement
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
    [peerID: number]: Partial<{
      [type in SharedMediaType]: number[]
    }>
  } = {};
  public usedFromHistory: Partial<{
    [type in SharedMediaType]: number
  }> = {};

  public scroll: Scrollable = null;

  private profileTabs: HTMLUListElement;
  private prevTabID = -1;
  
  private mediaDivsByIDs: {
    [mid: number]: HTMLDivElement
  } = {};
  
  public urlsToRevoke: string[] = [];

  private loadMutex: Promise<any> = Promise.resolve();

  private log = logger('SM'/* , LogLevels.error */);

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
      contentMedia: this.profileContentEl.querySelector('#content-media'),
      contentDocuments: this.profileContentEl.querySelector('#content-docs'),
      contentLinks: this.profileContentEl.querySelector('#content-links'),
      contentAudio: this.profileContentEl.querySelector('#content-audio'),
    };

    let container = this.profileContentEl.querySelector('.content-container .tabs-container') as HTMLDivElement;
    this.profileTabs = this.profileContentEl.querySelector('.profile-tabs');
    
    this.scroll = new Scrollable(this.container, 'SR', undefined, 400);
    this.scroll.onScrolledBottom = () => {
      if(this.sharedMediaSelected && this.sharedMediaSelected.childElementCount/* && false */) {
        this.log('onScrolledBottom will load media');
        this.loadSidebarMedia(true);
      }
    };
    //this.scroll.attachSentinels(undefined, 400);
    
    horizontalMenu(this.profileTabs, container, (id, tabContent) => {
      if(this.prevTabID == id) return;

      if(this.prevTabID != -1) {
        this.onTransitionStart();
      }
      
      this.sharedMediaType = this.sharedMediaTypes[id];
      this.sharedMediaSelected = tabContent.firstElementChild as HTMLDivElement;

      if(this.prevTabID != -1 && this.profileTabs.offsetTop) {
        this.scroll.scrollTop -= this.profileTabs.offsetTop;
      }

      /* this.log('setVirtualContainer', id, this.sharedMediaSelected, this.sharedMediaSelected.childElementCount);
      this.scroll.setVirtualContainer(this.sharedMediaSelected); */

      if(this.prevTabID != -1 && !this.sharedMediaSelected.childElementCount) { // quick brown fix
        //this.contentContainer.classList.remove('loaded');
        this.loadSidebarMedia(true);
      }

      this.prevTabID = id;
    }, () => {
      this.scroll.onScroll();
      this.onTransitionEnd();
    });

    this.sharedMedia.contentMedia.addEventListener('click', (e) => {
      const target = e.target as HTMLDivElement;
      
      const messageID = +target.dataset.mid;
      if(!messageID) {
        this.log.warn('no messageID by click on target:', target);
        return;
      }
      
      const message = appMessagesManager.getMessage(messageID);
      
      const ids = Object.keys(this.mediaDivsByIDs).map(k => +k).sort((a, b) => a - b);
      const idx = ids.findIndex(i => i == messageID);
      
      const targets = ids.map(id => {
        const element = this.mediaDivsByIDs[id] as HTMLElement;
        //element = element.querySelector('img') || element;
        return {element, mid: id};
      });
      
      new AppMediaViewer().openMedia(message, target, false, targets.slice(idx + 1).reverse(), targets.slice(0, idx).reverse(), true);
    });
    
    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appImManager.mutePeer(this.peerID);
    });

    /* this.closeBtn.addEventListener('click', () => {
      this.toggleSidebar(false);
    }); */
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
          if(!message.media.document || ['voice', 'audio', 'gif', 'sticker'].includes(message.media.document.type)) {
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
  
  public async performSearchResult(messages: any[], type: SharedMediaType) {
    const peerID = this.peerID;
    const elemsToAppend: HTMLElement[] = [];
    const promises: Promise<any>[] = [];
    let sharedMediaDiv: HTMLDivElement;

    /* for(let contentType in contentToSharedMap) {
      if(contentToSharedMap[contentType as ContentType] == type) {
        sharedMediaDiv = this.sharedMedia[contentType as ContentType];
      }
    } */
    
    // https://core.telegram.org/type/MessagesFilter
    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        sharedMediaDiv = this.sharedMedia.contentMedia;
        
        for(const message of messages) {
          const media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);

          const div = document.createElement('div');
          div.classList.add('grid-item');
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
            if($rootScope.selectedPeerID != peerID) {
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
          this.mediaDivsByIDs[message.mid] = div;
        }
        
        break;
      }
      
      case 'inputMessagesFilterDocument': {
        sharedMediaDiv = this.sharedMedia.contentDocuments;
        
        for(let message of messages) {
          let div = wrapDocument(message.media.document, true, false, message.mid);
          elemsToAppend.push(div);
        }
        break;
      }
      
      case 'inputMessagesFilterUrl': {
        sharedMediaDiv = this.sharedMedia.contentLinks;
        
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
          
          previewDiv.innerHTML = getAbbreviation(webpage.title || webpage.display_url || webpage.description || webpage.url, true);
          previewDiv.classList.add('empty');
          if(webpage.photo) {
            let load = () => appPhotosManager.preloadPhoto(webpage.photo.id, appPhotosManager.choosePhotoSize(webpage.photo, 60, 60))
            .then(() => {
              if($rootScope.selectedPeerID != peerID) {
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
      
      case 'inputMessagesFilterMusic': {
        sharedMediaDiv = this.sharedMedia.contentAudio;
        
        for(let message of messages) {
          let div = wrapAudio(message.media.document, true, message.mid);
          elemsToAppend.push(div);
        }
        break;
      }
      
      default:
        console.warn('death is my friend', messages);
        break;
    }

    if(this.loadMutex) {
      promises.push(this.loadMutex);
    }

    if(promises.length) {
      await Promise.all(promises);
      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        return;
      }
    }
    
    if(elemsToAppend.length) {
      sharedMediaDiv.append(...elemsToAppend);
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
  
  public loadSidebarMedia(single = false) {
    if(testScroll/*  || 1 == 1 */) {
      return;
    }
    
    this.log('loadSidebarMedia', single, this.peerID, this.loadSidebarMediaPromises);
    
    const peerID = this.peerID;
    
    let typesToLoad = single ? [this.sharedMediaType] : this.sharedMediaTypes;
    typesToLoad = typesToLoad.filter(type => !this.loadedAllMedia[type]);
    if(!typesToLoad.length) return;

    const loadCount = (appPhotosManager.windowH / 130 | 0) * 3; // that's good for all types
    
    const historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {});

    const promises = typesToLoad.map(type => {
      if(this.loadSidebarMediaPromises[type]) return this.loadSidebarMediaPromises[type];
      
      const history = historyStorage[type] ?? (historyStorage[type] = []);

      const logStr = `loadSidebarMedia [${type}]: `;

      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length) {
        let messages: any[] = [];
        let used = this.usedFromHistory[type];

        do {
          let ids = history.slice(used, used + loadCount);
          this.log(logStr + 'will render from cache', used, history, ids, loadCount);
          used += ids.length;

          messages.push(...this.filterMessagesByType(ids, type));
        } while(messages.length < loadCount && used < history.length);
        
        // если перебор
        if(messages.length > loadCount) {
          let diff = messages.length - loadCount;
          messages = messages.slice(0, messages.length - diff);
          used -= diff;
        }

        this.usedFromHistory[type] = used;
        //if(messages.length) {
          return this.performSearchResult(messages, type);
        //}

        return Promise.resolve();
      }
      
      // заливать новую картинку сюда только после полной отправки!
      let maxID = history[history.length - 1] || 0;
      
      this.log(logStr + 'search house of glass pre', type, maxID);
      
      //let loadCount = history.length ? 50 : 15;
      return this.loadSidebarMediaPromises[type] = appMessagesManager.getSearch(peerID, '', {_: type}, maxID, loadCount)
      .then(value => {
        history.push(...value.history);
        
        this.log(logStr + 'search house of glass', type, value);

        if($rootScope.selectedPeerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        if(value.history.length < loadCount) {
          this.log(logStr + 'loaded all media', value, loadCount);
          this.loadedAllMedia[type] = true;
        }

        this.usedFromHistory[type] = history.length;

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

    this.prevTabID = -1;
    this.mediaDivsByIDs = {};
    this.lazyLoadQueue.clear();

    this.sharedMediaTypes.forEach(type => {
      this.usedFromHistory[type] = 0;
    });

    this.sharedMediaType = 'inputMessagesFilterPhotoVideo';
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

    (Object.keys(this.sharedMedia) as ContentType[]).forEach(key => {
      this.sharedMedia[key].innerHTML = '';
      
      const inputFilter = contentToSharedMap[key];
      if(!this.historiesStorage[this.peerID] || !this.historiesStorage[this.peerID][inputFilter]) {
        const parent = this.sharedMedia[key].parentElement;
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
        this.sharedMedia.contentMedia.append(div);
      }
    }

    (this.profileTabs.firstElementChild.children[1] as HTMLLIElement).click(); // set media
  }

  public setLoadMutex(promise: Promise<any>) {
    this.loadMutex = promise;
  }

  public setPeer(peerID: number) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.peerID = peerID;
    this.cleanup();
  }

  public fillProfileElements() {
    let peerID = this.peerID = $rootScope.selectedPeerID;

    this.cleanupHTML();

    this.profileElements.avatar.setAttribute('peer', '' + peerID);

    // username
    if(peerID != $rootScope.myID) {
      let username = appPeersManager.getPeerUsername(peerID);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerID), this.profileElements.username);
      }
      
      let dialog = appMessagesManager.getDialogByPeerID(peerID)[0];
      if(dialog) {
        let muted = false;
        if(dialog.notify_settings && dialog.notify_settings.mute_until) {
          muted = new Date(dialog.notify_settings.mute_until * 1000) > new Date();
        }
        
        appImManager.setMutedState(muted);
      }
    } else {
      window.requestAnimationFrame(() => {
        this.profileElements.notificationsRow.style.display = 'none';
      });
    }
    
    //let membersLi = this.profileTabs.firstElementChild.children[0] as HTMLLIElement;
    if(peerID > 0) {
      //membersLi.style.display = 'none';

      let user = appUsersManager.getUser(peerID);
      if(user.phone && peerID != $rootScope.myID) {
        setText(user.rPhone, this.profileElements.phone);
      }
      
      appProfileManager.getProfile(peerID, true).then(userFull => {
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        if(userFull.rAbout && peerID != $rootScope.myID) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
      });
    } else {
      //membersLi.style.display = appPeersManager.isBroadcast(peerID) ? 'none' : '';
      let chat = appPeersManager.getPeer(peerID);
      
      appProfileManager.getChatFull(chat.id).then((chatFull) => {
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }
      });
    }
  }

  /* onOpen() {
    this.scroll.onScroll();
  } */

  onOpenAfterTimeout() {
    this.scroll.onScroll();
  }
}