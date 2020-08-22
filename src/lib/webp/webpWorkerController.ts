import WebpWorker from 'worker-loader!./webp.worker';
import { CancellablePromise, deferredPromise } from '../polyfill';

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
  
  init() {
    this.worker = new WebpWorker();
    this.worker.addEventListener('message', (e) => {
      const payload = (e.data as WebpConvertTask).payload;

      if(payload.fileName.indexOf('main-') === 0) {
        const promise = this.convertPromises[payload.fileName];
        if(promise) {
          promise.resolve(payload.bytes);
          delete this.convertPromises[payload.fileName];
        }
      } else {
        navigator.serviceWorker.controller.postMessage(e.data);
      }
    });
  }

  postMessage(data: WebpConvertTask) {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.worker.postMessage(data);
  }

  convert(fileName: string, bytes: Uint8Array) {
    const convertPromise = deferredPromise<Uint8Array>();

    fileName = 'main-' + fileName;

    this.postMessage({type: 'convertWebp', payload: {fileName, bytes}});

    return this.convertPromises[fileName] = convertPromise;
  }
}

export const webpWorkerController = new WebpWorkerController();