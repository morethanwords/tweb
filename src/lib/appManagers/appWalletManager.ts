/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getUpdatesList} from '@lib/calls/helpers/groupCallUpdates';
import type {
  InputCheckPasswordSRP,
  InputWalletReplacement,
  PaymentsCurrencyRates,
  TonConnectSession,
  ToncenterStreamingUrl,
  Update,
  Updates,
  WalletHolderDc,
  WalletOwnershipProof,
  WalletSecretPhraseParts,
  WalletState,
  WalletTonConnectPending,
  WalletTransaction,
  WalletTransactions,
  WalletUserAddress,
  WebDocument
} from '@layer';
import type {DcId, InvokeApiOptions} from '@types';
import {AppManager} from '@appManagers/manager';
import {randomLong} from '@helpers/random';
import makeError from '@helpers/makeError';
import ctx from '@environment/ctx';
import {GRAM_TRANSFER_RESOLUTION_TIMEOUT, GramTransferDraftContent, isDefiniteTransferRefusal} from '@lib/wallet/transferMessages';
import {
  ADDRESS_INFORMATION_ENDPOINT,
  JSON_RPC_ENDPOINT,
  makeSigningKeyRequestPayload,
  parseWalletAddressFunds,
  parseWalletSigningKey,
  WalletAddressFunds
} from '@lib/wallet/addressFunds';
import {
  createWalletHistory,
  getWalletHistoryUserIds,
  isSameWalletAddress,
  isSameWalletList,
  mergeWalletHistoryHead,
  pruneWalletHistory,
  readStoredWalletHistory,
  toStoredWalletHistory,
  WALLET_PENDING_LIMIT,
  WalletHistoryCache,
  WalletPendingTransfer
} from '@lib/wallet/historyCache';
import withTimeout from '@helpers/schedulers/withTimeout';

/**
 * Where the account's wallet stands, as `wallet.getState` reports it.
 * `provisioning` - the server is still creating it, poll again;
 * `missing` - the account has none (only a replace can make one);
 * `unavailable` - the server refuses the wallet to this account.
 */
export type WalletPresence = 'unknown' | 'unavailable' | 'provisioning' | 'missing' | 'ready' | 'error';

export type WalletStatus = {
  presence: WalletPresence,
  state?: WalletState.walletState,
  /** unix ms of the answer */
  date: number,
  error?: string
};

export type WalletToncenterRequest = {
  post?: boolean,
  endpoint: string,
  query?: string,
  payload?: string
};

export type WalletGaslessInfo = Omit<Update.updateWalletGaslessInfo, '_' | 'pFlags' | 'flags'> & {
  available: boolean,
  /** unix ms of the answer */
  date: number
};

export type WalletSentTransfer = {
  msgHash: string,
  gasless: boolean,
  transaction?: WalletTransaction,
  /** handed to the server from this device; otherwise another session of the account sent it, or its answer was lost */
  own?: boolean
};

/** a dApp's request as the service chat names it: its message id is the request's `msg_id` */
export type WalletTonConnectRequestAction = {
  sessionId: string,
  msgId: number,
  expires: number,
  /** the request's method, when the server names it: `disconnect` is answered without asking */
  topic?: string,
  accepted: boolean,
  declined: boolean
};

export type WalletRates = {
  /** fiat units per GRAM, by currency code */
  rates: {[currency: string]: number},
  date: number
};

/** the server caches the chain balance for ~30 s, asking more often is wasted */
const STATE_REFRESH_INTERVAL = 60e3;
const RATES_REFRESH_INTERVAL = 5 * 60e3;
const USER_ADDRESS_TTL = 10 * 60e3;
const TONCENTER_TIMEOUT = 15e3;
/** the server holds a transfer for up to 30 s before it answers */
const SEND_TIMEOUT = 40e3;
const GASLESS_INFO_TIMEOUT = 15e3;
/** reads of the state after a change that another state overtook, before the newest update is let stand */
const STATE_READ_ATTEMPTS = 3;
/** the largest copy of a signed transfer wallet.sendTransfer takes */
const TRANSFER_DATA_MAX_BYTES = 16 * 1024;
/** buying GRAM goes through Telegram's own provider, a bot's Mini App, as on iOS */
const ONRAMP_CRYPTO_CURRENCY = 'gram';
const ONRAMP_PROVIDER = 'wallet';
/** the window's last lists in the account's own storage: read when a window first asks, never mirrored to the tabs */
const HISTORY_STORAGE_KEY: any = 'wallet_history';
/** a burst of answers is one write; a change of the "Sending" rows is written at once */
const HISTORY_SAVE_DELAY = 1e3;
/** the server caches the chain for ~30 s: its answer may still name the balance a finalized stream frame replaced */
const STREAM_BALANCE_HOLD = 30e3;
/** the last streaming URL stands in for a fresh one only with this much of its life left */
const STREAM_URL_FALLBACK_MARGIN = 2 * 60e3;

