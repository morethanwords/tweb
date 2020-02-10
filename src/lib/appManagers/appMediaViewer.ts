import { MTDocument, ProgressivePreloader, wrapVideo } from "../../components/misc";
import appPeersManager from "./appPeersManager";
import appDialogsManager from "./appDialogsManager";
import appPhotosManager from "./appPhotosManager";
import appSidebarRight from "./appSidebarRight";
import { $rootScope } from "../utils";
import appMessagesManager from "./appMessagesManager";
import { CancellablePromise } from "../mtproto/apiFileManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../polyfill";

export class AppMediaViewer {
  private overlaysDiv = document.querySelector('.overlays') as HTMLDivElement;
  private author = {
    avatarEl: this.overlaysDiv.querySelector('.user-avatar') as HTMLDivElement,
    nameEl: this.overlaysDiv.querySelector('.media-viewer-name') as HTMLDivElement,
    date: this.overlaysDiv.querySelector('.media-viewer-date') as HTMLDivElement
  };
  private buttons = {
    delete: this.overlaysDiv.querySelector('.media-viewer-delete-button') as HTMLDivElement,
    forward: this.overlaysDiv.querySelector('.media-viewer-forward-button') as HTMLDivElement,
    download: this.overlaysDiv.querySelector('.media-viewer-download-button') as HTMLDivElement,
    close: this.overlaysDiv.querySelector('.media-viewer-close-button') as HTMLDivElement,
    prev: this.overlaysDiv.querySelector('.media-viewer-switcher-left') as HTMLDivElement,
    next: this.overlaysDiv.querySelector('.media-viewer-switcher-right') as HTMLDivElement,
  };
  private content = {
    container: this.overlaysDiv.querySelector('.media-viewer-media') as HTMLDivElement,
    caption: this.overlaysDiv.querySelector('.media-viewer-caption') as HTMLDivElement
  };
  
  private reverse = false;
  public currentMessageID = 0;
  private higherMsgID: number | undefined = 0;
  private lowerMsgID: number | undefined = 0;
  private preloader: ProgressivePreloader = null;

  public log: ReturnType<typeof logger>; 
  
  constructor() {
    this.log = logger('AMV');
    this.preloader = new ProgressivePreloader();
    
    this.buttons.close.addEventListener('click', () => {
      this.overlaysDiv.classList.remove('active');
      this.content.container.innerHTML = '';
      this.currentMessageID = 0;
    });
    
    this.buttons.prev.addEventListener('click', () => {
      let id = this.reverse ? this.lowerMsgID : this.higherMsgID;
      if(id) {
        this.openMedia(appMessagesManager.getMessage(id), this.reverse);
      } else {
        this.buttons.prev.style.display = 'none';
      }
    });
    
    this.buttons.next.addEventListener('click', () => {
      let id = this.reverse ? this.higherMsgID : this.lowerMsgID;
      if(id) {
        this.openMedia(appMessagesManager.getMessage(id), this.reverse);
      } else {
        this.buttons.next.style.display = 'none';
      }
    });
    /* this.buttons.prev.onclick = (e) => {
      let history = appSidebarRight.historiesStorage[$rootScope.selectedPeerID]['inputMessagesFilterPhotoVideo'].slice();
      
      let message: any;
      
      if(!this.reverse) {
        for(let mid of history) {
          if(mid > this.currentMessageID) {
            let _message = appMessagesManager.getMessage(mid);
            if(_message.media && _message.media.photo) {
              message = _message;
            }
          } else break;
        }
      } else {
        for(let mid of history) {
          if(mid < this.currentMessageID) {
            let _message = appMessagesManager.getMessage(mid);
            if(_message.media && _message.media.photo) {
              message = _message;
              break;
            }
          }
        }
      }
      
      if(message) {
        this.openMedia(message.media.photo, message.mid, this.reverse);
      } else {
        this.buttons.prev.style.display = 'none';
      }
    };
    
    this.buttons.next.onclick = (e) => {
      let history = appSidebarRight.historiesStorage[$rootScope.selectedPeerID]['inputMessagesFilterPhotoVideo'].slice();
      
      let message: any;
      
      if(this.reverse) {
        for(let mid of history) {
          if(mid > this.currentMessageID) {
            let _message = appMessagesManager.getMessage(mid);
            if(_message.media && _message.media.photo) {
              message = _message;
            }
          } else break;
        }
      } else {
        for(let mid of history) {
          if(mid < this.currentMessageID) {
            let _message = appMessagesManager.getMessage(mid);
            if(_message.media && _message.media.photo) {
              message = _message;
              break;
            }
          }
        }
      }
      
      if(message) {
        this.openMedia(message.media.photo, message.mid, this.reverse);
      } else {
        this.buttons.next.style.display = 'none';
      }
    }; */
  }
  
