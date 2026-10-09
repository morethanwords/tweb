/*
 * TdE2E MessageEncryption primitives — port of tdlib/tde2e/td/e2e/MessageEncryption.cpp.
 * Spec: src/lib/calls/e2e/notes/messageEncryption.md.
 *
 * Four public ops (all symmetric, same KDF):
 *   encryptData / decryptData   — message payload, with random padding + AES-CBC.
 *   encryptHeader / decryptHeader — fixed 32-byte header, keyed off msg_id from a payload.
 *
 * The header ops also come as `...WithKey`, taking the secret's header key
 * from `importHeaderKey` instead of the secret: that key is a function of the
 * secret alone, so a caller sealing every media frame under one call epoch
 * derives it once per epoch instead of once per frame.
 *
 * Test vectors at e2e/tests/vectors.ts test the deterministic-padding variant
 * (we don't have known-good random outputs, by definition).
 */

import {
  aesCbcDecrypt,
  aesCbcEncrypt,
  concatBytes,
  constantTimeEqual,
  hmacSign,
  hmacSha512,
  importHmacKey,
  int32LeToBytes,
  randomBytes
} from './crypto';

const MIN_PADDING = 16;

const textEncoder = new TextEncoder();
const KDF_LABEL_ENCRYPT_DATA = textEncoder.encode('tde2e_encrypt_data');
const KDF_LABEL_ENCRYPT_HEADER = textEncoder.encode('tde2e_encrypt_header');

// HMAC-SHA512(secret, UTF-8(label)) — 64 bytes. Label is a literal string,
// no null terminator, no length prefix.
function kdfExpand(secret: Uint8Array, label: Uint8Array): Promise<Uint8Array> {
  return hmacSha512(secret, label);
}

// Extract AES-256 key (32B) + IV (16B) from the first 48 bytes of a hash.
function calcAesCbcStateFromHash(hash: Uint8Array): {key: Uint8Array; iv: Uint8Array} {
  if(hash.length < 48) throw new Error(`hash too short for AES-CBC state: ${hash.length}`);
  return {key: hash.subarray(0, 32), iv: hash.subarray(32, 48)};
}

// The two keys encrypt_data derives from its secret: encrypt_secret (keys the
// AES state, HMAC-SHA512) and hmac_secret (the msg_id MAC, HMAC-SHA256). They
// are independent of each other, so both imports go out at once.
async function expandDataSecret(secret: Uint8Array): Promise<{encryptKey: CryptoKey; hmacKey: CryptoKey}> {
  const largeSecret = await kdfExpand(secret, KDF_LABEL_ENCRYPT_DATA);
  const [encryptKey, hmacKey] = await Promise.all([
    importHmacKey(largeSecret.subarray(0, 32), 'SHA-512'),
    importHmacKey(largeSecret.subarray(32, 64), 'SHA-256')
  ]);
  return {encryptKey, hmacKey};
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
  // tail = padded || extraData || LE_int32(extraData.length), where padded =
  // prefix || data (16-aligned) is the AES input: one copy of the frame, not two.
  const tail = concatBytes(prefix, data, extraData, int32LeToBytes(extraData.length));
  const padded = tail.subarray(0, prefix.length + data.length);

  const {encryptKey, hmacKey} = await expandDataSecret(secret);
  const largeMsgId = await hmacSign(hmacKey, tail);
  const msgId = largeMsgId.subarray(0, 16);

  const hash = await hmacSign(encryptKey, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  const encrypted = await aesCbcEncrypt(key, iv, padded);

  const output = new Uint8Array(16 + encrypted.length);
  output.set(msgId);
  output.set(encrypted, 16);
  return {output, largeMsgId};
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

  const {encryptKey, hmacKey} = await expandDataSecret(secret);

  const hash = await hmacSign(encryptKey, msgId);
  const {key, iv} = calcAesCbcStateFromHash(hash);
  const decrypted = await aesCbcDecrypt(key, iv, ciphertext);

  // Verify MAC by recomputing it from the plaintext we just decrypted.
  const tail = concatBytes(decrypted, extraData, int32LeToBytes(extraData.length));
  const expectedLargeMsgId = await hmacSign(hmacKey, tail);
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

// The header key of `secret`: encryption_key = kdf_expand(secret,
// "tde2e_encrypt_header")[0:32], imported for the HMAC-SHA512 that derives each
// header's AES state from a msg_id.
export async function importHeaderKey(secret: Uint8Array): Promise<CryptoKey> {
  const largeKey = await kdfExpand(secret, KDF_LABEL_ENCRYPT_HEADER);
  return importHmacKey(largeKey.subarray(0, 32), 'SHA-512');
}

function checkHeaderArgs(header: Uint8Array, encryptedMessage: Uint8Array): void {
  if(header.length !== 32) throw new Error(`header must be 32 bytes, got ${header.length}`);
  if(encryptedMessage.length < 16) throw new Error('encrypted message too short for msg_id');
}

// AES-CBC state of the header sealed alongside `encryptedMessage`: keyed by
// HMAC-SHA512(encryption_key, msg_id), msg_id being the message's first 16 bytes.
async function headerAesState(headerKey: CryptoKey, encryptedMessage: Uint8Array): Promise<{key: Uint8Array; iv: Uint8Array}> {
  return calcAesCbcStateFromHash(await hmacSign(headerKey, encryptedMessage.subarray(0, 16)));
}

export async function encryptHeaderWithKey(
  header: Uint8Array,
  encryptedMessage: Uint8Array,
  headerKey: CryptoKey
): Promise<Uint8Array> {
  checkHeaderArgs(header, encryptedMessage);
  const {key, iv} = await headerAesState(headerKey, encryptedMessage);
  return aesCbcEncrypt(key, iv, header);
}

export async function decryptHeaderWithKey(
  encryptedHeader: Uint8Array,
  encryptedMessage: Uint8Array,
  headerKey: CryptoKey
): Promise<Uint8Array> {
  checkHeaderArgs(encryptedHeader, encryptedMessage);
  const {key, iv} = await headerAesState(headerKey, encryptedMessage);
  return aesCbcDecrypt(key, iv, encryptedHeader);
}

export async function encryptHeader(
  header: Uint8Array,
  encryptedMessage: Uint8Array,
  secret: Uint8Array
): Promise<Uint8Array> {
  checkHeaderArgs(header, encryptedMessage);
  return encryptHeaderWithKey(header, encryptedMessage, await importHeaderKey(secret));
}

export async function decryptHeader(
  encryptedHeader: Uint8Array,
  encryptedMessage: Uint8Array,
  secret: Uint8Array
): Promise<Uint8Array> {
  checkHeaderArgs(encryptedHeader, encryptedMessage);
  return decryptHeaderWithKey(encryptedHeader, encryptedMessage, await importHeaderKey(secret));
}
