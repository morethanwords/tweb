/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {logger, LogTypes} from '@lib/logger';
import {CACHE_ASSETS_NAME, requestCache} from '@lib/serviceWorker/cache';
import onStreamFetch, {toggleStreamInUse} from '@lib/serviceWorker/stream';
import {closeAllNotifications, fillPushObject, onPing, onShownNotification, resetPushAccounts} from '@lib/serviceWorker/push';
import CacheStorageController from '@lib/files/cacheStorage';
import {IS_SAFARI} from '@environment/userAgent';
import ServiceMessagePort from '@lib/serviceWorker/serviceMessagePort';
import listenMessagePort from '@helpers/listenMessagePort';
import {getWindowClients} from '@helpers/context';
import {MessageSendPort} from '@lib/superMessagePort';
import handleDownload from '@lib/serviceWorker/download';
import onShareFetch, {checkWindowClientForDeferredShare} from '@lib/serviceWorker/share';
import {onRtmpFetch, onRtmpLeftCall} from '@lib/serviceWorker/rtmp';
import {onHlsQualityFileFetch} from '@lib/hls/onHlsQualityFileFetch';
import {get500ErrorResponse} from '@lib/serviceWorker/errors';
import {onHlsStreamFetch} from '@lib/hls/onHlsStreamFetch';
import {onHlsPlaylistFetch} from '@lib/hls/onHlsPlaylistFetch';
import {setEnvironment} from '@environment/utils';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import {onBackgroundsFetch} from '@lib/serviceWorker/backgrounds';
import {watchMtprotoOnDev} from '@lib/serviceWorker/watchMtprotoOnDev';
import {watchCacheStoragesLifetime} from './clearOldCache';

// #if MTPROTO_SW
// import '../mtproto/mtproto.worker';
// #endif

export const log = logger('SW', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn, true);
const ctx = self as any as ServiceWorkerGlobalScope;

// #if !MTPROTO_SW
let _mtprotoMessagePort: MessagePort;
export const getMtprotoMessagePort = () => _mtprotoMessagePort;

let _cryptoMessagePort: MessagePort;

export const invokeVoidAll: ServiceMessagePort['invokeVoid'] = (...args) => {
  getWindowClients().then((windowClients) => {
    windowClients.forEach((windowClient) => {
      // @ts-ignore
      serviceMessagePort.invokeVoid(...args, windowClient);
    });
  });
};

log('init');

// setTimeout(async() => {
//   const salt = new Uint8Array([1, 2, 3]);
//   const passcode = 'ab';
//   log('hello from sw started encryption');

//   const wrappedPasscode = await crypto.subtle.importKey(
//     'raw', new TextEncoder().encode(passcode), {name: 'PBKDF2'}, false, ['deriveKey']
//   );

//   const key = await crypto.subtle.deriveKey(
//     {name: 'PBKDF2', salt, iterations: 1000, hash: 'SHA-256'},
//     wrappedPasscode, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']
//   );

//   const enc = await cryptoMessagePort.invokeCryptoNew({
//     method: 'aes-local-encrypt',
//     args: [{data: new Uint8Array([1, 2, 3]), key}]
//   });

//   log('hello from sw data:>>', enc);
// }, 1000);

const sendMessagePort = (source: MessageSendPort) => {
  const channel = new MessageChannel();
  serviceMessagePort.attachPort(_mtprotoMessagePort = channel.port1);
  serviceMessagePort.invokeVoid('port', undefined, source, [channel.port2]);

  const channel2 = new MessageChannel();
  cryptoMessagePort.attachPort(_cryptoMessagePort = channel2.port1);
  serviceMessagePort.invokeVoid('serviceCryptoPort', undefined, source, [channel2.port2]);
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
  environment: (environment) => {
    setEnvironment(environment);
  },

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

  shownNotification: onShownNotification,
  leaveRtmpCall: onRtmpLeftCall,

  toggleStreamInUse,

  toggleCacheStorage: (enabled) => {
    CacheStorageController.temporarilyToggle(enabled);
  },

  resetEncryptableCacheStorages: () => {
    CacheStorageController.resetOpenEncryptableCacheStorages();
  },

  toggleUsingPasscode: (payload) => {
    DeferredIsUsingPasscode.resolveDeferred(payload.isUsingPasscode);
    EncryptionKeyStore.save(payload.encryptionKey);
  },

  saveEncryptionKey: (payload) => {
    EncryptionKeyStore.save(payload);
  },

  fillPushObject,

  disableCacheStoragesByNames: (names) => {
    CacheStorageController.temporarilyToggleByNames(names, false);
  },

  enableCacheStoragesByNames: (names) => {
    CacheStorageController.temporarilyToggleByNames(names, true);
  },

  resetOpenCacheStoragesByNames: (names) => {
    CacheStorageController.resetOpenStoragesByNames(names);
  }
});

const {
  onDownloadFetch,
  onClosedWindows: onDownloadClosedWindows
} = handleDownload(serviceMessagePort);

// * service worker can be killed, so won't get 'hello' event
getWindowClients().then((windowClients) => {
  const length = windowClients.length;
  log(`got ${length} windows from the start`);
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

    if(DeferredIsUsingPasscode.isUsingPasscodeUndeferred()) {
      resetPushAccounts();
    }

    EncryptionKeyStore.resetDeferred();
    DeferredIsUsingPasscode.resetDeferred();

    if(_mtprotoMessagePort) {
      serviceMessagePort.detachPort(_mtprotoMessagePort);
      _mtprotoMessagePort = undefined;
    }
    if(_cryptoMessagePort) {
      cryptoMessagePort.detachPort(_cryptoMessagePort);
      _cryptoMessagePort = undefined;
    }

    onDownloadClosedWindows();
  }
});
// #endif

watchCacheStoragesLifetime({
  onStorageError: async({storageName, error}) => {
    log(`Error clearing old cache in ${storageName}:`, error);
    log(`Clearing cache storage ${storageName}`);

    const windowClients = await getWindowClients();
    if(!windowClients.length) return;

    await serviceMessagePort.invoke('clearCacheStoragesByNames', [storageName], undefined, windowClients[0]);
  }
});

watchMtprotoOnDev({connectedWindows, onWindowConnected});

const onFetch = (event: FetchEvent): void => {
  if(
    import.meta.env.PROD &&
    !IS_SAFARI &&
    event.request.url.indexOf(location.origin + '/') === 0 &&
    event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|webmanifest?)(?:\?.*)?$/)
  ) {
    return event.respondWith(requestCache(event));
  }

  if(import.meta.env.DEV && event.request.url.match(/\.([jt]sx?|s?css)?($|\?)/)) {
    return;
  }

  try {
    // const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];
    const [scope, _params] = event.request.url.split('/').slice(-2);
    const [params, search] = _params.split('?');

    // log.debug('[fetch]', event, event.request.url);

    switch(scope) {
      case 'stream': {
        onStreamFetch(event, params, search);
        break;
      }

      case 'd':
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

      case 'rtmp': {
        onRtmpFetch(event, params, search);
        break;
      }

      case 'hls': {
        onHlsPlaylistFetch(event, params, search);
        break;
      }

      case 'hls_quality_file': {
        onHlsQualityFileFetch(event, params, search);
        break;
      }

      case 'hls_stream': {
        onHlsStreamFetch(event, params, search);
        break;
      }

      case 'backgrounds': {
        onBackgroundsFetch(event);
        break;
      }

      // default: {
      //   event.respondWith(fetch(event.request));
      //   break;
      // }
    }
  } catch(err) {
    log.error('fetch error', err);
    event.respondWith(get500ErrorResponse());
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
