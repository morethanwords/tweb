import deferredPromise from '../../helpers/cancellablePromise';
import {InputFileLocation} from '../../layer';

import {getCurrentAccountFromURL} from '../accounts/getCurrentAccountFromURL';
import type {DownloadOptions} from '../mtproto/apiFileManager';
import {get500ErrorResponse} from '../serviceWorker/errors';
import {serviceMessagePort} from '../serviceWorker/index.service';

import {ctx, swLog} from './common';
import {createHlsVideoSource} from './createHlsVideoSource';

export async function onHlsPlaylistFetch(event: FetchEvent, params: string, search: string) {
  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  try {
    const options: DownloadOptions = JSON.parse(decodeURIComponent(params));

    const client = await ctx.clients.get(event.clientId);
    const accountNumber = getCurrentAccountFromURL(client.url);

    const docId = (options.location as InputFileLocation.inputDocumentFileLocation)?.id;

    const altDocs = await serviceMessagePort.invoke('requestAltDocsByDoc', {docId, accountNumber});

    if(!altDocs) throw new Error('No alt docs found for document');

    const videoSource = createHlsVideoSource(altDocs);
    if(!videoSource) throw new Error('Failed to create video source for hls streaming');

    deferred.resolve(new Response(videoSource));
  } catch(e) {
    deferred.resolve(get500ErrorResponse());
    swLog.error(e);
  }
}
