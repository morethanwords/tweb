
export class MTAuthKey {
  public wrappedBinding: boolean;
  public wrapBindPromise: Promise<any>;

  /**
   * @param key uint8[256]
   * @param id little-endian
   * @param expiresAt timestamp
   */
  constructor(
    public key: Uint8Array,
    public id: Uint8Array,
    public expiresAt?: number
  ) {
  }
}
