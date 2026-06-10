import SuperMessagePort from '@lib/superMessagePort';
import {MOUNT_CLASS_TO} from '@config/debug';

export type EmojiCompositorMethods = {
  attachRenderer: (p: {rendererId: number, canvas: OffscreenCanvas, dpr: number, fadeEnabled: boolean}) => void, // [canvas] in transfer; the initial color arrives via the immediately-following configRenderer
  detachRenderer: (p: {rendererId: number}) => void,
  resizeRenderer: (p: {rendererId: number, width: number, height: number}) => void,
  configRenderer: (p: {rendererId: number} & Partial<{color: string, fadeEnabled: boolean, dpr: number}>) => void,
  attachGroup: (p: {rendererId: number, groupId: DocId, playerReqId: number, textColored: boolean, skipFade: boolean}) => void,
  detachGroup: (p: {rendererId: number, groupId: DocId}) => void,
  resetFade: (p: {rendererId: number, groupId: DocId}) => void,
  setOffsets: (p: {batch: {rendererId: number, groups: {groupId: DocId, offsets: number[]}[]}[]}) => void, // [top,left,width] triples, pre-dpr
  clearRenderer: (p: {rendererId: number}) => void,
  decodePort: (p: {workerId: number}, source: MessageEventSource, event: MessageEvent) => void // MessagePort arrives in event.ports[0]
};

export type EmojiCompositorEvents = {
  groupPainted: (p: {rendererId: number, groupId: DocId}) => void
};

// Generics MUST mirror rlottieMessagePort's verified shape: SuperMessagePort<Workers, Masters, IsMaster>
// resolves Receive = Workers and Send = Masters when IsMaster = false (superMessagePort.ts:103-109), and BOTH
// bundles (UI + worker) share the one <false> instance below. So Workers = methods & events (everything either
// side listens to: the worker registers the methods, the UI registers groupPainted) and Masters = events (what
// the worker originates). UI→worker method sends would NOT typecheck against Send — they go through a typed
// helper with @ts-ignore, exactly like RLottieMessagePort.invokeRLottie (rlottieMessagePort.ts:28-42).
type EmojiCompositorWorkerEvents = EmojiCompositorMethods & EmojiCompositorEvents;
type EmojiCompositorMasterEvents = EmojiCompositorEvents;

export class EmojiCompositorMessagePort<Master extends boolean = true> extends SuperMessagePort<EmojiCompositorWorkerEvents, EmojiCompositorMasterEvents, Master> {
  constructor() {
    super('EMOJI-COMPOSITOR');
  }

  public invokeCompositorVoid<T extends keyof EmojiCompositorMethods>(
    method: T,
    payload: Parameters<EmojiCompositorMethods[T]>[0],
    transfer?: Transferable[]
  ) {
    this.invokeVoid(
      // @ts-ignore
      method,
      payload,
      undefined,
      transfer
    );
  }
}

const compositorMessagePort = new EmojiCompositorMessagePort<false>();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.compositorMessagePort = compositorMessagePort);
export default compositorMessagePort;