export default class AppWalletManager extends AppManager {
  private status: WalletStatus = {presence: 'unknown', date: 0};
  private statusPromise: Promise<WalletStatus>;
  /** counts the states taken in: a fetch that started before the last one answers with an older state */
  private stateEpoch = 0;
  private gasless: WalletGaslessInfo;
  private gaslessPromise: Promise<WalletGaslessInfo>;
  private rates: WalletRates;
  private ratesPromise: Promise<WalletRates>;
  private userAddresses: Map<UserId, {address: WalletUserAddress, date: number}> = new Map();
  /** TON Connect sessions by id, as the server last described them; a closed one leaves */
  private tonConnectSessions: Map<string, TonConnectSession> = new Map();
  private tonConnectSessionsLoaded = false;
  private tonConnectSessionsPromise: Promise<TonConnectSession[]>;
  /** what changed while the list was being fetched: the list read before it, so these stand over it (closed ones too) */
  private tonConnectSessionChanges: Map<string, TonConnectSession>;
  /** the domain of the server's wallet-ownership challenge: no dApp gets a proof for it */
  private ownershipDomain: string;
  /** what the wallet window showed last (lib/wallet/historyCache.ts): the next one starts from it */
  private history: WalletHistoryCache;
  private historyLoad: Promise<void>;
  private historySaveTimer: number;
  /** the message hashes of the transfers this worker handed to the server, by when: their receipts are this device's */
  private ownSentHashes: Map<string, number>;
  private sendsInFlight: number;
  /** a finalized balance from the stream, and the ones it replaced: the server's lagging answer must not bring them back */
  private streamBalance: {address: string, balance: string, replaced: string[], date: number};
  private streamingUrl: {url: string, expiresAt: number};

