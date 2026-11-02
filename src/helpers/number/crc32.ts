/**
 * Reflected CRC-32 (init 0xFFFFFFFF, reflected input/output, final XOR 0xFFFFFFFF) in its two polynomials:
 * - `crc32`: the standard IEEE 802.3 one (0xEDB88320), bit-identical to tdesktop's `base::crc32` (see
 *   `Telegram/SourceFiles/base/crc32hash.cpp`);
 * - `crc32c`: Castagnoli (0x82F63B78), the checksum of SCTP packets and of TON's bags of cells.
 */

function makeTable(polynomial: number) {
  const table = new Uint32Array(256);
  for(let i = 0; i < 256; i++) {
    let c = i;
    for(let j = 0; j < 8; j++) {
      c = (c & 1) ? (polynomial ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

function run(table: Uint32Array, data: Uint8Array) {
  let crc = 0xffffffff;
  for(let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc & 0xff) ^ data[i]];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = makeTable(0xedb88320);
let crc32cTable: Uint32Array;

export default function crc32(data: Uint8Array): number {
  return run(CRC32_TABLE, data);
}

export function crc32c(data: Uint8Array): number {
  return run(crc32cTable ??= makeTable(0x82f63b78), data);
}
