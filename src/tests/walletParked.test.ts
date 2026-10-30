/*
 * The old wallet on this device (tdesktop's conflict), the collectible send's error texts, the onramp's provider
 * and the card's balance runs: against a made-up engine, an in-memory vault and stubbed managers.
 * Nothing here talks to a chain or a server.
 */

import type {WalletCustodyRecord} from '@lib/wallet/vault';
import type {WalletStatus} from '@appManagers/appWalletManager';

const fake = vi.hoisted(() => {
  const SERVED = 'UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k';
  const textDecoder = new TextDecoder();

  const disk = {
    secrets: new Map<string, Uint8Array>(),
    custody: undefined as WalletCustodyRecord,
    parked: new Map<string, WalletCustodyRecord>()
  };

  class WalletVault {
    public async hasSecret(ref: string) {
      return disk.secrets.has(ref);
    }

    public async readSecret(ref: string) {
      return disk.secrets.get(ref);
    }

    public async deleteSecret(ref: string) {
      disk.secrets.delete(ref);
    }

    public async getCustody() {
      return disk.custody && structuredClone(disk.custody);
    }

    public async deleteCustody() {
      disk.custody = undefined;
    }

    public async getParkedCustody() {
      return [...disk.parked.values()].map((record) => structuredClone(record));
    }

    public async deleteParkedCustody(recordId: string) {
      disk.parked.delete(recordId);
    }

    public async parkCustody(record: WalletCustodyRecord) {
      disk.parked.set(record.recordId, structuredClone(record));
    }

    public async saveCustody(record: WalletCustodyRecord) {
      disk.custody = structuredClone(record);
    }

    public isUnlocked() {
      return true;
    }

    public async unlockSilently() {
      return true;
    }
  }

  class BrowserPlatformHost {
    constructor(public options: any) {}
  }

  const module = {
    initializeWalletEngine: async() => {},
    // * the made-up addresses are already canonical: two strings are one wallet only when equal
    convertTonAddress: async(address: string) => address,
    BrowserPlatformHost,
    IndexedDbJournalStore: class {},
    WalletLifecycle: {
      create: async(host: BrowserPlatformHost) => ({
        revealRecoveryPhrase: async(descriptor: any) => {
          const bytes = await host.options.secrets.read({secretRef: descriptor.secretRef, reason: 'revealRecoveryPhrase'});
          return {phrase: textDecoder.decode(bytes)};
        },
        close: () => {}
      })
    }
  };

  const managers = {
    appWalletManager: {
      getAddressFunds: vi.fn(),
      getAddressSigningKey: vi.fn()
    },
    timeManager: {
      getServerTime: vi.fn(async() => 1000)
    }
  };

  return {SERVED, disk, WalletVault, module, managers};
});

vi.mock('@ton/wallet-engine', () => fake.module);
vi.mock('@lib/wallet/vault', () => ({default: fake.WalletVault, WalletVaultLockedError: class extends Error {}}));
vi.mock('@lib/rootScope', () => ({default: {
  myId: 1,
  managers: fake.managers,
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => {}
}}));
vi.mock('@lib/wallet/engineHost', () => ({
  setWalletSubmission: vi.fn(),
  TONCENTER_BASE_URL: 'https://toncenter.com',
  WalletStatuslessHostImpl: class {
    public close() {}
  }
}));

import WalletSession from '@lib/wallet/walletSession';
import {parseWalletAddressFunds, parseWalletSigningKey} from '@lib/wallet/addressFunds';
import {splitGrams} from '@components/wallet/format';
import {getWalletErrorLangKey} from '@components/wallet/send';
import AppWalletManager from '@appManagers/appWalletManager';

const textEncoder = new TextEncoder();

function record(id: string, address: string, words = id): WalletCustodyRecord {
  fake.disk.secrets.set('secret:' + id, textEncoder.encode(words));
  return {
    recordId: id,
    address,
    anchorKey: '11'.repeat(32),
    signingKey: '11'.repeat(32),
    secretRef: 'secret:' + id,
    network: 'mainnet',
    date: 0
  };
}

function park(value: WalletCustodyRecord) {
  fake.disk.parked.set(value.recordId, value);
  return value;
}

const status: WalletStatus = {
  presence: 'ready',
  state: {_: 'walletState', pFlags: {}, address: fake.SERVED, public_key: new Uint8Array(32), balance: '0'},
  date: 0
};

const funds = (nanos: string, neverUsed = false) => ({nanos, neverUsed});

let session: WalletSession;
let userId = 100;

