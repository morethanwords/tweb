/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/// #if MTPROTO_SW
import '../mtproto/mtproto.worker';
/// #endif

import { logger, LogTypes } from '../logger';
import { CACHE_ASSETS_NAME, requestCache } from './cache';
import onStreamFetch from './stream';
import { closeAllNotifications, onPing } from './push';
import CacheStorageController from '../cacheStorage';
import { IS_SAFARI } from '../../environment/userAgent';
import ServiceMessagePort from './serviceMessagePort';
import listenMessagePort from '../../helpers/listenMessagePort';
import { getWindowClients } from '../../helpers/context';
import { MessageSendPort } from '../mtproto/superMessagePort';

export const log = logger('SW', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);
const ctx = self as any as ServiceWorkerGlobalScope;

/// #if !MTPROTO_SW
let _mtprotoMessagePort: MessagePort;
export const getMtprotoMessagePort = () => _mtprotoMessagePort;

const sendMessagePort = (source: MessageSendPort) => {
  const channel = new MessageChannel();
  serviceMessagePort.attachPort(_mtprotoMessagePort = channel.port1);
  serviceMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
};

const sendMessagePortIfNeeded = (source: MessageSendPort) => {
  if(!connectedWindows && !_mtprotoMessagePort) {
    sendMessagePort(source);
  }
};

const onWindowConnected = (source: MessageSendPort) => {
  sendMessagePortIfNeeded(source);

  ++connectedWindows;
  log('window connected');
};

export const serviceMessagePort = new ServiceMessagePort<false>();
serviceMessagePort.addMultipleEventsListeners({
  notificationsClear: closeAllNotifications,

  toggleStorages: ({enabled, clearWrite}) => {
    CacheStorageController.toggleStorage(enabled, clearWrite);
  },

  pushPing: (payload, source) => {
    onPing(payload, source);
  },

  hello: (payload, source) => {
    onWindowConnected(source);
  }
});

// * service worker can be killed, so won't get 'hello' event
getWindowClients().then((windowClients) => {
  windowClients.forEach((windowClient) => {
    onWindowConnected(windowClient);
  });
});

let connectedWindows = 0;
listenMessagePort(serviceMessagePort, undefined, (source) => {
  if(source === _mtprotoMessagePort) {
    return;
  }

  log('window disconnected');
  connectedWindows = Math.max(0, connectedWindows - 1);
  if(!connectedWindows) {
    log.warn('no windows left');

    if(_mtprotoMessagePort) {
      serviceMessagePort.detachPort(_mtprotoMessagePort);
      _mtprotoMessagePort = undefined;
    }
  }
});
/// #endif

const onFetch = (event: FetchEvent): void => {
  /// #if !DEBUG
  if(
    !IS_SAFARI && 
    event.request.url.indexOf(location.origin + '/') === 0 && 
    event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|webmanifest?)(?:\?.*)?$/)
  ) {
    return event.respondWith(requestCache(event));
  }
  /// #endif

  try {
    const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];

    //log.debug('[fetch]:', event);
  
    switch(scope) {
      case 'stream': {
        onStreamFetch(event, params);
        break;
      }
    }
  } catch(err) {
    event.respondWith(new Response('', {
      status: 500,
      statusText: 'Internal Server Error',
    }));
  }
};

const onChangeState = () => {
  ctx.onfetch = onFetch;
};

ctx.addEventListener('install', (event) => {
  log('installing');
  event.waitUntil(ctx.skipWaiting()); // Activate worker immediately
});

ctx.addEventListener('activate', (event) => {
  log('activating', ctx);
  event.waitUntil(ctx.caches.delete(CACHE_ASSETS_NAME));
  event.waitUntil(ctx.clients.claim());
});

ctx.onerror = (error) => {
  log.error('error:', error);
};

ctx.onunhandledrejection = (error) => {
  log.error('onunhandledrejection:', error);
};

ctx.onoffline = ctx.ononline = onChangeState;

onChangeState();
