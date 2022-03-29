/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { deferredPromise } from "../helpers/cancellablePromise";
import mediaSizes from "../helpers/mediaSizes";
import { IS_TOUCH_SUPPORTED } from "../environment/touchSupport";
import { IS_MOBILE_SAFARI, IS_SAFARI } from "../environment/userAgent";
import appDocsManager, { MyDocument } from "../lib/appManagers/appDocsManager";
import appPhotosManager, { MyPhoto } from "../lib/appManagers/appPhotosManager";
import { logger } from "../lib/logger";
import VideoPlayer from "../lib/mediaPlayer";
import rootScope from "../lib/rootScope";
import animationIntersector from "./animationIntersector";
import appMediaPlaybackController from "./appMediaPlaybackController";
import AvatarElement from "./avatar";
import ButtonIcon from "./buttonIcon";
import { ButtonMenuItemOptions } from "./buttonMenu";
import ButtonMenuToggle from "./buttonMenuToggle";
import { LazyLoadQueueBase } from "./lazyLoadQueue";
import ProgressivePreloader from "./preloader";
import SwipeHandler from "./swipeHandler";
import { formatFullSentTime } from "../helpers/date";
import appNavigationController from "./appNavigationController";
import { Message } from "../layer";
import findUpClassName from "../helpers/dom/findUpClassName";
import renderImageFromUrl, { renderImageFromUrlPromise } from "../helpers/dom/renderImageFromUrl";
import getVisibleRect from "../helpers/dom/getVisibleRect";
import appDownloadManager from "../lib/appManagers/appDownloadManager";
import { cancelEvent } from "../helpers/dom/cancelEvent";
import fillPropertyValue from "../helpers/fillPropertyValue";
import generatePathData from "../helpers/generatePathData";
import replaceContent from "../helpers/dom/replaceContent";
import PeerTitle from "./peerTitle";
import { doubleRaf, fastRaf } from "../helpers/schedulers";
import RangeSelector from "./rangeSelector";
import windowSize from "../helpers/windowSize";
import ListLoader from "../helpers/listLoader";
import EventListenerBase from "../helpers/eventListenerBase";
import { MyMessage } from "../lib/appManagers/appMessagesManager";
import RichTextProcessor from "../lib/richtextprocessor";
import { NULL_PEER_ID } from "../lib/mtproto/mtproto_config";
import { isFullScreen } from "../helpers/dom/fullScreen";
import { attachClickEvent } from "../helpers/dom/clickEvent";

const ZOOM_STEP = 0.5;
const ZOOM_INITIAL_VALUE = 1;
const ZOOM_MIN_VALUE = 0.5;
const ZOOM_MAX_VALUE = 4;

// TODO: масштабирование картинок (не SVG) при ресайзе, и правильный возврат на исходную позицию
// TODO: картинки "обрезаются" если возвращаются или появляются с места, где есть их перекрытие (топбар, поле ввода)
// TODO: видео в мобильной вёрстке, если показываются элементы управления: если свайпнуть в сторону, то элементы вернутся на место, т.е. прыгнут - это не ок, надо бы замаскировать

export const MEDIA_VIEWER_CLASSNAME = 'media-viewer';

