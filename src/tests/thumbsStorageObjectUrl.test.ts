const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn(),
  mirror: vi.fn(),
  registry: undefined as any,
  revokeObjectURL: vi.fn()
}));

vi.mock('@lib/mainWorker/objectUrlRegistry', async(importOriginal) => {
  const actual: any = await importOriginal();
  mocks.registry = new actual.ObjectUrlRegistry({
    createObjectURL: mocks.createObjectURL,
    revokeObjectURL: mocks.revokeObjectURL
  }, 0);

  return {
    ...actual,
    default: mocks.registry
  };
});

vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {
    getInstance: () => ({
      invokeVoid: mocks.mirror
    })
  }
}));

import {resetSharedObjectURLCaches} from '@lib/mainWorker/sharedObjectUrlCache';
import ThumbsStorage from '@lib/storages/thumbs';

const blob = new Blob(['thumb']);
const makeDocument = (id: string) => ({_: 'document', id}) as any;
const makeStorage = () => {
  const storage = new ThumbsStorage();
  (storage as any).accountNumber = 1;
  return storage;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  let nextUrl = 0;
  mocks.createObjectURL.mockImplementation(() => `blob:test/created-${++nextUrl}`);
});

afterEach(() => {
  resetSharedObjectURLCaches();
  mocks.registry.dispose();
  vi.useRealTimers();
});

describe('ThumbsStorage object URL ownership', () => {
  it('does not retain empty lookups and mutates removed contexts', () => {
    const storage = makeStorage();
    const missing = makeDocument('missing');

    storage.getCacheContext(missing);
    expect((storage as any).thumbsCache).toEqual({});

    const media = makeDocument('removed');
    const context = storage.setCacheContextURL(media, '', 'blob:test/removed', 10);
    storage.deleteCacheContext(media);

    expect(context).toMatchObject({downloaded: 0, url: ''});
    expect((storage as any).thumbsCache.documentremoved).toBeUndefined();
    expect(mocks.mirror).toHaveBeenLastCalledWith('mirror', {
      name: 'thumbs',
      key: 'documentremoved\x01',
      value: undefined,
      previousUrl: 'blob:test/removed',
      accountNumber: 1
    });

    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:test/removed');
  });

  it('replaces a URL in place and ignores a stale conditional invalidation', () => {
    const storage = makeStorage();
    const media = makeDocument('replacement');
    const previous = storage.setCacheContextURL(media, '', 'blob:test/old', 10);

    const current = storage.setCacheContextURL(media, '', 'blob:test/new', 20);
    mocks.mirror.mockClear();
    (storage as any).invalidateCacheContext('documentreplacement', '', 'blob:test/old');

    expect(current).toBe(previous);
    expect(current).toMatchObject({downloaded: 20, url: 'blob:test/new'});
    expect(storage.getCacheContext(media, '')).toBe(current);
    expect(mocks.mirror).not.toHaveBeenCalled();
  });

  it('mirrors a replacement with the orphaned previous URL and revokes it after the grace period', () => {
    const storage = makeStorage();
    const media = makeDocument('replace');
    storage.setCacheContextURL(media, '', 'blob:test/old', 10);
    mocks.mirror.mockClear();

    storage.setCacheContextURL(media, '', 'blob:test/new', 20);

    expect(mocks.mirror).toHaveBeenCalledExactlyOnceWith('mirror', {
      name: 'thumbs',
      key: 'documentreplace\x01',
      value: {downloaded: 20, url: 'blob:test/new', type: ''},
      previousUrl: 'blob:test/old',
      accountNumber: 1
    });

    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:test/old');
    expect(mocks.revokeObjectURL).not.toHaveBeenCalledWith('blob:test/new');
  });

  it('moves ownership without forgetting the still-owned URL', () => {
    const storage = makeStorage();
    const temporary = makeDocument('temporary');
    const final = makeDocument('final');
    const previous = storage.setCacheContextBlob(temporary, '', blob, 42, undefined, true);
    const url = previous.url;
    mocks.mirror.mockClear();

    const moved = storage.moveCacheContext(temporary, final, '', 'y');

    expect(moved).toMatchObject({downloaded: 42, type: 'y', url});
    expect(previous).toMatchObject({downloaded: 0, url: ''});
    expect((storage as any).thumbsCache.documenttemporary).toBeUndefined();
    expect(storage.getCacheContext(final, 'y')).toBe(moved);
    expect(mocks.mirror).toHaveBeenCalledTimes(2);
    expect(mocks.mirror).toHaveBeenNthCalledWith(1, 'mirror', {
      name: 'thumbs',
      key: 'documentfinal\x01y',
      value: {downloaded: 42, url, type: 'y'},
      accountNumber: 1
    });
    // * the moved URL is still owned by the destination key — no previousUrl
    expect(mocks.mirror).toHaveBeenNthCalledWith(2, 'mirror', {
      name: 'thumbs',
      key: 'documenttemporary\x01',
      value: undefined,
      accountNumber: 1
    });

    vi.runOnlyPendingTimers();
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
  });

  it('replaces a sticker preview with a single mirror message', () => {
    const storage = makeStorage();
    storage.saveStickerPreview('1', blob, 10, 10, 0);
    const first = storage.getStickerCachedThumb('1', 0);
    const firstUrl = first.url;
    mocks.mirror.mockClear();

    storage.saveStickerPreview('1', new Blob(['bigger']), 20, 20, 0);
    const second = storage.getStickerCachedThumb('1', 0);

    expect(second).toBe(first);
    expect(second).toMatchObject({w: 20, h: 20});
    expect(second.url).not.toBe(firstUrl);
    expect(mocks.mirror).toHaveBeenCalledExactlyOnceWith('mirror', {
      name: 'stickerThumbs',
      key: '1-0',
      value: second,
      previousUrl: firstUrl,
      accountNumber: 1
    });

    vi.runOnlyPendingTimers();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith(firstUrl);
    expect(mocks.revokeObjectURL).not.toHaveBeenCalledWith(second.url);
  });
});
