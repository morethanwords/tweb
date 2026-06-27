import type {AnimationItemGroup, AnimationItemWrapper} from '@components/animationIntersector';
import type {Middleware} from '@helpers/middleware';
import type {LiteModeKey} from '@helpers/liteMode';
import IS_APPLE_MX from '@environment/appleMx';
import {IS_ANDROID, IS_APPLE_MOBILE, IS_APPLE, IS_SAFARI} from '@environment/userAgent';
import EventListenerBase from '@helpers/eventListenerBase';
import {doubleRaf} from '@helpers/schedulers';
import mediaSizes from '@helpers/mediaSizes';
import clamp from '@helpers/number/clamp';
import rlottieMessagePort, {RLottieOffscreenInit, RLottieWorkerMethods} from '@lib/rlottie/rlottieMessagePort';
import SHOULD_RENDER_OFFSCREEN from '@lib/rlottie/shouldRenderOffscreen';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import framesCache, {FramesCache, FramesCacheItem} from '@helpers/framesCache';
import customProperties from '@helpers/dom/customProperties';
import readValue from '@helpers/solid/readValue';
import applyColorOnContext, {RLottieColor, rlottieColorToString} from '@helpers/canvas/applyColorOnContext';
import {ensureDecodeChannel} from '@lib/customEmoji/compositorChannels';

export type RLottieOptions = {
  container: HTMLElement | HTMLElement[],
  middleware?: Middleware,
  canvas?: HTMLCanvasElement,
  autoplay?: boolean,
  animationData: Blob,
  loop?: RLottiePlayer['loop'],
  width?: number,
  height?: number,
  group?: AnimationItemGroup,
  noCache?: boolean,
  needUpscale?: boolean,
  skipRatio?: number,
  initFrame?: number, // index
  color?: RLottieColor,
  textColor?: WrapSomethingOptions['textColor'],
  name?: string,
  skipFirstFrameRendering?: boolean,
  toneIndex?: number,
  sync?: boolean,
  liteModeKey?: LiteModeKey,
  noOffscreen?: boolean,
  compositorDelivery?: boolean
};

export {applyColorOnContext};
export type {RLottieColor};

export function getLottiePixelRatio(width: number, height: number, needUpscale?: boolean) {
  let pixelRatio = clamp(window.devicePixelRatio, 1, 2);
  if(pixelRatio > 1 && !needUpscale) {
    if(width > 90 && height > 90) {
      if(!IS_APPLE && mediaSizes.isMobile) {
        pixelRatio = 1;
      }
    } else if((width > 60 && height > 60) || IS_ANDROID) {
      pixelRatio = Math.max(1.5, pixelRatio - 1.5);
    }
  }

  return pixelRatio;
}

export type RLottiePlayerEvents = {
  enterFrame: (frameNo: number) => void,
  ready: () => void,
  firstFrame: () => void,
  cached: () => void,
  destroy: () => void
};

// doubleRaf cycles ensurePresented waits after the present ack before reporting the frame on screen
// (see ensurePresented). Empirically tuned against the no-blink e2e test.
const PRESENT_PAINT_WAITS = 3;

export default class RLottiePlayer extends EventListenerBase<RLottiePlayerEvents> implements AnimationItemWrapper {
  public static CACHE = framesCache;

  public reqId: number;
  public offscreen: 'canvas' | 'emoji' | false = false;
  public workerId: number;
  private _curFrame: number;
  private frameCount: number;
  private fps: number;
  private skipDelta: number;
  public name: string;
  public cacheName: string;
  private toneIndex: number;

  public width = 0;
  public height = 0;

  public el: HTMLElement[];
  public canvas: HTMLCanvasElement[];
  public contexts: CanvasRenderingContext2D[];

  public destroyed = false;
  public paused = true;
  // public paused = false;
  public direction = 1;
  private speed = 1;
  public autoplay = true;
  public _autoplay: boolean; // ! will be used to store original value for settings.stickers.loop
  public loop: number | boolean = true;
  public _loop: RLottiePlayer['loop']; // ! will be used to store original value for settings.stickers.loop
  public group: AnimationItemGroup = '';
  public liteModeKey: LiteModeKey;

  private frInterval: number;
  private frThen: number;
  private rafId: number;

  // private caching = false;
  // private removed = false;

  private cache: FramesCacheItem;
  private imageData: ImageData;
  public clamped: Uint8ClampedArray;
  private cachingDelta = 0;

  private initFrame: number;
  private color: RLottieOptions['color'];
  private textColor: RLottieOptions['textColor'];

  public minFrame: number;
  public maxFrame: number;

  private playedTimes = 0;

