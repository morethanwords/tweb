/*
 * Minimal Node-`Buffer`-compatible view over `Uint8Array` — only the methods the
 * SCTP signaling port needs. tweb runs in the browser, where Node's `Buffer` is
 * absent; this lets `sctpSignaling.ts` stay a near-verbatim port.
 */

export default class ByteBuf extends Uint8Array {
  static alloc(size: number): ByteBuf {
    return new ByteBuf(size);
  }

  // not named `from` — that would clash with Uint8Array's static `from` signature.
  static wrap(source: ArrayLike<number> | ArrayBufferLike): ByteBuf {
    return new ByteBuf(source as ArrayLike<number>);
  }

  static concat(list: Uint8Array[]): ByteBuf {
    let total = 0;
    for(const item of list) {
      total += item.length;
    }

    const result = new ByteBuf(total);
    let offset = 0;
    for(const item of list) {
      result.set(item, offset);
      offset += item.length;
    }

    return result;
  }

  private view() {
    return new DataView(this.buffer, this.byteOffset, this.byteLength);
  }

  readUInt16BE(offset: number) {
    return this.view().getUint16(offset, false);
  }

  readUInt32BE(offset: number) {
    return this.view().getUint32(offset, false);
  }

  readUInt32LE(offset: number) {
    return this.view().getUint32(offset, true);
  }

  writeUInt16BE(value: number, offset: number) {
    this.view().setUint16(offset, value, false);
    return offset + 2;
  }

  writeUInt32BE(value: number, offset: number) {
    this.view().setUint32(offset, value, false);
    return offset + 4;
  }

  writeUInt32LE(value: number, offset: number) {
    this.view().setUint32(offset, value, true);
    return offset + 4;
  }

  // Node's Buffer.slice returns a VIEW (shared memory) — unlike Uint8Array.slice
  // which copies. The SCTP code relies on Buffer semantics.
  slice(start?: number, end?: number): ByteBuf {
    return this.subarray(start, end) as ByteBuf;
  }

  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length) {
    const sub = this.subarray(sourceStart, sourceEnd);
    target.set(sub, targetStart);
    return sub.length;
  }

  equals(other: Uint8Array) {
    if(this.length !== other.length) {
      return false;
    }

    for(let i = 0; i < this.length; ++i) {
      if(this[i] !== other[i]) {
        return false;
      }
    }

    return true;
  }
}
