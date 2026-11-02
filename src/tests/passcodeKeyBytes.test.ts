import {exportEncryptionKey, importEncryptionKey} from '@lib/passcode/keyStore';
import {decryptLocalData, encryptLocalData, toLocalDataKeyBytes} from '@lib/crypto/utils/aesLocal';
import {deriveEncryptionKey} from '@lib/passcode/utils';

// * WebKit cannot clone a CryptoKey into a SharedWorker (the MTProto and crypto workers): the passcode key crosses
// * their ports as its raw bytes, and has to be the very same key on the other side
describe('passcode key as bytes', () => {
  const salt = new Uint8Array(32).fill(7);
  const plain = new TextEncoder().encode('the local data');

  it('comes back as the key it was', async() => {
    const key = await deriveEncryptionKey('2580', salt);
    const bytes = await exportEncryptionKey(key);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);

    const encrypted = (await encryptLocalData({key, data: plain.slice()})).value as Uint8Array;
    const decrypted = (await decryptLocalData({key: await importEncryptionKey(bytes), encryptedData: encrypted})).value;
    expect(new TextDecoder().decode(decrypted as ArrayBuffer)).toBe('the local data');
  });

  it('is read by the crypto worker from its bytes, and another key does not read it', async() => {
    const key = await deriveEncryptionKey('2580', salt);
    const other = await deriveEncryptionKey('1470', salt);
    const bytes = await toLocalDataKeyBytes(key);
    expect(await toLocalDataKeyBytes(key)).toBe(bytes); // * exported once per key

    const encrypted = (await encryptLocalData({key: bytes, data: plain.slice()})).value as Uint8Array;
    const decrypted = (await decryptLocalData({key, encryptedData: encrypted.slice()})).value;
    expect(new TextDecoder().decode(decrypted as ArrayBuffer)).toBe('the local data');

    await expect(decryptLocalData({key: await toLocalDataKeyBytes(other), encryptedData: encrypted.slice()})).rejects.toBeDefined();
  });

  it('keeps no key as no key', async() => {
    expect(await exportEncryptionKey(null)).toBeNull();
    expect(await importEncryptionKey(null)).toBeNull();
  });
});
