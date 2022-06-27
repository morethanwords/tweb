/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CAN_USE_TRANSFERABLES from "../../environment/canUseTransferables";
import IS_APPLE_MX from "../../environment/appleMx";
import { IS_ANDROID, IS_APPLE_MOBILE, IS_APPLE, IS_SAFARI } from "../../environment/userAgent";
import EventListenerBase from "../../helpers/eventListenerBase";
import mediaSizes from "../../helpers/mediaSizes";
import clamp from "../../helpers/number/clamp";
import lottieLoader from "./lottieLoader";
import QueryableWorker from "./queryableWorker";

export type RLottieOptions = {
  container: HTMLElement, 
  canvas?: HTMLCanvasElement, 
  autoplay?: boolean, 
  animationData: Blob, 
  loop?: boolean, 
  width?: number,
  height?: number,
  group?: string,
  noCache?: boolean,
  needUpscale?: boolean,
  skipRatio?: number,
  initFrame?: number, // index
  color?: RLottieColor,
  inverseColor?: RLottieColor,
  name?: string,
  skipFirstFrameRendering?: boolean,
  toneIndex?: number
};

type RLottieCacheMap = Map<number, Uint8ClampedArray>;
class RLottieCache {
  private cache: Map<string, {frames: RLottieCacheMap, counter: number}>;
  
  constructor() {
    this.cache = new Map();
  }

  public getCache(name: string) {
    let cache = this.cache.get(name);
    if(!cache) {
      this.cache.set(name, cache = {frames: new Map(), counter: 0});
    } else {
      // console.warn('[RLottieCache] cache will be reused', cache);
    }

    ++cache.counter;
    return cache.frames;
  }

  public releaseCache(name: string) {
    const cache = this.cache.get(name);
    if(cache && !--cache.counter) {
      this.cache.delete(name);
      // console.warn('[RLottieCache] released cache', cache);
    }
  }

  public getCacheCounter(name: string) {
    const cache = this.cache.get(name);
    return cache?.counter;
  }

  public generateName(name: string, width: number, height: number, color: RLottieColor, toneIndex: number) {
    return [
      name, 
      width, 
      height, 
      // color ? rgbaToHexa(color) : ''
      color ? 'colored' : '',
      toneIndex || ''
    ].filter(Boolean).join('-');
  }
}

const cache = new RLottieCache();

export type RLottieColor = [number, number, number];

