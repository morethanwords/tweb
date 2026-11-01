/*
 * The service worker streams every file through a port of its own to the MTProto worker, handed over
 * by the first tab it counts as connected. A tab it does not count - one that answered the startup check
 * late, one it took for gone - must still get that port, or every video hangs until the worker restarts;
 * and a window with no app in it to answer, the Document PiP window, must never get it.
 */
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import deferred from '@/tests/helpers/deferred';

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
// * the Document PiP window the app moves into: a window of the origin, with no app of its own to answer
const pip = {id: 'pip-1', type: 'window', frameType: 'auxiliary'};

const startWorker = async() => {
  await import('@lib/serviceWorker/index.service');
  await vi.advanceTimersByTimeAsync(0);
};

const fetchFrom = (client: {id: string}) => (self as any).onfetch({
  request: {url: 'https://web.telegram.org/k/stream/%7B%7D', mode: 'cors', headers: new Headers()},
  clientId: client.id,
  respondWith: () => {}
});

const answerHelloFrom = (...windows: any[]) => mocks.invoke.mockImplementation((type: string, payload: any, withAck: any, target: any) => {
  return type === 'hello' && windows.includes(target) ? Promise.resolve() : new Promise(() => {});
});

const hellosSentTo = (target: any) => mocks.invoke.mock.calls.filter(([type, , , source]) => type === 'hello' && source === target);
const portsSentTo = (target: any) => mocks.invokeVoid.mock.calls.filter(([type, , source]) => type === 'port' && source === target);

describe('the service worker\'s MTProto port', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.invoke.mockReset().mockReturnValue(new Promise(() => {}));
    mocks.invokeVoid.mockReset();
    mocks.getWindowClients.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (self as any).onfetch;
  });

  test('goes to a tab that answers the startup check late', async() => {
    const answer = deferred();
    mocks.invoke.mockImplementation((type: string) => type === 'hello' ? answer.promise : new Promise(() => {}));
    mocks.getWindowClients.mockResolvedValue([tab]);

    await startWorker();
    expect(hellosSentTo(tab)).toHaveLength(1);

    // * the tab is busy or frozen while the worker starts, and answers well after it
    await vi.advanceTimersByTimeAsync(30e3);
    expect(portsSentTo(tab)).toHaveLength(0);
    answer.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(portsSentTo(tab), 'the late answer was dropped').toHaveLength(1);
  });

  test('goes to a tab the worker does not count with its next request', async() => {
    await startWorker();
    answerHelloFrom(tab);
    mocks.getWindowClients.mockResolvedValue([tab]);

    fetchFrom(tab);
    await vi.advanceTimersByTimeAsync(0);

    expect(portsSentTo(tab), 'the request hangs with no port').toHaveLength(1);
    expect(mocks.invokeVoid).toHaveBeenCalledWith('hello', undefined, tab);
  });

  test('costs a connected tab\'s requests nothing and is not sent twice', async() => {
    await startWorker();
    answerHelloFrom(tab);
    mocks.getWindowClients.mockResolvedValue([tab]);
    fetchFrom(tab);
    await vi.advanceTimersByTimeAsync(0);
    mocks.getWindowClients.mockClear();

    fetchFrom(tab);
    fetchFrom(tab);
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.getWindowClients).not.toHaveBeenCalled();
    expect(portsSentTo(tab)).toHaveLength(1);
  });

  test('goes to the tab whose app answers, not to the PiP window the request comes from', async() => {
    await startWorker();
    answerHelloFrom(tab);
    mocks.getWindowClients.mockResolvedValue([pip, tab]);

    fetchFrom(pip);
    await vi.advanceTimersByTimeAsync(0);

    expect(portsSentTo(pip), 'nobody reads the port there').toHaveLength(0);
    expect(portsSentTo(tab)).toHaveLength(1);
  });

  test('asks a window once while its answer is awaited', async() => {
    await startWorker();
    mocks.getWindowClients.mockResolvedValue([pip]);

    fetchFrom(pip);
    await vi.advanceTimersByTimeAsync(0);
    fetchFrom(pip);
    fetchFrom(pip);
    await vi.advanceTimersByTimeAsync(0);

    expect(hellosSentTo(pip)).toHaveLength(1);
    expect(mocks.invokeVoid.mock.calls.filter(([type]) => type === 'port')).toHaveLength(0);
  });
});
