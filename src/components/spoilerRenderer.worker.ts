import callbackify from '@helpers/callbackify';
import applyColorOnContext from '@helpers/canvas/applyColorOnContext';
import {defaultEasing, simpleEasing, unwrapEasing} from '@helpers/easings';
import DotRendererCore, {drawClippingCircle, DotRendererConfig} from '@components/dotRendererCore';
import {drawImageFromSource} from '@components/messageSpoilerOverlay/drawImageFromSource';

export type SpoilerRendererSimInit = {
  width: number,
  height: number,
  dpr: number,
  config: DotRendererConfig,
  vertexURL: string,
  fragmentURL: string
};

export type SpoilerOverlayRect = {
  left: number,
  top: number,
  width: number,
  height: number,
  color?: string
};

export type SpoilerOverlayUpdate = {
  type: 'overlay-update',
  id: number,
  width: number, // device pixels
  height: number,
  rects: SpoilerOverlayRect[], // CSS pixels
  backgroundColor: string,
  particleColor: string
};

export type SpoilerRendererInMessage =
  ({type: 'text-init'} & SpoilerRendererSimInit) |
  {type: 'bluff-play'} |
  {type: 'bluff-pause'} |
  ({type: 'media-init'} & SpoilerRendererSimInit) |
  {type: 'media-attach', id: number, canvas: OffscreenCanvas, x: number, y: number, color?: string} |
  {type: 'media-play' | 'media-pause' | 'media-detach', id: number} |
  {type: 'media-reveal', id: number, coords: {x: number, y: number}, maxDist: number, duration: number} |
  {type: 'overlay-attach', id: number, canvas: OffscreenCanvas, dpr: number} |
  SpoilerOverlayUpdate |
  {type: 'overlay-unwrap', id: number, coords: [number, number], maxDist: number, duration: number} |
  {type: 'overlay-wrap', id: number, duration: number} |
  {type: 'overlay-reset' | 'overlay-clear' | 'overlay-play' | 'overlay-pause' | 'overlay-detach', id: number} |
  {type: 'bye'};

export type SpoilerRendererOutMessage =
  {type: 'bluff-mask', url: string} |
  {type: 'text-inited'} |
  {type: 'media-inited'} |
  {type: 'connection-error'}; // synthesized by spoilerRendererConnection, never sent from here

const ctx = self as any;

const FRAME_INTERVAL = 1000 / 60;
const ENCODE_INTERVAL = 4 * (1000 / 60); // Once in 4 frames (considering 60fps) to avoid performance issues

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

/**
 * A bubble text-spoiler overlay: the geometry and the colors are measured on the
 * main thread (they are DOM-driven) and pushed here, the drawing and the unwrap
 * animation run in this worker
 */
type OverlayTarget = {
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  scratch: OffscreenCanvas, // the particles are tinted per rect before blitting
  scratchContext: OffscreenCanvasRenderingContext2D,
  dpr: number,
  rects: SpoilerOverlayRect[],
  backgroundColor: string,
  particleColor: string,
  playing?: boolean,
  needsRedraw?: boolean,
  unwrap?: {
    coords: [number, number],
    maxDist: number,
    from: number,
    to: number,
    duration: number,
    startTime: number,
    easing: (progress: number) => number
  }
};

type Port = {postMessage: (message: any, transfer?: Transferable[]) => void};

/**
 * One state per connected tab (SharedWorker), or the single implicit one
 * (dedicated worker fallback)
 */
type PortState = {
  port: Port,
  textDpr?: number,
  bluffPlaying?: boolean,
  mediaDpr?: number,
  mediaTargets: Map<number, MediaTarget>,
  overlayTargets: Map<number, OverlayTarget>
};

const ports = new Set<PortState>();

// Tabs may live on displays with different pixel ratios — each ratio gets its own
// simulation, in practice there is one
type Sim = {core: DotRendererCore, canvas: OffscreenCanvas};
type TextSim = Sim & {encoding?: boolean, lastEncodeTime: number};
const textSims = new Map<number, TextSim>(); // feeds both the bluff masks and the bubble overlays
const mediaSims = new Map<number, Sim>();

let timerId: number;

const createSim = (init: SpoilerRendererSimInit): Sim => {
  const canvas = new OffscreenCanvas(init.width * init.dpr, init.height * init.dpr);
  const core = new DotRendererCore(canvas, {vertex: init.vertexURL, fragment: init.fragmentURL});
  core.resize(init.width, init.height, init.dpr, init.config);
  core.init();
  return {core, canvas};
};

const encodeBluffMask = (sim: TextSim, dpr: number) => {
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
      if(state.bluffPlaying && state.textDpr === dpr) {
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
    applyColorOnContext(context, target.color, 0, 0, width, height);
  }
};

