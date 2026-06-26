/*
 * Encode/decode for the e2e.chain.* TL types used by the conference call
 * blockchain + emoji-broadcast protocol.
 *
 * Schema source: /Users/kuzmenko/projects/tdlib/td/generate/scheme/e2e_api.tl
 * Constructor magics: see TL_MAGIC in ./tl.ts.
 *
 * Wire format notes:
 *  - `flags:#` writes a uint32 bitmask; `flag.N?T` fields are present only
 *    when bit N is set.
 *  - `flag.N?true` is a marker-only flag — its presence is the value; no
 *    body bytes follow.
 *  - `int64` / `long` is two LE int32 halves; we surface as bigint.
 *  - `int256` / `int512` are raw fixed-length bytes (no length prefix).
 */

import {TL_MAGIC, TLReader, TLWriter} from './tl';

// Permission bits inside groupParticipant.flags.
export const PERM_ADD_USERS = 1 << 0;
export const PERM_REMOVE_USERS = 1 << 1;

// State-proof flags.
const SP_FLAG_GROUP_STATE = 1 << 0;
const SP_FLAG_SHARED_KEY = 1 << 1;

// Block flags.
const BLOCK_FLAG_SIGNATURE_PUBLIC_KEY = 1 << 0;

// ===== GroupParticipant =====

export interface GroupParticipant {
  userId: bigint;
  publicKey: Uint8Array; // 32 bytes
  canAddUsers: boolean;
  canRemoveUsers: boolean;
  version: number; // int32
}

// NOTE on per-element magic: empirically, the server tolerates the magic
// prefix on GroupParticipant elements inside a vector (chain validation
// either way returns CONF_WRITE_CHAIN_INVALID vs BLOCK_INVALID depending
// on combination — both are post-parse errors). Keep magic for symmetry
// with the outer types until a byte-level reference from tdlib pins the
// exact wire convention.
export function encodeGroupParticipant(w: TLWriter, p: GroupParticipant): void {
  w.magic(TL_MAGIC.groupParticipant);
  w.int64(p.userId);
  w.int256(p.publicKey);
  let flags = 0;
  if(p.canAddUsers) flags |= PERM_ADD_USERS;
  if(p.canRemoveUsers) flags |= PERM_REMOVE_USERS;
  w.uint32(flags);
  w.int32(p.version);
}

export function decodeGroupParticipant(r: TLReader): GroupParticipant {
  r.expectMagic(TL_MAGIC.groupParticipant);
  const userId = r.int64();
  const publicKey = new Uint8Array(r.int256());
  const flags = r.uint32();
  const version = r.int32();
  return {
    userId,
    publicKey,
    canAddUsers: (flags & PERM_ADD_USERS) !== 0,
    canRemoveUsers: (flags & PERM_REMOVE_USERS) !== 0,
    version
  };
}

// ===== GroupState =====

export interface GroupState {
  participants: GroupParticipant[];
  externalPermissions: number; // int32 — bitmask of perms for non-members
}

export function encodeGroupState(w: TLWriter, s: GroupState): void {
  w.magic(TL_MAGIC.groupState);
  w.vector(s.participants, (ww, p) => encodeGroupParticipant(ww, p));
  w.int32(s.externalPermissions);
}

export function decodeGroupState(r: TLReader): GroupState {
  r.expectMagic(TL_MAGIC.groupState);
  const participants = r.vector((rr) => decodeGroupParticipant(rr));
  const externalPermissions = r.int32();
  return {participants, externalPermissions};
}

// ===== SharedKey =====

export interface SharedKey {
  // Ephemeral X25519 public key used to encrypt the per-participant headers.
  ek: Uint8Array; // 32 bytes
  // AES-CBC ciphertext of the new random shared secret.
  encryptedSharedKey: Uint8Array;
  // Per-participant header parallel arrays.
  destUserIds: bigint[];
  destHeaders: Uint8Array[];
}

export function encodeSharedKey(w: TLWriter, s: SharedKey): void {
  if(s.destUserIds.length !== s.destHeaders.length) {
    throw new Error(`SharedKey: dest_user_id and dest_header length mismatch (${s.destUserIds.length}/${s.destHeaders.length})`);
  }
  w.magic(TL_MAGIC.sharedKey);
  w.int256(s.ek);
  w.bytes(s.encryptedSharedKey);
  w.vector(s.destUserIds, (ww, id) => ww.int64(id));
  w.vector(s.destHeaders, (ww, h) => ww.bytes(h));
}

