import {ChannelParticipant, Chat, ChatParticipant} from '@layer';
import {CHAT_LEGACY_ADMIN_RIGHTS} from '@appManagers/utils/chats/constants';
import {isParticipantAdmin} from '@appManagers/utils/chats/isParticipantAdmin';
import mergeBotAdminRights from '@appManagers/utils/bots/mergeBotAdminRights';

export default function getBotExistingAdminRights(
  chat: Chat.chat | Chat.channel,
  participant: ChatParticipant | ChannelParticipant
) {
  if(!isParticipantAdmin(participant)) {
    return;
  }

  return mergeBotAdminRights(chat._ === 'chat' ?
    CHAT_LEGACY_ADMIN_RIGHTS :
    (participant as ChannelParticipant.channelParticipantAdmin | ChannelParticipant.channelParticipantCreator).admin_rights
  );
}
