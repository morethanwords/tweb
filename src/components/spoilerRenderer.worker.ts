import callbackify from '@helpers/callbackify';
import applyColorOnContext from '@helpers/canvas/applyColorOnContext';
import {defaultEasing, simpleEasing, unwrapEasing} from '@helpers/easings';
import DotRendererCore, {drawClippingCircle, DotRendererConfig} from '@components/dotRendererCore';
import {drawImageFromSource} from '@components/messageSpoilerOverlay/drawImageFromSource';
import {lowerBound} from '@components/dynamicVirtualList/lowerBound';
import clamp from '@helpers/number/clamp';
import smoothstep01 from '@helpers/number/smoothstep01';
import {lerp} from '@helpers/lerp';
import {easeOutCubicApply} from '@helpers/easing/easeOutCubic';

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

export type MediaRect = {x: number, y: number, width: number, height: number}; // device pixels
// * where the page draws a media's picture (`rect`, as its object-fit lays it out) and what of it shows (`clip`, the
// * element's box): a fitted photo stands in a box of its own over a blurred fill, a slideshow's picture is contained
export type MediaPlacement = {rect: MediaRect, clip: MediaRect};

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
  ({type: 'media-init'} & SpoilerRendererSimInit) |
  {type: 'media-attach', id: number, canvas: OffscreenCanvas, x: number, y: number, color?: string, dust?: boolean} |
  {type: 'media-thumbnail', id: number, bitmap: ImageBitmap} |
  // * the media itself, and where the page shows it in the canvas's pixels
  {type: 'media-image', id: number, bitmap: ImageBitmap, placement?: MediaPlacement} |
  {type: 'media-play' | 'media-pause' | 'media-detach', id: number} |
  {type: 'media-reveal', id: number, coords: {x: number, y: number}, maxDist: number, duration: number} |
  {type: 'overlay-attach', id: number, canvas: OffscreenCanvas, dpr: number, dust?: boolean} |
  SpoilerOverlayUpdate |
  {type: 'overlay-unwrap', id: number, coords: [number, number], maxDist: number, duration: number} |
  {type: 'overlay-wrap', id: number, duration: number} |
  {type: 'overlay-glyphs', id: number, bitmap: ImageBitmap} |
  {type: 'overlay-reset' | 'overlay-clear' | 'overlay-play' | 'overlay-pause' | 'overlay-detach', id: number} |
  {type: 'bye'};

export type SpoilerRendererOutMessage =
  {type: 'text-inited'} |
  {type: 'media-inited'} |
  {type: 'media-revealing', id: number} | // * the reveal's frames with the cover in them are on screen
  {type: 'media-revealed', id: number} | // * and its last one: nothing of the spoiler is left
  {type: 'connection-error'} |
  {type: 'dust-error', message: string}; // synthesized by spoilerRendererConnection, never sent from here

const ctx = self as any;

const FRAME_INTERVAL = 1000 / 60;

// * Spoiler 2.0. As the wave from the tap goes over a point, the point's phase runs from 0 to the end of its
// * transition: the dust there gives way to the particles flying onto the letters or the picture (*_DUST_OUT), the
// * content comes in under them (*_IN_START to *_IN_END) and they fade into it. A phase is
// * `progress * *_SHIFT - distance / width`, distances as fractions of the farthest one: the farthest point ends its
// * transition as the wave does.
const DUST_JITTER = 0.35; // * how ragged the edge of the wave is
const PARTICLE_IN = 0.1; // * the part of its phase a particle takes to show where the dust was

// * The text is read in dust first: the particles settle onto its letters slowly enough to be read before they stand
// * (they never stop until they go), and the text comes in out of them close behind - one wave with the letters of
// * dust in it, not a second wave after the first.
const TEXT_FRONT_WIDTH = 0.5;
const TEXT_DUST_OUT = 0.3;
const TEXT_PARTICLE_ARRIVE = 0.7;
const TEXT_IN_START = 0.5;
const TEXT_IN_END = 0.8;
const TEXT_PARTICLE_OUT = 0.6;
const TEXT_SHIFT = 1 / TEXT_FRONT_WIDTH + TEXT_IN_END + DUST_JITTER / 2;

// * A picture comes into focus behind a narrow wave with a soft, wandering edge: the wave sweeps the dust on and lays
// * it down as grains of the picture's own light, the blurred cover gives way under them to the picture blurred a
// * little (the photo itself, when the page has it), that one to the picture, and the grains melt into it.
const MEDIA_FRONT_WIDTH = 0.32;
const MEDIA_EDGE_WOBBLE = 0.45; // * how far the edge of the wave wanders, by a smooth noise
const MEDIA_EDGE_CELL = 14; // * the size of that noise, in grains
const MEDIA_EDGE_JITTER = 0.1; // * and how ragged it is at the scale of a grain
const MEDIA_DUST_OUT = 0.2;
const MEDIA_PARTICLE_ARRIVE = 0.35;
const MEDIA_COVER_START = 0.1;
const MEDIA_COVER_END = 0.36; // * with no photo to focus, the cover gives way to the picture by MEDIA_FOCUS_END itself
const MEDIA_FOCUS_START = 0.26;
const MEDIA_FOCUS_END = 0.56;
const MEDIA_FOCUS_BLUR = 5; // * in CSS pixels
const MEDIA_PARTICLE_OUT = 0.4;
const MEDIA_PARTICLE_END = 0.7;
const MEDIA_EDGE_SPREAD = (MEDIA_EDGE_WOBBLE + MEDIA_EDGE_JITTER) / 2;
// * the edge wanders only as far as the wave has gone, up to this distance (a fraction of the farthest one): the wave
// * starts at the tap at once, and nothing ahead of it has started before it (MEDIA_EDGE_SPREAD / MEDIA_EDGE_FROM is
// * less than 1 / MEDIA_FRONT_WIDTH)
const MEDIA_EDGE_FROM = 0.1;
const MEDIA_SHIFT = 1 / MEDIA_FRONT_WIDTH + MEDIA_PARTICLE_END + MEDIA_EDGE_SPREAD;
const MEDIA_DUST_PUSH = 0.3; // * the dust ahead of the wave is pushed away from the tap, as the classic spoiler's is
const MEDIA_FLIGHT = 30; // * how far behind its place a grain is thrown from, in CSS pixels
const MEDIA_SCATTER = 8;

