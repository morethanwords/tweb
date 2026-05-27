/*
 * libtgcalls audio frame trailer — round-trip + strip-branch coverage.
 *
 * Mirrors the C++ wrap/unwrap at GroupInstanceCustomImpl.cpp:1466-1525.
 *
 *   ENCRYPT (audio out): plain = encodedFrameData || 0x01 || encodedAudioLevelAndSpeech
 *   DECRYPT (audio in):  result[len-2] & 0x01 ? strip 2 bytes : strip 1 byte
 */

import {beforeAll, describe, expect, it} from 'vitest';
import {appendAudioTrailer, stripAudioTrailer} from '../audioTrailer';
import {E2eCall} from '../call';
import {bytesToHex, ensureCryptoReady} from '../crypto';
import {PrivateKey} from '../keys';
import {GroupParticipant, GroupState, PERM_ADD_USERS} from '../tlTypes';

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

describe('audioTrailer — pure wrap/unwrap', () => {
  it('appendAudioTrailer appends exactly 2 bytes: 0x01 then the level byte', () => {
    const original = new Uint8Array([0xaa, 0xbb, 0xcc]);
    const wrapped = appendAudioTrailer(original);
    expect(wrapped.length).toBe(original.length + 2);
    // Original bytes preserved.
    expect(Array.from(wrapped.subarray(0, original.length))).toEqual(Array.from(original));
    // Flag byte (last-but-one): 0x01.
    expect(wrapped[wrapped.length - 2]).toBe(0x01);
    // Audio level byte (last): placeholder 0x00 (silence, no speech).
    expect(wrapped[wrapped.length - 1]).toBe(0x00);
  });

  it('appendAudioTrailer does not mutate the input', () => {
    const original = new Uint8Array([1, 2, 3, 4]);
    const before = Array.from(original);
    appendAudioTrailer(original);
    expect(Array.from(original)).toEqual(before);
  });

  it('strip handles the 2-byte trailer branch (last-but-one byte has bit 0 set)', () => {
    // Construct: payload + 0x01 + audio-level byte.
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const wrapped = appendAudioTrailer(payload);
    const stripped = stripAudioTrailer(wrapped);
    expect(Array.from(stripped)).toEqual(Array.from(payload));
  });

  it('strip handles the legacy 1-byte trailer branch (last-but-one byte has bit 0 clear)', () => {
    // Last-but-one byte is 0x00 (bit 0 clear) → strip just the final byte.
    const buf = new Uint8Array([0x11, 0x22, 0x33, 0x00, 0xff]);
    const stripped = stripAudioTrailer(buf);
    expect(Array.from(stripped)).toEqual([0x11, 0x22, 0x33, 0x00]);
  });

  it('strip flag detection inspects only bit 0 of the last-but-one byte', () => {
    // Last-but-one byte = 0x02 (bit 1 set, bit 0 clear) → legacy 1-byte strip.
    const a = new Uint8Array([0x77, 0x88, 0x02, 0x99]);
    expect(Array.from(stripAudioTrailer(a))).toEqual([0x77, 0x88, 0x02]);

    // Last-but-one byte = 0x03 (bit 0 set, bit 1 set) → 2-byte strip.
    const b = new Uint8Array([0x77, 0x88, 0x03, 0x99]);
    expect(Array.from(stripAudioTrailer(b))).toEqual([0x77, 0x88]);
  });

  it('strip is no-op-safe on length 0 / 1 inputs', () => {
    expect(Array.from(stripAudioTrailer(new Uint8Array(0)))).toEqual([]);
    // Length 1: too short for the 2-byte form, falls through to "strip 1".
    expect(Array.from(stripAudioTrailer(new Uint8Array([0x42])))).toEqual([]);
  });

  it('round-trips arbitrary payloads', () => {
    // Cover the boundary where payload's last byte itself looks like 0x01 —
    // append still wraps, strip still recovers exactly the original.
    for(const payload of [
      new Uint8Array(),
      new Uint8Array([0x00]),
      new Uint8Array([0x01]),
      new Uint8Array([0x00, 0x01]),
      new Uint8Array([0x01, 0x00]),
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      new Uint8Array(Array.from({length: 100}, (_, i) => i & 0xff))
    ]) {
      const wrapped = appendAudioTrailer(payload);
      const recovered = stripAudioTrailer(wrapped);
      expect(Array.from(recovered)).toEqual(Array.from(payload));
    }
  });
});

