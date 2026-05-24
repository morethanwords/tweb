/*
 * Client-side blockchain state machine for TdE2E conference calls.
 *
 * Port scope: validate + apply blocks received from the server. We do not
 * MAINT a full kv trie (server-only) — we trust the state proof's kv_hash
 * after verifying signature + height + prev_hash + canonical state proof
 * fields (group_state, shared_key).
 *
 * Spec: src/lib/calls/e2e/notes/blockchain.md + Encryption.md.
 * Reference: tdlib/tde2e/td/e2e/Blockchain.{cpp,h}.
 */

import {
  bytesToHex,
  computeSharedSecret,
  constantTimeEqual,
  ed25519GenerateKeyPair,
  ed25519Verify,
  randomBytes,
  sha256
} from './crypto';
import {PrivateKey} from './keys';
import {encryptData, encryptHeader} from './messageEncryption';
import {
  Block,
  Change,
  encodeBlock,
  GroupParticipant,
  GroupState,
  PERM_ADD_USERS,
  PERM_REMOVE_USERS,
  SharedKey,
  serializeBlock,
  serializeBlockForSigning,
  StateProof
} from './tlTypes';
import {TLWriter} from './tl';

export class BlockchainError extends Error {
  constructor(public readonly code: BlockchainErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'BlockchainError';
  }
}

export type BlockchainErrorCode =
  | 'HEIGHT_MISMATCH'
  | 'PREVIOUS_BLOCK_HASH_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'INVALID_STATE_PROOF'
  | 'UNKNOWN_SIGNER'
  | 'NO_PARTICIPANTS';

const ZERO_HASH = new Uint8Array(32); // UInt256(0) — predecessor of the zero block

// Block height before any block is applied. Receiving a height-0 block (the
// "zero block") moves height to 0.
const HEIGHT_BEFORE_ZERO = -1;

// Empty trie root hash = SHA-256 of int32(TrieNodeType::Empty=0) = SHA-256(4
// little-endian zero bytes) = df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119.
// Server REJECTS the zero block (CONF_WRITE_CHAIN_INVALID) if state_proof.kv_hash
// doesn't equal this value — using 32 zero bytes is wrong. See tdlib Trie.cpp:93
// `compute_hash` + Trie.h:24 `enum TrieNodeType : Empty=0, ...`.
const EMPTY_TRIE_ROOT_HASH = new Uint8Array([
  0xdf, 0x3f, 0x61, 0x98, 0x04, 0xa9, 0x2f, 0xdb,
  0x40, 0x57, 0x19, 0x2d, 0xc4, 0x3d, 0xd7, 0x48,
  0xea, 0x77, 0x8a, 0xdc, 0x52, 0xbc, 0x49, 0x8c,
  0xe8, 0x05, 0x24, 0xc0, 0x14, 0xb8, 0x11, 0x19
]);

export interface ClientBlockchainState {
  height: number;
  lastBlockHash: Uint8Array; // 32 bytes
  groupState: GroupState; // empty participants array before first block
  sharedKey: SharedKey | undefined;
  // We track the KV root *hash only*, not the trie itself (see scope note).
  kvHash: Uint8Array; // 32 bytes — root hash of the kv trie
}

export function createInitialState(): ClientBlockchainState {
  return {
    height: HEIGHT_BEFORE_ZERO,
    lastBlockHash: new Uint8Array(ZERO_HASH),
    groupState: {participants: [], externalPermissions: 0},
    sharedKey: undefined,
    kvHash: new Uint8Array(EMPTY_TRIE_ROOT_HASH)
  };
}

// Compute the canonical block hash: SHA256 of the TL-serialized block with
// the real signature in place (NOT zeroed — that's the input to ED25519
// verify; the hash uses the actual signature bytes).
export async function computeBlockHash(block: Block): Promise<Uint8Array> {
  return sha256(serializeBlock(block));
}

// Extract permission bitmask from a participant entry.
function participantPermissions(p: GroupParticipant): number {
  let perms = 0;
  if(p.canAddUsers) perms |= PERM_ADD_USERS;
  if(p.canRemoveUsers) perms |= PERM_REMOVE_USERS;
  return perms;
}

// Look up a participant by raw 32-byte public key.
function findParticipant(state: GroupState, pubKey: Uint8Array): GroupParticipant | undefined {
  for(const p of state.participants) {
    if(constantTimeEqual(p.publicKey, pubKey)) return p;
  }
  return undefined;
}

