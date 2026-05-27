# Blockchain Module Porting Guide (TypeScript)

## Overview

The Blockchain module implements a tamper-proof distributed ledger for maintaining group state, participant permissions, and key-value storage. This guide documents the exact algorithms, TL structures, and subtle serialization quirks required for a faithful TypeScript reimplementation.

## 1. Block Structure (TL Definition)

From `e2e_api.tl`:
```
e2e.chain.block#639a3db6 signature:int512 flags:# prev_block_hash:int256 
  changes:vector<e2e.chain.Change> height:int state_proof:e2e.chain.StateProof 
  signature_public_key:flags.0?int256 = e2e.chain.Block;
```

**TL Fields:**
- `signature` (int512 / 64 bytes): Ed25519 signature over TL-serialized block with signature field zeroed
- `flags` (int32): Bit 0 = `SIGNATURE_PUBLIC_KEY_MASK` (1). When set, `signature_public_key` is present
- `prev_block_hash` (int256 / 32 bytes): SHA256 hash of previous block
- `changes` (vector of Change): Mutations to apply
- `height` (int32): Block sequence number, must equal `previous_height + 1` on application
- `state_proof` (StateProof): Merkle proof of resulting state
- `signature_public_key` (int256, optional): Public key of signer. Omitted if identical to first participant's key in group state

**Critical:** Block is unsigned when serialized for hashing/signing—the signature field contains 64 zero bytes during serialization.

## 2. State Proof Structure

```
e2e.chain.stateProof flags:# kv_hash:int256 group_state:flags.0?e2e.chain.GroupState 
  shared_key:flags.1?e2e.chain.SharedKey = e2e.chain.StateProof;
```

**Fields:**
- `flags` (int32): Bit 0 = GROUP_STATE_MASK, Bit 1 = SHARED_KEY_MASK
- `kv_hash` (int256): Root hash of key-value trie after block applied
- `group_state` (optional): Full participant list + external permissions. **Present iff no SetGroupState change in block**
- `shared_key` (optional): Encrypted key info. **Present iff no SetSharedKey and no SetGroupState change**

**Optimization rule:** Omit group_state and shared_key from proof when a SetGroupState/SetSharedKey change exists in the block—these are recoverable from the change itself.

## 3. Change Types

### ChangeSetValue
```
e2e.chain.changeSetValue key:bytes value:bytes = e2e.chain.Change;
```
Updates key-value store. No permission checks in code (any participant may write).

### ChangeSetGroupState
```
e2e.chain.groupParticipant user_id:long public_key:int256 flags:# 
  add_users:flags.0?true remove_users:flags.1?true version:int = e2e.chain.GroupParticipant;
e2e.chain.groupState participants:vector<e2e.chain.GroupParticipant> 
  external_permissions:int = e2e.chain.GroupState;
e2e.chain.changeSetGroupState group_state:e2e.chain.GroupState = e2e.chain.Change;
```

**Permission flags on participant:**
- Bit 0: `AddUsers` (value 1)
- Bit 1: `RemoveUsers` (value 2)
- Bit 2: `SetValue` (value 4)
- Bit 30: `IsParticipant` (computed, never stored)

**Rules for applying SetGroupState:**
1. Signer must have both `AddUsers` OR `RemoveUsers` to add/remove/modify participants
2. Cannot grant permissions exceeding signer's own
3. Cannot remove yourself
4. `external_permissions` (int32) cannot be increased from prior state
5. All user_ids must be unique
6. All public_keys must be unique
7. Automatically clears shared_key

### ChangeSetSharedKey
```
e2e.chain.sharedKey ek:int256 encrypted_shared_key:string 
  dest_user_id:vector<long> dest_header:vector<bytes> = e2e.chain.SharedKey;
e2e.chain.changeSetSharedKey shared_key:e2e.chain.SharedKey = e2e.chain.Change;
```

**Rules:**
1. Cannot overwrite an existing shared_key (must clear with SetGroupState first)
2. `dest_user_id` must have exactly one entry per participant, in any order
3. All dest_user_ids must exist in current group_state
4. Signer must be a participant (have IsParticipant flag)
5. Signer must have AddUsers or RemoveUsers to change keys

