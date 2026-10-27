// * Web A (web.telegram.org/a) keeps its accounts in the same slots of localStorage (`account${n}`): switching
// * between the versions keeps the accounts signed in only while both read what the other one writes there
const storage = vi.hoisted(() => {
  const values: Record<string, any> = {};
  // * as localStorage keeps it: JSON
  const clone = (value: any) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  return {
    values,
    get: vi.fn(async(key: string) => clone(values[key])),
    set: vi.fn(async(obj: Record<string, any>) => {
      for(const key in obj) {
        values[key] = clone(obj[key]);
      }
    }),
    delete: vi.fn(async(key: string) => {
      delete values[key];
    })
  };
});

vi.mock('@lib/sessionStorage', () => ({default: storage}));
vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({default: {isUsingPasscode: async() => false, resolveDeferred: () => {}}}));

import '@helpers/peerIdPolyfill';
import AccountController from '@lib/accounts/accountController';
import AppAccountManager from '@appManagers/appAccountManager';
import type {User} from '@layer';

const AUTH_KEY = 'ab'.repeat(256);

function clearStorage() {
  for(const key in storage.values) delete storage.values[key];
}

describe('account slots shared with Web A', () => {
  beforeEach(clearStorage);

  test('the user id is written as the string Web A compares, and read back as a number', async() => {
    await AccountController.update(1, {userId: 1234567, dcId: 2, dc2_auth_key: AUTH_KEY});

    expect(storage.values.account1.userId).toBe('1234567');
    expect((await AccountController.get(1)).userId).toBe(1234567);
    expect(await AccountController.getUserIds()).toEqual([1234567]);
  });

  test('the legacy keys of the first account stay as Web A reads them', async() => {
    await AccountController.update(1, {userId: 1234567, dcId: 4, dc4_auth_key: AUTH_KEY});

    expect(storage.values.dc).toBe(4);
    expect(storage.values.dc4_auth_key).toBe(AUTH_KEY);
    expect(storage.values.user_auth).toMatchObject({id: 1234567, dcID: 4});
  });

  test('an account Web A wrote is read, what Web A keeps beside it stays', async() => {
    storage.values.account2 = {
      dcId: 4,
      dc4_auth_key: AUTH_KEY,
      userId: '777000',
      firstName: 'Web',
      avatarUri: 'data:image/png;base64,AA==',
      authKeyCreatedAt: 1700000000
    };

    expect((await AccountController.get(2)).userId).toBe(777000);
    await AccountController.update(2, {dc4_server_salt: 'AAAAAAAAAAAAAAAA'});

    expect(storage.values.account2).toMatchObject({
      userId: '777000',
      firstName: 'Web',
      avatarUri: 'data:image/png;base64,AA==',
      authKeyCreatedAt: 1700000000,
      dc4_server_salt: 'AAAAAAAAAAAAAAAA'
    });
  });

  test('a slot Web A left empty is skipped, and is the one a new account goes to', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '1'};
    storage.values.account3 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '3'};

    expect(await AccountController.getAccountNumbers()).toEqual([1, 3]);
    expect(await AccountController.getTotalAccounts()).toBe(2);
    expect(await AccountController.getUserIds()).toEqual([1, 3]);
    expect(await AccountController.getFreeAccountNumber()).toBe(2);
  });

  test('an account of the test servers is Web A\'s alone: not listed, not written to, not taken', async() => {
    storage.values.account1 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '5', isTest: true};
    storage.values.account2 = {dcId: 2, dc2_auth_key: AUTH_KEY, userId: '6'};
    const testAccount = structuredClone(storage.values.account1);

    expect(await AccountController.getAccountNumbers()).toEqual([2]);
    expect(await AccountController.getFreeAccountNumber()).toBe(3);
    await AccountController.get(1);
    await AccountController.update(1, {temp_auth_keys: {'2': {key: 'bb', salt: 'cc', expiresAt: 1, permKeyId: 'dd'}}});
    expect(storage.values.account1).toEqual(testAccount);
  });
});

describe('the DC of a slot', () => {
  beforeEach(clearStorage);

  async function createApiManager(accountNumber: 1 | 2 | 3) {
    const {ApiManager} = await import('@appManagers/apiManager');
    const apiManager = Object.create(ApiManager.prototype);
    Object.assign(apiManager, {
      baseDcId: 0,
      getAccountNumber: () => accountNumber,
      // * a move to another DC lets the previous one's connection drain
      getNetworker: () => new Promise(() => {})
    });
    return apiManager as InstanceType<typeof ApiManager>;
  }

  test('a sign-in not finished yet keeps its DC apart from `dcId`, which would make a session of it to Web A', async() => {
    const apiManager = await createApiManager(3);
    expect(await apiManager.getBaseDcId()).toBe(2);
    apiManager.setBaseDcId(4);
    await AccountController.whenUpdated(3);

    expect(storage.values.account3).toEqual({sign_in_dc_id: 4});

    // * the sign-in goes on after a reload where it was
    expect(await (await createApiManager(3)).getBaseDcId()).toBe(4);
  });

  test('a signed-in slot keeps its DC in `dcId`', async() => {
    await AccountController.update(2, {userId: 20, dcId: 5});
    expect(await (await createApiManager(2)).getBaseDcId()).toBe(5);

    const apiManager = await createApiManager(2);
    await apiManager.getBaseDcId();
    apiManager.setBaseDcId(1);
    await AccountController.whenUpdated(2);
    expect(storage.values.account2).toMatchObject({userId: '20', dcId: 1});
    expect(storage.values.account2.sign_in_dc_id).toBeUndefined();
  });
});

