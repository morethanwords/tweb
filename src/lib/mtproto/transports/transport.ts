export default abstract class MTTransport {
  constructor(protected dcID: number, protected url: string) {
    
  }

  abstract send: (data: Uint8Array/* , msgKey?: Uint8Array*/) => Promise<Uint8Array>;
}
