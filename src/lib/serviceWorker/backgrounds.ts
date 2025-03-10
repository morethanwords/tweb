import deferredPromise from '../../helpers/cancellablePromise';

import CacheStorageController from '../files/cacheStorage';

import {get500ErrorResponse} from './errors';


const backgroundsCache = new CacheStorageController('cachedBackgrounds');

export function onBackgroundsFetch(event: FetchEvent) {
  const url = event.request.url.match(/backgrounds.*/)[0];
  if(!url) {
    event.respondWith(get500ErrorResponse());
    return;
  }

  const deferred = deferredPromise<Response>();
  event.respondWith(deferred);

  (async() => {
    const blob = await backgroundsCache.getFile(url, 'blob');
    deferred.resolve(new Response(blob, {
      status: 200
    }));
  })();
}
