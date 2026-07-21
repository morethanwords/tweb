// * zoom part from WebZ
// * https://github.com/Ajaxy/telegram-tt/blob/069f4f5b2f2c7c22529ccced876842e7f9cb81f4/src/components/mediaViewer/MediaViewerSlides.tsx

import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';
import deferredPromise from '@helpers/cancellablePromise';
import mediaSizes from '@helpers/mediaSizes';
import calcImageInBox from '@helpers/calcImageInBox';
import IS_TOUCH_SUPPORTED from '@environment/touchSupport';
import {IS_MOBILE, IS_MOBILE_SAFARI, IS_SAFARI} from '@environment/userAgent';
import {logger} from '@lib/logger';
import VideoPlayer from '@lib/mediaPlayer';
import rootScope from '@lib/rootScope';
import animationIntersector from '@components/animationIntersector';
import appMediaPlaybackController, {AppMediaPlaybackController} from '@components/appMediaPlaybackController';
import ButtonIcon from '@components/buttonIcon';
import {ButtonMenuItemOptions, ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import ProgressivePreloader from '@components/preloader';
import SwipeHandler, {ZoomDetails} from '@components/swipeHandler';
import {formatFullSentTime} from '@helpers/date';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {InputGroupCall, Message, MessageMedia, PhotoSize} from '@layer';
import findUpClassName from '@helpers/dom/findUpClassName';
import renderImageFromUrl, {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {getAppWindow, getOverlayRoot} from '@helpers/appWindow';
import getVisibleRect from '@helpers/dom/getVisibleRect';
import cancelEvent from '@helpers/dom/cancelEvent';
import generatePathData from '@helpers/generatePathData';
import replaceContent from '@helpers/dom/replaceContent';
import {doubleRaf, fastRaf} from '@helpers/schedulers';
import RangeSelector from '@components/rangeSelector';
import windowSize from '@helpers/windowSize';
import ListLoader from '@helpers/listLoader';
import EventListenerBase from '@helpers/eventListenerBase';
import {MyMessage} from '@appManagers/appMessagesManager';
import {NULL_PEER_ID} from '@appManagers/constants';
import {isFullScreen} from '@helpers/dom/fullScreen';
import {attachClickEvent, hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';
import SearchListLoader from '@helpers/searchListLoader';
import createVideo from '@helpers/dom/createVideo';
import {AppManagers} from '@lib/managers';
import getMediaThumbIfNeeded from '@helpers/getStrippedThumbIfNeeded';
import setAttachmentSize from '@helpers/setAttachmentSize';
import wrapEmojiText from '@richTextProcessor/wrapEmojiText';
import LazyLoadQueueBase from '@components/lazyLoadQueueBase';
import overlayCounter from '@helpers/overlayCounter';
import appDownloadManager from '@lib/appDownloadManager';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {toastNew} from '@components/toast';
import clamp from '@helpers/number/clamp';
import debounce from '@helpers/schedulers/debounce';
import isBetween from '@helpers/number/isBetween';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import liteMode from '@helpers/liteMode';
import {avatarNew, findUpAvatar} from '@components/avatarNew';
import {Middleware, MiddlewareHelper, getMiddleware} from '@helpers/middleware';
import onMediaLoad, {shouldIgnoreVideoError} from '@helpers/onMediaLoad';
import handleVideoLeak from '@helpers/dom/handleVideoLeak';
import Icon from '@components/icon';
import {replaceButtonIcon} from '@components/button';
import setCurrentTime from '@helpers/dom/setCurrentTime';
import {MediaSize} from '@helpers/mediaSize';
import {getRtmpStreamUrl} from '@lib/rtmp/url';
import boxBlurCanvasRGB from '@vendor/fastBlur';
import {i18n} from '@lib/langPack';
import {getQualityFilesEntries} from '@lib/hls/createHlsVideoSource';
import {snapQualityHeight} from '@lib/hls/snapQualityHeight';
import {ButtonMenuItemWithAuxiliaryText} from '@lib/mediaPlayer/qualityLevelsSwitchButton';
import formatBytes from '@helpers/formatBytes';
import getMediaViewerClipPath from '@components/mediaViewer/clipPath';
import getMediaViewerSnapshotSize from '@components/mediaViewer/snapshotSize';
import getDocumentURL from '@appManagers/utils/docs/getDocumentURL';
import assumeType from '@helpers/assumeType';
import {createRoot, createResource, createEffect, createMemo} from 'solid-js';
import readBlobAsText from '@helpers/blob/readBlobAsText';
import {Storyboard, StoryboardFrame} from '@lib/mediaPlayer/preview';
import apiManagerProxy from '@lib/apiManagerProxy';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';

const ZOOM_STEP = 0.5;
const ZOOM_INITIAL_VALUE = 1;
const ZOOM_MIN_VALUE = 0.5;
const ZOOM_MAX_VALUE = 4;

const OPEN_TRANSITION_TIME = 200;
const MOVE_TRANSITION_TIME = 350;
const USE_MEDIA_VIEWER_CLIP_PATH = true;
const NO_MEDIA_VIEWER_CLIP_PATH = 'inset(0px)';

// Vertical reserves around the media (px). Single source of truth for layout —
// mediaBoxSize math and the inline positioning applied by applyCenterStyles /
// applyLayoutVariables are derived from these. Same reserves apply to live
// streams and regular videos — chrome (topbar / controls) behaves identically.
const RESERVE_TOP_DESKTOP = 80;
const RESERVE_BOTTOM_DESKTOP = 110;
// On mobile the player fills the whole viewport (no reserve); topbar/controls
// float over the media and auto-hide together.
const RESERVE_TOP_MOBILE = 0;
const RESERVE_BOTTOM_MOBILE = 0;

// Min displayed width for videos that get a player UI.
const VIDEO_MIN_WIDTH = 420;

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

function prepareStoryboard({
  message,
  middleware
}: {
  message?: Message.message,
  middleware: Middleware
}) {
  if(!message?.media) {
    return;
  }

  const altDocuments = (message.media as MessageMedia.messageMediaDocument).alt_documents as MyDocument[] || [];
  const mapDoc = altDocuments.find((d) => d.mime_type === 'application/x-tgstoryboardmap');
  if(!mapDoc) {
    return;
  }

  const docId = mapDoc.file_name.split(':')[1];
  const doc = altDocuments.find((d) => d.id === docId);

  if(!doc) {
    return;
  }

  return createRoot((dispose) => {
    middleware.onClean(dispose);
    const [imageFileURL] = createResource(doc, () => {
      return appDownloadManager.downloadMediaURL({media: doc});
    });

    const [image] = createResource(imageFileURL, async(url) => {
      if(!url) {
        return;
      }

      const image = new Image();
      await renderImageFromUrlPromise(image, url, false);
      return image;
    });

    const [mapFile] = createResource(mapDoc, () => {
      return appDownloadManager.downloadMedia({media: mapDoc});
    });

    const [map] = createResource(mapFile, async(file) => {
      if(!file) {
        return;
      }

      const text = await readBlobAsText(file);
      const lines = text.split('\n');
      const fileNameLine = lines.shift();
      const frameWidth = +lines.shift().split('=').pop();
      const frameHeight = +lines.shift().split('=').pop();
      if(!lines[lines.length - 1].trim()) {
        lines.pop();
      }
      const frames: StoryboardFrame[] = lines.map((line) => {
        const [time, left, top] = line.split(',').map(Number);
        return {time, left, top};
      });
      return {frameWidth, frameHeight, frames};
    });

    const storyboard = createMemo<Storyboard>(() => {
      const image$ = image();
      const map$ = map();
      return image$ && map$ ? {
        image: image$,
        ...map$
      } : undefined;
    });

    return storyboard;
  });
}

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
  protected buttons: {[k in 'download' | 'close' | 'prev' | 'next' | 'mobile-close' | 'zoomin' | 'rotate' | ButtonsAdditionType]: HTMLElement} = {} as any;
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
  private moverTransitionCancels = new WeakMap<HTMLElement, () => void>();

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
  // Accumulated rotation in degrees (multiples of 90, counterclockwise = negative).
  // Lives on moversContainer alongside the zoom/pan transform; reset per media.
  protected rotation: number = 0;
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

    topButtons.concat(['download', 'rotate', 'zoomin', 'close']).forEach((name) => {
      // The rotate button turns the image counterclockwise (matching Telegram
      // Desktop), so it carries the left-pointing glyph while keeping the plain
      // `rotate` key in this.buttons.
      const icon: Icon = name === 'rotate' ? 'rotate_left' : name as Icon;
      const button = ButtonIcon(icon, {noRipple: true});
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

    attachClickEvent(this.buttons.rotate, () => this.rotateMedia());

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

    // Keep the controls hidden if still rotated even when zoom turns off.
    this.updateVideoControlsLock();
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

    // Pan/zoom act on the rotated+refit box in screen space, so the boundaries are
    // computed from that box (= initialContentRect when unrotated).
    const rect = this.getDisplayRect();
    const minX = Math.max(-rect.left * scale, centerX);
    const maxX = windowSize.width - rect.right * scale;

    const minY = Math.max(-rect.top * scale + offsetTop, centerY);
    const maxY = windowSize.height - rect.bottom * scale;

    return {minX, maxX, minY, maxY};
  }

  protected setZoomValue = (value = this.transform.scale) => {
    this.initialContentRect ??= this.content.media.getBoundingClientRect();

    // this.zoomValue = value;
    if(value === ZOOM_INITIAL_VALUE) {
      this.transform.x = 0;
      this.transform.y = 0;
    }

    this.applyMoversTransform(value);

    this.zoomElements.btnOut.classList.toggle('inactive', value <= ZOOM_MIN_VALUE);
    this.zoomElements.btnIn.classList.toggle('inactive', value >= ZOOM_MAX_VALUE);

    this.toggleZoom(value !== ZOOM_INITIAL_VALUE);
  };

  protected applyMoversTransform(scaleValue = this.transform.scale) {
    this.moversContainer.style.transform = this.buildMoversTransform(scaleValue);
  }

  // Composes the moversContainer transform. Order matters: zoom/pan (origin 0 0)
  // are the OUTER (screen-space) transforms and the rotate+orientation-refit is the
  // INNER one, applied to the media around its own center. Keeping pan/zoom in
  // screen space means a drag maps straight to the on-screen axes even when rotated
  // (so a sideways→horizontal photo pans left-right, not up-down) and the boundary
  // math only needs the rotated bounding box (getDisplayRect). The rotate wrapper is
  // ALWAYS emitted (identity when rotation is 0 — the translate(C)…translate(-C)
  // pair cancels through it at every interpolation step, so a zoom is animated and
  // rendered exactly as before) so that the FIRST turn interpolates the transform
  // function-by-function instead of matrix-decomposing from a bare zoom (which slid
  // the image off before settling).
  protected buildMoversTransform(scaleValue = this.transform.scale) {
    const {x, y} = this.transform;
    const fit = this.getRotationFitScale();
    const {x: cx, y: cy} = this.getMediaCenter();
    return `translate3d(${x.toFixed(3)}px, ${y.toFixed(3)}px, 0px) scale(${scaleValue.toFixed(3)}) ` +
      `translate(${cx.toFixed(3)}px, ${cy.toFixed(3)}px) rotate(${this.rotation}deg) scale(${fit.toFixed(5)}) translate(${(-cx).toFixed(3)}px, ${(-cy).toFixed(3)}px)`;
  }

  // The media's center on screen at rest (pre zoom/pan). With the rotation applied
  // as the inner transform, this is the pivot the media turns around — constant, not
  // dependent on the current zoom/pan.
  protected getMediaCenter() {
    const rect = this.initialContentRect ?? this.content.media.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  // After a 90°/270° turn the media's bounding box has width/height swapped; scale
  // it so the rotated box fits (and fills) the available viewport in the new
  // orientation — same behaviour as Telegram Desktop. 0°/180° keep the box, so fit
  // is 1. Independent of zoom (zoom multiplies on top in screen space).
  protected getRotationFitScale(rotation = this.rotation) {
    const normalized = ((rotation % 360) + 360) % 360;
    if(normalized !== 90 && normalized !== 270) {
      return 1;
    }

    const rect = this.initialContentRect ?? this.content.media.getBoundingClientRect();
    const {width, height} = rect;
    if(!width || !height) {
      return 1;
    }

    const box = this.mediaBoxSize;
    return Math.min(box.width / height, box.height / width);
  }

  // The media's on-screen bounding box AFTER rotation + orientation-refit (still in
  // the pre-zoom frame). Pan/zoom apply to THIS box in screen space, so the zoom
  // boundaries derive from it directly. Unrotated → just initialContentRect.
  protected getDisplayRect(): DOMRectMinified & {width: number, height: number} {
    const rect = this.initialContentRect ?? this.content.media.getBoundingClientRect();
    if(!this.rotation) {
      return rect;
    }

    const normalized = ((this.rotation % 360) + 360) % 360;
    const swap = normalized === 90 || normalized === 270;
    const fit = this.getRotationFitScale();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const width = (swap ? rect.height : rect.width) * fit;
    const height = (swap ? rect.width : rect.height) * fit;
    return {
      left: cx - width / 2,
      right: cx + width / 2,
      top: cy - height / 2,
      bottom: cy + height / 2,
      width,
      height
    };
  }

  protected rotateMedia() {
    // Prime the transition ONLY on the first transform application (moversContainer
    // still on its CSS default, no inline transform): commit an identity-structured
    // transform so the first turn interpolates rotate/scale function-by-function
    // instead of matrix-decomposing from the bare default (which slid the image off
    // before settling). Once an inline transform exists (after any zoom/rotate) it's
    // already in that form — re-priming here would add `no-transition` mid-flight and
    // snap a still-animating turn to its target.
    if(!this.moversContainer.style.transform) {
      this.moversContainer.classList.add('no-transition');
      this.applyMoversTransform();
      void this.moversContainer.offsetLeft; // reflow to commit the primed state
      this.moversContainer.classList.remove('no-transition');
    }

    this.rotation -= 90; // counterclockwise, matching Telegram Desktop
    this.applyMoversTransform();
    this.updateVideoControlsLock();
  }

  // True when the media is visually turned (any non-360° multiple). −360° reads as
  // upright, so compare the normalized angle, not the raw accumulator.
  protected isRotated() {
    return (((this.rotation % 360) + 360) % 360) !== 0;
  }

  // A video's player chrome lives inside moversContainer, so it would scale/turn with
  // the frame. Mirror what zoom already does — lock the controls hidden while zoomed
  // OR rotated, restore auto-hide otherwise. (Keyboard controls keep working via the
  // player's `listenKeyboardEvents: 'always'`, so playback is still controllable.)
  protected updateVideoControlsLock() {
    if(!this.videoPlayer) {
      return;
    }

    this.videoPlayer.lockControls(this.isZooming || this.isRotated() ? false : undefined);
  }

  protected setBtnMenuToggle(buttons: ButtonMenuItemOptionsVerifiable[]) {
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
      this.revealHiddenFloatings();
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
    getAppWindow().removeEventListener('keydown', this.onKeyDown);
    getAppWindow().removeEventListener('keyup', this.onKeyUp);
    mediaSizes.removeEventListener('resize', this.applyLayoutVariables);
  }

  protected setGlobalListeners() {
    // Keyboard nav (arrows / space / Esc) on the active window — the viewer opens in whichever window
    // the app is in (the tab, or the Document PiP window); a main-`window` listener is dead in the PiP.
    getAppWindow().addEventListener('keydown', this.onKeyDown);
    getAppWindow().addEventListener('keyup', this.onKeyUp);
    mediaSizes.addEventListener('resize', this.applyLayoutVariables);
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

    // On mobile, media without player controls (photo/GIF) has no controls-toggle,
    // so a tap on it toggles the chrome (topbar + caption) itself — mirroring the
    // video controls toggle — instead of closing the viewer. Taps on the chrome /
    // menus keep their own handlers; drags are already filtered via ignoreNextClick.
    if(mediaSizes.isMobile && !this.videoPlayer && !findUpClassName(target, 'media-viewer-topbar') && !findUpClassName(target, 'media-viewer-caption') && !findUpClassName(target, 'btn-menu')) {
      this.wholeDiv.classList.toggle('chrome-hidden');
      return;
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
    // Regions that count as "clicked a control", so the click is NOT treated as a
    // background tap (which closes, or for a live stream goes to PiP — see below).
    // 'media-viewer-topbar' covers the whole top bar incl. the handheld close
    // button, which lives in .media-viewer-topbar-left (not .media-viewer-buttons)
    // and would otherwise be misread as a background tap → PiP on a live stream.
    const classNames = ['admin-popup-container', 'ckin__player', 'media-viewer-buttons', 'media-viewer-author', 'media-viewer-caption', 'zoom-container', 'media-viewer-topbar'];
    if(isZooming) {
      classNames.push('media-viewer-movers');
    }

    const hasClickedSomething = classNames.some((s) => !!findUpClassName(target, s));
    // Big-screen only: clicking the popup's empty overlay (outside the video zone,
    // controls and chrome) on a live stream minimises it to PiP instead of closing
    // — the same action as the dedicated PiP button, which the player only renders
    // on desktop (mediaPlayer: !IS_MOBILE). On handhelds there's no roomy backdrop
    // and no PiP button, so a background tap falls through to close() below.
    if(!hasClickedSomething && this.live && !mediaSizes.isMobile && document.pictureInPictureEnabled) {
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

    // Keep geometry reads ahead of source-overlay style writes. Hiding the floating
    // labels before getBoundingClientRect/getComputedStyle forced an extra style/layout
    // flush on the cold open path.
    const sourceTarget = target;

    const mover = this.content.mover;

    if(!closing) {
      mover.replaceChildren();
      // mover.append(this.buttons.prev, this.buttons.next);
    }

    const zoomValue = this.isZooming && closing ? this.transform.scale : ZOOM_INITIAL_VALUE;
    const zoomedClose = closing && zoomValue !== 1;
    // Closing while rotated needs the same moversContainer→mover transform transfer
    // as a zoomed close (below): moversContainer must end at identity for the
    // thumb-rect math to be in plain viewport coords.
    const closeRotation = closing ? this.rotation : 0;
    const rotatedClose = closeRotation !== 0;
    // Rotation pivot in the mover's OWN coords (its content center) — captured during
    // the transfer so the close animation can unwind the turn around the same point
    // further below. Mover-local because the rotate wrapper is the inner transform.
    let closeRotationPivotX = 0;
    let closeRotationPivotY = 0;
    if(zoomedClose || rotatedClose) {
      // Closing while zoomed/rotated. We can't animate moversContainer's transform
      // from the current state to a target matrix while also moving the child back
      // to a viewport-space thumbnail. A non-identity parent would additionally
      // scale, rotate and translate the target transform and local clip.
      //
      // Instead, transfer the live transform from moversContainer to the mover
      // synchronously (no visible jump — same frame, no transition), reset
      // moversContainer to identity, and let the standard close path animate the
      // mover from its current on-screen position to the target thumb rect.
      // initialContentRect is the pre-zoom media bbox (captured by setZoomValue
      // before the first zoom is applied), so multiplying by `zoom` and adding
      // the pan offset reproduces the user's current viewport position exactly.
      const zoom = this.transform.scale;
      const panX = this.transform.x;
      const panY = this.transform.y;
      const baseRect = (zoomedClose && this.initialContentRect) || this.content.media.getBoundingClientRect();
      const visualX = zoom * baseRect.left + panX;
      const visualY = zoom * baseRect.top + panY;

      let startTransform = `translate3d(${visualX}px, ${visualY}px, 0) scale3d(${zoom}, ${zoom}, 1)`;
      if(rotatedClose) {
        // Same rotate+refit wrapper buildMoversTransform emits, kept as the INNER
        // transform (after the zoom/pan transfer) and pivoted on the mover's own
        // content center — mirroring the screen-space order so the visual position
        // is reproduced exactly. transform-origin: top left (0,0) makes the explicit
        // translate(C)…translate(-C) origin-independent.
        closeRotationPivotX = baseRect.width / 2;
        closeRotationPivotY = baseRect.height / 2;
        const fit = this.getRotationFitScale(closeRotation);
        startTransform += ` translate(${closeRotationPivotX}px, ${closeRotationPivotY}px) rotate(${closeRotation}deg) scale(${fit.toFixed(5)}) translate(${-closeRotationPivotX}px, ${-closeRotationPivotY}px)`;
      }

      this.moversContainer.classList.add('no-transition');
      // Suppress mover's transition inline for this frame so the transform jump
      // (.center anchor → current visual position) doesn't animate. Apply the
      // mover transform, drop .center, clear its inline positioning, and reset
      // the container — all in the same frame so the visual position stays
      // unchanged.
      mover.style.transition = 'none';
      mover.style.transform = startTransform;
      mover.classList.remove('center');
      this.clearCenterStyles(mover);
      if(!zoomedClose) {
        // Rotated-but-not-zoomed: pin the mover to the media's real rect (same as the
        // non-transfer close branch) so it doesn't paint at mobile full-viewport size
        // for the doubleRaf frames before setMoverToTarget assigns containerRect.
        mover.style.width = `${baseRect.width}px`;
        mover.style.height = `${baseRect.height}px`;
      }
      this.moversContainer.style.transform = '';
      void mover.offsetLeft; // reflow to commit the no-transition reset
      mover.style.transition = '';
      this.moversContainer.classList.remove('no-transition');
    } else {
      this.removeCenterFromMover(mover);
      if(closing) {
        // removeCenterFromMover dropped .center but left applyCenterStyles' mobile
        // width/height: 100% on the mover (the full-viewport rest state). Pin it to
        // the media's real rect now, so it doesn't paint at full-viewport size for
        // the two frames of the doubleRaf below — a visible flash — before
        // setMoverToTarget assigns containerRect. Desktop already carries px
        // width/height here, so this matches the value it would get anyway.
        const mediaRect = this.content.media.getBoundingClientRect();
        mover.style.width = `${mediaRect.width}px`;
        mover.style.height = `${mediaRect.height}px`;
      }
    }
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

    let rect: DOMRectEditable;
    if(target) {
      if(findUpAvatar(target) || target.classList.contains('grid-item')/*  || target.classList.contains('document-ico') */) {
        realParent = target;
        rect = target.getBoundingClientRect();
      } else if(target instanceof SVGImageElement || target.parentElement instanceof SVGForeignObjectElement) {
        realParent = findUpClassName(target, 'attachment');
        rect = realParent.getBoundingClientRect();
      } else if(target.classList.contains('profile-avatars-avatar')) {
        realParent = findUpClassName(target, 'profile-avatars-container');
        rect = cloneDOMRect(realParent.getBoundingClientRect());

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
    let viewportClipPath: string;
    let overflowElement: HTMLElement;
    if(target === this.content.media) {
      needOpacity = true;
    } else if(!target.classList.contains('profile-avatars-avatar')) {
      overflowElement = findUpClassName(realParent, 'scrollable');
      let overflowRect: DOMRectMinified;
      // In chats, scrollable extends past the visible bubble area via negative inset-block,
      // so clip the overflow rect to .bubbles-viewport (the actual visible region between
      // topbar and chat-input) when present.
      const chatContainer = overflowElement && findUpClassName(realParent, 'chat');
      const bubblesViewport = chatContainer?.querySelector(':scope > .bubbles-viewport') as HTMLElement;
      if(bubblesViewport) {
        const baseRect = overflowElement.getBoundingClientRect();
        const viewportRect = bubblesViewport.getBoundingClientRect();
        overflowRect = {
          top: Math.max(baseRect.top, viewportRect.top),
          right: Math.min(baseRect.right, viewportRect.right),
          bottom: Math.min(baseRect.bottom, viewportRect.bottom),
          left: Math.max(baseRect.left, viewportRect.left)
        };
      }
      const visibleRect = overflowElement && getVisibleRect(realParent, overflowElement, true, rect, overflowRect);

      if(closing && overflowElement && (!visibleRect || visibleRect.overflow.vertical === 2 || visibleRect.overflow.horizontal === 2)) {
        // On close, retarget to the centered media instead of flying toward an
        // off-screen / larger-than-viewport source. Retargeting keeps the mover where
        // it already is, so when the source is fully off-screen there's no motion — and
        // since there's nothing to animate to, fade it out via opacity (movement zero,
        // opacity only).
        target = this.content.media;
        realParent = target.parentElement as HTMLElement;
        rect = target.getBoundingClientRect();
        needOpacity = true;
      } else if(overflowElement && !visibleRect) {
        // Opening from a source that's off-screen — fade in via opacity.
        needOpacity = true;
      } else if(visibleRect && (visibleRect.overflow.vertical || visibleRect.overflow.horizontal)) {
        // Reproduce only the clipping ancestor boundaries. The target's own edges
        // must stay open so the mover can grow out of its source rectangle.
        viewportClipPath = getMediaViewerClipPath({
          visibleRect,
          viewportWidth: windowSize.width,
          viewportHeight: windowSize.height
        });
      }
    }

    // moversContainer is identity at this point (the zoomedClose branch above
    // reset it after transferring its transform to the mover), so this returns
    // the pre-zoom layout rect just like for a non-zoomed close.
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

    // Per-corner radii (tl, tr, br, bl) in viewport px. Inherits from clipping ancestors
    // (e.g. the rounded sharedMedia grid container) when the corresponding corner of
    // realParent coincides with the ancestor's corner — otherwise interior cells would
    // pick up the grid's outer rounding incorrectly.
    const effectiveCornerRadii = this.computeEffectiveCornerRadii(realParent, rect, overflowElement);
    // The mover is non-uniformly scaled (scaleX may differ from scaleY when the thumb's
    // aspect doesn't match the full media's — typical for sharedMedia square cells over
    // landscape photos). Express radii as elliptical X/Y per corner so the visible
    // corner stays circular at viewport scale instead of stretching with the mover.
    const xRadii = effectiveCornerRadii.map((r) => r / scaleX);
    const yRadii = effectiveCornerRadii.map((r) => r / scaleY);
    // borderRadius is kept as a string for sizeTailPath, which only parses the first
    // 4 X values to drive the SVG bubble-tail path. It also rounds the transformed
    // mover independently from the fixed ancestor clip.
    const borderRadius = `${xRadii.map((v) => v + 'px').join(' ')} / ${yRadii.map((v) => v + 'px').join(' ')}`;
    // let borderRadius = '0px 0px 0px 0px';

    if(!closing && sourceTarget) {
      this.hideFloatings(sourceTarget);
    }

    if(rotatedClose) {
      // Unwind the turn to the nearest upright (a multiple of 360 ≡ 0° visually,
      // matching the still-upright thumbnail) and undo the orientation refit, around
      // the same mover-local pivot the transfer used, kept as the INNER transform.
      // Same function structure as the transferred start transform, so CSS
      // interpolates rotate→upright / scale→1 in lockstep with the translate/scale
      // toward the thumb — the image rotates straight back as it shrinks, taking the
      // short path (|delta| ≤ 180°).
      const upright = Math.round(closeRotation / 360) * 360;
      transform += `translate(${closeRotationPivotX}px, ${closeRotationPivotY}px) rotate(${upright}deg) scale(1) translate(${-closeRotationPivotX}px, ${-closeRotationPivotY}px)`;
    }

    // The fixed wrapper reproduces only the source's clipping ancestor. It starts at
    // that viewport boundary and retracts to inset(0) while the mover grows; keeping
    // the clip off the scaled mover makes every inset interpolate in viewport pixels.
    const useClipPath = USE_MEDIA_VIEWER_CLIP_PATH && !!viewportClipPath && !wasActive;
    if(!wasActive) {
      mover.style.borderRadius = borderRadius;
      if(aspecter) {
        aspecter.style.borderRadius = borderRadius;
      }
    }

    needOpacity && (mover.style.opacity = '0'/* !closing ? '0' : '' */);

    const wrapper = mover.parentElement;
    if(useClipPath) {
      if(closing && !wrapper.style.clipPath) {
        // A viewer opened from a fully visible source carries no clip at rest. Prime
        // a syntactically compatible inset(0) before the close target so the browser
        // can interpolate instead of switching none -> inset() discretely.
        wrapper.style.transition = 'none';
        wrapper.style.clipPath = NO_MEDIA_VIEWER_CLIP_PATH;
        void wrapper.offsetLeft;
        wrapper.style.transition = '';
      } else if(!closing) {
        // Do not animate from `none` to the opening start state. The transition is
        // restored in the preparation frame below.
        wrapper.style.transition = 'none';
      }
      wrapper.style.clipPath = viewportClipPath;
    } else {
      wrapper.style.clipPath = '';
    }
    mover.style.clipPath = '';

    const transitionProperty = needOpacity ? 'opacity' : 'transform';
    const closeTransitionPromise = closing ? this.waitForMoverTransition(mover, delay, transitionProperty) : undefined;
    mover.style.transform = transform;

    /* if(wasActive) {
      this.log('setMoverToTarget', mover.style.transform);
    } */

    let path: SVGPathElement;
    const isOut = target.classList.contains('is-out');

    const deferred = this.setMoverAnimationPromise = deferredPromise<void>();
    const ret = {onAnimationEnd: deferred};

    deferred.finally(() => {
      this.dispatchEvent('setMoverAfter');

      if(this.setMoverAnimationPromise === deferred) {
        this.setMoverAnimationPromise = null;
      }
    });

    if(!closing) {
      let mediaElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

      const selector = 'video, img, .canvas-thumbnail';
      const queryFrom = target.matches(selector) ? target.parentElement : target;
      const elements = Array.from(queryFrom.querySelectorAll(selector)) as Array<HTMLImageElement | HTMLVideoElement | HTMLCanvasElement>;
      if(elements.length) {
        const snapshotSource = elements.pop();
        target = snapshotSource;
        // A rendered image can reuse the browser's already-decoded resource. Canvas
        // snapshots are reserved for video/canvas frames (and the blurred live-stream
        // background), and their backing store is bounded to the displayed size. The
        // old intrinsic-size copy synchronously allocated and painted multi-megapixel
        // canvases immediately before the very first transition.
        if(this.live || !(snapshotSource instanceof HTMLImageElement)) {
          const sourceWidth = snapshotSource instanceof HTMLImageElement ? snapshotSource.naturalWidth :
            snapshotSource instanceof HTMLVideoElement ? snapshotSource.videoWidth : snapshotSource.width;
          const sourceHeight = snapshotSource instanceof HTMLImageElement ? snapshotSource.naturalHeight :
            snapshotSource instanceof HTMLVideoElement ? snapshotSource.videoHeight : snapshotSource.height;
          const snapshotSize = getMediaViewerSnapshotSize({
            width: rect.width,
            height: rect.height,
            sourceWidth,
            sourceHeight,
            devicePixelRatio: this.live ? 1 : window.devicePixelRatio
          });
          const canvas = document.createElement('canvas');
          canvas.width = snapshotSize.width;
          canvas.height = snapshotSize.height;
          canvas.className = 'canvas-thumbnail thumbnail media-photo';
          const context = canvas.getContext('2d');
          if(context) {
            try {
              context.drawImage(snapshotSource, 0, 0, canvas.width, canvas.height);
              if(this.live) {
                boxBlurCanvasRGB(context, 0, 0, canvas.width, canvas.height, 8, 2);
              }
              target = canvas;
            } catch{
              // Keep the rendered source as a fallback when the browser cannot copy
              // a not-yet-ready video frame or a protected canvas.
            }
          }
        }
      }

      if(target.tagName === 'DIV' || findUpAvatar(target)) { // useContainerAsTarget
        const images = Array.from(target.querySelectorAll('img')) as HTMLImageElement[];
        const image = images.pop();
        if(image) {
          mediaElement = new Image();
          mediaElement.src = image.currentSrc || image.src;
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
        mediaElement.src = target.currentSrc || target.src;
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
      }/*  else if(mediaElement instanceof HTMLVideoElement && mediaElement.firstElementChild && ((mediaElement.firstElementChild as HTMLSourceElement).src || src)) {
        await new Promise((resolve, reject) => {
          mediaElement.addEventListener('loadeddata', resolve);

          if(src) {
            (mediaElement.firstElementChild as HTMLSourceElement).src = src;
          }
        });
      } */

      mover.style.visibility = '';

      fastRaf(() => {
        wrapper.style.transition = '';
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

      void closeTransitionPromise.then((completed) => {
        if(!completed) {
          deferred.resolve();
          return;
        }

        mover.replaceChildren();
        mover.classList.remove('moving', 'active', 'hiding');
        mover.style.cssText = 'visibility: hidden; width: 1px; height: 1px;';
        wrapper.style.transition = 'none';
        wrapper.style.clipPath = '';
        this.revealHiddenFloatings();

        deferred.resolve();
      });

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

    const openTransitionPromise = this.waitForMoverTransition(mover, delay, transitionProperty);
    mover.style.transform = `translate3d(${containerRect.left}px,${containerRect.top}px,0) scale3d(1,1,1)`;
    // mover.style.transform = `translate(-50%,-50%) scale(1,1)`;
    needOpacity && (mover.style.opacity = ''/* closing ? '0' : '' */);
    if(useClipPath) {
      wrapper.style.clipPath = NO_MEDIA_VIEWER_CLIP_PATH;
    }

    if(aspecter) {
      this.setFullAspect(aspecter, containerRect, rect);
    }

    mover.style.borderRadius = '';
    if(aspecter) {
      aspecter.style.borderRadius = '';
    }

    void openTransitionPromise.then((completed) => {
      if(!completed) {
        wrapper.style.transition = 'none';
        wrapper.style.clipPath = '';
        deferred.resolve();
        return;
      }

      mover.classList.remove('moving', 'opening');

      if(aspecter) { // всё из-за видео, элементы управления скейлятся, так бы можно было этого не делать
        if(mover.querySelector('video') || true) {
          mover.classList.remove('active');
          aspecter.style.cssText = '';
          void mover.offsetLeft; // reflow
        }

        // aspecter.classList.remove('disable-hover');
      }

      // Установка центральной позиции (важно для ресайза). Снимаем transition
      // инлайн на одну реflow-точку, чтобы переход из open-transform в
      // .center-transform не анимировался; затем чистим инлайн — будущие
      // изменения (PiP opacity, close transform) пойдут через .active-правило.
      mover.classList.add('center');
      mover.style.transition = 'none';
      this.applyCenterStyles(mover);
      void mover.offsetLeft; // reflow — commits center transform without anim
      mover.style.transition = '';

      // это уже нужно для будущих анимаций
      mover.classList.add('active');
      wrapper.style.clipPath = '';

      deferred.resolve();
    });

    if(path) {
      this.sizeTailPath(path, containerRect, scaleX, delay, true, isOut, borderRadius);
    }

    return ret;
  }

  private waitForMoverTransition(mover: HTMLElement, duration: number, propertyName: string) {
    this.cancelMoverTransition(mover);
    if(!duration) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeout = 0;

      const finish = (completed: boolean) => {
        if(settled) return;
        settled = true;
        clearTimeout(timeout);
        mover.removeEventListener('transitionend', onTransitionEnd);
        mover.removeEventListener('transitioncancel', onTransitionCancel);
        if(this.moverTransitionCancels.get(mover) === cancel) {
          this.moverTransitionCancels.delete(mover);
        }
        resolve(completed);
      };
      const cancel = () => finish(false);
      const onTransitionEnd = (event: TransitionEvent) => {
        if(event.target === mover && event.propertyName === propertyName) {
          finish(true);
        }
      };
      const onTransitionCancel = (event: TransitionEvent) => {
        if(event.target === mover && event.propertyName === propertyName) {
          finish(false);
        }
      };

      this.moverTransitionCancels.set(mover, cancel);
      mover.addEventListener('transitionend', onTransitionEnd);
      mover.addEventListener('transitioncancel', onTransitionCancel);
      // A transition may legitimately not be created when start/end values are
      // equal. Keep a short safety fallback, but use transitionend for the normal
      // path so cleanup cannot cut a delayed first frame in half.
      timeout = window.setTimeout(() => finish(true), duration + 100);
    });
  }

  private cancelMoverTransition(mover: HTMLElement) {
    this.moverTransitionCancels.get(mover)?.();
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

  protected setFullAspect(aspecter: HTMLDivElement, containerRect: DOMRect, rect: DOMRectEditable) {
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
      // Suppress the transform jump from .center anchor to target rect: set
      // transition inline for this reflow, then clear so the subsequent close
      // animation (scaled transform in setMoverToTarget) animates normally.
      mover.style.transition = 'none';
      mover.style.transform = `translate3d(${rect.left}px,${rect.top}px,0)`;
      mover.classList.remove('center');
      this.clearCenterStyles(mover);
      void mover.offsetLeft; // reflow
      mover.style.transition = '';
    }
  }

  protected moveTheMover(mover: HTMLElement, toLeft = true) {
    const windowW = windowSize.width;

    this.removeCenterFromMover(mover);

    // mover.classList.remove('active');
    mover.classList.add('moving');

    const rect = mover.getBoundingClientRect();

    const newTransform = mover.style.transform.replace(/translate3d\((.+?),/, (match, p1) => {
      const x = toLeft ? -rect.width : windowW;
      // const x = toLeft ? -(rect.right + (rect.width / 2)) : windowW / 2;

      return match.replace(p1, x + 'px');
    });

    // //////this.log('set newTransform:', newTransform, mover.style.transform, toLeft);
    const delay = liteMode.isAvailable('animations') ? MOVE_TRANSITION_TIME : 0;
    const transitionPromise = this.waitForMoverTransition(mover, delay, 'transform');
    mover.style.transform = newTransform;

    void transitionPromise.then((completed) => {
      if(!completed) return;
      mover.middlewareHelper.destroy();
      // Remove the wrapper too so it doesn't leak.
      (mover.parentElement || mover).remove();
    });
  }

  protected setNewMover() {
    // Each mover lives inside its own wrapper so old movers can leave during
    // prev/next navigation and be removed as a unit.
    const wrapper = document.createElement('div');
    wrapper.classList.add(MEDIA_VIEWER_CLASSNAME + '-mover-wrapper');

    const newMover = document.createElement('div');
    newMover.classList.add('media-viewer-mover');
    // Keep a tiny laid-out transform target from construction onward. display:none
    // made will-change ineffective until the same frame as the first animation.
    newMover.style.cssText = 'visibility: hidden; width: 1px; height: 1px;';
    newMover.middlewareHelper = this.middlewareHelper.get().create();
    wrapper.appendChild(newMover);

    if(this.content.mover) {
      const oldWrapper = this.content.mover.parentElement;
      oldWrapper.parentElement.appendChild(wrapper);
    } else {
      this.moversContainer.appendChild(wrapper);
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
      });
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
    replaceContent(this.author.date, this.live ? i18n('Rtmp.MediaViewer.Streaming') : formatFullSentTime(timestamp));

    if(oldAvatar?.node && oldAvatar.node.parentElement) {
      oldAvatar.node.replaceWith(newAvatar.node);
    } else {
      this.author.container.prepend(newAvatar.node);
    }

    if(oldAvatar) {
      oldAvatar.node.remove();
      oldAvatarMiddlewareHelper.destroy();
    }

    // The node already contains its placeholder, so neither the avatar thumbnail nor
    // an async peer title should hold the first compositor frame.
    void Promise.resolve(newAvatar.readyThumbPromise).catch(() => {});
    return Promise.resolve(wrapTitlePromise).then((title) => {
      if(this.author.avatarEl === newAvatar) {
        replaceContent(this.author.nameEl, title);
      }
    });
  }

  // Walk up from element collecting per-corner radii (tl, tr, br, bl) in viewport px.
  // For each clipping ancestor (overflow != visible) with non-zero border-radius, inherit
  // the ancestor's corner radius only when element's corresponding corner coincides with
  // the ancestor's — so interior items in a rounded container don't pick up the outer
  // rounding, but a corner item does.
  protected computeEffectiveCornerRadii(
    element: HTMLElement,
    elementRect: DOMRectMinified,
    clippingBoundary?: HTMLElement
  ): [number, number, number, number] {
    const TOLERANCE = 1.5; // sub-pixel + grid-gap slack
    const radii: [number, number, number, number] = [0, 0, 0, 0];

    const elementStyle = window.getComputedStyle(element);
    radii[0] = parseFloat(elementStyle.borderTopLeftRadius) || 0;
    radii[1] = parseFloat(elementStyle.borderTopRightRadius) || 0;
    radii[2] = parseFloat(elementStyle.borderBottomRightRadius) || 0;
    radii[3] = parseFloat(elementStyle.borderBottomLeftRadius) || 0;

    let ancestor = element.parentElement;
    let depth = 0;
    while(ancestor && ancestor !== document.body && depth++ < 12) {
      const aStyle = window.getComputedStyle(ancestor);
      if(aStyle.overflow !== 'visible') {
        const aTL = parseFloat(aStyle.borderTopLeftRadius) || 0;
        const aTR = parseFloat(aStyle.borderTopRightRadius) || 0;
        const aBR = parseFloat(aStyle.borderBottomRightRadius) || 0;
        const aBL = parseFloat(aStyle.borderBottomLeftRadius) || 0;

        if(aTL || aTR || aBR || aBL) {
          const aRect = ancestor.getBoundingClientRect();
          const sameLeft = Math.abs(elementRect.left - aRect.left) < TOLERANCE;
          const sameRight = Math.abs(elementRect.right - aRect.right) < TOLERANCE;
          const sameTop = Math.abs(elementRect.top - aRect.top) < TOLERANCE;
          const sameBottom = Math.abs(elementRect.bottom - aRect.bottom) < TOLERANCE;

          if(aTL && sameLeft && sameTop) radii[0] = Math.max(radii[0], aTL);
          if(aTR && sameRight && sameTop) radii[1] = Math.max(radii[1], aTR);
          if(aBR && sameRight && sameBottom) radii[2] = Math.max(radii[2], aBR);
          if(aBL && sameLeft && sameBottom) radii[3] = Math.max(radii[3], aBL);
        }
      }

      if(ancestor === clippingBoundary) break;
      ancestor = ancestor.parentElement;
    }

    return radii;
  }

  protected getLayoutReserves(): {top: number, bottom: number} {
    if(mediaSizes.isMobile) {
      return {top: RESERVE_TOP_MOBILE, bottom: RESERVE_BOTTOM_MOBILE};
    }

    return {top: RESERVE_TOP_DESKTOP, bottom: RESERVE_BOTTOM_DESKTOP};
  }

  // Floating overlays on the source/target bubble (e.g. .video-time, .time.is-floating) should
  // not show during the open/close animation — they'd overlap the mover's silhouette
  // at the thumb position. On open: hide instantly. On close: animate them back.
  protected hiddenFloatings = new Set<HTMLElement>();

  // Floating overlays we hide while the viewer animates open / reveal back on close.
  // Each context is keyed by a `trigger` class found in the target's ancestry; the
  // matching context's layers each pick their own ancestor (containerClass) and run
  // a querySelectorAll inside it for the floating selectors. This lets a single
  // context hide elements at multiple DOM levels — e.g. profile avatars need to
  // hide both the info/gradient overlays inside .profile-avatars-container AND the
  // .sidebar-header that's a sibling of .sidebar-content several levels up.
  protected static readonly FLOATING_CONTEXTS: ReadonlyArray<{
    readonly trigger: string,
    readonly layers: ReadonlyArray<{readonly containerClass: string, readonly selectors: string}>
  }> = [{
      trigger: 'profile-avatars-container',
      layers: [
        {containerClass: 'profile-avatars-container', selectors: '.profile-avatars-info, .profile-avatars-gradient, .profile-music-container'},
        {containerClass: 'sidebar-slider-item', selectors: ':scope > .sidebar-header'}
      ]
    }, {
      trigger: 'bubble',
      layers: [{containerClass: 'bubble', selectors: '.video-time, .time.is-floating, .video-play'}]
    }, {
      trigger: 'grid-item',
      layers: [{containerClass: 'grid-item', selectors: '.video-time, .time.is-floating, .video-play'}]
    }];

  protected hideFloatings(target: HTMLElement) {
    if(!target) return;
    const context = AppMediaViewerBase.FLOATING_CONTEXTS.find(({trigger}) => findUpClassName(target, trigger));
    if(!context) return;
    // In an album each item carries its own floating overlays (.video-time, .video-play),
    // but the container query spans the whole bubble. Only the clicked item's mover
    // animates, so skip overlays that belong to a sibling album item. Bubble-level
    // floatings (e.g. .time.is-floating, which has no .album-item ancestor) are still hidden.
    const targetAlbumItem = findUpClassName(target, 'album-item');
    for(const {containerClass, selectors} of context.layers) {
      const container = findUpClassName(target, containerClass);
      if(!container) continue;
      container.querySelectorAll<HTMLElement>(selectors).forEach((el) => {
        if(this.hiddenFloatings.has(el)) return;
        const albumItem = findUpClassName(el, 'album-item');
        if(albumItem && albumItem !== targetAlbumItem) return;
        el.style.transition = 'none';
        el.style.opacity = '0';
        this.hiddenFloatings.add(el);
      });
    }
  }

  protected revealHiddenFloatings() {
    if(!this.hiddenFloatings.size) return;
    const elements = Array.from(this.hiddenFloatings);
    this.hiddenFloatings.clear();
    // Called from the mover's real transition completion, so the source is no longer
    // obscured and can fade back immediately.
    elements.forEach((el) => {
      // Literal duration: --open-duration is scoped to .media-viewer-whole and these
      // floating overlays live in the chat bubble (outside that scope).
      el.style.transition = `opacity ${OPEN_TRANSITION_TIME}ms`;
      el.style.opacity = '';
    });
    setTimeout(() => {
      elements.forEach((el) => {
        el.style.transition = '';
      });
    }, OPEN_TRANSITION_TIME);
  }

  // Resize listener: viewport changed → re-fit content.media + mover, then
  // re-apply center positioning. Open-path callers should use applyLayoutPadding
  // instead — the open flow does its own sizing right after.
  protected applyLayoutVariables = () => {
    this.applyLayoutPadding();
    const mover = this.content.mover;
    if(mover && mover.classList.contains('center')) {
      this.refitMediaToViewport();
      this.applyCenterStyles(mover);
    }
  };

  protected applyLayoutPadding() {
    const {top, bottom} = this.getLayoutReserves();
    const cs = this.content.main.style;
    cs.paddingTop = `${top}px`;
    cs.paddingBottom = `${bottom}px`;
  }

  // Re-fits content.media (the hidden target) and the mover to the new
  // mediaBoxSize while preserving the source media's aspect ratio (derived from
  // content.media's current inline px, which was an aspect-fit for the previous
  // viewport). Keeps containerRect in sync across resizes so close-transition
  // scale math stays correct.
  protected refitMediaToViewport() {
    const media = this.content.media;
    const w = parseFloat(media.style.width);
    const h = parseFloat(media.style.height);
    if(!w || !h) return;
    const {width: boxW, height: boxH} = this.mediaBoxSize;
    const noZoom = !mediaSizes.isMobile;
    const fit = calcImageInBox(w, h, boxW, boxH, noZoom);
    media.style.width = `${fit.width}px`;
    media.style.height = `${fit.height}px`;
    const mover = this.content.mover;
    if(mover) {
      mover.style.width = `${fit.width}px`;
      mover.style.height = `${fit.height}px`;
    }
  }

  protected applyCenterStyles(mover: HTMLElement) {
    const {top, bottom} = this.getLayoutReserves();
    const s = mover.style;
    s.left = '50%';
    s.top = `calc(50% + ${(top - bottom) / 2}px)`;
    s.transform = 'translate3d(-50%, -50%, 0)';
    s.maxWidth = '100vw';
    s.maxHeight = `calc(100vh - ${top + bottom}px)`;
    // On handhelds, force the mover to fill the viewport (overrides the px
    // width/height assigned by openMedia / refit). On desktop, leave width/
    // height alone — they're set in px by openMedia at open time and kept in
    // sync with viewport changes by refitMediaToViewport.
    if(mediaSizes.isMobile) {
      s.width = '100%';
      s.height = '100%';
    }
  }

  // Clears positioning props applyCenterStyles set, EXCEPT transform and
  // width/height. Transform is owned by the caller (close target / pan offset).
  // Width/height get rewritten by setMoverToTarget to the fresh containerRect
  // immediately after — clearing them here would add a redundant layout pass
  // (auto → flex shrink → re-set in px) in the same synchronous frame.
  protected clearCenterStyles(mover: HTMLElement) {
    const s = mover.style;
    s.left = '';
    s.top = '';
    s.maxWidth = '';
    s.maxHeight = '';
  }

  protected get mediaBoxSize(): MediaSize {
    const {width, height} = windowSize;
    const {top, bottom} = this.getLayoutReserves();
    return new MediaSize(
      width,
      height - top - bottom - this.extraHeightPadding
    );
  }

  protected removeQualityOptions() {
    this.downloadQualityMenuOptions.splice(0);
  }

  protected async loadQualityLevelsDownloadOptions(doc: MyDocument, tempId = this.tempId) {
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

    if(this.tempId === tempId) {
      this.downloadQualityMenuOptions.push(...options);
    }
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
    media: MyDocument | MyPhoto | InputGroupCall.inputGroupCall,
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

    const isLiveStream = media._ === 'inputGroupCall';
    const isDocument = media._ === 'document';
    const isVideo = isDocument && media.mime_type && ((['video', 'gif'] as MyDocument['type'][]).includes(media.type) || media.mime_type.indexOf('video/') === 0);
    let isHlsStream: boolean;

    this.log('openMedia', media, fromId, prevTargets, nextTargets, isLiveStream, isDocument, isVideo);

    this.live = isLiveStream;
    const setAuthorPromise = noAuthor ? Promise.resolve() : this.setAuthorInfo(fromId, timestamp);
    void setAuthorPromise.catch(() => {});
    // Open-path: only update padding so mediaBoxSize reads the right reserves.
    // The current mover (if any) is about to be replaced via setNewMover (or is
    // hidden post-close); skip the refit + recenter that the resize handler does.
    this.applyLayoutPadding();

    if(this.isFirstOpen) {
      // this.targetContainer = targetContainer;
      // this.needLoadMore = needLoadMore;
      this.isFirstOpen = false;
      this.listLoader.setTargets(prevTargets, nextTargets, reverse);
      (window as any).appMediaViewer = this;
      // this.loadMore = loadMore;
    }

    const shouldLoadMore = this.listLoader.next.length < 10;

    // if(prevTarget && (!prevTarget.parentElement || !this.isElementVisible(this.targetContainer, prevTarget))) prevTarget = null;
    // if(nextTarget && (!nextTarget.parentElement || !this.isElementVisible(this.targetContainer, nextTarget))) nextTarget = null;

    this.buttons.prev.classList.toggle('hide', !this.listLoader.previous.length);
    this.buttons.next.classList.toggle('hide', !this.listLoader.next.length);

    // Rotation is offered for photos, GIFs and videos. A turned video would also turn
    // its player chrome, so the controls bar is hidden while rotated (see
    // updateVideoControlsLock) — same as zoom. Live streams are excluded (they're
    // full-bleed / PiP and have no still frame to straighten).
    this.buttons.rotate.classList.toggle('hide', isLiveStream);

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
      changeQualityOptionsPromise = this.loadQualityLevelsDownloadOptions(media, tempId);
    else
      changeQualityOptionsPromise = Promise.resolve(this.removeQualityOptions());
    changeQualityOptionsPromise = changeQualityOptionsPromise.catch((error) => {
      this.log.warn('failed to load media quality options', error);
    });

    // Rotation is per-media. Clear any leftover turn from the previous image and snap
    // moversContainer back to identity instantly (no-transition) — so neither the
    // outgoing nav slide nor the incoming open animates a stray spin.
    if(this.rotation) {
      this.rotation = 0;
      this.moversContainer.classList.add('no-transition');
      this.applyMoversTransform();
      void this.moversContainer.offsetLeft; // reflow to commit before the slide/open
      this.moversContainer.classList.remove('no-transition');
    }

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

      if(!this.wholeDiv.parentElement) {
        getOverlayRoot().append(this.wholeDiv);
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

    const isVideoWithPlayer = isLiveStream || (isVideo && (media as MyDocument).type !== 'gif');
    if(isVideoWithPlayer) {
      const currentWidth = parseFloat(container.style.width);
      if(currentWidth > 0 && currentWidth < VIDEO_MIN_WIDTH) {
        const currentHeight = parseFloat(container.style.height);
        const aspect = currentWidth / currentHeight;
        let newWidth = Math.min(VIDEO_MIN_WIDTH, mediaBoxSize.width);
        let newHeight = newWidth / aspect;
        if(newHeight > mediaBoxSize.height) {
          newHeight = mediaBoxSize.height;
          newWidth = newHeight * aspect;
        }
        container.style.width = newWidth + 'px';
        container.style.height = newHeight + 'px';
      }
    }
    if(useContainerAsTarget && !isLiveStream) {
      const cacheContext = await this.managers.thumbsStorage.getCacheContext(media, size?.type);
      let img: HTMLImageElement | HTMLCanvasElement;
      if(cacheContext.downloaded) {
        img = new Image();
        // Await decode: setMoverToTarget draws this thumbnail onto a canvas via
        // drawImage, which yields a BLANK canvas for a not-yet-decoded image —
        // so without this the (container-target) slide would be empty until it
        // ends. Mirrors the stripped-thumb branch below, which already awaits.
        thumbPromise = renderImageFromUrlPromise(img, cacheContext.url, false).catch(() => {});
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
        renderImageFromUrl(img, mediaThumbnail, undefined, false);
      } else {
        const avatar = avatarNew({
          middleware: this.middlewareHelper.get(),
          peerId: fromId.toPeerId(),
          size: 'full'
        });
        avatar.node.classList.add('thumbnail-avatar');
        container.append(avatar.node);
        void Promise.resolve(avatar.readyThumbPromise).catch(() => {});
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
      if(isHlsStream && apiManagerProxy.isServiceWorkerOnline()) return {url: getDocumentURL(media as MyDocument, {supportsHlsStreaming: true})};
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

      video.addEventListener('contextmenu', (event) => {
        if(isLiveStream || this.wholeDiv.classList.contains('no-forwards')) {
          cancelEvent(event);
        }
      });

      const set = () => this.setMoverToTarget(target, false, fromRight).then(({onAnimationEnd}) => {
      // return; // set and don't move
      // if(wasActive) return;
        // return;

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

          const storyboard = prepareStoryboard({
            message: message as Message.message,
            middleware: this.middlewareHelper.get()
          });

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
            onMenuToggle: (open) => {
              // Any player menu (playback rate / quality) overlaps the caption, so
              // hide it while a menu is open.
              this.wholeDiv.classList.toggle('hide-caption', !!open);
            },
            onTimePreviewToggle: (visible) => {
              // The seek-bar time preview sits where the caption is, so hide the
              // caption while it's shown (mobile: .hide-caption fades it out).
              this.wholeDiv.classList.toggle('hide-caption', visible);
            },
            onPip: (pip) => {
              const otherMediaViewer = (window as any).appMediaViewer;
              if(!pip && otherMediaViewer && otherMediaViewer !== this) {
                this.releaseSingleMedia = undefined;
                this.close();
                return;
              }

              const mover = this.moversContainer.lastElementChild as HTMLElement;
              // PiP fade: mover at rest has .active (transitions opacity via
              // the .active CSS rule) and no transition-blocking class, so
              // setting opacity inline animates over --open-duration.
              mover.style.opacity = pip ? '0' : '';
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
            useGlobalVolume: 'auto',
            storyboard
          });
          this.videoPlayer?.loadQualityLevels();

          // Mark that a video player is present (vs a photo) and assume its controls
          // start shown — they do on open. has-video-controls then tracks the
          // controls' show/hide; on mobile the caption fades together with them.
          this.wholeDiv.classList.add('has-video', 'has-video-controls');

          player.addEventListener('toggleControls', (show) => {
            this.wholeDiv.classList.toggle('has-video-controls', show);
          });

          this.addEventListener('setMoverBefore', () => {
            this.wholeDiv.classList.remove('has-video', 'has-video-controls');
            this.videoPlayer.cleanup();
            this.videoPlayer = undefined;
          }, {once: true});

          if(this.isZooming || this.isRotated()) {
            this.videoPlayer.lockControls(false);
          } else if(isLiveStream) {
            // Lock hidden (not shown) during the open animation. Otherwise the
            // controls render inside the still-animating aspecter (containerRect-
            // sized, scaled by setFullAspect) and then jump to the viewport
            // bottom when the aspecter resets at anim end. The canplay handler
            // unlocks them via onAnimationEnd, at which point they appear
            // already at their final position.
            this.videoPlayer.lockControls(false);
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
                // Defer unlocking until the open animation settles. For live
                // streams canplay can fire mid-animation; unlocking right away
                // would show controls inside the still-animating aspecter/mover
                // layout and they'd snap to their final position when it ends.
                onAnimationEnd.then(() => {
                  if(this.tempId === tempId) {
                    this.videoPlayer?.lockControls(undefined);
                  }
                });
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

          attachCanPlay();
        }

        // if(!video.src || media.url !== video.src) {
        const load = async() => {
          /* if(useController) {
              appMediaPlaybackController.resolveWaitingForLoadMedia(message.peerId, message.mid, message.pFlags.is_scheduled);
            } */

          await changeQualityOptionsPromise;
          if(this.tempId !== tempId) return;
          isHlsStream = this.hasQualityOptions;

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

      setMoverPromise = thumbPromise.then(set);
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

    const result = this.setMoverPromise = setMoverPromise.catch(() => {
      this.setMoverAnimationPromise = null;
    }).finally(() => {
      this.setMoverPromise = null;
    });

    if(shouldLoadMore) {
      // Prefetching used to run in a zero-delay timer, immediately before the first
      // compositor frame. Let the real mover transition finish before doing list and
      // worker work that is invisible while the viewer opens.
      void result.then(() => this.setMoverAnimationPromise).then(() => {
        if(this.tempId === tempId && this.listLoader.next.length < 10) {
          this.listLoader.load(true);
        }
      });
    }

    return result;
  }
}