const MEDIA_GRAIN = 2;
const MEDIA_SAMPLE_STEP = 3;
const MEDIA_ASSEMBLY_MIN = 2500;
const MEDIA_ASSEMBLY_MAX = 32000;
const MEDIA_ASSEMBLY_DENSITY = 14;
// * the dust is light, in a pastel of the picture's colours, on a light picture and on a dark one; a grain is the
// * picture's own colour made a little lighter, to sparkle where the picture is light and stay faint where it is dark
const MEDIA_DUST_WHITE = 0.6;
const MEDIA_DUST_FILTER = 'saturate(1.4) brightness(2.2)';
const MEDIA_DOT_LIGHT = 1.2;
const MEDIA_DOT_LIFT = 28;
const MEDIA_COLOR_BUCKETS = 4096;
const MEDIA_KEY_LEVELS = 1024;
const MEDIA_KEY_MIN = 0;
const MEDIA_KEY_STEP = (1 / MEDIA_FRONT_WIDTH + MEDIA_EDGE_SPREAD) / MEDIA_KEY_LEVELS;

const ASSEMBLY_MAX = 20000;
const ASSEMBLY_SHARE = 1;
const GLYPH_INSIDE = 170;
const ASSEMBLY_ALPHA = 0.9;
const ASSEMBLY_STRIDE = 6;

// * a particle in its phase: it shows where the dust was, flies to its place by `arrive`, and from `out` to `end`
// * fades into the content coming in under it
const getParticleAlpha = (local: number, out: number, end: number) =>
  local < PARTICLE_IN ? 0.3 + 0.7 * local / PARTICLE_IN : local > out ? clamp((end - local) / (end - out), 0, 1) : 1;

// * sets the alpha particles are drawn with, as a canvas keeps it, only when it changes: false for one that does not show
const createParticleAlpha = (context: OffscreenCanvasRenderingContext2D) => {
  let current = -1;
  return (alpha: number) => {
    alpha = Math.round(alpha * 255) / 255;
    if(alpha <= 0) return false;
    if(alpha !== current) context.globalAlpha = current = alpha;
    return true;
  };
};

// * a gathering particle `local` into its phase: flown toward its place by `arrive`, a square of its size
const drawGatheringParticle = (
  context: OffscreenCanvasRenderingContext2D,
  data: Float32Array,
  offset: number,
  local: number,
  arrive: number
) => {
  const move = easeOutCubicApply(clamp(local / arrive, 0, 1), 1);
  const size = data[offset + 5];
  context.fillRect(
    lerp(data[offset], data[offset + 2], move) - size / 2,
    lerp(data[offset + 1], data[offset + 3], move) - size / 2,
    size,
    size
  );
};

// * what the wave has left of a layer, as a mask (of a media's, at the resolution of its grains: a blurred layer is cut
// * by it there, on the mask itself, which loses nothing of a blur)
type DustMask = {
  image: ImageData,
  mask: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D
};

const createDustMask = (width: number, height: number): DustMask => {
  const mask = new OffscreenCanvas(width, height);
  const context = mask.getContext('2d');
  return {image: context.createImageData(width, height), mask, context};
};

// * a random value in [0, 1) for each point: where the edge of the wave is ragged
const createNoise = (length: number) => {
  const noise = new Float32Array(length);
  for(let index = 0; index < length; ++index) {
    noise[index] = Math.random();
  }
  return noise;
};

type OverlayDust = {
  width: number,
  height: number,
  noise: Float32Array,
  fill: DustMask,
  dust: DustMask,
  baseKey?: string,
  base?: Float32Array
};

// * a media spoiler's reveal: what the wave has left of the dust, of the cover and of the picture blurred a little
type MediaDust = {
  width: number,
  height: number,
  grainsX: number,
  grainsY: number,
  noise: Float32Array,
  edge: Float32Array,
  dust: DustMask,
  cover: DustMask,
  focus: DustMask,
  baseKey?: string,
  base?: Float32Array,
  lastKey?: number // * the phase the wave reaches its last grain of the masks at
};

type MediaAssembly = {
  data: Float32Array,
  buckets: {color: string, start: number, end: number}[],
  lastKey: number // * the phase the last grain starts its flight at
};

type MediaTarget = {
  canvas: OffscreenCanvas,
  context: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  color?: string,
  dust?: boolean,
  mediaDust?: MediaDust,
  image?: ImageBitmap,
  imagePlacement?: MediaPlacement,
  mediaAssembly?: MediaAssembly,
  thumbnail?: ImageBitmap,
  tintedThumbnail?: OffscreenCanvas,
  softImage?: OffscreenCanvas,
  playing?: boolean,
  revealed?: boolean,
  reveal?: {
    coords: {x: number, y: number},
    maxDist: number,
    duration: number,
    startTime: number,
    frames?: number, // * drawn so far: the page is told the cover is here after the second, the first surely shown
    over?: boolean // * the wave has gone over everything
  }
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
  dust?: boolean,
  overlayDust?: OverlayDust[], // * one for each run of spoiler lines (getRectGroups)
  glyphs?: {width: number, height: number, alpha: Uint8Array},
  assembly?: {data: Float32Array, count: number},
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
  mediaDpr?: number,
  mediaTargets: Map<number, MediaTarget>,
  overlayTargets: Map<number, OverlayTarget>
};

const ports = new Set<PortState>();

const reportDustError = (err: any) => {
  const message = String(err?.stack || err);
  ports.forEach((state) => state.port.postMessage({type: 'dust-error', message}));
};

// Tabs may live on displays with different pixel ratios — each ratio gets its own
// simulation, in practice there is one
type Sim = {core: DotRendererCore, canvas: OffscreenCanvas};
const textSims = new Map<number, Sim>();
const mediaSims = new Map<number, Sim>();

let timerId: number;

const createSim = (init: SpoilerRendererSimInit): Sim => {
  const canvas = new OffscreenCanvas(init.width * init.dpr, init.height * init.dpr);
  const core = new DotRendererCore(canvas, {vertex: init.vertexURL, fragment: init.fragmentURL});
  core.resize(init.width, init.height, init.dpr, init.config);
  core.init();
  return {core, canvas};
};

