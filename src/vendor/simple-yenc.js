/*
  https://github.com/eshaz/simple-yenc
  Copyright 2021-2023 Ethan Halsall, MIT License
*/

/* See https://gcc.gnu.org/git/?p=gcc.git;a=blob_plain;f=libiberty/crc32.c;hb=refs/heads/master */
const crc32 = (buf, init = 0xffffffff, poly = 0x04c11db7) => {
    const crc32Table = new Int32Array(256);
    let i,
      j,
      c,
      crc = init;
  
    for (i = 0; i < 256; i++) {
      for (c = i << 24, j = 8; j > 0; --j)
        c = c & 0x80000000 ? (c << 1) ^ poly : c << 1;
      crc32Table[i] = c;
    }
  
    for (i = 0; i < buf.length; i++)
      crc = (crc << 8) ^ crc32Table[((crc >> 24) ^ buf[i]) & 255];
  
    return crc;
};

const decode = (string, crc32Function = crc32) => {
const stringToBytes = (string) =>
    new Uint8Array(string.length / 2).map((_, i) =>
    parseInt(string.substring(i * 2, (i + 1) * 2), 16),
    );

const hexToUint8 = (string) => stringToBytes(string)[0];

const hexToInt32_LE = (string) =>
    new DataView(stringToBytes(string).buffer).getInt32(0, true);

const htmlCodeOverrides = new Map();
[
    ,
    8364,
    ,
    8218,
    402,
    8222,
    8230,
    8224,
    8225,
    710,
    8240,
    352,
    8249,
    338,
    ,
    381,
    ,
    ,
    8216,
    8217,
    8220,
    8221,
    8226,
    8211,
    8212,
    732,
    8482,
    353,
    8250,
    339,
    ,
    382,
    376,
].forEach((k, v) => htmlCodeOverrides.set(k, v));

const output = new Uint8Array(string.length);

let escaped = false,
    byteIndex = 0,
    byte,
    offset = 42, // default yEnc offset
    isDynEncode = string.length > 13 && string.substring(0, 9) === "dynEncode",
    dynEncodeVersion,
    startIdx = 0,
    crc;

if (isDynEncode) {
    startIdx = 9 + 2;
    dynEncodeVersion = hexToUint8(string.substring(9, startIdx));
    if (dynEncodeVersion <= 1) {
    startIdx += 2;
    offset = hexToUint8(string.substring(11, startIdx));
    }
    if (dynEncodeVersion === 1) {
    startIdx += 8;
    crc = hexToInt32_LE(string.substring(13, startIdx));
    }
}

const offsetReverse = 256 - offset;

for (let i = startIdx; i < string.length; i++) {
    byte = string.charCodeAt(i);

    if (byte === 61 && !escaped) {
    escaped = true;
    continue;
    }

    // work around for encoded strings that are UTF escaped
    if (
    byte === 92 && // /
    i < string.length - 5 &&
    isDynEncode
    ) {
    const secondCharacter = string.charCodeAt(i + 1);

    if (
        secondCharacter === 117 || // u
        secondCharacter === 85 //     U
    ) {
        byte = parseInt(string.substring(i + 2, i + 6), 16);
        i += 5;
    }
    }

    if (byte > 255) {
    const htmlOverride = htmlCodeOverrides.get(byte);
    if (htmlOverride) byte = htmlOverride + 127;
    }

    if (escaped) {
    escaped = false;
    byte -= 64;
    }

    output[byteIndex++] =
    byte < offset && byte > 0 ? byte + offsetReverse : byte - offset;
}

const results = output.subarray(0, byteIndex);
if (isDynEncode && dynEncodeVersion === 1) {
    const actualCrc = crc32Function(results);
    if (actualCrc !== crc) {
    const error = "Decode failed crc32 validation";
    console.error(
        "`simple-yenc`\n",
        error + "\n",
        "Expected: " + crc + "; Got: " + actualCrc + "\n",
        "Visit https://github.com/eshaz/simple-yenc for more information",
    );
    throw new Error(error);
    }
}

return results;
};

export { decode, crc32 };