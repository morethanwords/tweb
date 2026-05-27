import readBlobAsArrayBuffer from '@helpers/blob/readBlobAsArrayBuffer';

export default function readBlobAsUint8Array(blob: Blob) {
  return readBlobAsArrayBuffer(blob).then((buffer) => new Uint8Array(buffer));
}
