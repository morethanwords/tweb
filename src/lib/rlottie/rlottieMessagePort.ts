/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ThreadedWorkerEvents} from '@lib/mainWorker/mainMessagePort';
import SuperMessagePort from '@lib/superMessagePort';
import {MOUNT_CLASS_TO} from '@config/debug';

type CommonPayload = {reqId: number};
export type RLottieWorkerMethods = {
  destroy: (payload: CommonPayload) => void,
  loadFromData: (payload: CommonPayload & {blob: Blob, width: number, height: number, toneIndex: number, raw: boolean}) => Promise<{frameCount: number, fps: number}>,
  renderFrame: (payload: CommonPayload & {frameNo: number, clamped?: Uint8ClampedArray}) => SuperMessagePort.TransferableResultValue<{frameNo: number, frame: ImageBitmap | Uint8ClampedArray}>,
  terminate: () => void
};

type RLottieWorkerEvents = RLottieWorkerMethods & ThreadedWorkerEvents;
type RLottieMasterEvents = ThreadedWorkerEvents;

export class RLottieMessagePort<Master extends boolean = true> extends SuperMessagePort<RLottieWorkerEvents, RLottieMasterEvents, Master> {
  private lastIndex: number;

  constructor() {
    super('RLOTTIE');
    this.lastIndex = -1;
  }

  public getNextWorkerIndex() {
    return this.lastIndex = (this.lastIndex + 1) % this.sendPorts.length;
  }

  public invokeRLottie<T extends keyof RLottieWorkerMethods>(
    workerId: number,
    method: T,
    payload: Parameters<RLottieWorkerMethods[T]>[0],
    transfer?: Transferable[]
  ) {
    return this.invoke(
      // @ts-ignore
      method,
      payload,
      false,
      this.sendPorts[workerId],
      transfer
    );
  }

  public terminateAll() {
    const ports = this.sendPorts.slice();
    for(const port of ports) {
      // @ts-ignore
      this.invokeVoid('terminate', undefined, port);
      this.detachPort(port as any);
    }
  }
}

const rlottieMessagePort = new RLottieMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.rlottieMessagePort = rlottieMessagePort);
export default rlottieMessagePort;
