import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import commonStateStorage from '../commonStateStorage';
import sessionStorage from '../sessionStorage';
import {useLockScreenHotReloadGuard} from '../solidjs/hotReloadGuard';

import DeferredIsUsingPasscode from './deferredIsUsingPasscode';
import EncryptionPasscodeHashStore from './hashStore';
import {compareUint8Arrays, createPasscodeHashAndSalt, hashPasscode} from './utils';


export function usePasscodeActions() {
  const {rootScope, apiManagerProxy} = useLockScreenHotReloadGuard();

  async function enablePasscode(passcode: string) {
    const encryption = await createPasscodeHashAndSalt(passcode);
    const verification = await createPasscodeHashAndSalt(passcode);
    passcode = ''; // forget

    await commonStateStorage.set({
      passcode: {
        verificationHash: verification.hash,
        verificationSalt: verification.salt,
        encryptionSalt: encryption.salt
      }
    });

    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), true);

    rootScope.dispatchEvent('toggle_using_passcode', true); // Probably not needed

    await apiManagerProxy.invoke('toggleUsingPasscode', {
      isUsingPasscode: true,
      encryptionHash: encryption.hash
    });

    // The session storage should first get encrypted in the mtproto worker, then we can use start using the encrypted proxy here
    DeferredIsUsingPasscode.resolveDeferred(true);
    EncryptionPasscodeHashStore.setValue(encryption.hash);

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
    EncryptionPasscodeHashStore.setValue(null);
    DeferredIsUsingPasscode.resolveDeferred(false);
    commonStateStorage.delete('passcode');
  }

  /**
   * Note: Re-encrypts everything with a different hash even if the passcode is the same
   */
  async function changePasscode(passcode: string) {
    const encryption = await createPasscodeHashAndSalt(passcode);
    const verification = await createPasscodeHashAndSalt(passcode);

    passcode = ''; // forget

    const toStore = {
      verificationHash: verification.hash,
      verificationSalt: verification.salt,
      encryptionSalt: encryption.salt
    }

    await apiManagerProxy.invoke('changePasscode', {
      toStore,
      encryptionHash: encryption.hash
    });
    // Just to set local cache, not really needed)
    await commonStateStorage.set({
      passcode: toStore
    });
  }

  async function unlockWithPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.encryptionSalt) throw new Error('No encryption salt found in storage');

    const encryptionHash = await hashPasscode(passcode, passcodeData.encryptionSalt);
    passcode = ''; // forget;

    EncryptionPasscodeHashStore.setValue(encryptionHash);
    apiManagerProxy.invokeVoid('saveEncryptionHash', encryptionHash);
  }

  return {
    enablePasscode,
    isMyPasscode,
    disablePasscode,
    changePasscode,
    unlockWithPasscode
  };
}
