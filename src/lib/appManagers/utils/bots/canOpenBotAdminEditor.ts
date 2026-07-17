import {Chat} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';

export default function canOpenBotAdminEditor(
  chat: Chat.chat | Chat.channel,
  participantMissing: boolean
) {
  return !participantMissing ||
    (chat._ === 'channel' && !!chat.pFlags.broadcast) ||
    hasRights(chat, 'invite_users');
}
