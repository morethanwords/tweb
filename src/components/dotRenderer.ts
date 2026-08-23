// * thanks https://github.com/dkaraush/particles for webgl version

import {MOUNT_CLASS_TO} from '@config/debug';
import {animate} from '@helpers/animation';
import callbackify from '@helpers/callbackify';
import deferredPromise from '@helpers/cancellablePromise';
import customProperties, {CustomProperty} from '@helpers/dom/customProperties';
import {Middleware} from '@helpers/middleware';
import getUnsafeRandomInt from '@helpers/number/getUnsafeRandomInt';
import readValue, {ValueOrGetter} from '@helpers/solid/readValue';
import {applyColorOnContext} from '@lib/lottie/lottiePlayer';
import rootScope from '@lib/rootScope';
import animationIntersector, {AnimationItemGroup, AnimationItemWrapper} from '@components/animationIntersector';
import BluffSpoilerController from '@components/bluffSpoilerController';
import DotRendererCore, {buildDotRendererConfig, drawClippingCircle, getDefaultParticlesCount, DotRendererConfig, DotRendererShaderURLs} from '@components/dotRendererCore';
import {drawImageFromSource} from '@components/messageSpoilerOverlay/drawImageFromSource';
import {adjustSpaceBetweenCloseRects, getInnerCustomRect, toDOMRectArray} from '@components/messageSpoilerOverlay/utils';
import {observeResize} from '@components/resizeObserver';
import {retainSpoilerRenderer, SpoilerRendererConnection} from '@components/spoilerRendererConnection';
import type {SpoilerOverlayRect, SpoilerOverlayUpdate} from '@components/spoilerRenderer.worker';
import {animateValue, simpleEasing} from '@helpers/animateValue';
import {CancellablePromise} from '@helpers/cancellablePromise';

const SHADER_URLS: DotRendererShaderURLs = {
  vertex: 'assets/img/spoiler_vertex.glsl',
  fragment: 'assets/img/spoiler_fragment.glsl'
};

const TEXT_SPOILER_WIDTH = 240;
const TEXT_SPOILER_HEIGHT = 120;
const IMAGE_SPOILER_SIZE = 480;
// * how long to wait for the worker's `*-inited` answer before giving up on this init round
const WORKER_INIT_TIMEOUT = 8000;

const getTextSpoilerConfig = (dpr: number): Partial<DotRendererConfig> => ({
  particlesCount: 4 * getDefaultParticlesCount(TEXT_SPOILER_WIDTH, TEXT_SPOILER_HEIGHT),
  noiseSpeed: 5,
  maxVelocity: 10,
  timeScale: 1.2,
  radius: 1.8 * dpr,
  forceMult: .2,
  velocityMult: .4,
  dampingMult: 2.2,
  longevity: 5.0
});

export class AnimationItemNested implements AnimationItemWrapper {
  public autoplay = true;
  public loop = true;
  public paused = true;

  constructor(private options: {
    onPlay: () => void,
    onPause: () => void,
    onDestroy?: () => void
  }) {}

  public remove() {
    this.pause();
    this.options.onDestroy?.();
  }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;
    this.options.onPlay();
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;
    this.options.onPause();
  }
}

export default class DotRenderer implements AnimationItemWrapper {
  private static createdIndex = -1;

  private static imageSpoilerInstance: DotRenderer;
  private static textSpoilerInstance: DotRenderer;

  private static createdImageSpoilers = new WeakMap<HTMLCanvasElement, ReturnType<(typeof DotRenderer)['create']>>();

  private drawCallbacks: Map<HTMLElement, () => void> = new Map();
  private targetCanvasesCount = 0;

  public canvas: HTMLCanvasElement;
  private core: DotRendererCore;

  public paused: boolean;
  public autoplay: boolean;
  public tempId: number;

  private dpr: number;

  public loop: boolean = true;
  private initPromise: MaybePromise<boolean>;

  constructor() {
    const canvas = this.canvas = document.createElement('canvas');
    this.dpr = window.devicePixelRatio;
    canvas.classList.add('canvas-thumbnail', 'canvas-dots');

    this.paused = true;
    this.autoplay = true;
    this.tempId = 0;
    this.core = new DotRendererCore(canvas, SHADER_URLS);
  }

