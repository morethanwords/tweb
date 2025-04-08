/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * zoom part from WebZ
// * https://github.com/Ajaxy/telegram-tt/blob/069f4f5b2f2c7c22529ccced876842e7f9cb81f4/src/components/mediaViewer/MediaViewerSlides.tsx

import type {MyDocument} from '../lib/appManagers/appDocsManager';
import type {MyPhoto} from '../lib/appManagers/appPhotosManager';
import deferredPromise from '../helpers/cancellablePromise';
import mediaSizes from '../helpers/mediaSizes';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import {IS_MOBILE, IS_MOBILE_SAFARI, IS_SAFARI} from '../environment/userAgent';
import {logger} from '../lib/logger';
import VideoPlayer from '../lib/mediaPlayer';
import rootScope from '../lib/rootScope';
import animationIntersector from './animationIntersector';
import appMediaPlaybackController, {AppMediaPlaybackController} from './appMediaPlaybackController';
import ButtonIcon from './buttonIcon';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from './buttonMenu';
import ButtonMenuToggle from './buttonMenuToggle';
import ProgressivePreloader from './preloader';
import SwipeHandler, {ZoomDetails} from './swipeHandler';
import {formatFullSentTime} from '../helpers/date';
import appNavigationController, {NavigationItem} from './appNavigationController';
import {InputGroupCall, Message, PhotoSize} from '../layer';
import findUpClassName from '../helpers/dom/findUpClassName';
import renderImageFromUrl, {renderImageFromUrlPromise} from '../helpers/dom/renderImageFromUrl';
import getVisibleRect from '../helpers/dom/getVisibleRect';
import cancelEvent from '../helpers/dom/cancelEvent';
import fillPropertyValue from '../helpers/fillPropertyValue';
import generatePathData from '../helpers/generatePathData';
import replaceContent from '../helpers/dom/replaceContent';
import {doubleRaf, fastRaf} from '../helpers/schedulers';
import RangeSelector from './rangeSelector';
import windowSize from '../helpers/windowSize';
import ListLoader from '../helpers/listLoader';
import EventListenerBase from '../helpers/eventListenerBase';
import {MyMessage} from '../lib/appManagers/appMessagesManager';
import {NULL_PEER_ID} from '../lib/mtproto/mtproto_config';
import {isFullScreen} from '../helpers/dom/fullScreen';
import {attachClickEvent, hasMouseMovedSinceDown} from '../helpers/dom/clickEvent';
import SearchListLoader from '../helpers/searchListLoader';
import createVideo from '../helpers/dom/createVideo';
import {AppManagers} from '../lib/appManagers/managers';
import getMediaThumbIfNeeded from '../helpers/getStrippedThumbIfNeeded';
import setAttachmentSize from '../helpers/setAttachmentSize';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import LazyLoadQueueBase from './lazyLoadQueueBase';
import overlayCounter from '../helpers/overlayCounter';
import appDownloadManager from '../lib/appManagers/appDownloadManager';
import wrapPeerTitle from './wrappers/peerTitle';
import {toastNew} from './toast';
import clamp from '../helpers/number/clamp';
import debounce from '../helpers/schedulers/debounce';
import isBetween from '../helpers/number/isBetween';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import liteMode from '../helpers/liteMode';
import {avatarNew, findUpAvatar} from './avatarNew';
import {MiddlewareHelper, getMiddleware} from '../helpers/middleware';
import onMediaLoad, {shouldIgnoreVideoError} from '../helpers/onMediaLoad';
import handleVideoLeak from '../helpers/dom/handleVideoLeak';
import Icon from './icon';
import {replaceButtonIcon} from './button';
import setCurrentTime from '../helpers/dom/setCurrentTime';
import {MediaSize} from '../helpers/mediaSize';
import {getRtmpStreamUrl} from '../lib/rtmp/url';
import boxBlurCanvasRGB from '../vendor/fastBlur';
import {i18n} from '../lib/langPack';
import {getQualityFilesEntries} from '../lib/hls/createHlsVideoSource';
import {snapQualityHeight} from '../lib/hls/snapQualityHeight';
import {ButtonMenuItemWithAuxiliaryText} from '../lib/mediaPlayer/qualityLevelsSwitchButton';
import formatBytes from '../helpers/formatBytes';
import getDocumentURL from '../lib/appManagers/utils/docs/getDocumentURL';

const ZOOM_STEP = 0.5;
const ZOOM_INITIAL_VALUE = 1;
const ZOOM_MIN_VALUE = 0.5;
const ZOOM_MAX_VALUE = 4;

const OPEN_TRANSITION_TIME = 200;
const MOVE_TRANSITION_TIME = 350;

export const MEDIA_VIEWER_CLASSNAME = 'media-viewer';

type Transform = {
  x: number;
  y: number;
  scale: number;
};

