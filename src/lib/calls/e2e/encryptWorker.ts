/*
 * Web Worker that owns the E2eCall instance for one conference call.
 *
 * - Holds the long-lived Ed25519 private key + the derived shared keys, so
 *   they never traverse the postMessage boundary in any form the main thread
 *   could exfiltrate.
 * - Handles RPC requests via the protocol in `encryptWorkerProtocol.ts`.
 * - Emits asynchronous `status` events after every mutation so the host
 *   doesn't need to poll.
 * - (5d, deferred) Will also serve as the `RTCRtpScriptTransform` worker:
 *   the host attaches `new RTCRtpScriptTransform(worker, {direction, ...})`
 *   to each RTPSender/RTPReceiver, and this worker's `onrtctransform`
 *   handler pumps frames through `call.encrypt` / `call.decrypt`.
 */

import {appendAudioTrailer, stripAudioTrailer} from './audioTrailer';
import {E2eCall} from './call';
import {ensureCryptoReady} from './crypto';
import type {CallStatusSnapshot, HostRequest, HostResponse, WorkerEvent} from './encryptWorkerProtocol';
import {PrivateKey} from './keys';

declare const self: DedicatedWorkerGlobalScope;

let call: E2eCall | undefined;
let privateKey: PrivateKey | undefined;

// ===== Plumbing =====

function post(msg: HostResponse): void {
  self.postMessage(msg);
}

function emit(event: WorkerEvent): void {
  post({kind: 'event', event});
}

function snapshot(): CallStatusSnapshot {
  if(!call) {
    throw new Error('Call not initialized');
  }
  return {
    height: call.getHeight(),
    groupState: call.getGroupState(),
    lastBlockHash: call.getLastBlockHash(),
    verification: call.getVerificationState(),
    failed: call.getStatus()?.message ?? null
  };
}

// Wrap any handler so unhandled errors come back as `err` responses instead
// of crashing the worker.
async function handle(req: HostRequest): Promise<unknown> {
  switch(req.kind) {
    case 'createZeroBlock': {
      const sk = PrivateKey.fromSeed(req.args.privateSeed);
      try {
        return await E2eCall.createZeroBlock(sk, req.args.groupState);
      } finally {
        sk.destroy();
      }
    }

    case 'createSelfAddBlock': {
      const sk = PrivateKey.fromSeed(req.args.privateSeed);
      try {
        return await E2eCall.createSelfAddBlock(
          sk,
          req.args.previousBlockServer,
          req.args.self
        );
      } finally {
        sk.destroy();
      }
    }

    case 'init': {
      if(call) {
        throw new Error('init: already initialized');
      }
      // Keep a long-lived PrivateKey for the duration of the call.
      privateKey = PrivateKey.fromSeed(req.args.privateSeed);
      call = await E2eCall.create(req.args.userId, privateKey, req.args.lastBlockServer);
      const snap = snapshot();
      emit({kind: 'status', status: snap});
      // Initial verification round always queues a commit broadcast.
      emit({kind: 'pendingOutbound'});
      return snap;
    }

    case 'applyBlock': {
      if(!call) throw new Error('applyBlock: not initialized');
      try {
        await call.applyBlockBytes(req.args.serverBlock);
      } catch(e) {
        emit({kind: 'callFailed', message: (e as Error).message});
        throw e;
      }
      const snap = snapshot();
      emit({kind: 'status', status: snap});
      emit({kind: 'pendingOutbound'});
      return snap;
    }

    case 'buildChangeStateBlock': {
      if(!call) throw new Error('buildChangeStateBlock: not initialized');
      return call.buildChangeStateBlock(req.args.newGroupState);
    }

    case 'pullOutbound': {
      if(!call) throw new Error('pullOutbound: not initialized');
      return call.pullOutbound();
    }

    case 'receiveInbound': {
      if(!call) throw new Error('receiveInbound: not initialized');
      await call.receiveInbound(req.args.serverMessage);
      const snap = snapshot();
      emit({kind: 'status', status: snap});
      // Reveals queue up here; tell host to drain.
      emit({kind: 'pendingOutbound'});
      return snap;
    }

    case 'getStatus':
      return snapshot();

    case 'setSsrcUsers': {
      ssrcToUser.clear();
      for(const [ssrc, userId] of req.args.entries) {
        ssrcToUser.set(ssrc >>> 0, userId);
      }
      return undefined;
    }

    case 'getDebug': {
      const w = self as unknown as {
        __rtcInstalled?: number;
        __rtcEvents?: number;
        __loopState?: Record<string, unknown>;
      };
      return {
        recv: {...__recvDebug},
        send: {...__sendDebug},
        mapSize: ssrcToUser.size,
        mapEntries: Array.from(ssrcToUser.entries()).map(([s, u]) => [s, u.toString()] as [number, string]),
        rtcInstalledAt: w.__rtcInstalled,
        rtcTransformEvents: w.__rtcEvents ?? 0,
        hasOnRtcTransform: typeof (self as unknown as {onrtctransform: unknown}).onrtctransform === 'function',
        loops: w.__loopState ? Object.fromEntries(Object.entries(w.__loopState)) : {}
      };
    }

    case 'destroy': {
      privateKey?.destroy();
      privateKey = undefined;
      call = undefined;
      ssrcToUser.clear();
      return undefined;
    }
  }
}