### ChangeNoop
```
e2e.chain.changeNoop nonce:int256 = e2e.chain.Change;
```
No-op; used for hash randomization or padding.

## 4. Permission Model

### Permission Derivation (from previous state)

```
function getPermissions(signerPublicKey, limitPermissions):
  participant = findParticipantByPublicKey(signerPublicKey)
  if participant found:
    return (participant.flags & limitPermissions) | IsParticipant
  else:
    return (external_permissions & limitPermissions)
```

**Note:** A signer outside the group inherits `external_permissions`. The `IsParticipant` flag (bit 30) is added only if found in group_state. On height 0, an ephemeral predecessor with `self_join_permissions` (all bits set) applies, allowing the first signer unrestricted permissions.

### Permission Checks per Change Type

- **SetValue:** No check in C++; any participant or external signer can write
- **SetGroupState:** Signer must have `AddUsers` to add/modify OR `RemoveUsers` to remove. Cannot grant more permissions than held. Cannot increase external_permissions
- **SetSharedKey:** Signer must be participant AND have `AddUsers` or `RemoveUsers`

## 5. Block Application Algorithm

### Step 1: Height Check
```
if (block.height !== current_height + 1) {
  return error(HEIGHT_MISMATCH)
}
```
Must be exactly one more. First block has height 0.

### Step 2: Previous Block Hash Check
```
if (block.prev_block_hash !== last_block_hash) {
  return error(PREVIOUS_BLOCK_HASH_MISMATCH)
}
```

### Step 3: Determine Signer Public Key
```
if block.o_signature_public_key is present:
  signer_key = block.o_signature_public_key
else:
  if current_group_state is not empty:
    signer_key = current_group_state.participants[0].public_key
  else:
    return error(UNKNOWN_PUBLIC_KEY)
```

### Step 4: Derive Signer Permissions
```
signer_permissions = getPermissions(signer_key, AllPermissions)
```
For height 0, use synthetic ephemeral block with all permissions set.

### Step 5: Verify Signature
```
serialized = TL_serialize(block with signature field = all zeros)
if !verify_ed25519(signer_key, signature, serialized):
  return error(INVALID_SIGNATURE)
```

**Critical:** The signature field itself is zeroed when serializing for signature verification.

### Step 6: Apply Changes (In Order)
For each change:
1. Check signer's permissions against required permissions
2. Apply mutation to state:
   - **SetValue:** Call `trie.set(key, value)`; update `kv_hash`
   - **SetGroupState:** Replace participants list; clear shared_key; validate uniqueness
   - **SetSharedKey:** Replace shared_key; validate dest_user_ids match group
   - **Noop:** No state change
3. Track flags: `has_set_value`, `has_group_state_change`, `has_shared_key_change`

### Step 7: Validate State Proof
```
if validate_state_hash:
  // Expensive: compute hashes and validate
  if block.state_proof.kv_hash !== actual_kv_hash:
    return error(INVALID_STATE_PROOF)
else:
  // Fast path: accept kv_hash from proof without validation
  kv_hash = block.state_proof.kv_hash

// Validate group_state presence
if has_group_state_change:
  if block.state_proof.o_group_state is present:
    return error(INVALID_STATE_PROOF_GROUP)  // Group state must be omitted
else:
  if block.state_proof.o_group_state is absent:
    return error(INVALID_STATE_PROOF_GROUP)  // Group state must be present
  if *block.state_proof.o_group_state !== current_group_state:
    return error(INVALID_STATE_PROOF_GROUP)  // Mismatch

// Validate shared_key presence
shared_key_omitted = has_group_state_change || has_shared_key_change
if shared_key_omitted:
  if block.state_proof.o_shared_key is present:
    return error(INVALID_STATE_PROOF_SECRET)
else:
  if block.state_proof.o_shared_key is absent:
    return error(INVALID_STATE_PROOF_SECRET)
  if *block.state_proof.o_shared_key !== current_shared_key:
    return error(INVALID_STATE_PROOF_SECRET)

// Validate group state structure
if validate_group_state(current_group_state) fails:
  return error(INVALID_GROUP_STATE)
if validate_shared_key(current_shared_key, current_group_state) fails:
  return error(INVALID_SHARED_SECRET)
```

