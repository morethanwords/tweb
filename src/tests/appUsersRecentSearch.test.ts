import {describe, expect, it, vi} from 'vitest';
import {AppUsersManager} from '@appManagers/appUsersManager';
import '@helpers/peerIdPolyfill';

const first = (10 as UserId).toPeerId(false);
const second = (20 as UserId).toPeerId(false);
const third = (30 as ChatId).toPeerId(true);

function setup(recentSearch: PeerId[]) {
  const state = {recentSearch};
  const manager = new AppUsersManager();
  const pushToState = vi.fn();
  const releasePeer = vi.fn();
  Object.assign(manager, {
    appStateManager: {getState: async() => state, pushToState},
    peersStorage: {requestPeer: vi.fn(), releasePeer}
  });
  return {manager, state, pushToState, releasePeer};
}

describe('recent search state', () => {
  it('moves an existing peer to the front without duplicates', async() => {
    const {manager, state, pushToState} = setup([first, second, third]);
    await manager.pushRecentSearch(second);

    expect(state.recentSearch).toEqual([second, first, third]);
    expect(pushToState).toHaveBeenCalledWith('recentSearch', [second, first, third]);
  });

  it('does not rewrite the state when the first peer is opened again', async() => {
    const {manager, pushToState} = setup([first, second]);
    await manager.pushRecentSearch(first);
    expect(pushToState).not.toHaveBeenCalled();
  });

  it('removes only the chosen peer and releases its recent search retention', async() => {
    const {manager, state, pushToState, releasePeer} = setup([first, second, third]);
    await manager.removeRecentSearch(second);

    expect(state.recentSearch).toEqual([first, third]);
    expect(releasePeer).toHaveBeenCalledExactlyOnceWith(second, 'recentSearch');
    expect(pushToState).toHaveBeenCalledWith('recentSearch', [first, third]);
  });

  it('ignores removal of a peer that is no longer in recent search', async() => {
    const {manager, state, pushToState, releasePeer} = setup([first]);
    await manager.removeRecentSearch(second);

    expect(state.recentSearch).toEqual([first]);
    expect(pushToState).not.toHaveBeenCalled();
    expect(releasePeer).not.toHaveBeenCalled();
  });
});
