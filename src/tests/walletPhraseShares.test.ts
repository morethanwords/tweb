/*
 * The wallet backup: the phrase seed split into XOR shares, each sealed to a holder key with the tde2e
 * "message for one" envelope, and read back from what the holder DCs return.
 */

import {describe, expect, it} from 'vitest';
import {
  PHRASE_SEED_LENGTH,
  combineShares,
  decryptShare,
  encryptShare,
  generateShareKeyPair,
  parseDecryptedKeyPart,
  seedFromWords,
  splitSeed,
  wordsFromSeed
} from '@lib/wallet/phraseShares';

const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');

describe('wallet phrase shares', () => {
  it('pads the seed with spaces to its fixed length and reads the words back', () => {
    const seed = seedFromWords(WORDS);
    expect(seed.length).toBe(PHRASE_SEED_LENGTH);
    expect(seed[seed.length - 1]).toBe(0x20);
    expect(wordsFromSeed(seed)).toEqual(WORDS);
  });

  it('refuses a phrase longer than the seed', () => {
    expect(() => seedFromWords(new Array(40).fill('abandon'))).toThrow();
  });

  it('splits the seed into shares that combine back only all together', () => {
    const seed = seedFromWords(WORDS);
    const shares = splitSeed(seed, 3);
    expect(shares).toHaveLength(3);
    expect(combineShares(shares)).toEqual(seed);
    expect(combineShares(shares.slice(0, 2))).not.toEqual(seed);
  });

  it('seals a share to a holder key and opens it with the holder key', async() => {
    const holder = await generateShareKeyPair();
    const share = splitSeed(seedFromWords(WORDS), 2)[0];
    const sealed = await encryptShare(holder.publicKey, share);
    expect(sealed.length).toBeGreaterThan(32);
    expect(await decryptShare(holder, sealed)).toEqual(share);
  });

  it('does not open a share sealed to another key', async() => {
    const holder = await generateShareKeyPair();
    const other = await generateShareKeyPair();
    const sealed = await encryptShare(holder.publicKey, new Uint8Array(PHRASE_SEED_LENGTH).fill(7));
    await expect(decryptShare(other, sealed)).rejects.toThrow();
  });

  it('reads the TL key part with a long length prefix', () => {
    const share = new Uint8Array(300).map((_, i) => i & 0xff);
    // mnemonic.decryptedKeyPart#8b90dd08 share:bytes, bytes longer than 253 use the 0xfe prefix
    const plain = new Uint8Array(4 + 4 + 300);
    new DataView(plain.buffer).setUint32(0, 0x8b90dd08, true);
    plain.set([254, 300 & 0xff, 300 >> 8, 0], 4);
    plain.set(share, 8);
    expect(parseDecryptedKeyPart(plain)).toEqual(share);
  });
});
