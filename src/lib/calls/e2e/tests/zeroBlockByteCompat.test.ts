/*
 * Byte-level compat with tdlib's `Call::create_zero_block`.
 *
 * Note: full byte equality is impossible because tdlib uses random nonces for
 * the SharedKey's ephemeral key, encrypted_shared_key, and dest_headers. We
 * verify structural equality on the deterministic fields and verify the C++
 * reference output decodes via tweb's parser without error.
 *
 * Reference output captured from `tdlib/build-tde2e/zero_block_runner` with
 * a fixed 32-byte seed (0x01) and user_id=1000, single-participant group with
 * AddUsers|RemoveUsers permissions.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {E2eCall} from '../call';
import {ensureCryptoReady, sha256} from '../crypto';
import {PrivateKey} from '../keys';
import {decodeBlock, GroupParticipant, GroupState, PERM_ADD_USERS, PERM_REMOVE_USERS} from '../tlTypes';
import {TLReader} from '../tl';

beforeAll(() => ensureCryptoReady());

// Captured from the C++ reference runner.
const REFERENCE_HEX = (
  'b63d9a63 1d942711 f803e16b a800e57d 73543e60 f56d079e 97b2513c 7c0812be ' +
  '987fce95 eb7a32d9 e92ec8db 8ef4fbb9 cf56c23b 2ca8e3b2 9fe6144f 1b9d8e9c ' +
  'a97f920e 01000000 00000000 00000000 00000000 00000000 00000000 00000000 ' +
  '00000000 00000000 02000000 4671f12c 8475dc1d 01000000 1f97f318 e8030000 ' +
  '00000000 8a88e3dd 7409f195 fd52db2d 3cba5d72 ca6709bf 1d94121b f3748801 ' +
  'b40f6f5c 03000000 00000000 03000000 58217a98 7f7e848a a5152aa3 9d5dd41f ' +
  '5dcde1d3 63cd528c 89455955 a053281d 6ebc6c5d 42d01dcc 4063e412 699f39e2 ' +
  '64e66e06 4ca1db05 ab300340 09da79a6 56f045e9 6b9eb249 8acb952f 126a9826 ' +
  '7088aecd f47c78b0 b87ac19a dc516cb9 40c1787e 1d0423e5 1f000000 01000000 ' +
  'e8030000 00000000 01000000 20bca3c7 672aea6d a60fded9 63d03e17 764bfc8a ' +
  '1271af1e e87ee411 bd3b9a95 86000000 00000000 e679b6d6 00000000 df3f6198 ' +
  '04a92fdb 4057192d c43dd748 ea778adc 52bc498c e80524c0 14b81119 8a88e3dd ' +
  '7409f195 fd52db2d 3cba5d72 ca6709bf 1d94121b f3748801 b40f6f5c'
).replace(/[\s]/g, '');

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for(let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

describe('zero-block byte compat with tdlib', () => {
  it('C++ reference zero block decodes cleanly via tweb decoder', async() => {
    const bytes = hexToBytes(REFERENCE_HEX);
    const block = decodeBlock(new TLReader(bytes));

    // Structural assertions on the deterministic fields.
    expect(block.height).toBe(0);

    // prev_block_hash is 32 zeros for a zero block.
    expect(Array.from(block.prevBlockHash)).toEqual(new Array(32).fill(0));

    // Two changes: SetGroupState then SetSharedKey (in that order).
    expect(block.changes.length).toBe(2);
    expect(block.changes[0].kind).toBe('setGroupState');
    expect(block.changes[1].kind).toBe('setSharedKey');

    // Verify the group state matches our inputs (user_id=1000, perms=3, etc.).
    if(block.changes[0].kind === 'setGroupState') {
      const gs = block.changes[0].groupState;
      expect(gs.externalPermissions).toBe(PERM_ADD_USERS | PERM_REMOVE_USERS);
      expect(gs.participants.length).toBe(1);
      const p = gs.participants[0];
      expect(p.userId).toBe(BigInt(1000));
      expect(p.canAddUsers).toBe(true);
      expect(p.canRemoveUsers).toBe(true);
      expect(p.version).toBe(0);
      // Public key for ed25519 seed 0x01...01
      expect(Array.from(p.publicKey).map((b) => b.toString(16).padStart(2, '0')).join(''))
      .toBe('8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c');
    }

    // State proof: kv_hash should be the empty-trie root hash, group_state
    // should be undefined (because there's a SetGroupState change in this block).
    expect(Array.from(block.stateProof.kvHash).map((b) => b.toString(16).padStart(2, '0')).join(''))
    .toBe('df3f619804a92fdb4057192dc43dd748ea778adc52bc498ce80524c014b81119');
    expect(block.stateProof.groupState).toBeUndefined();
    expect(block.stateProof.sharedKey).toBeUndefined();
  });

  it('tweb-generated zero block has identical structure to C++ reference', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(1));
    const self: GroupParticipant = {
      userId: BigInt(1000),
      publicKey: alice.publicKeyBytes,
      canAddUsers: true,
      canRemoveUsers: true,
      version: 0
    };
    const groupState: GroupState = {
      participants: [self],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    };
    const ourBlockBytes = await E2eCall.createZeroBlock(alice, groupState);
    const ourBlock = decodeBlock(new TLReader(ourBlockBytes));
    const refBlock = decodeBlock(new TLReader(hexToBytes(REFERENCE_HEX)));

    // Deterministic fields must match exactly.
    expect(ourBlock.height).toBe(refBlock.height);
    expect(Array.from(ourBlock.prevBlockHash)).toEqual(Array.from(refBlock.prevBlockHash));
    expect(Array.from(ourBlock.stateProof.kvHash)).toEqual(Array.from(refBlock.stateProof.kvHash));
    expect(ourBlock.stateProof.groupState).toEqual(refBlock.stateProof.groupState);
    expect(ourBlock.stateProof.sharedKey).toEqual(refBlock.stateProof.sharedKey);
    expect(ourBlock.changes.length).toBe(refBlock.changes.length);

    // SetGroupState — fully deterministic.
    const ourGs = (ourBlock.changes[0] as {kind: 'setGroupState'; groupState: GroupState});
    const refGs = (refBlock.changes[0] as {kind: 'setGroupState'; groupState: GroupState});
    expect(ourGs.groupState.externalPermissions).toBe(refGs.groupState.externalPermissions);
    expect(ourGs.groupState.participants.length).toBe(refGs.groupState.participants.length);
    for(let i = 0; i < ourGs.groupState.participants.length; i++) {
      const op = ourGs.groupState.participants[i];
      const rp = refGs.groupState.participants[i];
      expect(op.userId).toBe(rp.userId);
      expect(op.version).toBe(rp.version);
      expect(op.canAddUsers).toBe(rp.canAddUsers);
      expect(op.canRemoveUsers).toBe(rp.canRemoveUsers);
      expect(Array.from(op.publicKey)).toEqual(Array.from(rp.publicKey));
    }

    // signature_public_key (the signer's pubkey, prepended to the block).
    expect(Array.from(ourBlock.signaturePublicKey!)).toEqual(Array.from(refBlock.signaturePublicKey!));

    // SetSharedKey — has random ephemeral, encrypted shared key, and dest
    // headers, but the STRUCTURE must match.
    const ourSk = (ourBlock.changes[1] as {kind: 'setSharedKey'; sharedKey: any});
    const refSk = (refBlock.changes[1] as {kind: 'setSharedKey'; sharedKey: any});
    expect(ourSk.sharedKey.ek.length).toBe(refSk.sharedKey.ek.length);
    expect(ourSk.sharedKey.encryptedSharedKey.length).toBe(refSk.sharedKey.encryptedSharedKey.length);
    expect(ourSk.sharedKey.destUserIds.length).toBe(refSk.sharedKey.destUserIds.length);
    expect(ourSk.sharedKey.destUserIds).toEqual(refSk.sharedKey.destUserIds);
    expect(ourSk.sharedKey.destHeaders.length).toBe(refSk.sharedKey.destHeaders.length);
    for(let i = 0; i < ourSk.sharedKey.destHeaders.length; i++) {
      expect(ourSk.sharedKey.destHeaders[i].length).toBe(refSk.sharedKey.destHeaders[i].length);
    }
  });

  it('C++ reference zero block accepted by tweb E2eCall.create()', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(1));
    // The C++ runner encrypted the shared key TO alice's pubkey for user_id=1000,
    // so alice should be able to hydrate and recover the shared key.
    const call = await E2eCall.create(BigInt(1000), alice, hexToBytes(REFERENCE_HEX));
    expect(call.getHeight()).toBe(0);
    expect(call.getGroupState().participants.length).toBe(1);
    expect(call.getGroupState().participants[0].userId).toBe(BigInt(1000));
  });
});
