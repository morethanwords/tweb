/*
 * The shared DH secret of a 1-on-1 call is a fixed 256-byte key for every
 * native client (tdesktop mtproto_auth_key.cpp FillData left-pads it). mod-pow
 * yields the minimal encoding, so a secret with a zero top byte — about one
 * call in two hundred — used to come out 255 bytes long: a different
 * fingerprint and shifted key-derivation offsets, i.e. the call was dropped
 * against a native peer while tweb↔tweb never noticed.
 */
import {describe, expect, it} from 'vitest';
import '../lib/crypto/crypto.worker';
import cryptoWorker from '@lib/crypto/cryptoMessagePort';
import computeDhKey from '@lib/crypto/computeDhKey';
import {bigIntFromBytes, bigIntToSigned} from '@helpers/bigInt/bigIntConversion';
import {p} from '../mock/srp';

function fingerprintOf(sha1: Uint8Array): string {
  return bigIntToSigned(bigIntFromBytes(sha1.slice(-8).reverse())).toString(10);
}

describe('computeDhKey', () => {
  // With a = 1 the shared secret IS the peer value, so a peer value whose top
  // byte is zero (still inside the 2^(2048-64) window verifyDhPublicValue
  // demands) reproduces the leading-zero secret deterministically.
  const peerValue = new Uint8Array(256);
  peerValue[1] = 0x80;
  for(let i = 2; i < 256; ++i) peerValue[i] = (i * 37) & 0xff;
  const a = new Uint8Array([1]);

  it('left-pads the shared key to 256 bytes', async() => {
    const {key} = await computeDhKey(peerValue, a, p);
    expect(key.length).toBe(256);
    expect(key[0]).toBe(0);
    expect(Array.from(key)).toEqual(Array.from(peerValue));
  });

  it('fingerprints the padded key, the way native clients do', async() => {
    const {key, key_fingerprint} = await computeDhKey(peerValue, a, p);
    const padded = await cryptoWorker.invokeCrypto('sha1', key);
    const minimal = await cryptoWorker.invokeCrypto('sha1', key.subarray(1));
    expect(key_fingerprint).toBe(fingerprintOf(padded));
    expect(key_fingerprint).not.toBe(fingerprintOf(minimal));
  });
});
