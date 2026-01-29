import DEBUG from '@config/debug';
import formatBytesPure from '@helpers/formatBytesPure';
import pause from '@helpers/schedulers/pause';
import commonStateStorage from '@lib/commonStateStorage';
import {HTTPHeaderNames, WatchedCachedStorageName, watchedCachedStorageNames} from '@lib/constants';
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

type CollectedResponse = {
  request: Request;
  response: Response;
  timeSeconds: number;
  size: number;
  storageName: WatchedCachedStorageName;
};

async function clearOldCacheInWatchedStorages({onStorageError}: ClearOldCacheInWatchedStoragesArgs) {
  const settings = await commonStateStorage.get('settings');
  const cacheTTLSeconds = settings?.cacheTTL;

  if(typeof cacheTTLSeconds !== 'number' || !cacheTTLSeconds) return;

  const referenceTimeSeconds = Math.floor(Date.now() / 1000 - cacheTTLSeconds);

  log({referenceTimeSeconds, cacheTTLSeconds});

  const collectedResponses: CollectedResponse[] = [];
  let totalSize = 0;

  for(const storageName of watchedCachedStorageNames) {
    const cacheStorage = new CacheStorageController(storageName);

    log(`iterating ${storageName}`);

    let caughtError: any;

    const collectedForThisStorage: CollectedResponse[] = [];

    try {
      await cacheStorage.minimalBlockingIterateResponses(async({request, cache, response}) => {
        const cachedTimeSeconds = parseInt(response.headers.get(HTTPHeaderNames.cachedTime)) || 0;

        if(cachedTimeSeconds < referenceTimeSeconds) { // drops existing entries with no time header
          log(`deleteing cache from ${storageName}:`, request.url, {cachedTimeSeconds, referenceTimeSeconds});
          await cache.delete(request);
        } else {
          const contentLength = parseInt(response.headers.get(HTTPHeaderNames.contentLength)) || 0;
          totalSize += contentLength;

          collectedForThisStorage.push({request, response, timeSeconds: cachedTimeSeconds, size: contentLength, storageName});
        }
      });

      // Pushes when all operations we're successful, otherwise nukes the whole storage (onStorageError)
      collectedResponses.push(...collectedForThisStorage);
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

  const cacheMaxSize = settings?.cacheSize;
  if(!cacheMaxSize) return; // 0 => no limit

  log(`Total size before deletion: ${formatBytesPure(totalSize)}, Max size: ${formatBytesPure(cacheMaxSize)}`);

  collectedResponses.sort((a, b) => a.timeSeconds - b.timeSeconds);

  const toBeDeleted: Map<WatchedCachedStorageName, CollectedResponse[]> = new Map([
    ['cachedFiles', []],
    ['cachedStreamChunks', []],
    ['cachedHlsStreamChunks', []],
    ['cachedHlsQualityFiles', []]
  ]);

  for(const collectedResponse of collectedResponses) {
    const {size, storageName} = collectedResponse;

    if(totalSize <= cacheMaxSize) break;

    totalSize -= size;
    toBeDeleted.get(storageName)?.push(collectedResponse);
  }

  const entries = Array.from(toBeDeleted.entries());

  const prettyLog = (collectedResponses: CollectedResponse[]) => collectedResponses.map(({request, size, timeSeconds}) => ({url: request.url, size: formatBytesPure(size), time: new Date(timeSeconds * 1000)}));

  // log(`Collected ${collectedResponses.length}: `, prettyLog(collectedResponses));

  // Note: we're worried about catching the error only first time when iterating, as cache.keys() can throw when there are too many entries

  await Promise.all(entries.map(async([storageName, collectedResponses]) => {
    if(!collectedResponses.length) return;

    log(`Deleting ${collectedResponses.length} entries from ${storageName}`, prettyLog(collectedResponses));

    const cacheStorage = new CacheStorageController(storageName);
    try {
      await cacheStorage.timeoutOperation(async(cache) => {
        await Promise.all(collectedResponses.map(({request}) =>
          cache.delete(request)
        ));
      });
    } finally {
      cacheStorage.forget();
    }
  }))
}

const seconds = 1_000;
const minutes = 60 * seconds;

const haveSmallerWarmup = false && DEBUG;

const warmUpWaitTime = haveSmallerWarmup ? (3 * seconds) : (20 * seconds);
const intervalTime = 10 * minutes;

export async function watchCacheStoragesLifetime(args: ClearOldCacheInWatchedStoragesArgs) {
  await pause(warmUpWaitTime); // wait some time for the app to fully initialize

  const tick = async() => {
    await clearOldCacheInWatchedStorages(args);
    setTimeout(tick, intervalTime);
  };

  tick();
}
