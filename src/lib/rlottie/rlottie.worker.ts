/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

importScripts('rlottie-wasm.js');
//import Module, { allocate, intArrayFromString } from './rlottie-wasm';

const _Module = (self as any).Module as any;

const DEFAULT_FPS = 60;

type LottieHandlePointer = number;

// throw new Error('test');

export class RLottieItem {
  private stringOnWasmHeap: number;
  private handle: LottieHandlePointer;
  private frameCount: number;

  private dead: boolean;
  //private context: OffscreenCanvasRenderingContext2D;

  constructor(
    private reqId: number, 
    jsString: string, 
    private width: number, 
    private height: number, 
    private fps: number/* , 
    private canvas: OffscreenCanvas */
  ) {
    this.fps = Math.max(1, Math.min(60, fps || DEFAULT_FPS));

    this.frameCount = 0;

    //this.context = canvas.getContext('2d');

    this.init(jsString);

    reply('loaded', this.reqId, this.frameCount, this.fps);

    /* let frame = 0;
    setInterval(() => {
      if(frame >= this.frameCount) frame = 0;
      let _frame = frame++;
      this.render(_frame, null);
    }, 1000 / this.fps); */
  }

  private init(jsString: string) {
    try {
      this.handle = worker.Api.init();
  
      // @ts-ignore
      this.stringOnWasmHeap = allocate(intArrayFromString(jsString), 'i8', 0);
  
      this.frameCount = worker.Api.loadFromData(this.handle, this.stringOnWasmHeap);
  
      worker.Api.resize(this.handle, this.width, this.height);
    } catch(e) {
      console.error('init RLottieItem error:', e);
      reply('error', this.reqId, e);
    }
  }

  public render(frameNo: number, clamped?: Uint8ClampedArray) {
    if(this.dead) return;
    //return;
  
    if(this.frameCount < frameNo || frameNo < 0) {
      return;
    }
  
    try {
      worker.Api.render(this.handle, frameNo);
  
      const bufferPointer = worker.Api.buffer(this.handle);
  
      const data = _Module.HEAPU8.subarray(bufferPointer, bufferPointer + (this.width * this.height * 4));
  
      if(!clamped) {
        clamped = new Uint8ClampedArray(data);
      } else {
        clamped.set(data);
      }

      //this.context.putImageData(new ImageData(clamped, this.width, this.height), 0, 0);
  
      reply('frame', this.reqId, frameNo, clamped);
    } catch(e) {
      console.error('Render error:', e);
      this.dead = true;
      reply('error', this.reqId, e);
    }
  }

  public destroy() {
    this.dead = true;

    worker.Api.destroy(this.handle);
  }
}

class RLottieWorker {
  public Api: {
    init: () => LottieHandlePointer,
    destroy: (handle: LottieHandlePointer) => void,
    resize: (handle: LottieHandlePointer, width: number, height: number) => void,
    buffer: (handle: LottieHandlePointer) => number,
    render: (handle: LottieHandlePointer, frameNo: number) => void,
    loadFromData: (handle: LottieHandlePointer, bufferPointer: number) => number
  } = {} as any;

  public initApi() {
    this.Api = {
      init: _Module.cwrap('lottie_init', '', []),
      destroy: _Module.cwrap('lottie_destroy', '', ['number']),
      resize: _Module.cwrap('lottie_resize', '', ['number', 'number', 'number']),
      buffer: _Module.cwrap('lottie_buffer', 'number', ['number']),
      render: _Module.cwrap('lottie_render', '', ['number', 'number']),
      loadFromData: _Module.cwrap('lottie_load_from_data', 'number', ['number', 'number']),
    };
  }

  public init() {
    this.initApi();
    reply('ready');
  }
}

const worker = new RLottieWorker();

_Module.onRuntimeInitialized = function() {
  worker.init();
};

const items: {[reqId: string]: RLottieItem} = {};
const queryableFunctions = {
  loadFromData: function(reqId: number, jsString: string, width: number, height: number/* , canvas: OffscreenCanvas */) {
    try {
      // ! WARNING, с этой проверкой не все стикеры работают, например - ДУРКА
      /* if(!/"tgs":\s*?1./.test(jsString)) {
        throw new Error('Invalid file');
      } */

      /* let perf = performance.now();
      let json = JSON.parse(jsString);
      console.log('sticker decode:', performance.now() - perf); */

      const match = jsString.match(/"fr":\s*?(\d+?),/);
      const frameRate = +match?.[1] || DEFAULT_FPS;

      //console.log('Rendering sticker:', reqId, frameRate, 'now rendered:', Object.keys(items).length);

      items[reqId] = new RLottieItem(reqId, jsString, width, height, frameRate/* , canvas */);
    } catch(e) {
      console.error('Invalid file for sticker:', jsString);
      reply('error', reqId, e);
    }
  },
  destroy: function(reqId: number) {
    const item = items[reqId];
    if(!item) {
      return;
    }

    item.destroy();
    delete items[reqId];
  },
  renderFrame: function(reqId: number, frameNo: number, clamped?: Uint8ClampedArray) {
    //console.log('worker renderFrame', reqId, frameNo, clamped);
    items[reqId].render(frameNo, clamped);
  }
};

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 *
 * @private
 * @param scope {WindowOrWorkerGlobalScope} Since this function is used both on the main thread and WebWorker context,
 *      let the calling scope pass in the global scope object.
 * @returns {boolean}
 */
let _isSafari: boolean = null;
function isSafari(scope: any) {
  if(_isSafari === null) {
    const userAgent = scope.navigator ? scope.navigator.userAgent : null;
    _isSafari = !!scope.safari ||
    !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
  }
  return _isSafari;
}

function reply(...args: any[]) {
  if(arguments.length < 1) { 
    throw new TypeError('reply - not enough arguments'); 
  }

  //if(arguments[0] === 'frame') return;

  args = Array.prototype.slice.call(arguments, 1);
  if(isSafari(self)) {
    postMessage({queryMethodListener: arguments[0], queryMethodArguments: args});
  } else {
    const transfer: ArrayBuffer[] = [];
    for(let i = 0; i < args.length; ++i) {
      if(args[i] instanceof ArrayBuffer) {
        transfer.push(args[i]);
      }
  
      if(args[i].buffer && args[i].buffer instanceof ArrayBuffer) {
        transfer.push(args[i].buffer);
      }
    }

    postMessage({queryMethodListener: arguments[0], queryMethodArguments: args}, transfer);
  }
}

onmessage = function(e) {
  // @ts-ignore
  queryableFunctions[e.data.queryMethod].apply(queryableFunctions, e.data.queryMethodArguments);
};
