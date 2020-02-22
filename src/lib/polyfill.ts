import { bytesToHex, bytesFromHex, dT, bufferConcats } from "./bin_utils";
import { MTProto } from "./mtproto/mtproto";

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
  MTProto.secureRandom.nextBytes(this);
  return this;
};

Uint8Array.prototype.concat = function(...args: Array<Uint8Array | ArrayBuffer | number[]>) {
  return bufferConcats(this, ...args);
};

Array.prototype.forEachReverse = function<T>(callback: (value: T, index?: number, array?: Array<T>) => void) {
  let length = this.length;
  for(var i = length - 1; i >= 0; --i) {
    callback(this[i], i, this);
  }
};

declare global {
  interface Uint8Array {
    hex: string;
    randomize: () => Uint8Array,
    concat: (...args: Array<Uint8Array | ArrayBuffer | number[]>) => Uint8Array
  }

  interface Array<T> {
    forEachReverse(callback: (value: T, index?: number, array?: Array<T>) => void): void;
  }
}
