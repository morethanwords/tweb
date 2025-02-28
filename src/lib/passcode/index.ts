import convertToUint8Array from '../../helpers/bytes/convertToUint8Array';
import {joinDeepPath} from '../../helpers/object/setDeepProperty';

import commonStateStorage from '../commonStateStorage';
import sha256 from '../crypto/utils/sha256';
import {useHotReloadGuard} from '../solidjs/hotReloadGuard';

export const MAX_PASSCODE_LENGTH = 12;

function useInitPasscode() {
  const {rootScope} = useHotReloadGuard();

  return async function(passcode: string) {
    await savePasscodeHashToStorage(passcode);
    passcode = ''; // forget
    await rootScope.managers.appStateManager.setByKey(joinDeepPath('settings', 'passcode', 'enabled'), true);
    rootScope.dispatchEvent('toggle_using_passcode', true);
  }
}

// TODO: Handle errors?

async function savePasscodeHashToStorage(passcode: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltedPasscode = new Uint8Array([...convertToUint8Array(passcode), ...salt]);
  passcode = ''; // forget
  const hash = await sha256(saltedPasscode);

  await commonStateStorage.set({
    passcode: {
      salt,
      hash
    }
  });
}
