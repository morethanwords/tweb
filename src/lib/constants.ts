import {CacheStorageDbName} from './files/cacheStorage';

export const cachedVideoChunksStorageNames = [
  'cachedStreamChunks',
  'cachedHlsStreamChunks',
  'cachedHlsQualityFiles'
] satisfies CacheStorageDbName[];

export const cachedFilesStorageName = 'cachedFiles' satisfies CacheStorageDbName;

export const watchedCachedStorageNames = [cachedFilesStorageName, ...cachedVideoChunksStorageNames] satisfies CacheStorageDbName[];
export type WatchedCachedStorageName = typeof watchedCachedStorageNames[number];

export const HTTPHeaderNames = {
  cachedTime: 'Time-Cached',
  contentLength: 'Content-Length',
  contentType: 'Content-Type'
};

export const oneDayInSeconds = 24 * 60 * 60;
export const oneWeekInSeconds = oneDayInSeconds * 7;
export const oneMonthInSeconds = oneDayInSeconds * 31;
export const oneYearInSeconds = oneDayInSeconds * 365;
