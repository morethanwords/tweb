/*
 * Regression tests for the unserialized-block-application defect.
 *
 * Two blocks delivered concurrently (the chain genuinely races: the
 * `updateGroupCallChainBlocks` push is fire-and-forget while the 1.5s poll
 * fetches the same window) used to tear E2eCall's read-modify-write apart:
 *
 *  - both applyBlock calls saw the same pre-block state, so the second died on
 *    HEIGHT_MISMATCH and the sticky `status` bricked the call permanently;
 *  - updateGroupSharedKey derived from block N's shared key but stamped the
 *    epoch with block N+1's hash and height. Because that entry already
 *    claimed the tip height it was never queued into `epochsToForget`, so the
 *    superseded key stayed active — and encryptPacket emits one header_b slot
 *    per active epoch, leaving every later frame readable by a participant the
 *    rekey was meant to remove.
 */

import {beforeAll, describe, expect, it, vi} from 'vitest';
import {E2eCall} from '@lib/calls/e2e/call';
import {applyBlock, buildBlock, buildChangesForNewState, createInitialState} from '@lib/calls/e2e/blockchain';
import {bytesToHex, ensureCryptoReady} from '@lib/calls/e2e/crypto';
import {PrivateKey} from '@lib/calls/e2e/keys';
import {GroupState, serializeBlock} from '@lib/calls/e2e/tlTypes';

beforeAll(() => ensureCryptoReady());

const ALICE = BigInt(1001);
const BOB = BigInt(2002);
const CAROL = BigInt(3003);

function participant(userId: bigint, sk: PrivateKey) {
  return {userId, publicKey: sk.publicKeyBytes, canAddUsers: true, canRemoveUsers: true, version: 0};
}

// Alice + Bob at height 0 and 1; Bob removed (and the key rotated) at height 2.
async function conference() {
  const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(101));
  const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(202));
  const both: GroupState = {
    participants: [participant(ALICE, alice), participant(BOB, bob)],
    externalPermissions: 3
  };

  const zeroChanges = await buildChangesForNewState(both);
  const zero = await buildBlock(createInitialState(), zeroChanges.changes, alice);
  const chain0 = await applyBlock(createInitialState(), zero);

  const call = await E2eCall.create(ALICE, alice, serializeBlock(zero));

  const c1 = await buildChangesForNewState(both);
  const block1 = await buildBlock(chain0, c1.changes, alice);
  const chain1 = await applyBlock(chain0, block1);

  const onlyAlice: GroupState = {participants: [participant(ALICE, alice)], externalPermissions: 3};
  const c2 = await buildChangesForNewState(onlyAlice);
  const block2 = await buildBlock(chain1, c2.changes, alice);

  return {call, block1: serializeBlock(block1), block2: serializeBlock(block2)};
}

function epochsOf(call: E2eCall) {
  return (call as unknown as {
    epochs: Array<{height: number; epochHash: Uint8Array; groupSharedKey: Uint8Array}>
  }).epochs;
}

// An epoch_hash that maps to more than one distinct shared key is the torn state.
function tornEpochHashes(call: E2eCall): string[] {
  const byHash = new Map<string, Set<string>>();
  for(const e of epochsOf(call)) {
    const h = bytesToHex(e.epochHash);
    if(!byHash.has(h)) byHash.set(h, new Set());
    byHash.get(h).add(bytesToHex(e.groupSharedKey));
  }
  return [...byHash.entries()].filter(([, keys]) => keys.size > 1).map(([h]) => h);
}

