export type DialogMentionBadgeStateOptions = {
  /**
   * Whatever the unread badge itself counts: unread topics for a forum, unread
   * chats for a community, unread messages otherwise.
   */
  unreadCount: number,
  /** Unread messages — differs from `unreadCount` when the badge counts topics/chats. */
  unreadMessagesCount: number,
  unreadMentionsCount: number,
  hasUnreadBadge: boolean
};

/**
 * A mention is shown either as the unread badge turned into an '@', or as a
 * separate mentions badge next to the unread counter — never as both.
 *
 * Deriving the two from different values (topics for one, messages for the
 * other) made a forum row render both at once — two '@' badges for a single
 * mention (issue #628) — hence the explicit `!isMention`.
 */
export default function getDialogMentionBadgeState({
  unreadCount,
  unreadMessagesCount,
  unreadMentionsCount,
  hasUnreadBadge
}: DialogMentionBadgeStateOptions) {
  const hasUnreadMentions = !!unreadMentionsCount;

  // the whole unread state is a single mention — the unread badge becomes the '@'
  const isMention = hasUnreadBadge && hasUnreadMentions && unreadCount === 1;

  const hasMentionsBadge = hasUnreadMentions &&
    !isMention &&
    (unreadMentionsCount > 1 || unreadMessagesCount > 1);

  return {isMention, hasMentionsBadge};
}
