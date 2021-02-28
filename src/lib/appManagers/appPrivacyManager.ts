import { MOUNT_CLASS_TO } from "../../config/debug";
import { InputPrivacyKey, InputPrivacyRule, PrivacyRule } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";

export enum PrivacyType {
  Everybody = 2,
  Contacts = 1,
  Nobody = 0
}

export class AppPrivacyManager {
  constructor() {

  }

  public setPrivacy(inputKey: InputPrivacyKey['_'], rules: InputPrivacyRule[]) {
    return apiManager.invokeApi('account.setPrivacy', {
      key: {
        _: inputKey
      },
      rules
    }).then(privacyRules => {
      /* appUsersManager.saveApiUsers(privacyRules.users);
      appChatsManager.saveApiChats(privacyRules.chats);

      console.log('privacy rules', inputKey, privacyRules, privacyRules.rules); */

      return privacyRules.rules;
    });
  }

  public getPrivacy(inputKey: InputPrivacyKey['_']) {
    return apiManager.invokeApi('account.getPrivacy', {
      key: {
        _: inputKey
      }
    }).then(privacyRules => {
      appUsersManager.saveApiUsers(privacyRules.users);
      appChatsManager.saveApiChats(privacyRules.chats);

      //console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return privacyRules.rules;
    });
  }

  public getPrivacyRulesDetails(rules: PrivacyRule[]) {
    const types: PrivacyType[] = [];

    type peers = {users: number[], chats: number[]};
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
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appPrivacyManager = appPrivacyManager);
export default appPrivacyManager;
