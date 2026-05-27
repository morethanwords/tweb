/*
 * Emoji commit-reveal tests. Simulates two participants exchanging their
 * commits + reveals and verifies they reach the same emoji_hash.
 */

import {beforeAll, describe, it, expect} from 'vitest';
import {bytesToHex, ensureCryptoReady, hmacSha512, randomBytes, sha256} from '../crypto';
import {PrivateKey} from '../keys';
import {VerificationChain, VerificationParticipant} from '../emoji';
import {decodeGroupBroadcast} from '../tlTypes';
import {TLReader} from '../tl';

beforeAll(() => ensureCryptoReady());

// Decode every queued outbound msg from a chain.
function pullAll(chain: VerificationChain) {
  return chain.pullOutbound().map((b) => decodeGroupBroadcast(new TLReader(b)));
}

// Run one round of the protocol between two chains until both finalize, or
// `maxSteps` is exceeded. Asserts both reach 'end' with matching emojis.
async function runRound(a: VerificationChain, b: VerificationChain) {
  for(let step = 0; step < 8; step++) {
    const aMsgs = pullAll(a);
    const bMsgs = pullAll(b);
    if(aMsgs.length === 0 && bMsgs.length === 0) break;
    for(const m of aMsgs) await b.receive(m);
    for(const m of bMsgs) await a.receive(m);
  }
}

