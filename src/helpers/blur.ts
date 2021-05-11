/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import _DEBUG from '../config/debug';
import fastBlur from '../vendor/fastBlur';
import addHeavyTask from './heavyQueue';

const RADIUS = 2;
const ITERATIONS = 2;

const DEBUG = _DEBUG && true;

function processBlur(dataUri: string, radius: number, iterations: number) {
  return new Promise<string>((resolve) => {
    const img = new Image();
    
    const perf = performance.now();
    if(DEBUG) {
      console.log('[blur] start');
    }
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d')!;
      
      //ctx.filter = 'blur(2px)';
      ctx.drawImage(img, 0, 0);
      fastBlur(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);
      
      resolve(canvas.toDataURL());
      if(DEBUG) {
        console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
      }
      
      /* canvas.toBlob(blob => {
        resolve(URL.createObjectURL(blob));
        
        if(DEBUG) {
          console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
        }
      }); */
    };
    
    img.src = dataUri;
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
    addHeavyTask({
      items: [[dataUri, radius, iterations]],
      context: null,
      process: processBlur
    }, 'unshift').then(results => {
      resolve(results[0]);
    });
  });

  blurPromises.set(dataUri, promise);

  return promise;
}
