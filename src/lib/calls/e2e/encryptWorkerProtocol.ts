/*
 * Message protocol between the main thread and the e2e encrypt worker.
 *
 * The worker owns the E2eCall instance (and therefore the long-lived
 * Ed25519 private key + derived shared keys), so the main thread NEVER sees
 * raw key material. Requests are RPC-style with a numeric `id`; the worker
 * replies with `{kind: 'ok' | 'err', id, ...}`. Asynchronous state updates
 * use `{kind: 'event', event}` and are not tied to a request id.
 *
 * All Uint8Arrays and bigints traverse the postMessage boundary via
 * structured clone (no manual transferables) — keeps both sides simple at
 * the cost of one copy per message. If profiling shows this matters for the
 * per-frame crypto path, we can swap to transferables later.
 */

import type {VerificationStateSnapshot} from './emoji';
import type {GroupParticipant, GroupState} from './tlTypes';

// ===== Requests (main → worker) =====

export type HostRequest =
  | {kind: 'createZeroBlock'; id: number; args: {
      privateSeed: Uint8Array;
      groupState: GroupState;
    }}
  | {kind: 'createSelfAddBlock'; id: number; args: {
      privateSeed: Uint8Array;
      previousBlockServer: Uint8Array;
      self: GroupParticipant;
    }}
  | {kind: 'init'; id: number; args: {
      userId: bigint;
      privateSeed: Uint8Array;
      lastBlockServer: Uint8Array;
    }}
  // Two-phase, seedless rejoin. prepareRejoinBlock signs a replacement
  // self-add block with the worker's existing private key and retains the exact
  // bytes. Once phone.joinGroupCall accepts them, commitRejoinBlock atomically
  // re-anchors the live E2eCall without exposing or re-sending the seed.
  | {kind: 'prepareRejoinBlock'; id: number; args: {
      previousBlockServer: Uint8Array;
      self: GroupParticipant;
    }}
  | {kind: 'commitRejoinBlock'; id: number}
  | {kind: 'applyBlock'; id: number; args: {
      serverBlock: Uint8Array;
    }}
  | {kind: 'buildRemoveParticipantsBlock'; id: number; args: {
      userIds: bigint[];
    }}
  | {kind: 'pullOutbound'; id: number}
  | {kind: 'receiveInbound'; id: number; args: {
      serverMessage: Uint8Array;
    }}
  | {kind: 'getStatus'; id: number}
  // Push the SSRC → user_id table the host has accumulated from SFU signaling.
  // The receive-side script transform consults this table per-frame: WebRTC
  // delivers `frame.getMetadata().synchronizationSource`, we look up the
  // sender, and verify with that user's Ed25519 key. Telegram's SFU
  // multiplexes many participants over a single inbound m-line, so a single
  // recv transform must dispatch by SSRC — we can't bake `fromUserId` in
  // at attach time.
  | {kind: 'setSsrcUsers'; id: number; args: {
      // Pairs serialize cleanly across postMessage; bigint values are fine
      // under structured clone.
      entries: Array<[number, bigint]>;
    }}
  | {kind: 'destroy'; id: number};

// ===== Responses (worker → main) =====

// Boxed snapshot of the call's externally-visible state. Emitted as an event
// after every state-mutating operation so the host can drive UI without
// polling.
export interface CallStatusSnapshot {
  height: number;
  groupState: GroupState;
  lastBlockHash: Uint8Array;
  verification: VerificationStateSnapshot | undefined;
  // null while healthy, a string code/message once a fatal error has poisoned
  // the call.
  failed: string | null;
}

export interface OutboundBroadcast {
  bytes: Uint8Array;
  // Verification height that produced these bytes. The host drops queued
  // messages from older rounds as soon as a newer status arrives.
  height: number;
}

export interface ReceiveInboundResult {
  status: CallStatusSnapshot;
  // `dropped` means the future-broadcast buffer did not retain this item (a
  // far-future height, or a full buffer with nothing worth evicting). It is
  // consumed either way: the host advances the subchain cursor and leaves a
  // breadcrumb. Parking the cursor on such an item stalled every later
  // verification round.
  disposition: 'consumed' | 'dropped';
}

export type WorkerEvent =
  | {kind: 'status'; status: CallStatusSnapshot}
  | {kind: 'pendingOutbound'} // hint: call pullOutbound()
  | {kind: 'callFailed'; message: string}
  // Recv-transform breadcrumb. Emitted (deduped, at most once per ssrc+reason)
  // when an inbound frame can't be turned into plaintext: either its SSRC has
  // no user mapping (`unmapped` — the sender's audio/video SSRC never made it
  // into setSsrcUsers, so the frame is dropped → "seen but not heard") or
  // decryption threw (`decryptErr` — usually a stale group key). Both cases drop
  // the frame: the recv transform fails closed (see encryptWorker.ts).
  // This stays on in production so the failure leaves a trace in exported
  // logs. `sustained` is set on the re-emit once the condition has persisted
  // for many frames (not a transient at-join blip) — the host escalates that
  // to a user-facing breadcrumb.
  | {kind: 'recvDiag'; ssrc: number; reason: 'unmapped' | 'decryptErr'; message?: string; sustained?: boolean};

export type HostResponse =
  | {kind: 'ok'; id: number; result: unknown}
  | {kind: 'err'; id: number; message: string}
  | {kind: 'event'; event: WorkerEvent};

// ===== Result-shape contracts (compile-time only) =====
//
// For each request kind, the result placed in HostResponse.ok.result must
// match this map. The worker + host both consult this so the proxy can
// type the awaited result correctly.

export interface RequestResultMap {
  createZeroBlock: Uint8Array; // server-format block bytes
  createSelfAddBlock: Uint8Array;
  init: CallStatusSnapshot;
  prepareRejoinBlock: Uint8Array;
  commitRejoinBlock: CallStatusSnapshot;
  applyBlock: CallStatusSnapshot;
  buildRemoveParticipantsBlock: {
    block: Uint8Array;
    removedUserIds: bigint[];
  } | undefined;
  pullOutbound: OutboundBroadcast[];
  receiveInbound: ReceiveInboundResult;
  getStatus: CallStatusSnapshot;
  setSsrcUsers: void;
  destroy: void;
}

export type RequestKind = keyof RequestResultMap;