type RectGroup = {left: number, top: number, width: number, height: number, rects: SpoilerOverlayRect[]};

const RECT_GROUP_GAP = 4; // * CSS pixels between two lines that still make one run

// * a message's spoiler boxes in runs of lines that meet, each with its bounds in device pixels: a reveal's masks cover
// * a run, never the gap between two spoilers far apart in a tall message
const getRectGroups = (rects: SpoilerOverlayRect[], dpr: number, width: number, height: number) => {
  const groups: (Omit<RectGroup, 'width' | 'height'> & {right: number, bottom: number})[] = [];
  for(const rect of rects.slice().sort((a, b) => a.top - b.top)) {
    const left = Math.max(0, Math.floor(rect.left * dpr));
    const top = Math.max(0, Math.floor(rect.top * dpr));
    const right = Math.min(width, Math.ceil((rect.left + rect.width) * dpr));
    const bottom = Math.min(height, Math.ceil((rect.top + rect.height) * dpr));
    if(right <= left || bottom <= top) continue;

    const group = groups[groups.length - 1];
    if(group && top <= group.bottom + RECT_GROUP_GAP * dpr) {
      group.left = Math.min(group.left, left);
      group.right = Math.max(group.right, right);
      group.bottom = Math.max(group.bottom, bottom);
      group.rects.push(rect);
    } else {
      groups.push({left, top, right, bottom, rects: [rect]});
    }
  }

  return groups.map(({left, top, right, bottom, rects}): RectGroup => ({left, top, width: right - left, height: bottom - top, rects}));
};

const ensureOverlayDust = (target: OverlayTarget, index: number, group: RectGroup): OverlayDust => {
  const {width, height} = group;
  const list = target.overlayDust ??= [];
  const dust = list[index];
  if(dust && dust.width === width && dust.height === height) return dust;

  return list[index] = {
    width,
    height,
    noise: createNoise(width * height),
    fill: createDustMask(width, height),
    dust: createDustMask(width, height)
  };
};

const getOverlayRevealBase = (
  dust: OverlayDust,
  rects: SpoilerOverlayRect[],
  bounds: {left: number, top: number, width: number, height: number},
  dpr: number,
  centerX: number,
  centerY: number,
  maxDist: number
) => {
  let key = centerX + ',' + centerY + ',' + maxDist + ',' + dpr + ',' + bounds.left + ',' + bounds.top;
  for(const rect of rects) {
    key += ';' + rect.left + ',' + rect.top + ',' + rect.width + ',' + rect.height;
  }
  if(dust.base && dust.baseKey === key) return dust.base;

  const {noise} = dust;
  const base = dust.base ??= new Float32Array(bounds.width * bounds.height);
  base.fill(-Infinity);
  const radius = Math.max(maxDist, 1);

  for(const rect of rects) {
    const left = Math.max(bounds.left, Math.floor(rect.left * dpr));
    const right = Math.min(bounds.left + bounds.width, Math.ceil((rect.left + rect.width) * dpr));
    const top = Math.max(bounds.top, Math.floor(rect.top * dpr));
    const bottom = Math.min(bounds.top + bounds.height, Math.ceil((rect.top + rect.height) * dpr));
    if(right <= left || bottom <= top) continue;

    for(let y = top; y < bottom; ++y) {
      const dy = y - centerY;
      const row = (y - bounds.top) * bounds.width - bounds.left;
      for(let x = left; x < right; ++x) {
        const index = row + x;
        const dx = x - centerX;
        const distance = Math.sqrt(dx * dx + dy * dy) / radius;
        base[index] = (noise[index] - 0.5) * DUST_JITTER - distance / TEXT_FRONT_WIDTH;
      }
    }
  }

  dust.baseKey = key;
  return base;
};

const TEXT_IN_ALPHA = 255 / (TEXT_IN_END - TEXT_IN_START);
const TEXT_DUST_ALPHA = 255 / TEXT_DUST_OUT;

const applyDustReveal = (
  target: OverlayTarget,
  index: number,
  bounds: RectGroup,
  centerX: number,
  centerY: number,
  maxDist: number,
  progress: number
) => {
  const {context, scratchContext, dpr} = target;
  const dust = ensureOverlayDust(target, index, bounds);
  const fillPixels = dust.fill.image.data;
  const dustPixels = dust.dust.image.data;
  const base = getOverlayRevealBase(dust, bounds.rects, bounds, dpr, centerX, centerY, maxDist);
  const shift = progress * TEXT_SHIFT;

  // * the alphas are clamped by the arrays: the fill over the text goes from TEXT_IN_START to TEXT_IN_END, the dust by TEXT_DUST_OUT
  for(let index = 0, length = base.length; index < length; ++index) {
    const local = shift + base[index];
    fillPixels[index * 4 + 3] = (local - TEXT_IN_START) * TEXT_IN_ALPHA;
    dustPixels[index * 4 + 3] = local * TEXT_DUST_ALPHA;
  }

  dust.fill.context.putImageData(dust.fill.image, 0, 0);
  dust.dust.context.putImageData(dust.dust.image, 0, 0);

  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(dust.fill.mask, bounds.left, bounds.top);
  context.restore();

  scratchContext.save();
  scratchContext.globalCompositeOperation = 'destination-out';
  scratchContext.drawImage(dust.dust.mask, bounds.left, bounds.top);
  scratchContext.restore();
};

const scaleRect = (rect: MediaRect, scale: number): MediaRect =>
  ({x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale});

const drawPlaced = (context: OffscreenCanvasRenderingContext2D, image: CanvasImageSource, {rect, clip}: MediaPlacement) => {
  context.save();
  context.beginPath();
  context.rect(clip.x, clip.y, clip.width, clip.height);
  context.clip();
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  context.restore();
};

