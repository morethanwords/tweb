export default abstract class MTTransport {
  constructor(protected dcId: number, protected url: string) {
    
  }

  abstract send: (data: Uint8Array) => Promise<Uint8Array>;
}
