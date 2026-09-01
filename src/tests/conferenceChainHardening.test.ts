/*
 * Regression tests for the chain-validation hardening found by the E2EE
 * conference audit:
 *
 *  - participant `flags` survive a decode/encode round trip. The block
 *    signature is verified over a RE-SERIALIZATION of the decoded block, so a
 *    bit dropped on decode is a bit signed differently from the sender — tweb
 *    and every official client would disagree about the same block.
 *  - flags outside AllPermissions are rejected outright (tdlib
 *    Blockchain.cpp:340-343) rather than silently masked.
 *  - hydrateStateFromBlock enforces the same state-proof shape applyBlock does.
 *  - buildBlock validates the state it is about to sign.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {
  applyBlock, buildBlock, createInitialState, hydrateStateFromBlock
} from '@lib/calls/e2e/blockchain';
import {bytesToHex, ensureCryptoReady} from '@lib/calls/e2e/crypto';
import {PrivateKey} from '@lib/calls/e2e/keys';
import {
  Block, GroupParticipant, GroupState, PERM_SET_VALUE, SharedKey,
  decodeGroupParticipant, encodeGroupParticipant, participantFlags,
  serializeBlockForSigning
} from '@lib/calls/e2e/tlTypes';
import {TLReader, TLWriter} from '@lib/calls/e2e/tl';

beforeAll(() => ensureCryptoReady());

const alice = () => PrivateKey.fromSeed(new Uint8Array(32).fill(11));
const bob = () => PrivateKey.fromSeed(new Uint8Array(32).fill(22));

function participant(sk: PrivateKey, userId: bigint, flags?: number): GroupParticipant {
  return {
    userId,
    publicKey: sk.publicKeyBytes,
    canAddUsers: true,
    canRemoveUsers: true,
    version: 0,
    flags
  };
}

function duplicatePublicKeyState(): GroupState {
  const sk = alice();
  return {
    participants: [participant(sk, BigInt(1)), participant(sk, BigInt(2))],
    externalPermissions: 0
  };
}

function duplicateUserIdState(): GroupState {
  return {
    participants: [participant(alice(), BigInt(7)), participant(bob(), BigInt(7))],
    externalPermissions: 0
  };
}

function proofSharedKey(state: GroupState): SharedKey {
  return {
    ek: new Uint8Array(32),
    encryptedSharedKey: new Uint8Array(),
    destUserIds: state.participants.map((p) => p.userId),
    destHeaders: state.participants.map(() => new Uint8Array())
  };
}

function roundTripParticipant(p: GroupParticipant): GroupParticipant {
  const w = new TLWriter();
  encodeGroupParticipant(w, p);
  return decodeGroupParticipant(new TLReader(w.finish()));
}

describe('participant flags', () => {
  it('round-trips a flag bit the booleans cannot express', () => {
    // SetValue is meaningless to us (no kv trie) but must survive, or we
    // re-serialize — and therefore verify — a different block than the sender
    // signed.
    const withSetValue = participant(alice(), BigInt(1), 1 | 2 | PERM_SET_VALUE);
    const back = roundTripParticipant(withSetValue);

    expect(participantFlags(back)).toBe(1 | 2 | PERM_SET_VALUE);
    expect(back.canAddUsers).toBe(true);
    expect(back.canRemoveUsers).toBe(true);
  });

  it('re-encodes to the exact bytes it decoded', () => {
    const original = participant(alice(), BigInt(1), 1 | 2 | PERM_SET_VALUE);
    const w1 = new TLWriter();
    encodeGroupParticipant(w1, original);
    const first = w1.finish();

    const w2 = new TLWriter();
    encodeGroupParticipant(w2, decodeGroupParticipant(new TLReader(first)));
    expect(bytesToHex(w2.finish())).toBe(bytesToHex(first));
  });

  it('leaves an ordinary participant byte-identical and flag-free', () => {
    const plain = participant(alice(), BigInt(1));
    const back = roundTripParticipant(plain);
    expect(back.flags).toBeUndefined();
    expect(participantFlags(back)).toBe(1 | 2);
  });

  it('refuses to sign a group_state whose participant carries unknown bits', async() => {
    const sk = alice();
    const state: GroupState = {
      // bit 5 is outside AllPermissions (=7)
      participants: [participant(sk, BigInt(1), 1 | 2 | (1 << 5))],
      externalPermissions: 0
    };
    await expect(
      buildBlock(createInitialState(), [{kind: 'setGroupState', groupState: state}], sk)
    ).rejects.toThrow(/participant flags have invalid bits/);
  });
});

describe('buildBlock validates before signing', () => {
  it('rejects a group_state with a duplicate public key', async() => {
    const sk = alice();
    await expect(
      buildBlock(createInitialState(), [{kind: 'setGroupState', groupState: duplicatePublicKeyState()}], sk)
    ).rejects.toThrow(/duplicate public_key/);
  });

  it('rejects a group_state with a duplicate user_id', async() => {
    await expect(
      buildBlock(createInitialState(), [{kind: 'setGroupState', groupState: duplicateUserIdState()}], alice())
    ).rejects.toThrow(/duplicate user_id/);
  });
});

describe('hydrateStateFromBlock enforces the state-proof shape', () => {
  function seedBlock(over: Partial<Block>): Block {
    const sk = alice();
    const state: GroupState = {participants: [participant(sk, BigInt(1))], externalPermissions: 0};
    const body: Block = {
      signature: new Uint8Array(64),
      prevBlockHash: new Uint8Array(32),
      changes: [{kind: 'setGroupState', groupState: state}],
      height: 0,
      stateProof: {kvHash: createInitialState().kvHash, groupState: undefined},
      signaturePublicKey: undefined,
      ...over
    };
    body.signature = sk.sign(serializeBlockForSigning(body));
    return body;
  }

  it('accepts a block whose proof omits the group_state its changes rebuild', async() => {
    await expect(hydrateStateFromBlock(seedBlock({}))).resolves.toBeTruthy();
  });

  it('rejects a proof that redundantly carries a group_state the changes already set', async() => {
    // This was the override: the proof silently replaced whatever the changes
    // produced, so a seed block could show innocuous changes and install a
    // different access list.
    const sk = alice();
    const other: GroupState = {participants: [participant(bob(), BigInt(99))], externalPermissions: 0};
    const block = seedBlock({stateProof: {kvHash: createInitialState().kvHash, groupState: other}});
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/must be omitted from the proof/);
  });

  it('rejects a block that has neither SetValue nor SetGroupState even with complete proofs', async() => {
    const state: GroupState = {participants: [participant(alice(), BigInt(1))], externalPermissions: 0};
    const block = seedBlock({
      changes: [{kind: 'noop', nonce: new Uint8Array(32)}],
      stateProof: {
        kvHash: createInitialState().kvHash,
        groupState: state,
        sharedKey: proofSharedKey(state)
      }
    });
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/neither a SetValue nor a SetGroupState/);
  });

  it('requires a group_state proof when SetValue is the only state change', async() => {
    const state: GroupState = {participants: [participant(alice(), BigInt(1))], externalPermissions: 0};
    const block = seedBlock({
      changes: [{kind: 'setValue', key: new Uint8Array([1]), value: new Uint8Array([2])}],
      stateProof: {kvHash: createInitialState().kvHash, sharedKey: proofSharedKey(state)}
    });
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/group_state must be present/);
  });

  it('requires a shared_key proof when the block does not change the shared state', async() => {
    const state: GroupState = {participants: [participant(alice(), BigInt(1))], externalPermissions: 0};
    const block = seedBlock({
      changes: [{kind: 'setValue', key: new Uint8Array([1]), value: new Uint8Array([2])}],
      stateProof: {kvHash: createInitialState().kvHash, groupState: state}
    });
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/shared_key must be present/);
  });

  it('accepts SetValue hydration when both unchanged-state proofs are present', async() => {
    const state: GroupState = {participants: [participant(alice(), BigInt(1))], externalPermissions: 0};
    const block = seedBlock({
      changes: [{kind: 'setValue', key: new Uint8Array([1]), value: new Uint8Array([2])}],
      stateProof: {
        kvHash: createInitialState().kvHash,
        groupState: state,
        sharedKey: proofSharedKey(state)
      }
    });
    await expect(hydrateStateFromBlock(block)).resolves.toMatchObject({groupState: state});
  });

  it('rejects duplicate public keys on both inbound hydration paths', async() => {
    const block = seedBlock({
      changes: [{kind: 'setGroupState', groupState: duplicatePublicKeyState()}]
    });
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/duplicate public_key/);
    await expect(applyBlock(createInitialState(), block)).rejects.toThrow(/duplicate public_key/);
  });

  it('rejects duplicate user ids on both inbound hydration paths', async() => {
    const block = seedBlock({
      changes: [{kind: 'setGroupState', groupState: duplicateUserIdState()}]
    });
    await expect(hydrateStateFromBlock(block)).rejects.toThrow(/duplicate user_id/);
    await expect(applyBlock(createInitialState(), block)).rejects.toThrow(/duplicate user_id/);
  });

  it('still rejects a negative height', async() => {
    await expect(hydrateStateFromBlock(seedBlock({height: -1}))).rejects.toThrow(/negative block height/);
  });
});
