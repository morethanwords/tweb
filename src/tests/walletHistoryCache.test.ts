/*
 * What a wallet window that opens again starts from, and what keeps a transfer "Sending" past the window and a reload
 * (lib/wallet/historyCache.ts, appWalletManager's window cache), and what the provider's stream may show before the
 * server lists it (lib/wallet/stream.ts). Nothing here talks to a server.
 */

import type {WalletTransaction} from '@layer';
import type {WalletStatus} from '@appManagers/appWalletManager';
import AppWalletManager from '@appManagers/appWalletManager';
import {
  isWalletPendingExpired,
  mergeWalletHistoryHead,
  mergeWalletPending,
  readStoredWalletHistory,
  toStoredWalletHistory,
  WALLET_PENDING_LIFETIME,
  WalletHistoryCache,
  WalletPendingTransfer
} from '@lib/wallet/historyCache';
import {normalizeWalletHash, parseWalletStreamFrame, WALLET_STREAM_ID_PREFIX} from '@lib/wallet/stream';
import bytesToHex from '@helpers/bytes/bytesToHex';
import bytesToBase64 from '@helpers/bytes/bytesToBase64';
import fixBase64String from '@helpers/fixBase64String';
import {canonicalTonAddress} from '@lib/wallet/transferMessages';

// * one account in its friendly and raw spellings, and another one
const WALLET = 'UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI';
const WALLET_RAW = canonicalTonAddress(WALLET);
const OTHER = 'UQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPuwA';
const OTHER_RAW = canonicalTonAddress(OTHER);

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

function transaction(id: string, date: number, extra: Partial<WalletTransaction> = {}): WalletTransaction {
  return {
    _: 'walletTransaction',
    pFlags: {},
    id,
    amount: '-1000000000',
    fee: '1000',
    date,
    peer: {_: 'walletTransactionPeerAddress', address: OTHER},
    ...extra
  };
}

function pendingRow(id: string, date: number, extra: Partial<WalletPendingTransfer> = {}): WalletPendingTransfer {
  return {id, nanograms: '1000000000', address: OTHER, date, ...extra};
}

