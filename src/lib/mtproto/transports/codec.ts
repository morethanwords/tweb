/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export interface Codec {
  tag: number;
  obfuscateTag: Uint8Array;

  encodePacket: (data: Uint8Array) => Uint8Array;
  readPacket: (data: Uint8Array) => Uint8Array;
}
