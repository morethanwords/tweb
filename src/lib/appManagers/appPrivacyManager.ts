/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputPrivacyKey, InputPrivacyRule, PrivacyRule, PrivacyKey, GlobalPrivacySettings, AccountSetContentSettings, AccountContentSettings} from '../../layer';
import convertInputKeyToKey from '../../helpers/string/convertInputKeyToKey';
import {AppManager} from './manager';
import {MTAppConfig} from '../mtproto/appConfig';
import App from '../../config/app';
import Schema from '../mtproto/schema';
import {isSensitive} from '../../helpers/restrictions';

export interface SensitiveContentSettings {
  sensitiveEnabled: boolean;
  sensitiveCanChange: boolean;
  ignoreRestrictionReasons: string[];
  needAgeVerification: boolean;
  ageVerified: boolean;
}

export class AppPrivacyManager extends AppManager {
  private privacy: Partial<{
    [key in PrivacyKey['_']]: PrivacyRule[] | Promise<PrivacyRule[]>
  }> = {};

  private sensitiveContentSettings: SensitiveContentSettings;

  protected after() {
    this.apiUpdatesManager.addMultipleEventsListeners({
      updatePrivacy: (update) => {
        const key = update.key._;
        this.privacy[key] = update.rules;
        this.rootScope.dispatchEvent('privacy_update', update);
      }
    });

    this.rootScope.addEventListener('app_config', (config) => {
      if(!this.sensitiveContentSettings) return;
      this.sensitiveContentSettings.needAgeVerification = config.need_age_video_verification ?? false;
      this.sensitiveContentSettings.ignoreRestrictionReasons = config.ignore_restriction_reasons ?? [];
      this.rootScope.dispatchEvent('sensitive_content_settings', this.sensitiveContentSettings);
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

  private _getSensitiveContentSettingsPromise: Promise<SensitiveContentSettings> | null = null;
  public getSensitiveContentSettings() {
    if(this.sensitiveContentSettings) return this.sensitiveContentSettings;
    if(this._getSensitiveContentSettingsPromise) return this._getSensitiveContentSettingsPromise;

    return this._getSensitiveContentSettingsPromise = Promise.all([
      this.apiManager.invokeApi('account.getContentSettings').catch(() => {
        return {
          _: 'account.contentSettings',
          pFlags: {}
        } as AccountContentSettings;
      }),
      this.appStateManager.getState(),
      this.apiManager.getAppConfig()
    ]).then(([contentSettings, state, appConfig]) => {
      this.sensitiveContentSettings = {
        sensitiveEnabled: contentSettings.pFlags.sensitive_enabled ?? false,
        sensitiveCanChange: contentSettings.pFlags.sensitive_can_change ?? false,
        // ignoreRestrictionReasons: [],
        // needAgeVerification: true,
        // ageVerified: false
        ignoreRestrictionReasons: appConfig.ignore_restriction_reasons ?? [],
        needAgeVerification: appConfig.need_age_video_verification ?? false,
        ageVerified: !!state.ageVerification
      };

      return this.sensitiveContentSettings;
    }).finally(() => {
      this._getSensitiveContentSettingsPromise = null;
    });;
  }

  public async setContentSettings(settings: AccountSetContentSettings) {
    if(this.sensitiveContentSettings) {
      this.sensitiveContentSettings.sensitiveEnabled = settings.sensitive_enabled;
      this.rootScope.dispatchEvent('sensitive_content_settings', this.sensitiveContentSettings);
    }

    await this.apiManager.invokeApi('account.setContentSettings', settings);
    await this.apiManager.getAppConfig(true)
  }

  public async notifyAgeVerified() {
    if(!this.sensitiveContentSettings) {
      // just in case
      await this.getSensitiveContentSettings();
    }

    await this.appStateManager.pushToState('ageVerification', {
      date: new Date().toISOString(),
      layer: Schema.layer,
      clientVersion: App.versionFull
    });
    this.sensitiveContentSettings.ageVerified = true;
    this.sensitiveContentSettings.sensitiveEnabled = true;
    await this.setContentSettings({sensitive_enabled: true});
    await this.apiManager.getAppConfig(true)
    this.rootScope.dispatchEvent('sensitive_content_settings', this.sensitiveContentSettings);
  }
}