  private currentMethod: RLottiePlayer['mainLoopForwards'] | RLottiePlayer['mainLoopBackwards'];
  private frameListener: (currentFrame: number) => void;
  private skipFirstFrameRendering: boolean;
  private playToFrameOnFrameCallback: (frameNo: number) => void;

  public overrideRender: (frame: ImageData | HTMLCanvasElement | ImageBitmap) => void;
  private renderedFirstFrame: boolean;

  private raw: boolean;
  private clearCacheOnRafId: number;

  private offscreenCanvases: OffscreenCanvas[];
  private offscreenLoadFailed: boolean;
  private pixelRatio: number;

  private freeRunning: boolean;
  private freeRunBarred: boolean;
  private freeRunEpoch: {frame: number, time: number};

  constructor({el, options}: {
    el: RLottiePlayer['el'],
    options: RLottieOptions
  }) {
    super(true);

    this.reqId = rlottieMessagePort.getNextTaskId();
    this.workerId = rlottieMessagePort.getNextWorkerIndex();
    this.el = el;

    for(const i in options) {
      if(this.hasOwnProperty(i)) {
        // @ts-ignore
        this[i] = options[i];
      }
    }

    this._loop = this.loop;
    this._autoplay = this.autoplay;

    // ! :(
    this.initFrame = options.initFrame;
    this.color = options.color;
    this.textColor = options.textColor;
    this.name = options.name;
    this.skipFirstFrameRendering = options.skipFirstFrameRendering;
    this.toneIndex = options.toneIndex;
    this.raw = false;
    this.liteModeKey = options.liteModeKey;

    if(this.name) {
      this.cacheName = RLottiePlayer.CACHE.generateName(
        this.name,
        this.width,
        this.height,
        this.color,
        this.toneIndex
      );
    }

    const eligible = SHOULD_RENDER_OFFSCREEN &&
      !options.noOffscreen &&
      !options.canvas && // RLottieIcon shares ONE caller canvas across players
      !this.raw;
    this.offscreen = !eligible ? false : (options.sync ? (options.compositorDelivery ? 'emoji' : false) : 'canvas');
    if(this.offscreen && this.cacheName) {
      this.workerId = rlottieMessagePort.getWorkerIndexForName(this.cacheName); // cache-affine routing, cross-tab sharing for free
    }

    // * Skip ratio (30fps)
    let skipRatio: number;
    if(options.skipRatio !== undefined) skipRatio = options.skipRatio;
    else if(
      (IS_ANDROID || IS_APPLE_MOBILE || (IS_APPLE && !IS_SAFARI && !IS_APPLE_MX)) &&
      this.width < 100 &&
      this.height < 100 &&
      !options.needUpscale
    ) {
      skipRatio = 0.5;
    }

    this.skipDelta = skipRatio !== undefined ? 1 / skipRatio | 0 : 1;

    // options.needUpscale = true;

    // * Pixel ratio
    const pixelRatio = this.pixelRatio = getLottiePixelRatio(this.width, this.height, options.needUpscale);

    this.width = Math.round(this.width * pixelRatio);
    this.height = Math.round(this.height * pixelRatio);

    // options.noCache = true;

    // * Cache frames params
    if(!options.noCache/*  && false */) {
      // проверка на размер уже после скейлинга, сделано для попапа и сайдбара, где стикеры 80х80 и 68х68, туда нужно 75%
      if(IS_APPLE && this.width > 100 && this.height > 100) {
        this.cachingDelta = 2; // 2 // 50%
      } else if(this.width < 100 && this.height < 100) {
        this.cachingDelta = Infinity; // 100%
      } else {
        this.cachingDelta = 4; // 75%
      }
    }

    // this.cachingDelta = Infinity;
    // this.cachingDelta = 0;
    // if(isApple) {
    //   this.cachingDelta = 0; //2 // 50%
    // }

    if(this.offscreen === 'emoji') {
      this.canvas = []; // pixels live on the compositor's renderer canvas, never on own canvases
    } else if(!this.canvas) {
      this.canvas = this.createCanvases(pixelRatio);

      if(this.offscreen) {
        this.offscreenCanvases = this.canvas.map((canvas) => {
          canvas.dataset.offscreen = '1';
          return canvas.transferControlToOffscreen();
        });
      }
    }

    if(this.offscreen) {
      this.contexts = [];
      this.cache = FramesCache.createCache(); // offscreen players never touch the UI framesCache
    } else {
      this.initLegacySurfaces();
    }
  }

  private createCanvases(pixelRatio: number) {
    return this.el.map(() => {
      const canvas = document.createElement('canvas');
      canvas.classList.add('rlottie');
      canvas.width = this.width;
      canvas.height = this.height;
      canvas.dpr = pixelRatio;
      return canvas;
    });
  }

