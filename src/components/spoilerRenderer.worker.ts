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
  ({type: 'media-init'} & SpoilerRendererSimInit) |
  {type: 'media-attach', id: number, canvas: OffscreenCanvas, x: number, y: number, color?: string, dust?: boolean} |
  {type: 'media-thumbnail', id: number, bitmap: ImageBitmap} |
  {type: 'media-image', id: number, bitmap: ImageBitmap} |
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
  {type: 'connection-error'} |
  {type: 'dust-error', message: string}; // synthesized by spoilerRendererConnection, never sent from here

const ctx = self as any;

const FRAME_INTERVAL = 1000 / 60;
const DUST_FRONT_WIDTH = 0.45;
const MEDIA_GRAIN = 2;
const MEDIA_FRONT_WIDTH = 1.1;
const MEDIA_SAMPLE_STEP = 3;
const MEDIA_ASSEMBLY_MIN = 2500;
const MEDIA_ASSEMBLY_MAX = 28000;
const MEDIA_ASSEMBLY_DENSITY = 22;
const MEDIA_DUST_WHITE = 0.12;
const MEDIA_DOT_WHITE = 0.12;
const MEDIA_COVER_BRIGHTNESS = 0.24;
const MEDIA_COVER_FALLBACK = 'rgb(18, 16, 20)';
const MEDIA_DUST_FILTER = 'saturate(2.2) brightness(2.3)';
const MEDIA_REVEAL_ALPHA = 2.2 * 255;
const MEDIA_COLOR_BUCKETS = 512;
const MEDIA_KEY_LEVELS = 1024;
const MEDIA_KEY_MIN = -0.2;
const MEDIA_KEY_STEP = 1.6 / MEDIA_KEY_LEVELS;

const clamp01 = (value: number) => value < 0 ? 0 : value > 1 ? 1 : value;
const DUST_JITTER = 0.35;
const ASSEMBLY_MAX = 20000;
const ASSEMBLY_SHARE = 1;
const GLYPH_INSIDE = 170;
const TEXT_FRONT_WIDTH = 0.75;
const ASSEMBLY_ALPHA = 0.9;
const ASSEMBLY_STRIDE = 6;

type OverlayDust = {
  width: number,
  height: number,
  noise: Float32Array,
  fillImage: ImageData,
  dustImage: ImageData,
  fillMask: OffscreenCanvas,
  dustMask: OffscreenCanvas,
  fillContext: OffscreenCanvasRenderingContext2D,
  dustContext: OffscreenCanvasRenderingContext2D,
  baseKey?: string,
  base?: Float32Array
};

type MediaDust = {
  width: number,
  height: number,
  grainsX: number,
  grainsY: number,
  noise: Float32Array,
  maskImage: ImageData,
  mask: OffscreenCanvas,
  maskContext: OffscreenCanvasRenderingContext2D,
  layer: OffscreenCanvas,
  layerContext: OffscreenCanvasRenderingContext2D,
  baseKey?: string,
  base?: Float32Array
};

