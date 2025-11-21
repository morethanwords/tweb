import type AppAddMembersTab from '../sidebarLeft/tabs/addMembers';
import type AppPrivacyAndSecurityTab from '../sidebarLeft/tabs/privacyAndSecurity';
import {AppPasscodeLockTab, AppPasscodeEnterPasswordTab, AppNotificationsTab} from './tabs';


export type ProvidedTabs = {
  AppPasscodeLockTab: typeof AppPasscodeLockTab;
  AppPasscodeEnterPasswordTab: typeof AppPasscodeEnterPasswordTab;
  AppNotificationsTab: typeof AppNotificationsTab;

  // Other non solid-js tabs
  AppPrivacyAndSecurityTab: typeof AppPrivacyAndSecurityTab;
  AppAddMembersTab: typeof AppAddMembersTab;
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
