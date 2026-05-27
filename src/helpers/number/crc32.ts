/**
 * Standard IEEE 802.3 CRC32 (poly 0xEDB88320, init 0xFFFFFFFF, reflected input/output,
 * final XOR 0xFFFFFFFF). Bit-identical to tdesktop's `base::crc32` (see
 * `Telegram/SourceFiles/base/crc32hash.cpp`).
 */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for(let i = 0; i < 256; i++) {
    let c = i;
    for(let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export default function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for(let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc & 0xff) ^ data[i]];
  }
  return (crc ^ 0xffffffff) >>> 0;
}
