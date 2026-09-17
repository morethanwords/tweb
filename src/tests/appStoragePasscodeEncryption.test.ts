import {beforeAll, expect, test, vi} from 'vitest';
import {IDBKeyRange, indexedDB} from 'fake-indexeddb';

import {getDatabaseState} from '@config/databases/state';
import IDBStorage from '@lib/files/idb';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import AppStorage from '@lib/storage';

// * fake keys that simply xor the payload, so reading with another key gives garbage, just like the real thing
const KEY_A = {id: 0x2b} as any as CryptoKey;
const KEY_B = {id: 0x5d} as any as CryptoKey;

vi.mock('@lib/crypto/cryptoMessagePort', () => ({
  default: {
    invokeCryptoNew: async({method, args}: any) => {
      const {key, data, encryptedData} = args[0];
      const id: number = key?.id ?? 0;
      const bytes = new Uint8Array(method === 'aes-local-encrypt' ? data : encryptedData);
      return bytes.map((byte) => byte ^ id);
    }
  }
}));

// * `Array.from` keeps the result in this realm, the one `instanceof Uint8Array` is checked against
const xor = (bytes: Uint8Array, key: CryptoKey) => new Uint8Array(Array.from(bytes, (byte) => byte ^ (key as any).id));
const encryptForTest = (data: Record<string, any>, key: CryptoKey) => xor(new TextEncoder().encode(JSON.stringify(data)), key);
const decryptForTest = (bytes: Uint8Array, key: CryptoKey) => JSON.parse(new TextDecoder().decode(xor(bytes, key)));

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

const plainEntries = (accountNumber: 1 | 2 | 3 | 4) => new IDBStorage(getDatabaseState(accountNumber), 'webapp').getAllEntries();
const encryptedEntries = (accountNumber: 1 | 2 | 3 | 4) => new IDBStorage(getDatabaseState(accountNumber), 'webapp__encrypted').getAllEntries();

beforeAll(() => {
  (globalThis as any).indexedDB = indexedDB;
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  // * fake-indexeddb returns typed arrays from node's realm, which jsdom's own `Uint8Array` disowns
  (globalThis as any).Uint8Array = new TextEncoder().encode('').constructor;
});

test('encrypts a store that was never opened before the passcode was enabled', async() => {
  DeferredIsUsingPasscode.resolveDeferred(false);
  EncryptionKeyStore.save(undefined);

  const db = getDatabaseState(1);

  // * a mini app wrote its device storage in a previous session
  await new IDBStorage(db, 'webapp').save('bot:device:token', 'secret');

  // * the storage exists, but nothing has opened it in this session
  const storage = new AppStorage(db, 'webapp');

  DeferredIsUsingPasscode.resolveDeferred(true);
  EncryptionKeyStore.save(KEY_A);
  await AppStorage.toggleEncryptedForAll(true);

  expect(await plainEntries(1)).toEqual([]);
  expect(await encryptedEntries(1)).toHaveLength(1);
  expect(await storage.get('bot:device:token')).toBe('secret');
});

test('encrypts leftovers of an already enabled passcode when the store is opened', async() => {
  const db = getDatabaseState(2);

  const storage = new AppStorage(db, 'webapp');
  await storage.set({'bot:device:fresh': 'new-value'});
  await flush();

  // * left unencrypted by a version that had the migration bug
  await new IDBStorage(db, 'webapp').save('bot:device:leftover', 'leaked');

  const anotherStorage = new AppStorage(db, 'webapp');
  expect(await anotherStorage.get('bot:device:leftover')).toBe('leaked');
  expect(await anotherStorage.get('bot:device:fresh')).toBe('new-value');

  await flush();
  expect(await plainEntries(2)).toEqual([]);
  expect(decryptForTest((await encryptedEntries(2))[0][1], KEY_A)).toEqual({
    'bot:device:fresh': 'new-value',
    'bot:device:leftover': 'leaked'
  });
});

test('re-encrypts a store that was never opened when the passcode changes', async() => {
  const db = getDatabaseState(3);

  // * written in a previous session, encrypted with the current key
  await new IDBStorage(db, 'webapp__encrypted').save('data', encryptForTest({'bot:device:token': 'secret'}, KEY_A));

  const storage = new AppStorage(db, 'webapp');

  await AppStorage.loadEncryptedForAll();
  EncryptionKeyStore.save(KEY_B);
  await AppStorage.reEncryptEncrypted();
  await flush();

  expect(await storage.get('bot:device:token')).toBe('secret');
  expect(decryptForTest((await encryptedEntries(3))[0][1], KEY_B)).toEqual({'bot:device:token': 'secret'});
});

test('moves the data back when the passcode is disabled, opened store or not', async() => {
  // * never opened in this session, encrypted with the current key by a previous one
  const db = getDatabaseState(4);
  await new IDBStorage(db, 'webapp__encrypted').save('data', encryptForTest({'bot:device:lazy': 'kept'}, KEY_B));
  const lazyStorage = new AppStorage(db, 'webapp');

  // * same order as the worker: the flag flips first, the key goes away only after the migration
  DeferredIsUsingPasscode.resolveDeferred(false);
  await AppStorage.toggleEncryptedForAll(false);
  EncryptionKeyStore.save(undefined);

  expect(await plainEntries(1)).toEqual([['bot:device:token', 'secret']]);
  expect(await encryptedEntries(1)).toEqual([]);

  expect(await plainEntries(4)).toEqual([['bot:device:lazy', 'kept']]);
  expect(await encryptedEntries(4)).toEqual([]);
  expect(await lazyStorage.get('bot:device:lazy')).toBe('kept');
});

test('clears both stores without waiting for the passcode key', async() => {
  const db = getDatabaseState(3);
  await new IDBStorage(db, 'webapp').save('bot:device:plain', 'left');
  await new IDBStorage(db, 'webapp__encrypted').save('data', encryptForTest({'bot:device:token': 'secret'}, KEY_B));

  // * locked: the passcode is on and nobody has entered it yet
  DeferredIsUsingPasscode.resolveDeferred(true);
  EncryptionKeyStore.resetDeferred();

  await new AppStorage(db, 'webapp').clear();

  expect(await plainEntries(3)).toEqual([]);
  expect(await encryptedEntries(3)).toEqual([]);
});