// Resolve the public key that signed a block. If signaturePublicKey is set
// explicitly, that's the answer; otherwise (per the TL optimization) it's
// the first participant in the group_state's participants list.
function resolveSignerPublicKey(block: Block, state: GroupState): Uint8Array {
  if(block.signaturePublicKey) return block.signaturePublicKey;
  const first = state.participants[0];
  if(!first) {
    throw new BlockchainError('UNKNOWN_SIGNER',
      'block omits signature_public_key and group_state has no participants');
  }
  return first.publicKey;
}

// Apply a block to a state, producing the new state. Throws BlockchainError
// on any validation failure. The input state is NOT mutated.
//
// Order of checks matches blockchain.md and tdlib's apply algorithm:
//   1. height = state.height + 1
//   2. prev_block_hash == state.lastBlockHash
//   3. Ed25519 signature over block-with-signature-zeroed
//   4. Apply changes (track current effective group_state + shared_key + kv_hash)
//   5. State proof matches the post-application state
//
// Permission checks per change are intentionally skipped in this client
// port — the server enforces them, and re-checking on the client would
// require also tracking external_permissions inheritance subtleties that
// blockchain.md flags as gotchas. We can revisit if we ever need to reject
// blocks from a misbehaving server.
export async function applyBlock(
  state: ClientBlockchainState,
  block: Block
): Promise<ClientBlockchainState> {
  // 1. Height
  const expectedHeight = state.height + 1;
  if(block.height !== expectedHeight) {
    throw new BlockchainError(
      'HEIGHT_MISMATCH',
      `block height ${block.height} != expected ${expectedHeight}`
    );
  }

  // 2. Previous block hash
  if(!constantTimeEqual(block.prevBlockHash, state.lastBlockHash)) {
    throw new BlockchainError(
      'PREVIOUS_BLOCK_HASH_MISMATCH',
      `expected ${bytesToHex(state.lastBlockHash)}, got ${bytesToHex(block.prevBlockHash)}`
    );
  }

  // 3. Signature — first we need to know who signed.
  // For the zero block the signer is in block.signaturePublicKey OR in the
  // SetGroupState change of this very block (chicken-and-egg). The spec's
  // workaround: zero-block predecessor has external_permissions = ALL and
  // the signer's key must appear either in block.signaturePublicKey or be
  // recoverable from the first SetGroupState change.
  let signerPubKey: Uint8Array;
  if(state.height === HEIGHT_BEFORE_ZERO) {
    // Zero block: signer must be explicit (signaturePublicKey set), OR derive
    // from the new group state in changes.
    if(block.signaturePublicKey) {
      signerPubKey = block.signaturePublicKey;
    } else {
      const setGroup = block.changes.find((c) => c.kind === 'setGroupState');
      if(!setGroup || setGroup.kind !== 'setGroupState' || !setGroup.groupState.participants[0]) {
        throw new BlockchainError(
          'UNKNOWN_SIGNER',
          'zero block: cannot resolve signer (no signaturePublicKey and no participants in SetGroupState)'
        );
      }
      signerPubKey = setGroup.groupState.participants[0].publicKey;
    }
  } else {
    signerPubKey = resolveSignerPublicKey(block, state.groupState);
  }

  const toVerify = serializeBlockForSigning(block);
  if(!ed25519Verify(signerPubKey, toVerify, block.signature)) {
    throw new BlockchainError('INVALID_SIGNATURE', 'Ed25519 verify failed');
  }

  // 4. Apply changes — produce the post-application state.
  let groupState: GroupState = state.groupState;
  let sharedKey: SharedKey | undefined = state.sharedKey;
  let kvHash: Uint8Array = state.kvHash;
  let kvHashDirty = false;

  for(const change of block.changes) {
    switch(change.kind) {
      case 'noop':
        break;
      case 'setValue':
        // We don't maintain the full kv trie — flag that the state-proof
        // kv_hash MUST be present and is the only thing we can verify against.
        kvHashDirty = true;
        break;
      case 'setGroupState':
        groupState = change.groupState;
        sharedKey = undefined; // automatically cleared per spec
        break;
      case 'setSharedKey':
        sharedKey = change.sharedKey;
        break;
    }
  }

  // 5. State proof validation. The proof carries kv_hash + (optionally)
  //   group_state + shared_key. The optionals are OMITTED when they're
  //   derivable from this block's changes — per blockchain.md.
  const proof = block.stateProof;

  // KV hash: when SetValue changes occurred, we trust the proof's kv_hash
  // and adopt it. Without dirty kv, the proof's hash must match prior state.
  if(kvHashDirty) {
    kvHash = new Uint8Array(proof.kvHash);
  } else if(!constantTimeEqual(proof.kvHash, kvHash)) {
    throw new BlockchainError(
      'INVALID_STATE_PROOF',
      'state-proof kv_hash diverges from prior state with no SetValue changes'
    );
  }

  // Group state field of the proof.
  const hasSetGroupChange = block.changes.some((c) => c.kind === 'setGroupState');
  if(proof.groupState !== undefined) {
    // Proof carries an explicit group_state — must match the post-state.
    if(!groupStatesEqual(proof.groupState, groupState)) {
      throw new BlockchainError(
        'INVALID_STATE_PROOF',
        'state-proof group_state does not match post-application group_state'
      );
    }
  } else if(!hasSetGroupChange) {
    // No change AND no proof field — the prior state must still hold; it does
    // by construction since `groupState` was never reassigned. Nothing to do.
  }
  // If hasSetGroupChange is true and proof.groupState is undefined, the spec
  // says the proof omits it BECAUSE the change rebuilt it — we already
  // adopted `groupState` from the change, so no extra check.

  // Shared key field of the proof.
  const hasSetSharedChange = block.changes.some(
    (c) => c.kind === 'setSharedKey' || c.kind === 'setGroupState'
  );
  if(proof.sharedKey !== undefined) {
    if(!sharedKey || !sharedKeysEqual(proof.sharedKey, sharedKey)) {
      throw new BlockchainError(
        'INVALID_STATE_PROOF',
        'state-proof shared_key does not match post-application shared_key'
      );
    }
  } else if(!hasSetSharedChange) {
    // Same idea — no change, proof omits, prior state still holds.
  }

  // Produce post-application state.
  const newLastBlockHash = await computeBlockHash(block);

  return {
    height: block.height,
    lastBlockHash: newLastBlockHash,
    groupState,
    sharedKey,
    kvHash
  };
}

