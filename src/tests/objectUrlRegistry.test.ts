import {ObjectUrlRegistry} from '@lib/mainWorker/objectUrlRegistry';

const GRACE_TTL = 100;

function makeRegistry(graceTTL = GRACE_TTL) {
  let nextUrl = 0;
  const createObjectURL = vi.fn(() => `blob:test/${++nextUrl}`);
  const revokeObjectURL = vi.fn();
  const registry = new ObjectUrlRegistry({
    createObjectURL,
    revokeObjectURL
  }, graceTTL);

  return {createObjectURL, registry, revokeObjectURL};
}

function makeSource() {
  return {} as MessageEventSource;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('ObjectUrlRegistry', () => {
  it('revokes a released owner URL only after the grace period', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const url = registry.createShared(new Blob(['media']), 'thumb:grace');

    registry.releaseSharedOwnerURL('thumb:grace');
    vi.advanceTimersByTime(GRACE_TTL - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('keeps a multi-owner URL until its last owner releases it', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const url = 'blob:test/aliases';

    registry.setSharedOwnerURL('thumb:first', url, 10);
    registry.setSharedOwnerURL('thumb:second', url, 10);
    expect(registry.getURLSize(url)).toBe(10);

    registry.releaseSharedOwnerURL('thumb:first');
    vi.advanceTimersByTime(GRACE_TTL);
    expect(registry.hasOwners(url)).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.releaseSharedOwnerURL('thumb:second');
    expect(registry.hasOwners(url)).toBe(false);
    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('cancels a pending grace revoke when the URL is re-owned', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const url = 'blob:test/re-own';
    registry.setSharedOwnerURL('thumb:first', url);
    registry.releaseSharedOwnerURL('thumb:first');

    vi.advanceTimersByTime(GRACE_TTL - 1);
    registry.setSharedOwnerURL('thumb:second', url);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(GRACE_TTL * 10);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.releaseSharedOwnerURL('thumb:second');
    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('cancels a pending grace revoke when the URL is re-pinned', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const source = makeSource();
    registry.registerSource(source);
    const url = 'blob:test/re-pin';
    registry.setSharedOwnerURL('thumb:re-pin', url);
    registry.releaseSharedOwnerURL('thumb:re-pin');

    vi.advanceTimersByTime(GRACE_TTL - 1);
    registry.updateObjectURLPins([{url, active: true}], source);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(GRACE_TTL * 10);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.updateObjectURLPins([{url, active: false}], source);
    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('keeps a pinned URL alive past its owner release', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const source = makeSource();
    registry.registerSource(source);
    const url = registry.createShared(new Blob(['pinned']), 'thumb:pinned');
    registry.updateObjectURLPins([{url, active: true}], source);

    registry.releaseSharedOwnerURL('thumb:pinned');
    vi.advanceTimersByTime(GRACE_TTL * 10);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.updateObjectURLPins([{url, active: false}], source);
    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('keeps pins isolated per source when one of two tabs disconnects', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const firstSource = makeSource();
    const secondSource = makeSource();
    const url = 'blob:test/two-tabs';
    registry.setSharedOwnerURL('thumb:two-tabs', url);
    registry.registerSource(firstSource);
    registry.registerSource(secondSource);
    registry.updateObjectURLPins([{url, active: true}], firstSource);
    registry.updateObjectURLPins([{url, active: true}], secondSource);
    registry.releaseSharedOwnerURL('thumb:two-tabs');

    registry.releaseSource(firstSource);
    vi.advanceTimersByTime(GRACE_TTL * 10);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.releaseSource(secondSource);
    vi.advanceTimersByTime(GRACE_TTL - 1);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('ignores pin updates from unregistered and disconnected sources', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const source = makeSource();
    const url = 'blob:test/inactive-source';
    registry.setSharedOwnerURL('thumb:inactive-source', url);

    registry.updateObjectURLPins([{url, active: true}], source);
    registry.registerSource(source);
    registry.releaseSource(source);
    registry.updateObjectURLPins([{url, active: true}], source);
    registry.releaseSharedOwnerURL('thumb:inactive-source');

    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('ignores redundant unpins without going negative', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const source = makeSource();
    registry.registerSource(source);
    const url = 'blob:test/unpin-idempotent';
    registry.setSharedOwnerURL('thumb:unpin-idempotent', url);

    registry.updateObjectURLPins([{url, active: true}], source);
    registry.updateObjectURLPins([
      {url, active: false},
      {url, active: false}
    ], source);
    registry.updateObjectURLPins([{url, active: true}], source);

    registry.releaseSharedOwnerURL('thumb:unpin-idempotent');
    vi.advanceTimersByTime(GRACE_TTL * 10);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.updateObjectURLPins([{url, active: false}], source);
    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith(url);
  });

  it('bounds grace holds by count and revokes the oldest on overflow', () => {
    const {registry, revokeObjectURL} = makeRegistry();

    for(let i = 0; i < 257; i++) {
      const owner = `thumb:pressure-${i}`;
      const url = `blob:test/pressure-${i}`;
      registry.setSharedOwnerURL(owner, url, 1);
      registry.releaseSharedOwnerURL(owner);
    }

    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/pressure-0');
    expect(vi.getTimerCount()).toBe(256);

    vi.advanceTimersByTime(GRACE_TTL);
    expect(revokeObjectURL).toHaveBeenCalledTimes(257);
  });

  it('bounds grace holds by retained bytes', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const size = 100 * 1024 * 1024;
    registry.setSharedOwnerURL('thumb:big-first', 'blob:test/big-first', size);
    registry.setSharedOwnerURL('thumb:big-second', 'blob:test/big-second', size);

    registry.releaseSharedOwnerURL('thumb:big-first');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    registry.releaseSharedOwnerURL('thumb:big-second');
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/big-first');
  });

  it('disposes every tracked URL once and clears timers and pins', () => {
    const {registry, revokeObjectURL} = makeRegistry();
    const source = makeSource();
    registry.registerSource(source);
    registry.setSharedOwnerURL('thumb:shared-first', 'blob:test/shared');
    registry.setSharedOwnerURL('thumb:shared-second', 'blob:test/shared');
    registry.setSharedOwnerURL('thumb:pinned', 'blob:test/pinned');
    registry.updateObjectURLPins([{url: 'blob:test/pinned', active: true}], source);
    registry.setSharedOwnerURL('thumb:graced', 'blob:test/graced');
    registry.releaseSharedOwnerURL('thumb:graced');

    registry.dispose();

    expect(vi.getTimerCount()).toBe(0);
    expect(new Set(revokeObjectURL.mock.calls.map(([url]) => url))).toEqual(new Set([
      'blob:test/shared',
      'blob:test/pinned',
      'blob:test/graced'
    ]));
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(registry.getSharedOwnerURL('thumb:shared-first')).toBeUndefined();

    registry.dispose();
    registry.releaseSource(source);
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });
});
