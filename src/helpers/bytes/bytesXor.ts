export default function bytesXor(bytes1: Uint8Array, bytes2: Uint8Array) {
  const len = bytes1.length;
  const bytes = new Uint8Array(len);

  for(let i = 0; i < len; ++i) {
    bytes[i] = bytes1[i] ^ bytes2[i];
  }

  return bytes;
}