// SSRC → user_id mapping used by the recv script transform. Maintained by
// the host via `setSsrcUsers` RPC every time the SFU signals participant
// changes. Empty by default — a recv frame with an unknown SSRC is dropped.
const ssrcToUser = new Map<number, bigint>();

self.addEventListener('message', (ev: MessageEvent<HostRequest>) => {
  const req = ev.data;
  const handlePromise = ensureCryptoReady().then(() => handle(req));
  handlePromise.then(
    (result) => post({kind: 'ok', id: req.id, result}),
    (err: Error) => post({kind: 'err', id: req.id, message: err.message || String(err)})
  );
});

// ===== RTCRtpScriptTransform: per-frame encrypt/decrypt =====
//
// Each `new RTCRtpScriptTransform(worker, options)` on the main thread fires
// one `rtctransform` event here. `event.transformer` carries:
//   - readable: incoming encoded frames
//   - writable: outgoing encoded frames
//   - options: opaque bag passed by the host (we use it to identify the
//              stream direction + channelId + sender userId)
//
// The transformer keeps frame order; we just mutate each frame's `data`
// in place. On crypto failure for a single frame we drop it rather than
// breaking the entire pipe — equivalent to the SFU dropping a corrupt RTP
// packet.

interface TransformOptions {
  direction: 'send' | 'recv';
  channelId: number;
  unencryptedPrefixLength?: number;
  // 'audio' frames get a 1- or 2-byte libtgcalls trailer wrapped around the
  // encrypted region; 'video' frames are passed through raw. See
  // appendAudioTrailer / stripAudioTrailer below for the on-wire format —
  // mirrors GroupInstanceCustomImpl.cpp:1466-1525 in the reference
  // libtgcalls. Defaults to 'audio' if omitted so legacy callers still
  // interoperate with the official client (which always expects the
  // trailer on Opus frames).
  kind?: 'audio' | 'video';
}

// RTCEncodedFrame's metadata exposes the synchronizationSource (RTP SSRC) of
// the frame. We use this per-frame to dispatch decryption to the right
// participant's Ed25519 key — Telegram's SFU multiplexes many participants
// onto a single inbound m-line, so a recv transform can't pin to a fixed
// fromUserId at attach time.
interface RTCEncodedFrameMetadata {
  synchronizationSource?: number;
  contributingSources?: number[];
}

interface RTCEncodedFrameLike {
  data: ArrayBuffer;
  getMetadata?: () => RTCEncodedFrameMetadata;
}

function isEncodedFrame(value: unknown): value is RTCEncodedFrameLike {
  return !!value && typeof value === 'object' && 'data' in value;
}

// Copy a Uint8Array view's bytes into a fresh ArrayBuffer (so we never assign
// a SharedArrayBuffer-backed view to `frame.data`, and never alias the input).
function toFreshArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

