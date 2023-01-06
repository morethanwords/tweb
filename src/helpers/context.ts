/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// в SW может быть сразу две переменных TRUE
export const IS_SERVICE_WORKER = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
export const IS_WEB_WORKER = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope && !IS_SERVICE_WORKER;
export const IS_WORKER = IS_WEB_WORKER || IS_SERVICE_WORKER;

export const getWindowClients = () => {
  return (self as any as ServiceWorkerGlobalScope)
  .clients
  .matchAll({includeUncontrolled: false, type: 'window'});
};

export const getLastWindowClient = () => getWindowClients().then((windowClients) => windowClients.slice(-1)[0]);

const postMessage = (listener: WindowClient | DedicatedWorkerGlobalScope, ...args: any[]) => {
  try {
    // @ts-ignore
    listener.postMessage(...args);
  } catch(err) {
    console.error('[worker] postMessage error:', err, args);
  }
};

const notifyServiceWorker = (all: boolean, ...args: any[]) => {
  getWindowClients().then((listeners) => {
    if(!listeners.length) {
      // console.trace('no listeners?', self, listeners);
      return;
    }

    listeners.slice(all ? 0 : -1).forEach((listener) => {
      postMessage(listener, ...args);
    });
  });
};

const notifyWorker = (...args: any[]) => {
  postMessage(self as any as DedicatedWorkerGlobalScope, ...args);
};

const noop = () => {};

export const notifySomeone = IS_SERVICE_WORKER ? notifyServiceWorker.bind(null, false) : (IS_WEB_WORKER ? notifyWorker : noop);
export const notifyAll = IS_SERVICE_WORKER ? notifyServiceWorker.bind(null, true) : (IS_WEB_WORKER ? notifyWorker : noop);
