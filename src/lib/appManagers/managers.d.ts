import type getProxiedManagers from './getProxiedManagers';
import type {AppManager} from './manager';

// export type AppManagers = {
//   appPeersManager: AppPeersManager;
//   appChatsManager: AppChatsManager;
//   appDocsManager: AppDocsManager;
//   appPhotosManager: AppPhotosManager;
//   appPollsManager: AppPollsManager;
//   appUsersManager: AppUsersManager;
//   appWebPagesManager: AppWebPagesManager;
//   appDraftsManager: AppDraftsManager;
//   appProfileManager: AppProfileManager;
//   // appNotificationsManager: AppNotificationsManager;
//   apiUpdatesManager: ApiUpdatesManager;
//   // appAvatarsManager: AppAvatarsManager;
//   appGroupCallsManager: AppGroupCallsManager;
//   appReactionsManager: AppReactionsManager;
//   appMessagesManager: AppMessagesManager;
//   appMessagesIdsManager: AppMessagesIdsManager;
//   appPrivacyManager: AppPrivacyManager;
// };
// export type AppManagers = {[lol in keyof AppManager]: AppManager[lol]};
export type AppManagers = ReturnType<typeof getProxiedManagers>;
