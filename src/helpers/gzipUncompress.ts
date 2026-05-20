import {Decompress, decompressSync} from 'fflate';

export default function gzipUncompress(bytes: ArrayBuffer, toString?: boolean, maxSize?: number): string | Uint8Array {
  let result: Uint8Array;

  if(maxSize === undefined) {
    result = decompressSync(new Uint8Array(bytes));
  } else {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let exceeded = false;
    const decompressor = new Decompress((chunk) => {
      if(exceeded) return;
      total += chunk.length;
      if(total > maxSize) {
        exceeded = true;
        return;
      }
      chunks.push(chunk);
    });
    decompressor.push(new Uint8Array(bytes), true);
    if(exceeded) throw new Error('GZIP_MAX_SIZE_EXCEEDED');

    result = new Uint8Array(total);
    let offset = 0;
    for(const c of chunks) {
      result.set(c, offset);
      offset += c.length;
    }
  }

  return toString ? new TextDecoder().decode(result) : result;
}