  private resize(width: number, height: number, multiply?: number, config: Partial<DotRendererConfig> = {}) {
    this.core.resize(width, height, this.dpr, buildDotRendererConfig(width, height, this.dpr, config));
  }

  private draw() {
    if(!this.core.inited) {
      return;
    }

    this.core.draw();
    this.drawCallbacks.forEach((draw) => draw());
  }

  public remove() {
    this.pause();
    this.destroy();
  }

  public pause() {
    if(this.paused) {
      return;
    }

    this.paused = true;
    ++this.tempId;
  }

  // public renderFirstFrame() {
  //   if(!this.dots) {
  //     this.prepare();
  //   }

  //   this.draw();
  // }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;
    const tempId = ++this.tempId;
    this.core.lastDrawTime = Date.now();

    animate(() => {
      if(this.tempId !== tempId || this.paused) {
        return false;
      }

      this.draw();
      return true;
    });
  }

  private init() {
    return this.initPromise ??= callbackify(this.core.init(), () => {
      this.draw();
      return true;
    });
  }

  private destroy() {
    this.core.destroy();
  }

  public static create(options: {
    width?: number,
    height?: number,
    middleware: Middleware,
    animationGroup: AnimationItemGroup,
    multiply?: number,
    config?: Partial<DotRendererConfig>
  }) {
    if(BluffSpoilerController.isWorkerSimSupported()) {
      return this.createWithWorker(options);
    }

    const {width, height, middleware, animationGroup, config} = options;
    let {imageSpoilerInstance: instance} = this;
    if(!instance) {
      instance = this.imageSpoilerInstance = new DotRenderer();
      instance.resize(IMAGE_SPOILER_SIZE, IMAGE_SPOILER_SIZE);
      (window as any).dotRenderer = instance;
    }
    // dotRenderer.renderFirstFrame();

    const dpr = window.devicePixelRatio;
    const {canvas, rotate, flipX, flipY} = this.createTargetCanvas(width, height, dpr);
    const context = canvas.getContext('2d');

    let revealAnimation: {
      underlyingCanvasClickCoords: {x: number, y: number},
      transformedCoords: {x: number, y: number},
      progress: number,
      maxDist: number,
      maxDistUnderlyingCanvas: number,
      underLyingCtx: CanvasRenderingContext2D
    };

    const x = getUnsafeRandomInt(0, instance.canvas.width - canvas.width);
    const y = getUnsafeRandomInt(0, instance.canvas.height - canvas.height);

    const draw = () => {
      const {width, height} = canvas;
      const isRevealed = revealAnimation?.progress >= 1;

      if(isRevealed) return;

      context.clearRect(0, 0, width, height);

      if(!revealAnimation) {
        context.drawImage(instance.canvas, x, y, width, height, 0, 0, width, height);
      } else {
        const {
          progress,
          transformedCoords,
          underLyingCtx,
          maxDist,
          maxDistUnderlyingCanvas,
          underlyingCanvasClickCoords
        } = revealAnimation;

        // Zoom (push) the particles
        const scaledProgress = progress ** 2 /* * Math.sqrt(progress) */ * 0.5;
        context.drawImage(instance.canvas,
          x + transformedCoords.x * scaledProgress, y + transformedCoords.y * scaledProgress, width * (1 - scaledProgress), height * (1 - scaledProgress),
          0, 0, width, height
        );

        // Draw a clipping circle growing from where the user clicked
        drawClippingCircle(context, progress, transformedCoords, maxDist, instance.dpr);
        drawClippingCircle(underLyingCtx, progress, underlyingCanvasClickCoords, maxDistUnderlyingCanvas, instance.dpr);
      }

      if(config?.color) {
        applyColorOnContext(context, '#' + config.color.toString(16), 0, 0, width, height);
      }
    };

    ++instance.targetCanvasesCount;
    const animation = new AnimationItemNested({
      onPlay: () => {
        instance.drawCallbacks.set(canvas, draw);
        instance.play();
      },
      onPause: () => {
        instance.drawCallbacks.delete(canvas);
        if(!instance.drawCallbacks.size) {
          instance.pause();
        }
      },
      onDestroy: () => {
        if(!--instance.targetCanvasesCount) {
          instance.remove();
          this.imageSpoilerInstance = undefined;
        }
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: animationGroup,
      observeElement: canvas,
      controlled: middleware,
      type: 'dots'
    });

    function revealWithAnimation(event: Event, underLyingCanvas: HTMLCanvasElement) {
      if(!('clientX' in event && 'clientY' in event)) return false;
      const bcr = canvas.getBoundingClientRect();

      const rectX = event.clientX as number - bcr.left;
      const rectY = event.clientY as number - bcr.top;
      let transX = rectX, transY = rectY;

      if(Number(rotate) + Number(flipX) === 1) {
        transX = bcr.width - rectX;
      }
      if(Number(rotate) + Number(flipY) === 1) {
        transY = bcr.height - rectY;
      }

      const distToMargin = Math.max(
        Math.hypot(rectX, rectY),
        Math.hypot(bcr.width - rectX, rectY),
        Math.hypot(rectX, bcr.height - rectY),
        Math.hypot(bcr.width - rectX, bcr.height - rectY)
      );
      const maxDist = distToMargin * instance.dpr + 50;

      revealAnimation = {
        underlyingCanvasClickCoords: {
          x: rectX * underLyingCanvas.width / bcr.width,
          y: rectY * underLyingCanvas.height / bcr.height
        },
        transformedCoords: {
          x: transX * instance.dpr,
          y: transY * instance.dpr
        },
        maxDist,
        maxDistUnderlyingCanvas: maxDist / canvas.width * underLyingCanvas.width,
        underLyingCtx: underLyingCanvas.getContext('2d'),
        progress: 0
      };

      const deferred = deferredPromise<void>();

      animateValue(0, 1, 800 + (400/* px/ms */ - distToMargin),
        (v) => {
          revealAnimation.progress = v
          draw()
        },
        {
          onEnd: () => void deferred.resolve(),
          easing: simpleEasing
        }
      );

      return deferred;
    }

    const result = {
      canvas,
      readyResult: width && (/* dotRenderer.resize(width, height, multiply, config),  */instance.init()),
      revealWithAnimation
    };

    this.createdImageSpoilers.set(canvas, result);

    return result;
  }

  private static connection: SpoilerRendererConnection;
  private static connectionUsers = 0; // media targets + overlay targets
  private static mediaInited = false;
  private static textInited = false;
  private static mediaWorkerReady: CancellablePromise<void>;
  private static textWorkerReady: CancellablePromise<void>;

  private static getShaderURLs() {
    return {
      vertexURL: new URL(SHADER_URLS.vertex, window.location.href).href,
      fragmentURL: new URL(SHADER_URLS.fragment, window.location.href).href
    };
  }

  private static retainConnection() {
    ++this.connectionUsers;
    return this.connection ??= retainSpoilerRenderer((message) => {
      if(message.type === 'media-inited') {
        this.mediaWorkerReady?.resolve();
      } else if(message.type === 'text-inited') {
        this.textWorkerReady?.resolve();
      }
    });
  }

  private static releaseConnection() {
    if(--this.connectionUsers || !this.connection) return;

    this.connection.release();
    this.connection = undefined;
    this.mediaInited = this.textInited = false;
    this.mediaWorkerReady = this.textWorkerReady = undefined;
  }

  /**
   * The worker answers `*-inited` only once its sim's `init()` resolves, and that can never happen
   * (a shader request that stalls, a lost WebGL context). `wrapMediaSpoiler` awaits this deferred,
   * so a silent worker used to park the render queue of every chat holding a spoiler — permanently,
   * because the `*Inited` latch below suppresses any further init. Give up after a deadline: resolve
   * the deferred so the spoiler degrades to its blurred thumbnail, and unlatch so the next spoiler
   * re-sends the init instead of inheriting a promise that can never settle.
   */
  private static watchWorkerInit(deferred: CancellablePromise<void>, unlatch: () => void) {
    const timeout = window.setTimeout(() => {
      unlatch();
      deferred.resolve();
    }, WORKER_INIT_TIMEOUT);

    deferred.then(() => clearTimeout(timeout), () => clearTimeout(timeout));
  }

  private static initMediaSim() {
    if(this.mediaInited) return;
    this.mediaInited = true;

    const deferred = this.mediaWorkerReady = deferredPromise<void>();
    this.watchWorkerInit(deferred, () => {
      if(this.mediaWorkerReady === deferred) {
        this.mediaInited = false;
      }
    });

    const dpr = window.devicePixelRatio;
    this.connection.postMessage({
      type: 'media-init',
      width: IMAGE_SPOILER_SIZE,
      height: IMAGE_SPOILER_SIZE,
      dpr,
      config: buildDotRendererConfig(IMAGE_SPOILER_SIZE, IMAGE_SPOILER_SIZE, dpr),
      ...this.getShaderURLs()
    });
  }

  private static initTextSim() {
    if(this.textInited) return;
    this.textInited = true;

    const deferred = this.textWorkerReady = deferredPromise<void>();
    this.watchWorkerInit(deferred, () => {
      if(this.textWorkerReady === deferred) {
        this.textInited = false;
      }
    });

    const dpr = Math.min(2, window.devicePixelRatio);
    this.connection.postMessage({
      type: 'text-init',
      width: TEXT_SPOILER_WIDTH,
      height: TEXT_SPOILER_HEIGHT,
      dpr,
      config: buildDotRendererConfig(TEXT_SPOILER_WIDTH, TEXT_SPOILER_HEIGHT, dpr, getTextSpoilerConfig(dpr)),
      ...this.getShaderURLs()
    });
  }

  /**
   * Shared between the worker and the legacy paths: the target canvas with the
   * per-instance rotation/flip disguising that all the spoilers sample the same
   * simulation
   */
  private static createTargetCanvas(width: number, height: number, dpr: number) {
    const index = ++this.createdIndex;

    const canvas = document.createElement('canvas');
    canvas.classList.add('canvas-thumbnail', 'canvas-dots');
    if(width) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const rotate = (index % 4) === 1;
    const flipX = (index % 4) === 2;
    const flipY = (index % 4) === 3;

    const transforms: string[] = [
      rotate && 'rotate(180deg)',
      flipX && 'scaleX(-1)',
      flipY && 'scaleY(-1)'
    ].filter(Boolean);
    if(transforms.length) {
      canvas.style.transform = transforms.join(' ');
    }

    return {canvas, rotate, flipX, flipY};
  }

  /**
   * Same as the legacy path below, but the simulation, the per-target drawing and
   * the reveal effect all run inside a worker on transferred OffscreenCanvases —
   * the main thread only forwards play/pause/reveal events. Only the clipping hole
   * on the underlying thumbnail stays here, that canvas is owned by the media code.
   */
  private static createWithWorker({
    width,
    height,
    middleware,
    animationGroup,
    config
  }: Parameters<(typeof DotRenderer)['create']>[0]) {
    const connection = this.retainConnection();
    this.initMediaSim();
    const dpr = window.devicePixelRatio;
    const {canvas, rotate, flipX, flipY} = this.createTargetCanvas(width, height, dpr);
    const id = this.createdIndex;

    const simSize = IMAGE_SPOILER_SIZE * dpr;
    const x = getUnsafeRandomInt(0, simSize - canvas.width);
    const y = getUnsafeRandomInt(0, simSize - canvas.height);

    const offscreen = canvas.transferControlToOffscreen();
    connection.postMessage({
      type: 'media-attach',
      id,
      canvas: offscreen,
      x,
      y,
      color: config?.color ? '#' + config.color.toString(16) : undefined
    }, [offscreen]);

    const animation = new AnimationItemNested({
      onPlay: () => this.connection?.postMessage({type: 'media-play', id}),
      onPause: () => this.connection?.postMessage({type: 'media-pause', id}),
      onDestroy: () => {
        this.connection?.postMessage({type: 'media-detach', id});
        this.releaseConnection();
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: animationGroup,
      observeElement: canvas,
      controlled: middleware,
      type: 'dots'
    });

    const revealWithAnimation = (event: Event, underLyingCanvas: HTMLCanvasElement) => {
      if(!('clientX' in event && 'clientY' in event)) return false;
      const bcr = canvas.getBoundingClientRect();

      const rectX = event.clientX as number - bcr.left;
      const rectY = event.clientY as number - bcr.top;
      let transX = rectX, transY = rectY;

      if(Number(rotate) + Number(flipX) === 1) {
        transX = bcr.width - rectX;
      }
      if(Number(rotate) + Number(flipY) === 1) {
        transY = bcr.height - rectY;
      }

      const distToMargin = Math.max(
        Math.hypot(rectX, rectY),
        Math.hypot(bcr.width - rectX, rectY),
        Math.hypot(rectX, bcr.height - rectY),
        Math.hypot(bcr.width - rectX, bcr.height - rectY)
      );
      const maxDist = distToMargin * dpr + 50;
      const duration = 800 + (400/* px/ms */ - distToMargin);

      this.connection?.postMessage({
        type: 'media-reveal',
        id,
        coords: {x: transX * dpr, y: transY * dpr},
        maxDist,
        duration
      });

      const underLyingCtx = underLyingCanvas.getContext('2d');
      const underlyingCanvasClickCoords = {
        x: rectX * underLyingCanvas.width / bcr.width,
        y: rectY * underLyingCanvas.height / bcr.height
      };
      const maxDistUnderlyingCanvas = maxDist / canvas.width * underLyingCanvas.width;

      const deferred = deferredPromise<void>();

      animateValue(0, 1, duration,
        (v) => {
          drawClippingCircle(underLyingCtx, v, underlyingCanvasClickCoords, maxDistUnderlyingCanvas, dpr);
        },
        {
          onEnd: () => void deferred.resolve(),
          easing: simpleEasing
        }
      );

      return deferred;
    };

    const result = {
      canvas,
      readyResult: width && this.mediaWorkerReady,
      revealWithAnimation
    };

    this.createdImageSpoilers.set(canvas, result);

    return result;
  }

  public static getImageSpoilerByElement(element: HTMLElement) {
    return this.createdImageSpoilers.get(element as HTMLCanvasElement);
  }

  private static getTextSpoilerInstance() {
    if(this.textSpoilerInstance) return this.textSpoilerInstance;

    const instance = this.textSpoilerInstance = new DotRenderer();

    /**
     * Bigger DPR will make a visible separation between drawn chunks (when text spoilers are huge)
     * Do not make this bigger, unless there is a way to mirror the dot on the other side when it is close to some margin
     */
    instance.dpr = Math.min(2, window.devicePixelRatio);
    instance.resize(TEXT_SPOILER_WIDTH, TEXT_SPOILER_HEIGHT, undefined, getTextSpoilerConfig(instance.dpr));

    MOUNT_CLASS_TO.textSpoilerRenderer = instance;

    return instance;
  }

  public static attachTextSpoilerTarget({
    middleware,
    animationGroup,
    canvas,
    draw,
    observeElement = canvas,
    onDestroy
  }: {
    canvas: HTMLCanvasElement,
    draw: () => void,
    middleware?: Middleware,
    animationGroup: AnimationItemGroup,
    observeElement?: HTMLElement,
    onDestroy?: () => void
  }) {
    const instance = this.getTextSpoilerInstance();

    ++instance.targetCanvasesCount;

    const animation = new AnimationItemNested({
      onPlay: () => {
        instance.drawCallbacks.set(canvas, draw);
        instance.play();
      },
      onPause: () => {
        instance.drawCallbacks.delete(canvas);
        if(!instance.drawCallbacks.size) {
          instance.pause();
        }
      },
      onDestroy: () => {
        if(!--instance.targetCanvasesCount) {
          instance.remove();
          this.textSpoilerInstance = undefined;
        }
        onDestroy?.();
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: animationGroup,
      observeElement,
      controlled: middleware,
      type: 'dots'
    });

    return {
      animation,
      sourceCanvas: instance.canvas,
      dpr: instance.dpr,
      readyResult: instance.init()
    };
  }

  /**
   * The worker counterpart of attachTextSpoilerTarget: the overlay canvas is
   * transferred to the worker, which draws and animates it from pushed geometry —
   * the DOM measurements stay on the main thread (see MessageSpoilerOverlay)
   */
  public static attachTextSpoilerOverlay({
    canvas,
    middleware,
    animationGroup,
    observeElement = canvas,
    onDestroy
  }: {
    canvas: HTMLCanvasElement,
    middleware?: Middleware,
    animationGroup: AnimationItemGroup,
    observeElement?: HTMLElement,
    onDestroy?: () => void
  }) {
    const connection = this.retainConnection();
    this.initTextSim();

    const id = ++this.createdIndex;
    const dpr = Math.min(2, window.devicePixelRatio);
    const offscreen = canvas.transferControlToOffscreen();
    connection.postMessage({type: 'overlay-attach', id, canvas: offscreen, dpr}, [offscreen]);

    const animation = new AnimationItemNested({
      onPlay: () => this.connection?.postMessage({type: 'overlay-play', id}),
      onPause: () => this.connection?.postMessage({type: 'overlay-pause', id}),
      onDestroy: () => {
        this.connection?.postMessage({type: 'overlay-detach', id});
        this.releaseConnection();
        onDestroy?.();
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: animationGroup,
      observeElement,
      controlled: middleware,
      type: 'dots'
    });

    return {
      animation,
      dpr,
      readyResult: this.textWorkerReady,
      overlay: {
        update: (payload: Omit<SpoilerOverlayUpdate, 'type' | 'id'>) => this.connection?.postMessage({type: 'overlay-update', id, ...payload}),
        unwrap: (coords: [number, number], maxDist: number, duration: number) => this.connection?.postMessage({type: 'overlay-unwrap', id, coords, maxDist, duration}),
        wrap: (duration: number) => this.connection?.postMessage({type: 'overlay-wrap', id, duration}),
        reset: () => this.connection?.postMessage({type: 'overlay-reset', id}),
        clear: () => this.connection?.postMessage({type: 'overlay-clear', id})
      }
    };
  }

  public static attachBluffTextSpoilerTarget(element: HTMLElement, textColor?: ValueOrGetter<CustomProperty>) {
    // * a reconnect must repaint with the CURRENT color, so it re-attaches without one
    BluffSpoilerController.observeReconnection(element, (el) => this.attachBluffTextSpoilerTarget(el));
    if(textColor !== undefined) {
      this.inlineSpoilerTextColors.set(element, textColor);
    }

    const canvas = element.querySelector<HTMLCanvasElement>('.bluff-spoiler-canvas');
    if(!canvas) return;

    if(BluffSpoilerController.isWorkerSimSupported()) {
      this.attachBluffTextSpoilerTargetWithWorker(element, canvas);
    } else {
      this.attachBluffTextSpoilerTargetOnMain(element, canvas);
    }
  }

  // * the color outlives the target it was rendered on: the element can be detached and
  // * reconnected (see BluffSpoilerController), the recolored spoiler must survive that
  private static inlineSpoilerTextColors = new WeakMap<HTMLElement, ValueOrGetter<CustomProperty>>();
  private static inlineSpoilerUpdates = new Map<HTMLElement, () => void>();
  private static onInlineAppearanceUpdate = () => this.inlineSpoilerUpdates.forEach((update) => update());

  private static watchInlineSpoiler(element: HTMLElement, update: () => void) {
    const wasEmpty = !this.inlineSpoilerUpdates.size;
    this.inlineSpoilerUpdates.set(element, update);
    const unobserve = observeResize(element, update);
    if(wasEmpty) {
      rootScope.addEventListener('theme_changed', this.onInlineAppearanceUpdate);
      rootScope.addEventListener('chat_background_set', this.onInlineAppearanceUpdate);
    }

    return () => {
      unobserve();
      this.inlineSpoilerUpdates.delete(element);
      if(!this.inlineSpoilerUpdates.size) {
        rootScope.removeEventListener('theme_changed', this.onInlineAppearanceUpdate);
        rootScope.removeEventListener('chat_background_set', this.onInlineAppearanceUpdate);
      }
    };
  }

  /**
   * Recolor the already rendered spoilers inside `container` — for text that is
   * repainted by CSS alone (e.g. a chat list row becoming active), the same way
   * `CustomEmojiRendererElement.setTextColor` recolors the custom emoji next to them.
   */
  public static setInlineSpoilersTextColor(container: HTMLElement, textColor: ValueOrGetter<CustomProperty>) {
    this.inlineSpoilerUpdates.forEach((update, element) => {
      if(this.inlineSpoilerTextColors.get(element) === textColor || !container.contains(element)) {
        return;
      }

      this.inlineSpoilerTextColors.set(element, textColor);
      update();
    });
  }

  private static getInlineSpoilerParticleColor(element: HTMLElement) {
    // * without a color passed down, fall back to whatever the text around it ended up being
    const property = readValue(this.inlineSpoilerTextColors.get(element));
    return property ? customProperties.getPropertyAsColor(property) : getComputedStyle(element).color;
  }

  private static getBluffTextSpoilerState(element: HTMLElement, canvas: HTMLCanvasElement, dpr: number) {
    const bounds = element.getBoundingClientRect();
    if(!bounds.width || !bounds.height) return;

    canvas.style.width = bounds.width + 'px';
    canvas.style.height = bounds.height + 'px';

    const canvasBounds = canvas.getBoundingClientRect();
    const currentLeft = parseFloat(canvas.style.left) || 0;
    const currentTop = parseFloat(canvas.style.top) || 0;
    canvas.style.left = currentLeft + bounds.left - canvasBounds.left + 'px';
    canvas.style.top = currentTop + bounds.top - canvasBounds.top + 'px';

    const rects: SpoilerOverlayRect[] = adjustSpaceBetweenCloseRects(
      toDOMRectArray(element.getClientRects()).map((rect) => getInnerCustomRect(bounds, rect))
    );

    return {
      width: Math.round(bounds.width * dpr),
      height: Math.round(bounds.height * dpr),
      rects,
      backgroundColor: 'transparent',
      particleColor: this.getInlineSpoilerParticleColor(element)
    };
  }

  private static attachBluffTextSpoilerTargetWithWorker(element: HTMLElement, canvas: HTMLCanvasElement) {
    let destroyed = false;
    const target = this.attachTextSpoilerOverlay({
      canvas,
      animationGroup: 'BLUFF-SPOILER',
      observeElement: element,
      onDestroy: () => {
        destroyed = true;
        unwatch?.();
        element.classList.remove('is-visible');
        canvas.replaceWith(canvas.cloneNode(false));
      }
    });

    const update = () => {
      const state = this.getBluffTextSpoilerState(element, canvas, target.dpr);
      if(state) target.overlay.update(state);
    };
    const unwatch = this.watchInlineSpoiler(element, update);

    callbackify(target.readyResult, () => {
      if(destroyed) return;
      update();
      requestAnimationFrame(() => !destroyed && element.classList.add('is-visible'));
    });

    requestAnimationFrame(() => !destroyed && update());
  }

  private static attachBluffTextSpoilerTargetOnMain(element: HTMLElement, canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    let state: Omit<SpoilerOverlayUpdate, 'type' | 'id'>;
    let destroyed = false;

    const draw = () => {
      const {sourceCanvas, dpr} = target;
      if(!state || !sourceCanvas) return;

      context.clearRect(0, 0, canvas.width, canvas.height);

      for(const rect of state.rects) {
        const x = rect.left * dpr;
        const y = rect.top * dpr;
        const width = rect.width * dpr;
        const height = rect.height * dpr;

        drawImageFromSource(context, sourceCanvas, x, y, width, height, x, y, width, height);
        applyColorOnContext(context, state.particleColor, x, y, width, height);
      }

      element.classList.add('is-visible');
    };

    const update = () => {
      const newState = this.getBluffTextSpoilerState(element, canvas, target.dpr);
      if(!newState) return;

      state = newState;
      if(canvas.width !== state.width || canvas.height !== state.height) {
        canvas.width = state.width;
        canvas.height = state.height;
      }
      draw();
    };
    const target = this.attachTextSpoilerTarget({
      canvas,
      draw,
      animationGroup: 'BLUFF-SPOILER',
      observeElement: element,
      onDestroy: () => {
        destroyed = true;
        unwatch?.();
        element.classList.remove('is-visible');
      }
    });
    const unwatch = this.watchInlineSpoiler(element, update);

    callbackify(target.readyResult, () => !destroyed && update());

    requestAnimationFrame(() => !destroyed && update());
  }
}

MOUNT_CLASS_TO['DotRenderer'] = DotRenderer;
