import { horizontalMenu, putPreloader, renderImageFromUrl, ripple } from "../../components/misc";
//import Scrollable from '../../components/scrollable';
import Scrollable from '../../components/scrollable_new';
import { $rootScope, findUpClassName } from "../utils";
import appMessagesManager from "./appMessagesManager";
import appPhotosManager from "./appPhotosManager";
import appPeersManager from "./appPeersManager";
import appUsersManager from "./appUsersManager";
import appProfileManager from "./appProfileManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger, LogLevels } from "../logger";
import appImManager from "./appImManager";
import appMediaViewer from "./appMediaViewer";
import LazyLoadQueue from "../../components/lazyLoadQueue";
import { wrapDocument, wrapAudio, wrapSticker } from "../../components/wrappers";
import AppSearch, { SearchGroup } from "../../components/appSearch";
import AvatarElement from "../../components/avatar";
import appForward from "../../components/appForward";
import { mediaSizes } from "../config";
import SidebarSlider, { SliderTab } from "../../components/slider";
import appStickersManager, { MTStickerSet, MTStickerSetCovered, MTStickerSetMultiCovered } from "./appStickersManager";
import animationIntersector from "../../components/animationIntersector";
import PopupStickers from "../../components/popupStickers";
import SearchInput from "../../components/searchInput";
import appPollsManager from "./appPollsManager";
import { roundPercents } from "../../components/poll";
import appDialogsManager from "./appDialogsManager";

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

class AppStickersTab implements SliderTab {
  private container = document.getElementById('stickers-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private backBtn = this.container.querySelector('.sidebar-close-button') as HTMLButtonElement;
  //private input = this.container.querySelector('#stickers-search') as HTMLInputElement;
  private searchInput: SearchInput;
  private setsDiv = this.contentDiv.firstElementChild as HTMLDivElement;
  private scrollable: Scrollable;
  private lazyLoadQueue: LazyLoadQueue;

  constructor() {
    this.scrollable = new Scrollable(this.contentDiv, 'y', 'STICKERS-SEARCH', undefined, undefined, 2);
    this.scrollable.setVirtualContainer(this.setsDiv);

    this.lazyLoadQueue = new LazyLoadQueue();

    this.searchInput = new SearchInput('Search Stickers', (value) => {
      this.search(value);
    });

    this.backBtn.parentElement.append(this.searchInput.container);

    this.setsDiv.addEventListener('click', (e) => {
      const sticker = findUpClassName(e.target, 'sticker-set-sticker');
      if(sticker) {
        const docID = sticker.dataset.docID;
        appImManager.chatInputC.sendMessageWithDocument(docID);
        return;
      }

      const target = findUpClassName(e.target, 'sticker-set');
      if(!target) return;


      const id = target.dataset.stickerSet as string;
      const access_hash = target.dataset.stickerSet as string;

      const button = findUpClassName(e.target, 'sticker-set-button') as HTMLElement;
      if(button) {
        e.preventDefault();
        e.cancelBubble = true;

        button.setAttribute('disabled', 'true');
        
        appStickersManager.getStickerSet({id, access_hash}).then(full => {
          appStickersManager.toggleStickerSet(full.set).then(changed => {
            if(changed) {
              button.innerText = full.set.installed_date ? 'Added' : 'Add';
              button.classList.toggle('gray', !!full.set.installed_date);
            }
          }).finally(() => {
            //button.style.width = set.installed_date ? '68px' : '52px';
            button.removeAttribute('disabled');
          });
        });
      } else {
        appStickersManager.getStickerSet({id, access_hash}).then(full => {
          new PopupStickers(full.set).show();
        });
      }
    });
  }

  public onCloseAfterTimeout() {
    this.setsDiv.innerHTML = '';
    this.searchInput.value = '';
    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');
  }

  public renderSet(set: MTStickerSet) {
    //console.log('renderSet:', set);
    const div = document.createElement('div');
    div.classList.add('sticker-set');

    const header = document.createElement('div');
    header.classList.add('sticker-set-header');

    const details = document.createElement('div');
    details.classList.add('sticker-set-details');
    details.innerHTML = `
      <div class="sticker-set-name">${RichTextProcessor.wrapEmojiText(set.title)}</div>
      <div class="sticker-set-count">${set.count} stickers</div>
    `;
    
    const button = document.createElement('button');
    button.classList.add('btn-primary', 'sticker-set-button');
    button.innerText = set.installed_date ? 'Added' : 'Add';
   // button.style.width = set.installed_date ? '68px' : '52px';

    if(set.installed_date) {
      button.classList.add('gray');
    }

    //ripple(button);

    header.append(details, button);

    const stickersDiv = document.createElement('div');
    stickersDiv.classList.add('sticker-set-stickers');

    const count = Math.min(5, set.count);
    for(let i = 0; i < count; ++i) {
      const stickerDiv = document.createElement('div');
      stickerDiv.classList.add('sticker-set-sticker');

      stickersDiv.append(stickerDiv);
    }

    appStickersManager.getStickerSet(set).then(set => {
      //console.log('renderSet got set:', set);
      
      for(let i = 0; i < count; ++i) {
        const div = stickersDiv.children[i] as HTMLDivElement;
        wrapSticker({
          doc: set.documents[i], 
          div, 
          lazyLoadQueue: this.lazyLoadQueue, 
          group: 'STICKERS-SEARCH', 
          /* play: false,
          loop: false, */
          play: true,
          loop: true,
          width: 68,
          height: 68
        });
      }
    });

    /* const onMouseOver = () => {
      const animations: AnimationItem['animation'][] = [];
      for(let i = 0; i < count; ++i) {
        const stickerDiv = stickersDiv.children[i] as HTMLElement;
        const animationItem = animationIntersector.getAnimation(stickerDiv);
        if(!animationItem) continue;

        const animation = animationItem.animation;

        animations.push(animation);
        animation.loop = true;
        animation.play();
      }

      div.addEventListener('mouseout', () => {
        animations.forEach(animation => {
          animation.loop = false;
        });

        div.addEventListener('mouseover', onMouseOver, {once: true});
      }, {once: true});
    };

    div.addEventListener('mouseover', onMouseOver, {once: true}); */

    div.dataset.stickerSet = set.id;
    div.dataset.access_hash = set.access_hash;
    div.dataset.title = set.title;

    div.append(header, stickersDiv);

    this.scrollable.append(div);
  }

  public init() {
    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.stickers);

    appSidebarRight.toggleSidebar(true).then(() => {
      this.renderFeatured();
    });
  }

