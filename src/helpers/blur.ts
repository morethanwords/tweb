import type fastBlur from '@vendor/fastBlur';
import addHeavyTask from '@helpers/heavyQueue';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import IS_CANVAS_FILTER_SUPPORTED from '@environment/canvasFilterSupport';

const RADIUS = 2;
const ITERATIONS = 2;

let requireBlurPromise: Promise<any>;
let fastBlurFunc: typeof fastBlur;
if(!IS_CANVAS_FILTER_SUPPORTED) {
  requireBlurPromise = import('../vendor/fastBlur').then((m) => {
    fastBlurFunc = m.default;
  });
} else {
  requireBlurPromise = Promise.resolve();
}

function processBlurNext(
  img: HTMLImageElement,
  radius: number,
  iterations: number,
  canvas: HTMLCanvasElement = document.createElement('canvas'),
  maxSize?: number
) {
  let width = img.width;
  let height = img.height;
  // downscale the source before blurring (like the official clients do for the side-fill):
  // blurring a small thumbnail and upscaling it produces a far stronger, frosted-glass blur
  // than blurring the full-resolution image and scaling it down.
  if(maxSize && Math.max(width, height) > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale) || 1;
    height = Math.round(height * scale) || 1;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', {alpha: false});
  if(IS_CANVAS_FILTER_SUPPORTED) {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(img, -radius * 2, -radius * 2, canvas.width + radius * 4, canvas.height + radius * 4);
  } else {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    fastBlurFunc(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);
  }

  return canvas;
}

// * the cache draws into a canvas of its own and every caller gets a copy: the canvas a caller puts into
// * the DOM, kept here, held the whole detached tree it was removed with - a closed chat's bubble -
// * for as long as the entry lived
type CacheValue = {canvas: HTMLCanvasElement, promise: Promise<void>, ready?: boolean};
const cache: Map<string, CacheValue> = new Map();
const CACHE_SIZE = 150;

export default function blur(dataUri: string, radius: number = RADIUS, iterations: number = ITERATIONS, maxSize?: number) {
  if(!dataUri) {
    throw 'no dataUri for blur: ' + dataUri;
  }

  if(cache.size > CACHE_SIZE) {
    cache.clear();
  }

  let cached = cache.get(dataUri);
  if(!cached) {
    const img = new Image();
    const cacheCanvas = document.createElement('canvas');
    const promise: CacheValue['promise'] = requireBlurPromise.then(async() => {
      // return resolve(dataUri);
      try {
        img.src = dataUri;
        await img.decode();
        await addHeavyTask({
          items: [[img, radius, iterations, cacheCanvas, maxSize]],
          context: null,
          process: processBlurNext
        }, 'unshift');
      } finally {
        clearMediaElementSource(img);
      }
    });

    const value: CacheValue = cached = {
      canvas: cacheCanvas,
      promise
    };
    cache.set(dataUri, value);
    promise.then(() => {
      value.ready = true;
    }, () => {
      if(cache.get(dataUri) === value) {
        cache.delete(dataUri);
      }
    });
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'canvas-thumbnail';
  const source = cached.canvas;
  const copy = () => {
    canvas.width = source.width;
    canvas.height = source.height;
    canvas.getContext('2d').drawImage(source, 0, 0);
  };

  if(cached.ready) {
    copy();
  } else {
    // * before the caller's own wait on the promise, so the copy is there when it resumes
    cached.promise.then(copy, () => {});
  }

  return {
    canvas,
    promise: cached.promise
  };
}
