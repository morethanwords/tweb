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

export function createSvgFromBytes(bytes: Uint8Array, width = 512, height = 512) {
  const d = getPathFromBytes(bytes);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttributeNS(null, 'viewBox', `0 0 ${width} ${height}`);

  const path = document.createElementNS(ns, 'path');
  path.setAttributeNS(null, 'd', d);
  svg.append(path);

  return {svg, path};
}
