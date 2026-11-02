import {AppMessagesManager} from '@appManagers/appMessagesManager';
import deferredPromise from '@helpers/cancellablePromise';
import withTimeout from '@helpers/schedulers/withTimeout';
import '@helpers/peerIdPolyfill';

/**
 * `getExtendedMedia` sends one `messages.getExtendedMedia` for the mids not already asked for, and the mids on their
 * way wait for it. A request the server refused was never over: its mids stayed "on their way", so every later poll
 * of them waited for it for good and nothing asked for them again until the worker restarted.
 */

const PEER_ID = -100;

function makeManager(invokeApi: (...args: any[]) => Promise<any>) {
  const processUpdateMessage = vi.fn();
  const manager = Object.assign(Object.create(AppMessagesManager.prototype), {
    extendedMedia: new Map(),
    apiManager: {invokeApi: vi.fn(invokeApi)},
    apiUpdatesManager: {processUpdateMessage},
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 100, access_hash: '0'})},
    getMessageByPeer: (): undefined => undefined
  }) as AppMessagesManager & {apiManager: {invokeApi: ReturnType<typeof vi.fn>}};

  return {manager, processUpdateMessage};
}

const isSettled = (promise: Promise<unknown>) => withTimeout(promise.then(() => true, () => true), 50, false);

test('a refused request is over: the next poll of its mids asks again', async() => {
  let calls = 0;
  const {manager} = makeManager(() => ++calls === 1 ? Promise.reject({type: 'MSG_ID_INVALID', code: 400}) : Promise.resolve({_: 'updates'}));

  expect(await isSettled(manager.getExtendedMedia(PEER_ID, [5]))).toBe(true);

  await manager.getExtendedMedia(PEER_ID, [5]);
  expect(manager.apiManager.invokeApi).toHaveBeenCalledTimes(2);
});

test('mids on their way wait for their request, and are asked for again once it is over', async() => {
  const answer = deferredPromise<unknown>();
  const {manager, processUpdateMessage} = makeManager(() => answer);

  const first = manager.getExtendedMedia(PEER_ID, [5, 6]);
  const second = manager.getExtendedMedia(PEER_ID, [6]);
  expect(manager.apiManager.invokeApi).toHaveBeenCalledTimes(1);
  expect(await isSettled(second)).toBe(false);

  answer.resolve({_: 'updates'});
  await Promise.all([first, second]);
  expect(processUpdateMessage).toHaveBeenCalledTimes(1);

  manager.getExtendedMedia(PEER_ID, [6]);
  expect(manager.apiManager.invokeApi).toHaveBeenCalledTimes(2);
});
