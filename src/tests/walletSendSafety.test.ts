/*
 * What keeps a Gram transfer from being paid twice and a key from being lost unannounced: `wallet.sendTransfer` (and
 * the wallet replace) is never resent by the request layer, a transfer with no clear answer leaves the chat instead of
 * failing on a guess, and logging out says which wallet keys it destroys (tdesktop's WalletLossOnLogout). Nothing here
 * talks to a server.
 */

import type {WalletCustodyRecord} from '@lib/wallet/vault';
import type {WalletStatus} from '@appManagers/appWalletManager';
import bytesFromHex from '@helpers/bytes/bytesFromHex';

const fake = vi.hoisted(() => {
  const disk = {
    secrets: new Set<string>(),
    custody: undefined as WalletCustodyRecord,
    parked: [] as WalletCustodyRecord[],
    broken: false
  };

  class WalletVault {
    public async getCustody() {
      if(disk.broken) throw new Error('IDB');
      return disk.custody;
    }

    public async getParkedCustody() {
      return disk.parked;
    }

    public async hasSecret(ref: string) {
      return disk.secrets.has(ref);
    }
  }

  return {disk, WalletVault};
});

vi.mock('@lib/wallet/vault', () => ({default: fake.WalletVault}));

import {ApiManager} from '@appManagers/apiManager';
import AppWalletManager from '@appManagers/appWalletManager';
import {GRAM_TRANSFER_RESOLUTION_TIMEOUT} from '@lib/wallet/transferMessages';
import {getWalletLoss, getWalletLossWarnings, readWalletLoss} from '@lib/wallet/logoutLoss';

describe('a request that must never run twice', () => {
  function makeApi(answers: Array<() => Promise<any>>) {
    const wrapApiCall = vi.fn(() => answers.shift()());
    const networker = {wrapApiCall, attachPromise: vi.fn(), isStopped: () => false};
    const api = {
      baseDcId: 2,
      afterMessageTempIds: {},
      cachedExportPromise: {},
      log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
      getNetworker: vi.fn(async() => networker),
      logOut: vi.fn()
    };

    const invoke = (options: any) => ApiManager.prototype.invokeApi.call(api, 'wallet.sendTransfer', {}, options);
    return {wrapApiCall, invoke};
  }

  const fail = (code: number, type: string) => () => Promise.reject({code, type});
  const ok = () => Promise.resolve({_: 'updates', updates: []});

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is not resent after a 5xx, nor after an error nobody could read', async() => {
    for(const [code, type] of [[500, 'INTERNAL'], [400, 'UNKNOWN']] as const) {
      const {wrapApiCall, invoke} = makeApi([fail(code, type), ok]);
      await expect(invoke({noRetry: true, noErrorBox: true})).rejects.toMatchObject({code, type});
      expect(wrapApiCall).toHaveBeenCalledTimes(1);
    }
  });

  it('while any other request still is', async() => {
    vi.useFakeTimers();
    const {wrapApiCall, invoke} = makeApi([fail(500, 'INTERNAL'), ok]);
    const promise = invoke({noErrorBox: true});
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({_: 'updates'});
    expect(wrapApiCall).toHaveBeenCalledTimes(2);
  });
});

