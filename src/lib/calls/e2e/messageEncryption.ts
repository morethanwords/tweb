/*
 * TdE2E MessageEncryption primitives — port of tdlib/tde2e/td/e2e/MessageEncryption.cpp.
 * Spec: src/lib/calls/e2e/notes/messageEncryption.md.
 *
 * Four public ops (all symmetric, same KDF):
 *   encryptData / decryptData   — message payload, with random padding + AES-CBC.
 *   encryptHeader / decryptHeader — fixed 32-byte header, keyed off msg_id from a payload.
 *
 * Test vectors at e2e/tests/vectors.ts test the deterministic-padding variant
 * (we don't have known-good random outputs, by definition).
 */

import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  concatBytes,
  constantTimeEqual,
  hmacSha256,
  hmacSha512,
  int32LeToBytes,
  randomBytes
} from './crypto';

const MIN_PADDING = 16;
const KDF_LABEL_ENCRYPT_DATA = 'tde2e_encrypt_data';
const KDF_LABEL_ENCRYPT_HEADER = 'tde2e_encrypt_header';

const textEncoder = new TextEncoder();

// HMAC-SHA512(secret, UTF-8(label)) — 64 bytes. Label is a literal string,
// no null terminator, no length prefix.
function kdfExpand(secret: Uint8Array, label: string): Promise<Uint8Array> {
  return hmacSha512(secret, textEncoder.encode(label));
}

// Extract AES-256 key (32B) + IV (16B) from the first 48 bytes of a hash.
function calcAesCbcStateFromHash(hash: Uint8Array): {key: Uint8Array; iv: Uint8Array} {
  if(hash.length < 48) throw new Error(`hash too short for AES-CBC state: ${hash.length}`);
  return {key: hash.subarray(0, 32), iv: hash.subarray(32, 48)};
}

// Random prefix; first byte holds total prefix length (16..31 typical).
// Used by encryptData in production.
function genRandomPrefix(dataSize: number, minPadding = MIN_PADDING): Uint8Array {
  const paddedSize = ((minPadding + 15 + dataSize) & ~15) - dataSize;
  const prefix = randomBytes(paddedSize);
  prefix[0] = paddedSize;
  return prefix;
}

// Zero-filled prefix; first byte = length. Used by tests to match C++ vectors.
function genDeterministicPrefix(dataSize: number, minPadding = MIN_PADDING): Uint8Array {
  const paddedSize = ((minPadding + 15 + dataSize) & ~15) - dataSize;
  const prefix = new Uint8Array(paddedSize);
  prefix[0] = paddedSize;
  return prefix;
}

// Shared core: takes the already-generated prefix.
async function encryptDataCore(
  prefix: Uint8Array,
  data: Uint8Array,
  secret: Uint8Array,
  extraData: Uint8Array
): Promise<{output: Uint8Array; largeMsgId: Uint8Array}> {
  const padded = concatBytes(prefix, data); // 16-aligned

  const largeSecret = await kdfExpand(secret, KDF_LABEL_ENCRYPT_DATA);
  const encryptSecret = largeSecret.subarray(0, 32);
  const hmacSecret = largeSecret.subarray(32, 64);

  // tail = padded || extraData || LE_int32(extraData.length)
  const tail = concatBytes(padded, extraData, int32LeToBytes(extraData.length));
  const largeMsgId = await hmacSha256(hmacSecret, tail);
  const msgId = largeMsgId.subarray(0, 16);

  const hash = await hmacSha512(encryptSecret, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  const encrypted = aesCbcEncrypt(key, iv, padded);

  return {output: concatBytes(msgId, encrypted), largeMsgId};
}

// Production encryption: random padding.
export function encryptData(
  data: Uint8Array,
  secret: Uint8Array,
  extraData: Uint8Array = new Uint8Array(0)
): Promise<{output: Uint8Array; largeMsgId: Uint8Array}> {
  return encryptDataCore(genRandomPrefix(data.length), data, secret, extraData);
}

// Deterministic variant — matches C++ encrypt_data_with_deterministic_padding,
// used by test vectors. Do NOT use in production.
export function encryptDataDeterministic(
  data: Uint8Array,
  secret: Uint8Array,
  extraData: Uint8Array = new Uint8Array(0)
): Promise<{output: Uint8Array; largeMsgId: Uint8Array}> {
  return encryptDataCore(genDeterministicPrefix(data.length), data, secret, extraData);
}

export async function decryptData(
  encryptedData: Uint8Array,
  secret: Uint8Array,
  extraData: Uint8Array = new Uint8Array(0)
): Promise<{output: Uint8Array; largeMsgId: Uint8Array}> {
  if(encryptedData.length < 16 || encryptedData.length % 16 !== 0) {
    throw new Error(`invalid encrypted data length: ${encryptedData.length}`);
  }

  const msgId = encryptedData.subarray(0, 16);
  const ciphertext = encryptedData.subarray(16);

  const largeSecret = await kdfExpand(secret, KDF_LABEL_ENCRYPT_DATA);
  const encryptSecret = largeSecret.subarray(0, 32);
  const hmacSecret = largeSecret.subarray(32, 64);

  const hash = await hmacSha512(encryptSecret, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  const decrypted = aesCbcDecrypt(key, iv, ciphertext);

  // Verify MAC by recomputing it from the plaintext we just decrypted.
  const tail = concatBytes(decrypted, extraData, int32LeToBytes(extraData.length));
  const expectedLargeMsgId = await hmacSha256(hmacSecret, tail);
  const expectedMsgId = expectedLargeMsgId.subarray(0, 16);

  if(!constantTimeEqual(msgId, expectedMsgId)) {
    throw new Error('MAC verification failed');
  }

  const prefixSize = decrypted[0];
  if(prefixSize < MIN_PADDING || prefixSize > decrypted.length) {
    throw new Error(`invalid padding size: ${prefixSize}`);
  }

  return {output: decrypted.subarray(prefixSize), largeMsgId: expectedLargeMsgId};
}

export async function encryptHeader(
  header: Uint8Array,
  encryptedMessage: Uint8Array,
  secret: Uint8Array
): Promise<Uint8Array> {
  if(header.length !== 32) throw new Error(`header must be 32 bytes, got ${header.length}`);
  if(encryptedMessage.length < 16) throw new Error('encrypted message too short for msg_id');

  const msgId = encryptedMessage.subarray(0, 16);
  const largeKey = await kdfExpand(secret, KDF_LABEL_ENCRYPT_HEADER);
  const encryptionKey = largeKey.subarray(0, 32);

  const hash = await hmacSha512(encryptionKey, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  return aesCbcEncrypt(key, iv, header);
}

export async function decryptHeader(
  encryptedHeader: Uint8Array,
  encryptedMessage: Uint8Array,
  secret: Uint8Array
): Promise<Uint8Array> {
  if(encryptedHeader.length !== 32) {
    throw new Error(`header must be 32 bytes, got ${encryptedHeader.length}`);
  }
  if(encryptedMessage.length < 16) throw new Error('encrypted message too short for msg_id');

  const msgId = encryptedMessage.subarray(0, 16);
  const largeKey = await kdfExpand(secret, KDF_LABEL_ENCRYPT_HEADER);
  const encryptionKey = largeKey.subarray(0, 32);

  const hash = await hmacSha512(encryptionKey, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  return aesCbcDecrypt(key, iv, encryptedHeader);
}
