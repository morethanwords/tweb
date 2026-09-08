/*
 * Web Worker that owns the E2eCall instance for one conference call.
 *
 * - Holds the long-lived Ed25519 private key + the derived shared keys, so
 *   they never traverse the postMessage boundary in any form the main thread
 *   could exfiltrate.
 * - Handles RPC requests via the protocol in `encryptWorkerProtocol.ts`.
 * - Emits asynchronous `status` events after every mutation so the host
 *   doesn't need to poll.
 * - Serves as the `RTCRtpScriptTransform` worker:
 *   the host attaches `new RTCRtpScriptTransform(worker, {direction, ...})`
 *   to each RTPSender/RTPReceiver, and this worker's `onrtctransform`
 *   handler pumps frames through `call.encrypt` / `call.decrypt`.
 */

import {appendAudioTrailer, stripAudioTrailer} from './audioTrailer';
import {normalizeSsrc} from '@lib/calls/utils';
import createSerializedQueue from '@helpers/createSerializedQueue';
import {E2eCall} from './call';
import {ensureCryptoReady, randomBytes} from './crypto';
import type {CallStatusSnapshot, HostRequest, HostResponse, WorkerEvent} from './encryptWorkerProtocol';
import {PrivateKey} from './keys';

declare const self: DedicatedWorkerGlobalScope;

let call: E2eCall | undefined;
// The call's signing key. Born here in `createKey` — the host only ever learns
// the public half — or derived from a request's explicit seed (unit tests).
let privateKey: PrivateKey | undefined;
// Exact LOCAL-format block returned to the host by prepareRejoinBlock. The
// host can only commit this retained proposal after the join RPC accepts it;
// it cannot substitute arbitrary state in the commit phase.
let pendingRejoinBlock: Uint8Array | undefined;

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

// `postMessage` gives this worker its own structured-clone copy of the seed.
// Deriving the libsodium keypair is synchronous, so the request copy has no
// reason to survive beyond fromSeed() even when the following async operation
// fails or stalls.
function consumePrivateSeed(seed: Uint8Array): PrivateKey {
  try {
    return PrivateKey.fromSeed(seed);
  } finally {
    seed.fill(0);
  }
}

// The key a request signs with: its own seed when it carries one (the caller
// destroys that key when done), otherwise the one `createKey` retained.
function requestKey(privateSeed: Uint8Array | undefined): {key: PrivateKey; owned: boolean} {
  if(privateSeed) return {key: consumePrivateSeed(privateSeed), owned: true};
  if(!privateKey) throw new Error('no signing key: createKey first');
  return {key: privateKey, owned: false};
}

