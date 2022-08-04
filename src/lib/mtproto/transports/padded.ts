/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import randomize from '../../../helpers/array/randomize';
import {nextRandomUint} from '../../../helpers/random';
import {IntermediatePacketCodec} from './intermediate';
/*  Data packets are aligned to 4bytes. This codec adds random bytes of size
  from 0 to 3 bytes, which are ignored by decoder. */
class PaddedIntermediatePacketCodec extends IntermediatePacketCodec {
  public tag = 0xdd;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    const padding = randomize(new Uint8Array(nextRandomUint(8) % 3));
    const len = data.byteLength + padding.byteLength;

    const header = new Uint8Array(new Uint32Array([len]).buffer);
    console.log('encodePacket', padding, len, data, header);

    return header.concat(data, padding);
  }

  public readPacket(data: Uint8Array) {
    const padLength = data.byteLength % 4;
    if(padLength > 0) {
      return data.slice(4, -padLength);
    }

    return data.slice(4);
  }
}

export default new PaddedIntermediatePacketCodec();
