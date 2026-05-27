import readBlobAs from '@helpers/blob/readBlobAs';

export default function readBlobAsText(blob: Blob) {
  return readBlobAs(blob, 'readAsText');
}
