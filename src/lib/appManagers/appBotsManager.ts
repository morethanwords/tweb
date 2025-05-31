/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountDatabase, getDatabaseState} from '../../config/databases/state';
import {TelegramWebViewSendEventMap} from '../../types';
import AppStorage from '../storage';
import {AppManager} from './manager';

type InternalWebAppStorageKey = 'locationPermission' | 'deviceStorageUsed' | 'deviceStorageUsedKeys';
const DEVICE_STORAGE_QUOTA_SIZE = 5 * 1024 * 1024; // 5 MB
const DEVICE_STORAGE_QUOTA_KEYS = 10;

export default class AppBotsManager extends AppManager {
  private webAppStorage: AppStorage<Record<string, string>, AccountDatabase>;

  protected after() {
    this.webAppStorage = new AppStorage(getDatabaseState(this.getAccountNumber()), 'webapp')
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

    const prevQuota = Number((await this.readBotInternalStorage(botId, 'deviceStorageUsed')) ?? '0');
    const oldItemQuota = oldValue ? key.length + oldValue.length : 0;
    const newQuota = prevQuota - oldItemQuota + (value ? key.length + value.length : 0);

    const prevQuotaKeys = Number((await this.readBotInternalStorage(botId, 'deviceStorageUsedKeys')) ?? '0');
    const newQuotaKeys = prevQuotaKeys + (value ? 1 : -1);

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
}
