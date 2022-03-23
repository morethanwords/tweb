export default function bytesCmp(bytes1: number[] | Uint8Array, bytes2: number[] | Uint8Array) {
  const len = bytes1.length;
  if(len !== bytes2.length) {
    return false;
  }

  for(let i = 0; i < len; ++i) {
    if(bytes1[i] !== bytes2[i]) {
      return false;
    }
  }

  return true;
}
