import convertToUint8Array from './convertToUint8Array';

export default function bytesToWordss(input: Parameters<typeof convertToUint8Array>[0]) {
  const bytes = convertToUint8Array(input);

  const words: number[] = [];
  for(let i = 0, len = bytes.length; i < len; ++i) {
    words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  }

  return new Uint32Array(words);
}
