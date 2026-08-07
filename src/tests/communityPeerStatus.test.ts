import {describe, expect, it, vi} from 'vitest';

vi.mock('@lib/langPack', () => ({
  i18n: (key: string, args?: unknown[]) => ({
    key,
    args
  })
}));

import {
  getCommunityPeerParticipantsCount,
  getCommunityPeerSubtitle
} from '@components/communities/communityPeerStatus';

describe('Community peer status', () => {
  it('uses cached member and subscriber counts when present', () => {
    const group = {
      _: 'channel',
      pFlags: {megagroup: true},
      participants_count: 42
    } as any;
    const channel = {
      _: 'channel',
      pFlags: {},
      participants_count: 17
    } as any;

    expect(getCommunityPeerParticipantsCount(group)).toBe(42);
    expect(getCommunityPeerSubtitle(group)).toEqual({
      key: 'Members',
      args: [42]
    });
    expect(getCommunityPeerSubtitle(channel)).toEqual({
      key: 'Subscribers',
      args: [17]
    });
  });

  it('uses bot status without requesting extra data', () => {
    const bot = {
      _: 'user',
      pFlags: {bot: true}
    } as any;

    expect(getCommunityPeerParticipantsCount(bot)).toBeUndefined();
    expect(getCommunityPeerSubtitle(bot)).toEqual({
      key: 'Bot',
      args: undefined
    });
  });
});
