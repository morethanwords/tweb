import {MOUNT_CLASS_TO} from '@config/debug';

export default function bytesToBase64(bytes: number[] | Uint8Array) {
  let mod3: number;
  let result = '';

  for(let nLen = bytes.length, nUint24 = 0, nIdx = 0; nIdx < nLen; ++nIdx) {
    mod3 = nIdx % 3;
    nUint24 |= bytes[nIdx] << (16 >>> mod3 & 24);
    if(mod3 === 2 || nLen - nIdx === 1) {
      result += String.fromCharCode(
        uint6ToBase64(nUint24 >>> 18 & 63),
        uint6ToBase64(nUint24 >>> 12 & 63),
        uint6ToBase64(nUint24 >>> 6 & 63),
        uint6ToBase64(nUint24 & 63)
      );
      nUint24 = 0;
    }
  }

  // * the padding is what the length leaves over: a zero tail of real data is still 'A'
  const rest = bytes.length % 3;
  return rest ? result.slice(0, rest - 3) + (rest === 1 ? '==' : '=') : result;
}

export function uint6ToBase64(nUint6: number) {
  return nUint6 < 26 ?
    nUint6 + 65 :
    nUint6 < 52 ?
      nUint6 + 71 :
      nUint6 < 62 ?
        nUint6 - 4 :
        nUint6 === 62 ?
          43 :
          nUint6 === 63 ?
            47 :
            65;
}

MOUNT_CLASS_TO.bytesToBase64 = bytesToBase64;