const getUnwrapProgress = (unwrap: OverlayTarget['unwrap']) => {
  const linear = Math.min((Date.now() - unwrap.startTime) / unwrap.duration, 1);
  return unwrap.from + (unwrap.to - unwrap.from) * unwrap.easing(linear);
};

const isUnwrapSettled = (unwrap: OverlayTarget['unwrap']) => (Date.now() - unwrap.startTime) >= unwrap.duration;

const drawOverlayTarget = (sim: Sim | undefined, target: OverlayTarget) => {
  const {canvas, context, scratch, scratchContext, dpr, rects, backgroundColor, particleColor} = target;
  const sourceCanvas = sim?.core.inited ? sim.canvas : undefined;

  let {unwrap} = target;
  if(unwrap && !unwrap.to && isUnwrapSettled(unwrap)) { // the wrap-back has finished
    unwrap = target.unwrap = undefined;
  }

  const progress = unwrap ? getUnwrapProgress(unwrap) : 0;
  const coords = unwrap?.coords;

  context.clearRect(0, 0, canvas.width, canvas.height);

  for(const rect of rects) {
    const x = rect.left;
    const y = Math.max(0, rect.top);
    const dw = rect.width;
    const dh = rect.height;

    context.fillStyle = rect.color || backgroundColor;
    context.fillRect(x * dpr, y * dpr, dw * dpr, dh * dpr);

    if(!sourceCanvas) continue;

    scratchContext.clearRect(x * dpr, y * dpr, dw * dpr, dh * dpr);
    if(!coords) {
      drawImageFromSource(scratchContext, sourceCanvas, x * dpr, y * dpr, dw * dpr, dh * dpr, x * dpr, y * dpr, dw * dpr, dh * dpr);
    } else {
      const scaledProgress = progress ** 2 /* * Math.sqrt(progress) */ * 0.4;
      drawImageFromSource(
        scratchContext,
        sourceCanvas,
        (x + (coords[0] - x) * scaledProgress) * dpr,
        (y + (coords[1] - y) * scaledProgress) * dpr,
        dw * (1 - scaledProgress) * dpr,
        dh * (1 - scaledProgress) * dpr,
        x * dpr,
        y * dpr,
        dw * dpr,
        dh * dpr
      );
    }

    applyColorOnContext(scratchContext, particleColor, x * dpr, y * dpr, dw * dpr, dh * dpr);

    context.drawImage(scratch, x * dpr, y * dpr, dw * dpr, dh * dpr, x * dpr, y * dpr, dw * dpr, dh * dpr);
  }

  if(coords && unwrap.maxDist) {
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'white';
    context.shadowBlur = unwrap.maxDist / 3.5 * dpr * progress;
    context.shadowColor = 'white';
    context.beginPath();
    context.arc(coords[0] * dpr, coords[1] * dpr, unwrap.maxDist * progress * dpr, 0, 2 * Math.PI);
    context.fill();
    context.globalCompositeOperation = 'source-over';
    context.restore();
  }

  target.needsRedraw = false;
};

const isMediaTargetActive = (target: MediaTarget) => !target.revealed && (target.playing || !!target.reveal);
const isOverlayTargetActive = (target: OverlayTarget) =>
  target.playing || target.needsRedraw || (target.unwrap && (!target.unwrap.to || !isUnwrapSettled(target.unwrap)));

const needsFrame = () => {
  for(const state of ports) {
    if(state.bluffPlaying) return true;
    for(const target of state.mediaTargets.values()) {
      if(isMediaTargetActive(target)) return true;
    }
    for(const target of state.overlayTargets.values()) {
      if(isOverlayTargetActive(target)) return true;
    }
  }
  return false;
};

