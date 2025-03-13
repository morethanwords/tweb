import SuperMessagePort from '../../mtproto/superMessagePort';


const IV_LENGTH = 12;

export type EncryptLocalDataArgs = {
  key: CryptoKey;
  data: Uint8Array;
};

export async function encryptLocalData({key, data}: EncryptLocalDataArgs) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    data
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return new SuperMessagePort.TransferableResult(combined, [combined.buffer]);
}

export type DecryptLocalDataArgs = {
  key: CryptoKey;
  encryptedData: Uint8Array;
};

export async function decryptLocalData({key, encryptedData}: DecryptLocalDataArgs) {
  const iv = encryptedData.slice(0, IV_LENGTH);
  const ciphertext = encryptedData.slice(IV_LENGTH);

  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    ciphertext
  );

  return new SuperMessagePort.TransferableResult(decrypted, [decrypted])
}
