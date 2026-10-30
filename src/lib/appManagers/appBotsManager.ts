import {AccountDatabase, getDatabaseState} from '@config/databases/state';
import {TelegramWebViewSendEventMap} from '@types';
import AppStorage from '@lib/storage';
import {AppManager} from '@appManagers/manager';
import {BotPreviewMedia, User, UsersUsers} from '@layer';
import type {ReferenceContext} from '@lib/storages/references';
import {getFloodWaitTime} from './utils/getFloodWaitTime';

type InternalWebAppStorageKey = 'locationPermission' | 'deviceStorageUsed' | 'deviceStorageUsedKeys';
const DEVICE_STORAGE_QUOTA_SIZE = 5 * 1024 * 1024; // 5 MB
const DEVICE_STORAGE_QUOTA_KEYS = 10;

type CreateManagedBotArgs = {
  managerId: PeerId;
  botName: string;
  username: string;
};

type CheckUsernameResult = 'available' | 'taken' | 'invalid' | 'error';

type CreateManagedBotResult = {
  status: 'created';
  user: User.user;
} | {
  status: 'wait';
  waitTime: number;
} | {
  status: 'error';
};

export default class AppBotsManager extends AppManager {
  private webAppStorage: AppStorage<Record<string, string>, AccountDatabase>;
  // * a bot's similar bots: how many of them come depends on Premium, so they go with it
  private recommendations: Map<BotId, MaybePromise<UsersUsers>> = new Map();
  private recommendationsGeneration = 0;
  private previewMedias: Map<BotId, MaybePromise<BotPreviewMedia[]>> = new Map();

