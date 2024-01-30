/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PrivacyRule} from '../../../../layer';
import PrivacyType from './privacyType';

export default function getPrivacyRulesDetails(rules: PrivacyRule[]) {
  const types: PrivacyType[] = [];

  type peers = {users: UserId[], chats: ChatId[]};
  const allowPeers: peers = {users: [], chats: []}, disallowPeers: peers = {users: [], chats: []};
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
    }
  });

  return {type: types[0], disallowPeers, allowPeers};
}
