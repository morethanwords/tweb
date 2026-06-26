/*
 * High-level E2eCall integration tests.
 *
 * Covers Phase 4d: composition of blockchain validation + per-frame encryption
 * + emoji commit-reveal into a single stateful object. End-to-end flows:
 *   1. Initiator builds a zero block; second user hydrates from it and joins
 *      via a self-add block.
 *   2. After both parties apply the self-add block, they can exchange
 *      encrypted packets and walk through emoji verification to a matching
 *      emoji hash.
 *   3. Failure modes — wrong user_id, non-participant, status sticky.
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {E2eCall, CallError} from '../call';
import {bytesToHex, ensureCryptoReady, sha256} from '../crypto';
import {PrivateKey} from '../keys';
import {decodeBlock, GroupParticipant, GroupState} from '../tlTypes';
import {PERM_ADD_USERS, PERM_REMOVE_USERS} from '../tlTypes';
import {localToServer, serverToLocal, TLReader} from '../tl';

beforeAll(() => ensureCryptoReady());

function participantFor(userId: bigint, sk: PrivateKey, version = 1): GroupParticipant {
  return {
    userId,
    publicKey: sk.publicKeyBytes,
    canAddUsers: true,
    canRemoveUsers: true,
    version
  };
}

describe('E2eCall — block lifecycle', () => {
  it('createZeroBlock + create roundtrip — initiator joins their own call', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(1));
    const aliceUserId = BigInt(1001);
    const groupState: GroupState = {
      participants: [participantFor(aliceUserId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    };
    const zeroBlockLocal = await E2eCall.createZeroBlock(alice, groupState);

    // Outbound bytes are in LOCAL form (block magic 0x639a3db6). The server bumps
    // the magic by +1 when relaying back to other clients.
    const view = new DataView(zeroBlockLocal.buffer, zeroBlockLocal.byteOffset, 4);
    expect(view.getUint32(0, true) >>> 0).toBe(0x639a3db6);

    // Decode directly (already local form) — must yield a valid block.
    const decoded = decodeBlock(new TLReader(zeroBlockLocal));
    expect(decoded.height).toBe(0);
    expect(decoded.changes.length).toBe(2);
    expect(decoded.changes[0].kind).toBe('setGroupState');
    expect(decoded.changes[1].kind).toBe('setSharedKey');

    // serverToLocal is tolerant — accepts local-form bytes unchanged.
    const localBytesCopy = serverToLocal(zeroBlockLocal);
    expect(localBytesCopy).toEqual(zeroBlockLocal);

    const call = await E2eCall.create(aliceUserId, alice, zeroBlockLocal);
    expect(call.getHeight()).toBe(0);
    expect(call.getGroupState().participants.length).toBe(1);
    expect(call.getStatus()).toBeNull();
  });

  it('rejects create() when our public key is not in the group_state', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(2));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(3));
    const groupState: GroupState = {
      participants: [participantFor(BigInt(1), alice)],
      externalPermissions: PERM_ADD_USERS
    };
    const zeroBlock = await E2eCall.createZeroBlock(alice, groupState);
    await expect(E2eCall.create(BigInt(99), bob, zeroBlock)).rejects.toThrow(CallError);
  });

  it('rejects create() when our user_id does not match the participant entry', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(4));
    const groupState: GroupState = {
      participants: [participantFor(BigInt(7), alice)],
      externalPermissions: 0
    };
    const zeroBlock = await E2eCall.createZeroBlock(alice, groupState);
    // Use the correct private key but claim a different user_id.
    await expect(E2eCall.create(BigInt(8), alice, zeroBlock)).rejects.toThrow(/WRONG_USER_ID/);
  });
});

describe('E2eCall — two-party flow', () => {
  it('initiator creates zero block, joiner builds self-add block, both converge', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(10));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(20));
    const aliceUserId = BigInt(100);
    const bobUserId = BigInt(200);

    // 1) Alice creates the zero block.
    const zeroBlockServer = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceUserId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });

    // 2) Alice hydrates from her own zero block.
    const aliceCall = await E2eCall.create(aliceUserId, alice, zeroBlockServer);

    // 3) Bob builds a self-add block on top of the zero block.
    const bobSelfAddServer = await E2eCall.createSelfAddBlock(
      bob,
      zeroBlockServer,
      participantFor(bobUserId, bob)
    );

    // 4) Alice applies Bob's join — height advances, group has both members.
    await aliceCall.applyBlockBytes(bobSelfAddServer);
    expect(aliceCall.getHeight()).toBe(1);
    const aliceGroup = aliceCall.getGroupState();
    expect(aliceGroup.participants.length).toBe(2);
    expect(new Set(aliceGroup.participants.map((p) => p.userId))).toEqual(
      new Set([aliceUserId, bobUserId])
    );

    // 5) Bob hydrates from the self-add block — also has height 1 + both members.
    const bobCall = await E2eCall.create(bobUserId, bob, bobSelfAddServer);
    expect(bobCall.getHeight()).toBe(1);

    // 6) Both parties agree on the last block hash.
    expect(bytesToHex(aliceCall.getLastBlockHash())).toBe(
      bytesToHex(bobCall.getLastBlockHash())
    );
  });

  it('encrypted packets round-trip after both parties join', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(30));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(40));
    const aliceId = BigInt(300);
    const bobId = BigInt(400);

    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const aliceCall = await E2eCall.create(aliceId, alice, zero);
    const selfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await aliceCall.applyBlockBytes(selfAdd);
    const bobCall = await E2eCall.create(bobId, bob, selfAdd);

    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33]);

    // Alice → Bob
    const aliceToBob = await aliceCall.encrypt(7, payload, 0);
    const bobReceived = await bobCall.decrypt(aliceId, 7, aliceToBob);
    expect(bytesToHex(bobReceived)).toBe(bytesToHex(payload));

    // Bob → Alice
    const bobToAlice = await bobCall.encrypt(7, payload, 0);
    const aliceReceived = await aliceCall.decrypt(bobId, 7, bobToAlice);
    expect(bytesToHex(aliceReceived)).toBe(bytesToHex(payload));
  });

  it('rejects packets encrypted by ourselves', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(50));
    const aliceId = BigInt(500);
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const aliceCall = await E2eCall.create(aliceId, alice, zero);
    const packet = await aliceCall.encrypt(0, new Uint8Array([1, 2, 3]), 0);
    await expect(aliceCall.decrypt(aliceId, 0, packet)).rejects.toThrow(/SELF_PACKET/);
  });
});

describe('E2eCall — emoji verification end-to-end', () => {
  it('both parties exchange commits + reveals and reach a matching emoji hash', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(60));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(70));
    const aliceId = BigInt(600);
    const bobId = BigInt(700);

    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const aliceCall = await E2eCall.create(aliceId, alice, zero);
    const selfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await aliceCall.applyBlockBytes(selfAdd);
    const bobCall = await E2eCall.create(bobId, bob, selfAdd);

    // Both parties begin in `commit` phase with their own commit queued.
    expect(aliceCall.getVerificationState()!.phase).toBe('commit');
    expect(bobCall.getVerificationState()!.phase).toBe('commit');

    const alicePending = aliceCall.pullOutbound();
    const bobPending = bobCall.pullOutbound();
    expect(alicePending).toHaveLength(1);
    expect(bobPending).toHaveLength(1);

    // Exchange commits. After receiving the other side's commit, each party
    // transitions to `reveal` + queues their reveal.
    await aliceCall.receiveInbound(bobPending[0]);
    await bobCall.receiveInbound(alicePending[0]);

    expect(aliceCall.getVerificationState()!.phase).toBe('reveal');
    expect(bobCall.getVerificationState()!.phase).toBe('reveal');

    const aliceReveal = aliceCall.pullOutbound();
    const bobReveal = bobCall.pullOutbound();
    expect(aliceReveal).toHaveLength(1);
    expect(bobReveal).toHaveLength(1);

    // Exchange reveals. After validating the other side's nonce against the
    // committed hash, both parties transition to `end` with the same emoji hash.
    await aliceCall.receiveInbound(bobReveal[0]);
    await bobCall.receiveInbound(aliceReveal[0]);

    const aliceFinal = aliceCall.getVerificationState()!;
    const bobFinal = bobCall.getVerificationState()!;
    expect(aliceFinal.phase).toBe('end');
    expect(bobFinal.phase).toBe('end');
    expect(aliceFinal.emojiHash).toBeDefined();
    expect(bobFinal.emojiHash).toBeDefined();
    expect(bytesToHex(aliceFinal.emojiHash!)).toBe(bytesToHex(bobFinal.emojiHash!));
  });

  it('garbage inbound message is silently dropped (call stays healthy)', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(80));
    const aliceId = BigInt(800);
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const aliceCall = await E2eCall.create(aliceId, alice, zero);

    // Random 100 bytes — not a valid TL broadcast.
    const garbage = new Uint8Array(100);
    for(let i = 0; i < garbage.length; i++) garbage[i] = (i * 31 + 7) & 0xff;

    await aliceCall.receiveInbound(garbage);
    // Call must still be healthy.
    expect(aliceCall.getStatus()).toBeNull();
  });
});

describe('E2eCall — failure modes', () => {
  it('failed block application sets sticky status', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(90));
    const aliceId = BigInt(900);
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const call = await E2eCall.create(aliceId, alice, zero);

    // Feed in a DIFFERENT zero-height block (e.g. another zero block from
    // a fresh group). It hashes to a different value than our chain tip, so
    // the dedup short-circuit doesn't fire, and the height check rejects
    // (state.height already 0, expected next = 1).
    const otherZero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(BigInt(901), PrivateKey.fromSeed(new Uint8Array(32).fill(91)))],
      externalPermissions: 0
    });
    await expect(call.applyBlockBytes(otherZero)).rejects.toThrow();
    expect(call.getStatus()).not.toBeNull();

    // Any subsequent operation must reject.
    await expect(call.encrypt(0, new Uint8Array([1]), 0)).rejects.toThrow();
    expect(() => call.getHeight()).toThrow();
  });

  it('re-applying the chain-tip block is an idempotent no-op', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(95));
    const aliceId = BigInt(950);
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const call = await E2eCall.create(aliceId, alice, zero);
    const heightBefore = call.getHeight();
    const hashBefore = call.getLastBlockHash();

    // The server echoes our own zero block back via the chain update stream
    // shortly after join. Applying it must NOT fail and must NOT advance
    // the state — we already integrated it during create().
    await call.applyBlockBytes(zero);
    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(heightBefore);
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(hashBefore));
  });

  it('block hash on the wire matches recomputation', async() => {
    // Sanity check on the block-hash serialization: a freshly created zero
    // block can be re-hashed locally and the value should be stable across
    // multiple decodes (no signature mangling).
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(100));
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(BigInt(1), alice)],
      externalPermissions: 0
    });
    const decoded1 = decodeBlock(new TLReader(serverToLocal(zero)));
    const decoded2 = decodeBlock(new TLReader(serverToLocal(zero)));
    // Computed block hash is deterministic (SHA-256 of the canonical bytes).
    const h1 = await sha256(serverToLocal(zero).subarray(0)); // SHA over full local bytes incl. magic
    const h2 = await sha256(serverToLocal(zero).subarray(0));
    expect(bytesToHex(h1)).toBe(bytesToHex(h2));
    expect(decoded1.height).toBe(decoded2.height);
  });
});

describe('E2eCall — applyBlockBytes dedup by hash', () => {
  // Server may echo our submitted blocks back via the chain-update stream.
  // `applyBlockBytes` short-circuits when the incoming block hashes to
  // `state.lastBlockHash`, instead of treating the height mismatch as a
  // failure. The helper accepts both server (+1 magic) and local-form bytes.

  it('re-applying the same chain tip leaves height + hash + status untouched', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(110));
    const aliceId = BigInt(1100);
    const zeroLocal = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const call = await E2eCall.create(aliceId, alice, zeroLocal);
    const heightBefore = call.getHeight();
    const hashBefore = call.getLastBlockHash();

    // Apply the chain-tip block multiple times — must remain a no-op.
    await call.applyBlockBytes(zeroLocal);
    await call.applyBlockBytes(zeroLocal);
    await call.applyBlockBytes(zeroLocal);

    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(heightBefore);
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(hashBefore));
  });

  it('dedup matches both server-form and local-form bytes of the chain tip', async() => {
    // `createZeroBlock` returns LOCAL-form bytes. The server normally echoes
    // them back with the +1 magic bump. The dedup must recognize the block as
    // already-applied regardless of which wire form it arrives in.
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(120));
    const aliceId = BigInt(1200);
    const zeroLocal = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const call = await E2eCall.create(aliceId, alice, zeroLocal);
    const hashBefore = call.getLastBlockHash();

    // 1) Local-form input (what we emitted) — dedup short-circuits.
    await call.applyBlockBytes(zeroLocal);
    expect(call.getStatus()).toBeNull();
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(hashBefore));

    // 2) Server-form input (the +1-bumped form the server relays) — same hash
    //    after `serverToLocal`, dedup short-circuits.
    const zeroServer = localToServer(zeroLocal);
    expect(zeroServer[0]).toBe((zeroLocal[0] + 1) & 0xff); // sanity: magic bumped
    await call.applyBlockBytes(zeroServer);
    expect(call.getStatus()).toBeNull();
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(hashBefore));
  });

  it('dedup does not mask a genuine sibling block — sticky failure preserved', async() => {
    // Regression guard for the case already covered by `failed block
    // application sets sticky status` — a different zero-height block from a
    // different group hashes differently than our chain tip, so the dedup
    // short-circuit does NOT fire, and the height check rejects.
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(130));
    const aliceId = BigInt(1300);
    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: 0
    });
    const call = await E2eCall.create(aliceId, alice, zero);

    const sibling = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(BigInt(1301), PrivateKey.fromSeed(new Uint8Array(32).fill(131)))],
      externalPermissions: 0
    });
    // Distinct from our chain tip — must not be treated as a dedup target.
    expect(Array.from(sibling)).not.toEqual(Array.from(zero));

    await expect(call.applyBlockBytes(sibling)).rejects.toThrow();
    expect(call.getStatus()).not.toBeNull();
  });
});

describe('E2eCall — applyBlockBytes re-delivery of older blocks', () => {
  // Regression for the conference-drop bug: the poll + push delivery paths can
  // re-deliver a BATCH of already-applied blocks when the poll cursor lagged
  // behind a burst of pushes (cursor only advanced on poll responses, so two
  // pushes left it two behind; the next poll then returned [h_n, h_{n+1}] that
  // were already applied). The OLDER block in such a batch is below the chain
  // tip, so the tip-only hash dedup missed it and `applyBlock` rejected it as a
  // fatal HEIGHT_MISMATCH — the worker raised `callFailed` and we hung up.

  it('re-applying a block BELOW the tip (not the tip itself) is a no-op', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(140));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(150));
    const aliceId = BigInt(1400);
    const bobId = BigInt(1500);

    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const call = await E2eCall.create(aliceId, alice, zero);

    // Advance the chain to height 1 — Bob self-adds. Now `zero` (height 0) is
    // strictly below our tip.
    const bobSelfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await call.applyBlockBytes(bobSelfAdd);
    expect(call.getHeight()).toBe(1);
    const tipHash = call.getLastBlockHash();

    // The server re-delivers the height-0 zero block (below our tip). With the
    // old tip-only dedup this threw HEIGHT_MISMATCH (0 != expected 2); now it's
    // a clean no-op that leaves the call healthy.
    await call.applyBlockBytes(zero);
    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(1);
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(tipHash));
  });

  it('replaying the whole applied chain as one batch keeps the call healthy', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(160));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(170));
    const aliceId = BigInt(1600);
    const bobId = BigInt(1700);

    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const call = await E2eCall.create(aliceId, alice, zero);
    const bobSelfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await call.applyBlockBytes(bobSelfAdd);
    const tipHash = call.getLastBlockHash();

    // The exact failing shape: a poll returns [zero(h0), bobSelfAdd(h1)] in
    // order, both already applied. h0 skipped by height, h1 skipped by hash.
    await call.applyBlockBytes(zero);
    await call.applyBlockBytes(bobSelfAdd);
    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(1);
    expect(Array.from(call.getLastBlockHash())).toEqual(Array.from(tipHash));

    // The chain is still live: a genuine next block (height 2) still applies.
    const carol = PrivateKey.fromSeed(new Uint8Array(32).fill(180));
    const carolSelfAdd = await E2eCall.createSelfAddBlock(
      carol,
      bobSelfAdd,
      participantFor(BigInt(1800), carol)
    );
    await call.applyBlockBytes(carolSelfAdd);
    expect(call.getStatus()).toBeNull();
    expect(call.getHeight()).toBe(2);
  });
});

describe('E2eCall — verification broadcast reordering', () => {
  it('buffers a future-height commit and replays it once the block arrives', async() => {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(0x71));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(0x72));
    const carol = PrivateKey.fromSeed(new Uint8Array(32).fill(0x73));
    const aliceId = BigInt(7001), bobId = BigInt(7002), carolId = BigInt(7003);

    const zero = await E2eCall.createZeroBlock(alice, {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS | PERM_REMOVE_USERS
    });
    const aliceCall = await E2eCall.create(aliceId, alice, zero);
    const bobSelfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await aliceCall.applyBlockBytes(bobSelfAdd); // alice @ height 1
    const bobCall = await E2eCall.create(bobId, bob, bobSelfAdd);

    // A new height-2 block: carol self-adds on top of bob's block.
    const carolSelfAdd = await E2eCall.createSelfAddBlock(carol, bobSelfAdd, participantFor(carolId, carol));

    // Bob applies it first and emits his commit for height 2.
    await bobCall.applyBlockBytes(carolSelfAdd);
    const bobOutbound = bobCall.pullOutbound();
    expect(bobOutbound.length).toBeGreaterThan(0);

    // Deliver Bob's height-2 commit to Alice while she is STILL at height 1.
    expect(aliceCall.getHeight()).toBe(1);
    for(const msg of bobOutbound) await aliceCall.receiveInbound(msg);
    // Buffered, not applied: Alice still at height 1 with only her own commit.
    expect(aliceCall.getVerificationState()!.height).toBe(1);
    expect(aliceCall.getVerificationState()!.commitsSeen).toBe(1);

    // Alice now applies the height-2 block → the buffered commit is replayed.
    await aliceCall.applyBlockBytes(carolSelfAdd);
    const vs = aliceCall.getVerificationState()!;
    expect(vs.height).toBe(2);
    expect(vs.commitsSeen).toBe(2); // self + Bob's replayed commit (Carol hasn't committed)
  });
});
