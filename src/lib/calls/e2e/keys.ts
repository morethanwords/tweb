/*
 * TdE2E Keys — Ed25519 sign/verify + X25519 ECDH wrappers.
 *
 * Simpler model than tdlib's `e2e_api.h` handle store (PrivateKeyId/
 * PublicKeyId/SymmetricKeyId): JS doesn't have the C++/JS heap boundary the
 * TDLib model is designed for, so private bytes just live on the object.
 * If we ever need the opaque-handle API for compat (e.g. for shared workers
 * passing keys via postMessage), it layers on top of these classes.
 *
 * Reference: tdlib/tde2e/td/e2e/Keys.cpp + e2e_api.h key_* functions.
 */

import {
  computeSharedSecret,
  computeSharedSecretWithCurve25519,
  ed25519GenerateKeyPair,
  ed25519KeyPairFromSeed,
  ed25519Sign,
  ed25519Verify,
  randomBytes
} from './crypto';

// Ed25519 secret-key wrapper. Holds both the 32-byte seed (== public key
// pre-image) and the full 64-byte libsodium secret (seed||public). Sign and
// derive ECDH from this object.
export class PrivateKey {
  // libsodium 64-byte secret (seed || pub). Treat as opaque.
  private secretKey: Uint8Array | undefined;
  readonly publicKeyBytes: Uint8Array; // 32 bytes

  private constructor(secretKey: Uint8Array, publicKey: Uint8Array) {
    if(secretKey.length !== 64) {
      throw new Error(`PrivateKey: libsodium secret must be 64 bytes, got ${secretKey.length}`);
    }
    if(publicKey.length !== 32) {
      throw new Error(`PrivateKey: public must be 32 bytes, got ${publicKey.length}`);
    }
    this.secretKey = secretKey;
    this.publicKeyBytes = publicKey;
  }

  private secret(): Uint8Array {
    if(!this.secretKey) throw new Error('PrivateKey: already destroyed');
    return this.secretKey;
  }

  // Fresh keypair, secure random seed.
  public static generate(): PrivateKey {
    const kp = ed25519GenerateKeyPair();
    return new PrivateKey(kp.secretKey, kp.publicKey);
  }

  // Fresh keypair, secure random seed — alias to match e2e_api naming
  // (`key_generate_temporary_private_key`). Semantically identical to
  // generate() in the browser; the C++ "temporary" hint is about persistence.
  public static generateTemporary(): PrivateKey {
    return PrivateKey.generate();
  }

  // Construct from a 32-byte Ed25519 seed (matches tdlib wire format).
  public static fromSeed(seed: Uint8Array): PrivateKey {
    if(seed.length !== 32) throw new Error(`PrivateKey.fromSeed: need 32 bytes, got ${seed.length}`);
    const kp = ed25519KeyPairFromSeed(seed);
    return new PrivateKey(kp.secretKey, kp.publicKey);
  }

  // Public-key counterpart, for verification + ECDH from the other side.
  public publicKey(): PublicKey {
    return new PublicKey(this.publicKeyBytes);
  }

  // Detached Ed25519 signature, 64 bytes.
  public sign(message: Uint8Array): Uint8Array {
    return ed25519Sign(this.secret(), message);
  }

  // Compute a TdE2E-compliant shared secret against another participant's
  // Ed25519 public key. Converts both sides to Curve25519, runs X25519, then
  // mixes via HMAC-SHA512("tde2e_shared_secret", x25519_output)[0:32] (matches
  // tdlib's `PrivateKey::compute_shared_secret` — required for interop).
  // Symmetric: ours.ecdh(theirs.pub) == theirs.ecdh(ours.pub).
  public ecdh(theirPublic: PublicKey): Promise<Uint8Array> {
    return computeSharedSecret(this.secret(), theirPublic.bytes);
  }

  // Same as ecdh() but the peer's key is a raw Curve25519 public (NOT Ed25519).
  // Useful when SharedKey.ek already stores an X25519 pub directly.
  public ecdhWithCurve25519(curvePublicKey: Uint8Array): Promise<Uint8Array> {
    if(curvePublicKey.length !== 32) {
      throw new Error(`ecdhWithCurve25519: pub must be 32 bytes, got ${curvePublicKey.length}`);
    }
    return computeSharedSecretWithCurve25519(this.secret(), curvePublicKey);
  }

  // Wipe the in-memory secret. After destroy() the object is unusable.
  public destroy(): void {
    if(this.secretKey) {
      this.secretKey.fill(0);
      this.secretKey = undefined;
    }
  }
}

export class PublicKey {
  readonly bytes: Uint8Array; // 32 bytes

  constructor(bytes: Uint8Array) {
    if(bytes.length !== 32) {
      throw new Error(`PublicKey: must be 32 bytes, got ${bytes.length}`);
    }
    this.bytes = new Uint8Array(bytes); // defensive copy
  }

  public verify(message: Uint8Array, signature: Uint8Array): boolean {
    if(signature.length !== 64) return false;
    return ed25519Verify(this.bytes, message, signature);
  }

  public equals(other: PublicKey): boolean {
    if(this.bytes.length !== other.bytes.length) return false;
    for(let i = 0; i < this.bytes.length; i++) {
      if(this.bytes[i] !== other.bytes[i]) return false;
    }
    return true;
  }
}

// Convenience for tests / call setup: generate 32 random bytes for a one-time
// secret or nonce.
export function generateNonce(size = 32): Uint8Array {
  return randomBytes(size);
}
