/*
 * Blockchain apply tests. No C++ byte-vectors for blocks — we build them
 * here using libsodium for signing, then verify the apply state machine
 * accepts valid blocks and rejects each class of tampering individually.
 */

import {beforeAll, describe, it, expect} from 'vitest';
import {applyBlock, BlockchainError, computeBlockHash, createInitialState} from '../blockchain';
import {bytesToHex, ensureCryptoReady} from '../crypto';
import {PrivateKey} from '../keys';
import {Block, Change, GroupParticipant, GroupState, PERM_ADD_USERS, PERM_REMOVE_USERS, serializeBlockForSigning} from '../tlTypes';

beforeAll(() => ensureCryptoReady());

// Build a block + sign it with the given key.
function buildSignedBlock(opts: {
  signer: PrivateKey;
  prevBlockHash: Uint8Array;
  changes: Change[];
  height: number;
  // Optional override for the kv hash (else zero).
  kvHash?: Uint8Array;
  // Optional explicit groupState/sharedKey in the proof (vs derived).
  proofGroupState?: GroupState;
  // Whether to include signaturePublicKey explicitly.
  explicitSignerKey?: boolean;
}): Block {
  const blockBody: Block = {
    signature: new Uint8Array(64),
    prevBlockHash: opts.prevBlockHash,
    changes: opts.changes,
    height: opts.height,
    stateProof: {
      kvHash: opts.kvHash || createInitialState().kvHash,
      groupState: opts.proofGroupState
    },
    signaturePublicKey: opts.explicitSignerKey ? opts.signer.publicKeyBytes : undefined
  };
  const toSign = serializeBlockForSigning(blockBody);
  blockBody.signature = opts.signer.sign(toSign);
  return blockBody;
}

