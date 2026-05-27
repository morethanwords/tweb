import copy from '@helpers/object/copy';
import {ChatBannedRights, Chat} from '@layer';

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
