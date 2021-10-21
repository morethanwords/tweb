/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { bytesToHex, bytesFromHex, bufferConcats } from '../helpers/bytes';

Object.defineProperty(Uint8Array.prototype, 'hex', {
  get: function(): string {
    return bytesToHex(this);
  },
  
  set: function(str: string) {
    this.set(bytesFromHex(str));
  },
  enumerable: true,
  configurable: true
});

Uint8Array.prototype.randomize = function() {
  if(crypto && 'getRandomValues' in crypto) {
    crypto.getRandomValues(this);
  } else {
    throw new Error('NO_SECURE_RANDOM');
  }
  
  return this;
};

Uint8Array.prototype.concat = function(...args: Array<Uint8Array | ArrayBuffer | number[]>) {
  return bufferConcats(this, ...args);
};

/* Uint8Array.prototype.toString = function() {
  return String.fromCharCode.apply(null, [...this]);
}; */

Uint8Array.prototype.toJSON = function() {
  return [...this];
  //return {type: 'bytes', value: [...this]};
};

Array.prototype.findAndSplice = function<T>(verify: (value: T, index?: number, array?: Array<T>) => boolean) {
  let index = this.findIndex(verify);
  return index !== -1 ? this.splice(index, 1)[0] : undefined;
};

String.prototype.toHHMMSS = function(leadZero = false) {
  const sec_num = parseInt(this + '', 10);
  const hours = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - (hours * 3600)) / 60);
  let seconds: any = sec_num - (hours * 3600) - (minutes * 60);
  
  if(hours) leadZero = true;
  if(minutes < 10) minutes = leadZero ? "0" + minutes : minutes;
  if(seconds < 10) seconds = "0" + seconds;
  return (hours ? /* ('0' + hours).slice(-2) */hours + ':' : '') + minutes + ':' + seconds;
};

/* Promise.prototype.finally = Promise.prototype.finally || {
  finally(fn: () => any) {
    const onFinally = (callback: typeof fn) => Promise.resolve(fn()).then(callback);
    return this.then(
      result => onFinally(() => result),
      reason => onFinally(() => Promise.reject(reason))
    );
  }
}.finally; */
Promise.prototype.finally = Promise.prototype.finally || function<T>(this: Promise<T>, fn: () => any) {
  const onFinally = (callback: typeof fn) => Promise.resolve(fn()).then(callback);
  return this.then(
    result => onFinally(() => result),
    reason => onFinally(() => Promise.reject(reason))
  );
};

Promise.prototype.safeFinally = function<T>(this: Promise<T>, fn: () => any) {
  return this.catch(() => {}).finally(fn);
};

declare global {
  interface Uint8Array {
    hex: string;
    randomize: () => Uint8Array,
    concat: (...args: Array<Uint8Array | ArrayBuffer | number[]>) => Uint8Array,
    //toString: () => string,
    toJSON: () => number[],
    //toJSON: () => {type: 'bytes', value: number[]},
  }
  
  interface Array<T> {
    findAndSplice(verify: (value: T, index?: number, array?: Array<T>) => boolean): T;
  }
  
  interface String {
    toHHMMSS(leadZero?: boolean): string;
  }

  interface Promise<T> {
    finally: (onfinally?: () => void) => Promise<T>;
    safeFinally: (onfinally?: () => void) => Promise<T>;
  }
}
