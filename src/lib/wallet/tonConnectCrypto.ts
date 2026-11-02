/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import sodium from 'libsodium-wrappers';
import subtle from '@lib/crypto/subtle';
import {
  concatBytes,
  constantTimeEqual,
  ed25519KeyPairFromSeed,
  ed25519Sign,
  ensureCryptoReady,
  hmacSha512,
  randomBytes,
  sha256,
  x25519DerivePublic
} from '@lib/calls/e2e/crypto';

/**
 * The keys of a TON Connect session relayed by Telegram's server. The engine derives them too, but its WebAssembly
 * build exposes no binding for it, so this is the engine's scheme in TypeScript (wallet-engine `crypto.rs`,
 * `ton_connect/derived.rs`):
 *
 * - the signing seed: SLIP-0010 ed25519 on m/44'/607'/0' of the BIP-39 seed of the phrase's signing half (words
 *   13-24, or the 12 words of a phrase before its first rotation);
 * - the session's X25519 secret: clamp(HMAC-SHA512(HMAC-SHA512(seed, "tonconnect/session/v1"), A || nonce)[0..32]),
 *   `A` the dApp's client id and `nonce` the server's per-session salt; its public half `W` is the wallet's client id;
 * - every packet is a NaCl box (X25519, XSalsa20-Poly1305): `nonce(24) || box`.
 *
 * Nothing here is persisted: each operation derives what it needs and wipes it.
 */

const textEncoder = new TextEncoder();

const SESSION_LABEL = textEncoder.encode('tonconnect/session/v1');
const SLIP10_MASTER_KEY = textEncoder.encode('ed25519 seed');
/** m/44'/607'/0', every step hardened */
const TON_ACCOUNT_PATH = [44, 607, 0];
const HARDENED_OFFSET = 0x80000000;
const BIP39_ROUNDS = 2048;
const HALF_WORDS = 12;

const NONCE_LENGTH = 24;
const KEY_LENGTH = 32;
/** `ephemeral_pk(32) || nonce(24) || box(48)`: a 32-byte answer sealed to `W` */
export const TON_CONNECT_CHALLENGE_LENGTH = 104;
const CHALLENGE_ANSWER_LENGTH = 32;

export class TonConnectCryptoError extends Error {
  public type = 'TONCONNECT_CRYPTO';
}

function fail(message: string): never {
  throw new TonConnectCryptoError(message);
}

/** words 13-24 of a rotated phrase, or the 12 words of one that never rotated */
export function getSigningHalf(words: string[]) {
  if(words.length === HALF_WORDS) return words;
  if(words.length === HALF_WORDS * 2) return words.slice(HALF_WORDS);
  fail('TON Connect: a phrase has 12 or 24 words');
}

/** the passphraseless BIP-39 seed of 12 words */
async function bip39Seed(words: string[]) {
  const password = textEncoder.encode(words.join(' ').normalize('NFKD'));
  try {
    const key = await subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({
      name: 'PBKDF2',
      salt: textEncoder.encode('mnemonic') as BufferSource,
      iterations: BIP39_ROUNDS,
      hash: 'SHA-512'
    }, key, 512);
    return new Uint8Array(bits);
  } finally {
    password.fill(0);
  }
}

/** SLIP-0010 ed25519: the private key of `path` (all hardened) from a BIP-39 seed */
async function slip10Key(seed: Uint8Array, path: number[]) {
  let node = await hmacSha512(SLIP10_MASTER_KEY, seed);
  for(const index of path) {
    const data = new Uint8Array(1 + KEY_LENGTH + 4);
    data.set(node.subarray(0, KEY_LENGTH), 1);
    new DataView(data.buffer).setUint32(1 + KEY_LENGTH, (index | HARDENED_OFFSET) >>> 0, false);
    const next = await hmacSha512(node.subarray(KEY_LENGTH), data);
    data.fill(0);
    node.fill(0);
    node = next;
  }

  const key = node.slice(0, KEY_LENGTH);
  node.fill(0);
  return key;
}

/**
 * The 32-byte ed25519 seed of the key that signs for the wallet now, from the phrase as the vault keeps it (the
 * words joined with spaces). The caller wipes it.
 */
export async function deriveSigningSeed(phrase: Uint8Array | string[]) {
  const words = Array.isArray(phrase) ?
    phrase :
    new TextDecoder().decode(phrase).trim().split(/\s+/).filter(Boolean);
  const seed = await bip39Seed(getSigningHalf(words));
  try {
    return await slip10Key(seed, TON_ACCOUNT_PATH);
  } finally {
    seed.fill(0);
  }
}

export async function signingPublicKey(seed: Uint8Array) {
  await ensureCryptoReady();
  const pair = ed25519KeyPairFromSeed(seed);
  pair.secretKey.fill(0);
  return pair.publicKey;
}

