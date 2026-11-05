// Turning the passcode on moves the accounts out of localStorage into the encrypted store, in the worker
// (`encryptEncryptable`). Stopped half way - the tab closed, the worker failed - it left them in localStorage in the
// clear, auth keys and all, where nothing read them with the passcode on: before the encrypted store was written, the
// accounts were gone from the client as well (it reads the encrypted store), while their keys stayed on the disk in
// the clear. The first open of the store with the passcode on finishes the job.
//
// Everything here is fake: the keys xor the payload, the account data are made-up strings.

import {IDBFactory} from 'fake-indexeddb';
import type {LocalStorage} from '@lib/localStorage';
import {decryptForTest, encryptForTest, fakeEncryptionKey, setUpFakeIndexedDB} from '@/tests/helpers/fakeLocalEncryption';

const tab = vi.hoisted(() => ({
  storage: undefined as LocalStorage<any>,
  // * what another client (Web A) does to localStorage while the worker is busy, before the worker's next write there
  beforeNextWrite: undefined as () => void
}));

vi.mock('@helpers/context', async(importOriginal) => ({...(await importOriginal<object>()), IS_WORKER: true}));

// * the worker reads and writes localStorage through a tab
vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {
    getInstance: () => ({
      invoke: async(_type: string, {type, args}: {type: string, args: any[]}) => {
        if(type !== 'get' && tab.beforeNextWrite) {
          tab.beforeNextWrite();
          tab.beforeNextWrite = undefined;
        }

        return (tab.storage as any)[type](...args);
      },
      invokeVoid: () => {}
    })
  }
}));

vi.mock('@lib/crypto/cryptoMessagePort', async() => (await import('@/tests/helpers/fakeLocalEncryption')).fakeCryptoMessagePort);

const KEY = fakeEncryptionKey(0x2b);
const ANOTHER_KEY = fakeEncryptionKey(0x5d);

const ACCOUNT = {userId: '1', dcId: 2, dc2_auth_key: 'fake-key-of-account-1'};
const USER_AUTH = {id: 1, dcID: 2};
const WEB_A_ACCOUNT = {userId: '7', dcId: 4, dc4_auth_key: 'fake-key-of-web-a'};

// * what the tab's localStorage keeps
const plainValues = () => Object.fromEntries(Object.entries(localStorage).map(([key, value]) => [key, JSON.parse(value)]));

beforeAll(setUpFakeIndexedDB);

// * a page started anew, with the passcode on and entered: what the disk keeps stays
async function start(stored: {plain?: Record<string, any>, encrypted?: Uint8Array}) {
  vi.resetModules();
  (globalThis as any).indexedDB = new IDBFactory();
  localStorage.clear();
  for(const key in stored.plain) {
    localStorage.setItem(key, JSON.stringify(stored.plain[key]));
  }

  const [
    {default: LocalStorageController, LocalStorage},
    {default: IDBStorage},
    {getCommonDatabaseState},
    {default: DeferredIsUsingPasscode},
    {default: EncryptionKeyStore}
  ] = await Promise.all([
    import('@lib/localStorage'),
    import('@lib/files/idb'),
    import('@config/databases/state'),
    import('@lib/passcode/deferredIsUsingPasscode'),
    import('@lib/passcode/keyStore')
  ]);

  tab.storage = new LocalStorage();

  const encrypted = new IDBStorage(getCommonDatabaseState(), 'localStorage__encrypted');
  if(stored.encrypted) {
    await encrypted.save('data', stored.encrypted);
  }

  DeferredIsUsingPasscode.resolveDeferred(true);
  EncryptionKeyStore.save(KEY);

  return {
    storage: new LocalStorageController<any>(['account1', 'account2', 'user_auth']),
    readEncrypted: async(key = KEY) => {
      const bytes = await encrypted.get('data') as Uint8Array;
      return bytes && decryptForTest(bytes, key);
    }
  };
}

describe('the first open of the encrypted localStorage with the passcode on', () => {
  test('encrypts what turning the passcode on left in the clear before anything was encrypted', async() => {
    const {storage, readEncrypted} = await start({plain: {account1: ACCOUNT, user_auth: USER_AUTH}});

    expect(await storage.get('account1')).toEqual(ACCOUNT);
    expect(await storage.get('user_auth')).toEqual(USER_AUTH);
    expect(await readEncrypted()).toEqual({account1: ACCOUNT, user_auth: USER_AUTH});
    expect(plainValues()).toEqual({});
  });

  test('removes from the clear what was left there after it was encrypted', async() => {
    const {storage, readEncrypted} = await start({
      plain: {account1: ACCOUNT},
      encrypted: encryptForTest({account1: ACCOUNT, user_auth: USER_AUTH}, KEY)
    });

    expect(await storage.get('account1')).toEqual(ACCOUNT);
    expect(plainValues()).toEqual({});
    expect(await readEncrypted()).toEqual({account1: ACCOUNT, user_auth: USER_AUTH});
  });

  test('leaves what Web A keeps in the same keys, and takes none of it', async() => {
    const {storage, readEncrypted} = await start({
      plain: {account1: WEB_A_ACCOUNT, account2: WEB_A_ACCOUNT},
      encrypted: encryptForTest({account1: ACCOUNT}, KEY)
    });

    expect(await storage.get('account1')).toEqual(ACCOUNT);
    expect(await storage.get('account2')).toBeUndefined();
    expect(plainValues()).toEqual({account1: WEB_A_ACCOUNT, account2: WEB_A_ACCOUNT});
    expect(await readEncrypted()).toEqual({account1: ACCOUNT});
  });

  test('leaves an account Web A signs in to while it is encrypting what was left', async() => {
    const {storage} = await start({plain: {account1: ACCOUNT}});
    tab.beforeNextWrite = () => localStorage.setItem('account1', JSON.stringify(WEB_A_ACCOUNT));

    expect(await storage.get('account1')).toEqual(ACCOUNT);
    expect(plainValues()).toEqual({account1: WEB_A_ACCOUNT});
  });

  test('never writes over an encrypted store it could not read, nor removes anything from the clear', async() => {
    const {storage, readEncrypted} = await start({
      plain: {account1: ACCOUNT},
      encrypted: encryptForTest({account1: ACCOUNT, user_auth: USER_AUTH}, ANOTHER_KEY)
    });

    await storage.get('account1');
    expect(plainValues()).toEqual({account1: ACCOUNT});
    expect(await readEncrypted(ANOTHER_KEY)).toEqual({account1: ACCOUNT, user_auth: USER_AUTH});
  });
});