export function decodeSharedKey(r: TLReader): SharedKey {
  r.expectMagic(TL_MAGIC.sharedKey);
  const ek = new Uint8Array(r.int256());
  const encryptedSharedKey = new Uint8Array(r.bytes());
  const destUserIds = r.vector((rr) => rr.int64());
  const destHeaders = r.vector((rr) => new Uint8Array(rr.bytes()));
  return {ek, encryptedSharedKey, destUserIds, destHeaders};
}

// ===== Change (union) =====

export type Change =
  | {kind: 'noop'; nonce: Uint8Array}
  | {kind: 'setValue'; key: Uint8Array; value: Uint8Array}
  | {kind: 'setGroupState'; groupState: GroupState}
  | {kind: 'setSharedKey'; sharedKey: SharedKey};

export function encodeChange(w: TLWriter, c: Change): void {
  switch(c.kind) {
    case 'noop':
      w.magic(TL_MAGIC.changeNoop);
      w.int256(c.nonce);
      return;
    case 'setValue':
      w.magic(TL_MAGIC.changeSetValue);
      w.bytes(c.key);
      w.bytes(c.value);
      return;
    case 'setGroupState':
      w.magic(TL_MAGIC.changeSetGroupState);
      encodeGroupState(w, c.groupState);
      return;
    case 'setSharedKey':
      w.magic(TL_MAGIC.changeSetSharedKey);
      encodeSharedKey(w, c.sharedKey);
      return;
  }
}

export function decodeChange(r: TLReader): Change {
  const magic = r.int32() >>> 0;
  switch(magic) {
    case TL_MAGIC.changeNoop:
      return {kind: 'noop', nonce: new Uint8Array(r.int256())};
    case TL_MAGIC.changeSetValue:
      return {
        kind: 'setValue',
        key: new Uint8Array(r.bytes()),
        value: new Uint8Array(r.bytes())
      };
    case TL_MAGIC.changeSetGroupState:
      return {kind: 'setGroupState', groupState: decodeGroupState(r)};
    case TL_MAGIC.changeSetSharedKey:
      return {kind: 'setSharedKey', sharedKey: decodeSharedKey(r)};
    default:
      throw new Error(`decodeChange: unknown magic ${magic.toString(16)}`);
  }
}

// ===== StateProof =====

export interface StateProof {
  kvHash: Uint8Array; // 32 bytes — root hash of the kv trie
  groupState?: GroupState;
  sharedKey?: SharedKey;
}

export function encodeStateProof(w: TLWriter, p: StateProof): void {
  w.magic(TL_MAGIC.stateProof);
  let flags = 0;
  if(p.groupState !== undefined) flags |= SP_FLAG_GROUP_STATE;
  if(p.sharedKey !== undefined) flags |= SP_FLAG_SHARED_KEY;
  w.uint32(flags);
  w.int256(p.kvHash);
  if(p.groupState !== undefined) encodeGroupState(w, p.groupState);
  if(p.sharedKey !== undefined) encodeSharedKey(w, p.sharedKey);
}

export function decodeStateProof(r: TLReader): StateProof {
  r.expectMagic(TL_MAGIC.stateProof);
  const flags = r.uint32();
  const kvHash = new Uint8Array(r.int256());
  const groupState = (flags & SP_FLAG_GROUP_STATE) ? decodeGroupState(r) : undefined;
  const sharedKey = (flags & SP_FLAG_SHARED_KEY) ? decodeSharedKey(r) : undefined;
  return {kvHash, groupState, sharedKey};
}

// ===== Block =====

export interface Block {
  // 64-byte Ed25519 signature over the same TL encoding with this field
  // replaced by 64 zero bytes (NOT omitted). See blockchain.md.
  signature: Uint8Array;
  prevBlockHash: Uint8Array; // 32 bytes (UInt256(0) for the zero block)
  changes: Change[];
  height: number; // int32 — must be exactly prev.height + 1
  stateProof: StateProof;
  // When omitted, the signer is the first participant in group_state.
  signaturePublicKey?: Uint8Array;
}