describe('concurrent chain-block delivery', () => {
  it('applies two blocks fired in the same tick without bricking the call', async() => {
    const {call, block1, block2} = await conference();

    await Promise.all([
      call.applyBlockBytes(block1),
      call.applyBlockBytes(block2)
    ]);

    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(2);
    expect(call.getGroupState().participants.map((p) => p.userId.toString())).toEqual([ALICE.toString()]);
  });

  it('never mints two epochs sharing an epoch_hash but holding different keys', async() => {
    const {call, block1, block2} = await conference();

    await Promise.all([
      call.applyBlockBytes(block1),
      call.applyBlockBytes(block2)
    ]);

    expect(tornEpochHashes(call)).toEqual([]);
  });

  it('never runs two block applications concurrently', async() => {
    // The direct test of the fix. Instrument the locked body and assert it is
    // never re-entered while in flight: without the queue both applications ran
    // against the same pre-block state, which is what produced the torn epoch
    // and the HEIGHT_MISMATCH bricking. This fails on the unfixed code (peak
    // concurrency 2) rather than passing vacuously.
    const {call, block1, block2} = await conference();
    const internals = call as unknown as {applyBlockBytesLocked: (b: Uint8Array) => Promise<void>};

    let inFlight = 0;
    let peak = 0;
    const original = internals.applyBlockBytesLocked.bind(call);
    internals.applyBlockBytesLocked = async(block: Uint8Array) => {
      ++inFlight;
      peak = Math.max(peak, inFlight);
      try {
        return await original(block);
      } finally {
        --inFlight;
      }
    };

    await Promise.all([call.applyBlockBytes(block1), call.applyBlockBytes(block2)]);

    expect(peak).toBe(1);
    expect(call.getHeight()).toBe(2);
    expect(call.getStatus()).toBeNull();
    expect(tornEpochHashes(call)).toEqual([]);
  });

  it('every active epoch is either the tip or scheduled for eviction', async() => {
    const {call, block1, block2} = await conference();
    await Promise.all([call.applyBlockBytes(block1), call.applyBlockBytes(block2)]);

    const toForget = new Set(
      (call as unknown as {epochsToForget: Array<{epochHash: Uint8Array}>})
      .epochsToForget.map((e) => bytesToHex(e.epochHash))
    );
    const tip = bytesToHex(call.getLastBlockHash());

    for(const epoch of epochsOf(call)) {
      const hash = bytesToHex(epoch.epochHash);
      // A superseded key that is never queued for eviction stays usable for the
      // rest of the call — that is the forward-secrecy break.
      expect(hash === tip || toForget.has(hash)).toBe(true);
    }
  });

  it('re-seeding from a different block replaces the anchor wholesale', async() => {
    // The worker is seeded from the join block the client PROPOSED, before the
    // server has accepted it. On CONF_WRITE_CHAIN_INVALID the retry submits a
    // different block built on a newer head, so the call has to be re-anchored
    // or it stays bound to a block that never entered the chain — wrong height,
    // wrong last_block_hash, and an epoch key no peer holds.
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(101));
    const both: GroupState = {
      participants: [participant(ALICE, alice)],
      externalPermissions: 3
    };

    const a = await buildChangesForNewState(both);
    const proposed = await buildBlock(createInitialState(), a.changes, alice);

    // A DIFFERENT zero block (fresh shared key) — what the retry actually got in.
    const b = await buildChangesForNewState(both);
    const accepted = await buildBlock(createInitialState(), b.changes, alice);

    const first = await E2eCall.create(ALICE, alice, serializeBlock(proposed));
    const reseeded = await E2eCall.create(ALICE, alice, serializeBlock(accepted));

    // Distinct anchors — otherwise this test proves nothing.
    expect(bytesToHex(first.getLastBlockHash())).not.toBe(bytesToHex(reseeded.getLastBlockHash()));
    expect(reseeded.getHeight()).toBe(0);
    expect(reseeded.getStatus()).toBeNull();

    // The re-seeded call must carry the ACCEPTED block's epoch, not the proposed one.
    const anchors = epochsOf(reseeded).map((e) => bytesToHex(e.epochHash));
    expect(anchors).toContain(bytesToHex(reseeded.getLastBlockHash()));
    expect(anchors).not.toContain(bytesToHex(first.getLastBlockHash()));
  });

  it('re-delivering the same block does not add a second epoch', async() => {
    const {call, block1} = await conference();
    await call.applyBlockBytes(block1);
    const after = epochsOf(call).length;
    await call.applyBlockBytes(block1);
    expect(epochsOf(call).length).toBe(after);
    expect(call.getStatus()).toBeNull();
  });

  it('builds only_left removal from the current queued state', async() => {
    const {call, block1} = await conference();
    await call.applyBlockBytes(block1);

    const carol = PrivateKey.fromSeed(new Uint8Array(32).fill(33));
    const carolSelfAdd = await E2eCall.createSelfAddBlock(
      carol,
      block1,
      participant(CAROL, carol)
    );

    // Queue Carol's accepted block first, then request Bob's removal. A
    // main-thread S1 snapshot would drop Carol as collateral; the worker-owned
    // operation must read S2 and preserve her.
    const applied = call.applyBlockBytes(carolSelfAdd);
    const built = call.buildRemoveParticipantsBlock([BOB]);
    await applied;
    const removal = await built;
    if(!removal) throw new Error('expected a removal block');

    expect(removal.removedUserIds).toEqual([BOB]);
    await call.applyBlockBytes(removal.block);
    expect(call.getGroupState().participants.map(({userId}) => userId)).toEqual([ALICE, CAROL]);
  });

  it('expires superseded epochs on monotonic time despite a backward wall-clock jump', async() => {
    const wallNow = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const monotonicNow = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    try {
      const {call, block1} = await conference();
      await call.applyBlockBytes(block1);
      expect(epochsOf(call)).toHaveLength(2);

      // Civil time jumps backwards by weeks while monotonic time advances past
      // the 10-second grace period.
      wallNow.mockReturnValue(-1_000_000_000);
      monotonicNow.mockReturnValue(11_001);
      await call.encrypt(0, new Uint8Array([1]), 0);

      expect(epochsOf(call)).toHaveLength(1);
      expect(epochsOf(call)[0].height).toBe(call.getHeight());
    } finally {
      wallNow.mockRestore();
      monotonicNow.mockRestore();
    }
  });
});
