import { horizontalMenu, formatPhoneNumber, putPreloader, renderImageFromUrl } from "../../components/misc";
//import Scrollable from '../../components/scrollable';
import Scrollable from '../../components/scrollable_new';
import { $rootScope } from "../utils";
import appMessagesManager from "./appMessagesManager";
import appPhotosManager from "./appPhotosManager";
import appPeersManager from "./appPeersManager";
import appUsersManager from "./appUsersManager";
import appProfileManager from "./appProfileManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../polyfill";
import appImManager from "./appImManager";
import appMediaViewer from "./appMediaViewer";
import LazyLoadQueue from "../../components/lazyLoadQueue";
import { wrapDocument, wrapAudio } from "../../components/wrappers";
import AppSearch, { SearchGroup } from "../../components/appSearch";

const testScroll = false;

class AppSidebarRight {
  public sidebarEl = document.getElementById('column-right') as HTMLDivElement;
  public profileContainer = this.sidebarEl.querySelector('.profile-container') as HTMLDivElement;
  public profileContentEl = this.sidebarEl.querySelector('.profile-content') as HTMLDivElement;
  public contentContainer = this.sidebarEl.querySelector('.content-container') as HTMLDivElement;
  public profileElements = {
    avatar: this.profileContentEl.querySelector('.profile-avatar') as HTMLDivElement,
    name: this.profileContentEl.querySelector('.profile-name') as HTMLDivElement,
    subtitle: this.profileContentEl.querySelector('.profile-subtitle') as HTMLDivElement,
    bio: this.profileContentEl.querySelector('.profile-row-bio') as HTMLDivElement,
    username: this.profileContentEl.querySelector('.profile-row-username') as HTMLDivElement,
    phone: this.profileContentEl.querySelector('.profile-row-phone') as HTMLDivElement,
    notificationsRow: this.profileContentEl.querySelector('.profile-row-notifications') as HTMLDivElement,
    notificationsCheckbox: this.profileContentEl.querySelector('#profile-notifications') as HTMLInputElement,
    notificationsStatus: this.profileContentEl.querySelector('.profile-row-notifications > p') as HTMLParagraphElement
  };
  public sharedMedia: {
    [type: string]: HTMLDivElement
  } = {
    contentMembers: this.profileContentEl.querySelector('#content-members') as HTMLDivElement,
    contentMedia: this.profileContentEl.querySelector('#content-media') as HTMLDivElement,
    contentDocuments: this.profileContentEl.querySelector('#content-docs') as HTMLDivElement,
    contentLinks: this.profileContentEl.querySelector('#content-links') as HTMLDivElement,
    contentAudio: this.profileContentEl.querySelector('#content-audio') as HTMLDivElement,
  };
  
  public lastSharedMediaDiv: HTMLDivElement = null;
  
  private loadSidebarMediaPromises: {[type: string]: Promise<void>} = {};
  private loadedAllMedia: {[type: string]: boolean} = {};
  
  public sharedMediaTypes = [
    'inputMessagesFilterContacts', 
    'inputMessagesFilterPhotoVideo', 
    'inputMessagesFilterDocument', 
    'inputMessagesFilterUrl', 
    'inputMessagesFilterMusic'
  ];
  public sharedMediaType: string = '';
  private sharedMediaSelected: HTMLDivElement = null;
  
  private lazyLoadQueueSidebar = new LazyLoadQueue(5);
  /* public minMediaID: {
    [type: string]: number
  } = {}; */
  public cleared: {
    [type: string]: boolean
  } = {};
  
  public historiesStorage: {
    [peerID: number]: {
      [type: string]: number[]
    }
  } = {};
  public usedFromHistory: {
    [type: string]: number
  } = {};
  
  private log = logger('SR');
  
  private peerID = 0;
  
  public scroll: Scrollable = null;

  private profileTabs: HTMLUListElement;
  private prevTabID = -1;
  
  private mediaDivsByIDs: {
    [mid: number]: HTMLDivElement
  } = {};
  
  public urlsToRevoke: string[] = [];