  public openMedia(message: any, reverse = false) {
    this.log('openMedia doc:', message);
    let media = message.media.photo || message.media.document || message.media.webpage.document || message.media.webpage.photo;
    
    let isVideo = media.mime_type == 'video/mp4';
    
    this.currentMessageID = message.mid;
    this.reverse = reverse;
    
    let container = this.content.container;
    
    if(container.firstElementChild) {
      container.innerHTML = '';
    }
    
    let date = new Date(media.date * 1000);
    let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    let dateStr = months[date.getMonth()] + ' ' + date.getDate() + ' at '+ date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
    this.author.date.innerText = dateStr;
    
    let name = appPeersManager.getPeerTitle(message.fromID);
    this.author.nameEl.innerHTML = name;
    
    if(message.message) {
      this.content.caption.innerHTML = RichTextProcessor.wrapRichText(message.message, {
        entities: message.totalEntities
      });
    } else {
      this.content.caption.innerHTML = '';
    }
    
    appDialogsManager.loadDialogPhoto(this.author.avatarEl, message.fromID);
    
    this.overlaysDiv.classList.add('active');

    container.classList.add('loading');

    if(isVideo) {
      //this.preloader.attach(container);
      //this.preloader.setProgress(75);

      this.log('will wrap video');

      appPhotosManager.setAttachmentSize(media, container, appPhotosManager.windowW, appPhotosManager.windowH);
      wrapVideo.call(this, media, container, message, false, this.preloader).then(() => {
        if(this.currentMessageID != message.mid) {
          this.log.warn('media viewer changed video');
          return;
        }

        container.classList.remove('loading');
        container.style.width = '';
        container.style.height = '';
      });
    } else {
      let size = appPhotosManager.setAttachmentSize(media.id, container, appPhotosManager.windowW, appPhotosManager.windowH);
      
      this.preloader.attach(container);
      //this.preloader.setProgress(75);
      
      let cancellablePromise = appPhotosManager.preloadPhoto(media.id, size);
      cancellablePromise.then((blob) => {
        if(this.currentMessageID != message.mid) {
          this.log.warn('media viewer changed photo');
          return;
        }
        
        this.log('indochina', blob);
        if(container.firstElementChild) {
          container.firstElementChild.remove();
        }
        
        let image = new Image();
        image.src = URL.createObjectURL(blob);
        container.append(image);

        container.classList.remove('loading');
        
        container.style.width = '';
        container.style.height = '';
        
        this.preloader.detach();
      }).catch(err => {
        this.log.error(err);
      });
    }
    
    let history = appSidebarRight.historiesStorage[$rootScope.selectedPeerID]['inputMessagesFilterPhotoVideo'].slice();
    let index = history.findIndex(m => m == message.mid);
    let comparer = (mid: number) => {
      let _message = appMessagesManager.getMessage(mid);
      if(_message.media && _message.media.photo) return true;
      return false;
    };
    
    this.higherMsgID = history.slice(0, index).reverse().find(comparer);
    this.lowerMsgID = history.slice(index + 1).find(comparer);
    
    if(this.reverse) {
      this.buttons.prev.style.display = this.lowerMsgID !== undefined ? '' : 'none';
      this.buttons.next.style.display = this.higherMsgID !== undefined ? '' : 'none';
    } else {
      this.buttons.prev.style.display = this.higherMsgID !== undefined ? '' : 'none';
      this.buttons.next.style.display = this.lowerMsgID !== undefined ? '' : 'none';
    }
    
    //console.log('prev and next', prevMsgID, nextMsgID);
  }
}

export default new AppMediaViewer();