// ===== Structural equality helpers =====

function groupStatesEqual(a: GroupState, b: GroupState): boolean {
  if(a.externalPermissions !== b.externalPermissions) return false;
  if(a.participants.length !== b.participants.length) return false;
  for(let i = 0; i < a.participants.length; i++) {
    const x = a.participants[i];
    const y = b.participants[i];
    if(x.userId !== y.userId) return false;
    if(x.version !== y.version) return false;
    if(x.canAddUsers !== y.canAddUsers) return false;
    if(x.canRemoveUsers !== y.canRemoveUsers) return false;
    if(!constantTimeEqual(x.publicKey, y.publicKey)) return false;
  }
  return true;
}

function sharedKeysEqual(a: SharedKey, b: SharedKey): boolean {
  if(!constantTimeEqual(a.ek, b.ek)) return false;
  if(!constantTimeEqual(a.encryptedSharedKey, b.encryptedSharedKey)) return false;
  if(a.destUserIds.length !== b.destUserIds.length) return false;
  for(let i = 0; i < a.destUserIds.length; i++) {
    if(a.destUserIds[i] !== b.destUserIds[i]) return false;
    if(!constantTimeEqual(a.destHeaders[i], b.destHeaders[i])) return false;
  }
  return true;
}

// Re-export so callers don't need to import from tlTypes for the basic shapes.
export {participantPermissions, findParticipant};

// ===== Block building =====
//
// Used by clients to construct outbound blocks: zero block (initiator), self-
// add block (joiner), and change-state block (admin updates). Mirrors tdlib's
// Blockchain::build_block + State::create_from_block algorithm.

// External-permissions bitmask used as the "ephemeral -1 block group state"
// when building the zero block. tdlib uses GroupParticipantFlags::AllPermissions
// = (1 << 3) - 1 = 7 (AddUsers | RemoveUsers | SetValue) so the zero-block
// signer (who is not yet a group member) passes the permission check.
const ALL_PERMISSIONS = 7;

