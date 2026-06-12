import BezierEasing from '@vendor/bezierEasing';
import callbackify from '@helpers/callbackify';
import DotRendererCore, {drawClippingCircle, DotRendererConfig} from '@components/dotRendererCore';

export type SpoilerRendererSimInit = {
  width: number,
  height: number,
  dpr: number,
  config: DotRendererConfig,
  vertexURL: string,
  fragmentURL: string
};

export type SpoilerRendererInMessage =
  ({type: 'bluff-init'} & SpoilerRendererSimInit) |
  {type: 'bluff-play'} |
  {type: 'bluff-pause'} |
  ({type: 'media-init'} & SpoilerRendererSimInit) |
  {type: 'media-attach', id: number, canvas: OffscreenCanvas, x: number, y: number, color?: string} |
  {type: 'media-play' | 'media-pause' | 'media-detach', id: number} |
  {type: 'media-reveal', id: number, coords: {x: number, y: number}, maxDist: number, duration: number} |
  {type: 'bye'};

export type SpoilerRendererOutMessage =
  {type: 'bluff-mask', url: string} |
  {type: 'media-inited'};

const ctx = self as any;

const FRAME_INTERVAL = 1000 / 60;
const ENCODE_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues
const simpleEasing = BezierEasing(0.25, 0.1, 0.25, 1); // mirrors simpleEasing from @helpers/animateValue

let reader: FileReaderSync;

type MediaTarget = {
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  color?: string,
  playing?: boolean,
  revealed?: boolean,
  reveal?: {coords: {x: number, y: number}, maxDist: number, duration: number, startTime: number}
};

type Port = {postMessage: (message: any, transfer?: Transferable[]) => void};

/**
 * One state per connected tab (SharedWorker), or the single implicit one
 * (dedicated worker fallback)
 */
type PortState = {
  port: Port,
  bluffDpr?: number,
  bluffPlaying?: boolean,
  mediaDpr?: number,
  mediaTargets: Map<number, MediaTarget>
};

const ports = new Set<PortState>();

// Tabs may live on displays with different pixel ratios — each ratio gets its own
// simulation, in practice there is one
type Sim = {core: DotRendererCore, canvas: OffscreenCanvas};
type BluffSim = Sim & {encoding?: boolean, lastEncodeTime: number};
const bluffSims = new Map<number, BluffSim>();
const mediaSims = new Map<number, Sim>();

let timerId: number;

const createSim = (init: SpoilerRendererSimInit): Sim => {
  const canvas = new OffscreenCanvas(init.width * init.dpr, init.height * init.dpr);
  const core = new DotRendererCore(canvas, {vertex: init.vertexURL, fragment: init.fragmentURL});
  core.resize(init.width, init.height, init.dpr, init.config);
  core.init();
  return {core, canvas};
};

const encodeBluffMask = (sim: BluffSim, dpr: number) => {
  sim.encoding = true;
  // webp is pixel-identical here at less than half the png size; unsupporting
  // browsers (Safari) silently encode png instead
  sim.canvas.convertToBlob({type: 'image/webp', quality: 1}).then((blob) => {
    sim.encoding = false;
    // data: URLs resolve synchronously when referenced from CSS; blob: URLs load
    // asynchronously on every swap (even when predecoded) and flicker the mask
    reader ??= new FileReaderSync();
    const url = reader.readAsDataURL(blob);
    ports.forEach((state) => {
      if(state.bluffPlaying && state.bluffDpr === dpr) {
        state.port.postMessage({type: 'bluff-mask', url});
      }
    });
  }, () => {
    sim.encoding = false;
  });
};

const drawMediaTarget = (sim: Sim, target: MediaTarget, dpr: number) => {
  const {canvas, context, x, y, reveal} = target;
  const {width, height} = canvas;

  context.clearRect(0, 0, width, height);

  if(!reveal) {
    context.drawImage(sim.canvas, x, y, width, height, 0, 0, width, height);
  } else {
    const progress = simpleEasing(Math.min((Date.now() - reveal.startTime) / reveal.duration, 1));

    // Zoom (push) the particles
    const scaledProgress = progress ** 2 /* * Math.sqrt(progress) */ * 0.5;
    context.drawImage(sim.canvas,
      x + reveal.coords.x * scaledProgress, y + reveal.coords.y * scaledProgress, width * (1 - scaledProgress), height * (1 - scaledProgress),
      0, 0, width, height
    );

    // Draw a clipping circle growing from where the user clicked
    drawClippingCircle(context, progress, reveal.coords, reveal.maxDist, dpr);

    if(progress >= 1) {
      target.revealed = true;
    }
  }

  if(target.color) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = target.color;
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';
  }
};

const isMediaTargetActive = (target: MediaTarget) => !target.revealed && (target.playing || !!target.reveal);

const needsFrame = () => {
  for(const state of ports) {
    if(state.bluffPlaying) return true;
    for(const target of state.mediaTargets.values()) {
      if(isMediaTargetActive(target)) return true;
    }
  }
  return false;
};