export function encodeBlock(w: TLWriter, b: Block): void {
  w.magic(TL_MAGIC.block);
  w.int512(b.signature);
  let flags = 0;
  if(b.signaturePublicKey !== undefined) flags |= BLOCK_FLAG_SIGNATURE_PUBLIC_KEY;
  w.uint32(flags);
  w.int256(b.prevBlockHash);
  w.vector(b.changes, (ww, c) => encodeChange(ww, c));
  w.int32(b.height);
  encodeStateProof(w, b.stateProof);
  if(b.signaturePublicKey !== undefined) w.int256(b.signaturePublicKey);
}

export function decodeBlock(r: TLReader): Block {
  r.expectMagic(TL_MAGIC.block);
  const signature = new Uint8Array(r.int512());
  const flags = r.uint32();
  const prevBlockHash = new Uint8Array(r.int256());
  const changes = r.vector((rr) => decodeChange(rr));
  const height = r.int32();
  const stateProof = decodeStateProof(r);
  const signaturePublicKey = (flags & BLOCK_FLAG_SIGNATURE_PUBLIC_KEY) ? new Uint8Array(r.int256()) : undefined;
  // A block is always the whole buffer — reject trailing bytes (tdlib
  // from_tl_serialized calls fetch_end()). The server controls these bytes.
  if(!r.eof()) throw new Error('decodeBlock: trailing data after block');
  return {signature, prevBlockHash, changes, height, stateProof, signaturePublicKey};
}

// Serialize a block to wire bytes.
export function serializeBlock(b: Block): Uint8Array {
  const w = new TLWriter();
  encodeBlock(w, b);
  return w.finish();
}

// Serialize for signature verification: same as serializeBlock but with the
// 64-byte signature field zeroed. The block hash, by contrast, uses the
// real signature in place (see blockchain.md "Signature serialization is
// the trap").
export function serializeBlockForSigning(b: Block): Uint8Array {
  return serializeBlock({...b, signature: new Uint8Array(64)});
}

// ===== GroupBroadcastNonceCommit / Reveal =====

export interface GroupBroadcastNonceCommit {
  signature: Uint8Array;
  userId: bigint;
  chainHeight: number;
  chainHash: Uint8Array;
  nonceHash: Uint8Array;
}

export interface GroupBroadcastNonceReveal {
  signature: Uint8Array;
  userId: bigint;
  chainHeight: number;
  chainHash: Uint8Array;
  nonce: Uint8Array;
}

export type GroupBroadcast =
  | ({kind: 'commit'} & GroupBroadcastNonceCommit)
  | ({kind: 'reveal'} & GroupBroadcastNonceReveal);

export function encodeGroupBroadcastNonceCommit(w: TLWriter, b: GroupBroadcastNonceCommit): void {
  w.magic(TL_MAGIC.groupBroadcastNonceCommit);
  w.int512(b.signature);
  w.int64(b.userId);
  w.int32(b.chainHeight);
  w.int256(b.chainHash);
  w.int256(b.nonceHash);
}

export function encodeGroupBroadcastNonceReveal(w: TLWriter, b: GroupBroadcastNonceReveal): void {
  w.magic(TL_MAGIC.groupBroadcastNonceReveal);
  w.int512(b.signature);
  w.int64(b.userId);
  w.int32(b.chainHeight);
  w.int256(b.chainHash);
  w.int256(b.nonce);
}

export function decodeGroupBroadcast(r: TLReader): GroupBroadcast {
  const magic = r.int32() >>> 0;
  let result: GroupBroadcast;
  if(magic === TL_MAGIC.groupBroadcastNonceCommit) {
    result = {
      kind: 'commit',
      signature: new Uint8Array(r.int512()),
      userId: r.int64(),
      chainHeight: r.int32(),
      chainHash: new Uint8Array(r.int256()),
      nonceHash: new Uint8Array(r.int256())
    };
  } else if(magic === TL_MAGIC.groupBroadcastNonceReveal) {
    result = {
      kind: 'reveal',
      signature: new Uint8Array(r.int512()),
      userId: r.int64(),
      chainHeight: r.int32(),
      chainHash: new Uint8Array(r.int256()),
      nonce: new Uint8Array(r.int256())
    };
  } else {
    throw new Error(`decodeGroupBroadcast: unknown magic ${magic.toString(16)}`);
  }
  // Reject trailing bytes (tdlib fetch_end()); these are server-controlled.
  if(!r.eof()) throw new Error('decodeGroupBroadcast: trailing data after broadcast');
  return result;
}
