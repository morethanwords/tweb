import {CancellablePromise} from '@helpers/cancellablePromise';
import {AccountPasskeys, AccountPassword, Authorization, ChannelParticipant, Chat, ChatFull, ChatParticipant, DialogFilter, ExportedChatlistInvite, GlobalPrivacySettings, Passkey, WebAuthorization} from '@layer';
import type SidebarSlider from '@components/slider';
import type {SliderSuperTab} from '@components/slider';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import type {MyDialogFilter} from '@lib/storages/filters';
import {FormatterArgument, LangPackKey} from '@lib/langPack';
import type {PasscodeActions} from '@lib/passcode/actions';
import {InstanceOf} from '@types';
import {SetStoreFunction} from 'solid-js/store';
import {scaffoldSolidJSTab, scaffoldSolidJSTabEventable} from '@components/solidJsTabs/scaffoldSolidJSTab';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';
import rootScope from '@lib/rootScope';
import type {EditProfileTabPayload} from '@components/sidebarLeft/tabs/editProfile';
import {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import {ChatInvite, ChatInviteActions, getChatInviteLinksInitArgs} from '@components/sidebarRight/tabs/chatInviteLinkShared';
import lottieLoader from '@lib/rlottie/lottieLoader';
import {deleteFolder as deleteEditFolder, getEditFolderInitArgs} from '@components/sidebarLeft/tabs/editFolderShared';


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
    title: (p) => p.threadId ? 'ForumTopic.Title.Edit' : 'NewTopic',
    getComponentModule: () => import('../sidebarRight/tabs/editTopic')
  });

export const AppStickersTab =
  scaffoldSolidJSTab({
    title: 'StickersName',
    getComponentModule: () => import('../sidebarRight/tabs/stickers')
  });

export const AppChatDiscussionTab =
  scaffoldSolidJSTabEventable<{chatId: ChatId, linkedChatId: ChatId}>({
    title: 'DiscussionController.Channel.Title',
    getComponentModule: () => import('../sidebarRight/tabs/chatDiscussion')
  });

export const AppChatTypeTab =
  scaffoldSolidJSTabEventable<{chatId: ChatId, chatFull: ChatFull}>({
    title: 'ChannelType',
    getComponentModule: () => import('../sidebarRight/tabs/chatType')
  });

type AppUserPermissionsTabPayload = {
  participant: ChannelParticipant | ChatParticipant,
  chatId: ChatId,
  userId: UserId,
  editingAdmin?: boolean
};

export const AppUserPermissionsTab =
  scaffoldSolidJSTabEventable<AppUserPermissionsTabPayload>({
    title: (p) => p.editingAdmin ? 'EditAdmin' : 'UserRestrictions',
    getComponentModule: () => import('../sidebarRight/tabs/userPermissions')
  });

// Replaces the legacy AppUserPermissionsTab.openTab static.
export function openUserPermissionsTab(
  slider: SidebarSlider,
  chatId: ChatId,
  participant: ChatParticipant | ChannelParticipant,
  isAdmin?: boolean
) {
  slider.createTab(AppUserPermissionsTab).open({
    participant,
    chatId,
    userId: getParticipantPeerId(participant).toUserId(),
    editingAdmin: isAdmin
  });
}


type AppIncludedChatsTabPayload = {
  filter: MyDialogFilter,
  type: 'included' | 'excluded',
  onSetFilter: (filter: MyDialogFilter) => void
};

export const AppIncludedChatsTab =
  scaffoldSolidJSTab<AppIncludedChatsTabPayload>({
    title: (p) => p.type === 'included' ? 'FilterAlwaysShow' : 'FilterNeverShow',
    getComponentModule: () => import('../sidebarLeft/tabs/includedChats')
  });

type AppSharedFolderTabPayload = {
  filter: DialogFilter.dialogFilterChatlist,
  chatlistInvite: ExportedChatlistInvite
};

export const AppSharedFolderTab =
  scaffoldSolidJSTabEventable<AppSharedFolderTabPayload, {
    delete: () => void,
    edit: (chatlistInvite: ExportedChatlistInvite) => void
      }>({
        title: 'SharedFolder.Edit.Title',
        getComponentModule: () => import('../sidebarLeft/tabs/sharedFolder'),
        onOpenAfterTimeout: function() {
          (this as any)._onOpenAfterTimeout?.();
        }
      });

type AppGroupPermissionsTabPayload = {
  chatId: ChatId
};

export const AppGroupPermissionsTab =
  scaffoldSolidJSTab<AppGroupPermissionsTabPayload>({
    title: 'ChannelPermissions',
    getComponentModule: () => import('../sidebarRight/tabs/groupPermissions/groupPermissions'),
    onOpenAfterTimeout: function() {
      this.scrollable.onScroll();
    }
  });