async function processSend(opts: TransformOptions, frame: RTCEncodedFrameLike): Promise<RTCEncodedFrameLike | undefined> {
  __sendDebug.seen++;
  if(!call) return undefined;
  try {
    const input = new Uint8Array(frame.data);
    const kind = opts.kind ?? 'audio';
    const plain = kind === 'audio' ? appendAudioTrailer(input) : input;
    const encrypted = await call.encrypt(
      opts.channelId,
      plain,
      opts.unencryptedPrefixLength ?? 0
    );
    frame.data = toFreshArrayBuffer(encrypted);
    __sendDebug.ok++;
    return frame;
  } catch(err) {
    __sendDebug.err++;
    __sendDebug.lastErr = (err as Error)?.message?.slice(0, 80) || '';
    return undefined;
  }
}

// Temporary debug counters — strip after J-2 verification.
const __recvDebug = {seen: 0, noMeta: 0, noSsrc: 0, unmapped: 0, decryptOk: 0, decryptErr: 0, lastSsrc: 0, lastErr: ''};
const __sendDebug = {seen: 0, ok: 0, err: 0, lastErr: ''};
(self as unknown as {__e2eDebug?: unknown}).__e2eDebug = {recv: __recvDebug, send: __sendDebug, mapSize: () => ssrcToUser.size};

async function processRecv(opts: TransformOptions, frame: RTCEncodedFrameLike): Promise<RTCEncodedFrameLike | undefined> {
  __recvDebug.seen++;
  if(!call) return frame;
  const meta = frame.getMetadata?.();
  if(!meta) { __recvDebug.noMeta++; return frame; }
  const ssrc = meta?.synchronizationSource;
  if(ssrc === undefined) { __recvDebug.noSsrc++; return frame; }
  __recvDebug.lastSsrc = ssrc >>> 0;
  const fromUserId = ssrcToUser.get(ssrc >>> 0);
  if(fromUserId === undefined) { __recvDebug.unmapped++; return frame; }
  try {
    const encrypted = new Uint8Array(frame.data);
    let decrypted = await call.decrypt(fromUserId, opts.channelId, encrypted);
    const kind = opts.kind ?? 'audio';
    if(kind === 'audio') {
      decrypted = stripAudioTrailer(decrypted);
    }
    frame.data = toFreshArrayBuffer(decrypted);
    __recvDebug.decryptOk++;
    return frame;
  } catch(err) {
    __recvDebug.decryptErr++;
    __recvDebug.lastErr = (err as Error)?.message?.slice(0, 80) || '';
    return frame;
  }
}

// Always install `onrtctransform`. The feature-detection `'onrtctransform' in
// self` guard was wrong: in Chrome the property only exists AFTER the event
// type has been observed, so the guard silently skipped installation and
// frames never flowed through the transform.
(self as unknown as {__rtcInstalled?: number}).__rtcInstalled = Date.now();
(self as any).onrtctransform = (event: any) => {
  (self as unknown as {__rtcEvents?: number}).__rtcEvents = ((self as unknown as {__rtcEvents?: number}).__rtcEvents ?? 0) + 1;
  const transformer = event.transformer;
  const options = transformer.options as TransformOptions;
  const handler = options.direction === 'send' ? processSend : processRecv;

  const w = self as unknown as {__loopState?: Record<string, unknown>};
  w.__loopState = w.__loopState ?? {};
  const loopKey = `${options.direction}-${options.channelId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  w.__loopState[loopKey] = {state: 'starting'};

  // Use the pipeThrough(TransformStream)→pipeTo pattern. Spec-recommended
  // for RTCRtpScriptTransform and used by W3C reference samples — Chrome's
  // recv-side pump consistently halted at ~6 frames with the manual
  // reader/writer pattern, even with no-op handlers. The TransformStream
  // form lets Chrome wire its own backpressure correctly to the decoder.
  w.__loopState[loopKey] = {state: 'loop-entered'};
  const xform = new TransformStream({
    async transform(frame, controller) {
      if(!isEncodedFrame(frame)) {
        controller.enqueue(frame);
        return;
      }
      try {
        const out = await handler(options, frame);
        if(out) {
          controller.enqueue(out);
        }
        // else: drop frame
      } catch(err) {
        w.__loopState![loopKey] = {state: 'transform-threw', err: (err as Error).message};
      }
    }
  });
  transformer.readable.pipeThrough(xform).pipeTo(transformer.writable).catch((err: Error) => {
    w.__loopState![loopKey] = {state: 'pipe-failed', err: err?.message};
  });
};
