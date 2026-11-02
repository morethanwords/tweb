import {Chat} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';

// * promoting someone who is not in a group adds them to it, which takes the right to add members
export default function canOpenAdminEditor(
  chat: Chat.chat | Chat.channel,
  participantMissing: boolean
) {
  return !participantMissing ||
    (chat._ === 'channel' && !!chat.pFlags.broadcast) ||
    hasRights(chat, 'invite_users');
}
