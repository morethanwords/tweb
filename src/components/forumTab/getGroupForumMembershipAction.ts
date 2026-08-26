import type {Chat} from '@layer';
import getChatMembershipAction, {
  type ChatMembershipAction
} from '@appManagers/utils/chats/getChatMembershipAction';


export default function getGroupForumMembershipAction(
  chat: Chat | undefined
): ChatMembershipAction | undefined {
  if(chat?._ !== 'channel' || !chat.pFlags.forum) {
    return;
  }

  return getChatMembershipAction(chat);
}
