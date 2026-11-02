import SuperMessagePort from '@lib/superMessagePort';
import bytesCmpConstTime from '@helpers/bytes/bytesCmpConstTime';
import {EncryptionKeyBytes, exportEncryptionKey, importEncryptionKey} from '@lib/passcode/keyStore';


const IV_LENGTH = 12;

/**
 * The key of the local data: a crypto worker is a SharedWorker, and WebKit cannot clone a CryptoKey into one (the
 * call is dropped and never answers), so a key that crosses into one goes as its raw bytes - see `toLocalDataKeyBytes`
 */
export type LocalDataKey = CryptoKey | EncryptionKeyBytes;

const exportedKeys: WeakMap<CryptoKey, Promise<EncryptionKeyBytes>> = new WeakMap();
export function toLocalDataKeyBytes(key: CryptoKey) {
  let bytes = exportedKeys.get(key);
  if(!bytes) exportedKeys.set(key, bytes = exportEncryptionKey(key));
  return bytes;
}

let importedKey: {bytes: EncryptionKeyBytes, key: Promise<CryptoKey>};
function toCryptoKey(key: LocalDataKey): Promise<CryptoKey> | CryptoKey {
  if(!ArrayBuffer.isView(key)) return key;
  if(!importedKey || !bytesCmpConstTime(importedKey.bytes, key)) {
    importedKey = {bytes: key, key: importEncryptionKey(key)};
  }

  return importedKey.key;
}

export type EncryptLocalDataArgs = {
  key: LocalDataKey;
  data: Uint8Array;
};

export async function encryptLocalData({key, data}: EncryptLocalDataArgs) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv: iv as BufferSource},
    await toCryptoKey(key),
    data as BufferSource
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return new SuperMessagePort.TransferableResult(combined, [combined.buffer]);
}

export type DecryptLocalDataArgs = {
  key: LocalDataKey;
  encryptedData: Uint8Array;
};

export async function decryptLocalData({key, encryptedData}: DecryptLocalDataArgs) {
  const iv = encryptedData.slice(0, IV_LENGTH);
  const ciphertext = encryptedData.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv: iv as BufferSource},
    await toCryptoKey(key),
    ciphertext as BufferSource
  );

  return new SuperMessagePort.TransferableResult(decrypted, [decrypted])
}
