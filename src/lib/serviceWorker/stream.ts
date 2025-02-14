/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import readBlobAsUint8Array from '../../helpers/blob/readBlobAsUint8Array';
import bufferConcats from '../../helpers/bytes/bufferConcats';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import tryPatchMp4 from '../../helpers/fixChromiumMp4';
import debounce, {DebounceReturnType} from '../../helpers/schedulers/debounce';
import pause from '../../helpers/schedulers/pause';
import {InputFileLocation} from '../../layer';
import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import {ActiveAccountNumber} from '../accounts/types';
import CacheStorageController from '../files/cacheStorage';
import {DownloadOptions, MyUploadFile} from '../mtproto/apiFileManager';
import {getMtprotoMessagePort, log, serviceMessagePort} from './index.service';
import {ServiceRequestFilePartTaskPayload} from './serviceMessagePort';
import timeout from './timeout';

const ctx = self as any as ServiceWorkerGlobalScope;

const deferredPromises: Map<MessagePort, {[taskId: string]: CancellablePromise<MyUploadFile>}> = new Map();
const cacheStorage = new CacheStorageController('cachedStreamChunks');
const CHUNK_TTL = 86400;
const CHUNK_CACHED_TIME_HEADER = 'Time-Cached';
const USE_CACHE = true;
const TEST_SLOW = false;
const PRELOAD_SIZE = 20 * 1024 * 1024;

const clearOldChunks = () => {
  return cacheStorage.timeoutOperation((cache) => {
    return cache.keys().then((requests) => {
      const filtered: Map<DocId, Request> = new Map();
      const timestamp = Date.now() / 1000 | 0;
      for(const request of requests) {
        const match = request.url.match(/\/(\d+?)\?/);
        if(match && !filtered.has(match[1])) {
          filtered.set(match[1], request);
        }
      }

      const promises: Promise<any>[] = [];
      for(const [id, request] of filtered) {
        const promise = cache.match(request).then((response) => {
          if((+response.headers.get(CHUNK_CACHED_TIME_HEADER) + CHUNK_TTL) <= timestamp) {
            log('will delete stream chunk:', id);
            return cache.delete(request, {ignoreSearch: true, ignoreVary: true});
          }
        });

        promises.push(promise);
      }

      return Promise.all(promises);
    });
  });
};

setInterval(clearOldChunks, 1800e3);
setInterval(() => {
  const mtprotoMessagePort = getMtprotoMessagePort();
  for(const [messagePort, promises] of deferredPromises) {
    if(messagePort === mtprotoMessagePort) {
      continue;
    }

    for(const taskId in promises) {
      const promise = promises[taskId];
      promise.reject();
    }

    deferredPromises.delete(messagePort);
  }
}, 120e3);

type StreamRange = [number, number];
type StreamId = `${ActiveAccountNumber}-${DocId}`;

const streams: Map<StreamId, Stream> = new Map();
(ctx as any).streams = streams;
class Stream {
  private destroyDebounced: DebounceReturnType<() => void>;
  private id: StreamId;
  private limitPart: number;
  private loadedOffsets: Set<number> = new Set();
  private shouldPatchMp4: boolean | number;
  private inUse: number;

  constructor(private info: DownloadOptions) {
    this.id = Stream.getId(info);
    streams.set(this.id, this);
    this.inUse = 0;

    // ! если грузить очень большое видео чанками по 512Кб в мобильном Safari, то стрим не запустится
    this.limitPart = info.size > (75 * 1024 * 1024) ? STREAM_CHUNK_UPPER_LIMIT : STREAM_CHUNK_MIDDLE_LIMIT;
    this.destroyDebounced = debounce(this.destroy, 150000, false, true);
  }

  private destroy = () => {
    this.destroyDebounced.clearTimeout();
    streams.delete(this.id);
    serviceMessagePort.invokeVoid('cancelFilePartRequests', {
      docId: Stream.getDocId(this.info),
      accountNumber: this.info.accountNumber
    }, getMtprotoMessagePort());
  };

  public toggleInUse = (inUse: boolean) => {
    this.inUse += inUse ? 1 : -1;
    if(!this.inUse) {
      this.destroy();
    }
  };

