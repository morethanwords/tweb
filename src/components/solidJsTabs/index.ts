import {providedTabs} from '@components/solidJsTabs/providedTabs';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';
import {
  AppDirectMessagesTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab,
  AppPasskeysTab
} from '@components/solidJsTabs/tabs';


SuperTabProvider.allTabs = providedTabs;


export {providedTabs};

export {
  AppDirectMessagesTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab,
  AppPasskeysTab
};
