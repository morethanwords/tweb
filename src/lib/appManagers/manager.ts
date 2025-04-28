/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {CryptoMessagePort} from '../crypto/cryptoMessagePort';
import type {ApiFileManager} from '../mtproto/apiFileManager';
import type {ApiManager} from '../mtproto/apiManager';
import type {Authorizer} from '../mtproto/authorizer';
import type {DcConfigurator} from '../mtproto/dcConfigurator';
import type {NetworkerFactory} from '../mtproto/networkerFactory';
import type {PasswordManager} from '../mtproto/passwordManager';
import type {ReferenceDatabase} from '../mtproto/referenceDatabase';
import type {TimeManager} from '../mtproto/timeManager';
import type {RootScope} from '../rootScope';
import type DialogsStorage from '../storages/dialogs';
import type FiltersStorage from '../storages/filters';
import type PeersStorage from '../storages/peers';
import type ThumbsStorage from '../storages/thumbs';
import type {ApiUpdatesManager} from './apiUpdatesManager';
import type {AppAvatarsManager} from './appAvatarsManager';
import type {AppCallsManager} from './appCallsManager';
import type {AppChatsManager} from './appChatsManager';
import type {AppDocsManager} from './appDocsManager';
import type {AppDraftsManager} from './appDraftsManager';
import type {AppEmojiManager} from './appEmojiManager';
import type {AppGroupCallsManager} from './appGroupCallsManager';
import type {AppInlineBotsManager} from './appInlineBotsManager';
import type {AppMessagesIdsManager} from './appMessagesIdsManager';
import type {AppMessagesManager} from './appMessagesManager';
import type {AppNotificationsManager} from './appNotificationsManager';
import type AppPaymentsManager from './appPaymentsManager';
import type {AppPeersManager} from './appPeersManager';
import type {AppPhotosManager} from './appPhotosManager';
import type {AppPollsManager} from './appPollsManager';
import type {AppPrivacyManager} from './appPrivacyManager';
import type {AppProfileManager} from './appProfileManager';
import type {AppReactionsManager} from './appReactionsManager';
import type AppStateManager from './appStateManager';
import type {AppStickersManager} from './appStickersManager';
import type {AppStoragesManager} from './appStoragesManager';
import type {AppUsersManager} from './appUsersManager';
import type AppWebDocsManager from './appWebDocsManager';
import type {AppWebPagesManager} from './appWebPagesManager';
import type AppAttachMenuBotsManager from './appAttachMenuBotsManager';
import type AppSeamlessLoginManager from './appSeamlessLoginManager';
import type AppThemesManager from './appThemesManager';
import type AppUsernamesManager from './appThemesManager';
import type AppChatInvitesManager from './appChatInvitesManager';
import type AppStoriesManager from './appStoriesManager';
import type AppBotsManager from './appBotsManager';
import type AppBoostsManager from './appBoostsManager';
import type AppStatisticsManager from './appStatisticsManager';
import type AppBusinessManager from './appBusinessManager';
import type AppTranslationsManager from './appTranslationsManager';
import type {AppManagers} from './managers';
import type AppGifsManager from './appGifsManager';
import type AppGiftsManager from './appGiftsManager';
import {ActiveAccountNumber} from '../accounts/types';

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
  protected referenceDatabase: ReferenceDatabase;
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

  public clear: (init?: boolean) => void;

  public getAccountNumber() {
    return this.accountNumber;
  }

  public setManagersAndAccountNumber(managers: AppManagers, accountNumber: ActiveAccountNumber) {
    Object.assign(this, {...managers, accountNumber});
    // this.after();
  }
}
