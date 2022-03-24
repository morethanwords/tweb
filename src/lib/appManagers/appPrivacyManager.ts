/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import { InputPrivacyKey, InputPrivacyRule, PrivacyRule, Update, PrivacyKey } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";
import apiUpdatesManager from "./apiUpdatesManager";
import rootScope from "../rootScope";
import { convertInputKeyToKey } from "../../helpers/string/convertInputKeyToKey";

export enum PrivacyType {
  Everybody = 2,
  Contacts = 1,
  Nobody = 0
}

export class AppPrivacyManager {
  private privacy: Partial<{
    [key in PrivacyKey['_']]: PrivacyRule[] | Promise<PrivacyRule[]>
  }> = {};

  constructor() {
    rootScope.addMultipleEventsListeners({
      updatePrivacy: (update) => {
        const key = update.key._;
        this.privacy[key] = update.rules;
        rootScope.dispatchEvent('privacy_update', update);
      }
    });
  }

  public setPrivacy(inputKey: InputPrivacyKey['_'], rules: InputPrivacyRule[]) {
    return apiManager.invokeApi('account.setPrivacy', {
      key: {
        _: inputKey
      },
      rules
    }).then(privacyRules => {
      appUsersManager.saveApiUsers(privacyRules.users);
      appChatsManager.saveApiChats(privacyRules.chats);

      apiUpdatesManager.processLocalUpdate({
        _: 'updatePrivacy',
        key: {
          _: convertInputKeyToKey(inputKey)
        },
        rules: rules.map(inputRule => {
          const rule: PrivacyRule = {} as any;
          Object.assign(rule, inputRule);
          rule._ = convertInputKeyToKey(rule._) as any;
          return rule;
        })
      });

      //console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return privacyRules.rules;
    });
  }

  public getPrivacy(inputKey: InputPrivacyKey['_']) {
    const privacyKey: PrivacyKey['_'] = convertInputKeyToKey(inputKey) as any;
    const rules = this.privacy[privacyKey];
    if(rules) {
      return Promise.resolve(rules);
    }
    
    return this.privacy[privacyKey] = apiManager.invokeApi('account.getPrivacy', {
      key: {
        _: inputKey
      }
    }).then(privacyRules => {
      appUsersManager.saveApiUsers(privacyRules.users);
      appChatsManager.saveApiChats(privacyRules.chats);

      //console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return this.privacy[privacyKey] = privacyRules.rules;
    });
  }

  public getPrivacyRulesDetails(rules: PrivacyRule[]) {
    const types: PrivacyType[] = [];

    type peers = {users: UserId[], chats: ChatId[]};
    let allowPeers: peers = {users: [], chats: []}, disallowPeers: peers = {users: [], chats: []};
    rules.forEach(rule => {
      switch(rule._) {
        case 'privacyValueAllowAll':
          types.push(2);
          break;
        case 'privacyValueDisallowAll':
          types.push(0);
          break;
        case 'privacyValueAllowContacts': 
          types.push(1);
          break;
        /* case 'privacyValueDisallowContacts':
          types.push('Except My Contacts');
          break; */
        case 'privacyValueAllowChatParticipants':
          allowPeers.chats.push(...rule.chats);
          break;
        case 'privacyValueAllowUsers':
          allowPeers.users.push(...rule.users);
          break;
        case 'privacyValueDisallowChatParticipants':
          disallowPeers.chats.push(...rule.chats);
          break;
        case 'privacyValueDisallowUsers':
          disallowPeers.users.push(...rule.users);
          break;
      }
    });

    return {type: types[0], disallowPeers, allowPeers};
  }
}

const appPrivacyManager = new AppPrivacyManager();
MOUNT_CLASS_TO.appPrivacyManager = appPrivacyManager;
export default appPrivacyManager;
