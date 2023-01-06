/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputPrivacyKey, InputPrivacyRule, PrivacyRule, PrivacyKey, GlobalPrivacySettings} from '../../layer';
import convertInputKeyToKey from '../../helpers/string/convertInputKeyToKey';
import {AppManager} from './manager';

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
}
