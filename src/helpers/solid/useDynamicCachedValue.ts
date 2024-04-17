import {createMemo, createRoot, Accessor, onCleanup} from 'solid-js';

type T = Partial<{
  count: number,
  factory: () => any,
  value: any,
  dispose: () => void
}>;

const cache = new Map<string, T>();

export default function useDynamicCachedValue<T>(cacheKey: Accessor<string>, factory: () => T): Accessor<T> {
  return createMemo(() => {
    const currentKey = cacheKey();
    let entry = cache.get(currentKey);

    if(!entry) {
      entry = {count: 0, factory};
      entry.value = createRoot((dispose) => {
        entry.dispose = dispose;
        return factory();
      });
      cache.set(currentKey, entry);
    }

    ++entry.count;

    onCleanup(() => {
      if(!--entry.count) {
        entry.dispose();
        cache.delete(currentKey);
      }
    });

    return entry.value;
  });
}
