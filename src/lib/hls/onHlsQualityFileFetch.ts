import deferredPromise from '../../helpers/cancellablePromise';

import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import {ActiveAccountNumber} from '../accounts/types';
import CacheStorageController from '../files/cacheStorage';
import {get500ErrorResponse} from '../serviceWorker/errors';
import {serviceMessagePort} from '../serviceWorker/index.service';

import {ctx, swLog} from './common';
import {RequestSynchronizer} from './requestSynchronizer';

const cacheStorage = new CacheStorageController('cachedHlsQualityFiles');
const requestSynchronizer = new RequestSynchronizer<string, string>();

export type HlsStreamUrlParams = {
  docId: string;
  dcId: number;
  size: number;
  mimeType: string;
};


export async function onHlsQualityFileFetch(event: FetchEvent, params: string, search: string) {
  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  try {
    const docId = params;

    const client = await ctx.clients.get(event.clientId);
    const accountNumber = getCurrentAccountFromURL(client.url);

    const result = await requestSynchronizer.performRequest(
      getHlsQualityCacheFilename(docId),
      () => fetchAndProcessQualityFile(docId, accountNumber)
    );

    deferred.resolve(new Response(result));
  } catch(e) {
    deferred.resolve(get500ErrorResponse());
    swLog.error(e);
  }
}

async function fetchAndProcessQualityFile(docId: string, accountNumber: ActiveAccountNumber) {
  const file = await getHlsQualityFile(docId, accountNumber);
  const fileString = await file.text();


  const replacedContent = await replaceQualityFileWithLocalURLs(fileString, accountNumber);

  return replacedContent;
}

function getHlsQualityCacheFilename(docId: string) {
  return `hls_quality_${docId}`;
}

async function getHlsQualityFile(docId: string, accountNumber: ActiveAccountNumber): Promise<Blob> {
  try {
    // throw '';
    const file = await cacheStorage.getFile(getHlsQualityCacheFilename(docId));
    swLog.info('using cached quality file', docId);
    return file;
  } catch{
    swLog.info('fetching quality file', docId);
    const file = await serviceMessagePort.invoke('downloadDoc', {docId, accountNumber});
    cacheStorage.saveFile(getHlsQualityCacheFilename(docId), file);
    return file;
  }
}

async function replaceQualityFileWithLocalURLs(fileString: string, accountNumber: ActiveAccountNumber) {
  const regex = 'mtproto:(\\d+)';

  const match = fileString.match(new RegExp(regex));
  if(!match) throw new Error('Wrong Hls quality file format');

  const targetDocId = match[1];

  swLog.info('targetDocId', targetDocId);

  if(!targetDocId) throw new Error('Wrong Hls quality file format');

  const doc = await serviceMessagePort.invoke('requestDoc', {docId: targetDocId, accountNumber});

  const params: HlsStreamUrlParams = {
    docId: targetDocId,
    dcId: doc.dc_id,
    size: doc.size,
    mimeType: doc.mime_type
  };
  const pathname = `hls_stream/${encodeURIComponent(JSON.stringify(params))}`;

  const targetFileURL = new URL(pathname, location.origin).toString();

  const replacedContent = fileString.replace(new RegExp(regex, 'g'), targetFileURL);

  return replacedContent;
}
