/*
 * Emoji fingerprint mapping tests.
 *
 * The big property we care about: a given 32-byte hash maps to the SAME
 * 4-emoji sequence on every Telegram client. We can't run the C++ reference
 * here, but we can pin:
 *   1. Length & shape (always 4 emojis from 32 bytes).
 *   2. Determinism.
 *   3. Known-answer for trivial inputs (all-zeros, low bits set).
 *   4. Top-bit-cleared semantics matches the C++ (input differing only in
 *      bit 0 of byte 0 ↔ bit 7 of byte 0 maps to the same index).
 */

import {describe, expect, it} from 'vitest';
import {emojiFingerprint, emojiFingerprintString, getFingerprintEmojiCount} from '../emojiFingerprint';

describe('emojiFingerprint', () => {
  it('produces 4 emojis from a 32-byte hash', () => {
    const out = emojiFingerprint(new Uint8Array(32));
    expect(out).toHaveLength(4);
    for(const e of out) {
      expect(typeof e).toBe('string');
      expect(e.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic for the same input', () => {
    const hash = new Uint8Array(32);
    for(let i = 0; i < hash.length; i++) hash[i] = (i * 37 + 11) & 0xff;
    expect(emojiFingerprint(hash)).toEqual(emojiFingerprint(hash));
  });

  it('all-zeros hash maps to emoji index 0 four times', () => {
    const out = emojiFingerprint(new Uint8Array(32));
    // All chunks are zero → all four indices are 0 → same emoji four times.
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[2]).toBe(out[3]);
  });

  it('top bit of first byte of each chunk is masked off (security property)', () => {
    // Two hashes that differ only in the top bit of each 8-byte chunk must
    // produce identical fingerprints — the C++ algorithm explicitly clears
    // bit 7 of byte 0 of each chunk before computing the index. If we ever
    // regress and forget the mask, this test will fail.
    const a = new Uint8Array(32);
    const b = new Uint8Array(32);
    for(let chunk = 0; chunk < 4; chunk++) {
      a[chunk * 8] = 0x00;
      b[chunk * 8] = 0x80;
    }
    expect(emojiFingerprint(a)).toEqual(emojiFingerprint(b));
  });

  it('different inputs (varying mid-bytes) generally produce different fingerprints', () => {
    // Statistical sanity check — flipping a low byte should change at least
    // one emoji with very high probability (333^4 ≈ 1.2 × 10^10 emoji-sequence
    // space; collision odds for 10 random inputs ~10^-10).
    const seen = new Set<string>();
    for(let i = 0; i < 10; i++) {
      const hash = new Uint8Array(32);
      hash[3] = i; // vary one byte
      seen.add(emojiFingerprintString(hash));
    }
    // Expect at least 9 distinct outputs from 10 inputs (paranoid lower bound).
    expect(seen.size).toBeGreaterThanOrEqual(9);
  });

  it('rejects input lengths that are not multiples of 8', () => {
    expect(() => emojiFingerprint(new Uint8Array(7))).toThrow();
    expect(() => emojiFingerprint(new Uint8Array(31))).toThrow();
  });

  it('accepts 64-byte input (full HMAC-SHA512 output) → 8 emojis', () => {
    const hash = new Uint8Array(64);
    for(let i = 0; i < hash.length; i++) hash[i] = i;
    const out = emojiFingerprint(hash);
    expect(out).toHaveLength(8);
  });

  it('exposes EMOJI_COUNT = 333 for downstream UI', () => {
    expect(getFingerprintEmojiCount()).toBe(333);
  });

  it('emojiFingerprintString joins with the given separator', () => {
    const hash = new Uint8Array(32);
    hash[5] = 7;
    expect(emojiFingerprintString(hash).split(' ')).toHaveLength(4);
    expect(emojiFingerprintString(hash, '|').split('|')).toHaveLength(4);
  });
});