### Step 8: Update Blockchain
```
last_block = block
last_block_hash = SHA256(TL_serialize(block))
state = new_state
```

## 6. Hash Computation

Block hash = SHA256 of TL-serialized block (with signature field present, not zeroed):
```
hash_input = serialize_boxed(block_to_tl())  // Full serialization with signature
block_hash = sha256(hash_input)
```

Key-value state hash is stored in `state_proof.kv_hash` and comes from the trie root node.

## 7. Self-Add Special Case (Height 0)

When applying height 0:
- An ephemeral predecessor (height -1, hash = UInt256(0)) exists
- This phantom block has signer permissions = `AllPermissions` (all flags set)
- `external_permissions` = `AllPermissions` (all flags set)
- Allows first signer to add participants unconditionally

In code: at height 0, if group_state is empty, synthesize `GroupState{participants: [], external_permissions: AllPermissions}`.

## 8. Serialization Quirks

### Server Format Conversion
```
// Server wire format has magic + 1 (to distinguish from local)
is_from_server(data):
  if data.size < 4: return false
  server_magic = read_u32_le(data)
  real_magic = server_magic - 1
  return is_good_magic(real_magic) && !is_good_magic(server_magic)

from_server_to_local(data):
  magic = read_u32_le(data)
  write_u32_le(data, magic - 1)
  return data

from_local_to_server(data):
  magic = read_u32_le(data)
  write_u32_le(data, magic + 1)
  return data
```
Good magics: `0x639a3db6` (block), `0xd1512ae7` (nonce commit), `0x83f4f9d8` (nonce reveal).

### TL Serialization
- Blocks and all structures use TL binary serialization (little-endian int32s, variable-length vectors)
- `serialize_boxed()` includes the type magic (4 bytes) before the structure
- Signature field must be zeroed when serializing for signing, but present (non-zero) when serializing for hash

## 9. Error Codes

The C++ implementation returns these error codes:

- `HEIGHT_MISMATCH`: Block height != current_height + 1
- `PREVIOUS_BLOCK_HASH_MISMATCH`: prev_block_hash != last_block_hash
- `INVALID_SIGNATURE`: Signature verification fails
- `INVALID_STATE_PROOF`: kv_hash mismatch or structural validation fails
- `INVALID_STATE_PROOF_GROUP`: group_state presence/absence or equality check fails
- `INVALID_STATE_PROOF_SECRET`: shared_key presence/absence or equality check fails
- `INVALID_GROUP_STATE`: Duplicate user_ids, public_keys, or invalid permission flags
- `INVALID_SHARED_SECRET`: dest_user_id/dest_header size mismatch, unknown user_id, or duplicate entries
- `NO_PERMISSIONS`: Signer lacks required permission flags for change type
- `NO_CHANGES`: Block contains neither SetValue nor SetGroupState changes (fails validation after apply)
- `INVALID_BLOCK`: General validation failure (e.g., negative height)

## 10. Container.h (Not Required for Port)

Container is a generic in-memory cache with thread-safe deduplication and optional mutable locks. The Blockchain module does not directly depend on it. For TypeScript, use plain `Map<string, Block>` for caching blocks by hash if needed; Container logic is orthogonal to core blockchain semantics.

## Key Implementation Insights

1. **Signature verification is critical:** Serialize block with signature field = 64 zero bytes, then verify Ed25519
2. **State proof optimization is subtle:** Group state and shared key are omitted from proof when changed in the same block, requiring reconstruction from changes
3. **Permission model uses inheritance:** Signers outside the group inherit `external_permissions`; participants inherit their stored flags
4. **Height is the primary ordering:** No forks; second block at same height is rejected automatically
5. **Order matters:** Changes apply sequentially; each mutation updates the state that subsequent changes see
6. **All-or-nothing semantics:** If validation fails at any step, entire block is rejected; no partial applies
