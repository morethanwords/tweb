import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {MessagesFilter, MessagesSearchCounter} from '@layer';

const PEER_ID = (61004386 as UserId).toPeerId(false);

function makeCounter(filter: MessagesFilter['_'], count: number, inexact?: boolean): MessagesSearchCounter {
  return {
    _: 'messages.searchCounter',
    pFlags: inexact ? {inexact: true} : {},
    filter: {_: filter} as MessagesFilter,
    count
  };
}

function makeManager(counters: MessagesSearchCounter[], historyCounts: {[filter: string]: number | Error}) {
  const manager = new AppMessagesManager();
  const getHistory = vi.fn(({inputFilter}: {inputFilter: {_: string}}) => {
    const value = historyCounts[inputFilter._];
    if(value instanceof Error) {
      return Promise.reject(value);
    }

    return Promise.resolve({count: value, history: [] as number[], isEnd: {}, offsetIdOffset: 0});
  });

  const invokeApi = vi.fn(() => Promise.resolve(counters));
  const log = Object.assign(() => {}, {bindPrefix: () => log, error: vi.fn()});

  Object.assign(manager as any, {
    log,
    getHistory,
    migratedFromTo: {},
    migratedToFrom: {},
    apiManager: {invokeApi, invokeApiCacheable: invokeApi},
    appPeersManager: {
      isPeerRestricted: () => false,
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerUser', user_id: 61004386, access_hash: '1'}),
      isForum: () => false,
      isBotforum: () => false
    }
  });

  return {manager, getHistory, log};
}

describe('getSearchCounters exactness', () => {
  it('passes exact counters through without re-reading them', async() => {
    const {manager, getHistory} = makeManager(
      [makeCounter('inputMessagesFilterPhotos', 276)],
      {inputMessagesFilterPhotos: 999}
    );

    const counters = await manager.getSearchCounters(PEER_ID, [{_: 'inputMessagesFilterPhotos'}]);

    expect(counters[0].count).toBe(276);
    expect(getHistory).not.toHaveBeenCalled();
  });

  // The server reports Saved Messages as `inexact` and undercounts badly there
  // (5 pinned against 17 real, 171 photos against 276), so an inexact counter
  // has to be re-read from the search the tab actually lists.
  it('re-reads an inexact counter from the pinned/media search', async() => {
    const {manager, getHistory} = makeManager(
      [makeCounter('inputMessagesFilterPinned', 5, true)],
      {inputMessagesFilterPinned: 17}
    );

    const counters = await manager.getSearchCounters(PEER_ID, [{_: 'inputMessagesFilterPinned'}]);

    expect(counters[0].count).toBe(17);
    expect(counters[0].pFlags.inexact).toBeUndefined();
    expect(getHistory).toHaveBeenCalledTimes(1);
    expect(getHistory.mock.calls[0][0]).toMatchObject({
      peerId: PEER_ID,
      inputFilter: {_: 'inputMessagesFilterPinned'},
      limit: 1
    });
  });

  it('re-reads only the inexact counters of a mixed batch', async() => {
    const {manager, getHistory} = makeManager(
      [
        makeCounter('inputMessagesFilterPhotos', 171, true),
        makeCounter('inputMessagesFilterVideo', 37)
      ],
      {inputMessagesFilterPhotos: 276, inputMessagesFilterVideo: 1}
    );

    const counters = await manager.getSearchCounters(PEER_ID, [
      {_: 'inputMessagesFilterPhotos'},
      {_: 'inputMessagesFilterVideo'}
    ]);

    expect(counters.map((counter) => counter.count)).toEqual([276, 37]);
    expect(getHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps the server count when the re-read fails', async() => {
    const {manager, log} = makeManager(
      [makeCounter('inputMessagesFilterMusic', 23, true)],
      {inputMessagesFilterMusic: new Error('FLOOD_WAIT')}
    );

    const counters = await manager.getSearchCounters(PEER_ID, [{_: 'inputMessagesFilterMusic'}]);

    expect(counters[0].count).toBe(23);
    expect(log.error).toHaveBeenCalled();
  });

  it('keeps the server count when the search has no count', async() => {
    const {manager} = makeManager(
      [makeCounter('inputMessagesFilterUrl', 189, true)],
      {inputMessagesFilterUrl: undefined}
    );

    const counters = await manager.getSearchCounters(PEER_ID, [{_: 'inputMessagesFilterUrl'}]);

    expect(counters[0].count).toBe(189);
  });
});
