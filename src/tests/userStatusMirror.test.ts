import {AppUsersManager} from '@appManagers/appUsersManager';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import type {Update, User, UserStatus} from '@layer';
import '@helpers/peerIdPolyfill';
import tsNow from '@helpers/tsNow';

// The tabs keep a copy of every user, which they read synchronously - the contacts list shows each contact's status
// from it. A status the worker changed in place (an update, an online that ran out, a user seen active) reached the
// listeners and the copy kept for the next start, but not the tabs' copy: "online" or "last seen" stayed as it was
// when the user was last saved whole.

const USER_ID = 10 as UserId;

function setup(status: UserStatus) {
  const mirror = vi.fn();
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: mirror} as any);

  const user = {_: 'user', id: USER_ID, pFlags: {contact: true}, status} as User.user;
  const manager = new AppUsersManager();
  Object.assign(manager as any, {
    users: {[USER_ID]: user},
    storage: {set: vi.fn()},
    peersStorage: {isPeerNeeded: () => true},
    rootScope: {dispatchEvent: vi.fn()},
    apiUpdatesManager: {updatesState: {syncLoading: false}},
    timeManager: {getServerTimeOffset: () => 0}
  });

  // * what the tabs hold now
  const mirrored = () => mirror.mock.calls
  .filter(([method, payload]) => method === 'mirror' && payload.key === '' + USER_ID)
  .map(([, payload]) => (payload.value as User.user).status?._)
  .slice(-1)[0];

  return {manager, user, mirrored};
}

const offline = (): UserStatus => ({_: 'userStatusOffline', was_online: tsNow(true) - 3600});
const online = (): UserStatus => ({_: 'userStatusOnline', expires: tsNow(true) + 300});

describe('a user\'s status reaches the tabs\' copy', () => {
  test('when the server says it changed', () => {
    const {manager, mirrored} = setup(offline());

    (manager as any).onUpdateUserStatus({
      _: 'updateUserStatus',
      user_id: USER_ID,
      status: online()
    } as Update.updateUserStatus);

    expect(mirrored()).toBe('userStatusOnline');
  });

  test('when an online runs out', () => {
    const {manager, mirrored} = setup({_: 'userStatusOnline', expires: tsNow(true) - 1});

    (manager as any).updateUsersStatuses();

    expect(mirrored()).toBe('userStatusOffline');
  });

  test('when the user is seen active', () => {
    const {manager, mirrored} = setup(offline());

    manager.forceUserOnline(USER_ID);

    expect(mirrored()).toBe('userStatusOnline');
  });

  test('when it is set here', () => {
    const {manager, mirrored} = setup(online());

    manager.setUserStatus(USER_ID, true);

    expect(mirrored()).toBe('userStatusOffline');
  });
});
