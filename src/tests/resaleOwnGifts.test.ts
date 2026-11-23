import '@helpers/peerIdPolyfill';
import {describe, expect, it, vi} from 'vitest';
import AppGiftsManager from '@appManagers/appGiftsManager';
import {PaymentsSavedStarGifts, SavedStarGift, StarGift} from '@layer';

/**
 * Among the gifts listed for resale, the user's own come with their saved record — when they got it,
 * from whom, when it can be transferred or resold and for how much: each with its own, found by its slug.
 */

const MY_ID = (1 as UserId).toPeerId(false);

const unique = (slug: string) => ({
  _: 'starGiftUnique',
  slug,
  owner_id: {_: 'peerUser', user_id: 1}
} as any as StarGift.starGiftUnique);

const saved = (slug: string): SavedStarGift => ({
  _: 'savedStarGift',
  pFlags: {},
  date: slug === 'a' ? 100 : 200,
  gift: unique(slug)
} as any);

describe('The user\'s own gifts listed for resale', () => {
  it('each get their own saved record', async() => {
    const manager = new AppGiftsManager() as any;
    const savedGifts: PaymentsSavedStarGifts = {_: 'payments.savedStarGifts', count: 2, gifts: [saved('b'), saved('a')], chats: [], users: []};
    Object.assign(manager, {
      rootScope: {myId: MY_ID},
      apiManager: {
        invokeApi: vi.fn().mockResolvedValue({_: 'payments.resaleStarGifts', count: 2, gifts: [unique('a'), unique('b')], chats: [], users: []}),
        invokeApiSingle: vi.fn().mockResolvedValue(savedGifts)
      },
      appPeersManager: {saveApiPeers: vi.fn()}
    });
    vi.spyOn(manager, 'wrapGift').mockImplementation((gift: any) => ({
      type: 'stargift',
      raw: gift,
      input: {_: 'inputSavedStarGiftSlug', slug: gift.slug}
    }));

    const {items} = await (manager as AppGiftsManager).getResaleOptions({giftId: 1, attributesHash: 0});

    expect(items.map((item) => item.saved?.date)).toEqual([100, 200]);
  });
});
