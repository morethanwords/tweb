/*
 * Premium, limits, Stars and boosts.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import {premiumGiftOptions} from '../fixtures';

defineStories('Premium & Stars', [
  {
    id: 'limit/folders',
    title: 'Limit reached — folders',
    open: async(ctx) => {
      const {default: showLimitPopup} = await import('@components/popups/limit');
      await showLimitPopup('folders');
    }
  },
  {
    id: 'limit/pin',
    title: 'Limit reached — pinned chats',
    open: async(ctx) => {
      const {default: showLimitPopup} = await import('@components/popups/limit');
      await showLimitPopup('pin');
    }
  },
  {
    id: 'limit/channels',
    title: 'Limit reached — channels (with inactive-chat picker)',
    managers: {
      appChatsManager: {getInactiveChannels: () => [] as Array<{id: ChatId, date: number}>}
    },
    open: async(ctx) => {
      const {showChannelsTooMuchPopup} = await import('@components/popups/channelsTooMuch');
      showChannelsTooMuchPopup().catch(noop);
    }
  },
  {
    id: 'premium/boarding',
    title: 'Telegram Premium',
    open: async(ctx) => {
      const {default: showPremiumPopup} = await import('@components/popups/premium');
      showPremiumPopup();
    }
  },
  {
    id: 'premium/feature',
    title: 'Telegram Premium — one feature',
    open: async(ctx) => {
      const {default: showPremiumPopup} = await import('@components/popups/premium');
      showPremiumPopup({feature: 'stories'});
    }
  },
  {
    id: 'giftPremium',
    fixtureOnly: true,
    title: 'Gift Premium',
    open: async(ctx) => {
      const {default: showGiftPremiumPopup} = await import('@components/popups/giftPremium');
      showGiftPremiumPopup(ctx.peer('private'), premiumGiftOptions);
    }
  },
  {
    id: 'stars/topup',
    title: 'Stars — top up',
    open: async(ctx) => {
      const {default: showStarsPopup} = await import('@components/popups/stars');

      showStarsPopup({itemPrice: 500, onTopup: noop});
    }
  },
  {
    id: 'stars/balance',
    title: 'Stars — balance & history',
    open: async(ctx) => {
      const {default: showStarsPopup} = await import('@components/popups/stars');

      showStarsPopup();
    }
  },
  {
    id: 'makePaid',
    title: 'Make media paid',
    open: async(ctx) => {
      const {default: showMakePaidPopup} = await import('@components/popups/makePaid');
      showMakePaidPopup(noop);
    }
  },
  {
    id: 'boost/channel',
    title: 'Boost a channel',
    open: async(ctx) => {
      const {default: showBoostPopup} = await import('@components/popups/boost');
      showBoostPopup(ctx.peer('channel'));
    }
  }
]);
