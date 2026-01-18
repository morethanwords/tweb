/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PasswordManager} from '@appManagers/passwordManager';
import {ReferencesStorage} from '@lib/storages/references';
import DialogsStorage from '@lib/storages/dialogs';
import FiltersStorage from '@lib/storages/filters';
import {ApiUpdatesManager} from '@appManagers/apiUpdatesManager';
import {AppAvatarsManager} from '@appManagers/appAvatarsManager';
import {AppCallsManager} from '@appManagers/appCallsManager';
import {AppChatsManager} from '@appManagers/appChatsManager';
import {AppDocsManager} from '@appManagers/appDocsManager';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import {AppEmojiManager} from '@appManagers/appEmojiManager';
import {AppGroupCallsManager} from '@appManagers/appGroupCallsManager';
import {AppInlineBotsManager} from '@appManagers/appInlineBotsManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppNotificationsManager} from '@appManagers/appNotificationsManager';
import {AppPeersManager} from '@appManagers/appPeersManager';
import {AppPhotosManager} from '@appManagers/appPhotosManager';
import {AppPollsManager} from '@appManagers/appPollsManager';
import {AppPrivacyManager} from '@appManagers/appPrivacyManager';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppReactionsManager} from '@appManagers/appReactionsManager';
import {AppStickersManager} from '@appManagers/appStickersManager';
import {AppUsersManager} from '@appManagers/appUsersManager';
import {AppWebPagesManager} from '@appManagers/appWebPagesManager';
import {AppLangPackManager} from '@appManagers/appLangPackManager';
import {ApiFileManager} from '@appManagers/apiFileManager';
import {ApiManager} from '@appManagers/apiManager';
import ctx from '@environment/ctx';
import PeersStorage from '@lib/storages/peers';
import ThumbsStorage from '@lib/storages/thumbs';
import {NetworkerFactory} from '@appManagers/networkerFactory';
import rootScope, {RootScope} from '@lib/rootScope';
import {Authorizer} from '@lib/mtproto/authorizer';
import {DcConfigurator} from '@lib/mtproto/dcConfigurator';
import {TimeManager} from '@lib/mtproto/timeManager';
import {AppStoragesManager} from '@appManagers/appStoragesManager';
import cryptoMessagePort from '@lib/crypto/cryptoMessagePort';
import AppStateManager from '@appManagers/appStateManager';
import filterUnique from '@helpers/array/filterUnique';
import AppWebDocsManager from '@appManagers/appWebDocsManager';
import AppPaymentsManager from '@appManagers/appPaymentsManager';
import AppAttachMenuBotsManager from '@appManagers/appAttachMenuBotsManager';
import AppSeamlessLoginManager from '@appManagers/appSeamlessLoginManager';
import AppThemesManager from '@appManagers/appThemesManager';
import AppUsernamesManager from '@appManagers/appUsernamesManager';
import AppChatInvitesManager from '@appManagers/appChatInvitesManager';
import AppStoriesManager from '@appManagers/appStoriesManager';
import AppBotsManager from '@appManagers/appBotsManager';
import AppBoostsManager from '@appManagers/appBoostsManager';
import AppStatisticsManager from '@appManagers/appStatisticsManager';
import AppBusinessManager from '@appManagers/appBusinessManager';
import AppTranslationsManager from '@appManagers/appTranslationsManager';
import AppGifsManager from '@appManagers/appGifsManager';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {AppManager} from '@appManagers/manager';
import AppGiftsManager from '@appManagers/appGiftsManager';
import MonoforumDialogsStorage from '@lib/storages/monoforumDialogs';
import AppPromoManager from '@appManagers/appPromoManager';
import AppAccountManager from '@appManagers/appAccountManager';

