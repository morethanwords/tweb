import { MOUNT_CLASS_TO } from "../../config/debug";
import { InputPrivacyKey, PrivacyRule } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import appChatsManager from "./appChatsManager";
import appUsersManager from "./appUsersManager";

export class AppPrivacyManager {
  constructor() {

  }

  public getPrivacy(inputKey: InputPrivacyKey['_']) {
    return apiManager.invokeApi('account.getPrivacy', {
      key: {
        _: inputKey
      }
    }).then(privacyRules => {
      appUsersManager.saveApiUsers(privacyRules.users);
      appChatsManager.saveApiChats(privacyRules.chats);

      console.log('privacy rules', inputKey, privacyRules, privacyRules.rules);

      return privacyRules.rules;
    });
  }

  public getPrivacyRulesDetails(rules: PrivacyRule[]) {
    const types: number[] = [];

    let allowLengths = {users: 0, chats: 0}, disallowLengths = {users: 0, chats: 0};
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
          allowLengths.chats += rule.chats.length;
          break;
        case 'privacyValueAllowUsers':
          allowLengths.users += rule.users.length;
          break;
        case 'privacyValueDisallowChatParticipants':
          disallowLengths.chats += rule.chats.length;
          break;
        case 'privacyValueDisallowUsers':
          disallowLengths.users += rule.users.length;
          break;
      }
    });

    return {type: types[0], disallowLengths, allowLengths};
  }
}

const appPrivacyManager = new AppPrivacyManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appPrivacyManager = appPrivacyManager);
export default appPrivacyManager;
