/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputPrivacyKey, InputPrivacyRule, PrivacyRule, PrivacyKey, GlobalPrivacySettings, AccountSetContentSettings, AccountContentSettings} from '@layer';
import convertInputKeyToKey from '@helpers/string/convertInputKeyToKey';
import {AppManager} from '@appManagers/manager';
import App from '@config/app';
import Schema from '@lib/mtproto/schema';

export class AppPrivacyManager extends AppManager {
  private privacy: Partial<{
    [key in PrivacyKey['_']]: PrivacyRule[] | Promise<PrivacyRule[]>
  }> = {};

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePrivacy: (update) => {
        const key = update.key._;
        this.privacy[key] = update.rules;
        this.rootScope.dispatchEvent('privacy_update', update);
      }
    });

    // * preload content settings
    this.rootScope.addEventListener('user_auth', () => {
      this.getContentSettings();
    });
  }

  public setPrivacy(inputKey: InputPrivacyKey['_'], rules: InputPrivacyRule[]) {
    return this.apiManager.invokeApi('account.setPrivacy', {
      key: {
        _: inputKey
      },
      rules
    }).then((privacyRules) => {
      this.appUsersManager.saveApiUsers(privacyRules.users);
      this.appChatsManager.saveApiChats(privacyRules.chats);

      this.apiUpdatesManager.processLocalUpdate({
        _: 'updatePrivacy',
        key: {
          _: convertInputKeyToKey(inputKey)
        },
        rules: rules.map((inputRule) => {
          const rule: PrivacyRule = {} as any;
          Object.assign(rule, inputRule);
          rule._ = convertInputKeyToKey(rule._) as any;
          return rule;
        })
      });

      // console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return privacyRules.rules;
    });
  }

  public getPrivacy(inputKey: InputPrivacyKey['_']) {
    const privacyKey: PrivacyKey['_'] = convertInputKeyToKey(inputKey) as any;
    const rules = this.privacy[privacyKey];
    if(rules) {
      return Promise.resolve(rules);
    }

    return this.privacy[privacyKey] = this.apiManager.invokeApi('account.getPrivacy', {
      key: {
        _: inputKey
      }
    }).then((privacyRules) => {
      this.appUsersManager.saveApiUsers(privacyRules.users);
      this.appChatsManager.saveApiChats(privacyRules.chats);

      // console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return this.privacy[privacyKey] = privacyRules.rules;
    });
  }

  public getGlobalPrivacySettings() {
    return this.apiManager.invokeApi('account.getGlobalPrivacySettings');
  }

  public setGlobalPrivacySettings(settings: GlobalPrivacySettings) {
    return this.apiManager.invokeApi('account.setGlobalPrivacySettings', {settings});
  }

  public getContentSettings(overwrite?: boolean) {
    return this.appStateManager.getSomethingCached({
      key: 'accountContentSettings',
      defaultValue: {
        _: 'account.contentSettings',
        pFlags: {}
      },
      getValue: () => this.apiManager.invokeApi('account.getContentSettings'),
      overwrite
    });
  }

  public async setContentSettings(settings: AccountSetContentSettings) {
    await this.apiManager.invokeApi('account.setContentSettings', settings);
    await this.apiManager.getAppConfig(true);
    await this.getContentSettings(true);
  }

  public async notifyAgeVerified() {
    await this.appStateManager.pushToState('ageVerification', {
      date: new Date().toISOString(),
      layer: Schema.layer,
      clientVersion: App.versionFull
    });
    await this.setContentSettings({sensitive_enabled: true});
  }

  public async getDefaultAutoDeletePeriod() {
    const result = await this.apiManager.invokeApi('messages.getDefaultHistoryTTL');
    return result.period;
  }

  public async setDefaultAutoDeletePeriod(period: number) {
    return this.apiManager.invokeApi('messages.setDefaultHistoryTTL', {period});
  }

  public async setAutoDeletePeriodFor(peerId: PeerId, period: number) {
    const updates = await this.apiManager.invokeApi('messages.setHistoryTTL', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      period
    });

    this.apiUpdatesManager.processUpdateMessage(updates);
  }
}
