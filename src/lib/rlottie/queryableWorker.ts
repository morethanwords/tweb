/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CAN_USE_TRANSFERABLES from '../../environment/canUseTransferables';
import EventListenerBase from '../../helpers/eventListenerBase';

export default class QueryableWorker extends EventListenerBase<{
  ready: () => void,
  frame: (reqId: number, frameNo: number, frame: Uint8ClampedArray | ImageBitmap) => void,
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

  public sendQuery(args: any[], transfer?: Transferable[]) {
    this.worker.postMessage({
      queryMethod: args.shift(),
      queryMethodArguments: args
    }, CAN_USE_TRANSFERABLES ? transfer: undefined);
  }
}
