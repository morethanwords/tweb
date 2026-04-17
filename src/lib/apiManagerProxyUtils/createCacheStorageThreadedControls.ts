import type apiManagerProxy from '@lib/apiManagerProxy';
import CacheStorageController, {CacheStorageDbName} from '@lib/files/cacheStorage';
import {logger} from '@lib/logger';

type CreateCacheStorageThreadedControlsArgs = {
  apiManagerProxy: typeof apiManagerProxy;
};

const log = logger('createCacheStorageThreadedControls');

export type CacheStorageThreadedControls = ReturnType<typeof createCacheStorageThreadedControls>;

export function createCacheStorageThreadedControls({apiManagerProxy}: CreateCacheStorageThreadedControlsArgs) {
  const invokeServiceWorkerIfAvailable = (method: 'disableCacheStoragesByNames' | 'enableCacheStoragesByNames' | 'resetOpenCacheStoragesByNames', names: CacheStorageDbName[]) => {
    const serviceMessagePort = apiManagerProxy.serviceMessagePort;
    if(!serviceMessagePort) {
      return Promise.resolve();
    }

    return serviceMessagePort.invoke(method, names);
  };

  const disableCacheStoragesOnAllThreads = async(names: CacheStorageDbName[]) => {
    CacheStorageController.temporarilyToggleByNames(names, false);
    await Promise.all([
      apiManagerProxy.invoke('disableCacheStoragesByNames', names),
      invokeServiceWorkerIfAvailable('disableCacheStoragesByNames', names)
    ]);
  };

  const enableCacheStoragesOnAllThreads = async(names: CacheStorageDbName[]) => {
    CacheStorageController.temporarilyToggleByNames(names, true);
    await Promise.all([
      apiManagerProxy.invoke('enableCacheStoragesByNames', names),
      invokeServiceWorkerIfAvailable('enableCacheStoragesByNames', names)
    ]);
  };

  const resetCacheStoragesOnAllThreads = async(names: CacheStorageDbName[]) => {
    CacheStorageController.resetOpenStoragesByNames(names);
    await Promise.all([
      apiManagerProxy.invoke('resetOpenCacheStoragesByNames', names),
      invokeServiceWorkerIfAvailable('resetOpenCacheStoragesByNames', names)
    ]);
  };

  const clearCacheStoragesByNames = async(names: CacheStorageDbName[]) => {
    log('clearCacheStoragesByNames', names);

    await disableCacheStoragesOnAllThreads(names);

    await CacheStorageController.clearStoragesByNames(names);

    await resetCacheStoragesOnAllThreads(names);
    await enableCacheStoragesOnAllThreads(names);

    log('finished clearCacheStoragesByNames', names);
  };

  return {
    disableCacheStoragesOnAllThreads,
    enableCacheStoragesOnAllThreads,
    resetCacheStoragesOnAllThreads,
    clearCacheStoragesByNames
  };
}
