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
  | 'NO_PARTICIPANTS'
  | 'NO_PERMISSIONS'
  | 'NO_CHANGES'
  | 'INVALID_GROUP_STATE'
  | 'INVALID_SHARED_KEY';

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

// ===== Per-change authorization (ported from tdlib State::apply) =====
//
// The server is the adversary of an end-to-end protocol, so every change in a
// block MUST be checked against the permissions the signer holds in the PRIOR
// group state — we do NOT rely on "the server enforces them". Mirrors
// tde2e/td/e2e/Blockchain.cpp State::{get_permissions, set_group_state,
// clear_shared_key, set_shared_key, validate_group_state, validate_shared_key,
// validate_state}, with validate_state_hash=false: we don't keep the kv trie,
// so SetValue carries no client-side permission check, exactly as in tdlib.

// GroupParticipantFlags: AddUsers=1, RemoveUsers=2, SetValue=4 → AllPermissions=7.
const PERM_SET_VALUE = 1 << 2;
const PERM_ALL = PERM_ADD_USERS | PERM_REMOVE_USERS | PERM_SET_VALUE;

// The ephemeral predecessor of the zero block: no participants, all permissions
// — so the first signer (not yet a member) can self-authorize. tdlib apply() /
// create_from_block seed GroupParticipantFlags::AllPermissions (= PERM_ALL) here.
function zeroBlockPredecessorGroupState(): GroupState {
  return {participants: [], externalPermissions: PERM_ALL};
}

interface SignerPermissions {
  flags: number; // AddUsers/RemoveUsers/SetValue bits, masked to PERM_ALL
  isParticipant: boolean;
}

// tdlib GroupState::get_permissions: a participant inherits its stored flags
// (plus the implicit IsParticipant marker); a non-member signer inherits only
// external_permissions.
function getSignerPermissions(state: GroupState, signerPublicKey: Uint8Array): SignerPermissions {
  const participant = findParticipant(state, signerPublicKey);
  if(participant) {
    return {flags: participantPermissions(participant) & PERM_ALL, isParticipant: true};
  }
  return {flags: state.externalPermissions & PERM_ALL, isParticipant: false};
}

function mayAddUsers(p: SignerPermissions): boolean {
  return (p.flags & PERM_ADD_USERS) !== 0;
}

function mayRemoveUsers(p: SignerPermissions): boolean {
  return (p.flags & PERM_REMOVE_USERS) !== 0;
}

// may_change_shared_key requires ACTUAL membership, not just external perms —
// an outside signer can never set the group key even if external_permissions
// grants add/remove.
function mayChangeSharedKey(p: SignerPermissions): boolean {
  return p.isParticipant && (mayAddUsers(p) || mayRemoveUsers(p));
}

// Participants are identified by the (user_id, public_key) PAIR — a key change
// is therefore a remove + add, exactly like tdlib's std::map key.
function participantMapKey(p: GroupParticipant): string {
  return `${p.userId}:${bytesToHex(p.publicKey)}`;
}

// tdlib State::validate_group_state — structural sanity (no permissions).
function validateGroupState(gs: GroupState): void {
  if((gs.externalPermissions & ~PERM_ALL) !== 0) {
    throw new BlockchainError('INVALID_GROUP_STATE', 'external_permissions has invalid bits');
  }
  const userIds = new Set<bigint>();
  const keys = new Set<string>();
  for(const p of gs.participants) {
    userIds.add(p.userId);
    keys.add(bytesToHex(p.publicKey));
  }
  if(userIds.size !== gs.participants.length) {
    throw new BlockchainError('INVALID_GROUP_STATE', 'duplicate user_id');
  }
  if(keys.size !== gs.participants.length) {
    throw new BlockchainError('INVALID_GROUP_STATE', 'duplicate public_key');
  }
}