const frame = () => {
  bluffSims.forEach((sim, dpr) => {
    let anyPlaying = false;
    for(const state of ports) {
      if(state.bluffPlaying && state.bluffDpr === dpr) {
        anyPlaying = true;
        break;
      }
    }
    if(!anyPlaying) return;

    sim.core.draw();

    const now = Date.now();
    if(!sim.encoding && sim.core.inited && (now - sim.lastEncodeTime) >= ENCODE_INTERVAL) {
      sim.lastEncodeTime = now;
      encodeBluffMask(sim, dpr);
    }
  });

  const mediaDprsNeeded = new Set<number>();
  ports.forEach((state) => {
    for(const target of state.mediaTargets.values()) {
      if(isMediaTargetActive(target)) {
        mediaDprsNeeded.add(state.mediaDpr);
        break;
      }
    }
  });
  mediaDprsNeeded.forEach((dpr) => mediaSims.get(dpr)?.core.draw());
  ports.forEach((state) => {
    const sim = mediaSims.get(state.mediaDpr);
    if(!sim) return;
    state.mediaTargets.forEach((target) => {
      if(!isMediaTargetActive(target)) return;
      drawMediaTarget(sim, target, state.mediaDpr);
    });
  });

  // setTimeout instead of requestAnimationFrame — nothing is presented from the
  // simulation canvases, the cadence only drives the simulation steps
  timerId = needsFrame() ? ctx.setTimeout(frame, FRAME_INTERVAL) : undefined;
};

const ensureLoop = () => {
  if(timerId !== undefined || !needsFrame()) return;

  const now = Date.now();
  bluffSims.forEach((sim) => sim.core.lastDrawTime = now);
  mediaSims.forEach((sim) => sim.core.lastDrawTime = now);
  frame();
};

const removePort = (state: PortState) => {
  if(!ports.delete(state)) return;

  if(!ports.size) { // free the GL resources, the worker scope itself stays
    bluffSims.forEach(({core}) => core.destroy());
    mediaSims.forEach(({core}) => core.destroy());
    bluffSims.clear();
    mediaSims.clear();
  }
};

// legacy mode for browsers without WebGL in OffscreenCanvas: the simulation runs
// on the main thread, this worker only encodes the received frames
let encodeCanvas: OffscreenCanvas;
let encodeContext: ImageBitmapRenderingContext;
const encodeBitmap = (state: PortState, bitmap: ImageBitmap) => {
  if(!encodeCanvas || encodeCanvas.width !== bitmap.width || encodeCanvas.height !== bitmap.height) {
    encodeCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    encodeContext = encodeCanvas.getContext('bitmaprenderer');
  }

  encodeContext.transferFromImageBitmap(bitmap);
  encodeCanvas.convertToBlob({type: 'image/webp', quality: 1}).then((blob) => {
    reader ??= new FileReaderSync();
    state.port.postMessage({type: 'bluff-mask', url: reader.readAsDataURL(blob)});
  });
};

const handleMessage = (state: PortState, message: SpoilerRendererInMessage | ImageBitmap) => {
  if(message instanceof ImageBitmap) {
    encodeBitmap(state, message);
    return;
  }

  switch(message.type) {
    case 'bluff-init': {
      state.bluffDpr = message.dpr;
      if(!bluffSims.has(message.dpr)) {
        bluffSims.set(message.dpr, {...createSim(message), lastEncodeTime: 0});
      }
      break;
    }

    case 'bluff-play': {
      state.bluffPlaying = true;
      ensureLoop();
      break;
    }

    case 'bluff-pause': {
      state.bluffPlaying = false;
      break;
    }

    case 'media-init': {
      state.mediaDpr = message.dpr;
      let sim = mediaSims.get(message.dpr);
      if(!sim) mediaSims.set(message.dpr, sim = createSim(message));
      callbackify(sim.core.init(), () => state.port.postMessage({type: 'media-inited'}));
      break;
    }

    case 'media-attach': {
      state.mediaTargets.set(message.id, {
        canvas: message.canvas,
        context: message.canvas.getContext('2d'),
        x: message.x,
        y: message.y,
        color: message.color
      });
      break;
    }

    case 'media-play': {
      const target = state.mediaTargets.get(message.id);
      if(!target) break;
      target.playing = true;
      ensureLoop();
      break;
    }

    case 'media-pause': {
      const target = state.mediaTargets.get(message.id);
      if(target) target.playing = false;
      break;
    }

    case 'media-reveal': {
      const target = state.mediaTargets.get(message.id);
      if(!target || target.revealed) break;
      target.reveal = {
        coords: message.coords,
        maxDist: message.maxDist,
        duration: message.duration,
        startTime: Date.now()
      };
      ensureLoop();
      break;
    }

    case 'media-detach': {
      state.mediaTargets.delete(message.id);
      break;
    }

    case 'bye': {
      removePort(state);
      break;
    }
  }
};

const setupPort = (port: Port & {onmessage?: any, addEventListener?: any}) => {
  const state: PortState = {port, mediaTargets: new Map()};
  ports.add(state);
  port.onmessage = (event: MessageEvent) => handleMessage(state, event.data);
  // fires when the other side's document is destroyed (where supported)
  port.addEventListener?.('close', () => removePort(state));
};

if(typeof(DedicatedWorkerGlobalScope) !== 'undefined' && self instanceof DedicatedWorkerGlobalScope) {
  setupPort(ctx);
} else {
  (self as any as SharedWorkerGlobalScope).onconnect = (event) => setupPort(event.ports[0]);
}
