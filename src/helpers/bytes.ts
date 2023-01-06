/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

export {};

/* export function bytesToArrayBuffer(b: number[]) {
  return (new Uint8Array(b)).buffer;
}

export function convertToArrayBuffer(bytes: any | ArrayBuffer | Uint8Array) {
  // Be careful with converting subarrays!!
  if(bytes instanceof ArrayBuffer) {
    return bytes;
  }
  if(bytes.buffer !== undefined &&
    bytes.buffer.byteLength === bytes.length * bytes.BYTES_PER_ELEMENT) {
    return bytes.buffer;
  }
  return bytesToArrayBuffer(bytes);
} */

/* export function bytesFromArrayBuffer(buffer: ArrayBuffer) {
  const len = buffer.byteLength;
  const byteView = new Uint8Array(buffer);
  const bytes: number[] = [];

  for(let i = 0; i < len; ++i) {
    bytes[i] = byteView[i];
  }

  return bytes;
}

export function bufferConcat(buffer1: any, buffer2: any) {
  const l1 = buffer1.byteLength || buffer1.length;
  const l2 = buffer2.byteLength || buffer2.length;
  const tmp = new Uint8Array(l1 + l2);
  tmp.set(buffer1 instanceof ArrayBuffer ? new Uint8Array(buffer1) : buffer1, 0);
  tmp.set(buffer2 instanceof ArrayBuffer ? new Uint8Array(buffer2) : buffer2, l1);

  return tmp.buffer;
} */

// * https://stackoverflow.com/a/52827031
/* export const isBigEndian = (() => {
  const array = new Uint8Array(4);
  const view = new Uint32Array(array.buffer);
  return !((view[0] = 1) & array[0]);
})(); */
