/*
 * The service worker streams every file through a port of its own to the MTProto worker, handed over
 * by the first tab it counts as connected. A tab it does not count - one that answered the startup check
 * late, one it took for gone - must still get that port, or every video hangs until the worker restarts.
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeVoid: vi.fn(),
  getWindowClients: vi.fn()
}));

vi.mock('@lib/serviceWorker/serviceMessagePort', () => ({
  default: class {
    addMultipleEventsListeners() {}
    attachPort() {}
    detachPort() {}
    invoke(...args: any[]) {
      return mocks.invoke(...args);
    }

    invokeVoid(...args: any[]) {
      return mocks.invokeVoid(...args);
    }
  }
}));
vi.mock('@helpers/context', async(importOriginal) => ({
  ...await importOriginal<typeof import('@helpers/context')>(),
  getWindowClients: mocks.getWindowClients
}));
vi.mock('@helpers/listenMessagePort', () => ({default: () => {}}));
vi.mock('@lib/crypto/cryptoMessagePort', () => ({default: {attachPort: () => {}, detachPort: () => {}}}));
vi.mock('@lib/serviceWorker/stream', () => ({default: () => {}, toggleStreamInUse: () => {}}));
vi.mock('@lib/serviceWorker/cache', () => ({CACHE_ASSETS_NAME: 'assets', requestCache: () => {}}));
vi.mock('@lib/serviceWorker/push', () => ({
  closeAllNotifications: () => {},
  fillPushObject: () => {},
  onPing: () => {},
  onShownNotification: () => {},
  resetPushAccounts: () => {}
}));
vi.mock('@lib/files/cacheStorage', () => ({default: class {}}));
vi.mock('@lib/serviceWorker/clientAccounts', () => ({deleteClientAccount: () => {}, setClientAccount: () => {}}));
vi.mock('@lib/serviceWorker/download', () => ({default: () => ({onDownloadFetch: () => {}, onClosedWindows: () => {}})}));
vi.mock('@lib/serviceWorker/share', () => ({default: () => {}, checkWindowClientForDeferredShare: () => {}}));
vi.mock('@lib/serviceWorker/rtmp', () => ({onRtmpFetch: () => {}, onRtmpLeftCall: () => {}}));
vi.mock('@lib/hls/onHlsQualityFileFetch', () => ({onHlsQualityFileFetch: () => {}}));
vi.mock('@lib/hls/onHlsStreamFetch', () => ({onHlsStreamFetch: () => {}}));
vi.mock('@lib/hls/onHlsPlaylistFetch', () => ({onHlsPlaylistFetch: () => {}}));
vi.mock('@lib/serviceWorker/backgrounds', () => ({onBackgroundsFetch: () => {}}));
vi.mock('@lib/serviceWorker/watchMtprotoOnDev', () => ({watchMtprotoOnDev: () => {}}));
vi.mock('@lib/serviceWorker/clearOldCache', () => ({watchCacheStoragesLifetime: () => {}}));
vi.mock('@lib/passcode/keyStore', () => ({default: {save: () => {}, resetDeferred: () => {}}}));
vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({default: {
  resolveDeferred: () => {},
  resetDeferred: () => {},
  isUsingPasscodeUndeferred: () => false
}}));

const tab = {id: 'tab-1', type: 'window', frameType: 'top-level'};

const startWorker = () => import('@lib/serviceWorker/index.service');

const fetchFromTab = (clientId: string) => (self as any).onfetch({
  request: {url: 'https://web.telegram.org/k/stream/%7B%7D', mode: 'cors', headers: new Headers()},
  clientId,
  respondWith: () => {}
});

const portsSentTo = (target: any) => mocks.invokeVoid.mock.calls.filter(([type, , source]) => type === 'port' && source === target);

describe('the service worker\'s MTProto port', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.invoke.mockReset().mockReturnValue(new Promise(() => {}));
    mocks.invokeVoid.mockReset();
    mocks.getWindowClients.mockReset().mockResolvedValue([]);
    (self as any).clients = {get: vi.fn(async(id: string) => id === tab.id ? tab : undefined)};
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (self as any).clients;
    delete (self as any).onfetch;
  });

  test('goes to a tab that answers the startup check late', async() => {
    let answer: () => void;
    mocks.invoke.mockImplementation((type: string) => type === 'hello' ?
      new Promise<void>((resolve) => answer = resolve) :
      new Promise(() => {}));
    mocks.getWindowClients.mockResolvedValue([tab]);

    await startWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.invoke).toHaveBeenCalledWith('hello', undefined, undefined, tab);

    // * the tab is busy or frozen while the worker starts, and answers well after it
    await vi.advanceTimersByTimeAsync(30e3);
    expect(portsSentTo(tab)).toHaveLength(0);
    answer();
    await vi.advanceTimersByTimeAsync(0);

    expect(portsSentTo(tab), 'the late answer was dropped').toHaveLength(1);
  });

  test('goes to a tab the worker does not count with its next request', async() => {
    await startWorker();
    await vi.advanceTimersByTimeAsync(0);

    fetchFromTab(tab.id);
    await vi.advanceTimersByTimeAsync(0);

    expect(portsSentTo(tab), 'the request hangs with no port').toHaveLength(1);
    expect(mocks.invokeVoid).toHaveBeenCalledWith('hello', undefined, tab);
  });

  test('costs a connected tab\'s requests nothing and is not sent twice', async() => {
    await startWorker();
    await vi.advanceTimersByTimeAsync(0);
    fetchFromTab(tab.id);
    await vi.advanceTimersByTimeAsync(0);
    const getClient = (self as any).clients.get;
    getClient.mockClear();

    fetchFromTab(tab.id);
    fetchFromTab(tab.id);
    await vi.advanceTimersByTimeAsync(0);

    expect(getClient).not.toHaveBeenCalled();
    expect(portsSentTo(tab)).toHaveLength(1);
  });

  test('is not handed to anything but a window', async() => {
    const worker = {id: 'worker-1', type: 'sharedworker'};
    (self as any).clients.get = vi.fn(async() => worker);
    await startWorker();
    await vi.advanceTimersByTimeAsync(0);

    fetchFromTab(worker.id);
    fetchFromTab('');
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.invokeVoid.mock.calls.filter(([type]) => type === 'port')).toHaveLength(0);
  });
});
