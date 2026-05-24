import clearMessageId from '@appManagers/utils/messageId/clearMessageId';

/**
 * * will ignore outgoing offset
 */
export default function getServerMessageId(messageId: number) {
  return clearMessageId(messageId, true);
}
