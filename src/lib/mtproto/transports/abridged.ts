import { bytesFromHex, addPadding } from "../../bin_utils";

class AbridgedPacketCodec {
  public tag = 0xef;
  public obfuscateTag = new Uint8Array([this.tag, this.tag, this.tag, this.tag]);

  public encodePacket(data: Uint8Array) {
    let len = data.byteLength >> 2;
    let header: Uint8Array;
    if(len < 127) {
      header = new Uint8Array([len]);
    } else {
      header = new Uint8Array([0x7f, ...addPadding(bytesFromHex(len.toString(16)).reverse(), 3, true)/* .reverse() */]);
      console.log('got nobody cause im braindead', header, len);
    }
    
    return new Uint8Array([...header, ...data]);
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
