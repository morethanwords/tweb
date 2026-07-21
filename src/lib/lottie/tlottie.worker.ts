import ctx from '@environment/ctx';
import IS_IMAGE_BITMAP_SUPPORTED from '@environment/imageBitmapSupport';
import readBlobAsText from '@helpers/blob/readBlobAsText';
import applyColorOnContext, {paintFrameTinted} from '@helpers/canvas/applyColorOnContext';
import listenMessagePort from '@helpers/listenMessagePort';
import makeError from '@helpers/makeError';
import safeAssign from '@helpers/object/safeAssign';
import applyReplacements from '@lib/lottie/applyReplacements';
import lottieMessagePort, {LottieOffscreenInit} from '@lib/lottie/lottieMessagePort';
import loadTLottieWasm, {TLottieHandle, TLottieWasm} from '@lib/lottie/tlottieWasm';
import SuperMessagePort from '@lib/superMessagePort';

type WorkerFramesCacheEntry = {frames: Map<number, ImageBitmap>, refs: Set<number>};
const framesCacheByName: Map<string, WorkerFramesCacheEntry> = new Map();

const compositorPorts: Map<MessageEventSource, MessagePort> = new Map(); // tab source port -> compositor decode port

const suspendedPorts: Set<MessageEventSource> = new Set(); // tabs that are hidden - their free-run clocks are stopped

type RenderOffscreenResult = {frameNo: number};

export class TLottieItem {
  private tlottie: TLottieWasm;
  private handle: TLottieHandle;
  private frameCount: number;
  private fps: number;

  private dead: boolean;
  // private context: OffscreenCanvasRenderingContext2D;

  private imageData: ImageData;

  public port: MessageEventSource;
  public offscreen: boolean;
  public canvases: OffscreenCanvas[];
  public contexts: OffscreenCanvasRenderingContext2D[];
  private cacheName: string;
  private cacheEntry: WorkerFramesCacheEntry;
  private cachingDelta: number;
  private color: string;
  private compositorDelivery: boolean;
  private stagedFrame: ImageBitmap;
  private stagedFrameNo: number;
  private stagedFrameInCache: boolean;

  private freeRun: {
    timeout: ReturnType<typeof setTimeout>,
    frThen: number,
    curFrame: number,
    frInterval: number,
    skipDelta: number,
    direction: number,
    minFrame: number,
    maxFrame: number,
    loop: boolean // true: wrap forever; false: stop at the far bound (play-once)
  };
  private freeRunSuspended: boolean;

  constructor(
    private reqId: number,
    private width: number,
    private height: number,
    private wasmUrl: string,
    private raw?: boolean/* ,
    private canvas: OffscreenCanvas */
  ) {
  }

  public initOffscreen(offscreen: LottieOffscreenInit) {
    this.offscreen = true;
    this.canvases = offscreen.canvases;
    // the UI cacheName is generated from pre-pixelRatio dimensions while this item renders at the
    // scaled size; the cache is shared across tabs (SharedWorker pool) and tabs can differ in
    // effective dpr - key by the scaled dimensions so a hit never serves a wrong-size bitmap
    this.cacheName = offscreen.cacheName && `${this.wasmUrl}|${offscreen.cacheName}-${this.width}x${this.height}`;
    this.cachingDelta = offscreen.cachingDelta;
    this.color = offscreen.color;
    this.compositorDelivery = offscreen.compositorDelivery;
    this.contexts = offscreen.canvases.map((canvas) => canvas.getContext('2d'));

    if(this.cacheName) {
      let entry = framesCacheByName.get(this.cacheName);
      if(!entry) {
        framesCacheByName.set(this.cacheName, entry = {frames: new Map(), refs: new Set()});
      }

      entry.refs.add(this.reqId);
      this.cacheEntry = entry;
    }
  }