  protected after() {
    this.clear = () => {
      this.status = {presence: 'unknown', date: 0};
      this.statusPromise = undefined;
      this.gasless = undefined;
      this.gaslessPromise = undefined;
      this.rates = undefined;
      this.ratesPromise = undefined;
      this.userAddresses.clear();
      this.tonConnectSessions.clear();
      this.tonConnectSessionsLoaded = false;
      this.tonConnectSessionsPromise = undefined;
      this.ownershipDomain = undefined;
      this.history = undefined;
      this.historyLoad = undefined;
      clearTimeout(this.historySaveTimer);
      this.ownSentHashes = undefined;
      this.streamBalance = undefined;
      this.streamingUrl = undefined;
    };

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateWalletState: this.onUpdateWalletState,
      updateSentWalletTransaction: this.onUpdateSentWalletTransaction,
      updateWalletGaslessInfo: this.onUpdateWalletGaslessInfo,
      updateWalletTonConnectSession: this.onUpdateWalletTonConnectSession,
      updateWalletTonConnectPendingDisconnect: this.onUpdateWalletTonConnectPendingDisconnect
    });
  }

  // MARK: State

  public getCachedStatus() {
    return this.status;
  }

  public getStatus(force?: boolean): Promise<WalletStatus> {
    if(this.statusPromise) {
      return this.statusPromise;
    }

    if(!force && this.status.presence !== 'unknown' && (Date.now() - this.status.date) < STATE_REFRESH_INTERVAL) {
      return Promise.resolve(this.status);
    }

    const epoch = this.stateEpoch;
    return this.statusPromise = this.apiManager.invokeApi('wallet.getState').then((state) => {
      // * an update, or the answer to a change (a replaced wallet, a backup switched), came while this was out: it is
      // * newer than what this answer read
      if(this.stateEpoch !== epoch) {
        return this.status;
      }

      return this.applyState(state);
    }, (err: ApiError) => {
      if(this.stateEpoch !== epoch) {
        return this.status;
      }

      const presence: WalletPresence = err.type === 'WALLET_UNAVAILABLE' ? 'unavailable' : 'error';
      // * a failed refresh keeps a known state: the next poll tries again
      if(presence === 'error' && this.status.presence === 'ready') {
        return this.status;
      }

      return this.setStatus({presence, date: Date.now(), error: err.type});
    }).finally(() => {
      this.statusPromise = undefined;
    });
  }

  /**
   * The state a change answered with (backup switched, wallet replaced): taken unless another one came in while the
   * change was out — which of the two is newer cannot be told, so the server is asked what holds now
   */
  private applyChangedState(state: WalletState, epoch: number) {
    return this.stateEpoch === epoch ? this.applyState(state) : this.readStateAfterChange();
  }

  /**
   * One rule for every answer: it is taken only if no state came in while it was out (an update is pushed once its
   * change is made, so the last one in is never older than a read that started before it). A read of its own — one
   * already out left before the change — tried a few times; past that, the newest update in stands. A read that
   * fails leaves it unresolved: it throws.
   */
  private async readStateAfterChange(): Promise<WalletStatus> {
    for(let attempt = 0; attempt < STATE_READ_ATTEMPTS; ++attempt) {
      const epoch = this.stateEpoch;
      const state = await this.apiManager.invokeApi('wallet.getState');
      if(this.stateEpoch === epoch) {
        return this.applyState(state);
      }
    }

    return this.status;
  }

  private applyState(state: WalletState) {
    ++this.stateEpoch;
    let presence: WalletPresence;
    if(state._ === 'walletStateEmpty') {
      presence = state.pFlags.creating ? 'provisioning' : 'missing';
    } else {
      presence = 'ready';
    }

    let walletState = state._ === 'walletState' ? state : undefined;
    // * the server's cached copy of the balance a finalized frame just replaced: the frame's stands (Android); any other
    // * answer is news and is taken
    const held = this.streamBalance;
    if(
      walletState && held &&
      Date.now() - held.date < STREAM_BALANCE_HOLD &&
      held.replaced.includes(String(walletState.balance)) &&
      isSameWalletAddress(walletState.address, held.address)
    ) {
      walletState = {...walletState, balance: held.balance};
    }

    return this.setStatus({
      presence,
      state: walletState,
      date: Date.now()
    });
  }

  /**
   * A finalized balance the provider's stream reported (lib/wallet/stream.ts): a finalized one can no longer change,
   * a confirmed one could, so only that is taken — iOS takes a confirmed one too, Android only this. For the wallet the
   * status names only.
   */
  public applyStreamBalance(address: string, balance: string) {
    const status = this.status, state = status.state;
    if(status.presence !== 'ready' || !state || !isSameWalletAddress(state.address, address) || !/^\d{1,30}$/.test(balance)) {
      return;
    }

    const current = String(state.balance);
    if(current === balance) {
      return;
    }

    // * every balance frames replaced while the server may still name it
    const now = Date.now(), held = this.streamBalance;
    const replaced = held && now - held.date < STREAM_BALANCE_HOLD && held.address === state.address ? held.replaced : [];
    this.streamBalance = {address: state.address, balance, replaced: [...replaced.filter((value) => value !== balance), current], date: now};
    this.setStatus({...status, state: {...state, balance}});
  }

  private setStatus(status: WalletStatus) {
    this.status = status;
    this.rootScope.dispatchEvent('wallet_status', status);
    return status;
  }

  private onUpdateWalletState = (update: Update.updateWalletState) => {
    this.applyState(update.state);
  };

  // MARK: History

  private saveTransactions<T extends WalletTransactions>(result: T) {
    this.appPeersManager.saveApiPeers(result);
    return result;
  }

  public getTransactions(offset: string, limit = 50) {
    // * the first page is what the next window starts from: kept for the wallet it was asked for
    const address = offset ? undefined : this.status.state?.address;
    return this.apiManager.invokeApi('wallet.getTransactions', {
      offset,
      limit
    }).then((result) => {
      this.saveTransactions(result);
      if(address) this.updateHistory(address, (cache) => {
        const history = {items: result.transactions, nextOffset: result.next_offset || '', ended: !result.next_offset || !result.transactions.length};
        // * the poll asks for it every half a minute: nothing is written when nothing changed
        if(isSameWalletList(cache.history, history)) return false;
        cache.history = history;
      });

      return result;
    });
  }

  public getTransactionsByIds(ids: string[]) {
    return this.apiManager.invokeApi('wallet.getTransactionsByIDs', {
      id: ids
    }).then((result) => this.saveTransactions(result));
  }

  public getTransactionsByMsgHash(hashes: string[]) {
    return this.apiManager.invokeApi('wallet.getTransactionsByMsgHash', {
      msg_hash: hashes
    }).then((result) => this.saveTransactions(result));
  }

  // MARK: Collectibles

  /**
   * The wallet's NFTs. Their pictures come through `upload.getWebFile` only: a no-proxy document would have the
   * browser fetch a third-party URL, which the desktop client refuses too.
   */
  public async getNfts(offset: string, limit = 20) {
    const address = offset ? undefined : this.status.state?.address;
    const result = await this.apiManager.invokeApi('wallet.getNfts', {offset, limit});
    result.items.forEach((item) => {
      const keep = (document: WebDocument) => document?._ === 'webDocument' ? this.appWebDocsManager.saveWebDocument(document) : undefined;
      item.image = keep(item.image);
      item.image_small = keep(item.image_small);
      // * the header plays it over the picture (lib/wallet/nftKind.ts `getWalletNftLottie`)
      item.lottie = keep(item.lottie);
    });

    if(address) this.updateHistory(address, (cache) => {
      const nfts = {items: result.items, nextOffset: result.next_offset || '', ended: !result.next_offset || !result.items.length};
      if(isSameWalletList(cache.nfts, nfts)) return false;
      cache.nfts = nfts;
    });

    return result;
  }

  // MARK: Window cache

  /**
   * What the window showed last for the wallet at `address` — the first pages of its lists and the transfers still
   * "Sending" — from this worker, or from disk after a reload; nothing for another wallet. A copy: the window feeds
   * changes back through the methods below.
   */
  public async getHistoryCache(address: string): Promise<WalletHistoryCache | undefined> {
    await this.loadHistory();
    const cache = this.history;
    if(!cache || !isSameWalletAddress(cache.address, address)) {
      return;
    }

    if(pruneWalletHistory(cache, Date.now())) this.saveHistory(true);
    return cache;
  }

  /** the "Sending" rows of the wallet at `address`, as every window of this account left them */
  public async getPendingTransfers(address: string): Promise<WalletPendingTransfer[]> {
    return (await this.getHistoryCache(address))?.pending || [];
  }

  public addPendingTransfer(address: string, transfer: WalletPendingTransfer) {
    return this.updateHistory(address, (cache) => {
      cache.pending = [transfer, ...cache.pending.filter((item) => item.id !== transfer.id)].slice(0, WALLET_PENDING_LIMIT);
    }, true);
  }

  public updatePendingTransfer(address: string, id: string, patch: Partial<Omit<WalletPendingTransfer, 'id'>>) {
    return this.updateHistory(address, (cache) => {
      const index = cache.pending.findIndex((transfer) => transfer.id === id);
      if(index === -1) return false;
      cache.pending = cache.pending.slice();
      cache.pending[index] = {...cache.pending[index], ...patch};
    }, true);
  }

  public removePendingTransfer(address: string, id: string) {
    return this.updateHistory(address, (cache) => {
      const pending = cache.pending.filter((transfer) => transfer.id !== id);
      if(pending.length === cache.pending.length) return false;
      cache.pending = pending;
    }, true);
  }

  /** the cache on disk, read once per worker: whatever this worker learnt meanwhile is newer and stays */
  private loadHistory() {
    return this.historyLoad ??= this.appStateManager.storage.get(HISTORY_STORAGE_KEY).then((value) => {
      const stored = readStoredWalletHistory(value, Date.now());
      if(!stored) return;
      // * the users its rows name, unless this worker knows them already
      this.appPeersManager.saveApiPeers({users: stored.users.filter((user) => !this.appUsersManager.getUser(user.id))});
      const cache = this.history;
      if(!cache) {
        this.history = stored.cache;
      } else if(isSameWalletAddress(cache.address, stored.cache.address)) {
        cache.history ??= stored.cache.history;
        cache.nfts ??= stored.cache.nfts;
        const known = new Set(cache.pending.map((transfer) => transfer.id));
        cache.pending = [...cache.pending, ...stored.cache.pending.filter((transfer) => !known.has(transfer.id))]
        .sort((a, b) => b.date - a.date);
      }
    }, () => {});
  }

  /**
   * Changes the cache of the wallet at `address` — only of the wallet the status names: a window behind on it must not
   * take another wallet's rows away. `mutate` returning false changed nothing.
   */
  private async updateHistory(address: string, mutate: (cache: WalletHistoryCache) => boolean | void, saveNow?: boolean) {
    await this.loadHistory();
    const state = this.status.state;
    if(!address || (state && !isSameWalletAddress(state.address, address))) {
      return;
    }

    // * another wallet's lists and rows never apply to this one (tdesktop drops a foreign record too)
    if(!this.history || !isSameWalletAddress(this.history.address, address)) {
      this.history = createWalletHistory(address);
    }

    if(mutate(this.history) === false) {
      return;
    }

    this.saveHistory(saveNow);
  }

  private saveHistory(now?: boolean) {
    clearTimeout(this.historySaveTimer);
    if(!now) {
      this.historySaveTimer = ctx.setTimeout(() => this.saveHistory(true), HISTORY_SAVE_DELAY);
      return;
    }

    const cache = this.history;
    if(!cache) return;
    const users = getWalletHistoryUserIds(cache).map((userId) => this.appUsersManager.getUser(userId)).filter(Boolean);
    this.appStateManager.storage.set({[HISTORY_STORAGE_KEY]: toStoredWalletHistory(cache, users)}).catch(() => {});
  }

  // MARK: Addresses

  /**
   * The wallet a Telegram user receives Grams on. Rejects with `WALLET_USER_UNAVAILABLE`
   * when the user has none or cannot have one.
   */
  public async getUserAddress(userId: UserId, force?: boolean): Promise<WalletUserAddress> {
    const cached = this.userAddresses.get(userId);
    if(!force && cached && (Date.now() - cached.date) < USER_ADDRESS_TTL) {
      return cached.address;
    }

    const result = await this.apiManager.invokeApiSingle('wallet.getUserAddresses', {
      force,
      id: [this.appUsersManager.getUserInput(userId)],
      addresses: []
    });

    this.appPeersManager.saveApiPeers(result);
    const address = result.addresses.find((address) => address.user_id && address.user_id.toPeerId() === userId.toPeerId());
    if(!address) {
      throw makeError('WALLET_USER_UNAVAILABLE');
    }

    this.userAddresses.set(userId, {address, date: Date.now()});
    return address;
  }

  /**
   * Who owns a pasted address, if it is a Telegram wallet
   */
  public async getAddressOwner(address: string): Promise<WalletUserAddress | undefined> {
    const result = await this.apiManager.invokeApiSingle('wallet.getUserAddresses', {
      id: [],
      addresses: [address]
    });

    this.appPeersManager.saveApiPeers(result);
    const found = result.addresses.find((item) => item.user_id);
    if(found) {
      this.userAddresses.set(found.user_id.toUserId(), {address: found, date: Date.now()});
    }

    return found;
  }

  // MARK: Toncenter proxy

  /**
   * The chain provider is reached through MTProto only: the server answers with the provider's body,
   * or with a JSON object whose top-level `error` string is the failure.
   */
  public async performToncenterRequest(request: WalletToncenterRequest): Promise<string> {
    // * the engine gives up after its own timeout: retries past it would answer nobody
    const result = await this.apiManager.invokeApi('toncenter.performApiRequest', {
      post: request.post || undefined,
      endpoint: request.endpoint,
      query: request.query || undefined,
      payload: request.payload || undefined
    }, {...await this.getToncenterInvokeOptions(), stopTime: Date.now() + TONCENTER_TIMEOUT, floodMaxTimeout: 5});

    const body = result.response.data;
    const error = this.parseToncenterError(body);
    if(error) {
      throw makeError('WALLET_TONCENTER_ERROR', error);
    }

    return body;
  }

  private parseToncenterError(body: string) {
    if(!body || body[0] !== '{' || !body.includes('"error"')) {
      return;
    }

    try {
      const json = JSON.parse(body);
      if(typeof(json?.error) === 'string') {
        return json.error as string;
      }
    } catch(err) {}
  }

  private async getToncenterInvokeOptions(): Promise<InvokeApiOptions> {
    // * like web files, the provider's proxy lives on the web file DC and
    // * goes on its own connection so a slow provider never holds chats up
    const config = await this.apiManager.getConfig();
    const dcId = config.webfile_dc_id as DcId;
    return dcId ? {dcId, fileDownload: true} : {};
  }

  /**
   * What another address holds, read-only: the old wallet this device still keeps a key of. Rejects when the
   * provider gives no usable answer.
   */
  public async getAddressFunds(address: string): Promise<WalletAddressFunds> {
    const body = await this.performToncenterRequest({
      endpoint: ADDRESS_INFORMATION_ENDPOINT,
      query: 'address=' + encodeURIComponent(address)
    });

    const funds = parseWalletAddressFunds(body);
    if(!funds) {
      throw makeError('WALLET_TONCENTER_ERROR', 'address information');
    }

    return funds;
  }

  /**
   * The signing key an address's wallet contract holds now, hex; nothing when it holds none (not deployed)
   */
  public async getAddressSigningKey(address: string): Promise<string | undefined> {
    const body = await this.performToncenterRequest({
      post: true,
      endpoint: JSON_RPC_ENDPOINT,
      payload: makeSigningKeyRequestPayload(address)
    });

    return parseWalletSigningKey(body);
  }

  /**
   * The provider's stream for the wallet (lib/wallet/stream.ts), `expires` always a unix time. A fresh URL each time;
   * when none can be had, the last one while it still holds (iOS WalletStreamingURLProvider)
   */
  public async getStreamingUrl(): Promise<ToncenterStreamingUrl> {
    try {
      const result = await this.apiManager.invokeApi('toncenter.getStreamingUrl', undefined, await this.getToncenterInvokeOptions());
      // * an absolute time, or seconds from now for a small value (tdesktop kAbsoluteExpiresThreshold)
      const expiresAt = result.expires > 1e9 ? result.expires * 1000 : Date.now() + result.expires * 1000;
      this.streamingUrl = {url: result.url, expiresAt};
      return {...result, expires: Math.floor(expiresAt / 1000)};
    } catch(err) {
      const cached = this.streamingUrl;
      if(cached && cached.expiresAt - Date.now() > STREAM_URL_FALLBACK_MARGIN) {
        return {_: 'toncenter.streamingUrl', url: cached.url, expires: Math.floor(cached.expiresAt / 1000)};
      }

      throw err;
    }
  }

  // MARK: Rates

  /**
   * Fiat per GRAM: the server's USD rate times the currency's rate against the dollar
   */
  public getRates(force?: boolean): Promise<WalletRates> {
    if(this.ratesPromise) {
      return this.ratesPromise;
    }

    if(!force && this.rates && (Date.now() - this.rates.date) < RATES_REFRESH_INTERVAL) {
      return Promise.resolve(this.rates);
    }

    return this.ratesPromise = Promise.all([
      this.apiManager.getAppConfig(),
      this.apiManager.invokeApi('payments.getCurrencyRates').catch((): PaymentsCurrencyRates => undefined)
    ]).then(([appConfig, currencyRates]) => {
      // * a rate that is not a positive number is no rate (iOS WalletFiatRates)
      const valid = (value: number) => Number.isFinite(value) && value > 0;
      const usdPerGram = valid(+appConfig.ton_usd_rate) ? +appConfig.ton_usd_rate : 0;
      const rates: WalletRates['rates'] = {USD: usdPerGram};
      currencyRates?.rates.forEach((rate) => {
        if(valid(rate.rate)) rates[rate.currency] = rate.rate * usdPerGram;
      });

      return this.rates = {rates, date: Date.now()};
    }).finally(() => {
      this.ratesPromise = undefined;
    });
  }

  // MARK: Sending

  public getGaslessInfo(force?: boolean): Promise<WalletGaslessInfo> {
    if(this.gaslessPromise) {
      return this.gaslessPromise;
    }

    const gasless = this.gasless;
    if(!force && gasless && (Date.now() - gasless.date) < 60e3 && (!gasless.reset_at || gasless.reset_at * 1000 > Date.now())) {
      return Promise.resolve(gasless);
    }

    // * a fee-free transfer is a nicety: an answer that takes long, or a flood wait, is no reason to hold the send —
    // * past the deadline there is no info, and the transfer pays its fee (iOS)
    const request = this.apiManager.invokeApi('wallet.getGaslessInfo', undefined, {floodMaxTimeout: 0}).then((updates) => {
      // * read straight from the answer: the update stream may hold it back while it catches up
      const list = getUpdatesList(updates);
      const update = list.find((update) => update._ === 'updateWalletGaslessInfo') as Update.updateWalletGaslessInfo;
      if(update) this.onUpdateWalletGaslessInfo(update);
      this.apiUpdatesManager.processUpdateMessage(updates);
      return this.gasless;
    });

    return this.gaslessPromise = withTimeout(request, GASLESS_INFO_TIMEOUT).finally(() => {
      this.gaslessPromise = undefined;
    });
  }

  private onUpdateWalletGaslessInfo = (update: Update.updateWalletGaslessInfo) => {
    this.gasless = {
      available: !!update.pFlags.available,
      left: update.left,
      reset_at: update.reset_at,
      min_amount: update.min_amount,
      relayer_address: update.relayer_address,
      date: Date.now()
    };
  };

  /**
   * Hands the signed external message (and its fee-free alternative) to the server, which picks
   * one and broadcasts it. The receipt is the `updateSentWalletTransaction` among the answer's updates.
   */
  public async sendTransfer(options: {
    dataNormal: Uint8Array,
    dataGasless?: Uint8Array,
    userId?: UserId,
    randomId?: string,
    /** a transfer to a user shows in their chat while it is out, as a local message the served one replaces */
    draft?: GramTransferDraftContent
  }): Promise<WalletSentTransfer> {
    // * what the server takes at most per copy (tdesktop kTransferDataMaxBytes): a bigger one is refused here, before
    // * anything is shown in the chat
    const invalid = (data: Uint8Array) => !data?.length || data.length > TRANSFER_DATA_MAX_BYTES;
    if(invalid(options.dataNormal) || (options.dataGasless && invalid(options.dataGasless))) {
      // * as the server would refuse it: it never left, nothing to wait for
      throw Object.assign(makeError('WALLET_TRANSFER_DATA_INVALID'), {code: 400});
    }

    const randomId = options.randomId || randomLong();
    let retire: number;
    if(options.draft && options.userId) {
      this.createTransferDraft(options.userId, randomId, options.draft);
      // * from the start, not from an answer that may never come: the served message takes the draft's place, a
      // * refusal fails it, and one still sending when the transfer can no longer land leaves the chat — so does one
      // * the server posts nothing for (a recipient who charges for messages more than the transfer is worth)
      retire = this.retireTransferDraft(randomId);
    }

    let updates: Updates;
    // * a receipt pushed while a transfer is on its way may be its own: it is not taken for another session's
    this.sendsInFlight = (this.sendsInFlight || 0) + 1;
    try {
      // * never resent (tdesktop neither): a copy answered with a 5xx may have been broadcast, and a resend could only
      // * be refused for what the first one did — read as a refusal, that would free the transfer to be paid again
      updates = await this.apiManager.invokeApi('wallet.sendTransfer', {
        data_normal: options.dataNormal,
        data_gasless: options.dataGasless,
        user_id: options.userId ? this.appUsersManager.getUserInput(options.userId) : {_: 'inputUserEmpty'},
        random_id: randomId
      }, {stopTime: Date.now() + SEND_TIMEOUT, floodMaxTimeout: 0, noRetry: true});
    } catch(err) {
      if(isDefiniteTransferRefusal(err as ApiError)) {
        ctx.clearTimeout(retire);
        this.appMessagesManager.failGramTransferDraft(randomId, (err as ApiError).type);
      }

      throw err;
    } finally {
      this.sendsInFlight -= 1;
    }

    const sent = this.findSentTransfer(updates);
    this.rememberOwnReceipts(updates);
    this.apiUpdatesManager.processUpdateMessage(updates);
    if(!sent) {
      throw makeError('WALLET_TRANSFER_RECEIPT_MISSING');
    }

    return sent;
  }

  /** a nicety of the chat: whatever goes wrong with it, the signed transfer still goes out */
  private createTransferDraft(userId: UserId, randomId: string, draft: GramTransferDraftContent) {
    if(!this.appUsersManager.getUser(userId)) {
      return;
    }

    try {
      this.appMessagesManager.createGramTransferDraft({...draft, peerId: userId.toPeerId(false), randomId});
    } catch(err) {
      this.log.error('createGramTransferDraft', err);
    }
  }

  /**
   * The server may have taken a transfer it gave no clear answer to: its draft keeps sending until the served
   * message comes, or until the transfer's window closes. Then it leaves the chat (tdesktop's dropSending): nothing
   * here knows the transfer failed, and a served message that comes later through the difference must not stand
   * next to a "failed" one. A draft the engine's verdict failed meanwhile is no longer registered and stays.
   */
  private retireTransferDraft(randomId: string) {
    return ctx.setTimeout(() => {
      this.appMessagesManager.dropGramTransferDraft(randomId);
    }, GRAM_TRANSFER_RESOLUTION_TIMEOUT);
  }

  private findSentTransfer(updates: Updates): WalletSentTransfer {
    const list = getUpdatesList(updates).filter((update) => update._ === 'updateSentWalletTransaction') as Update.updateSentWalletTransaction[];
    const update = list[0];
    // * a receipt names a message, and only one: two that differ say nothing (tdesktop). Its hash is kept as it came,
    // * no length or encoding asked of it — a guess that refused one the server took would leave a paid transfer
    // * unresolved
    if(!update?.msg_hash || list.some((other) => other.msg_hash !== update.msg_hash || !other.pFlags.gasless !== !update.pFlags.gasless)) {
      return;
    }

    return {
      msgHash: update.msg_hash,
      gasless: !!update.pFlags.gasless,
      transaction: update.transaction
    };
  }

  /** the receipts of an answer to this device's transfer: the update each brings is its own, not another session's */
  private rememberOwnReceipts(updates: Updates) {
    const now = Date.now(), hashes = this.ownSentHashes ??= new Map();
    hashes.forEach((date, hash) => now - date > GRAM_TRANSFER_RESOLUTION_TIMEOUT && hashes.delete(hash));
    getUpdatesList(updates).forEach((update) => {
      if(update._ === 'updateSentWalletTransaction' && update.msg_hash) hashes.set(update.msg_hash, now);
    });
  }

  private onUpdateSentWalletTransaction = (update: Update.updateSentWalletTransaction) => {
    const sent: WalletSentTransfer = {
      msgHash: update.msg_hash,
      gasless: !!update.pFlags.gasless,
      transaction: update.transaction,
      own: this.sendsInFlight > 0 || !!this.ownSentHashes?.has(update.msg_hash)
    };

    // * another session's transfer, with the transaction it made: listed at once, by the next window too (iOS
    // * applyWalletFinalTransaction, Android onUpdate) — unless a transfer of this device's, its outcome unknown, may
    // * be this one: the history tells them apart a moment later
    const address = this.status.state?.address;
    if(!sent.own && sent.transaction && address) this.updateHistory(address, (cache) => {
      if(!cache.history || cache.pending.some((transfer) => !transfer.msgHash && !transfer.failed)) return false;
      const history = mergeWalletHistoryHead(cache.history, [sent.transaction]);
      if(history === cache.history) return false;
      cache.history = history;
    });

    this.rootScope.dispatchEvent('wallet_transfer_sent', sent);
  };

  // MARK: Backup

  /**
   * Starts an export of the phrase kept in Telegram's backup. Without a password it either succeeds
   * or fails with `PASSWORD_MISSING`, then it has to be asked again with the 2FA check.
   */
  public exportSecretPhrase(password?: InputCheckPasswordSRP): Promise<WalletSecretPhraseParts> {
    return this.apiManager.invokeApi('wallet.exportSecretPhrase', {password});
  }

  /**
   * One encrypted share of the phrase. It is served only by the DC that holds it.
   */
  public async fetchEncryptedSecretPhrasePart(dcId: number, token: string, publicKey: Uint8Array) {
    const result = await this.apiManager.invokeApi('wallet.fetchEncryptedSecretPhrasePart', {
      token,
      public_key: publicKey
    }, {dcId: dcId as DcId, fileDownload: true});

    return result.data;
  }

  public getBackupHolderDcs(): Promise<WalletHolderDc[]> {
    return this.apiManager.invokeApi('wallet.getBackupHolderDcs');
  }

  public getProofChallenge() {
    return this.apiManager.invokeApi('wallet.getProofChallenge').then((challenge) => {
      this.ownershipDomain = challenge.domain;
      return challenge;
    });
  }

  // * a backup change may be resent: either way the backup ends up as asked, and its proof holds for one attempt,
  // * so a resend after a lost answer can only be refused (the session then checks what the server serves)
  public async enableBackup(parts: Uint8Array[], newPublicKey?: Uint8Array, proof?: WalletOwnershipProof) {
    const epoch = this.stateEpoch;
    const state = await this.apiManager.invokeApi('wallet.enableBackup', {
      parts,
      new_public_key: newPublicKey,
      proof
    });

    return this.applyChangedState(state, epoch);
  }

  public async disableBackup(options: {
    password?: InputCheckPasswordSRP,
    newPublicKey?: Uint8Array,
    proof?: WalletOwnershipProof
  }) {
    const epoch = this.stateEpoch;
    const state = await this.apiManager.invokeApi('wallet.disableBackup', {
      password: options.password,
      new_public_key: options.newPublicKey,
      proof: options.proof
    });

    return this.applyChangedState(state, epoch);
  }

  /**
   * Swaps the account's wallet for a new one the server makes, or for one the user brings with a proof that
   * they hold its key. The old wallet is not destroyed: whoever has its phrase still has its funds.
   */
  public async replaceWallet(wallet: InputWalletReplacement, password?: InputCheckPasswordSRP) {
    // * never resent: a new wallet would be made twice, and an import's proof and the password check hold for one
    // * attempt, so a resend could only be refused for what a lost first answer already did
    const epoch = this.stateEpoch;
    const state = await this.apiManager.invokeApi('wallet.replaceWallet', {wallet, password}, {noRetry: true});
    return this.applyChangedState(state, epoch);
  }

  public getExistingWaltBalance() {
    return this.apiManager.invokeApiSingle('wallet.getExistingWaltBalance');
  }

  // MARK: Onramp

  /**
   * Whether GRAM can be bought here: the server lists Telegram's own provider. An error reads as no.
   */
  public isOnrampAvailable() {
    return this.apiManager.invokeApiSingle('payments.getOnrampProviders', {
      crypto_currency: ONRAMP_CRYPTO_CURRENCY
    }).then((providers) => providers.some((provider) => provider.id === ONRAMP_PROVIDER), () => false);
  }

  /**
   * The provider's link where GRAM is bought for this address, in the provider's own currency
   */
  public createOnrampSession(address: string) {
    return this.apiManager.invokeApi('payments.createOnrampSession', {
      provider: ONRAMP_PROVIDER,
      crypto_currency: ONRAMP_CRYPTO_CURRENCY,
      address
    });
  }

  // MARK: TON Connect

  /**
   * The domain the server's wallet-ownership proofs are signed for. A dApp's `ton_proof` for it would pass as one,
   * so it is asked once (a challenge minted and left unused costs nothing) and kept for the session.
   */
  public async getTonConnectOwnershipDomain() {
    if(this.ownershipDomain === undefined) {
      await this.getProofChallenge();
    }

    return this.ownershipDomain;
  }

  private saveTonConnectSession(session: TonConnectSession) {
    const icon = session.manifest?.icon;
    if(icon?._ === 'webDocument') {
      session.manifest.icon = this.appWebDocsManager.saveWebDocument(icon);
    }

    const key = String(session.id);
    this.tonConnectSessionChanges?.set(key, session);
    if(session.pFlags.closed) {
      this.tonConnectSessions.delete(key);
    } else {
      this.tonConnectSessions.set(key, session);
    }

    return session;
  }

  private onUpdateWalletTonConnectSession = (update: Update.updateWalletTonConnectSession) => {
    // * the manifest comes this way, a moment after the session was created
    this.rootScope.dispatchEvent('wallet_tonconnect_session', this.saveTonConnectSession(update.session));
  };

  private onUpdateWalletTonConnectPendingDisconnect = (update: Update.updateWalletTonConnectPendingDisconnect) => {
    this.rootScope.dispatchEvent('wallet_tonconnect_pending_disconnect', update.session_ids.map(String));
  };

  public getCachedTonConnectSessions() {
    return [...this.tonConnectSessions.values()];
  }

  public getCachedTonConnectSession(sessionId: string | number) {
    return this.tonConnectSessions.get(String(sessionId));
  }

  /** the account's sessions, newest first; asked once a window unless forced */
  public getTonConnectSessions(force?: boolean): Promise<TonConnectSession[]> {
    if(this.tonConnectSessionsPromise) {
      return this.tonConnectSessionsPromise;
    }

    if(this.tonConnectSessionsLoaded && !force) {
      return Promise.resolve(this.getCachedTonConnectSessions());
    }

    const changes = this.tonConnectSessionChanges = new Map();
    return this.tonConnectSessionsPromise = this.apiManager.invokeApi('wallet.tonConnectGetSessions').then((result) => {
      this.tonConnectSessionChanges = undefined;
      this.tonConnectSessions.clear();
      result.sessions.forEach((session) => this.saveTonConnectSession(session));
      changes.forEach((session) => this.saveTonConnectSession(session));
      this.tonConnectSessionsLoaded = true;
      return this.getCachedTonConnectSessions().sort((a, b) => b.date - a.date);
    }).finally(() => {
      if(this.tonConnectSessionChanges === changes) this.tonConnectSessionChanges = undefined;
      this.tonConnectSessionsPromise = undefined;
    });
  }

  /** a pending session for a connect link; the server fetches the manifest and sends it as an update */
  public async tonConnectCreateSession(dappClientId: string, manifestUrl: string) {
    const session = await this.apiManager.invokeApi('wallet.tonConnectCreateSession', {
      dapp_client_id: dappClientId,
      manifest_url: manifestUrl
    });

    // * the update with the manifest may have come first: what it said is kept
    const cached = this.getCachedTonConnectSession(session.id);
    if(cached && (cached.manifest || cached.manifest_error) && !session.manifest && !session.manifest_error) {
      return cached;
    }

    return this.saveTonConnectSession(session);
  }

  /** `clientId` is the wallet's key of the session (`W`, hex); the challenge proves it */
  public tonConnectRegisterKey(sessionId: string | number, clientId: string) {
    return this.apiManager.invokeApi('wallet.tonConnectRegisterKey', {session_id: sessionId, client_id: clientId});
  }

  public tonConnectSubmitConnectResult(options: {
    sessionId: string | number,
    challengeAnswer: Uint8Array,
    body: Uint8Array,
    error?: boolean,
    traceId?: string
  }) {
    return this.apiManager.invokeApi('wallet.tonConnectSubmitConnectResult', {
      session_id: options.sessionId,
      challenge_answer: options.challengeAnswer,
      body: options.body,
      error: options.error || undefined,
      trace_id: options.traceId || undefined
    });
  }

  /** a session with the requests it holds for this wallet, by the session or by the dApp's client id */
  public async tonConnectGetPending(lookup: {sessionId: string | number} | {dappClientId: string}): Promise<WalletTonConnectPending> {
    const pending = await this.apiManager.invokeApi('wallet.tonConnectGetPending', 'sessionId' in lookup ?
      {session_id: lookup.sessionId} :
      {dapp_client_id: lookup.dappClientId});
    this.saveTonConnectSession(pending.session);
    return pending;
  }

  /**
   * Takes a request for this device: false or `TONCONNECT_REQUEST_ALREADY_CLAIMED` mean another one answers it.
   * Never resent: a lost answer may have claimed it already.
   */
  public tonConnectClaimRequest(options: {
    sessionId: string | number,
    msgId: number,
    appRequestId: string,
    challengeAnswer?: Uint8Array,
    declined?: boolean
  }) {
    return this.apiManager.invokeApi('wallet.tonConnectClaimRequest', {
      session_id: options.sessionId,
      msg_id: options.msgId,
      app_request_id: options.appRequestId,
      challenge_answer: options.challengeAnswer,
      declined: options.declined || undefined
    }, {noRetry: true});
  }

  public tonConnectSubmitResponse(options: {sessionId: string | number, msgId: number, body: Uint8Array, traceId?: string}) {
    return this.apiManager.invokeApi('wallet.tonConnectSubmitResponse', {
      session_id: options.sessionId,
      msg_id: options.msgId,
      body: options.body,
      trace_id: options.traceId || undefined
    });
  }

  public tonConnectNextEventId(sessionId: string | number) {
    return this.apiManager.invokeApi('wallet.tonConnectNextEventId', {session_id: sessionId}).then((result) => result.event_id);
  }

  /** `body`: the wallet's own disconnect event; none when the dApp asked to disconnect */
  public async tonConnectCloseSession(sessionId: string | number, body?: Uint8Array) {
    const closed = await this.apiManager.invokeApi('wallet.tonConnectCloseSession', {session_id: sessionId, body});
    if(closed) {
      const session = this.getCachedTonConnectSession(sessionId);
      this.tonConnectSessions.delete(String(sessionId));
      // * a list being fetched may still name it: it stays closed
      this.tonConnectSessionChanges?.set(String(sessionId), {...session, id: sessionId, pFlags: {...session?.pFlags, closed: true}} as TonConnectSession);
      if(session) {
        this.rootScope.dispatchEvent('wallet_tonconnect_session', {...session, pFlags: {...session.pFlags, closed: true}});
      }
    }

    return closed;
  }
}
