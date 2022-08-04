/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// #if MTPROTO_SW
import '../mtproto/mtproto.worker';
// #endif

import { logger, LogTypes } from '../logger';
import { CACHE_ASSETS_NAME, requestCache } from './cache';
import onStreamFetch from './stream';
import { closeAllNotifications, onPing } from './push';
import CacheStorageController from '../files/cacheStorage';
import { IS_SAFARI } from '../../environment/userAgent';
import ServiceMessagePort, { ServiceDownloadTaskPayload } from './serviceMessagePort';
import listenMessagePort from '../../helpers/listenMessagePort';
import { getWindowClients } from '../../helpers/context';
import { MessageSendPort } from '../mtproto/superMessagePort';
import noop from '../../helpers/noop';
import makeError from '../../helpers/makeError';

export const log = logger('SW', LogTypes.Error | LogTypes.Debug | LogTypes.Log | LogTypes.Warn);
const ctx = self as any as ServiceWorkerGlobalScope;

// #if !MTPROTO_SW
let _mtprotoMessagePort: MessagePort;
export const getMtprotoMessagePort = () => _mtprotoMessagePort;

const sendMessagePort = (source: MessageSendPort) => {
  const channel = new MessageChannel();
  serviceMessagePort.attachPort(_mtprotoMessagePort = channel.port1);
  serviceMessagePort.invokeVoid('port', undefined, source, [channel.port2]);
};

const sendMessagePortIfNeeded = (source: MessageSendPort) => {
  if(!connectedWindows.size && !_mtprotoMessagePort) {
    sendMessagePort(source);
  }
};

const onWindowConnected = (source: WindowClient) => {
  log('window connected', source.id);
  
  if(source.frameType === 'none') {
    log.warn('maybe a bugged Safari starting window', source.id);
    return;
  }

  sendMessagePortIfNeeded(source);
  connectedWindows.add(source.id);
};

type DownloadType = Uint8Array;
type DownloadItem = ServiceDownloadTaskPayload & {
  transformStream: TransformStream<DownloadType, DownloadType>,
  readableStream: ReadableStream<DownloadType>,
  writableStream: WritableStream<DownloadType>,
  writer: WritableStreamDefaultWriter<DownloadType>,
  // controller: TransformStreamDefaultController<DownloadType>,
  // promise: CancellablePromise<void>,
  used?: boolean
};
const downloadMap: Map<string, DownloadItem> = new Map();
const DOWNLOAD_ERROR = makeError('UNKNOWN');

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
  
  download: (payload) => {
    const {id} = payload;
    if(downloadMap.has(id)) {
      return;
    }

    // const writableStrategy = new ByteLengthQueuingStrategy({highWaterMark: 1024 * 1024});
    // let controller: TransformStreamDefaultController<DownloadType>;
    const transformStream = new TransformStream<DownloadType, DownloadType>(/* {
      start: (_controller) => controller = _controller,
    }, {
      highWaterMark: 1, 
      size: (chunk) => chunk.byteLength
    }, new CountQueuingStrategy({highWaterMark: 4}) */);
    
    const {readable, writable} = transformStream;
    const writer = writable.getWriter();
    // const promise = deferredPromise<void>();
    // promise.catch(noop).finally(() => {
    //   downloadMap.delete(id);
    // });

    // writer.closed.then(promise.resolve, promise.reject);

    writer.closed.catch(noop).finally(() => {
      log.error('closed writer');
      downloadMap.delete(id);
    });
    
    const item: DownloadItem = {
      ...payload, 
      transformStream,
      readableStream: readable,
      writableStream: writable,
      writer,
      // promise,
      // controller
    };

    downloadMap.set(id, item);

    return writer.closed.catch(() => {throw DOWNLOAD_ERROR;});
    // return promise;
  },

  downloadChunk: ({id, chunk}) => {
    const item = downloadMap.get(id);
    if(!item) {
      return Promise.reject();
    }

    // return item.controller.enqueue(chunk);
    return item.writer.write(chunk);
  },

  downloadFinalize: (id) => {
    const item = downloadMap.get(id);
    if(!item) {
      return Promise.reject();
    }

    // item.promise.resolve();
    // return item.controller.terminate();
    return item.writer.close();
  },

  downloadCancel: (id) => {
    const item = downloadMap.get(id);
    if(!item) {
      return;
    }

    // item.promise.reject();
    // return item.controller.error();
    return item.writer.abort();
  }
});

// * service worker can be killed, so won't get 'hello' event
getWindowClients().then((windowClients) => {
  log(`got ${windowClients.length} windows from the start`);
  windowClients.forEach((windowClient) => {
    onWindowConnected(windowClient);
  });
});

let connectedWindows: Set<string> = new Set();
listenMessagePort(serviceMessagePort, undefined, (source) => {
  const isWindowClient = source instanceof WindowClient;
  if(!isWindowClient || !connectedWindows.has(source.id)) {
    return;
  }

  log('window disconnected');
  connectedWindows.delete(source.id);
  if(!connectedWindows.size) {
    log.warn('no windows left');

    if(_mtprotoMessagePort) {
      serviceMessagePort.detachPort(_mtprotoMessagePort);
      _mtprotoMessagePort = undefined;
    }

    if(downloadMap.size) {
      for(const [id, item] of downloadMap) {
        item.writer.abort().catch(noop);
      }
    }
  }
});
// #endif

const onFetch = (event: FetchEvent): void => {
  // #if !DEBUG
  if(
    !IS_SAFARI && 
    event.request.url.indexOf(location.origin + '/') === 0 && 
    event.request.url.match(/\.(js|css|jpe?g|json|wasm|png|mp3|svg|tgs|ico|woff2?|ttf|webmanifest?)(?:\?.*)?$/)
  ) {
    return event.respondWith(requestCache(event));
  }
  // #endif

  try {
    const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];

    // log.debug('[fetch]:', event);
  
    switch(scope) {
      case 'stream': {
        onStreamFetch(event, params);
        break;
      }

      case 'download': {
        const item = downloadMap.get(params);
        if(!item || item.used) {
          break;
        }

        item.used = true;
        const response = new Response(item.transformStream.readable, {headers: item.headers});
        event.respondWith(response);
        break;
      }
    }
  } catch(err) {
    log.error('fetch error', err);
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

// ctx.onerror = (error) => {
//   log.error('error:', error);
// };

// ctx.onunhandledrejection = (error) => {
//   log.error('onunhandledrejection:', error);
// };

ctx.onoffline = ctx.ononline = onChangeState;

onChangeState();
