import deferredPromise from '@helpers/cancellablePromise';
import makeError from '@helpers/makeError';
import {RequestSynchronizer} from '@lib/hls/requestSynchronizer';

describe('RequestSynchronizer', () => {
  it('lets the ones asking for a key at once share one request', async() => {
    const synchronizer = new RequestSynchronizer<string, string>();
    const response = deferredPromise<string>();
    const request = vi.fn(() => response);

    const first = synchronizer.performRequest('part', request);
    const second = synchronizer.performRequest('part', request);
    response.resolve('bytes');

    await expect(Promise.all([first, second])).resolves.toEqual(['bytes', 'bytes']);
    expect(request).toHaveBeenCalledOnce();
  });

  it('asks again for a key whose request has finished', async() => {
    const synchronizer = new RequestSynchronizer<string, string>();
    const request = vi.fn(() => Promise.resolve('bytes'));

    await synchronizer.performRequest('part', request);
    await synchronizer.performRequest('part', request);

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('asks again for a key whose request has failed, rather than failing every retry with it', async() => {
    const synchronizer = new RequestSynchronizer<string, string>();
    const failing = vi.fn(() => Promise.reject(makeError('TIMEOUT')));
    const working = vi.fn(() => Promise.resolve('bytes'));

    await expect(synchronizer.performRequest('part', failing)).rejects.toMatchObject({type: 'TIMEOUT'});
    await expect(synchronizer.performRequest('part', working)).resolves.toBe('bytes');
    expect(working).toHaveBeenCalledOnce();
  });

  it('keeps a later request for a key when an earlier one for it settles', async() => {
    const synchronizer = new RequestSynchronizer<string, string>();
    const later = deferredPromise<string>();
    const laterRequest = vi.fn(() => later);

    await synchronizer.performRequest('part', () => Promise.resolve('old'));
    const first = synchronizer.performRequest('part', laterRequest);
    const second = synchronizer.performRequest('part', laterRequest);
    later.resolve('new');

    await expect(Promise.all([first, second])).resolves.toEqual(['new', 'new']);
    expect(laterRequest).toHaveBeenCalledOnce();
  });
});
