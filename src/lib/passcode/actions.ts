import compareUint8Arrays from '../../helpers/bytes/compareUint8Arrays';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import AccountController from '../accounts/accountController';
import commonStateStorage from '../commonStateStorage';
import {useLockScreenHotReloadGuard} from '../solidjs/hotReloadGuard';

import DeferredIsUsingPasscode from './deferredIsUsingPasscode';
import EncryptionKeyStore from './keyStore';
import {createEncryptionArtifactsFromPasscode, deriveKey, hashPasscode} from './utils';


export function usePasscodeActions() {
  const {rootScope, apiManagerProxy} = useLockScreenHotReloadGuard();

  async function enablePasscode(passcode: string) {
    const {verificationHash, verificationSalt, encryptionSalt, encryptionKey} =
      await createEncryptionArtifactsFromPasscode(passcode);

    passcode = ''; // forget

    await commonStateStorage.set({
      passcode: {
        verificationHash,
        verificationSalt,
        encryptionSalt
      }
    });

    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), true);

    rootScope.dispatchEvent('toggle_using_passcode', true); // Probably not needed

    await apiManagerProxy.invoke('toggleUsingPasscode', {
      isUsingPasscode: true,
      encryptionKey
    });

    // The session storage should first get encrypted in the mtproto worker, then we can use start using the encrypted proxy here
    DeferredIsUsingPasscode.resolveDeferred(true);
    EncryptionKeyStore.save(encryptionKey);

    await AccountController.updateStorageForLegacy(null); // remove access keys from unencrypted local storage

    // TODO: Tell other window clients that encryption is enabled
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
    await apiManagerProxy.invoke('toggleUsingPasscode', {isUsingPasscode: false});
    // sessionStorage.decryptEncryptable();
    EncryptionKeyStore.save(null);
    DeferredIsUsingPasscode.resolveDeferred(false);
    commonStateStorage.delete('passcode');
  }

  /**
   * Note: Re-encrypts everything with a different hash even if the passcode is the same
   */
  async function changePasscode(passcode: string) {
    const {verificationHash, verificationSalt, encryptionSalt, encryptionKey} =
      await createEncryptionArtifactsFromPasscode(passcode);
    passcode = ''; // forget

    const toStore = {
      verificationHash,
      verificationSalt,
      encryptionSalt
    }

    await apiManagerProxy.invoke('changePasscode', {
      toStore,
      encryptionKey
    });
    // Just to set local cache, not really needed)
    await commonStateStorage.set({
      passcode: toStore
    }, true);
  }

  async function unlockWithPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.encryptionSalt) throw new Error('No encryption salt found in storage');

    const encryptionKey = await deriveKey(passcode, passcodeData.encryptionSalt);
    passcode = ''; // forget;

    EncryptionKeyStore.save(encryptionKey);
    await apiManagerProxy.invoke('saveEncryptionKey', encryptionKey);
    apiManagerProxy.invokeVoid('toggleLockOthers', false);
  }

  return {
    enablePasscode,
    isMyPasscode,
    disablePasscode,
    changePasscode,
    unlockWithPasscode
  };
}
