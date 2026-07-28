import clearMessageId from '@appManagers/utils/messageId/clearMessageId';
import isEphemeralMessageId from '@appManagers/utils/messageId/isEphemeralMessageId';

/**
 * * will ignore outgoing offset
 */
export default function getServerMessageId(messageId: number) {
  if(isEphemeralMessageId(messageId)) {
    return 0;
  }

  return clearMessageId(messageId, true);
}
