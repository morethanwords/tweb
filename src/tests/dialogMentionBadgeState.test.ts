import {describe, expect, it} from 'vitest';

import getDialogMentionBadgeState from '@helpers/dialogMentionBadgeState';

describe('getDialogMentionBadgeState', () => {
  it('turns the unread badge itself into the mention when everything unread is one mention', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 1,
      unreadMessagesCount: 1,
      unreadMentionsCount: 1,
      hasUnreadBadge: true
    })).toEqual({isMention: true, hasMentionsBadge: false});
  });

  it('keeps the counter and adds a separate mentions badge when there is more unread', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 5,
      unreadMessagesCount: 5,
      unreadMentionsCount: 1,
      hasUnreadBadge: true
    })).toEqual({isMention: false, hasMentionsBadge: true});
  });

  it('does not render both badges for a forum with a single unread topic (issue #628)', () => {
    // a forum badge counts unread TOPICS, while the mentions are counted in messages
    expect(getDialogMentionBadgeState({
      unreadCount: 1,
      unreadMessagesCount: 3,
      unreadMentionsCount: 1,
      hasUnreadBadge: true
    })).toEqual({isMention: true, hasMentionsBadge: false});
  });

  it('does not render both badges for several mentions inside one unread topic', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 1,
      unreadMessagesCount: 4,
      unreadMentionsCount: 3,
      hasUnreadBadge: true
    })).toEqual({isMention: true, hasMentionsBadge: false});
  });

  it('shows the mentions badge for a forum with several unread topics', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 2,
      unreadMessagesCount: 6,
      unreadMentionsCount: 1,
      hasUnreadBadge: true
    })).toEqual({isMention: false, hasMentionsBadge: true});
  });

  it('keeps the mentions badge on a row that never renders an unread badge', () => {
    // the forum tab's "All Chats" row suppresses its unread badge, so the
    // mentions badge is the only mention indicator it has
    expect(getDialogMentionBadgeState({
      unreadCount: 1,
      unreadMessagesCount: 3,
      unreadMentionsCount: 1,
      hasUnreadBadge: false
    })).toEqual({isMention: false, hasMentionsBadge: true});
  });

  it('renders nothing without unread mentions', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 4,
      unreadMessagesCount: 4,
      unreadMentionsCount: 0,
      hasUnreadBadge: true
    })).toEqual({isMention: false, hasMentionsBadge: false});
  });

  it('does not turn a marked-as-unread badge into a mention', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 0,
      unreadMessagesCount: 0,
      unreadMentionsCount: 1,
      hasUnreadBadge: true
    })).toEqual({isMention: false, hasMentionsBadge: false});
  });

  it('still surfaces stale mentions without an unread badge', () => {
    expect(getDialogMentionBadgeState({
      unreadCount: 0,
      unreadMessagesCount: 0,
      unreadMentionsCount: 2,
      hasUnreadBadge: false
    })).toEqual({isMention: false, hasMentionsBadge: true});
  });
});
