import {describe, expect, it, vi} from 'vitest';
import {ApiFileManager} from '@appManagers/apiFileManager';
import EventListenerBase from '@helpers/eventListenerBase';

/**
 * The upload limit is Premium's (4 GB) or the default one (2 GB), in parts of the app config. Premium bought (or gone)
 * in the session changes it at once: before, it changed only with the next app config, which the session may never
 * ask for again, so a file over 2 GB was refused locally (FILE_TOO_BIG) right after buying Premium.
 */
const APP_CONFIG = {
  upload_max_fileparts_default: 4000,
  upload_max_fileparts_premium: 8000
} as MTAppConfig;

function makeFileManager() {
  const rootScope = Object.assign(new EventListenerBase<{
    app_config: (appConfig: MTAppConfig) => void,
    premium_toggle: (isPremium: boolean) => Promise<void>
  }>(), {premium: false});
  const dispatch = (name: 'app_config' | 'premium_toggle', arg: any) => Promise.all(rootScope.dispatchResultableEvent(name, arg));

  const fileManager = Object.create(ApiFileManager.prototype) as ApiFileManager;
  Object.assign(fileManager as any, {
    rootScope,
    apiManager: {getAppConfig: vi.fn(() => Promise.resolve(APP_CONFIG))}
  });
  (fileManager as any).after();

  const getMaxUploadParts = (): number => (fileManager as any).maxUploadParts;
  return {rootScope, dispatch, getMaxUploadParts};
}

describe('the upload limit', () => {
  it('follows the app config by the account\'s Premium', async() => {
    const {rootScope, dispatch, getMaxUploadParts} = makeFileManager();
    await dispatch('app_config', APP_CONFIG);
    expect(getMaxUploadParts()).toBe(4000);

    rootScope.premium = true;
    await dispatch('app_config', APP_CONFIG);
    expect(getMaxUploadParts()).toBe(8000);
  });

  it('changes as soon as Premium is bought or gone', async() => {
    const {rootScope, dispatch, getMaxUploadParts} = makeFileManager();
    await dispatch('app_config', APP_CONFIG);

    rootScope.premium = true;
    await dispatch('premium_toggle', true);
    expect(getMaxUploadParts()).toBe(8000);

    rootScope.premium = false;
    await dispatch('premium_toggle', false);
    expect(getMaxUploadParts()).toBe(4000);
  });
});
