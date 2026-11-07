// * Web A signs accounts in and out of the slots K keeps its accounts in, and knows nothing of what K keeps of
// * them in IndexedDB: what is loaded for a slot must be of the user signed in to it now
import {storage, states, harness, load, resetLoadState} from '@/tests/helpers/loadStateHarness';
import {STATE_INIT} from '@config/state';

const AUTH_KEY = 'ab'.repeat(256);

beforeEach(resetLoadState);

describe('loading the accounts after Web A', () => {
  beforeEach(() => {
    harness.passcode = false;
  });

  test('what was kept for another user of the slot is dropped', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    storage.values.account2 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '20'};
    states[1] = {userId: 1, authState: {_: 'authStateSignedIn'}, updates: {pts: 100}};
    states[2] = {userId: 10, authState: {_: 'authStateSignedIn'}, updates: {pts: 200}};

    const loaded = await load();

    expect(loaded[1].resetStorages.size).toBe(0);
    expect(loaded[1].state.updates).toEqual({pts: 100});

    expect(loaded[2].userId).toBe(20);
    expect(loaded[2].state.userId).toBe(20);
    expect(loaded[2].pushedKeys.has('userId')).toBe(true);
    expect(loaded[2].state.updates).toEqual({});
    expect(loaded[2].state.authState._).toBe('authStateSignedIn');
    expect([...loaded[2].resetStorages.keys()].sort()).toEqual(['chats', 'dialogs', 'users']);
  });

  test('a slot Web A signed out of is signed out here too', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    states[1] = {userId: 1, authState: {_: 'authStateSignedIn'}};
    // * one that knew its user, and one from before that was kept
    states[2] = {userId: 10, authState: {_: 'authStateSignedIn'}, updates: {pts: 200}};
    states[3] = {authState: {_: 'authStateSignedIn'}, updates: {pts: 300}};

    const loaded = await load();

    for(const accountNumber of [2, 3] as const) {
      expect(loaded[accountNumber].userId).toBeUndefined();
      expect(loaded[accountNumber].state.authState).toEqual(STATE_INIT.authState);
      expect(loaded[accountNumber].state.updates).toEqual({});
      expect(loaded[accountNumber].resetStorages.size).toBe(3);
    }
  });

  test('a state from before the user was kept is not dropped, and learns its user', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    states[1] = {authState: {_: 'authStateSignedIn'}, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].resetStorages.size).toBe(0);
    expect(loaded[1].state.updates).toEqual({pts: 100});
    expect(loaded[1].state.userId).toBe(1);
    expect(loaded[1].pushedKeys.has('userId')).toBe(true);
  });

  test('Web A\'s account of the test servers is not signed in to here', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '5', isTest: true};

    const loaded = await load();

    expect(loaded[1].userId).toBeUndefined();
    expect(loaded[1].state.authState).toEqual(STATE_INIT.authState);
    expect(storage.values.account1).toEqual({dcId: 2, dc2_auth_key: AUTH_KEY, userId: '5', isTest: true});
  });

  test('Web A\'s first account with no key of the base DC is taken as it is', async() => {
    // * signed in by a link from another app: Web A started at the account's own DC
    const account = {dcId: 4, dc4_auth_key: AUTH_KEY, userId: '1'};
    storage.values.account1 = {...account};
    storage.values.user_auth = {dcID: 4, id: '1', test: undefined};
    storage.values.dc = 4;
    storage.values.dc4_auth_key = AUTH_KEY;
    states[1] = {userId: 1, authState: {_: 'authStateSignedIn'}, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].userId).toBe(1);
    expect(loaded[1].state.updates).toEqual({pts: 100});
    expect(storage.values.account1).toMatchObject(account);
  });

  test('a slot nobody is signed in to has no DC, which would make it a session to Web A', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    // * what an older version kept of the sign-in screen of an empty slot
    storage.values.account3 = {dcId: 2, dc2_auth_key: AUTH_KEY};

    // * Web A's test-server session, before Web A has written whose it is
    storage.values.account4 = {dcId: 2, dc2_auth_key: AUTH_KEY, isTest: true};

    await load();

    expect(storage.values.account1.dcId).toBe(2);
    // * where a sign-in not finished yet keeps its DC now
    expect(storage.values.account3).toEqual({dc2_auth_key: AUTH_KEY, auth_key_fingerprint: AUTH_KEY.slice(0, 8), sign_in_dc_id: 2});
    expect(storage.values.account4).toEqual({dcId: 2, dc2_auth_key: AUTH_KEY, isTest: true});
  });

  test('signed out of everything: what is kept of the first account is dropped, the rest is brought over', async() => {
    // * an older version's state, with settings and a sign-in begun
    states.old = {authState: {_: 'authStateSignIn'}, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].userId).toBeUndefined();
    expect(loaded[1].state.authState).toEqual({_: 'authStateSignIn'});
    expect(loaded[1].state.updates).toEqual({});
    expect([...loaded[1].resetStorages.keys()].sort()).toEqual(['chats', 'dialogs', 'users']);
  });

  test('an account kept only the old way keeps its DC', async() => {
    // * an older Web A: nothing but the legacy keys
    storage.values.user_auth = {dcID: 4, id: '77'};
    storage.values.dc = 4;
    storage.values.dc4_auth_key = AUTH_KEY;

    const loaded = await load();

    expect(loaded[1].userId).toBe(77);
    expect(storage.values.account1).toMatchObject({dcId: 4, userId: '77', dc4_auth_key: AUTH_KEY});
  });
});

// * Turning the passcode on removes the plain copy of the first account's keys kept for Web A beside its slot, once the
// * worker has the accounts encrypted. Stopped before that, it left the copy in localStorage for good: with the passcode
// * on, nothing touched it. (Here the slots stand for what the encrypted store keeps, the rest for localStorage.)
describe('the copy of the first account\'s keys kept for Web A, with the passcode on', () => {
  const COPY = {dc2_auth_key: AUTH_KEY, dc2_server_salt: 'fake-salt', user_auth: {dcID: 2, id: '1'}, dc: 2};

  beforeEach(() => {
    harness.passcode = true;
  });

  test('left behind, it goes once the account read from the encrypted store has its keys', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    Object.assign(storage.values, COPY);

    const loaded = await load();

    expect(loaded[1].userId).toBe(1);
    expect(storage.values.account1).toMatchObject({dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'});
    for(const key in COPY) {
      expect(storage.values[key]).toBeUndefined();
    }
  });

  test('another session\'s key is Web A\'s, and stays with its salt', async() => {
    const WEB_A_KEY = 'cd'.repeat(256);
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    Object.assign(storage.values, COPY, {dc4_auth_key: WEB_A_KEY, dc4_server_salt: 'fake-salt-of-web-a'});

    await load();

    expect(storage.values).toMatchObject({dc4_auth_key: WEB_A_KEY, dc4_server_salt: 'fake-salt-of-web-a'});
    for(const key in COPY) {
      expect(storage.values[key]).toBeUndefined();
    }
  });

  test('it stays while the account has no key of its own: it may be the only one', async() => {
    storage.values.account1 = {dcId: 2, userId: '1'};
    Object.assign(storage.values, COPY);

    await load();

    expect(storage.values).toMatchObject(COPY);
  });

  test('without the passcode it is what Web A reads, and stays', async() => {
    harness.passcode = false;
    // * with nothing to fill in, the slot is not written: a write would make the copy anew from it
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1', auth_key_fingerprint: AUTH_KEY.slice(0, 8), push_key: 'fake-push-key'};
    Object.assign(storage.values, COPY);

    await load();

    expect(storage.values).toMatchObject(COPY);
  });
});
