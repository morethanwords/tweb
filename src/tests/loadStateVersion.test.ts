// * the version the app was updated to is found new on every start until its message is in the "Telegram" chat,
// * which writes it (apiUpdatesManager.deliverChangelog): a start that stops on the way leaves the message for the
// * next one. A state that could not be read (an older version's tab held its database) writes nothing.
import {storage, states, harness, load, resetLoadState} from '@/tests/helpers/loadStateHarness';
import App from '@config/app';

const AUTH_KEY = 'ab'.repeat(256);
const signedIn = {_: 'authStateSignedIn'};

beforeEach(() => {
  resetLoadState();
  storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
});

describe('the version the app was updated to', () => {
  test('is found new on the first start of the new build, and is not written by it', async() => {
    states[1] = {userId: 1, authState: signedIn, version: '1.0', build: App.build - 1, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].newVersion).toBe(App.version);
    expect(loaded[1].oldVersion).toBe('1.0');
    expect(loaded[1].pushedKeys.has('version')).toBe(false);
    // * the build is, with what goes with it
    expect(loaded[1].pushedKeys.has('build')).toBe(true);
    expect(loaded[1].pushedKeys.has('appConfig')).toBe(true);
    expect(loaded[1].state.version).toBe('1.0');
  });

  test('is found new again by a start before its message came, without what goes with a new build', async() => {
    states[1] = {userId: 1, authState: signedIn, version: '1.0', build: App.build, updates: {pts: 100}, appConfig: {kept: true}};

    const loaded = await load();

    expect(loaded[1].newVersion).toBe(App.version);
    expect(loaded[1].pushedKeys.has('build')).toBe(false);
    expect(loaded[1].pushedKeys.has('appConfig')).toBe(false);
    expect(loaded[1].state.appConfig).toEqual({kept: true});
  });

  test('is not new once its message has written it', async() => {
    states[1] = {userId: 1, authState: signedIn, version: App.version, build: App.build, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].newVersion).toBeUndefined();
  });

  test('is not new to a state started afresh', async() => {
    const loaded = await load();

    expect(loaded[1].newVersion).toBeUndefined();
    expect(loaded[1].state.version).toBe(App.version);
  });
});

describe('the dialog list of a state older than build 687', () => {
  test('is reset, since the old pagination marked dialogs it skipped as loaded', async() => {
    states[1] = {userId: 1, authState: signedIn, version: '1.0', build: 685, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].resetStorages.get('dialogs')).toEqual([]);
    expect(loaded[1].pushedKeys.has('allDialogsLoaded')).toBe(true);
    expect(loaded[1].pushedKeys.has('dialogsPaginationOffsets')).toBe(true);
    expect(loaded[1].pushedKeys.has('pinnedOrders')).toBe(true);
  });

  test('is kept by a state of build 687', async() => {
    states[1] = {userId: 1, authState: signedIn, version: '1.0', build: 687, updates: {pts: 100}};

    const loaded = await load();

    expect(loaded[1].resetStorages.has('dialogs')).toBe(false);
  });
});

describe('a state that could not be read', () => {
  test('writes none of its defaults over what is kept, and finds no version new', async() => {
    states[1] = {userId: 1, authState: signedIn, version: '1.0', build: App.build - 1, updates: {pts: 100}};
    harness.readable = false;

    const loaded = await load();

    expect(loaded[1].newVersion).toBeUndefined();
    expect(loaded[1].pushedKeys.size).toBe(0);
    expect(loaded[1].resetStorages.size).toBe(0);
  });
});
