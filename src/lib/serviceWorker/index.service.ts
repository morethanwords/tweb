/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {logger, LogTypes} from '../logger';
import {CACHE_ASSETS_NAME, requestCache} from './cache';
import onStreamFetch from './stream';
import {closeAllNotifications, onPing, onShownNotification} from './push';
import CacheStorageController from '../files/cacheStorage';
import {IS_SAFARI} from '../../environment/userAgent';
import ServiceMessagePort from './serviceMessagePort';
import listenMessagePort from '../../helpers/listenMessagePort';
import {getWindowClients} from '../../helpers/context';
import {MessageSendPort} from '../mtproto/superMessagePort';
import handleDownload from './download';
import onShareFetch, {checkWindowClientForDeferredShare} from './share';

// #if MTPROTO_SW
// import '../mtproto/mtproto.worker';
// #endif

export const log = logger('SW', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn, true);
const ctx = self as any as ServiceWorkerGlobalScope;

// #if !MTPROTO_SW
let _mtprotoMessagePort: MessagePort;
export const getMtprotoMessagePort = () => _mtprotoMessagePort;

log('init');

const sendMessagePort = (source: MessageSendPort) => {
  const channel = new MessageChannel();
  serviceMessagePort.attachPort(_mtprotoMessagePort = channel.port1);
  serviceMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
};

const sendMessagePortIfNeeded = (source: MessageSendPort) => {
  if(!connectedWindows.size && !_mtprotoMessagePort) {
    log('sending message port for mtproto');
    sendMessagePort(source);
  }
};

const onWindowConnected = (source: WindowClient) => {
  log('window connected', source.id, 'windows before', connectedWindows.size);

  if(source.frameType === 'none') {
    log.warn('maybe a bugged Safari starting window', source.id);
    return;
  }

  log('windows', Array.from(connectedWindows));
  serviceMessagePort.invokeVoid('hello', undefined, source);
  sendMessagePortIfNeeded(source);
  connectedWindows.set(source.id, source);

  checkWindowClientForDeferredShare(source);
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
    onWindowConnected(source as any as WindowClient);
  },

  shownNotification: onShownNotification
});

const {
  onDownloadFetch,
  onClosedWindows: onDownloadClosedWindows
} = handleDownload(serviceMessagePort);

// * service worker can be killed, so won't get 'hello' event
getWindowClients().then((windowClients) => {
  log(`got ${windowClients.length} windows from the start`);
  windowClients.forEach((windowClient) => {
    onWindowConnected(windowClient);
  });
});

const connectedWindows: Map<string, WindowClient> = new Map();
(self as any).connectedWindows = connectedWindows;
listenMessagePort(serviceMessagePort, undefined, (source) => {
  log('something has disconnected', source);
  const isWindowClient = source instanceof WindowClient;
  if(!isWindowClient || !connectedWindows.has(source.id)) {
    log.warn('it is not a window');
    return;
  }

  connectedWindows.delete(source.id);
  log('window disconnected, left', connectedWindows.size);
  if(!connectedWindows.size) {
    log.warn('no windows left');

    if(_mtprotoMessagePort) {
      serviceMessagePort.detachPort(_mtprotoMessagePort);
      _mtprotoMessagePort = undefined;
    }

    onDownloadClosedWindows();
  }
});
// #endif

const onFetch = (event: FetchEvent): void => {
  if(
    import.meta.env.PROD &&
    !IS_SAFARI &&
    event.request.url.indexOf(location.origin + '/') === 0 &&
    event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|webmanifest?)(?:\?.*)?$/)
  ) {
    return event.respondWith(requestCache(event));
  }

  if(import.meta.env.DEV && event.request.url.endsWith('.ts')) {
    return;
  }

  try {
    // const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];
    const [scope, params] = event.request.url.split('/').slice(-2);

    // log.debug('[fetch]:', event);

    switch(scope) {
      case 'stream': {
        onStreamFetch(event, params);
        break;
      }

      case 'download': {
        onDownloadFetch(event, params);
        break;
      }

      case 'share': {
        onShareFetch(event, params);
        break;
      }

      case 'ping': {
        event.respondWith(new Response('pong'));
        break;
      }

      // default: {
      //   event.respondWith(fetch(event.request));
      //   break;
      // }
    }
  } catch(err) {
    log.error('fetch error', err);
    event.respondWith(new Response('', {
      status: 500,
      statusText: 'Internal Server Error',
      headers: {'Cache-Control': 'no-cache'}
    }));
  }
};

const onChangeState = () => {
  ctx.onfetch = onFetch;
};

ctx.addEventListener('install', (event) => {
  log('installing');
  event.waitUntil(ctx.skipWaiting().then(() => log('skipped waiting'))); // Activate worker immediately
});

ctx.addEventListener('activate', (event) => {
  log('activating', ctx);
  event.waitUntil(ctx.caches.delete(CACHE_ASSETS_NAME).then(() => log('cleared assets cache')));
  event.waitUntil(ctx.clients.claim().then(() => log('claimed clients')));
});

// ctx.onerror = (error) => {
//   log.error('error:', error);
// };

// ctx.onunhandledrejection = (error) => {
//   log.error('onunhandledrejection:', error);
// };

ctx.onoffline = ctx.ononline = onChangeState;

onChangeState();
