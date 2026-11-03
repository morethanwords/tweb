import isLegacyMessageId from '@appManagers/utils/messageId/isLegacyMessageId';
import {isTempId} from '@appManagers/utils/messages/isTempId';

/**
 * A server id of a private chat or a basic group names one message account-wide, so such a message is kept in the
 * global history storage as well and found there by its id alone. A temporary id (a pending message's: the id it
 * follows plus a fraction) is only its chat's own - two empty chats both start at 0.0001 - so its message stays in
 * its chat's storage and is looked up there.
 */
export default function isGlobalHistoryMessageId(messageId: number) {
  return isLegacyMessageId(messageId) && !isTempId(messageId);
}