describe('audioTrailer — E2eCall encrypt/decrypt round-trip', () => {
  // Two-party setup borrowed from e2eCall.test.ts — Alice + Bob both join,
  // then we exercise encrypt(wrap(...)) on one side and decrypt + strip on
  // the other.
  async function makeTwoPartyCall() {
    const alice = PrivateKey.fromSeed(new Uint8Array(32).fill(0xa1));
    const bob = PrivateKey.fromSeed(new Uint8Array(32).fill(0xb2));
    const aliceId = BigInt(1001);
    const bobId = BigInt(2002);

    const groupState: GroupState = {
      participants: [participantFor(aliceId, alice)],
      externalPermissions: PERM_ADD_USERS
    };
    const zero = await E2eCall.createZeroBlock(alice, groupState);
    const aliceCall = await E2eCall.create(aliceId, alice, zero);
    const selfAdd = await E2eCall.createSelfAddBlock(bob, zero, participantFor(bobId, bob));
    await aliceCall.applyBlockBytes(selfAdd);
    const bobCall = await E2eCall.create(bobId, bob, selfAdd);

    return {aliceCall, bobCall, aliceId, bobId};
  }

  it('audio frame survives wrap + encrypt + decrypt + strip', async() => {
    const {aliceCall, bobCall, aliceId} = await makeTwoPartyCall();
    const channelId = 0;

    // Simulated Opus frame payload — arbitrary bytes including 0x01 boundary
    // cases so we know strip is using the last-but-one byte, not the input.
    const opusFrame = new Uint8Array([
      0xfc, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x00
    ]);

    // Send side (Alice): wrap → encrypt.
    const wrapped = appendAudioTrailer(opusFrame);
    const onWire = await aliceCall.encrypt(channelId, wrapped, 0);

    // Recv side (Bob): decrypt → strip.
    const decrypted = await bobCall.decrypt(aliceId, channelId, onWire);
    const recovered = stripAudioTrailer(decrypted);

    expect(bytesToHex(recovered)).toBe(bytesToHex(opusFrame));
  });

  it('strip recovers the original payload when the decrypted bytes carry the 2-byte trailer', async() => {
    const {aliceCall, bobCall, aliceId} = await makeTwoPartyCall();

    // Plain payload that happens to end in 0x00 — without a trailer, strip
    // would chop off our last byte. With a trailer (flag = 0x01), strip
    // correctly drops the 2 trailer bytes only.
    const payload = new Uint8Array([0xa0, 0xa1, 0xa2, 0x00]);
    const wrapped = appendAudioTrailer(payload);
    const onWire = await aliceCall.encrypt(0, wrapped, 0);
    const decrypted = await bobCall.decrypt(aliceId, 0, onWire);

    // Decrypted bytes' second-to-last byte must be the 0x01 flag we injected.
    expect(decrypted[decrypted.length - 2]).toBe(0x01);
    const recovered = stripAudioTrailer(decrypted);
    expect(Array.from(recovered)).toEqual(Array.from(payload));
  });

  it('strip drops only the final byte when the decrypted bytes carry a 1-byte (legacy) trailer', async() => {
    // The C++ reference accepts inbound frames without the metadata byte — in
    // that case the last-but-one byte is part of the actual payload, and its
    // low bit happens to be 0 in this fixture. Simulate by encrypting a
    // hand-crafted "legacy" plaintext (payload || 1-byte trailer) and confirm
    // strip walks the 1-byte branch.
    const {aliceCall, bobCall, aliceId} = await makeTwoPartyCall();

    // Payload whose last byte has bit 0 clear, then a single trailer byte.
    // After decrypt, the bytes end with [..., 0x00, 0xff]. Since 0x00 & 0x01 == 0,
    // strip should drop only the final 0xff and recover [..., 0x00].
    const payload = new Uint8Array([0x10, 0x20, 0x30, 0x00]);
    const legacy = new Uint8Array(payload.length + 1);
    legacy.set(payload, 0);
    legacy[payload.length] = 0xff; // 1-byte trailer, value irrelevant once stripped

    const onWire = await aliceCall.encrypt(0, legacy, 0);
    const decrypted = await bobCall.decrypt(aliceId, 0, onWire);

    expect(decrypted[decrypted.length - 1]).toBe(0xff);
    // Flag byte clear → 1-byte strip.
    expect((decrypted[decrypted.length - 2] & 0x01)).toBe(0);
    const recovered = stripAudioTrailer(decrypted);
    expect(Array.from(recovered)).toEqual(Array.from(payload));
  });
});
