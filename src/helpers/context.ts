export const isWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
export const isServiceWorker = typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope;
export const isWorker = isWebWorker || isServiceWorker;

// в SW может быть сразу две переменных TRUE, поэтому проверяю по последней

const notifyServiceWorker = (...args: any[]) => {
  (self as any as ServiceWorkerGlobalScope)
  .clients
  .matchAll({ includeUncontrolled: false, type: 'window' })
  .then((listeners) => {
    if(!listeners.length) {
      //console.trace('no listeners?', self, listeners);
      return;
    }

    // @ts-ignore
    listeners[0].postMessage(...args);
  });
};

const notifyWorker = (...args: any[]) => {
  // @ts-ignore
  (self as any as DedicatedWorkerGlobalScope).postMessage(...args);
};

const empty = () => {};

export const notifySomeone = isServiceWorker ? notifyServiceWorker : (isWebWorker ? notifyWorker : empty);