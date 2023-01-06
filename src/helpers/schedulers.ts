/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * Jolly Cobra's schedulers
import {NoneToVoidFunction} from '../types';

/*
export function throttleWithTickEnd<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(onTickEnd, fn);
}

export function throttleWithNow<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(runNow, fn);
}

export function onTickEnd(cb: NoneToVoidFunction) {
  Promise.resolve().then(cb);
}

function runNow(fn: NoneToVoidFunction) {
  fn();
} */

let fastRafCallbacks: NoneToVoidFunction[] | undefined;
export function fastRaf(callback: NoneToVoidFunction) {
  if(!fastRafCallbacks) {
    fastRafCallbacks = [callback];

    requestAnimationFrame(() => {
      const currentCallbacks = fastRafCallbacks!;
      fastRafCallbacks = undefined;
      currentCallbacks.forEach((cb) => cb());
    });
  } else {
    fastRafCallbacks.push(callback);
  }
}

let fastRafConventionalCallbacks: NoneToVoidFunction[] | undefined, processing = false;
export function fastRafConventional(callback: NoneToVoidFunction) {
  if(!fastRafConventionalCallbacks) {
    fastRafConventionalCallbacks = [callback];

    requestAnimationFrame(() => {
      processing = true;
      for(let i = 0; i < fastRafConventionalCallbacks.length; ++i) {
        fastRafConventionalCallbacks[i]();
      }

      fastRafConventionalCallbacks = undefined;
      processing = false;
    });
  } else if(processing) {
    callback();
  } else {
    fastRafConventionalCallbacks.push(callback);
  }
}

let rafPromise: Promise<void>;
export function fastRafPromise() {
  if(rafPromise) return rafPromise;

  rafPromise = new Promise<void>((resolve) => fastRaf(() => resolve()));
  rafPromise.then(() => {
    rafPromise = undefined;
  });

  return rafPromise;
}

export function doubleRaf() {
  return new Promise<void>((resolve) => {
    fastRaf(() => {
      fastRaf(resolve);
    });
  });
}
