/*
 * Main-thread proxy to an `encryptWorker.ts` instance. One host per call.
 *
 * Lifecycle:
 *   - `new EncryptWorkerHost()`           — spawns the worker.
 *   - `host.init(...)` / `host.applyBlock(...)` / etc. — typed RPC.
 *   - `host.on('status', cb)`             — subscribe to async events.
 *   - `host.terminate()`                  — clean shutdown.
 *
 * The host never sees the call's private key bytes after handing the seed
 * over to the worker — keep that property as the worker integration matures.
 */

import EventListenerBase from '@helpers/eventListenerBase';
// Vite's `?worker` suffix bundles encryptWorker.ts into a CLASSIC worker
// (IIFE). RTCRtpScriptTransform delivery to receivers (recv direction) is
// flaky in Chrome with module workers — Chrome 146 pumped only ~6 frames
// before silently stopping under our SFU's setup, even with a no-op
// passthrough handler. The W3C reference samples + production WebRTC apps
// use classic workers, so we switch to that path.
import EncryptWorker from './encryptWorker.ts?worker';
import type {
  HostRequest,
  HostResponse,
  RequestKind,
  RequestResultMap,
  WorkerEvent
} from './encryptWorkerProtocol';

type Pending = {resolve: (v: unknown) => void; reject: (e: Error) => void};

type HostEvents = {
  status: (event: Extract<WorkerEvent, {kind: 'status'}>) => void;
  pendingOutbound: (event: Extract<WorkerEvent, {kind: 'pendingOutbound'}>) => void;
  callFailed: (event: Extract<WorkerEvent, {kind: 'callFailed'}>) => void;
  recvDiag: (event: Extract<WorkerEvent, {kind: 'recvDiag'}>) => void;
  [key: string]: (...args: any[]) => any;
};

export class EncryptWorkerHost extends EventListenerBase<HostEvents> {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private destroyed = false;

  constructor() {
    super(false);
    // Classic (IIFE) worker via Vite's `?worker` suffix. See the comment on
    // the import for why module workers were ditched.
    this.worker = new EncryptWorker({name: 'tde2e-encrypt'});
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
  }

  // ===== RPC methods =====
  //
  // One method per HostRequest kind. The TS signature mirrors the protocol's
  // `args` shape and the response type comes from `RequestResultMap`.

  public createZeroBlock(args: Extract<HostRequest, {kind: 'createZeroBlock'}>['args']): Promise<RequestResultMap['createZeroBlock']> {
    return this.invoke('createZeroBlock', args);
  }

  public createSelfAddBlock(args: Extract<HostRequest, {kind: 'createSelfAddBlock'}>['args']): Promise<RequestResultMap['createSelfAddBlock']> {
    return this.invoke('createSelfAddBlock', args);
  }

  public init(args: Extract<HostRequest, {kind: 'init'}>['args']): Promise<RequestResultMap['init']> {
    return this.invoke('init', args);
  }

  public applyBlock(args: Extract<HostRequest, {kind: 'applyBlock'}>['args']): Promise<RequestResultMap['applyBlock']> {
    return this.invoke('applyBlock', args);
  }

  public buildChangeStateBlock(args: Extract<HostRequest, {kind: 'buildChangeStateBlock'}>['args']): Promise<RequestResultMap['buildChangeStateBlock']> {
    return this.invoke('buildChangeStateBlock', args);
  }

  public pullOutbound(): Promise<RequestResultMap['pullOutbound']> {
    return this.invoke('pullOutbound');
  }

  public receiveInbound(args: Extract<HostRequest, {kind: 'receiveInbound'}>['args']): Promise<RequestResultMap['receiveInbound']> {
    return this.invoke('receiveInbound', args);
  }

  public getStatus(): Promise<RequestResultMap['getStatus']> {
    return this.invoke('getStatus');
  }

  // Send `destroy` to the worker (wiping the key) then terminate it.
  public async terminate(): Promise<void> {
    if(this.destroyed) return;
    this.destroyed = true;
    try {
      await this.invoke('destroy');
    } catch{
      // Best-effort — even if the destroy RPC fails, we still terminate.
    }
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
    for(const {reject} of this.pending.values()) {
      reject(new Error('Worker terminated'));
    }
    this.pending.clear();
    super.cleanup();
  }

