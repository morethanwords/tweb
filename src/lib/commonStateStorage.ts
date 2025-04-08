import {LangPackDifference} from '../layer';
import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import {MOUNT_CLASS_TO} from '../config/debug';
import {StateSettings} from '../config/state';

import AppStorage from './storage';
import {ActiveAccountNumber} from './accounts/types';
import DeferredIsUsingPasscode from './passcode/deferredIsUsingPasscode';

export type PasscodeStorageValue = {
  /**
   * Have different random hash salt per user to prevent precomputed attacks
   *
   * Used to randomize the verification hash
   */
  verificationSalt: Uint8Array;
  /**
   * Hash used just to verify whether the passcode is correct, the hash for encryption will not be stored anywhere except in memory
   */
  verificationHash: Uint8Array;
  /**
   * Salt used for getting a cryptographic key derived from passcode that will be used for encryption (instead of passing raw passcode between processes)
   *
   * Used to randomize the encryption per user
   */
  encryptionSalt: Uint8Array;
};

type AppStorageValue = {
  langPack: LangPackDifference;
  settings: StateSettings;
  notificationsCount: Partial<Record<ActiveAccountNumber, number>>;
  passcode: PasscodeStorageValue;
};

class CommonStateStorage extends AppStorage<AppStorageValue, CommonDatabase> {
  constructor() {
    super(getCommonDatabaseState(), 'session');
  }
}

const commonStateStorage = new CommonStateStorage();

commonStateStorage.get('settings', false).then((settings) => {
  DeferredIsUsingPasscode.resolveDeferred(settings?.passcode?.enabled || false);
});

MOUNT_CLASS_TO.commonStateStorage = commonStateStorage;
export default commonStateStorage;