  public init(json: string, tlottie: TLottieWasm) {
    if(this.dead) {
      throw makeError('ITEM_DESTROYED');
    }

    this.tlottie = tlottie;

    // this.context = canvas.getContext('2d');
    /* let frame = 0;
    setInterval(() => {
      if(frame >= this.frameCount) frame = 0;
      let _frame = frame++;
      this.render(_frame, null);
    }, 1000 / this.fps); */

    try {
      const animation = this.tlottie.createAnimation(json);
      this.handle = animation.handle;
      this.frameCount = animation.frameCount;
      this.fps = Math.max(1, Math.min(60, animation.frameRate));

      if(!this.raw && IS_IMAGE_BITMAP_SUPPORTED) {
        this.imageData = new ImageData(this.width, this.height);
      }

      return {
        frameCount: this.frameCount,
        fps: this.fps
      };
    } catch(e) {
      console.error('init TLottieItem error:', e);
      throw e;
    }
  }

  private assertRenderable(frameNo: number) {
    if(this.dead || this.handle === undefined) {
      throw makeError('ITEM_DESTROYED');
    }

    if(this.frameCount < frameNo || frameNo < 0) {
      throw makeError('FRAME_OUT_OF_RANGE');
    }
  }

  private renderToHeap(frameNo: number): Uint8Array {
    return this.tlottie.render(this.handle, frameNo, this.width, this.height);
  }

  private heapToBitmap(data: Uint8Array): Promise<ImageBitmap> {
    this.imageData.data.set(data);
    return createImageBitmap(this.imageData).then((bitmap) => {
      if(this.dead) {
        throw makeError('ITEM_DESTROYED');
      }

      return bitmap;
    });
  }

  public render(frameNo: number, clamped?: Uint8ClampedArray) {
    this.assertRenderable(frameNo);
    // return;

    try {
      const data = this.renderToHeap(frameNo);

      if(this.imageData) {
        return this.heapToBitmap(data).then((imageBitmap) => {
          return new SuperMessagePort.TransferableResult({frameNo, frame: imageBitmap}, [imageBitmap]);
        });
      } else {
        if(!clamped) {
          clamped = new Uint8ClampedArray(data);
        } else {
          clamped.set(data);
        }

        // this.context.putImageData(new ImageData(clamped, this.width, this.height), 0, 0);

        return new SuperMessagePort.TransferableResult({frameNo, frame: clamped}, [clamped.buffer]);
      }
    } catch(e) {
      console.error('Render error:', e);
      this.dead = true;
      throw e;
    }
  }

  public renderOffscreen(frameNo: number, withDelivery = true): RenderOffscreenResult | Promise<RenderOffscreenResult> {
    this.assertRenderable(frameNo);

    const entry = this.cacheEntry;
    const cachedBitmap = entry?.frames.get(frameNo);
    if(cachedBitmap) {
      this.stage(cachedBitmap, frameNo, true);
      return withDelivery && this.compositorDelivery ? this.deliver(frameNo) : {frameNo};
    }

    try {
      const data = this.renderToHeap(frameNo);

      return this.heapToBitmap(data).then((bitmap) => {
        let inCache = false;
        if(entry && this.cachingDelta && (frameNo % this.cachingDelta || !frameNo)) { // today's exact UI cache write rule
          entry.frames.set(frameNo, bitmap);
          inCache = true;
        }

        this.stage(bitmap, frameNo, inCache);
        return withDelivery && this.compositorDelivery ? this.deliver(frameNo) : {frameNo};
      });
    } catch(e) {
      console.error('Render error:', e);
      this.dead = true;
      throw e;
    }
  }