// * where the page draws the media's picture, in a canvas `scale` times the target's; with nothing said, over all of
// * it as `object-fit: cover` would
const getImagePlacement = (target: MediaTarget, scale: number): MediaPlacement => {
  if(target.imagePlacement) {
    return {rect: scaleRect(target.imagePlacement.rect, scale), clip: scaleRect(target.imagePlacement.clip, scale)};
  }

  const {image, canvas} = target;
  const clip = {x: 0, y: 0, width: canvas.width * scale, height: canvas.height * scale};
  const cover = Math.max(clip.width / image.width, clip.height / image.height);
  const width = image.width * cover;
  const height = image.height * cover;
  return {rect: {x: (clip.width - width) / 2, y: (clip.height - height) / 2, width, height}, clip};
};

// * where the edge of the wave wanders: a smooth noise over the grains in [-0.5, 0.5], two octaves of value noise
const buildEdgeNoise = (grainsX: number, grainsY: number) => {
  const edge = new Float32Array(grainsX * grainsY);
  for(const [cell, weight] of [[MEDIA_EDGE_CELL, 0.75], [MEDIA_EDGE_CELL / 3, 0.25]]) {
    const cellsX = Math.ceil(grainsX / cell) + 2;
    const lattice = new Float32Array(cellsX * (Math.ceil(grainsY / cell) + 2));
    for(let index = 0; index < lattice.length; ++index) {
      lattice[index] = Math.random() - 0.5;
    }

    let index = 0;
    for(let grainY = 0; grainY < grainsY; ++grainY) {
      const cellY = Math.floor(grainY / cell);
      const ty = smoothstep01(grainY / cell - cellY);
      const row = cellY * cellsX;
      for(let grainX = 0; grainX < grainsX; ++grainX, ++index) {
        const cellX = Math.floor(grainX / cell);
        const tx = smoothstep01(grainX / cell - cellX);
        const top = lerp(lattice[row + cellX], lattice[row + cellX + 1], tx);
        const bottom = lerp(lattice[row + cellsX + cellX], lattice[row + cellsX + cellX + 1], tx);
        edge[index] += lerp(top, bottom, ty) * weight;
      }
    }
  }

  return edge;
};

const ensureMediaDust = (target: MediaTarget): MediaDust => {
  const {width, height} = target.canvas;
  const dust = target.mediaDust;
  if(dust && dust.width === width && dust.height === height) return dust;

  const grainsX = Math.ceil(width / MEDIA_GRAIN);
  const grainsY = Math.ceil(height / MEDIA_GRAIN);
  return target.mediaDust = {
    width,
    height,
    grainsX,
    grainsY,
    noise: createNoise(grainsX * grainsY),
    edge: buildEdgeNoise(grainsX, grainsY),
    dust: createDustMask(grainsX, grainsY),
    cover: createDustMask(grainsX, grainsY),
    focus: createDustMask(grainsX, grainsY)
  };
};

// * the photo the page shows under the spoiler, blurred a little: the picture between the cover and itself. At half
// * the size, which the blur does not miss, and over the photo itself, which the blur leaves at the edges
const ensureSoftImage = (target: MediaTarget, dpr: number) => {
  const {image} = target;
  if(!image) return;

  const width = Math.ceil(target.canvas.width / 2);
  const height = Math.ceil(target.canvas.height / 2);
  const soft = target.softImage;
  if(soft && soft.width === width && soft.height === height) return soft;

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  const placement = getImagePlacement(target, width / target.canvas.width);
  drawPlaced(context, image, placement);
  context.filter = 'blur(' + (MEDIA_FOCUS_BLUR * dpr / 2) + 'px)';
  drawPlaced(context, image, placement);
  return target.softImage = canvas;
};

const ensureTintedThumbnail = (target: MediaTarget, width: number, height: number) => {
  const tinted = target.tintedThumbnail;
  if(tinted && tinted.width === width && tinted.height === height) return tinted;

  // * stretched as the cover is, so that a grain of dust takes the colour of the cover under it, and made lighter with
  // * white here once rather than in every frame
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.filter = MEDIA_DUST_FILTER;
  context.drawImage(target.thumbnail, 0, 0, width, height);
  context.filter = 'none';
  context.globalAlpha = MEDIA_DUST_WHITE;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  return target.tintedThumbnail = canvas;
};

const sortByBuckets = (order: Uint32Array, buckets: Uint16Array, bucketsCount: number) => {
  const starts = new Uint32Array(bucketsCount + 1);
  for(let position = 0; position < order.length; ++position) {
    ++starts[buckets[order[position]] + 1];
  }
  for(let bucket = 1; bucket <= bucketsCount; ++bucket) {
    starts[bucket] += starts[bucket - 1];
  }

  const sorted = new Uint32Array(order.length);
  for(let position = 0; position < order.length; ++position) {
    const particle = order[position];
    sorted[starts[buckets[particle]]++] = particle;
  }
  return sorted;
};

const getKeyLevel = (key: number) => Math.min(MEDIA_KEY_LEVELS - 1, Math.max(0, Math.floor((key - MEDIA_KEY_MIN) / MEDIA_KEY_STEP)));