describe('a Gram transfer handed to the server', () => {
  function makeManager(answer: () => Promise<any>) {
    const manager = Object.create(AppWalletManager.prototype) as AppWalletManager;
    const messages = {
      createGramTransferDraft: vi.fn(),
      failGramTransferDraft: vi.fn(),
      dropGramTransferDraft: vi.fn()
    };
    const invokeApi = vi.fn((..._args: any[]) => answer());
    Object.assign(manager, {
      apiManager: {invokeApi},
      appUsersManager: {getUserInput: () => ({_: 'inputUser', user_id: 5}), getUser: () => ({id: 5})},
      appMessagesManager: messages,
      apiUpdatesManager: {processUpdateMessage: vi.fn()},
      log: Object.assign(vi.fn(), {error: vi.fn()})
    });

    const send = (data: {dataNormal?: Uint8Array, dataGasless?: Uint8Array} = {}) => manager.sendTransfer({
      dataNormal: new Uint8Array([1]),
      userId: 5 as UserId,
      randomId: '777',
      draft: {amount: '1000000000', address: 'UQ-recipient'},
      ...data
    });

    return {messages, invokeApi, send};
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('goes once: the request layer never resends it', async() => {
    const {invokeApi, send} = makeManager(() => Promise.reject({code: 500, type: 'INTERNAL'}));
    await expect(send()).rejects.toMatchObject({type: 'INTERNAL'});
    expect(invokeApi.mock.calls[0][0]).toBe('wallet.sendTransfer');
    expect(invokeApi.mock.calls[0][2]).toMatchObject({noRetry: true});
  });

  it('fails its chat message on a refusal the server sent', async() => {
    const {messages, send} = makeManager(() => Promise.reject({code: 400, type: 'WALLET_TRANSFER_SEND_FAILED'}));
    await expect(send()).rejects.toBeDefined();
    expect(messages.failGramTransferDraft).toHaveBeenCalledWith('777', 'WALLET_TRANSFER_SEND_FAILED');
    await vi.advanceTimersByTimeAsync(GRAM_TRANSFER_RESOLUTION_TIMEOUT);
    expect(messages.dropGramTransferDraft).not.toHaveBeenCalled();
  });

  it('takes its chat message away, never fails it, when nobody can tell how it went', async() => {
    for(const error of [{code: 500, type: 'INTERNAL'}, {code: 400, type: 'RANDOM_ID_DUPLICATE'}, {code: 400, type: 'NETWORK_BAD_RESPONSE'}]) {
      const {messages, send} = makeManager(() => Promise.reject(error));
      await expect(send()).rejects.toBeDefined();
      await vi.advanceTimersByTimeAsync(GRAM_TRANSFER_RESOLUTION_TIMEOUT - 1);
      expect(messages.dropGramTransferDraft).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(messages.dropGramTransferDraft, error.type).toHaveBeenCalledWith('777');
      expect(messages.failGramTransferDraft, error.type).not.toHaveBeenCalled();
    }
  });

  it('refuses a copy too big for the server before anything shows in the chat', async() => {
    const {messages, invokeApi, send} = makeManager(() => Promise.resolve({}));
    for(const data of [{dataNormal: new Uint8Array(16 * 1024 + 1)}, {dataNormal: new Uint8Array(0)}, {dataGasless: new Uint8Array(16 * 1024 + 1)}]) {
      await expect(send(data)).rejects.toMatchObject({type: 'WALLET_TRANSFER_DATA_INVALID', code: 400});
    }

    expect(invokeApi).not.toHaveBeenCalled();
    expect(messages.createGramTransferDraft).not.toHaveBeenCalled();
  });

  it('takes a receipt that names one message, as the server wrote it', async() => {
    const receipt = (msgHash: string, gasless?: boolean) => ({_: 'updateSentWalletTransaction', msg_hash: msgHash, pFlags: gasless ? {gasless: true} : {}});
    const answer = (...updates: any[]) => ({_: 'updates', updates, users: [] as any[], chats: [] as any[], date: 0, seq: 0});

    const {send} = makeManager(() => Promise.resolve(answer(receipt('any bytes, any length'))));
    expect(await send()).toMatchObject({msgHash: 'any bytes, any length'});
    for(const updates of [[receipt('')], [receipt('a'), receipt('b')], [receipt('a'), receipt('a', true)]]) {
      const {send} = makeManager(() => Promise.resolve(answer(...updates)));
      await expect(send()).rejects.toMatchObject({type: 'WALLET_TRANSFER_RECEIPT_MISSING'});
    }
  });

  it('takes its chat message away when the server never answers at all', async() => {
    const {messages, send} = makeManager(() => new Promise(() => {}));
    send().catch(() => {});
    await vi.advanceTimersByTimeAsync(GRAM_TRANSFER_RESOLUTION_TIMEOUT);
    expect(messages.dropGramTransferDraft).toHaveBeenCalledWith('777');
  });

  it('takes its chat message away when the server posts none for the transfer it took', async() => {
    const {messages, send} = makeManager(() => Promise.resolve({_: 'updateShort', date: 0, update: {_: 'updateSentWalletTransaction', msg_hash: 'h', pFlags: {}}}));
    expect(await send()).toMatchObject({msgHash: 'h'});
    await vi.advanceTimersByTimeAsync(GRAM_TRANSFER_RESOLUTION_TIMEOUT);
    expect(messages.dropGramTransferDraft).toHaveBeenCalledWith('777');
    expect(messages.failGramTransferDraft).not.toHaveBeenCalled();
  });
});

describe('what logging out destroys of the wallet', () => {
  // * one account in its two friendly spellings, and another one
  const SERVED = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
  const SERVED_BOUNCEABLE = 'EQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqB2N';
  const OTHER = 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA';
  const KEY = '11'.repeat(32);
  const OLD_KEY = '22'.repeat(32);

  function record(id: string, address: string, signingKey = KEY, extra?: Partial<WalletCustodyRecord>): WalletCustodyRecord {
    fake.disk.secrets.add('secret:' + id);
    return {recordId: id, address, anchorKey: KEY, signingKey, secretRef: 'secret:' + id, network: 'mainnet', date: 0, ...extra};
  }

  function status(backup: boolean, key = KEY): WalletStatus {
    return {
      presence: 'ready',
      date: 0,
      state: {_: 'walletState', pFlags: backup ? {backup_enabled: true} : {}, address: SERVED, public_key: bytesFromHex(key), balance: '0'}
    };
  }

  const none = {unbacked: 0, parked: 0, rotating: 0, unknown: false};

  beforeEach(() => {
    fake.disk.secrets.clear();
    fake.disk.custody = undefined;
    fake.disk.parked = [];
    fake.disk.broken = false;
  });

  it('loses nothing of a key Telegram\'s backup holds', () => {
    expect(getWalletLoss(record('a', SERVED_BOUNCEABLE), [], status(true))).toEqual(none);
  });

  it('loses the key of the served wallet that no backup holds, or holds an older key of', () => {
    expect(getWalletLoss(record('a', SERVED), [], status(false))).toEqual({...none, unbacked: 1});
    expect(getWalletLoss(record('a', SERVED, KEY, {rotatedSinceBackup: true}), [], status(true))).toEqual({...none, unbacked: 1});
  });

  it('counts the keys of other wallets, not an older phrase of the served one', () => {
    const parked = [record('b', OTHER), record('c', SERVED, OLD_KEY)];
    expect(getWalletLoss(record('a', OTHER), parked, status(true))).toEqual({...none, parked: 2});
  });

  it('counts a key update the chain has not settled', () => {
    const pendingRotation = {recordId: 'n', secretRef: 'secret:n', operationId: 'op', newSigningKey: OLD_KEY, validUntil: 0};
    expect(getWalletLoss(record('a', SERVED, KEY, {pendingRotation}), [], status(true))).toEqual({...none, rotating: 1});
  });

  it('cannot tell what the device\'s key is worth while the served wallet is not known', () => {
    expect(getWalletLoss(record('a', SERVED), [record('b', OTHER)], undefined)).toEqual({...none, parked: 1, unknown: true});
    expect(getWalletLoss(record('a', SERVED), [], {presence: 'error', date: 0})).toEqual({...none, unknown: true});
  });

  it('says it in tdesktop\'s order', () => {
    expect(getWalletLossWarnings(none)).toEqual([]);
    expect(getWalletLossWarnings({unbacked: 1, parked: 2, rotating: 1, unknown: true})).toEqual([
      ['Wallet.Logout.Local', [1]],
      ['Wallet.Logout.Parked', [2]],
      ['Wallet.Logout.Rotating', [1]],
      ['Wallet.Logout.Unknown']
    ]);
  });

  it('reads the vault without asking the server when it holds no key', async() => {
    const getStatus = vi.fn(async() => status(false));
    const orphan = record('a', SERVED);
    fake.disk.secrets.delete(orphan.secretRef);
    fake.disk.custody = orphan;
    expect(await readWalletLoss(1 as UserId, getStatus)).toEqual(none);
    expect(getStatus).not.toHaveBeenCalled();

    fake.disk.custody = record('a', SERVED);
    fake.disk.parked = [record('b', OTHER)];
    expect(await readWalletLoss(1 as UserId, getStatus)).toEqual({...none, unbacked: 1, parked: 1});
  });

  it('warns of what it cannot read', async() => {
    fake.disk.broken = true;
    expect(await readWalletLoss(1 as UserId, async() => status(true))).toEqual({...none, unknown: true});
  });
});
