import {installNodeEnv} from './nodeEnv';
import {registerInlineCrypto} from './inlineCrypto';

export type TrueDcSeed = 1 | 2 | 3 | 4 | 5;

export type AccountSeed = {
  userId: number;
  dcId: number;
  authKeys: Partial<Record<TrueDcSeed, {key: string; salt: string; fingerprint?: string}>>;
  timeOffset?: number;
};

export type CreateTestClientOpts = {
  accountNumber?: 1 | 2 | 3 | 4;
  seed: AccountSeed;
  testDc?: boolean;
};

export async function createTestClient(opts: CreateTestClientOpts) {
  const debug = process.env.TG_API_DEBUG === '1';
  const t0 = Date.now();
  const step = (msg: string) => debug && console.log(`[harness +${Date.now() - t0}ms] ${msg}`);

  step('installNodeEnv');
  installNodeEnv();

  step('import @config/modes');
  const Modes = (await import('@config/modes')).default;
  if(opts.testDc) {
    Modes.test = true;
  }

  step('import @config/app');
  const App = (await import('@config/app')).default;
  if(!Number.isFinite(App.id) || !App.hash) {
    throw new Error(
      'createTestClient: VITE_API_ID / VITE_API_HASH are not set. Define them in .env.local before running api tests.'
    );
  }

  const accountNumber = (opts.accountNumber ?? 1) as 1 | 2 | 3 | 4;
  step('polyfills + DeferredIsUsingPasscode');
  await import('@lib/polyfill');
  await import('@helpers/peerIdPolyfill');
  const DeferredIsUsingPasscode = (await import('@lib/passcode/deferredIsUsingPasscode')).default;
  DeferredIsUsingPasscode.resolveDeferred(false);

  step('seedLocalStorage');
  await seedLocalStorage(accountNumber, opts.seed);

  step('registerInlineCrypto');
  registerInlineCrypto();

  step('setEnvironment (stub)');
  const {setEnvironment} = await import('@environment/utils');
  setEnvironment(buildNodeEnvironmentStub() as any);

  step('init MTProtoMessagePort singleton');
  const MTProtoMessagePort = (await import('@lib/mainWorker/mainMessagePort')).default;

  new MTProtoMessagePort<false>();

  step('import managers');
  const AppStateManager = (await import('@appManagers/appStateManager')).default;
  const {AppStoragesManager} = await import('@appManagers/appStoragesManager');
  const createManagers = (await import('@appManagers/createManagers')).default;

  step('new AppStateManager');
  const stateManager = new AppStateManager(accountNumber);
  stateManager.userId = opts.seed.userId as UserId;

  const {STATE_INIT} = await import('@config/state');
  // worker normally hydrates this from the main thread; in node we seed defaults
  (stateManager as any).state = JSON.parse(JSON.stringify(STATE_INIT));

  stateManager.resetStoragesPromise.resolve({
    storages: new Map(),
    refetch: false,
    callback: async() => {}
  });

  step('new AppStoragesManager');
  const appStoragesManager = new AppStoragesManager(accountNumber, stateManager.resetStoragesPromise);

  step('appStoragesManager.loadStorages');
  await appStoragesManager.loadStorages();

  step('createManagers');
  const managers = await createManagers(
    appStoragesManager,
    stateManager,
    accountNumber,
    opts.seed.userId as UserId
  );

  step('createTestClient done');

  return {
    managers,
    apiManager: managers.apiManager,
    dispose() {
      // best-effort cleanup; networker timers will clear when the process exits
    }
  };
}

function buildNodeEnvironmentStub() {
  return {
    CAN_USE_TRANSFERABLES: false,
    IS_APPLE: false,
    IS_APPLE_MOBILE: false,
    IS_APPLE_MX: false,
    IS_ANDROID: false,
    IS_CHROMIUM: false,
    IS_CHROMIUM_92_OR_OLDER: false,
    CHROMIUM_VERSION: 0,
    IS_SAFARI: false,
    IS_FIREFOX: false,
    IS_MOBILE: false,
    IS_MOBILE_SAFARI: false,
    USER_AGENT: 'tweb-node-harness/1.0',
    IS_CALL_SUPPORTED: false,
    IS_CANVAS_FILTER_SUPPORTED: false,
    IS_EMOJI_SUPPORTED: true,
    IS_GEOLOCATION_SUPPORTED: false,
    IS_GROUP_CALL_SUPPORTED: false,
    IS_PARALLAX_SUPPORTED: false,
    IS_SCREEN_SHARING_SUPPORTED: false,
    IS_TOUCH_SUPPORTED: false,
    IS_VIBRATE_SUPPORTED: false,
    IS_OPUS_SUPPORTED: false,
    IS_SHARED_WORKER_SUPPORTED: false,
    IS_WEBP_SUPPORTED: false,
    IS_WEBM_SUPPORTED: false,
    IS_WEBRTC_SUPPORTED: false,
    IS_LIVE_STREAM_SUPPORTED: false,
    IS_VIDEO_SUPPORTED: false,
    IS_H264_SUPPORTED: false,
    IS_H265_SUPPORTED: false,
    IMAGE_MIME_TYPES_SUPPORTED: new Set<string>(),
    MEDIA_MIME_TYPES_SUPPORTED: new Set<string>(),
    VIDEO_MIME_TYPES_SUPPORTED: new Set<string>()
  };
}

async function seedLocalStorage(accountNumber: 1 | 2 | 3 | 4, seed: AccountSeed) {
  const sessionStorage = (await import('@lib/sessionStorage')).default;

  const accountKey = `account${accountNumber}` as const;
  const accountData: any = {
    userId: seed.userId,
    dcId: seed.dcId
  };

  for(const dcIdStr in seed.authKeys) {
    const dcId = Number(dcIdStr) as TrueDcSeed;
    const entry = seed.authKeys[dcId];
    if(!entry) continue;
    accountData[`dc${dcId}_auth_key`] = entry.key;
    accountData[`dc${dcId}_server_salt`] = entry.salt;
    if(dcId === seed.dcId && entry.fingerprint) {
      accountData.auth_key_fingerprint = entry.fingerprint;
    }
  }

  if(!accountData.auth_key_fingerprint) {
    const baseEntry = seed.authKeys[seed.dcId as TrueDcSeed];
    if(baseEntry?.key) {
      accountData.auth_key_fingerprint = baseEntry.key.slice(0, 8);
    }
  }

  await sessionStorage.set({[accountKey]: accountData} as any);

  if(accountNumber === 1) {
    const legacy: any = {};
    for(const dcIdStr in seed.authKeys) {
      const dcId = Number(dcIdStr) as TrueDcSeed;
      const entry = seed.authKeys[dcId];
      if(!entry) continue;
      legacy[`dc${dcId}_auth_key`] = entry.key;
      legacy[`dc${dcId}_server_salt`] = entry.salt;
    }
    legacy.dc = seed.dcId;
    legacy.user_auth = {date: Math.floor(Date.now() / 1000), id: seed.userId, dcID: seed.dcId};
    if(accountData.auth_key_fingerprint) {
      legacy.auth_key_fingerprint = accountData.auth_key_fingerprint;
    }
    await sessionStorage.set(legacy);
  }

  if(seed.timeOffset !== undefined) {
    await sessionStorage.set({server_time_offset: seed.timeOffset});
  }
}