describe('who the account is, for Web A\'s menu of accounts', () => {
  const user: User.user = {
    _: 'user',
    id: 1234567,
    pFlags: {self: true, premium: true},
    first_name: 'Ann',
    last_name: 'Lee',
    phone: '15550001111',
    color: {_: 'peerColor', color: 5},
    emoji_status: {_: 'emojiStatus', document_id: '5368324170671202286'},
    photo: {_: 'userProfilePhoto', pFlags: {}, photo_id: '42', dc_id: 2}
  };

  test('the fields are Web A\'s', () => {
    expect(AccountController.getSessionUserFields(user)).toEqual({
      firstName: 'Ann',
      lastName: 'Lee',
      phone: '15550001111',
      color: 5,
      isPremium: true,
      emojiStatusId: '5368324170671202286'
    });

    expect(AccountController.getSessionUserFields({
      ...user,
      pFlags: {},
      color: {_: 'peerColorCollectible', collectible_id: 1, gift_emoji_id: 2, background_emoji_id: 3, accent_color: 4, colors: []},
      emoji_status: undefined
    })).toMatchObject({color: undefined, isPremium: false, emojiStatusId: undefined});
  });

  function createManager(self: User.user, accountNumber: 1 | 2 = 1) {
    const downloadAvatar = vi.fn(async() => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], {type: 'image/jpeg'}));
    const manager = new AppAccountManager();
    manager.setManagersAndAccountNumber({
      appUsersManager: {getSelf: () => self},
      appAvatarsManager: {downloadAvatar}
    } as any, accountNumber);
    return {manager, downloadAvatar};
  }

  beforeEach(clearStorage);

  test('the account\'s slot gets who it is and its avatar', async() => {
    await AccountController.update(1, {userId: user.id as number, dcId: 2, dc2_auth_key: AUTH_KEY});
    const {manager, downloadAvatar} = createManager(user);
    manager.saveSessionUser();
    await vi.waitFor(() => expect(storage.values.account1.avatarUri).toBeDefined());

    expect(downloadAvatar).toHaveBeenCalledWith(user.id, user.photo, 'photo_small');
    expect(storage.values.account1).toMatchObject({
      userId: '1234567',
      firstName: 'Ann',
      lastName: 'Lee',
      phone: '15550001111',
      color: 5,
      isPremium: true,
      emojiStatusId: '5368324170671202286',
      avatarUri: 'data:image/jpeg;base64,/9j/',
      dc2_auth_key: AUTH_KEY
    });
  });

  test('an avatar already in the slot is kept at first, and replaced when the photo changes', async() => {
    await AccountController.update(1, {userId: user.id as number, dcId: 2, avatarUri: 'data:image/png;base64,AA=='});
    const self = structuredClone(user);
    const {manager, downloadAvatar} = createManager(self);
    manager.saveSessionUser();
    await vi.waitFor(() => expect(storage.values.account1.firstName).toBe('Ann'));
    await AccountController.whenUpdated(1);
    expect(downloadAvatar).not.toHaveBeenCalled();
    expect(storage.values.account1.avatarUri).toBe('data:image/png;base64,AA==');

    delete self.photo;
    manager.saveSessionUser();
    await vi.waitFor(() => expect(storage.values.account1.avatarUri).toBeUndefined());
  });

  test('at first what Web A wrote is kept, what changes later is written', async() => {
    await AccountController.update(1, {userId: user.id as number, dcId: 2, firstName: 'Anna', avatarUri: 'data:image/png;base64,AA=='});
    const self = structuredClone(user);
    const {manager} = createManager(self);
    manager.saveSessionUser();
    await vi.waitFor(() => expect(storage.values.account1.lastName).toBe('Lee'));
    expect(storage.values.account1.firstName).toBe('Anna');

    self.first_name = 'Hanna';
    manager.saveSessionUser();
    await vi.waitFor(() => expect(storage.values.account1.firstName).toBe('Hanna'));
  });

  test('a slot that is another account\'s by now is left alone', async() => {
    await AccountController.update(2, {userId: 999, dcId: 2});
    const {manager} = createManager(user, 2);
    manager.saveSessionUser();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await AccountController.whenUpdated(2);

    expect(storage.values.account2).toEqual({userId: '999', dcId: 2, push_key: expect.any(String)});
  });
});