  // Construct an `RTCRtpScriptTransform` attached to this worker. The caller
  // assigns the returned transform to an `RTCRtpSender.transform` (for the
  // 'send' direction) or `RTCRtpReceiver.transform` ('recv') — see Phase 5d
  // notes in encryptWorker.ts.
  //
  // - `channelId` is the e2e logical stream id (0-1023). Pick a stable value
  //   per (sender, media kind) — see notes/call.md.
  // - `unencryptedPrefixLength` keeps the leading N codec bytes in the clear
  //   (still authenticated). Defaults to 0; set to a small value (e.g. 1)
  //   for VP8 picture-descriptor visibility to the SFU.
  // - `kind` controls the libtgcalls audio-frame trailer (mandatory on Opus
  //   for the official client to accept our frames). Pass the actual
  //   `track.kind` of the sender/receiver. Defaults to 'audio' if omitted.
  // - 'recv' transforms dispatch per-frame: each encoded frame's
  //   `synchronizationSource` is looked up in the worker's SSRC → user_id
  //   table (populated via `setSsrcUsers`) to choose the verification key.
  //   No per-receiver `fromUserId` is needed — the same transform handles
  //   every SFU-multiplexed sender on its mid.
  public newRtcScriptTransform(options: {
    direction: 'send' | 'recv';
    channelId: number;
    unencryptedPrefixLength?: number;
    // Media kind of the track this transform is attached to. Drives the
    // libtgcalls audio-frame trailer wrap/strip in the worker — see
    // encryptWorker.ts (appendAudioTrailer / stripAudioTrailer).
    // Video frames are passed through raw.
    kind?: 'audio' | 'video';
  }): RTCRtpScriptTransform {
    // RTCRtpScriptTransform may not be in older TS DOM libs; access via
    // globalThis to avoid build-target issues.
    const Ctor = (globalThis as unknown as {RTCRtpScriptTransform?: typeof RTCRtpScriptTransform}).RTCRtpScriptTransform;
    if(!Ctor) throw new Error('RTCRtpScriptTransform is not supported in this browser');
    return new Ctor(this.worker, options);
  }

  // Push the SSRC → user_id table to the worker. Call whenever the SFU
  // participant set changes — the recv transform consults this on every
  // inbound frame. Unknown SSRCs are dropped silently.
  public setSsrcUsers(entries: Array<[number, bigint]>): Promise<void> {
    return this.invoke('setSsrcUsers', {entries});
  }

  public getDebug(): Promise<RequestResultMap['getDebug']> {
    return this.invoke('getDebug');
  }

  // ===== Internal =====

  private invoke<K extends RequestKind>(
    kind: K,
    args?: K extends 'pullOutbound' | 'getStatus' | 'destroy' ?
      undefined :
      Extract<HostRequest, {kind: K}> extends {args: infer A} ? A : undefined
  ): Promise<RequestResultMap[K]> {
    if(this.destroyed) {
      return Promise.reject(new Error('EncryptWorkerHost: terminated'));
    }
    const id = this.nextId++;
    return new Promise<RequestResultMap[K]>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v: unknown) => resolve(v as RequestResultMap[K]),
        reject
      });
      const req = {kind, id, ...(args !== undefined ? {args} : {})} as HostRequest;
      this.worker.postMessage(req);
    });
  }

  private onMessage = (ev: MessageEvent<HostResponse>) => {
    const msg = ev.data;
    if(msg.kind === 'event') {
      // @ts-ignore - dispatchEvent's signature is too strict for our union.
      this.dispatchEvent(msg.event.kind, msg.event);
      return;
    }
    const pending = this.pending.get(msg.id);
    if(!pending) return;
    this.pending.delete(msg.id);
    if(msg.kind === 'ok') pending.resolve(msg.result);
    else pending.reject(new Error(msg.message));
  };

  private onError = (ev: ErrorEvent) => {
    for(const {reject} of this.pending.values()) {
      reject(new Error(ev.message || 'Worker error'));
    }
    this.pending.clear();
  };
}
