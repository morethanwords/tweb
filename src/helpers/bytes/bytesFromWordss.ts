export default function bytesFromWordss(input: Uint32Array) {
  const o = new Uint8Array(input.byteLength);
  for(let i = 0, length = input.length * 4; i < length; ++i) {
    o[i] = ((input[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
  }

  return o;
}
