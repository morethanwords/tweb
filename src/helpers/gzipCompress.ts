import {gzipSync} from 'fflate';

export default function gzipCompress(bytes: Uint8Array): Uint8Array {
  return gzipSync(bytes);
}
