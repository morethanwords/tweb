import {createTestClient, AccountSeed} from './harness';
import {readFileSync} from 'fs';
import pause from '@helpers/schedulers/pause';

// Perfect Forward Secrecy against the real server (Modes.pfs): every request
// goes over a temporary key bound to the stored permanent one.
//
//   TG_API_PFS=1 TG_API_PROD_DC=1 TG_API_SEED=./tmp/preview-sessions/<id>.json \
//     pnpm test src/tests/api/pfs.test.ts -- --silent=false
//
// The seed must not be live anywhere else (see AUTH_KEY_DUPLICATED in the
// harness notes). The fresh-DC case needs no seed.

const ENABLED = process.env.TG_API_PFS === '1';
const seedPath = process.env.TG_API_SEED;
const testDc = process.env.TG_API_PROD_DC !== '1';
const describeOrSkip = ENABLED ? describe : describe.skip;

type Client = Awaited<ReturnType<typeof createTestClient>>;

async function createPfsClient(seed: AccountSeed, accountNumber: 1 | 2) {
  const Modes = (await import('@config/modes')).default;
  Modes.pfs = true;

  const client = await createTestClient({seed, accountNumber, testDc});
  // * a stray 401/406 would log the seed out on every DC
  (client.managers.apiManager as any).logOut = () => console.warn('  logOut suppressed');
  return client;
}

function getState(client: Client, dcId: number, media?: boolean) {
  const apiManager = client.apiManager as any;
  return {
    tempAuthKeys: apiManager.tempAuthKeys[`${dcId}${media ? '-media' : ''}`],
    networker: apiManager.cachedNetworkers.websocket[media ? 'download' : 'client'][dcId][0]
  };
}

function expectTemporaryAuthKey(client: Client, networker: any) {
  expect(networker.authKey).not.toBe(networker.permAuthKey);
  expect(networker.authKey.expiresAt).toBeGreaterThan(client.managers.timeManager.getServerTime());
}

describeOrSkip('PFS against the server', () => {
  test('an authorized account talks over a bound temporary key', async() => {
    if(!seedPath) {
      console.warn('  no TG_API_SEED, skipping');
      return;
    }

    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as AccountSeed;
    const client = await createPfsClient(seed, 1);

    // * an unbound temporary key would be an unauthorized one: 401 here
    const expectSelf = async() => {
      const users: any[] = await client.apiManager.invokeApi('users.getUsers', {id: [{_: 'inputUserSelf'}]});
      expect(String(users[0].id)).toBe(String(seed.userId));
    };

    await expectSelf();
    const {tempAuthKeys, networker} = getState(client, seed.dcId);
    const firstKey = networker.authKey;
    expect(tempAuthKeys).toBeDefined();
    expectTemporaryAuthKey(client, networker);

    // * the server forgets the key: -404, a new key, the request goes again
    networker.wrapMtpCall('destroy_auth_key', {}, {notContentRelated: true, canCleanup: true});
    await pause(1500);
    await expectSelf();
    const secondKey = networker.authKey;
    expect(secondKey).not.toBe(firstKey);
    expect(firstKey.invalid).toBe(true);

    // * an expired key is left for a new one
    secondKey.expiresAt = client.managers.timeManager.getServerTime() - 1;
    await expectSelf();
    expect(networker.authKey).not.toBe(secondKey);

    // * file connections go to the media cluster, which has keys of its own
    const nearestDc: any = await client.apiManager.invokeApi('help.getNearestDc', {}, {dcId: seed.dcId, fileDownload: true});
    expect(nearestDc._).toBe('nearestDc');
    const media = getState(client, seed.dcId, true);
    expectTemporaryAuthKey(client, media.networker);
    expect(media.networker.authKey).not.toBe(networker.authKey);
    expect(media.networker.authKey).toBe(media.tempAuthKeys.authKey);
  }, 120_000);

  test('a DC with no key yet gets a permanent one, then temporary ones', async() => {
    const dcId = 2;
    const client = await createPfsClient({userId: 0, dcId, authKeys: {}}, 2);

    const nearestDc: any = await client.apiManager.invokeApi('help.getNearestDc', {}, {dcId});
    expect(nearestDc._).toBe('nearestDc');

    const AccountController = (await import('@lib/accounts/accountController')).default;
    expect((await AccountController.get(2))[`dc${dcId}_auth_key`]).toHaveLength(512);
    expectTemporaryAuthKey(client, getState(client, dcId).networker);
  }, 120_000);
});
