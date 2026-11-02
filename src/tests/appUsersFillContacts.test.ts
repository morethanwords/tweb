import {AppUsersManager} from '@appManagers/appUsersManager';
import makeError from '@helpers/makeError';
import withTimeout from '@helpers/schedulers/withTimeout';
import '@helpers/peerIdPolyfill';

// The dialogs of a custom folder wait for the contacts (dialogsStorage.prepareFolderForFilter, before getDialogs
// reads them and calls itself again), and so does the contacts list. When contacts.getContacts failed (a flood wait,
// a server error), the promise they waited on never settled - the folder stayed empty until a reload - and the next
// call handed out the same promise again.

const HUNG = 'hung';
const settled = <T>(promise: Promise<T>) => withTimeout(promise, 50, HUNG);
const flood = () => makeError('FLOOD_WAIT_30' as ErrorType);

function setup() {
  const manager = new AppUsersManager();
  const invokeApi = vi.fn();
  Object.assign(manager, {
    apiManager: {invokeApi},
    appStateManager: {pushToState: vi.fn()},
    peersStorage: {requestPeer: vi.fn(), releasePeer: vi.fn()},
    rootScope: {myId: (1 as UserId).toPeerId(false)}
  });
  manager.clear(true);

  return {manager, invokeApi};
}

describe('the contacts, when their request fails', () => {
  test('let whoever waits for them go on with the ones known', async() => {
    const {manager, invokeApi} = setup();
    invokeApi.mockRejectedValueOnce(flood());

    const {promise} = manager.fillContacts();

    expect(await settled(promise)).toEqual(new Set());
  });

  test('do not make a folder that waited for them wait again', async() => {
    const {manager, invokeApi} = setup();
    invokeApi.mockRejectedValue(flood());
    const first = manager.fillContacts();
    expect(first.cached).toBeFalsy();
    await settled(first.promise);

    // * as getDialogs does once the folder is prepared: a wait for each refusal would ask the server in a loop
    const again = manager.fillContacts();

    expect(again.cached).toBe(true);
    expect(await settled(again.promise)).toEqual(new Set());
  });

  test('are asked for again by the next call, and are there once the server answers', async() => {
    const {manager, invokeApi} = setup();
    invokeApi.mockRejectedValueOnce(flood());
    await settled(manager.fillContacts().promise);

    invokeApi.mockResolvedValueOnce({_: 'contacts.contacts', contacts: [{_: 'contact', user_id: 10}], users: []});
    const known = manager.fillContacts().promise;

    expect(invokeApi).toHaveBeenCalledTimes(2);
    await vi.waitFor(async() => expect([...await settled(manager.fillContacts().promise) as Set<UserId>]).toEqual([10]));
    // * the set handed out with the refusal is the one the answer fills
    expect([...await known]).toEqual([10]);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });
});

describe('the close friends', () => {
  test('are not replaced from contacts that could not be loaded', async() => {
    const {manager, invokeApi} = setup();
    invokeApi.mockImplementation(async(method: string) => {
      if(method === 'contacts.getContacts') throw flood();
      return true;
    });

    await expect(manager.updateCloseFriends([(30 as UserId).toPeerId(false)], [])).rejects.toThrow();
    // * the list sent would have been the new one alone: the close friends there are would have been dropped
    expect(invokeApi).not.toHaveBeenCalledWith('contacts.editCloseFriends', expect.anything());
  });

  test('are replaced from contacts the server gave', async() => {
    const {manager, invokeApi} = setup();
    (manager as any).users[10] = {_: 'user', id: 10, pFlags: {contact: true, close_friend: true}};
    invokeApi.mockImplementation(async(method: string) => {
      if(method === 'contacts.getContacts') {
        return {_: 'contacts.contacts', contacts: [{_: 'contact', user_id: 10}], users: []};
      }

      return true;
    });

    await manager.updateCloseFriends([(30 as UserId).toPeerId(false)], []);

    expect(invokeApi).toHaveBeenCalledWith('contacts.editCloseFriends', {id: [10, 30]});
  });
});
