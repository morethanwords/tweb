import {CancellablePromise} from '@helpers/cancellablePromise';
import {AccountPasskeys, Chat, GlobalPrivacySettings, Passkey} from '@layer';
import {LangPackKey} from '@lib/langPack';
import type {PasscodeActions} from '@lib/passcode/actions';
import {InstanceOf} from '@types';
import {SetStoreFunction} from 'solid-js/store';
import {scaffoldSolidJSTab} from '@components/solidJsTabs/scaffoldSolidJSTab';
import {SuperTabProvider} from '@components/solidJsTabs/superTabProvider';


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