describe('Blockchain.applyBlock', () => {
  it('accepts the zero block (single self-add participant)', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(1));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('1001'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };
    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 0
    });

    const next = await applyBlock(initial, zero);
    expect(next.height).toBe(0);
    expect(next.groupState.participants.length).toBe(1);
    expect(bytesToHex(next.groupState.participants[0].publicKey)).toBe(
      bytesToHex(alice.publicKeyBytes)
    );
    expect(bytesToHex(next.lastBlockHash)).toBe(bytesToHex(await computeBlockHash(zero)));
  });

  it('rejects wrong height', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(2));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('1'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };
    const wrongHeight = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 5 // expected 0
    });

    await expect(applyBlock(initial, wrongHeight)).rejects.toMatchObject({
      code: 'HEIGHT_MISMATCH'
    });
  });

  it('rejects wrong prev_block_hash', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(3));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('1'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };
    const wrongPrev = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32).fill(0xaa), // expected zeros
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 0
    });

    await expect(applyBlock(initial, wrongPrev)).rejects.toMatchObject({
      code: 'PREVIOUS_BLOCK_HASH_MISMATCH'
    });
  });

  it('rejects forged signature', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(4));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('1'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };
    const valid = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 0
    });
    const tampered: Block = {...valid, signature: new Uint8Array(valid.signature)};
    tampered.signature[0] ^= 0x01;

    await expect(applyBlock(initial, tampered)).rejects.toMatchObject({
      code: 'INVALID_SIGNATURE'
    });
  });

  it('chains two blocks (zero + setSharedKey)', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(5));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('100'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };

    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 0
    });
    const afterZero = await applyBlock(initial, zero);

    // A shared key is always set together with a SetGroupState — tdlib rejects a
    // lone SetSharedKey (validate_state NO_CHANGES). Re-stating the same group
    // rotates the key without changing membership.
    const rotateChanges: Change[] = [
      {kind: 'setGroupState', groupState: aliceState},
      {
        kind: 'setSharedKey',
        sharedKey: {
          ek: new Uint8Array(32).fill(0xee),
          encryptedSharedKey: new Uint8Array([1, 2, 3, 4]),
          destUserIds: [BigInt('100')],
          destHeaders: [new Uint8Array(32).fill(0xdd)]
        }
      }
    ];
    const one = buildSignedBlock({
      signer: alice,
      prevBlockHash: afterZero.lastBlockHash,
      changes: rotateChanges,
      height: 1
    });

    const afterOne = await applyBlock(afterZero, one);
    expect(afterOne.height).toBe(1);
    expect(afterOne.sharedKey).toBeDefined();
    expect(afterOne.sharedKey!.destUserIds[0]).toBe(BigInt('100'));
    expect(afterOne.groupState.participants.length).toBe(1);
  });

  it('SetGroupState in a block automatically clears the shared key', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(6));
    const aliceP = {
      userId: BigInt('1'),
      publicKey: alice.publicKeyBytes,
      canAddUsers: true,
      canRemoveUsers: true,
      version: 0
    };
    const aliceState: GroupState = {participants: [aliceP], externalPermissions: 0};

    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [
        {kind: 'setGroupState', groupState: aliceState},
        {
          kind: 'setSharedKey',
          sharedKey: {
            ek: new Uint8Array(32).fill(0xab),
            encryptedSharedKey: new Uint8Array([9]),
            destUserIds: [BigInt('1')],
            destHeaders: [new Uint8Array(32)]
          }
        }
      ],
      height: 0
    });
    const afterZero = await applyBlock(initial, zero);
    expect(afterZero.sharedKey).toBeDefined();

    // Block 1: just replaces the group state (different version). Shared key
    // must be cleared (NOT carried over) even though no SetSharedKey change
    // appeared.
    const newGroupState: GroupState = {
      participants: [{...aliceP, version: 1}],
      externalPermissions: 0
    };
    const one = buildSignedBlock({
      signer: alice,
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setGroupState', groupState: newGroupState}],
      height: 1
    });
    const afterOne = await applyBlock(afterZero, one);
    expect(afterOne.sharedKey).toBeUndefined();
  });

  it('produces a BlockchainError instance (typed code)', async() => {
    const initial = createInitialState();
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(7));
    const aliceState: GroupState = {
      participants: [
        {
          userId: BigInt('1'),
          publicKey: alice.publicKeyBytes,
          canAddUsers: true,
          canRemoveUsers: true,
          version: 0
        }
      ],
      externalPermissions: 0
    };
    const block = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: aliceState}],
      height: 99
    });
    try {
      await applyBlock(initial, block);
      throw new Error('should have thrown');
    } catch(e) {
      expect(e).toBeInstanceOf(BlockchainError);
      expect((e as BlockchainError).code).toBe('HEIGHT_MISMATCH');
    }
  });
});