  public renderFeatured() {
    return appStickersManager.getFeaturedStickers().then(coveredSets => {
      if(this.searchInput.value) {
        return;
      }

      coveredSets = this.filterRendered('', coveredSets);
      coveredSets.forEach(set => {
        this.renderSet(set.set);
      });
    });
  }

  private filterRendered(query: string, coveredSets: (MTStickerSetCovered | MTStickerSetMultiCovered)[]) {
    coveredSets = coveredSets.slice();

    const children = Array.from(this.setsDiv.children) as HTMLElement[];
    children.forEachReverse(el => {
      const id = el.dataset.stickerSet;
      const index = coveredSets.findIndex(covered => covered.set.id == id);
  
      if(index !== -1) {
        coveredSets.splice(index, 1);
      } else if(!query || !el.dataset.title.toLowerCase().includes(query.toLowerCase())) {
        el.remove();
      }
    });

    animationIntersector.checkAnimations(undefined, 'STICKERS-SEARCH');

    return coveredSets;
  }

  public search(query: string) {
    if(!query) {
      return this.renderFeatured();
    }

    return appStickersManager.searchStickerSets(query, false).then(coveredSets => {
      if(this.searchInput.value != query) {
        return;
      }

      //console.log('search result:', coveredSets);

      coveredSets = this.filterRendered(query, coveredSets);
      coveredSets.forEach(set => {
        this.renderSet(set.set);
      });
    });
  }
}

