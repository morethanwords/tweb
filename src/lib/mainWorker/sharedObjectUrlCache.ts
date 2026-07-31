import {isObjectURL} from '@helpers/objectUrlUtils';
import ObjectUrlCacheBudget from '@lib/mainWorker/objectUrlCacheBudget';
import objectUrlRegistry from '@lib/mainWorker/objectUrlRegistry';
import type {ObjectUrlOwner, ObjectUrlRegistry} from '@lib/mainWorker/objectUrlRegistry';
import Modes from '@config/modes';

type SharedObjectUrlCacheOptions<Key> = {
  getOwner: (key: Key) => ObjectUrlOwner,
  maxBytes: number,
  maxURLs: number,
  // * Fired after the registry owner is already released, so the callback can
  // * check `isURLOwned` to decide whether the URL is actually going away.
  onEvict?: (key: Key, url: string) => void
};

type SharedObjectUrlCacheEntry<Key> = {
  key: Key,
  url: string
};

export type SharedObjectUrlCacheResult = {
  url: string,
  previousUrl?: string
};

const caches = new Set<SharedObjectUrlCache<any>>();

export function releaseSharedObjectURLsWhere(predicate: (owner: ObjectUrlOwner) => boolean) {
  for(const cache of caches) {
    cache.evictWhere(predicate);
  }
}

export function resetSharedObjectURLCaches() {
  for(const cache of caches) {
    cache.reset();
  }
}

export default class SharedObjectUrlCache<Key> {
  private budget: ObjectUrlCacheBudget<ObjectUrlOwner>;
  private entries = new Map<ObjectUrlOwner, SharedObjectUrlCacheEntry<Key>>();

  constructor(
    private options: SharedObjectUrlCacheOptions<Key>,
    private registry: ObjectUrlRegistry = objectUrlRegistry
  ) {
    this.budget = new ObjectUrlCacheBudget(options.maxURLs, options.maxBytes);
    caches.add(this);
  }

  public create(key: Key, blob: Blob, pinned = false): SharedObjectUrlCacheResult {
    const owner = this.options.getOwner(key);
    const previousUrl = this.entries.get(owner)?.url;
    const url = this.registry.createShared(blob, owner);
    this.track(owner, key, url, blob.size, pinned);
    return {url, previousUrl: previousUrl !== url ? previousUrl : undefined};
  }

  public getOrCreate(key: Key, blob: Blob) {
    const owner = this.options.getOwner(key);
    const entry = this.entries.get(owner);
    if(entry) {
      this.budget.touch(owner);
      return entry.url;
    }

    return this.create(key, blob).url;
  }

  public adopt(key: Key, url: string, size = 0, pinned = false): SharedObjectUrlCacheResult {
    const owner = this.options.getOwner(key);
    const previousUrl = this.entries.get(owner)?.url;
    this.registry.setSharedOwnerURL(owner, url, size);

    if(isObjectURL(url)) {
      this.track(owner, key, url, this.registry.getURLSize(url) ?? size, pinned);
    } else {
      this.forget(owner);
    }
    return {url, previousUrl: previousUrl !== url ? previousUrl : undefined};
  }

  public touch(key: Key) {
    this.budget.touch(this.options.getOwner(key));
  }

  public isURLOwned(url: string) {
    return this.registry.hasOwners(url);
  }

  public delete(key: Key, expectedUrl?: string) {
    const owner = this.options.getOwner(key);
    const entry = this.entries.get(owner);
    if(!entry || (expectedUrl !== undefined && entry.url !== expectedUrl)) {
      return false;
    }

    this.evict(owner, entry);
    return true;
  }

  public evictWhere(predicate: (owner: ObjectUrlOwner) => boolean) {
    for(const [owner, entry] of [...this.entries]) {
      if(predicate(owner)) {
        this.evict(owner, entry);
      }
    }
  }

  public reset() {
    this.entries.clear();
    this.budget.clear();
  }

  private track(
    owner: ObjectUrlOwner,
    key: Key,
    url: string,
    size: number,
    pinned = false
  ) {
    this.entries.set(owner, {key, url});
    // * pinned entries are exempt from the budget; the kill switch exempts
    // * everything, so the LRU never evicts and mirrors are never invalidated
    if(pinned || Modes.noObjectUrlRevoke) {
      this.budget.delete(owner);
      return;
    }

    const evicted = this.budget.set(owner, url, size);
    for(const {key: evictedOwner, url: evictedUrl} of evicted) {
      const entry = this.entries.get(evictedOwner);
      if(entry?.url === evictedUrl) {
        this.evict(evictedOwner, entry);
      }
    }
  }

  private evict(owner: ObjectUrlOwner, entry: SharedObjectUrlCacheEntry<Key>) {
    this.forget(owner);
    this.registry.releaseSharedOwnerURL(owner);
    this.options.onEvict?.(entry.key, entry.url);
  }

  private forget(owner: ObjectUrlOwner) {
    this.entries.delete(owner);
    this.budget.delete(owner);
  }
}
