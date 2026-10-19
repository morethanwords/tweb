// * Every update of an account reads its whole data, merges and writes it back: two at once must not
// * lose one of them - the temporary auth keys of PFS are written right when the permanent keys, the
// * user and the DC are
const storage = vi.hoisted(() => {
  const values: Record<string, any> = {};
  // * a storage slow enough for two read-merge-writes to interleave
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
  return {
    values,
    get: vi.fn(async(key: string) => {
      await tick();
      return values[key] && structuredClone(values[key]);
    }),
    set: vi.fn(async(obj: Record<string, any>) => {
      await tick();
      Object.assign(values, structuredClone(obj));
    }),
    delete: vi.fn(async(key: string) => {
      await tick();
      delete values[key];
    })
  };
});

vi.mock('@lib/sessionStorage', () => ({default: storage}));
vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({default: {isUsingPasscode: async() => true}}));

import AccountController from '@lib/accounts/accountController';

describe('AccountController.update', () => {
  beforeEach(() => {
    for(const key in storage.values) delete storage.values[key];
  });

  test('two updates at once both land', async() => {
    await Promise.all([
      AccountController.update(2, {dc2_auth_key: 'aa'}),
      AccountController.update(2, {temp_auth_keys: {'2': {key: 'bb', salt: 'cc', expiresAt: 1, permKeyId: 'dd'}}}),
      AccountController.update(2, {dcId: 2})
    ]);

    expect(storage.values.account2).toMatchObject({
      dc2_auth_key: 'aa',
      temp_auth_keys: {'2': {key: 'bb'}},
      dcId: 2
    });
  });

  test('a function sees the data as it is by then, and writes nothing when it returns nothing', async() => {
    const first = AccountController.update(2, {dcId: 4});
    const seen = vi.fn((data) => data.dcId);
    const skipped = AccountController.update(2, (data) => {
      seen(data);
      return undefined;
    });
    await first;
    const sets = storage.set.mock.calls.length;
    await skipped;

    expect(seen).toHaveReturnedWith(4);
    expect(storage.set.mock.calls.slice(sets).some(([obj]) => 'account2' in obj)).toBe(false);
  });

  test('accounts move to other slots only once what is on its way to them has landed', async() => {
    await AccountController.update(1, {userId: 1, dcId: 1});
    await AccountController.update(2, {userId: 2, dcId: 2});
    // * still in flight when account 1 logs out and account 2 moves into its slot
    const late = AccountController.update(2, {temp_auth_keys: {'2': {key: 'bb', salt: 'cc', expiresAt: 1, permKeyId: 'dd'}}});
    await AccountController.shiftAccounts(1);
    await late;

    expect(AccountController.shifting).toBe(true);
    expect(storage.values.account1).toMatchObject({userId: 2, temp_auth_keys: {'2': {key: 'bb'}}});
    expect(storage.values.account2).toBeUndefined();
  });

  test('whenUpdated settles once what was asked for is written', async() => {
    AccountController.update(3, {dcId: 1});
    AccountController.update(3, (data) => ({date: data.dcId + 10}));
    await AccountController.whenUpdated(3);
    expect(storage.values.account3).toMatchObject({dcId: 1, date: 11});
  });
});
