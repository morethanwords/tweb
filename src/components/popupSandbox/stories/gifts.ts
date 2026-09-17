/*
 * Star gifts: the collectible's info card and everything reachable from it.
 *
 * Two fixtures carry the whole group — a plain `starGift` and an upgraded (unique) one with its
 * model/backdrop/pattern attributes. Popup modules are imported inside `open()` — see the note in
 * `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import type {PopupStoryContext} from '@components/popupSandbox/context';
import {starGiftUpgradePreview, starGiftValueInfo} from '../fixtures';

defineStories('Star gifts', [
  {
    id: 'gift/send',
    title: 'Send a gift',
    open: async(ctx) => {
      const {default: showSendGiftPopup} = await import('@components/popups/sendGift');
      showSendGiftPopup({peerId: ctx.peer('private')});
    }
  },
  {
    id: 'gift/info',
    title: 'Gift info — collectible',
    open: async(ctx: PopupStoryContext) => {
      const {default: showStarGiftInfoPopup} = await import('@components/popups/starGiftInfo');

      showStarGiftInfoPopup({gift: ctx.uniqueGift()});
    }
  },
  ...[false, true].map((catalog) => ({
    id: catalog ? 'gift/info-catalog' : 'gift/info-plain',
    title: catalog ? 'Gift info — unsaved catalogue gift' : 'Gift info — not upgraded',
    open: async(ctx: PopupStoryContext) => {
      const {default: showStarGiftInfoPopup} = await import('@components/popups/starGiftInfo');

      const gift = ctx.gift();
      showStarGiftInfoPopup({
        gift: catalog ? {...gift, saved: undefined, input: undefined, isIncoming: false, ownerId: undefined} : gift
      });
    }
  })),
  {
    id: 'gift/wear',
    title: 'Wear a gift',
    open: async(ctx) => {
      const {default: showStarGiftWearPopup} = await import('@components/popups/starGiftWear');
      showStarGiftWearPopup({gift: ctx.uniqueGift(), peerId: ctx.peer('self')});
    }
  },
  {
    id: 'gift/value',
    fixtureOnly: true,
    title: 'Gift value',
    open: async(ctx) => {
      const {default: showStarGiftValuePopup} = await import('@components/popups/starGiftValue');
      showStarGiftValuePopup({gift: ctx.uniqueGift(), value: starGiftValueInfo});
    }
  },
  {
    id: 'gift/sell',
    title: 'List a gift for sale',
    open: async(ctx) => {
      const {default: showSellStarGiftPopup} = await import('@components/popups/sellStarGift');
      showSellStarGiftPopup({gift: ctx.uniqueGift(), allowUnlist: true});
    }
  },
  {
    id: 'gift/buyResale',
    title: 'Buy a resold gift',
    open: async(ctx) => {
      const {default: showBuyResaleGiftPopup} = await import('@components/popups/buyResaleGift');
      showBuyResaleGiftPopup({recipientId: ctx.peer('private'), gift: ctx.uniqueGift()});
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
    // the same popup as above, but paid for someone else: every line switches to the `...For` /
    // `...Prepaid` strings, which put the recipient's name where "you" would otherwise be
    id: 'gift/upgradePrepaid',
    title: 'Upgrade a gift — paid for someone else',
    open: async(ctx) => {
      const {default: createStarGiftUpgradePopup} = await import('@components/popups/starGiftUpgrade');
      await createStarGiftUpgradePopup({gift: ctx.gift(), descriptionForPeerId: ctx.peer('private')});
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
      const {default: showChooseGiftPopup} = await import('@components/popups/chooseGiftPopup');
      showChooseGiftPopup({peerId: ctx.peer('self'), onFinish: () => {}});
    }
  }
]);
