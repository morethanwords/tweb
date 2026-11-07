import type {Message} from '@layer';
import isEphemeralMessage from '@appManagers/utils/messages/isEphemeralMessage';
import isAnchoredEphemeralMessage from '@appManagers/utils/messages/isAnchoredEphemeralMessage';

export enum ChatType {
  Chat = 'chat',
  Pinned = 'pinned',
  Discussion = 'discussion',
  Scheduled = 'scheduled',
  Stories = 'stories',
  Saved = 'saved',
  Search = 'search',
  Static = 'static',
  Logs = 'logs',
  // layer 229: the welcome messages a chat sends each new member (desktop's WelcomeMessages section)
  Welcome = 'welcome'
}

/**
 * Whether a message a chat of this type shows is of the chat's history as the server keeps it (tdesktop's
 * `isRegular`): not an admin log's entry, a static preview, a scheduled, welcome or ephemeral message — one standing in
 * for a message of the history too, which shows what is not that message's — which nothing can be asked through or
 * kept for
 */
export function isHistoryMessage(type: ChatType, message: Message.message) {
  return !getNonHistoryStore(type, message);
}

/** What a message that is not of the chat's history (isHistoryMessage) is of instead: its ids are that store's own */
export function getNonHistoryStore(type: ChatType, message: Message.message) {
  if(type === ChatType.Scheduled || message.pFlags.is_scheduled) return ChatType.Scheduled;
  if(type === ChatType.Logs || type === ChatType.Static || type === ChatType.Welcome) return type;
  if(isEphemeralMessage(message) || isAnchoredEphemeralMessage(message)) return 'ephemeral';
}