const buildMediaAssembly = (target: MediaTarget, dust: MediaDust, dpr: number) => {
  const source = target.image || target.thumbnail;
  const {reveal} = target;
  if(!source || !reveal) return;

  const {width, height} = target.canvas;
  const sampleWidth = Math.max(1, Math.ceil(width / MEDIA_SAMPLE_STEP));
  const sampleHeight = Math.max(1, Math.ceil(height / MEDIA_SAMPLE_STEP));
  const sampler = new OffscreenCanvas(sampleWidth, sampleHeight);
  const samplerContext = sampler.getContext('2d', {willReadFrequently: true});
  // * the picture where the page shows it, or the cover stretched over all of it, as the page has it
  const full = {x: 0, y: 0, width: sampleWidth, height: sampleHeight};
  const placement = source === target.image ? getImagePlacement(target, sampleWidth / width) : {rect: full, clip: full};
  drawPlaced(samplerContext, source, placement);
  const pixels = samplerContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

  const shown = Math.min(placement.rect.width, placement.clip.width) * Math.min(placement.rect.height, placement.clip.height);
  const area = Math.min(width * height, shown * MEDIA_SAMPLE_STEP * MEDIA_SAMPLE_STEP);
  const count = Math.max(MEDIA_ASSEMBLY_MIN, Math.min(MEDIA_ASSEMBLY_MAX, Math.round(area / MEDIA_ASSEMBLY_DENSITY)));
  const radius = Math.max(reveal.maxDist, 1);
  const flight = MEDIA_FLIGHT * dpr;
  const scatter = MEDIA_SCATTER * dpr;
  const {grainsX, edge} = dust;

  // * the light of the picture takes most of them: the sparkle settles on what shines in it, and none outside it
  const weights = new Float32Array(sampleWidth * sampleHeight);
  let total = 0;
  for(let index = 0; index < weights.length; ++index) {
    const luminance = (pixels[index * 4] * 0.299 + pixels[index * 4 + 1] * 0.587 + pixels[index * 4 + 2] * 0.114) / 255;
    total += (0.1 + luminance ** 1.5) * pixels[index * 4 + 3] / 255;
    weights[index] = total;
  }

  if(!total) {
    target.mediaAssembly = {data: new Float32Array(0), buckets: [], lastKey: -Infinity};
    return;
  }

  const pickSample = () => lowerBound(0, weights.length - 1, Math.random() * total, (index) => weights[index]);

  const values = new Float32Array(count * ASSEMBLY_STRIDE);
  const colorBuckets = new Uint16Array(count);
  const keyLevels = new Uint16Array(count);
  const order = new Uint32Array(count);

  for(let particle = 0; particle < count; ++particle) {
    const sample = pickSample();
    const targetX = Math.min(width - 1, ((sample % sampleWidth) + Math.random()) * MEDIA_SAMPLE_STEP);
    const targetY = Math.min(height - 1, (Math.floor(sample / sampleWidth) + Math.random()) * MEDIA_SAMPLE_STEP);
    const sampleIndex = sample * 4;
    const red = Math.min(255, pixels[sampleIndex] * MEDIA_DOT_LIGHT + MEDIA_DOT_LIFT);
    const green = Math.min(255, pixels[sampleIndex + 1] * MEDIA_DOT_LIGHT + MEDIA_DOT_LIFT);
    const blue = Math.min(255, pixels[sampleIndex + 2] * MEDIA_DOT_LIGHT + MEDIA_DOT_LIFT);
    // * on the edge of the wave where it lands, and thrown on by it: from behind its place, toward the tap
    const dx = targetX - reveal.coords.x;
    const dy = targetY - reveal.coords.y;
    const distance = Math.hypot(dx, dy) || 1;
    const grain = Math.floor(targetY / MEDIA_GRAIN) * grainsX + Math.floor(targetX / MEDIA_GRAIN);
    const wander = (edge[grain] * MEDIA_EDGE_WOBBLE + (Math.random() - 0.5) * MEDIA_EDGE_JITTER) * Math.min(1, distance / radius / MEDIA_EDGE_FROM);
    const key = distance / radius / MEDIA_FRONT_WIDTH - wander;
    const thrown = flight * (0.35 + Math.random() * 0.65);
    const offset = particle * ASSEMBLY_STRIDE;
    values[offset] = targetX - dx / distance * thrown + (Math.random() - 0.5) * 2 * scatter;
    values[offset + 1] = targetY - dy / distance * thrown + (Math.random() - 0.5) * 2 * scatter;
    values[offset + 2] = targetX;
    values[offset + 3] = targetY;
    values[offset + 4] = key;
    values[offset + 5] = (0.9 + Math.random() * 0.7) * dpr;
    colorBuckets[particle] = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
    keyLevels[particle] = getKeyLevel(key);
    order[particle] = particle;
  }

  const sorted = sortByBuckets(sortByBuckets(order, keyLevels, MEDIA_KEY_LEVELS), colorBuckets, MEDIA_COLOR_BUCKETS);

  const data = new Float32Array(count * ASSEMBLY_STRIDE);
  const buckets: MediaAssembly['buckets'] = [];
  let lastBucket = -1;
  for(let position = 0; position < count; ++position) {
    const particle = sorted[position];
    const offset = particle * ASSEMBLY_STRIDE;
    data.set(values.subarray(offset, offset + ASSEMBLY_STRIDE), position * ASSEMBLY_STRIDE);
    const bucket = colorBuckets[particle];
    if(bucket === lastBucket) {
      buckets[buckets.length - 1].end = position + 1;
    } else {
      buckets.push({color: bucketColor(bucket), start: position, end: position + 1});
      lastBucket = bucket;
    }
  }

  let lastKey = -Infinity;
  for(let particle = 0; particle < count; ++particle) {
    lastKey = Math.max(lastKey, values[particle * ASSEMBLY_STRIDE + 4]);
  }

  target.mediaAssembly = {data, buckets, lastKey};
};

const bucketColor = (bucket: number) => {
  const red = ((bucket >> 8) & 15) * 16 + 8;
  const green = ((bucket >> 4) & 15) * 16 + 8;
  const blue = (bucket & 15) * 16 + 8;
  return 'rgb(' + red + ',' + green + ',' + blue + ')';
};

const drawMediaAssembly = (target: MediaTarget, dust: MediaDust, progress: number, dpr: number) => {
  if(!target.mediaAssembly) buildMediaAssembly(target, dust, dpr);
  const assembly = target.mediaAssembly;
  if(!assembly) return;

  const {context} = target;
  const {data, buckets} = assembly;
  const front = progress * MEDIA_SHIFT;
  const lastKey = front + MEDIA_KEY_STEP;
  const setAlpha = createParticleAlpha(context);
  context.save();

  // * a colour is set only for a bucket that has a grain in flight: most of the thousands have none in a frame
  for(const bucket of buckets) {
    let styled = false;
    for(let particle = bucket.start; particle < bucket.end; ++particle) {
      const offset = particle * ASSEMBLY_STRIDE;
      const key = data[offset + 4];
      if(key >= lastKey) break;
      const local = front - key;
      if(local <= 0 || local >= MEDIA_PARTICLE_END) continue;
      if(!setAlpha(getParticleAlpha(local, MEDIA_PARTICLE_OUT, MEDIA_PARTICLE_END))) continue;
      if(!styled) {
        context.fillStyle = bucket.color;
        styled = true;
      }

      drawGatheringParticle(context, data, offset, local, MEDIA_PARTICLE_ARRIVE);
    }
  }

  context.restore();
};

