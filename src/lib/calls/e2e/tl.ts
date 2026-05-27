/*
 * Minimal TL (Type Language) reader/writer for the TdE2E port.
 *
 * Hand-written rather than reusing tweb's MTProto schema codegen — the e2e
 * schema is 88 lines (~10 constructors actually used by the Call layer) and
 * tightly entangling the two TL pipelines would buy nothing.
 *
 * Phase 2 grows this with primitives needed for BitString + Trie deserialization.
 * Phase 3 will extend it with constructor IDs and `e2e.chain.*` types.
 *
 * Wire-format conventions (standard MTProto TL):
 *   - Integers are LITTLE-ENDIAN.
 *   - Variable-length `bytes`: 1-byte length when <254, else 0xfe + 3-byte LE length.
 *     Followed by data, then padded with zeros to 4-byte alignment.
 *   - Fixed-length blobs (int128, int256): raw bytes, no length prefix, no padding.
 */

// BigInt constants — declared via BigInt() because `target: es2015` rejects
// BigInt literals (`32n`).
const ZERO_BIG = BigInt(0);
const SHIFT_8 = BigInt(8);
const SHIFT_16 = BigInt(16);
const SHIFT_24 = BigInt(24);
const SHIFT_32 = BigInt(32);
const MASK_32 = (BigInt(1) << SHIFT_32) - BigInt(1);
const SIGN_BIT_32 = BigInt(1) << BigInt(31);
// Pre-computed -1 << 32 — used to sign-extend the high half of an int64.
const SIGN_EXTEND = ~MASK_32;

// TL constructor magics for the e2e.chain.* types we need. Three are stated
// in `/Users/kuzmenko/projects/tdlib/td/generate/scheme/e2e_api.tl`; the
// remaining eight are CRC32(normalized declaration) — computed once and
// hardcoded here. Verified by reproducing the three published magics
// (block / groupBroadcastNonceCommit / groupBroadcastNonceReveal).
export const TL_MAGIC = {
  // Declared explicitly in e2e_api.tl
  block: 0x639a3db6,
  groupBroadcastNonceCommit: 0xd1512ae7,
  groupBroadcastNonceReveal: 0x83f4f9d8,

  // Computed via CRC32(normalized line):
  groupParticipant: 0x18f3971f,
  groupState: 0x1ddc7584,
  sharedKey: 0x8a847e7f,
  changeNoop: 0xdeb4a41b,
  changeSetValue: 0xfe0139cc,
  changeSetGroupState: 0x2cf17146,
  changeSetSharedKey: 0x987a2158,
  stateProof: 0xd6b679e6
} as const;

export class TLReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  public position(): number {
    return this.offset;
  }

  public remaining(): number {
    return this.data.length - this.offset;
  }

  public eof(): boolean {
    return this.offset >= this.data.length;
  }

  public uint8(): number {
    this.requireAvailable(1);
    return this.data[this.offset++];
  }

  public uint32(): number {
    this.requireAvailable(4);
    // `<< 24` may make the result negative (sign bit); `>>> 0` reinterprets
    // as unsigned 32-bit, giving the correct value in [0, 2^32).
    const v = (
      this.data[this.offset] |
      (this.data[this.offset + 1] << 8) |
      (this.data[this.offset + 2] << 16) |
      (this.data[this.offset + 3] << 24)
    ) >>> 0;
    this.offset += 4;
    return v;
  }

  public int32(): number {
    this.requireAvailable(4);
    const v =
      this.data[this.offset] |
      (this.data[this.offset + 1] << 8) |
      (this.data[this.offset + 2] << 16) |
      (this.data[this.offset + 3] << 24);
    this.offset += 4;
    return v;
  }

  // Raw fixed-length bytes — no length prefix, no padding.
  public raw(length: number): Uint8Array {
    this.requireAvailable(length);
    const out = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  public int256(): Uint8Array {
    return this.raw(32);
  }

  public int512(): Uint8Array {
    return this.raw(64);
  }

  // Signed 64-bit "long" — TL stores as two little-endian int32 halves
  // (low first). Returned as BigInt since 2^53 isn't enough for user IDs.
  public int64(): bigint {
    // Read both halves as UNSIGNED uint32, then assemble: hi sign-extended
    // becomes the high bigint half, lo stays in the low 32 bits.
    const lo = BigInt(this.uint32());
    const hiUnsigned = BigInt(this.uint32());
    // sign-extend the high half: if its top bit is set, the int64 is negative
    const signed = (hiUnsigned & SIGN_BIT_32) !== ZERO_BIG ? hiUnsigned | SIGN_EXTEND : hiUnsigned;
    return (signed << SHIFT_32) | lo;
  }

  // Vector<T>: 4-byte length followed by N items (caller parses each).
  public vector<T>(parseItem: (r: TLReader) => T): T[] {
    const n = this.int32();
    if(n < 0) throw new Error(`TLReader: negative vector length ${n}`);
    const out: T[] = [];
    for(let i = 0; i < n; i++) out.push(parseItem(this));
    return out;
  }

  // Constructor-tag prefix. Throws if it doesn't match the expected magic.
  public expectMagic(expected: number): void {
    const got = this.int32() >>> 0;
    if((got >>> 0) !== (expected >>> 0)) {
      throw new Error(`TLReader: expected magic ${expected.toString(16)}, got ${got.toString(16)}`);
    }
  }

  // TL-style variable-length bytes — length-prefixed + 4-byte alignment.
  public bytes(): Uint8Array {
    this.requireAvailable(1);
    let length = this.data[this.offset++];
    let lenBytes = 1;
    if(length === 254) {
      this.requireAvailable(3);
      length = this.data[this.offset] | (this.data[this.offset + 1] << 8) | (this.data[this.offset + 2] << 16);
      this.offset += 3;
      lenBytes = 4;
    }
    const value = this.raw(length);
    const total = lenBytes + length;
    const pad = (4 - (total % 4)) % 4;
    this.offset += pad;
    return value;
  }

  private requireAvailable(n: number): void {
    if(this.offset + n > this.data.length) {
      throw new Error(`TLReader: out of data (need ${n}, have ${this.remaining()})`);
    }
  }
}