// tdlib State::set_group_state permission half (validate_group_state runs first).
function authorizeSetGroupState(oldGS: GroupState, newGS: GroupState, signer: SignerPermissions): void {
  if((~oldGS.externalPermissions & newGS.externalPermissions) !== 0) {
    throw new BlockchainError('NO_PERMISSIONS', 'cannot increase external_permissions');
  }

  const oldMap = new Map<string, number>();
  for(const p of oldGS.participants) oldMap.set(participantMapKey(p), participantPermissions(p));
  const newMap = new Map<string, number>();
  for(const p of newGS.participants) newMap.set(participantMapKey(p), participantPermissions(p));

  for(const key of oldMap.keys()) {
    if(!newMap.has(key) && !mayRemoveUsers(signer)) {
      throw new BlockchainError('NO_PERMISSIONS', 'signer cannot remove participants');
    }
  }

  let neededFlags = 0;
  for(const [key, flags] of newMap) {
    const oldFlags = oldMap.get(key);
    if(oldFlags === undefined) {
      if(!mayAddUsers(signer)) {
        throw new BlockchainError('NO_PERMISSIONS', 'signer cannot add participants');
      }
      neededFlags |= flags;
    } else if(flags !== oldFlags) {
      if(!mayAddUsers(signer) || !mayRemoveUsers(signer)) {
        throw new BlockchainError('NO_PERMISSIONS', 'signer cannot modify participant permissions');
      }
      neededFlags |= flags & ~oldFlags;
    }
  }

  if((neededFlags & ~(signer.flags & PERM_ALL)) !== 0) {
    throw new BlockchainError('NO_PERMISSIONS', 'signer cannot grant permissions it does not hold');
  }
}

// tdlib State::validate_shared_key — exactly one header per participant.
function validateSharedKey(sharedKey: SharedKey | undefined, gs: GroupState): void {
  if(!sharedKey) return; // empty/cleared shared key is valid
  if(sharedKey.destUserIds.length !== sharedKey.destHeaders.length) {
    throw new BlockchainError('INVALID_SHARED_KEY', 'dest_user_id / dest_header count mismatch');
  }
  if(sharedKey.destUserIds.length !== gs.participants.length) {
    throw new BlockchainError('INVALID_SHARED_KEY', 'dest user count != participant count');
  }
  const dest = new Set<bigint>(sharedKey.destUserIds);
  if(dest.size !== sharedKey.destUserIds.length) {
    throw new BlockchainError('INVALID_SHARED_KEY', 'duplicate dest user_id');
  }
  for(const p of gs.participants) {
    if(!dest.has(p.userId)) {
      throw new BlockchainError('INVALID_SHARED_KEY', 'participant missing from dest users');
    }
  }
}

