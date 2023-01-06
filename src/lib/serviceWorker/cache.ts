/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import pause from '../../helpers/schedulers/pause';

const ctx = self as any as ServiceWorkerGlobalScope;
export const CACHE_ASSETS_NAME = 'cachedAssets';

function isCorrectResponse(response: Response) {
  return response.ok && response.status === 200;
}

function timeoutRace<T extends Promise<any>>(promise: T) {
  return Promise.race([
    promise,
    pause(10000).then(() => Promise.reject())
  ]);
}

export async function requestCache(event: FetchEvent) {
  try {
    // const cache = await ctx.caches.open(CACHE_ASSETS_NAME);
    const cache = await timeoutRace(ctx.caches.open(CACHE_ASSETS_NAME));
    const file = await timeoutRace(cache.match(event.request, {ignoreVary: true}));

    if(file && isCorrectResponse(file)) {
      return file;
    }

    const headers: HeadersInit = {'Vary': '*'};
    let response = await fetch(event.request, {headers});
    if(isCorrectResponse(response)) {
      cache.put(event.request, response.clone());
    } else if(response.status === 304) { // possible fix for 304 in Safari
      const url = event.request.url.replace(/\?.+$/, '') + '?' + (Math.random() * 100000 | 0);
      response = await fetch(url, {headers});
      if(isCorrectResponse(response)) {
        cache.put(event.request, response.clone());
      }
    }

    return response;
  } catch(err) {
    return fetch(event.request);
  }
}