export type VideoTimestamp = {
  time: number;
  text?: string;
};

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
  protected author: {
    avatarEl: ReturnType<typeof avatarNew>,
    avatarMiddlewareHelper?: MiddlewareHelper,
    container: HTMLElement,
    nameEl: HTMLElement,
    date: HTMLElement
  } = {} as any;
  protected content: {[k in 'main' | 'container' | 'media' | 'mover' | ContentAdditionType]: HTMLElement} = {} as any;
  protected buttons: {[k in 'download' | 'close' | 'prev' | 'next' | 'mobile-close' | 'zoomin' | ButtonsAdditionType]: HTMLElement} = {} as any;
  protected topbar: HTMLElement;
  protected moversContainer: HTMLElement;

  protected tempId = 0;
  protected preloader: ProgressivePreloader = null;
  protected preloaderStreamable: ProgressivePreloader = null;

  protected log: ReturnType<typeof logger>;

  protected isFirstOpen = true;

  // protected pageEl = document.getElementById('page-chats') as HTMLDivElement;

  protected setMoverPromise: Promise<void>;
  protected setMoverAnimationPromise: Promise<void>;

  protected lazyLoadQueue: LazyLoadQueueBase;

  protected highlightSwitchersTimeout: number;

  protected streamEnded: boolean = false;

  protected downloadQualityMenuOptions: ButtonMenuItemOptionsVerifiable[] = [];
  protected get hasQualityOptions() {
    return this.downloadQualityMenuOptions.length > 0;
  }

  protected onDownloadClick: (e: MouseEvent | TouchEvent, docId?: DocId) => void;
  protected onPrevClick: (target: TargetType) => void;
  protected onNextClick: (target: TargetType) => void;

  protected disposeSolid?: () => void;

  protected videoPlayer: VideoPlayer;
  protected adminPanel: HTMLDivElement;

  protected zoomElements: {
    container: HTMLElement,
    btnOut: HTMLElement,
    btnIn: HTMLElement,
    rangeSelector: RangeSelector
  } = {} as any;
  protected transform: Transform = {x: 0, y: 0, scale: ZOOM_INITIAL_VALUE};
  protected isZooming: boolean;
  protected isGesturingNow: boolean;
  protected isZoomingNow: boolean;
  protected draggingType: 'wheel' | 'touchmove' | 'mousemove';
  protected initialContentRect: DOMRect;
  protected live: boolean;

  protected ctrlKeyDown: boolean;
  protected releaseSingleMedia: ReturnType<AppMediaPlaybackController['setSingleMedia']>;
  protected navigationItem: NavigationItem;

  protected managers: AppManagers;
  protected swipeHandler: SwipeHandler;
  protected closing: boolean;

  protected lastTransform: Transform = this.transform;
  protected lastZoomCenter: {x: number, y: number} = this.transform;
  protected lastDragOffset: {x: number, y: number} = this.transform;
  protected lastDragDelta: {x: number, y: number} = this.transform;
  protected lastGestureTime: number;
  protected clampZoomDebounced: ReturnType<typeof debounce<() => void>>;
  protected ignoreNextClick: boolean;

  protected middlewareHelper: MiddlewareHelper;

  protected overlayActive: boolean;

  protected videoTimestamps: VideoTimestamp[] = [];

  get target() {
    return this.listLoader.current;
  }

  set target(value) {
    this.listLoader.current = value;
  }

  constructor(
    protected listLoader: ListLoader<TargetType, any>,
    topButtons: Array<keyof AppMediaViewerBase<ContentAdditionType, ButtonsAdditionType, TargetType>['buttons']>,
    protected extraHeightPadding = 0
  ) {
    super(false);

    this.managers = rootScope.managers;
    this.middlewareHelper = getMiddleware();

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
    this.overlayActive = false;

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
    authorRight.classList.add(MEDIA_VIEWER_CLASSNAME + '-author-right');

    this.author.nameEl = document.createElement('div');
    this.author.nameEl.classList.add(MEDIA_VIEWER_CLASSNAME + '-name');

    this.author.date = document.createElement('div');
    this.author.date.classList.add(MEDIA_VIEWER_CLASSNAME + '-date');

    authorRight.append(this.author.nameEl, this.author.date);

    this.author.container.append(authorRight);

    // * buttons
    const buttonsDiv = document.createElement('div');
    buttonsDiv.classList.add(MEDIA_VIEWER_CLASSNAME + '-buttons');

    topButtons.concat(['download', 'zoomin', 'close']).forEach((name) => {
      const button = ButtonIcon(name as Icon, {noRipple: true});
      this.buttons[name] = button;
      buttonsDiv.append(button);
    });

    // * zoom
    this.zoomElements.container = document.createElement('div');
    this.zoomElements.container.classList.add('zoom-container');

    this.zoomElements.btnOut = ButtonIcon('zoomout', {noRipple: true});
    attachClickEvent(this.zoomElements.btnOut, () => this.addZoomStep(false));
    this.zoomElements.btnIn = ButtonIcon('zoomin', {noRipple: true});
    attachClickEvent(this.zoomElements.btnIn, () => this.addZoomStep(true));

    this.zoomElements.rangeSelector = new RangeSelector({
      step: 0.01,
      min: ZOOM_MIN_VALUE,
      max: ZOOM_MAX_VALUE,
      withTransition: true
    }, ZOOM_INITIAL_VALUE);
    this.zoomElements.rangeSelector.setListeners();
    this.zoomElements.rangeSelector.setHandlers({
      onScrub: (value) => {
        const add = value - this.transform.scale;
        this.addZoom(add);
        this.clampZoomDebounced?.clearTimeout();
      },
      onMouseDown: () => {
        this.onSwipeFirst();
      },
      onMouseUp: () => {
        this.onSwipeReset();
      }
    });

    this.zoomElements.container.append(this.zoomElements.btnOut, this.zoomElements.rangeSelector.container, this.zoomElements.btnIn);

    if(!IS_TOUCH_SUPPORTED) {
      this.wholeDiv.append(this.zoomElements.container);
    }

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
    this.buttons.prev.append(Icon('previous', `${MEDIA_VIEWER_CLASSNAME}-sibling-button`, `${MEDIA_VIEWER_CLASSNAME}-prev-button`));

    this.buttons.next = document.createElement('div');
    this.buttons.next.className = `${MEDIA_VIEWER_CLASSNAME}-switcher ${MEDIA_VIEWER_CLASSNAME}-switcher-right`;
    this.buttons.next.append(Icon('next', `${MEDIA_VIEWER_CLASSNAME}-sibling-button`, `${MEDIA_VIEWER_CLASSNAME}-next-button`));

    this.moversContainer = document.createElement('div');
    this.moversContainer.classList.add(MEDIA_VIEWER_CLASSNAME + '-movers');

    this.moversContainer.append(this.buttons.prev, this.buttons.next);

    this.wholeDiv.append(this.overlaysDiv, /* this.buttons.prev, this.buttons.next, */ this.topbar, this.moversContainer);

    // * constructing html end

    this.listLoader.onLoadedMore = () => {
      this.buttons.prev.classList.toggle('hide', !this.listLoader.previous.length);
      this.buttons.next.classList.toggle('hide', !this.listLoader.next.length);
    };

    this.setNewMover();
  }

  protected setListeners() {
    attachClickEvent(this.buttons.download, (e) => {
      if(this.hasQualityOptions) return;
      this.onDownloadClick(e);
    });
    this.buttons.download.classList.add('quality-download-options-button-menu');
    ButtonMenuToggle({
      container: this.buttons.download,
      buttons: this.downloadQualityMenuOptions,
      direction: 'bottom-left'
    });

    [this.buttons.close, this.buttons['mobile-close'], this.preloaderStreamable.preloader].forEach((el) => {
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

    attachClickEvent(this.buttons.zoomin, () => {
      if(this.isZooming) this.resetZoom();
      else {
        this.addZoomStep(true);
      }
    });

    // ! cannot use the function because it'll cancel slide event on touch devices
    // attachClickEvent(this.wholeDiv, this.onClick);
    this.wholeDiv.addEventListener('click', this.onClick);

    this.listLoader.onJump = (item, older) => {
      if(older) this.onNextClick(item);
      else this.onPrevClick(item);
    };

    const adjustPosition = (xDiff: number, yDiff: number) => {
      const [x, y] = [xDiff - this.lastDragOffset.x, yDiff - this.lastDragOffset.y];
      const [transform, inBoundsX, inBoundsY] = this.calculateOffsetBoundaries({
        x: this.transform.x + x,
        y: this.transform.y + y,
        scale: this.transform.scale
      });

      this.lastDragDelta = {
        x,
        y
      };

      this.lastDragOffset = {
        x: xDiff,
        y: yDiff
      };

      this.setTransform(transform);

      return {inBoundsX, inBoundsY};
    };

    const setLastGestureTime = debounce(() => {
      this.lastGestureTime = Date.now();
    }, 500, false, true);

    this.clampZoomDebounced = debounce(() => {
      this.onSwipeReset();
    }, 300, false, true);

    this.swipeHandler = new SwipeHandler({
      element: this.wholeDiv,
      onReset: this.onSwipeReset,
      onFirstSwipe: this.onSwipeFirst as any,
      onSwipe: (xDiff, yDiff, e, cancelDrag) => {
        if(isFullScreen()) {
          return;
        }

        if(this.isZooming && !this.isZoomingNow) {
          setLastGestureTime();

          this.draggingType = e.type as any;
          const {inBoundsX, inBoundsY} = adjustPosition(xDiff, yDiff);
          cancelDrag?.(!inBoundsX, !inBoundsY);

          return;
        }

        if(this.isZoomingNow || !IS_TOUCH_SUPPORTED) {
          return;
        }

        const percents = Math.abs(xDiff) / windowSize.width;
        if(percents > .2 || Math.abs(xDiff) > 125) {
          if(xDiff > 0) {
            this.buttons.prev.click();
          } else {
            this.buttons.next.click();
          }

          return true;
        }

        const percentsY = Math.abs(yDiff) / windowSize.height;
        if(percentsY > .2 || Math.abs(yDiff) > 125) {
          this.close();
          return true;
        }

        return false;
      },
      onZoom: this.onZoom,
      onDoubleClick: ({centerX, centerY}) => {
        if(this.isZooming) {
          this.resetZoom();
        } else {
          const scale = ZOOM_INITIAL_VALUE + 2;
          this.changeZoomByPosition(centerX, centerY, scale);
        }
      },
      verifyTouchTarget: (e) => {
        // * Fix for seek input
        if(isFullScreen() ||
          findUpAsChild(e.target as HTMLElement, this.zoomElements.container) ||
          findUpClassName(e.target, 'ckin__controls') ||
          findUpClassName(e.target, 'media-viewer-caption') ||
          (findUpClassName(e.target, 'media-viewer-topbar') && e.type !== 'wheel')) {
          return false;
        }

        return true;
      },
      cursor: ''
      // cursor: 'move'
    });
  }

  protected onSwipeFirst = (e?: MouseEvent | TouchEvent | WheelEvent) => {
    this.lastDragOffset = this.lastDragDelta = {x: 0, y: 0};
    this.lastTransform = {...this.transform};
    if(e?.type !== 'wheel' || !this.ctrlKeyDown) { // keep transition for real mouse wheel
      this.moversContainer.classList.add('no-transition');
      this.zoomElements.rangeSelector.container.classList.remove('with-transition');
    }
    this.isGesturingNow = true;
    this.lastGestureTime = Date.now();
    this.clampZoomDebounced.clearTimeout();

    if(!this.lastTransform.x && !this.lastTransform.y && !this.isZooming) {
      this.initialContentRect = this.content.media.getBoundingClientRect();
    }
  };

  protected onSwipeReset = (e?: Event) => {
    // move
    this.moversContainer.classList.remove('no-transition');
    this.zoomElements.rangeSelector.container.classList.add('with-transition');
    this.clampZoomDebounced.clearTimeout();

    if(e?.type === 'mouseup' && this.draggingType === 'mousemove') {
      this.ignoreNextClick = true;
    }

    const {draggingType} = this;
    this.isZoomingNow = false;
    this.isGesturingNow = false;
    this.draggingType = undefined;

    if(this.closing) {
      return;
    }

    if(this.transform.scale > ZOOM_INITIAL_VALUE) {
      // Get current content boundaries
      const s1 = Math.min(this.transform.scale, ZOOM_MAX_VALUE);
      const scaleFactor = s1 / this.transform.scale;

      // Calculate new position based on the last zoom center to keep the zoom center
      // at the same position when bouncing back from max zoom
      let x1 = this.transform.x * scaleFactor + (this.lastZoomCenter.x - scaleFactor * this.lastZoomCenter.x);
      let y1 = this.transform.y * scaleFactor + (this.lastZoomCenter.y - scaleFactor * this.lastZoomCenter.y);

      // If scale didn't change, we need to add inertia to pan gesture
      if(draggingType && draggingType !== 'wheel' && this.lastTransform.scale === this.transform.scale) {
        // Arbitrary pan velocity coefficient
        const k = 0.1;

        // Calculate user gesture velocity
        const elapsedTime = Math.max(1, Date.now() - this.lastGestureTime);
        const Vx = Math.abs(this.lastDragOffset.x) / elapsedTime;
        const Vy = Math.abs(this.lastDragOffset.y) / elapsedTime;

        // Add extra distance based on gesture velocity and last pan delta
        x1 -= Math.abs(this.lastDragOffset.x) * Vx * k * -this.lastDragDelta.x;
        y1 -= Math.abs(this.lastDragOffset.y) * Vy * k * -this.lastDragDelta.y;
      }

      const [transform] = this.calculateOffsetBoundaries({x: x1, y: y1, scale: s1});
      this.lastTransform = transform;
      this.setTransform(transform);
    } else if(this.transform.scale < ZOOM_INITIAL_VALUE) {
      this.resetZoom();
    }
  };

  protected onZoom = ({
    initialCenterX,
    initialCenterY,
    zoom,
    zoomAdd,
    currentCenterX,
    currentCenterY,
    dragOffsetX,
    dragOffsetY,
    zoomFactor
  }: ZoomDetails) => {
    initialCenterX ||= windowSize.width / 2;
    initialCenterY ||= windowSize.height / 2;
    currentCenterX ||= windowSize.width / 2;
    currentCenterY ||= windowSize.height / 2;

    this.isZoomingNow = true;

    const zoomMaxBounceValue = ZOOM_MAX_VALUE * 3;
    const scale = zoomAdd !== undefined ? clamp(this.lastTransform.scale + zoomAdd, ZOOM_MIN_VALUE, zoomMaxBounceValue) : (zoom ?? clamp(this.lastTransform.scale * zoomFactor, ZOOM_MIN_VALUE, zoomMaxBounceValue));
    const scaleFactor = scale / this.lastTransform.scale;
    const offsetX = Math.abs(Math.min(this.lastTransform.x, 0));
    const offsetY = Math.abs(Math.min(this.lastTransform.y, 0));

    // Save last zoom center for bounce back effect
    this.lastZoomCenter = {
      x: currentCenterX,
      y: currentCenterY
    };

    // Calculate new center relative to the shifted image
    const scaledCenterX = offsetX + initialCenterX;
    const scaledCenterY = offsetY + initialCenterY;

    const {scaleOffsetX, scaleOffsetY} = this.calculateScaleOffset({x: scaledCenterX, y: scaledCenterY, scale: scaleFactor});

    const [transform] = this.calculateOffsetBoundaries({
      x: this.lastTransform.x + scaleOffsetX + dragOffsetX,
      y: this.lastTransform.y + scaleOffsetY + dragOffsetY,
      scale
    });

    this.setTransform(transform);
  };

  protected changeZoomByPosition(x: number, y: number, scale: number) {
    const {scaleOffsetX, scaleOffsetY} = this.calculateScaleOffset({x, y, scale});
    const transform = this.calculateOffsetBoundaries({
      x: scaleOffsetX,
      y: scaleOffsetY,
      scale
    })[0];

    this.setTransform(transform);
  }

  protected setTransform(transform: Transform) {
    this.transform = transform;
    this.changeZoom(transform.scale);
  }

  // Calculate how much we need to shift the image to keep the zoom center at the same position
  protected calculateScaleOffset({x, y, scale}: {
    x: number,
    y: number,
    scale: number
  }) {
    return {
      scaleOffsetX: x - scale * x,
      scaleOffsetY: y - scale * y
    };
  }

  protected toggleZoom(enable?: boolean) {
    const isVisible = this.isZooming;
    const auto = enable === undefined;
    if(this.zoomElements.rangeSelector.mousedown || this.ctrlKeyDown) {
      enable = true;
    }

    enable ??= !isVisible;

    if(isVisible === enable) {
      return;
    }

    replaceButtonIcon(this.buttons.zoomin, !enable ? 'zoomin' : 'zoomout');
    this.zoomElements.container.classList.toggle('is-visible', this.isZooming = enable);
    this.wholeDiv.classList.toggle('is-zooming', enable);

    if(auto || !enable) {
      const zoomValue = enable ? this.transform.scale : ZOOM_INITIAL_VALUE;
      this.setZoomValue(zoomValue);
      this.zoomElements.rangeSelector.setProgress(zoomValue);
    }

    if(this.videoPlayer) {
      this.videoPlayer.lockControls(enable ? false : undefined);
    }
  }

  protected addZoomStep(add: boolean) {
    this.addZoom(ZOOM_STEP * (add ? 1 : -1));
  }

  protected resetZoom() {
    this.setTransform({
      x: 0,
      y: 0,
      scale: ZOOM_INITIAL_VALUE
    });
  }

  protected changeZoom(value = this.transform.scale) {
    this.transform.scale = value;
    this.zoomElements.rangeSelector.setProgress(value);
    this.setZoomValue(value);
  }

  protected addZoom(value: number) {
    this.lastTransform = this.transform;
    this.onZoom({
      zoomAdd: value,
      currentCenterX: 0,
      currentCenterY: 0,
      initialCenterX: 0,
      initialCenterY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0
    });
    this.lastTransform = this.transform;
    this.clampZoomDebounced();
  }

  protected getZoomBounce() {
    return this.isGesturingNow && IS_TOUCH_SUPPORTED ? 50 : 0;
  }

  protected calculateOffsetBoundaries = (
    {x, y, scale}: Transform,
    offsetTop = 0
  ): [Transform, boolean, boolean] => {
    if(!this.initialContentRect) return [{x, y, scale}, true, true];
    // Get current content boundaries
    let inBoundsX = true;
    let inBoundsY = true;

    const {minX, maxX, minY, maxY} = this.getZoomBoundaries(scale, offsetTop);

    inBoundsX = isBetween(x, maxX, minX);
    x = clamp(x, maxX, minX);

    inBoundsY = isBetween(y, maxY, minY);
    y = clamp(y, maxY, minY);

    return [{x, y, scale}, inBoundsX, inBoundsY];
  };

  protected getZoomBoundaries(scale = this.transform.scale, offsetTop = 0) {
    if(!this.initialContentRect) {
      return {minX: 0, maxX: 0, minY: 0, maxY: 0};
    }

    const centerX = (windowSize.width - windowSize.width * scale) / 2;
    const centerY = (windowSize.height - windowSize.height * scale) / 2;

    // If content is outside window we calculate offset boundaries
    // based on initial content rect and current scale
    const minX = Math.max(-this.initialContentRect.left * scale, centerX);
    const maxX = windowSize.width - this.initialContentRect.right * scale;

    const minY = Math.max(-this.initialContentRect.top * scale + offsetTop, centerY);
    const maxY = windowSize.height - this.initialContentRect.bottom * scale;

    return {minX, maxX, minY, maxY};
  }

  protected setZoomValue = (value = this.transform.scale) => {
    this.initialContentRect ??= this.content.media.getBoundingClientRect();

    // this.zoomValue = value;
    if(value === ZOOM_INITIAL_VALUE) {
      this.transform.x = 0;
      this.transform.y = 0;
    }

    this.moversContainer.style.transform = `translate3d(${this.transform.x.toFixed(3)}px, ${this.transform.y.toFixed(3)}px, 0px) scale(${value.toFixed(3)})`;

    this.zoomElements.btnOut.classList.toggle('inactive', value <= ZOOM_MIN_VALUE);
    this.zoomElements.btnIn.classList.toggle('inactive', value >= ZOOM_MAX_VALUE);

    this.toggleZoom(value !== ZOOM_INITIAL_VALUE);
  };

  protected setBtnMenuToggle(buttons: ButtonMenuItemOptions[]) {
    const btnMenuToggle = ButtonMenuToggle({buttonOptions: {onlyMobile: true}, direction: 'bottom-left', buttons});
    this.topbar.append(btnMenuToggle);
  }

  public close(e?: MouseEvent) {
    this.disposeSolid?.();

    if(e) {
      cancelEvent(e);
    }

    if(this.closing) {
      return this.setMoverAnimationPromise;
    }

    if(this.setMoverAnimationPromise) return Promise.reject();

    this.closing = true;
    this.swipeHandler?.removeListeners();

    if(this.navigationItem) {
      appNavigationController.removeItem(this.navigationItem);
    }

    this.lazyLoadQueue.clear();
    this.author.avatarMiddlewareHelper?.destroy();

    const promise = this.setMoverToTarget(this.target?.element, true).then(({onAnimationEnd}) => onAnimationEnd);

    this.listLoader.reset();
    (this.listLoader as SearchListLoader<any>).cleanup && (this.listLoader as SearchListLoader<any>).cleanup();
    this.setMoverPromise = null;
    this.tempId = -1;
    if((window as any).appMediaViewer === this) {
      (window as any).appMediaViewer = undefined;
    }

    /* if(appSidebarRight.historyTabIDs.slice(-1)[0] === AppSidebarRight.SLIDERITEMSIDS.forward) {
      promise.then(() => {
        appSidebarRight.forwardTab.closeBtn.click();
      });
    } */

    this.removeGlobalListeners();

    promise.finally(() => {
      this.wholeDiv.remove();
      this.toggleOverlay(false);
      this.middlewareHelper.destroy();
    });

    return promise;
  }

  protected toggleOverlay(active: boolean) {
    if(this.overlayActive === active) {
      return;
    }

    this.overlayActive = active;
    overlayCounter.isDarkOverlayActive = active;
    animationIntersector.checkAnimations2(active);
  }

  protected toggleGlobalListeners(active: boolean) {
    if(active) this.setGlobalListeners();
    else this.removeGlobalListeners();
  }

  protected removeGlobalListeners() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  protected setGlobalListeners() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public setMediaTimestamp(timestamp: number) {
    this.videoPlayer?.setTimestamp(timestamp);
  }

  onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if(findUpClassName(target, 'popup')) { // target could be inside a popup
      return;
    }

    if(this.ignoreNextClick) {
      this.ignoreNextClick = undefined;
      return;
    }

    if(this.setMoverAnimationPromise) return;

    if(target.tagName === 'A') return;
    if(!findUpClassName(target, 'admin-popup-container')) {
      cancelEvent(e);
    }

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

    if(hasMouseMovedSinceDown(e)) {
      return;
    }

    const isZooming = this.isZooming && false;
    const classNames = ['admin-popup-container', 'ckin__player', 'media-viewer-buttons', 'media-viewer-author', 'media-viewer-caption', 'zoom-container'];
    if(isZooming) {
      classNames.push('media-viewer-movers');
    }

    const hasClickedSomething = classNames.some((s) => !!findUpClassName(target, s));
    if(!hasClickedSomething && this.live && document.pictureInPictureEnabled) {
      this.videoPlayer.requestPictureInPicture();
      return;
    }

    if(/* target === this.mediaViewerDiv */!hasClickedSomething || (!isZooming && (target.tagName === 'IMG' || target.tagName === 'image'))) {
      this.close();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // this.log('onKeyDown', e);
    if(overlayCounter.overlaysActive > 1) {
      return;
    }

    const key = e.key;

    let good = true;
    if(key === 'ArrowRight') {
      !this.isZooming && this.buttons.next.click();
    } else if(key === 'ArrowLeft') {
      !this.isZooming && this.buttons.prev.click();
    } else if(key === '-' || key === '=') {
      if(this.ctrlKeyDown) {
        this.addZoomStep(key === '=');
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
    if(overlayCounter.overlaysActive > 1) {
      return;
    }

    if(!(e.ctrlKey || e.metaKey)) {
      this.ctrlKeyDown = false;

      if(this.isZooming) {
        this.setZoomValue();
      }
    }
  };

  protected async setMoverToTarget(target: HTMLElement, closing = false, fromRight = 0) {
    this.dispatchEvent('setMoverBefore');

    const mover = this.content.mover;

    if(!closing) {
      mover.replaceChildren();
      // mover.append(this.buttons.prev, this.buttons.next);
    }

    const zoomValue = this.isZooming && closing /* && false */ ? this.transform.scale : ZOOM_INITIAL_VALUE;
    /* if(!(zoomValue > 1 && closing)) */ this.removeCenterFromMover(mover);
    if(closing) {
      void mover.offsetLeft; // reflow
      await doubleRaf();
    }

    const wasActive = fromRight !== 0;

    const delay = liteMode.isAvailable('animations') ? (wasActive ? MOVE_TRANSITION_TIME : OPEN_TRANSITION_TIME) : 0;
    // let delay = wasActive ? 350 : 10000;

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
      if(findUpAvatar(target) || target.classList.contains('grid-item')/*  || target.classList.contains('document-ico') */) {
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
    if(target === this.content.media) {
      needOpacity = true;
    } else if(!target.classList.contains('profile-avatars-avatar')) {
      const overflowElement = findUpClassName(realParent, 'scrollable');
      const visibleRect = getVisibleRect(realParent, overflowElement, true);

      if(closing && visibleRect && (visibleRect.overflow.vertical === 2 || visibleRect.overflow.horizontal === 2)) {
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
        if(player && !needOpacity) {
          const video = player.querySelector('video');
          if(video) {
            video.pause();
            player.replaceWith(video);
          }
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
    borderRadius = brSplitted.map((r) => (parseInt(r) / scaleX) + 'px').join(' ');
    if(!wasActive) {
      mover.style.borderRadius = borderRadius;
    }
    // let borderRadius = '0px 0px 0px 0px';

    if(closing && zoomValue !== 1) {
      const left = rect.left - (windowSize.width * scaleX - rect.width) / 2;
      const top = rect.top - (windowSize.height * scaleY - rect.height) / 2;
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
      let mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
      let src: string;

      // if(target instanceof HTMLVideoElement) {
      const selector = 'video, img, .canvas-thumbnail';
      const queryFrom = target.matches(selector) ? target.parentElement : target;
      const elements = Array.from(queryFrom.querySelectorAll(selector)) as HTMLImageElement[];
      if(elements.length) {
        target = elements.pop();
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if(target instanceof HTMLImageElement) {
          canvas.width = target.naturalWidth;
          canvas.height = target.naturalHeight;
        } else if(target instanceof HTMLVideoElement) {
          canvas.width = target.videoWidth;
          canvas.height = target.videoHeight;
        } else if(target instanceof HTMLCanvasElement) {
          canvas.width = target.width;
          canvas.height = target.height;
        }

        canvas.className = 'canvas-thumbnail thumbnail media-photo';
        context.drawImage(target as HTMLImageElement | HTMLCanvasElement, 0, 0);
        if(this.live) {
          boxBlurCanvasRGB(context, 0, 0, canvas.width, canvas.height, 8, 2);
        }
        target = canvas;
      }
      // }

      if(target.tagName === 'DIV' || findUpAvatar(target)) { // useContainerAsTarget
        const images = Array.from(target.querySelectorAll('img')) as HTMLImageElement[];
        const image = images.pop();
        if(image) {
          mediaElement = new Image();
          src = image.src;
          mover.append(mediaElement);
        } else {
          const el = target.querySelector('.avatar[data-color]');
          if(el) {
            const el2 = el.cloneNode(true);
            el2.textContent = '';
            aspecter.append(el2);
          }
        }
        /* mediaElement = new Image();
        src = target.style.backgroundImage.slice(5, -2); */
      } else if(target instanceof HTMLImageElement) {
        mediaElement = new Image();
        src = target.src;
      } else if(target instanceof HTMLVideoElement) {
        mediaElement = createVideo({middleware: mover.middlewareHelper.get()});
        mediaElement.src = target.src;
      } else if(target instanceof SVGSVGElement) {
        const clipId = target.dataset.clipId;
        const newClipId = clipId + '-mv';

        const {width, height} = containerRect;

        const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
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
          const br: [number, number, number, number] = borderRadius.split(' ').map((v) => parseInt(v)) as any;
          if(isOut) d = generatePathData(0, 0, width - 9 / scaleX, height, ...br);
          else d = generatePathData(9 / scaleX, 0, width - 9 / scaleX, height, ...br);
          path.setAttributeNS(null, 'd', d);
        }

        const foreignObject = newSvg.lastElementChild;
        foreignObject.setAttributeNS(null, 'width', '' + containerRect.width);
        foreignObject.setAttributeNS(null, 'height', '' + containerRect.height);

        mover.prepend(newSvg);
      } else if(target instanceof HTMLCanvasElement) {
        mediaElement = target;
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

      this.toggleWholeActive(false);

      // return ret;

      setTimeout(() => {
        mover.style.borderRadius = borderRadius;

        if(mover.firstElementChild) {
          (mover.firstElementChild as HTMLElement).style.borderRadius = borderRadius;
        }
      }, delay / 2);

      setTimeout(() => {
        mover.replaceChildren();
        mover.classList.remove('moving', 'active', 'hiding');
        mover.style.cssText = 'display: none;';

        deferred.resolve();
      }, delay);

      mover.classList.remove('opening');

      return ret;
    }

    mover.classList.add('opening');

    // await new Promise((resolve) => setTimeout(resolve, 0));
    // await new Promise((resolve) => window.requestAnimationFrame(resolve));
    // * одного RAF'а недостаточно, иногда анимация с одним не срабатывает (преимущественно на мобильных)
    await doubleRaf();

    // чтобы проверить установленную позицию - раскомментировать
    // throw '';

    // await new Promise((resolve) => setTimeout(resolve, 5e3));

    mover.style.transform = `translate3d(${containerRect.left}px,${containerRect.top}px,0) scale3d(1,1,1)`;
    // mover.style.transform = `translate(-50%,-50%) scale(1,1)`;
    needOpacity && (mover.style.opacity = ''/* closing ? '0' : '' */);

    if(aspecter) {
      this.setFullAspect(aspecter, containerRect, rect);
    }

    // throw '';

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

        // aspecter.classList.remove('disable-hover');
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

  protected toggleWholeActive(active: boolean) {
    if(active) {
      this.wholeDiv.classList.add('active');
    } else {
      this.wholeDiv.classList.add('backwards');
      setTimeout(() => {
        this.wholeDiv.classList.remove('active');
      }, 0);
    }
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

    // this.log('will set style aspecter:', `width: ${width}px; height: ${height}px; transform: scale(${containerRect.width / width}, ${containerRect.height / height});`);

    aspecter.style.cssText = `width: ${width}px; height: ${height}px; transform: scale3d(${containerRect.width / width}, ${containerRect.height / height}, 1);`;
    // }
  }

  protected sizeTailPath(path: SVGPathElement, rect: DOMRect, scaleX: number, delay: number, upscale: boolean, isOut: boolean, borderRadius: string) {
    const start = Date.now();
    const {width, height} = rect;
    delay = delay / 2;

    const br = borderRadius.split(' ').map((v) => parseInt(v));

    const step = () => {
      const diff = Date.now() - start;

      let progress = delay ? diff / delay : 1;
      if(progress > 1) progress = 1;
      if(upscale) progress = 1 - progress;

      const _br: [number, number, number, number] = br.map((v) => v * progress) as any;

      let d: string;
      if(isOut) d = generatePathData(0, 0, width - (9 / scaleX * progress), height, ..._br);
      else d = generatePathData(9 / scaleX * progress, 0, width/* width - (9 / scaleX * progress) */, height, ..._br);
      path.setAttributeNS(null, 'd', d);

      if(diff < delay) fastRaf(step);
    };

    // window.requestAnimationFrame(step);
    step();
  }

  protected removeCenterFromMover(mover: HTMLElement) {
    if(mover.classList.contains('center')) {
      // const rect = mover.getBoundingClientRect();
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

    // mover.classList.remove('active');
    mover.classList.add('moving');

    if(mover.dataset.timeout) { // и это тоже всё из-за скейла видео, так бы это не нужно было
      clearTimeout(+mover.dataset.timeout);
    }

    const rect = mover.getBoundingClientRect();

    const newTransform = mover.style.transform.replace(/translate3d\((.+?),/, (match, p1) => {
      const x = toLeft ? -rect.width : windowW;
      // const x = toLeft ? -(rect.right + (rect.width / 2)) : windowW / 2;

      return match.replace(p1, x + 'px');
    });

    // //////this.log('set newTransform:', newTransform, mover.style.transform, toLeft);
    mover.style.transform = newTransform;

    setTimeout(() => {
      mover.middlewareHelper.destroy();
      mover.remove();
    }, 350);
  }

  protected setNewMover() {
    const newMover = document.createElement('div');
    newMover.classList.add('media-viewer-mover');
    newMover.style.display = 'none';
    newMover.middlewareHelper = this.middlewareHelper.get().create();

    if(this.content.mover) {
      const oldMover = this.content.mover;
      oldMover.parentElement.append(newMover);
    } else {
      this.moversContainer.append(newMover);
    }

    return this.content.mover = newMover;
  }

  protected updateMediaSource(target: HTMLElement, url: string, tagName: 'video' | 'img') {
    // if(target instanceof SVGSVGElement) {
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

      if((el as HTMLImageElement).getAttribute('src') !== url) {
        renderImageFromUrl(el, url);
      }

      // ! костыль, но он тут даже и не нужен
      if(el.classList.contains('thumbnail') && el.parentElement.classList.contains('media-container-aspecter')) {
        el.classList.remove('thumbnail');
      }
    }
    /* } else {

    } */
  }

  protected setAuthorInfo(fromId: PeerId | string, timestamp: number) {
    const isPeerId = fromId.isPeerId();
    let wrapTitlePromise: Promise<HTMLElement> | HTMLElement;
    if(isPeerId) {
      wrapTitlePromise = wrapPeerTitle({
        peerId: fromId as PeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      })
    } else {
      const title = wrapTitlePromise = document.createElement('span');
      title.append(wrapEmojiText(fromId));
      title.classList.add('peer-title');
    }

    const oldAvatar = this.author.avatarEl;
    const oldAvatarMiddlewareHelper = this.author.avatarMiddlewareHelper;
    const newAvatar = this.author.avatarEl = avatarNew({
      middleware: (this.author.avatarMiddlewareHelper = this.middlewareHelper.get().create()).get(),
      size: 44,
      peerId: fromId as PeerId || NULL_PEER_ID,
      peerTitle: isPeerId ? undefined : '' + fromId
    });

    newAvatar.node.classList.add(MEDIA_VIEWER_CLASSNAME + '-userpic');

    return Promise.all([
      newAvatar.readyThumbPromise,
      wrapTitlePromise
    ]).then(([_, title]) => {
      replaceContent(this.author.date, this.live ? i18n('Rtmp.MediaViewer.Streaming') : formatFullSentTime(timestamp));
      replaceContent(this.author.nameEl, title);

      if(oldAvatar?.node && oldAvatar.node.parentElement) {
        oldAvatar.node.replaceWith(this.author.avatarEl.node);
      } else {
        this.author.container.prepend(this.author.avatarEl.node);
      }

      if(oldAvatar) {
        oldAvatar.node.remove();
        oldAvatarMiddlewareHelper.destroy();
      }
    });
  }

  protected get mediaBoxSize(): MediaSize {
    const {width, height} = windowSize;
    return new MediaSize(
      width,
      height - 120 - (mediaSizes.isMobile || this.live ? 0 : 120) - this.extraHeightPadding
    );
  }

  protected removeQualityOptions() {
    this.downloadQualityMenuOptions.splice(0);
  }

  protected async loadQualityLevelsDownloadOptions(doc: MyDocument) {
    this.removeQualityOptions();

    const altDocs = await this.managers.appDocsManager.getAltDocsByDocument(doc.id);
    if(!altDocs) return;

    const qualityEntries = getQualityFilesEntries(altDocs);
    if(!qualityEntries.length) return;

    const availableHeights = Array.from(new Set(qualityEntries.map((entry) => snapQualityHeight(entry.h))))
    .sort((a, b) => b - a);

    const filteredEntries = availableHeights.map((height) => {
      let chosenEntry: (typeof qualityEntries)[number];
      for(const entry of qualityEntries) {
        if(snapQualityHeight(entry.h) !== height) continue;
        if(!chosenEntry || entry.bandwidth < chosenEntry.bandwidth) chosenEntry = entry;
      }
      return chosenEntry;
    });

    if(filteredEntries.length <= 1) return;

    const options: ButtonMenuItemOptionsVerifiable[] = await Promise.all(filteredEntries.map(async(entry) => {
      const doc = await this.managers.appDocsManager.getDoc(entry.id);
      const snappedHeight = snapQualityHeight(entry.h);

      return ({
        regularText: ButtonMenuItemWithAuxiliaryText(`Hls.SaveIn${snappedHeight}`, formatBytes(doc.size, 1)) as HTMLElement,
        onClick: (e) => {
          this.onDownloadClick(e, entry.id);
        }
      });
    }));

    this.downloadQualityMenuOptions.push(...options);
  }

  protected async _openMedia({
    media,
    mediaThumbnail,
    timestamp,
    fromId,
    fromRight,
    target,
    reverse = false,
    prevTargets = [],
    nextTargets = [],
    message,
    mediaTimestamp,
    setupPlayer,
    onCanPlay,
    onMoverSet,
    onBuffering,
    noAuthor
  }: {
    media: MyDocument | MyPhoto | InputGroupCall,
    mediaThumbnail?: string,
    timestamp: number,
    fromId: PeerId | string,
    fromRight: number,
    target?: HTMLElement,
    reverse?: boolean,
    prevTargets?: TargetType[],
    nextTargets?: TargetType[],
    message?: MyMessage,
    mediaTimestamp?: number,
    setupPlayer?: (video: VideoPlayer, readyPromise: Promise<any>) => void,
    onCanPlay?: () => void,
    onMoverSet?: () => void,
    onBuffering?: () => void,
    noAuthor?: boolean
    /* , needLoadMore = true */
  }) {
    if(this.setMoverPromise) return this.setMoverPromise;

    const setAuthorPromise = noAuthor ? Promise.resolve() : this.setAuthorInfo(fromId, timestamp);

    const isLiveStream = media._ === 'inputGroupCall';
    const isDocument = media._ === 'document';
    const isVideo = isDocument && media.mime_type && ((['video', 'gif'] as MyDocument['type'][]).includes(media.type) || media.mime_type.indexOf('video/') === 0);
    let isHlsStream: boolean;

    this.log('openMedia', media, fromId, prevTargets, nextTargets, isLiveStream, isDocument, isVideo);

    this.live = isLiveStream;

    if(this.isFirstOpen) {
      // this.targetContainer = targetContainer;
      // this.needLoadMore = needLoadMore;
      this.isFirstOpen = false;
      this.listLoader.setTargets(prevTargets, nextTargets, reverse);
      (window as any).appMediaViewer = this;
      // this.loadMore = loadMore;
    }

    if(this.listLoader.next.length < 10) {
      setTimeout(() => {
        this.listLoader.load(true);
      }, 0);
    }

    // if(prevTarget && (!prevTarget.parentElement || !this.isElementVisible(this.targetContainer, prevTarget))) prevTarget = null;
    // if(nextTarget && (!nextTarget.parentElement || !this.isElementVisible(this.targetContainer, nextTarget))) nextTarget = null;

    this.buttons.prev.classList.toggle('hide', !this.listLoader.previous.length);
    this.buttons.next.classList.toggle('hide', !this.listLoader.next.length);

    const container = this.content.media;
    const useContainerAsTarget = !target || target === container;
    if(useContainerAsTarget) target = container;

    this.target = {element: target} as any;
    const tempId = ++this.tempId;

    if(container.firstElementChild) {
      container.replaceChildren();
    }

    let changeQualityOptionsPromise: Promise<void>;
    if(media._ === 'document')
      changeQualityOptionsPromise = this.loadQualityLevelsDownloadOptions(media);
    else
      changeQualityOptionsPromise = Promise.resolve(this.removeQualityOptions());

    const wasActive = fromRight !== 0;
    if(wasActive) {
      this.moveTheMover(this.content.mover, fromRight === 1);
      this.setNewMover();
    } else {
      this.navigationItem = {
        type: 'media',
        onPop: (canAnimate) => {
          if(this.setMoverAnimationPromise) {
            return false;
          }

          if(!canAnimate && IS_MOBILE_SAFARI) {
            this.wholeDiv.remove();
          }

          this.close();
        }
      };

      appNavigationController.pushItem(this.navigationItem);

      this.toggleOverlay(true);
      this.setGlobalListeners();
      await setAuthorPromise;

      if(!this.wholeDiv.parentElement) {
        document.body.append(this.wholeDiv);
        void this.wholeDiv.offsetLeft; // reflow
      }

      this.toggleWholeActive(true);
    }

    const mover = this.content.mover;

    const mediaBoxSize = this.mediaBoxSize;
    const mediaSize: MediaSize = isLiveStream ? new MediaSize(1080, 608) : undefined;
    let thumbPromise: Promise<any> = Promise.resolve();
    const size = setAttachmentSize(isLiveStream ? {
      boxWidth: mediaBoxSize.width,
      boxHeight: mediaBoxSize.height,
      element: container,
      size: mediaSize
    } : {
      photo: media,
      element: container,
      boxWidth: mediaBoxSize.width,
      boxHeight: mediaBoxSize.height,
      noZoom: mediaSizes.isMobile ? false : true,
      pushDocumentSize: !!(isDocument && media.w && media.h)
    }).photoSize;
    if(useContainerAsTarget && !isLiveStream) {
      const cacheContext = await this.managers.thumbsStorage.getCacheContext(media, size?.type);
      let img: HTMLImageElement | HTMLCanvasElement;
      if(cacheContext.downloaded) {
        img = new Image();
        img.src = cacheContext.url;
      } else {
        const gotThumb = getMediaThumbIfNeeded({
          photo: media,
          cacheContext,
          useBlur: true,
          onlyStripped: true
        });
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

    if(isLiveStream) {
      if(mediaThumbnail) {
        const img = new Image();
        img.classList.add('thumbnail');
        container.append(img);
        await renderImageFromUrlPromise(img, mediaThumbnail, false);
      } else {
        const avatar = avatarNew({
          middleware: this.middlewareHelper.get(),
          peerId: fromId.toPeerId(),
          size: 'full'
        });
        avatar.node.classList.add('thumbnail-avatar');
        container.append(avatar.node);
        await avatar.readyThumbPromise;
      }
    }

    // need after setAttachmentSize
    /* if(useContainerAsTarget) {
      target = target.querySelector('img, video') || target;
    } */

    const supportsStreaming: boolean = !!(isDocument && media.supportsStreaming);
    const preloader = isLiveStream ? undefined : supportsStreaming ? this.preloaderStreamable : this.preloader;

    const getCacheContext = (type = size?.type) => {
      if(isLiveStream) return {url: getRtmpStreamUrl(media)};
      if(isHlsStream) return {url: getDocumentURL(media as MyDocument, {supportsHlsStreaming: true})};
      return this.managers.thumbsStorage.getCacheContext(media, type);
    };

    let setMoverPromise: Promise<void>;
    if(isVideo || isLiveStream) {
      const middleware = mover.middlewareHelper.get();
      // потому что для safari нужно создать элемент из event'а
      const useController = /* isLiveStream ||  */message && (media as MyDocument).type !== 'gif';
      const video = /* useController ?
        appMediaPlaybackController.addMedia(message, false, true) as HTMLVideoElement :
         */createVideo({pip: useController || isLiveStream, middleware});

      if(isLiveStream) {
        video.ignoreLeak = true;
      }

      if(this.wholeDiv.classList.contains('no-forwards') || isLiveStream) {
        video.addEventListener('contextmenu', cancelEvent);
      }

      const set = () => this.setMoverToTarget(target, false, fromRight).then(({onAnimationEnd}) => {
      // return; // set and don't move
      // if(wasActive) return;
        // return;

        isHlsStream = this.hasQualityOptions;

        onMoverSet?.();

        const div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;

        const moverThumbVideo = mover.querySelector('video');
        moverThumbVideo?.remove();

        video.setAttribute('playsinline', 'true');

        // if(IS_SAFARI) {
        // test stream
        // video.controls = true;
        video.autoplay = true;
        // }

        if(media._ === 'inputGroupCall') {
          video.autoplay = true;
        } else if(media.type === 'gif') {
          video.muted = true;
          video.autoplay = true;
          video.loop = true;
        } else if(media.duration < 60) {
          video.loop = true;
        }

        if(mediaTimestamp !== undefined) {
          setCurrentTime(video, mediaTimestamp);
        }

        // * don't remove
        div.append(video);

        const canPlayThrough = new Promise((resolve) => {
          video.addEventListener('canplay', resolve, {once: true});
        });

        const setSingleMedia = () => {
          if(isLiveStream) {
            // this.releaseSingleMedia = appMediaPlaybackController.setSingleMedia();
          } else {
            this.releaseSingleMedia = appMediaPlaybackController.setSingleMedia({
              media: video,
              message: message as Message.message
            });
          }
        };

        const createPlayer = async() => {
          if((media as MyDocument).type === 'gif') {
            return;
          }

          const readyPromise = Promise.all([canPlayThrough, onAnimationEnd]);
          if(!isLiveStream) { // should display interface for live streams instantly
            await readyPromise;
            if(this.tempId !== tempId) {
              return;
            }
          }

          // const play = useController ? appMediaPlaybackController.willBePlayedMedia === video : true;
          const play = !isLiveStream;
          const player = this.videoPlayer = new VideoPlayer({
            videoTimestamps: this.videoTimestamps,
            video,
            play,
            streamable: supportsStreaming,
            live: isLiveStream,
            width: mediaSize?.width,
            height: mediaSize?.height,
            onPlaybackRateMenuToggle: (open) => {
              this.wholeDiv.classList.toggle('hide-caption', !!open);
            },
            onPip: (pip) => {
              const otherMediaViewer = (window as any).appMediaViewer;
              if(!pip && otherMediaViewer && otherMediaViewer !== this) {
                this.releaseSingleMedia = undefined;
                this.close();
                return;
              }

              const mover = this.moversContainer.lastElementChild as HTMLElement;
              mover.classList.toggle('in-pip', pip);
              this.toggleWholeActive(!pip);
              this.toggleOverlay(!pip);
              this.toggleGlobalListeners(!pip);

              if(this.navigationItem) {
                if(pip) appNavigationController.removeItem(this.navigationItem);
                else appNavigationController.pushItem(this.navigationItem);
              }

              if(useController) {
                if(pip) {
                  // appMediaPlaybackController.toggleSwitchers(true);

                  this.releaseSingleMedia?.(false);
                  this.releaseSingleMedia = undefined;

                  appMediaPlaybackController.setPictureInPicture(video);
                } else {
                  setSingleMedia();
                }
              }
            },
            onPipClose: () => {
              // this.target = undefined;
              // this.toggleWholeActive(false);
              // this.toggleOverlay(false);
              this.close();
            },
            listenKeyboardEvents: 'always',
            useGlobalVolume: 'auto'
          });
          this.videoPlayer?.loadQualityLevels();

          player.addEventListener('toggleControls', (show) => {
            this.wholeDiv.classList.toggle('has-video-controls', show);
          });

          this.addEventListener('setMoverBefore', () => {
            this.wholeDiv.classList.remove('has-video-controls');
            this.videoPlayer.cleanup();
            this.videoPlayer = undefined;
          }, {once: true});

          if(this.isZooming) {
            this.videoPlayer.lockControls(false);
          } else if(isLiveStream) {
            this.videoPlayer.lockControls(true);
          }

          setupPlayer?.(this.videoPlayer, readyPromise);
        };

        if(supportsStreaming || isLiveStream) {
          let attachedCanPlay = false, buffering = false;

          const _onBuffering = (noCanPlay?: boolean) => {
            if(buffering) {
              return;
            }

            buffering = true;
            onBuffering?.();
            !noCanPlay && attachCanPlay();
            preloader?.attach(mover, true);

            // поставлю класс для плеера, чтобы убрать большую иконку пока прелоадер на месте
            video.parentElement.classList.add('is-buffering');
          };

          onAnimationEnd.then(() => {
            if(video.readyState < video.HAVE_FUTURE_DATA) {
              _onBuffering(true);
            }
          });

          const attachCanPlay = () => {
            if(attachedCanPlay) {
              return;
            }

            attachedCanPlay = true;
            video.addEventListener('canplay', () => {
              attachedCanPlay = false;
              buffering = false;
              onCanPlay?.();
              preloader?.detach();
              video.parentElement.classList.remove('is-buffering');

              if(!this.isZooming) {
                this.videoPlayer?.lockControls(undefined);
              }
            }, {once: true});
          };

          video.addEventListener('waiting', () => {
            const loading = video.networkState === video.NETWORK_LOADING;
            const isntEnoughData = video.readyState < video.HAVE_FUTURE_DATA;

            // this.log('video waiting for progress', loading, isntEnoughData);
            if(loading && isntEnoughData) {
              _onBuffering();
            }
          });

          if(this.wholeDiv.classList.contains('no-forwards')) {
            video.addEventListener('contextmenu', (e) => {
              cancelEvent(e);
            });
          }

          attachCanPlay();
        }

        // if(!video.src || media.url !== video.src) {
        const load = async() => {
          /* if(useController) {
              appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid, message.pFlags.is_scheduled);
            } */

          const promise: Promise<any> = supportsStreaming || isLiveStream ? Promise.resolve() : appDownloadManager.downloadMediaURL({media});

          if(!supportsStreaming) {
            onAnimationEnd.then(async() => {
              if(!(await getCacheContext()).url) {
                preloader?.attach(mover, true, promise);
              }
            });
          }

          Promise.all([
            promise,
            isLiveStream ? undefined : onAnimationEnd
          ]).then(async() => {
            if(this.tempId !== tempId) {
              this.log.warn('media viewer changed video');
              return;
            }

            const url = (await getCacheContext()).url;

            const onError = (e: ErrorEvent) => {
              if(shouldIgnoreVideoError(e) || isLiveStream) {
                return;
              }

              toastNew({
                langPackKey: IS_MOBILE ? 'Video.Unsupported.Mobile' : 'Video.Unsupported.Desktop'
              });

              const error = video.error;
              if(error && error.code !== 4) {
                this.log.error('Error ' + error.code + '; details: ' + error.message);
              }

              preloader?.detach();
            };

            const onMediaLoadPromise = onMediaLoad(video);
            if(!isLiveStream) {
              handleVideoLeak(video, onMediaLoadPromise).catch(onError);
            }

            video.addEventListener('error', onError, {once: true});
            middleware.onClean(() => {
              video.removeEventListener('error', onError);
            });

            if(target instanceof SVGSVGElement/*  && (video.parentElement || !isSafari) */) { // if video exists
              // if(!video.parentElement) {
              div.firstElementChild.lastElementChild.append(video);
              // }
            } else {
              renderImageFromUrl(video, url);
              this.videoPlayer?.loadQualityLevels();
            }

            // * have to set options (especially playbackRate) after src
            // * https://github.com/videojs/video.js/issues/2516
            if(useController) {
              setSingleMedia();

              this.addEventListener('setMoverBefore', () => {
                this.releaseSingleMedia?.();
                this.releaseSingleMedia = undefined;
              }, {once: true});
            }

            this.updateMediaSource(target, url, 'video');

            if(isLiveStream) {
              createPlayer();
            } else onMediaLoadPromise.then(() => {
              createPlayer();
            });
          });

          return promise;
        };

        this.lazyLoadQueue.unshift({load});
        // } else createPlayer();
      });

      setMoverPromise = Promise.all([thumbPromise, changeQualityOptionsPromise]).then(set);
    } else {
      const set = () => this.setMoverToTarget(target, false, fromRight).then(({onAnimationEnd}) => {
      // return; // set and don't move
      // if(wasActive) return;
        // return;

        const load = async() => {
          const cancellablePromise = isDocument ? appDownloadManager.downloadMediaURL({media}) : appDownloadManager.downloadMediaURL({media, thumb: size});

          const photoSizes = !isDocument && media.sizes.slice().filter((size) => (size as PhotoSize.photoSize).w) as PhotoSize.photoSize[];
          photoSizes && photoSizes.sort((a, b) => b.size - a.size);
          const fullPhotoSize = photoSizes?.[0];
          const cancellableFullPromise = !isDocument && fullPhotoSize !== size && appDownloadManager.downloadMediaURL({media, thumb: fullPhotoSize});

          onAnimationEnd.then(async() => {
            if(!(await getCacheContext()).url) {
              this.preloader.attachPromise(cancellablePromise);
              // this.preloader.attach(mover, true, cancellablePromise);
            }
          });

          Promise.all([onAnimationEnd, cancellablePromise]).then(async() => {
            if(this.tempId !== tempId) {
              this.log.warn('media viewer changed photo');
              return;
            }

            const url = (await getCacheContext()).url;
            if(target instanceof SVGSVGElement) {
              this.updateMediaSource(target, url, 'img');
              this.updateMediaSource(mover, url, 'img');

              if(mediaSizes.isMobile) {
                const imgs = mover.querySelectorAll('img');
                imgs.forEach((img) => {
                  img.classList.remove('thumbnail'); // может здесь это вообще не нужно
                });
              }
            } else {
              const div = mover.firstElementChild && mover.firstElementChild.classList.contains('media-viewer-aspecter') ? mover.firstElementChild : mover;
              const haveImage = ['CANVAS', 'IMG'].includes(div.firstElementChild?.tagName) ? div.firstElementChild as HTMLElement : null;
              if((haveImage as HTMLImageElement)?.src !== url)  {
                const image = new Image();
                image.classList.add('thumbnail');

                renderImageFromUrl(image, url, () => {
                  fastRaf(() => {
                    this.updateMediaSource(target, url, 'img');

                    if(haveImage) {
                      fastRaf(() => {
                        haveImage.remove();
                      });
                    }

                    div.append(image);
                  });
                }, false);

                cancellableFullPromise && cancellableFullPromise.then((url) => {
                  const fullImage = new Image();
                  fullImage.classList.add('thumbnail');
                  renderImageFromUrl(fullImage, url, () => {
                    fastRaf(() => {
                      image.replaceWith(fullImage);
                    });
                  }, false);
                });
              }
            }

            // this.preloader.detach();
          }).catch((err) => {
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
