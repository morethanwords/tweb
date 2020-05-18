import { bytesToHex, bytesFromHex, dT, bufferConcats } from "./bin_utils";
// @ts-ignore
import {SecureRandom} from 'jsbn';

export const secureRandom = new SecureRandom();

export function logger(prefix: string) {
  function Log(...args: any[]) {
    return console.log(dT(), '[' + prefix + ']:', ...args);
  }
  
  Log.warn = function(...args: any[]) {
    return console.warn(dT(), '[' + prefix + ']:', ...args);
  };
  
  Log.info = function(...args: any[]) {
    return console.info(dT(), '[' + prefix + ']:', ...args);
  };
  
  Log.error = function(...args: any[]) {
    return console.error(dT(), '[' + prefix + ']:', ...args);
  };
  
  Log.trace = function(...args: any[]) {
    return console.trace(dT(), '[' + prefix + ']:', ...args);
  }
  
  return Log;
};

export interface CancellablePromise<T> extends Promise<T> {
  resolve?: (...args: any[]) => void,
  reject?: (...args: any[]) => void,
  cancel?: () => void,
  notify?: (...args: any[]) => void,
  isFulfilled?: boolean,
  isRejected?: boolean
}

export function deferredPromise<T>() {
  let deferredHelper: any = {notify: () => {}, isFulfilled: false, isRejected: false};
  let deferred: CancellablePromise<T> = new Promise<T>((resolve, reject) => {
    deferredHelper.resolve = (value: T) => {
      if(deferred.isFulfilled) return;

      deferred.isFulfilled = true;
      resolve(value);
    };
    
    deferredHelper.reject = (...args: any[]) => {
      if(deferred.isRejected) return;
      
      deferred.isRejected = true;
      reject(...args);
    };
  });
  Object.assign(deferred, deferredHelper);

  return deferred;
}

Object.defineProperty(Uint8Array.prototype, 'hex', {
  get: function(): string {
    return bytesToHex([...this]);
  },
  
  set: function(str: string) {
    this.set(bytesFromHex(str));
  },
  enumerable: true,
  configurable: true
});

Uint8Array.prototype.randomize = function() {
  secureRandom.nextBytes(this);
  return this;
};

Uint8Array.prototype.concat = function(...args: Array<Uint8Array | ArrayBuffer | number[]>) {
  return bufferConcats(this, ...args);
};

Uint8Array.prototype.toString = function() {
  return String.fromCharCode.apply(null, [...this]);
};

Uint8Array.prototype.toJSON = function() {
  return [...this];
};

Array.prototype.forEachReverse = function<T>(callback: (value: T, index?: number, array?: Array<T>) => void) {
  let length = this.length;
  for(var i = length - 1; i >= 0; --i) {
    callback(this[i], i, this);
  }
};

Array.prototype.findAndSplice = function<T>(verify: (value: T, index?: number, array?: Array<T>) => boolean) {
  let index = this.findIndex(verify);
  return index !== -1 ? this.splice(index, 1)[0] : undefined;
};

String.prototype.toHHMMSS = function(leadZero = false) {
  let sec_num = parseInt(this + '', 10);
  let hours: any = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - (hours * 3600)) / 60);
  let seconds: any = sec_num - (hours * 3600) - (minutes * 60);
  
  if(hours   < 10) hours   = "0" + hours;
  if(minutes < 10) minutes = leadZero ? "0" + minutes : minutes;
  if(seconds < 10) seconds = "0" + seconds;
  return minutes + ':' + seconds;
}

declare global {
  interface Uint8Array {
    hex: string;
    randomize: () => Uint8Array,
    concat: (...args: Array<Uint8Array | ArrayBuffer | number[]>) => Uint8Array,
    toString: () => string,
    toJSON: () => number[],
  }
  
  interface Array<T> {
    forEachReverse(callback: (value: T, index?: number, array?: Array<T>) => void): void;
    findAndSplice(verify: (value: T, index?: number, array?: Array<T>) => boolean): T;
  }
  
  interface String {
    toHHMMSS(leadZero?: boolean): string;
  }
}
