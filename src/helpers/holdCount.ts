/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

/** How many hold each key: a Map, or a WeakMap of objects */
type Counts<K> = {
  get(key: K): number | undefined,
  set(key: K, value: number): unknown,
  delete(key: K): boolean
};

/** One more holder of `key` */
export function holdCount<K>(counts: Counts<K>, key: K) {
  counts.set(key, (counts.get(key) || 0) + 1);
}

/** One holder of `key` less: true when it was the last, and `key` is held no more */
export function releaseCount<K>(counts: Counts<K>, key: K) {
  const count = counts.get(key) - 1;
  if(count > 0) {
    counts.set(key, count);
    return false;
  }

  counts.delete(key);
  return true;
}
