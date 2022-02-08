/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { IS_SAFARI } from "../../environment/userAgent";
import EventListenerBase from "../../helpers/eventListenerBase";

export default class QueryableWorker extends EventListenerBase<{
  ready: () => void,
  frame: (reqId: number, frameNo: number, frame: Uint8ClampedArray) => void,
  loaded: (reqId: number, frameCount: number, fps: number) => void,
  error: (reqId: number, error: Error) => void,
  workerError: (error: ErrorEvent) => void
}> {
  constructor(private worker: Worker) {
    super();

    this.worker.onerror = (error) => {
      try {
        this.dispatchEvent('workerError', error);
        this.cleanup();
        this.terminate();
      } catch(err) {
        
      }
    };

    this.worker.onmessage = (event) => {
      this.dispatchEvent(event.data.queryMethodListener, ...event.data.queryMethodArguments);
    };
  }

  public postMessage(message: any) {
    this.worker.postMessage(message);
  }

  public terminate() {
    this.worker.terminate();
  }

  public sendQuery(queryMethod: string, ...args: any[]) {
    if(IS_SAFARI) {
      this.worker.postMessage({
        queryMethod: queryMethod,
        queryMethodArguments: args
      });
    } else {
      const transfer: (ArrayBuffer | OffscreenCanvas)[] = [];
      args.forEach(arg => {
        if(arg instanceof ArrayBuffer) {
          transfer.push(arg);
        }
  
        if(typeof(arg) === 'object' && arg.buffer instanceof ArrayBuffer) {
          transfer.push(arg.buffer);
        }
      });
  
      //console.log('transfer', transfer);
      this.worker.postMessage({
        queryMethod: queryMethod,
        queryMethodArguments: args
      }, transfer as PostMessageOptions);
    }
  }
}
