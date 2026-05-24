import readBlobAs from '@helpers/blob/readBlobAs';

export default function readBlobAsDataURL(blob: Blob) {
  return readBlobAs(blob, 'readAsDataURL');
}