// WebK-2 regression: the per-change authorization a malicious server must not
// be able to bypass. Each block below is correctly signed + chained (valid
// height/prev-hash/signature) — only the AUTHORIZATION is illegitimate.
describe('Blockchain.applyBlock — per-change authorization (WebK-2)', () => {
  const aliceId = BigInt(1), bobId = BigInt(2), attackerId = BigInt(666);
  const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(0xa1));
  const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(0xb2));
  const attacker = PrivateKey.fromSeed(new Uint8Array(32).fill(0xcc));

  function part(userId: bigint, sk: PrivateKey, add: boolean, remove: boolean): GroupParticipant {
    return {userId, publicKey: sk.publicKeyBytes, canAddUsers: add, canRemoveUsers: remove, version: 0};
  }

  // Apply a zero block authored by alice (= participants[0]).
  function applyZero(group: GroupState) {
    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: group}],
      height: 0
    });
    return applyBlock(createInitialState(), zero);
  }

  async function expectReject(promise: Promise<unknown>, code: BlockchainError['code']) {
    await expect(promise).rejects.toMatchObject({code});
  }

  it('rejects a no-permission member ejecting an admin + injecting an attacker', async() => {
    // Closed group: Alice is admin, Bob has no permissions.
    const afterZero = await applyZero({
      participants: [part(aliceId, alice, true, true), part(bobId, bob, false, false)],
      externalPermissions: 0
    });
    const forged = buildSignedBlock({
      signer: bob, // no remove permission
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setGroupState', groupState: {
        participants: [part(bobId, bob, true, true), part(attackerId, attacker, true, true)],
        externalPermissions: 0
      }}],
      height: 1,
      explicitSignerKey: true
    });
    await expectReject(applyBlock(afterZero, forged), 'NO_PERMISSIONS');
  });

  it('rejects a self-add that grants permissions the signer does not hold', async() => {
    // External signers may only ADD (not remove).
    const afterZero = await applyZero({
      participants: [part(aliceId, alice, true, true)],
      externalPermissions: PERM_ADD_USERS
    });
    const forged = buildSignedBlock({
      signer: attacker,
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setGroupState', groupState: {
        participants: [part(aliceId, alice, true, true), part(attackerId, attacker, true, true)],
        externalPermissions: PERM_ADD_USERS
      }}],
      height: 1,
      explicitSignerKey: true
    });
    await expectReject(applyBlock(afterZero, forged), 'NO_PERMISSIONS');
  });

  it('rejects widening external_permissions', async() => {
    const afterZero = await applyZero({
      participants: [part(aliceId, alice, true, true)],
      externalPermissions: 0
    });
    const forged = buildSignedBlock({
      signer: alice,
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setGroupState', groupState: {
        participants: [part(aliceId, alice, true, true)],
        externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
      }}],
      height: 1
    });
    await expectReject(applyBlock(afterZero, forged), 'NO_PERMISSIONS');
  });

  it('rejects a non-member setting the group shared key', async() => {
    // Open group (external add+remove) but only MEMBERS may change the key.
    const group: GroupState = {
      participants: [part(aliceId, alice, true, true)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    };
    const afterZero = await applyZero(group);
    const forged = buildSignedBlock({
      signer: attacker, // not a participant
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setGroupState', groupState: group}],
      height: 1,
      explicitSignerKey: true
    });
    await expectReject(applyBlock(afterZero, forged), 'NO_PERMISSIONS');
  });

  it('rejects a block carrying no SetValue / SetGroupState change', async() => {
    const group: GroupState = {
      participants: [part(aliceId, alice, true, true)],
      externalPermissions: 0
    };
    const afterZero = await applyZero(group);
    const noopOnly = buildSignedBlock({
      signer: alice,
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'noop', nonce: new Uint8Array(32)}],
      height: 1,
      proofGroupState: group // no group change → proof must carry the unchanged group
    });
    await expectReject(applyBlock(afterZero, noopOnly), 'NO_CHANGES');
  });
});

// tdlib validate_state mandates the proof OMIT group_state/shared_key exactly
// when a change rebuilt them, and CARRY them otherwise — not just match-if-present.
describe('Blockchain.applyBlock — state-proof shape (tdlib validate_state)', () => {
  const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(0x2a));
  const aliceP = {
    userId: BigInt(1),
    publicKey: alice.publicKeyBytes,
    canAddUsers: true,
    canRemoveUsers: true,
    version: 0
  };
  const group: GroupState = {participants: [aliceP], externalPermissions: 0};

  async function expectReject(promise: Promise<unknown>, code: BlockchainError['code']) {
    await expect(promise).rejects.toMatchObject({code});
  }

  it('rejects a change-bearing block that redundantly includes group_state in the proof', async() => {
    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: group}],
      height: 0,
      proofGroupState: group // must be OMITTED when the block changes group_state
    });
    await expectReject(applyBlock(createInitialState(), zero), 'INVALID_STATE_PROOF');
  });

  it('rejects a no-group-change block that omits group_state from the proof', async() => {
    const zero = buildSignedBlock({
      signer: alice,
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: group}],
      height: 0
    });
    const afterZero = await applyBlock(createInitialState(), zero);
    const setValueBlock = buildSignedBlock({
      signer: alice,
      prevBlockHash: afterZero.lastBlockHash,
      changes: [{kind: 'setValue', key: new Uint8Array([1]), value: new Uint8Array([2])}],
      height: 1,
      kvHash: new Uint8Array(32).fill(0xcd)
      // proofGroupState omitted → must be PRESENT when the block doesn't change it
    });
    await expectReject(applyBlock(afterZero, setValueBlock), 'INVALID_STATE_PROOF');
  });
});
