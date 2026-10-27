import deferredPromise from '@helpers/cancellablePromise';

describe('deferredPromise notify listeners', () => {
  test('a listener added while pending is notified, and let go when the promise finishes', () => {
    const deferred = deferredPromise<void>();
    const progress: number[] = [];
    deferred.addNotifyListener((done: number) => progress.push(done));
    deferred.notifyAll(1);
    deferred.resolve();
    expect(progress).toEqual([1]);
    expect(deferred.listeners).toHaveLength(0);
  });

  test('a finished promise keeps no listener added afterwards', () => {
    for(const finish of ['resolve', 'reject'] as const) {
      const deferred = deferredPromise<void>();
      deferred.catch(() => {});
      deferred[finish]();
      const listener = vi.fn();
      deferred.addNotifyListener(listener);
      deferred.addNotifyListener(listener);
      expect(deferred.listeners ?? []).toHaveLength(0);
      expect(listener).not.toHaveBeenCalled();
    }
  });
});