class AppPollResultsTab implements SliderTab {
  private container = document.getElementById('poll-results-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private resultsDiv = this.contentDiv.firstElementChild as HTMLDivElement;
  private scrollable: Scrollable;

  private pollID: string;
  private mid: number;

  constructor() {
    this.scrollable = new Scrollable(this.contentDiv, 'y', 'POLL-RESULTS', undefined, undefined, 2);
  }

  public cleanup() {
    this.resultsDiv.innerHTML = '';
    this.pollID = '';
    this.mid = 0;
  }

  public onCloseAfterTimeout() {
    this.cleanup();
  }

  public init(pollID: string, mid: number) {
    if(this.pollID == pollID && this.mid == mid) return;
    
    this.cleanup();

    this.pollID = pollID;
    this.mid = mid;

    appSidebarRight.selectTab(AppSidebarRight.SLIDERITEMSIDS.pollResults);

    const poll = appPollsManager.getPoll(pollID);

    const title = document.createElement('h3');
    title.innerHTML = poll.poll.rQuestion;

    const percents = poll.results.results.map(v => v.voters / poll.results.total_voters * 100);
    roundPercents(percents);

    const fragment = document.createDocumentFragment();
    poll.results.results.forEach((result, idx) => {
      if(!result.voters) return;

      const hr = document.createElement('hr');

      const answer = poll.poll.answers[idx];

      // Head
      const answerEl = document.createElement('div');
      answerEl.classList.add('poll-results-answer');

      const answerTitle = document.createElement('div');
      answerTitle.innerHTML = RichTextProcessor.wrapEmojiText(answer.text);

      const answerPercents = document.createElement('div');
      answerPercents.innerText = Math.round(percents[idx]) + '%';

      answerEl.append(answerTitle, answerPercents);

      // Humans
      const list = document.createElement('ul');
      list.classList.add('poll-results-voters');

      appDialogsManager.setListClickListener(list);

      list.style.minHeight = Math.min(result.voters, 4) * 50 + 'px';

      fragment.append(hr, answerEl, list);

      let offset: string, limit = 4, loading = false, left = result.voters - 4;
      const load = () => {
        if(loading) return;
        loading = true;

        appPollsManager.getVotes(mid, answer.option, offset, limit).then(votesList => {
          votesList.votes.forEach(vote => {
            const {dom} = appDialogsManager.addDialog(vote.user_id, list, false, false, undefined, false);
            dom.lastMessageSpan.parentElement.remove();
          });

          if(offset) {
            left -= votesList.votes.length;
            (showMore.lastElementChild as HTMLElement).innerText = `Show ${Math.min(20, left)} more voter${left > 1 ? 's' : ''}`;
          }
          
          offset = votesList.next_offset;
          limit = 20;

          if(!left || !votesList.votes.length) {
            showMore.remove();
          }
        }).finally(() => {
          loading = false;
        });
      };

      load();

      if(left <= 0) return;

      const showMore = document.createElement('div');
      showMore.classList.add('poll-results-more', 'show-more');
      showMore.addEventListener('click', load);

      showMore.innerHTML = `<div class="tgico-down"></div><div>Show ${Math.min(20, left)} more voter${left > 1 ? 's' : ''}</div>`;
      ripple(showMore);

      fragment.append(showMore);
    });

    this.resultsDiv.append(title, fragment);

    appSidebarRight.toggleSidebar(true).then(() => {
      /* appPollsManager.getVotes(mid).then(votes => {
        console.log('gOt VotEs', votes);
      }); */
    });
  }
}

const stickersTab = new AppStickersTab();
const pollResultsTab = new AppPollResultsTab();

export class AppSidebarRight extends SidebarSlider {
  public static SLIDERITEMSIDS = {
    search: 1,
    forward: 2,
    stickers: 3,
    pollResults: 4,
  };

  public profileContainer: HTMLDivElement;
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
    [type: string]: HTMLDivElement
  } = {};
  
  private loadSidebarMediaPromises: {[type: string]: Promise<void>} = {};
  private loadedAllMedia: {[type: string]: boolean} = {};
  
  public sharedMediaTypes = [
    //'members',
    'inputMessagesFilterContacts', 
    'inputMessagesFilterPhotoVideo', 
    'inputMessagesFilterDocument', 
    'inputMessagesFilterUrl', 
    'inputMessagesFilterMusic'
  ];
  public sharedMediaType: AppSidebarRight['sharedMediaTypes'][number] = '';
  private sharedMediaSelected: HTMLDivElement = null;
  
