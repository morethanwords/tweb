import deferredPromise from '@helpers/cancellablePromise';

const mocks = vi.hoisted(() => ({
  addSharedObjectURLUpdateListener: vi.fn(),
  createSharedObjectURL: vi.fn(),
  getFile: vi.fn(),
  pinObjectURL: vi.fn(() => vi.fn()),
  releaseSharedObjectURL: vi.fn(),
  save: vi.fn(),
  setSharedObjectURL: vi.fn()
}));

vi.mock('@helpers/objectUrl', () => ({
  addSharedObjectURLUpdateListener: mocks.addSharedObjectURLUpdateListener,
  createSharedObjectURL: mocks.createSharedObjectURL,
  pinObjectURL: mocks.pinObjectURL,
  releaseSharedObjectURL: mocks.releaseSharedObjectURL,
  setSharedObjectURL: mocks.setSharedObjectURL
}));

vi.mock('@lib/accounts/getCurrentAccount', () => ({
  getCurrentAccount: () => 2
}));

vi.mock('@lib/files/cacheStorage', () => ({
  default: class {
    public getFile = mocks.getFile;
    public save = mocks.save;
  }
}));

import ChatBackgroundStore from '@lib/chatBackgroundStore';

function makeOwner(slug: string) {
  return `background:${JSON.stringify([2, `backgrounds/${slug}`])}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ChatBackgroundStore object URL ownership', () => {
  it('releases and forgets a temporary upload preview', () => {
    const slug = 'temporary-upload';
    const url = 'blob:temporary-background';
    const owner = makeOwner(slug);

    ChatBackgroundStore.setBackgroundUrlToCache({slug, url});
    ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});
    ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});

    expect(mocks.setSharedObjectURL).toHaveBeenCalledOnce();
    expect(mocks.setSharedObjectURL).toHaveBeenCalledWith(owner, url);
    expect(mocks.releaseSharedObjectURL).toHaveBeenCalledOnce();
    expect(mocks.releaseSharedObjectURL).toHaveBeenCalledWith(owner, url);
  });

  it('keeps a fresh URL when the entry was deleted mid-flight', async() => {
    const slug = 'deleted-mid-flight';
    const url = 'blob:background/fresh';
    const file = deferredPromise<Blob>();
    mocks.getFile.mockReturnValue(file);
    mocks.createSharedObjectURL.mockResolvedValue(url);

    const promise = ChatBackgroundStore.getBackground({slug});
    ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});
    file.resolve(new Blob(['wallpaper']));

    await expect(promise).resolves.toBe(url);
    expect(mocks.releaseSharedObjectURL).not.toHaveBeenCalled();
    // * the resolved URL was re-cached despite the concurrent delete
    expect(ChatBackgroundStore.getBackground({slug})).toBe(url);

    ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});
  });

  it('defers to a URL set concurrently while resolving from cache storage', async() => {
    const slug = 'superseded';
    const owner = makeOwner(slug);
    const file = deferredPromise<Blob>();
    mocks.getFile.mockReturnValue(file);
    mocks.createSharedObjectURL.mockResolvedValue('blob:background/stale');

    const promise = ChatBackgroundStore.getBackground({slug});
    ChatBackgroundStore.setBackgroundUrlToCache({slug, url: 'blob:background/concurrent'});
    file.resolve(new Blob(['wallpaper']));

    await expect(promise).resolves.toBe('blob:background/concurrent');
    expect(mocks.releaseSharedObjectURL).toHaveBeenCalledExactlyOnceWith(owner, 'blob:background/stale');
    expect(ChatBackgroundStore.getBackground({slug})).toBe('blob:background/concurrent');

    ChatBackgroundStore.deleteBackgroundUrlFromCache({slug});
  });

  it('pins the URL while persisting it to cache storage', async() => {
    const url = 'blob:background/pinned';
    const unpin = vi.fn();
    const blob = new Blob(['bytes']);
    const clonedResponse = {cloned: true};
    mocks.pinObjectURL.mockReturnValue(unpin);
    mocks.save.mockResolvedValue('saved');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(blob),
      clone: () => clonedResponse
    }));

    try {
      await expect(ChatBackgroundStore.saveWallPaperToCache('pinned-slug', url)).resolves.toBe('saved');
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mocks.pinObjectURL).toHaveBeenCalledExactlyOnceWith(url);
    expect(unpin).toHaveBeenCalledOnce();
    expect(mocks.save).toHaveBeenCalledWith({
      entryName: 'backgrounds/pinned-slug',
      response: clonedResponse,
      size: blob.size
    });
  });

  it('preloads wallpapers in parallel without materializing URLs', async() => {
    const downloadMediaVoid = vi.fn(() => new Promise<void>(() => {}));
    const wallPapers = [
      {_: 'wallPaper', slug: 'first', document: {_: 'document', id: '1'}},
      {_: 'wallPaper', slug: 'second', document: {_: 'document', id: '2'}}
    ] as any[];
    const managers = {
      appThemesManager: {getWallPapers: vi.fn().mockResolvedValue(wallPapers)}
    } as any;

    await ChatBackgroundStore.preloadWallPapers(managers, {downloadMediaVoid} as any);

    expect(downloadMediaVoid).toHaveBeenCalledTimes(2);
    expect(ChatBackgroundStore.cachedWallPapers).toBe(wallPapers);
    expect(mocks.createSharedObjectURL).not.toHaveBeenCalled();
    expect(mocks.setSharedObjectURL).not.toHaveBeenCalled();
  });
});
