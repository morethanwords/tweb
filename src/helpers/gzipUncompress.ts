// export function gzipUncompress(bytes: ArrayBuffer, toString: true): string;

import {decompressSync} from 'fflate';
// import dT from '@helpers/dT';

// export function gzipUncompress(bytes: ArrayBuffer, toString?: false): Uint8Array;
export default function gzipUncompress(bytes: ArrayBuffer, toString?: boolean): string | Uint8Array {
  // console.log(dT(), 'Gzip uncompress start');
  const result = decompressSync(new Uint8Array(bytes));
  // console.log(dT(), 'Gzip uncompress finish'/* , result */);
  return toString ? new TextDecoder().decode(result) : result;
}
