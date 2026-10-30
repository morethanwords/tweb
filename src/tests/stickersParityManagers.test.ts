import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppStickersManager} from '@appManagers/appStickersManager';
import {AppEmojiManager} from '@appManagers/appEmojiManager';
import {AppReactionsManager} from '@appManagers/appReactionsManager';
import {getStickerSetInputByStickerSet} from '@lib/appManagers/utils/stickers/getStickerSetInput';

const set = (id: string) => ({_: 'stickerSet', id, access_hash: '1', title: 'Set ' + id, short_name: 'set' + id, count: 1, pFlags: {}} as any);
const covered = (id: string) => ({_: 'stickerSetNoCovered', set: set(id)} as any);

function createStickersManager() {
  const invokeApi = vi.fn().mockResolvedValue(true);
  const invokeApiSingleProcess = vi.fn((options: {method: string, params: any, processResult: (result: any) => any}) => {
    return Promise.resolve(options.processResult(answers[options.method](options.params)));
  });
  const invokeApiHashable = vi.fn((options: {method: string, processResult: (result: any) => any}) => {
    return Promise.resolve(options.processResult(answers[options.method]({})));
  });
  const answers: {[method: string]: (params: any) => any} = {};
  const manager = new AppStickersManager();
  Object.assign(manager as any, {
    apiManager: {invokeApi, invokeApiSingleProcess, invokeApiHashable},
    appDocsManager: {saveDoc: (doc: any) => doc},
    storage: {
      getFromCache: (): any => undefined,
      setToCache: (_key: string, value: any) => value,
      set: vi.fn()
    }
  });
  manager.clear(true);
  return {manager, invokeApi, invokeApiSingleProcess, answers};
}

describe('trending sets: older pages and read marks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pages the old trending sets by the count loaded, and ends on a short page', async() => {
    const {manager, invokeApiSingleProcess, answers} = createStickersManager();
    answers['messages.getOldFeaturedStickers'] = ({offset}) => ({
      _: 'messages.featuredStickers',
      pFlags: {},
      hash: 0,
      count: 0,
      unread: [],
      sets: Array.from({length: offset ? 3 : 40}, (_, idx) => covered('' + (offset + idx)))
    });

    const first = await manager.getOldFeaturedStickers(0);
    expect(invokeApiSingleProcess.mock.calls[0][0].params).toEqual({offset: 0, limit: 40, hash: 0});
    expect(first.sets).toHaveLength(40);
    expect(first.nextOffset).toBe(40);

    const last = await manager.getOldFeaturedStickers(40);
    expect(last.sets).toHaveLength(3);
    expect(last.nextOffset).toBeUndefined();
  });

  it('marks read only the unread sets seen, together, a second after the first', async() => {
    vi.useFakeTimers();
    const {manager, invokeApi, answers} = createStickersManager();
    answers['messages.getFeaturedStickers'] = () => ({
      _: 'messages.featuredStickers',
      pFlags: {},
      hash: 1,
      count: 3,
      unread: ['1', '2'],
      sets: [covered('1'), covered('2'), covered('3')]
    });
    answers['messages.getOldFeaturedStickers'] = () => ({
      _: 'messages.featuredStickers',
      pFlags: {},
      hash: 0,
      count: 0,
      unread: ['10'],
      sets: [covered('10')]
    });

    await manager.getFeaturedStickers();
    await manager.getOldFeaturedStickers(0);

    manager.readFeaturedStickerSets(['1', '3']);
    await vi.advanceTimersByTimeAsync(500);
    manager.readFeaturedStickerSets(['10', '1']);
    expect(invokeApi).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(invokeApi).toHaveBeenCalledOnce();
    expect(invokeApi).toHaveBeenCalledWith('messages.readFeaturedStickers', {id: ['1', '10']});

    // * read once, never again; a set that was never unread is not sent
    manager.readFeaturedStickerSets(['1', '10', '3']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invokeApi).toHaveBeenCalledOnce();

    manager.readFeaturedStickerSets(['2']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invokeApi).toHaveBeenLastCalledWith('messages.readFeaturedStickers', {id: ['2']});
  });

  it('asks for the read marks again when sets were read elsewhere, keeping what is unread still', async() => {
    vi.useFakeTimers();
    const {manager, invokeApi, answers} = createStickersManager();
    let listeners: {updateReadFeaturedStickers: () => void};
    Object.assign(manager as any, {
      apiUpdatesManager: {addMultipleEventsListeners: (l: typeof listeners) => listeners = l},
      rootScope: {addEventListener: vi.fn()}
    });
    const storage = (manager as any).storage;
    (manager as any).after();
    Object.assign(manager as any, {storage});

    let unread = ['1', '2', '3'];
    answers['messages.getFeaturedStickers'] = () => ({
      _: 'messages.featuredStickers',
      pFlags: {},
      hash: 1,
      count: 3,
      unread,
      sets: [covered('1'), covered('2'), covered('3')]
    });
    answers['messages.getOldFeaturedStickers'] = () => ({
      _: 'messages.featuredStickers',
      pFlags: {},
      hash: 0,
      count: 0,
      unread: ['10'],
      sets: [covered('10')]
    });

    await manager.getFeaturedStickers();
    await manager.getOldFeaturedStickers(0);
    // * seen here, not sent yet
    manager.readFeaturedStickerSets(['3']);

    // * another device read the first set: which one, the update does not say
    unread = ['2', '3'];
    listeners.updateReadFeaturedStickers();
    await vi.advanceTimersByTimeAsync(0);

    // * the sets still unread are marked read when seen; the one read elsewhere and the one sent are not
    manager.readFeaturedStickerSets(['1', '2', '10']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(invokeApi).toHaveBeenCalledOnce();
    expect(invokeApi).toHaveBeenCalledWith('messages.readFeaturedStickers', {id: ['3', '2', '10']});
  });

  it('asks nothing when sets were read elsewhere and none is unread here', () => {
    const {manager} = createStickersManager();
    let listeners: {updateReadFeaturedStickers: () => void};
    Object.assign(manager as any, {
      apiUpdatesManager: {addMultipleEventsListeners: (l: typeof listeners) => listeners = l},
      rootScope: {addEventListener: vi.fn()}
    });
    (manager as any).after();
    const getFeaturedStickers = vi.spyOn(manager, 'getFeaturedStickers');

    listeners.updateReadFeaturedStickers();

    expect(getFeaturedStickers).not.toHaveBeenCalled();
  });
});

