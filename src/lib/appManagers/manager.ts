/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {CryptoMessagePort} from '@lib/crypto/cryptoMessagePort';
import type {ApiFileManager} from '@appManagers/apiFileManager';
import type {ApiManager} from '@appManagers/apiManager';
import type {Authorizer} from '@lib/mtproto/authorizer';
import type {DcConfigurator} from '@lib/mtproto/dcConfigurator';
import type {NetworkerFactory} from '@appManagers/networkerFactory';
import type {PasswordManager} from '@appManagers/passwordManager';
import type {ReferencesStorage} from '@lib/storages/references';
import type {TimeManager} from '@lib/mtproto/timeManager';
import type {RootScope} from '@lib/rootScope';
import type DialogsStorage from '@lib/storages/dialogs';
import type FiltersStorage from '@lib/storages/filters';
import type MonoforumDialogsStorage from '@lib/storages/monoforumDialogs';
import type PeersStorage from '@lib/storages/peers';
import type ThumbsStorage from '@lib/storages/thumbs';
import type {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import type {AppAvatarsManager} from '@appManagers/appAvatarsManager';
import type {AppCallsManager} from '@appManagers/appCallsManager';
import type {AppChatsManager} from '@appManagers/appChatsManager';
import type {AppDocsManager} from '@appManagers/appDocsManager';
import type {AppDraftsManager} from '@appManagers/appDraftsManager';
import type {AppEmojiManager} from '@appManagers/appEmojiManager';
import type {AppGroupCallsManager} from '@appManagers/appGroupCallsManager';
import type {AppInlineBotsManager} from '@appManagers/appInlineBotsManager';
import type {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import type {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import type AppPaymentsManager from '@appManagers/appPaymentsManager';
import type {AppPeersManager} from '@appManagers/appPeersManager';
import type {AppPhotosManager} from '@appManagers/appPhotosManager';
import type {AppPollsManager} from '@appManagers/appPollsManager';
import type {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import type {AppProfileManager} from '@appManagers/appProfileManager';
import type {AppReactionsManager} from '@appManagers/appReactionsManager';
import type AppStateManager from '@appManagers/appStateManager';
import type {AppStickersManager} from '@appManagers/appStickersManager';
import type {AppStoragesManager} from '@appManagers/appStoragesManager';
import type {AppUsersManager} from '@appManagers/appUsersManager';
import type AppWebDocsManager from '@appManagers/appWebDocsManager';
import type {AppWebPagesManager} from '@appManagers/appWebPagesManager';
import type AppAttachMenuBotsManager from '@appManagers/appAttachMenuBotsManager';
import type AppSeamlessLoginManager from '@appManagers/appSeamlessLoginManager';
import type AppThemesManager from '@appManagers/appThemesManager';
import type AppUsernamesManager from '@appManagers/appUsernamesManager';
import type AppChatInvitesManager from '@appManagers/appChatInvitesManager';
import type AppStoriesManager from '@appManagers/appStoriesManager';
import type AppBotsManager from '@appManagers/appBotsManager';
import type AppBoostsManager from '@appManagers/appBoostsManager';
import type AppStatisticsManager from '@appManagers/appStatisticsManager';
import type AppBusinessManager from '@appManagers/appBusinessManager';
import type AppTranslationsManager from '@appManagers/appTranslationsManager';
import type {AppManagers} from '@lib/managers';
import type AppGifsManager from '@appManagers/appGifsManager';
import type AppGiftsManager from '@appManagers/appGiftsManager';
import type {AppLangPackManager} from '@appManagers/appLangPackManager';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import type AppPromoManager from '@appManagers/appPromoManager';
import type AppAccountManager from '@appManagers/appAccountManager';
import {logger, LogTypes} from '@lib/logger';

export class AppManager {
  private accountNumber: ActiveAccountNumber;

  protected appPeersManager: AppPeersManager;
  protected appChatsManager: AppChatsManager;
  protected appDocsManager: AppDocsManager;
  protected appPhotosManager: AppPhotosManager;
  protected appPollsManager: AppPollsManager;
  protected appUsersManager: AppUsersManager;
  protected appWebPagesManager: AppWebPagesManager;
  protected appDraftsManager: AppDraftsManager;
  protected appProfileManager: AppProfileManager;
  protected appNotificationsManager: AppNotificationsManager;
  protected apiUpdatesManager: ApiUpdatesManager;
  protected appAvatarsManager: AppAvatarsManager;
  protected appGroupCallsManager: AppGroupCallsManager;
  protected appCallsManager: AppCallsManager;
  protected appReactionsManager: AppReactionsManager;
  protected appMessagesManager: AppMessagesManager;
  protected appMessagesIdsManager: AppMessagesIdsManager;
  protected appPrivacyManager: AppPrivacyManager;
  protected appInlineBotsManager: AppInlineBotsManager;
  protected appStickersManager: AppStickersManager;
  protected appLangPackManager: AppLangPackManager;
  protected referencesStorage: ReferencesStorage;
  protected appEmojiManager: AppEmojiManager;
  protected dialogsStorage: DialogsStorage;
  protected filtersStorage: FiltersStorage;
  protected apiManager: ApiManager;
  // protected apiManager: ApiManagerProxy;
  protected passwordManager: PasswordManager;
  protected cryptoWorker: CryptoMessagePort;
  protected apiFileManager: ApiFileManager;
  protected peersStorage: PeersStorage;
  protected thumbsStorage: ThumbsStorage;
  protected networkerFactory: NetworkerFactory;
  protected rootScope: RootScope;
  protected authorizer: Authorizer;
  protected dcConfigurator: DcConfigurator;
  protected timeManager: TimeManager;
  protected appStoragesManager: AppStoragesManager;
  protected appStateManager: AppStateManager;
  protected appWebDocsManager: AppWebDocsManager;
  protected appPaymentsManager: AppPaymentsManager;
  protected appAttachMenuBotsManager: AppAttachMenuBotsManager;
  protected appSeamlessLoginManager: AppSeamlessLoginManager;
  protected appThemesManager: AppThemesManager;
  protected appUsernamesManager: AppUsernamesManager;
  protected appChatInvitesManager: AppChatInvitesManager;
  protected appStoriesManager: AppStoriesManager;
  protected appBotsManager: AppBotsManager;
  protected appBoostsManager: AppBoostsManager;
  protected appStatisticsManager: AppStatisticsManager;
  protected appBusinessManager: AppBusinessManager;
  protected appTranslationsManager: AppTranslationsManager;
  protected appGifsManager: AppGifsManager;
  protected appGiftsManager: AppGiftsManager;
  protected monoforumDialogsStorage: MonoforumDialogsStorage;
  protected appPromoManager: AppPromoManager;
  protected appAccountManager: AppAccountManager;

  protected name: string;
  public log: ReturnType<typeof logger>;
  protected logTypes: LogTypes;
  protected logIgnoreDebugReset: boolean;

  public clear: (init?: boolean) => void;

  public getAccountNumber() {
    return this.accountNumber;
  }

  public createLogger(prefix: string, logTypes?: LogTypes, ignoreDebugReset?: boolean) {
    return logger(`ACC-${this.accountNumber}-${prefix}`, logTypes, ignoreDebugReset);
  }

  public setManagersAndAccountNumber(managers: AppManagers, accountNumber: ActiveAccountNumber) {
    Object.assign(this, {...managers, accountNumber});
    this.name = this.name ?? '';
    this.log = this.createLogger(this.name, this.logTypes, this.logIgnoreDebugReset);
    // this.after();
  }
}
