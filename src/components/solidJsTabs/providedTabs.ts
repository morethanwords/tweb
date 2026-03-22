import type AppNewGroupTab from '@components/sidebarLeft/tabs/newGroup';
import AppPrivacyAndSecurityTab from '@components/sidebarLeft/tabs/privacyAndSecurity';
import AppUserPermissionsTab from '@components/sidebarRight/tabs/userPermissions';
import {AppAddMembersTab, AppNotificationsTab, AppPasscodeEnterPasswordTab, AppPasscodeLockTab} from '@components/solidJsTabs/tabs';


export type ProvidedTabs = {
  AppPasscodeLockTab: typeof AppPasscodeLockTab;
  AppPasscodeEnterPasswordTab: typeof AppPasscodeEnterPasswordTab;
  AppNotificationsTab: typeof AppNotificationsTab;
  AppAddMembersTab: typeof AppAddMembersTab;
  AppPrivacyAndSecurityTab: typeof AppPrivacyAndSecurityTab;
  AppUserPermissionsTab: typeof AppUserPermissionsTab;

  // Other non solid-js tabs
  AppNewGroupTab: typeof AppNewGroupTab;
};

/**
 * To avoid circular imports, other tabs should be assigned elsewhere in the app (they can be assigned in the module of the tab itself)
 */
export const providedTabs = {
  AppPasscodeLockTab,
  AppPasscodeEnterPasswordTab,
  AppNotificationsTab,
  AppAddMembersTab,
  AppPrivacyAndSecurityTab,
  AppUserPermissionsTab

  // Others to be assigned...
} as ProvidedTabs;
