import appPeersManager from "./appPeersManager";
import appPhotosManager from "./appPhotosManager";
import appMessagesManager from "./appMessagesManager";
import { RichTextProcessor } from "../richtextprocessor";
import { logger } from "../logger";
import ProgressivePreloader from "../../components/preloader";
import { findUpClassName, $rootScope, generatePathData, fillPropertyValue, cancelEvent } from "../utils";
import appDocsManager from "./appDocsManager";
import VideoPlayer from "../mediaPlayer";
import { renderImageFromUrl, parseMenuButtonsTo } from "../../components/misc";
import AvatarElement from "../../components/avatar";
import LazyLoadQueue from "../../components/lazyLoadQueue";
import appForward from "../../components/appForward";
import { isSafari, mediaSizes } from "../config";

export class AppMediaViewer {
  public wholeDiv = document.querySelector('.media-viewer-whole') as HTMLDivElement;
  private overlaysDiv = this.wholeDiv.firstElementChild as HTMLDivElement;
  private author = {
    avatarEl: this.overlaysDiv.querySelector('.media-viewer-userpic') as AvatarElement,
    nameEl: this.overlaysDiv.querySelector('.media-viewer-name') as HTMLDivElement,
    date: this.overlaysDiv.querySelector('.media-viewer-date') as HTMLDivElement
  };
  public buttons: {[k in 'delete' | 'forward' | 'download' | 'close' | 'prev' | 'next' | 
    'menu-delete' | 'menu-forward' | 'menu-download' | 'mobile-close']: HTMLElement} = {} as any;
  private content: {[k in 'container' | 'caption' | 'mover']: HTMLDivElement} = {
    container: this.overlaysDiv.querySelector('.media-viewer-media'),
    caption: this.overlaysDiv.querySelector('.media-viewer-caption'),
    mover: null
  };
  
  public currentMessageID = 0;
  private preloader: ProgressivePreloader = null;

  private lastTarget: HTMLElement = null;
  private prevTargets: {
    element: HTMLElement,
    mid: number
  }[] = [];
  private nextTargets: AppMediaViewer['prevTargets'] = [];
  //private targetContainer: HTMLElement = null;
  //private loadMore: () => void = null;

  public log: ReturnType<typeof logger>; 
  public onKeyDownBinded: any;
  public onClickBinded: any;

  private peerID = 0;
  private loadMediaPromiseUp: Promise<void> = null;
  private loadMediaPromiseDown: Promise<void> = null;
  private loadedAllMediaUp = false;
  private loadedAllMediaDown = false;

  private reverse = false; // reverse means next = higher msgid
  private needLoadMore = true;

  private pageEl = document.getElementById('page-chats') as HTMLDivElement;

  private setMoverPromise: Promise<void>;

  private lazyLoadQueue: LazyLoadQueue;
  
