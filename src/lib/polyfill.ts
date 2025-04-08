/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import bufferConcats from '../helpers/bytes/bufferConcats';

Uint8Array.prototype.concat = function(...args: Array<Uint8Array | ArrayBuffer | number[]>) {
  return bufferConcats(this, ...args);
};

/* Uint8Array.prototype.toString = function() {
  return String.fromCharCode.apply(null, [...this]);
}; */

Uint8Array.prototype.toJSON = function() {
  return [...this];
  // return {type: 'bytes', value: [...this]};
};

Promise.prototype.finally = Promise.prototype.finally || function<T>(this: Promise<T>, fn: () => any) {
  const onFinally = (callback: typeof fn) => Promise.resolve(fn()).then(callback);
  return this.then(
    (result) => onFinally(() => result),
    (reason) => onFinally(() => Promise.reject(reason))
  );
};

declare global {
  interface Uint8Array {
    concat: (...args: Array<Uint8Array | ArrayBuffer | number[]>) => Uint8Array,
    // toString: () => string,
    toJSON: () => number[],
    // toJSON: () => {type: 'bytes', value: number[]},
  }

  interface Promise<T> {
    finally: (onfinally?: () => void) => Promise<T>;
  }
}
