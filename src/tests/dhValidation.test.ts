/*
 * WebK-1 regression tests: the 1-on-1 call DH-parameter validation that a
 * malicious server's weak prime / degenerate peer value must not pass.
 */
import {describe, it, expect} from 'vitest';
import bigInt from 'big-integer';
import {verifyDhPrimeAndGenerator, verifyDhPublicValue} from '@lib/crypto/dhValidation';
import bytesFromHex from '@helpers/bytes/bytesFromHex';
import {bigIntToBytes} from '@helpers/bigInt/bigIntConversion';

// Independent copy of the well-known Telegram 2048-bit safe prime — if the
// pinned constant in dhValidation.ts ever drifts, these tests catch it.
const PRIME_HEX =
  'c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f' +
  '48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c37' +
  '20fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f64' +
  '2477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4' +
  'a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754' +
  'fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4' +
  'e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f' +
  '0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b';

const pBytes = bytesFromHex(PRIME_HEX);
const p = bigInt(PRIME_HEX, 16);

describe('dhValidation — verifyDhPrimeAndGenerator (WebK-1)', () => {
  it('accepts the pinned safe prime with a valid generator', () => {
    expect(() => verifyDhPrimeAndGenerator(pBytes, 3)).not.toThrow();
  });

  it('rejects a generator that does not satisfy the prime congruence', () => {
    // g=2 needs p mod 8 == 7; the known prime does not satisfy it.
    expect(() => verifyDhPrimeAndGenerator(pBytes, 2)).toThrow();
  });

  it('rejects a wrong-size / non-2048-bit prime (e.g. a small smooth one)', () => {
    expect(() => verifyDhPrimeAndGenerator(bytesFromHex('0b'), 3)).toThrow();
  });
});

describe('dhValidation — verifyDhPublicValue (WebK-1 degenerate/range guard)', () => {
  it('rejects degenerate peer public values 0, 1 and p-1', () => {
    for(const bad of [bigInt.zero, bigInt.one, p.subtract(bigInt.one)]) {
      expect(() => verifyDhPublicValue(bigIntToBytes(bad), pBytes)).toThrow();
    }
  });

  it('rejects an out-of-range value below 2^(2048-64)', () => {
    expect(() => verifyDhPublicValue(bigIntToBytes(bigInt(2).pow(1900)), pBytes)).toThrow();
  });

  it('accepts a normal in-range public value', () => {
    // 2^2047 sits comfortably inside [2^1984, p - 2^1984].
    expect(() => verifyDhPublicValue(bigIntToBytes(bigInt(2).pow(2047)), pBytes)).not.toThrow();
  });
});
