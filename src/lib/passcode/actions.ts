import compareUint8Arrays from '../../helpers/bytes/compareUint8Arrays';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import AccountController from '../accounts/accountController';
import commonStateStorage from '../commonStateStorage';
import CacheStorageController from '../files/cacheStorage';
import {useLockScreenHotReloadGuard} from '../solidjs/hotReloadGuard';

import DeferredIsUsingPasscode from './deferredIsUsingPasscode';
import EncryptionKeyStore from './keyStore';
import {createEncryptionArtifactsForPasscode, deriveEncryptionKey, hashPasscode} from './utils';

export type PasscodeActions = ReturnType<typeof usePasscodeActions>;

export function usePasscodeActions() {
  const {rootScope, apiManagerProxy} = useLockScreenHotReloadGuard();


  async function disableCacheStorages() {
    CacheStorageController.temporarilyToggle(false);
    await apiManagerProxy.invoke('toggleCacheStorage', false);
    await apiManagerProxy.serviceMessagePort.invoke('toggleCacheStorage', false);
  }

  async function enableCacheStorages() {
    CacheStorageController.temporarilyToggle(true);
    await apiManagerProxy.invoke('toggleCacheStorage', true);
    await apiManagerProxy.serviceMessagePort.invoke('toggleCacheStorage', true);
  }

  async function clearCacheStorages() {
    await CacheStorageController.clearEncryptableStorages();
  }

  async function enablePasscode(passcode: string) {
    const {verificationHash, verificationSalt, encryptionSalt, encryptionKey} =
      await createEncryptionArtifactsForPasscode(passcode);

    passcode = ''; // forget

    await commonStateStorage.set({
      passcode: {
        verificationHash,
        verificationSalt,
        encryptionSalt
      }
    });

    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), true);

    await disableCacheStorages();
    await clearCacheStorages();

    const togglePayload = {
      isUsingPasscode: true,
      encryptionKey
    };
    await apiManagerProxy.invoke('toggleUsingPasscode', togglePayload);
    await apiManagerProxy.serviceMessagePort.invoke('toggleUsingPasscode', togglePayload);


    rootScope.dispatchEvent('toggle_using_passcode', true);

    // The session storage should first get encrypted in the mtproto worker, then we can use start using the encrypted proxy here
    DeferredIsUsingPasscode.resolveDeferred(true);
    EncryptionKeyStore.save(encryptionKey);

    await enableCacheStorages();

    await AccountController.updateStorageForLegacy(null); // remove access keys from unencrypted local storage
  }

  async function isMyPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.verificationHash || !passcodeData?.verificationSalt) return false;

    const hashed = await hashPasscode(passcode, passcodeData.verificationSalt);
    passcode = ''; // forget

    return compareUint8Arrays(hashed, passcodeData.verificationHash);
  }

  async function disablePasscode() {
    rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), false);
    rootScope.dispatchEvent('toggle_using_passcode', false);

    await disableCacheStorages();
    await clearCacheStorages();

    await apiManagerProxy.invoke('toggleUsingPasscode', {isUsingPasscode: false});
    await apiManagerProxy.serviceMessagePort.invoke('toggleUsingPasscode', {isUsingPasscode: false});

    EncryptionKeyStore.save(null);
    DeferredIsUsingPasscode.resolveDeferred(false);

    await enableCacheStorages();

    commonStateStorage.delete('passcode');
  }

  /**
   * Note: Re-encrypts everything with a different hash even if the passcode is the same
   */
  async function changePasscode(passcode: string) {
    const {verificationHash, verificationSalt, encryptionSalt, encryptionKey} =
      await createEncryptionArtifactsForPasscode(passcode);
    passcode = ''; // forget

    const toStore = {
      verificationHash,
      verificationSalt,
      encryptionSalt
    }

    await disableCacheStorages();
    await clearCacheStorages();

    await apiManagerProxy.invoke('changePasscode', {
      toStore,
      encryptionKey
    });
    await apiManagerProxy.serviceMessagePort.invoke('saveEncryptionKey', encryptionKey);

    EncryptionKeyStore.save(encryptionKey);

    await enableCacheStorages();
    // Just to set local cache, not really needed)
    await commonStateStorage.set({
      passcode: toStore
    }, true);
  }

  /**
   * Warning! don't call on an unverified password
   */
  async function unlockWithPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.encryptionSalt) throw new Error('No encryption salt found in storage');

    const encryptionKey = await deriveEncryptionKey(passcode, passcodeData.encryptionSalt);
    passcode = ''; // forget;

    EncryptionKeyStore.save(encryptionKey);
    await apiManagerProxy.invoke('saveEncryptionKey', encryptionKey);
    // Make sure we resolve the DeferredIsUsingPasscode as there is no storage available in SW to get the value
    await apiManagerProxy.serviceMessagePort.invoke('toggleUsingPasscode', {isUsingPasscode: true, encryptionKey});

    apiManagerProxy.invokeVoid('toggleLockOthers', false);
    rootScope.dispatchEvent('toggle_locked', false);
  }

  return {
    enablePasscode,
    isMyPasscode,
    disablePasscode,
    changePasscode,
    unlockWithPasscode
  };
}
