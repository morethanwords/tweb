import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppStickersManager} from '@appManagers/appStickersManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import {setEnvironment} from '@environment/utils';
import createStickersSearch from '@components/emoticonsDropdown/stickersSearch';
import {ReferenceContext, ReferencesStorage} from '@lib/storages/references';

const doc = (id: string) => ({_: 'document', id} as any as MyDocument);

const found = (ids: string[], nextOffset?: number) => ({
  _: 'messages.foundStickers' as const,
  hash: 0,
  next_offset: nextOffset,
  stickers: ids.map(doc)
});

function createManager(language = 'ru') {
  const invokeApi = vi.fn();
  const saveDoc = vi.fn((document: MyDocument, _context?: ReferenceContext) => document);
  const manager = new AppStickersManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi},
    appDocsManager: {saveDoc},
    networkerFactory: {language},
    rootScope: {premium: false}
  });
  manager.clear(true);
  return {manager, invokeApi, saveDoc};
}

describe('AppStickersManager.searchStickersOnServer', () => {
  beforeEach(() => {
    setEnvironment({IS_WEBM_SUPPORTED: true} as any);
  });

  afterEach(() => {
    setEnvironment(undefined);
  });

  it('asks messages.searchStickers in the interface language and English, a page of 50', async() => {
    const {manager, invokeApi} = createManager('ru');
    invokeApi.mockResolvedValueOnce(found(['1', '2'], 50));

    const page = await manager.searchStickersOnServer(' cat ');

    expect(invokeApi).toHaveBeenCalledWith('messages.searchStickers', {
      q: 'cat',
      emoticon: '',
      lang_code: ['ru', 'en'],
      offset: 0,
      limit: 50,
      hash: 0
    });
    expect(page.stickers.map((doc) => doc.id)).toEqual(['1', '2']);
    expect(page.nextOffset).toBe(50);
  });

  it('sends English once when it is the interface language', async() => {
    const {manager, invokeApi} = createManager('en');
    invokeApi.mockResolvedValueOnce(found([]));

    await manager.searchStickersOnServer('cat');

    expect(invokeApi.mock.calls[0][1].lang_code).toEqual(['en']);
  });

  it('keeps a page for the session per query, offset and languages', async() => {
    const {manager, invokeApi} = createManager('ru');
    invokeApi.mockImplementation((_method, params) => Promise.resolve(found([params.q + params.offset], params.offset + 50)));

    await manager.searchStickersOnServer('cat');
    await manager.searchStickersOnServer('cat');
    expect(invokeApi).toHaveBeenCalledTimes(1);

    await manager.searchStickersOnServer('cat', 50);
    expect(invokeApi).toHaveBeenCalledTimes(2);

    // * the interface language changed: the server is asked again
    (manager as any).networkerFactory.language = 'de';
    await manager.searchStickersOnServer('cat');
    expect(invokeApi).toHaveBeenCalledTimes(3);
    expect(invokeApi.mock.calls[2][1].lang_code).toEqual(['de', 'en']);

    // * a refreshed reference asks for the page anew
    await manager.searchStickersOnServer('cat', 0, true);
    expect(invokeApi).toHaveBeenCalledTimes(4);
  });

  it('refreshes a found sticker\'s reference in the languages it was found in', async() => {
    const {manager, invokeApi, saveDoc} = createManager('ru');
    invokeApi.mockImplementation(() => Promise.resolve(found(['1'])));

    await manager.searchStickersOnServer('cat');
    const context = saveDoc.mock.calls[0][1];
    expect(context).toEqual({type: 'stickerSearchQuery', q: 'cat', offset: 0, langCodes: ['ru', 'en']});

    // * the interface language changed since: the page is asked for as it was
    (manager as any).networkerFactory.language = 'de';
    const references = new ReferencesStorage();
    Object.assign(references as any, {appStickersManager: manager});
    await (references as any).getRefreshPromise(context);

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(invokeApi.mock.calls[1][1]).toMatchObject({q: 'cat', offset: 0, lang_code: ['ru', 'en']});
  });

  it('ends the pages when the next offset does not move on', async() => {
    const {manager, invokeApi} = createManager();
    invokeApi
    .mockResolvedValueOnce(found(['1'], 50))
    .mockResolvedValueOnce(found(['2'], 50))
    .mockResolvedValueOnce({_: 'messages.foundStickersNotModified'});

    expect((await manager.searchStickersOnServer('cat')).nextOffset).toBe(50);
    expect((await manager.searchStickersOnServer('cat', 50)).nextOffset).toBeUndefined();
    const notModified = await manager.searchStickersOnServer('dog');
    expect(notModified).toEqual({stickers: [], nextOffset: undefined});
  });

  it('forgets a failed page, so the next ask goes to the server again', async() => {
    const {manager, invokeApi} = createManager();
    invokeApi
    .mockRejectedValueOnce(new Error('FLOOD_WAIT_3'))
    .mockResolvedValueOnce(found(['1']));

    await expect(manager.searchStickersOnServer('cat')).rejects.toThrow('FLOOD_WAIT_3');
    const page = await manager.searchStickersOnServer('cat');

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(page.stickers.map((doc) => doc.id)).toEqual(['1']);
  });

  it('leaves out stickers this browser cannot play', async() => {
    setEnvironment({IS_WEBM_SUPPORTED: false} as any);
    const {manager, invokeApi} = createManager();
    const webm = Object.assign(doc('2'), {sticker: 3});
    invokeApi.mockResolvedValueOnce({...found(['1']), stickers: [doc('1'), webm]});

    const page = await manager.searchStickersOnServer('cat');

    expect(page.stickers.map((doc) => doc.id)).toEqual(['1']);
  });

  it('does not ask for an empty query', async() => {
    const {manager, invokeApi} = createManager();

    expect(await manager.searchStickersOnServer('   ')).toEqual({stickers: []});
    expect(invokeApi).not.toHaveBeenCalled();
  });
});