const getPrivacyAndSecurityInitArgs = (fromTab: SliderSuperTab) => ({
  appConfig: fromTab.managers.apiManager.getAppConfig(),
  globalPrivacy: fromTab.managers.appPrivacyManager.getGlobalPrivacySettings(),
  webAuthorizations: fromTab.managers.appSeamlessLoginManager.getWebAuthorizations()
});

type AppPrivacyAndSecurityTabPayload = ReturnType<typeof getPrivacyAndSecurityInitArgs>;

export const AppPrivacyAndSecurityTab =
  scaffoldSolidJSTabEventable<AppPrivacyAndSecurityTabPayload>({
    title: 'PrivacySettings',
    getComponentModule: () => import('../sidebarLeft/tabs/privacyAndSecurity')
  });

// Preload (appConfig / globalPrivacy / webAuthorizations) read off the constructor
// by settings.tsx's makeSubTabConfig, matching the old static getInitArgs.
(AppPrivacyAndSecurityTab as any).getInitArgs = getPrivacyAndSecurityInitArgs;


type AppEditChatInviteLinkTabPayload = {
  chatId: ChatId,
  invite?: ChatInvite
};

export const AppEditChatInviteLinkTab =
  scaffoldSolidJSTabEventable<AppEditChatInviteLinkTabPayload, {
    finish: (chatInvite: ChatInvite) => void
      }>({
        title: (p) => p.invite ? 'InviteLinks.Edit' : 'NewLink',
        getComponentModule: () => import('../sidebarRight/tabs/editChatInviteLink')
      });


type AppChatInviteLinkTabPayload = {
  chatId: ChatId,
  chatInvite: ChatInvite,
  menuButtons: ButtonMenuItemOptionsVerifiable[],
  actions: ChatInviteActions,
  onUpdate?: (chatInvite: ChatInvite) => void
};

export const AppChatInviteLinkTab =
  scaffoldSolidJSTabEventable<AppChatInviteLinkTabPayload>({
    title: 'InviteLink',
    getComponentModule: () => import('../sidebarRight/tabs/chatInviteLink')
  });


type AppChatInviteLinksTabPayload = {
  chatId: ChatId,
  adminId?: UserId,
  p?: ReturnType<typeof getChatInviteLinksInitArgs>
};

// getInitArgs is read directly (typed) by editChat's navigationTab, so expose it
// on the constructor via Object.assign rather than an untyped property poke.
export const AppChatInviteLinksTab = Object.assign(
  scaffoldSolidJSTabEventable<AppChatInviteLinksTabPayload>({
    title: 'InviteLinks',
    getComponentModule: () => import('../sidebarRight/tabs/chatInviteLinks')
  }),
  {getInitArgs: getChatInviteLinksInitArgs}
);


type AppEditChatTabPayload = {
  chatId: ChatId
};

export const AppEditChatTab =
  scaffoldSolidJSTab<AppEditChatTabPayload>({
    title: 'Edit',
    getComponentModule: () => import('../sidebarRight/tabs/editChat')
  });


function getChatFoldersInitArgs() {
  return {
    animationData: lottieLoader.loadAnimationFromURLManually('Folders_1'),
    filters: rootScope.managers.filtersStorage.getDialogFilters()
  };
}

type AppChatFoldersTabPayload = ReturnType<typeof getChatFoldersInitArgs>;

// getInitArgs is read both via makeSubTabConfig (any-cast) and directly (typed)
// by foldersSidebarContent, so expose it on the constructor via Object.assign.
export const AppChatFoldersTab = Object.assign(
  scaffoldSolidJSTab<AppChatFoldersTabPayload>({
    title: 'ChatList.Filter.List.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/chatFolders'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
  }),
  {getInitArgs: getChatFoldersInitArgs}
);


type AppEditFolderTabPayload = ReturnType<typeof getEditFolderInitArgs> & {
  initFilter?: MyDialogFilter
};

