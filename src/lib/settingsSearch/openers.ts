import * as tabs from '@components/solidJsTabs/tabs';
import type SidebarSlider from '@components/slider';
import type SliderSuperTab from '@components/sliderTab';
import type {SliderSuperTabConstructable} from '@components/sliderTab';
import rootScope from '@lib/rootScope';
import type {Middleware} from '@helpers/middleware';
import type {ConnectedBot} from '@layer';

/**
 * Sections the search cannot open on its own: wizard steps and detail views that
 * only make sense with the state their opener hands them (a specific session, a
 * folder being edited, a password entered on the previous step).
 *
 * They — and everything below them — are dropped from the index, so every result
 * the user sees is actually reachable. The row that leads into them is still
 * indexed, since it lives in the parent section.
 */
export const NON_NAVIGABLE_SECTIONS = new Set([
  'AppTwoStepVerificationEnterPasswordTab',
  'AppTwoStepVerificationReEnterPasswordTab',
  'AppTwoStepVerificationHintTab',
  'AppTwoStepVerificationEmailTab',
  'AppTwoStepVerificationEmailConfirmationTab',
  'AppTwoStepVerificationSetTab',
  'AppPasscodeEnterPasswordTab',
  'AppSessionTab',
  'AppConnectedBotSessionTab',
  'AppEditFolderTab',
  // its list is a store owned by the Privacy tab
  'AppPasskeysTab',
  'AppIncludedChatsTab',
  'AppSharedFolderTab',
  'AppAddMembersTab',
  'AppChangeLoginEmailTab'
]);

type SectionOpener = (slider: SidebarSlider, middleware?: Middleware) => Promise<SliderSuperTab> | SliderSuperTab;

const getConstructor = (sectionId: string) => {
  return (tabs as any)[sectionId] as SliderSuperTabConstructable & {getInitArgs?: (...args: any[]) => any};
};

/**
 * Creates the tab and opens it — unless the navigation was abandoned while its
 * payload was loading, in which case there is nothing left to open it over.
 */
const openTab = async(
  slider: SidebarSlider,
  ctor: SliderSuperTabConstructable,
  middleware: Middleware,
  ...args: any[]
) => {
  if(middleware && !middleware()) {
    return;
  }

  const tab = slider.createTab(ctor);
  await (tab as any).open(...args);
  return tab;
};

/**
 * Sections whose payload the search has to fetch itself. Everything else opens
 * through {@link openSectionTab}, which passes the tab's own `getInitArgs` when
 * it declares one and nothing otherwise.
 */
const SECTION_OPENERS: {[sectionId: string]: SectionOpener} = {
  AppPrivacyLastSeenTab: async(slider, middleware) => {
    const settings = await rootScope.managers.appPrivacyManager.getGlobalPrivacySettings();
    return openTab(slider, tabs.AppPrivacyLastSeenTab, middleware, settings);
  },
  AppPrivacyGiftsTab: async(slider, middleware) => {
    const settings = await rootScope.managers.appPrivacyManager.getGlobalPrivacySettings();
    return openTab(slider, tabs.AppPrivacyGiftsTab, middleware, settings);
  },
  AppActiveSessionsTab: async(slider, middleware) => {
    const authorizations = await rootScope.managers.appAccountManager.getAuthorizations();

    // The bot row is optional — a failed request must not keep the sessions list closed.
    let connectedBot: ConnectedBot.connectedBot;
    try {
      connectedBot = await rootScope.managers.appBusinessManager.getConnectedBot();
    } catch{}

    return openTab(slider, tabs.AppActiveSessionsTab, middleware, {
      authorizations: authorizations.authorizations,
      connectedBot,
      ttlDays: authorizations.authorization_ttl_days
    });
  },
  AppBlockedUsersTab: async(slider, middleware) => {
    const {peerIds} = await rootScope.managers.appUsersManager.getBlocked();
    return openTab(slider, tabs.AppBlockedUsersTab, middleware, {peerIds});
  },
  AppChatAutomationTab: async(slider, middleware) => {
    // the bot is optional here too — the tab opens with an empty row without it
    let connectedBot: ConnectedBot.connectedBot;
    try {
      connectedBot = await rootScope.managers.appBusinessManager.getConnectedBot();
    } catch{}

    return openTab(slider, tabs.AppChatAutomationTab, middleware, {connectedBot});
  },
  AppPrivacyMessagesTab: (slider, middleware) => {
    // opened on its own, so there is no privacy row waiting for the new value
    return openTab(slider, tabs.AppPrivacyMessagesTab, middleware, {onSaved: () => {}});
  },
  AppActiveWebSessionsTab: async(slider, middleware) => {
    const authorizations = await rootScope.managers.appSeamlessLoginManager.getWebAuthorizations();
    return openTab(slider, tabs.AppActiveWebSessionsTab, middleware, authorizations);
  }
};

/**
 * Opens one section in `slider` and resolves with its tab once it is on screen.
 * `fromTab` is the tab we descend from — a tab's `getInitArgs` prefetches through
 * its managers, the same way the Settings list does it. Resolves with nothing when
 * `middleware` says the navigation was abandoned while the payload was loading.
 */
export async function openSectionTab(
  sectionId: string,
  slider: SidebarSlider,
  fromTab: SliderSuperTab,
  middleware?: Middleware
): Promise<SliderSuperTab> {
  const opener = SECTION_OPENERS[sectionId];
  if(opener) {
    return await opener(slider, middleware);
  }

  const ctor = getConstructor(sectionId);
  const args = ctor.getInitArgs ? [await ctor.getInitArgs(fromTab)] : [];
  return openTab(slider, ctor, middleware, ...args);
}
