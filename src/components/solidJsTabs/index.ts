import {providedTabs} from '@components/solidJsTabs/providedTabs';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';
import {
  AppAddMembersTab,
  AppDirectMessagesTab,
  AppEditProfileTab,
  AppKeyboardShortcutsTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab,
  AppPasskeysTab,
  getEditProfileInitArgs
} from '@components/solidJsTabs/tabs';


SuperTabProvider.allTabs = providedTabs;


export {providedTabs};

export {
  AppAddMembersTab,
  AppDirectMessagesTab,
  AppEditProfileTab,
  AppKeyboardShortcutsTab,
  AppNotificationsTab,
  AppPasscodeEnterPasswordTab,
  AppPasscodeLockTab,
  AppPrivacyMessagesTab,
  AppPasskeysTab,
  getEditProfileInitArgs
};
