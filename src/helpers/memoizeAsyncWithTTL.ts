/**
 * Throttles an asynchronous function by caching its result for a specified duration.
 *
 * If the same arguments (as determined by `getKeyFromArgs`) are passed in again within `timeoutMs`,
 * the cached Promise result is returned instead of re-invoking the function.
 * After `timeoutMs` milliseconds, the cache entry is invalidated automatically.
 *
 * @param callback - The async function to throttle.
 * @param getKeyFromArgs - A function that extracts a unique cache key from the function arguments.
 * @param timeoutMs - The time in milliseconds to cache the result before invalidation.
 * @returns A throttled version of the async function.
 */
export default function memoizeAsyncWithTTL<Callback extends(...args: any[]) => Promise<any>>(
  callback: Callback,
  getKeyFromArgs: (args: Parameters<Callback>) => any,
  timeoutMs: number
) {
  type Args = Parameters<Callback>;

  const cachedResultsMap = new Map<any, ReturnType<Callback>>;

  return (...args: Args) => {
    const key = getKeyFromArgs(args);
    if(cachedResultsMap.has(key)) return cachedResultsMap.get(key);

    const promise = callback(...args).finally(() => {
      self.setTimeout(() => {
        cachedResultsMap.delete(key);
      }, timeoutMs);
    }) as ReturnType<Callback>;

    cachedResultsMap.set(key, promise);

    return promise;
  };
}
