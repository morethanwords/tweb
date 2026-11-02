import deferredPromise from '@helpers/cancellablePromise';
import StaticUtilityClass from '@lib/staticUtilityClass';

/**
 * The key as it crosses the MTProto worker's port: WebKit cannot clone a CryptoKey into a SharedWorker or out of
 * one - the message is dropped where it arrives ('messageerror'), and whoever waits for its answer waits forever
 * (Safari stayed on the lock screen after the right passcode) - so it goes over as its raw bytes
 */
export type EncryptionKeyBytes = Uint8Array;

export async function exportEncryptionKey(key: CryptoKey): Promise<EncryptionKeyBytes> {
  return key ? new Uint8Array(await crypto.subtle.exportKey('raw', key)) : null;
}

export async function importEncryptionKey(bytes: EncryptionKeyBytes): Promise<CryptoKey> {
  return bytes ? crypto.subtle.importKey('raw', bytes as BufferSource, {name: 'AES-GCM'}, true, ['encrypt', 'decrypt']) : null;
}


export default class EncryptionKeyStore extends StaticUtilityClass {
  private static key: CryptoKey | null = null;

  private static deferred = deferredPromise<void>();

  public static async get() {
    if(this.deferred) await this.deferred;
    return this.key;
  }

  /**
   * Whatever is in memory right now, `null` while nothing has been saved yet
   */
  public static getUndeferred() {
    return this.key;
  }

  public static async getAsBase64() {
    const key = await this.get();
    if(!key) return null;

    const base64Key = btoa(String.fromCharCode(...await exportEncryptionKey(key)));

    return base64Key;
  }

  public static save(key?: CryptoKey) {
    this.key = key || null;
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