describe('createStickersSearch', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const createManagers = (local: string[], pages: {[offset: number]: {ids: string[], nextOffset?: number}}) => {
    const searchStickers = vi.fn().mockResolvedValue(local.map(doc));
    const searchStickersOnServer = vi.fn((_query: string, offset: number) => {
      const page = pages[offset];
      return Promise.resolve({stickers: page.ids.map(doc), nextOffset: page.nextOffset});
    });

    return {
      managers: {appStickersManager: {searchStickers, searchStickersOnServer}} as any,
      searchStickers,
      searchStickersOnServer
    };
  };

  it('gives the user\'s own stickers first and the server\'s after them without repeats', async() => {
    vi.useFakeTimers();
    const {managers, searchStickersOnServer} = createManagers(['1', '2'], {
      0: {ids: ['2', '3', '4'], nextOffset: 3},
      3: {ids: ['4', '5']}
    });
    const search = createStickersSearch(managers, 'cat');

    expect((await search.local()).map((doc) => doc.id)).toEqual(['1', '2']);

    const first = search.more();
    // * the first page waits for typing to pause
    await vi.advanceTimersByTimeAsync(399);
    expect(searchStickersOnServer).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await first).map((doc) => doc.id)).toEqual(['3', '4']);
    expect(searchStickersOnServer).toHaveBeenLastCalledWith('cat', 0);

    // * the later ones do not wait
    expect((await search.more()).map((doc) => doc.id)).toEqual(['5']);
    expect(searchStickersOnServer).toHaveBeenLastCalledWith('cat', 3);

    // * nothing more
    expect(search.more()).toBeUndefined();
  });

  it('shows the user\'s own first, and only with none of those the server\'s first page', async() => {
    vi.useFakeTimers();
    const {managers, searchStickersOnServer} = createManagers(['1'], {0: {ids: ['1', '2']}});
    const search = createStickersSearch(managers, 'cat');

    expect((await search.first(await search.local())).map((doc) => doc.id)).toEqual(['1']);
    expect(searchStickersOnServer).not.toHaveBeenCalled();

    const none = createStickersSearch(managers, 'dog');
    const first = none.first([]);
    await vi.advanceTimersByTimeAsync(400);
    expect((await first).map((doc) => doc.id)).toEqual(['1', '2']);
  });

  it('treats the stickers already shown as seen', async() => {
    vi.useFakeTimers();
    const {managers} = createManagers([], {0: {ids: ['1', '2']}});
    const search = createStickersSearch(managers, 'cat', [doc('1')]);

    const first = search.more();
    await vi.advanceTimersByTimeAsync(400);

    expect((await first).map((doc) => doc.id)).toEqual(['2']);
  });

  it('never asks the server for a search left before typing paused', async() => {
    vi.useFakeTimers();
    const {managers, searchStickersOnServer} = createManagers([], {0: {ids: ['1']}});
    const search = createStickersSearch(managers, 'ca');

    const first = search.more();
    search.destroy();
    await vi.advanceTimersByTimeAsync(400);

    expect(await first).toEqual([]);
    expect(searchStickersOnServer).not.toHaveBeenCalled();
    expect(search.more()).toBeUndefined();
  });

  it('pages on past a page with nothing new before saying nothing was found', async() => {
    vi.useFakeTimers();
    const {managers, searchStickersOnServer} = createManagers([], {
      0: {ids: ['1'], nextOffset: 1},
      1: {ids: [], nextOffset: 2},
      2: {ids: ['1', '2'], nextOffset: 3},
      3: {ids: ['3']}
    });
    const search = createStickersSearch(managers, 'cat', [doc('1')]);

    const first = search.first([]);
    await vi.advanceTimersByTimeAsync(400);
    expect((await first).map((doc) => doc.id)).toEqual(['2']);
    expect(searchStickersOnServer.mock.calls.map((call) => call[1])).toEqual([0, 1, 2]);

    // * with every page seen, nothing was found
    const all = createManagers([], {0: {ids: ['1'], nextOffset: 1}, 1: {ids: ['1']}});
    const none = createStickersSearch(all.managers, 'cat', [doc('1')]);
    const empty = none.first([]);
    await vi.advanceTimersByTimeAsync(400);
    expect(await empty).toEqual([]);
    expect(all.searchStickersOnServer).toHaveBeenCalledTimes(2);
    expect(none.more()).toBeUndefined();
  });

  it('asks for a page that did not come again on a scroll, never in a loop', async() => {
    vi.useFakeTimers();
    // * the sentinel stays near the end: every observation says so, a task later
    class NearEndObserver {
      private targets: Set<Element> = new Set();
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.targets.add(target);
        setTimeout(() => this.targets.has(target) && this.callback([{isIntersecting: true, target} as any], this as any));
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
      }
    }
    vi.stubGlobal('IntersectionObserver', NearEndObserver);

    const {managers, searchStickersOnServer} = createManagers([], {0: {ids: ['1'], nextOffset: 1}, 1: {ids: ['2']}});
    const answer = searchStickersOnServer.getMockImplementation();
    let down = true;
    searchStickersOnServer.mockImplementation((query, offset) => offset && down ? Promise.reject(new Error('NETWORK')) : answer(query, offset));

    const search = createStickersSearch(managers, 'cat');
    // * what scrolls may be inside the root (the media editor's tab), and its scroll does not bubble
    const root = document.createElement('div');
    const scroller = document.createElement('div');
    root.append(scroller);
    const received: DocId[] = [];
    search.paginate(document.createElement('div'), root, (stickers) => {
      received.push(...stickers.map((doc) => doc.id));
    });

    await vi.advanceTimersByTimeAsync(10000);
    expect(received).toEqual(['1']);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(2);

    down = false;
    scroller.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(10);
    expect(received).toEqual(['1', '2']);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(3);

    // * a search left behind does not ask on a scroll
    const left = createStickersSearch(managers, 'dog');
    down = true;
    left.paginate(document.createElement('div'), root, () => {});
    await vi.advanceTimersByTimeAsync(10000);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(5);
    left.destroy();
    root.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(5);
  });

  it('tells a first page that did not come from one with nothing, and asks for it again when paginated', async() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const {managers, searchStickersOnServer} = createManagers([], {0: {ids: []}});
    searchStickersOnServer.mockRejectedValueOnce(new Error('INTERNAL'));
    const search = createStickersSearch(managers, 'cat');

    const first = search.first([]);
    await vi.advanceTimersByTimeAsync(400);
    expect(await first).toEqual([]);
    expect(search.failed()).toBe(true);

    const onStickers = vi.fn(), onEnd = vi.fn();
    search.paginate(document.createElement('div'), document.createElement('div'), onStickers, onEnd);
    await vi.advanceTimersByTimeAsync(400);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(2);
    expect(search.failed()).toBe(false);
    expect(onStickers).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it('asks for one page at a time and retries a failed one', async() => {
    vi.useFakeTimers();
    const {managers, searchStickersOnServer} = createManagers([], {0: {ids: ['1'], nextOffset: 1}});
    searchStickersOnServer.mockRejectedValueOnce(new Error('NETWORK'));
    const search = createStickersSearch(managers, 'cat');

    const failed = search.more();
    expect(search.more()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(400);
    expect(await failed).toEqual([]);

    const retried = search.more();
    await vi.advanceTimersByTimeAsync(400);
    expect((await retried).map((doc) => doc.id)).toEqual(['1']);
    expect(searchStickersOnServer).toHaveBeenCalledTimes(2);
  });
});
