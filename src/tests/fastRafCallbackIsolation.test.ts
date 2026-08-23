import {afterEach, describe, expect, test, vi} from 'vitest';
import {NoneToVoidFunction} from '@types';
import {fastRaf, fastRafConventional, fastRafPromise} from '@helpers/schedulers';

/**
 * Collects the frame callbacks instead of running them, so a test can flush the batch by hand.
 */
function captureFrames() {
  const frames: NoneToVoidFunction[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(() => cb(0));
    return frames.length;
  });

  return () => {
    const pending = frames.splice(0, frames.length);
    pending.forEach((frame) => frame());
  };
}

describe('fastRaf callback isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('one throwing callback does not cancel the rest of the batch', () => {
    const flush = captureFrames();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ran: string[] = [];

    fastRaf(() => {
      throw new Error('boom');
    });
    fastRaf(() => ran.push('second'));
    fastRaf(() => ran.push('third'));

    flush();

    expect(ran).toEqual(['second', 'third']);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  test('fastRafPromise still settles when an earlier callback in its batch throws', async() => {
    const flush = captureFrames();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    fastRaf(() => {
      throw new Error('boom');
    });
    const promise = fastRafPromise();

    flush();

    // the whole hazard: losing this resolve would leave the module-level `rafPromise` pending and
    // hand the same dead promise to every later caller
    await expect(promise).resolves.toBeUndefined();
    errors.mockRestore();
  });

  test('a later fastRafPromise is not poisoned by the previous batch', async() => {
    const flush = captureFrames();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    fastRaf(() => {
      throw new Error('boom');
    });
    const first = fastRafPromise();
    flush();
    await first;

    const second = fastRafPromise();
    expect(second).not.toBe(first);
    flush();
    await expect(second).resolves.toBeUndefined();
    errors.mockRestore();
  });

  test('fastRafConventional keeps batching after a callback throws', () => {
    const flush = captureFrames();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ran: string[] = [];

    fastRafConventional(() => {
      throw new Error('boom');
    });
    fastRafConventional(() => ran.push('second'));
    flush();

    expect(ran).toEqual(['second']);

    // `processing` stuck true would make this run synchronously instead of on the next frame
    const later: string[] = [];
    fastRafConventional(() => later.push('deferred'));
    expect(later).toEqual([]);
    flush();
    expect(later).toEqual(['deferred']);

    errors.mockRestore();
  });
});
