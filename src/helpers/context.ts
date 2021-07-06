/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export const isWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
export const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
export const isWorker = isWebWorker || isServiceWorker;

// в SW может быть сразу две переменных TRUE, поэтому проверяю по последней

export const getWindowClients = () => {
  return (self as any as ServiceWorkerGlobalScope)
  .clients
  .matchAll({ includeUncontrolled: false, type: 'window' });
};

const notifyServiceWorker = (all: boolean, ...args: any[]) => {
  (self as any as ServiceWorkerGlobalScope)
  .clients
  .matchAll({ includeUncontrolled: false, type: 'window' })
  .then((listeners) => {
    if(!listeners.length) {
      //console.trace('no listeners?', self, listeners);
      return;
    }

    listeners.slice(all ? 0 : -1).forEach(listener => {
      // @ts-ignore
      listener.postMessage(...args);
    });
  });
};

const notifyWorker = (...args: any[]) => {
  // @ts-ignore
  (self as any as DedicatedWorkerGlobalScope).postMessage(...args);
};

const noop = () => {};

export const notifySomeone = isServiceWorker ? notifyServiceWorker.bind(null, false) : (isWebWorker ? notifyWorker : noop);
export const notifyAll = isServiceWorker ? notifyServiceWorker.bind(null, true) : (isWebWorker ? notifyWorker : noop);