type MediaAssembly = {
  data: Float32Array,
  buckets: {color: string, start: number, end: number}[]
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
  mediaAssembly?: MediaAssembly,
  thumbnail?: ImageBitmap,
  tintedThumbnail?: OffscreenCanvas,
  coverColor?: string,
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
  dust?: boolean,
  overlayDust?: OverlayDust,
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

const getRectsBounds = (rects: SpoilerOverlayRect[], dpr: number, width: number, height: number) => {
  let left = width, top = height, right = 0, bottom = 0;
  for(const rect of rects) {
    left = Math.min(left, Math.max(0, Math.floor(rect.left * dpr)));
    top = Math.min(top, Math.max(0, Math.floor(rect.top * dpr)));
    right = Math.max(right, Math.min(width, Math.ceil((rect.left + rect.width) * dpr)));
    bottom = Math.max(bottom, Math.min(height, Math.ceil((rect.top + rect.height) * dpr)));
  }
  return right > left && bottom > top ? {left, top, width: right - left, height: bottom - top} : undefined;
};

const ensureOverlayDust = (target: OverlayTarget, bounds: {left: number, top: number, width: number, height: number}): OverlayDust => {
  const {width, height} = bounds;
  const dust = target.overlayDust;
  if(dust && dust.width === width && dust.height === height) return dust;

  const noise = new Float32Array(width * height);
  for(let index = 0; index < noise.length; ++index) {
    noise[index] = Math.random();
  }

  const fillMask = new OffscreenCanvas(width, height);
  const dustMask = new OffscreenCanvas(width, height);
  const fillContext = fillMask.getContext('2d');
  const dustContext = dustMask.getContext('2d');
  return target.overlayDust = {
    width,
    height,
    noise,
    fillImage: fillContext.createImageData(width, height),
    dustImage: dustContext.createImageData(width, height),
    fillMask,
    dustMask,
    fillContext,
    dustContext
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

const applyDustReveal = (target: OverlayTarget, centerX: number, centerY: number, maxDist: number, progress: number) => {
  const {context, scratchContext, dpr, rects, canvas} = target;
  const bounds = getRectsBounds(rects, dpr, canvas.width, canvas.height);
  if(!bounds) return;

  const dust = ensureOverlayDust(target, bounds);
  const {fillImage, dustImage} = dust;
  const fillPixels = fillImage.data;
  const dustPixels = dustImage.data;
  const base = getOverlayRevealBase(dust, rects, bounds, dpr, centerX, centerY, maxDist);
  const shift = progress * (1 + TEXT_FRONT_WIDTH) / TEXT_FRONT_WIDTH;

  for(let index = 0, length = base.length; index < length; ++index) {
    const local = shift + base[index];
    fillPixels[index * 4 + 3] = (local - 0.78) * 1275;
    dustPixels[index * 4 + 3] = local * 765;
  }

  dust.fillContext.putImageData(fillImage, 0, 0);
  dust.dustContext.putImageData(dustImage, 0, 0);

  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(dust.fillMask, bounds.left, bounds.top);
  context.restore();

  scratchContext.save();
  scratchContext.globalCompositeOperation = 'destination-out';
  scratchContext.drawImage(dust.dustMask, bounds.left, bounds.top);
  scratchContext.restore();
};

const drawCover = (
  context: OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource & {width: number, height: number},
  width: number,
  height: number
) => {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
};

const getCoverColor = (bitmap: ImageBitmap) => {
  const sampler = new OffscreenCanvas(1, 1);
  const samplerContext = sampler.getContext('2d', {willReadFrequently: true});
  samplerContext.drawImage(bitmap, 0, 0, 1, 1);
  const [red, green, blue] = samplerContext.getImageData(0, 0, 1, 1).data;
  const scale = (value: number) => Math.round(8 + value * MEDIA_COVER_BRIGHTNESS);
  return 'rgb(' + scale(red) + ',' + scale(green) + ',' + scale(blue) + ')';
};

const ensureMediaDust = (target: MediaTarget): MediaDust => {
  const {width, height} = target.canvas;
  const dust = target.mediaDust;
  if(dust && dust.width === width && dust.height === height) return dust;

  const grainsX = Math.ceil(width / MEDIA_GRAIN);
  const grainsY = Math.ceil(height / MEDIA_GRAIN);
  const noise = new Float32Array(grainsX * grainsY);
  for(let index = 0; index < noise.length; ++index) {
    noise[index] = Math.random();
  }

  const mask = new OffscreenCanvas(grainsX, grainsY);
  const layer = new OffscreenCanvas(width, height);
  const maskContext = mask.getContext('2d');
  return target.mediaDust = {
    width,
    height,
    grainsX,
    grainsY,
    noise,
    maskImage: maskContext.createImageData(grainsX, grainsY),
    mask,
    maskContext,
    layer,
    layerContext: layer.getContext('2d')
  };
};

const ensureTintedThumbnail = (target: MediaTarget, width: number, height: number) => {
  const tinted = target.tintedThumbnail;
  if(tinted && tinted.width === width && tinted.height === height) return tinted;

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.filter = MEDIA_DUST_FILTER;
  drawCover(context, target.thumbnail, width, height);
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

const buildMediaAssembly = (target: MediaTarget, dpr: number) => {
  const source = target.image || target.thumbnail;
  const {reveal} = target;
  if(!source || !reveal) return;

  const {width, height} = target.canvas;
  const sampleWidth = Math.max(1, Math.ceil(width / MEDIA_SAMPLE_STEP));
  const sampleHeight = Math.max(1, Math.ceil(height / MEDIA_SAMPLE_STEP));
  const sampler = new OffscreenCanvas(sampleWidth, sampleHeight);
  const samplerContext = sampler.getContext('2d', {willReadFrequently: true});
  drawCover(samplerContext, source, sampleWidth, sampleHeight);
  const pixels = samplerContext.getImageData(0, 0, sampleWidth, sampleHeight).data;

  const count = Math.max(MEDIA_ASSEMBLY_MIN, Math.min(MEDIA_ASSEMBLY_MAX, Math.round(width * height / MEDIA_ASSEMBLY_DENSITY)));
  const radius = Math.max(reveal.maxDist, 1);
  const spread = 26 * dpr;

  const weights = new Float32Array(sampleWidth * sampleHeight);
  let total = 0;
  for(let index = 0; index < weights.length; ++index) {
    const luminance = (pixels[index * 4] * 0.299 + pixels[index * 4 + 1] * 0.587 + pixels[index * 4 + 2] * 0.114) / 255;
    total += 0.05 + luminance ** 1.5;
    weights[index] = total;
  }

  const pickSample = () => {
    const value = Math.random() * total;
    let low = 0, high = weights.length - 1;
    while(low < high) {
      const middle = (low + high) >> 1;
      if(weights[middle] < value) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  const values = new Float32Array(count * ASSEMBLY_STRIDE);
  const colorBuckets = new Uint16Array(count);
  const keyLevels = new Uint16Array(count);
  const order = new Uint32Array(count);

  for(let particle = 0; particle < count; ++particle) {
    const sample = pickSample();
    const targetX = Math.min(width - 1, ((sample % sampleWidth) + Math.random()) * MEDIA_SAMPLE_STEP);
    const targetY = Math.min(height - 1, (Math.floor(sample / sampleWidth) + Math.random()) * MEDIA_SAMPLE_STEP);
    const sampleIndex = sample * 4;
    const red = Math.min(255, pixels[sampleIndex] * 1.25 * (1 - MEDIA_DOT_WHITE) + 255 * MEDIA_DOT_WHITE);
    const green = Math.min(255, pixels[sampleIndex + 1] * 1.25 * (1 - MEDIA_DOT_WHITE) + 255 * MEDIA_DOT_WHITE);
    const blue = Math.min(255, pixels[sampleIndex + 2] * 1.25 * (1 - MEDIA_DOT_WHITE) + 255 * MEDIA_DOT_WHITE);
    const key = Math.hypot(targetX - reveal.coords.x, targetY - reveal.coords.y) / radius + (Math.random() - 0.5) * 0.1;
    const offset = particle * ASSEMBLY_STRIDE;
    values[offset] = targetX + (Math.random() - 0.5) * 2 * spread;
    values[offset + 1] = targetY + (Math.random() - 0.5) * 2 * spread;
    values[offset + 2] = targetX;
    values[offset + 3] = targetY;
    values[offset + 4] = key;
    values[offset + 5] = (0.8 + Math.random() * 0.6) * dpr;
    colorBuckets[particle] = ((red >> 5) << 6) | ((green >> 5) << 3) | (blue >> 5);
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

  target.mediaAssembly = {data, buckets};
};

const bucketColor = (bucket: number) => {
  const red = ((bucket >> 6) & 7) * 32 + 16;
  const green = ((bucket >> 3) & 7) * 32 + 16;
  const blue = (bucket & 7) * 32 + 16;
  return 'rgb(' + red + ',' + green + ',' + blue + ')';
};

const drawMediaAssembly = (target: MediaTarget, progress: number, dpr: number) => {
  if(!target.mediaAssembly) buildMediaAssembly(target, dpr);
  const assembly = target.mediaAssembly;
  if(!assembly) return;

  const {context} = target;
  const {data, buckets} = assembly;
  const front = progress * (1 + MEDIA_FRONT_WIDTH);
  const lastKey = front + MEDIA_KEY_STEP;
  let currentAlpha = -1;
  context.save();

  for(const bucket of buckets) {
    context.fillStyle = bucket.color;
    for(let particle = bucket.start; particle < bucket.end; ++particle) {
      const offset = particle * ASSEMBLY_STRIDE;
      const key = data[offset + 4];
      if(key >= lastKey) break;
      const local = clamp01((front - key) / MEDIA_FRONT_WIDTH);
      if(local <= 0 || local >= 1) continue;

      const alpha = Math.round((local < 0.25 ? 0.3 + 0.7 * local / 0.25 : local > 0.7 ? clamp01((0.95 - local) / 0.25) : 1) * 255) / 255;
      if(alpha <= 0) continue;
      if(alpha !== currentAlpha) {
        context.globalAlpha = currentAlpha = alpha;
      }

      const move = easeOutCubic(clamp01(local / 0.5));
      const x = data[offset] + (data[offset + 2] - data[offset]) * move;
      const y = data[offset + 1] + (data[offset + 3] - data[offset + 1]) * move;
      const size = data[offset + 5];
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  context.restore();
};

const getMediaRevealBase = (dust: MediaDust, reveal: MediaTarget['reveal']) => {
  const key = reveal.coords.x + ',' + reveal.coords.y + ',' + reveal.maxDist;
  if(dust.base && dust.baseKey === key) return dust.base;

  const {grainsX, grainsY, noise} = dust;
  const base = dust.base ??= new Float32Array(grainsX * grainsY);
  const radius = Math.max(reveal.maxDist, 1);
  const centerX = reveal.coords.x;
  const centerY = reveal.coords.y;

  let index = 0;
  for(let grainY = 0; grainY < grainsY; ++grainY) {
    const dy = (grainY + 0.5) * MEDIA_GRAIN - centerY;
    for(let grainX = 0; grainX < grainsX; ++grainX, ++index) {
      const dx = (grainX + 0.5) * MEDIA_GRAIN - centerX;
      const distance = Math.sqrt(dx * dx + dy * dy) / radius;
      base[index] = ((noise[index] - 0.5) * DUST_JITTER - distance / MEDIA_FRONT_WIDTH) * MEDIA_REVEAL_ALPHA;
    }
  }

  dust.baseKey = key;
  return base;
};

const applyMediaReveal = (target: MediaTarget, dust: MediaDust, progress: number) => {
  const {reveal, context} = target;
  const {grainsX, grainsY, maskImage} = dust;
  const pixels = maskImage.data;
  const base = getMediaRevealBase(dust, reveal);
  const shift = progress * (1 + MEDIA_FRONT_WIDTH) / MEDIA_FRONT_WIDTH * MEDIA_REVEAL_ALPHA;

  for(let index = 0, length = base.length; index < length; ++index) {
    pixels[index * 4 + 3] = shift + base[index];
  }

  dust.maskContext.putImageData(maskImage, 0, 0);

  const {width, height} = dust;
  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(dust.mask, 0, 0, grainsX, grainsY, 0, 0, grainsX * MEDIA_GRAIN, grainsY * MEDIA_GRAIN);
  context.restore();

  dust.layerContext.save();
  dust.layerContext.globalCompositeOperation = 'destination-out';
  dust.layerContext.drawImage(dust.mask, 0, 0, grainsX, grainsY, 0, 0, width, height);
  dust.layerContext.restore();
};

const drawMediaDust = (sim: Sim, target: MediaTarget, dpr: number) => {
  const {canvas, context, x, y, reveal, thumbnail} = target;
  const {width, height} = canvas;
  if(!width || !height) return;

  const dust = ensureMediaDust(target);
  const progress = reveal ? simpleEasing(Math.min((Date.now() - reveal.startTime) / reveal.duration, 1)) : 0;

  context.clearRect(0, 0, width, height);

  if(progress >= 1) {
    target.revealed = true;
    target.mediaDust = undefined;
    target.mediaAssembly = undefined;
    target.tintedThumbnail = undefined;
    return;
  }

  context.fillStyle = target.coverColor || MEDIA_COVER_FALLBACK;
  context.fillRect(0, 0, width, height);

  const {layer, layerContext} = dust;
  layerContext.clearRect(0, 0, width, height);
  drawImageFromSource(layerContext, sim.canvas, x, y, width, height, 0, 0, width, height);
  if(thumbnail) {
    layerContext.save();
    layerContext.globalCompositeOperation = 'source-in';
    layerContext.drawImage(ensureTintedThumbnail(target, width, height), 0, 0);
    layerContext.restore();
    layerContext.save();
    layerContext.globalAlpha = MEDIA_DUST_WHITE;
    drawImageFromSource(layerContext, sim.canvas, x, y, width, height, 0, 0, width, height);
    layerContext.restore();
  } else if(target.color) {
    applyColorOnContext(layerContext, target.color, 0, 0, width, height);
  }

  if(reveal && progress > 0) {
    applyMediaReveal(target, dust, progress);
  }

  context.drawImage(layer, 0, 0);

  if(reveal && progress > 0) {
    drawMediaAssembly(target, progress, dpr);
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
    data[offset + 4] = Math.hypot(targetX - centerX, targetY - centerY) / radius + (Math.random() - 0.5) * 0.12;
    data[offset + 5] = (0.55 + Math.random() * 0.35) * dpr;
  }

  target.assembly = {data, count};
};

const easeOutCubic = (value: number) => 1 - (1 - value) ** 3;

const drawAssembly = (target: OverlayTarget, progress: number) => {
  if(!target.assembly) buildAssembly(target);
  const {assembly, context, particleColor} = target;
  if(!assembly) return;

  const {data, count} = assembly;
  const front = progress * (1 + TEXT_FRONT_WIDTH);
  let currentAlpha = -1;
  context.save();
  context.fillStyle = particleColor;

  for(let particle = 0; particle < count; ++particle) {
    const offset = particle * ASSEMBLY_STRIDE;
    const local = clamp01((front - data[offset + 4]) / TEXT_FRONT_WIDTH);
    if(local <= 0 || local >= 1) continue;

    const alpha = Math.round((local < 0.35 ? 0.15 + 0.85 * local / 0.35 : local > 0.78 ? clamp01((0.96 - local) / 0.18) : 1) * ASSEMBLY_ALPHA * 255) / 255;
    if(alpha <= 0) continue;
    if(alpha !== currentAlpha) {
      context.globalAlpha = currentAlpha = alpha;
    }

    const move = easeOutCubic(clamp01(local / 0.55));
    const x = data[offset] + (data[offset + 2] - data[offset]) * move;
    const y = data[offset + 1] + (data[offset + 3] - data[offset + 1]) * move;
    const size = data[offset + 5];
    context.fillRect(x - size / 2, y - size / 2, size, size);
  }

  context.restore();
};

const drawDustOverlay = (sim: Sim | undefined, target: OverlayTarget) => {
  const {canvas, context, scratchContext, dpr, rects, backgroundColor, particleColor} = target;
  const sourceCanvas = sim?.core.inited ? sim.canvas : undefined;

  let {unwrap} = target;
  if(unwrap && !unwrap.to && isUnwrapSettled(unwrap)) {
    unwrap = target.unwrap = undefined;
  }

  const progress = unwrap ? getUnwrapProgress(unwrap) : 0;
  const coords = unwrap?.coords;

  if(!canvas.width || !canvas.height) {
    target.needsRedraw = false;
    return;
  }

  const {scratch} = target;
  if(scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  scratchContext.clearRect(0, 0, canvas.width, canvas.height);

  if(!unwrap || progress <= 0 || progress >= 1) {
    target.overlayDust = undefined;
    if(!unwrap) target.assembly = undefined;
  }

  if(unwrap && progress >= 1 && unwrap.to) {
    target.assembly = undefined;
    target.needsRedraw = false;
    return;
  }

  for(const rect of rects) {
    const x = rect.left * dpr;
    const y = Math.max(0, rect.top) * dpr;
    const dw = rect.width * dpr;
    const dh = rect.height * dpr;

    context.fillStyle = rect.color || backgroundColor;
    context.fillRect(x, y, dw, dh);

    if(!sourceCanvas) continue;

    drawImageFromSource(scratchContext, sourceCanvas, x, y, dw, dh, x, y, dw, dh);
    applyColorOnContext(scratchContext, particleColor, x, y, dw, dh);
  }

  if(coords && unwrap.maxDist && progress > 0) {
    applyDustReveal(target, coords[0] * dpr, coords[1] * dpr, unwrap.maxDist * dpr, progress);
  }

  context.drawImage(scratchContext.canvas, 0, 0);

  if(coords && unwrap.maxDist && progress > 0) {
    drawAssembly(target, progress);
  }

  target.needsRedraw = false;
};

const drawOverlayTarget = (sim: Sim | undefined, target: OverlayTarget) => {
  if(target.dust) {
    try {
      drawDustOverlay(sim, target);
      return;
    } catch(err) {
      reportDustError(err);
      target.dust = false;
      target.overlayDust = undefined;
      target.assembly = undefined;
      target.glyphs = undefined;
    }
  }

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
      const scaledProgress = progress ** 2 * 0.4;
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
      state.mediaTargets.forEach((target) => {
        if(!isMediaTargetActive(target)) return;
        try {
          drawMediaTarget(mediaSim, target, state.mediaDpr);
        } catch(err) {
          reportDustError(err);
          target.dust = false;
          target.mediaDust = undefined;
          target.mediaAssembly = undefined;
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
        target.thumbnail = message.bitmap;
        target.tintedThumbnail = undefined;
        target.coverColor = getCoverColor(message.bitmap);
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
        target.mediaAssembly = undefined;
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
