import deferredPromise from '../helpers/cancellablePromise';

export default function makeAction<T>(promise: Promise<T>) {
  const deferred = deferredPromise<T>();
  promise.then(
    deferred.resolve.bind(deferred),
    deferred.reject.bind(deferred)
  );

  deferred.finally(() => {
    clearTimeout(timeout);
  });

  const timeout = setTimeout(() => {
    console.log('timeout');
  }, 0) as any as number;
  return deferred;
}
