// just to include
import {secureRandom} from '../polyfill';
secureRandom;

import apiManager from "./apiManager";
import AppStorage from '../storage';
import cryptoWorker from "../crypto/cryptoworker";
import networkerFactory from "./networkerFactory";
import apiFileManager, { DownloadOptions } from './apiFileManager';
import { getFileNameByLocation } from '../bin_utils';
import { logger, LogLevels } from '../logger';
import { isSafari } from '../../helpers/userAgent';

const log = logger('SW'/* , LogLevels.error */);

const ctx = self as any as ServiceWorkerGlobalScope;

//console.error('INCLUDE !!!', new Error().stack);

function isObject(object: any) {
  return typeof(object) === 'object' && object !== null;
}

/* function fillTransfer(transfer: any, obj: any) {
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
} */

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

/**
 * Broadcast Notification
 */
function notify(...args: any[]) {
  ctx.clients.matchAll({includeUncontrolled: false, type: 'window'}).then((listeners) => {
    if(!listeners.length) {
      //console.trace('no listeners?', self, listeners);
      return;
    }

    listeners.forEach(listener => {
      // @ts-ignore
      listener.postMessage(...args);
    });
  });
}

networkerFactory.setUpdatesProcessor((obj, bool) => {
  notify({update: {obj, bool}});
});