const frame = () => {
  // the text simulation feeds the bluff masks and the bubble overlays
  const textDprsNeeded = new Set<number>();
  ports.forEach((state) => {
    if(state.bluffPlaying) textDprsNeeded.add(state.textDpr);
    for(const target of state.overlayTargets.values()) {
      if(isOverlayTargetActive(target)) textDprsNeeded.add(target.dpr);
    }
  });
  textDprsNeeded.forEach((dpr) => textSims.get(dpr)?.core.draw());

  textSims.forEach((sim, dpr) => {
    if(!textDprsNeeded.has(dpr) || sim.encoding || !sim.core.inited) return;

    let anyBluffPlaying = false;
    for(const state of ports) {
      if(state.bluffPlaying && state.textDpr === dpr) {
        anyBluffPlaying = true;
        break;
      }
    }
    if(!anyBluffPlaying) return;

    const now = Date.now();
    if((now - sim.lastEncodeTime) >= ENCODE_INTERVAL) {
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
    const mediaSim = mediaSims.get(state.mediaDpr);
    if(mediaSim) {
      state.mediaTargets.forEach((target) => {
        if(!isMediaTargetActive(target)) return;
        drawMediaTarget(mediaSim, target, state.mediaDpr);
      });
    }

    state.overlayTargets.forEach((target) => {
      if(!isOverlayTargetActive(target)) return;
      drawOverlayTarget(textSims.get(target.dpr), target);
    });
  });

  // setTimeout instead of requestAnimationFrame — nothing is presented from the
  // simulation canvases, the cadence only drives the simulation steps
  timerId = needsFrame() ? ctx.setTimeout(frame, FRAME_INTERVAL) : undefined;
};

const ensureLoop = () => {
  if(timerId !== undefined || !needsFrame()) return;

  const now = Date.now();
  textSims.forEach((sim) => sim.core.lastDrawTime = now);
  mediaSims.forEach((sim) => sim.core.lastDrawTime = now);
  frame();
};

/**
 * Frees the GL resources of the simulations no connected tab uses anymore
 * (the last tab left, or a tab re-inited with another device pixel ratio)
 */
const pruneSims = () => {
  const textDprs = new Set<number>();
  const mediaDprs = new Set<number>();
  ports.forEach((state) => {
    if(state.textDpr !== undefined) textDprs.add(state.textDpr);
    if(state.mediaDpr !== undefined) mediaDprs.add(state.mediaDpr);
    state.overlayTargets.forEach((target) => textDprs.add(target.dpr));
  });

  textSims.forEach(({core}, dpr) => {
    if(!textDprs.has(dpr)) {
      core.destroy();
      textSims.delete(dpr);
    }
  });
  mediaSims.forEach(({core}, dpr) => {
    if(!mediaDprs.has(dpr)) {
      core.destroy();
      mediaSims.delete(dpr);
    }
  });
};

const removePort = (state: PortState) => {
  if(!ports.delete(state)) return;
  pruneSims();
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
    case 'text-init': {
      state.textDpr = message.dpr;
      let sim = textSims.get(message.dpr);
      if(!sim) textSims.set(message.dpr, sim = {...createSim(message), lastEncodeTime: 0});
      pruneSims();
      callbackify(sim.core.init(), () => state.port.postMessage({type: 'text-inited'}));
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
      pruneSims();
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

    case 'overlay-attach': {
      const scratch = new OffscreenCanvas(message.canvas.width, message.canvas.height);
      state.overlayTargets.set(message.id, {
        canvas: message.canvas,
        context: message.canvas.getContext('2d'),
        scratch,
        scratchContext: scratch.getContext('2d'),
        dpr: message.dpr,
        rects: [],
        backgroundColor: 'transparent',
        particleColor: 'white'
      });
      break;
    }

    case 'overlay-update': {
      const target = state.overlayTargets.get(message.id);
      if(!target) break;
      if(target.canvas.width !== message.width || target.canvas.height !== message.height) {
        target.canvas.width = target.scratch.width = message.width;
        target.canvas.height = target.scratch.height = message.height;
      }
      target.rects = message.rects;
      target.backgroundColor = message.backgroundColor;
      target.particleColor = message.particleColor;
      target.needsRedraw = true;
      ensureLoop();
      break;
    }

    case 'overlay-unwrap': {
      const target = state.overlayTargets.get(message.id);
      if(!target) break;
      target.unwrap = {
        coords: message.coords,
        maxDist: message.maxDist,
        from: 0,
        to: 1,
        duration: message.duration,
        startTime: Date.now(),
        easing: unwrapEasing
      };
      ensureLoop();
      break;
    }

    case 'overlay-wrap': {
      const target = state.overlayTargets.get(message.id);
      if(!target?.unwrap) break;
      target.unwrap = {
        ...target.unwrap,
        from: getUnwrapProgress(target.unwrap),
        to: 0,
        duration: message.duration,
        startTime: Date.now(),
        easing: defaultEasing
      };
      ensureLoop();
      break;
    }

    case 'overlay-reset': {
      const target = state.overlayTargets.get(message.id);
      if(!target) break;
      target.unwrap = undefined;
      target.needsRedraw = true;
      ensureLoop();
      break;
    }

    case 'overlay-clear': {
      const target = state.overlayTargets.get(message.id);
      if(!target) break;
      target.rects = [];
      target.context.clearRect(0, 0, target.canvas.width, target.canvas.height);
      break;
    }

    case 'overlay-play': {
      const target = state.overlayTargets.get(message.id);
      if(!target) break;
      target.playing = true;
      ensureLoop();
      break;
    }

    case 'overlay-pause': {
      const target = state.overlayTargets.get(message.id);
      if(target) target.playing = false;
      break;
    }

    case 'overlay-detach': {
      state.overlayTargets.delete(message.id);
      pruneSims();
      break;
    }

    case 'bye': {
      removePort(state);
      break;
    }
  }
};

const setupPort = (port: Port & {onmessage?: any, addEventListener?: any}) => {
  const state: PortState = {port, mediaTargets: new Map(), overlayTargets: new Map()};
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