describe('the rows of a window, kept for the next one', () => {
  it('lets a row go after the send\'s window, and one a clock set back would keep for ever', () => {
    const now = 1_800_000_000_000;
    expect(isWalletPendingExpired({date: now - WALLET_PENDING_LIFETIME}, now)).toBe(false);
    expect(isWalletPendingExpired({date: now - WALLET_PENDING_LIFETIME - 1}, now)).toBe(true);
    expect(isWalletPendingExpired({date: now + WALLET_PENDING_LIFETIME + 1}, now)).toBe(true);
    expect(isWalletPendingExpired({date: NaN}, now)).toBe(true);
  });

  it('writes no comment of a "Sending" row to disk, and reads back everything else', () => {
    const now = Date.now();
    const cache: WalletHistoryCache = {
      address: WALLET,
      history: {items: [transaction('1', 100)], nextOffset: 'next', ended: false},
      nfts: {items: [{_: 'wallet.nftItem', address: OTHER} as any], nextOffset: '', ended: true},
      pending: [pendingRow('a', now, {comment: 'private words', msgHash: 'h', userId: 5 as UserId})]
    };

    const stored = clone(toStoredWalletHistory(cache, [{_: 'user', id: 5, pFlags: {}} as any]));
    expect(JSON.stringify(stored)).not.toContain('private words');
    const read = readStoredWalletHistory(stored, now);
    expect(read.cache).toEqual({...cache, pending: [{...cache.pending[0], comment: undefined}].map(({comment, ...rest}) => rest)});
    expect(read.users).toHaveLength(1);
  });

  it('reads back nothing that is not its own form, and leaves out broken and expired rows', () => {
    const now = Date.now();
    for(const value of [undefined, null, 'x', {}, {version: 2, address: WALLET, pending: []}, {version: 1, address: '', pending: []}]) {
      expect(readStoredWalletHistory(value, now)).toBeUndefined();
    }

    const stored = clone(toStoredWalletHistory({
      address: WALLET,
      pending: [pendingRow('ok', now), pendingRow('old', now - WALLET_PENDING_LIFETIME - 1)]
    }, []));
    stored.pending.push({id: 'broken', nanograms: '-5', address: OTHER, date: now} as any, {id: 7} as any);
    stored.history = {items: [transaction('1', 1), {_: 'walletTransaction'}], nextOffset: '', ended: true} as any;
    const {cache} = readStoredWalletHistory(stored, now);
    expect(cache.pending.map((transfer) => transfer.id)).toEqual(['ok']);
    expect(cache.history.items.map((item) => item.id)).toEqual(['1']);
  });

  it('never keeps a list cut short: its next page would skip what was cut', () => {
    const items = Array.from({length: 101}, (_, index) => transaction(String(index), index));
    const stored = toStoredWalletHistory({address: WALLET, history: {items, nextOffset: 'n', ended: false}, pending: []}, []);
    expect(stored.history).toBeUndefined();
  });

  it('merges two copies of the rows: every row, what either learnt, never one this window let go', () => {
    const local = [pendingRow('a', 3), pendingRow('b', 2, {msgHash: 'hb'})];
    const remote = [pendingRow('a', 3, {msgHash: 'ha'}), pendingRow('b', 2, {failed: true}), pendingRow('c', 1), pendingRow('gone', 4)];
    const merged = mergeWalletPending(local, remote, new Set(['gone']));
    expect(merged).toEqual([
      pendingRow('a', 3, {msgHash: 'ha'}),
      pendingRow('b', 2, {msgHash: 'hb', failed: true}),
      pendingRow('c', 1)
    ]);

    // * a copy that is behind takes nothing back, and nothing changed is the same list
    expect(mergeWalletPending(merged, [pendingRow('a', 3), pendingRow('b', 2)], new Set())).toBe(merged);
  });

  it('puts another session\'s transfer at the head of the first page, the next page where it was', () => {
    const head = {items: [transaction('1', 10)], nextOffset: 'n', ended: false};
    const merged = mergeWalletHistoryHead(head, [transaction('2', 20), transaction('1', 10)]);
    expect(merged.items.map((item) => item.id)).toEqual(['2', '1']);
    expect(merged.nextOffset).toBe('n');
    expect(mergeWalletHistoryHead(head, [transaction('1', 10)])).toBe(head);
  });
});

