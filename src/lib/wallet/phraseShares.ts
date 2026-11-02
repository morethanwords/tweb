/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {
  computeSharedSecret,
  ed25519GenerateKeyPair,
  ensureCryptoReady,
  randomBytes
} from '@lib/calls/e2e/crypto';
import {decryptData, encryptData} from '@lib/calls/e2e/messageEncryption';

/**
 * Telegram keeps the wallet's recovery phrase as an n-of-n XOR split, one share per holder DC. Each share is
 * sealed to its holder's Ed25519 key with the tde2e "message for one" envelope: an ephemeral key pair,
 * the domain-separated ECDH secret, and `encrypt_data`. On the wire a share is `senderPublicKey(32) || cipher`,
 * and the plaintext is the TL object `mnemonic.decryptedKeyPart#8b90dd08 share:bytes`.
 *
 * The seed is the words joined with single spaces, UTF-8, padded with spaces to 215 bytes.
 */

export const PHRASE_SEED_LENGTH = 215;
const PUBLIC_KEY_SIZE = 32;
const DECRYPTED_KEY_PART_ID = 0x8b90dd08;

export type PhraseShareKeyPair = {publicKey: Uint8Array, secretKey: Uint8Array};

export async function generateShareKeyPair(): Promise<PhraseShareKeyPair> {
  await ensureCryptoReady();
  return ed25519GenerateKeyPair();
}

function serializeDecryptedKeyPart(share: Uint8Array) {
  const length = share.length;
  const header = length < 254 ? 1 : 4;
  const total = 4 + header + length;
  const padded = total + ((4 - total % 4) % 4);
  const out = new Uint8Array(padded);
  const view = new DataView(out.buffer);
  view.setUint32(0, DECRYPTED_KEY_PART_ID, true);
  if(header === 1) {
    out[4] = length;
  } else {
    out[4] = 254;
    out[5] = length & 0xff;
    out[6] = (length >> 8) & 0xff;
    out[7] = (length >> 16) & 0xff;
  }

  out.set(share, 4 + header);
  return out;
}

export function parseDecryptedKeyPart(plain: Uint8Array) {
  if(!plain.length || plain.length % 4) {
    throw new Error('WALLET_SHARE_INVALID');
  }

  const view = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);
  if(view.getUint32(0, true) !== DECRYPTED_KEY_PART_ID) {
    throw new Error('WALLET_SHARE_INVALID');
  }

  let offset = 4, length = plain[offset];
  if(length === 254) {
    length = plain[5] | (plain[6] << 8) | (plain[7] << 16);
    offset += 4;
  } else {
    offset += 1;
  }

  const end = offset + length;
  const padded = end + ((4 - end % 4) % 4);
  if(padded !== plain.length) {
    throw new Error('WALLET_SHARE_INVALID');
  }

  return plain.slice(offset, end);
}

export async function decryptShare(keyPair: PhraseShareKeyPair, data: Uint8Array) {
  if(data.length <= PUBLIC_KEY_SIZE) {
    throw new Error('WALLET_SHARE_INVALID');
  }

  await ensureCryptoReady();
  const secret = await computeSharedSecret(keyPair.secretKey, data.subarray(0, PUBLIC_KEY_SIZE));
  const {output} = await decryptData(data.subarray(PUBLIC_KEY_SIZE), secret);
  return parseDecryptedKeyPart(output);
}

export async function encryptShare(holderPublicKey: Uint8Array, share: Uint8Array) {
  if(holderPublicKey.length !== PUBLIC_KEY_SIZE) {
    throw new Error('WALLET_HOLDER_KEY_INVALID');
  }

  await ensureCryptoReady();
  const keyPair = ed25519GenerateKeyPair();
  const secret = await computeSharedSecret(keyPair.secretKey, holderPublicKey);
  const {output} = await encryptData(serializeDecryptedKeyPart(share), secret);
  keyPair.secretKey.fill(0);
  const result = new Uint8Array(PUBLIC_KEY_SIZE + output.length);
  result.set(keyPair.publicKey, 0);
  result.set(output, PUBLIC_KEY_SIZE);
  return result;
}

export function combineShares(shares: Uint8Array[]) {
  const length = shares[0]?.length;
  if(!length || shares.some((share) => share.length !== length)) {
    throw new Error('WALLET_SHARE_INVALID');
  }

  const result = new Uint8Array(length);
  for(const share of shares) {
    for(let i = 0; i < length; ++i) {
      result[i] ^= share[i];
    }
  }

  return result;
}

export function splitSeed(seed: Uint8Array, count: number) {
  const last = seed.slice();
  const shares: Uint8Array[] = [];
  for(let i = 0; i < count - 1; ++i) {
    const share = randomBytes(seed.length);
    for(let j = 0; j < seed.length; ++j) {
      last[j] ^= share[j];
    }

    shares.push(share);
  }

  shares.push(last);
  return shares;
}

export function seedFromWords(words: string[]) {
  const joined = new TextEncoder().encode(words.join(' '));
  if(joined.length > PHRASE_SEED_LENGTH) {
    throw new Error('WALLET_PHRASE_TOO_LONG');
  }

  const seed = new Uint8Array(PHRASE_SEED_LENGTH).fill(0x20);
  seed.set(joined, 0);
  return seed;
}

export function wordsFromSeed(seed: Uint8Array) {
  return new TextDecoder().decode(seed).trim().split(/\s+/).filter(Boolean);
}
