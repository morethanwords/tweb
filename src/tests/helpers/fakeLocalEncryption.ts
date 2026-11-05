import {IDBKeyRange} from 'fake-indexeddb';

/**
 * The passcode's key, faked: it xors the payload with its id, so what is read with another key is garbage, as with the
 * real one
 */
export const fakeEncryptionKey = (id: number) => ({id}) as any as CryptoKey;

/** The crypto worker's local encryption with fake keys: `vi.mock('@lib/crypto/cryptoMessagePort', () => fakeCryptoMessagePort)` */
export const fakeCryptoMessagePort = {
  default: {
    invokeCryptoNew: async({method, args}: any) => {
      const {key, data, encryptedData} = args[0];
      const id: number = key?.id ?? 0;
      const bytes = new Uint8Array(method === 'aes-local-encrypt' ? data : encryptedData);
      return bytes.map((byte) => byte ^ id);
    }
  }
};

// * `Array.from` keeps the result in this realm, the one `instanceof Uint8Array` is checked against
const xor = (bytes: Uint8Array, key: CryptoKey) => new Uint8Array(Array.from(bytes, (byte) => byte ^ (key as any).id));
export const encryptForTest = (data: Record<string, any>, key: CryptoKey) => xor(new TextEncoder().encode(JSON.stringify(data)), key);
export const decryptForTest = (bytes: Uint8Array, key: CryptoKey) => JSON.parse(new TextDecoder().decode(xor(bytes, key)));

/** fake-indexeddb under jsdom; `indexedDB` itself is the test's to set */
export function setUpFakeIndexedDB() {
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  // * fake-indexeddb returns typed arrays from node's realm, which jsdom's own `Uint8Array` disowns
  (globalThis as any).Uint8Array = new TextEncoder().encode('').constructor;
}
