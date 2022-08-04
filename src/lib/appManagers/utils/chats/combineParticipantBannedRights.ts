/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import copy from '../../../../helpers/object/copy';
import {ChatBannedRights, Chat} from '../../../../layer';

export default function combineParticipantBannedRights(chat: Chat.channel, rights: ChatBannedRights) {
  if(chat.default_banned_rights) {
    rights = copy(rights);
    const defaultRights = chat.default_banned_rights.pFlags;
    for(const i in defaultRights) {
      // @ts-ignore
      rights.pFlags[i] = defaultRights[i];
    }
  }

  return rights;
}
