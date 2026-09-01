/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2026 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise from '@helpers/cancellablePromise';

/**
 * Test-side resolver-capture wrapper over the app's `deferredPromise`. One
 * shared copy — the same 8 lines used to be pasted into every call-stack test
 * file, each a fresh chance to diverge.
 */
export default function deferred<T = void>() {
  const promise = deferredPromise<T>();
  return {
    promise: promise as Promise<T>,
    resolve: (value: T) => promise.resolve(value),
    reject: (reason?: unknown) => promise.reject(reason)
  };
}
