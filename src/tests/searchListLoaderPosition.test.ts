import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

// * the managers are the test's; the loader only subscribes to the app's events
vi.mock('@lib/rootScope', () => ({
  default: {addEventListener: () => {}, removeEventListener: () => {}}
}));
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

import SearchListLoader from '@helpers/searchListLoader';

// * The media viewer's "3 of 15": the loader asks the server for the place of the item opened, once, and
// * counts every other from it over the results it loads - paging asks nothing. The search also returns
// * results the list leaves out (the media of a rich message, a sensitive one): the server counts them,
// * so the places have to as well, or the number drifts off the server's past each of them.

type Item = {mid: number, peerId: PeerId};

const PEER_ID = 1000001 as PeerId;
// * a chat's photos and videos, oldest first: ids with gaps, as a chat has them
const RESULTS = Array.from({length: 80}, (_, i) => (i + 1) * 2);
// * results the list leaves out
const LEFT_OUT = new Set([96, 104, 106, 140]);
const OPENED = 100;

const message = (mid: number) => ({mid, peerId: PEER_ID});

// * `given`: the targets the list is opened with, as a chat hands over an album's other items
function createLoader(reverse: boolean, given: {previous: number[], next: number[]} = {previous: [], next: []}) {
  const getHistory = vi.fn(async(options: {offsetId: number, limit: number, backLimit?: number, needRealOffsetIdOffset?: boolean}) => {
    const newestFirst = RESULTS.slice().reverse();
    let mids: number[];
    if(options.needRealOffsetIdOffset) {
      // * the result at the item (the next older one when it is none), and its place counted from the newest
      const mid = newestFirst.find((mid) => mid <= options.offsetId);
      return {
        count: RESULTS.length,
        history: [mid],
        offsetIdOffset: newestFirst.indexOf(mid) + 1
      };
    } else if(options.backLimit) {
      mids = newestFirst.filter((mid) => mid >= options.offsetId).slice(-options.backLimit);
    } else {
      mids = newestFirst.filter((mid) => mid < options.offsetId).slice(0, options.limit);
    }

    return {count: RESULTS.length, history: mids, messages: mids.map(message)};
  });

  const managers = {
    appMessagesIdsManager: {incrementMessageId: async(mid: number, increment: number) => mid + increment},
    appMessagesManager: {
      getHistory,
      filterMessagesByInputFilterFromStorage: async(_filter: string, mids: number[]) => {
        return mids.filter((mid) => !LEFT_OUT.has(mid)).map(message);
      }
    }
  };

  const loader = new SearchListLoader<Item>({
    managers: managers as any,
    processItem: (item) => ({mid: item.mid, peerId: item.peerId})
  });
  loader.setSearchContext({peerId: PEER_ID, inputFilter: {_: 'inputMessagesFilterPhotoVideo'}} as any);
  loader.setTargets(given.previous.map(message), given.next.map(message), reverse);
  loader.current = message(OPENED);

  const positionRequests = () => getHistory.mock.calls.filter(([options]) => options.needRealOffsetIdOffset).length;
  return {loader, positionRequests};
}

// * the server's place: among all results, the left out ones too, in the order the list goes
function serverPosition(mid: number, reverse: boolean) {
  const index = RESULTS.indexOf(mid);
  return {position: reverse ? index + 1 : RESULTS.length - index, count: RESULTS.length};
}

