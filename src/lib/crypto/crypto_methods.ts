import { convertToArrayBuffer } from "../../helpers/bytes";
import type { InputCheckPasswordSRP } from "../../layer";
import { aesEncryptSync, aesDecryptSync, sha256HashSync, sha1HashSync, bytesModPow } from "./crypto_utils";

export default abstract class CryptoWorkerMethods {
  abstract performTaskWorker<T>(task: string, ...args: any[]): Promise<T>;

  public sha1Hash(bytes: Parameters<typeof sha1HashSync>[0]): Promise<Uint8Array> {
    return this.performTaskWorker<Uint8Array>('sha1-hash', bytes);
  }

  public sha256Hash(bytes: Parameters<typeof sha256HashSync>[0]) {
    return this.performTaskWorker<number[]>('sha256-hash', bytes);
  }

  public pbkdf2(buffer: Uint8Array, salt: Uint8Array, iterations: number) {
    return this.performTaskWorker<ArrayBuffer>('pbkdf2', buffer, salt, iterations);
  }

  public aesEncrypt(bytes: Parameters<typeof aesEncryptSync>[0], 
    keyBytes: Parameters<typeof aesEncryptSync>[1], 
    ivBytes: Parameters<typeof aesEncryptSync>[2]) {
    return this.performTaskWorker<ReturnType<typeof aesEncryptSync>>('aes-encrypt', convertToArrayBuffer(bytes), 
      convertToArrayBuffer(keyBytes), convertToArrayBuffer(ivBytes));
  }

  public aesDecrypt(encryptedBytes: Parameters<typeof aesDecryptSync>[0], 
    keyBytes: Parameters<typeof aesDecryptSync>[1], 
    ivBytes: Parameters<typeof aesDecryptSync>[2]): Promise<ArrayBuffer> {
    return this.performTaskWorker<ArrayBuffer>('aes-decrypt', 
      encryptedBytes, keyBytes, ivBytes)
      .then(bytes => convertToArrayBuffer(bytes));
  }

  public rsaEncrypt(publicKey: {modulus: string, exponent: string}, bytes: any): Promise<number[]> {
    return this.performTaskWorker<number[]>('rsa-encrypt', publicKey, bytes);
  }

  public factorize(bytes: Uint8Array) {
    return this.performTaskWorker<[number[], number[], number]>('factorize', [...bytes]);
  }

  public modPow(x: Parameters<typeof bytesModPow>[0], y: Parameters<typeof bytesModPow>[1], m: Parameters<typeof bytesModPow>[2]) {
    return this.performTaskWorker<ReturnType<typeof bytesModPow>>('mod-pow', x, y, m);
  }

  public gzipUncompress<T>(bytes: ArrayBuffer, toString?: boolean) {
    return this.performTaskWorker<T>('gzipUncompress', bytes, toString);
  }

  public computeSRP(password: string, state: any, isNew = false): Promise<InputCheckPasswordSRP> {
    return this.performTaskWorker('computeSRP', password, state, isNew);
  }
}
