import deferredPromise from '@helpers/cancellablePromise';

const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn(),
  invokeVoid: vi.fn(),
  registry: undefined as any,
  revokeObjectURL: vi.fn()
}));

vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {
    getInstance: () => ({
      invokeVoid: mocks.invokeVoid
    })
  }
}));

vi.mock('@lib/mainWorker/objectUrlRegistry', async(importOriginal) => {
  const actual: any = await importOriginal();
  mocks.registry = new actual.ObjectUrlRegistry({
    createObjectURL: mocks.createObjectURL,
    revokeObjectURL: mocks.revokeObjectURL
  }, 0);

  return {
    ...actual,
    default: mocks.registry
  };
});

import {releaseSharedObjectURLsWhere, resetSharedObjectURLCaches} from '@lib/mainWorker/sharedObjectUrlCache';
import {AppAvatarsManager} from '@appManagers/appAvatarsManager';

const peerId = 123 as PeerId;
const photo = {
  _: 'userProfilePhoto', dc_id: 2, pFlags: {}, photo_id: 'photo-1'
} as any;

function makeManager() {
  const manager = new AppAvatarsManager();
  const download = vi.fn();

  Object.assign(manager as any, {
    accountNumber: 2,
    apiFileManager: {download},
    appPeersManager: {getInputPeerById: vi.fn(() => ({_: 'inputPeerSelf'}))},
    rootScope: {addEventListener: vi.fn()}
  });
  (manager as any).after();
  return {download, manager};
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  let nextUrl = 0;
  mocks.createObjectURL.mockImplementation(() => `blob:avatar/${++nextUrl}`);
});

afterEach(() => {
  resetSharedObjectURLCaches();
  mocks.registry.dispose();
  vi.useRealTimers();
});

describe('AppAvatarsManager object URL lifecycle', () => {
  it('downloads avatar bytes without creating an object URL', async() => {
    const {download, manager} = makeManager();
    const blob = new Blob(['notification-avatar']);
    download.mockResolvedValue(blob);
    await expect(manager.downloadAvatar(peerId, photo, 'photo_small')).resolves.toBe(blob);
    expect(mocks.createObjectURL).not.toHaveBeenCalled();
    expect(manager.isAvatarCached(peerId)).toBe(false);
  });

  it('deduplicates loads and drops the peer with one mirror message', async() => {
    const {download, manager} = makeManager();
    const pending = deferredPromise<Blob>();
    const blob = new Blob(['avatar']);
    download.mockReturnValue(pending);
    const first = manager.loadAvatar(peerId, photo, 'photo_small');
    expect(manager.loadAvatar(peerId, photo, 'photo_small')).toBe(first);
    expect(download).toHaveBeenCalledOnce();

    pending.resolve(blob);
    await expect(first).resolves.toBe('blob:avatar/1');
    expect(mocks.createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(mocks.invokeVoid).toHaveBeenCalledExactlyOnceWith('mirror', {
      name: 'avatars',
      key: '123\x01photo_small',
      value: 'blob:avatar/1',
      accountNumber: 2
    });
    expect(manager.loadAvatar(peerId, photo, 'photo_small')).toBe('blob:avatar/1');
    expect(manager.isAvatarCached(peerId, 'photo_small')).toBe(true);

    mocks.invokeVoid.mockClear();
    manager.removeFromAvatarsCache(peerId);
    expect(mocks.invokeVoid).toHaveBeenCalledExactlyOnceWith('mirror', {
      name: 'avatars',
      key: '123',
      value: undefined,
      previousUrls: ['blob:avatar/1'],
      accountNumber: 2
    });
    expect(manager.isAvatarCached(peerId)).toBe(false);

    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:avatar/1');
  });

  it('mirrors an eviction per size with the evicted previous URL', async() => {
    const {download, manager} = makeManager();
    download.mockResolvedValue(new Blob(['avatar']));
    await expect(manager.loadAvatar(peerId, photo, 'photo_small')).resolves.toBe('blob:avatar/1');
    mocks.invokeVoid.mockClear();

    releaseSharedObjectURLsWhere((owner) => owner.startsWith('avatar:'));

    expect(mocks.invokeVoid).toHaveBeenCalledExactlyOnceWith('mirror', {
      name: 'avatars',
      key: '123\x01photo_small',
      value: undefined,
      previousUrl: 'blob:avatar/1',
      accountNumber: 2
    });
    expect(manager.isAvatarCached(peerId, 'photo_small')).toBe(false);
  });

  it('does not let a stale request overwrite a newer cache generation', async() => {
    const {download, manager} = makeManager();
    const stale = deferredPromise<Blob>();
    const fresh = deferredPromise<Blob>();
    download.mockReturnValueOnce(stale).mockReturnValueOnce(fresh);
    const staleRequest = manager.loadAvatar(peerId, photo, 'photo_big') as Promise<string>;
    manager.removeFromAvatarsCache(peerId);
    const freshRequest = manager.loadAvatar(peerId, photo, 'photo_big') as Promise<string>;

    stale.resolve(new Blob(['stale']));
    await expect(staleRequest).resolves.toBeUndefined();
    expect(mocks.createObjectURL).not.toHaveBeenCalled();

    const freshBlob = new Blob(['fresh']);
    fresh.resolve(freshBlob);
    await expect(freshRequest).resolves.toBe('blob:avatar/1');
    expect(mocks.createObjectURL).toHaveBeenCalledExactlyOnceWith(freshBlob);
  });
});