const getMediaRevealBase = (dust: MediaDust, reveal: MediaTarget['reveal']) => {
  const key = reveal.coords.x + ',' + reveal.coords.y + ',' + reveal.maxDist;
  if(dust.base && dust.baseKey === key) return dust.base;

  const {grainsX, grainsY, noise, edge} = dust;
  const base = dust.base ??= new Float32Array(grainsX * grainsY);
  const radius = Math.max(reveal.maxDist, 1);
  const centerX = reveal.coords.x;
  const centerY = reveal.coords.y;

  let index = 0, lowest = 0;
  for(let grainY = 0; grainY < grainsY; ++grainY) {
    const dy = (grainY + 0.5) * MEDIA_GRAIN - centerY;
    for(let grainX = 0; grainX < grainsX; ++grainX, ++index) {
      const dx = (grainX + 0.5) * MEDIA_GRAIN - centerX;
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      const wander = (edge[index] * MEDIA_EDGE_WOBBLE + (noise[index] - 0.5) * MEDIA_EDGE_JITTER) * Math.min(1, distance / MEDIA_EDGE_FROM);
      lowest = Math.min(lowest, base[index] = wander - distance / MEDIA_FRONT_WIDTH);
    }
  }

  dust.baseKey = key;
  dust.lastKey = -lowest;
  return base;
};

const MEDIA_DUST_ALPHA = 255 / MEDIA_DUST_OUT;
const MEDIA_FOCUS_ALPHA = 255 / (MEDIA_FOCUS_END - MEDIA_FOCUS_START);

// * cuts the dust drawn on the target by the wave, and leaves in the masks what the wave has left of the cover and of
// * the picture blurred a little (`focused`: there is one)
const applyMediaReveal = (target: MediaTarget, dust: MediaDust, progress: number, focused: boolean) => {
  const {reveal, context} = target;
  const {grainsX, grainsY, cover, focus} = dust;
  const dustPixels = dust.dust.image.data;
  const coverPixels = cover.image.data;
  const focusPixels = focus.image.data;
  const base = getMediaRevealBase(dust, reveal);
  const shift = progress * MEDIA_SHIFT;
  const coverEnd = focused ? MEDIA_COVER_END : MEDIA_FOCUS_END;
  const coverAlpha = 255 / (coverEnd - MEDIA_COVER_START);

  // * the alphas are clamped by the arrays: the dust goes by MEDIA_DUST_OUT, the cover from MEDIA_COVER_START, the
  // * picture blurred a little from MEDIA_FOCUS_START to MEDIA_FOCUS_END
  for(let index = 0, length = base.length; index < length; ++index) {
    const local = shift + base[index];
    dustPixels[index * 4 + 3] = local * MEDIA_DUST_ALPHA;
    coverPixels[index * 4 + 3] = (coverEnd - local) * coverAlpha;
    if(focused) focusPixels[index * 4 + 3] = (MEDIA_FOCUS_END - local) * MEDIA_FOCUS_ALPHA;
  }

  dust.dust.context.putImageData(dust.dust.image, 0, 0);
  cover.context.putImageData(cover.image, 0, 0);
  if(focused) focus.context.putImageData(focus.image, 0, 0);

  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(dust.dust.mask, 0, 0, grainsX, grainsY, 0, 0, grainsX * MEDIA_GRAIN, grainsY * MEDIA_GRAIN);
  context.restore();
};

// * a blurred layer put under what is drawn: as much of it as the wave has left (`layer`, its mask just put)
const drawMediaLayer = (target: MediaTarget, dust: MediaDust, layer: DustMask, source: CanvasImageSource) => {
  const {context} = target;
  const {width, height} = target.canvas;
  const {grainsX, grainsY} = dust;
  layer.context.globalCompositeOperation = 'source-in';
  layer.context.drawImage(source, 0, 0, width / MEDIA_GRAIN, height / MEDIA_GRAIN);
  context.save();
  context.globalCompositeOperation = 'destination-over';
  context.drawImage(layer.mask, 0, 0, grainsX, grainsY, 0, 0, grainsX * MEDIA_GRAIN, grainsY * MEDIA_GRAIN);
  context.restore();
};

// * all on the target itself: the dust tinted by the picture, then the cover put under it, then the gathering grains
const drawMediaDust = (sim: Sim, target: MediaTarget, dpr: number) => {
  const {canvas, context, x, y, reveal, thumbnail} = target;
  const {width, height} = canvas;
  if(!width || !height) return;

  const progress = reveal ? simpleEasing(Math.min((Date.now() - reveal.startTime) / reveal.duration, 1)) : 0;

  context.clearRect(0, 0, width, height);

  if(progress >= 1 || reveal?.over) {
    target.revealed = true;
    target.mediaDust = undefined;
    target.mediaAssembly = undefined;
    target.tintedThumbnail = undefined;
    target.softImage = undefined;
    return;
  }

  // * the wave pushes the dust ahead of it away from the tap: the simulation is read from a window closing in on it
  const push = progress * progress * MEDIA_DUST_PUSH;
  drawImageFromSource(
    context,
    sim.canvas,
    x + (reveal ? reveal.coords.x * push : 0),
    y + (reveal ? reveal.coords.y * push : 0),
    width * (1 - push),
    height * (1 - push),
    0, 0, width, height
  );

  if(thumbnail) {
    context.save();
    context.globalCompositeOperation = 'source-in';
    context.drawImage(ensureTintedThumbnail(target, width, height), 0, 0);
    context.restore();
  } else if(target.color) {
    applyColorOnContext(context, target.color, 0, 0, width, height);
  }

  // * at rest the cover is the page's own, under this canvas
  if(!reveal) return;

  const dust = ensureMediaDust(target);
  const softImage = ensureSoftImage(target, dpr);
  applyMediaReveal(target, dust, progress, !!softImage);

  // * from the reveal on, the cover is drawn here, under the dust: the blurred picture the page shows under this canvas
  // * (`.media-spoiler-thumbnail`, stretched over the media as here), which it hides once this has drawn it
  // * ('media-revealing'). With no picture there is nothing to draw, and the page's is hidden all the same
  if(thumbnail) drawMediaLayer(target, dust, dust.cover, thumbnail);
  if(softImage) drawMediaLayer(target, dust, dust.focus, softImage);

  drawMediaAssembly(target, dust, progress, dpr);

  // * the wave has gone over its farthest point (nearer than the reveal's own end: the distance it is given has a margin
  // * and the edge wanders), and the rest of the easing would draw nothing: the next frame ends it
  const lastKey = Math.max(dust.lastKey, target.mediaAssembly?.lastKey ?? -Infinity);
  if(progress * MEDIA_SHIFT - lastKey >= MEDIA_PARTICLE_END) {
    reveal.over = true;
  }
};

