/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Awaited } from "../../types";
import type { aesEncryptSync, aesDecryptSync, sha256HashSync, sha1HashSync, bytesModPow, hash_pbkdf2, rsaEncrypt, pqPrimeFactorization, gzipUncompress } from "./crypto_utils";
import type { computeSRP } from "./srp";

export type CryptoMethods = {
  'sha1-hash': typeof sha1HashSync,
  'sha256-hash': typeof sha256HashSync,
  'pbkdf2': typeof hash_pbkdf2,
  'aes-encrypt': typeof aesEncryptSync,
  'aes-decrypt': typeof aesDecryptSync,
  'rsa-encrypt': typeof rsaEncrypt,
  'factorize': typeof pqPrimeFactorization,
  'mod-pow': typeof bytesModPow,
  'gzipUncompress': typeof gzipUncompress,
  'computeSRP': typeof computeSRP
};

export default abstract class CryptoWorkerMethods {
  abstract performTaskWorker<T>(task: string, ...args: any[]): Promise<T>;

  public invokeCrypto<Method extends keyof CryptoMethods>(method: Method, ...args: Parameters<CryptoMethods[typeof method]>): Promise<Awaited<ReturnType<CryptoMethods[typeof method]>>> {
    return this.performTaskWorker<Awaited<ReturnType<CryptoMethods[typeof method]>>>(method, ...args as any[]);
  }
}
