const modes = vi.hoisted(() => ({noObjectUrlRevoke: true}));

vi.mock('@config/modes', () => ({default: modes}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {invokeVoid: vi.fn()}
}));

import {ObjectUrlRegistry} from '@lib/mainWorker/objectUrlRegistry';
import SharedObjectUrlCache from '@lib/mainWorker/sharedObjectUrlCache';
import {pinObjectURL, revokeObjectURL, ObjectURLScope} from '@helpers/objectUrl';
import apiManagerProxy from '@lib/apiManagerProxy';

function makeUrlApi() {
  let id = 0;
  const revoked: string[] = [];
  return {
    revoked,
    api: {
      createObjectURL: () => 'blob:kill-switch/' + (++id),
      revokeObjectURL: (url: string) => revoked.push(url)
    }
  };
}

describe('object URL kill switch (Modes.noObjectUrlRevoke)', () => {
  beforeEach(() => {
    vi.mocked(apiManagerProxy.invokeVoid).mockClear();
  });

  it('never revokes an owner-less URL, even past the grace TTL', () => {
    vi.useFakeTimers();
    const {api, revoked} = makeUrlApi();
    const registry = new ObjectUrlRegistry(api, 10);
    registry.createShared(new Blob(['a']), 'owner');

    registry.releaseSharedOwnerURL('owner');
    vi.advanceTimersByTime(60e3);

    expect(revoked).toEqual([]);
    vi.useRealTimers();
  });

  it('keeps the LRU from evicting, so mirrors are never invalidated', () => {
    const {api, revoked} = makeUrlApi();
    const registry = new ObjectUrlRegistry(api, 10);
    const evicted: string[] = [];
    const cache = new SharedObjectUrlCache<string>({
      getOwner: (key) => key,
      maxBytes: 1,
      maxURLs: 1,
      onEvict: (key) => evicted.push(key)
    }, registry);

    cache.create('first', new Blob(['aaaa']));
    cache.create('second', new Blob(['bbbb']));
    cache.create('third', new Blob(['cccc']));

    expect(evicted).toEqual([]);
    expect(revoked).toEqual([]);
  });

  it('makes pins a no-op instead of sending worker traffic', () => {
    const unpin = pinObjectURL('blob:kill-switch/pinned');
    unpin();

    expect(apiManagerProxy.invokeVoid).not.toHaveBeenCalled();
  });

  // * the switch guards the shared machinery only — a tab-local preview URL is
  // * still disposed, since leaking those was a plain bug
  it('still revokes tab-local scope URLs on dispose', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kill-switch/local');
    const scope = new ObjectURLScope();

    scope.create(new Blob(['local']));
    scope.dispose();

    expect(revokeSpy).toHaveBeenCalledWith('blob:kill-switch/local');

    revokeSpy.mockClear();
    revokeObjectURL('blob:kill-switch/direct');
    expect(revokeSpy).toHaveBeenCalledWith('blob:kill-switch/direct');

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});
