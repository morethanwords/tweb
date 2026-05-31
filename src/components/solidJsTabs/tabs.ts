import {CancellablePromise} from '@helpers/cancellablePromise';
import {AccountPasskeys, Authorization, Chat, GlobalPrivacySettings, Passkey, WebAuthorization} from '@layer';
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


export const AppStickersAndEmojiTab =
  scaffoldSolidJSTab({
    title: 'StickersName',
    getComponentModule: () => import('../sidebarLeft/tabs/stickersAndEmoji')
  });


export const AppContactsTab =
  scaffoldSolidJSTab({
    title: 'Contacts',
    getComponentModule: () => import('../sidebarLeft/tabs/contacts'),
    onOpenAfterTimeout: function() {
      (this as any)._focusOnOpen?.();
    }
  });
(AppContactsTab as any).noSame = true;


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


type AppNewGroupTabPayload = {
  peerIds: PeerId[],
  isGeoChat?: boolean,
  onCreate?: (chatId: ChatId) => void,
  openAfter?: boolean,
  title?: string,
  asChannel?: boolean
};

export const AppNewGroupTab =
  scaffoldSolidJSTab<AppNewGroupTabPayload>({
    title: 'NewGroup',
    getComponentModule: () => import('../sidebarLeft/tabs/newGroup')
  });
(AppNewGroupTab as any).noSame = true;


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


type AppActiveSessionsTabPayload = {
  authorizations: Authorization.authorization[];
};

export const AppActiveSessionsTab =
  scaffoldSolidJSTabEventable<AppActiveSessionsTabPayload>({
    title: 'SessionsTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/activeSessions')
  });

export const AppActiveWebSessionsTab =
  scaffoldSolidJSTabEventable<WebAuthorization[]>({
    title: 'WebSessionsTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/activeWebSessions')
  });


// ─── Data and storage + its auto-download sub-tabs (all eventable) ───

export const AppAutoDownloadPhotoTab =
  scaffoldSolidJSTabEventable({
    title: 'AutoDownloadPhotos',
    getComponentModule: () => import('../sidebarLeft/tabs/autoDownload/photo')
  });

export const AppAutoDownloadVideoTab =
  scaffoldSolidJSTabEventable({
    title: 'AutoDownloadVideos',
    getComponentModule: () => import('../sidebarLeft/tabs/autoDownload/video')
  });

export const AppAutoDownloadFileTab =
  scaffoldSolidJSTabEventable({
    title: 'AutoDownloadFiles',
    getComponentModule: () => import('../sidebarLeft/tabs/autoDownload/file')
  });

export const AppDataAndStorageTab =
  scaffoldSolidJSTabEventable({
    title: 'DataSettings',
    getComponentModule: () => import('../sidebarLeft/tabs/dataAndStorage')
  });


// ─── Right sidebar ───

export const AppRemovedUsersTab =
  scaffoldSolidJSTabEventable<ChatId>({
    title: 'ChannelBlacklist',
    getComponentModule: () => import('../sidebarRight/tabs/removedUsers')
  });

export const AppGifsTab =
  scaffoldSolidJSTab({
    title: 'SearchGifsTitle',
    getComponentModule: () => import('../sidebarRight/tabs/gifs')
  });

export const AppChatRequestsTab =
  scaffoldSolidJSTabEventable<ChatId, {finish: (changedLength: number) => void}>({
    title: 'MemberRequests',
    getComponentModule: () => import('../sidebarRight/tabs/chatRequests')
  });

export const AppChatReactionsTab =
  scaffoldSolidJSTabEventable<{chatId: ChatId}>({
    title: 'Reactions',
    getComponentModule: () => import('../sidebarRight/tabs/chatReactions')
  });

export const AppChatMembersTab =
  scaffoldSolidJSTabEventable<ChatId>({
    title: 'GroupMembers',
    getComponentModule: () => import('../sidebarRight/tabs/chatMembers')
  });

export const AppChatAdministratorsTab =
  scaffoldSolidJSTabEventable<{chatId: ChatId}>({
    title: 'PeerInfo.Administrators',
    getComponentModule: () => import('../sidebarRight/tabs/chatAdministrators')
  });

export const AppEditBotTab =
  scaffoldSolidJSTab<PeerId>({
    title: 'EditBot.Title',
    getComponentModule: () => import('../sidebarRight/tabs/editBot')
  });

export const AppEditContactTab =
  scaffoldSolidJSTab<PeerId>({
    title: 'Edit',
    getComponentModule: () => import('../sidebarRight/tabs/editContact')
  });

export const AppEditTopicTab =
  scaffoldSolidJSTab<{peerId: PeerId, threadId?: number}>({
    title: 'NewTopic',
    getComponentModule: () => import('../sidebarRight/tabs/editTopic')
  });

export const AppStickersTab =
  scaffoldSolidJSTab({
    title: 'StickersName',
    getComponentModule: () => import('../sidebarRight/tabs/stickers')
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
