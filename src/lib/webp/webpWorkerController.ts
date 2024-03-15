/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import {WorkerTaskVoidTemplate} from '../../types';

export interface ConvertWebPTask extends WorkerTaskVoidTemplate {
  type: 'convertWebp',
  payload: {
    fileName: string,
    bytes: Uint8Array
  }
};

export class WebpWorkerController {
  private worker: Worker;
  private convertPromises: {[fileName: string]: CancellablePromise<Uint8Array>} = {};

  private init() {
    this.worker = new Worker(new URL('./webp.worker.ts', import.meta.url), {type: 'module'});
    this.worker.addEventListener('message', (e) => {
      const task = e.data as ConvertWebPTask;
      const payload = task.payload;

      const promise = this.convertPromises[payload.fileName];
      if(promise) {
        payload.bytes ? promise.resolve(payload.bytes) : promise.reject();
        delete this.convertPromises[payload.fileName];
      }
    });
  }

  private postMessage(data: ConvertWebPTask) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.worker.postMessage(data);
  }

  public convert(fileName: string, bytes: Uint8Array) {
    if(this.convertPromises.hasOwnProperty(fileName)) {
      return this.convertPromises[fileName];
    }

    const convertPromise = deferredPromise<Uint8Array>();

    this.postMessage({type: 'convertWebp', payload: {fileName, bytes}});

    return this.convertPromises[fileName] = convertPromise;
  }
}

const webpWorkerController = new WebpWorkerController();
MOUNT_CLASS_TO.webpWorkerController = webpWorkerController;
export default webpWorkerController;
