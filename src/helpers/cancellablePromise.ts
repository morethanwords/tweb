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
  isRejected?: boolean
}

export default function deferredPromise<T>() {
  const deferredHelper: any = {
    isFulfilled: false,
    isRejected: false,

    notify: () => {},
    notifyAll: (...args: any[]) => {
      deferredHelper.lastNotify = args;
      deferredHelper.listeners.forEach((callback: any) => callback(...args));
    },

    listeners: [],
    addNotifyListener: (callback: (...args: any[]) => void) => {
      if(deferredHelper.lastNotify) {
        callback(...deferredHelper.lastNotify);
      }

      deferredHelper.listeners.push(callback);
    }
  };

  const deferred: CancellablePromise<T> = new Promise<T>((resolve, reject) => {
    deferredHelper.resolve = (value: T) => {
      if(deferred.isFulfilled || deferred.isRejected) return;

      deferred.isFulfilled = true;
      resolve(value);
    };

    deferredHelper.reject = (...args: any[]) => {
      if(deferred.isRejected || deferred.isFulfilled) return;

      deferred.isRejected = true;
      reject(...args);
    };
  });

  // @ts-ignore
  /* deferred.then = (resolve: (value: T) => any, reject: (...args: any[]) => any) => {
    const n = deferredPromise<ReturnType<typeof resolve>>();

  }; */

  deferred.catch(noop).finally(() => {
    deferred.notify = deferred.notifyAll = deferred.lastNotify = null;
    deferred.listeners.length = 0;

    if(deferred.cancel) {
      deferred.cancel = noop;
    }
  });

  Object.assign(deferred, deferredHelper);

  return deferred;
}
