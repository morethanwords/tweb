import bufferConcats from '@helpers/bytes/bufferConcats';
import CryptoWorker from '@lib/crypto/cryptoMessagePort';

export class MessageKeyUtils {
  public static async getAesKeyIv(authKey: Uint8Array, msgKey: Uint8Array, incoming: boolean, v1?: boolean) {
    const x = incoming ? 8 : 0;
    if(v1) {
      const [sha1a, sha1b, sha1c, sha1d] = await Promise.all([
        CryptoWorker.invokeCrypto('sha1', bufferConcats(msgKey, authKey.subarray(x, x + 32))),
        CryptoWorker.invokeCrypto('sha1', bufferConcats(authKey.subarray(32 + x, 32 + x + 16), msgKey, authKey.subarray(48 + x, 48 + x + 16))),
        CryptoWorker.invokeCrypto('sha1', bufferConcats(authKey.subarray(64 + x, 64 + x + 32), msgKey)),
        CryptoWorker.invokeCrypto('sha1', bufferConcats(msgKey, authKey.subarray(96 + x, 96 + x + 32)))
      ]);

      const aesKey = bufferConcats(sha1a.subarray(0, 0 + 8), sha1b.subarray(8, 8 + 12), sha1c.subarray(4, 4 + 12));
      const aesIv = bufferConcats(sha1a.subarray(8, 8 + 12), sha1b.subarray(0, 0 + 8), sha1c.subarray(16, 16 + 4), sha1d.subarray(0, 0 + 8));
      return {aesKey, aesIv};
    }

    const sha2aText = new Uint8Array(52);
    const sha2bText = new Uint8Array(52);
    const promises: Array<Promise<Uint8Array>> = [];

    sha2aText.set(msgKey, 0);
    sha2aText.set(authKey.subarray(x, x + 36), 16);
    promises.push(CryptoWorker.invokeCrypto('sha256', sha2aText));

    sha2bText.set(authKey.subarray(40 + x, 40 + x + 36), 0);
    sha2bText.set(msgKey, 36);
    promises.push(CryptoWorker.invokeCrypto('sha256', sha2bText));

    const results = await Promise.all(promises);

    const aesKey = new Uint8Array(32);
    const aesIv = new Uint8Array(32);
    const sha2a = new Uint8Array(results[0]);
    const sha2b = new Uint8Array(results[1]);

    aesKey.set(sha2a.subarray(0, 8));
    aesKey.set(sha2b.subarray(8, 24), 8);
    aesKey.set(sha2a.subarray(24, 32), 24);

    aesIv.set(sha2b.subarray(0, 8));
    aesIv.set(sha2a.subarray(8, 24), 8);
    aesIv.set(sha2b.subarray(24, 32), 24);

    return {aesKey, aesIv};
  }

  public static async getMsgKey(authKey: Uint8Array, dataWithPadding: Uint8Array, incoming: boolean, v1?: boolean) {
    if(v1) {
      const hash = await CryptoWorker.invokeCrypto('sha1', dataWithPadding);
      return hash.subarray(4, 4 + 16);
    }

    const x = incoming ? 8 : 0;
    const msgKeyLargePlain = bufferConcats(authKey.subarray(88 + x, 88 + x + 32), dataWithPadding);

    const msgKeyLarge = await CryptoWorker.invokeCrypto('sha256', msgKeyLargePlain);
    const msgKey = new Uint8Array(msgKeyLarge).subarray(8, 24);
    return msgKey;
  }
}
