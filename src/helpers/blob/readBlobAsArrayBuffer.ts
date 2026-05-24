import readBlobAs from '@helpers/blob/readBlobAs';

export default function readBlobAsArrayBuffer(blob: Blob) {
  return readBlobAs(blob, 'readAsArrayBuffer');
}
