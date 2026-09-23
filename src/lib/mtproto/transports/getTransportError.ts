/**
 * A transport error comes instead of a packet, as a bare negative int32:
 * -404 the auth key is unknown, -429 too many connections, -444 a wrong DC.
 */
export default function getTransportError(packet: Uint8Array) {
  if(packet.byteLength === 4) {
    return new DataView(packet.buffer, packet.byteOffset, 4).getInt32(0, true);
  }
}
