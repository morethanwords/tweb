import {CacheStorageDbName} from './files/cacheStorage';

export const cachedVideoChunksStorageNames: CacheStorageDbName[] = [
  'cachedStreamChunks',
  'cachedHlsStreamChunks',
  'cachedHlsQualityFiles'
];

export const cachedFilesStorageName = 'cachedFiles' satisfies CacheStorageDbName;

export const watchedCachedStorageNames: CacheStorageDbName[] = [cachedFilesStorageName, ...cachedVideoChunksStorageNames];

export const cachedTimeHeader = 'Time-Cached';
