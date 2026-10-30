/*
 * TON Connect's keys, boxes and signatures against fixed vectors: the wallet engine's own (`crypto.rs`,
 * `ton_connect/derived.rs`, `ton-connect-core/src/signing.rs`) and NaCl's crypto_box test vector.
 */

import {describe, expect, it} from 'vitest';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import {
  deriveSessionKeyPair,
  deriveSessionSecret,
  deriveSigningSeed,
  openChallenge,
  openFromPeer,
  sealToPeer,
  signDataDigest,
  signDigest,
  signingPublicKey
} from '@lib/wallet/tonConnectCrypto';
import {ed25519Verify, ensureCryptoReady, x25519DerivePublic} from '@lib/calls/e2e/crypto';
import sodium from 'libsodium-wrappers';

/** the two official BIP-39 half vectors joined into one rotation phrase (wallet-engine crypto.rs) */
const ROTATION_PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about ' +
  'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
const HALF = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** the tweetnacl "alice" key pair and "bob" public key */
const ALICE_SECRET = '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a';
const ALICE_PUBLIC = '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a';
const BOB_SECRET = '5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb';
const BOB_PUBLIC = 'de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f';
const NACL_NONCE = '69696ee955b62b73cd62bda875fc73d68219e0036b7a0b37';
const NACL_MESSAGE = 'be075fc53c81f2d5cf141316ebeb0c7b5228c52a4c62cbd44b66849b64244ffce5ecbaaf33bd751a1ac728d45e6c61296cdc3c01233561f41db66cce314adb310e3be8250c46f06dceea3a7fa1348057e2f6556ad6b1318a024a838f21af1fde048977eb48f59ffd4924ca1c60902e52f0a089bc76897040e082f937763848645e0705';
const NACL_BOX = 'f3ffc7703f9400e52a7dfb4b3d3305d98e993b9f48681273c29650ba32fc76ce48332ea7164d96a4476fb8c531a1186ac0dfc17c98dce87b4da7f011ec48c97271d2c20f9b928fe2270d6fb863d51738b48eeee314a7cc8ab932164548e526ae90224368517acfeabd6bb3732bc0e9da99832b61ca01b6de56244a9e88d5f9b37973f622a43d14a6599b1f654cb45a74e355a5';

const seedOf = (length: number, start = 0) => Uint8Array.from({length}, (_, i) => start + i);

describe('TON Connect keys', () => {
  it('derives the signing seed of a rotated phrase from words 13-24', async() => {
    const seed = await deriveSigningSeed(new TextEncoder().encode(ROTATION_PHRASE));
    expect(bytesToHex(seed)).toBe('a7e4e571135b501905f0be50d4bbd7a407e194cc23b1573c0be8a769aef43333');
    expect(bytesToHex(await signingPublicKey(seed))).toBe('5d6320a0546c2df0908f0477e1ade79226faf854d041548f846b58872de5213e');
  });

  it('derives the signing seed of a phrase that never rotated from its 12 words', async() => {
    const seed = await deriveSigningSeed(HALF.split(' '));
    expect(bytesToHex(seed)).toBe('b477ef5ed17fb8a2b8faddd7a9835a227243a82c70b190c7af4896155aa7df9f');
    expect(bytesToHex(await signingPublicKey(seed))).toBe('7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf');
  });

  it('refuses a phrase that is neither 12 nor 24 words', async() => {
    await expect(deriveSigningSeed(HALF.split(' ').slice(1))).rejects.toThrow();
  });

  it('derives the session secret of the fixed vector', async() => {
    const secret = await deriveSessionSecret(seedOf(32), bytesFromHex(ALICE_PUBLIC), seedOf(16, 0xa0));
    expect(bytesToHex(secret)).toBe('a0ca52b8e8de99d0f834cb243f61edd4079886b64c196ca082b7f64e1511db5d');

    const flipped = seedOf(16, 0xa0);
    flipped[0] ^= 1;
    expect(bytesToHex(await deriveSessionSecret(seedOf(32), bytesFromHex(ALICE_PUBLIC), flipped))).not.toBe(bytesToHex(secret));
  });

  it('gives the fixed vector W as the wallet client id', async() => {
    const pair = await deriveSessionKeyPair(seedOf(32), bytesFromHex(ALICE_PUBLIC), seedOf(16, 0xa0));
    expect(bytesToHex(pair.publicKey)).toBe('a8ed199729d5efd0c212c2542fd7d353e692e42c95e7e97a9e47e2569cbe4f61');
  });
});

