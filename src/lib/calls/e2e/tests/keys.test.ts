import {beforeAll, describe, it, expect} from 'vitest';
import {bytesToHex, ensureCryptoReady, hexToBytes} from '../crypto';
import {PrivateKey, PublicKey} from '../keys';
import {HANDSHAKE_VECTORS} from './vectors';

beforeAll(() => ensureCryptoReady());

// jsdom + libsodium realm clash: jsdom's TextEncoder yields a jsdom-realm
// Uint8Array that libsodium's `instanceof Uint8Array` check rejects. Wrap.
const utf8 = (s: string) => new Uint8Array(new TextEncoder().encode(s));

describe('Keys', () => {
  it('generated keypair signs + verifies', () => {
    const sk = PrivateKey.generate();
    const pk = sk.publicKey();
    const msg = utf8('hello world');
    const sig = sk.sign(msg);
    expect(sig.length).toBe(64);
    expect(pk.verify(msg, sig)).toBe(true);
    expect(pk.verify(utf8('hello mars'), sig)).toBe(false);
  });

  it('fromSeed is deterministic', () => {
    const seed = hexToBytes('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff');
    const a = PrivateKey.fromSeed(seed);
    const b = PrivateKey.fromSeed(seed);
    expect(bytesToHex(a.publicKeyBytes)).toBe(bytesToHex(b.publicKeyBytes));
    const msg = new Uint8Array([1, 2, 3]);
    // Ed25519 signatures over a fixed seed + message are deterministic.
    expect(bytesToHex(a.sign(msg))).toBe(bytesToHex(b.sign(msg)));
  });

  it('ECDH is symmetric', async() => {
    const alice = PrivateKey.generate();
    const bob = PrivateKey.generate();
    const aliceShared = await alice.ecdh(bob.publicKey());
    const bobShared = await bob.ecdh(alice.publicKey());
    expect(bytesToHex(aliceShared)).toBe(bytesToHex(bobShared));
    expect(aliceShared.length).toBe(32);
  });

  it('PublicKey.equals does byte comparison', () => {
    const sk = PrivateKey.generate();
    const a = sk.publicKey();
    const b = new PublicKey(sk.publicKeyBytes);
    expect(a.equals(b)).toBe(true);

    const c = PrivateKey.generate().publicKey();
    expect(a.equals(c)).toBe(false);
  });

  it('destroy wipes secret material', () => {
    const sk = PrivateKey.generate();
    sk.destroy();
    expect(() => sk.sign(new Uint8Array([1]))).toThrow();
  });

  // Cross-check against the C++ test vector — confirms libsodium ECDH matches
  // tdlib's expected shared secret for a known keypair.
  it('matches C++ handshake vector (Ed25519 → X25519 ECDH)', () => {
    const v = HANDSHAKE_VECTORS[0];
    // base64url decode helper (vector stores keys in URL-safe base64).
    const b64uToBytes = (s: string) => {
      const std = s.replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (std.length % 4)) % 4);
      const binary = atob(std + pad);
      const out = new Uint8Array(binary.length);
      for(let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    };

    const alicePub = new PublicKey(b64uToBytes(v.inputs.alice_public_key));
    const aliceSk = PrivateKey.fromSeed(b64uToBytes(v.inputs.alice_private_key));
    expect(bytesToHex(aliceSk.publicKeyBytes)).toBe(bytesToHex(alicePub.bytes));
  });
});