const drawMediaTarget = (sim: Sim, target: MediaTarget, dpr: number) => {
  if(target.dust) {
    drawMediaDust(sim, target, dpr);
    return;
  }

  const {canvas, context, x, y, reveal} = target;
  const {width, height} = canvas;

  context.clearRect(0, 0, width, height);

  if(!reveal) {
    drawImageFromSource(context, sim.canvas, x, y, width, height, 0, 0, width, height);
  } else {
    const progress = simpleEasing(Math.min((Date.now() - reveal.startTime) / reveal.duration, 1));

    // Zoom (push) the particles
    const scaledProgress = progress ** 2 * 0.5;
    drawImageFromSource(context, sim.canvas,
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

const buildAssembly = (target: OverlayTarget) => {
  const {glyphs, rects, dpr, unwrap} = target;
  if(!unwrap?.coords) return;

  const {width, height} = target.canvas;
  const glyphAlpha = glyphs && glyphs.width === width && glyphs.height === height ? glyphs.alpha : undefined;
  const candidates: number[] = [];

  for(const rect of rects) {
    const left = Math.max(0, Math.floor(rect.left * dpr));
    const right = Math.min(width, Math.ceil((rect.left + rect.width) * dpr));
    const top = Math.max(0, Math.floor(rect.top * dpr));
    const bottom = Math.min(height, Math.ceil((rect.top + rect.height) * dpr));
    for(let y = top; y < bottom; ++y) {
      for(let x = left; x < right; ++x) {
        const index = y * width + x;
        if(glyphAlpha ? glyphAlpha[index] > GLYPH_INSIDE : Math.random() < 0.08) {
          candidates.push(index);
        }
      }
    }
  }

  if(!candidates.length) {
    target.assembly = undefined;
    return;
  }

  const count = Math.min(ASSEMBLY_MAX, Math.max(1, Math.round(candidates.length * ASSEMBLY_SHARE)));
  const data = new Float32Array(count * ASSEMBLY_STRIDE);
  const centerX = unwrap.coords[0] * dpr;
  const centerY = unwrap.coords[1] * dpr;
  const radius = Math.max(unwrap.maxDist * dpr, 1);
  const spreadX = 28 * dpr;
  const spreadY = 12 * dpr;

  for(let particle = 0; particle < count; ++particle) {
    const index = candidates[Math.floor(Math.random() * candidates.length)];
    const targetX = index % width;
    const targetY = Math.floor(index / width);
    const offset = particle * ASSEMBLY_STRIDE;
    data[offset] = targetX + (Math.random() - 0.5) * 2 * spreadX;
    data[offset + 1] = targetY + (Math.random() - 0.5) * 2 * spreadY;
    data[offset + 2] = targetX + 0.5;
    data[offset + 3] = targetY + 0.5;
    data[offset + 4] = (Math.hypot(targetX - centerX, targetY - centerY) / radius + (Math.random() - 0.5) * 0.12) / TEXT_FRONT_WIDTH;
    data[offset + 5] = (0.55 + Math.random() * 0.35) * dpr;
  }

  target.assembly = {data, count};
};


const drawAssembly = (target: OverlayTarget, progress: number) => {
  if(!target.assembly) buildAssembly(target);
  const {assembly, context, particleColor} = target;
  if(!assembly) return;

  const {data, count} = assembly;
  const front = progress * TEXT_SHIFT;
  const setAlpha = createParticleAlpha(context);
  context.save();
  context.fillStyle = particleColor;

  for(let particle = 0; particle < count; ++particle) {
    const offset = particle * ASSEMBLY_STRIDE;
    const local = front - data[offset + 4];
    if(local <= 0 || local >= TEXT_IN_END) continue;
    if(!setAlpha(getParticleAlpha(local, TEXT_PARTICLE_OUT, TEXT_IN_END) * ASSEMBLY_ALPHA)) continue;
    drawGatheringParticle(context, data, offset, local, TEXT_PARTICLE_ARRIVE);
  }

  context.restore();
};

// * a spoiler rect: its background on the target, and its particles, tinted, on the scratch, read from the simulation
// * where the rect is, or (`zoom`) from a window closing in on `coords` as the classic reveal pushes them away. Gives
// * the rect in the canvas's pixels, or nothing with no simulation to read
const paintOverlayRect = (
  target: OverlayTarget,
  rect: SpoilerOverlayRect,
  sourceCanvas: OffscreenCanvas | undefined,
  clearScratch: boolean,
  zoom = 0,
  coords?: [number, number]
) => {
  const {context, scratchContext, dpr} = target;
  const left = rect.left;
  const top = Math.max(0, rect.top);
  const x = left * dpr;
  const y = top * dpr;
  const width = rect.width * dpr;
  const height = rect.height * dpr;

  context.fillStyle = rect.color || target.backgroundColor;
  context.fillRect(x, y, width, height);
  if(!sourceCanvas) return;

  if(clearScratch) scratchContext.clearRect(x, y, width, height);
  const [centerX, centerY] = coords || [left, top];
  drawImageFromSource(
    scratchContext,
    sourceCanvas,
    (left + (centerX - left) * zoom) * dpr,
    (top + (centerY - top) * zoom) * dpr,
    rect.width * (1 - zoom) * dpr,
    rect.height * (1 - zoom) * dpr,
    x,
    y,
    width,
    height
  );
  applyColorOnContext(scratchContext, target.particleColor, x, y, width, height);
  return {x, y, width, height};
};

// * a reveal of a text spoiler, or its way back; at rest (false) the dust is drawn the classic way, the same pixels
const drawDustOverlay = (sim: Sim | undefined, target: OverlayTarget) => {
  const {canvas, context, scratchContext, dpr, rects} = target;
  const sourceCanvas = sim?.core.inited ? sim.canvas : undefined;

  let {unwrap} = target;
  if(unwrap && !unwrap.to && isUnwrapSettled(unwrap)) {
    unwrap = target.unwrap = undefined;
  }

  if(!unwrap) {
    target.overlayDust = target.assembly = undefined;
    return false;
  }

  const progress = getUnwrapProgress(unwrap);
  const {coords} = unwrap;

  if(!canvas.width || !canvas.height) {
    target.needsRedraw = false;
    return true;
  }

  const {scratch} = target;
  if(scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  if(progress <= 0 || progress >= 1) {
    target.overlayDust = undefined;
  }

  const groups = getRectGroups(rects, dpr, canvas.width, canvas.height);
  if(!groups.length || (progress >= 1 && unwrap.to)) {
    target.assembly = undefined;
    target.needsRedraw = false;
    return true;
  }

  const revealing = coords && unwrap.maxDist && progress > 0;
  groups.forEach((group, index) => {
    const {left, top, width, height} = group;
    scratchContext.clearRect(left, top, width, height);
    for(const rect of group.rects) {
      paintOverlayRect(target, rect, sourceCanvas, false);
    }

    if(revealing) {
      applyDustReveal(target, index, group, coords[0] * dpr, coords[1] * dpr, unwrap.maxDist * dpr, progress);
    }

    context.drawImage(scratch, left, top, width, height, left, top, width, height);
  });

  if(target.overlayDust?.length > groups.length) {
    target.overlayDust.length = groups.length;
  }

  if(revealing) {
    drawAssembly(target, progress);
  }

  target.needsRedraw = false;
  return true;
};

const drawOverlayTarget = (sim: Sim | undefined, target: OverlayTarget) => {
  if(target.dust) {
    try {
      if(drawDustOverlay(sim, target)) return;
    } catch(err) {
      reportDustError(err);
      target.dust = false;
      target.overlayDust = undefined;
      target.assembly = undefined;
      target.glyphs = undefined;
    }
  }

  const {canvas, context, scratch, dpr, rects} = target;
  const sourceCanvas = sim?.core.inited ? sim.canvas : undefined;

  let {unwrap} = target;
  if(unwrap && !unwrap.to && isUnwrapSettled(unwrap)) { // the wrap-back has finished
    unwrap = target.unwrap = undefined;
  }

  const progress = unwrap ? getUnwrapProgress(unwrap) : 0;
  const coords = unwrap?.coords;

  context.clearRect(0, 0, canvas.width, canvas.height);

  // * the particles pushed away from the tap: the simulation is read from a window closing in on it
  const zoom = coords ? progress ** 2 * 0.4 : 0;
  for(const rect of rects) {
    const painted = paintOverlayRect(target, rect, sourceCanvas, true, zoom, coords);
    if(!painted) continue;
    const {x, y, width, height} = painted;
    context.drawImage(scratch, x, y, width, height, x, y, width, height);
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
  const textDprsNeeded = new Set<number>();
  ports.forEach((state) => {
    for(const target of state.overlayTargets.values()) {
      if(isOverlayTargetActive(target)) textDprsNeeded.add(target.dpr);
    }
  });
  textDprsNeeded.forEach((dpr) => textSims.get(dpr)?.core.draw());

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
      state.mediaTargets.forEach((target, id) => {
        if(!isMediaTargetActive(target)) return;
        const wasRevealed = target.revealed;
        try {
          drawMediaTarget(mediaSim, target, state.mediaDpr);
        } catch(err) {
          reportDustError(err);
          target.dust = false;
          target.mediaDust = undefined;
          target.mediaAssembly = undefined;
          target.softImage = undefined;
        }

        // * a frame of a worker's canvas may reach the screen a frame after the page's own change: one with the cover
        // * drawn before this one is there by now
        if(target.reveal && (target.reveal.frames = (target.reveal.frames ?? 0) + 1) === 2) {
          state.port.postMessage({type: 'media-revealing', id});
        }

        if(target.revealed && !wasRevealed) {
          state.port.postMessage({type: 'media-revealed', id});
        }
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

const handleMessage = (state: PortState, message: SpoilerRendererInMessage) => {
  switch(message.type) {
    case 'text-init': {
      state.textDpr = message.dpr;
      let sim = textSims.get(message.dpr);
      if(!sim) textSims.set(message.dpr, sim = createSim(message));
      pruneSims();
      callbackify(sim.core.init(), () => state.port.postMessage({type: 'text-inited'}));
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
        color: message.color,
        dust: message.dust
      });
      break;
    }

    case 'media-thumbnail': {
      const target = state.mediaTargets.get(message.id);
      if(target) {
        target.thumbnail?.close();
        target.thumbnail = message.bitmap;
        target.tintedThumbnail = undefined;
      } else {
        message.bitmap.close();
      }
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

    case 'media-image': {
      const target = state.mediaTargets.get(message.id);
      if(target) {
        target.image?.close();
        target.image = message.bitmap;
        target.imagePlacement = message.placement;
        target.mediaAssembly = undefined;
        target.softImage = undefined;
      } else {
        message.bitmap.close();
      }
      break;
    }

    case 'media-detach': {
      state.mediaTargets.get(message.id)?.thumbnail?.close();
      state.mediaTargets.get(message.id)?.image?.close();
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
        dust: message.dust,
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
      // * drawn in this task: a resized canvas is blank, and shown so it blinked - the update comes on
      // * every frame the message resizes (a details opening), the spoilers follow it with no gap
      drawOverlayTarget(textSims.get(target.dpr), target);
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
      target.assembly = undefined;
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

    case 'overlay-glyphs': {
      const target = state.overlayTargets.get(message.id);
      const {bitmap} = message;
      if(target) {
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const glyphContext = canvas.getContext('2d', {willReadFrequently: true});
        glyphContext.drawImage(bitmap, 0, 0);
        const pixels = glyphContext.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const alpha = new Uint8Array(bitmap.width * bitmap.height);
        for(let index = 0; index < alpha.length; ++index) {
          alpha[index] = pixels[index * 4 + 3];
        }
        target.glyphs = {width: bitmap.width, height: bitmap.height, alpha};
        target.assembly = undefined;
      }
      bitmap.close();
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