  // legacy surface state: contexts + raw-path buffers + UI-cache binding;
  // shared by the constructor and the offscreen-load retry belt so they cannot drift
  private initLegacySurfaces() {
    this.contexts = this.canvas.map((canvas) => canvas.getContext('2d'));

    if(!IS_IMAGE_BITMAP_SUPPORTED || this.raw) {
      this.imageData = new ImageData(this.width, this.height);
      this.clamped = new Uint8ClampedArray(this.width * this.height * 4);
    }

    if(this.name) {
      this.cache = RLottiePlayer.CACHE.getCache(this.cacheName);
    } else {
      this.cache ??= FramesCache.createCache();
    }
  }

  public setSize(width: number, height: number) {
    this.width = width;
    this.height = height;

    if(this.offscreen) { // writing a transferred placeholder's .width throws
      this.sendQueryVoid('resizeCanvases', {width, height});
      return;
    }

    this.canvas.forEach((canvas) => {
      canvas.width = width;
      canvas.height = height;
    });
  }

  private clearCache() {
    if(this.offscreen) {
      this.sendQueryVoid('clearFramesCache');
      return;
    }

    if(this.cachingDelta === Infinity) {
      return;
    }

    if(this.cacheName && this.cache.counter > 1) { // skip clearing because same sticker can be still visible
      return;
    }

    this.cache.clearCache();
  }

  public clearCacheWhenSafe() {
    if(this.offscreen) { // the worker protects the staged bitmap - no rafId deferral needed
      this.clearCache();
      return;
    }

    if(this.rafId) { // * fix early cache clearing
      this.clearCacheOnRafId = this.rafId;
    } else {
      this.clearCache();
    }
  }

  public sendQuery<T extends keyof RLottieWorkerMethods>(
    method: T,
    payload?: Omit<Parameters<RLottieWorkerMethods[T]>[0], 'reqId'>,
    transfer?: Transferable[]
  ): Promise<Awaited<ReturnType<RLottieWorkerMethods[T]>>> {
    return rlottieMessagePort.invokeRLottie(
      this.workerId,
      method,
      {...payload, reqId: this.reqId},
      transfer
    ) as any;
  }

  public sendQueryVoid<T extends keyof RLottieWorkerMethods>(
    method: T,
    payload?: Omit<Parameters<RLottieWorkerMethods[T]>[0], 'reqId'>,
    transfer?: Transferable[]
  ) {
    rlottieMessagePort.invokeRLottieVoid(
      this.workerId,
      method,
      {...payload, reqId: this.reqId} as any,
      transfer
    );
  }

  public exportFrame(frameNo?: number) {
    return this.sendQuery('exportFrame', {frameNo});
  }

  public nudgePresent() {
    if(this.offscreen === 'canvas' && this.renderedFirstFrame) {
      this.sendQueryVoid('presentFrame', {frameNo: this.curFrame});
    }
  }

  // Resolve once the current frame is on the placeholder canvas, so a caller can drop the underlay
  // (instantly, no fade) without flashing a blank cell. Re-present the staged frame (a commit made
  // while the canvas was DETACHED can be lost) and wait for the worker ack, then wait a few of the
  // tab's own paints - the SharedWorker pushes the placeholder some frames after the ack and there's
  // no event for it, so PRESENT_PAINT_WAITS is the empirical margin that clears that gap (validated
  // by the no-blink e2e test). Non-offscreen players paint synchronously, so they resolve at once.
  public async ensurePresented(): Promise<void> {
    if(this.offscreen !== 'canvas' || !this.renderedFirstFrame || this.destroyed) {
      return;
    }

    await this.sendQuery('presentFrame', {frameNo: this._curFrame}).catch(() => {});
    for(let i = 0; i < PRESENT_PAINT_WAITS && !this.destroyed; ++i) {
      await doubleRaf();
    }
  }

  public get hasRenderedFirstFrame() {
    return this.renderedFirstFrame;
  }

  private getResolvedColor(): string {
    if(this.color) {
      return rlottieColorToString(this.color);
    }

    if(this.textColor) {
      return customProperties.getPropertyAsColor(readValue(this.textColor));
    }
  }

  private sendColorToWorker(reTint: boolean) {
    this.sendQueryVoid('setColor', {color: this.getResolvedColor(), reTint});
  }

