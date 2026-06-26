/*
 * Validation for the Diffie-Hellman parameters used in 1-on-1 call key
 * agreement (messages.getDhConfig). A malicious or compromised server is the
 * explicit adversary of an end-to-end-encrypted call, and it supplies BOTH the
 * {p, g} config and the relayed peer public value. Without these checks it can:
 *   - pick a prime whose (p-1) is smooth, so the shared key is recoverable by
 *     discrete log — a passive break that the key fingerprint AND the emoji SAS
 *     both fail to catch (both endpoints derive the same server-known key);
 *   - substitute a degenerate peer public value (0, 1, p-1) to force the key.
 *
 * Mirrors tdesktop's MTP::IsPrimeAndGood / IsGoodModExpFirst
 * (Telegram/SourceFiles/mtproto/mtproto_dh_utils.cpp) and the same checks
 * already applied to the MTProto auth handshake in authorizer.ts verifyDhParams.
 */
import bigInt from 'big-integer';
import {bigIntFromBytes} from '@helpers/bigInt/bigIntConversion';
import bytesToHex from '@helpers/bytes/bytesToHex';

// The well-known 2048-bit safe prime, from
// https://core.telegram.org/mtproto/security_guidelines — the same value
// pinned in authorizer.ts for the auth-key handshake.
const KNOWN_DH_PRIME_HEX =
  'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f' +
  '48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c37' +
  '20fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f64' +
  '2477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4' +
  'a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754' +
  'fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4' +
  'e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f' +
  '0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b';

const DH_PRIME_BITS = 2048;

// Lower/upper guard for public values: 2^(2048-64). Matches authorizer.ts
// verifyDhParams and tdesktop's IsGoodModExpFirst bit-length guard.
const TWO_POW = bigInt(2).pow(DH_PRIME_BITS - 64);

// Miller-Rabin rounds for the (rare) slow path. The fast path pins the known
// prime, so this only runs for a hypothetical server-rotated prime.
const PRIME_PRIMALITY_ITERATIONS = 30;

function isGoodGeneratorForPrime(g: number, p: bigInt.BigInteger): boolean {
  switch(g) {
    case 2: return p.mod(8).toJSNumber() === 7;
    case 3: return p.mod(3).toJSNumber() === 2;
    case 4: return true;
    case 5: {
      const m = p.mod(5).toJSNumber();
      return m === 1 || m === 4;
    }
    case 6: {
      const m = p.mod(24).toJSNumber();
      return m === 19 || m === 23;
    }
    case 7: {
      const m = p.mod(7).toJSNumber();
      return m === 3 || m === 5 || m === 6;
    }
    default: return false;
  }
}

// Validate the server-supplied DH prime p and generator g. Throws on failure.
// Fast path pins the known-good prime (what Telegram always serves); the slow
// path verifies safe-prime structure so a future server-rotated prime still
// works — exactly tdesktop's IsPrimeAndGood.
export function verifyDhPrimeAndGenerator(pBytes: Uint8Array, g: number): void {
  if(bytesToHex(pBytes) === KNOWN_DH_PRIME_HEX && (g === 3 || g === 4 || g === 5 || g === 7)) {
    return;
  }

  const p = bigIntFromBytes(pBytes);
  if(p.isNegative() || p.bitLength().notEquals(DH_PRIME_BITS)) {
    throw new Error('[DH] bad prime: wrong bit length');
  }
  if(!isGoodGeneratorForPrime(g, p)) {
    throw new Error('[DH] bad generator g=' + g);
  }
  if(!p.isProbablePrime(PRIME_PRIMALITY_ITERATIONS)) {
    throw new Error('[DH] bad prime: not prime');
  }
  if(!p.subtract(bigInt.one).divide(2).isProbablePrime(PRIME_PRIMALITY_ITERATIONS)) {
    throw new Error('[DH] bad prime: (p-1)/2 not prime');
  }
}

// Validate a DH public value x against prime p: 1 < x < p-1 AND
// 2^(2048-64) <= x <= p - 2^(2048-64). Throws on failure. Applies to BOTH the
// locally generated g_a and the peer-supplied g_b/g_a.
export function verifyDhPublicValue(xBytes: Uint8Array, pBytes: Uint8Array): void {
  if(xBytes.length > 256) {
    throw new Error('[DH] public value too large');
  }

  const x = bigIntFromBytes(xBytes);
  const p = bigIntFromBytes(pBytes);

  if(x.compare(bigInt.one) <= 0) {
    throw new Error('[DH] public value <= 1');
  }
  if(x.compare(p.subtract(bigInt.one)) >= 0) {
    throw new Error('[DH] public value >= p - 1');
  }
  if(x.compare(TWO_POW) < 0) {
    throw new Error('[DH] public value < 2^(2048-64)');
  }
  if(x.compare(p.subtract(TWO_POW)) >= 0) {
    throw new Error('[DH] public value > p - 2^(2048-64)');
  }
}
