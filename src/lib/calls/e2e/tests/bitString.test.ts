/*
 * BitString round-trip tests. No C++ vector file is available for BitString
 * directly (the trie tests cover it in aggregate), so this is internal
 * consistency: store(parse(x)) == x for a range of shapes, plus get-bit /
 * common-prefix / substr semantics.
 */

import {describe, it, expect} from 'vitest';
import {BitString} from '../bitString';
import {TLReader, TLWriter} from '../tl';

function roundTrip(bs: BitString): BitString {
  const writer = new TLWriter();
  bs.store(writer);
  const reader = new TLReader(writer.finish());
  return BitString.parse(reader);
}

describe('BitString', () => {
  it('zero-length is well-defined', () => {
    const bs = BitString.empty();
    expect(bs.bitLength()).toBe(0);
    const rt = roundTrip(bs);
    expect(rt.bitLength()).toBe(0);
    expect(bs.equals(rt)).toBe(true);
  });

  it('byte-aligned input round-trips', () => {
    const bs = BitString.fromBytes(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]));
    expect(bs.bitLength()).toBe(32);
    const rt = roundTrip(bs);
    expect(rt.bitLength()).toBe(32);
    expect(bs.equals(rt)).toBe(true);
  });

  it('256-bit key (typical trie path) round-trips', () => {
    const buf = new Uint8Array(32);
    for(let i = 0; i < 32; i++) buf[i] = i * 7 + 1;
    const bs = BitString.fromBytes(buf);
    expect(bs.bitLength()).toBe(256);
    const rt = roundTrip(bs);
    expect(bs.equals(rt)).toBe(true);
  });

  it('non-aligned begin and end round-trip', () => {
    // 13-bit slice inside a 16-bit buffer starting at bit 3
    const bs = new BitString(new Uint8Array([0b10110101, 0b01010111]), 3, 13);
    expect(bs.bitLength()).toBe(13);
    const rt = roundTrip(bs);
    expect(rt.bitLength()).toBe(13);
    expect(bs.equals(rt)).toBe(true);
  });

  it('single-byte mid-byte slice round-trips', () => {
    const bs = new BitString(new Uint8Array([0b11001010]), 2, 4);
    expect(bs.bitLength()).toBe(4);
    expect(bs.getBit(0)).toBe(0); // bit 2 of 0xCA = 0
    expect(bs.getBit(1)).toBe(0); // bit 3 = 0
    expect(bs.getBit(2)).toBe(1); // bit 4 = 1
    expect(bs.getBit(3)).toBe(0); // bit 5 = 0
    const rt = roundTrip(bs);
    expect(bs.equals(rt)).toBe(true);
  });

  it('getBit reads big-endian (bit 0 = MSB of first byte)', () => {
    const bs = BitString.fromBytes(new Uint8Array([0b10000001]));
    expect(bs.getBit(0)).toBe(1);
    expect(bs.getBit(7)).toBe(1);
    expect(bs.getBit(3)).toBe(0);
  });

  it('commonPrefixLength counts matching bits', () => {
    const a = BitString.fromBytes(new Uint8Array([0b11110000, 0b00000000]));
    const b = BitString.fromBytes(new Uint8Array([0b11111111, 0b11111111]));
    expect(a.commonPrefixLength(b)).toBe(4);
    expect(b.commonPrefixLength(a)).toBe(4);
    expect(a.commonPrefixLength(a)).toBe(16);
  });

  it('substr keeps bit content', () => {
    const bs = BitString.fromBytes(new Uint8Array([0b10110101]));
    const sub = bs.substr(2, 4); // bits 2..5 = 1101
    expect(sub.bitLength()).toBe(4);
    expect(sub.getBit(0)).toBe(1);
    expect(sub.getBit(1)).toBe(1);
    expect(sub.getBit(2)).toBe(0);
    expect(sub.getBit(3)).toBe(1);
  });

  it('concat joins parts losslessly', () => {
    const a = BitString.fromBytes(new Uint8Array([0b10110000])).substr(0, 4); // 1011
    const b = BitString.fromBytes(new Uint8Array([0b01010000])).substr(0, 4); // 0101
    const c = BitString.concat([a, b]);
    expect(c.bitLength()).toBe(8);
    expect(c.getBit(0)).toBe(1);
    expect(c.getBit(1)).toBe(0);
    expect(c.getBit(2)).toBe(1);
    expect(c.getBit(3)).toBe(1);
    expect(c.getBit(4)).toBe(0);
    expect(c.getBit(5)).toBe(1);
    expect(c.getBit(6)).toBe(0);
    expect(c.getBit(7)).toBe(1);
  });
});