export default class RLottiePlayer extends EventListenerBase<{
  enterFrame: (frameNo: number) => void,
  ready: () => void,
  firstFrame: () => void,
  cached: () => void
}> {
  private static reqId = 0;

  public reqId = 0;
  public curFrame: number;
  private frameCount: number;
  private fps: number;
  private skipDelta: number;
  private name: string;
  private cacheName: string;
  private toneIndex: number;

  private worker: QueryableWorker;
  
  private width = 0;
  private height = 0;

  public el: HTMLElement;
  public canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  public paused = true;
  //public paused = false;
  public direction = 1;
  private speed = 1;
  public autoplay = true;
  public _autoplay: boolean; // ! will be used to store original value for settings.stickers.loop
  public loop = true;
  private _loop: boolean; // ! will be used to store original value for settings.stickers.loop
  private group = '';

  private frInterval: number;
  private frThen: number;
  private rafId: number;

  //private caching = false;
  //private removed = false;

  private frames: RLottieCacheMap;
  private imageData: ImageData;
  public clamped: Uint8ClampedArray;
  private cachingDelta = 0;

  private initFrame: number;
  private color: RLottieColor;
  private inverseColor: RLottieColor;

  public minFrame: number;
  public maxFrame: number;

  //private playedTimes = 0;

  private currentMethod: RLottiePlayer['mainLoopForwards'] | RLottiePlayer['mainLoopBackwards'];
  private frameListener: (currentFrame: number) => void;
  private skipFirstFrameRendering: boolean;
  private playToFrameOnFrameCallback: (frameNo: number) => void;

  constructor({el, worker, options}: {
    el: HTMLElement,
    worker: QueryableWorker,
    options: RLottieOptions
  }) {
    super(true);

    this.reqId = ++RLottiePlayer['reqId'];
    this.el = el;
    this.worker = worker;

    for(let i in options) {
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
    this.inverseColor = options.inverseColor;
    this.name = options.name;
    this.skipFirstFrameRendering = options.skipFirstFrameRendering;
    this.toneIndex = options.toneIndex;

    // * Skip ratio (30fps)
    let skipRatio: number;
    if(options.skipRatio !== undefined) skipRatio = options.skipRatio;
    else if((IS_ANDROID || IS_APPLE_MOBILE || (IS_APPLE && !IS_SAFARI && !IS_APPLE_MX)) && this.width < 100 && this.height < 100 && !options.needUpscale) {
      skipRatio = 0.5;
    }

    this.skipDelta = skipRatio !== undefined ? 1 / skipRatio | 0 : 1;

    //options.needUpscale = true;

    // * Pixel ratio
    //const pixelRatio = window.devicePixelRatio;
    const pixelRatio = clamp(window.devicePixelRatio, 1, 2);
    if(pixelRatio > 1) {
      //this.cachingEnabled = true;//this.width < 100 && this.height < 100;
      if(options.needUpscale) {
        this.width = Math.round(this.width * pixelRatio);
        this.height = Math.round(this.height * pixelRatio);
      } else if(pixelRatio > 1) {
        if(this.width > 100 && this.height > 100) {
          if(IS_APPLE || !mediaSizes.isMobile) {
            /* this.width = Math.round(this.width * (pixelRatio - 1));
            this.height = Math.round(this.height * (pixelRatio - 1)); */
            this.width = Math.round(this.width * pixelRatio);
            this.height = Math.round(this.height * pixelRatio);
          } else if(pixelRatio > 2.5) {
            this.width = Math.round(this.width * (pixelRatio - 1.5));
            this.height = Math.round(this.height * (pixelRatio - 1.5));
          }
        } else {
          this.width = Math.round(this.width * Math.max(1.5, pixelRatio - 1.5));
          this.height = Math.round(this.height * Math.max(1.5, pixelRatio - 1.5));
        }
      }
    }

    this.width = Math.round(this.width);
    this.height = Math.round(this.height);

    //options.noCache = true;
    
    // * Cache frames params
    if(!options.noCache/*  && false */) {
      // проверка на размер уже после скейлинга, сделано для попапа и сайдбара, где стикеры 80х80 и 68х68, туда нужно 75%
      if(IS_APPLE && this.width > 100 && this.height > 100) {
        this.cachingDelta = 2; //2 // 50%
      } else if(this.width < 100 && this.height < 100) {
        this.cachingDelta = Infinity; // 100%
      } else {
        this.cachingDelta = 4; // 75%
      }
    }
    
    // this.cachingDelta = Infinity;
    // if(isApple) {
    //   this.cachingDelta = 0; //2 // 50%
    // }

    /* this.width *= 0.8;
    this.height *= 0.8; */
    
    //console.log("RLottiePlayer width:", this.width, this.height, options);
    if(!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.classList.add('rlottie');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    this.context = this.canvas.getContext('2d');

    if(CAN_USE_TRANSFERABLES) {
      this.clamped = new Uint8ClampedArray(this.width * this.height * 4);
    }

    this.imageData = new ImageData(this.width, this.height);

    if(this.name) {
      this.cacheName = cache.generateName(this.name, this.width, this.height, this.color, this.toneIndex);
      this.frames = cache.getCache(this.cacheName);
    } else {
      this.frames = new Map();
    }
  }

  public clearCache() {
    if(this.cachingDelta === Infinity) {
      return;
    }
    
    if(this.cacheName && cache.getCacheCounter(this.cacheName) > 1) { // skip clearing because same sticker can be still visible
      return;
    }
    
    this.frames.clear();
  }

  public sendQuery(methodName: string, ...args: any[]) {
    //console.trace('RLottie sendQuery:', methodName);
    this.worker.sendQuery(methodName, this.reqId, ...args);
  }

  public loadFromData(data: RLottieOptions['animationData']) {
    this.sendQuery('loadFromData', data, this.width, this.height, this.toneIndex/* , this.canvas.transferControlToOffscreen() */);
  }

  public play() {
    if(!this.paused) {
      return;
    }

    //return;

    //console.log('RLOTTIE PLAY' + this.reqId);

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
    }
    //window.cancelAnimationFrame(this.rafId);
  }

  private resetCurrentFrame() {
    return this.curFrame = this.initFrame ?? (this.direction === 1 ? this.minFrame : this.maxFrame);
  }

  public stop(renderFirstFrame = true) {
    this.pause();

    const curFrame = this.resetCurrentFrame();
    if(renderFirstFrame) {
      this.requestFrame(curFrame);
      //this.sendQuery('renderFrame', this.curFrame);
    }
  }

  public restart() {
    this.stop(false);
    this.play();
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
    //alert('remove');
    lottieLoader.onDestroy(this.reqId);
    this.pause();
    this.sendQuery('destroy');
    if(this.cacheName) cache.releaseCache(this.cacheName);
    this.cleanup();
    //this.removed = true;
  }

  private applyColor(frame: Uint8ClampedArray) {
    const [r, g, b] = this.color;
    for(let i = 0, length = frame.length; i < length; i += 4) {
      if(frame[i + 3] !== 0) {
        frame[i] = r;
        frame[i + 1] = g;
        frame[i + 2] = b;
      }
    }
  }

  private applyInversing(frame: Uint8ClampedArray) {
    const [r, g, b] = this.inverseColor;
    for(let i = 0, length = frame.length; i < length; i += 4) {
      if(frame[i + 3] === 0) {
        frame[i] = r;
        frame[i + 1] = g;
        frame[i + 2] = b;
        frame[i + 3] = 255;
      } else {
        frame[i + 3] = 0;
      }
    }
  }

  public renderFrame2(frame: Uint8ClampedArray, frameNo: number) {
    /* this.setListenerResult('enterFrame', frameNo);
    return; */

    try {
      if(this.color) {
        this.applyColor(frame);
      }

      if(this.inverseColor) {
        this.applyInversing(frame);
      }

      this.imageData.data.set(frame);
      
      //this.context.putImageData(new ImageData(frame, this.width, this.height), 0, 0);
      //let perf = performance.now();
      this.context.putImageData(this.imageData, 0, 0);
      //console.log('renderFrame2 perf:', performance.now() - perf);
    } catch(err) {
      console.error('RLottiePlayer renderFrame error:', err/* , frame */, this.width, this.height);
      this.autoplay = false;
      this.pause();
      return;
    }
    
    //console.log('set result enterFrame', frameNo);
    this.dispatchEvent('enterFrame', frameNo);
  }

  public renderFrame(frame: Uint8ClampedArray, frameNo: number) {
    //console.log('renderFrame', frameNo, this);
    if(this.cachingDelta && (frameNo % this.cachingDelta || !frameNo) && !this.frames.has(frameNo)) {
      this.frames.set(frameNo, new Uint8ClampedArray(frame));//frame;
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
      //console.log(`renderFrame delta${this.reqId}:`, this, delta, this.frInterval);

      if(delta < 0) {
        if(this.rafId) clearTimeout(this.rafId);
        return this.rafId = window.setTimeout(() => {
          this.renderFrame2(frame, frameNo);
        }, this.frInterval > -delta ? -delta % this.frInterval : this.frInterval);
        //await new Promise((resolve) => setTimeout(resolve, -delta % this.frInterval));
      }
    }

    this.renderFrame2(frame, frameNo);
  }

  public requestFrame(frameNo: number) {
    const frame = this.frames.get(frameNo);
    if(frame) {
      this.renderFrame(frame, frameNo);
    } else {
      if(this.clamped && !this.clamped.length) { // fix detached
        this.clamped = new Uint8ClampedArray(this.width * this.height * 4);
      }
      
      this.sendQuery('renderFrame', frameNo, this.clamped);
    }
  }

  private onLap() {
    //this.playedTimes++;

    if(!this.loop) {
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
    //window.cancelAnimationFrame(this.rafId);
    clearTimeout(this.rafId);

    this.frInterval = 1000 / this.fps / this.speed * this.skipDelta;
    this.frThen = Date.now() - this.frInterval;

    //console.trace('setMainLoop', this.frInterval, this.direction, this, JSON.stringify(this.listenerResults), this.listenerResults);

    const method = (this.direction === 1 ? this.mainLoopForwards : this.mainLoopBackwards).bind(this);
    this.currentMethod = method;
    //this.frameListener && this.removeListener('enterFrame', this.frameListener);

    //setTimeout(() => {
      //this.addListener('enterFrame', this.frameListener);
    //}, 0);

    if(this.frameListener) {
      const lastResult = this.listenerResults.enterFrame;
      if(lastResult !== undefined) {
        this.frameListener(this.curFrame);
      }
    }
  
    //this.mainLoop(method);
    //this.r(method);
    //method();
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

  public setColor(color: RLottieColor, renderIfPaused: boolean) {
    this.color = color;

    if(renderIfPaused && this.paused) {
      this.renderFrame2(this.imageData.data, this.curFrame);
    }
  }

  public setInverseColor(color: RLottieColor) {
    this.inverseColor = color;
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
    //this.sendQuery('renderFrame', 0);
    
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
    //console.log('cached');
    /* this.el.innerHTML = '';
    this.el.append(this.canvas);
    return; */

    !this.skipFirstFrameRendering && this.requestFrame(curFrame);
    this.dispatchEvent('ready');
    this.addEventListener('enterFrame', () => {
      this.dispatchEvent('firstFrame');

      if(!this.canvas.parentNode && this.el) {
        this.el.appendChild(this.canvas);
      }

      //console.log('enterFrame firstFrame');
 
      //let lastTime = this.frThen;
      this.frameListener = () => {
        if(this.paused) {
          return;
        }

        const time = Date.now();
        //console.log(`enterFrame handle${this.reqId}`, time, (time - lastTime), this.frInterval);
        /* if(Math.round(time - lastTime + this.frInterval * 0.25) < Math.round(this.frInterval)) {
          return;
        } */

        //lastTime = time;

        this.frThen = time + this.frInterval;
        const canContinue = this.currentMethod();
        if(!canContinue && !this.loop && this.autoplay) {
          this.autoplay = false;
        }
      };

      this.addEventListener('enterFrame', this.frameListener);

      // ! fix autoplaying since there will be no animationIntersector for it,
      if(this.group === 'none' && this.autoplay) {
        this.play();
      }
    }, {once: true});
  }
}
