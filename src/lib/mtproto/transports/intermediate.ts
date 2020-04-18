import { nextRandomInt } from "../../bin_utils";
import { Codec } from "./codec";

class IntermediatePacketCodec implements Codec {
  public tag = 0xee;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    let len = data.byteLength;
    let header = new Uint8Array(new Uint32Array([len]).buffer);

    return header.concat(data);
  }

  public readPacket(data: Uint8Array) {
    let length = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);

    return data.slice(4, 4 + length);
  }
}

/*  Data packets are aligned to 4bytes. This codec adds random bytes of size
    from 0 to 3 bytes, which are ignored by decoder. */
class PaddedIntermediatePacketCodec extends IntermediatePacketCodec {
  public tag = 0xdd;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    let padding = new Uint8Array(nextRandomInt(3)).randomize();
    let len = data.byteLength + padding.byteLength;

    let header = new Uint8Array(new Uint32Array([len]).buffer);
    console.log('encodePacket', padding, len, data, header);
    
    return header.concat(data, padding);
  }

  public readPacket(data: Uint8Array) {
    let padLength = data.byteLength % 4;
    if(padLength > 0) {
      return data.slice(4, -padLength);
    }

    return data.slice(4);
  }
}

export default new IntermediatePacketCodec();
//export default new PaddedIntermediatePacketCodec();
