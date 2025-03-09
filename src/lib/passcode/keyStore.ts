import deferredPromise from '../../helpers/cancellablePromise';
import StaticUtilityClass from '../staticUtilityClass';


export default class EncryptionKeyStore extends StaticUtilityClass {
  private static key: CryptoKey | null = null;

  private static deferred = deferredPromise<void>();

  public static async get() {
    if(this.deferred) await this.deferred;
    return this.key;
  }

  public static save(key: CryptoKey | null) {
    this.key = key;
    this.deferred?.resolve();
    this.deferred = undefined;
  }

  /**
   * Mainly for Service Worker
   */
  public static resetDeferred() {
    this.key = null;
    this.deferred = deferredPromise();
  }
}
