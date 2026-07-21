import type {ThreadedWorkerEvents} from '@lib/mainWorker/mainMessagePort';
import SuperMessagePort from '@lib/superMessagePort';
import {MOUNT_CLASS_TO} from '@config/debug';

type CommonPayload = {reqId: number};

export type LottieOffscreenInit = {
  canvases: OffscreenCanvas[], // transfer list; [] for compositor-delivery (emoji) players
  cacheName?: string,
  cachingDelta: number,
  color?: string, // UI-resolved tint (rgb()/hex); CSS vars resolved UI-side only
  compositorDelivery?: boolean
};

export type LottieWorkerMethods = {
  destroy: (payload: CommonPayload) => void,
  loadFromData: (payload: CommonPayload & {blob: Blob, wasmUrl: string, width: number, height: number, toneIndex: number, raw: boolean, offscreen?: LottieOffscreenInit}, source: MessageEventSource) => Promise<{frameCount: number, fps: number}>,
  renderFrame: (payload: CommonPayload & {frameNo: number, clamped?: Uint8ClampedArray}) => SuperMessagePort.TransferableResultValue<{frameNo: number, frame?: ImageBitmap | Uint8ClampedArray}>,
  presentFrame: (payload: CommonPayload & {frameNo: number}) => Promise<{frameNo: number}>,
  resizeCanvases: (payload: CommonPayload & {width: number, height: number}) => void,
  setColor: (payload: CommonPayload & {color?: string, reTint: boolean}) => void,
  exportFrame: (payload: CommonPayload & {frameNo?: number}) => Promise<SuperMessagePort.TransferableResultValue<{frameNo: number, frame: ImageBitmap}>>,
  clearFramesCache: (payload: CommonPayload) => void,
  compositorPort: (payload: void, source: MessageEventSource, event: MessageEvent) => void, // MessagePort arrives in event.ports[0]
  playFreeRun: (payload: CommonPayload & {curFrame: number, frInterval: number, skipDelta: number, direction: number, minFrame: number, maxFrame: number, loop: boolean}) => void,
  pauseFreeRun: (payload: CommonPayload) => Promise<{curFrame: number}>,
  updateFreeRun: (payload: CommonPayload & Partial<{frInterval: number, direction: number, minFrame: number, maxFrame: number}>) => void,
  suspendTab: (payload: void, source: MessageEventSource) => void,
  resumeTab: (payload: void, source: MessageEventSource) => void,
  debugTag: (payload: void) => string, // worker-bundle freshness probe (SharedWorkers survive reloads)
  terminate: (payload: void) => void
};

export type LottieEvents = {
  freeRunStopped: (payload: {reqId: number, curFrame: number, error: string}) => void,
  freeRunEnded: (payload: {reqId: number, curFrame: number}) => void // worker clock reached the end of a play-once animation
};

type LottieWorkerEvents = LottieWorkerMethods & ThreadedWorkerEvents & LottieEvents;
type LottieMasterEvents = ThreadedWorkerEvents & LottieEvents;

export class LottieMessagePort<Master extends boolean = true> extends SuperMessagePort<LottieWorkerEvents, LottieMasterEvents, Master> {
  private lastIndex: number;

  constructor() {
    super('LOTTIE');
    this.lastIndex = -1;
  }

  public getNextWorkerIndex() {
    return this.lastIndex = (this.lastIndex + 1) % this.sendPorts.length;
  }

  public invokeLottie<T extends keyof LottieWorkerMethods>(
    workerId: number,
    method: T,
    payload: Parameters<LottieWorkerMethods[T]>[0],
    transfer?: Transferable[]
  ) {
    return this.invokeAs<LottieWorkerMethods, T>(method, payload, this.sendPorts[workerId], transfer);
  }

  public invokeLottieVoid<T extends keyof LottieWorkerMethods>(
    workerId: number,
    method: T,
    payload: Parameters<LottieWorkerMethods[T]>[0],
    transfer?: Transferable[]
  ) {
    this.invokeVoidAs<LottieWorkerMethods, T>(method, payload, this.sendPorts[workerId], transfer);
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
      this.invokeVoidAs<LottieWorkerMethods, 'suspendTab' | 'resumeTab'>(suspend ? 'suspendTab' : 'resumeTab', undefined, port);
    }
  }

  public terminateAll() {
    const ports = this.sendPorts.slice();
    for(const port of ports) {
      this.invokeVoidAs<LottieWorkerMethods, 'terminate'>('terminate', undefined, port);
      this.detachPort(port as any);
    }
  }
}

const lottieMessagePort = new LottieMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.lottieMessagePort = lottieMessagePort);
export default lottieMessagePort;
