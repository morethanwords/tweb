import deferredPromise from '../../helpers/cancellablePromise';

import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import {get500ErrorResponse} from '../serviceWorker/errors';
import {parseRange} from '../serviceWorker/stream';

import {fetchAndConcatFileParts} from './fetchAndConcatFileParts';
import {HlsStreamUrlParams} from './onHlsQualityFileFetch';
import {swLog} from './common';
import {splitRangeForGettingFileParts} from './splitRangeForGettingFileParts';

const ctx = self as any as ServiceWorkerGlobalScope;

export async function onHlsStreamFetch(event: FetchEvent, inParams: string, search: string) {
  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  try {
    const {docId, dcId, size, mimeType}: HlsStreamUrlParams = JSON.parse(decodeURIComponent(inParams));
    const range = parseRange(event.request.headers.get('Range'));

    const client = await ctx.clients.get(event.clientId);
    const accountNumber = getCurrentAccountFromURL(client.url);


    const [lowerBound, upperBound] = range;
    const {ranges, alignedLowerBound} = splitRangeForGettingFileParts(lowerBound, upperBound);

    const filePart = await fetchAndConcatFileParts({docId, dcId, accountNumber}, ranges);

    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${range[0]}-${range[1]}/${size || '*'}`,
      'Content-Length': `${upperBound - lowerBound + 1}`
    };

    headers['Content-Type'] = mimeType;

    const resultingBuffer = filePart.slice(lowerBound - alignedLowerBound, upperBound - alignedLowerBound + 1);

    deferred.resolve(
      new Response(resultingBuffer, {
        status: 206,
        statusText: 'Partial Content',
        headers
      })
    );
  } catch(e) {
    deferred.resolve(get500ErrorResponse());
    swLog.error(e);
  }
}
