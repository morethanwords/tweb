import deferredPromise from '../../helpers/cancellablePromise';
import StaticUtilityClass from '../staticUtilityClass';


export default class EncryptionPasscodeHashStore extends StaticUtilityClass {
  private static hash: Uint8Array | null;
  private static salt: Uint8Array | null;

  private static deferred = deferredPromise<void>();

  public static async getHash() {
    if(this.deferred) await this.deferred;
    return this.hash;
  }
  public static async getSalt() {
    if(this.deferred) await this.deferred;
    return this.salt;
  }

  public static setHashAndSalt(values: {hash: Uint8Array, salt: Uint8Array} | null) {
    this.hash = values?.hash || null;
    this.salt = values?.salt || null;
    this.deferred?.resolve();
    this.deferred = undefined;
  }
}
