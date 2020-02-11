import { horizontalMenu, formatPhoneNumber } from "../../components/misc";
import Scrollable from '../../components/scrollable';
import { isElementInViewport, $rootScope } from "../utils";
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
import { wrapDocument } from "../../components/wrappers";

class AppSidebarRight {
  public sidebarEl = document.querySelector('.profile-container') as HTMLDivElement;
  public profileContentEl = document.querySelector('.profile-content') as HTMLDivElement;
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

  private loadSidebarMediaPromises: {
    [type: string]: Promise<void>
  } = {};

  public sharedMediaTypes = [
    'inputMessagesFilterContacts', 
    'inputMessagesFilterPhotoVideo', 
    'inputMessagesFilterDocument', 
    'inputMessagesFilterUrl', 
    'inputMessagesFilterVoice'
  ];
  public sharedMediaType: string = '';
  private sharedMediaSelected: HTMLDivElement = null;

  private lazyLoadQueueSidebar = new LazyLoadQueue();
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

  private log = logger('SR');

  private peerID = 0;

  public sidebarScroll: Scrollable = null;
  private savedVirtualStates: {
    [id: number]: {
      hiddenElements: any,
      paddings: any
    }
  }

  private profileTabs: HTMLUListElement;
  private prevTabID = -1;

  constructor() {
    let container = this.profileContentEl.querySelector('.profile-tabs-content') as HTMLDivElement;
    this.profileTabs = this.profileContentEl.querySelector('.profile-tabs') as HTMLUListElement;

    this.sidebarScroll = new Scrollable(this.sidebarEl);
    this.sidebarScroll.container.addEventListener('scroll', this.onSidebarScroll.bind(this));

    horizontalMenu(this.profileTabs, container, (id, tabContent) => {
      this.sharedMediaType = this.sharedMediaTypes[id];
      this.sharedMediaSelected = tabContent.firstElementChild as HTMLDivElement;

      if(this.prevTabID != -1) {
        this.savedVirtualStates[this.prevTabID] = {
          hiddenElements: {
            up: this.sidebarScroll.hiddenElements.up.slice(),
            down: this.sidebarScroll.hiddenElements.down.slice(),
          },
          paddings: {
            up: this.sidebarScroll.paddings.up,
            down: this.sidebarScroll.paddings.down
          } 
        };
      }

      this.prevTabID = id;

      this.log('setVirtualContainer', id, this.sharedMediaSelected);
      this.sidebarScroll.setVirtualContainer(this.sharedMediaSelected);

      if(this.savedVirtualStates[id]) {
        this.log(this.savedVirtualStates[id]);
        this.sidebarScroll.hiddenElements = this.savedVirtualStates[id].hiddenElements;
        this.sidebarScroll.paddings = this.savedVirtualStates[id].paddings;
      }
    }, this.onSidebarScroll.bind(this));

    //(this.profileTabs.children[1] as HTMLLIElement).click(); // set media

    let sidebarCloseBtn = this.sidebarEl.querySelector('.sidebar-close-button') as HTMLButtonElement;
    sidebarCloseBtn.addEventListener('click', () => {
      this.toggleSidebar(false);
    });

    this.sharedMedia.contentMedia.addEventListener('click', (e) => {
      let target = e.target as HTMLDivElement;

      let messageID = +target.getAttribute('message-id');
      if(!messageID) {
        this.log.warn('no messageID by click on target:', target);
        return;
      }

      let message = appMessagesManager.getMessage(messageID);
      appMediaViewer.openMedia(message, false);
    });

    this.profileElements.notificationsCheckbox.addEventListener('change', () => {
      let checked = this.profileElements.notificationsCheckbox.checked;
      appImManager.mutePeer();
    });

    window.addEventListener('resize', () => {
      setTimeout(() => this.onSidebarScroll(), 0);
    });
  }