beforeEach(() => {
  fake.disk.secrets.clear();
  fake.disk.parked.clear();
  fake.disk.custody = undefined;
  fake.managers.appWalletManager.getAddressFunds.mockReset();
  fake.managers.appWalletManager.getAddressSigningKey.mockReset();
  fake.managers.timeManager.getServerTime.mockResolvedValue(1000);
  // * a session per test: it keeps what the chain said about each address
  session = WalletSession.get(++userId as UserId);
});

describe('old wallets on this device', () => {
  it('lists the keys of other wallets with what they hold, not an older key of the served one', async() => {
    fake.disk.custody = record('device', 'UQ-device-old');
    park(record('parked', 'UQ-parked-old'));
    park(record('older-key', fake.SERVED));
    // * a record whose secret is gone has no phrase left to save
    const orphan = park(record('orphan', 'UQ-orphan'));
    fake.disk.secrets.delete(orphan.secretRef);
    fake.managers.appWalletManager.getAddressFunds.mockImplementation(async(address: string) => {
      return address === 'UQ-device-old' ? funds('1500000000') : funds('250000000');
    });

    const state = await session.getParkedState(status);
    expect(state.wallets.map((wallet) => [wallet.record.recordId, wallet.nanos])).toEqual([
      ['device', '1500000000'],
      ['parked', '250000000']
    ]);
    expect(state.nanos).toBe('1750000000');
  });

  it('keeps a wallet the chain did not answer for, and then knows no total', async() => {
    park(record('a', 'UQ-a'));
    park(record('b', 'UQ-b'));
    fake.managers.appWalletManager.getAddressFunds.mockImplementation(async(address: string) => {
      if(address === 'UQ-a') throw {type: 'WALLET_TONCENTER_ERROR'};
      return funds('5');
    });

    const state = await session.getParkedState(status);
    expect(state.wallets.map((wallet) => wallet.nanos)).toEqual([undefined, '5']);
    expect(state.nanos).toBeUndefined();
  });

  it('drops the key of an empty wallet that was never used, quietly', async() => {
    const empty = park(record('empty', 'UQ-empty'));
    // * empty but used once: its phrase may still matter (tdesktop keeps it too)
    park(record('spent', 'UQ-spent'));
    fake.managers.appWalletManager.getAddressFunds.mockImplementation(async(address: string) => {
      return address === 'UQ-empty' ? funds('0', true) : funds('0');
    });

    const state = await session.getParkedState(status);
    expect(state.wallets.map((wallet) => wallet.record.recordId)).toEqual(['spent']);
    await vi.waitFor(() => expect(fake.disk.parked.has(empty.recordId)).toBe(false));
    expect(fake.disk.secrets.has(empty.secretRef)).toBe(false);
  });

  it('asks the chain once a window, again only when told to refresh', async() => {
    park(record('a', 'UQ-a'));
    fake.managers.appWalletManager.getAddressFunds.mockResolvedValue(funds('7'));
    await session.getParkedState(status, true);
    await session.getParkedState(status);
    expect(fake.managers.appWalletManager.getAddressFunds).toHaveBeenCalledTimes(1);
    await session.getParkedState(status, true);
    expect(fake.managers.appWalletManager.getAddressFunds).toHaveBeenCalledTimes(2);
  });

  it('reveals an old wallet\'s phrase from its own key', async() => {
    const old = park(record('a', 'UQ-a', 'one two three'));
    expect(await session.revealParked(old)).toEqual(['one', 'two', 'three']);
  });

  it('switching drops the key and the record, wherever the record is kept', async() => {
    const parked = park(record('parked', 'UQ-parked'));
    const device = fake.disk.custody = record('device', 'UQ-device');
    fake.managers.appWalletManager.getAddressFunds.mockResolvedValue(funds('1'));

    await session.dropParked(parked);
    expect(fake.disk.parked.size).toBe(0);
    expect(fake.disk.secrets.has(parked.secretRef)).toBe(false);
    expect(fake.disk.custody).toBeDefined();

    await session.dropParked(device);
    expect(fake.disk.custody).toBeUndefined();
    expect(fake.disk.secrets.has(device.secretRef)).toBe(false);
    expect((await session.getParkedState(status)).wallets).toEqual([]);
  });
});