  constructor() {
    this.log = logger('AMV');
    this.preloader = new ProgressivePreloader();
    this.lazyLoadQueue = new LazyLoadQueue(undefined, true);

    parseMenuButtonsTo(this.buttons, this.wholeDiv.querySelectorAll(`[class*='menu']`) as NodeListOf<HTMLElement>);

    this.onKeyDownBinded = this.onKeyDown.bind(this);

    const close = (e: MouseEvent) => {
      cancelEvent(e);
      //this.overlaysDiv.classList.remove('active');
      this.content.container.innerHTML = '';
      /* if(this.content.container.firstElementChild) {
        URL.revokeObjectURL((this.content.container.firstElementChild as HTMLImageElement).src);
      } */

      this.peerID = 0;
      this.currentMessageID = 0;
      this.lazyLoadQueue.clear();

      this.setMoverToTarget(this.lastTarget, true);

      this.lastTarget = null;
      this.prevTargets = [];
      this.nextTargets = [];
      this.loadedAllMediaUp = this.loadedAllMediaDown = false;
      this.loadMediaPromiseUp = this.loadMediaPromiseDown = null;
      this.setMoverPromise = null;

      if(appForward.container.classList.contains('active')) {
        setTimeout(() => {
          appForward.close();
        }, 200);
      }

      window.removeEventListener('keydown', this.onKeyDownBinded);
    };
    
    [this.buttons.close, this.buttons["mobile-close"]].forEach(el => {
      el.addEventListener('click', close);
    });
    
    this.buttons.prev.addEventListener('click', (e) => {
      cancelEvent(e);
      if(this.setMoverPromise) return;

      let target = this.prevTargets.pop();
      if(target) {
        this.nextTargets.unshift({element: this.lastTarget, mid: this.currentMessageID});
        this.openMedia(appMessagesManager.getMessage(target.mid), target.element);
      } else {
        this.buttons.prev.style.display = 'none';
      }
    });
    
    this.buttons.next.addEventListener('click', (e) => {
      cancelEvent(e);
      if(this.setMoverPromise) return;

      let target = this.nextTargets.shift();
      if(target) {
        this.prevTargets.push({element: this.lastTarget, mid: this.currentMessageID});
        this.openMedia(appMessagesManager.getMessage(target.mid), target.element);
      } else {
        this.buttons.next.style.display = 'none';
      }
    });
    
    const download = (e: MouseEvent) => {
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
    };

    [this.buttons.download, this.buttons["menu-download"]].forEach(el => {
      el.addEventListener('click', download);
    });

    const forward = (e: MouseEvent) => {
      appForward.init([this.currentMessageID]);
    };

    [this.buttons.forward, this.buttons["menu-forward"]].forEach(el => {
      el.addEventListener('click', forward);
    });

    this.onClickBinded = (e: MouseEvent) => {
      let target = e.target as HTMLElement;
      if(target.tagName == 'A') return;
      cancelEvent(e);

      let mover: HTMLElement = null;
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

    this.wholeDiv.addEventListener('click', this.onClickBinded);
    //this.content.mover.addEventListener('click', this.onClickBinded);
    //this.content.mover.append(this.buttons.prev, this.buttons.next);
    this.setNewMover();
  }

  public onKeyDown(e: KeyboardEvent) {
    //this.log('onKeyDown', e);
    
    if(e.key == 'ArrowRight') {
      this.buttons.next.click();
    } else if(e.key == 'ArrowLeft') {
      this.buttons.prev.click();
    }
  }

  public async setMoverToTarget(target: HTMLElement, closing = false, fromRight = 0) {
    let mover = this.content.mover;

    if(!closing) {
      mover.innerHTML = '';
      //mover.append(this.buttons.prev, this.buttons.next);
    }

    let wasActive = fromRight !== 0;

    let delay = wasActive ? 350 : 200;
    //let delay = wasActive ? 350 : 10000;

    /* if(wasActive) {
      this.moveTheMover(mover);
      mover = this.setNewMover();
    } */

    this.log('setMoverToTarget', target, closing, wasActive, fromRight);

    let realParent: HTMLElement;

    let rect: DOMRect;
    if(target) {
      if(target instanceof SVGImageElement || target.parentElement instanceof SVGForeignObjectElement) {
        realParent = findUpClassName(target, 'attachment');
        rect = realParent.getBoundingClientRect();
      } else {
        realParent = target.parentElement as HTMLElement;
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

    let aspecter: HTMLDivElement;
    if(target instanceof HTMLImageElement || target instanceof HTMLVideoElement) {
      if(mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter')) {
        aspecter = mover.firstElementChild as HTMLDivElement;

        let player = aspecter.querySelector('.ckin__player');
        if(player) {
          let video = player.firstElementChild as HTMLVideoElement;
          aspecter.append(video);
          player.remove();
        }

        if(!aspecter.style.cssText) { // всё из-за видео, элементы управления скейлятся, так бы можно было этого не делать
          mover.classList.remove('active');
          this.setFullAspect(aspecter, containerRect, rect);
          void mover.offsetLeft; // reflow
          mover.classList.add('active');
        }
      } else {
        aspecter = document.createElement('div');
        aspecter.classList.add('media-viewer-aspecter', 'disable-hover');
        mover.prepend(aspecter);
      }
      
      aspecter.style.cssText = `width: ${rect.width}px; height: ${rect.height}px; transform: scale(${containerRect.width / rect.width}, ${containerRect.height / rect.height});`;
    }

    transform += `translate(${left}px,${top}px) `;

    mover.style.width = containerRect.width + 'px';
    mover.style.height = containerRect.height + 'px';

    let scaleX = rect.width / containerRect.width;
    let scaleY = rect.height / containerRect.height;
    if(!wasActive) {
      transform += `scale(${scaleX},${scaleY}) `;
    }

    let borderRadius = window.getComputedStyle(realParent).getPropertyValue('border-radius');
    let brSplitted = fillPropertyValue(borderRadius) as string[];
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
      let mediaElement: HTMLImageElement | HTMLVideoElement;
      let src: string;

      if(target.tagName == 'DIV') { // useContainerAsTarget
        if(target.firstElementChild) {
          mediaElement = new Image();
          src = (target.firstElementChild as HTMLImageElement).src;
          mover.append(mediaElement);
        }
        /* mediaElement = new Image();
        src = target.style.backgroundImage.slice(5, -2); */
        
      } else if(target instanceof HTMLImageElement) {
        mediaElement = new Image();
        src = target.src;
      } else if(target instanceof HTMLVideoElement) {
        let video = mediaElement = document.createElement('video');
        video.src = target?.src;
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
          let br: [number, number, number, number] = borderRadius.split(' ').map(v => parseInt(v)) as any;
          if(isOut) d = generatePathData(0, 0, width - 9 / scaleX, height, ...br);
          else d = generatePathData(9 / scaleX, 0, width - 9 / scaleX, height, ...br);
          path.setAttributeNS(null, 'd', d);
        }

        let foreignObject = newSvg.lastElementChild;
        foreignObject.setAttributeNS(null, 'width', '' + containerRect.width);
        foreignObject.setAttributeNS(null, 'height', '' + containerRect.height);
        
        mover.prepend(newSvg);
      }

      if(aspecter) {
        aspecter.style.borderRadius = borderRadius;
        aspecter.append(mediaElement);
      }

      mediaElement = mover.querySelector('video, img');
      if(mediaElement instanceof HTMLImageElement && src) {
        await new Promise((resolve, reject) => {
          mediaElement.addEventListener('load', resolve);

          if(src) {
            mediaElement.src = src;
          }
        });
      }/*  else if(mediaElement instanceof HTMLVideoElement && mediaElement.firstElementChild && ((mediaElement.firstElementChild as HTMLSourceElement).src || src)) {
        await new Promise((resolve, reject) => {
          mediaElement.addEventListener('loadeddata', resolve);

          if(src) {
            (mediaElement.firstElementChild as HTMLSourceElement).src = src;
          }
        });
      } */
  
      mover.style.display = '';

      window.requestAnimationFrame(() => {
        mover.classList.add(wasActive ? 'moving' : 'active');
      });
    } else {
      if(target instanceof SVGSVGElement) {
        path = mover.querySelector('path');

        if(path) {
          this.sizeTailPath(path, containerRect, scaleX, delay, false, isOut, borderRadius);
        }
      }

      if(target.classList.contains('media-viewer-media')) {
        mover.classList.add('hiding');
      }

      setTimeout(() => {
        this.wholeDiv.classList.remove('active');
      }, 0);

      setTimeout(() => {
        mover.style.borderRadius = borderRadius;

        if(mover.firstElementChild) {
          (mover.firstElementChild as HTMLElement).style.borderRadius = borderRadius;
        }
      }, delay / 2);

      setTimeout(() => {
        mover.innerHTML = '';
        mover.classList.remove('moving', 'active', 'hiding');
        mover.style.display = 'none';
      }, delay);

      return;
    }

    //await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    //throw '';

    mover.style.transform = `translate(${containerRect.left}px,${containerRect.top}px) scale(1,1)`;

    if(aspecter) {
      this.setFullAspect(aspecter, containerRect, rect);
    }

    setTimeout(() => {
      mover.style.borderRadius = '';

      if(mover.firstElementChild) {
        (mover.firstElementChild as HTMLElement).style.borderRadius = '';
      }
    }, delay / 2);

    mover.dataset.timeout = '' + setTimeout(() => {
      mover.classList.remove('moving');

      if(aspecter) { // всё из-за видео, элементы управления скейлятся, так бы можно было этого не делать
        if(mover.querySelector('video')) {
          mover.classList.remove('active');
          aspecter.style.cssText = '';
          void mover.offsetLeft; // reflow
        }
        
        aspecter.classList.remove('disable-hover');
      }

      mover.classList.add('active');
      delete mover.dataset.timeout;
    }, delay);

    if(path) {
      this.sizeTailPath(path, containerRect, scaleX, delay, true, isOut, borderRadius);
    }
  }

  private setFullAspect(aspecter: HTMLDivElement, containerRect: DOMRect, rect: DOMRect) {
    /* let media = aspecter.firstElementChild;
    let proportion: number;
    if(media instanceof HTMLImageElement) {
      proportion = media.naturalWidth / media.naturalHeight;
    } else if(media instanceof HTMLVideoElement) {
      proportion = media.videoWidth / media.videoHeight;
    } */
    const proportion = containerRect.width / containerRect.height;

    let {width, height} = rect;
    /* if(proportion == 1) {
      aspecter.style.cssText = '';
    } else { */
      if(proportion > 0) {
        width = height * proportion;
      } else {
        height = width * proportion;
      }

      //this.log('will set style aspecter:', `width: ${width}px; height: ${height}px; transform: scale(${containerRect.width / width}, ${containerRect.height / height});`);

      aspecter.style.cssText = `width: ${width}px; height: ${height}px; transform: scale(${containerRect.width / width}, ${containerRect.height / height});`;
    //}
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

      let _br: [number, number, number, number] = br.map(v => v * progress) as any;

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

    //mover.classList.remove('active');
    mover.classList.add('moving');

    if(mover.dataset.timeout) { // и это тоже всё из-за скейла видео, так бы это не нужно было
      clearTimeout(+mover.dataset.timeout);
    }

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

    if(this.content.mover) {
      let oldMover = this.content.mover;
      oldMover.parentElement.append(newMover);
    } else {
      this.wholeDiv.append(newMover);
    }

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

  public updateMediaSource(target: HTMLElement, url: string, tagName: 'video' | 'img') {
    //if(target instanceof SVGSVGElement) {
      let el = target.querySelector(tagName) as HTMLElement;
      renderImageFromUrl(el, url);
    /* } else {

    } */
  }
  
  public async openMedia(message: any, target?: HTMLElement, reverse = false, targetContainer?: HTMLElement, 
    prevTargets: AppMediaViewer['prevTargets'] = [], nextTargets: AppMediaViewer['prevTargets'] = [], needLoadMore = true) {
    if(this.setMoverPromise) return this.setMoverPromise;
    this.log('openMedia doc:', message);
    const media = message.media.photo || message.media.document || message.media.webpage.document || message.media.webpage.photo;
    
    const isVideo = media.mime_type == 'video/mp4';
    const isFirstOpen = !this.peerID;

    if(isFirstOpen) {
      this.peerID = $rootScope.selectedPeerID;
      //this.targetContainer = targetContainer;
      this.prevTargets = prevTargets;
      this.nextTargets = nextTargets;
      this.reverse = reverse;
      this.needLoadMore = needLoadMore;
      //this.loadMore = loadMore;

      if(appForward.container.classList.contains('active')) {
        appForward.close();
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
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
    
    const container = this.content.container;
    const useContainerAsTarget = !target;
    if(useContainerAsTarget) target = container;

    this.currentMessageID = message.mid;
    this.lastTarget = target;

    if(this.needLoadMore) {
      if(this.nextTargets.length < 20) {
        this.loadMoreMedia(!this.reverse);
      }
  
      if(this.prevTargets.length < 20) {
        this.loadMoreMedia(this.reverse);
      }
    }
    
    if(container.firstElementChild) {
      container.innerHTML = '';
    }
    
    const date = new Date(media.date * 1000);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const dateStr = months[date.getMonth()] + ' ' + date.getDate() + ' at '+ date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
    this.author.date.innerText = dateStr;
    
    const name = appPeersManager.getPeerTitle(message.fromID);
    this.author.nameEl.innerHTML = name;
    
    if(message.message) {
      this.content.caption.innerHTML = RichTextProcessor.wrapRichText(message.message, {
        entities: message.totalEntities
      });
    } else {
      this.content.caption.innerHTML = '';
    }
    
    let oldAvatar = this.author.avatarEl;
    // @ts-ignore
    this.author.avatarEl = this.author.avatarEl.cloneNode();
    this.author.avatarEl.setAttribute('peer', '' + message.fromID);
    oldAvatar.parentElement.replaceChild(this.author.avatarEl, oldAvatar);

    // ok set

    const wasActive = fromRight !== 0;
    if(wasActive) {
      this.moveTheMover(this.content.mover, fromRight === 1);
      this.setNewMover();
    } else {
      window.addEventListener('keydown', this.onKeyDownBinded);
      this.wholeDiv.classList.add('active');
    }

    ////////this.log('wasActive:', wasActive);

    const mover = this.content.mover;

    //const maxWidth = appPhotosManager.windowW - 16;
    const maxWidth = mediaSizes.isMobile ? this.pageEl.scrollWidth : this.pageEl.scrollWidth - 16;
    const maxHeight = appPhotosManager.windowH - 100;
    const size = appPhotosManager.setAttachmentSize(isVideo ? media : media.id, container, maxWidth, maxHeight);

    // need after setAttachmentSize
    /* if(useContainerAsTarget) {
      target = target.querySelector('img, video') || target;
    } */

    let setMoverPromise: Promise<void>;
    if(isVideo) {
      ////////this.log('will wrap video', media, size);

      setMoverPromise = this.setMoverToTarget(target, false, fromRight).then(() => {
      //return; // set and don't move
      //if(wasActive) return;
        //return;

        const div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;
        const video = mover.querySelector('video') || document.createElement('video');
        video.src = '';

        video.setAttribute('playsinline', '');
        if(media.type == 'gif') {
          video.muted = true;
          video.autoplay = true;
          video.loop = true;
        }

        const createPlayer = () => {
          if(media.type != 'gif') {
            video.dataset.ckin = 'default';
            video.dataset.overlay = '1';

            if(!video.parentElement) {
              div.append(video);
            }

            const player = new VideoPlayer(video, true, media.supportsStreaming);
            return player;
            /* player.wrapper.parentElement.append(video);
            mover.append(player.wrapper); */
          }/*  else {
            video.play();
          } */
        };
        
        if(!video.src || (media.url && media.url != video.src)) {
          const load = () => {
            const promise = appDocsManager.downloadDoc(media.id);
            
            //if(!streamable) {
              this.preloader.attach(mover, true, promise);
            //}
            
            let player: VideoPlayer;

            promise.then(async() => {
              if(this.currentMessageID != message.mid) {
                this.log.warn('media viewer changed video');
                return;
              }

              const url = media.url;
              if(target instanceof SVGSVGElement && (video.parentElement || !isSafari)) { // if video exists
                if(!video.parentElement) {
                  div.firstElementChild.lastElementChild.append(video);
                }
                
                this.updateMediaSource(mover, url, 'video');
                //this.updateMediaSource(target, url, 'source');
              } else {
                //const promise = new Promise((resolve) => video.addEventListener('loadeddata', resolve, {once: true}));
                renderImageFromUrl(video, url);

                //await promise;
                const first = div.firstElementChild as HTMLImageElement;
                if(!(first instanceof HTMLVideoElement) && first) {
                  first.remove();
                }

                if(!video.parentElement) {
                  div.prepend(video);
                }
              }

              // я хз что это такое, видео появляются просто чёрными и не включаются без этого кода снизу
              /* source.remove();
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  //parent.append(video);
                  video.append(source);
                });
              }); */
  
              player = createPlayer();
            });

            return promise;
          };

          this.lazyLoadQueue.unshift({
            div: null,
            load,
            wasSeen: true
          });
        } else createPlayer();
      });
    } else {
      setMoverPromise = this.setMoverToTarget(target, false, fromRight).then(() => {
      //return; // set and don't move
      //if(wasActive) return;
        //return;
        
        let load = () => {
          let cancellablePromise = appPhotosManager.preloadPhoto(media.id, size);
          this.preloader.attach(mover, true, cancellablePromise);
          cancellablePromise.then(() => {
            if(this.currentMessageID != message.mid) {
              this.log.warn('media viewer changed photo');
              return;
            }
            
            ///////this.log('indochina', blob);
  
            let url = media.url;
            if(target instanceof SVGSVGElement) {
              this.updateMediaSource(target, url, 'img');
              this.updateMediaSource(mover, url, 'img');
            } else {
              let div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;
              let image = div.firstElementChild as HTMLImageElement;
              if(!image || image.tagName != 'IMG') {
                image = new Image();
              }
  
              //this.log('will renderImageFromUrl:', image, div, target);
  
              renderImageFromUrl(image, url).then(() => {
                div.append(image);
              });
            }
  
            this.preloader.detach();
          }).catch(err => {
            this.log.error(err);
          });

          return cancellablePromise;
        };

        this.lazyLoadQueue.unshift({
          div: null,
          load,
          wasSeen: true
        });
      });
    }

    return this.setMoverPromise = setMoverPromise.then(() => {
      this.setMoverPromise = null;
    });
  }
}

export default new AppMediaViewer();
