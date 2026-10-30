import '@helpers/peerIdPolyfill';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppUsersManager} from '@appManagers/appUsersManager';

vi.mock('@lib/apiManagerProxy', () => ({default: new Proxy({}, {get: () => vi.fn()})}));

const appPeersManager = {
  getPeerId: (peer: {user_id: UserId}) => peer.user_id.toPeerId(false),
  isUser: (peerId: PeerId) => peerId.isUser()
};

function makeManager() {
  const manager = new AppProfileManager();
  Object.assign(manager, {
    appPeersManager,
    rootScope: {dispatchEvent: vi.fn()},
    getProfile: vi.fn(async() => {})
  });
  // * the update handler and the cache are private: reached as the update dispatcher and the profile loader do
  return manager as any as Pick<AppProfileManager, 'isUserKnownBlocked' | 'saveBlockedPeers'> & {
    onUpdatePeerBlocked: (update: any) => void,
    usersFull: Record<UserId, any>,
    getProfile: ReturnType<typeof vi.fn>
  };
}

// * the blocked list's pages, as the server answers them
function makeUsersManager(profileManager: ReturnType<typeof makeManager>, blockedUserIds: UserId[]) {
  const manager = new AppUsersManager();
  Object.assign(manager, {
    apiManager: {
      invokeApiSingle: vi.fn(async() => ({
        _: 'contacts.blocked',
        blocked: blockedUserIds.map((userId) => ({_: 'peerBlocked', peer_id: {_: 'peerUser', user_id: userId}, date: 0})),
        users: [],
        chats: []
      }))
    },
    appChatsManager: {saveApiChats: vi.fn()},
    appPeersManager,
    appProfileManager: profileManager
  });
  return manager;
}

const update = (userId: UserId, blocked: boolean) => ({
  _: 'updatePeerBlocked',
  peer_id: {_: 'peerUser', user_id: userId},
  pFlags: blocked ? {blocked: true} : {}
});

describe('whether a user is blocked', () => {
  it('keeps what a block update said of a user whose full profile is not here', () => {
    const manager = makeManager();
    expect(manager.isUserKnownBlocked(2)).toBe(false);

    manager.onUpdatePeerBlocked(update(2, true));
    expect(manager.isUserKnownBlocked(2)).toBe(true);

    manager.onUpdatePeerBlocked(update(2, false));
    expect(manager.isUserKnownBlocked(2)).toBe(false);
  });

  it('takes the full profile\'s word when there is one', () => {
    const manager = makeManager();
    manager.onUpdatePeerBlocked(update(3, true));
    manager.usersFull[3] = {_: 'userFull', id: 3, pFlags: {}};
    expect(manager.isUserKnownBlocked(3)).toBe(false);

    manager.onUpdatePeerBlocked(update(3, true));
    expect(manager.isUserKnownBlocked(3)).toBe(true);
  });

  it('reads one not known yet as not blocked without waiting, and loads their profile for the next asking', async() => {
    const manager = makeManager();
    expect(manager.isUserKnownBlocked(4)).toBe(false);
    await Promise.resolve();
    expect(manager.getProfile).toHaveBeenCalledExactlyOnceWith(4);

    // * the profile came: it says blocked, and nothing more is asked
    manager.usersFull[4] = {_: 'userFull', id: 4, pFlags: {blocked: true}};
    expect(manager.isUserKnownBlocked(4)).toBe(true);
    await Promise.resolve();
    expect(manager.getProfile).toHaveBeenCalledOnce();
  });

  it('asks nothing of one a block update told of', async() => {
    const manager = makeManager();
    manager.onUpdatePeerBlocked(update(5, false));
    expect(manager.isUserKnownBlocked(5)).toBe(false);
    await Promise.resolve();
    expect(manager.getProfile).not.toHaveBeenCalled();
  });

  it('a failed profile load leaves the answer as it was', async() => {
    const manager = makeManager();
    manager.getProfile.mockRejectedValue(new Error('USER_ID_INVALID'));
    expect(manager.isUserKnownBlocked(6)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve));
    expect(manager.isUserKnownBlocked(6)).toBe(false);
  });

  it('knows the users a page of the blocked list names, unless an update had its own word', async() => {
    const profileManager = makeManager();
    profileManager.onUpdatePeerBlocked(update(8, false));
    const usersManager = makeUsersManager(profileManager, [7, 8]);

    await usersManager.getBlocked(0, 20);
    expect(profileManager.isUserKnownBlocked(7)).toBe(true);
    // * the update may be newer than the page
    expect(profileManager.isUserKnownBlocked(8)).toBe(false);
  });

  it('takes nothing from the list of those my stories are hidden from', async() => {
    const profileManager = makeManager();
    const usersManager = makeUsersManager(profileManager, [9]);

    await usersManager.getBlocked(0, 20, true);
    expect(profileManager.isUserKnownBlocked(9)).toBe(false);
  });
});
