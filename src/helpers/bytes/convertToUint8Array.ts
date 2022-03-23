export default function convertToUint8Array(bytes: Uint8Array | ArrayBuffer | number[] | string): Uint8Array {
  if(bytes instanceof Uint8Array) {
    return bytes;
  } else if(typeof(bytes) === 'string') {
    return new TextEncoder().encode(bytes);
  }

  return new Uint8Array(bytes);
}
