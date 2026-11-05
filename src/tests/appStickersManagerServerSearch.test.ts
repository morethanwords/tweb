import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppStickersManager} from '@appManagers/appStickersManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import {setEnvironment} from '@environment/utils';
import createStickersSearch from '@components/emoticonsDropdown/stickersSearch';
import {ReferenceContext, ReferencesStorage} from '@lib/storages/references';
import collectUnhandledRejections from '@/tests/helpers/collectUnhandledRejections';
import deferred from '@/tests/helpers/deferred';
import lastItem from '@helpers/array/lastItem';
import dispatchedEvents from '@/tests/helpers/dispatchedEvents';
import makeReferenceRequestFileManager from '@/tests/helpers/referenceRequestFileManager';
import makeApiManagerMethods from '@/tests/helpers/apiManagerMethods';
import withTimeout from '@helpers/schedulers/withTimeout';

const doc = (id: string) => ({_: 'document', id} as any as MyDocument);

const found = (ids: string[], nextOffset?: number) => ({
  _: 'messages.foundStickers' as const,
  hash: 0,
  next_offset: nextOffset,
  stickers: ids.map(doc)
});

const stickers = (ids: string[]) => ({_: 'messages.stickers', hash: 0, stickers: ids.map(doc)});

function createManager(language = 'ru') {
  const invokeApi = vi.fn();
  const invokeApiHashable = vi.fn();
  const saveDoc = vi.fn((document: MyDocument, _context?: ReferenceContext) => document);
  const dispatchEvent = vi.fn();
  const manager = new AppStickersManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi, invokeApiHashable},
    apiFileManager: Object.assign(makeReferenceRequestFileManager(), {downloadMedia: vi.fn()}),
    appDocsManager: {saveDoc},
    networkerFactory: {language},
    rootScope: {premium: false, dispatchEvent}
  });
  manager.clear(true);
  return {manager, invokeApi, invokeApiHashable, saveDoc, dispatchEvent};
}

/**
 * A search by emoji (`messages.getStickers` and the user's own stickers: the suggestions over the composer, the
 * media editor's emoji groups, the premium stickers) is kept for the session. One that failed was kept as well, and
 * every later ask for the same emoji got that failure until the page was reloaded.
 */
describe('AppStickersManager.getStickersByEmoticon', () => {
  const search = (manager: AppStickersManager) => manager.getStickersByEmoticon({emoticon: '🐱', includeServerStickers: true});

  it('forgets a failed search, so the next one asks the server again, and keeps one that came', async() => {
    const {manager, invokeApiHashable} = createManager();
    invokeApiHashable.mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'}).mockResolvedValue(stickers(['1']));

    await expect(search(manager)).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
    expect((await search(manager)).map((doc) => doc.id)).toEqual(['1']);
    expect((await search(manager)).map((doc) => doc.id)).toEqual(['1']);
    expect(invokeApiHashable).toHaveBeenCalledTimes(2);
  });

  it('leaves no failure unhandled when a used sticker reorders a search still on its way', async() => {
    const {manager, invokeApi, invokeApiHashable} = createManager();
    const used = Object.assign(doc('1'), {stickerEmojiRaw: '🐱'});
    Object.assign(manager as any, {recentStickers: []});
    Object.assign((manager as any).appDocsManager, {getDoc: () => used});
    invokeApi.mockResolvedValue(true);
    const request = deferred<never>();
    invokeApiHashable.mockReturnValueOnce(request.promise);

    const unhandled = await collectUnhandledRejections(async() => {
      const searching = search(manager);
      await manager.saveRecentSticker(used.id);
      request.reject({type: 'NETWORK_BAD_REQUEST'});
      await expect(searching).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
    });

    expect(unhandled).toEqual([]);
  });

  it('refreshes a found sticker\'s reference by asking the server anew, past the search kept and its hash', async() => {
    const {manager, saveDoc} = createManager();
    const found = (fileReference: number) => ({_: 'document', id: '1', file_reference: [fileReference]});
    // * the server says nothing new to the hash of what it said last: those stickers, out-of-date references and all
    const invokeApi = vi.fn(async(_method: string, params: {hash?: number}) => {
      return params.hash === 7 ?
        {_: 'messages.stickersNotModified'} :
        {_: 'messages.stickers', hash: 7, stickers: [found(invokeApi.mock.calls.length)]};
    });
    (manager as any).apiManager = makeApiManagerMethods(invokeApi);

    await search(manager);
    const context = saveDoc.mock.calls[0][1];
    expect(context).toEqual({type: 'stickerSearch', emoticon: '🐱'});

    const references = new ReferencesStorage();
    Object.assign(references as any, {appStickersManager: manager});
    await (references as any).getRefreshPromise(context);

    expect(invokeApi).toHaveBeenCalledTimes(2);
    expect(lastItem(saveDoc.mock.calls)).toEqual([found(2), context]);
  });
});

