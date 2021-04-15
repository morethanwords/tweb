/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import _DEBUG from '../config/debug';
import fastBlur from '../vendor/fastBlur';
import pushHeavyTask from './heavyQueue';

const RADIUS = 2;
const ITERATIONS = 2;

const DEBUG = _DEBUG && false;

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

      ctx.drawImage(img, 0, 0);
      fastBlur(ctx, 0, 0, canvas.width, canvas.height, radius, iterations);

      //resolve(canvas.toDataURL());
      canvas.toBlob(blob => {
        resolve(URL.createObjectURL(blob));

        if(DEBUG) {
          console.log(`[blur] end, radius: ${radius}, iterations: ${iterations}, time: ${performance.now() - perf}`);
        }
      });
    };

    img.src = dataUri;
  });
}

const blurPromises: {[dataUri: string]: Promise<string>} = {};

export default function blur(dataUri: string, radius: number = RADIUS, iterations: number = ITERATIONS) {
  if(blurPromises[dataUri]) return blurPromises[dataUri];
  return blurPromises[dataUri] = new Promise<string>((resolve) => {
    //return resolve(dataUri);
    pushHeavyTask({
      items: [[dataUri, radius, iterations]],
      context: null,
      process: processBlur
    }).then(results => {
      resolve(results[0]);
    });
  });
}
