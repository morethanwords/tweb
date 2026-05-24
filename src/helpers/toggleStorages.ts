import CacheStorageController from '@lib/files/cacheStorage';
import AppStorage from '@lib/storage';
import sessionStorage from '@lib/sessionStorage';
import noop from '@helpers/noop';

export default function toggleStorages(enabled: boolean, clearWrite: boolean) {
  return Promise.all([
    AppStorage.toggleStorage(enabled, clearWrite),
    CacheStorageController.toggleStorage(enabled, clearWrite),
    sessionStorage.toggleStorage(enabled, clearWrite)
  ]).then(noop, noop);
}
