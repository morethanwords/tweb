import {createMemo, createRoot, Accessor, onCleanup} from 'solid-js';

type T = Partial<{
  count: number,
  factory: () => any,
  value: any,
  dispose: () => void
}>;

const cache = new Map<string, T>();

/**
 * `cacheKey` is global to the app, so spell it out — never build it from a function's `.name`: the
 * minifier names functions per chunk, and two that land in different chunks can come out the same.
 */
export default function useDynamicCachedValue<T>(cacheKey: Accessor<string>, factory: () => T): Accessor<T> {
  return createMemo(() => {
    const currentKey = cacheKey();
    let entry = cache.get(currentKey);

    if(!entry) {
      let failed = false;
      entry = {count: 0, factory};
      entry.value = createRoot((dispose) => {
        entry.dispose = dispose;
        try {
          return factory();
        } catch(err) {
          // whatever the factory had set up before it threw (listeners, timers) goes with it
          failed = true;
          dispose();
          throw err;
        }
      });

      // Inside a running update the throw carries on up; outside one `createRoot` reports it and
      // returns undefined instead. Caching that would hand the failure to every later caller for
      // the rest of the session, so let the next one build afresh.
      if(failed) {
        return entry.value;
      }

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
