import appPeersManager from "./appPeersManager";
import appDialogsManager from "./appDialogsManager";
import appPhotosManager from "./appPhotosManager";
import appMessagesManager from "./appMessagesManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../polyfill";
import ProgressivePreloader from "../../components/preloader";
import { wrapVideo } from "../../components/wrappers";

export class AppMediaViewer {
  private overlaysDiv = document.querySelector('.overlays') as HTMLDivElement;
  private mediaViewerDiv = this.overlaysDiv.firstElementChild as HTMLDivElement;
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
    caption: this.overlaysDiv.querySelector('.media-viewer-caption') as HTMLDivElement,
    mover: this.overlaysDiv.querySelector('.media-viewer-mover') as HTMLDivElement
  };
  
  public currentMessageID = 0;
  private preloader: ProgressivePreloader = null;

  private lastTarget: HTMLElement = null;
  private prevTarget: HTMLElement = null;
  private nextTarget: HTMLElement = null;

  public log: ReturnType<typeof logger>; 
  
  constructor() {
    this.log = logger('AMV');
    this.preloader = new ProgressivePreloader();
    
    this.buttons.close.addEventListener('click', () => {
      //this.overlaysDiv.classList.remove('active');
      this.content.container.innerHTML = '';
      this.currentMessageID = 0;

      this.setMoverToTarget(this.lastTarget, true);
    });
    
    this.buttons.prev.addEventListener('click', () => {
      let target = this.prevTarget;
      if(target) {
        target.click();
      } else {
        this.buttons.prev.style.display = 'none';
      }
    });
    
    this.buttons.next.addEventListener('click', () => {
      let target = this.nextTarget;
      if(target) {
        target.click();
      } else {
        this.buttons.next.style.display = 'none';
      }
    });

    this.buttons.download.addEventListener('click', () => {
      let message = appMessagesManager.getMessage(this.currentMessageID);
      appPhotosManager.downloadPhoto(message.media.photo.id);
    });

    this.overlaysDiv.addEventListener('click', (e) => {
      let target = e.target as HTMLElement;

      if(target == this.mediaViewerDiv || target.tagName == 'IMG') {
        this.buttons.close.click();
      }
    });
  }

  public setMoverToTarget(target: HTMLElement, closing = false) {
    let mover = this.content.mover;

    if(!closing) {
      mover.innerHTML = '';
    }

    let rect = target.getBoundingClientRect();
    let containerRect = this.content.container.getBoundingClientRect();
    let scaleX = rect.width / containerRect.width;
    let scaleY = rect.height / containerRect.height;
    mover.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(${scaleX}, ${scaleY})`;
    mover.style.width = containerRect.width + 'px';
    mover.style.height = containerRect.height + 'px';

    mover.style.borderRadius = window.getComputedStyle(target.parentElement).getPropertyValue('border-radius');

    if(!closing) {
      let img: HTMLImageElement;
      let video: HTMLVideoElement;

      if(target.tagName == 'DIV') { // means backgrounded with cover
        //img.style.objectFit = 'cover';
        img = new Image();
        img.src = target.style.backgroundImage.slice(5, -2);
      } else if(target.tagName == 'IMG') {
        img = new Image();
        img.src = (target as HTMLImageElement).src;
        img.style.objectFit = 'contain';
      } else if(target.tagName == 'VIDEO') {
        video = document.createElement('video');
        let source = document.createElement('source');
        source.src = target.querySelector('source').src;
        video.append(source);
      }

      if(img) {
        mover.appendChild(img);
      } else if(video) {
        mover.appendChild(video);
      }
  
      mover.style.display = '';
      mover.classList.add('active');
    } else {
      setTimeout(() => {
        this.overlaysDiv.classList.remove('active');
      }, 200 / 2);
      setTimeout(() => {
        mover.innerHTML = '';
        mover.classList.remove('active');
        mover.style.display = 'none';
      }, 200);
    }

    return () => {
      mover.style.transform = `translate(${containerRect.left}px, ${containerRect.top}px) scale(1, 1)`;

      setTimeout(() => {
        mover.style.borderRadius = '';
      }, 200 / 2);
    };
  }
  
  public openMedia(message: any, target?: HTMLElement, prevTarget?: HTMLElement, nextTarget?: HTMLElement) {
    this.log('openMedia doc:', message, prevTarget, nextTarget);
    let media = message.media.photo || message.media.document || message.media.webpage.document || message.media.webpage.photo;
    
    let isVideo = media.mime_type == 'video/mp4';
    
    this.currentMessageID = message.mid;
    this.prevTarget = prevTarget || null;
    this.nextTarget = nextTarget || null;
    
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

    // ok set
    let mover = this.content.mover;

    this.lastTarget = target;
    let maxWidth = appPhotosManager.windowW - 16;
    let maxHeight = appPhotosManager.windowH - 100;
    if(isVideo) {
      let size = appPhotosManager.setAttachmentSize(media, container, maxWidth, maxHeight);

      this.log('will wrap video', media, size);

      let afterTimeout = this.setMoverToTarget(target);
      
      setTimeout(() => {
        afterTimeout();

        wrapVideo.call(this, media, mover, message, false, this.preloader).then(() => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed video');
            return;
          }
        });
      });
    } else {
      let size = appPhotosManager.setAttachmentSize(media.id, container, maxWidth, maxHeight);

      let afterTimeout = this.setMoverToTarget(target);
      
      setTimeout(() => {
        afterTimeout();
        this.preloader.attach(mover);

        let cancellablePromise = appPhotosManager.preloadPhoto(media.id, size);
        cancellablePromise.then((blob) => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed photo');
            return;
          }
          
          this.log('indochina', blob);

          let image = mover.firstElementChild as HTMLImageElement || new Image();
          image.src = URL.createObjectURL(blob);
          mover.append(image);

          this.preloader.detach();
        }).catch(err => {
          this.log.error(err);
        });
      }, 0);
    }
    
    this.buttons.prev.style.display = this.prevTarget ? '' : 'none';
    this.buttons.next.style.display = this.nextTarget ? '' : 'none';
  }
}

export default new AppMediaViewer();
