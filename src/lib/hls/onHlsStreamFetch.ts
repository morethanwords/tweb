import deferredPromise from '../../helpers/cancellablePromise';

import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import {get500ErrorResponse} from '../serviceWorker/errors';
import {parseRange} from '../serviceWorker/stream';

import {fetchAndConcatFileParts} from './fetchAndConcatFileParts';
import {HlsStreamUrlParams, log} from './onHlsQualityFileFetch';
import {splitRangeForGettingFiles} from './splitRangeForGettingFileParts';

const ctx = self as any as ServiceWorkerGlobalScope;

export async function onHlsStreamFetch(event: FetchEvent, inParams: string, search: string) {
  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  try {
    const {docId, dcId, size, mimeType}: HlsStreamUrlParams = JSON.parse(decodeURIComponent(inParams));
    const range = parseRange(event.request.headers.get('Range'));

    log('docId, dcId, range', docId, dcId, range);
    const client = await ctx.clients.get(event.clientId);
    const accountNumber = getCurrentAccountFromURL(client.url);

    // const sourceHls = sourceHlsQuality.get(docId);

    // log('sourceHls', sourceHls);

    const [lowerBound, upperBound] = range;

    const {ranges, alignedLowerBound, alignedUpperBound} = splitRangeForGettingFiles(lowerBound, upperBound);

    const filePart = await fetchAndConcatFileParts({docId, dcId, accountNumber}, ranges);
    // deferred.resolve()
    // const base = 512 * 4;

    // const [offset, limit] = [range[0], range[1] - range[0] + 1];
    // const fetchLimit = offset === 0 ? 512 * 8 : limit;
    // const alignedOffset = alignOffset(offset);
    // const alignedLimit = Math.max(alignLimit(fetchLimit + (offset % base)), 512 * 8);

    // log('alignedOffset, alignedLimit', alignedOffset, alignedLimit)

    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${range[0]}-${range[1]}/${size || '*'}`,
      'Content-Length': `${upperBound - lowerBound + 1}`
    };

    // if(this.info.mimeType) {
    headers['Content-Type'] = mimeType;
    // }

    // simulate slow connection
    // setTimeout(() => {
    // const {bytes} = await serviceMessagePort.invoke('requestFilePart', {
    //   accountNumber,
    //   dcId,
    //   docId,
    //   limit: alignedLimit,
    //   offset: alignedOffset
    // });

    // tryPatchMp4(bytes);
    // log('successfully received bytes', offset, limit, bytes.length);

    deferred.resolve(new Response(filePart.slice(lowerBound - alignedLowerBound, upperBound - alignedLowerBound + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers
    }));
  } catch(e) {
    deferred.resolve(get500ErrorResponse());
    log.error(e);
  }
}
