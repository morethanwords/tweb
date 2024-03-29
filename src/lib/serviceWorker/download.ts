/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ServiceDownloadTaskPayload} from './serviceMessagePort';
import type ServiceMessagePort from './serviceMessagePort';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import makeError from '../../helpers/makeError';
import pause from '../../helpers/schedulers/pause';
import {logger} from '../logger';
import {invokeVoidAll, log} from './index.service';

type DownloadType = Uint8Array;
type DownloadItem = ServiceDownloadTaskPayload & {
  log: ReturnType<typeof logger>,
  // transformStream: TransformStream<DownloadType, DownloadType>,
  readableStream: ReadableStream<DownloadType>,
  // writableStream: WritableStream<DownloadType>,
  // writer: WritableStreamDefaultWriter<DownloadType>,
  // controller: TransformStreamDefaultController<DownloadType>,
  controller: ReadableStreamController<Uint8Array>,
  promise: CancellablePromise<void>,
  // downloadPromise: Promise<void>,
  used?: boolean
};
const downloadMap: Map<string, DownloadItem> = new Map();
const DOWNLOAD_ERROR = makeError('UNKNOWN');
const DOWNLOAD_TEST = false;

(self as any).downloadMap = downloadMap;

type A = Parameters<ServiceMessagePort<false>['addMultipleEventsListeners']>[0];

const events: A = {
  download: (payload) => {
    const {id} = payload;
    if(downloadMap.has(id)) {
      return Promise.reject(DOWNLOAD_ERROR);
    }

    const log = logger('DOWNLOAD-' + id);
    log('prepare');

    // const y = (20 * 1024 * 1024) / payload.limitPart;
    // const strategy = new ByteLengthQueuingStrategy({highWaterMark: y});
    // let controller: TransformStreamDefaultController<DownloadType>;
    const strategy = new CountQueuingStrategy({highWaterMark: 1});
    // const transformStream = new TransformStream<DownloadType, DownloadType>(/* {
    //   start: (_controller) => controller = _controller,
    // },  */undefined, strategy, strategy);

    // const {readable, writable} = transformStream;
    // const writer = writable.getWriter();

    const promise = deferredPromise<void>();
    promise.then(() => {
      setTimeout(() => {
        downloadMap.delete(id);
      }, 5e3);
    }, () => {
      downloadMap.delete(id);
    });

    // writer.closed.then(promise.resolve, promise.reject);

    let controller: ReadableStreamController<any>;
    const readable = new ReadableStream({
      start: (_controller) => {
        controller = _controller;
      },

      cancel: (reason) => {
        log('cancel', id, reason);
        promise.reject(DOWNLOAD_ERROR);
      }
    }, strategy);

    // writer.closed.catch(noop).finally(() => {
    //   log.error('closed writer');
    //   onEnd();
    // });

    // const downloadPromise = writer.closed.catch(() => {throw DOWNLOAD_ERROR;});
    const item: DownloadItem = {
      ...payload,
      // transformStream,
      readableStream: readable,
      // writableStream: writable,
      // writer,
      // downloadPromise,
      promise,
      controller,
      log
    };

    downloadMap.set(id, item);

    // return downloadPromise;
    return promise.catch(() => {throw DOWNLOAD_ERROR});
  },

  downloadChunk: ({id, chunk}) => {
    const item = downloadMap.get(id);
    if(!item) {
      return Promise.reject();
    }

    // log('got chunk', id, chunk.length);

    // return item.controller.enqueue(chunk);
    // return item.writer.write(chunk);
    // @ts-ignore
    return item.controller.enqueue(chunk);
  },

  downloadFinalize: (id) => {
    const item = downloadMap.get(id);
    if(!item) {
      return Promise.reject();
    }

    item.log('finalize');

    item.promise.resolve();
    // return item.controller.terminate();
    // return item.writer.close();
    return item.controller.close();
  },

  downloadCancel: (id) => {
    const item = downloadMap.get(id);
    if(!item) {
      return;
    }

    item.log('cancel');

    item.promise.reject();
    // return item.controller.error();
    // return item.writer.abort();
    return item.controller.error();
  }
};

export default function handleDownload(serviceMessagePort: ServiceMessagePort<false>) {
  serviceMessagePort.addMultipleEventsListeners(events);

  return {
    onDownloadFetch,
    onClosedWindows: cancelAllDownloads
  };
}

function onDownloadFetch(event: FetchEvent, params: string) {
  invokeVoidAll('downloadRequestReceived', params);

  const promise = pause(100).then(() => {
    const item = downloadMap.get(params);
    if(!item || (item.used && !DOWNLOAD_TEST)) {
      log.warn('no such download', params);
      return;
    }

    item.log('fetch');
    item.used = true;
    const stream = item.readableStream;
    const response = new Response(stream, {headers: item.headers, status: 200});
    return response;
  });

  event.respondWith(promise);
}

function cancelAllDownloads() {
  log('cancelling all downloads');
  if(downloadMap.size) {
    for(const [id, item] of downloadMap) {
      // item.writer.abort().catch(noop);
      item.controller.error();
    }
  }
}
