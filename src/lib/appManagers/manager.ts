import type { ReferenceDatabase } from "../mtproto/referenceDatabase";
import type { ApiUpdatesManager } from "./apiUpdatesManager";
import type { AppAvatarsManager } from "./appAvatarsManager";
import type { AppCallsManager } from "./appCallsManager";
import type { AppChatsManager } from "./appChatsManager";
import type { AppDocsManager } from "./appDocsManager";
import type { AppDraftsManager } from "./appDraftsManager";
import type { AppEmojiManager } from "./appEmojiManager";
import type { AppGroupCallsManager } from "./appGroupCallsManager";
import type { AppInlineBotsManager } from "./appInlineBotsManager";
import type { AppMessagesIdsManager } from "./appMessagesIdsManager";
import type { AppMessagesManager } from "./appMessagesManager";
import type { AppNotificationsManager } from "./appNotificationsManager";
import type { AppPeersManager } from "./appPeersManager";
import type { AppPhotosManager } from "./appPhotosManager";
import type { AppPollsManager } from "./appPollsManager";
import type { AppPrivacyManager } from "./appPrivacyManager";
import type { AppProfileManager } from "./appProfileManager";
import type { AppReactionsManager } from "./appReactionsManager";
import type { AppStickersManager } from "./appStickersManager";
import type { AppUsersManager } from "./appUsersManager";
import type { AppWebPagesManager } from "./appWebPagesManager";
import type { AppManagers } from "./managers";

export class AppManager {
  public appPeersManager: AppPeersManager;
  public appChatsManager: AppChatsManager;
  public appDocsManager: AppDocsManager;
  public appPhotosManager: AppPhotosManager;
  public appPollsManager: AppPollsManager;
  public appUsersManager: AppUsersManager;
  public appWebPagesManager: AppWebPagesManager;
  public appDraftsManager: AppDraftsManager;
  public appProfileManager: AppProfileManager;
  public appNotificationsManager: AppNotificationsManager;
  public apiUpdatesManager: ApiUpdatesManager;
  public appAvatarsManager: AppAvatarsManager;
  public appGroupCallsManager: AppGroupCallsManager;
  public appCallsManager: AppCallsManager;
  public appReactionsManager: AppReactionsManager;
  public appMessagesManager: AppMessagesManager;
  public appMessagesIdsManager: AppMessagesIdsManager;
  public appPrivacyManager: AppPrivacyManager;
  public appInlineBotsManager: AppInlineBotsManager;
  public appStickersManager: AppStickersManager;
  public referenceDatabase: ReferenceDatabase;
  public appEmojiManager: AppEmojiManager;
  
  public setManagers(managers: AppManagers) {
    Object.assign(this, managers);
  }
}
