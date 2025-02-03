/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {CURRENT_ACCOUNT_QUERY_PARAM} from '../lib/accounts/constants';

export function makeWorkerURL(url: string | URL) {
  if(!(url instanceof URL)) {
    url = new URL(url + '', location.href);
  }

  if(location.search && url.protocol !== 'blob:') {
    const params = new URLSearchParams(location.search);
    params.forEach((value, key) => {
      if(key === CURRENT_ACCOUNT_QUERY_PARAM) return;
      (url as URL).searchParams.set(key, value);
    });
  }

  // exclude useless params
  (url as URL).searchParams.delete('swfix');

  return url;
}

export default function setWorkerProxy() {
  // * hook worker constructor to set search parameters (test, debug, etc)
  const workerHandler = {
    construct(target: any, args: any) {
      args[0] = makeWorkerURL(args[0]);
      return new target(...args);
    }
  };

  [
    Worker,
    typeof(SharedWorker) !== 'undefined' && SharedWorker
  ].filter(Boolean).forEach((w) => {
    window[w.name as any] = new Proxy(w, workerHandler);
  });
}

setWorkerProxy();
