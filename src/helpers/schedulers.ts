/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// * Jolly Cobra's schedulers
import { AnyToVoidFunction, NoneToVoidFunction } from "../types";
import _debounce from './schedulers/debounce';

//type Scheduler = typeof requestAnimationFrame | typeof onTickEnd | typeof runNow;

const debounce = _debounce;
export {debounce};

export function throttle<F extends AnyToVoidFunction>(
  fn: F,
  ms: number,
  shouldRunFirst = true,
) {
  let interval: number | null = null;
  let isPending: boolean;
  let args: Parameters<F>;

  return (..._args: Parameters<F>) => {
    isPending = true;
    args = _args;

    if(!interval) {
      if(shouldRunFirst) {
        isPending = false;
        // @ts-ignore
        fn(...args);
      }

      interval = setInterval(() => {
        if (!isPending) {
          clearInterval(interval!);
          interval = null;
          return;
        }

        isPending = false;
        // @ts-ignore
        fn(...args);
      }, ms) as any;
    }
  };
}

/* export function throttleWithRaf<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(fastRaf, fn);
}

export function throttleWithTickEnd<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(onTickEnd, fn);
}

export function throttleWithNow<F extends AnyToVoidFunction>(fn: F) {
  return throttleWith(runNow, fn);
}

export function throttleWith<F extends AnyToVoidFunction>(schedulerFn: Scheduler, fn: F) {
  let waiting = false;
  let args: Parameters<F>;

  return (..._args: Parameters<F>) => {
    args = _args;

    if (!waiting) {
      waiting = true;

      schedulerFn(() => {
        waiting = false;
        // @ts-ignore
        fn(...args);
      });
    }
  };
}

export function onTickEnd(cb: NoneToVoidFunction) {
  Promise.resolve().then(cb);
}

function runNow(fn: NoneToVoidFunction) {
  fn();
} */

export const pause = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

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

let rafPromise: Promise<DOMHighResTimeStamp>;
export function fastRafPromise() {
  if(rafPromise) return rafPromise;

  rafPromise = new Promise(requestAnimationFrame);
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
