import type {Chat} from '@layer';

export default function isCommunity(
  chat: Chat
): chat is Chat.community | Chat.communityForbidden {
  return chat?._ === 'community' || chat?._ === 'communityForbidden';
}
