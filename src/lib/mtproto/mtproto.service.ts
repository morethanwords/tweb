/// #if MTPROTO_SW
import './mtproto.worker';
/// #endif
import { isSafari } from '../../helpers/userAgent';
import { logger, LogLevels } from '../logger';
import type { DownloadOptions } from './apiFileManager';
import type { WorkerTaskTemplate } from '../../types';
import { notifySomeone } from '../../helpers/context';
import type { InputFileLocation, FileLocation, UploadFile } from '../../layer';
import { CancellablePromise, deferredPromise } from '../../helpers/cancellablePromise';

const log = logger('SW', LogLevels.error | LogLevels.debug | LogLevels.log | LogLevels.warn);
const ctx = self as any as ServiceWorkerGlobalScope;

const deferredPromises: {[taskId: number]: CancellablePromise<any>} = {};

/// #if !MTPROTO_SW
ctx.addEventListener('message', (e) => {
  const task = e.data as ServiceWorkerTaskResponse;
  const promise = deferredPromises[task.id];

  if(task.error) {
    promise.reject(task.error);
  } else {
    promise.resolve(task.payload);
  }

  delete deferredPromises[task.id];
});
/// #endif

let taskId = 0;

export interface ServiceWorkerTask extends WorkerTaskTemplate {
  type: 'requestFilePart',
  payload: [number, InputFileLocation | FileLocation, number, number]
};

export interface ServiceWorkerTaskResponse extends WorkerTaskTemplate {
  type: 'requestFilePart',
  payload?: UploadFile.uploadFile,
  originalPayload?: ServiceWorkerTask['payload']
};

const onFetch = (event: FetchEvent): void => {
  try {
    const [, url, scope, params] = /http[:s]+\/\/.*?(\/(.*?)(?:$|\/(.*)$))/.exec(event.request.url) || [];

    log.debug('[fetch]:', event);
  
    switch(scope) {
      case 'stream': {
        const range = parseRange(event.request.headers.get('Range'));
        let [offset, end] = range;
  
        const info: DownloadOptions = JSON.parse(decodeURIComponent(params));
        //const fileName = getFileNameByLocation(info.location);

        // ! если грузить очень большое видео чанками по 512Кб в мобильном Safari, то стрим не запустится
        const limitPart = info.size > (75 * 1024 * 1024) ? STREAM_CHUNK_UPPER_LIMIT : STREAM_CHUNK_MIDDLE_LIMIT;

        /* if(info.size > limitPart && isSafari && offset === limitPart) {
          //end = info.size - 1;
          //offset = info.size - 1 - limitPart;
          offset = info.size - (info.size % limitPart);
        } */
  
        log.debug('[stream]', url, offset, end);
  
        event.respondWith(Promise.race([
          timeout(45 * 1000),

          new Promise<Response>((resolve, reject) => {
            // safari workaround
            const possibleResponse = responseForSafariFirstRange(range, info.mimeType, info.size);
            if(possibleResponse) {
              return resolve(possibleResponse);
            }
  
            const limit = end && end < limitPart ? alignLimit(end - offset + 1) : limitPart;
            const alignedOffset = alignOffset(offset, limit);
  
            log.debug('[stream] requestFilePart:', /* info.dcId, info.location, */ alignedOffset, limit);

            const task: ServiceWorkerTask = {
              type: 'requestFilePart',
              id: taskId++,
              payload: [info.dcId, info.location, alignedOffset, limit]
            };

            
            const deferred = deferredPromises[task.id] = deferredPromise<UploadFile.uploadFile>();
            deferred.then(result => {
              let ab = result.bytes as Uint8Array;
              
              log.debug('[stream] requestFilePart result:', result);
  
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

              // simulate slow connection
              //setTimeout(() => {
                resolve(new Response(ab, {
                  status: 206,
                  statusText: 'Partial Content',
                  headers,
                }));
              //}, 2.5e3);
            }).catch(err => {});

            notifySomeone(task);
          })
        ]));
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

  /* initCache();

  event.waitUntil(
    initNetwork(),
  ); */
  event.waitUntil(ctx.skipWaiting()); // Activate worker immediately
});

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

function responseForSafariFirstRange(range: [number, number], mimeType: string, size: number): Response {
  if(range[0] === 0 && range[1] === 1) {
    return new Response(new Uint8Array(2).buffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes 0-1/${size || '*'}`,
        'Content-Length': '2',
        'Content-Type': mimeType || 'video/mp4',
      },
    });
  }

  return null;
}

ctx.onerror = (error) => {
  log.error('error:', error);
};

ctx.onunhandledrejection = (error) => {
  log.error('onunhandledrejection:', error);
};

ctx.onoffline = ctx.ononline = onChangeState;

onChangeState();

/* const STREAM_CHUNK_UPPER_LIMIT = 256 * 1024;
const SMALLEST_CHUNK_LIMIT = 256 * 4; */
/* const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 1024 * 4; */
const STREAM_CHUNK_MIDDLE_LIMIT = 512 * 1024;
const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 512 * 4;

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

//export default () => {};

//MOUNT_CLASS_TO && (MOUNT_CLASS_TO.onFetch = onFetch);
