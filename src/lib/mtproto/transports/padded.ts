import { nextRandomInt } from "../../bin_utils";
import { IntermediatePacketCodec } from "./intermediate";
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

export default new PaddedIntermediatePacketCodec();