  protected after() {
    this.webAppStorage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'webapp')
    this.rootScope.addEventListener('premium_toggle', () => {
      ++this.recommendationsGeneration;
      this.recommendations.clear();
    });
  }

  // * what a request brought is kept, and a request under way is joined; one that failed is not kept
  private getCached<T>(cache: Map<BotId, MaybePromise<T>>, botId: BotId, request: () => Promise<T>, overwrite?: boolean) {
    const cached = !overwrite && cache.get(botId);
    if(cached) {
      return cached;
    }

    const promise = request();
    cache.set(botId, promise);
    promise.then((result) => {
      if(cache.get(botId) === promise) {
        cache.set(botId, result);
      }
    }, () => {
      if(cache.get(botId) === promise) {
        cache.delete(botId);
      }
    });

    return promise;
  }

  /** The bots like this one: without Premium a slice of them, with the count of them all */
  public getBotRecommendations(botId: BotId) {
    const generation = this.recommendationsGeneration;
    return this.getCached(this.recommendations, botId, () => this.apiManager.invokeApiSingleProcess({
      method: 'bots.getBotRecommendations',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      },
      // * asked after a Premium toggle, it never joins one asked before it; that one's answer is not kept (getCached)
      options: {cacheKey: botId + '_' + generation},
      processResult: (usersUsers) => {
        this.appUsersManager.saveApiUsers(usersUsers.users);
        return usersUsers;
      }
    }));
  }

  /** The screenshots and videos a bot shows in its profile (`bot_info.has_preview_medias`) */
  public getPreviewMedias(botId: BotId, overwrite?: boolean) {
    return this.getCached(this.previewMedias, botId, () => this.apiManager.invokeApiSingleProcess({
      method: 'bots.getPreviewMedias',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      },
      processResult: (previews) => {
        const context: ReferenceContext = {type: 'botPreview', botId};
        previews.forEach((preview) => {
          this.appMessagesManager.saveMessageMedia(preview, 'media', context);
        });

        return previews;
      }
    }), overwrite);
  }

  public canSendMessage(botId: BotId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.canSendMessage',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      }
    });
  }

  public allowSendMessage(botId: BotId) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.allowSendMessage',
      params: {
        bot: this.appUsersManager.getUserInput(botId)
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);
      }
    });
  }

  /** Whether the bot's mini app may offer this file for download (`web_app_request_file_download`) */
  public checkDownloadFileParams(botId: BotId, fileName: string, url: string) {
    return this.apiManager.invokeApiSingle('bots.checkDownloadFileParams', {
      bot: this.appUsersManager.getUserInput(botId),
      file_name: fileName,
      url
    });
  }

  public async getAdminedBots() {
    const users = await this.apiManager.invokeApi('bots.getAdminedBots');
    this.appUsersManager.saveApiUsers(users);
    return users;
  }

  public toggleEmojiStatusPermission(botId: BotId, enabled: boolean) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'bots.toggleUserEmojiStatusPermission',
      params: {
        bot: this.appUsersManager.getUserInput(botId),
        enabled
      },
      processResult: (ok) => {
        this.appProfileManager.refreshFullPeerIfNeeded(botId.toPeerId());
      }
    });
  }

  private readBotStorage(botId: BotId, scope: 'internal' | 'device', key: string) {
    return this.webAppStorage.get(`${botId.toString()}:${scope}:${key}`);
  }

  public readBotInternalStorage(botId: BotId, key: InternalWebAppStorageKey) {
    return this.readBotStorage(botId, 'internal', key);
  }

  public readBotDeviceStorage(botId: BotId, key: string) {
    return this.readBotStorage(botId, 'device', key);
  }

  private writeBotStorage(botId: BotId, scope: 'internal' | 'device', key: string, value: string): Promise<void> {
    return this.webAppStorage.set({[`${botId.toString()}:${scope}:${key}`]: value});
  }

  public async deleteBotStorage(botId: BotId, scope: 'internal' | 'device', key: string) {
    await this.webAppStorage.delete(`${botId.toString()}:${scope}:${key}`);
  }

  public writeBotInternalStorage(botId: BotId, key: InternalWebAppStorageKey, value: string) {
    return this.writeBotStorage(botId, 'internal', key, value);
  }

  public async writeBotDeviceStorage(botId: BotId, key: string, value: string | null): Promise<TelegramWebViewSendEventMap['device_storage_failed']['error'] | null> {
    if(typeof key !== 'string') return 'KEY_INVALID';
    if(typeof value !== 'string' && value !== null) return 'VALUE_INVALID';

    const oldValue = await this.readBotDeviceStorage(botId, key);
    if(oldValue === value) return null;

    const existed = !!oldValue;
    if(!existed && !value) return null;

    const prevQuota = Number((await this.readBotInternalStorage(botId, 'deviceStorageUsed')) ?? '0');
    const oldItemQuota = oldValue ? key.length + oldValue.length : 0;
    const newQuota = prevQuota - oldItemQuota + (value ? key.length + value.length : 0);

    const prevQuotaKeys = Number((await this.readBotInternalStorage(botId, 'deviceStorageUsedKeys')) ?? '0');
    const newQuotaKeys = prevQuotaKeys + (value ? 1 : 0) - (existed ? 1 : 0);

    if(newQuota > DEVICE_STORAGE_QUOTA_SIZE || newQuotaKeys > DEVICE_STORAGE_QUOTA_KEYS) {
      return 'QUOTA_EXCEEDED';
    }

    try {
      if(value) {
        await this.writeBotStorage(botId, 'device', key, value);
      } else {
        await this.deleteBotStorage(botId, 'device', key);
      }
      await this.writeBotInternalStorage(botId, 'deviceStorageUsed', newQuota.toString());
      await this.writeBotInternalStorage(botId, 'deviceStorageUsedKeys', newQuotaKeys.toString());
    } catch(err) {
      return 'UNKNOWN_ERROR';
    }
    return null
  }

  public async clearBotDeviceStorage(botId: BotId) {
    const prefix = `${botId.toString()}:device:`;
    const keys = await this.webAppStorage.getAllKeys()

    const keysToDelete = keys.filter(key => typeof key === 'string' && key.startsWith(prefix)) as string[];
    await Promise.all(keysToDelete.map(key => this.webAppStorage.delete(key)));
    await this.writeBotInternalStorage(botId, 'deviceStorageUsed', '0');
    await this.writeBotInternalStorage(botId, 'deviceStorageUsedKeys', '0');
  }

  public async getPreparedMessage(botId: BotId, messageId: string) {
    const res = await this.apiManager.invokeApiSingleProcess({
      method: 'messages.getPreparedInlineMessage',
      params: {
        bot: this.appUsersManager.getUserInput(botId),
        id: messageId
      }
    });

    this.appUsersManager.saveApiUsers(res.users);

    if(res.result._ === 'botInlineMediaResult') {
      if(res.result.document) {
        this.appDocsManager.saveDoc(res.result.document);
      }

      if(res.result.photo) {
        this.appPhotosManager.savePhoto(res.result.photo);
      }
    }

    return res;
  }

  public async createManagedBot({managerId, botName, username}: CreateManagedBotArgs): Promise<CreateManagedBotResult> {
    try {
      const user = await this.apiManager.invokeApi('bots.createBot', {
        manager_id: this.appUsersManager.getUserInput(managerId.toUserId()),
        name: botName,
        username: username
      });

      if(user._ === 'userEmpty') return {status: 'error'};

      this.appUsersManager.saveApiUser(user);

      return {status: 'created', user};
    } catch(e) {
      const error = e as ApiError;

      const waitTimeResult = getFloodWaitTime(error);

      if(waitTimeResult.hasWaitTime) {
        return {status: 'wait', waitTime: waitTimeResult.waitTime};
      }

      return {status: 'error'};
    }
  }

  public async checkUsername(username: string): Promise<CheckUsernameResult> {
    try {
      const isAvailable = await this.apiManager.invokeApi('bots.checkUsername', {username});
      return isAvailable ? 'available' : 'taken';
    } catch(e) {
      const error = e as ApiError;
      if(error.type === 'USERNAME_OCCUPIED') return 'taken';
      if(error.type === 'USERNAME_INVALID') return 'invalid';

      return 'error';
    }
  }
}
