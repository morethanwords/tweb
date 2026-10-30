import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppUsersManager} from '@appManagers/appUsersManager';

const ADDRESS = 'UQCQmbqOA_c8Uagw99U2NPMFFtwfjblg6tCJrI-5Jgc9AtO9';
const SAME_WALLET = 'EQCQmbqOA_c8Uagw99U2NPMFFtwfjblg6tCJrI-5Jgc9AtO9';
const SELF = 1;
const SENDER = 2;

function getOwner(cards: Record<number, string>, invoke: (o: any) => any, walletAddresses: Record<number, string> = {}) {
  return AppUsersManager.prototype.getUserIdByTonAddress.call({
    userId: SELF,
    appStateManager: {getState: async() => ({walletAddresses})},
    appProfileManager: {getProfile: async(id: number) => ({wallet_card: cards[id] && {address: cards[id]}})},
    apiManager: {invokeApiSingleProcess: invoke},
    saveApiUsers: () => {}
  }, ADDRESS, [SENDER]);
}

function saveAddress(walletAddresses: Record<number, string>, userId: number, address?: string) {
  const pushToState = vi.fn();
  const peersStorage = {requestPeer: vi.fn(), releasePeer: vi.fn()};
  return AppUsersManager.prototype.saveWalletAddress.call({
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

describe('the owner of a TON address', () => {
  it('is found by the card in a profile, with no wallet request', async() => {
    const invoke = vi.fn();
    expect(await getOwner({[SENDER]: SAME_WALLET}, invoke)).toBe(SENDER);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('is remembered from a profile opened before, with nothing asked', async() => {
    const invoke = vi.fn();
    expect(await getOwner({}, invoke, {7: SAME_WALLET})).toBe(7);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('is our own account when the card is ours', async() => {
    expect(await getOwner({[SELF]: ADDRESS}, vi.fn())).toBe(SELF);
  });

  it('is left to the server when no card matches', async() => {
    const invoke = vi.fn(async(o) => o.processResult({addresses: [{user_id: 3, address: ADDRESS}], users: []}));
    expect(await getOwner({[SENDER]: 'other'}, invoke)).toBe(3);
  });

  it('is nobody when the wallet methods are closed to this client', async() => {
    const invoke = vi.fn(async(o) => o.processError({type: 'WALLET_UNAVAILABLE'}));
    expect(await getOwner({}, invoke)).toBeUndefined();
  });
});