describe('archived sets', () => {
  it('asks a page after the last set and answers the sets themselves with the total', async() => {
    const {manager, invokeApiSingleProcess, answers} = createStickersManager();
    answers['messages.getArchivedStickers'] = () => ({
      _: 'messages.archivedStickers',
      count: 20,
      sets: [covered('5'), covered('6')]
    });

    const page = await manager.getArchivedStickers('4');

    expect(invokeApiSingleProcess.mock.calls[0][0].method).toBe('messages.getArchivedStickers');
    expect(invokeApiSingleProcess.mock.calls[0][0].params).toEqual({offset_id: '4', limit: 15});
    expect(page.count).toBe(20);
    expect(page.sets.map((set) => set.id)).toEqual(['5', '6']);

    await manager.getArchivedStickers(0, 0);
    expect(invokeApiSingleProcess.mock.calls[1][0].params).toEqual({offset_id: 0, limit: 0});
  });

  it('takes the server\'s word that a set kept here as installed is archived, so Add restores it', async() => {
    const {manager, invokeApi, answers} = createStickersManager();
    const cache: {[key: string]: any} = {};
    const dispatchEvent = vi.fn();
    Object.assign(manager as any, {
      storage: {
        getFromCache: (key: string) => cache[key],
        set: vi.fn(),
        delete: vi.fn()
      },
      rootScope: {dispatchEvent}
    });

    // * installed when this device last looked, with its stickers
    const installed = {...set('5'), installed_date: 100};
    const documents = [{_: 'document', id: 'd1'}];
    const cached = {set: installed, documents, packs: [] as any[], keywords: [] as any[]};
    cache[(manager as any).getCacheKey(getStickerSetInputByStickerSet(installed))] = cached;
    answers['messages.getArchivedStickers'] = () => ({
      _: 'messages.archivedStickers',
      count: 1,
      sets: [{_: 'stickerSetNoCovered', set: {...set('5'), installed_date: 100, pFlags: {archived: true}}}]
    });

    const page = await manager.getArchivedStickers();

    expect(installed.pFlags.archived).toBe(true);
    expect(cached.documents).toBe(documents);
    expect(cached.documents).toHaveLength(1);
    expect(dispatchEvent).toHaveBeenCalledWith('stickers_deleted', installed);

    await manager.toggleStickerSet(page.sets[0]);
    expect(invokeApi).toHaveBeenCalledWith('messages.installStickerSet', {
      stickerset: getStickerSetInputByStickerSet(installed),
      archived: false
    });
    expect(invokeApi.mock.calls.map((call) => call[0])).not.toContain('messages.uninstallStickerSet');
  });
});

describe('AppEmojiManager.getEmojiGroups', () => {
  it.each([
    ['stickers', 'messages.getEmojiStickerGroups'],
    ['esg', 'messages.getEmojiGroups'],
    ['status', 'messages.getEmojiStatusGroups'],
    ['profilePhoto', 'messages.getEmojiProfilePhotoGroups']
  ] as const)('asks the %s groups with %s', async(type, method) => {
    const invokeApiSingleProcess = vi.fn((options: {processResult: (result: any) => any}) => {
      return Promise.resolve(options.processResult({_: 'messages.emojiGroups', hash: 0, groups: []}));
    });
    const manager = new AppEmojiManager();
    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      getCustomEmojiDocument: vi.fn()
    });

    await manager.getEmojiGroups(type);

    expect(invokeApiSingleProcess).toHaveBeenCalledOnce();
    expect(invokeApiSingleProcess.mock.calls[0][0]).toMatchObject({method, params: {hash: 0}});
  });
});

describe('AppReactionsManager.clearRecentReactions', () => {
  it('forgets the recent reactions at once and tells the server', async() => {
    const invokeApi = vi.fn().mockResolvedValue(true);
    const invokeApiHashable = vi.fn();
    const manager = new AppReactionsManager();
    Object.assign(manager as any, {
      apiManager: {invokeApi, invokeApiHashable}
    });
    manager.clear(true);
    (manager as any).reactions.recent = [{_: 'reactionEmoji', emoticon: '🔥'}];

    await manager.clearRecentReactions();

    expect(invokeApi).toHaveBeenCalledWith('messages.clearRecentReactions');
    expect(manager.getRecentReactions()).toEqual([]);
    expect(invokeApiHashable).not.toHaveBeenCalled();
  });
});