  public onSidebarScroll() {
    this.lazyLoadQueueSidebar.check();

    if(this.sharedMediaSelected && !this.sidebarScroll.hiddenElements.down.length/* && false */) {
      let media = Array.from(this.sharedMediaSelected.childNodes).slice(-15);
      for(let div of media) {
        if(isElementInViewport(div)) {
          this.log('Will load more media');
          this.loadSidebarMedia(true);
  
          break;
        }
      }
    }
  }

  public toggleSidebar(enable?: boolean) {
    this.log('sidebarEl', this.sidebarEl, enable, isElementInViewport(this.sidebarEl));

    /* if(enable !== undefined) {
      this.sidebarEl.style.display = enable ? 'block' : 'none';
      return;
    }

    this.sidebarEl.style.display = isElementInViewport(this.sidebarEl) ? 'none' : 'block'; */
    if(enable !== undefined) {
      this.sidebarEl.style.width = enable ? '25%' : '0%';
      return;
    }

    this.sidebarEl.style.width = isElementInViewport(this.sidebarEl) ? '0%' : '25%';
  }

  public loadSidebarMedia(single = false) {
    let peerID = this.peerID;
    
    let typesToLoad = single ? [this.sharedMediaType] : this.sharedMediaTypes;

    if(!this.historiesStorage[peerID]) this.historiesStorage[peerID] = {};
    let historyStorage = this.historiesStorage[peerID];

    let promises = typesToLoad.map(type => {
      if(this.loadSidebarMediaPromises[type]) return this.loadSidebarMediaPromises[type];

      if(!historyStorage[type]) historyStorage[type] = [];
      let history = historyStorage[type];

      // заливать новую картинку сюда только после полной отправки!
      //let maxID = this.minMediaID[type] || 0;
      let maxID = history[history.length - 1] || 0;

      let ids = !maxID && appMessagesManager.historiesStorage[peerID] 
        ? appMessagesManager.historiesStorage[peerID].history.slice() : [];

      maxID = !maxID && ids.length ? ids[ids.length - 1] : maxID;
      //this.log('search house of glass pre', type, ids, maxID);

      return this.loadSidebarMediaPromises[type] = appMessagesManager.getSearch(peerID, '', {_: type}, maxID, 50)
      .then(value => {
        ids = ids.concat(value.history);
        history.push(...ids);

        //this.log('search house of glass', type, value, ids, this.cleared);

        if($rootScope.selectedPeerID != peerID) {
          this.log.warn('peer changed');
          return;
        }

        if(this.cleared[type]) {
          ids = history;
          delete this.cleared[type];
        }
  
        ids.forEach(mid => {
          //this.minMediaID[type] = mid;
          let message = appMessagesManager.getMessage(mid);
          if(!message.media) return;

          /*'inputMessagesFilterContacts', 
            'inputMessagesFilterPhotoVideo', 
            'inputMessagesFilterDocument', 
            'inputMessagesFilterUrl', 
            'inputMessagesFilterVoice'*/
          switch(type) {
            case 'inputMessagesFilterPhotoVideo': {
              /* if(!(message.media.photo || message.media.document || message.media.webpage.document)) {
                this.log.error('no media!', message);
                break;
              } */

              let media = message.media.photo || message.media.document || (message.media.webpage && message.media.webpage.document);

              if(!media) {
                this.log('no media!', message);
                break;
              }

              if(media._ == 'document' && media.type != 'video'/*  && media.type != 'gif' */) {
                this.log('broken video', media);
                break;
              }

              let div = document.createElement('div');
              //console.log(message, photo);
      
              let sizes = media.sizes || media.thumbs;
              if(sizes && sizes[0].bytes) {
                appPhotosManager.setAttachmentPreview(sizes[0].bytes, div, false, true);
              } /* else {
                this.log('no stripped size', message, media);
              } */

              //this.log('inputMessagesFilterPhotoVideo', message, media);
      
              let load = () => appPhotosManager.preloadPhoto(media, appPhotosManager.choosePhotoSize(media, 380, 0))
              .then((blob) => {
                if($rootScope.selectedPeerID != peerID) {
                  this.log.warn('peer changed');
                  return;
                }
      
                div.style.backgroundImage = 'url(' + URL.createObjectURL(blob) + ')';
              });

              div.setAttribute('message-id', '' + mid);
      
              this.lazyLoadQueueSidebar.push({div, load});

              this.lastSharedMediaDiv.append(div);
              if(this.lastSharedMediaDiv.childElementCount == 3) {
                this.sharedMedia.contentMedia.append(this.lastSharedMediaDiv);
                this.lastSharedMediaDiv = document.createElement('div');
              }
      
              //this.sharedMedia.contentMedia.append(div);

              break;
            }
            
            case 'inputMessagesFilterDocument': {
              if(!message.media.document) {
                break;
              }

              let doc = message.media.document;
              if(doc.attributes) {
                if(doc.attributes.find((a: any) => a._ == "documentAttributeSticker")) {
                  break;
                }
              }

              //console.log('come back down to my knees', message);

              let div = wrapDocument(message.media.document, true);
              this.sharedMedia.contentDocuments.append(div);
              break;
            }
            
            default:
              //console.warn('death is my friend', message);
              break;
          }
        });
        
        this.onSidebarScroll();
      }).then(() => {
        this.loadSidebarMediaPromises[type] = null;
      }, (err) => {
        this.log.error('load error:', err);
        this.loadSidebarMediaPromises[type] = null;
      });
    });

    return promises;
  }

