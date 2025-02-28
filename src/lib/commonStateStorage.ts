import {LangPackDifference} from '../layer';
import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import {MOUNT_CLASS_TO} from '../config/debug';
import {StateSettings} from '../config/state';

import AppStorage from './storage';
import {ActiveAccountNumber} from './accounts/types';

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
MOUNT_CLASS_TO.commonStateStorage = commonStateStorage;
export default commonStateStorage;
