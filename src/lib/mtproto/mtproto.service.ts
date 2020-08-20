// just to include
import {secureRandom} from '../polyfill';
secureRandom;

import apiManager from "./apiManager";
import AppStorage from '../storage';
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";

const ctx = self as any as ServiceWorkerGlobalScope;

//console.error('INCLUDE !!!', new Error().stack);

/**
 * Returns true when run in WebKit derived browsers.
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 *
 * @private
 * @param scope {WindowOrWorkerGlobalScope} Since this function is used both on the main thread and WebWorker context,
 *      let the calling scope pass in the global scope object.
 * @returns {boolean}
 */
var _isSafari: boolean = null;
function isSafari(scope: any) {
  if(_isSafari == null) {
    var userAgent = scope.navigator ? scope.navigator.userAgent : null;
    _isSafari = !!scope.safari ||
    !!(userAgent && (/\b(iPad|iPhone|iPod)\b/.test(userAgent) || (!!userAgent.match('Safari') && !userAgent.match('Chrome'))));
  }
  return _isSafari;
}

function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

function fillTransfer(transfer: any, obj: any) {
  if(!obj) return;
  
  if(obj instanceof ArrayBuffer) {
    transfer.add(obj);
  } else if(obj.buffer && obj.buffer instanceof ArrayBuffer) {
    transfer.add(obj.buffer);
  } else if(isObject(obj)) {
    for(var i in obj) {
      fillTransfer(transfer, obj[i]);
    }
  } else if(Array.isArray(obj)) {
    obj.forEach(value => {
      fillTransfer(transfer, value);
    });
  }
}

/**
 * Respond to request
 */
function respond(client: Client | ServiceWorker | MessagePort, ...args: any[]) {
  // отключил для всего потому что не успел пофиксить transfer detached
  //if(isSafari(self)/*  || true */) {
    // @ts-ignore
    client.postMessage(...args);
  /* } else {
    var transfer = new Set();
    fillTransfer(transfer, arguments);
    
    //console.log('reply', transfer, [...transfer]);
    ctx.postMessage(...arguments, [...transfer]);
    //console.log('reply', transfer, [...transfer]);
  } */
}

networkerFactory.setUpdatesProcessor((obj, bool) => {
  //console.log('updatesss');
  //ctx.postMessage({update: {obj, bool}});
  //respond({update: {obj, bool}});

  ctx.clients.matchAll({ includeUncontrolled: false, type: 'window' }).then((listeners) => {
    if(!listeners.length) {
      //console.trace('no listeners?', self, listeners);
      return;
    }

    listeners[0].postMessage({update: {obj, bool}});
  });
});

ctx.addEventListener('message', async(e) => {
  const taskID = e.data.taskID;

  console.log('[SW] Got message:', taskID, e, e.data);

  if(e.data.useLs) {
    AppStorage.finishTask(e.data.taskID, e.data.args);
    return;
  }

  switch(e.data.task) {
    case 'computeSRP':
    case 'gzipUncompress':
      // @ts-ignore
      return cryptoWorker[e.data.task].apply(cryptoWorker, e.data.args).then(result => {
        respond(e.source, {taskID: taskID, result: result});
      });

    default: {
      try {
        // @ts-ignore
        let result = apiManager[e.data.task].apply(apiManager, e.data.args);

        if(result instanceof Promise) {
          result = await result;
        }

        respond(e.source, {taskID: taskID, result: result});
      } catch(err) {
        respond(e.source, {taskID: taskID, error: err});
      }

      //throw new Error('Unknown task: ' + e.data.task);
    }
  }
});

/**
 * Service Worker Installation
 */
ctx.addEventListener('install', (event: ExtendableEvent) => {
  //console.log('service worker is installing');

  /* initCache();

  event.waitUntil(
    initNetwork(),
  ); */
  event.waitUntil(ctx.skipWaiting()); // Activate worker immediately
});

/**
 * Service Worker Activation
 */
ctx.addEventListener('activate', (event) => {
  //console.log('service worker activating', ctx);

  /* if (!ctx.cache) initCache();
  if (!ctx.network) initNetwork(); */

  event.waitUntil(ctx.clients.claim());
});
