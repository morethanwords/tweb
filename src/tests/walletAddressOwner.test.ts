import '@helpers/peerIdPolyfill';
import {describe, expect, it, vi} from 'vitest';
import AppWalletManager from '@appManagers/appWalletManager';

const ADDRESS = 'UQCQmbqOA_c8Uagw99U2NPMFFtwfjblg6tCJrI-5Jgc9AtO9';
const SELF = 1;
const SENDER = 2;

function getKnown(cards: Record<number, string>, walletAddresses: Record<number, string> = {}) {
  const getProfile = vi.fn(async(id: number) => ({wallet_card: cards[id] && {address: cards[id]}}));
  return AppWalletManager.prototype.getKnownAddressOwner.call({
    rootScope: {myId: SELF},
    appStateManager: {getState: async() => ({walletAddresses})},
    appProfileManager: {getProfile}
  }, ADDRESS, [SENDER]);
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
});
