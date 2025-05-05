/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PasswordManager} from '../mtproto/passwordManager';
import {ReferenceDatabase} from '../mtproto/referenceDatabase';
import DialogsStorage from '../storages/dialogs';
import FiltersStorage from '../storages/filters';
import {ApiUpdatesManager} from './apiUpdatesManager';
import {AppAvatarsManager} from './appAvatarsManager';
import {AppCallsManager} from './appCallsManager';
import {AppChatsManager} from './appChatsManager';
import {AppDocsManager} from './appDocsManager';
import {AppDraftsManager} from './appDraftsManager';
import {AppEmojiManager} from './appEmojiManager';
import {AppGroupCallsManager} from './appGroupCallsManager';
import {AppInlineBotsManager} from './appInlineBotsManager';
import {AppMessagesIdsManager} from './appMessagesIdsManager';
import {AppMessagesManager} from './appMessagesManager';
import {AppNotificationsManager} from './appNotificationsManager';
import {AppPeersManager} from './appPeersManager';
import {AppPhotosManager} from './appPhotosManager';
import {AppPollsManager} from './appPollsManager';
import {AppPrivacyManager} from './appPrivacyManager';
import {AppProfileManager} from './appProfileManager';
import {AppReactionsManager} from './appReactionsManager';
import {AppStickersManager} from './appStickersManager';
import {AppUsersManager} from './appUsersManager';
import {AppWebPagesManager} from './appWebPagesManager';
import {ApiFileManager} from '../mtproto/apiFileManager';
import {ApiManager} from '../mtproto/apiManager';
import ctx from '../../environment/ctx';
import PeersStorage from '../storages/peers';
import ThumbsStorage from '../storages/thumbs';
import {NetworkerFactory} from '../mtproto/networkerFactory';
import rootScope, {RootScope} from '../rootScope';
import {Authorizer} from '../mtproto/authorizer';
import {DcConfigurator} from '../mtproto/dcConfigurator';
import {TimeManager} from '../mtproto/timeManager';
import {AppStoragesManager} from './appStoragesManager';
import cryptoMessagePort from '../crypto/cryptoMessagePort';
import AppStateManager from './appStateManager';
import filterUnique from '../../helpers/array/filterUnique';
import AppWebDocsManager from './appWebDocsManager';
import AppPaymentsManager from './appPaymentsManager';
import AppAttachMenuBotsManager from './appAttachMenuBotsManager';
import AppSeamlessLoginManager from './appSeamlessLoginManager';
import AppThemesManager from './appThemesManager';
import AppUsernamesManager from './appUsernamesManager';
import AppChatInvitesManager from './appChatInvitesManager';
import AppStoriesManager from './appStoriesManager';
import AppBotsManager from './appBotsManager';
import AppBoostsManager from './appBoostsManager';
import AppStatisticsManager from './appStatisticsManager';
import AppBusinessManager from './appBusinessManager';
import AppTranslationsManager from './appTranslationsManager';
import AppGifsManager from './appGifsManager';
import {ActiveAccountNumber} from '../accounts/types';
import {AppManager} from './manager';
import AppGiftsManager from './appGiftsManager';

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
    referenceDatabase: new ReferenceDatabase,
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
    authorizer: new Authorizer,
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
    appGiftsManager: new AppGiftsManager
  };

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
