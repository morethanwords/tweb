// * thanks https://github.com/dkaraush/particles for webgl version

import {MOUNT_CLASS_TO} from '@config/debug';
import {animate} from '@helpers/animation';
import callbackify from '@helpers/callbackify';
import deferredPromise from '@helpers/cancellablePromise';
import {Middleware} from '@helpers/middleware';
import getUnsafeRandomInt from '@helpers/number/getUnsafeRandomInt';
import {applyColorOnContext} from '@lib/rlottie/rlottiePlayer';
import animationIntersector, {AnimationItemGroup, AnimationItemWrapper} from '@components/animationIntersector';
import BluffSpoilerController from '@components/bluffSpoilerController';
import DotRendererCore, {buildDotRendererConfig, drawClippingCircle, getDefaultParticlesCount, DotRendererConfig, DotRendererShaderURLs} from '@components/dotRendererCore';
import {retainSpoilerRenderer, SpoilerRendererConnection} from '@components/spoilerRendererConnection';
import {animateValue, simpleEasing} from '@helpers/animateValue';
import {CancellablePromise} from '@helpers/cancellablePromise';

const SHADER_URLS: DotRendererShaderURLs = {
  vertex: 'assets/img/spoiler_vertex.glsl',
  fragment: 'assets/img/spoiler_fragment.glsl'
};

const TEXT_SPOILER_WIDTH = 240;
const TEXT_SPOILER_HEIGHT = 120;
const IMAGE_SPOILER_SIZE = 480;

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
        Math.hypot(bcr.width - rectX, bcr.height - rectY),
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

  private static mediaConnection: SpoilerRendererConnection;
  private static mediaWorkerReady: CancellablePromise<void>;
  private static mediaTargetsCount = 0;

  private static getMediaConnection() {
    if(this.mediaConnection) return this.mediaConnection;

    this.mediaWorkerReady = deferredPromise<void>();
    const connection = this.mediaConnection = retainSpoilerRenderer((message) => {
      if(message.type === 'media-inited') {
        this.mediaWorkerReady?.resolve();
      }
    });

    const dpr = window.devicePixelRatio;
    connection.postMessage({
      type: 'media-init',
      width: IMAGE_SPOILER_SIZE,
      height: IMAGE_SPOILER_SIZE,
      dpr,
      config: buildDotRendererConfig(IMAGE_SPOILER_SIZE, IMAGE_SPOILER_SIZE, dpr),
      vertexURL: new URL(SHADER_URLS.vertex, window.location.href).href,
      fragmentURL: new URL(SHADER_URLS.fragment, window.location.href).href
    });

    return connection;
  }

  private static destroyMediaWorker() {
    if(!this.mediaConnection) return;
    this.mediaConnection.release();
    this.mediaConnection = undefined;
    this.mediaWorkerReady = undefined;
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
    const connection = this.getMediaConnection();
    const dpr = window.devicePixelRatio;
    const {canvas, rotate, flipX, flipY} = this.createTargetCanvas(width, height, dpr);
    const id = this.createdIndex;

    const simSize = IMAGE_SPOILER_SIZE * dpr;
    const x = getUnsafeRandomInt(0, simSize - canvas.width);
    const y = getUnsafeRandomInt(0, simSize - canvas.height);

    ++this.mediaTargetsCount;
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
      onPlay: () => this.mediaConnection?.postMessage({type: 'media-play', id}),
      onPause: () => this.mediaConnection?.postMessage({type: 'media-pause', id}),
      onDestroy: () => {
        this.mediaConnection?.postMessage({type: 'media-detach', id});
        if(!--this.mediaTargetsCount) {
          this.destroyMediaWorker();
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

      this.mediaConnection?.postMessage({
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
    draw
  }: {
    canvas: HTMLCanvasElement,
    draw: () => void,
    middleware: Middleware,
    animationGroup: AnimationItemGroup,
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
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: animationGroup,
      observeElement: canvas,
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

  public static attachBluffTextSpoilerTarget(element: HTMLElement) {
    BluffSpoilerController.observeReconnection(element, (el) => this.attachBluffTextSpoilerTarget(el));

    ++BluffSpoilerController.instancesCount;

    // The whole rendering (simulation + encoding) runs inside a worker, the main
    // thread only receives ready mask URLs
    if(BluffSpoilerController.isWorkerSimSupported()) {
      const dpr = Math.min(2, window.devicePixelRatio);
      BluffSpoilerController.setupWorkerSim({
        width: TEXT_SPOILER_WIDTH,
        height: TEXT_SPOILER_HEIGHT,
        dpr,
        config: buildDotRendererConfig(TEXT_SPOILER_WIDTH, TEXT_SPOILER_HEIGHT, dpr, getTextSpoilerConfig(dpr)),
        vertexURL: new URL(SHADER_URLS.vertex, window.location.href).href,
        fragmentURL: new URL(SHADER_URLS.fragment, window.location.href).href
      });

      const animation = new AnimationItemNested({
        onPlay: () => BluffSpoilerController.activate(element),
        onPause: () => BluffSpoilerController.deactivate(element),
        onDestroy: () => {
          if(!--BluffSpoilerController.instancesCount) {
            BluffSpoilerController.destroy();
          }
        }
      });

      animationIntersector.addAnimation({
        animation,
        group: 'BLUFF-SPOILER',
        // controlled: true, // should not be controlled! elements might reappear in the DOM after being removed
        observeElement: element,
        type: 'dots'
      });

      return;
    }

    const instance = this.getTextSpoilerInstance();

    ++instance.targetCanvasesCount;

    const animation = new AnimationItemNested({
      onPlay: () => {
        instance.drawCallbacks.set(element, () => BluffSpoilerController.draw(element, instance.canvas));
        instance.play();
      },
      onPause: () => {
        instance.drawCallbacks.delete(element);
        if(!instance.drawCallbacks.size) {
          instance.pause();
        }
      },
      onDestroy: () => {
        if(!--instance.targetCanvasesCount) {
          instance.remove();
          this.textSpoilerInstance = undefined;
        }
        if(!--BluffSpoilerController.instancesCount) {
          BluffSpoilerController.destroy();
        }
      }
    });

    animationIntersector.addAnimation({
      animation,
      group: 'BLUFF-SPOILER',
      // controlled: true, // should not be controlled! elements might reappear in the DOM after being removed
      observeElement: element,
      type: 'dots'
    });

    instance.init();
  }
}
