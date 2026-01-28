import pause from '@helpers/schedulers/pause';
import commonStateStorage from '@lib/commonStateStorage';
import {cachedTimeHeader, watchedCachedStorageNames} from '@lib/constants';
import CacheStorageController, {CacheStorageDbName} from '@lib/files/cacheStorage';
import {logger} from '@lib/logger';

export const log = logger('SW-clear-old-cache');

type OnStorageErrorArgs = {
  error: unknown;
  storageName: CacheStorageDbName;
};

type ClearOldCacheInWatchedStoragesArgs = {
  onStorageError: (args: OnStorageErrorArgs) => Promise<void>;
};

async function clearOldCacheInWatchedStorages({onStorageError}: ClearOldCacheInWatchedStoragesArgs) {
  const settings = await commonStateStorage.get('settings');
  const cacheTTLSeconds = settings?.cacheTTL;
  if(typeof cacheTTLSeconds !== 'number' || !cacheTTLSeconds) return;

  const referenceTimeSeconds = Math.floor(Date.now() / 1000 - cacheTTLSeconds);

  log({referenceTimeSeconds, cacheTTLSeconds});

  for(const storageName of watchedCachedStorageNames) {
    const cacheStorage = new CacheStorageController(storageName);

    log(`iterating ${storageName}`);

    let caughtError: any;

    try {
      await cacheStorage.minimalBlockingIterateResponses(async({request, cache, response}) => {
        const cachedTimeHeaderValue = response.headers.get(cachedTimeHeader);
        const cachedTimeSeconds = parseInt(cachedTimeHeaderValue) || 0;

        if(cachedTimeSeconds < referenceTimeSeconds) { // drops existing entries with no time header
          log(`deleteing cache from ${storageName}:`, request.url, {cachedTimeSeconds, referenceTimeSeconds});
          await cache.delete(request);
        }
      });
    } catch(error) {
      caughtError = error;
    } finally {
      cacheStorage.forget();
    }

    if(caughtError) {
      await onStorageError({
        storageName,
        error: caughtError
      });
    }
  }
}

const warmUpWaitTime = 20e3;
const intervalTime = 1800e3;

export async function watchCacheStoragesLifetime(args: ClearOldCacheInWatchedStoragesArgs) {
  await pause(warmUpWaitTime); // wait some time for the app to fully initialize

  const tick = async() => {
    await clearOldCacheInWatchedStorages(args);
    setTimeout(tick, intervalTime);
  };

  tick();
}
