import {ChatBannedRights, Chat} from '@layer';

export default function removeChatBannedRightsFromParticipant(chat: Chat.channel, rights: ChatBannedRights) {
  if(chat.default_banned_rights && rights?.pFlags) {
    rights = structuredClone(rights);

    const defaultBannedRights = chat.default_banned_rights.pFlags;

    for(const key in defaultBannedRights) {
      const flagKey = key as keyof ChatBannedRights['pFlags'];
      if(defaultBannedRights[flagKey]) delete rights.pFlags[flagKey];
    }
  }

  return rights;
}
