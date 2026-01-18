import type AppAddMembersTab from '@components/sidebarLeft/tabs/addMembers';
import type AppNewGroupTab from '@components/sidebarLeft/tabs/newGroup';
import type AppPrivacyAndSecurityTab from '@components/sidebarLeft/tabs/privacyAndSecurity';
import type AppUserPermissionsTab from '@components/sidebarRight/tabs/userPermissions';
import {AppNotificationsTab, AppPasscodeEnterPasswordTab, AppPasscodeLockTab} from '@components/solidJsTabs/tabs';


export type ProvidedTabs = {
  AppPasscodeLockTab: typeof AppPasscodeLockTab;
  AppPasscodeEnterPasswordTab: typeof AppPasscodeEnterPasswordTab;
  AppNotificationsTab: typeof AppNotificationsTab;

  // Other non solid-js tabs
  AppPrivacyAndSecurityTab: typeof AppPrivacyAndSecurityTab;
  AppAddMembersTab: typeof AppAddMembersTab;
  AppUserPermissionsTab: typeof AppUserPermissionsTab;
  AppNewGroupTab: typeof AppNewGroupTab;
};

/**
 * To avoid circular imports, other tabs should be assigned elsewhere in the app (they can be assigned in the module of the tab itself)
 */
export const providedTabs = {
  AppPasscodeLockTab,
  AppPasscodeEnterPasswordTab,
  AppNotificationsTab

  // Others to be assigned...
} as ProvidedTabs;
