/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type fastBlur from '../vendor/fastBlur';
import addHeavyTask from './heavyQueue';
import IS_CANVAS_FILTER_SUPPORTED from '../environment/canvasFilterSupport';

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
  canvas: HTMLCanvasElement = document.createElement('canvas')
) {
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext('2d', {alpha: false});
  if(IS_CANVAS_FILTER_SUPPORTED) {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(img, -radius * 2, -radius * 2, canvas.width + radius * 4, canvas.height + radius * 4);
  } else {
    ctx.drawImage(img, 0, 0);
    fastBlurFunc(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);
  }

  return canvas;
}

type CacheValue = {canvas: HTMLCanvasElement, promise: Promise<void>};
const cache: Map<string, CacheValue> = new Map();
const CACHE_SIZE = 150;

export default function blur(dataUri: string, radius: number = RADIUS, iterations: number = ITERATIONS) {
  if(!dataUri) {
    throw 'no dataUri for blur: ' + dataUri;
  }

  if(cache.size > CACHE_SIZE) {
    cache.clear();
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'canvas-thumbnail';

  let cached = cache.get(dataUri);
  if(!cached) {
    const promise: CacheValue['promise'] = new Promise((resolve) => {
      // return resolve(dataUri);
      requireBlurPromise.then(() => {
        const img = new Image();
        img.onload = () => {
          // if(IS_CANVAS_FILTER_SUPPORTED) {
          // resolve(processBlurNext(img, radius, iterations));
          // } else {
          const promise = addHeavyTask({
            items: [[img, radius, iterations, canvas]],
            context: null,
            process: processBlurNext
          }, 'unshift');

          promise.then(() => {
            resolve();
          });
          // }
        };
        img.src = dataUri;
      });
    });

    cache.set(dataUri, cached = {
      canvas,
      promise
    });
  } else {
    canvas.width = cached.canvas.width;
    canvas.height = cached.canvas.height;
    cached.promise.then(() => {
      canvas.getContext('2d').drawImage(cached.canvas, 0, 0, canvas.width, canvas.height);
    });
  }

  return {
    ...cached,
    canvas
  };
}