export default class AppMediaViewerBase<
  ContentAdditionType extends string, 
  ButtonsAdditionType extends string, 
  TargetType extends {element: HTMLElement
}> extends EventListenerBase<{
  setMoverBefore: () => void,
  setMoverAfter: () => void
}> {
  protected wholeDiv: HTMLElement;
  protected overlaysDiv: HTMLElement;
  protected author: {[k in 'container' | 'avatarEl' | 'nameEl' | 'date']: HTMLElement} = {} as any;
  protected content: {[k in 'main' | 'container' | 'media' | 'mover' | ContentAdditionType]: HTMLElement} = {} as any;
  protected buttons: {[k in 'download' | 'close' | 'prev' | 'next' | 'mobile-close' | 'zoom' | ButtonsAdditionType]: HTMLElement} = {} as any;
  protected topbar: HTMLElement;
  protected moversContainer: HTMLElement;
  
  protected tempId = 0;
  protected preloader: ProgressivePreloader = null;
  protected preloaderStreamable: ProgressivePreloader = null;

  //protected targetContainer: HTMLElement = null;
  //protected loadMore: () => void = null;

  protected log: ReturnType<typeof logger>; 

  protected isFirstOpen = true;

  // protected needLoadMore = true;

  protected pageEl = document.getElementById('page-chats') as HTMLDivElement;

  protected setMoverPromise: Promise<void>;
  protected setMoverAnimationPromise: Promise<void>;

  protected lazyLoadQueue: LazyLoadQueueBase;

  protected highlightSwitchersTimeout: number;

  protected onDownloadClick: (e: MouseEvent) => void;
  protected onPrevClick: (target: TargetType) => void;
  protected onNextClick: (target: TargetType) => void;

  protected videoPlayer: VideoPlayer;

  protected zoomElements: {
    container: HTMLElement,
    btnOut: HTMLElement,
    btnIn: HTMLElement,
    rangeSelector: RangeSelector
  } = {} as any;
  // protected zoomValue = ZOOM_INITIAL_VALUE;
  protected zoomSwipeHandler: SwipeHandler;
  protected zoomSwipeStartX = 0;
  protected zoomSwipeStartY = 0;
  protected zoomSwipeX = 0;
  protected zoomSwipeY = 0;
  
  protected ctrlKeyDown: boolean;

  get target() {
    return this.listLoader.current;
  }

  set target(value) {
    this.listLoader.current = value;
  }

  constructor(
    protected listLoader: ListLoader<TargetType, any>, 
    topButtons: Array<keyof AppMediaViewerBase<ContentAdditionType, ButtonsAdditionType, TargetType>['buttons']>
  ) {
    super(false);

    this.log = logger('AMV');
    this.preloader = new ProgressivePreloader();
    this.preloaderStreamable = new ProgressivePreloader({
      cancelable: false,
      streamable: true
    });
    this.preloader.construct();
    this.preloaderStreamable.construct();
    this.lazyLoadQueue = new LazyLoadQueueBase();

    this.wholeDiv = document.createElement('div');
    this.wholeDiv.classList.add(MEDIA_VIEWER_CLASSNAME + '-whole');

    this.overlaysDiv = document.createElement('div');
    this.overlaysDiv.classList.add('overlays');

    const mainDiv = document.createElement('div');
    mainDiv.classList.add(MEDIA_VIEWER_CLASSNAME);

    const topbar = this.topbar = document.createElement('div');
    topbar.classList.add(MEDIA_VIEWER_CLASSNAME + '-topbar', MEDIA_VIEWER_CLASSNAME + '-appear');

    const topbarLeft = document.createElement('div');
    topbarLeft.classList.add(MEDIA_VIEWER_CLASSNAME + '-topbar-left');

    this.buttons['mobile-close'] = ButtonIcon('close', {onlyMobile: true});
    
    // * author
    this.author.container = document.createElement('div');
    this.author.container.classList.add(MEDIA_VIEWER_CLASSNAME + '-author', 'no-select');
    const authorRight = document.createElement('div');
    
    this.author.avatarEl = new AvatarElement();
    this.author.avatarEl.classList.add(MEDIA_VIEWER_CLASSNAME + '-userpic', 'avatar-44');
    
    this.author.nameEl = document.createElement('div');
    this.author.nameEl.classList.add(MEDIA_VIEWER_CLASSNAME + '-name');
    
    this.author.date = document.createElement('div');
    this.author.date.classList.add(MEDIA_VIEWER_CLASSNAME + '-date');
    
    authorRight.append(this.author.nameEl, this.author.date);
    
    this.author.container.append(this.author.avatarEl, authorRight);
    
    // * buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add(MEDIA_VIEWER_CLASSNAME + '-buttons');
    
    topButtons.concat(['download', 'zoom', 'close']).forEach(name => {
      const button = ButtonIcon(name, {noRipple: true});
      this.buttons[name] = button;
      buttonsDiv.append(button);
    });

    this.buttons.zoom.classList.add('zoom-in');

    // * zoom
    this.zoomElements.container = document.createElement('div');
    this.zoomElements.container.classList.add('zoom-container');

    this.zoomElements.btnOut = ButtonIcon('zoomout', {noRipple: true});
    attachClickEvent(this.zoomElements.btnOut, () => this.changeZoom(false));
    this.zoomElements.btnIn = ButtonIcon('zoomin', {noRipple: true});
    attachClickEvent(this.zoomElements.btnIn, () => this.changeZoom(true));

    this.zoomElements.rangeSelector = new RangeSelector({
      step: ZOOM_STEP, 
      min: ZOOM_MIN_VALUE, 
      max: ZOOM_MAX_VALUE, 
      withTransition: true
    }, ZOOM_INITIAL_VALUE);
    this.zoomElements.rangeSelector.setListeners();
    this.zoomElements.rangeSelector.setHandlers({
      onScrub: this.setZoomValue,
      onMouseUp: () => this.setZoomValue()
    });

    this.zoomElements.container.append(this.zoomElements.btnOut, this.zoomElements.rangeSelector.container, this.zoomElements.btnIn);

    this.wholeDiv.append(this.zoomElements.container);

    // * content
    this.content.main = document.createElement('div');
    this.content.main.classList.add(MEDIA_VIEWER_CLASSNAME + '-content');

    this.content.container = document.createElement('div');
    this.content.container.classList.add(MEDIA_VIEWER_CLASSNAME + '-container');

    this.content.media = document.createElement('div');
    this.content.media.classList.add(MEDIA_VIEWER_CLASSNAME + '-media');

    this.content.container.append(this.content.media);

    this.content.main.append(this.content.container);
    mainDiv.append(this.content.main);
    this.overlaysDiv.append(mainDiv);
    // * overlays end
    
    topbarLeft.append(this.buttons['mobile-close'], this.author.container);
    topbar.append(topbarLeft, buttonsDiv);

    this.buttons.prev = document.createElement('div');
    this.buttons.prev.className = `${MEDIA_VIEWER_CLASSNAME}-switcher ${MEDIA_VIEWER_CLASSNAME}-switcher-left`;
    this.buttons.prev.innerHTML = `<span class="tgico-down ${MEDIA_VIEWER_CLASSNAME}-prev-button"></span>`;

    this.buttons.next = document.createElement('div');
    this.buttons.next.className = `${MEDIA_VIEWER_CLASSNAME}-switcher ${MEDIA_VIEWER_CLASSNAME}-switcher-right`;
    this.buttons.next.innerHTML = `<span class="tgico-down ${MEDIA_VIEWER_CLASSNAME}-next-button"></span>`;

    this.moversContainer = document.createElement('div');
    this.moversContainer.classList.add(MEDIA_VIEWER_CLASSNAME + '-movers');

    this.wholeDiv.append(this.overlaysDiv, this.buttons.prev, this.buttons.next, this.topbar, this.moversContainer);

    // * constructing html end

    this.listLoader.onLoadedMore = () => {
      this.buttons.prev.classList.toggle('hide', !this.listLoader.previous.length);
      this.buttons.next.classList.toggle('hide', !this.listLoader.next.length);
    };

    this.setNewMover();
  }

  protected setListeners() {
    attachClickEvent(this.buttons.download, this.onDownloadClick);
    [this.buttons.close, this.buttons['mobile-close'], this.preloaderStreamable.preloader].forEach(el => {
      attachClickEvent(el, this.close.bind(this));
    });

    ([[-1, this.buttons.prev], [1, this.buttons.next]] as [number, HTMLElement][]).forEach(([moveLength, button]) => {
      // attachClickEvent(button, (e) => {
      button.addEventListener('click', (e) => {
        cancelEvent(e);
        if(this.setMoverPromise) return;
  
        this.listLoader.go(moveLength);
      });
    });

    attachClickEvent(this.buttons.zoom, () => {
      if(this.isZooming()) this.toggleZoom(false);
      else {
        this.changeZoom(true);
      }
    });

    // ! cannot use the function because it'll cancel slide event on touch devices
    // attachClickEvent(this.wholeDiv, this.onClick);
    this.wholeDiv.addEventListener('click', this.onClick);

    this.listLoader.onJump = (item, older) => {
      if(older) this.onNextClick(item);
      else this.onPrevClick(item);
    };

    if(IS_TOUCH_SUPPORTED) {
      const swipeHandler = new SwipeHandler({
        element: this.wholeDiv, 
        onSwipe: (xDiff, yDiff) => {
          if(isFullScreen()) {
            return;
          }
          //console.log(xDiff, yDiff);

          const percents = Math.abs(xDiff) / windowSize.width;
          if(percents > .2 || xDiff > 125) {
            //console.log('will swipe', xDiff);

            if(xDiff < 0) {
              this.buttons.prev.click();
            } else {
              this.buttons.next.click();
            }

            return true;
          }

          const percentsY = Math.abs(yDiff) / windowSize.height;
          if(percentsY > .2 || yDiff > 125) {
            this.close();
            return true;
          }

          return false;
        }, 
        verifyTouchTarget: (evt) => {
          // * Fix for seek input
          if((evt.target as HTMLElement).tagName === 'INPUT' || findUpClassName(evt.target, 'media-viewer-caption')) {
            return false;
          }

          return true;
        }
      });
    }
  }

  protected toggleZoom(enable?: boolean) {
    const isVisible = this.isZooming();
    if(this.zoomElements.rangeSelector.mousedown || this.ctrlKeyDown) {
      enable = true;
    }

    if(isVisible === enable) return;

    if(enable === undefined) {
      enable = !isVisible;
    }

    this.buttons.zoom.classList.toggle('zoom-in', !enable);
    this.zoomElements.container.classList.toggle('is-visible', enable);
    const zoomValue = enable ? this.zoomElements.rangeSelector.value : 1;
    this.setZoomValue(zoomValue);
    this.zoomElements.rangeSelector.setProgress(zoomValue);

    if(this.videoPlayer) {
      this.videoPlayer.lockControls(enable ? false : undefined);
    }

    if(enable) {
      if(!this.zoomSwipeHandler) {
        let lastDiffX: number, lastDiffY: number;
        const multiplier = -1;
        this.zoomSwipeHandler = new SwipeHandler({
          element: this.moversContainer,
          onFirstSwipe: () => {
            lastDiffX = lastDiffY = 0;
            this.moversContainer.classList.add('no-transition');
          },
          onSwipe: (xDiff, yDiff) => {
            [xDiff, yDiff] = [xDiff * multiplier, yDiff * multiplier];
            this.zoomSwipeX += xDiff - lastDiffX;
            this.zoomSwipeY += yDiff - lastDiffY;
            [lastDiffX, lastDiffY] = [xDiff, yDiff];

            this.setZoomValue();
          },
          onReset: () => {
            this.moversContainer.classList.remove('no-transition');
          },
          cursor: 'move'
        });
      } else {
        this.zoomSwipeHandler.setListeners();
      }
      
      this.zoomElements.rangeSelector.setProgress(zoomValue);
    } else if(!enable) {
      this.zoomSwipeHandler.removeListeners();
    }
  }

  protected changeZoom(add: boolean) {
    this.zoomElements.rangeSelector.addProgress(ZOOM_STEP * (add ? 1 : -1));
    this.setZoomValue();
  }

  protected setZoomValue = (value = this.zoomElements.rangeSelector.value) => {
    // this.zoomValue = value;
    if(value === ZOOM_INITIAL_VALUE) {
      this.zoomSwipeX = 0;
      this.zoomSwipeY = 0;
    }

    this.moversContainer.style.transform = `matrix(${value}, 0, 0, ${value}, ${this.zoomSwipeX}, ${this.zoomSwipeY})`;

    this.zoomElements.btnOut.classList.toggle('inactive', value === ZOOM_MIN_VALUE);
    this.zoomElements.btnIn.classList.toggle('inactive', value === ZOOM_MAX_VALUE);

    this.toggleZoom(value !== ZOOM_INITIAL_VALUE);
  };

  protected isZooming() {
    return this.zoomElements.container.classList.contains('is-visible');
  }

  protected setBtnMenuToggle(buttons: ButtonMenuItemOptions[]) {
    const btnMenuToggle = ButtonMenuToggle({onlyMobile: true}, 'bottom-left', buttons);
    this.topbar.append(btnMenuToggle);
  }

  public close(e?: MouseEvent) {
    if(e) {
      cancelEvent(e);
    }

    if(this.setMoverAnimationPromise) return Promise.reject();

    appNavigationController.removeByType('media');

    this.lazyLoadQueue.clear();

    const promise = this.setMoverToTarget(this.target?.element, true).then(({onAnimationEnd}) => onAnimationEnd);

    this.listLoader.reset();
    (this.listLoader as any).cleanup && (this.listLoader as any).cleanup();
    this.setMoverPromise = null;
    this.tempId = -1;
    (window as any).appMediaViewer = undefined;

    if(this.zoomSwipeHandler) {
      this.zoomSwipeHandler.removeListeners();
      this.zoomSwipeHandler = undefined;
    }

    /* if(appSidebarRight.historyTabIDs.slice(-1)[0] === AppSidebarRight.SLIDERITEMSIDS.forward) {
      promise.then(() => {
        appSidebarRight.forwardTab.closeBtn.click();
      });
    } */

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('wheel', this.onWheel, {capture: true});

    promise.finally(() => {
      this.wholeDiv.remove();
      rootScope.isOverlayActive = false;
      animationIntersector.checkAnimations(false);
    });

    return promise;
  }

  onClick = (e: MouseEvent) => {
    if(this.setMoverAnimationPromise) return;

    const target = e.target as HTMLElement;
    if(target.tagName === 'A') return;
    cancelEvent(e);

    if(IS_TOUCH_SUPPORTED) {
      if(this.highlightSwitchersTimeout) {
        clearTimeout(this.highlightSwitchersTimeout);
      } else {
        this.wholeDiv.classList.add('highlight-switchers');
      }

      this.highlightSwitchersTimeout = window.setTimeout(() => {
        this.wholeDiv.classList.remove('highlight-switchers');
        this.highlightSwitchersTimeout = 0;
      }, 3e3);
      
      return;
    }

    const isZooming = this.isZooming();
    let mover: HTMLElement = null;
    const classNames = ['ckin__player', 'media-viewer-buttons', 'media-viewer-author', 'media-viewer-caption', 'zoom-container'];
    if(isZooming) {
      classNames.push('media-viewer-movers');
    }

    classNames.find(s => {
      try {
        mover = findUpClassName(target, s);
        if(mover) return true;
      } catch(err) {return false;}
    });

    if(/* target === this.mediaViewerDiv */!mover || (!isZooming && (target.tagName === 'IMG' || target.tagName === 'image'))) {
      this.close();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    //this.log('onKeyDown', e);
    if(rootScope.overlaysActive > 1) {
      return;
    }

    const key = e.key;
    
    let good = true;
    if(key === 'ArrowRight') {
      this.buttons.next.click();
    } else if(key === 'ArrowLeft') {
      this.buttons.prev.click();
    } else if(key === '-' || key === '=') {
      if(this.ctrlKeyDown) {
        this.changeZoom(key === '=');
      }
    } else {
      good = false;
    }

    if(e.ctrlKey || e.metaKey) {
      this.ctrlKeyDown = true;
    }

    if(good) {
      cancelEvent(e);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if(rootScope.overlaysActive > 1) {
      return;
    }

    if(!(e.ctrlKey || e.metaKey)) {
      this.ctrlKeyDown = false;

      if(this.isZooming()) {
        this.setZoomValue();
      }
    }
  };

  private onWheel = (e: WheelEvent) => {
    if(rootScope.overlaysActive > 1 || (findUpClassName(e.target, 'media-viewer-caption') && !this.ctrlKeyDown)) {
      return;
    }

    cancelEvent(e);

    if(this.ctrlKeyDown) {
      const scrollingUp = e.deltaY < 0;
      // if(!scrollingUp && !this.isZooming()) return;
      this.changeZoom(!!scrollingUp);
    }
  };

  protected async setMoverToTarget(target: HTMLElement, closing = false, fromRight = 0) {
    this.dispatchEvent('setMoverBefore');

    const mover = this.content.mover;

    if(!closing) {
      mover.innerHTML = '';
      //mover.append(this.buttons.prev, this.buttons.next);
    }
    
    const zoomValue = this.isZooming() && closing /* && false */ ? this.zoomElements.rangeSelector.value : ZOOM_INITIAL_VALUE;
    /* if(!(zoomValue > 1 && closing)) */ this.removeCenterFromMover(mover);

    const wasActive = fromRight !== 0;

    const delay = rootScope.settings.animationsEnabled ? (wasActive ? 350 : 200) : 0;
    //let delay = wasActive ? 350 : 10000;

    /* if(wasActive) {
      this.moveTheMover(mover);
      mover = this.setNewMover();
    } */

    /* if(DEBUG) {
      this.log('setMoverToTarget', target, closing, wasActive, fromRight);
    } */

    let realParent: HTMLElement;

    let rect: DOMRect;
    if(target) {
      if(target instanceof AvatarElement || target.classList.contains('grid-item')/*  || target.classList.contains('document-ico') */) {
        realParent = target;
        rect = target.getBoundingClientRect();
      } else if(target instanceof SVGImageElement || target.parentElement instanceof SVGForeignObjectElement) {
        realParent = findUpClassName(target, 'attachment');
        rect = realParent.getBoundingClientRect();
      } else if(target.classList.contains('profile-avatars-avatar')) {
        realParent = findUpClassName(target, 'profile-avatars-container');
        rect = realParent.getBoundingClientRect();

        // * if not active avatar
        if(closing && target.getBoundingClientRect().left !== rect.left) {
          target = realParent = rect = undefined;
        }
      }
    }

    if(!target) {
      target = this.content.media;
    }

    if(!rect) {
      realParent = target.parentElement as HTMLElement;
      rect = target.getBoundingClientRect();
    }

    let needOpacity = false;
    if(target !== this.content.media && !target.classList.contains('profile-avatars-avatar')) {
      const overflowElement = findUpClassName(realParent, 'scrollable');
      const visibleRect = getVisibleRect(realParent, overflowElement, true);

      if(closing && (!visibleRect || visibleRect.overflow.vertical === 2 || visibleRect.overflow.horizontal === 2)) {
        target = this.content.media;
        realParent = target.parentElement as HTMLElement;
        rect = target.getBoundingClientRect();
      } else if(visibleRect && (visibleRect.overflow.vertical === 1 || visibleRect.overflow.horizontal === 1)) {
        needOpacity = true;
      }
    }

    const containerRect = this.content.media.getBoundingClientRect();
    
    let transform = '';
    let left: number;
    let top: number;

    if(wasActive) {
      left = fromRight === 1 ? windowSize.width : -containerRect.width;
      top = containerRect.top;
    } else {
      left = rect.left;
      top = rect.top;
    }

    /* if(zoomValue > 1) { // 33
      // const diffX = (rect.width * zoomValue - rect.width) / 4;
      const diffX = (rect.width * zoomValue - rect.width) / 2;
      const diffY = (rect.height * zoomValue - rect.height) / 4;
      // left -= diffX;
      // top += diffY;
    } */

    transform += `translate3d(${left}px,${top}px,0) `;

    /* if(wasActive) {
      left = fromRight === 1 ? appPhotosManager.windowW / 2 : -(containerRect.width + appPhotosManager.windowW / 2);
      transform += `translate(${left}px,-50%) `;
    } else {
      left = rect.left - (appPhotosManager.windowW / 2);
      top = rect.top - (appPhotosManager.windowH / 2);
      transform += `translate(${left}px,${top}px) `;
    } */

    let aspecter: HTMLDivElement;
    if(target instanceof HTMLImageElement || target instanceof HTMLVideoElement || target.tagName === 'DIV') {
      if(mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter')) {
        aspecter = mover.firstElementChild as HTMLDivElement;

        const player = aspecter.querySelector('.ckin__player');
        if(player) {
          const video = player.firstElementChild as HTMLVideoElement;
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
        aspecter.classList.add('media-viewer-aspecter'/* , 'disable-hover' */);
        mover.prepend(aspecter);
      }
      
      aspecter.style.cssText = `width: ${rect.width}px; height: ${rect.height}px; transform: scale3d(${containerRect.width / rect.width}, ${containerRect.height / rect.height}, 1);`;
    }

    mover.style.width = containerRect.width + 'px';
    mover.style.height = containerRect.height + 'px';

    // const scaleX = rect.width / (containerRect.width * zoomValue);
    // const scaleY = rect.height / (containerRect.height * zoomValue);
    const scaleX = rect.width / containerRect.width;
    const scaleY = rect.height / containerRect.height;
    if(!wasActive) {
      transform += `scale3d(${scaleX},${scaleY},1) `;
    }

    let borderRadius = window.getComputedStyle(realParent).getPropertyValue('border-radius');
    const brSplitted = fillPropertyValue(borderRadius) as string[];
    borderRadius = brSplitted.map(r => (parseInt(r) / scaleX) + 'px').join(' ');
    if(!wasActive) {
      mover.style.borderRadius = borderRadius;
    }
    //let borderRadius = '0px 0px 0px 0px';

    if(closing && zoomValue !== 1) {
      // const width = this.moversContainer.scrollWidth * scaleX;
      // const height = this.moversContainer.scrollHeight * scaleY;
      const willBeLeft = windowSize.width / 2 - rect.width / 2;
      const willBeTop = windowSize.height / 2 - rect.height / 2;
      const left = rect.left - willBeLeft/*  + (width - rect.width) / 2 */;
      const top = rect.top - willBeTop/*  + (height - rect.height) / 2 */;
      this.moversContainer.style.transform = `matrix(${scaleX}, 0, 0, ${scaleY}, ${left}, ${top})`;
    } else {
      mover.style.transform = transform;
    }

    needOpacity && (mover.style.opacity = '0'/* !closing ? '0' : '' */);

    /* if(wasActive) {
      this.log('setMoverToTarget', mover.style.transform);
    } */

    let path: SVGPathElement;
    const isOut = target.classList.contains('is-out');

    const deferred = this.setMoverAnimationPromise = deferredPromise<void>();
    const ret = {onAnimationEnd: deferred};

    const timeout = setTimeout(() => {
      if(!deferred.isFulfilled && !deferred.isRejected) {
        deferred.resolve();
      }
    }, 1000);

    deferred.finally(() => {
      this.dispatchEvent('setMoverAfter');

      if(this.setMoverAnimationPromise === deferred) {
        this.setMoverAnimationPromise = null;
      }
      
      clearTimeout(timeout);
    });

    if(!closing) {
      let mediaElement: HTMLImageElement | HTMLVideoElement;
      let src: string;

      if(target instanceof HTMLVideoElement) {
        const elements = Array.from(target.parentElement.querySelectorAll('img')) as HTMLImageElement[];
        if(elements.length) {
          target = elements.pop();
        }
      }

      if(target.tagName === 'DIV' || target.tagName === 'AVATAR-ELEMENT') { // useContainerAsTarget
        const images = Array.from(target.querySelectorAll('img')) as HTMLImageElement[];
        const image = images.pop();
        if(image) {
          mediaElement = new Image();
          src = image.src;
          mover.append(mediaElement);
        }
        /* mediaElement = new Image();
        src = target.style.backgroundImage.slice(5, -2); */
        
      } else if(target instanceof HTMLImageElement) {
        mediaElement = new Image();
        src = target.src;
      } else if(target instanceof HTMLVideoElement) {
        mediaElement = document.createElement('video');
        mediaElement.src = target.src;
      } else if(target instanceof SVGSVGElement) {
        const clipId = target.dataset.clipId;
        const newClipId = clipId + '-mv';

        const {width, height} = containerRect;

        const newSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        newSvg.setAttributeNS(null, 'width', '' + width);
        newSvg.setAttributeNS(null, 'height', '' + height);

        // нижние два свойства для масштабирования
        newSvg.setAttributeNS(null, 'viewBox', `0 0 ${width} ${height}`);
        newSvg.setAttributeNS(null, 'preserveAspectRatio', 'xMidYMid meet');

        newSvg.insertAdjacentHTML('beforeend', target.firstElementChild.outerHTML.replace(clipId, newClipId));
        newSvg.insertAdjacentHTML('beforeend', target.lastElementChild.outerHTML.replace(clipId, newClipId));

        // теперь надо выставить новую позицию для хвостика
        const defs = newSvg.firstElementChild;
        const use = defs.firstElementChild.firstElementChild as SVGUseElement;
        if(use instanceof SVGUseElement) {
          let transform = use.getAttributeNS(null, 'transform');
          transform = transform.replace(/translate\((.+?), (.+?)\) scale\((.+?), (.+?)\)/, (match, x, y, sX, sY) => {
            x = +x;
            if(x !== 2) {
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
          const br: [number, number, number, number] = borderRadius.split(' ').map(v => parseInt(v)) as any;
          if(isOut) d = generatePathData(0, 0, width - 9 / scaleX, height, ...br);
          else d = generatePathData(9 / scaleX, 0, width - 9 / scaleX, height, ...br);
          path.setAttributeNS(null, 'd', d);
        }

        const foreignObject = newSvg.lastElementChild;
        foreignObject.setAttributeNS(null, 'width', '' + containerRect.width);
        foreignObject.setAttributeNS(null, 'height', '' + containerRect.height);
        
        mover.prepend(newSvg);
      }

      if(aspecter) {
        aspecter.style.borderRadius = borderRadius;

        if(mediaElement) {
          aspecter.append(mediaElement);
        }
      }

      mediaElement = mover.querySelector('video, img');
      if(mediaElement instanceof HTMLImageElement) {
        mediaElement.classList.add('thumbnail');
        if(!aspecter) {
          mediaElement.style.width = containerRect.width + 'px';
          mediaElement.style.height = containerRect.height + 'px';
        }

        if(src) {
          await renderImageFromUrlPromise(mediaElement, src);
        }
      }/*  else if(mediaElement instanceof HTMLVideoElement && mediaElement.firstElementChild && ((mediaElement.firstElementChild as HTMLSourceElement).src || src)) {
        await new Promise((resolve, reject) => {
          mediaElement.addEventListener('loadeddata', resolve);

          if(src) {
            (mediaElement.firstElementChild as HTMLSourceElement).src = src;
          }
        });
      } */
  
      mover.style.display = '';

      fastRaf(() => {
        mover.classList.add(wasActive ? 'moving' : 'active');
      });
    } else {
      /* if(mover.classList.contains('center')) {
        mover.classList.remove('center');
        void mover.offsetLeft; // reflow
      } */
      
      if(target instanceof SVGSVGElement) {
        path = mover.querySelector('path');

        if(path) {
          this.sizeTailPath(path, containerRect, scaleX, delay, false, isOut, borderRadius);
        }
      }

      if(target.classList.contains('media-viewer-media')) {
        mover.classList.add('hiding');
      }

      this.wholeDiv.classList.add('backwards');
      setTimeout(() => {
        this.wholeDiv.classList.remove('active');
      }, 0);

      //return ret;

      setTimeout(() => {
        mover.style.borderRadius = borderRadius;

        if(mover.firstElementChild) {
          (mover.firstElementChild as HTMLElement).style.borderRadius = borderRadius;
        }
      }, delay / 2);

      setTimeout(() => {
        mover.innerHTML = '';
        mover.classList.remove('moving', 'active', 'hiding');
        mover.style.cssText = 'display: none;';

        deferred.resolve();
      }, delay);

      mover.classList.remove('opening');

      return ret;
    }

    mover.classList.add('opening');

    //await new Promise((resolve) => setTimeout(resolve, 0));
    //await new Promise((resolve) => window.requestAnimationFrame(resolve));
    // * одного RAF'а недостаточно, иногда анимация с одним не срабатывает (преимущественно на мобильных)
    await doubleRaf();

    // чтобы проверить установленную позицию - раскомментировать
    // throw '';

    //await new Promise((resolve) => setTimeout(resolve, 5e3));

    mover.style.transform = `translate3d(${containerRect.left}px,${containerRect.top}px,0) scale3d(1,1,1)`;
    //mover.style.transform = `translate(-50%,-50%) scale(1,1)`;
    needOpacity && (mover.style.opacity = ''/* closing ? '0' : '' */);

    if(aspecter) {
      this.setFullAspect(aspecter, containerRect, rect);
    }

    //throw '';

    setTimeout(() => {
      mover.style.borderRadius = '';

      if(mover.firstElementChild) {
        (mover.firstElementChild as HTMLElement).style.borderRadius = '';
      }
    }, 0/* delay / 2 */);

    mover.dataset.timeout = '' + setTimeout(() => {
      mover.classList.remove('moving', 'opening');

      if(aspecter) { // всё из-за видео, элементы управления скейлятся, так бы можно было этого не делать
        if(mover.querySelector('video') || true) {
          mover.classList.remove('active');
          aspecter.style.cssText = '';
          void mover.offsetLeft; // reflow
        }
        
        //aspecter.classList.remove('disable-hover');
      }

      // эти строки нужны для установки центральной позиции, в случае ресайза это будет нужно
      mover.classList.add('center', 'no-transition');
      /* mover.style.left = mover.style.top = '50%';
      mover.style.transform = 'translate(-50%, -50%)';
      void mover.offsetLeft; // reflow */

      // это уже нужно для будущих анимаций
      mover.classList.add('active');
      delete mover.dataset.timeout;

      deferred.resolve();
    }, delay);

    if(path) {
      this.sizeTailPath(path, containerRect, scaleX, delay, true, isOut, borderRadius);
    }

    return ret;
  }

  protected setFullAspect(aspecter: HTMLDivElement, containerRect: DOMRect, rect: DOMRect) {
    /* let media = aspecter.firstElementChild;
    let proportion: number;
    if(media instanceof HTMLImageElement) {
      proportion = media.naturalWidth / media.naturalHeight;
    } else if(media instanceof HTMLVideoElement) {
      proportion = media.videoWidth / media.videoHeight;
    } */
    const proportion = containerRect.width / containerRect.height;

    let {width, height} = rect;
    /* if(proportion === 1) {
      aspecter.style.cssText = '';
    } else { */
      if(proportion > 0) {
        width = height * proportion;
      } else {
        height = width * proportion;
      }

      //this.log('will set style aspecter:', `width: ${width}px; height: ${height}px; transform: scale(${containerRect.width / width}, ${containerRect.height / height});`);

      aspecter.style.cssText = `width: ${width}px; height: ${height}px; transform: scale3d(${containerRect.width / width}, ${containerRect.height / height}, 1);`;
    //}
  }

  protected sizeTailPath(path: SVGPathElement, rect: DOMRect, scaleX: number, delay: number, upscale: boolean, isOut: boolean, borderRadius: string) {
    const start = Date.now();
    const {width, height} = rect;
    delay = delay / 2;

    const br = borderRadius.split(' ').map(v => parseInt(v));

    const step = () => {
      const diff = Date.now() - start;

      let progress = delay ? diff / delay : 1;
      if(progress > 1) progress = 1;
      if(upscale) progress = 1 - progress;

      const _br: [number, number, number, number] = br.map(v => v * progress) as any;

      let d: string;
      if(isOut) d = generatePathData(0, 0, width - (9 / scaleX * progress), height, ..._br);
      else d = generatePathData(9 / scaleX * progress, 0, width/* width - (9 / scaleX * progress) */, height, ..._br);
      path.setAttributeNS(null, 'd', d);

      if(diff < delay) fastRaf(step);
    };
    
    //window.requestAnimationFrame(step);
    step();
  }

  protected removeCenterFromMover(mover: HTMLElement) {
    if(mover.classList.contains('center')) {
      //const rect = mover.getBoundingClientRect();
      const rect = this.content.media.getBoundingClientRect();
      mover.style.transform = `translate3d(${rect.left}px,${rect.top}px,0)`;
      mover.classList.remove('center');
      void mover.offsetLeft; // reflow
      mover.classList.remove('no-transition');
    }
  }

  protected moveTheMover(mover: HTMLElement, toLeft = true) {
    const windowW = windowSize.width;

    this.removeCenterFromMover(mover);

    //mover.classList.remove('active');
    mover.classList.add('moving');

    if(mover.dataset.timeout) { // и это тоже всё из-за скейла видео, так бы это не нужно было
      clearTimeout(+mover.dataset.timeout);
    }

    const rect = mover.getBoundingClientRect();

    const newTransform = mover.style.transform.replace(/translate3d\((.+?),/, (match, p1) => {
      const x = toLeft ? -rect.width : windowW;
      //const x = toLeft ? -(rect.right + (rect.width / 2)) : windowW / 2;

      return match.replace(p1, x + 'px');
    });

    ////////this.log('set newTransform:', newTransform, mover.style.transform, toLeft);
    mover.style.transform = newTransform;

    setTimeout(() => {
      mover.remove();
    }, 350);
  }

  protected setNewMover() {
    const newMover = document.createElement('div');
    newMover.classList.add('media-viewer-mover');
    newMover.style.display = 'none';

    if(this.content.mover) {
      const oldMover = this.content.mover;
      oldMover.parentElement.append(newMover);
    } else {
      this.moversContainer.append(newMover);
    }

    return this.content.mover = newMover;
  }

  protected updateMediaSource(target: HTMLElement, url: string, tagName: 'video' | 'img') {
    //if(target instanceof SVGSVGElement) {
      const el = target.tagName.toLowerCase() === tagName ? target : target.querySelector(tagName) as HTMLElement;
      if(el && !findUpClassName(target, 'document')) {
        if(findUpClassName(target, 'attachment')) {
          // two parentElements because element can be contained in aspecter
          const preloader = target.parentElement.parentElement.querySelector('.preloader-container') as HTMLElement;
          if(preloader) {
            if(tagName === 'video') {
              if(preloader.classList.contains('manual')) {
                preloader.click();
                // return;
              }
    
              return;
            }
            
            preloader.remove();
          }
        }

        renderImageFromUrl(el, url);

        // ! костыль, но он тут даже и не нужен
        if(el.classList.contains('thumbnail') && el.parentElement.classList.contains('media-container-aspecter')) {
          el.classList.remove('thumbnail');
        }
      }
    /* } else {

    } */
  }

  protected setAuthorInfo(fromId: PeerId | string, timestamp: number) {
    replaceContent(this.author.date, formatFullSentTime(timestamp));

    const isPeerId = fromId.isPeerId();
    let title: HTMLElement;
    if(isPeerId) {
      title = new PeerTitle({
        peerId: fromId as PeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      }).element;
    } else {
      title = document.createElement('span');
      title.innerHTML = RichTextProcessor.wrapEmojiText(fromId);
      title.classList.add('peer-title');
    }

    replaceContent(this.author.nameEl, title);

    let oldAvatar = this.author.avatarEl;
    this.author.avatarEl = (oldAvatar.cloneNode() as AvatarElement);
    (this.author.avatarEl as AvatarElement).updateWithOptions({
      // @ts-ignore
      peerId: fromId || NULL_PEER_ID,
      peerTitle: isPeerId ? undefined : '' + fromId
    });

    oldAvatar.parentElement.replaceChild(this.author.avatarEl, oldAvatar);
  }
  
  protected async _openMedia(
    media: MyDocument | MyPhoto, 
    timestamp: number, 
    fromId: PeerId | string, 
    fromRight: number, 
    target?: HTMLElement, 
    reverse = false, 
    prevTargets: TargetType[] = [], 
    nextTargets: TargetType[] = [], 
    message?: MyMessage
    /* , needLoadMore = true */
  ) {
    if(this.setMoverPromise) return this.setMoverPromise;

    /* if(DEBUG) {
      this.log('openMedia:', media, fromId, prevTargets, nextTargets);
    } */

    this.setAuthorInfo(fromId, timestamp);
    
    const isDocument = media._ === 'document';
    const isVideo = isDocument && media.mime_type && ((['video', 'gif'] as MyDocument['type'][]).includes(media.type) || media.mime_type.indexOf('video/') === 0);

    if(this.isFirstOpen) {
      //this.targetContainer = targetContainer;
      // this.needLoadMore = needLoadMore;
      this.isFirstOpen = false;
      this.listLoader.setTargets(prevTargets, nextTargets, reverse);
      (window as any).appMediaViewer = this;
      //this.loadMore = loadMore;

      /* if(appSidebarRight.historyTabIDs.slice(-1)[0] === AppSidebarRight.SLIDERITEMSIDS.forward) {
        appSidebarRight.forwardTab.closeBtn.click();
        await new Promise((resolve) => setTimeout(resolve, 200));
      } */
    }

    if(this.listLoader.next.length < 10) {
      setTimeout(() => {
        this.listLoader.load(true);
      }, 0);
    }

    //if(prevTarget && (!prevTarget.parentElement || !this.isElementVisible(this.targetContainer, prevTarget))) prevTarget = null;
    //if(nextTarget && (!nextTarget.parentElement || !this.isElementVisible(this.targetContainer, nextTarget))) nextTarget = null;

    this.buttons.prev.classList.toggle('hide', !this.listLoader.previous.length);
    this.buttons.next.classList.toggle('hide', !this.listLoader.next.length);
    
    const container = this.content.media;
    const useContainerAsTarget = !target || target === container;
    if(useContainerAsTarget) target = container;

    this.target = {element: target} as any;
    const tempId = ++this.tempId;

    if(container.firstElementChild) {
      container.innerHTML = '';
    }
    
    // ok set

    const wasActive = fromRight !== 0;
    if(wasActive) {
      this.moveTheMover(this.content.mover, fromRight === 1);
      this.setNewMover();
    } else {
      rootScope.isOverlayActive = true;
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup', this.onKeyUp);
      if(!IS_TOUCH_SUPPORTED) window.addEventListener('wheel', this.onWheel, {passive: false, capture: true});
      const mainColumns = document.getElementById('main-columns');
      this.pageEl.insertBefore(this.wholeDiv, mainColumns);
      void this.wholeDiv.offsetLeft; // reflow
      this.wholeDiv.classList.add('active');
      animationIntersector.checkAnimations(true);

      if(!IS_MOBILE_SAFARI) {
        appNavigationController.pushItem({
          type: 'media',
          onPop: (canAnimate) => {
            if(this.setMoverAnimationPromise) {
              return false;
            }
            
            this.close();
          }
        });
      }
    }

    ////////this.log('wasActive:', wasActive);

    const mover = this.content.mover;

    const maxWidth = windowSize.width;
    //const maxWidth = this.pageEl.scrollWidth;
    // TODO: const maxHeight = mediaSizes.isMobile ? appPhotosManager.windowH : appPhotosManager.windowH - 100;
    let padding = 0;
    const windowH = windowSize.height;
    if(windowH < 1000000 && !mediaSizes.isMobile) {
      padding = 120;
    }
    const maxHeight = windowH - 120 - padding;
    let thumbPromise: Promise<any> = Promise.resolve();
    const size = appPhotosManager.setAttachmentSize(media, container, maxWidth, maxHeight, mediaSizes.isMobile ? false : true, undefined, !!(isDocument && media.w && media.h)).photoSize;
    if(useContainerAsTarget) {
      const cacheContext = appDownloadManager.getCacheContext(media, size.type);
      let img: HTMLImageElement;
      if(cacheContext.downloaded) {
        img = new Image();
        img.src = cacheContext.url;
      } else {
        const gotThumb = appPhotosManager.getStrippedThumbIfNeeded(media, cacheContext, true);
        if(gotThumb) {
          thumbPromise = gotThumb.loadPromise;
          img = gotThumb.image;
        }
      }

      if(img) {
        img.classList.add('thumbnail');
        container.append(img);
      }
    }

    // need after setAttachmentSize
    /* if(useContainerAsTarget) {
      target = target.querySelector('img, video') || target;
    } */

    const supportsStreaming: boolean = !!(isDocument && media.supportsStreaming);
    const preloader = supportsStreaming ? this.preloaderStreamable : this.preloader;

    let setMoverPromise: Promise<void>;
    if(isVideo) {
      ////////this.log('will wrap video', media, size);

      // потому что для safari нужно создать элемент из event'а
      // const video = document.createElement('video');
      const useController = message && media.type !== 'gif';
      const video = /* useController ? 
        appMediaPlaybackController.addMedia(message, false, true) as HTMLVideoElement : 
         */document.createElement('video');

      const set = () => this.setMoverToTarget(target, false, fromRight).then(({onAnimationEnd}) => {
      //return; // set and don't move
      //if(wasActive) return;
        //return;
  
        const div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;
        //const video = mover.querySelector('video') || document.createElement('video');
  
        const moverVideo = mover.querySelector('video');
        if(moverVideo) {
          moverVideo.remove();
        }
  
        //video.src = '';
  
        video.setAttribute('playsinline', 'true');
  
        // * fix for playing video if viewer is closed (https://contest.com/javascript-web-bonus/entry1425#issue11629)
        video.addEventListener('timeupdate', () => {
          if(this.tempId !== tempId) {
            video.pause();
          }
        });

        video.addEventListener('error', () => {
          if(video.error.code !== 4) {
            this.log.error("Error " + video.error.code + "; details: " + video.error.message);
          }

          if(preloader) {
            preloader.detach();
          }
        }, {once: true});

        this.addEventListener('setMoverAfter', () => {
          video.src = '';
          video.load();
        }, {once: true});
  
        if(IS_SAFARI) {
          // test stream
          // video.controls = true;
          video.autoplay = true;
        }
  
        if(media.type === 'gif') {
          video.muted = true;
          video.autoplay = true;
          video.loop = true;
        } else if(media.duration < 60) {
          video.loop = true;
        }
  
        // if(!video.parentElement) {
          div.append(video);
        // }
  
        const canPlayThrough = new Promise((resolve) => {
          video.addEventListener('canplay', resolve, {once: true});
        });
  
        const createPlayer = () => {
          if(media.type !== 'gif') {
            video.dataset.ckin = 'default';
            video.dataset.overlay = '1';

            Promise.all([canPlayThrough, onAnimationEnd]).then(() => {
              if(this.tempId !== tempId) {
                return;
              }
  
              // const play = useController ? appMediaPlaybackController.willBePlayedMedia === video : true;
              const play = true;
              const player = this.videoPlayer = new VideoPlayer({
                video, 
                play, 
                streamable: supportsStreaming,
                onPlaybackRackMenuToggle: (open) => {
                  this.wholeDiv.classList.toggle('hide-caption', !!open);
                }
              });
              player.addEventListener('toggleControls', (show) => {
                this.wholeDiv.classList.toggle('has-video-controls', show);
              });

              this.addEventListener('setMoverBefore', () => {
                this.wholeDiv.classList.remove('has-video-controls');
                this.videoPlayer.removeListeners();
                this.videoPlayer = undefined;
              }, {once: true});

              if(this.isZooming()) {
                this.videoPlayer.lockControls(false);
              }
              /* div.append(video);
              mover.append(player.wrapper); */
            });
          }
        };
  
        if(supportsStreaming) {
          onAnimationEnd.then(() => {
            if(video.readyState < video.HAVE_FUTURE_DATA) {
              preloader.attach(mover, true);
            }
  
            /* canPlayThrough.then(() => {
              preloader.detach();
            }); */
          });
  
          const attachCanPlay = () => {
            video.addEventListener('canplay', () => {
              //this.log('video waited and progress loaded');
              preloader.detach();
              video.parentElement.classList.remove('is-buffering');
            }, {once: true});
          };
  
          video.addEventListener('waiting', () => {
            const loading = video.networkState === video.NETWORK_LOADING;
            const isntEnoughData = video.readyState < video.HAVE_FUTURE_DATA;
  
            //this.log('video waiting for progress', loading, isntEnoughData);
            if(loading && isntEnoughData) {
              attachCanPlay();
  
              preloader.attach(mover, true);
  
              // поставлю класс для плеера, чтобы убрать большую иконку пока прелоадер на месте
              video.parentElement.classList.add('is-buffering');
            }
          });

          if(this.wholeDiv.classList.contains('no-forwards')) {
            video.addEventListener('contextmenu', (e) => {
              cancelEvent(e);
            });
          }
  
          attachCanPlay();
        }
        
        //if(!video.src || media.url !== video.src) {
          const load = () => {
            /* if(useController) {
              appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid, message.pFlags.is_scheduled);
            } */

            const cacheContext = appDownloadManager.getCacheContext(media);
            const promise: Promise<any> = supportsStreaming ? Promise.resolve() : appDocsManager.downloadDoc(media);
            
            if(!supportsStreaming) {
              onAnimationEnd.then(() => {
                if(!cacheContext.url) {
                  preloader.attach(mover, true, promise);
                }
              });
            }
  
            Promise.all([promise, onAnimationEnd]).then(() => {
              if(this.tempId !== tempId) {
                this.log.warn('media viewer changed video');
                return;
              }

              const url = cacheContext.url;
              if(target instanceof SVGSVGElement/*  && (video.parentElement || !isSafari) */) { // if video exists
                //if(!video.parentElement) {
                  div.firstElementChild.lastElementChild.append(video);
                //}
              } else {
                renderImageFromUrl(video, url);
              }

              // * have to set options (especially playbackRate) after src
              // * https://github.com/videojs/video.js/issues/2516
              if(useController) {
                const rollback = appMediaPlaybackController.setSingleMedia(video, message as Message.message);

                this.addEventListener('setMoverBefore', () => {
                  rollback();
                }, {once: true});
              }

              this.updateMediaSource(target, url, 'video');

              createPlayer();
            });
  
            return promise;
          };
  
          this.lazyLoadQueue.unshift({load});
        //} else createPlayer();
      });

      setMoverPromise = thumbPromise.then(set);
    } else {
      const set = () => this.setMoverToTarget(target, false, fromRight).then(({onAnimationEnd}) => {
      //return; // set and don't move
      //if(wasActive) return;
        //return;
        
        const load = () => {
          const cacheContext = appDownloadManager.getCacheContext(media, size.type);
          const cancellablePromise = isDocument ? appDocsManager.downloadDoc(media) : appPhotosManager.preloadPhoto(media, size);
  
          onAnimationEnd.then(() => {
            if(!cacheContext.url) {
              this.preloader.attachPromise(cancellablePromise);
              //this.preloader.attach(mover, true, cancellablePromise);
            }
          });
          
          Promise.all([onAnimationEnd, cancellablePromise]).then(() => {
            if(this.tempId !== tempId) {
              this.log.warn('media viewer changed photo');
              return;
            }
            
            ///////this.log('indochina', blob);
    
            const url = cacheContext.url;
            if(target instanceof SVGSVGElement) {
              this.updateMediaSource(target, url, 'img');
              this.updateMediaSource(mover, url, 'img');
  
              if(mediaSizes.isMobile) {
                const imgs = mover.querySelectorAll('img');
                if(imgs && imgs.length) {
                  imgs.forEach(img => {
                    img.classList.remove('thumbnail'); // может здесь это вообще не нужно
                  });
                }
              }
            } else {
              const div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;
              const haveImage = div.firstElementChild?.tagName === 'IMG' ? div.firstElementChild as HTMLImageElement : null;
              if(!haveImage || haveImage.src !== url)  {
                let image = new Image();
                image.classList.add('thumbnail');
    
                //this.log('will renderImageFromUrl:', image, div, target);
    
                renderImageFromUrl(image, url, () => {
                  this.updateMediaSource(target, url, 'img');
  
                  if(haveImage) {
                    fastRaf(() => {
                      haveImage.remove();
                    });
                  }
    
                  div.append(image);
                });
              }
            }
    
            //this.preloader.detach();
          }).catch(err => {
            this.log.error(err);
            this.preloader.attach(mover);
            this.preloader.setManual();
          });
  
          return cancellablePromise;
        };
  
        this.lazyLoadQueue.unshift({load});
      });

      setMoverPromise = thumbPromise.then(set);
    }

    return this.setMoverPromise = setMoverPromise.catch(() => {
      this.setMoverAnimationPromise = null;
    }).finally(() => {
      this.setMoverPromise = null;
    });
  }
}
