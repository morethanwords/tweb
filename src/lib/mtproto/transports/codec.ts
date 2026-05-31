export interface Codec {
  tag: number;
  obfuscateTag: Uint8Array;

  encodePacket: (data: Uint8Array) => Uint8Array;
  readPacket: (data: Uint8Array) => Uint8Array;

  /**
   * Total byte length of the first packet at the head of `data` (framing header +
   * payload [+ padding]), or -1 if more bytes are needed to determine it. Used to
   * reframe a raw TCP byte stream into discrete MTProto packets (see TcpObfuscated
   * stream mode). Over Telegram's WebSocket each message is already one packet, so
   * this is only exercised by the raw-TCP bridge.
   */
  readPacketLength?: (data: Uint8Array) => number;
}
