/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {WebPDecoder} from '../../vendor/libwebp-0.2.0';
import {encode} from 'fast-png';

export function webp2png(data: Uint8Array) {
  const decoder = new WebPDecoder();
  const config: any = decoder.WebPDecoderConfig;
  const buffer = config.j || config.output;
  const bitstream = config.input;

  decoder.WebPInitDecoderConfig(config);
  decoder.WebPGetFeatures(data, data.length, bitstream);

  /** MODE_RGBA = 1 MODE_ARGB = 4, */
  buffer.J = 1;

  let status;
  try {
    status = decoder.WebPDecode(data, data.length, config);
  } catch(e) {
    status = e;
  }

  if(status === 0) {
    const rgbaData = buffer.Jb;
    const pngData = encode({
      data: rgbaData,
      width: buffer.width,
      height: buffer.height,
      channels: 4,
      depth: 8
    });

    return {status, bytes: pngData};
  }

  return {status, bytes: data};
}

export function webp2pngAsBlob(data: Uint8Array) {
  const {status, bytes} = webp2png(data);
  return new Blob([bytes], {type: status === 0 ? 'image/png' : 'image/webp'});
}
