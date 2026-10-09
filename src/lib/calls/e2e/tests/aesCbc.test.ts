/*
 * Raw AES-256-CBC must stay byte-for-byte what tdlib's AesCbcState computes —
 * no padding added or stripped — whichever implementation runs it. aes-js is
 * the reference here (the cipher every frame used before Web Crypto took over
 * the large ones, and the one the C++ vectors in messageEncryption.test.ts
 * were first matched with).
 *
 * The Web Crypto path is the one with a trick in it: PKCS#7 is dropped from
 * the end of an encryption and a synthetic padding block is appended for a
 * decryption. So it is checked on its own at every size, on ciphertexts that
 * no encryption of ours produced, and on plaintexts that end in bytes which
 * themselves look like valid PKCS#7 padding — those must come back whole.
 */

import aesjs from 'aes-js';
import {describe, expect, it} from 'vitest';
import {
  AES_CBC_SUBTLE_MIN_BYTES,
  aesCbcDecrypt,
  aesCbcDecryptSubtle,
  aesCbcEncrypt,
  aesCbcEncryptSubtle,
  bytesToHex
} from '../crypto';

// getRandomValues takes at most 64 KB a call.
function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  for(let i = 0; i < size; i += 65536) crypto.getRandomValues(out.subarray(i, i + 65536));
  return out;
}

function referenceEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return new aesjs.ModeOfOperation.cbc(key, iv).encrypt(data);
}

function referenceDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return new aesjs.ModeOfOperation.cbc(key, iv).decrypt(data);
}

// Views into a larger buffer at an odd offset, the way the callers pass them
// (key/iv are subarrays of an HMAC output, the plaintext a subarray of the MAC
// input).
function view(bytes: Uint8Array): Uint8Array {
  const backing = randomBytes(bytes.length + 7);
  backing.set(bytes, 3);
  return backing.subarray(3, 3 + bytes.length);
}

const T = AES_CBC_SUBTLE_MIN_BYTES;
const LENGTHS = [
  0, 16, 32, 48, 64, 160, 256,
  T - 32, T - 16, T, T + 16, T + 32,
  1024, 2048, 2064, 8192, 61440, 61456, 65536, 131072 + 16
];
// Plus a spread of random aligned lengths up to 64 KB.
for(let i = 0; i < 24; i++) LENGTHS.push(16 * Math.floor(Math.random() * 4096));

describe('raw AES-256-CBC — Web Crypto matches the reference', () => {
  for(const length of LENGTHS) {
    it(`${length} bytes`, async() => {
      const key = randomBytes(32);
      const iv = randomBytes(16);
      const plaintext = randomBytes(length);
      const ciphertext = referenceEncrypt(key, iv, plaintext);

      expect(bytesToHex(await aesCbcEncryptSubtle(view(key), view(iv), view(plaintext)))).toBe(bytesToHex(ciphertext));
      expect(bytesToHex(await aesCbcDecryptSubtle(view(key), view(iv), view(ciphertext)))).toBe(bytesToHex(plaintext));
      // The dispatchers, on whichever side of the threshold this length is.
      expect(bytesToHex(await aesCbcEncrypt(key, iv, plaintext))).toBe(bytesToHex(ciphertext));
      expect(bytesToHex(await aesCbcDecrypt(key, iv, ciphertext))).toBe(bytesToHex(plaintext));

      // A ciphertext nobody encrypted (what a relay can put on the wire) still
      // decrypts to exactly what raw CBC gives — no padding check can fail.
      const forged = randomBytes(length);
      expect(bytesToHex(await aesCbcDecryptSubtle(key, iv, forged))).toBe(bytesToHex(referenceDecrypt(key, iv, forged)));
    });
  }

  it('keeps plaintext tails that look like PKCS#7 padding', async() => {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const tails = [
      [0x01],
      [0x02, 0x02],
      new Array(16).fill(0x10),
      new Array(15).fill(0x0f),
      new Array(16).fill(0x00)
    ];
    for(const tail of tails) {
      for(const length of [16, T + 16]) {
        const plaintext = randomBytes(length);
        plaintext.set(tail, length - tail.length);
        const ciphertext = await aesCbcEncryptSubtle(key, iv, plaintext);
        expect(bytesToHex(ciphertext)).toBe(bytesToHex(referenceEncrypt(key, iv, plaintext)));
        expect(bytesToHex(await aesCbcDecryptSubtle(key, iv, ciphertext))).toBe(bytesToHex(plaintext));
      }
    }
  });

  it('leaves its inputs untouched', async() => {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    const plaintext = randomBytes(T * 2);
    const ciphertext = referenceEncrypt(key, iv, plaintext);
    const copies = [key, iv, plaintext, ciphertext].map((b) => bytesToHex(b));
    await aesCbcEncryptSubtle(key, iv, plaintext);
    await aesCbcDecryptSubtle(key, iv, ciphertext);
    expect([key, iv, plaintext, ciphertext].map((b) => bytesToHex(b))).toEqual(copies);
  });

  it('rejects unaligned input on both paths', async() => {
    const key = randomBytes(32);
    const iv = randomBytes(16);
    for(const length of [1, 15, 17, T + 1]) {
      const data = randomBytes(length);
      await expect(aesCbcEncryptSubtle(key, iv, data)).rejects.toThrow(/not 16-aligned/);
      await expect(aesCbcDecryptSubtle(key, iv, data)).rejects.toThrow(/not 16-aligned/);
      await expect(aesCbcEncrypt(key, iv, data)).rejects.toThrow(/not 16-aligned/);
      await expect(aesCbcDecrypt(key, iv, data)).rejects.toThrow(/not 16-aligned/);
    }
  });
});
