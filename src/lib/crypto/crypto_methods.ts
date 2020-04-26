import { convertToArrayBuffer, convertToByteArray } from "../bin_utils";

export default abstract class CryptoWorkerMethods {
  abstract performTaskWorker<T>(task: string, ...args: any[]): Promise<T>;

  public sha1Hash(bytes: number[] | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
    return this.performTaskWorker<Uint8Array>('sha1-hash', bytes);
  }

  public sha256Hash(bytes: any) {
    return this.performTaskWorker<number[]>('sha256-hash', bytes);
  }

  public pbkdf2(buffer: Uint8Array, salt: Uint8Array, iterations: number) {
    return this.performTaskWorker<ArrayBuffer>('pbkdf2', buffer, salt, iterations);
  }

  public aesEncrypt(bytes: any, keyBytes: any, ivBytes: any) {
    return this.performTaskWorker<ArrayBuffer>('aes-encrypt', convertToArrayBuffer(bytes), 
      convertToArrayBuffer(keyBytes), convertToArrayBuffer(ivBytes));
  }

  public aesDecrypt(encryptedBytes: any, keyBytes: any, ivBytes: any): Promise<ArrayBuffer> {
    return this.performTaskWorker<ArrayBuffer>('aes-decrypt', 
      encryptedBytes, keyBytes, ivBytes)
      .then(bytes => convertToArrayBuffer(bytes));
  }

  public rsaEncrypt(publicKey: {modulus: string, exponent: string}, bytes: any): Promise<number[]> {
    return this.performTaskWorker<number[]>('rsa-encrypt', publicKey, bytes);
  }

  public factorize(bytes: any) {
    bytes = convertToByteArray(bytes);

    return this.performTaskWorker<[number[], number[], number]>('factorize', bytes);
  }

  public modPow(x: any, y: any, m: any) {
    return this.performTaskWorker<number[]>('mod-pow', x, y, m);
  }

  public gzipUncompress<T>(bytes: ArrayBuffer, toString?: boolean) {
    return this.performTaskWorker<T>('unzip', bytes, toString);
  }
}