describe('an old wallet with a key update on its way', () => {
  const OLD_KEY = '11'.repeat(32);
  const NEW_KEY = '22'.repeat(32);

  function rotating() {
    const value = record('rotating', 'UQ-rotating', 'old words');
    fake.disk.secrets.set('secret:new', textEncoder.encode('new words'));
    value.pendingRotation = {recordId: 'new', secretRef: 'secret:new', operationId: 'op', newSigningKey: NEW_KEY, validUntil: 2000};
    return park(value);
  }

  it('shows no phrase and drops none while the chain has not told which one signs', async() => {
    const parked = rotating();
    fake.managers.appWalletManager.getAddressSigningKey.mockRejectedValue(new Error('no answer'));
    await expect(session.revealParked(parked)).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    await expect(session.dropParked(parked)).rejects.toMatchObject({type: 'ROTATION_PENDING'});

    // * the old key still signs, but the update may still land
    fake.managers.appWalletManager.getAddressSigningKey.mockResolvedValue(OLD_KEY);
    await expect(session.revealParked(parked)).rejects.toMatchObject({type: 'ROTATION_PENDING'});
    expect(fake.disk.secrets.has('secret:rotating')).toBe(true);
    expect(fake.disk.secrets.has('secret:new')).toBe(true);
    expect(fake.disk.parked.get('rotating').pendingRotation).toBeDefined();
  });

  it('keeps the update\'s phrase once the chain holds its key', async() => {
    const parked = rotating();
    fake.managers.appWalletManager.getAddressSigningKey.mockResolvedValue(NEW_KEY);
    expect(await session.revealParked(parked)).toEqual(['new', 'words']);
    expect(fake.disk.parked.has('rotating')).toBe(false);
    expect(fake.disk.parked.get('new')).toMatchObject({secretRef: 'secret:new', signingKey: NEW_KEY});
    expect(fake.disk.secrets.has('secret:rotating')).toBe(false);
  });

  it('keeps the old phrase once the update can no longer land', async() => {
    const parked = rotating();
    fake.managers.appWalletManager.getAddressSigningKey.mockResolvedValue(OLD_KEY);
    fake.managers.timeManager.getServerTime.mockResolvedValue(5000);
    expect(await session.revealParked(parked)).toEqual(['old', 'words']);
    expect(fake.disk.parked.get('rotating').pendingRotation).toBeUndefined();
    expect(fake.disk.secrets.has('secret:new')).toBe(false);

    await session.dropParked(fake.disk.parked.get('rotating'));
    expect(fake.disk.parked.size).toBe(0);
    expect(fake.disk.secrets.has('secret:rotating')).toBe(false);
  });

  it('drops both phrases of an empty wallet that was never used: no update of it can land', async() => {
    rotating();
    fake.managers.appWalletManager.getAddressFunds.mockResolvedValue(funds('0', true));
    expect((await session.getParkedState(status)).wallets).toEqual([]);
    await vi.waitFor(() => expect(fake.disk.parked.size).toBe(0));
    expect(fake.disk.secrets.has('secret:rotating')).toBe(false);
    expect(fake.disk.secrets.has('secret:new')).toBe(false);
    expect(fake.managers.appWalletManager.getAddressSigningKey).not.toHaveBeenCalled();
  });

  it('reads the key a wallet contract holds from the getter\'s answer', () => {
    const answer = (stack: any, exitCode = 0) => JSON.stringify({ok: true, result: {exit_code: exitCode, stack}});
    expect(parseWalletSigningKey(answer([['num', '0x' + 'ab'.repeat(32)]]))).toBe('ab'.repeat(32));
    // * a key with leading zero bytes is written short
    expect(parseWalletSigningKey(answer([['num', '0x1f']]))).toBe('1f'.padStart(64, '0'));
    expect(parseWalletSigningKey(answer([['num', '0x1f']], -13))).toBeUndefined();
    expect(parseWalletSigningKey(answer([]))).toBeUndefined();
    expect(parseWalletSigningKey(answer([['num', '-0x1']]))).toBeUndefined();
    expect(parseWalletSigningKey(JSON.stringify({ok: false, error: 'x'}))).toBeUndefined();
    expect(parseWalletSigningKey('not json')).toBeUndefined();
  });
});

