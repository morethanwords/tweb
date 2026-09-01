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
      const {default: PopupPremium} = await import('@components/popups/premium');
      PopupPremium.show();
    }
  },
  {
    id: 'premium/feature',
    title: 'Telegram Premium — one feature',
    open: async(ctx) => {
      const {default: PopupPremium} = await import('@components/popups/premium');
      PopupPremium.show({feature: 'stories'});
    }
  },
  {
    id: 'giftPremium',
    fixtureOnly: true,
    title: 'Gift Premium',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupGiftPremium}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/giftPremium')
      ]);

      PopupElement.createPopup(PopupGiftPremium, ctx.peer('private'), premiumGiftOptions);
    }
  },
  {
    id: 'stars/topup',
    title: 'Stars — top up',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/stars')
      ]);

      PopupElement.createPopup(PopupStars, {itemPrice: 500, onTopup: noop});
    }
  },
  {
    id: 'stars/balance',
    title: 'Stars — balance & history',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/stars')
      ]);

      PopupElement.createPopup(PopupStars);
    }
  },
  {
    id: 'makePaid',
    title: 'Make media paid',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupMakePaid}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/makePaid')
      ]);

      PopupElement.createPopup(PopupMakePaid, noop);
    }
  },
  {
    id: 'boost/channel',
    title: 'Boost a channel',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupBoost}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/boost')
      ]);

      PopupElement.createPopup(PopupBoost, ctx.peer('channel'));
    }
  }
]);
