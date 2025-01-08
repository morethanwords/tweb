import readBlobAsUint8Array from '../../helpers/blob/readBlobAsUint8Array';

import {ActiveAccountNumber} from '../accounts/types';
import CacheStorageController from '../files/cacheStorage';
import {serviceMessagePort} from '../serviceWorker/index.service';

import {StreamFetchingRange} from './splitRangeForGettingFileParts';

type RequestFilePartIdentificationParams = {
  docId: string;
  dcId: number;
  accountNumber: ActiveAccountNumber;
};

const cacheStorage = new CacheStorageController('cachedHlsStreamChunks');

export async function fetchAndConcatFileParts(
  params: RequestFilePartIdentificationParams,
  ranges: StreamFetchingRange[]
) {
  const fileParts: Uint8Array[] = [];
  let totalLength = 0;

  for(const range of ranges) {
    const bytes = await fetchFilePart(params, range);
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

const CHUNK_CACHED_TIME_HEADER = 'Time-Cached';

async function fetchFilePart(params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  try {
    const key = getChunkKey(params, range);
    const blob: Blob = await cacheStorage.getFile(key, 'blob');
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

function getChunkKey(params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  return `${params.accountNumber}-${params.docId}?offset=${range.offset}&limit=${range.limit}`;
}

async function saveChunkToCache(bytes: Uint8Array, params: RequestFilePartIdentificationParams, range: StreamFetchingRange) {
  const key = getChunkKey(params, range);

  const response = new Response(bytes, {
    headers: {
      'Content-Length': '' + bytes.length,
      'Content-Type': 'application/octet-stream',
      [CHUNK_CACHED_TIME_HEADER]: '' + (Date.now() / 1000 | 0)
    }
  });

  await cacheStorage.save(key, response);
}
