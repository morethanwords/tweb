/*
 * Crypto primitives for the TdE2E port.
 *  - Web Crypto (`crypto.subtle`) for SHA-256, HMAC-SHA256/512 and random.
 *  - aes-js for raw AES-CBC (Web Crypto's AES-CBC forces PKCS7 padding,
 *    which doesn't match TdE2E's manually-padded scheme).
 *  - libsodium-wrappers for Ed25519 sign/verify and X25519 ECDH (Web Crypto
 *    support is uneven across browsers as of 2026).
 *
 * Spec: src/lib/calls/e2e/notes/messageEncryption.md (KDF + AES-CBC state derivation).
 */

import aesjs from 'aes-js';
import sodium from 'libsodium-wrappers';
import subtle from '@lib/crypto/subtle';

let sodiumReady: Promise<void> | undefined;

// Must be awaited once before any libsodium-backed call (sign/verify/ECDH).
export function ensureCryptoReady(): Promise<void> {
  return sodiumReady ??= sodium.ready;
}

// ===== Random =====

export function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

// ===== Hash =====

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
}

// ===== HMAC =====

async function hmacImport(key: Uint8Array, hash: 'SHA-256' | 'SHA-512'): Promise<CryptoKey> {
  return subtle.importKey('raw', key as BufferSource, {name: 'HMAC', hash}, false, ['sign']);
}

export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await hmacImport(key, 'SHA-256');
  const mac = await subtle.sign('HMAC', k, data as BufferSource);
  return new Uint8Array(mac);
}

export async function hmacSha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await hmacImport(key, 'SHA-512');
  const mac = await subtle.sign('HMAC', k, data as BufferSource);
  return new Uint8Array(mac);
}

// ===== AES-CBC (raw, no padding) =====
//
// Input must already be 16-byte aligned; output has the same length.
// Implemented via aes-js because Web Crypto's AES-CBC always uses PKCS7.

export function aesCbcEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if(data.length % 16 !== 0) {
    throw new Error(`AES-CBC plaintext length not 16-aligned: ${data.length}`);
  }
  const cipher = new aesjs.ModeOfOperation.cbc(key, iv);
  return cipher.encrypt(data);
}

export function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  if(data.length % 16 !== 0) {
    throw new Error(`AES-CBC ciphertext length not 16-aligned: ${data.length}`);
  }
  const cipher = new aesjs.ModeOfOperation.cbc(key, iv);
  return cipher.decrypt(data);
}

// ===== Constant-time byte comparison =====
//
// MUST be used for MAC verification (msg_id check). XOR over all bytes, no
// short-circuit — leaks no timing info about which byte mismatched.

export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if(a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ===== Ed25519 (libsodium) =====

// Ed25519 secret-key per libsodium = seed(32) || public(32) — 64 bytes.
// Telegram's wire format passes only the 32-byte seed; expand on import.
export function ed25519KeyPairFromSeed(seed: Uint8Array): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  if(seed.length !== 32) throw new Error(`ed25519 seed must be 32 bytes, got ${seed.length}`);
  const kp = sodium.crypto_sign_seed_keypair(seed);
  return {publicKey: kp.publicKey, secretKey: kp.privateKey};
}

export function ed25519GenerateKeyPair(): {publicKey: Uint8Array; secretKey: Uint8Array} {
  return ed25519KeyPairFromSeed(randomBytes(32));
}

// Detached signature, 64 bytes.
export function ed25519Sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return sodium.crypto_sign_detached(message, secretKey);
}

export function ed25519Verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): boolean {
  try {
    return sodium.crypto_sign_verify_detached(signature, message, publicKey);
  } catch{
    return false;
  }
}

// ===== X25519 ECDH (libsodium) =====
//
// TdE2E uses Ed25519 keys for BOTH signing and ECDH — to derive a shared
// secret, the Ed25519 keypair is converted to its X25519 (Curve25519)
// counterpart, then standard X25519 scalar multiplication.

export function ed25519PkToCurve25519(publicKey: Uint8Array): Uint8Array {
  return sodium.crypto_sign_ed25519_pk_to_curve25519(publicKey);
}