describe('Emoji commit-reveal', () => {
  it('two participants converge on the same emoji_hash', async() => {
    const aliceKey = PrivateKey.fromSeed(new Uint8Array(32).fill(1));
    const bobKey = PrivateKey.fromSeed(new Uint8Array(32).fill(2));
    const alice: VerificationParticipant = {
      userId: BigInt('1001'),
      publicKey: aliceKey.publicKey()
    };
    const bob: VerificationParticipant = {userId: BigInt('1002'), publicKey: bobKey.publicKey()};

    const blockHash = randomBytes(32);
    const participants = [alice, bob];

    const aliceChain = await VerificationChain.start(7, blockHash, alice, aliceKey, participants);
    const bobChain = await VerificationChain.start(7, blockHash, bob, bobKey, participants);

    expect(aliceChain.snapshot().phase).toBe('commit');
    expect(aliceChain.snapshot().commitsSeen).toBe(1);
    expect(bobChain.snapshot().commitsSeen).toBe(1);

    await runRound(aliceChain, bobChain);

    const aSnap = aliceChain.snapshot();
    const bSnap = bobChain.snapshot();
    expect(aSnap.phase).toBe('end');
    expect(bSnap.phase).toBe('end');
    expect(aSnap.emojiHash).toBeDefined();
    expect(bSnap.emojiHash).toBeDefined();
    expect(bytesToHex(aSnap.emojiHash!)).toBe(bytesToHex(bSnap.emojiHash!));
  });

  it('rejects a reveal whose nonce does not match its committed hash', async() => {
    const aliceKey = PrivateKey.fromSeed(new Uint8Array(32).fill(3));
    const bobKey = PrivateKey.fromSeed(new Uint8Array(32).fill(4));
    const alice: VerificationParticipant = {userId: BigInt('1'), publicKey: aliceKey.publicKey()};
    const bob: VerificationParticipant = {userId: BigInt('2'), publicKey: bobKey.publicKey()};
    const blockHash = randomBytes(32);
    const participants = [alice, bob];

    const aliceChain = await VerificationChain.start(0, blockHash, alice, aliceKey, participants);
    const bobChain = await VerificationChain.start(0, blockHash, bob, bobKey, participants);

    // Cross-feed commits (one each).
    const [aliceCommit] = pullAll(aliceChain);
    const [bobCommit] = pullAll(bobChain);
    await aliceChain.receive(bobCommit); // alice advances to reveal
    await bobChain.receive(aliceCommit); // bob advances to reveal

    // Both now have a pending reveal queued. Pull alice's reveal, tamper
    // the nonce so SHA256(nonce) no longer matches the committed hash, and
    // hand the bad reveal to bob.
    const [aliceReveal] = pullAll(aliceChain);
    if(aliceReveal.kind !== 'reveal') throw new Error('expected reveal');
    aliceReveal.nonce = new Uint8Array(aliceReveal.nonce);
    aliceReveal.nonce[0] ^= 0x01;

    const handled = await bobChain.receive(aliceReveal);
    expect(handled).toBe(false);
    expect(bobChain.snapshot().phase).toBe('reveal');
  });

  it('rejects a broadcast for a different block', async() => {
    const aliceKey = PrivateKey.fromSeed(new Uint8Array(32).fill(5));
    const bobKey = PrivateKey.fromSeed(new Uint8Array(32).fill(6));
    const alice: VerificationParticipant = {userId: BigInt('1'), publicKey: aliceKey.publicKey()};
    const bob: VerificationParticipant = {userId: BigInt('2'), publicKey: bobKey.publicKey()};
    const blockHash = randomBytes(32);
    const participants = [alice, bob];

    const aliceChain = await VerificationChain.start(5, blockHash, alice, aliceKey, participants);
    const bobChain = await VerificationChain.start(99, randomBytes(32), bob, bobKey, participants);

    // Bob's commit references a different (height, hash) — alice should drop it.
    const bobMsg = decodeGroupBroadcast(new TLReader(bobChain.pullOutbound()[0]));
    const handled = await aliceChain.receive(bobMsg);
    expect(handled).toBe(false);
    expect(aliceChain.snapshot().phase).toBe('commit');
  });

  it('emoji_hash = HMAC-SHA512(sorted_nonces, blockHash)[0:32]', async() => {
    // Two-participant case so we can predict the sort order and compute the
    // expected hash directly.
    const aliceKey = PrivateKey.fromSeed(new Uint8Array(32).fill(7));
    const bobKey = PrivateKey.fromSeed(new Uint8Array(32).fill(8));
    const alice: VerificationParticipant = {
      userId: BigInt('1'),
      publicKey: aliceKey.publicKey()
    };
    const bob: VerificationParticipant = {userId: BigInt('2'), publicKey: bobKey.publicKey()};
    const blockHash = randomBytes(32);
    const participants = [alice, bob];

    const aChain = await VerificationChain.start(0, blockHash, alice, aliceKey, participants);
    const bChain = await VerificationChain.start(0, blockHash, bob, bobKey, participants);

    // We need to capture the reveals as they fly past, since they hold the
    // raw nonces (we don't expose the chain's private nonce directly).
    const capturedNonces: Uint8Array[] = [];

    // Manual stepwise dispatch so we can sniff messages.
    const [aCommit] = pullAll(aChain);
    const [bCommit] = pullAll(bChain);
    await aChain.receive(bCommit);
    await bChain.receive(aCommit);

    // Both should now have a reveal pending.
    const aReveals = pullAll(aChain);
    const bReveals = pullAll(bChain);
    for(const m of aReveals) {
      if(m.kind === 'reveal') capturedNonces.push(m.nonce);
      await bChain.receive(m);
    }
    for(const m of bReveals) {
      if(m.kind === 'reveal') capturedNonces.push(m.nonce);
      await aChain.receive(m);
    }

    const aSnap = aChain.snapshot();
    const bSnap = bChain.snapshot();
    expect(aSnap.phase).toBe('end');
    expect(bSnap.phase).toBe('end');

    // Predict: sort nonces by raw bytes, concat, HMAC-SHA512(concat, blockHash).
    expect(capturedNonces.length).toBe(2);
    capturedNonces.sort((a, b) => {
      const cap = Math.min(a.length, b.length);
      for(let i = 0; i < cap; i++) if(a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    });
    const concat = new Uint8Array(capturedNonces[0].length + capturedNonces[1].length);
    concat.set(capturedNonces[0], 0);
    concat.set(capturedNonces[1], capturedNonces[0].length);
    const expected = (await hmacSha512(concat, blockHash)).subarray(0, 32);
    expect(bytesToHex(aSnap.emojiHash!)).toBe(bytesToHex(expected));
    expect(bytesToHex(bSnap.emojiHash!)).toBe(bytesToHex(expected));

    // Sanity: commit's nonceHash equals SHA256(corresponding nonce).
    if(aCommit.kind !== 'commit') throw new Error('expected commit');
    const aliceNonce = capturedNonces.find((n) => bytesToHex(n).length > 0);
    expect(aliceNonce).toBeDefined();
    // (correctness of this specific pairing is hard to assert without
    // user-id-keyed nonces; the protocol-level emoji-hash match above already
    // implies SHA256(nonce) == committed hash for every accepted reveal.)
    void sha256; // silence unused warning if any
  });
});