describe('AppStickersManager.getStickerSet', () => {
  const input = {_: 'inputStickerSetShortName', short_name: 'cats'} as const;
  const stickerSet = () => ({
    _: 'messages.stickerSet',
    set: {_: 'stickerSet', id: '5', access_hash: '6', short_name: 'cats', title: 'Cats', count: 1, hash: 0, pFlags: {}},
    packs: [] as any[],
    documents: [doc('1')],
    keywords: [] as any[]
  });

  // * the set kept on the device cannot be read: the storage fails, as a database closed under it does
  function createLoading() {
    const created = createManager();
    Object.assign(created.manager as any, {
      log: Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn()}),
      storage: {
        get: () => Promise.reject(new Error('the storage failed')),
        getFromCache: (): undefined => undefined,
        setToCache: (_key: string, value: unknown) => value,
        set: vi.fn()
      }
    });

    const load = () => withTimeout(Promise.resolve(created.manager.getStickerSet(input)), 100, 'still loading');
    return {...created, load};
  }

  it('asks the server when the set kept here cannot be read, instead of waiting for it for good', async() => {
    const {invokeApi, load} = createLoading();
    invokeApi.mockResolvedValue(stickerSet());

    expect(await load()).toMatchObject({set: {id: '5'}});
    expect(invokeApi).toHaveBeenCalledWith('messages.getStickerSet', {stickerset: input, hash: 0});
  });

  it('settles with nothing when the server fails as well, and asks again the next time', async() => {
    const {invokeApi, load} = createLoading();
    invokeApi.mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'}).mockResolvedValue(stickerSet());

    expect(await load()).toBeNull();
    expect(await load()).toMatchObject({set: {id: '5'}});
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });
});

describe('AppStickersManager.getAnimatedEmojiSounds', () => {
  it('forgets a failed load, so the next ask goes to the server again', async() => {
    const {manager} = createManager();
    const getAppConfig = vi.fn().mockRejectedValueOnce({type: 'NETWORK_BAD_REQUEST'}).mockResolvedValue({emojies_sounds: {}});
    Object.assign((manager as any).apiManager, {getAppConfig, getConfig: vi.fn().mockResolvedValue({this_dc: 2})});

    await expect(manager.getAnimatedEmojiSounds()).rejects.toMatchObject({type: 'NETWORK_BAD_REQUEST'});
    await expect(manager.getAnimatedEmojiSounds()).resolves.toBeUndefined();
    expect(getAppConfig).toHaveBeenCalledTimes(2);
  });
});

/**
 * Faving or unfaving a sticker changes the list at once and tells the panel and the toast (`sticker_updated`). When the
 * server did not take it, the sticker stayed (un)faved here until a reload.
 */
