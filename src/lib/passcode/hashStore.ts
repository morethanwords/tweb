import deferredPromise from '../../helpers/cancellablePromise';
import StaticUtilityClass from '../staticUtilityClass';


/**
 * Need to store the encryption hash in window client, shared worker, service worker (in memory only)
 */
export default class EncryptionPasscodeHashStore extends StaticUtilityClass {
  private static value: Uint8Array | null;
  private static deferred = deferredPromise<void>();

  public static async getValue() {
    if(this.deferred) await this.deferred;
    return this.value;
  }

  public static setValue(hash: Uint8Array | null) {
    this.value = hash;
    this.deferred?.resolve();
    this.deferred = undefined;
  }
}