ctx.addEventListener('message', async(e) => {
  const taskID = e.data.taskID;

  log.debug('got message:', taskID, e, e.data);

  if(e.data.useLs) {
    AppStorage.finishTask(e.data.taskID, e.data.args);
    return;
  } else if(e.data.type == 'convertWebp') {
    const {fileName, bytes} = e.data.payload;
    const deferred = apiFileManager.webpConvertPromises[fileName];
    if(deferred) {
      deferred.resolve(bytes);
      delete apiFileManager.webpConvertPromises[fileName];
    }
  }

  switch(e.data.task) {
    case 'computeSRP':
    case 'gzipUncompress':
      // @ts-ignore
      return cryptoWorker[e.data.task].apply(cryptoWorker, e.data.args).then(result => {
        respond(e.source, {taskID: taskID, result: result});
      });

    case 'cancelDownload':
    case 'downloadFile': {
      /* // @ts-ignore
      return apiFileManager.downloadFile(...e.data.args); */

      try {
        // @ts-ignore
        let result = apiFileManager[e.data.task].apply(apiFileManager, e.data.args);

        if(result instanceof Promise) {
          result = await result;
        }

        respond(e.source, {taskID: taskID, result: result});
      } catch(err) {
        respond(e.source, {taskID: taskID, error: err});
      }
    }

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
  log('installing');

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
  log('activating', ctx);

  /* if (!ctx.cache) initCache();
  if (!ctx.network) initNetwork(); */

  event.waitUntil(ctx.clients.claim());
});

function timeout(delay: number): Promise<Response> {
  return new Promise(((resolve) => {
    setTimeout(() => {
      resolve(new Response('', {
        status: 408,
        statusText: 'Request timed out.',
      }));
    }, delay);
  }));
}

ctx.addEventListener('error', (error) => {
  log.error('error:', error);
});

/**
 * Fetch requests
 */
ctx.addEventListener('fetch', (event: FetchEvent): void => {
  const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];

  log.debug('[fetch]:', event);

  switch(scope) {
    case 'download':
    case 'thumb':
    case 'document':
    case 'photo': {
      const info: DownloadOptions = JSON.parse(decodeURIComponent(params));
      const fileName = getFileNameByLocation(info.location);

      /* event.request.signal.addEventListener('abort', (e) => {
        console.log('[SW] user aborted request:', fileName);
        cancellablePromise.cancel();
      });

      event.request.signal.onabort = (e) => {
        console.log('[SW] user aborted request:', fileName);
        cancellablePromise.cancel();
      };

      if(fileName == '5452060085729624717') {
        setInterval(() => {
          console.log('[SW] request status:', fileName, event.request.signal.aborted);
        }, 1000);
      } */

      const cancellablePromise = apiFileManager.downloadFile(info);
      cancellablePromise.notify = (progress: {done: number, total: number, offset: number}) => {
        notify({progress: {fileName, ...progress}});
      };
      
      log.debug('[fetch] file:', /* info, */fileName);

      const promise = cancellablePromise.then(b => new Response(b));
      event.respondWith(Promise.race([
        timeout(45 * 1000), 
        promise
      ]));

      break;
    }

    case 'stream': {
      const [offset, end] = parseRange(event.request.headers.get('Range'));

      const info: DownloadOptions = JSON.parse(decodeURIComponent(params));
      //const fileName = getFileNameByLocation(info.location);

      log.debug('[stream]', url, offset, end);

      event.respondWith(new Promise((resolve, reject) => {
        // safari workaround
        if(offset === 0 && end === 1) {
          resolve(new Response(new Uint8Array(2).buffer, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Range': `bytes 0-1/${info.size || '*'}`,
              'Content-Length': '2',
              'Content-Type': info.mimeType || 'video/mp4',
            },
          }));

          return;
        }

        const limit = end && end < STREAM_CHUNK_UPPER_LIMIT ? alignLimit(end - offset + 1) : STREAM_CHUNK_UPPER_LIMIT;
        const alignedOffset = alignOffset(offset, limit);

        //log.debug('[stream] requestFilePart:', info.dcID, info.location, alignedOffset, limit);

        apiFileManager.requestFilePart(info.dcID, info.location, alignedOffset, limit).then(result => {
          let ab = result.bytes;

          //log.debug('[stream] requestFilePart result:', result);

          const headers: Record<string, string> = {
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${alignedOffset}-${alignedOffset + ab.byteLength - 1}/${info.size || '*'}`,
            'Content-Length': `${ab.byteLength}`,
          };

          if(info.mimeType) headers['Content-Type'] = info.mimeType;

          if(isSafari) {
            ab = ab.slice(offset - alignedOffset, end - alignedOffset + 1);
            headers['Content-Range'] = `bytes ${offset}-${offset + ab.byteLength - 1}/${info.size || '*'}`;
            headers['Content-Length'] = `${ab.byteLength}`;
          }

          resolve(new Response(ab, {
            status: 206,
            statusText: 'Partial Content',
            headers,
          }));
        });
      }));
      break;
    }

    /* case 'download': {
      const info: DownloadOptions = JSON.parse(decodeURIComponent(params));

      const promise = new Promise<Response>((resolve) => {
        const headers: Record<string, string> = {
          'Content-Disposition': `attachment; filename="${info.fileName}"`,
        };

        if(info.size) headers['Content-Length'] = info.size.toString();
        if(info.mimeType) headers['Content-Type'] = info.mimeType;

        log('[download] file:', info);

        const stream = new ReadableStream({
          start(controller: ReadableStreamDefaultController) {
            const limitPart = DOWNLOAD_CHUNK_LIMIT;

            apiFileManager.downloadFile({
              ...info,
              limitPart,
              processPart: (bytes, offset) => {
                log('[download] file processPart:', bytes, offset);

                controller.enqueue(new Uint8Array(bytes));

                const isFinal = offset + limitPart >= info.size;
                if(isFinal) {
                  controller.close();
                }

                return Promise.resolve();
              }
            }).catch(err => {
              log.error('[download] error:', err);
              controller.error(err);
            });
          },

          cancel() {
            log.error('[download] file canceled:', info);
          }
        });

        resolve(new Response(stream, {headers}));
      });

      event.respondWith(promise);

      break;
    } */

    case 'upload': {
      if(event.request.method == 'POST') {
        event.respondWith(event.request.blob().then(blob => {
          return apiFileManager.uploadFile(blob).then(v => new Response(JSON.stringify(v), {headers: {'Content-Type': 'application/json'}}));
        }));
      }

      break;
    }

    /* default: {
      
      break;
    }
    case 'documents':
    case 'photos':
    case 'profiles':
      // direct download
      if (event.request.method === 'POST') {
        event.respondWith(// download(url, 'unknown file.txt', getFilePartRequest));
          event.request.text()
            .then((text) => {
              const [, filename] = text.split('=');
              return download(url, filename ? filename.toString() : 'unknown file', getFilePartRequest);
            }),
        );

      // inline
      } else {
        event.respondWith(
          ctx.cache.match(url).then((cached) => {
            if (cached) return cached;

            return Promise.race([
              timeout(45 * 1000), // safari fix
              new Promise<Response>((resolve) => {
                fetchRequest(url, resolve, getFilePartRequest, ctx.cache, fileProgress);
              }),
            ]);
          }),
        );
      }
      break;

    case 'stream': {
      const [offset, end] = parseRange(event.request.headers.get('Range') || '');

      log('stream', url, offset, end);

      event.respondWith(new Promise((resolve) => {
        fetchStreamRequest(url, offset, end, resolve, getFilePartRequest);
      }));
      break;
    }

    case 'stripped':
    case 'cached': {
      const bytes = getThumb(url) || null;
      event.respondWith(new Response(bytes, { headers: { 'Content-Type': 'image/jpg' } }));
      break;
    }

    default:
      if (url && url.endsWith('.tgs')) event.respondWith(fetchTGS(url));
      else event.respondWith(fetch(event.request.url)); */
  }
});

const DOWNLOAD_CHUNK_LIMIT = 512 * 1024;
const STREAM_CHUNK_UPPER_LIMIT = 256 * 1024;
const SMALLEST_CHUNK_LIMIT = 256 * 4;

function parseRange(header: string): [number, number] {
  if(!header) return [0, 0];
  const [, chunks] = header.split('=');
  const ranges = chunks.split(', ');
  const [offset, end] = ranges[0].split('-');

  return [+offset, +end || 0];
}

function alignOffset(offset: number, base = SMALLEST_CHUNK_LIMIT) {
  return offset - (offset % base);
}

function alignLimit(limit: number) {
  return 2 ** Math.ceil(Math.log(limit) / Math.log(2));
}
