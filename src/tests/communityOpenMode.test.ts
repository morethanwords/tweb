import {describe, expect, it} from 'vitest';
import shouldOpenForumAsNavigationTab, {
  USE_COMMUNITY_NAVIGATION_TAB
} from '@components/forumTab/communityOpenMode';
import isCommunityChat from '@appManagers/utils/communities/isCommunity';
import type {Chat} from '@layer';

describe('Community open mode', () => {
  it('enables the Community navigation tab by default', () => {
    expect(USE_COMMUNITY_NAVIGATION_TAB).toBe(true);
  });

  it('opens a Community as a navigation tab when the flag is enabled', () => {
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: false,
      isCommunity: true,
      isNarrowScreen: false
    })).toBe(true);
  });

  it('keeps the floating fallback when the flag is disabled on desktop', () => {
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: false,
      isCommunity: true,
      isNarrowScreen: false,
      useCommunityNavigationTab: false
    })).toBe(false);
  });

  it('uses a navigation tab on narrow screens even with the flag disabled', () => {
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: false,
      isCommunity: true,
      isNarrowScreen: true,
      useCommunityNavigationTab: false
    })).toBe(true);
  });

  it('does not change an ordinary forum without navigation history', () => {
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: false,
      isCommunity: false,
      isNarrowScreen: true
    })).toBe(false);
  });

  it('preserves the existing navigation stack behavior for any forum', () => {
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: true,
      isCommunity: false,
      isNarrowScreen: false
    })).toBe(true);
  });

  // A forum channel is a plain Chat.channel — classifying it as a Community
  // sent every ordinary forum into a navigation tab instead of the floating one.
  it('keeps a forum channel floating', () => {
    const forum: Chat.channel = {
      _: 'channel',
      id: 1,
      title: 'Forum',
      pFlags: {broadcast: undefined, megagroup: true, forum: true},
      photo: undefined,
      date: 0
    } as Chat.channel;

    expect(isCommunityChat(forum)).toBe(false);
    expect(shouldOpenForumAsNavigationTab({
      hasNavigationHistory: false,
      isCommunity: isCommunityChat(forum),
      isNarrowScreen: false
    })).toBe(false);
  });
});
