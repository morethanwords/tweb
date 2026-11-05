import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';

export type DeferredCall = {params: any, deferred: CancellablePromise<any>};

/**
 * An `invokeApi` whose every call waits for the test to answer it: `calls` keeps them, with their params, in the order
 * they were made
 */
export default function createDeferredCalls() {
  const calls: DeferredCall[] = [];
  const invokeApi = vi.fn((_method: string, params?: any) => {
    const deferred = deferredPromise<any>();
    calls.push({params, deferred});
    return deferred;
  });

  return {calls, invokeApi};
}