export default function createManagers(
  appStoragesManager: AppStoragesManager,
  stateManager: AppStateManager,
  accountNumber: ActiveAccountNumber,
  userId: UserId
) {
  const managers = {
    appPeersManager: new AppPeersManager,
    appChatsManager: new AppChatsManager,
    appDocsManager: new AppDocsManager,
    appPhotosManager: new AppPhotosManager,
    appPollsManager: new AppPollsManager,
    appUsersManager: new AppUsersManager,
    appWebPagesManager: new AppWebPagesManager,
    appDraftsManager: new AppDraftsManager,
    appProfileManager: new AppProfileManager,
    appNotificationsManager: new AppNotificationsManager,
    apiUpdatesManager: new ApiUpdatesManager,
    appAvatarsManager: new AppAvatarsManager,
    appGroupCallsManager: new AppGroupCallsManager,
    appCallsManager: new AppCallsManager,
    appReactionsManager: new AppReactionsManager,
    appMessagesManager: new AppMessagesManager,
    appMessagesIdsManager: new AppMessagesIdsManager,
    appPrivacyManager: new AppPrivacyManager,
    appInlineBotsManager: new AppInlineBotsManager,
    appStickersManager: new AppStickersManager,
    appLangPackManager: new AppLangPackManager,
    referencesStorage: new ReferencesStorage,
    appEmojiManager: new AppEmojiManager,
    filtersStorage: new FiltersStorage,
    dialogsStorage: new DialogsStorage,
    apiManager: new ApiManager,
    cryptoWorker: cryptoMessagePort,
    passwordManager: new PasswordManager,
    apiFileManager: new ApiFileManager,
    peersStorage: new PeersStorage,
    thumbsStorage: new ThumbsStorage,
    networkerFactory: new NetworkerFactory,
    rootScope: new RootScope,
    authorizer: undefined as Authorizer,
    dcConfigurator: new DcConfigurator,
    timeManager: new TimeManager,
    appStoragesManager: appStoragesManager,
    appStateManager: stateManager,
    appWebDocsManager: new AppWebDocsManager,
    appPaymentsManager: new AppPaymentsManager,
    appAttachMenuBotsManager: new AppAttachMenuBotsManager,
    appSeamlessLoginManager: new AppSeamlessLoginManager,
    appThemesManager: new AppThemesManager,
    appUsernamesManager: new AppUsernamesManager,
    appChatInvitesManager: new AppChatInvitesManager,
    appStoriesManager: new AppStoriesManager,
    appBotsManager: new AppBotsManager,
    appBoostsManager: new AppBoostsManager,
    appStatisticsManager: new AppStatisticsManager,
    appBusinessManager: new AppBusinessManager,
    appTranslationsManager: new AppTranslationsManager,
    appGifsManager: new AppGifsManager,
    appGiftsManager: new AppGiftsManager,
    monoforumDialogsStorage: new MonoforumDialogsStorage,
    appPromoManager: new AppPromoManager,
    appAccountManager: new AppAccountManager
  };

  managers.authorizer = new Authorizer({
    timeManager: managers.timeManager,
    dcConfigurator: managers.dcConfigurator
  });

  type T = typeof managers;

  for(const name in managers) {
    const manager = managers[name as keyof T] as AppManager;
    if(!manager) {
      continue;
    }

    if(manager.setManagersAndAccountNumber) {
      manager.setManagersAndAccountNumber(managers as any, accountNumber);
      delete manager.setManagersAndAccountNumber;
    }

    // @ts-ignore
    ctx[name] = manager;
  }

  Object.assign(managers.rootScope, {managers});

  const promises: Array<Promise<(() => void) | void> | void>[] = [];
  let names = Object.keys(managers) as (keyof T)[];
  names.unshift(
    'appUsersManager',
    'appChatsManager',
    'appNotificationsManager',
    'appMessagesManager',
    'dialogsStorage'
  );
  names = filterUnique(names);
  for(const name of names) {
    const manager = managers[name];
    if((manager as any)?.after) {
      // console.log('injecting after', name);
      const result = (manager as any).after();
      promises.push(result);

      // if(result instanceof Promise) {
      //   result.then(() => {
      //     console.log('injected after', name);
      //   });
      // }
    }
  }

  if(userId) {
    managers.apiManager.setUserAuth(userId);
  }

  return Promise.all(promises).then(() => {
    managers.rootScope.dispatchEventSingle('managers_ready');
    return managers;
  });
}