  // transfer-vs-cache rule: a cached bitmap must NEVER be transferred (it would detach
  // for every other item sharing the cache) - ship a copy; an uncached staged bitmap
  // transfers directly (emoji items have no canvases, nothing presents it)
  private async deliver(frameNo: number): Promise<RenderOffscreenResult> {
    const staged = this.stagedFrame;
    const port = staged && compositorPorts.get(this.port);
    if(!port) { // skip silently when the port is missing
      return {frameNo};
    }

    let frame: ImageBitmap;
    if(!this.stagedFrameInCache && this.stagedFrame === staged) {
      this.stagedFrame = undefined; // stagedFrameNo stays tracked (it is exportFrame's default)
      frame = staged;
    } else {
      frame = await createImageBitmap(staged);
    }

    port.postMessage({reqId: this.reqId, frame}, [frame]);
    return {frameNo};
  }

  private stage(bitmap: ImageBitmap, frameNo: number, inCache: boolean) {
    const previous = this.stagedFrame;
    if(previous && !this.stagedFrameInCache && previous !== bitmap) {
      previous.close?.();
    }

    this.stagedFrame = bitmap;
    this.stagedFrameNo = frameNo;
    this.stagedFrameInCache = inCache;
  }

  private paintStaged(context: OffscreenCanvasRenderingContext2D) {
    paintFrameTinted(context, this.stagedFrame, this.color);
  }

  public presentFrame() {
    if(!this.stagedFrame) {
      return;
    }

    for(const context of this.contexts) {
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      this.paintStaged(context);
    }
  }

  public resizeCanvases(width: number, height: number) {
    this.canvases.forEach((canvas) => {
      canvas.width = width;
      canvas.height = height;
    });
  }

  public setColor(color: string, reTint: boolean) {
    this.color = color;

    if(reTint && color) {
      this.contexts.forEach((context) => {
        applyColorOnContext(context, color, 0, 0, context.canvas.width, context.canvas.height);
      });
    }
  }

  public async exportFrame(frameNo?: number) {
    frameNo ??= this.stagedFrameNo ?? 0;

    if(this.stagedFrameNo !== frameNo || !this.stagedFrame) {
      await this.renderOffscreen(frameNo, false); // no delivery - the staged bitmap must survive for the export
    }

    const canvas = new OffscreenCanvas(this.width, this.height);
    const context = canvas.getContext('2d');
    this.paintStaged(context);

    const frame = canvas.transferToImageBitmap();
    return new SuperMessagePort.TransferableResult({frameNo, frame}, [frame]);
  }

  public clearFramesCache() {
    if(this.cachingDelta === Infinity) {
      return;
    }

    const entry = this.cacheEntry;
    if(!entry || entry.refs.size > 1) {
      return;
    }

    for(const bitmap of entry.frames.values()) {
      if(bitmap === this.stagedFrame) {
        this.stagedFrameInCache = false; // closed on the next stage() replace
        continue;
      }

      bitmap.close?.();
    }

    entry.frames.clear();
  }


  public playFreeRun(params: {curFrame: number, frInterval: number, skipDelta: number, direction: number, minFrame: number, maxFrame: number, loop: boolean}) {
    this.stopFreeRun('play');
    this.freeRun = {...params, timeout: undefined, frThen: Date.now()};

    if(suspendedPorts.has(this.port)) {
      this.freeRunSuspended = true; // starts on resumeTab
      return;
    }

    this.armFreeRun();
  }

  public pauseFreeRun() {
    const curFrame = this.freeRun ? this.freeRun.curFrame : this.stagedFrameNo;
    this.stopFreeRun('pause');
    return {curFrame};
  }

  public updateFreeRun(params: Partial<{frInterval: number, direction: number, minFrame: number, maxFrame: number}>) {
    const freeRun = this.freeRun;
    if(!freeRun) {
      return;
    }

    safeAssign(freeRun, params); // skips undefined values
  }

  public suspendFreeRun() {
    const freeRun = this.freeRun;
    if(!freeRun) {
      return;
    }

    if(freeRun.timeout !== undefined) {
      clearTimeout(freeRun.timeout);
      freeRun.timeout = undefined;
    }

    this.freeRunSuspended = true;
  }

