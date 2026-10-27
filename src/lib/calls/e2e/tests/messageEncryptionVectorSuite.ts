/*
 * The tdlib known-answer vectors for MessageEncryption, as a suite that more
 * than one test file runs: messageEncryption.test.ts as the code ships, and
 * messageEncryptionSubtle.test.ts with every AES call forced through Web
 * Crypto — the vectors are all small enough to take the aes-js path
 * otherwise.
 */

import {describe, expect, it} from 'vitest';
import {bytesToHex, hexToBytes} from '../crypto';
import {
  decryptData,
  decryptHeader,
  decryptHeaderWithKey,
  encryptDataDeterministic,
  encryptHeader,
  encryptHeaderWithKey,
  importHeaderKey
} from '../messageEncryption';
import {MESSAGE_ENCRYPTION_VECTORS} from './vectors';

// 32-byte plaintext header shared across all C++ TestVector entries
// (see tdlib/tde2e/test/EncryptionTestVectors.h — `header` field).
// TODO: extracted vectors.ts dropped this field per-entry; add it back when
// extending vectors to non-uniform headers.
const SHARED_TEST_HEADER_HEX = 'bd29703cf44551710ca14d091a6c98ee347931b2b8140faaaef2dbb40719df12';

export function describeMessageEncryptionVectors(title: string): void {
  describe(title, () => {
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

        it('encryptHeaderWithKey (header key derived once) matches expected ciphertext', async() => {
          const headerKey = await importHeaderKey(secret);
          const encryptedHeader = await encryptHeaderWithKey(sharedHeader, expectedPayload, headerKey);
          expect(bytesToHex(encryptedHeader)).toBe(bytesToHex(expectedHeader));
        });

        it('decryptData opens the expected ciphertext', async() => {
          const {output} = await decryptData(expectedPayload, secret, extra);
          expect(bytesToHex(output)).toBe(bytesToHex(payload));
        });

        it('decryptHeader and decryptHeaderWithKey open the expected header', async() => {
          expect(bytesToHex(await decryptHeader(expectedHeader, expectedPayload, secret))).toBe(bytesToHex(sharedHeader));
          const headerKey = await importHeaderKey(secret);
          expect(bytesToHex(await decryptHeaderWithKey(expectedHeader, expectedPayload, headerKey))).toBe(bytesToHex(sharedHeader));
        });
      });
    }
  });
}
