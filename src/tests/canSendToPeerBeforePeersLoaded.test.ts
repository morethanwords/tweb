import '@helpers/peerIdPolyfill';
import deferredPromise from '@helpers/cancellablePromise';
import pause from '@helpers/schedulers/pause';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import canSendToUser from '@appManagers/utils/users/canSendToUser';

/*
 * As the app starts, a chat can be opened (a link in the address, a quick click) before the peers kept on disk are
 * in. Asked then, a user who was not there yet answered that nothing could be sent - and the composer, set up from
 * that answer once, stayed locked for good. The answer waits for the peers to be in.
 */

const USER_ID = 42 as UserId;

function makeManager() {
  const manager = new AppMessagesManager() as any;
  const users: Record<UserId, any> = {};
  const usersLoaded = deferredPromise<void>();
  Object.assign(manager, {
    appUsersManager: {
      loaded: usersLoaded,
      canSendToUser: (peerId: PeerId) => canSendToUser(users[peerId.toUserId()])
    },
    appChatsManager: {loaded: Promise.resolve()},
    appPeersManager: {isPeerRestricted: async() => false},
    apiManager: {getAppConfig: async() => ({})}
  });

  return {manager: manager as AppMessagesManager, users, usersLoaded};
}

test('a user asked about before the users kept on disk are in is answered once they are', async() => {
  const {manager, users, usersLoaded} = makeManager();
  const answer = manager.canSendToPeer(USER_ID.toPeerId(false));
  // * the disk's users come in a moment later
  await pause(0);
  users[USER_ID] = {_: 'user', id: USER_ID, pFlags: {}};
  usersLoaded.resolve();
  expect(await answer).toBe(true);
});

test('a failed read of the disk does not leave the answer hanging', async() => {
  const {manager, usersLoaded} = makeManager();
  usersLoaded.reject(new Error('IDB'));
  expect(await manager.canSendToPeer(USER_ID.toPeerId(false))).toBe(false);
});