// Apply a block to a state, producing the new state. Throws BlockchainError
// on any validation failure. The input state is NOT mutated.
//
// Order of checks matches blockchain.md and tdlib's apply algorithm:
//   1. height = state.height + 1
//   2. prev_block_hash == state.lastBlockHash
//   3. Ed25519 signature over block-with-signature-zeroed
//   4. Apply changes, enforcing per-change authorization against the signer's
//      permissions in the PRIOR group state
//   5. State proof matches the post-application state + structural validation
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

  // 4. Apply changes — enforcing per-change authorization derived from the
  // PRIOR group state (tdlib State::apply_change). For the zero block the
  // predecessor is an ephemeral all-permissions state with no participants.
  let groupState: GroupState = block.height === 0 ?
    zeroBlockPredecessorGroupState() :
    state.groupState;
  let sharedKey: SharedKey | undefined = block.height === 0 ? undefined : state.sharedKey;
  let kvHash: Uint8Array = state.kvHash;
  let kvHashDirty = false;
  let hasSetValue = false;
  let hasGroupStateChange = false;
  let hasSharedKeyChange = false;

  for(const change of block.changes) {
    switch(change.kind) {
      case 'noop':
        break;
      case 'setValue':
        // We don't maintain the full kv trie — flag that the state-proof
        // kv_hash MUST be present and is the only thing we can verify against.
        // Like tdlib with validate_state_hash=false, SetValue carries no
        // client-side permission check.
        hasSetValue = true;
        kvHashDirty = true;
        break;
      case 'setGroupState': {
        hasGroupStateChange = true;
        validateGroupState(change.groupState);
        authorizeSetGroupState(groupState, change.groupState, getSignerPermissions(groupState, signerPubKey));
        groupState = change.groupState;
        // SetGroupState implicitly clears the shared key; tdlib requires
        // may_change_shared_key on the NEW state for that clear.
        if(!mayChangeSharedKey(getSignerPermissions(groupState, signerPubKey))) {
          throw new BlockchainError('NO_PERMISSIONS', 'signer cannot clear shared key');
        }
        sharedKey = undefined;
        break;
      }
      case 'setSharedKey': {
        hasSharedKeyChange = true;
        if(sharedKey !== undefined) {
          throw new BlockchainError('NO_PERMISSIONS', 'shared key already set (clear via setGroupState first)');
        }
        if(!mayChangeSharedKey(getSignerPermissions(groupState, signerPubKey))) {
          throw new BlockchainError('NO_PERMISSIONS', 'signer cannot set shared key');
        }
        validateSharedKey(change.sharedKey, groupState);
        sharedKey = change.sharedKey;
        break;
      }
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

  // Group-state proof field (tdlib validate_state): MUST be omitted when a
  // SetGroupState change rebuilt it, MUST be present (and match) otherwise. A
  // malicious server that ships a redundant or mismatched group_state is
  // rejected here, not silently tolerated.
  if(hasGroupStateChange) {
    if(proof.groupState !== undefined) {
      throw new BlockchainError(
        'INVALID_STATE_PROOF',
        'group_state must be omitted from the proof when the block changes it'
      );
    }
  } else if(proof.groupState === undefined) {
    throw new BlockchainError(
      'INVALID_STATE_PROOF',
      'group_state must be present in the proof when the block does not change it'
    );
  } else if(!groupStatesEqual(proof.groupState, groupState)) {
    throw new BlockchainError(
      'INVALID_STATE_PROOF',
      'state-proof group_state does not match post-application group_state'
    );
  }

  // Shared-key proof field: omitted when a SetGroupState (clears it) or
  // SetSharedKey change is present; otherwise present and matching. tweb models
  // "no shared key" as undefined where tdlib uses an always-present empty
  // sentinel, so when the unchanged state genuinely has no key there is nothing
  // to carry and an omitted field is correct.
  const sharedKeyMustBeOmitted = hasGroupStateChange || hasSharedKeyChange;
  if(sharedKeyMustBeOmitted) {
    if(proof.sharedKey !== undefined) {
      throw new BlockchainError(
        'INVALID_STATE_PROOF',
        'shared_key must be omitted from the proof when the block changes it'
      );
    }
  } else if(proof.sharedKey !== undefined) {
    if(!sharedKey || !sharedKeysEqual(proof.sharedKey, sharedKey)) {
      throw new BlockchainError(
        'INVALID_STATE_PROOF',
        'state-proof shared_key does not match post-application shared_key'
      );
    }
  } else if(sharedKey !== undefined) {
    throw new BlockchainError(
      'INVALID_STATE_PROOF',
      'shared_key must be present in the proof when the block does not change it'
    );
  }

  // tdlib validate_state: a block must carry at least one SetValue or
  // SetGroupState change, and the resulting state must be structurally valid.
  if(!hasGroupStateChange && !hasSetValue) {
    throw new BlockchainError('NO_CHANGES', 'block has neither a SetValue nor a SetGroupState change');
  }
  validateGroupState(groupState);
  validateSharedKey(sharedKey, groupState);

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

// Hydrate ClientBlockchainState from a single block snapshot — the receive
// side of `Blockchain::create_from_block`. Used when we receive a "last
// block" from the server without prior history.
//
// Applies the block's changes to the empty-ephemeral state, then lets the
// state proof override any fields it carries (the proof omits them only when
// they're derivable from the changes themselves).
export async function hydrateStateFromBlock(block: Block): Promise<ClientBlockchainState> {
  // tdlib create_from_block rejects a negative height; without this a server
  // could seed state.height < 0 and skew every subsequent height check.
  if(block.height < 0) {
    throw new BlockchainError('HEIGHT_MISMATCH', `negative block height ${block.height}`);
  }
  let groupState: GroupState = block.height === 0 ?
    zeroBlockPredecessorGroupState() :
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

  // Structural validation (tdlib create_from_block → validate_state). We can't
  // run per-change authorization here — hydration has no prior chain to derive
  // the signer's permissions from — so a hydrated tip is only as trustworthy as
  // the blocks subsequently applied on top of it (which ARE authorized) and the
  // emoji-fingerprint check; see notes/blockchain.md.
  validateGroupState(groupState);
  validateSharedKey(sharedKey, groupState);

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
// No authorization check is needed here: we author and sign this block, so by
// construction we are an authorized signer (applyBlock re-checks inbound blocks
// from everyone else). The signer is recorded explicitly via the block's
// signature_public_key field — easier than relying on group_state[0] when we're
// the zero-block author.
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
    zeroBlockPredecessorGroupState() :
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