  public fillProfileElements() {
    let peerID = this.peerID = $rootScope.selectedPeerID;
    this.loadSidebarMediaPromises = {};
    this.lastSharedMediaDiv = document.createElement('div');

    this.log('fillProfileElements');

    this.savedVirtualStates = {};
    this.prevTabID = -1;
    (this.profileTabs.children[1] as HTMLLIElement).click(); // set media

    if(this.sharedMediaSelected) {
      //this.sidebarScroll.setVirtualContainer(this.sharedMediaSelected);
    }

    this.profileContentEl.parentElement.scrollTop = 0;
    this.profileElements.bio.style.display = 'none';
    this.profileElements.phone.style.display = 'none';
    this.profileElements.username.style.display = 'none';
    this.profileElements.notificationsRow.style.display = '';
    this.profileElements.notificationsCheckbox.checked = true;
    this.profileElements.notificationsStatus.innerText = 'Enabled';

    Object.keys(this.sharedMedia).forEach(key => {
      this.sharedMedia[key].innerHTML = '';
    });

    this.sharedMediaTypes.forEach(type => {
      //this.minMediaID[type] = 0;
      this.cleared[type] = true;
    });

    let setText = (text: string, el: HTMLDivElement) => {
      el.style.display = '';
      if(el.childElementCount > 1) {
        el.firstElementChild.remove();
      }

      let p = document.createElement('p');
      p.innerHTML = text;
      el.prepend(p);
    };

    // username
    if(peerID != appImManager.myID) {
      let username = appPeersManager.getPeerUsername(peerID);
      if(username) {
        setText(appPeersManager.getPeerUsername(peerID), this.profileElements.username);
      }
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
  
        this.log('userFull', userFull);

        if(userFull.pinned_msg_id) { // request pinned message
          appImManager.pinnedMsgID = userFull.pinned_msg_id;
          appMessagesManager.wrapSingleMessage(userFull.pinned_msg_id);
        }
      });
    } else {
      let chat = appPeersManager.getPeer(peerID);

      appProfileManager.getChatFull(chat.id).then((chatFull: any) => {
        if(this.peerID != peerID) {
          this.log.warn('peer changed');
          return;
        }

        this.log('chatInfo res 2:', chatFull);

        if(chatFull.about) {
          setText(RichTextProcessor.wrapRichText(chatFull.about), this.profileElements.bio);
        }
      });
    }

    if(peerID != appImManager.myID) {
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
      this.profileElements.notificationsRow.style.display = 'none';
    }

    //this.loadSidebarMedia();
  }
}

export default new AppSidebarRight();
