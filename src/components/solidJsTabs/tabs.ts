import {CancellablePromise} from '@helpers/cancellablePromise';
import {AccountPasskeys, Chat, GlobalPrivacySettings, Passkey} from '@layer';
import {LangPackKey} from '@lib/langPack';
import type {PasscodeActions} from '@lib/passcode/actions';
import {InstanceOf} from '@types';
import {SetStoreFunction} from 'solid-js/store';
import {scaffoldSolidJSTab, scaffoldSolidJSTabEventable} from '@components/solidJsTabs/scaffoldSolidJSTab';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';
import rootScope from '@lib/rootScope';
import type {EditProfileTabPayload} from '@components/sidebarLeft/tabs/editProfile';


export const AppPasscodeLockTab =
  scaffoldSolidJSTab({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/passcodeLock/mainTab'),
    onOpenAfterTimeout: async function() {
      // Remove the previous enter password tab
      this.slider.sliceTabsUntilTab(
        SuperTabProvider.allTabs.AppPrivacyAndSecurityTab,
        this
      );
    }
  });


type AppPasscodeEnterPasswordTabPayload = {
  onSubmit: (passcode: string, tab: InstanceOf<typeof AppPasscodeEnterPasswordTab>, passcodeActions: PasscodeActions) => MaybePromise<void>;

  inputLabel: LangPackKey;
  buttonText: LangPackKey;
};

export const AppPasscodeEnterPasswordTab =
  scaffoldSolidJSTab<AppPasscodeEnterPasswordTabPayload>({
    title: 'PasscodeLock.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/passcodeLock/enterPasswordTab')
  });


type AppPrivacyMessagesTabPayload = {
  onSaved: (globalPrivacy: CancellablePromise<GlobalPrivacySettings.globalPrivacySettings>) => void;
};

export const AppPrivacyMessagesTab =
  scaffoldSolidJSTab<AppPrivacyMessagesTabPayload>({
    title: 'PrivacyMessages',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/messages/tab')
  });


type AppDirectMessagesTabPayload = {
  chat: Chat.channel;
};

export const AppDirectMessagesTab =
  scaffoldSolidJSTab<AppDirectMessagesTabPayload>({
    title: 'ChannelDirectMessages.Settings.Title',
    getComponentModule: () => import('../sidebarRight/tabs/channelDirectMessages')
  });


export const AppNotificationsTab =
  scaffoldSolidJSTab({
    title: 'Telegram.NotificationSettingsViewController',
    getComponentModule: () => import('../sidebarLeft/tabs/notifications')
  });


export function getEditProfileInitArgs(): Omit<EditProfileTabPayload, 'focusOn'> {
  return {
    bioMaxLength: rootScope.managers.apiManager.getLimit('bio'),
    user: rootScope.managers.appUsersManager.getSelf(),
    userFull: rootScope.managers.appProfileManager.getProfile(rootScope.myId.toUserId())
  };
}

export const AppEditProfileTab =
  scaffoldSolidJSTab<EditProfileTabPayload>({
    title: 'EditAccount.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/editProfile')
  });
(AppEditProfileTab as any).noSame = true;


export const AppKeyboardShortcutsTab =
  scaffoldSolidJSTab({
    title: 'KeyboardShortcuts.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/keyboardShortcuts')
  });


type AppAdminRecentActionsTabPayload = {
  channelId: ChatId;
  isBroadcast: boolean;
};

export const AppAdminRecentActionsTab =
  scaffoldSolidJSTab<AppAdminRecentActionsTabPayload>({
    title: 'RecentActions',
    getComponentModule: () => import('../sidebarRight/tabs/adminRecentActions')
  });


type AppPasskeysTabPayload = {
  passkeys: Passkey[],
  setPasskeys: SetStoreFunction<Passkey[]>
};

export const AppPasskeysTab =
  scaffoldSolidJSTab<AppPasskeysTabPayload>({
    title: 'Privacy.Passkeys',
    getComponentModule: () => import('../sidebarLeft/tabs/passkeys')
  });

type AppMessagesAutoDeleteTabPayload = {
  period: number;
  onSaved: (period: number) => void;
};

export const AppMessagesAutoDeleteTab =
  scaffoldSolidJSTab<AppMessagesAutoDeleteTabPayload>({
    title: 'AutoDeleteMessages',
    getComponentModule: () => import('../sidebarLeft/tabs/autoDeleteMessages')
  });

export const AppArchiveSettingsTab =
  scaffoldSolidJSTab({
    title: 'ArchiveSettings',
    getComponentModule: () => import('../sidebarLeft/tabs/archiveSettingsTab')
  });

export const AppGeneralSettingsTab =
  scaffoldSolidJSTab({
    title: 'Telegram.GeneralSettingsViewController',
    getComponentModule: () => import('../sidebarLeft/tabs/generalSettings')
  });


export const AppChatBackgroundTab =
  scaffoldSolidJSTab({
    title: 'ChatBackground',
    getComponentModule: () => import('../sidebarLeft/tabs/background')
  });


