/*
 * Vector tests for TdE2E MessageEncryption — cross-validates the TS port
 * against known-answer outputs extracted from tdlib/tde2e/test/.
 */

import {describe, it, expect} from 'vitest';
import {hexToBytes} from '../crypto';
import {
  decryptData,
  encryptDataDeterministic,
  encryptHeader
} from '../messageEncryption';
import {describeMessageEncryptionVectors} from './messageEncryptionVectorSuite';

describeMessageEncryptionVectors('MessageEncryption known-answer vectors');

describe('MessageEncryption negative paths', () => {
  it('decryptData rejects MAC tampering', async() => {
    const secret = hexToBytes(
      'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c'
    );
    const {output} = await encryptDataDeterministic(
      hexToBytes('48656c6c6f'),
      secret,
      new Uint8Array(0)
    );
    // Flip a bit inside the ciphertext (skip msg_id, hit byte 20 = first ct byte).
    const tampered = new Uint8Array(output);
    tampered[20] ^= 0x01;
    await expect(decryptData(tampered, secret, new Uint8Array(0))).rejects.toThrow();
  });

  it('decryptData rejects mismatched extra data', async() => {
    const secret = hexToBytes(
      'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c'
    );
    const {output} = await encryptDataDeterministic(
      hexToBytes('48656c6c6f'),
      secret,
      hexToBytes('aa')
    );
    await expect(decryptData(output, secret, hexToBytes('bb'))).rejects.toThrow();
  });

  it('encryptHeader rejects wrong-length header', async() => {
    const secret = hexToBytes(
      'f9fb473b9887e50ea38eef7380c82361432cd4b22c5f9b3700809990d8ed344c'
    );
    const {output} = await encryptDataDeterministic(
      new Uint8Array(0),
      secret,
      new Uint8Array(0)
    );
    await expect(encryptHeader(new Uint8Array(31), output, secret)).rejects.toThrow();
    await expect(encryptHeader(new Uint8Array(33), output, secret)).rejects.toThrow();
  });
});
