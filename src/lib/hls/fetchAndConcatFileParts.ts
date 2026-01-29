import readBlobAsUint8Array from '@helpers/blob/readBlobAsUint8Array';
import {ActiveAccountNumber} from '@lib/accounts/types';
import CacheStorageController from '@lib/files/cacheStorage';
import {RequestSynchronizer} from '@lib/hls/requestSynchronizer';
import {StreamFetchingRange} from '@lib/hls/splitRangeForGettingFileParts';
import {serviceMessagePort} from '@lib/serviceWorker/index.service';


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

  const response = new Response(bytes);

  await cacheStorage.save({entryName: filename, response, size: bytes.length, contentType: 'application/octet-stream'});
}
