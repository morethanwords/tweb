/**
 * Need to store the encryption hash in window client, shared worker, service worker (in memory only)
 */
export default class EncryptionPasscodeHashStore {
  private static value: Uint8Array = new Uint8Array();

  public static getValue() {
    return this.value;
  }

  public static setValue(hash: Uint8Array) {
    this.value = hash;
  }
}
