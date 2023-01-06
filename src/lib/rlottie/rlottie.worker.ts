/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CAN_USE_TRANSFERABLES from '../../environment/canUseTransferables';
import IS_IMAGE_BITMAP_SUPPORTED from '../../environment/imageBitmapSupport';
import readBlobAsText from '../../helpers/blob/readBlobAsText';
import applyReplacements from './applyReplacements';

importScripts('rlottie-wasm.js');
// import Module, { allocate, intArrayFromString } from './rlottie-wasm';

const _Module = (self as any).Module as any;

const DEFAULT_FPS = 60;

type LottieHandlePointer = number;

// throw new Error('test');

export class RLottieItem {
  private stringOnWasmHeap: number;
  private handle: LottieHandlePointer;
  private frameCount: number;
  private fps: number;

  private dead: boolean;
  // private context: OffscreenCanvasRenderingContext2D;

  private imageData: ImageData;

  constructor(
    private reqId: number,
    private width: number,
    private height: number,
    private raw?: boolean/* ,
    private canvas: OffscreenCanvas */
  ) {
  }

  public init(json: string, fps: number) {
    if(this.dead) {
      return;
    }

    this.fps = Math.max(1, Math.min(60, fps || DEFAULT_FPS));

    // this.context = canvas.getContext('2d');
    /* let frame = 0;
    setInterval(() => {
      if(frame >= this.frameCount) frame = 0;
      let _frame = frame++;
      this.render(_frame, null);
    }, 1000 / this.fps); */

    try {
      this.handle = worker.Api.init();

      // @ts-ignore
      this.stringOnWasmHeap = allocate(intArrayFromString(json), 'i8', 0);

      this.frameCount = worker.Api.loadFromData(this.handle, this.stringOnWasmHeap);

      worker.Api.resize(this.handle, this.width, this.height);

      reply(['loaded', this.reqId, this.frameCount, this.fps]);

      if(!this.raw && IS_IMAGE_BITMAP_SUPPORTED) {
        this.imageData = new ImageData(this.width, this.height);
      }
    } catch(e) {
      console.error('init RLottieItem error:', e);
      reply(['error', this.reqId, e]);
    }
  }

  public render(frameNo: number, clamped?: Uint8ClampedArray) {
    if(this.dead || this.handle === undefined) return;
    // return;

    if(this.frameCount < frameNo || frameNo < 0) {
      return;
    }

    try {
      worker.Api.render(this.handle, frameNo);

      const bufferPointer = worker.Api.buffer(this.handle);

      const data = _Module.HEAPU8.subarray(bufferPointer, bufferPointer + (this.width * this.height * 4));

      if(this.imageData) {
        this.imageData.data.set(data);
        createImageBitmap(this.imageData).then((imageBitmap) => {
          reply(['frame', this.reqId, frameNo, imageBitmap], [imageBitmap]);
        });
      } else {
        if(!clamped) {
          clamped = new Uint8ClampedArray(data);
        } else {
          clamped.set(data);
        }

        // this.context.putImageData(new ImageData(clamped, this.width, this.height), 0, 0);

        reply(['frame', this.reqId, frameNo, clamped], [clamped.buffer]);
      }
    } catch(e) {
      console.error('Render error:', e);
      this.dead = true;
      reply(['error', this.reqId, e]);
    }
  }

  public destroy() {
    this.dead = true;

    if(this.handle !== undefined) {
      worker.Api.destroy(this.handle);
    }
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
      loadFromData: _Module.cwrap('lottie_load_from_data', 'number', ['number', 'number'])
    };
  }

  public init() {
    this.initApi();
    reply(['ready']);
  }
}

const worker = new RLottieWorker();

_Module.onRuntimeInitialized = function() {
  worker.init();
};

const items: {[reqId: string]: RLottieItem} = {};
const queryableFunctions = {
  loadFromData: function(reqId: number, blob: Blob, width: number, height: number, toneIndex: number, raw: boolean/* , canvas: OffscreenCanvas */) {
    const item = items[reqId] = new RLottieItem(reqId, width, height, raw/* , canvas */);
    readBlobAsText(blob).then((json) => {
      try {
        if(typeof(toneIndex) === 'number' && toneIndex >= 1 && toneIndex <= 5) {
          /* params.animationData = copy(params.animationData);
          this.applyReplacements(params.animationData, toneIndex); */

          const newAnimationData = JSON.parse(json);
          applyReplacements(newAnimationData, toneIndex);
          json = JSON.stringify(newAnimationData);
        }

        // ! WARNING, с этой проверкой не все стикеры работают, например - ДУРКА
        /* if(!/"tgs":\s*?1./.test(jsString)) {
          throw new Error('Invalid file');
        } */

        /* let perf = performance.now();
        let json = JSON.parse(jsString);
        console.log('sticker decode:', performance.now() - perf); */

        const match = json.match(/"fr":\s*?(\d+?),/);
        const frameRate = +match?.[1] || DEFAULT_FPS;

        // console.log('Rendering sticker:', reqId, frameRate, 'now rendered:', Object.keys(items).length);

        item.init(json, frameRate);
      } catch(err) {
        console.error('Invalid file for sticker:', json);
        reply(['error', reqId, err]);
      }
    });
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
    // console.log('worker renderFrame', reqId, frameNo, clamped);
    items[reqId].render(frameNo, clamped);
  }
};

function reply(args: any[], transfer?: Transferable[]) {
  postMessage({queryMethodListener: args.shift(), queryMethodArguments: args}, CAN_USE_TRANSFERABLES ? transfer : undefined);
}

onmessage = function(e) {
  // @ts-ignore
  queryableFunctions[e.data.queryMethod].apply(queryableFunctions, e.data.queryMethodArguments);
};
