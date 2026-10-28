import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';

/** The unread-divider cursor, not the inbox cursor used to classify individual messages. */
export default function getReadMaxIdIfUnread({readMaxId, maxId, topMessageOut, mergedThread = false}: {
  readMaxId: number,
  maxId: number,
  topMessageOut?: boolean,
  mergedThread?: boolean
}) {
  // A root/topic cursor with server id 0 means nothing has been read. Legacy discussions merge
  // the parent cursor and retain their existing comparison even for that sentinel.
  const hasCursor = mergedThread || !!getServerMessageId(readMaxId);
  return !topMessageOut && readMaxId < maxId && hasCursor ? readMaxId : 0;
}