  private searchContainer = this.sidebarEl.querySelector('#search-private-container') as HTMLDivElement;
  public searchCloseBtn = this.searchContainer.querySelector('.sidebar-close-button') as HTMLButtonElement;
  private searchInput = document.getElementById('private-search') as HTMLInputElement;
  public privateSearch = new AppSearch(this.searchContainer.querySelector('.chats-container') as HTMLDivElement, this.searchInput, {
    messages: new SearchGroup('Private Search', 'messages')
  });
  
  constructor() {
    let container = this.profileContentEl.querySelector('.content-container .tabs-container') as HTMLDivElement;
    this.profileTabs = this.profileContentEl.querySelector('.profile-tabs') as HTMLUListElement;
    
    this.scroll = new Scrollable(this.profileContainer, 'y', 1200, 'SR', undefined, 400);
    //this.scroll = new Scrollable(this.profileContentEl, 'y', 1200, 'SR', undefined, 400);
    this.scroll.container.addEventListener('scroll', this.onSidebarScroll.bind(this));
    this.scroll.onScrolledBottom = () => {
      if(this.sharedMediaSelected && this.sharedMediaSelected.childElementCount/* && false */) {
        this.log('onScrolledBottom will load media');
        this.loadSidebarMedia(true);
      }
    };
    
    horizontalMenu(this.profileTabs, container, (id, tabContent) => {
      if(this.prevTabID == id) return;
      
      this.sharedMediaType = this.sharedMediaTypes[id];
      this.sharedMediaSelected = tabContent.firstElementChild as HTMLDivElement;

      if(this.profileTabs.offsetTop) {
        this.scroll.scrollTop -= this.profileTabs.offsetTop;
      }

      this.log('setVirtualContainer', id, this.sharedMediaSelected);
      this.scroll.setVirtualContainer(this.sharedMediaSelected);

      if(this.prevTabID != -1 && !this.sharedMediaSelected.childElementCount) { // quick brown fix
        this.contentContainer.classList.remove('loaded');
        this.loadSidebarMedia(true);
      }

      this.prevTabID = id;

      this.scroll.onScroll();
    }, this.onSidebarScroll.bind(this));
    
    let sidebarCloseBtn = this.sidebarEl.querySelector('.sidebar-close-button') as HTMLButtonElement;
    sidebarCloseBtn.addEventListener('click', () => {
      this.toggleSidebar(false);
    });

    this.searchCloseBtn.addEventListener('click', () => {
      this.searchContainer.classList.remove('active');
      this.privateSearch.reset();
    });
    
    this.sharedMedia.contentMedia.addEventListener('click', (e) => {
      let target = e.target as HTMLDivElement;
      
      let messageID = +target.dataset.mid;
      if(!messageID) {
        this.log.warn('no messageID by click on target:', target);
        return;
      }
      
      let message = appMessagesManager.getMessage(messageID);
      
      let ids = Object.keys(this.mediaDivsByIDs).map(k => +k).sort((a, b) => a - b);
      let idx = ids.findIndex(i => i == messageID);
      
      let targets = ids.map(id => ({element: this.mediaDivsByIDs[id], mid: id}));
      
      appMediaViewer.openMedia(message, target, false, this.sidebarEl, targets.slice(idx + 1).reverse(), targets.slice(0, idx).reverse(), true);
    });
    
    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appImManager.mutePeer();
    });
    
    window.addEventListener('resize', this.onSidebarScroll.bind(this));
    
    if(testScroll) {
      let div = document.createElement('div');
      for(let i = 0; i < 500; ++i) {
        //div.insertAdjacentHTML('beforeend', `<div style="background-image: url(assets/img/camomile.jpg);"></div>`);
        div.insertAdjacentHTML('beforeend', `<div data-id="${i / 3 | 0}">${i / 3 | 0}</div>`);
        
        if((i + 1) % 3 == 0) {
          this.sharedMedia.contentMedia.append(div);
          div = document.createElement('div');
        }
        
        div.dataset.id = '' + (i / 3 | 0);
      }
      this.sharedMedia.contentMedia.append(div);
      (this.profileTabs.children[1] as HTMLLIElement).click(); // set media
    }
  }

  public beginSearch() {
    this.toggleSidebar(true);
    this.searchContainer.classList.add('active');
    this.privateSearch.beginSearch(this.peerID);
  }
  
  public onSidebarScroll() {
    this.lazyLoadQueueSidebar.check();
  }
  
  public toggleSidebar(enable?: boolean) {
    /////this.log('sidebarEl', this.sidebarEl, enable, isElementInViewport(this.sidebarEl));
    
    if(enable !== undefined) {
      if(enable) {
        setTimeout(() => this.lazyLoadQueueSidebar.check(), 200);
        this.sidebarEl.classList.add('active');
      } else this.sidebarEl.classList.remove('active');
      
      return;
    }

    this.sidebarEl.classList.toggle('active');
  }
  
  public performSearchResult(ids: number[], type: string) {
    let peerID = this.peerID;

    let sharedMediaDiv: HTMLDivElement;
    let messages: any[] = [];
    for(let mid of ids) {
      let message = appMessagesManager.getMessage(mid);
      if(message.media) messages.push(message);
    }
    
    let elemsToAppend: HTMLElement[] = [];
    
    // https://core.telegram.org/type/MessagesFilter
    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        sharedMediaDiv = this.sharedMedia.contentMedia;
        
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
          
          let div = document.createElement('div');
          //console.log(message, photo);
          
          let isPhoto = media._ == 'photo';
          
          let photo = isPhoto ? appPhotosManager.getPhoto(media.id) : null;
          if(!photo || !photo.downloaded) {
            //this.log('inputMessagesFilterPhotoVideo', message, media, photo, div);
            
            let sizes = media.sizes || media.thumbs;
            if(sizes && sizes[0].bytes) {
              appPhotosManager.setAttachmentPreview(sizes[0].bytes, div, false, true);
            } /* else {
              this.log('no stripped size', message, media);
            } */
          }
          
          //this.log('inputMessagesFilterPhotoVideo', message, media);
          
          let load = () => appPhotosManager.preloadPhoto(isPhoto ? media.id : media, appPhotosManager.choosePhotoSize(media, 200, 200))
          .then((blob) => {
            if($rootScope.selectedPeerID != peerID) {
              this.log.warn('peer changed');
              return;
            }

            if(photo && photo.url) {
              renderImageFromUrl(div, photo.url);
            } else {
              let url = URL.createObjectURL(blob);
              this.urlsToRevoke.push(url);
              
              let img = new Image();
              img.src = url;
              img.onload = () => {
                div.style.backgroundImage = 'url(' + url + ')';
              };
            }
            
            //div.style.backgroundImage = 'url(' + url + ')';
          });
          
          div.dataset.mid = '' + message.mid;
          
          if(photo && photo.downloaded) load();
          else this.lazyLoadQueueSidebar.push({div, load});
          
          this.lastSharedMediaDiv.append(div);
          if(this.lastSharedMediaDiv.childElementCount == 3) {
            if(!this.scroll.contains(this.lastSharedMediaDiv)) {
              elemsToAppend.push(this.lastSharedMediaDiv);
            }
            
            this.lastSharedMediaDiv = document.createElement('div');
          }
          
          this.mediaDivsByIDs[message.mid] = div;
          
          //sharedMediaDiv.append(div);
        }
        
        break;
      }
      
      case 'inputMessagesFilterDocument': {
        sharedMediaDiv = this.sharedMedia.contentDocuments;
        
        for(let message of messages) {
          if(!message.media.document || message.media.document.type == 'voice' || message.media.document.type == 'audio') {
            continue;
          }
          
          let doc = message.media.document;
          if(doc.attributes) {
            if(doc.attributes.find((a: any) => a._ == "documentAttributeSticker")) {
              continue;
            }
          }
          
          //this.log('come back down to my knees', message);
          
          let div = wrapDocument(message.media.document, true);
          elemsToAppend.push(div);
        }
        break;
      }
      
      case 'inputMessagesFilterUrl': {
        sharedMediaDiv = this.sharedMedia.contentLinks;
        
        for(let message of messages) {
          if(!message.media.webpage || message.media.webpage._ == 'webPageEmpty') {
            continue;
          }
          
          let webpage = message.media.webpage;
          let div = document.createElement('div');
          
          let previewDiv = document.createElement('div');
          previewDiv.classList.add('preview');
          
          //this.log('wrapping webpage', webpage);
          
          if(webpage.photo) {
            let load = () => appPhotosManager.preloadPhoto(webpage.photo.id, appPhotosManager.choosePhotoSize(webpage.photo, 60, 60))
            .then(() => {
              if($rootScope.selectedPeerID != peerID) {
                this.log.warn('peer changed');
                return;
              }

              renderImageFromUrl(previewDiv, webpage.photo.url);
            });
            
            this.lazyLoadQueueSidebar.push({div: previewDiv, load});
          } else {
            previewDiv.innerText = (webpage.title || webpage.description || webpage.url || webpage.display_url).slice(0, 1);
            previewDiv.classList.add('empty');
          }
          
          let title = webpage.rTitle || '';
          let subtitle = webpage.rDescription || '';
          let url = RichTextProcessor.wrapRichText(webpage.url || '');
          
          if(!title) {
            //title = new URL(webpage.url).hostname;
            title = webpage.display_url.split('/', 1)[0];
          }
          
          div.append(previewDiv);
          div.insertAdjacentHTML('beforeend', `
          <div class="title">${title}</div>
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
          if(!message.media.document || message.media.document.type != 'audio') {
            continue;
          }

          let div = wrapAudio(message.media.document, true);
          elemsToAppend.push(div);
        }
        break;
      }
      
      default:
      //console.warn('death is my friend', message);
      break;
    }
    
    if(this.lastSharedMediaDiv.childElementCount && !this.scroll.contains(this.lastSharedMediaDiv)) {
      elemsToAppend.push(this.lastSharedMediaDiv);
    }
    
    if(elemsToAppend.length) {
      //window.requestAnimationFrame(() => {
      elemsToAppend.forEach(el => this.scroll.append(el, false));
      //});
    }
    
    if(sharedMediaDiv) {
      let parent = sharedMediaDiv.parentElement;
      if(parent.lastElementChild.classList.contains('preloader')) {
        parent.lastElementChild.remove();
        this.contentContainer.classList.add('loaded');
      }
    }
    
    this.onSidebarScroll();
  }
  
  public loadSidebarMedia(single = false) {
    if(testScroll/*  || 1 == 1 */) {
      return;
    }
    
    this.log('loadSidebarMedia', single, this.peerID, this.loadSidebarMediaPromises);
    
    let peerID = this.peerID;
    
    let typesToLoad = single ? [this.sharedMediaType] : this.sharedMediaTypes;
    typesToLoad = typesToLoad.filter(type => !this.loadedAllMedia[type]);
    if(!typesToLoad.length) return;
    
    let historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {});

    let promises = typesToLoad.map(type => {
      if(this.loadSidebarMediaPromises[type]) return this.loadSidebarMediaPromises[type];
      
      let history = historyStorage[type] ?? (historyStorage[type] = []);

      let loadCount = (appPhotosManager.windowH / 130 | 0) * 3;

      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length && this.cleared[type]) {
        let ids = history.slice(this.usedFromHistory[type], this.usedFromHistory[type] + loadCount);
        this.log('loadSidebarMedia: will render from cache', this.usedFromHistory[type], history, ids, loadCount);
        this.usedFromHistory[type] += ids.length;
        this.performSearchResult(ids, type);
        return Promise.resolve();
      }
      
      // заливать новую картинку сюда только после полной отправки!
      //let maxID = this.minMediaID[type] || 0;
      let maxID = history[history.length - 1] || 0;
      
      let ids = !maxID && appMessagesManager.historiesStorage[peerID] 
      ? appMessagesManager.historiesStorage[peerID].history.slice() : [];
      
      maxID = !maxID && ids.length ? ids[ids.length - 1] : maxID;
      this.log('loadSidebarMedia: search house of glass pre', type, ids, maxID);
      
      //let loadCount = history.length ? 50 : 15;
      return this.loadSidebarMediaPromises[type] = appMessagesManager.getSearch(peerID, '', {_: type}, maxID, loadCount)
      .then(value => {
        ids = ids.concat(value.history);
        history.push(...ids);
        
        this.log('loadSidebarMedia: search house of glass', type, value, ids, this.cleared);

        if($rootScope.selectedPeerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        if(value.history.length < loadCount) {
          this.loadedAllMedia[type] = true;
        }
        
        if(this.cleared[type]) {
          //ids = history;
          delete this.cleared[type];
        }

        if(ids.length) {
          this.performSearchResult(ids, type);
        }
      }, (err) => {
        this.log.error('load error:', err);
      }).then(() => {
        this.loadSidebarMediaPromises[type] = null;
      });
    });
    
    return Promise.all(promises);
  }
  
  public fillProfileElements() {
    let peerID = this.peerID = $rootScope.selectedPeerID;
    this.loadSidebarMediaPromises = {};
    this.loadedAllMedia = {};
    this.lastSharedMediaDiv = document.createElement('div');
    
    //this.log('fillProfileElements');

    this.contentContainer.classList.remove('loaded');
    
    window.requestAnimationFrame(() => {
      this.profileContentEl.parentElement.scrollTop = 0;
      this.profileElements.bio.style.display = 'none';
      this.profileElements.phone.style.display = 'none';
      this.profileElements.username.style.display = 'none';
      this.profileElements.notificationsRow.style.display = '';
      this.profileElements.notificationsCheckbox.checked = true;
      this.profileElements.notificationsStatus.innerText = 'Enabled';
      
      Object.keys(this.sharedMedia).forEach(key => {
        this.sharedMedia[key].innerHTML = '';
        
        let parent = this.sharedMedia[key].parentElement;
        if(!parent.querySelector('.preloader')) {
          putPreloader(parent, true);
        }
      });
      
      this.prevTabID = -1;
      this.scroll.setVirtualContainer(null);
      (this.profileTabs.firstElementChild.children[1] as HTMLLIElement).click(); // set media

      //this.scroll.getScrollTopOffset();
      
      this.loadSidebarMedia(true);
    });
    
    this.mediaDivsByIDs = {};
    
    this.lazyLoadQueueSidebar.clear();
    
    this.urlsToRevoke.forEach(url => {
      URL.revokeObjectURL(url);
    });
    this.urlsToRevoke.length = 0;
    
    this.sharedMediaTypes.forEach(type => {
      //this.minMediaID[type] = 0;
      this.cleared[type] = true;
      this.usedFromHistory[type] = 0;
    });
    
    let setText = (text: string, el: HTMLDivElement) => {
      window.requestAnimationFrame(() => {
        if(el.childElementCount > 1) {
          el.firstElementChild.remove();
        }
        
        let p = document.createElement('p');
        p.innerHTML = text;
        el.prepend(p);
        
        el.style.display = '';

        //this.scroll.getScrollTopOffset();
      });
    };
    
    // username
    if(peerID != appImManager.myID) {
      let username = appPeersManager.getPeerUsername(peerID);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerID), this.profileElements.username);
      }
      
      let dialog: any = appMessagesManager.getDialogByPeerID(peerID);
      if(dialog.length) {
        dialog = dialog[0];
        let muted = false;
        if(dialog.notify_settings && dialog.notify_settings.mute_until) {
          muted = new Date(dialog.notify_settings.mute_until * 1000) > new Date();
        }
        
        appImManager.setMutedState(muted);
      }
    } else {
      window.requestAnimationFrame(() => {
        this.profileElements.notificationsRow.style.display = 'none';
        //this.scroll.getScrollTopOffset();
      })
    }
    
    if(peerID > 0) {
      let user = appUsersManager.getUser(peerID);
      if(user.phone && peerID != appImManager.myID) {
        setText('+' + formatPhoneNumber(user.phone).formatted, this.profileElements.phone);
      }
      
      appProfileManager.getProfile(peerID, true).then(userFull => {
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        if(userFull.rAbout && peerID != appImManager.myID) {
          setText(userFull.rAbout, this.profileElements.bio);
        }
        
        //this.log('userFull', userFull);
        
        if(userFull.pinned_msg_id) { // request pinned message
          appImManager.pinnedMsgID = userFull.pinned_msg_id;
          appMessagesManager.wrapSingleMessage(userFull.pinned_msg_id);
        }
        
        //this.scroll.getScrollTopOffset();
      });
    } else {
      let chat = appPeersManager.getPeer(peerID);
      
      appProfileManager.getChatFull(chat.id).then((chatFull: any) => {
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        //this.log('chatInfo res 2:', chatFull);
        
        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }
        
        //this.scroll.getScrollTopOffset();
      });
    }
    
    //this.scroll.getScrollTopOffset();
    //this.loadSidebarMedia();
  }
}

export default new AppSidebarRight();
