/*
 * The tdlib known-answer vectors again, with every AES-CBC call taking the
 * Web Crypto path. Every vector is under AES_CBC_SUBTLE_MIN_BYTES, so as the
 * code ships they only ever reach aes-js; media frames above it go through
 * Web Crypto, and this is that path against the reference outputs.
 */

import {expect, it, vi} from 'vitest';
import {aesCbcDecrypt, aesCbcDecryptSubtle, aesCbcEncrypt, aesCbcEncryptSubtle} from '../crypto';
import {describeMessageEncryptionVectors} from './messageEncryptionVectorSuite';

vi.mock('../crypto', async(importOriginal) => {
  const actual = await importOriginal<typeof import('../crypto')>();
  return {
    ...actual,
    aesCbcEncrypt: actual.aesCbcEncryptSubtle,
    aesCbcDecrypt: actual.aesCbcDecryptSubtle
  };
});

it('routes AES-CBC through Web Crypto', () => {
  expect(aesCbcEncrypt).toBe(aesCbcEncryptSubtle);
  expect(aesCbcDecrypt).toBe(aesCbcDecryptSubtle);
});

describeMessageEncryptionVectors('MessageEncryption known-answer vectors — Web Crypto AES');
