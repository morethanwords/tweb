import readBlobAsUint8Array from '../../helpers/blob/readBlobAsUint8Array';
import pause from '../../helpers/schedulers/pause';

import {ActiveAccountNumber} from '../accounts/types';
import CacheStorageController from '../files/cacheStorage';
import {serviceMessagePort} from '../serviceWorker/index.service';

import {swLog} from './common';
import {RequestSynchronizer} from './requestSynchronizer';
import {StreamFetchingRange} from './splitRangeForGettingFileParts';

const CHUNK_CACHED_TIME_HEADER = 'Time-Cached';
const CHUNK_LIFETIME_SECONDS = 24 * 60 * 60; // 24 hours

type RequestFilePartIdentificationParams = {
  docId: string;
  dcId: number;
  accountNumber: ActiveAccountNumber;
};

const cacheStorage = new CacheStorageController('cachedHlsStreamChunks');
const requestSynchronizer = new RequestSynchronizer<string, Uint8Array>();

export async function fetchAndConcatFileParts(
  params: RequestFilePartIdentificationParams,
  ranges: StreamFetchingRange[]
) {
  const fileParts: Uint8Array[] = [];
  let totalLength = 0;

  for(const range of ranges) {
    const bytes = await requestSynchronizer.performRequest(
      getChunkFilename(params, range),
      () => fetchFilePart(params, range)
    );

    totalLength += bytes.length;
    fileParts.push(bytes);
  }

  if(fileParts.length === 1) return fileParts[0];

  const result = new Uint8Array(totalLength);

  let currentOffset = 0;

  for(const part of fileParts) {
    result.set(part, currentOffset);
    currentOffset += part.length;
  }

  return result;
}


async function fetchFilePart(params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  try {
    // throw '';
    const filename = getChunkFilename(params, range);
    const blob: Blob = await cacheStorage.getFile(filename, 'blob');
    const bytes = await readBlobAsUint8Array(blob);
    return bytes;
  } catch{
    const {bytes} = await serviceMessagePort.invoke('requestFilePart', {
      ...params,
      ...range
    });
    saveChunkToCache(bytes, params, range);
    return bytes;
  }
}

function getChunkFilename(params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  return `${params.accountNumber}-${params.docId}?offset=${range.offset}&limit=${range.limit}`;
}

async function saveChunkToCache(bytes: Uint8Array, params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  const filename = getChunkFilename(params, range);

  const response = new Response(bytes, {
    headers: {
      'Content-Length': '' + bytes.length,
      'Content-Type': 'application/octet-stream',
      [CHUNK_CACHED_TIME_HEADER]: '' + (Date.now() / 1000 | 0)
    }
  });

  await cacheStorage.save(filename, response);
}


export async function watchHlsStreamChunksLifetime() {
  await pause(20e3); // wait some time for the app to fully initialize

  clearOldChunks();
  setInterval(clearOldChunks, 1800e3);
}

function clearOldChunks() {
  return cacheStorage.timeoutOperation(async(cache) => {
    const requests = await cache.keys();

    const currentTimeSeconds = Date.now() / 1000 | 0;

    await Promise.all(requests.map(async(request) => {
      const response = await cache.match(request);
      if(!response) return;

      const savedTimeSeconds = +response.headers.get(CHUNK_CACHED_TIME_HEADER);
      if(!savedTimeSeconds) return;
      if(savedTimeSeconds + CHUNK_LIFETIME_SECONDS > currentTimeSeconds) return;

      swLog('deleting cached stream chunk', request.url);
      await cache.delete(request);
    }));
  });
};

