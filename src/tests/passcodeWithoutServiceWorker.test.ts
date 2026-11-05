// Without a service worker (none in the browser, ?noServiceWorker=1) the app runs on, only `apiManagerProxy` has no
// `serviceMessagePort` - there is nothing there to tell. Turning the passcode on, changing it, off, or unlocking with
// it tells the service worker too when there is one, and goes on without it when there is none: stopped half way,
// turning it on left it on, with nothing encrypted and the plain copy of the auth keys left in localStorage - and
// every unlock after it failed, the passcode taken for a wrong one.

const fakes = vi.hoisted(() => ({
  apiManagerProxy: {
    invoke: vi.fn(async(..._args: any[]): Promise<any> => undefined),
    invokeVoid: vi.fn(),
    serviceMessagePort: undefined as any
  },
  rootScope: {dispatchEvent: vi.fn()},
  stored: {} as Record<string, any>,
  setAppSettings: vi.fn(async() => {}),
  updateStorageForLegacy: vi.fn(async() => {})
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useLockScreenHotReloadGuard: () => ({rootScope: fakes.rootScope, apiManagerProxy: fakes.apiManagerProxy})
}));
vi.mock('@stores/appSettings', () => ({
  useAppSettings: () => [{}, fakes.setAppSettings]
}));
vi.mock('@lib/commonStateStorage', () => ({
  default: {
    set: async(values: Record<string, any>) => Object.assign(fakes.stored, values),
    get: async(key: string) => fakes.stored[key],
    delete: async(key: string) => delete fakes.stored[key]
  }
}));
vi.mock('@lib/files/cacheStorage', () => ({
  default: {temporarilyToggle: vi.fn(), clearEncryptableStorages: vi.fn(async() => {}), resetOpenEncryptableCacheStorages: vi.fn()}
}));
vi.mock('@lib/accounts/accountController', () => ({
  default: {updateStorageForLegacy: fakes.updateStorageForLegacy, get: vi.fn(async() => ({}))}
}));

import {usePasscodeActions} from '@lib/passcode/actions';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import noop from '@helpers/noop';
import deferred from '@/tests/helpers/deferred';

const asked = () => fakes.apiManagerProxy.invoke.mock.calls.map(([type]) => type);
// * what turning the passcode on tells the worker, and the service worker when there is one
const TURNING_ON = ['toggleCacheStorage', 'resetEncryptableCacheStorages', 'toggleUsingPasscode', 'toggleCacheStorage'];

describe('the passcode without a service worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.apiManagerProxy.invoke.mockReset();
    fakes.apiManagerProxy.serviceMessagePort = undefined;
    for(const key in fakes.stored) delete fakes.stored[key];
  });

  test('is turned on whole: the storages are encrypted and the plain copy of the auth keys goes', async() => {
    await usePasscodeActions().enablePasscode('1234');

    expect(asked()).toEqual(TURNING_ON);
    expect(EncryptionKeyStore.getUndeferred()).toBeTruthy();
    expect(fakes.updateStorageForLegacy).toHaveBeenCalledWith(null);
  });

  test('unlocks with it', async() => {
    const actions = usePasscodeActions();
    await actions.enablePasscode('1234');

    expect(await actions.isMyPasscode('1234')).toBe(true);
    await actions.unlockWithPasscode('1234');
    expect(fakes.apiManagerProxy.invokeVoid).toHaveBeenCalledWith('toggleLockOthers', false);
  });

  test('is changed and turned off', async() => {
    const actions = usePasscodeActions();
    await actions.enablePasscode('1234');

    await actions.changePasscode('5678');
    expect(await actions.isMyPasscode('5678')).toBe(true);

    await actions.disablePasscode();
    expect(fakes.stored.passcode).toBeUndefined();
  });

  test('tells the service worker as well when there is one', async() => {
    const serviceMessagePort = {invoke: vi.fn(async(..._args: any[]): Promise<any> => undefined)};
    fakes.apiManagerProxy.serviceMessagePort = serviceMessagePort;

    await usePasscodeActions().enablePasscode('1234');
    expect(serviceMessagePort.invoke.mock.calls.map(([type]) => type)).toEqual(TURNING_ON);
  });

  // * removed as the last step before, it stayed in localStorage when a step after the encryption did not finish (the
  // * service worker failing, the tab closed), and nothing removed it with the passcode on
  test('the plain copy of the auth keys goes once the worker has the accounts encrypted, never before', async() => {
    const encrypted = deferred();
    fakes.apiManagerProxy.invoke.mockImplementation(async(type: string) => type === 'toggleUsingPasscode' ? encrypted.promise : undefined);
    fakes.apiManagerProxy.serviceMessagePort = {
      invoke: vi.fn(async(type: string) => {
        if(type === 'toggleUsingPasscode') throw new Error('the service worker is gone');
      })
    };

    const enabling = usePasscodeActions().enablePasscode('1234');
    enabling.catch(noop);
    await vi.waitFor(() => expect(asked()).toContain('toggleUsingPasscode'), {timeout: 5000});
    expect(fakes.updateStorageForLegacy).not.toHaveBeenCalled();

    encrypted.resolve();
    await expect(enabling).rejects.toThrow('the service worker is gone');
    expect(fakes.updateStorageForLegacy).toHaveBeenCalledWith(null);
  });

  test('the plain copy stays when the worker could not encrypt the accounts', async() => {
    fakes.apiManagerProxy.invoke.mockImplementation(async(type: string) => {
      if(type === 'toggleUsingPasscode') throw new Error('the worker failed');
    });

    await expect(usePasscodeActions().enablePasscode('1234')).rejects.toThrow('the worker failed');
    expect(fakes.updateStorageForLegacy).not.toHaveBeenCalled();
  });
});
