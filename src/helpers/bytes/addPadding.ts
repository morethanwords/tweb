import randomize from '../array/randomize';
import bufferConcats from './bufferConcats';

export default function addPadding<T extends number[] | ArrayBuffer | Uint8Array>(
  bytes: T,
  blockSize: number = 16,
  zeroes?: boolean,
  blockSizeAsTotalLength = false,
  prepend = false
): T {
  const len = (bytes as ArrayBuffer).byteLength || (bytes as Uint8Array).length;
  const needPadding = blockSizeAsTotalLength ? blockSize - len : blockSize - (len % blockSize);
  if(needPadding > 0 && needPadding < blockSize) {
    // //console.log('addPadding()', len, blockSize, needPadding);
    const padding = new Uint8Array(needPadding);
    if(zeroes) {
      for(let i = 0; i < needPadding; ++i) {
        padding[i] = 0;
      }
    } else {
      randomize(padding);
    }

    if(bytes instanceof ArrayBuffer) {
      return (prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding)).buffer as T;
    } else if(bytes instanceof Uint8Array) {
      return (prepend ? bufferConcats(padding, bytes) : bufferConcats(bytes, padding)) as T;
    } else {
      // @ts-ignore
      return (prepend ? [...padding].concat(bytes) : bytes.concat([...padding])) as T;
    }
  }

  return bytes;
}