describe('AppStickersManager.faveSticker', () => {
  const ids = (docs: MyDocument[]) => docs.map((doc) => doc.id);

  function createFaving(faved: string[], limit = 5) {
    const created = createManager();
    const docs: {[id: string]: MyDocument} = {};
    const getDoc = (id: string) => docs[id] ??= doc(id);
    Object.assign(created.manager as any, {favedStickers: faved.map(getDoc)});
    Object.assign((created.manager as any).appDocsManager, {getDoc});
    Object.assign((created.manager as any).apiManager, {getLimit: vi.fn().mockResolvedValue(limit)});
    const getFaved = () => ids((created.manager as any).favedStickers);
    const events = (name: string) => dispatchedEvents(created.dispatchEvent, name);
    return {...created, getDoc, getFaved, events};
  }

  it.each([
    ['a fave', ['1', '2'], '3', false, 5, ['3', '1', '2']],
    ['a fave of one faved already', ['1', '2'], '2', false, 5, ['2', '1']],
    ['a fave past the limit', ['1', '2'], '3', false, 2, ['3', '1']],
    ['an unfave', ['1', '2', '3'], '2', true, 5, ['1', '3']]
  ])('%s the server did not take puts the list back, telling the panel with no toast', async(_, faved, docId, unfave, limit, changed) => {
    const {manager, invokeApi, getFaved, events} = createFaving(faved, limit);
    const request = deferred<never>();
    invokeApi.mockReturnValueOnce(request.promise);

    const faving = manager.faveSticker(docId, unfave);
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledWith('messages.faveSticker', expect.objectContaining({unfave})));
    expect(getFaved()).toEqual(changed);

    request.reject({type: 'STICKER_ID_INVALID'});
    await expect(faving).rejects.toMatchObject({type: 'STICKER_ID_INVALID'});

    expect(getFaved()).toEqual(faved);
    // * the toast follows sticker_updated: the change was told once, and its undoing is not
    expect(events('sticker_updated')).toEqual([expect.objectContaining({type: 'faved', faved: !unfave})]);
    expect(events('stickers_updated')).toEqual([{type: 'faved', stickers: (manager as any).favedStickers, reverted: true}]);
    expect(ids(events('stickers_updated')[0].stickers)).toEqual(faved);
  });

  it('leaves a list that came from the server meanwhile as it is', async() => {
    const {manager, invokeApi, getDoc, getFaved, events} = createFaving(['1']);
    const request = deferred<never>();
    invokeApi.mockReturnValueOnce(request.promise);

    const faving = manager.faveSticker('2');
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalled());
    (manager as any).favedStickers = [getDoc('5')];

    request.reject({type: 'STICKER_ID_INVALID'});
    await expect(faving).rejects.toBeDefined();

    expect(getFaved()).toEqual(['5']);
    expect(events('stickers_updated')).toEqual([]);
  });

  it.each([
    ['two faves, the first failing', ['1'], 5, [['2', false], ['3', false]], [0], ['3', '1']],
    ['two faves, both failing', ['1'], 5, [['2', false], ['3', false]], [0, 1], ['1']],
    ['two faves, the second failing first', ['1'], 5, [['2', false], ['3', false]], [1, 0], ['1']],
    ['two faves past the limit, the first failing', ['1', '2'], 2, [['3', false], ['4', false]], [0], ['4', '1']]
  ] as const)('%s: takes out only what failed, keeping the changes made since', async(_, faved, limit, changes, failing, after) => {
    const {manager, invokeApi, invokeApiHashable, getFaved, events} = createFaving([...faved], limit);
    const requests = changes.map(() => deferred<boolean>());
    requests.forEach((request) => invokeApi.mockReturnValueOnce(request.promise));

    const faving = changes.map(([docId, unfave]) => manager.faveSticker(docId, unfave).catch((err) => err));
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(changes.length));
    for(const index of failing) {
      requests[index].reject({type: 'STICKER_ID_INVALID'});
      await faving[index];
    }

    requests.forEach((request) => request.resolve(true));
    await Promise.all(faving);

    expect(getFaved()).toEqual(after);
    expect(ids(lastItem(events('stickers_updated')).stickers)).toEqual(after);
    expect(events('stickers_updated').every(({reverted}) => reverted)).toBe(true);
    expect(events('stickers_updated')).toHaveLength(failing.length);
    expect(invokeApiHashable).not.toHaveBeenCalled();
  });

  it('keeps a fave the server took', async() => {
    const {manager, invokeApi, getFaved, events} = createFaving(['1']);
    invokeApi.mockResolvedValueOnce(true);

    await manager.faveSticker('2');

    expect(getFaved()).toEqual(['2', '1']);
    expect(events('stickers_updated')).toEqual([]);
  });
});

/**
 * The sticker an empty private chat greets with (`getGreetingSticker`, the placeholder of `renderEmptyPlaceholder`)
 * comes from a search by emoji (`messages.getStickers`), made once and kept. A search that failed - offline 5 seconds
 * after the start, when it is preloaded - or found nothing was kept as well, here and by the emoji: every empty chat's
 * placeholder failed with it, and was not shown, until the page was reloaded.
 */
describe('AppStickersManager.getGreetingSticker', () => {
  it.each([
    ['the search failed', false, () => Promise.reject({type: 'NETWORK_BAD_REQUEST'})],
    ['nothing was found', false, () => Promise.resolve(stickers([]))],
    ['the preload failed', true, () => Promise.reject({type: 'NETWORK_BAD_REQUEST'})]
  ])('%s: the next greeting searches again', async(_, justPreload, firstAnswer) => {
    const {manager, invokeApiHashable} = createManager();
    invokeApiHashable.mockImplementationOnce(firstAnswer).mockResolvedValue(stickers(['1']));

    await expect(manager.getGreetingSticker(justPreload)).rejects.toBeDefined();
    await expect(manager.getGreetingSticker()).resolves.toMatchObject({id: '1'});
    expect(invokeApiHashable).toHaveBeenCalledTimes(2);
  });

  it('a search that came is kept: the next greetings take turns from it', async() => {
    const {manager, invokeApiHashable} = createManager();
    invokeApiHashable.mockResolvedValue(stickers(['1', '2']));

    const first = await manager.getGreetingSticker();
    const second = await manager.getGreetingSticker();
    expect(new Set([first.id, second.id])).toEqual(new Set(['1', '2']));
    expect(invokeApiHashable).toHaveBeenCalledTimes(1);
  });
});

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