  public loadFromData(data: RLottieOptions['animationData']) {
    if(this.offscreen === 'emoji') {
      // FIFO: the compositor port rides the same UI->worker port as this loadFromData,
      // so the worker holds it before this item's first frame
      ensureDecodeChannel(this.workerId);
    }

    const offscreen: RLottieOffscreenInit = this.offscreen ? {
      canvases: this.offscreenCanvases || [],
      cacheName: this.cacheName,
      cachingDelta: this.cachingDelta, // Apple heuristics ship unchanged
      color: this.getResolvedColor(),
      compositorDelivery: this.offscreen === 'emoji' || undefined
    } : undefined;
    const transfer = offscreen?.canvases.length ? offscreen.canvases.slice() : undefined;
    this.offscreenCanvases = undefined;

    this.sendQuery('loadFromData', {
      blob: data,
      width: this.width,
      height: this.height,
      toneIndex: this.toneIndex,
      raw: this.raw,
      offscreen
    }, transfer).then(({frameCount, fps}) => {
      if(this.destroyed) {
        return;
      }

      this.onLoad(frameCount, fps);
    }).catch((err) => {
      if(this.offscreen && !this.offscreenLoadFailed && !this.destroyed) {
        // belt: retry once in legacy mode with fresh canvases (safe - nothing is DOM-appended before firstFrame)
        console.error('offscreen loadFromData error, retrying legacy:', err, this);
        this.offscreenLoadFailed = true;
        this.sendQuery('destroy');
        this.reqId = rlottieMessagePort.getNextTaskId();
        this.offscreen = false;
        this.canvas = this.createCanvases(this.pixelRatio);
        this.initLegacySurfaces();
        this.loadFromData(data);
        return;
      }

      console.error(err, data, this);
      throw err;
    });
  }

  public get curFrame() {
    return this.freeRunning ? this.estimateFreeRunFrame() : this._curFrame;
  }

  public set curFrame(frame: number) {
    this.downgradeFreeRun(); // an external frame write needs the UI clock back
    this._curFrame = frame;
  }

  public addEventListener<T extends keyof RLottiePlayerEvents>(
    name: T,
    callback: RLottiePlayerEvents[T],
    options?: boolean | AddEventListenerOptions
  ) {
    super.addEventListener(name, callback, options);

    // live trigger: an external enterFrame consumer needs the UI clock back
    if(name === 'enterFrame' && this.freeRunning && (callback as any) !== this.frameListener) {
      this.downgradeFreeRun();
    }
  }

  private hasExternalEnterFrameListeners() {
    const listeners = this.listeners.enterFrame;
    if(!listeners) {
      return false;
    }

    for(const listener of listeners) {
      if(listener.callback !== this.frameListener) {
        return true;
      }
    }

    return false;
  }

  private canFreeRun() {
    return !!this.offscreen &&
      !this.freeRunBarred &&
      typeof this.loop === 'boolean' && // boolean loops free-run in the worker (true = wrap, false = stop at the bound); a numeric loop now terminates after its count, so it stays on the UI clock where onLap does the counting
      this.renderedFirstFrame &&
      !this.hasExternalEnterFrameListeners();
  }

  // the worker clock died on an error - downgrade to command mode (fully functional,
  // one void postMessage per frame) and never re-engage this player
  public onFreeRunStopped(curFrame: number, error: string) {
    if(!this.freeRunning || this.destroyed) {
      return;
    }

    console.error('RLottie free-run stopped, falling back to command mode:', error, this);
    this.freeRunBarred = true;
    this.freeRunning = false;
    this.freeRunEpoch = undefined;
    this._curFrame = curFrame;
    if(!this.paused) {
      this.setMainLoop();
    }
  }

  // the worker clock reached the end of a play-once animation - settle into the same
  // paused, end-of-play state command mode lands in via onLap's !loop branch
  public onFreeRunEnded(curFrame: number) {
    if(!this.freeRunning || this.destroyed) {
      return;
    }

    this.freeRunning = false;
    this.freeRunEpoch = undefined;
    this._curFrame = curFrame;
    ++this.playedTimes;
    this.autoplay = false; // mirror command-mode end-of-play (mainLoop's `!canContinue` branch): a
    // finished play-once must not stay autoplay, or animationIntersector re-plays it on every
    // scroll/visibility tick (paused && autoplay && visible → safePlay) → re-engage/end churn
    this.pause(false); // freeRunning already cleared, so downgradeFreeRun no-ops
    this.clearCacheWhenSafe();
  }