describe('TON Connect boxes', () => {
  it('seals like NaCl crypto_box: the known vector opens', async() => {
    await ensureCryptoReady();
    expect(bytesToHex(x25519DerivePublic(bytesFromHex(ALICE_SECRET)))).toBe(ALICE_PUBLIC);
    // * the wire form is nonce || box
    const body = bytesFromHex(NACL_NONCE + NACL_BOX);
    const opened = await openFromPeer(bytesFromHex(BOB_SECRET), bytesFromHex(ALICE_PUBLIC), body);
    expect(bytesToHex(opened)).toBe(NACL_MESSAGE);
    expect(bytesToHex(sodium.crypto_box_easy(bytesFromHex(NACL_MESSAGE), bytesFromHex(NACL_NONCE), bytesFromHex(BOB_PUBLIC), bytesFromHex(ALICE_SECRET)))).toBe(NACL_BOX);
  });

  it('round-trips a packet both ways and refuses a tampered one', async() => {
    const plaintext = new TextEncoder().encode('{"event":"connect","id":1,"payload":{}}');
    const sealed = await sealToPeer(bytesFromHex(ALICE_SECRET), bytesFromHex(BOB_PUBLIC), plaintext);
    expect(sealed.length).toBe(24 + 16 + plaintext.length);
    expect(bytesToHex(await openFromPeer(bytesFromHex(BOB_SECRET), bytesFromHex(ALICE_PUBLIC), sealed))).toBe(bytesToHex(plaintext));

    sealed[sealed.length - 1] ^= 1;
    await expect(openFromPeer(bytesFromHex(BOB_SECRET), bytesFromHex(ALICE_PUBLIC), sealed)).rejects.toThrow();
  });

  it('opens the server challenge sealed to W under an ephemeral key', async() => {
    const pair = await deriveSessionKeyPair(seedOf(32), bytesFromHex(ALICE_PUBLIC), seedOf(16, 0xa0));
    const answer = new Uint8Array(32).fill(0x42);
    const sealed = await sealToPeer(bytesFromHex(BOB_SECRET), pair.publicKey, answer);
    const challenge = new Uint8Array(104);
    challenge.set(bytesFromHex(BOB_PUBLIC), 0);
    challenge.set(sealed, 32);
    expect(bytesToHex(await openChallenge(pair.secretKey, challenge))).toBe(bytesToHex(answer));

    challenge[103] ^= 1;
    await expect(openChallenge(pair.secretKey, challenge)).rejects.toThrow();
    await expect(openChallenge(pair.secretKey, challenge.subarray(0, 100))).rejects.toThrow();
  });
});

describe('TON Connect signData', () => {
  const address = {workchain: 0, hash: new Uint8Array(32).fill(0x11)};

  it('hashes text and binary like ton-connect-core', async() => {
    expect(bytesToHex(await signDataDigest(address, 'example.com', 1_700_000_000, {type: 'text', text: 'Hello 🌍'})))
    .toBe('5ec8d5210d541e5e6995ef4a003557a04f3ed070fc1b6e78631895bb23002e32');
    expect(bytesToHex(await signDataDigest(address, 'example.com', 1_700_000_000, {type: 'binary', bytes: new Uint8Array([0, 1, 2, 253, 254, 255])})))
    .toBe('e009a87c047c8dedb7e193819dc2b7b21898f9b56968bcf3a569f2a05370b509');
  });

  it('signs a digest with the signing key', async() => {
    const seed = await deriveSigningSeed(new TextEncoder().encode(ROTATION_PHRASE));
    const digest = await signDataDigest(address, 'example.com', 1_700_000_000, {type: 'text', text: 'Hello'});
    const signature = await signDigest(seed, digest);
    expect(ed25519Verify(await signingPublicKey(seed), digest, signature)).toBe(true);
  });
});
