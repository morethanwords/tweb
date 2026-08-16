/**
 * Whether a message is still unread judging by the peer's inbox read cursor
 * (`appMessagesManager.getInboxReadMaxId`) — everything ABOVE the cursor is unread.
 *
 * An unknown cursor (`undefined` for a peer whose dialog has not been loaded, or the
 * `NaN` a legacy reply thread produces while its parent history is missing) is answered
 * conservatively with `true`: the message keeps its read observer instead of being
 * silently treated as read and never marked so.
 */
export default function isUnreadByReadCursor(readMaxId: number, mid: number) {
  return !(readMaxId >= 0) || readMaxId < mid;
}