// getInitArgs (preload) + deleteFolder (called from createFolderContextMenu and
// chatFolders via the hot-reload guard) are exposed on the constructor.
export const AppEditFolderTab = Object.assign(
  scaffoldSolidJSTab<AppEditFolderTabPayload>({
    title: 'FilterHeaderEdit',
    getComponentModule: () => import('../sidebarLeft/tabs/editFolder'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
  }),
  {
    getInitArgs: getEditFolderInitArgs,
    deleteFolder: deleteEditFolder
  }
);


function getMyStoriesInitArgs() {
  return {
    animationData: lottieLoader.loadAnimationFromURLManually('UtyanStories')
  };
}

type AppMyStoriesTabPayload = ReturnType<typeof getMyStoriesInitArgs> & {
  isArchive?: boolean,
  chatId?: ChatId,
  initialAlbumId?: number
};

export const AppMyStoriesTab = Object.assign(
  scaffoldSolidJSTab<AppMyStoriesTabPayload>({
    title: (p) => p.isArchive ? 'MyStories.Archive' : 'MyStories.Title',
    getComponentModule: () => import('../sidebarLeft/tabs/myStories')
  }),
  {getInitArgs: getMyStoriesInitArgs}
);


export const AppArchivedTab =
  scaffoldSolidJSTab({
    title: 'ArchivedChats',
    getComponentModule: () => import('../sidebarLeft/tabs/archivedTab'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    },
    onClose: function() {
      (this as any)._onClose?.();
    },
    onCloseAfterTimeout: function() {
      (this as any)._onCloseAfterTimeout?.();
    }
  });


// ── 2FA wizard ──────────────────────────────────────────────────────────────

type AppTwoStepVerificationSetTabPayload = {
  messageFor: 'password' | 'email'
};

export const AppTwoStepVerificationSetTab =
  scaffoldSolidJSTab<AppTwoStepVerificationSetTabPayload>({
    title: (p) => p.messageFor === 'password' ? 'TwoStepVerificationPasswordSet' : 'TwoStepVerificationEmailSet',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/passwordSet')
  });


type AppTwoStepVerificationTabPayload = {
  state: AccountPassword,
  plainPassword?: string
};

export const AppTwoStepVerificationTab =
  scaffoldSolidJSTab<AppTwoStepVerificationTabPayload>({
    title: 'TwoStepVerificationTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/index')
  });


type AppTwoStepVerificationEnterPasswordTabPayload = {
  state: AccountPassword,
  plainPassword?: string,
  isFirst?: boolean
};

export const AppTwoStepVerificationEnterPasswordTab =
  scaffoldSolidJSTab<AppTwoStepVerificationEnterPasswordTabPayload>({
    title: (p) => (!p.state.pFlags.has_password || p.plainPassword) ? 'PleaseEnterFirstPassword' : 'PleaseEnterCurrentPassword',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/enterPassword'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    },
    onClose: function() {
      (this as any)._onClose?.();
    }
  });


type AppTwoStepVerificationReEnterPasswordTabPayload = {
  state: AccountPassword,
  plainPassword?: string,
  newPassword?: string
};

export const AppTwoStepVerificationReEnterPasswordTab =
  scaffoldSolidJSTab<AppTwoStepVerificationReEnterPasswordTabPayload>({
    title: 'PleaseReEnterPassword',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/reEnterPassword'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
  });


type AppTwoStepVerificationHintTabPayload = {
  state: AccountPassword,
  plainPassword?: string,
  newPassword?: string
};

export const AppTwoStepVerificationHintTab =
  scaffoldSolidJSTab<AppTwoStepVerificationHintTabPayload>({
    title: 'TwoStepAuth.SetupHintTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/hint'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
  });


type AppTwoStepVerificationEmailTabPayload = {
  state: AccountPassword,
  plainPassword?: string,
  newPassword?: string,
  hint?: string,
  isFirst?: boolean,
  justSetPasssword?: boolean
};

export const AppTwoStepVerificationEmailTab =
  scaffoldSolidJSTab<AppTwoStepVerificationEmailTabPayload>({
    title: 'RecoveryEmailTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/email'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
  });


type AppTwoStepVerificationEmailConfirmationTabPayload = {
  state: AccountPassword,
  email: FormatterArgument,
  length: number,
  isFirst?: boolean,
  forPasswordReset?: boolean,
  justSetPasssword?: boolean
};

export const AppTwoStepVerificationEmailConfirmationTab =
  scaffoldSolidJSTab<AppTwoStepVerificationEmailConfirmationTabPayload>({
    title: 'TwoStepAuth.RecoveryTitle',
    getComponentModule: () => import('../sidebarLeft/tabs/2fa/emailConfirmation'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    },
    onCloseAfterTimeout: function() {
      (this as any)._onCloseAfterTimeout?.();
    }
  });


type AppPrivateSearchTabPayload = {
  peerId: PeerId,
  threadId?: number,
  onDatePick?: (timestamp: number) => void,
  query?: string
};

export const AppPrivateSearchTab =
  scaffoldSolidJSTab<AppPrivateSearchTabPayload>({
    title: 'Search',
    getComponentModule: () => import('../sidebarRight/tabs/search'),
    onOpenAfterTimeout: function() {
      (this as any)._onOpenAfterTimeout?.();
    }
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