describe('the manager\'s window cache', () => {
  function makeManager(disk: {[key: string]: any}, address = WALLET) {
    const manager = new AppWalletManager();
    const dispatchEvent = vi.fn();
    const invokeApi = vi.fn();
    const status: WalletStatus = {
      presence: 'ready',
      date: Date.now(),
      state: {_: 'walletState', pFlags: {}, address, public_key: new Uint8Array(32), balance: '5000000000'}
    };

    Object.assign(manager, {
      status,
      apiManager: {invokeApi, getConfig: async() => ({})},
      appStateManager: {storage: {
        get: async(key: string) => clone(disk[key]),
        set: async(object: any) => Object.assign(disk, clone(object))
      }},
      appPeersManager: {saveApiPeers: vi.fn()},
      appUsersManager: {getUser: (id: UserId): any => id === 5 ? {_: 'user', id: 5, pFlags: {}} : undefined, getUserInput: () => ({_: 'inputUserEmpty'})},
      appWebDocsManager: {saveWebDocument: (document: any) => document},
      apiUpdatesManager: {processUpdateMessage: vi.fn()},
      appMessagesManager: {createGramTransferDraft: vi.fn(), failGramTransferDraft: vi.fn(), dropGramTransferDraft: vi.fn()},
      rootScope: {dispatchEvent},
      log: Object.assign(vi.fn(), {error: vi.fn()})
    });

    return {manager, dispatchEvent, invokeApi, any: manager as any};
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.useFakeTimers({toFake: ['Date']});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps what changed in the dApp sessions while their list was being fetched', async() => {
    const {manager, invokeApi, any} = makeManager({});
    let answer: (value: any) => void;
    invokeApi.mockImplementation((method: string) => {
      if(method === 'wallet.tonConnectGetSessions') return new Promise((resolve) => answer = resolve);
      if(method === 'wallet.tonConnectCloseSession') return Promise.resolve(true);
    });
    const session = (id: string, date: number) => ({_: 'tonConnectSession', id, date, pFlags: {}});
    const fetching = manager.getTonConnectSessions(true);

    await manager.tonConnectCloseSession('5');
    any.onUpdateWalletTonConnectSession({_: 'updateWalletTonConnectSession', session: session('7', 3)});
    answer({_: 'wallet.tonConnectSessions', sessions: [session('5', 1), session('6', 2)]});
    expect((await fetching).map((item) => item.id)).toEqual(['7', '6']);
    expect(manager.getCachedTonConnectSession('5')).toBeUndefined();
  });

  it('asks the server again when a change answers after a newer state came in', async() => {
    const {manager, invokeApi, any} = makeManager({});
    const fresh = {_: 'walletState', pFlags: {}, address: 'UQ-new', public_key: new Uint8Array(32).fill(2), balance: '0'};
    let answer: (value: any) => void, early: (value: any) => void;
    let reads = 0;
    invokeApi.mockImplementation((method: string) => {
      if(method === 'wallet.disableBackup') return new Promise((resolve) => answer = resolve);
      // * a read already out when the change was made answers with what was before it
      if(method === 'wallet.getState') return ++reads === 1 ? new Promise((resolve) => early = resolve) : Promise.resolve(fresh);
    });
    const polling = manager.getStatus(true);
    const disabling = manager.disableBackup({newPublicKey: new Uint8Array(32), proof: undefined} as any);

    // * another device replaced the wallet meanwhile
    any.onUpdateWalletState({_: 'updateWalletState', state: {...fresh, public_key: new Uint8Array(32).fill(1)}});
    answer({_: 'walletState', pFlags: {}, address: WALLET, public_key: new Uint8Array(32), balance: '5000000000'});
    expect((await disabling).state.address).toBe('UQ-new');
    expect(reads).toBe(2);
    expect(manager.getCachedStatus().state.public_key[0]).toBe(2);
    early({_: 'walletState', pFlags: {}, address: WALLET, public_key: new Uint8Array(32), balance: '1'});
    await polling;
    expect(manager.getCachedStatus().state.public_key[0]).toBe(2);
  });

  it('reads again when an update overtakes the read made after a change, and lets the newest stand', async() => {
    const {manager, invokeApi, any} = makeManager({});
    const state = (fill: number) => ({_: 'walletState', pFlags: {}, address: 'UQ-' + fill, public_key: new Uint8Array(32).fill(fill), balance: '0'});
    let answer: (value: any) => void;
    let reads = 0;
    invokeApi.mockImplementation(async(method: string) => {
      if(method === 'wallet.disableBackup') return new Promise((resolve) => answer = resolve);
      if(method === 'wallet.getState') {
        ++reads;
        // * every read is overtaken by an update that lands while it is out
        any.onUpdateWalletState({_: 'updateWalletState', state: state(10 + reads)});
        return state(reads);
      }
    });
    const disabling = manager.disableBackup({newPublicKey: new Uint8Array(32), proof: undefined} as any);
    any.onUpdateWalletState({_: 'updateWalletState', state: state(9)});
    answer(state(1));
    expect((await disabling).state.public_key[0]).toBe(13);
    expect(reads).toBe(3);
  });

  it('never takes an answer read before a newer state came in', async() => {
    const {manager, invokeApi, any} = makeManager({});
    let answer: (value: any) => void;
    invokeApi.mockImplementation((method: string) => method === 'wallet.getState' ? new Promise((resolve) => answer = resolve) : undefined);
    const fetching = manager.getStatus(true);

    // * the wallet was replaced meanwhile: the update names the new one
    const replaced = {_: 'walletState', pFlags: {}, address: 'UQ-new', public_key: new Uint8Array(32).fill(1), balance: '0'};
    any.onUpdateWalletState({_: 'updateWalletState', state: replaced});
    answer({_: 'walletState', pFlags: {backup_enabled: true}, address: WALLET, public_key: new Uint8Array(32), balance: '5000000000'});
    await fetching;
    expect(manager.getCachedStatus().state.address).toBe('UQ-new');
  });

  it('keeps a "Sending" row past a reload of the page, until the send\'s window closes', async() => {
    const disk = {};
    const first = makeManager(disk);
    await first.manager.addPendingTransfer(WALLET, pendingRow('op', Date.now(), {comment: 'hi', msgHash: 'h'}));
    await flush();

    // * a new worker: what the old one wrote is all there is
    const second = makeManager(disk);
    const restored = await second.manager.getHistoryCache(WALLET);
    expect(restored).toMatchObject({address: WALLET, pending: [{id: 'op', msgHash: 'h'}]});
    expect(restored.pending[0]).not.toHaveProperty('comment');

    await second.manager.updatePendingTransfer(WALLET, 'op', {failed: true});
    await flush();
    expect(await makeManager(disk).manager.getPendingTransfers(WALLET)).toMatchObject([{id: 'op', failed: true}]);

    vi.setSystemTime(Date.now() + WALLET_PENDING_LIFETIME + 1);
    expect(await makeManager(disk).manager.getPendingTransfers(WALLET)).toEqual([]);
  });

  it('lets a row go when the window settled it', async() => {
    const {manager} = makeManager({});
    await manager.addPendingTransfer(WALLET, pendingRow('op', Date.now()));
    await manager.removePendingTransfer(WALLET, 'op');
    expect(await manager.getPendingTransfers(WALLET)).toEqual([]);
  });

  it('shows no wallet the rows of another, and takes no change for a wallet the status does not name', async() => {
    const disk = {};
    const {manager} = makeManager(disk);
    await manager.addPendingTransfer(WALLET, pendingRow('op', Date.now()));
    await manager.addPendingTransfer(OTHER, pendingRow('stray', Date.now()));
    await manager.removePendingTransfer(OTHER, 'op');
    expect((await manager.getPendingTransfers(WALLET)).map((transfer) => transfer.id)).toEqual(['op']);
    expect(await manager.getHistoryCache(OTHER)).toBeUndefined();
    // * the raw spelling of the same wallet is the same wallet
    expect(await manager.getHistoryCache(WALLET_RAW)).toBeDefined();

    // * the wallet replaced: the old one's rows are dropped with its lists
    const replaced = makeManager(disk, OTHER);
    await replaced.manager.addPendingTransfer(OTHER, pendingRow('new', Date.now()));
    expect(await replaced.manager.getHistoryCache(WALLET)).toBeUndefined();
    expect((await replaced.manager.getPendingTransfers(OTHER)).map((transfer) => transfer.id)).toEqual(['new']);
  });

  it('keeps the first page of the history and of the collectibles, not the pages after', async() => {
    const {manager, invokeApi} = makeManager({});
    invokeApi.mockImplementation(async(method: string, params: any) => method === 'wallet.getNfts' ?
      {_: 'wallet.nftItems', items: params.offset ? [] : [{_: 'wallet.nftItem', address: OTHER}], next_offset: 'n2'} :
      {_: 'wallet.transactions', transactions: params.offset ? [transaction('old', 1)] : [transaction('new', 2)], next_offset: 'n1', users: [], chats: []});

    await manager.getTransactions('');
    await manager.getTransactions('n1');
    await manager.getNfts('');
    await manager.getNfts('n2');
    await flush();
    const cache = await manager.getHistoryCache(WALLET);
    expect(cache.history).toEqual({items: [transaction('new', 2)], nextOffset: 'n1', ended: false});
    expect(cache.nfts).toMatchObject({items: [{address: OTHER}], nextOffset: 'n2', ended: false});
  });

  it('writes the first page again only when it changed: the poll asks for it every half a minute', async() => {
    vi.useFakeTimers();
    const {manager, invokeApi, any} = makeManager({});
    const set = vi.spyOn(any.appStateManager.storage, 'set');
    const page = (id: string) => ({_: 'wallet.transactions', transactions: [transaction(id, 1)], next_offset: '', users: [] as any[], chats: [] as any[]});
    invokeApi.mockResolvedValueOnce(page('1')).mockResolvedValueOnce(page('1')).mockResolvedValueOnce(page('2'));
    for(let i = 0; i < 3; ++i) {
      await manager.getTransactions('');
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(set).toHaveBeenCalledTimes(2);
  });

  it('lists another session\'s transfer at once, never one of this device\'s', async() => {
    const {manager, invokeApi, dispatchEvent, any} = makeManager({});
    invokeApi.mockResolvedValueOnce({_: 'wallet.transactions', transactions: [transaction('1', 1)], next_offset: '', users: [], chats: []});
    await manager.getTransactions('');
    await flush();

    // * this device's own: the receipt in the answer to its send
    const receipt = (hash: string, id: string) => ({_: 'updateSentWalletTransaction', pFlags: {}, msg_hash: hash, transaction: transaction(id, 5)});
    invokeApi.mockResolvedValueOnce({_: 'updates', updates: [receipt('own', 'mine')], users: [], chats: [], date: 0, seq: 0});
    await manager.sendTransfer({dataNormal: new Uint8Array([1])});
    any.onUpdateSentWalletTransaction(receipt('own', 'mine'));
    any.onUpdateSentWalletTransaction(receipt('foreign', 'theirs'));
    await flush();

    expect(dispatchEvent).toHaveBeenCalledWith('wallet_transfer_sent', expect.objectContaining({msgHash: 'own', own: true}));
    expect(dispatchEvent).toHaveBeenCalledWith('wallet_transfer_sent', expect.objectContaining({msgHash: 'foreign', own: false}));
    expect((await manager.getHistoryCache(WALLET)).history.items.map((item) => item.id)).toEqual(['theirs', '1']);
  });

  it('takes a receipt pushed while a transfer is on its way for the transfer\'s own', async() => {
    const {manager, invokeApi, dispatchEvent, any} = makeManager({});
    let answer: (value: any) => void;
    invokeApi.mockReturnValueOnce(new Promise((resolve) => answer = resolve));
    const sending = manager.sendTransfer({dataNormal: new Uint8Array([1])});
    any.onUpdateSentWalletTransaction({_: 'updateSentWalletTransaction', pFlags: {}, msg_hash: 'early'});
    answer({_: 'updates', updates: [{_: 'updateSentWalletTransaction', pFlags: {}, msg_hash: 'early'}], users: [], chats: [], date: 0, seq: 0});
    await sending;
    expect(dispatchEvent).toHaveBeenCalledWith('wallet_transfer_sent', expect.objectContaining({msgHash: 'early', own: true}));
  });

  it('shows a finalized balance from the stream, which the server\'s lagging copy does not undo', () => {
    const {manager, any} = makeManager({});
    const served = (balance: string) => any.applyState({_: 'walletState', pFlags: {}, address: WALLET, public_key: new Uint8Array(32), balance});

    manager.applyStreamBalance(OTHER, '1');
    manager.applyStreamBalance(WALLET, 'not a number');
    expect(manager.getCachedStatus().state.balance).toBe('5000000000');

    manager.applyStreamBalance(WALLET_RAW, '7000000000');
    expect(manager.getCachedStatus().state.balance).toBe('7000000000');
    // * the server still names the balance the frame replaced: the frame's stands
    served('5000000000');
    expect(manager.getCachedStatus().state.balance).toBe('7000000000');
    // * any other answer is news
    served('9000000000');
    expect(manager.getCachedStatus().state.balance).toBe('9000000000');

    // * only for a while: past it the server is right again
    manager.applyStreamBalance(WALLET, '8000000000');
    vi.setSystemTime(Date.now() + 31e3);
    served('9000000000');
    expect(manager.getCachedStatus().state.balance).toBe('9000000000');
  });

  it('reconnects on the last streaming URL while it holds, when no fresh one can be had', async() => {
    const {manager, invokeApi} = makeManager({});
    const now = Math.floor(Date.now() / 1000);
    invokeApi.mockResolvedValueOnce({_: 'toncenter.streamingUrl', url: 'wss://a', expires: now + 600});
    expect(await manager.getStreamingUrl()).toMatchObject({url: 'wss://a', expires: now + 600});

    invokeApi.mockRejectedValueOnce({type: 'TIMEOUT'});
    expect(await manager.getStreamingUrl()).toMatchObject({url: 'wss://a'});

    vi.setSystemTime(Date.now() + 500e3);
    invokeApi.mockRejectedValueOnce({type: 'TIMEOUT'});
    await expect(manager.getStreamingUrl()).rejects.toMatchObject({type: 'TIMEOUT'});

    // * seconds from now for a small value: always a unix time from here on
    invokeApi.mockResolvedValueOnce({_: 'toncenter.streamingUrl', url: 'wss://b', expires: 300});
    expect((await manager.getStreamingUrl()).expires).toBe(Math.floor(Date.now() / 1000) + 300);
  });
});

