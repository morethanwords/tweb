/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import noop from './noop';

export interface CancellablePromise<T> extends Promise<T> {
  resolve?: (value: T) => void,
  reject?: (...args: any[]) => void,
  cancel?: (reason?: any) => void,

  notify?: (...args: any[]) => void,
  notifyAll?: (...args: any[]) => void,
  lastNotify?: any,
  listeners?: Array<(...args: any[]) => void>,
  addNotifyListener?: (callback: (...args: any[]) => void) => void,

  isFulfilled?: boolean,
  isRejected?: boolean,

  onFinish?: () => void,
  _resolve?: (value: T) => void,
  _reject?: (...args: any[]) => void
}

const deferredHelper = {
  isFulfilled: false,
  isRejected: false,

  notify: () => {},
  notifyAll: function(...args: any[]) {
    this.lastNotify = args;
    this.listeners?.forEach((callback: any) => callback(...args));
  },

  addNotifyListener: function(callback: (...args: any[]) => void) {
    if(this.lastNotify) {
      callback(...this.lastNotify);
    }

    (this.listeners ??= []).push(callback);
  },

  resolve: function(value) {
    if(this.isFulfilled || this.isRejected) return;

    this.isFulfilled = true;
    this._resolve(value);
    this.onFinish();
  },

  reject: function(...args) {
    if(this.isRejected || this.isFulfilled) return;

    this.isRejected = true;
    this._reject(...args);
    this.onFinish();
  },

  onFinish: function() {
    this.notify = this.notifyAll = this.lastNotify = null;
    if(this.listeners) this.listeners.length = 0;

    if(this.cancel) {
      this.cancel = noop;
    }
  }
} as CancellablePromise<any>;

export default function deferredPromise<T>() {
  let resolve: (value: T) => void, reject: (...args: any[]) => void;
  const deferred: CancellablePromise<T> = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve, reject = _reject;
  });

  Object.assign(deferred, deferredHelper);
  deferred._resolve = resolve;
  deferred._reject = reject;

  return deferred;
}

export function bindPromiseToDeferred<T>(promise: Promise<T>, deferred: CancellablePromise<T>) {
  promise.then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
}

(self as any).deferredPromise = deferredPromise;