export const AppLanguageTab =
  scaffoldSolidJSTab({
    title: 'Telegram.LanguageViewController',
    getComponentModule: () => import('../sidebarLeft/tabs/language')
  });


export const AppSpeakersAndCameraTab =
  scaffoldSolidJSTab({
    title: 'AccountSettings.SpeakersAndCamera',
    getComponentModule: () => import('../sidebarLeft/tabs/speakersAndCamera')
  });


export const AppSettingsTab =
  scaffoldSolidJSTab({
    title: 'Settings',
    getComponentModule: () => import('../sidebarLeft/tabs/settings')
  });


export const AppQuickReactionTab =
  scaffoldSolidJSTab({
    title: 'DoubleTapSetting',
    getComponentModule: () => import('../sidebarLeft/tabs/quickReaction')
  });


export const AppPowerSavingTab =
  scaffoldSolidJSTab({
    title: 'LiteMode.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/powerSaving')
  });


type AppBlockedUsersTabPayload = {
  peerIds: PeerId[];
};

export const AppBlockedUsersTab =
  scaffoldSolidJSTab<AppBlockedUsersTabPayload>({
    title: 'BlockedUsers',
    getComponentModule: () => import('../sidebarLeft/tabs/blockedUsers'),
    onOpenAfterTimeout: function() {
      this.scrollable.onScroll();
    }
  });


export const AppNewChannelTab =
  scaffoldSolidJSTab({
    title: 'NewChannel',
    getComponentModule: () => import('../sidebarLeft/tabs/newChannel')
  });
(AppNewChannelTab as any).noSame = true;


export const AppBackgroundColorTab =
  scaffoldSolidJSTab({
    title: 'SetColor',
    getComponentModule: () => import('../sidebarLeft/tabs/backgroundColor')
  });


// ─── Privacy sub-tabs (eventable: PrivacySection saves on the tab's destroy event) ───

export const AppPrivacyAboutTab =
  scaffoldSolidJSTabEventable({
    title: 'UserBio',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/about')
  });

export const AppPrivacyCallsTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacySettings.VoiceCalls',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/calls')
  });

export const AppPrivacyVoicesTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacyVoiceMessages',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/voices')
  });

export const AppPrivacyAddToGroupsTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacySettings.Groups',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/addToGroups')
  });

export const AppPrivacyBirthdayTab =
  scaffoldSolidJSTabEventable({
    title: 'Birthday',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/birthday')
  });

export const AppPrivacyForwardMessagesTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacySettings.Forwards',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/forwardMessages')
  });

export const AppPrivacyProfilePhotoTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacyProfilePhoto',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/profilePhoto')
  });

export const AppPrivacySavedMusicTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacySavedMusic',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/savedMusic')
  });

export const AppPrivacyPhoneNumberTab =
  scaffoldSolidJSTabEventable({
    title: 'PrivacyPhone',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/phoneNumber')
  });

type AppPrivacyGlobalTabEvents = {
  privacy: (globalPrivacy: Promise<GlobalPrivacySettings>) => void
};

export const AppPrivacyLastSeenTab =
  scaffoldSolidJSTabEventable<GlobalPrivacySettings, AppPrivacyGlobalTabEvents>({
    title: 'PrivacyLastSeen',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/lastSeen')
  });

export const AppPrivacyGiftsTab =
  scaffoldSolidJSTabEventable<GlobalPrivacySettings, AppPrivacyGlobalTabEvents>({
    title: 'PrivacyGifts',
    getComponentModule: () => import('../sidebarLeft/tabs/privacy/gifts')
  });


export type AppAddMembersExtraCategory = {
  key: string;
  icon: Icon;
  text: LangPackKey;
  statusLangKey?: LangPackKey;
};

type AppAddMembersTabPayload = {
  title: LangPackKey;
  placeholder: LangPackKey;
  type: 'channel' | 'chat' | 'privacy';
  takeOut?: (peerIds: PeerId[], extras?: Set<string>) => Promise<any> | false | void;
  skippable: boolean;
  selectedPeerIds?: PeerId[];
  selectedExtras?: Set<string>;
  extraCategories?: ReadonlyArray<AppAddMembersExtraCategory>;
  extraCategoriesSectionLangKey?: LangPackKey;
  attachToPromise?: (promise: Promise<any>) => void;
};

export const AppAddMembersTab =
  scaffoldSolidJSTab<AppAddMembersTabPayload>({
    title: 'GroupAddMembers',
    getComponentModule: () => import('../sidebarLeft/tabs/addMembers')
  });
(AppAddMembersTab as any).noSame = true;
const _origAddMembersInit = (AppAddMembersTab.prototype as any).init;
(AppAddMembersTab.prototype as any).init = function(payload: AppAddMembersTabPayload, overrideTitle?: LangPackKey) {
  return _origAddMembersInit.call(this, payload, overrideTitle || payload.title);
};
