import CryptoWorker from '@lib/crypto/cryptoMessagePort';

export class MTAuthKey {
  /**
   * The freshest salt known for a temporary key — whichever networker picks
   * the key up next starts from it
   */
  public serverSalt?: Uint8Array;
  /**
   * The server has forgotten a temporary key (-404) or its binding
   * (AUTH_KEY_PERM_EMPTY), so nothing can be sent over it anymore
   */
  public invalid?: boolean;

  /**
   * @param key uint8[256]
   * @param id little-endian
   * @param expiresAt server timestamp, temporary keys only
   */
  constructor(
    public key: Uint8Array,
    public id: Uint8Array,
    public expiresAt?: number
  ) {
  }

  /**
   * A key identified the usual way: by the lower 64 bits of its SHA1
   */
  public static async fromKey(key: Uint8Array) {
    return new MTAuthKey(key, (await CryptoWorker.invokeCrypto('sha1', key)).slice(-8));
  }
}
