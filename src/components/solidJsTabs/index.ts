import {providedTabs} from './providedTabs';
import {SuperTabProvider} from './superTabProvider';
import {
  AppDirectMessagesTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab
} from './tabs';


SuperTabProvider.allTabs = providedTabs;


export {providedTabs};

export {
  AppDirectMessagesTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab
};
