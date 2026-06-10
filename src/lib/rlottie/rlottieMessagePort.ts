import type {ThreadedWorkerEvents} from '@lib/mainWorker/mainMessagePort';
import SuperMessagePort from '@lib/superMessagePort';
import {MOUNT_CLASS_TO} from '@config/debug';

type CommonPayload = {reqId: number};

export type RLottieOffscreenInit = {
  canvases: OffscreenCanvas[], // transfer list; [] for compositor-delivery (emoji) players
  cacheName?: string,
  cachingDelta: number,
  color?: string, // UI-resolved tint (rgb()/hex); CSS vars resolved UI-side only
  compositorDelivery?: boolean
};

export type RLottieWorkerMethods = {
  destroy: (payload: CommonPayload) => void,
  loadFromData: (payload: CommonPayload & {blob: Blob, width: number, height: number, toneIndex: number, raw: boolean, offscreen?: RLottieOffscreenInit}, source: MessageEventSource) => Promise<{frameCount: number, fps: number}>,
  renderFrame: (payload: CommonPayload & {frameNo: number, clamped?: Uint8ClampedArray}) => SuperMessagePort.TransferableResultValue<{frameNo: number, frame?: ImageBitmap | Uint8ClampedArray}>,
  presentFrame: (payload: CommonPayload & {frameNo: number}) => Promise<{frameNo: number}>,
  resizeCanvases: (payload: CommonPayload & {width: number, height: number}) => void,
  setColor: (payload: CommonPayload & {color?: string, reTint: boolean}) => void,
  exportFrame: (payload: CommonPayload & {frameNo?: number}) => Promise<SuperMessagePort.TransferableResultValue<{frameNo: number, frame: ImageBitmap}>>,
  clearFramesCache: (payload: CommonPayload) => void,
  compositorPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void, // MessagePort arrives in event.ports[0]
  playFreeRun: (payload: CommonPayload & {curFrame: number, frInterval: number, skipDelta: number, direction: number, minFrame: number, maxFrame: number}) => void,
  pauseFreeRun: (payload: CommonPayload) => Promise<{curFrame: number}>,
  updateFreeRun: (payload: CommonPayload & Partial<{frInterval: number, direction: number, minFrame: number, maxFrame: number}>) => void,
  suspendTab: (payload: void, source: MessageEventSource) => void,
  resumeTab: (payload: void, source: MessageEventSource) => void,
  debugTag: (payload: void) => string, // worker-bundle freshness probe (SharedWorkers survive reloads)
  terminate: (payload: void) => void
};

export type RLottieEvents = {
  freeRunStopped: (payload: {reqId: number, curFrame: number, error: string}) => void
};

type RLottieWorkerEvents = RLottieWorkerMethods & ThreadedWorkerEvents & RLottieEvents;
type RLottieMasterEvents = ThreadedWorkerEvents & RLottieEvents;

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
    return this.invokeAs<RLottieWorkerMethods, T>(method, payload, this.sendPorts[workerId], transfer);
  }

  public invokeRLottieVoid<T extends keyof RLottieWorkerMethods>(
    workerId: number,
    method: T,
    payload: Parameters<RLottieWorkerMethods[T]>[0],
    transfer?: Transferable[]
  ) {
    this.invokeVoidAs<RLottieWorkerMethods, T>(method, payload, this.sendPorts[workerId], transfer);
  }

  public getWorkerIndexForName(name: string) {
    let hash = 0;
    for(let i = 0; i < name.length; ++i) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % this.sendPorts.length;
  }

  public suspendAllTabPlayers(suspend: boolean) {
    for(const port of this.sendPorts) {
      this.invokeVoidAs<RLottieWorkerMethods, 'suspendTab' | 'resumeTab'>(suspend ? 'suspendTab' : 'resumeTab', undefined, port);
    }
  }

  public terminateAll() {
    const ports = this.sendPorts.slice();
    for(const port of ports) {
      this.invokeVoidAs<RLottieWorkerMethods, 'terminate'>('terminate', undefined, port);
      this.detachPort(port as any);
    }
  }
}

const rlottieMessagePort = new RLottieMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.rlottieMessagePort = rlottieMessagePort);
export default rlottieMessagePort;
