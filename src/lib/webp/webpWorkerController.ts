/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import WebpWorker from 'worker-loader!./webp.worker';
import { MOUNT_CLASS_TO } from '../../config/debug';
import deferredPromise, { CancellablePromise } from '../../helpers/cancellablePromise';
import apiManagerProxy from '../mtproto/mtprotoworker';

export type WebpConvertTask = {
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
    this.worker = new WebpWorker();
    this.worker.addEventListener('message', (e) => {
      const payload = (e.data as WebpConvertTask).payload;

      if(payload.fileName.indexOf('main-') === 0) {
        const promise = this.convertPromises[payload.fileName];
        if(promise) {
          payload.bytes ? promise.resolve(payload.bytes) : promise.reject();
          delete this.convertPromises[payload.fileName];
        }
      } else {
        apiManagerProxy.postMessage(e.data);
      }
    });
  }

  public postMessage(data: WebpConvertTask) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.worker.postMessage(data);
  }

  public convert(fileName: string, bytes: Uint8Array) {
    fileName = 'main-' + fileName;

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