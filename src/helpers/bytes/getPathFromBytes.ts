/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/**
  * https://core.telegram.org/api/files#vector-thumbnails
  */
export default function getPathFromBytes(bytes: Uint8Array) {
  const lookup = 'AACAAAAHAAALMAAAQASTAVAAAZaacaaaahaaalmaaaqastava.az0123456789-,';

  let path = 'M';
  for(let i = 0, length = bytes.length; i < length; ++i) {
    const num = bytes[i];

    if(num >= (128 + 64)) {
      path += lookup[num - 128 - 64];
    } else {
      if(num >= 128) {
        path += ',';
      } else if(num >= 64) {
        path += '-';
      }
      path += '' + (num & 63);
    }
  }
  path += 'z';

  return path;
}
