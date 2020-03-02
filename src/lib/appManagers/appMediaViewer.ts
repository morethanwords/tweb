import appPeersManager from "./appPeersManager";
import appDialogsManager from "./appDialogsManager";
import appPhotosManager from "./appPhotosManager";
import appMessagesManager from "./appMessagesManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../polyfill";
import ProgressivePreloader from "../../components/preloader";
import { wrapVideo } from "../../components/wrappers";
import { findUpClassName } from "../utils";
import appDocsManager from "./appDocsManager";

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
    //mover: this.overlaysDiv.querySelector('.media-viewer-mover') as HTMLDivElement
    mover: document.querySelector('.media-viewer-mover') as HTMLDivElement
  };
  
  public currentMessageID = 0;
  private preloader: ProgressivePreloader = null;

  private lastTarget: HTMLElement = null;
  private prevTarget: HTMLElement = null;
  private nextTarget: HTMLElement = null;

  public log: ReturnType<typeof logger>; 
  public onKeyDownBinded: any;
  public onClickBinded: any;
  
  constructor() {
    this.log = logger('AMV');
    this.preloader = new ProgressivePreloader();

    this.onKeyDownBinded = this.onKeyDown.bind(this);
    
    this.buttons.close.addEventListener('click', () => {
      //this.overlaysDiv.classList.remove('active');
      this.content.container.innerHTML = '';
      if(this.content.container.firstElementChild) {
        URL.revokeObjectURL((this.content.container.firstElementChild as HTMLImageElement).src);
      }

      this.currentMessageID = 0;

      this.setMoverToTarget(this.lastTarget, true);

      this.lastTarget = null;
      this.prevTarget = null;
      this.nextTarget = null;

      window.removeEventListener('keydown', this.onKeyDownBinded);
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
      if(message.media.photo) {
        appPhotosManager.downloadPhoto(message.media.photo.id);
      } else {
        let document: any = null;

        if(message.media.webpage) document = message.media.webpage.document;
        else document = message.media.document;

        if(document) {
          console.log('will save document:', document);
          appDocsManager.saveDocFile(document.id);
        }
      }
    });

    this.onClickBinded = (e: MouseEvent) => {
      let target = e.target as HTMLElement;

      let mover: HTMLDivElement = null;
      ['media-viewer-mover', 'media-viewer-buttons', 'media-viewer-author'].find(s => {
        try {
          mover = findUpClassName(target, s);
          if(mover) return true;
        } catch(err) {return false;}
      });

      if(/* target == this.mediaViewerDiv */!mover || target.tagName == 'IMG') {
        this.buttons.close.click();
      }
    };

    this.overlaysDiv.addEventListener('click', this.onClickBinded);
    this.content.mover.addEventListener('click', this.onClickBinded);
    //this.content.mover.append(this.buttons.prev, this.buttons.next);
  }

  public onKeyDown(e: KeyboardEvent) {
    //this.log('onKeyDown', e);
    
    if(e.key == 'ArrowRight') {
      this.buttons.next.click();
    } else if(e.key == 'ArrowLeft') {
      this.buttons.prev.click();
    }
  }

  public setMoverToTarget(target: HTMLElement, closing = false, fromRight = 0) {
    let mover = this.content.mover;

    if(!closing) {
      mover.innerHTML = '';
      mover.append(this.buttons.prev, this.buttons.next);
    }

    let wasActive = fromRight !== 0;

    let delay = wasActive ? 350 : 200;

    /* if(wasActive) {
      this.moveTheMover(mover);
      mover = this.setNewMover();
    } */

    ///////this.log('setMoverToTarget', target, closing, wasActive, fromRight);

    let rect = target.getBoundingClientRect();
    let containerRect = this.content.container.getBoundingClientRect();
    
    let transform = '';
    let left: number;
    let top: number;

    if(wasActive) {
      left = fromRight === 1 ? appPhotosManager.windowW : -containerRect.width;
      top = containerRect.top;
    } else {
      left = rect.left;
      top = rect.top;
    }

    transform += `translate(${left}px,${top}px) `;

    mover.style.width = containerRect.width + 'px';
    mover.style.height = containerRect.height + 'px';

    mover.classList.remove('cover');

    let borderRadius = '';
    if(!wasActive) {
      let scaleX = rect.width / containerRect.width;
      let scaleY = rect.height / containerRect.height;
      transform += `scale(${scaleX},${scaleY}) `;

      borderRadius = window.getComputedStyle(target.parentElement).getPropertyValue('border-radius');
      mover.style.borderRadius = borderRadius;
    }

    mover.style.transform = transform;

    /* if(wasActive) {
      this.log('setMoverToTarget', mover.style.transform);
    } */

    if(!closing) {
      let img: HTMLImageElement;
      let video: HTMLVideoElement;

      if(target.tagName == 'DIV') { // means backgrounded with cover
        //img.style.objectFit = 'cover';
        img = new Image();
        img.src = target.style.backgroundImage.slice(5, -2);
        //mover.classList.add('cover');
        //mover.style.backgroundImage = target.style.backgroundImage;
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
        img.style.borderRadius = borderRadius;
        mover.prepend(img);
      } else if(video) {
        video.style.borderRadius = borderRadius;
        mover.prepend(video);
      }
  
      mover.style.display = '';

      setTimeout(() => {
        mover.classList.add(wasActive ? 'moving' : 'active');
      }, 0); 
    } else {
      setTimeout(() => {
        this.overlaysDiv.classList.remove('active');
      }, 0);

      setTimeout(() => {
        mover.style.borderRadius = borderRadius;

        if(mover.firstElementChild) {
          (mover.firstElementChild as HTMLElement).style.borderRadius = borderRadius;
        }

        if(target.tagName == 'DIV') {
          mover.classList.add('cover');
        }
      }, delay / 2);

      setTimeout(() => {
        mover.innerHTML = '';
        mover.classList.remove('moving', 'active', 'cover');
        mover.style.display = 'none';
      }, delay);
    }

    return () => {
      mover.style.transform = `translate(${containerRect.left}px,${containerRect.top}px) scale(1,1)`;

      setTimeout(() => {
        mover.style.borderRadius = '';

        if(mover.firstElementChild) {
          (mover.firstElementChild as HTMLElement).style.borderRadius = '';
        }

        mover.classList.remove('cover');
      }, delay / 2);
    };
  }

  public moveTheMover(mover: HTMLDivElement, toLeft = true) {
    let windowW = appPhotosManager.windowW;
    let windowH = appPhotosManager.windowH;

    mover.classList.add('moving');

    let rect = mover.getBoundingClientRect();

    let newTransform = mover.style.transform.replace(/translate\((.+?),/, /* 'translate(-' + windowW + 'px,', */ (match, p1) => {
      /////////this.log('replace func', match, p1);
      let x = +p1.slice(0, -2);
      x = toLeft ? -rect.width : windowW;

      return match.replace(p1, x + 'px');
    });

    ////////this.log('set newTransform:', newTransform, mover.style.transform, toLeft);
    mover.style.transform = newTransform;

    setTimeout(() => {
      mover.remove();
    }, 350);
  }

  public setNewMover() {
    let newMover = document.createElement('div');
    newMover.classList.add('media-viewer-mover');

    let oldMover = this.content.mover;
    oldMover.parentElement.append(newMover);

    newMover.addEventListener('click', this.onClickBinded);

    return this.content.mover = newMover;
  }
  
  public openMedia(message: any, target?: HTMLElement, prevTarget?: HTMLElement, nextTarget?: HTMLElement) {
    ////////this.log('openMedia doc:', message, prevTarget, nextTarget);
    let media = message.media.photo || message.media.document || message.media.webpage.document || message.media.webpage.photo;
    
    let isVideo = media.mime_type == 'video/mp4';

    let fromRight = 0;
    if(this.lastTarget !== null) {
      if(this.lastTarget === prevTarget) {
        fromRight = 1;
      } else if(this.lastTarget === nextTarget) {
        fromRight = -1;
      }
    }
    
    this.currentMessageID = message.mid;
    this.prevTarget = prevTarget || null;
    this.nextTarget = nextTarget || null;
    this.lastTarget = target;
    
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

    // ok set

    let wasActive = fromRight !== 0;
    if(wasActive) {
      this.moveTheMover(this.content.mover, fromRight === 1);
      this.setNewMover();
    } else {
      window.addEventListener('keydown', this.onKeyDownBinded);
      this.overlaysDiv.classList.add('active');
    }

    ////////this.log('wasActive:', wasActive);

    let mover = this.content.mover;

    let maxWidth = appPhotosManager.windowW - 16;
    let maxHeight = appPhotosManager.windowH - 100;
    if(isVideo) {
      let size = appPhotosManager.setAttachmentSize(media, container, maxWidth, maxHeight);

      ////////this.log('will wrap video', media, size);

      let afterTimeout = this.setMoverToTarget(target, false, fromRight);
      //if(wasActive) return;
      setTimeout(() => {
        afterTimeout();

        wrapVideo.call(this, media, mover, message, false, this.preloader).then(() => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed video');
            return;
          }
        });
      }, 0);
    } else {
      let size = appPhotosManager.setAttachmentSize(media.id, container, maxWidth, maxHeight);

      let afterTimeout = this.setMoverToTarget(target, false, fromRight);
      //if(wasActive) return;
      setTimeout(() => {
        afterTimeout();
        this.preloader.attach(mover);

        let cancellablePromise = appPhotosManager.preloadPhoto(media.id, size);
        cancellablePromise.then((blob) => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed photo');
            return;
          }
          
          ///////this.log('indochina', blob);

          let image = mover.firstElementChild as HTMLImageElement || new Image();
          image.src = URL.createObjectURL(blob);
          mover.prepend(image);

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