export class TLWriter {
  private buf: number[] = [];

  public uint8(value: number): this {
    this.buf.push(value & 0xff);
    return this;
  }

  public uint32(value: number): this {
    this.buf.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
    return this;
  }

  public int32(value: number): this {
    return this.uint32(value);
  }

  public raw(data: Uint8Array): this {
    for(let i = 0; i < data.length; i++) this.buf.push(data[i]);
    return this;
  }

  public int512(data: Uint8Array): this {
    if(data.length !== 64) throw new Error(`int512: must be 64 bytes, got ${data.length}`);
    return this.raw(data);
  }

  public int256(data: Uint8Array): this {
    if(data.length !== 32) throw new Error(`int256: must be 32 bytes, got ${data.length}`);
    return this.raw(data);
  }

  // 64-bit "long" — TL stores as two LE int32 halves (low first).
  public int64(value: bigint): this {
    const lo = Number(value & MASK_32);
    const hi = Number((value >> SHIFT_32) & MASK_32);
    this.uint32(lo >>> 0);
    this.uint32(hi >>> 0);
    return this;
  }

  public vector<T>(items: readonly T[], writeItem: (w: TLWriter, item: T) => void): this {
    this.int32(items.length);
    for(const item of items) writeItem(this, item);
    return this;
  }

  // Place a TL constructor magic at the current offset (uint32 LE).
  public magic(value: number): this {
    return this.uint32(value >>> 0);
  }

  // TL bytes — length-prefixed + zero-pad to 4-byte alignment.
  public bytes(data: Uint8Array): this {
    let lenBytes: number;
    if(data.length < 254) {
      this.buf.push(data.length);
      lenBytes = 1;
    } else {
      this.buf.push(254, data.length & 0xff, (data.length >>> 8) & 0xff, (data.length >>> 16) & 0xff);
      lenBytes = 4;
    }
    this.raw(data);
    const total = lenBytes + data.length;
    const pad = (4 - (total % 4)) % 4;
    for(let i = 0; i < pad; i++) this.buf.push(0);
    return this;
  }

  // Pad current buffer up to a 4-byte boundary (used by BitString serialization).
  public padToAlignment(): this {
    while(this.buf.length % 4 !== 0) this.buf.push(0);
    return this;
  }

  public finish(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ===== Server / local wire-format conversion =====
//
// Telegram's e2e server bumps the leading 4-byte TL constructor magic by +1
// for any block/broadcast it relays to clients (a cheap "tampering check" /
// version signal). Clients must subtract 1 before TL parsing, and add 1
// before sending bytes back. See tdlib/tde2e/td/e2e/Blockchain.cpp:735-762.

const GOOD_LOCAL_MAGICS = new Set<number>([
  TL_MAGIC.block,
  TL_MAGIC.groupBroadcastNonceCommit,
  TL_MAGIC.groupBroadcastNonceReveal
]);

function readMagicLE(buf: Uint8Array): number {
  return (buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24)) >>> 0;
}

function writeMagicLE(buf: Uint8Array, value: number): void {
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
}

// Strip the server's +1 magic bump. Returns a fresh copy.
// Tolerates bytes that are already in local form (returns a fresh copy unchanged).
// This makes the helper safe to call on inputs that may have skipped the server
// round-trip (e.g. test fixtures, or our own outbound bytes echoed back).
export function serverToLocal(serverBytes: Uint8Array): Uint8Array {
  if(serverBytes.length < 4) throw new Error('serverToLocal: too short');
  const magic = readMagicLE(serverBytes);
  if(GOOD_LOCAL_MAGICS.has(magic)) {
    // Already in local form — return a defensive copy without mutating magic.
    return new Uint8Array(serverBytes);
  }
  const out = new Uint8Array(serverBytes);
  writeMagicLE(out, (magic - 1) >>> 0);
  return out;
}

// Apply the server's +1 magic bump for outbound bytes. Returns a fresh copy.
export function localToServer(localBytes: Uint8Array): Uint8Array {
  if(localBytes.length < 4) throw new Error('localToServer: too short');
  const magic = readMagicLE(localBytes);
  if(!GOOD_LOCAL_MAGICS.has(magic)) {
    throw new Error(`localToServer: magic ${magic.toString(16)} is not a known local-format constructor`);
  }
  const out = new Uint8Array(localBytes);
  writeMagicLE(out, (magic + 1) >>> 0);
  return out;
}
