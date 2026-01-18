import ctx from '@environment/ctx';

export default function bytesToHex(bytes: ArrayLike<number>, joiner = '', uppercase?: boolean) {
  const length = bytes.length;
  const arr: string[] = new Array(length);
  for(let i = 0; i < length; ++i) {
    arr[i] = (bytes[i] < 16 ? '0' : '') + (bytes[i] || 0).toString(16);
  }

  const joined = arr.join(joiner);
  return uppercase ? joined.toUpperCase() : joined;
}

(ctx as any).bytesToHex = bytesToHex;