  private async requestFilePartFromWorker(alignedOffset: number, limit: number, fromPreload = false) {
    const payload: ServiceRequestFilePartTaskPayload = {
      docId: Stream.getDocId(this.info),
      dcId: this.info.dcId,
      offset: alignedOffset,
      limit,
      accountNumber: this.info.accountNumber
    };

    const taskId = JSON.stringify(payload);

    const mtprotoMessagePort = getMtprotoMessagePort();
    let promises = deferredPromises.get(mtprotoMessagePort);
    if(!promises) {
      deferredPromises.set(mtprotoMessagePort, promises = {});
    }

    let deferred = promises[taskId];
    if(deferred) {
      return deferred.then((uploadFile) => uploadFile.bytes);
    }

    this.loadedOffsets.add(alignedOffset);

    deferred = promises[taskId] = deferredPromise();

    serviceMessagePort.invoke('requestFilePart', payload, undefined, mtprotoMessagePort)
    .then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred)).finally(() => {
      if(promises[taskId] === deferred) {
        delete promises[taskId];

        if(!Object.keys(promises).length) {
          deferredPromises.delete(mtprotoMessagePort);
        }
      }
    });

    const bytesPromise = deferred.then((uploadFile) => uploadFile.bytes);

    if(USE_CACHE) {
      this.saveChunkToCache(bytesPromise, alignedOffset, limit);
      !fromPreload && this.preloadChunks(alignedOffset, PRELOAD_SIZE);
    }

    return bytesPromise;
  }

  private requestFilePartFromCache(alignedOffset: number, limit: number, fromPreload?: boolean) {
    if(!USE_CACHE) {
      return Promise.resolve();
    }

    const key = this.getChunkKey(alignedOffset, limit);
    return cacheStorage.getFile(key).then((blob: Blob) => {
      return fromPreload ? new Uint8Array() : readBlobAsUint8Array(blob);
    }, (error: ApiError) => {
      if(error.type === 'NO_ENTRY_FOUND') {
        return;
      }
    });
  }

  private requestFilePart(alignedOffset: number, limit: number, fromPreload?: boolean) {
    const promise = this.requestFilePartFromCache(alignedOffset, limit, fromPreload).then((bytes) => {
      return bytes || this.requestFilePartFromWorker(alignedOffset, limit, fromPreload);
    });

    if(TEST_SLOW) {
      return promise.then((bytes) => {
        log.warn('delaying chunk', alignedOffset, limit);
        return pause(3000).then(() => {
          log.warn('releasing chunk', alignedOffset, limit);
          return bytes;
        });
      });
    }

    return promise;
  }

  private saveChunkToCache(deferred: Promise<Uint8Array>, alignedOffset: number, limit: number) {
    return deferred.then((bytes) => {
      const key = this.getChunkKey(alignedOffset, limit);
      const response = new Response(bytes, {
        headers: {
          'Content-Length': '' + bytes.length,
          'Content-Type': 'application/octet-stream',
          [CHUNK_CACHED_TIME_HEADER]: '' + (Date.now() / 1000 | 0)
        }
      });

      return cacheStorage.save(key, response);
    });
  }

  private preloadChunk(offset: number) {
    if(this.loadedOffsets.has(offset)) {
      return;
    }

    this.loadedOffsets.add(offset);
    this.requestFilePart(offset, this.limitPart, true);
  }

  private preloadChunks(offset: number, end: number) {
    if(end > this.info.size) {
      end = this.info.size;
    }

    if(!offset) { // load last chunk for bounds
      this.preloadChunk(alignOffset(offset, this.limitPart));
    } else { // don't preload next chunks before the start
      for(; offset < end; offset += this.limitPart) {
        this.preloadChunk(offset);
      }
    }
  }

  public requestRange(range: StreamRange) {
    this.destroyDebounced();

    const possibleResponse = responseForSafariFirstRange(range, this.info.mimeType, this.info.size);
    if(possibleResponse) {
      return possibleResponse;
    }

    let [offset, end] = range;

    /* if(info.size > limitPart && isSafari && offset === limitPart) {
      //end = info.size - 1;
      //offset = info.size - 1 - limitPart;
      offset = info.size - (info.size % limitPart);
    } */

    const limit = end && end < this.limitPart ? alignLimit(end - offset + 1) : this.limitPart;
    const alignedOffset = alignOffset(offset, limit);

    if(!end) {
      end = Math.min(offset + limit, this.info.size - 1);
    }

    let overflow: number;
    if(offset !== alignedOffset || end !== (alignedOffset + limit)) {
      overflow = end - alignedOffset - limit + 1;
    }

    const parts = Promise.all([
      this.requestFilePart(alignedOffset, limit),
      overflow && this.requestFilePart(alignedOffset + limit, limit)
    ]);

    return parts.then((parts) => {
      let ab = bufferConcats(...parts.filter(Boolean));
      // log.debug('[stream] requestFilePart result:', result);

      // if(isSafari) {
      if(offset !== alignedOffset || end !== (alignedOffset + limit)) {
        const sliceStart = offset - alignedOffset;
        const sliceEnd = end - alignedOffset + 1;
        ab = ab.slice(sliceStart, sliceEnd);
      }

      if(this.shouldPatchMp4 === true || this.shouldPatchMp4 === alignedOffset) {
        if(tryPatchMp4(ab)) {
          this.shouldPatchMp4 = alignedOffset;
        }
      }
      // if(this.shouldPatchMp4) {
      //   tryPatchMp4(ab);
      // }

      const headers: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${offset}-${offset + ab.byteLength - 1}/${this.info.size || '*'}`,
        'Content-Length': `${ab.byteLength}`,
        'Response-Time': '' + Date.now()
      };

      if(this.info.mimeType) {
        headers['Content-Type'] = this.info.mimeType;
      }

      // simulate slow connection
      // setTimeout(() => {
      return new Response(ab, {
        status: 206,
        statusText: 'Partial Content',
        headers
      });
      // }, 2.5e3);
    });
  }

  private getChunkKey(alignedOffset: number, limit: number) {
    return this.id + '?offset=' + alignedOffset + '&limit=' + limit;
  }

  public patchChromiumMp4() {
    this.shouldPatchMp4 = true;
  }

  public static get(info: DownloadOptions) {
    return streams.get(this.getId(info)) ?? new Stream(info);
  }

  private static getId(info: DownloadOptions): StreamId {
    return `${info.accountNumber}-${this.getDocId(info)}`;
  }

  private static getDocId(info: DownloadOptions) {
    return (info.location as InputFileLocation.inputDocumentFileLocation).id;
  }
}

function parseInfo(params: string) {
  return JSON.parse(decodeURIComponent(params)) as DownloadOptions;
}

export default function onStreamFetch(event: FetchEvent, params: string, search: string) {
  async function performRequest() {
    const range = parseRange(event.request.headers.get('Range'));
    const info = parseInfo(params);

    const client = await ctx.clients.get(event.clientId);
    // Theoretically should never happen otherwise
    if(client?.type === 'window') info.accountNumber = getCurrentAccountFromURL(client.url);

    const stream = Stream.get(info);

    if(search === '_crbug1250841') {
      stream.patchChromiumMp4();
    }

    return stream.requestRange(range);
  }

  // log.debug('[stream]', url, offset, end);

  event.respondWith(Promise.race([
    timeout(45 * 1000),
    performRequest()
  ]));
}

export function toggleStreamInUse({url, inUse, accountNumber}: {url: string, inUse: boolean, accountNumber: ActiveAccountNumber}) {
  [url] = url.split('?');
  const needle = 'stream/';
  const index = url.indexOf(needle);
  const info = parseInfo(url.slice(index + needle.length));
  info.accountNumber = accountNumber;
  const stream = Stream.get(info);
  stream.toggleInUse(inUse);
}

function responseForSafariFirstRange(range: StreamRange, mimeType: string, size: number): Response {
  if(range[0] === 0 && range[1] === 1) {
    return new Response(new Uint8Array(2).buffer, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes 0-1/${size || '*'}`,
        'Content-Length': '2',
        'Content-Type': mimeType || 'video/mp4'
      }
    });
  }

  return null;
}

/* const STREAM_CHUNK_UPPER_LIMIT = 256 * 1024;
const SMALLEST_CHUNK_LIMIT = 256 * 4; */
/* const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 1024 * 4; */
const STREAM_CHUNK_MIDDLE_LIMIT = 512 * 1024;
const STREAM_CHUNK_UPPER_LIMIT = 1024 * 1024;
const SMALLEST_CHUNK_LIMIT = 512 * 4;

export function parseRange(header: string): StreamRange {
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
