/*
 * BitString — a bit-addressable byte sequence used by the TdE2E trie.
 * Port of tdlib/tde2e/td/e2e/BitString.{cpp,h}.
 *
 * Bit order: big-endian. Bit 0 = MSB of first byte. The trie addresses keys
 * as bit sequences, where common-prefix length determines branching.
 *
 * Client-side scope (see notes/trie.md):
 *  - construct from a byte slice
 *  - bitLength, getBit, substr, equals, commonPrefixLength
 *  - TL serialize/parse (used by `store(BitString)` + `fetch_bit_string` in C++)
 *
 * Internal representation differs from C++: we store the full backing
 * Uint8Array + begin_bit + bit_length, with no negative-offset shared pointer
 * trick. The serialized wire form matches exactly.
 */

import {TLReader, TLWriter} from './tl';

// Mask of bits [from, 8) — MSB-first; e.g. beginMask(3) = 0b00011111.
function beginMask(from: number): number {
  return (0xff >> from) & 0xff;
}

// Mask of bits [0, to) — e.g. endMask(5) = 0b11111000.
function endMask(to: number): number {
  return (0xff << (8 - to)) & 0xff;
}

// Combined mask for a single byte that holds bits [from, to). Used when an
// entire BitString fits inside one byte.
function createMask(from: number, to: number): number {
  return beginMask(from) & endMask(to);
}

export class BitString {
  // The whole backing buffer. Bits start at `beginBit` within `data[0]`.
  // Views (substrings) share the buffer.
  readonly data: Uint8Array;
  readonly beginBit: number; // 0..7
  readonly bitLengthValue: number;

  constructor(data: Uint8Array, beginBit: number, bitLength: number) {
    if(beginBit < 0 || beginBit > 7) {
      throw new Error(`BitString: beginBit out of range: ${beginBit}`);
    }
    const requiredBytes = Math.ceil((beginBit + bitLength) / 8);
    if(data.length < requiredBytes) {
      throw new Error(
        `BitString: backing too short (need ${requiredBytes} bytes, have ${data.length})`
      );
    }
    this.data = data;
    this.beginBit = beginBit;
    this.bitLengthValue = bitLength;
  }

  public static empty(): BitString {
    return new BitString(new Uint8Array(0), 0, 0);
  }

  // Wrap a raw key slice (key is exactly 8*data.length bits, beginBit=0).
  public static fromBytes(data: Uint8Array): BitString {
    return new BitString(data, 0, data.length * 8);
  }

  public bitLength(): number {
    return this.bitLengthValue;
  }

  public getBit(pos: number): number {
    if(pos < 0 || pos >= this.bitLengthValue) {
      throw new Error(`BitString.getBit: out of range ${pos} / ${this.bitLengthValue}`);
    }
    const abs = pos + this.beginBit;
    const byte = this.data[abs >> 3];
    const bitInByte = 7 - (abs & 7);
    return (byte >> bitInByte) & 1;
  }

  public equals(other: BitString): boolean {
    if(this.bitLengthValue !== other.bitLengthValue) return false;
    for(let i = 0; i < this.bitLengthValue; i++) {
      if(this.getBit(i) !== other.getBit(i)) return false;
    }
    return true;
  }

  public commonPrefixLength(other: BitString): number {
    const cap = Math.min(this.bitLengthValue, other.bitLengthValue);
    for(let i = 0; i < cap; i++) {
      if(this.getBit(i) !== other.getBit(i)) return i;
    }
    return cap;
  }

  public substr(pos: number, length: number = Number.MAX_SAFE_INTEGER): BitString {
    if(pos < 0) throw new Error('BitString.substr: negative pos');
    const newLength = Math.min(length, this.bitLengthValue - pos);
    if(newLength < 0) throw new Error('BitString.substr: pos beyond bitLength');

    // Adjust beginBit; share the underlying buffer offset by whole bytes.
    const absStart = this.beginBit + pos;
    const newBeginBit = absStart & 7;
    const byteOffset = absStart >> 3;
    return new BitString(this.data.subarray(byteOffset), newBeginBit, newLength);
  }