describe('the provider\'s stream, as data', () => {
  const HASH = new Uint8Array(32).map((_, index) => index * 7);
  const HASH_HEX = bytesToHex(HASH);
  const HASH_BASE64 = bytesToBase64(HASH);

  it('reads one hash however it is written', () => {
    expect(normalizeWalletHash(HASH_BASE64)).toBe(HASH_HEX);
    expect(normalizeWalletHash(fixBase64String(HASH_BASE64, true))).toBe(HASH_HEX);
    expect(normalizeWalletHash(HASH_HEX.toUpperCase())).toBe(HASH_HEX);
    expect(normalizeWalletHash('something else')).toBe('something else');
    expect(normalizeWalletHash(undefined)).toBe('');
  });

  const frame = (value: object) => JSON.stringify(value);

  it('takes the balance of this wallet only, a whole number only', () => {
    const state = (account: string, balance: any, finality = 'finalized') => parseWalletStreamFrame(frame({type: 'account_state_change', account, finality, state: {balance}}), WALLET);
    expect(state(WALLET_RAW, '123')).toEqual({type: 'state', finality: 'finalized', balance: '123'});
    expect(state(WALLET_RAW, '123', 'confirmed')).toMatchObject({finality: 'confirmed'});
    expect(state(OTHER_RAW, '123')).toBeUndefined();
    expect(state(WALLET_RAW, '-1')).toBeUndefined();
    expect(state(WALLET_RAW, 12)).toBeUndefined();
    expect(parseWalletStreamFrame('{', WALLET)).toBeUndefined();
    expect(parseWalletStreamFrame('x'.repeat(4 * 1024 * 1024 + 1), WALLET)).toBeUndefined();
  });

  function incomingTransaction(overrides: any = {}, message: any = {}) {
    return {
      account: WALLET_RAW,
      hash: HASH_BASE64,
      lt: '4000',
      now: 1_790_000_000,
      total_fees: '100',
      description: {aborted: false, compute_ph: {skipped: false, success: true}},
      in_msg: {source: OTHER_RAW, destination: WALLET_RAW, value: '2500000000', opcode: '0x00000000', bounced: false, ...message},
      out_msgs: [],
      ...overrides
    };
  }

  const transactions = (list: any[], finality = 'finalized') => parseWalletStreamFrame(frame({
    type: 'transactions',
    finality,
    trace_external_hash_norm: 'trace',
    transactions: list,
    address_book: {[OTHER_RAW]: {user_friendly: OTHER}}
  }), WALLET);

  it('shows a plain transfer in from a finalized trace, as the history would list it', () => {
    expect(transactions([incomingTransaction()])).toEqual({
      type: 'transactions',
      finality: 'finalized',
      traceId: 'trace',
      outgoing: false,
      incoming: [{
        _: 'walletTransaction',
        pFlags: {incoming: true},
        id: WALLET_STREAM_ID_PREFIX + '4000:' + HASH_BASE64,
        amount: '2500000000',
        fee: '100',
        date: 1_790_000_000,
        peer: {_: 'walletTransactionPeerAddress', address: OTHER},
        tx_hash: HASH_BASE64
      }]
    });

    // * an empty body and a private comment are plain transfers too
    expect(transactions([incomingTransaction({}, {opcode: null})])).toMatchObject({incoming: [{amount: '2500000000'}]});
    expect(transactions([incomingTransaction({}, {opcode: '0x2167DA4B'})])).toMatchObject({incoming: [{amount: '2500000000'}]});
  });

  it('shows nothing it cannot vouch for: a trace not final, a token\'s or a collectible\'s message, a bounce, an emulation', () => {
    const none = [
      transactions([incomingTransaction()], 'confirmed'),
      transactions([incomingTransaction()], 'pending'),
      transactions([incomingTransaction({}, {opcode: '0x7362d09c'})]),
      transactions([incomingTransaction({}, {opcode: undefined})]),
      transactions([incomingTransaction({}, {bounced: true})]),
      transactions([incomingTransaction({}, {value: '0'})]),
      transactions([incomingTransaction({}, {source: WALLET_RAW})]),
      transactions([incomingTransaction({emulated: true})]),
      transactions([incomingTransaction({out_msgs: [{destination: OTHER_RAW, value: '1'}]})]),
      transactions([incomingTransaction({description: {aborted: true}})]),
      transactions([incomingTransaction({description: {compute_ph: {skipped: false, success: false}}})])
    ];

    none.forEach((event, index) => expect(event, String(index)).toMatchObject({type: 'transactions', incoming: []}));
    // * another account's transaction is no frame of this wallet's
    expect(transactions([incomingTransaction({account: OTHER_RAW})])).toBeUndefined();
  });

  it('writes a sender the provider names oddly the way a wallet shows people', () => {
    const event = parseWalletStreamFrame(frame({
      type: 'transactions',
      finality: 'finalized',
      trace_external_hash_norm: 'trace',
      transactions: [incomingTransaction()],
      address_book: {[OTHER_RAW]: {user_friendly: WALLET}}
    }), WALLET);
    expect(event.type === 'transactions' && (event.incoming[0].peer as any).address).toBe(OTHER);
  });

  it('tells the trace of a message this wallet sent, and a trace rolled back', () => {
    const external = incomingTransaction({}, {source: null, value: null, opcode: null});
    expect(transactions([external], 'confirmed')).toMatchObject({outgoing: true, incoming: []});
    expect(parseWalletStreamFrame(frame({type: 'trace_invalidated', trace_external_hash_norm: 'trace'}), WALLET)).toEqual({type: 'invalidated', traceId: 'trace'});
    expect(parseWalletStreamFrame(frame({type: 'trace_invalidated'}), WALLET)).toBeUndefined();
  });
});