  private estimateFreeRunFrame() {
    const epoch = this.freeRunEpoch;
    if(!epoch || !this.frInterval) {
      return this._curFrame;
    }

    const ticks = (Date.now() - epoch.time) / this.frInterval | 0;
    const {skipDelta, minFrame, maxFrame} = this;
    if(!(maxFrame >= minFrame) || !(skipDelta > 0)) {
      return epoch.frame;
    }

    // mirror the worker's lap arithmetic exactly (advance by skipDelta, snap to the
    // opposite bound when exceeding) - a plain modulo drifts when skipDelta doesn't
    // divide the range
    const forwards = this.direction === 1;
    const ticksToWrap = Math.floor((forwards ? maxFrame - epoch.frame : epoch.frame - minFrame) / skipDelta) + 1;
    if(ticks < ticksToWrap) {
      return epoch.frame + ticks * skipDelta * this.direction;
    }

    if(!this.loop) { // play-once parks at the far bound; truthy loops (incl. numeric) wrap
      return forwards ? maxFrame : minFrame;
    }

    const lapTicks = Math.floor((maxFrame - minFrame) / skipDelta) + 1;
    const offset = ((ticks - ticksToWrap) % lapTicks) * skipDelta;
    return forwards ? minFrame + offset : maxFrame - offset;
  }


  private engageFreeRun() {
    const frame = this._curFrame = this.curFrame; // collapses the estimate when re-engaging
    this.freeRunning = true;
    this.freeRunEpoch = {frame, time: Date.now()};
    this.sendQueryVoid('playFreeRun', {
      curFrame: frame,
      frInterval: this.frInterval,
      skipDelta: this.skipDelta,
      direction: this.direction,
      minFrame: this.minFrame,
      maxFrame: this.maxFrame,
      loop: !!this.loop // only booleans free-run (canFreeRun gate): true (infinite) wraps in the worker, false (play-once) ends at the bound - mirrors command mode's `loop ? min : max`
    });
  }

  private downgradeFreeRun() {
    if(!this.freeRunning) {
      return;
    }

    const estimated = this._curFrame = this.estimateFreeRunFrame();
    this.freeRunning = false;

    if(this.destroyed) {
      return; // the destroy query tears the worker clock down
    }

    this.sendQuery('pauseFreeRun').then((result) => {
      if(this.destroyed || this.freeRunning) {
        return;
      }

      if(result?.curFrame !== undefined && this._curFrame === estimated) {
        this._curFrame = result.curFrame; // exact reconcile unless something moved the frame meanwhile
      }

      if(!this.paused) {
        this.setMainLoop(); // resume command mode from the reconciled frame
      }
    });
  }

  private updateFreeRunParams() {
    this._curFrame = this.estimateFreeRunFrame(); // estimate under the OLD cadence first
    this.frInterval = 1000 / this.fps / this.speed * this.skipDelta;
    this.freeRunEpoch = {frame: this._curFrame, time: Date.now()};
    this.sendQueryVoid('updateFreeRun', {
      frInterval: this.frInterval,
      direction: this.direction,
      minFrame: this.minFrame,
      maxFrame: this.maxFrame
    });
  }

  public onPlaybackParamsMutated() {
    if(this.freeRunning && this.loop !== true) {
      this.downgradeFreeRun();
    }
  }

  public play() {
    if(!this.paused) {
      return;
    }

    this.paused = false;
    this.setMainLoop();
  }

  public pause(clearPendingRAF = true) {
    if(this.paused) {
      return;
    }

    this.paused = true;
    this.downgradeFreeRun(); // no-op unless free-running; freezes the estimate + exact reconcile on ack
    if(clearPendingRAF) {
      clearTimeout(this.rafId);
      this.rafId = undefined;
    }
    // window.cancelAnimationFrame(this.rafId);
  }

  private resetCurrentFrame() {
    return this.curFrame = this.initFrame ?? (this.direction === 1 ? this.minFrame : this.maxFrame);
  }

  public stop(renderFirstFrame = true) {
    this.pause();

    const curFrame = this.resetCurrentFrame();
    if(renderFirstFrame) {
      this.requestFrame(curFrame);
      // this.sendQuery('renderFrame', this.curFrame);
    }
  }

  public restart() {
    this.stop(false);
    this.play();
  }

  public playOrRestart() {
    if(!this.paused) {
      return;
    }

    if(this.curFrame === this.maxFrame) {
      this.restart();
    } else {
      this.play();
    }
  }