export function ed25519SkToCurve25519(secretKey: Uint8Array): Uint8Array {
  return sodium.crypto_sign_ed25519_sk_to_curve25519(secretKey);
}

export function x25519Ecdh(curve25519Sk: Uint8Array, curve25519Pk: Uint8Array): Uint8Array {
  return sodium.crypto_scalarmult(curve25519Sk, curve25519Pk);
}

// Generate a fresh X25519 (curve25519) keypair. Used by the SENDER of a
// SharedKey change to mint the ephemeral keypair whose public half lives in
// `ek` and whose private half is discarded after deriving the per-recipient
// shared secrets.
export function x25519GenerateKeyPair(): {publicKey: Uint8Array; secretKey: Uint8Array} {
  // crypto_box_keypair returns X25519 keys (libsodium calls them "boxKeys").
  const kp = sodium.crypto_box_keypair();
  return {publicKey: kp.publicKey, secretKey: kp.privateKey};
}

// Compute the X25519 public key from a 32-byte X25519 secret key.
export function x25519DerivePublic(curve25519Sk: Uint8Array): Uint8Array {
  return sodium.crypto_scalarmult_base(curve25519Sk);
}

// Convenience: ECDH between this peer's Ed25519 secret key and the other
// peer's Ed25519 public key — handles both conversions. RAW output, no
// domain-separation HMAC. Use `computeSharedSecret` for the TdE2E-compliant
// derived secret (this is the low-level building block).
export function ecdhFromEd25519(
  ourEd25519Sk: Uint8Array,
  theirEd25519Pk: Uint8Array
): Uint8Array {
  const sk = ed25519SkToCurve25519(ourEd25519Sk);
  const pk = ed25519PkToCurve25519(theirEd25519Pk);
  return x25519Ecdh(sk, pk);
}

// ===== Domain-separated shared secret =====
//
// TdE2E's `compute_shared_secret` (see tdlib/tde2e/td/e2e/Keys.cpp:137) mixes
// the raw X25519 ECDH output with a static domain-separation tag via HMAC:
//   shared_secret = HMAC-SHA512("tde2e_shared_secret", x25519_ecdh)[0:32]
// All callers in tdlib (SharedKey derivation, etc.) use this mixed form. Raw
// ECDH without this HMAC will NOT interoperate with official clients.
const SHARED_SECRET_DOMAIN_TAG = (() => {
  const tag = 'tde2e_shared_secret';
  const out = new Uint8Array(tag.length);
  for(let i = 0; i < tag.length; i++) out[i] = tag.charCodeAt(i);
  return out;
})();

// Compute a TdE2E-compliant shared secret from two Ed25519 keys (ours + peer).
// Equivalent to `PrivateKey::compute_shared_secret` in tdlib.
export async function computeSharedSecret(
  ourEd25519Sk: Uint8Array,
  theirEd25519Pk: Uint8Array
): Promise<Uint8Array> {
  const raw = ecdhFromEd25519(ourEd25519Sk, theirEd25519Pk);
  const mixed = await hmacSha512(SHARED_SECRET_DOMAIN_TAG, raw);
  return mixed.subarray(0, 32);
}

// Variant where the peer's key is already an X25519 (Curve25519) public key.
// Used when the SharedKey.ek field carries an X25519 pub directly (test
// scenarios; real TdE2E stores Ed25519 in ek).
export async function computeSharedSecretWithCurve25519(
  ourEd25519Sk: Uint8Array,
  theirCurve25519Pk: Uint8Array
): Promise<Uint8Array> {
  const ourCurveSk = ed25519SkToCurve25519(ourEd25519Sk);
  const raw = x25519Ecdh(ourCurveSk, theirCurve25519Pk);
  const mixed = await hmacSha512(SHARED_SECRET_DOMAIN_TAG, raw);
  return mixed.subarray(0, 32);
}

// ===== Small byte utilities =====

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for(const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for(const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if(hex.length % 2 !== 0) throw new Error('odd-length hex string');
  const out = new Uint8Array(hex.length / 2);
  for(let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for(let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

// Little-endian int32 encoder — used to mix extra-data length into HMAC input.
export function int32LeToBytes(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
  return out;
}
