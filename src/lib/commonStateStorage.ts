import {LangPackDifference} from '../layer';
import {CommonDatabase, getCommonDatabaseState} from '../config/databases/state';
import {MOUNT_CLASS_TO} from '../config/debug';
import {StateSettings} from '../config/state';

import AppStorage from './storage';
import {ActiveAccountNumber} from './accounts/types';

class CommonStateStorage extends AppStorage<
  {
    langPack: LangPackDifference;
    settings: StateSettings;
    notificationsCount: Partial<Record<ActiveAccountNumber, number>>
  },
  CommonDatabase
> {
  constructor() {
    super(getCommonDatabaseState(), 'session');
  }
}

const commonStateStorage = new CommonStateStorage();
MOUNT_CLASS_TO.commonStateStorage = commonStateStorage;
export default commonStateStorage;
