import {SALT_LENGTH} from './constants';

const ITERATIONS = 100000;

export async function hashPasscode(passcode: string, salt: Uint8Array) {
  const encoder = new TextEncoder();
  const passcodeBytes = encoder.encode(passcode);
  passcode = '';

  const importedKey = await crypto.subtle.importKey('raw', passcodeBytes, {name: 'PBKDF2'}, false, ['deriveBits']);

  const derivedBits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'},
    importedKey,
    256
  );

  return new Uint8Array(derivedBits);
}

export async function deriveEncryptionKey(passcode: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passcodeBytes = encoder.encode(passcode);
  passcode = '';

  const importedKey = await crypto.subtle.importKey(
    'raw', passcodeBytes, {name: 'PBKDF2'}, false, ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'},
    importedKey, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']
  );
}

export async function createEncryptionArtifactsForPasscode(passcode: string) {
  const encryptionSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const verificationSalt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const encryptionKey = await deriveEncryptionKey(passcode, encryptionSalt);
  const verificationHash = await hashPasscode(passcode, verificationSalt);
  passcode = '';

  return {verificationHash, verificationSalt, encryptionSalt, encryptionKey};
}
