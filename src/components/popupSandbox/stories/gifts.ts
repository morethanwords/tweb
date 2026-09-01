/*
 * Star gifts: the collectible's info card and everything reachable from it.
 *
 * Two fixtures carry the whole group — a plain `starGift` and an upgraded (unique) one with its
 * model/backdrop/pattern attributes. Popup modules are imported inside `open()` — see the note in
 * `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import {starGiftUpgradePreview, starGiftValueInfo} from '../fixtures';

defineStories('Star gifts', [
  {
    id: 'gift/send',
    title: 'Send a gift',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupSendGift}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/sendGift')
      ]);

      PopupElement.createPopup(PopupSendGift, {peerId: ctx.peer('private')});
    }
  },
  {
    id: 'gift/info',
    title: 'Gift info — collectible',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStarGiftInfo}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/starGiftInfo')
      ]);

      PopupElement.createPopup(PopupStarGiftInfo, {gift: ctx.uniqueGift()});
    }
  },
  {
    id: 'gift/info-plain',
    title: 'Gift info — not upgraded',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStarGiftInfo}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/starGiftInfo')
      ]);

      PopupElement.createPopup(PopupStarGiftInfo, {gift: ctx.gift()});
    }
  },
  {
    id: 'gift/wear',
    title: 'Wear a gift',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStarGiftWear}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/starGiftWear')
      ]);

      PopupElement.createPopup(PopupStarGiftWear, {gift: ctx.uniqueGift(), peerId: ctx.peer('self')}).show();
    }
  },
  {
    id: 'gift/value',
    fixtureOnly: true,
    title: 'Gift value',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStarGiftValue}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/starGiftValue')
      ]);

      PopupElement.createPopup(PopupStarGiftValue, {gift: ctx.uniqueGift(), value: starGiftValueInfo}).show();
    }
  },
  {
    id: 'gift/sell',
    title: 'List a gift for sale',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupSellStarGift}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/sellStarGift')
      ]);

      PopupElement.createPopup(PopupSellStarGift, {gift: ctx.uniqueGift(), allowUnlist: true});
    }
  },
  {
    id: 'gift/buyResale',
    title: 'Buy a resold gift',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupBuyResaleGift}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/buyResaleGift')
      ]);

      PopupElement.createPopup(PopupBuyResaleGift, {recipientId: ctx.peer('private'), gift: ctx.uniqueGift()}).show();
    }
  },
  {
    id: 'gift/upgrade',
    title: 'Upgrade a gift',
    open: async(ctx) => {
      const {default: createStarGiftUpgradePopup} = await import('@components/popups/starGiftUpgrade');
      await createStarGiftUpgradePopup({gift: ctx.gift()});
    }
  },
  {
    id: 'gift/upgradePrice',
    fixtureOnly: true,
    title: 'Upgrade price history',
    open: async(ctx) => {
      const {createStarGiftUpgradePricePopup} = await import('@components/popups/starGiftUpgradePrice');
      createStarGiftUpgradePricePopup({preview: starGiftUpgradePreview});
    }
  },
  {
    id: 'gift/transferConfirm',
    title: 'Transfer a gift — confirmation',
    open: async(ctx) => {
      const {transferStarGiftConfirmationPopup} = await import('@components/popups/transferStarGift');
      transferStarGiftConfirmationPopup({
        gift: ctx.uniqueGift(),
        recipient: ctx.peer('private'),
        handleSubmit: noop
      });
    }
  },
  {
    id: 'gift/offer',
    title: 'Offer to buy a gift',
    open: async(ctx) => {
      const {showCreateStarGiftOfferPopup} = await import('@components/popups/createStarGiftOffer');
      await showCreateStarGiftOfferPopup({gift: ctx.uniqueGift()});
    }
  },
  {
    id: 'gift/choose',
    title: 'Choose a gift from a profile',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupChooseGift}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/chooseGiftPopup')
      ]);

      PopupElement.createPopup(PopupChooseGift, {peerId: ctx.peer('self')}).show();
    }
  }
]);
