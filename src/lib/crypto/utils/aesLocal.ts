const SALT_LENGTH = 16;
const IV_LENGTH = 12;

async function deriveKey(passcodeHash: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', passcodeHash, {name: 'PBKDF2'}, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256'},
    keyMaterial, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']
  );
}

export async function encryptLocalData(passcodeHash: Uint8Array, data: string) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(passcodeHash, salt);
  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    key,
    encoder.encode(data)
  );

  /**
   * Have different salt and IV per user to prevent precomputed attacks
   */
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  return combined;
}

export async function decryptLocalData(passcodeHash: Uint8Array, encryptedData: ArrayBuffer) {
  const data = new Uint8Array(encryptedData);
  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, IV_LENGTH + SALT_LENGTH);
  const ciphertext = data.slice(IV_LENGTH + SALT_LENGTH);

  const key = await deriveKey(passcodeHash, salt);
  const decrypted = await crypto.subtle.decrypt(
    {name: 'AES-GCM', iv},
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}
