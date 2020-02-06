export interface Codec {
  tag?: number;
  obfuscateTag?: Uint8Array;

  encodePacket: (data: Uint8Array) => Uint8Array;
  readPacket: (data: Uint8Array) => Uint8Array;
}
