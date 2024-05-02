/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AnimationItemGroup, AnimationItemWrapper} from '../../components/animationIntersector';
import type {Middleware} from '../../helpers/middleware';
import type {LiteModeKey} from '../../helpers/liteMode';
import CAN_USE_TRANSFERABLES from '../../environment/canUseTransferables';
import IS_APPLE_MX from '../../environment/appleMx';
import {IS_ANDROID, IS_APPLE_MOBILE, IS_APPLE, IS_SAFARI} from '../../environment/userAgent';
import EventListenerBase from '../../helpers/eventListenerBase';
import mediaSizes from '../../helpers/mediaSizes';
import clamp from '../../helpers/number/clamp';
import QueryableWorker from './queryableWorker';
import IS_IMAGE_BITMAP_SUPPORTED from '../../environment/imageBitmapSupport';
import framesCache, {FramesCache, FramesCacheItem} from '../../helpers/framesCache';
import customProperties from '../../helpers/dom/customProperties';

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
  liteModeKey?: LiteModeKey
};

export type RLottieColor = [number, number, number];

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

export function applyColorOnContext(
  context: CanvasRenderingContext2D,
  color: RLottieColor | string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = typeof(color) === 'string' ? color : `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  context.fillRect(x, y, width, height);
  context.globalCompositeOperation = 'source-over';
}

export default class RLottiePlayer extends EventListenerBase<{
  enterFrame: (frameNo: number) => void,
  ready: () => void,
  firstFrame: () => void,
  cached: () => void,
  destroy: () => void
}> implements AnimationItemWrapper {
  public static CACHE = framesCache;
  private static reqId = 0;

  public reqId = 0;
  public curFrame: number;
  private frameCount: number;
  private fps: number;
  private skipDelta: number;
  public name: string;
  public cacheName: string;
  private toneIndex: number;

  private worker: QueryableWorker;

  private width = 0;
  private height = 0;

  public el: HTMLElement[];
  public canvas: HTMLCanvasElement[];
  public contexts: CanvasRenderingContext2D[];

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

  constructor({el, worker, options}: {
    el: RLottiePlayer['el'],
    worker: QueryableWorker,
    options: RLottieOptions
  }) {
    super(true);

    this.reqId = ++RLottiePlayer['reqId'];
    this.el = el;
    this.worker = worker;

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

    // * Skip ratio (30fps)
    let skipRatio: number;
    if(options.skipRatio !== undefined) skipRatio = options.skipRatio;
    else if((IS_ANDROID || IS_APPLE_MOBILE || (IS_APPLE && !IS_SAFARI && !IS_APPLE_MX)) && this.width < 100 && this.height < 100 && !options.needUpscale) {
      skipRatio = 0.5;
    }

    this.skipDelta = skipRatio !== undefined ? 1 / skipRatio | 0 : 1;

    // options.needUpscale = true;

    // * Pixel ratio
    const pixelRatio = getLottiePixelRatio(this.width, this.height, options.needUpscale);

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

    if(!this.canvas) {
      this.canvas = this.el.map(() => {
        const canvas = document.createElement('canvas');
        canvas.classList.add('rlottie');
        canvas.width = this.width;
        canvas.height = this.height;
        canvas.dpr = pixelRatio;
        return canvas;
      });
    }

    this.contexts = this.canvas.map((canvas) => canvas.getContext('2d'));

    if(!IS_IMAGE_BITMAP_SUPPORTED || this.raw) {
      this.imageData = new ImageData(this.width, this.height);

      if(CAN_USE_TRANSFERABLES) {
        this.clamped = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }

    if(this.name) {
      this.cache = RLottiePlayer.CACHE.getCache(this.cacheName);
    } else {
      this.cache = FramesCache.createCache();
    }
  }

  public setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas.forEach((canvas) => {
      canvas.width = width;
      canvas.height = height;
    });
  }

  public clearCache() {
    if(this.cachingDelta === Infinity) {
      return;
    }

    if(this.cacheName && this.cache.counter > 1) { // skip clearing because same sticker can be still visible
      return;
    }

    this.cache.clearCache();
  }

  public sendQuery(args: any[], transfer?: Transferable[]) {
    this.worker.sendQuery([args.shift(), this.reqId, ...args], transfer);
  }

  public loadFromData(data: RLottieOptions['animationData']) {
    this.sendQuery([
      'loadFromData',
      data,
      this.width,
      this.height,
      this.toneIndex,
      this.raw
      /* , this.canvas.transferControlToOffscreen() */
    ]);
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

    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public setDirection(direction: number) {
    if(this.direction === direction) {
      return;
    }

    this.direction = direction;

    if(!this.paused) {
      this.setMainLoop();
    }
  }

  public remove() {
    this.pause();
    this.sendQuery(['destroy']);
    if(this.cacheName) RLottiePlayer.CACHE.releaseCache(this.cacheName);
    this.dispatchEvent('destroy');
    this.cleanup();
  }

  public applyColor(context: CanvasRenderingContext2D) {
    applyColorOnContext(
      context,
      // this.color || customProperties.getPropertyAsColor(typeof(this.textColor) === 'function' ? this.textColor() : this.textColor),
      this.color || customProperties.getPropertyAsColor(this.textColor),
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

    this.contexts.forEach((context) => {
      this.applyColor(context);
    });
  }

  public renderFrame2(frame: Uint8ClampedArray | HTMLCanvasElement | ImageBitmap, frameNo: number) {
    /* this.setListenerResult('enterFrame', frameNo);
    return; */

    try {
      if(frame instanceof Uint8ClampedArray) {
        this.imageData.data.set(frame);
      }

      // this.context.putImageData(new ImageData(frame, this.width, this.height), 0, 0);
      this.contexts.forEach((context, idx) => {
        let cachedSource: HTMLCanvasElement | ImageBitmap = this.cache.framesNew.get(frameNo);
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
      console.error('RLottiePlayer renderFrame error:', err/* , frame */, this.width, this.height);
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
        this.rafId = window.setTimeout(() => {
          this.renderFrame2(frame, frameNo);
        }, timeout);
        // await new Promise((resolve) => setTimeout(resolve, -delta % this.frInterval));
        return;
      }
    }

    this.renderFrame2(frame, frameNo);
  }

  public requestFrame(frameNo: number) {
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

      this.sendQuery(['renderFrame', frameNo], this.clamped ? [this.clamped.buffer] : undefined);
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
      this.clearCache();
      this.pause(false);
      return false;
    }

    return true;
  }

  private mainLoopForwards() {
    const {skipDelta, maxFrame} = this;
    const frame = (this.curFrame + skipDelta) > maxFrame ? this.curFrame = (this.loop ? this.minFrame : this.maxFrame) : this.curFrame += skipDelta;
    // console.log('mainLoopForwards', this.curFrame, skipDelta, frame);

    this.requestFrame(frame);
    if((frame + skipDelta) > maxFrame) {
      return this.onLap();
    }

    return true;
  }

  private mainLoopBackwards() {
    const {skipDelta, minFrame} = this;
    const frame = (this.curFrame - skipDelta) < minFrame ? this.curFrame = (this.loop ? this.maxFrame : this.minFrame) : this.curFrame -= skipDelta;
    // console.log('mainLoopBackwards', this.curFrame, skipDelta, frame);

    this.requestFrame(frame);
    if((frame - skipDelta) < minFrame) {
      return this.onLap();
    }

    return true;
  }

  public setMainLoop() {
    // window.cancelAnimationFrame(this.rafId);
    clearTimeout(this.rafId);
    this.rafId = undefined;

    this.frInterval = 1000 / this.fps / this.speed * this.skipDelta;
    this.frThen = Date.now() - this.frInterval;

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
      this.dispatchEvent('firstFrame');

      if(!this.canvas[0].parentNode && this.el?.[0] && !this.overrideRender) {
        this.el.forEach((container, idx) => container.append(this.canvas[idx]));
      }

      // console.log('enterFrame firstFrame');

      // let lastTime = this.frThen;
      this.frameListener = () => {
        if(this.paused || !this.currentMethod) {
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
