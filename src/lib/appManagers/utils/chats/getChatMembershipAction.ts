import type {Chat, User} from '@layer';


export type ChatMembershipAction = 'join' | 'request' | 'leave';

export default function getChatMembershipAction(
  chat: Chat | User | undefined
): ChatMembershipAction | undefined {
  if(chat?._ !== 'chat' && chat?._ !== 'channel') {
    return;
  }

  if(!chat.pFlags.left) {
    return 'leave';
  }

  return chat._ === 'channel' &&
    chat.pFlags.join_request &&
    !chat.pFlags.creator ?
    'request' :
    'join';
}
