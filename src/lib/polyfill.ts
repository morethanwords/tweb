import { bytesToHex, bytesFromHex, bufferConcats } from "./bin_utils";
// @ts-ignore
import {SecureRandom} from 'jsbn';

export const secureRandom = new SecureRandom();

export interface CancellablePromise<T> extends Promise<T> {
  resolve?: (...args: any[]) => void,
  reject?: (...args: any[]) => void,
  cancel?: () => void,

  notify?: (...args: any[]) => void,
  notifyAll?: (...args: any[]) => void,
  lastNotify?: any,
  listeners?: Array<(...args: any[]) => void>,
  addNotifyListener?: (callback: (...args: any[]) => void) => void,

  isFulfilled?: boolean,
  isRejected?: boolean
}

export function deferredPromise<T>() {
  let deferredHelper: any = {
    isFulfilled: false, 
    isRejected: false,

    notify: () => {}, 
    notifyAll: (...args: any[]) => {
      deferredHelper.lastNotify = args;
      deferredHelper.listeners.forEach((callback: any) => callback(...args));
    }, 

    lastNotify: undefined,
    listeners: [],
    addNotifyListener: (callback: (...args: any[]) => void) => {
      if(deferredHelper.lastNotify) {
        callback(...deferredHelper.lastNotify);
      }

      deferredHelper.listeners.push(callback);
    }
  };

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

  deferred.finally(() => {
    deferred.notify = null;
    deferred.listeners.length = 0;
    deferred.lastNotify = null;
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
  const sec_num = parseInt(this + '', 10);
  const hours = Math.floor(sec_num / 3600);
  let minutes: any = Math.floor((sec_num - (hours * 3600)) / 60);
  let seconds: any = sec_num - (hours * 3600) - (minutes * 60);
  
  if(hours) leadZero = true;
  if(minutes < 10) minutes = leadZero ? "0" + minutes : minutes;
  if(seconds < 10) seconds = "0" + seconds;
  return (hours ? /* ('0' + hours).slice(-2) */hours + ':' : '') + minutes + ':' + seconds;
};

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