  private lazyLoadQueue = new LazyLoadQueue();
  
  public historiesStorage: {
    [peerID: number]: {
      [type: string]: number[]
    }
  } = {};
  public usedFromHistory: {
    [type: string]: number
  } = {};
  
  private log = logger('SR', LogLevels.error);
  
  private peerID = 0;
  
  public scroll: Scrollable = null;

  private profileTabs: HTMLUListElement;
  private prevTabID = -1;
  
  private mediaDivsByIDs: {
    [mid: number]: HTMLDivElement
  } = {};
  
  public urlsToRevoke: string[] = [];

  private searchContainer: HTMLDivElement;;
  public searchCloseBtn: HTMLButtonElement;
  private searchInput: SearchInput;
  public privateSearch: AppSearch;

  private loadMutex: Promise<any> = Promise.resolve();

  public stickersTab: AppStickersTab;
  public pollResultsTab: AppPollResultsTab;

  constructor() {
    super(document.getElementById('column-right') as HTMLElement, {
      [AppSidebarRight.SLIDERITEMSIDS.stickers]: stickersTab,
      [AppSidebarRight.SLIDERITEMSIDS.pollResults]: pollResultsTab,
    });

    //this._selectTab(3);

    this.stickersTab = stickersTab;
    this.pollResultsTab = pollResultsTab;

    this.profileContainer = this.sidebarEl.querySelector('.profile-container');
    this.profileContentEl = this.sidebarEl.querySelector('.profile-content');
    this.contentContainer = this.sidebarEl.querySelector('.content-container');
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
      contentMembers: this.profileContentEl.querySelector('#content-members'),
      contentMedia: this.profileContentEl.querySelector('#content-media'),
      contentDocuments: this.profileContentEl.querySelector('#content-docs'),
      contentLinks: this.profileContentEl.querySelector('#content-links'),
      contentAudio: this.profileContentEl.querySelector('#content-audio'),
    };

    this.searchContainer = this.sidebarEl.querySelector('#search-private-container');
    this.searchCloseBtn = this.searchContainer.querySelector('.sidebar-close-button');
    this.searchInput = new SearchInput('Search');
    this.searchCloseBtn.parentElement.append(this.searchInput.container);
    this.privateSearch = new AppSearch(this.searchContainer.querySelector('.chats-container'), this.searchInput, {
      messages: new SearchGroup('Private Search', 'messages')
    });

    let container = this.profileContentEl.querySelector('.content-container .tabs-container') as HTMLDivElement;
    this.profileTabs = this.profileContentEl.querySelector('.profile-tabs');
    
    this.scroll = new Scrollable(this.profileContainer, 'y', 'SR', undefined, 400);
    this.scroll.onScrolledBottom = () => {
      if(this.sharedMediaSelected && this.sharedMediaSelected.childElementCount/* && false */) {
        this.log('onScrolledBottom will load media');
        this.loadSidebarMedia(true);
      }
    };
    //this.scroll.attachSentinels(undefined, 400);
    
    horizontalMenu(this.profileTabs, container, (id, tabContent) => {
      if(this.prevTabID == id) return;
      
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
    });
    
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
      
      let targets = ids.map(id => ({element: this.mediaDivsByIDs[id].firstElementChild as HTMLElement, mid: id}));
      
