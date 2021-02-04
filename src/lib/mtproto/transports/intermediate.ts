import { Codec } from "./codec";

export class IntermediatePacketCodec implements Codec {
  public tag = 0xee;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    if((data.length % 4) !== 0) {
      console.error('Encode error!', data.length, data);
    }

    const len = data.length;
    const header = new Uint8Array(new Uint32Array([len]).buffer);

    //console.log('got nobody cause im braindead', header, len, /* data,  */data.buffer.byteLength === data.length);
    return header.concat(data);
  }

  public readPacket(data: Uint8Array) {
    const length = data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24);

    return data.slice(4, 4 + length);
  }
}

export default new IntermediatePacketCodec();
