/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export interface CancellablePromise<T> extends Promise<T> {
  resolve?: (value: T) => void,
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

  // @ts-ignore
  /* deferred.then = (resolve: (value: T) => any, reject: (...args: any[]) => any) => {
    const n = deferredPromise<ReturnType<typeof resolve>>();
    
  }; */

  deferred.finally(() => {
    deferred.notify = null;
    deferred.listeners.length = 0;
    deferred.lastNotify = null;

    if(deferred.cancel) {
      deferred.cancel = () => {};
    }
  });

  Object.assign(deferred, deferredHelper);

  return deferred;
}