describe('SearchListLoader places', () => {
  for(const reverse of [true, false]) {
    it(`counts them from one asked of the server, the left out results too (${reverse ? 'older to newer' : 'newer to older'})`, async() => {
      const {loader, positionRequests} = createLoader(reverse);
      await Promise.all([loader.load(true), loader.load(false)]);

      expect(loader.getPosition(loader.current)).toBeUndefined();
      expect(await loader.loadPosition(loader.current)).toEqual(serverPosition(OPENED, reverse));

      // * both ways past the left out ones, by one and by many
      for(const step of [-1, -1, -1, 2, 2, 1, 1, -3, 12, -20, 5]) {
        expect(loader.go(step), `a step by ${step}`).toBeTruthy();
        const {mid} = loader.current;
        expect(loader.getPosition(loader.current), `the place of ${mid}`).toEqual(serverPosition(mid, reverse));
      }

      expect(positionRequests()).toBe(1);
    });
  }

  // * an album's items come from the chat, not from the search: the loads go on from their edges, so a
  // * result between them that the list leaves out (96) is never loaded - and one of them (101, a GIF in
  // * the photo search's stead) is no result at all
  it('counts the results between the targets it was opened with, and gives no place to one that is no result', async() => {
    const {loader, positionRequests} = createLoader(true, {previous: [94, 98], next: [101, 102]});
    await Promise.all([loader.load(true), loader.load(false)]);
    expect(await loader.loadPosition(loader.current)).toEqual(serverPosition(OPENED, true));

    const places: Record<number, unknown> = {};
    for(const step of [-1, -1, 1, 1, 1, 1]) {
      loader.go(step);
      places[loader.current.mid] = loader.getPosition(loader.current);
    }

    expect(places).toEqual({
      94: serverPosition(94, true),
      98: serverPosition(98, true),
      100: serverPosition(100, true),
      101: undefined,
      102: serverPosition(102, true)
    });
    expect(positionRequests()).toBe(1);
  });

  it('takes its places from the next item when opened on one that is no result', async() => {
    const {loader, positionRequests} = createLoader(true, {previous: [98], next: [102]});
    loader.current = message(101); // * a GIF among the photos of an album
    await Promise.all([loader.load(true), loader.load(false)]);

    expect(await loader.loadPosition(loader.current)).toBeUndefined();
    loader.go(1);
    expect(await loader.loadPosition(loader.current)).toEqual(serverPosition(102, true));
    expect(positionRequests()).toBe(2);
  });

  // * the search's count and the places past a deleted result change, whether it was loaded or not
  it('asks again after a deletion in the chat, and redraws what follows the list', async() => {
    const {loader, positionRequests} = createLoader(true);
    const onLoadedMore = loader.onLoadedMore = vi.fn();
    await Promise.all([loader.load(true), loader.load(false)]);
    onLoadedMore.mockClear();
    await loader.loadPosition(loader.current);

    (loader as any).onHistoryDelete({peerId: PEER_ID, msgs: new Set([999])}); // * never loaded
    expect(loader.getPosition(loader.current)).toBeUndefined();
    expect(onLoadedMore).not.toHaveBeenCalled();

    (loader as any).onHistoryDelete({peerId: PEER_ID, msgs: new Set([OPENED - 2])}); // * the one before
    expect(onLoadedMore).toHaveBeenCalledTimes(1);
    await loader.loadPosition(loader.current);
    expect(positionRequests()).toBe(2);
  });

  it('asks again once the search has changed', async() => {
    const {loader, positionRequests} = createLoader(true);
    await Promise.all([loader.load(true), loader.load(false)]);
    await loader.loadPosition(loader.current);

    loader.go(-1);
    (loader as any).onHistoryDelete({peerId: PEER_ID, msgs: new Set([RESULTS[0]])});
    expect(loader.getPosition(loader.current)).toBeUndefined();
    await loader.loadPosition(loader.current);
    expect(positionRequests()).toBe(2);
  });

  it('drops a place that arrives after the search has changed', async() => {
    const {loader} = createLoader(true);
    await Promise.all([loader.load(true), loader.load(false)]);

    const pending = loader.loadPosition(loader.current);
    (loader as any).onHistoryDelete({peerId: PEER_ID, msgs: new Set([RESULTS[0]])});
    expect(await pending).toBeUndefined();
    expect(loader.getPosition(loader.current)).toBeUndefined();
  });
});

// * The newer side of a search inside one chat: it is read from the item the list already holds, and
// * not from the id after it - a window lying wholly above an id the search storage does not hold
// * cannot be cut out of that storage again, and every result is dropped. The anchor comes back among
// * them, so the window asks for one place more: a full page that came back one short would latch
// * "read everything" and end a voice playlist, or the viewer's paging, where the page happened to end.
describe('SearchListLoader loading newer', () => {
  const LOAD_COUNT = 10;

  function createNewerLoader() {
    const requests: {offsetId: number, limit: number, backLimit?: number}[] = [];
    const newestFirst = RESULTS.slice().reverse();
    const managers = {
      appMessagesIdsManager: {incrementMessageId: async(mid: number, increment: number) => mid + increment},
      appMessagesManager: {
        getHistory: async(options: {offsetId: number, limit: number, backLimit?: number}) => {
          requests.push(options);
          // * the results the window covers, as the storage's slice gives them back: the ones closest
          // * above the offset, the offset itself among them when it is a result of its own
          const mids = newestFirst.filter((mid) => mid >= options.offsetId).slice(-options.backLimit);
          return {count: RESULTS.length, history: mids, messages: mids.map(message)};
        },
        filterMessagesByInputFilterFromStorage: async(_filter: string, mids: number[]) =>
          mids.filter((mid) => !LEFT_OUT.has(mid)).map(message)
      }
    };

    const loader = new SearchListLoader<Item>({
      managers: managers as any,
      loadCount: LOAD_COUNT,
      processItem: (item) => ({mid: item.mid, peerId: item.peerId})
    });
    loader.setSearchContext({peerId: PEER_ID, inputFilter: {_: 'inputMessagesFilterPhotoVideo'}} as any);
    loader.setTargets([], [], true);
    loader.current = message(OPENED);
    return {loader, requests};
  }

  it('reads from the item itself and leaves it out of the results', async() => {
    const {loader, requests} = createNewerLoader();
    await loader.load(false);

    expect(requests).toHaveLength(1);
    expect(requests[0].offsetId).toBe(OPENED);
    expect(loader.next.map(({mid}) => mid)).not.toContain(OPENED);
    expect(loader.next.every(({mid}) => mid > OPENED)).toBe(true);
  });

  it('fills a whole page, so there is more to read after it', async() => {
    const {loader} = createNewerLoader();
    await loader.load(false);

    // * a whole page of results, of which the list keeps the ones it does not leave out - the page is
    // * full either way, so there is more to read
    const page = RESULTS.filter((mid) => mid > OPENED).slice(0, LOAD_COUNT);
    const expected = page.filter((mid) => !LEFT_OUT.has(mid));
    expect(loader.next.map(({mid}) => mid)).toEqual(expected);
    expect((loader as any).loadedAllUp).toBe(false);

    await loader.load(false);
    expect(loader.next.length).toBeGreaterThan(expected.length);
  });

  it('says it has read everything once the newer results run out', async() => {
    const {loader} = createNewerLoader();
    loader.current = message(RESULTS[RESULTS.length - 2]); // * the one before the newest
    await loader.load(false);

    expect(loader.next.map(({mid}) => mid)).toEqual([RESULTS[RESULTS.length - 1]]);
    expect((loader as any).loadedAllUp).toBe(true);
  });
});
