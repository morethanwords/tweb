import {beforeAll, describe, expect, it} from 'vitest';
import {IDBKeyRange, indexedDB} from 'fake-indexeddb';
import WalletVault, {WalletVaultExistsError, WalletVaultLockedError} from '@lib/wallet/vault';

/**
 * The Web Locks API as two tabs of one origin share it: one holder per name at a time
 */
function installLocks() {
  const queues = new Map<string, Promise<unknown>>();
  (navigator as any).locks = {
    request(name: string, ...args: any[]) {
      const task: () => Promise<unknown> = args[args.length - 1];
      const previous = queues.get(name) || Promise.resolve();
      const run = previous.then(() => task(), () => task());
      queues.set(name, run.catch(() => {}));
      return run;
    }
  };
}

beforeAll(() => {
  (globalThis as any).indexedDB = indexedDB;
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  // * fake-indexeddb returns typed arrays from node's realm, which jsdom's own `Uint8Array` disowns
  (globalThis as any).Uint8Array = new TextEncoder().encode('').constructor;
  installLocks();
});

describe('WalletVault', () => {
  it('makes one vault when two tabs make it at once, and the secrets of the first stay readable', async() => {
    const userId = 777001;
    const first = new WalletVault(userId);
    const second = new WalletVault(userId);

    const results = await Promise.allSettled([
      first.create({kind: 'passcode', passcode: '1111'}),
      second.create({kind: 'passcode', passcode: '2222'})
    ]);

    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(WalletVaultExistsError);

    await first.storeSecret('secret', new Uint8Array([1, 2, 3]));
    // * the second tab unlocks the vault the first made, with the first's passcode
    expect(await second.unlock('2222')).toBe(false);
    expect(await second.unlock('1111')).toBe(true);
    expect(Array.from(await second.readSecret('secret'))).toEqual([1, 2, 3]);
  }, 30e3);

  it('adds a passcode to a vault that had none, every secret still readable', async() => {
    const userId = 777003;
    const vault = new WalletVault(userId);
    await vault.create({kind: 'device'});
    await vault.storeSecret('a', new Uint8Array([1, 2]));
    await vault.storeSecret('b', new Uint8Array([3, 4, 5]));

    expect(await vault.addPasscode('4321')).toBe(true);
    // * this tab keeps the vault open, under the new key
    expect(Array.from(await vault.readSecret('a'))).toEqual([1, 2]);

    const other = new WalletVault(userId);
    expect(await other.getKind()).toBe('passcode');
    expect(await other.unlockSilently()).toBe(false);
    expect(await other.unlock('0000')).toBe(false);
    expect(await other.unlock('4321')).toBe(true);
    expect(Array.from(await other.readSecret('b'))).toEqual([3, 4, 5]);
    // * a vault with a passcode already changes it the other way
    expect(await other.addPasscode('1111')).toBe(false);
  }, 30e3);

  it('locks a tab that still holds the key another tab replaced, instead of sealing under it', async() => {
    const userId = 777004;
    const first = new WalletVault(userId);
    const second = new WalletVault(userId);
    await first.create({kind: 'device'});
    expect(await second.unlockSilently()).toBe(true);
    await first.storeSecret('a', new Uint8Array([7]));

    expect(await first.addPasscode('2468')).toBe(true);
    await expect(second.storeSecret('b', new Uint8Array([8]))).rejects.toBeInstanceOf(WalletVaultLockedError);
    expect(second.isUnlocked()).toBe(false);
    expect(await second.unlock('2468')).toBe(true);
    expect(Array.from(await second.readSecret('a'))).toEqual([7]);
  }, 30e3);

  it('takes a passcode again after one whose move to the new key stopped half-way', async() => {
    const userId = 777005;
    const vault = new WalletVault(userId);
    await vault.create({kind: 'device'});
    await vault.storeSecret('a', new Uint8Array([1]));
    await vault.storeSecret('b', new Uint8Array([2]));

    // * the tab goes away after the header switched, before every secret was tidied
    const storage = (vault as any).storage;
    const save = storage.save.bind(storage);
    let switched = false;
    storage.save = (key: any, value: any, store: string) => {
      if(store === 'vault') switched = true;
      else if(switched && store === 'secrets') return Promise.reject(new Error('gone'));
      return save(key, value, store);
    };
    expect(await vault.addPasscode('1111')).toBe(true);
    storage.save = save;

    expect(await vault.changePasscode('1111')).toBe(true);

    // * the next try stops before its header write: every secret still opens under the key the vault has
    storage.save = (key: any, value: any, store: string) => store === 'vault' ? Promise.reject(new Error('gone')) : save(key, value, store);
    await expect(vault.addPasscode('3333')).rejects.toThrow('gone');
    storage.save = save;
    const device = new WalletVault(userId);
    expect(await device.unlockSilently()).toBe(true);
    expect(Array.from(await device.readSecret('a'))).toEqual([1]);
    expect(Array.from(await device.readSecret('b'))).toEqual([2]);

    expect(await vault.addPasscode('2222')).toBe(true);
    const other = new WalletVault(userId);
    expect(await other.unlock('2222')).toBe(true);
    expect(Array.from(await other.readSecret('a'))).toEqual([1]);
    expect(Array.from(await other.readSecret('b'))).toEqual([2]);
  }, 30e3);

  it('leaves no account\'s key behind when every account is logged out at once', async() => {
    const vaults = [new WalletVault(777006), new WalletVault(777007)];
    for(const vault of vaults) {
      await vault.create({kind: 'device'});
      await vault.storeSecret('a', new Uint8Array([3]));
    }

    await WalletVault.wipeAll();
    for(const vault of vaults) {
      const fresh = new WalletVault(vault.ownerId);
      expect(await fresh.getKind()).toBeUndefined();
      expect(await fresh.hasSecret('a')).toBe(false);
    }
  }, 30e3);

  it('never makes a vault over one that is there', async() => {
    const userId = 777002;
    const vault = new WalletVault(userId);
    await vault.create({kind: 'passcode', passcode: '1111'});
    await expect(vault.create({kind: 'passcode', passcode: '3333'})).rejects.toBeInstanceOf(WalletVaultExistsError);
    expect(await new WalletVault(userId).unlock('1111')).toBe(true);
  }, 30e3);
});