describe('what an address holds', () => {
  const answer = (result: any, ok = true) => JSON.stringify({ok, result});

  it('reads the balance as the provider writes it, and whether a transaction ever touched it', () => {
    expect(parseWalletAddressFunds(answer({balance: '1500000000', last_transaction_id: {lt: '4100000000001'}}))).toEqual(funds('1500000000'));
    expect(parseWalletAddressFunds(answer({balance: 0, last_transaction_id: {lt: '0'}}))).toEqual(funds('0', true));
    expect(parseWalletAddressFunds(answer({balance: '007', last_transaction_id: {lt: 0}}))).toEqual(funds('7', true));
    // * no transaction id says nothing: such a wallet is not taken for an unused one
    expect(parseWalletAddressFunds(answer({balance: '0'}))).toEqual(funds('0'));
  });

  it('takes nothing that is not a well-formed successful answer', () => {
    expect(parseWalletAddressFunds('not json')).toBeUndefined();
    expect(parseWalletAddressFunds(answer({balance: '1'}, false))).toBeUndefined();
    expect(parseWalletAddressFunds(answer({balance: '-1'}))).toBeUndefined();
    expect(parseWalletAddressFunds(answer({balance: 1.5}))).toBeUndefined();
    expect(parseWalletAddressFunds(answer({balance: 2 ** 60}))).toBeUndefined();
    expect(parseWalletAddressFunds(answer(null))).toBeUndefined();
  });
});

describe('collectible send errors', () => {
  it('tells a collectible the wallet no longer holds from a provider that did not answer', () => {
    expect(getWalletErrorLangKey(new Error('NFT transfer is unavailable: expected exactly one NFT item, provider returned 0'))).toBe('Wallet.Collectible.NotOwned');
    expect(getWalletErrorLangKey(new Error('NFT transfer is unavailable: failed to load fresh NFT state: MTP: TIMEOUT'))).toBe('Wallet.Error.Generic');
    expect(getWalletErrorLangKey(new Error('NFT transfer emulation was rejected: bounced'))).toBe('Wallet.Error.SendFailed');
    expect(getWalletErrorLangKey({type: 'WALLET_NFT_OWN_WALLET'})).toBe('Wallet.Collectible.OwnWallet');
  });

  it('never invites another try while a transfer\'s outcome is not known', () => {
    expect(getWalletErrorLangKey(new Error('submission outcome is unknown: MTP: INTERNAL'))).toBe('Wallet.Error.InProgress');
    expect(getWalletErrorLangKey(new Error('the previous submission outcome is unresolved'))).toBe('Wallet.Error.InProgress');
  });
});

describe('buying Grams', () => {
  function onramp(providers: any[] | Error) {
    const invoke = vi.fn(async(method: string, params: any) => {
      if(method === 'payments.getOnrampProviders') {
        if(providers instanceof Error) throw providers;
        return providers;
      }

      return {_: 'onrampSession', url: 'https://t.me/wallet/start?startapp=' + params.address};
    });

    return {invoke, manager: {apiManager: {invokeApi: invoke, invokeApiSingle: invoke}} as any};
  }

  const provider = (id: string) => ({_: 'onrampProviderInfo', pFlags: {}, id, name: 'P', crypto_currencies: ['GRAM']});

  it('offers buying only when the server lists Telegram\'s own provider', async() => {
    for(const [providers, available] of [[[provider('p1'), provider('wallet')], true], [[provider('p1')], false], [[], false], [new Error('FAIL'), false]] as const) {
      const {invoke, manager} = onramp(providers as any);
      expect(await AppWalletManager.prototype.isOnrampAvailable.call(manager)).toBe(available);
      expect(invoke.mock.calls[0]).toEqual(['payments.getOnrampProviders', {crypto_currency: 'gram'}]);
    }
  });

  it('opens Telegram\'s provider for the address, in its own currency', async() => {
    const {invoke, manager} = onramp([]);
    const session = await AppWalletManager.prototype.createOnrampSession.call(manager, 'UQ-me');
    expect(invoke.mock.calls).toEqual([['payments.createOnrampSession', {provider: 'wallet', crypto_currency: 'gram', address: 'UQ-me'}]]);
    expect(session.url).toBe('https://t.me/wallet/start?startapp=UQ-me');
  });
});

describe('the card\'s balance', () => {
  it('writes the balance like every other amount: grouped, two decimals, the rest cut off', () => {
    expect(splitGrams('1720580000000')).toEqual({whole: '1,720', fraction: '.58'});
    expect(splitGrams('0')).toEqual({whole: '0', fraction: '.00'});
    expect(splitGrams('12345678900000000')).toEqual({whole: '12,345,678', fraction: '.90'});
    // * never more than the wallet holds: tdesktop cuts the cents too
    expect(splitGrams('2999000000')).toEqual({whole: '2', fraction: '.99'});
    expect(splitGrams('999999999')).toEqual({whole: '0', fraction: '.99'});
    // * past what nanos fit into a double, still exact to the cent
    expect(splitGrams('98765432109879999999')).toEqual({whole: '98,765,432,109', fraction: '.87'});
  });
});
