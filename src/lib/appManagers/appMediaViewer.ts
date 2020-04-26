import appPeersManager from "./appPeersManager";
import appDialogsManager from "./appDialogsManager";
import appPhotosManager from "./appPhotosManager";
import appMessagesManager from "./appMessagesManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../polyfill";
import ProgressivePreloader from "../../components/preloader";
import { findUpClassName, $rootScope, generatePathData } from "../utils";
import appDocsManager from "./appDocsManager";
import VideoPlayer from "../mediaPlayer";
import { renderImageFromUrl } from "../../components/misc";
import appProfileManager from "./appProfileManager";

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
  private prevTargets: {
    element: HTMLElement,
    mid: number
  }[] = [];
  private nextTargets: AppMediaViewer['prevTargets'] = [];
  private targetContainer: HTMLElement = null;
  private loadMore: () => void = null;

  public log: ReturnType<typeof logger>; 
  public onKeyDownBinded: any;
  public onClickBinded: any;

  private peerID = 0;
  private loadMediaPromiseUp: Promise<void> = null;
  private loadMediaPromiseDown: Promise<void> = null;
  private loadedAllMediaUp = false;
  private loadedAllMediaDown = false;

  private reverse = false; // reverse means next = higher msgid
  
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

      this.peerID = 0;
      this.currentMessageID = 0;

      this.setMoverToTarget(this.lastTarget, true);

      this.lastTarget = null;
      this.prevTargets = [];
      this.nextTargets = [];
      this.loadedAllMediaUp = this.loadedAllMediaDown = false;
      this.loadMediaPromiseUp = this.loadMediaPromiseDown = null;

      window.removeEventListener('keydown', this.onKeyDownBinded);
    });
    
    this.buttons.prev.addEventListener('click', () => {
      let target = this.prevTargets.pop();
      if(target) {
        this.nextTargets.unshift({element: this.lastTarget, mid: this.currentMessageID});
        this.openMedia(appMessagesManager.getMessage(target.mid), target.element);
      } else {
        this.buttons.prev.style.display = 'none';
      }
    });
    
    this.buttons.next.addEventListener('click', () => {
      let target = this.nextTargets.shift();
      if(target) {
        this.prevTargets.push({element: this.lastTarget, mid: this.currentMessageID});
        this.openMedia(appMessagesManager.getMessage(target.mid), target.element);
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

      if(/* target == this.mediaViewerDiv */!mover || target.tagName == 'IMG' || target.tagName == 'image') {
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
    //let delay = wasActive ? 350 : 10000;

    /* if(wasActive) {
      this.moveTheMover(mover);
      mover = this.setNewMover();
    } */

    ///////this.log('setMoverToTarget', target, closing, wasActive, fromRight);

    let realParent: HTMLDivElement;

    let rect: DOMRect;
    if(target) {
      if(target instanceof SVGImageElement || target.parentElement instanceof SVGForeignObjectElement) {
        realParent = findUpClassName(target, 'attachment');
        rect = realParent.getBoundingClientRect();
      } else {
        realParent = target.parentElement as HTMLDivElement;
        rect = target.getBoundingClientRect();
      }
    }

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

    let scaleX = rect.width / containerRect.width;
    let scaleY = rect.height / containerRect.height;
    if(!wasActive) {
      transform += `scale(${scaleX},${scaleY}) `;
    }

    let borderRadius = window.getComputedStyle(realParent).getPropertyValue('border-radius');
    let brSplitted = borderRadius.split(' ');
    if(brSplitted.length != 4) {
      if(!brSplitted[0]) brSplitted[0] = '0px';
      for(let i = brSplitted.length; i < 4; ++i) {
        brSplitted[i] = brSplitted[i % 2] || brSplitted[0] || '0px';
      }
    }
    borderRadius = brSplitted.map(r => (parseInt(r) / scaleX) + 'px').join(' ');
    if(!wasActive) {
      mover.style.borderRadius = borderRadius;
    }

    mover.style.transform = transform;

    /* if(wasActive) {
      this.log('setMoverToTarget', mover.style.transform);
    } */

    let path: SVGPathElement;
    let isOut = target.classList.contains('is-out');

    if(!closing) {
      let img: HTMLImageElement;
      let video: HTMLVideoElement;

      if(target.tagName == 'DIV') { // means backgrounded with cover
        //img.style.objectFit = 'cover';
        img = new Image();
        img.src = target.style.backgroundImage.slice(5, -2);
        //mover.classList.add('cover');
        //mover.style.backgroundImage = target.style.backgroundImage;
      } else if(target.tagName == 'IMG' || target.tagName == 'image') {
        img = new Image();
        img.src = target instanceof SVGImageElement ? target.getAttributeNS(null, 'href') : (target as HTMLImageElement).src;
        img.style.objectFit = 'contain';
      } else if(target.tagName == 'VIDEO') {
        video = document.createElement('video');
        let source = document.createElement('source');
        source.src = target.querySelector('source').src;
        video.append(source);
      } else if(target instanceof SVGSVGElement) {
        let clipID = target.dataset.clipID;
        let newClipID = clipID + '-mv';

        let {width, height} = containerRect;

        let newSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        newSvg.setAttributeNS(null, 'width', '' + width);
        newSvg.setAttributeNS(null, 'height', '' + height);

        newSvg.insertAdjacentHTML('beforeend', target.firstElementChild.outerHTML.replace(clipID, newClipID));
        newSvg.insertAdjacentHTML('beforeend', target.lastElementChild.outerHTML.replace(clipID, newClipID));

        // теперь надо выставить новую позицию для хвостика
        let defs = newSvg.firstElementChild;
        let use = defs.firstElementChild.firstElementChild as SVGUseElement;
        if(use instanceof SVGUseElement) {
          let transform = use.getAttributeNS(null, 'transform');
          transform = transform.replace(/translate\((.+?), (.+?)\) scale\((.+?), (.+?)\)/, (match, x, y, sX, sY) => {
            x = +x;
            if(x != 2) {
              x = width - (2 / scaleX);
            } else {
              x = 2 / scaleX;
            }
            
            y = height;
  
            return `translate(${x}, ${y}) scale(${+sX / scaleX}, ${+sY / scaleY})`;
          });
          use.setAttributeNS(null, 'transform', transform);
  
          // и новый RECT
          path = defs.firstElementChild.lastElementChild as SVGPathElement;

          // код ниже нужен только чтобы скрыть моргание до момента как сработает таймаут
          let d: string;
          let br = borderRadius.split(' ').map(v => parseInt(v));
          if(isOut) d = generatePathData(0, 0, width - 9 / scaleX, height, ...br);
          else d = generatePathData(9 / scaleX, 0, width - 9 / scaleX, height, ...br);
          path.setAttributeNS(null, 'd', d);
        }

        let mediaEl = newSvg.lastElementChild;
        mediaEl.setAttributeNS(null, 'width', '' + containerRect.width);
        mediaEl.setAttributeNS(null, 'height', '' + containerRect.height);
        
        mover.prepend(newSvg);
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
      if(target instanceof SVGSVGElement) {
        path = mover.querySelector('path');

        if(path) {
          this.sizeTailPath(path, containerRect, scaleX, delay, false, isOut, borderRadius);
        }
      }

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

      if(path) {
        this.sizeTailPath(path, containerRect, scaleX, delay, true, isOut, borderRadius);
      }
    };
  }

  public sizeTailPath(path: SVGPathElement, rect: DOMRect, scaleX: number, delay: number, upscale: boolean, isOut: boolean, borderRadius: string) {
    let start = Date.now();
    let {width, height} = rect;
    delay = delay / 2;

    let br = borderRadius.split(' ').map(v => parseInt(v));

    let step = () => {
      let diff = Date.now() - start;

      let progress = diff / delay;
      if(progress > 1) progress = 1;
      if(upscale) progress = 1 - progress;

      let _br = br.map(v => v * progress);

      let d: string;
      if(isOut) d = generatePathData(0, 0, width - (9 / scaleX * progress), height, ..._br);
      else d = generatePathData(9 / scaleX * progress, 0, width/* width - (9 / scaleX * progress) */, height, ..._br);
      path.setAttributeNS(null, 'd', d);

      if(diff < delay) window.requestAnimationFrame(step);
    };
    
    //window.requestAnimationFrame(step);
    step();
  }

  public moveTheMover(mover: HTMLDivElement, toLeft = true) {
    let windowW = appPhotosManager.windowW;

    mover.classList.add('moving');

    let rect = mover.getBoundingClientRect();

    let newTransform = mover.style.transform.replace(/translate\((.+?),/, (match, p1) => {
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

  public isElementVisible(container: HTMLElement, target: HTMLElement) {
    let rect = container.getBoundingClientRect();
    let targetRect = target.getBoundingClientRect();

    return targetRect.bottom > rect.top && targetRect.top < rect.bottom;
  }

  // нет смысла делать проверку для reverse и loadMediaPromise
  public loadMoreMedia(older = true) {
    //if(!older && this.reverse) return;

    if(older && this.loadedAllMediaDown) return;
    else if(!older && this.loadedAllMediaUp) return;

    if(older && this.loadMediaPromiseDown) return this.loadMediaPromiseDown;
    else if(!older && this.loadMediaPromiseUp) return this.loadMediaPromiseUp;

    let loadCount = 50;
    let backLimit = older ? 0 : loadCount;
    let maxID = this.currentMessageID;
  
    let anchor: {element: HTMLElement, mid: number};
    if(older) {
      anchor = this.reverse ? this.prevTargets[0] : this.nextTargets[this.nextTargets.length - 1];
    } else {
      anchor = this.reverse ? this.nextTargets[this.nextTargets.length - 1] : this.prevTargets[0];
    }

    if(anchor) maxID = anchor.mid;
    if(!older) maxID += 1;

    let peerID = this.peerID;

    let promise = appMessagesManager.getSearch(peerID, '', 
      {_: 'inputMessagesFilterPhotoVideo'}, maxID, loadCount/* older ? loadCount : 0 */, 0, backLimit).then(value => {
      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        return;
      }

      this.log('loaded more media by maxID:', maxID, value, older, this.reverse);

      if(value.history.length < loadCount) {
        /* if(this.reverse) {
          if(older) this.loadedAllMediaUp = true;
          else this.loadedAllMediaDown = true;
        } else { */
          if(older) this.loadedAllMediaDown = true;
          else this.loadedAllMediaUp = true;
        //}
      }

      let method = older ? value.history.forEach : value.history.forEachReverse;
      method.call(value.history, mid => {
        let message = appMessagesManager.getMessage(mid);
        let media = message.media;

        if(!media || !(media.photo || media.document || (media.webpage && media.webpage.document))) return;
        if(media._ == 'document' && media.type != 'video') return;

        let t = {element: null as HTMLElement, mid: mid};
        if(older) {
          if(this.reverse) this.prevTargets.unshift(t);
          else this.nextTargets.push(t);
        } else {
          if(this.reverse) this.nextTargets.push(t);
          else this.prevTargets.unshift(t);
        }
      });

      this.buttons.prev.style.display = this.prevTargets.length ? '' : 'none';
      this.buttons.next.style.display = this.nextTargets.length ? '' : 'none';
    }, () => {}).then(() => {
      if(older) this.loadMediaPromiseDown = null;
      else this.loadMediaPromiseUp = null;
    });

    if(older) this.loadMediaPromiseDown = promise;
    else this.loadMediaPromiseUp = promise;

    return promise;
  }

  public updateMediaSource(target: HTMLElement, url: string, tagName: 'source' | 'image') {
    //if(target instanceof SVGSVGElement) {
      let el = target.querySelector(tagName) as HTMLElement;
      renderImageFromUrl(el, url);
    /* } else {

    } */
  }
  
  public openMedia(message: any, target?: HTMLElement, reverse = false, targetContainer?: HTMLElement, 
    prevTargets: AppMediaViewer['prevTargets'] = [], nextTargets: AppMediaViewer['prevTargets'] = [], loadMore: () => void = null) {
    ////////this.log('openMedia doc:', message, prevTarget, nextTarget);
    let media = message.media.photo || message.media.document || message.media.webpage.document || message.media.webpage.photo;
    
    let isVideo = media.mime_type == 'video/mp4';
    let isFirstOpen = !this.peerID;

    if(isFirstOpen) {
      this.peerID = $rootScope.selectedPeerID;
      this.targetContainer = targetContainer;
      this.prevTargets = prevTargets;
      this.nextTargets = nextTargets;
      this.reverse = reverse;
      //this.loadMore = loadMore;
    }

    /* if(this.nextTargets.length < 10 && this.loadMore) {
      this.loadMore();
    } */

    let fromRight = 0;
    if(!isFirstOpen) {
      //if(this.lastTarget === prevTarget) {
      if(this.reverse) fromRight = this.currentMessageID < message.mid ? 1 : -1;
      else fromRight = this.currentMessageID > message.mid ? 1 : -1;
    }

    //if(prevTarget && (!prevTarget.parentElement || !this.isElementVisible(this.targetContainer, prevTarget))) prevTarget = null;
    //if(nextTarget && (!nextTarget.parentElement || !this.isElementVisible(this.targetContainer, nextTarget))) nextTarget = null;

    this.buttons.prev.style.display = this.prevTargets.length ? '' : 'none';
    this.buttons.next.style.display = this.nextTargets.length ? '' : 'none';
    
    let container = this.content.container;
    let useContainerAsTarget = !target;
    if(useContainerAsTarget) target = container;

    this.currentMessageID = message.mid;
    this.lastTarget = target;

    if(this.nextTargets.length < 20) {
      this.loadMoreMedia(!this.reverse);
    }

    if(this.prevTargets.length < 20) {
      this.loadMoreMedia(this.reverse);
    }
    
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
    
    appProfileManager.putPhoto(this.author.avatarEl, message.fromID);

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

      if(useContainerAsTarget) target = target.querySelector('img, video') || target;

      let afterTimeout = this.setMoverToTarget(target, false, fromRight);
      //if(wasActive) return;
      //return;
      setTimeout(() => {
        afterTimeout();
        //return;

        let video = mover.querySelector('video') || document.createElement('video');
        let source: HTMLSourceElement;
        if(video.firstElementChild) {
          source = video.firstElementChild as HTMLSourceElement;
        }

        video.dataset.ckin = 'default';
        video.dataset.overlay = '1';
        
        if(!source || !source.src) {
          let promise = appDocsManager.downloadDoc(media);
          this.preloader.attach(mover, true, promise);
  
          promise.then(blob => {
            if(this.currentMessageID != message.mid) {
              this.log.warn('media viewer changed video');
              return;
            }

            let url = media.url;
            if(target instanceof SVGSVGElement) {
              this.updateMediaSource(mover, url, 'source');
              this.updateMediaSource(target, url, 'source');
            } else {
              let img = mover.firstElementChild;
              if(img instanceof Image) {
                mover.removeChild(img);
              }

              source = document.createElement('source');
              renderImageFromUrl(source, url);
              source.type = media.mime_type;

              mover.prepend(video);
              
              video.append(source);
            }

            let player = new VideoPlayer(video, true);
          });
        } else {
          let player = new VideoPlayer(video, true);
        }

        

        /* wrapVideo.call(this, media, mover, message, false, this.preloader).then(() => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed video');
            return;
          }
        }); */
      }, 0);
    } else {
      let size = appPhotosManager.setAttachmentSize(media.id, container, maxWidth, maxHeight);

      if(useContainerAsTarget) target = target.querySelector('img, video') || target;

      let afterTimeout = this.setMoverToTarget(target, false, fromRight);
      //return;
      //if(wasActive) return;
      setTimeout(() => {
        afterTimeout();
        //return;
        this.preloader.attach(mover);

        let cancellablePromise = appPhotosManager.preloadPhoto(media.id, size);
        cancellablePromise.then(() => {
          if(this.currentMessageID != message.mid) {
            this.log.warn('media viewer changed photo');
            return;
          }
          
          ///////this.log('indochina', blob);

          let url = media.url;
          if(target instanceof SVGSVGElement) {
            this.updateMediaSource(target, url, 'image');
            this.updateMediaSource(mover, url, 'image');
          } else {
            let image = mover.firstElementChild as HTMLImageElement || new Image();
            //image.src = url;
            renderImageFromUrl(image, url);
            mover.prepend(image);
          }

          this.preloader.detach();
        }).catch(err => {
          this.log.error(err);
        });
      }, 0);
    }
  }
}

export default new AppMediaViewer();
