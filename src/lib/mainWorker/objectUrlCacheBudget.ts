export type ObjectUrlCacheBudgetEntry<Key> = {
  key: Key,
  url: string,
  size: number
};

export default class ObjectUrlCacheBudget<Key> {
  private entries = new Map<Key, ObjectUrlCacheBudgetEntry<Key>>();
  private urls = new Map<string, {keys: Map<Key, number>, size: number}>();
  private totalBytes = 0;

  constructor(
    private maxURLs: number,
    private maxBytes: number
  ) {
  }

  public set(key: Key, url: string, size = 0) {
    this.delete(key);
    const entry = {key, url, size};
    this.entries.set(key, entry);

    const retained = this.urls.get(url);
    if(retained) {
      retained.keys.set(key, size);
      if(size > retained.size) {
        this.totalBytes += size - retained.size;
        retained.size = size;
      }
    } else {
      this.urls.set(url, {keys: new Map([[key, size]]), size});
      this.totalBytes += size;
    }

    return this.trim();
  }

  public touch(key: Key) {
    const entry = this.entries.get(key);
    if(!entry) {
      return;
    }

    for(const alias of this.urls.get(entry.url)?.keys.keys() || []) {
      const aliasEntry = this.entries.get(alias);
      if(aliasEntry) {
        this.entries.delete(alias);
        this.entries.set(alias, aliasEntry);
      }
    }
  }

  public delete(key: Key) {
    const entry = this.entries.get(key);
    if(!entry) {
      return;
    }

    this.entries.delete(key);
    const retained = this.urls.get(entry.url);
    if(!retained) {
      return entry;
    }

    retained.keys.delete(key);
    if(!retained.keys.size) {
      this.urls.delete(entry.url);
      this.totalBytes -= retained.size;
    } else if(entry.size === retained.size) {
      let nextSize = 0;
      for(const size of retained.keys.values()) {
        nextSize = Math.max(nextSize, size);
      }
      this.totalBytes += nextSize - retained.size;
      retained.size = nextSize;
    }
    return entry;
  }

  public clear() {
    this.entries.clear();
    this.urls.clear();
    this.totalBytes = 0;
  }

  private trim() {
    const evicted: ObjectUrlCacheBudgetEntry<Key>[] = [];

    while(
      this.urls.size > this.maxURLs ||
      (this.totalBytes > this.maxBytes && this.urls.size > 1)
    ) {
      const candidate = this.entries.values().next().value as ObjectUrlCacheBudgetEntry<Key> | undefined;
      if(!candidate) break;

      const aliases = [...this.urls.get(candidate.url).keys.keys()];
      for(const key of aliases) {
        const entry = this.delete(key);
        entry && evicted.push(entry);
      }
    }

    return evicted;
  }
}
