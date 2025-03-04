import compareUint8Arrays from '../../../helpers/bytes/compareUint8Arrays';

import StaticUtilityClass from '../../staticUtilityClass';


const IV_LENGTH = 12;


type SaltedDerivedKeyCacheEntry = {
  salt: Uint8Array;
  operationPromise: Promise<CryptoKey>;
};

class SaltedDerivedKeyCache extends StaticUtilityClass {
  private static cache: SaltedDerivedKeyCacheEntry[] = [];

  public static requestOperation(salt: Uint8Array, operation: () => Promise<CryptoKey>) {
    const entry = this.cache.find(entry => compareUint8Arrays(salt, entry.salt));

    if(entry) return entry.operationPromise;

    const newEntry = {
      salt: new Uint8Array(salt),
      operationPromise: operation()
    };
    this.cache.push(newEntry);

    return newEntry.operationPromise;
  }
}


async function deriveKey(passcodeHash: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', passcodeHash, {name: 'PBKDF2'}, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
    keyMaterial, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']
  );
}

export type EncryptLocalDataArgs = {
  passcodeHash: Uint8Array;
  salt: Uint8Array;
  data: Uint8Array;
};

export async function encryptLocalData({passcodeHash, salt, data}: EncryptLocalDataArgs) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await SaltedDerivedKeyCache.requestOperation(salt, () => deriveKey(passcodeHash, salt));
  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    data
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return combined;
}


export type DecryptLocalDataArgs = {
  passcodeHash: Uint8Array;
  salt: Uint8Array;
  encryptedData: Uint8Array;
};

export async function decryptLocalData({passcodeHash, salt, encryptedData}: DecryptLocalDataArgs) {
  const iv = encryptedData.slice(0, IV_LENGTH);
  const ciphertext = encryptedData.slice(IV_LENGTH);

  const key = await SaltedDerivedKeyCache.requestOperation(salt, () => deriveKey(passcodeHash, salt));
  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
