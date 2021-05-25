/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type fastBlur from '../vendor/fastBlur';
import addHeavyTask from './heavyQueue';

const RADIUS = 2;
const ITERATIONS = 2;

const isFilterAvailable = 'filter' in (document.createElement('canvas').getContext('2d') || {});
let requireBlurPromise: Promise<any>;
let fastBlurFunc: typeof fastBlur;
if(!isFilterAvailable) {
  requireBlurPromise = import('../vendor/fastBlur').then(m => {
    fastBlurFunc = m.default;
  });
} else {
  requireBlurPromise = Promise.resolve();
}

function processBlurNext(img: HTMLImageElement, radius: number, iterations: number) {
  return new Promise<string>((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    
    const ctx = canvas.getContext('2d', {alpha: false});
    if(isFilterAvailable) {
      ctx.filter = `blur(${radius}px)`;
      ctx.drawImage(img, -radius * 2, -radius * 2, canvas.width + radius * 4, canvas.height + radius * 4);
    } else {
      ctx.drawImage(img, 0, 0);
      fastBlurFunc(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);
    }
    
    resolve(canvas.toDataURL());
    /* if(DEBUG) {
      console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
    } */

    /* canvas.toBlob(blob => {
      resolve(URL.createObjectURL(blob));
      
      if(DEBUG) {
        console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
      }
    }); */
  });
}

const blurPromises: Map<string, Promise<string>> = new Map();
const CACHE_SIZE = 1000;

export default function blur(dataUri: string, radius: number = RADIUS, iterations: number = ITERATIONS) {
  if(!dataUri) {
    console.error('no dataUri for blur', dataUri);
    return Promise.resolve(dataUri);
  }

  if(blurPromises.size > CACHE_SIZE) {
    blurPromises.clear();
  }
  
  if(blurPromises.has(dataUri)) return blurPromises.get(dataUri);
  const promise = new Promise<string>((resolve) => {
    //return resolve(dataUri);
    requireBlurPromise.then(() => {
      const img = new Image();
      img.onload = () => {
        if(isFilterAvailable) {
          processBlurNext(img, radius, iterations).then(resolve);
        } else {
          addHeavyTask({
            items: [[img, radius, iterations]],
            context: null,
            process: processBlurNext
          }, 'unshift').then(results => {
            resolve(results[0]);
          });
        }
      };
      img.src = dataUri;

      /* addHeavyTask({
        items: [[dataUri, radius, iterations]],
        context: null,
        process: processBlur
      }, 'unshift').then(results => {
        resolve(results[0]);
      }); */
    });
  });

  blurPromises.set(dataUri, promise);

  return promise;
}
