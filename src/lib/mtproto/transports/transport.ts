export default abstract class MTTransport {
  abstract send: (data: Uint8Array) => Promise<Uint8Array>;
}
