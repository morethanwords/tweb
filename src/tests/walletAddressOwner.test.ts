import '@helpers/peerIdPolyfill';
import {describe, expect, it, vi} from 'vitest';
import AppWalletManager from '@appManagers/appWalletManager';

const ADDRESS = 'UQCQmbqOA_c8Uagw99U2NPMFFtwfjblg6tCJrI-5Jgc9AtO9';
const SELF = 1;
const SENDER = 2;

function makeKnown(options: {
  cached?: Record<number, string>,
  loaded?: Record<number, string>,
  walletAddresses?: Record<number, string>,
  getProfile?: (id: number) => any
}) {
  const card = (cards: Record<number, string>, id: number) => cards?.[id] && {wallet_card: {address: cards[id]}};
  const appProfileManager = {
    getCachedFullUser: vi.fn((id: number) => card(options.cached, id)),
    getProfile: vi.fn(options.getProfile ?? (async(id: number) => card(options.loaded, id) || {}))
  };
  const get = (load?: boolean) => AppWalletManager.prototype.getKnownAddressOwner.call({
    rootScope: {myId: SELF},
    appStateManager: {getState: async() => ({walletAddresses: options.walletAddresses ?? {}})},
    appProfileManager
  }, ADDRESS, [SENDER], load);
  return {get, appProfileManager};
}

function getKnown(cards: Record<number, string>, walletAddresses?: Record<number, string>) {
  return makeKnown({cached: cards, walletAddresses}).get();
}

function saveAddress(walletAddresses: Record<number, string>, userId: number, address?: string) {
  const pushToState = vi.fn();
  const peersStorage = {requestPeer: vi.fn(), releasePeer: vi.fn()};
  return AppWalletManager.prototype.saveWalletAddress.call({
    appStateManager: {getState: async() => ({walletAddresses}), pushToState},
    peersStorage
  }, userId, address).then(() => ({pushToState, peersStorage}));
}

describe('the memory of wallets', () => {
  it('keeps what a profile shows, and the user with it', async() => {
    const addresses = {};
    const {pushToState, peersStorage} = await saveAddress(addresses, 7, ADDRESS);
    expect(addresses).toEqual({7: ADDRESS});
    expect(pushToState).toHaveBeenCalledOnce();
    expect(peersStorage.requestPeer).toHaveBeenCalledOnce();
  });

  it('writes nothing when nothing changed', async() => {
    expect((await saveAddress({7: ADDRESS}, 7, ADDRESS)).pushToState).not.toHaveBeenCalled();
    expect((await saveAddress({}, 7)).pushToState).not.toHaveBeenCalled();
  });

  it('forgets a wallet the profile no longer shows', async() => {
    const addresses = {7: ADDRESS};
    const {peersStorage} = await saveAddress(addresses, 7);
    expect(addresses).toEqual({});
    expect(peersStorage.releasePeer).toHaveBeenCalledOnce();
  });
});

describe('the known owner of an address', () => {
  it('is remembered from a profile opened before', async() => {
    expect(await getKnown({}, {7: ADDRESS})).toBe(7);
  });

  it('is who the card at hand says', async() => {
    expect(await getKnown({[SENDER]: ADDRESS})).toBe(SENDER);
  });

  it('is our own account when the card is ours', async() => {
    expect(await getKnown({[SELF]: ADDRESS})).toBe(SELF);
  });

  it('is nobody when no profile shows it', async() => {
    expect(await getKnown({})).toBeUndefined();
  });

  it('asks no profile that is not loaded yet, so that the server is not held back', async() => {
    const {get, appProfileManager} = makeKnown({loaded: {[SENDER]: ADDRESS}});
    expect(await get()).toBeUndefined();
    expect(appProfileManager.getProfile).not.toHaveBeenCalled();
  });

  it('loads every profile at hand at once when asked to', async() => {
    const resolvers: Array<() => void> = [];
    const {get, appProfileManager} = makeKnown({
      getProfile: (id) => new Promise((resolve) => resolvers.push(() => resolve(id === SENDER ? {wallet_card: {address: ADDRESS}} : {})))
    });
    const result = get(true);
    await vi.waitFor(() => expect(appProfileManager.getProfile).toHaveBeenCalledTimes(2));
    resolvers.forEach((resolve) => resolve());
    expect(await result).toBe(SENDER);
  });

  it('takes a profile that cannot be loaded for one with no card', async() => {
    const {get} = makeKnown({
      getProfile: (id) => id === SENDER ? Promise.reject({type: 'USER_ID_INVALID'}) : Promise.resolve({wallet_card: {address: ADDRESS}})
    });
    expect(await get(true)).toBe(SELF);
  });
});
