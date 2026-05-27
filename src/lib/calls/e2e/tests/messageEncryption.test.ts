/*
 * Vector tests for TdE2E MessageEncryption — cross-validates the TS port
 * against known-answer outputs extracted from tdlib/tde2e/test/.
 */

import {describe, it, expect} from 'vitest';
import {bytesToHex, hexToBytes} from '../crypto';
import {
  decryptData,
  decryptHeader,
  encryptDataDeterministic,
  encryptHeader
} from '../messageEncryption';
import {MESSAGE_ENCRYPTION_VECTORS} from './vectors';

// 32-byte plaintext header shared across all C++ TestVector entries
// (see tdlib/tde2e/test/EncryptionTestVectors.h — `header` field).
// TODO: extracted vectors.ts dropped this field per-entry; add it back when
// extending vectors to non-uniform headers.
const SHARED_TEST_HEADER_HEX = 'bd29703cf44551710ca14d091a6c98ee347931b2b8140faaaef2dbb40719df12';

describe('MessageEncryption known-answer vectors', () => {
  for(const vector of MESSAGE_ENCRYPTION_VECTORS) {
    describe(vector.name, () => {
      const payload = hexToBytes(vector.inputs.payload);
      const secret = hexToBytes(vector.inputs.secret);
      const extra = hexToBytes(vector.inputs.extra);
      const expectedPayload = hexToBytes(vector.expected.encrypted_payload);
      const expectedHeader = hexToBytes(vector.expected.encrypted_header);
      const sharedHeader = hexToBytes(SHARED_TEST_HEADER_HEX);

      it('encryptDataDeterministic matches expected ciphertext', async() => {
        const {output} = await encryptDataDeterministic(payload, secret, extra);
        expect(bytesToHex(output)).toBe(bytesToHex(expectedPayload));
      });

      it('encryptHeader matches expected ciphertext', async() => {
        const {output} = await encryptDataDeterministic(payload, secret, extra);
        const encryptedHeader = await encryptHeader(sharedHeader, output, secret);
        expect(bytesToHex(encryptedHeader)).toBe(bytesToHex(expectedHeader));
      });

      it('decryptData round-trips back to the original payload', async() => {
        const {output} = await encryptDataDeterministic(payload, secret, extra);
        const {output: roundTrip} = await decryptData(output, secret, extra);
        expect(bytesToHex(roundTrip)).toBe(bytesToHex(payload));
      });

      it('decryptHeader round-trips back to original header', async() => {
        const {output} = await encryptDataDeterministic(payload, secret, extra);
        const encryptedHeader = await encryptHeader(sharedHeader, output, secret);
        const decryptedHeader = await decryptHeader(encryptedHeader, output, secret);
        expect(bytesToHex(decryptedHeader)).toBe(bytesToHex(sharedHeader));
      });
    });
  }
});

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
