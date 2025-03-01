import {LangPackDifference} from '../layer';
import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import {MOUNT_CLASS_TO} from '../config/debug';
import {StateSettings} from '../config/state';

import AppStorage from './storage';
import {ActiveAccountNumber} from './accounts/types';
import DeferredIsUsingPasscode from './passcode/deferred';
import PasscodeHashFetcher from './passcode/hashFetcher';

type AppStorageValue = {
  langPack: LangPackDifference;
  settings: StateSettings;
  notificationsCount: Partial<Record<ActiveAccountNumber, number>>;
  passcode: {
    salt: Uint8Array; // Have different salt per user to prevent precomputed attacks
    hash: Uint8Array;
  };
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

PasscodeHashFetcher.fetchHash = async() => {
  const passcode = await commonStateStorage.get('passcode', false);
  return passcode.hash;
}

MOUNT_CLASS_TO.commonStateStorage = commonStateStorage;
export default commonStateStorage;
