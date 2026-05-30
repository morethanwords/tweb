import {PrivacyRule} from '@layer';
import PrivacyType from '@appManagers/utils/privacy/privacyType';

export default function getPrivacyRulesDetails(rules: PrivacyRule[]) {
  const types: PrivacyType[] = [];

  type peers = {users: UserId[], chats: ChatId[]};
  const allowPeers: peers = {users: [], chats: []}, disallowPeers: peers = {users: [], chats: []};
  let allowMiniApps = false;
  let disallowMiniApps = false;
  rules.forEach((rule) => {
    switch(rule._) {
      case 'privacyValueAllowAll':
        types.push(PrivacyType.Everybody);
        break;
      case 'privacyValueDisallowAll':
        types.push(PrivacyType.Nobody);
        break;
      case 'privacyValueAllowContacts':
        types.push(PrivacyType.Contacts);
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
      case 'privacyValueAllowBots':
        allowMiniApps = true;
        break;
      case 'privacyValueDisallowBots':
        disallowMiniApps = true;
        break;
    }
  });

  return {type: types[0], disallowPeers, allowPeers, allowMiniApps, disallowMiniApps};
}