      appMediaViewer.openMedia(message, target, false, this.sidebarEl, targets.slice(idx + 1).reverse(), targets.slice(0, idx).reverse(), true);
    });
    
    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      //let checked = this.profileElements.notificationsCheckbox.checked;
      appImManager.mutePeer(this.peerID);
    });
  }

  public beginSearch() {
    this.toggleSidebar(true);
    this.searchContainer.classList.add('active');
    this.privateSearch.beginSearch(this.peerID);
  }

  public toggleSidebar(enable?: boolean) {
    /////this.log('sidebarEl', this.sidebarEl, enable, isElementInViewport(this.sidebarEl));
    
    const active = this.sidebarEl.classList.contains('active');
    let willChange: boolean;
    if(enable !== undefined) {
      if(enable) {
        if(!active) {
          willChange = true;
        }
      } else if(active) {
        willChange = true;
      }
    } else {
      willChange = true;
    }

    if(!willChange) return Promise.resolve();

    //console.log('sidebar selectTab', enable, willChange);
    if(mediaSizes.isMobile) {
      appImManager.selectTab(active ? 1 : 2);
      return Promise.resolve();       
    }

    const set = () => {
      this.sidebarEl.classList.toggle('active', enable);
    };

    return new Promise((resolve, reject) => {
      const hidden: {element: HTMLDivElement, height: number}[] = [];
      const observer = new IntersectionObserver((entries) => {
        for(const entry of entries) {
          const bubble = entry.target as HTMLDivElement;
          if(!entry.isIntersecting) {
            hidden.push({element: bubble, height: bubble.scrollHeight});
          }
        }
  
        for(const item of hidden) {
          item.element.style.minHeight = item.height + 'px';
          (item.element.firstElementChild as HTMLElement).style.display = 'none';
          item.element.style.width = '1px';
        }
  
        //console.log('hidden', hidden);
        observer.disconnect();
  
        set();
  
        setTimeout(() => {
          for(const item of hidden) {
            item.element.style.minHeight = '';
            item.element.style.width = '';
            (item.element.firstElementChild as HTMLElement).style.display = '';
          }

          if(active) {
            appForward.close();
            this.searchCloseBtn.click();
          }

          resolve();
        }, 200);
      });
  
      const length = Object.keys(appImManager.bubbles).length;
      if(length) {
        for(const i in appImManager.bubbles) {
          observer.observe(appImManager.bubbles[i]);
        }
      } else {
        set();
        setTimeout(resolve, 200);
      }
    });
  }

  public filterMessagesByType(ids: number[], type: string) {
    let messages: any[] = [];
    for(let mid of ids) {
      let message = appMessagesManager.getMessage(mid);
      if(message.media) messages.push(message);
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
          if(!message.media.document || message.media.document.type == 'voice' || message.media.document.type == 'audio') {
            continue;
          }
          
          let doc = message.media.document;
          if(doc.attributes) {
            if(doc.attributes.find((a: any) => a._ == "documentAttributeSticker")) {
              continue;
            }
          }
          
          filtered.push(message);
        }
        break;
      }

      case 'inputMessagesFilterUrl': {
        for(let message of messages) {
          if(!message.media.webpage || message.media.webpage._ == 'webPageEmpty') {
            continue;
          }
          
          filtered.push(message);
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
  
  public async performSearchResult(messages: any[], type: string) {
    const peerID = this.peerID;
    const elemsToAppend: HTMLElement[] = [];
    const promises: Promise<any>[] = [];
    let sharedMediaDiv: HTMLDivElement;
    
    // https://core.telegram.org/type/MessagesFilter
    switch(type) {
      case 'inputMessagesFilterPhotoVideo': {
        sharedMediaDiv = this.sharedMedia.contentMedia;
        
        for(const message of messages) {
          const media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);

          const div = document.createElement('div');
          div.classList.add('media-item');
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
              const p = renderImageFromUrl(img, url);
              
              if(needBlur) {
                p.then(() => {
                  //void img.offsetLeft; // reflow
                  img.style.opacity = '';
                });
              }
            }
          });
          
          let thumb: HTMLImageElement;
          const sizes = media.sizes || media.thumbs;
          const willHaveThumb = !isDownloaded && sizes && sizes[0].bytes;
          if(willHaveThumb) {
            thumb = new Image();
            thumb.classList.add('media-image', 'thumbnail');
            thumb.dataset.mid = '' + message.mid;
            appPhotosManager.setAttachmentPreview(sizes[0].bytes, thumb, false, false);
            div.append(thumb);
          }

          const needBlur = !isDownloaded || !willHaveThumb;
          const img = new Image();
          img.dataset.mid = '' + message.mid;
          img.classList.add('media-image');
          if(needBlur) img.style.opacity = '0';
          div.append(img);

          if(isDownloaded || willHaveThumb) {
            const promise = new Promise((resolve, reject) => {
              (thumb || img).addEventListener('load', () => {
                clearTimeout(timeout);
                resolve();
              });

              const timeout = setTimeout(() => {
                this.log('did not loaded', thumb, media, isDownloaded, sizes);
                reject();
              }, 1e3);
            });

            promises.push(promise);
          }
          
          if(isDownloaded) load();
          else this.lazyLoadQueue.push({div, load});

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
          let webpage = message.media.webpage;
          let div = document.createElement('div');
          
          let previewDiv = document.createElement('div');
          previewDiv.classList.add('preview');
          
          //this.log('wrapping webpage', webpage);
          
          previewDiv.innerText = (webpage.title || webpage.description || webpage.url || webpage.display_url).slice(0, 1);
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
            title = webpage.display_url.split('/', 1)[0];
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
    
    if(elemsToAppend.length) {
      if(promises.length) {
        await Promise.all(promises);
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
      }

      sharedMediaDiv.append(...elemsToAppend);
    }
    
    if(sharedMediaDiv) {
      let parent = sharedMediaDiv.parentElement;
      if(parent.lastElementChild.classList.contains('preloader')) {
        parent.lastElementChild.remove();
        //this.contentContainer.classList.add('loaded');
      }
    }
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

    let loadCount = (appPhotosManager.windowH / 130 | 0) * 3; // that's good for all types
    
    let historyStorage = this.historiesStorage[peerID] ?? (this.historiesStorage[peerID] = {});

    let promises = typesToLoad.map(type => {
      if(this.loadSidebarMediaPromises[type]) return this.loadSidebarMediaPromises[type];
      
      let history = historyStorage[type] ?? (historyStorage[type] = []);

      // render from cache
      if(history.length && this.usedFromHistory[type] < history.length) {
        let messages: any[] = [];
        let used = this.usedFromHistory[type];

        do {
          let ids = history.slice(used, used + loadCount);
          this.log('loadSidebarMedia: will render from cache', used, history, ids, loadCount);
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
        if(messages.length) {
          return this.performSearchResult(messages, type);
        }

        return Promise.resolve();
      }
      
      // заливать новую картинку сюда только после полной отправки!
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
        
        this.log('loadSidebarMedia: search house of glass', type, value, ids);

        if($rootScope.selectedPeerID != peerID) {
          this.log.warn('peer changed');
          return;
        }
        
        if(value.history.length < loadCount) {
          this.loadedAllMedia[type] = true;
        }

        this.usedFromHistory[type] = history.length;

        if(ids.length) {
          return this.performSearchResult(this.filterMessagesByType(ids, type), type);
        }
      }, (err) => {
        this.log.error('load error:', err);
      }).then(() => {
        this.loadSidebarMediaPromises[type] = null;
      });
    });
    
    return Promise.all(promises);
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

    Object.keys(this.sharedMedia).forEach(key => {
      this.sharedMedia[key].innerHTML = '';
      
      if(!this.historiesStorage[this.peerID] || !this.historiesStorage[this.peerID][key]) {
        let parent = this.sharedMedia[key].parentElement;
        if(!parent.querySelector('.preloader')) {
          putPreloader(parent, true);
        }
      }
    });

    if(testScroll) {
      for(let i = 0; i < 30; ++i) {
        //div.insertAdjacentHTML('beforeend', `<div style="background-image: url(assets/img/camomile.jpg);"></div>`);
        let div = document.createElement('div');
        div.classList.add('media-item');
        div.dataset.id = '' + (i / 3 | 0);
        div.innerText = '' + (i / 3 | 0);
        this.sharedMedia.contentMedia.append(div);
      }
      
      (this.profileTabs.children[1] as HTMLLIElement).click(); // set media
    }

    (this.profileTabs.firstElementChild.children[1] as HTMLLIElement).click(); // set media
  }

  public setLoadMutex(promise: Promise<any>) {
    this.loadMutex = promise;
  }

  public setPeer(peerID: number) {
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
      
      appProfileManager.getChatFull(chat.id).then((chatFull: any) => {
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
}

const appSidebarRight = new AppSidebarRight();
// @ts-ignore
if(process.env.NODE_ENV != 'production') {
  (window as any).appSidebarRight = appSidebarRight;
}
export default appSidebarRight;
