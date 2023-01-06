/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// import { bytesFromHex, addPadding } from "../../bin_utils";
import {Codec} from './codec';

class AbridgedPacketCodec implements Codec {
  public tag = 0xef;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    const len = data.byteLength >> 2;
    let header: Uint8Array;
    if(len < 127) {
      header = new Uint8Array([len]);
    } else { // Length: payload length, divided by four, and encoded as 3 length bytes (little endian)
      // header = new Uint8Array([0x7f, ...addPadding(bytesFromHex(len.toString(16)).reverse(), 3, true)/* .reverse() */]);
      header = new Uint8Array([0x7f, len & 0xFF, (len >> 8) & 0xFF, (len >> 16) & 0xFF]);
      // console.log('got nobody cause im braindead', header, len);
    }

    return header.concat(data);
    // return new Uint8Array([...header, ...data]);
  }

  public readPacket(data: Uint8Array) {
    let length = data[0];
    if(length >= 127) { // 0x7f
      length = data[1] | (data[2] << 8) | (data[3] << 16);

      return data.slice(4, length << 2 + 1); // need +1
    }

    return data.slice(1, length << 2 + 1); // need +1
  }
}

export default new AbridgedPacketCodec();
