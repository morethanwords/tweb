import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import commonStateStorage from '../commonStateStorage';
import sha256 from '../crypto/utils/sha256';
import {useHotReloadGuard} from '../solidjs/hotReloadGuard';
import EncryptionPasscodeHashStore from './hashStore';

export const MAX_PASSCODE_LENGTH = 12;

const SALT_LENGTH = 16;

export function usePasscodeActions() {
  const {rootScope, apiManagerProxy} = useHotReloadGuard();

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
    rootScope.dispatchEvent('toggle_using_passcode', true);
    apiManagerProxy.invokeVoid('toggleUsingPasscode', {
      isUsingPasscode: true,
      encryptionHash: encryption.hash
    });
  }

  async function isMyPasscode(passcode: string) {
    const passcodeData = await commonStateStorage.get('passcode', false);
    if(!passcodeData?.verificationHash || !passcodeData?.verificationSalt) return false;

    const hashed = await hashPasscode(passcode, passcodeData.verificationSalt);
    passcode = ''; // forget

    return compareUint8Arrays(hashed, passcodeData.verificationHash);
  }

  async function disablePasscode() {
    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), false);
    rootScope.dispatchEvent('toggle_using_passcode', false);
    apiManagerProxy.invokeVoid('toggleUsingPasscode', {isUsingPasscode: false});
    await commonStateStorage.delete('passcode');
  }

  async function changePasscode(passcode: string) {
    const encryption = await createPasscodeHashAndSalt(passcode);
    const verification = await createPasscodeHashAndSalt(passcode);

    passcode = ''; // forget

    const toStore = {
      verificationHash: verification.hash,
      verificationSalt: verification.salt,
      encryptionSalt: encryption.salt
    }

    // Need to set the values into the store while storages are frozen!
    await apiManagerProxy.invoke('changePasscode', {
      toStore,
      encryptionHash: encryption.hash
    });
    // Just to set local cache, not really needed)
    await commonStateStorage.set({
      passcode: toStore
    });
  }

  async function sendEncryptionHashToProcesses(encryptionHash: Uint8Array) {
    EncryptionPasscodeHashStore.setValue(encryptionHash);
    apiManagerProxy.invokeVoid('saveEncryptionHash', encryptionHash); // Needed when unlocking the app
    // apiManagerProxy.serviceMessagePort.invokeVoid('')
  }


  return {
    enablePasscode,
    isMyPasscode,
    disablePasscode,
    changePasscode
  };
}

// TODO: Handle errors?

function compareUint8Arrays(arr1: Uint8Array, arr2: Uint8Array) {
  return arr1.length === arr2.length && arr1.every((value, index) => value === arr2[index]);
}

function hashPasscode(passcode: string, salt: Uint8Array) {
  const saltedPasscode = new Uint8Array([...convertToUint8Array(passcode), ...salt]);
  passcode = ''; // forget
  return sha256(saltedPasscode);
}

async function createPasscodeHashAndSalt(passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await hashPasscode(passcode, salt);
  passcode = ''; // forget

  return {salt, hash};
}


// async function savePasscodeHashToStorage(passcode: string) {
//   const encryption = await createPasscodeHashAndSalt(passcode);
//   const verification = await createPasscodeHashAndSalt(passcode);
//   passcode = ''; // forget

//   await commonStateStorage.set({
//     passcode: {
//       verificationHash: verification.hash,
//       verificationSalt: verification.salt,
//       encryptionSalt: encryption.salt
//     }
//   });

//   return encryption.hash;
// }