// Wrap any handler so unhandled errors come back as `err` responses instead
// of crashing the worker.
async function handle(req: HostRequest): Promise<unknown> {
  switch(req.kind) {
    case 'createKey': {
      if(call) throw new Error('createKey: already initialized');
      privateKey?.destroy();
      privateKey = consumePrivateSeed(randomBytes(32));
      return new Uint8Array(privateKey.publicKeyBytes);
    }

    case 'createZeroBlock': {
      const {key, owned} = requestKey(req.args.privateSeed);
      try {
        return await E2eCall.createZeroBlock(key, req.args.groupState);
      } finally {
        if(owned) key.destroy();
      }
    }

    case 'createSelfAddBlock': {
      const {key, owned} = requestKey(req.args.privateSeed);
      try {
        return await E2eCall.createSelfAddBlock(
          key,
          req.args.previousBlockServer,
          req.args.self
        );
      } finally {
        if(owned) key.destroy();
      }
    }

    case 'init': {
      if(call) {
        req.args.privateSeed?.fill(0);
        throw new Error('init: already initialized');
      }
      pendingRejoinBlock = undefined;
      const {key, owned} = requestKey(req.args.privateSeed);
      // An explicit seed supersedes whatever createKey retained. Either way the
      // key is off-globals while hydrating, so a failed init leaves no orphan
      // behind and both references are published together on success.
      if(owned) privateKey?.destroy();
      privateKey = undefined;
      try {
        const nextCall = await E2eCall.create(req.args.userId, key, req.args.lastBlockServer);
        privateKey = key;
        call = nextCall;
      } catch(e) {
        key.destroy();
        throw e;
      }
      const snap = snapshot();
      emit({kind: 'status', status: snap});
      // Initial verification round always queues a commit broadcast.
      emit({kind: 'pendingOutbound'});
      return snap;
    }

    case 'prepareRejoinBlock': {
      if(!call || !privateKey) throw new Error('prepareRejoinBlock: not initialized');
      if(req.args.self.userId !== call.userId) {
        throw new Error('prepareRejoinBlock: self user_id does not match the live call');
      }
      pendingRejoinBlock = undefined;
      const block = await E2eCall.createSelfAddBlock(
        privateKey,
        req.args.previousBlockServer,
        req.args.self
      );
      pendingRejoinBlock = block;
      return block;
    }

    case 'commitRejoinBlock': {
      if(!call) throw new Error('commitRejoinBlock: not initialized');
      if(!pendingRejoinBlock) throw new Error('commitRejoinBlock: no prepared block');
      await call.reanchor(pendingRejoinBlock);
      pendingRejoinBlock = undefined;
      const snap = snapshot();
      emit({kind: 'status', status: snap});
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

    case 'buildRemoveParticipantsBlock': {
      if(!call) throw new Error('buildRemoveParticipantsBlock: not initialized');
      return call.buildRemoveParticipantsBlock(req.args.userIds);
    }

    case 'pullOutbound': {
      if(!call) throw new Error('pullOutbound: not initialized');
      const verification = call.getVerificationState();
      if(!verification) return [];
      return call.pullOutbound().map((bytes) => ({bytes, height: verification.height}));
    }

    case 'receiveInbound': {
      if(!call) throw new Error('receiveInbound: not initialized');
      const disposition = await call.receiveInbound(req.args.serverMessage);
      const snap = snapshot();
      emit({kind: 'status', status: snap});
      // Reveals queue up here; tell host to drain.
      if(disposition === 'consumed') emit({kind: 'pendingOutbound'});
      return {status: snap, disposition};
    }

    case 'getStatus':
      return snapshot();

    case 'setSsrcUsers': {
      ssrcToUser.clear();
      for(const [ssrc, userId] of req.args.entries) {
        ssrcToUser.set(normalizeSsrc(ssrc), userId);
      }
      // Re-arm recv diagnostics: drop now-mapped SSRCs from the unmapped
      // counter (so a future un-mapping reports again) and reset decrypt-error
      // counters for the new key epoch.
      for(const ssrc of [...unmappedFrames.keys()]) {
        if(ssrcToUser.has(ssrc)) unmappedFrames.delete(ssrc);
      }
      decryptErrFrames.clear();
      return undefined;
    }

    case 'destroy': {
      // Epoch keys and the pending verification nonce live in the call, the
      // signing key here — wipe both, not just the key.
      call?.destroy();
      call = undefined;
      privateKey?.destroy();
      privateKey = undefined;
      pendingRejoinBlock = undefined;
      ssrcToUser.clear();
      return undefined;
    }
  }
}

// SSRC → user_id mapping used by the recv script transform. Maintained by
// the host via `setSsrcUsers` RPC every time the SFU signals participant
// changes. Empty by default — a recv frame with an unknown SSRC is dropped.
const ssrcToUser = new Map<number, bigint>();

// Per-SSRC counts of frames we couldn't turn into plaintext, driving the
// `recvDiag` breadcrumb (see WorkerEvent): emit once on first sighting, then
// once more with `sustained:true` after RECV_DIAG_SUSTAINED_FRAMES — so a
// transient at-join blip (frames arriving a beat before setSsrcUsers) is
// distinguishable from a stuck stream (the "seen but not heard" bug). Re-armed
// in setSsrcUsers when an SSRC becomes mapped / on a successful decrypt. Cheap:
// only touched on the (rare in a healthy call) failure branches.
// 150 frames ≈ 3s of 50fps Opus / ~5s of 30fps VP8 — comfortably past transient.
const RECV_DIAG_SUSTAINED_FRAMES = 150;
const unmappedFrames = new Map<number, number>();
const decryptErrFrames = new Map<number, number>();

// Stateful RPCs MUST NOT interleave. `handle` is async and every mutating
// branch (init / applyBlock / receiveInbound / buildRemoveParticipantsBlock) reads
// `call`'s state, awaits crypto, then writes it back — so two handlers running
// concurrently tear that read-modify-write apart. The chain deliberately
// races: `updateGroupCallChainBlocks` pushes blocks fire-and-forget while the
// 1.5s poll fetches the same window, so concurrent delivery is the normal case,
// not an exotic one.
//
// Two observed consequences, both closed by serialising here:
//   - applyBlock ran twice against the same pre-block state, so BOTH passed the
//     height check and the second died on HEIGHT_MISMATCH, which sets the
//     sticky `status` and bricks the call for good.
//   - updateGroupSharedKey pushed an epoch pairing the OLD block's shared key
//     with the NEW block's epoch_hash. That entry already claims the tip
//     height, so it was never queued into `epochsToForget` and never expired —
//     and since encryptPacket emits one header_b slot per active epoch, every
//     later frame stayed readable by whoever held the superseded key (i.e. a
//     participant the rekey was supposed to remove).
//
// tdlib gets this from a per-Call mutex: `call_apply_block` takes
// `Container::get_unique<Call>()` (Container.h:203-221), which holds the lock
// for the whole call, so apply_block and update_group_shared_key are atomic
// with respect to each other. A single tail promise is the JS equivalent.
//
// Read-only requests ride the same queue: they are cheap, and answering
// `getStatus` from halfway through a block application would report a state
// that never existed.
const rpcQueue = createSerializedQueue();

self.addEventListener('message', (ev: MessageEvent<HostRequest>) => {
  const req = ev.data;
  // The queue stays alive across a rejected handler — a failed request must
  // not wedge every request behind it.
  const handlePromise = rpcQueue.enqueue(() => ensureCryptoReady().then(() => handle(req)));
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
//
// BOTH directions MUST fail closed — a frame we cannot turn into authenticated
// plaintext never reaches the decoder, and a frame we cannot encrypt never
// reaches the wire. Forwarding an undecryptable inbound frame is not merely
// "the user hears noise": it hands the relay a media-injection channel, because
// a plaintext Opus/VP8 frame the relay makes up decodes perfectly well. That
// would defeat the per-frame Ed25519 sender signature, whose entire purpose is
// that unsigned frames are not rendered. The reference does the same — see
// libtgcalls GroupInstanceCustomImpl.cpp:1494, where the frame is forwarded to
// the sink ONLY when the transform returned a non-empty result, with no else
// branch.

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

// VP8 plaintext prefix — port of libtgcalls calculateVp8FramePlaintextHeaderSize
// (GroupInstanceCustomImpl.cpp). The SFU and the receiving decoder must see the
// VP8 payload header in the clear: a key frame (P bit == 0) keeps 10 bytes (the
// full uncompressed VP8 header incl. dimensions), a delta frame keeps 1 byte.
// Telegram conferences negotiate VP8 only (verified live against an iOS peer);
// H264's NAL-start-code-rewrite path is not implemented here.
function vp8PlaintextPrefixLength(frame: Uint8Array): number {
  if(frame.length === 0) return 0;
  const isKeyFrame = (frame[0] & 0x01) === 0; // VP8 payload header P bit: 0 = key frame
  return Math.min(isKeyFrame ? 10 : 1, frame.length);
}

async function processSend(opts: TransformOptions, frame: RTCEncodedFrameLike): Promise<RTCEncodedFrameLike | undefined> {
  if(!call) return undefined;
  try {
    const input = new Uint8Array(frame.data);
    const kind = opts.kind ?? 'audio';
    // Audio: append the 2-byte level/flag trailer to the plaintext before
    // encryption. Video (VP8): leave the codec header unencrypted via a
    // per-frame plaintext prefix so the SFU + peer decoder can parse the frame.
    // Encrypting the whole video frame (prefix 0) was exactly why outbound
    // video was undecodable at the peer while audio + inbound video worked.
    const plain = kind === 'audio' ? appendAudioTrailer(input) : input;
    const unencryptedPrefixLength = kind === 'audio' ?
      (opts.unencryptedPrefixLength ?? 0) :
      vp8PlaintextPrefixLength(input);
    const encrypted = await call.encrypt(
      opts.channelId,
      plain,
      unencryptedPrefixLength
    );
    frame.data = toFreshArrayBuffer(encrypted);
    return frame;
  } catch{
    return undefined;
  }
}

async function processRecv(opts: TransformOptions, frame: RTCEncodedFrameLike): Promise<RTCEncodedFrameLike | undefined> {
  // Every bail below returns `undefined` (drop). See the fail-closed note above:
  // anything we can't authenticate must not reach the decoder, however benign
  // the cause looks — the relay picks what arrives here.
  if(!call) return undefined;
  const meta = frame.getMetadata?.();
  if(!meta) return undefined;
  const ssrc = meta?.synchronizationSource;
  if(ssrc === undefined) return undefined;
  const fromUserId = ssrcToUser.get(normalizeSsrc(ssrc));
  if(fromUserId === undefined) {
    const key = normalizeSsrc(ssrc);
    const n = (unmappedFrames.get(key) || 0) + 1;
    unmappedFrames.set(key, n);
    if(n === 1) emit({kind: 'recvDiag', ssrc: key, reason: 'unmapped'});
    else if(n === RECV_DIAG_SUSTAINED_FRAMES) emit({kind: 'recvDiag', ssrc: key, reason: 'unmapped', sustained: true});
    return undefined;
  }
  try {
    const encrypted = new Uint8Array(frame.data);
    let decrypted = await call.decrypt(fromUserId, opts.channelId, encrypted);
    const kind = opts.kind ?? 'audio';
    if(kind === 'audio') {
      decrypted = stripAudioTrailer(decrypted);
    }
    frame.data = toFreshArrayBuffer(decrypted);
    // Recovered — let a later error on this SSRC report afresh.
    if(decryptErrFrames.size) decryptErrFrames.delete(normalizeSsrc(ssrc));
    return frame;
  } catch(err) {
    const message = (err as Error)?.message?.slice(0, 80) || '';
    const key = normalizeSsrc(ssrc);
    const n = (decryptErrFrames.get(key) || 0) + 1;
    decryptErrFrames.set(key, n);
    if(n === 1) emit({kind: 'recvDiag', ssrc: key, reason: 'decryptErr', message});
    else if(n === RECV_DIAG_SUSTAINED_FRAMES) emit({kind: 'recvDiag', ssrc: key, reason: 'decryptErr', sustained: true, message});
    return undefined;
  }
}

// Always install `onrtctransform`. The feature-detection `'onrtctransform' in
// self` guard was wrong: in Chrome the property only exists AFTER the event
// type has been observed, so the guard silently skipped installation and
// frames never flowed through the transform.
(self as any).onrtctransform = (event: any) => {
  const transformer = event.transformer;
  const options = transformer.options as TransformOptions;
  const handler = options.direction === 'send' ? processSend : processRecv;

  // Use the pipeThrough(TransformStream)→pipeTo pattern. Spec-recommended
  // for RTCRtpScriptTransform and used by W3C reference samples — Chrome's
  // recv-side pump consistently halted at ~6 frames with the manual
  // reader/writer pattern, even with no-op handlers. The TransformStream
  // form lets Chrome wire its own backpressure correctly to the decoder.
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
      } catch{
        // Fail closed: a transform error drops this frame.
      }
    }
  });
  transformer.readable.pipeThrough(xform).pipeTo(transformer.writable).catch(() => {});
};