  public setSpeed(speed: number) {
    if(this.speed === speed) {
      return;
    }

    this.speed = speed;

    if(this.freeRunning) {
      this.updateFreeRunParams();
      return;
    }

    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public setDirection(direction: number) {
    if(this.direction === direction) {
      return;
    }

    this.direction = direction;

    if(this.freeRunning) {
      this.updateFreeRunParams();
      return;
    }

    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public remove() {
    if(this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.pause();
    this.sendQuery('destroy');
    if(this.cacheName && !this.offscreen) RLottiePlayer.CACHE.releaseCache(this.cacheName);
    this.dispatchEvent('destroy');
    this.cleanup();
  }

  public applyColor(context: CanvasRenderingContext2D) {
    applyColorOnContext(
      context,
      this.color || customProperties.getPropertyAsColor(readValue(this.textColor)),
      0,
      0,
      this.width,
      this.height
    );
  }

  public applyColorForAllContexts() {
    if(!this.color && !this.textColor) {
      return;
    }

    if(this.offscreen) {
      this.sendColorToWorker(true);
      return;
    }

    this.contexts.forEach((context) => {
      this.applyColor(context);
    });
  }

  private renderFrame2(frame: Uint8ClampedArray | HTMLCanvasElement | ImageBitmap, frameNo: number) {
    /* this.setListenerResult('enterFrame', frameNo);
    return; */

    if(this.offscreen === 'emoji') {
      this.renderedFirstFrame = true;
      this.dispatchEvent('enterFrame', frameNo);
      return;
    }

    if(this.offscreen) {
      if(!this.renderedFirstFrame) {
        this.renderedFirstFrame = true;
        this.sendQuery('presentFrame', {frameNo}).then(() => {
          if(this.destroyed) {
            return;
          }

          this.dispatchEvent('enterFrame', frameNo);
        });
      } else {
        this.sendQueryVoid('presentFrame', {frameNo});
        this.dispatchEvent('enterFrame', frameNo);
      }

      return;
    }

    let cachedSource: HTMLCanvasElement | ImageBitmap;
    try {
      if(frame instanceof Uint8ClampedArray) {
        this.imageData.data.set(frame);
      }

      // this.context.putImageData(new ImageData(frame, this.width, this.height), 0, 0);
      this.contexts.forEach((context, idx) => {
        cachedSource = this.cache.framesNew.get(frameNo);
        if(!(frame instanceof Uint8ClampedArray)) {
          cachedSource = frame;
        } else if(idx > 0) {
          cachedSource = this.canvas[0];
        }

        if(!cachedSource) {
          const c = document.createElement('canvas');
          c.width = context.canvas.width;
          c.height = context.canvas.height;
          c.getContext('2d').putImageData(this.imageData, 0, 0);
          this.cache.framesNew.set(frameNo, c);
          cachedSource = c;
        }

        if(this.overrideRender && this.renderedFirstFrame) {
          this.overrideRender(cachedSource || this.imageData);
        } else if(cachedSource) {
          context.clearRect(0, 0, cachedSource.width, cachedSource.height);
          context.drawImage(cachedSource, 0, 0);
        } else {
          context.putImageData(this.imageData, 0, 0);
        }

        if(this.color || this.textColor) {
          this.applyColor(context);
        }

        if(!this.renderedFirstFrame) {
          this.renderedFirstFrame = true;
        }
      });

      this.dispatchEvent('enterFrame', frameNo);
    } catch(err) {
      console.error('RLottiePlayer renderFrame error:', err/* , frame */, this, cachedSource);
      this.autoplay = false;
      this.pause();
    }
  }

  public renderFrame(frame: Parameters<RLottiePlayer['renderFrame2']>[0], frameNo: number) {
    const canCacheFrame = this.cachingDelta && (frameNo % this.cachingDelta || !frameNo);
    if(canCacheFrame) {
      if(frame instanceof Uint8ClampedArray && !this.cache.frames.has(frameNo)) {
        this.cache.frames.set(frameNo, new Uint8ClampedArray(frame));// frame;
      } else if(IS_IMAGE_BITMAP_SUPPORTED && frame instanceof ImageBitmap && !this.cache.framesNew.has(frameNo)) {
        this.cache.framesNew.set(frameNo, frame);
      }
    }

    /* if(!this.listenerResults.hasOwnProperty('cached')) {
      this.setListenerResult('enterFrame', frameNo);
      if(frameNo === (this.frameCount - 1)) {
        this.setListenerResult('cached');
      }

      return;
    } */

    if(this.frInterval) {
      const now = Date.now(), delta = now - this.frThen;

      if(delta < 0) {
        const timeout = this.frInterval > -delta ? -delta % this.frInterval : this.frInterval;
        if(this.rafId) clearTimeout(this.rafId);
        const rafId = this.rafId = window.setTimeout(() => {
          this.renderFrame2(frame, frameNo);

          if(this.clearCacheOnRafId === rafId) {
            this.clearCacheOnRafId = undefined;
            this.clearCache();
          }
        }, timeout);
        // await new Promise((resolve) => setTimeout(resolve, -delta % this.frInterval));
        return;
      }
    }

    this.renderFrame2(frame, frameNo);
  }

  public requestFrame(frameNo: number) {
    if(this.offscreen) {
      this.sendQuery('renderFrame', {frameNo}).then(({frameNo}) => {
        if(this.destroyed) {
          return;
        }

        this.renderFrame(undefined, frameNo);
      });
      return;
    }

    const frame = this.cache.frames.get(frameNo);
    const frameNew = this.cache.framesNew.get(frameNo);
    if(frameNew) {
      this.renderFrame(frameNew, frameNo);
    } else if(frame) {
      this.renderFrame(frame, frameNo);
    } else {
      if(this.clamped && !this.clamped.length) { // fix detached
        this.clamped = new Uint8ClampedArray(this.width * this.height * 4);
      }

      this.sendQuery('renderFrame', {frameNo}, this.clamped ? [this.clamped.buffer] : undefined)
      .then(({frame, frameNo}) => {
        if(this.destroyed) {
          return;
        }

        if(this.clamped !== undefined && frame instanceof Uint8ClampedArray) {
          this.clamped = frame;
        }

        this.renderFrame(frame, frameNo);
      });
    }
  }

  private onLap() {
    ++this.playedTimes;
    if(typeof(this.loop) === 'number' && this.playedTimes >= this.loop) {
      this.loop =
        this.autoplay =
        this._loop =
        this._autoplay =
        false;
    }

    if(!this.loop) {
      this.pause(false);
      this.clearCacheWhenSafe();
      return false;
    }

    return true;
  }

  private mainLoopForwards() {
    const {skipDelta, minFrame, maxFrame} = this;
    // a step that would overrun maxFrame completes one pass = one lap. Count it via
    // onLap (which may end playback: a one-shot, or a numeric loop hitting its count)
    // BEFORE choosing the wrap target, so the final lap parks on the last frame
    // instead of flashing back to the start. The old "curFrame === frame" lap test
    // only fired at a one-shot's park, so numeric loops never counted (looped forever).
    if((this.curFrame + skipDelta) > maxFrame) {
      const keepLooping = this.onLap();
      this.requestFrame(this.curFrame = keepLooping ? minFrame : maxFrame);
      return keepLooping;
    }

    this.requestFrame(this.curFrame += skipDelta);
    return true;
  }

  private mainLoopBackwards() {
    const {skipDelta, minFrame, maxFrame} = this;
    // symmetric to mainLoopForwards: a step past minFrame completes a pass; on the
    // final lap park on minFrame (the last frame when playing backwards)
    if((this.curFrame - skipDelta) < minFrame) {
      const keepLooping = this.onLap();
      this.requestFrame(this.curFrame = keepLooping ? maxFrame : minFrame);
      return keepLooping;
    }

    this.requestFrame(this.curFrame -= skipDelta);
    return true;
  }

  public setMainLoop() {
    // window.cancelAnimationFrame(this.rafId);
    clearTimeout(this.rafId);
    this.rafId = undefined;

    this.frInterval = 1000 / this.fps / this.speed * this.skipDelta;
    this.frThen = Date.now() - this.frInterval;

    if(!this.paused && this.canFreeRun()) {
      this.engageFreeRun(); // the worker self-clocks - the frameListener chain stays idle, zero per-frame messages
      return;
    }

    // console.trace('setMainLoop', this.frInterval, this.direction, this, JSON.stringify(this.listenerResults), this.listenerResults);

    const method = (this.direction === 1 ? this.mainLoopForwards : this.mainLoopBackwards).bind(this);
    this.currentMethod = method;
    // this.frameListener && this.removeListener('enterFrame', this.frameListener);

    // setTimeout(() => {
    // this.addListener('enterFrame', this.frameListener);
    // }, 0);

    if(this.frameListener) {
      const lastResult = this.listenerResults.enterFrame;
      if(lastResult !== undefined) {
        this.frameListener(this.curFrame);
      }
    }

    // this.mainLoop(method);
    // this.r(method);
    // method();
  }

  public playPart(options: {
    from: number,
    to: number,
    callback?: () => void
  }) {
    this.pause();

    const {from, to, callback} = options;
    this.curFrame = from - 1;

    return this.playToFrame({
      frame: to,
      direction: to > from ? 1 : -1,
      callback
    });
  }

  public playToFrame(options: {
    frame: number,
    speed?: number,
    direction?: number,
    callback?: () => void
  }) {
    this.pause();

    const {frame, speed, callback, direction} = options;
    this.setDirection(direction === undefined ? this.curFrame > frame ? -1 : 1 : direction);
    speed !== undefined && this.setSpeed(speed);

    const bounds = [this.curFrame, frame];
    if(this.direction === -1) bounds.reverse();

    this.loop = false;
    this.setMinMax(bounds[0], bounds[1]);

    if(this.playToFrameOnFrameCallback) {
      this.removeEventListener('enterFrame', this.playToFrameOnFrameCallback);
    }

    if(callback) {
      this.playToFrameOnFrameCallback = (frameNo: number) => {
        if(frameNo === frame) {
          this.removeEventListener('enterFrame', this.playToFrameOnFrameCallback);
          callback();
        }
      };

      this.addEventListener('enterFrame', this.playToFrameOnFrameCallback);
    }

    this.play();
  }

  public setColor(color: RLottieColor | string, renderIfPaused: boolean) {
    if(typeof(color) === 'string') {
      this.textColor = color;
    } else {
      this.color = color;
    }

    if(this.offscreen) { // a playing player picks the new color up at the next present; a paused one re-tints
      this.sendColorToWorker(renderIfPaused && this.paused);
      return;
    }

    if(renderIfPaused && this.paused) {
      this.applyColorForAllContexts();
      // this.renderFrame2(this.imageData?.data, this.curFrame);
    }
  }

  private setMinMax(minFrame = 0, maxFrame = this.frameCount - 1) {
    this.minFrame = minFrame;
    this.maxFrame = maxFrame;
  }

  public async onLoad(frameCount: number, fps: number) {
    this.frameCount = frameCount;
    this.fps = fps;
    this.setMinMax();
    if(this.initFrame !== undefined) {
      this.initFrame = clamp(this.initFrame, this.minFrame, this.maxFrame);
    }

    const curFrame = this.resetCurrentFrame();

    // * Handle 30fps stickers if 30fps set
    if(this.fps < 60 && this.skipDelta !== 1) {
      const diff = 60 / fps;
      this.skipDelta = this.skipDelta / diff | 0;
    }

    this.frInterval = 1000 / this.fps / this.speed * this.skipDelta;
    this.frThen = Date.now() - this.frInterval;
    // this.sendQuery('renderFrame', 0);

    // Кешировать сразу не получится, рендер стикера (тайгер) занимает 519мс,
    // если рендерить 75% с получением каждого кадра из воркера, будет 475мс, т.е. при 100% было бы 593мс, потеря на передаче 84мс.

    /* console.time('cache' + this.reqId);
    for(let i = 0; i < frameCount; ++i) {
      //if(this.removed) return;

      if(i % 4) {
        await new Promise((resolve) => {
          delete this.listenerResults.enterFrame;
          this.addListener('enterFrame', resolve, true);
          this.requestFrame(i);
        });
      }
    }

    console.timeEnd('cache' + this.reqId); */
    // console.log('cached');
    /* this.el.innerHTML = '';
    this.el.append(this.canvas);
    return; */

    !this.skipFirstFrameRendering && this.requestFrame(curFrame);
    this.dispatchEvent('ready');
    this.addEventListener('enterFrame', () => {
      // append the canvas BEFORE firstFrame so its listeners (e.g. sticker appearance)
      // see it attached and can re-present / retire the thumb without racing the mount
      if(this.canvas[0] && !this.canvas[0].parentNode && this.el?.[0] && !this.overrideRender) {
        this.el.forEach((container, idx) => container.append(this.canvas[idx]));
        this.nudgePresent(); // the pre-append commit can be lost - re-present now that the placeholder is in the DOM
      }

      this.dispatchEvent('firstFrame');

      // console.log('enterFrame firstFrame');

      // let lastTime = this.frThen;
      this.frameListener = () => {
        if(this.paused || this.freeRunning || !this.currentMethod) { // freeRunning: a stale in-flight ack must not re-ignite the chain
          return;
        }

        // deterministic upgrade point: on initial playback setMainLoop always runs while
        // canFreeRun() is still false (first frame not acked, or the onLoad once-handler
        // still registered) - by the second enterFrame both have cleared, so eligible
        // players leave command mode here instead of waiting for a pause/play cycle
        if(this.canFreeRun()) {
          this.engageFreeRun();
          return;
        }

        const time = Date.now();
        // console.log(`enterFrame handle${this.reqId}`, time, (time - lastTime), this.frInterval);
        /* if(Math.round(time - lastTime + this.frInterval * 0.25) < Math.round(this.frInterval)) {
          return;
        } */

        // lastTime = time;

        this.frThen = time + this.frInterval;
        const canContinue = this.currentMethod();
        if(!canContinue && !this.loop && this.autoplay) {
          this.autoplay = false;
        }
      };

      this.addEventListener('enterFrame', this.frameListener);
      // setInterval(this.frameListener, this.frInterval);

      // ! fix autoplaying since there will be no animationIntersector for it
      if(this.group === 'none' && this.autoplay) {
        this.play();
      }
    }, {once: true});
  }
}