// Hydrate ClientBlockchainState from a single block snapshot — the receive
// side of `Blockchain::create_from_block`. Used when we receive a "last
// block" from the server without prior history.
//
// Applies the block's changes to the empty-ephemeral state, then lets the
// state proof override any fields it carries (the proof omits them only when
// they're derivable from the changes themselves).
export async function hydrateStateFromBlock(block: Block): Promise<ClientBlockchainState> {
  let groupState: GroupState = block.height === 0 ?
    {participants: [], externalPermissions: ALL_PERMISSIONS} :
    {participants: [], externalPermissions: 0};
  let sharedKey: SharedKey | undefined;

  for(const change of block.changes) {
    if(change.kind === 'setGroupState') {
      groupState = change.groupState;
      sharedKey = undefined;
    } else if(change.kind === 'setSharedKey') {
      sharedKey = change.sharedKey;
    }
  }

  if(block.stateProof.groupState) groupState = block.stateProof.groupState;
  if(block.stateProof.sharedKey) sharedKey = block.stateProof.sharedKey;

  const blockHash = await computeBlockHash(block);
  return {
    height: block.height,
    lastBlockHash: blockHash,
    groupState,
    sharedKey,
    kvHash: new Uint8Array(block.stateProof.kvHash)
  };
}

// Produce the [SetGroupState, SetSharedKey] change pair that establishes a
// new group + freshly minted shared key encrypted to every participant.
// The raw 32-byte secret is returned for the caller's own records (the
// initiator already knows it; everyone else recovers it via ECDH).
export async function buildChangesForNewState(
  groupState: GroupState
): Promise<{changes: Change[]; rawGroupSharedKey: Uint8Array}> {
  if(groupState.participants.length === 0) {
    throw new Error('buildChangesForNewState: group must have at least one participant');
  }

  const ephemeral = ed25519GenerateKeyPair();
  const rawGroupSharedKey = randomBytes(32);
  const oneTimeSecret = randomBytes(32);

  const {output: encryptedSharedKey} = await encryptData(rawGroupSharedKey, oneTimeSecret);

  const destUserIds: bigint[] = [];
  const destHeaders: Uint8Array[] = [];
  for(const p of groupState.participants) {
    const sharedSecret = await computeSharedSecret(ephemeral.secretKey, p.publicKey);
    const header = await encryptHeader(oneTimeSecret, encryptedSharedKey, sharedSecret);
    destUserIds.push(p.userId);
    destHeaders.push(header);
  }

  const sharedKey: SharedKey = {
    ek: ephemeral.publicKey,
    encryptedSharedKey,
    destUserIds,
    destHeaders
  };

  return {
    changes: [
      {kind: 'setGroupState', groupState},
      {kind: 'setSharedKey', sharedKey}
    ],
    rawGroupSharedKey
  };
}

// Build a signed block on top of `state`. Wraps the apply-then-prove flow:
// compute the post-state, build a state proof that omits redundancy, sign.
//
// Permission checks are skipped (mirrors our applyBlock policy). The signer
// is recorded explicitly via the block's signature_public_key field — easier
// than relying on group_state[0] when we're the zero-block author.
export async function buildBlock(
  state: ClientBlockchainState,
  changes: Change[],
  privateKey: PrivateKey
): Promise<Block> {
  if(state.height === 0x7fffffff) {
    throw new BlockchainError('HEIGHT_MISMATCH', 'cannot exceed int32 max height');
  }
  const height = state.height + 1;

  let groupState: GroupState = height === 0 ?
    {participants: [], externalPermissions: ALL_PERMISSIONS} :
    state.groupState;
  let sharedKey: SharedKey | undefined = state.sharedKey;
  let hasSetGroupState = false;
  let hasSetSharedKey = false;

  for(const change of changes) {
    switch(change.kind) {
      case 'noop':
      case 'setValue':
        break;
      case 'setGroupState':
        groupState = change.groupState;
        sharedKey = undefined;
        hasSetGroupState = true;
        break;
      case 'setSharedKey':
        sharedKey = change.sharedKey;
        hasSetSharedKey = true;
        break;
    }
  }

  // State proof omits group_state when it's already derivable from a
  // SetGroupState change (and that change also clears the shared_key, so we
  // omit sharedKey too in that case). SetSharedKey alone omits sharedKey.
  const stateProof: StateProof = {
    kvHash: new Uint8Array(state.kvHash),
    groupState: hasSetGroupState ? undefined : groupState,
    sharedKey: (hasSetGroupState || hasSetSharedKey) ? undefined : sharedKey
  };

  const unsigned: Block = {
    signature: new Uint8Array(64),
    prevBlockHash: new Uint8Array(state.lastBlockHash),
    changes,
    height,
    stateProof,
    signaturePublicKey: new Uint8Array(privateKey.publicKeyBytes)
  };

  const toSign = serializeBlockForSigning(unsigned);
  const signature = privateKey.sign(toSign);
  return {...unsigned, signature};
}
