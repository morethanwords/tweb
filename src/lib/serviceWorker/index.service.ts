import {logger, LogTypes} from '@lib/logger';
import {CACHE_ASSETS_NAME, requestCache} from '@lib/serviceWorker/cache';
import onStreamFetch, {toggleStreamInUse} from '@lib/serviceWorker/stream';
import {closeAllNotifications, fillPushObject, onPing, onShownNotification, resetPushAccounts} from '@lib/serviceWorker/push';
import CacheStorageController from '@lib/files/cacheStorage';
import {IS_SAFARI} from '@environment/userAgent';
import ServiceMessagePort from '@lib/serviceWorker/serviceMessagePort';
import {clearLogBuffer, getLogEntries, setLogBufferEnabled} from '@lib/debug/logsBuffer';
import listenMessagePort from '@helpers/listenMessagePort';
import {deleteClientAccount, setClientAccount} from '@lib/serviceWorker/clientAccounts';
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

const onWindowConnected = (source: WindowClient, from: string) => {
  const _log = log.bindPrefix('windowConnected');
  _log('new', source.id, 'from', from, 'before', connectedWindows.size);

  if(source.frameType === 'none') {
    log.warn('maybe a bugged Safari starting window', source.id);
    return;
  }

  if(connectedWindows.has(source.id)) {
    _log('already connected', source.id);
    return;
  }

  _log('before', Array.from(connectedWindows));
  serviceMessagePort.invokeVoid('hello', undefined, source);
  sendMessagePortIfNeeded(source);
  connectedWindows.set(source.id, source);
  _log('after', Array.from(connectedWindows));

  checkWindowClientForDeferredShare(source);
};

export const serviceMessagePort = new ServiceMessagePort<false>();

serviceMessagePort.addMultipleEventsListeners({
  environment: (environment) => {
    setEnvironment(environment);
  },

  getLogs: () => getLogEntries(),

  setLogBufferEnabled: (enabled) => setLogBufferEnabled(enabled),

  clearLogs: () => clearLogBuffer(),

  notificationsClear: closeAllNotifications,

  toggleStorages: ({enabled, clearWrite}) => {
    CacheStorageController.toggleStorage(enabled, clearWrite);
  },

  pushPing: (payload, source) => {
    onPing(payload, source);
  },

  hello: (payload, source) => {
    onWindowConnected(source as any as WindowClient, 'hello');
  },

  shownNotification: onShownNotification,
  leaveRtmpCall: onRtmpLeftCall,

  toggleStreamInUse,

  tabAccount: (accountNumber, source) => {
    setClientAccount((source as any as WindowClient).id, accountNumber);
  },

  toggleCacheStorage: (enabled) => {
    CacheStorageController.temporarilyToggle(enabled);
  },

  resetEncryptableCacheStorages: () => {
    CacheStorageController.resetOpenEncryptableCacheStorages();
  },

  toggleUsingPasscode: (payload) => {
    DeferredIsUsingPasscode.resolveDeferred(payload.isUsingPasscode);

    // Make sure the promise is not resloved to null in case the encryption key is not provided and we have a passcode set
    if(payload.type === 'full') {
      EncryptionKeyStore.save(payload.encryptionKey);
    }
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

const helloAwaiting: Set<string> = new Set();
let checkingWindows: Promise<void>;

// * service worker can be killed, so won't get 'hello' event
// * a window is connected once it answers: only the app's tabs do, never a window with no app in it (the
// * Document PiP window the app moves into), which would take the MTProto port with nobody to read it
async function helloWindows(from: string) {
  const windowClients = await getWindowClients();
  const length = windowClients.length;
  log(`got ${length} windows from`, from);
  windowClients.forEach((windowClient) => {
    if(windowClient.frameType === 'none') {
      log.warn('skipping bugged Safari starting window', windowClient.id);
      return;
    }

    if(helloAwaiting.has(windowClient.id)) {
      return;
    }

    log('checking window', windowClient.id);
    helloAwaiting.add(windowClient.id);
    // * a busy or frozen tab answers long after it is asked, and is no less alive for it:
    // * dropping a late answer left the worker with no MTProto port
    serviceMessagePort.invoke('hello', undefined, undefined, windowClient).then(() => {
      onWindowConnected(windowClient, from);
    }, (err) => {
      log.error('failed to send hello to window', windowClient.id, err);
    }).finally(() => {
      helloAwaiting.delete(windowClient.id);
    });
  });
}

const checkWindows = (from: string) => checkingWindows ??= helloWindows(from).finally(() => {
  checkingWindows = undefined;
});
checkWindows('startup check');

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
  deleteClientAccount(source.id);
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
  // Web manifests must reach the network so installed PWA metadata can update.
  if(
    import.meta.env.PROD &&
    !IS_SAFARI &&
    event.request.url.indexOf(location.origin + '/') === 0 &&
    event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|mesh)(?:\?.*)?$/)
  ) {
    return event.respondWith(requestCache(event));
  }

  if(import.meta.env.DEV && event.request.url.match(/\.([jt]sx?|s?css)?($|\?)/)) {
    return;
  }

  // * a tab the worker does not count as connected - its startup answer was lost, or it was taken for gone -
  // * still asks for files, and with no MTProto port they hang until the worker restarts. The request may come
  // * from the PiP window rather than the tab its app runs in, so every window is asked again
  if(!_mtprotoMessagePort) {
    checkWindows('fetch');
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
