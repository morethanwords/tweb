import {afterEach, describe, expect, it, vi} from 'vitest';
import {AppUsersManager} from '@appManagers/appUsersManager';
import AppAccountManager from '@appManagers/appAccountManager';
import '@helpers/peerIdPolyfill';

const topPeers = {
  _: 'contacts.topPeers',
  categories: [{
    _: 'topPeerCategoryPeers',
    category: {_: 'topPeerCategoryCorrespondents'},
    count: 1,
    peers: [{_: 'topPeer', peer: {_: 'peerUser', user_id: 10}, rating: 1}]
  }],
  users: [] as any[],
  chats: [] as any[]
};

function makeUsersManager(topPeersCache: any = {}) {
  const state = {topPeersCache};
  const invokeApi = vi.fn();
  const pushToState = vi.fn();
  const manager = new AppUsersManager();
  Object.assign(manager as any, {
    getTopPeersPromises: {},
    topPeersFloods: {},
    users: {},
    appStateManager: {getState: () => Promise.resolve(state), pushToState},
    appPeersManager: {getPeer: () => ({})},
    appChatsManager: {saveApiChats: vi.fn()},
    peersStorage: {requestPeer: vi.fn()},
    apiManager: {invokeApi}
  });
  (manager as any).saveApiUsers = vi.fn();

  return {manager, state, invokeApi, pushToState};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('suggest frequent contacts', () => {
  it('keeps a disabled answer as an empty list the switch reads as off', async() => {
    const {manager, state, invokeApi} = makeUsersManager();
    invokeApi.mockResolvedValue({_: 'contacts.topPeersDisabled'});

    await expect(manager.getTopPeers('correspondents')).resolves.toEqual([]);
    await expect(manager.isTopPeersEnabled()).resolves.toBe(false);
    expect(state.topPeersCache.correspondents).toMatchObject({peers: [], disabled: true});
    // * the answer is kept for the day like any list, the switch costs no request of its own
    expect(invokeApi).toHaveBeenCalledOnce();
  });

  it('reads a list as on', async() => {
    const {manager, state, invokeApi} = makeUsersManager();
    invokeApi.mockResolvedValue(topPeers);

    await expect(manager.isTopPeersEnabled()).resolves.toBe(true);
    expect(state.topPeersCache.correspondents.disabled).toBe(false);
    expect(state.topPeersCache.correspondents.peers).toHaveLength(1);
  });

  it('empties every list when turned off, without asking for them', async() => {
    const {manager, state, invokeApi, pushToState} = makeUsersManager({
      correspondents: {peers: [{id: 10, rating: 1}], cachedTime: Date.now()},
      bots_inline: {peers: [{id: 20, rating: 1}], cachedTime: Date.now()}
    });
    invokeApi.mockResolvedValue(true);

    await manager.toggleTopPeers(false);

    expect(invokeApi).toHaveBeenCalledExactlyOnceWith('contacts.toggleTopPeers', {enabled: false});
    for(const type of ['correspondents', 'bots_inline', 'bots_app', 'bots_guestchat'] as const) {
      expect(state.topPeersCache[type]).toMatchObject({peers: [], disabled: true});
    }
    expect(pushToState).toHaveBeenCalledWith('topPeersCache', state.topPeersCache);

    await expect(manager.getTopPeers('correspondents')).resolves.toEqual([]);
    await expect(manager.isTopPeersEnabled()).resolves.toBe(false);
    expect(invokeApi).toHaveBeenCalledOnce();
  });

  it('asks for the lists anew when turned back on', async() => {
    const {manager, state, invokeApi} = makeUsersManager({
      correspondents: {peers: [], cachedTime: Date.now(), disabled: true}
    });
    invokeApi.mockResolvedValueOnce(true).mockResolvedValueOnce(topPeers);

    await manager.toggleTopPeers(true);
    expect(state.topPeersCache).toEqual({});

    await expect(manager.getTopPeers('correspondents')).resolves.toEqual([{id: (10 as UserId).toPeerId(false), rating: 1}]);
    await expect(manager.isTopPeersEnabled()).resolves.toBe(true);
    expect(invokeApi).toHaveBeenNthCalledWith(2, 'contacts.getTopPeers', expect.objectContaining({correspondents: true}), expect.anything());
  });

  it('does not keep a list that was on its way while the switch flipped', async() => {
    const {manager, state, invokeApi} = makeUsersManager();
    let answer: (value: any) => void;
    invokeApi.mockReturnValueOnce(new Promise((resolve) => answer = resolve)).mockResolvedValueOnce(true);

    const pending = manager.getTopPeers('correspondents');
    await Promise.resolve();
    await manager.toggleTopPeers(false);
    answer(topPeers);

    // * nor handed to the one who asked: the lists are off by now
    await expect(pending).resolves.toEqual([]);
    expect(state.topPeersCache.correspondents).toMatchObject({peers: [], disabled: true});
    await expect(manager.getTopPeers('correspondents')).resolves.toEqual([]);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  it('does not hand out the list from before when the one on its way fails after the switch went off', async() => {
    const {manager, invokeApi} = makeUsersManager({
      bots_app: {peers: [{id: 20, rating: 1}], cachedTime: 0}
    });
    let fail: (error: any) => void;
    invokeApi.mockReturnValueOnce(new Promise((_, reject) => fail = reject)).mockResolvedValueOnce(true);

    const pending = manager.getTopPeers('bots_app');
    await Promise.resolve();
    await manager.toggleTopPeers(false);
    fail({type: 'INTERNAL'});

    await expect(pending).resolves.toEqual([]);
  });

  it('asks again for a list that was on its way while the switch went on', async() => {
    const {manager, state, invokeApi} = makeUsersManager({
      correspondents: {peers: [], cachedTime: 0, disabled: true}
    });
    let answer: (value: any) => void;
    invokeApi
    .mockReturnValueOnce(new Promise((resolve) => answer = resolve))
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(topPeers);

    const pending = manager.getTopPeers('correspondents');
    await Promise.resolve();
    await manager.toggleTopPeers(true);
    answer({_: 'contacts.topPeersDisabled'});

    await expect(pending).resolves.toEqual([{id: (10 as UserId).toPeerId(false), rating: 1}]);
    expect(invokeApi).toHaveBeenCalledTimes(3);
    expect(state.topPeersCache.correspondents.disabled).toBe(false);
  });

  it('leaves the lists as they were when the server refuses the switch', async() => {
    const cached = {peers: [{id: 10, rating: 1}], cachedTime: Date.now()};
    const {manager, state, invokeApi} = makeUsersManager({correspondents: cached});
    invokeApi.mockRejectedValue({type: 'INTERNAL'});

    await expect(manager.toggleTopPeers(false)).rejects.toEqual({type: 'INTERNAL'});
    expect(state.topPeersCache.correspondents).toBe(cached);
  });

  it('asks the server about an empty list kept before the switch was there', async() => {
    // * how a disabled answer used to be kept: nothing says it was one
    const {manager, state, invokeApi} = makeUsersManager({
      correspondents: {peers: [], cachedTime: Date.now()}
    });
    invokeApi.mockResolvedValue({_: 'contacts.topPeersDisabled'});

    await expect(manager.isTopPeersEnabled()).resolves.toBe(false);
    expect(invokeApi).toHaveBeenCalledOnce();
    expect(state.topPeersCache.correspondents.disabled).toBe(true);
  });

  it('keeps an empty list known to be on for the day', async() => {
    const {manager, invokeApi} = makeUsersManager({
      correspondents: {peers: [], cachedTime: Date.now(), disabled: false}
    });

    await expect(manager.isTopPeersEnabled()).resolves.toBe(true);
    expect(invokeApi).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing kept', {}],
    ['an empty list kept before the switch was there', {correspondents: {peers: [] as any[], cachedTime: Date.now()}}]
  ])('does not know whether it is on when the list cannot be had, with %s, and asks again the next time', async(_, cache) => {
    const {manager, invokeApi} = makeUsersManager(cache);
    invokeApi.mockRejectedValueOnce({type: 'INTERNAL'}).mockResolvedValueOnce({_: 'contacts.topPeersDisabled'});

    await expect(manager.isTopPeersEnabled()).resolves.toBeUndefined();
    await expect(manager.isTopPeersEnabled()).resolves.toBe(false);
    expect(invokeApi).toHaveBeenCalledTimes(2);
  });

  it('does not know whether it is on while the server says to wait', async() => {
    const {manager, invokeApi} = makeUsersManager();
    invokeApi.mockRejectedValue({code: 420, type: 'FLOOD_WAIT_60'});

    await expect(manager.isTopPeersEnabled()).resolves.toBeUndefined();
    // * nothing asked before the wait is over
    await expect(manager.isTopPeersEnabled()).resolves.toBeUndefined();
    expect(invokeApi).toHaveBeenCalledOnce();
  });

  it('reads the switch only once the flips on their way are answered', async() => {
    const {manager, invokeApi} = makeUsersManager({
      correspondents: {peers: [{id: 10, rating: 1}], cachedTime: Date.now(), disabled: false}
    });
    let answer: (value: any) => void;
    invokeApi.mockReturnValueOnce(new Promise((resolve) => answer = resolve));

    const off = manager.toggleTopPeers(false);
    const enabled = manager.isTopPeersEnabled();
    await Promise.resolve();
    answer(true);
    await off;

    await expect(enabled).resolves.toBe(false);
  });

  it('sends a flip only once the one before is answered, whoever made it', async() => {
    const {manager, invokeApi} = makeUsersManager();
    let answer: (value: any) => void;
    invokeApi.mockReturnValueOnce(new Promise((resolve) => answer = resolve)).mockResolvedValueOnce(true);

    const off = manager.toggleTopPeers(false);
    const on = manager.toggleTopPeers(true);
    await Promise.resolve();
    expect(invokeApi.mock.calls).toEqual([['contacts.toggleTopPeers', {enabled: false}]]);

    answer(true);
    await Promise.all([off, on]);
    expect(invokeApi.mock.calls).toEqual([
      ['contacts.toggleTopPeers', {enabled: false}],
      ['contacts.toggleTopPeers', {enabled: true}]
    ]);
  });
});

describe('ask a question', () => {
  const supportUser = {_: 'user', id: 4244000, pFlags: {support: true}};

  const makeSupportManager = () => {
    const {manager} = makeUsersManager();
    const users: Record<string, any> = (manager as any).users;
    const invokeApiSingleProcess = vi.fn(async({method, processResult}: any) => {
      expect(method).toBe('help.getSupport');
      return processResult({_: 'help.support', phone_number: '42400', user: supportUser});
    });
    (manager as any).apiManager = {invokeApiSingleProcess};
    (manager as any).saveApiUser = vi.fn((user: any) => users[user.id] = user);
    return {manager, users, invokeApiSingleProcess};
  };

  it('saves the volunteer and asks for them once a session', async() => {
    const {manager, users, invokeApiSingleProcess} = makeSupportManager();

    await expect(manager.getSupportUserId()).resolves.toBe(4244000);
    expect(users[4244000]).toBe(supportUser);
    await expect(manager.getSupportUserId()).resolves.toBe(4244000);
    expect(invokeApiSingleProcess).toHaveBeenCalledOnce();
  });

  it('asks again once the volunteer has left memory', async() => {
    const {manager, users, invokeApiSingleProcess} = makeSupportManager();

    await manager.getSupportUserId();
    delete users[4244000];
    await expect(manager.getSupportUserId()).resolves.toBe(4244000);
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
  });
});

describe('account self-destruct', () => {
  it('reads and sets the period in days', async() => {
    const manager = new AppAccountManager();
    const invokeApi = vi.fn().mockResolvedValue(true);
    const invokeApiSingleProcess = vi.fn(async({method, processResult}: any) => {
      expect(method).toBe('account.getAccountTTL');
      return processResult({_: 'accountDaysTTL', days: 548});
    });
    Object.assign(manager as any, {apiManager: {invokeApi, invokeApiSingleProcess}});

    await expect(manager.getAccountTTL()).resolves.toBe(548);
    await expect(manager.setAccountTTL(180)).resolves.toBe(true);
    expect(invokeApi).toHaveBeenCalledExactlyOnceWith('account.setAccountTTL', {ttl: {_: 'accountDaysTTL', days: 180}});
  });

  it.each([
    ['setAccountTTL', 'account.setAccountTTL'],
    ['setAuthorizationTTL', 'account.setAuthorizationTTL']
  ] as const)('%s sends a period only once the one before is answered, whichever screen picked them', async(method, apiMethod) => {
    const manager = new AppAccountManager();
    let fail: (error: any) => void;
    const invokeApi = vi.fn()
    .mockReturnValueOnce(new Promise((_, reject) => fail = reject))
    .mockResolvedValue(true);
    Object.assign(manager as any, {apiManager: {invokeApi}});

    // * 30 and 180 picked on a screen closed since, 90 on the one opened again
    const saves = [30, 180, 90].map((days) => manager[method](days));
    await Promise.resolve();
    expect(invokeApi).toHaveBeenCalledOnce();

    fail({type: 'INTERNAL'});
    await expect(saves[0]).rejects.toEqual({type: 'INTERNAL'});
    await Promise.all(saves.slice(1));
    expect(invokeApi.mock.calls.map(([name]) => name)).toEqual([apiMethod, apiMethod, apiMethod]);
    expect(invokeApi.mock.calls.map(([, params]) => params.ttl?.days ?? params.authorization_ttl_days)).toEqual([30, 180, 90]);
  });

  it('reads the account period only once the periods on their way are answered', async() => {
    const manager = new AppAccountManager();
    const order: string[] = [];
    let answer: (value: any) => void;
    const invokeApi = vi.fn(() => {
      order.push('set');
      return new Promise((resolve) => answer = resolve);
    });
    const invokeApiSingleProcess = vi.fn(async({processResult}: any) => {
      order.push('get');
      return processResult({_: 'accountDaysTTL', days: 90});
    });
    Object.assign(manager as any, {apiManager: {invokeApi, invokeApiSingleProcess}});

    const set = manager.setAccountTTL(90);
    const get = manager.getAccountTTL();
    await Promise.resolve();
    expect(order).toEqual(['set']);
    answer(true);
    await set;

    await expect(get).resolves.toBe(90);
    expect(order).toEqual(['set', 'get']);
  });

  it('reads the sessions period off a list asked for after the periods on their way are answered', async() => {
    const manager = new AppAccountManager();
    let answerSet: (value: any) => void, answerList: (value: any) => void;
    const invokeApi = vi.fn((method: string) => new Promise((resolve) => {
      if(method === 'account.setAuthorizationTTL') answerSet = resolve;
      else answerList = resolve;
    }));
    Object.assign(manager as any, {apiManager: {invokeApi}});
    (manager as any).setUnconfirmedAuthorizations = vi.fn();

    // * a list on its way from before the period was set
    const stale = manager.getAuthorizations();
    const set = manager.setAuthorizationTTL(30);
    const ttl = manager.getAuthorizationTTL();
    await Promise.resolve();
    answerSet(true);
    await set;
    answerList({authorizations: [], authorization_ttl_days: 180});
    await stale;
    await vi.waitFor(() => expect(invokeApi).toHaveBeenCalledTimes(3));
    answerList({authorizations: [], authorization_ttl_days: 30});

    await expect(ttl).resolves.toBe(30);
  });
});