/** `sk = clamp(HMAC-SHA512(HMAC-SHA512(seed, label), A || nonce)[0..32])` */
export async function deriveSessionSecret(seed: Uint8Array, dappClientId: Uint8Array, nonce: Uint8Array) {
  if(seed.length !== KEY_LENGTH || dappClientId.length !== KEY_LENGTH || !nonce.length) {
    fail('TON Connect: bad session inputs');
  }

  const prk = await hmacSha512(seed, SESSION_LABEL);
  const input = concatBytes(dappClientId, nonce);
  const okm = await hmacSha512(prk, input);
  prk.fill(0);
  const secret = okm.slice(0, KEY_LENGTH);
  okm.fill(0);
  secret[0] &= 0xf8;
  secret[31] &= 0x7f;
  secret[31] |= 0x40;
  return secret;
}

/** the session key pair: the X25519 secret and `W`, its public half (the wallet's client id) */
export async function deriveSessionKeyPair(seed: Uint8Array, dappClientId: Uint8Array, nonce: Uint8Array) {
  const secretKey = await deriveSessionSecret(seed, dappClientId, nonce);
  await ensureCryptoReady();
  return {secretKey, publicKey: x25519DerivePublic(secretKey)};
}

/** `nonce(24) || box`, sealed by `secretKey` to `peer` */
export async function sealToPeer(secretKey: Uint8Array, peer: Uint8Array, plaintext: Uint8Array) {
  await ensureCryptoReady();
  const nonce = randomBytes(NONCE_LENGTH);
  // * a copy: libsodium takes only this realm's Uint8Array, and a TextEncoder's may come from another
  return concatBytes(nonce, sodium.crypto_box_easy(new Uint8Array(plaintext), nonce, peer, secretKey));
}

/** opens `nonce(24) || box` that `peer` sealed to `secretKey`; throws when it was not */
export async function openFromPeer(secretKey: Uint8Array, peer: Uint8Array, body: Uint8Array) {
  if(body.length <= NONCE_LENGTH + sodium.crypto_box_MACBYTES) {
    fail('TON Connect: the packet is truncated');
  }

  await ensureCryptoReady();
  try {
    return sodium.crypto_box_open_easy(body.subarray(NONCE_LENGTH), body.subarray(0, NONCE_LENGTH), peer, secretKey);
  } catch(err) {
    fail('TON Connect: the packet does not open');
  }
}

/** the server's challenge to the session key: the 32 bytes it sealed to `W` under an ephemeral key */
export async function openChallenge(secretKey: Uint8Array, challenge: Uint8Array) {
  if(challenge.length !== TON_CONNECT_CHALLENGE_LENGTH) {
    fail('TON Connect: a challenge is 104 bytes');
  }

  const answer = await openFromPeer(secretKey, challenge.subarray(0, KEY_LENGTH), challenge.subarray(KEY_LENGTH));
  if(answer.length !== CHALLENGE_ANSWER_LENGTH) {
    answer.fill(0);
    fail('TON Connect: a challenge answer is 32 bytes');
  }

  return answer;
}

// MARK: Signatures

export type TonConnectRawAddress = {workchain: number, hash: Uint8Array};

export type TonConnectSignDataPayload =
  | {type: 'text', text: string}
  | {type: 'binary', bytes: Uint8Array};

function uint32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

function int32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value, false);
  return out;
}

function uint64(value: number) {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(value / 0x100000000), false);
  view.setUint32(4, value >>> 0, false);
  return out;
}

/**
 * What a wallet signs for a text or binary `signData`: sha256(ff ff || "ton-connect/sign-data/" || i32be workchain ||
 * hash || u32be len(domain) || domain || u64be timestamp || "txt"|"bin" || u32be len(payload) || payload)
 */
export function signDataDigest(address: TonConnectRawAddress, domain: string, timestamp: number, payload: TonConnectSignDataPayload) {
  const domainBytes = textEncoder.encode(domain);
  const data = payload.type === 'text' ? textEncoder.encode(payload.text) : payload.bytes;
  return sha256(concatBytes(
    new Uint8Array([0xff, 0xff]),
    textEncoder.encode('ton-connect/sign-data/'),
    int32(address.workchain),
    address.hash,
    uint32(domainBytes.length),
    domainBytes,
    uint64(timestamp),
    textEncoder.encode(payload.type === 'text' ? 'txt' : 'bin'),
    uint32(data.length),
    data
  ));
}

/** an ed25519 signature of `digest` by the signing seed */
export async function signDigest(seed: Uint8Array, digest: Uint8Array) {
  await ensureCryptoReady();
  const pair = ed25519KeyPairFromSeed(seed);
  try {
    return ed25519Sign(pair.secretKey, digest);
  } finally {
    pair.secretKey.fill(0);
  }
}

export function sameBytes(a: Uint8Array, b: Uint8Array) {
  return !!a && !!b && constantTimeEqual(a, b);
}