  public resumeFreeRun() {
    const freeRun = this.freeRun;
    if(!freeRun || !this.freeRunSuspended) {
      return;
    }

    this.freeRunSuspended = false;
    freeRun.frThen = Date.now(); // resnap the deadline past the suspension gap
    this.armFreeRun();
  }

  public stopFreeRun(reason = '?') {
    const freeRun = this.freeRun;
    if(!freeRun) {
      return;
    }

    if(freeRun.timeout !== undefined) {
      clearTimeout(freeRun.timeout);
    }

    this.freeRun = undefined;
    this.freeRunSuspended = false;
  }

  private armFreeRun() {
    const freeRun = this.freeRun;
    if(!freeRun || freeRun.timeout !== undefined) {
      return;
    }

    const now = Date.now();
    freeRun.frThen = Math.max(now, freeRun.frThen + freeRun.frInterval); // deadline-corrected cadence
    freeRun.timeout = setTimeout(this.freeRunTick, freeRun.frThen - now);
  }

  private freeRunTick = async() => {
    const freeRun = this.freeRun;
    if(!freeRun || this.dead) {
      return;
    }

    freeRun.timeout = undefined;

    // mirrors mainLoopForwards/mainLoopBackwards: loop wraps at the bound, play-once
    // parks on it and ends - exactly the command-mode onLap trigger (curFrame unchanged
    // across the step while the next step would still overrun the bound)
    const {curFrame, skipDelta, direction, minFrame, maxFrame, loop} = freeRun;
    const forwards = direction === 1;
    const frame = forwards ?
      ((curFrame + skipDelta) > maxFrame ? (loop ? minFrame : maxFrame) : curFrame + skipDelta) :
      ((curFrame - skipDelta) < minFrame ? (loop ? maxFrame : minFrame) : curFrame - skipDelta);
    freeRun.curFrame = frame;
    const ended = !loop && curFrame === frame &&
      (forwards ? (frame + skipDelta) > maxFrame : (frame - skipDelta) < minFrame);

    try {
      await this.renderOffscreen(frame); // posts to the compositor itself when compositorDelivery

      if(this.dead || this.freeRun !== freeRun || this.freeRunSuspended) {
        return;
      }

      this.presentFrame(); // no-op for emoji items (zero contexts) and when the staged frame was transferred
    } catch(err) {
      // any throw here (render OR present) must not kill the clock silently - hand
      // the player back to the UI so it downgrades to command mode and logs the cause
      this.stopFreeRun('error');
      if(!this.dead) {
        lottieMessagePort.invokeVoid('freeRunStopped', {
          reqId: this.reqId,
          curFrame: freeRun.curFrame,
          error: String((err as Error)?.message || err)
        }, this.port);
      }

      return;
    }

    if(ended) {
      // play-once finished on `frame` (now painted) - stop the worker clock and hand
      // the final frame to the UI so it settles into the paused end-of-play state
      this.stopFreeRun('ended');
      if(!this.dead) {
        lottieMessagePort.invokeVoid('freeRunEnded', {reqId: this.reqId, curFrame: frame}, this.port);
      }

      return;
    }

    this.armFreeRun();
  };

  public destroy() {
    this.dead = true;
    this.stopFreeRun();

    if(this.handle !== undefined) {
      this.tlottie.destroyAnimation(this.handle);
    }

    if(this.offscreen) {
      const entry = this.cacheEntry;
      if(entry) {
        entry.refs.delete(this.reqId);
        if(!entry.refs.size) {
          for(const bitmap of entry.frames.values()) {
            bitmap.close?.();
          }

          entry.frames.clear();
          framesCacheByName.delete(this.cacheName);
        }

        this.cacheEntry = undefined;
      }

      if(this.stagedFrame && !this.stagedFrameInCache) {
        this.stagedFrame.close?.();
      }

      this.stagedFrame = undefined;
      this.canvases = this.contexts = undefined;
    }
  }
}

const items: {[reqId: string]: TLottieItem} = {};

