import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import usableWorkerURL from '@helpers/usableWorkerURL';

describe('usableWorkerURL', () => {
  const blob = new Blob(['self.onmessage = () => {};'], {type: 'application/javascript'});
  let created: string[];

  beforeEach(() => {
    created = [];
    vi.stubGlobal('URL', Object.assign(Object.create(URL), {
      createObjectURL: (b: Blob) => {
        const url = 'blob:local/' + created.length;
        expect(b).toBe(blob);
        created.push(url);
        return url;
      }
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes a plain url through without probing it', async() => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await usableWorkerURL('https://example.com/worker.js', blob)).toBe('https://example.com/worker.js');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it('keeps a blob url the tab can read', async() => {
    vi.stubGlobal('fetch', vi.fn(async() => ({ok: true, body: {cancel: vi.fn()}})));

    expect(await usableWorkerURL('blob:shared/1', blob)).toBe('blob:shared/1');
    expect(created).toHaveLength(0);
  });

  // WebKit: "WebKitBlobResource error 1" - the worker built from such a url never loads, and its port
  // stays in the pool swallowing every task routed to it
  it('falls back to a tab-local url when the blob url cannot be fetched', async() => {
    vi.stubGlobal('fetch', vi.fn(async() => { throw new Error('Load failed'); }));
    const onFallback = vi.fn();

    expect(await usableWorkerURL('blob:shared/1', blob, onFallback)).toBe('blob:local/0');
    expect(onFallback).toHaveBeenCalledWith('blob:shared/1');
  });

  it('falls back when the blob url answers with an error', async() => {
    vi.stubGlobal('fetch', vi.fn(async() => ({ok: false, body: null})));

    expect(await usableWorkerURL('blob:shared/1', blob)).toBe('blob:local/0');
  });

  // this runs on the bootstrap path - a probe that never settles must not hold the app back
  it('falls back when the probe never settles', async() => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

      const promise = usableWorkerURL('blob:shared/1', blob);
      await vi.advanceTimersByTimeAsync(3000);

      expect(await promise).toBe('blob:local/0');
    } finally {
      vi.useRealTimers();
    }
  });
});
