import DotRendererCore, {DotRendererConfig} from '@components/dotRendererCore';

export type BluffSpoilerSimInitMessage = {
  type: 'init',
  width: number,
  height: number,
  dpr: number,
  config: DotRendererConfig,
  vertexURL: string,
  fragmentURL: string
};

export type BluffSpoilerSimMessage = BluffSpoilerSimInitMessage | {type: 'play'} | {type: 'pause'};

const ctx = self as any as DedicatedWorkerGlobalScope;

const FRAME_INTERVAL = 1000 / 60;
const ENCODE_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues

let reader: FileReaderSync;

let simCanvas: OffscreenCanvas;
let core: DotRendererCore;
let timerId: number;
let lastEncodeTime = 0;
let encoding = false;

let encodeCanvas: OffscreenCanvas;
let encodeContext: ImageBitmapRenderingContext;

const encode = (canvas: OffscreenCanvas) => {
  encoding = true;
  // webp is pixel-identical here at less than half the png size; unsupporting
  // browsers (Safari) silently encode png instead
  canvas.convertToBlob({type: 'image/webp', quality: 1}).then((blob) => {
    encoding = false;
    // data: URLs resolve synchronously when referenced from CSS; blob: URLs load
    // asynchronously on every swap (even when predecoded) and flicker the mask
    reader ??= new FileReaderSync();
    ctx.postMessage(reader.readAsDataURL(blob));
  }, () => {
    encoding = false;
  });
};

const simFrame = () => {
  core.draw();

  const now = Date.now();
  if(!encoding && core.inited && (now - lastEncodeTime) >= ENCODE_INTERVAL) {
    lastEncodeTime = now;
    encode(simCanvas);
  }

  // setTimeout instead of requestAnimationFrame — nothing is presented from this
  // canvas, the cadence only drives the simulation steps
  timerId = ctx.setTimeout(simFrame, FRAME_INTERVAL);
};

const handlers = {
  init: (message: BluffSpoilerSimInitMessage) => {
    simCanvas = new OffscreenCanvas(message.width * message.dpr, message.height * message.dpr);
    core = new DotRendererCore(simCanvas, {vertex: message.vertexURL, fragment: message.fragmentURL});
    core.resize(message.width, message.height, message.dpr, message.config);
    core.init();
  },

  play: () => {
    if(timerId !== undefined || !core) return;
    core.lastDrawTime = Date.now();
    simFrame();
  },

  pause: () => {
    if(timerId === undefined) return;
    ctx.clearTimeout(timerId);
    timerId = undefined;
  }
};

ctx.addEventListener('message', (event: MessageEvent<BluffSpoilerSimMessage | ImageBitmap>) => {
  const {data} = event;

  // legacy mode for browsers without WebGL in OffscreenCanvas: the simulation runs
  // on the main thread, this worker only encodes the received frames
  if(data instanceof ImageBitmap) {
    let canvas = encodeCanvas, context = encodeContext;
    if(!canvas || canvas.width !== data.width || canvas.height !== data.height) {
      canvas = encodeCanvas = new OffscreenCanvas(data.width, data.height);
      context = encodeContext = canvas.getContext('bitmaprenderer');
    }

    context.transferFromImageBitmap(data);
    encode(canvas);
    return;
  }

  handlers[data.type]?.(data as any);
});