const destroyItem = (reqId: number | string) => {
  const item = items[reqId];
  if(!item) {
    return;
  }

  item.destroy();
  delete items[reqId];
};

const withItem = <T>(reqId: number, callback: (item: TLottieItem) => T): T => {
  const item = items[reqId];
  if(item) return callback(item);
};

const forEachItemOfSource = (source: MessageEventSource, callback: (item: TLottieItem, reqId: string) => void) => {
  for(const reqId in items) {
    const item = items[reqId];
    if(item.port === source) {
      callback(item, reqId);
    }
  }
};

lottieMessagePort.addMultipleEventsListeners({
  terminate: () => {
    ctx.close();
  },

  port: (_, __, event) => {
    lottieMessagePort.attachPort(event.ports[0]);
  },

  loadFromData: async({reqId, blob, wasmUrl, width, height, toneIndex, raw, offscreen}, source) => {
    const item = items[reqId] = new TLottieItem(reqId, width, height, wasmUrl, raw/* , canvas */);
    item.port = source;
    let json: string;

    try {
      if(offscreen) {
        item.initOffscreen(offscreen);
      }

      json = await readBlobAsText(blob);
      const tlottie = await loadTLottieWasm(wasmUrl);

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

      // console.log('Rendering sticker:', reqId, 'now rendered:', Object.keys(items).length);

      return item.init(json, tlottie);
    } catch(err) {
      destroyItem(reqId);
      console.error('Unable to load lottie animation:', err);
      throw err;
    }
  },

  destroy: ({reqId}) => {
    destroyItem(reqId);
  },

  renderFrame: ({reqId, frameNo, clamped}) => {
    const item = items[reqId];
    return (item.offscreen ? item.renderOffscreen(frameNo) : item.render(frameNo, clamped)) as any;
  },

  presentFrame: async({reqId, frameNo}) => withItem(reqId, async(item) => {
    item.presentFrame();
    return {frameNo};
  }),

  resizeCanvases: ({reqId, width, height}) => withItem(reqId, (item) => item.resizeCanvases(width, height)),

  setColor: ({reqId, color, reTint}) => withItem(reqId, (item) => item.setColor(color, reTint)),

  exportFrame: ({reqId, frameNo}) => withItem(reqId, (item) => item.exportFrame(frameNo) as any),

  clearFramesCache: ({reqId}) => withItem(reqId, (item) => item.clearFramesCache()),

  compositorPort: (_, source, event) => {
    compositorPorts.set(source, event.ports[0]);
  },

  playFreeRun: ({reqId, curFrame, frInterval, skipDelta, direction, minFrame, maxFrame, loop}) => withItem(reqId, (item) => {
    item.playFreeRun({curFrame, frInterval, skipDelta, direction, minFrame, maxFrame, loop});
  }),

  pauseFreeRun: async({reqId}) => withItem(reqId, (item) => item.pauseFreeRun()),

  updateFreeRun: ({reqId, ...params}) => withItem(reqId, (item) => item.updateFreeRun(params)),

  suspendTab: (_, source) => {
    suspendedPorts.add(source);
    forEachItemOfSource(source, (item) => item.suspendFreeRun());
  },

  debugTag: () => 'tlottie-simd-2', // bump on worker edits to verify the running bundle

  resumeTab: (_, source) => {
    suspendedPorts.delete(source);
    forEachItemOfSource(source, (item) => item.resumeFreeRun());
  }
});

if(typeof(MessageChannel) !== 'undefined') listenMessagePort(lottieMessagePort, (source) => {
  const channel = new MessageChannel();
  lottieMessagePort.attachPort(channel.port1);
  lottieMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
}, (source) => {
  forEachItemOfSource(source, (item, reqId) => destroyItem(reqId));

  const compositorPort = compositorPorts.get(source);
  if(compositorPort) {
    compositorPort.close();
    compositorPorts.delete(source);
  }

  suspendedPorts.delete(source);
});
