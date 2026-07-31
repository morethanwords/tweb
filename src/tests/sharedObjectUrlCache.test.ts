import SharedObjectUrlCache from '@lib/mainWorker/sharedObjectUrlCache';
import {ObjectUrlRegistry} from '@lib/mainWorker/objectUrlRegistry';

const registries: ObjectUrlRegistry[] = [];

function makeRegistry() {
  let next = 0;
  const createObjectURL = vi.fn(() => `blob:test/shared-${++next}`);
  const revokeObjectURL = vi.fn();
  const registry = new ObjectUrlRegistry({
    createObjectURL,
    revokeObjectURL
  }, 1);
  registries.push(registry);
  return {createObjectURL, registry, revokeObjectURL};
}

function makeCache(
  registry: ObjectUrlRegistry,
  options: Partial<ConstructorParameters<typeof SharedObjectUrlCache<string>>[0]> = {}
) {
  return new SharedObjectUrlCache<string>({
    getOwner: (key) => `thumb:${key}`,
    maxBytes: Infinity,
    maxURLs: Infinity,
    ...options
  }, registry);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for(const registry of registries.splice(0)) {
    registry.dispose();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('SharedObjectUrlCache', () => {
  it('evicts least-recently-used URLs by count after releasing the owner', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const evicted: Array<{key: string, url: string, owned: boolean}> = [];
    const cache = makeCache(registry, {
      maxURLs: 2,
      onEvict: (key, url) => void evicted.push({key, url, owned: registry.hasOwners(url)})
    });

    const first = cache.create('first', new Blob(['1'])).url;
    const second = cache.create('second', new Blob(['2'])).url;
    expect(cache.getOrCreate('first', new Blob(['unused']))).toBe(first);
    cache.create('third', new Blob(['3']));

    expect(evicted).toEqual([{key: 'second', url: second, owned: false}]);
    expect(cache.isURLOwned(first)).toBe(true);

    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(second);
  });

  it('evicts least-recently-used URLs by retained bytes', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const evicted: Array<[string, string]> = [];
    const cache = makeCache(registry, {
      maxBytes: 3,
      onEvict: (key, url) => void evicted.push([key, url])
    });

    const first = cache.create('first', new Blob(['12'])).url;
    const second = cache.create('second', new Blob(['34'])).url;

    expect(evicted).toEqual([['first', first]]);
    expect(cache.isURLOwned(first)).toBe(false);
    expect(cache.isURLOwned(second)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(first);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(second);
  });

  it('reports the previous URL when a key is replaced', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const cache = makeCache(registry);

    const first = cache.create('same', new Blob(['previous']));
    expect(first.previousUrl).toBeUndefined();

    const next = cache.create('same', new Blob(['next']));
    expect(next.url).not.toBe(first.url);
    expect(next.previousUrl).toBe(first.url);

    expect(cache.isURLOwned(first.url)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(first.url);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(next.url);
  });

  it('adopts an externally created object URL', () => {
    const {registry} = makeRegistry();
    const cache = makeCache(registry);
    const url = 'blob:test/adopted';

    const result = cache.adopt('key', url, 5);

    expect(result).toEqual({url, previousUrl: undefined});
    expect(cache.isURLOwned(url)).toBe(true);
    expect(registry.getURLSize(url)).toBe(5);
    expect(cache.delete('key', url)).toBe(true);
    expect(cache.isURLOwned(url)).toBe(false);
  });

  it('forgets the entry when adopting a non-blob URL', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const cache = makeCache(registry);
    const first = cache.create('key', new Blob(['1'])).url;

    const result = cache.adopt('key', 'https://example.com/image.jpg');

    expect(result).toEqual({url: 'https://example.com/image.jpg', previousUrl: first});
    expect(cache.delete('key')).toBe(false);
    expect(cache.isURLOwned(first)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(first);
  });

  it('keeps pinned entries outside the LRU budget', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const evicted: string[] = [];
    const cache = makeCache(registry, {
      maxBytes: 1,
      maxURLs: 1,
      onEvict: (key) => void evicted.push(key)
    });

    const pinned = cache.create('pinned', new Blob(['large']), true).url;
    const first = cache.create('first', new Blob(['1'])).url;
    cache.create('second', new Blob(['2']));

    expect(evicted).toEqual(['first']);
    expect(cache.isURLOwned(pinned)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(first);
    expect(revokeObjectURL).not.toHaveBeenCalledWith(pinned);

    expect(cache.delete('pinned')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(pinned);
  });

  it('rejects delete with a mismatched expected URL', () => {
    const {registry} = makeRegistry();
    const cache = makeCache(registry);
    const url = cache.create('key', new Blob(['1'])).url;

    expect(cache.delete('key', 'blob:test/other')).toBe(false);
    expect(cache.isURLOwned(url)).toBe(true);

    expect(cache.delete('key', url)).toBe(true);
    expect(cache.delete('key')).toBe(false);
    expect(cache.isURLOwned(url)).toBe(false);
  });

  it('evicts entries matching an owner predicate', () => {
    const {registry} = makeRegistry();
    const evicted: Array<[string, string]> = [];
    const cache = makeCache(registry, {
      onEvict: (key, url) => void evicted.push([key, url])
    });

    const doc = cache.create('doc-1', new Blob(['1'])).url;
    const avatar = cache.create('avatar-1', new Blob(['2'])).url;

    cache.evictWhere((owner) => owner.startsWith('thumb:doc-'));

    expect(evicted).toEqual([['doc-1', doc]]);
    expect(cache.isURLOwned(doc)).toBe(false);
    expect(cache.isURLOwned(avatar)).toBe(true);
  });

  it('returns the same URL from getOrCreate for a cached key', () => {
    const {createObjectURL, registry} = makeRegistry();
    const cache = makeCache(registry);

    const url = cache.getOrCreate('key', new Blob(['1']));
    expect(cache.getOrCreate('key', new Blob(['other']))).toBe(url);
    expect(createObjectURL).toHaveBeenCalledOnce();
  });
});
