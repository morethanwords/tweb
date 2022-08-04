/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from '../environment/ctx';

type CacheFunction = (...args: any[]) => any;
const cache: Map<CacheFunction, {result: any, timeout: number}> = new Map();

Function.prototype.cache = function(thisArg, ...args: any[]) {
  let cached = cache.get(this);
  if(cached) {
    return cached.result;
  }

  const result = this.apply(thisArg, args as any);

  cache.set(this, cached = {
    result,
    timeout: ctx.setTimeout(() => {
      cache.delete(this);
    }, 60000)
  });

  return result;
};

declare global {
  interface Function {
    cache<T, A extends any[], R>(this: (this: T, ...args: A) => R, thisArg?: T, ...args: A): R;
  }
}

export {};