  // Concatenate bit strings into a fresh BitString. Useful for trie key paths.
  public static concat(parts: BitString[]): BitString {
    let total = 0;
    for(const p of parts) total += p.bitLengthValue;
    if(total === 0) return BitString.empty();

    const bytes = new Uint8Array(Math.ceil(total / 8));
    let cursor = 0;
    for(const p of parts) {
      for(let i = 0; i < p.bitLengthValue; i++) {
        if(p.getBit(i)) {
          bytes[cursor >> 3] |= 1 << (7 - (cursor & 7));
        }
        cursor++;
      }
    }
    return new BitString(bytes, 0, total);
  }

  // ===== Wire serialization (matches tdlib's `store(BitString)`/`fetch_bit_string`) =====

  // Header layout: uint32 = (begin_bit << 16) | (begin_bit + bit_length).
  // Then masked first byte (if begin_bit != 0), then full middle bytes, then
  // masked last byte (if end_bit != 0), then zero-pad to 4-byte alignment.
  public store(writer: TLWriter): void {
    const begin = this.beginBit;
    const end = this.beginBit + this.bitLengthValue;
    writer.uint32(((begin & 0xff) << 16) | (end & 0xffff));

    const endBitInLastByte = end & 7;
    const totalBytes = Math.ceil(end / 8);
    const fullMiddleStart = begin === 0 ? 0 : 1;
    const fullMiddleEnd = endBitInLastByte === 0 ? totalBytes : totalBytes - 1;
    const bytesSize = Math.max(0, fullMiddleEnd - fullMiddleStart);
    const singleByteOnly = bytesSize === 0 && begin !== 0 && endBitInLastByte !== 0 && totalBytes === 1;

    let n = 0;
    if(singleByteOnly) {
      const mask = createMask(begin, endBitInLastByte);
      writer.uint8(this.data[0] & mask);
      n = 1;
    } else {
      if(begin !== 0) {
        writer.uint8(this.data[0] & beginMask(begin));
        n++;
      }
      // Full middle bytes — no masking.
      for(let i = 0; i < bytesSize; i++) {
        writer.uint8(this.data[fullMiddleStart + i]);
        n++;
      }
      if(endBitInLastByte !== 0) {
        writer.uint8(this.data[totalBytes - 1] & endMask(endBitInLastByte));
        n++;
      }
    }
    while(n % 4 !== 0) {
      writer.uint8(0);
      n++;
    }
  }

  // Inverse of `store`. Always called from a TLReader; mutates the reader offset.
  public static parse(reader: TLReader): BitString {
    const beginEnd = reader.uint32();
    const begin = (beginEnd >>> 16) & 0xff;
    const end = beginEnd & 0xffff;
    if(begin > 7) throw new Error(`BitString.parse: invalid begin_bit ${begin}`);
    if(end < begin) throw new Error(`BitString.parse: end ${end} < begin ${begin}`);

    const bitLength = end - begin;
    const endBitInLastByte = end & 7;
    const totalBytes = Math.ceil(end / 8);

    const out = new Uint8Array(totalBytes);
    let n = 0;
    const singleByteOnly = totalBytes === 1 && begin !== 0 && endBitInLastByte !== 0;

    if(singleByteOnly) {
      const mask = createMask(begin, endBitInLastByte);
      out[0] = reader.uint8() & mask;
      n = 1;
    } else {
      if(begin !== 0) {
        out[0] = reader.uint8() & beginMask(begin);
        n++;
      }
      const fullMiddleStart = begin === 0 ? 0 : 1;
      const fullMiddleEnd = endBitInLastByte === 0 ? totalBytes : totalBytes - 1;
      for(let i = fullMiddleStart; i < fullMiddleEnd; i++) {
        out[i] = reader.uint8();
        n++;
      }
      if(endBitInLastByte !== 0) {
        out[totalBytes - 1] = reader.uint8() & endMask(endBitInLastByte);
        n++;
      }
    }
    while(n % 4 !== 0) {
      reader.uint8();
      n++;
    }
    return new BitString(out, begin, bitLength);
  }
}
