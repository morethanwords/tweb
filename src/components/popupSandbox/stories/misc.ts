/*
 * The rest: composer popups, invites, mini apps, verification.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import {
  channelChat,
  checkedGiftCode,
  myBoosts,
  passwordState,
  selfUser,
  stickerDocument,
  storyItem,
  userFullWithRating
} from '../fixtures';

defineStories('Composer & bots', [
  {
    id: 'checklist',
    title: 'New checklist',
    open: async(ctx) => {
      const {default: showChecklistPopup} = await import('@components/popups/checklist');
      showChecklistPopup({chat: ctx.chat()});
    }
  },
  {
    id: 'musicSearch',
    title: 'Music picker',
    managers: {
      appSavedMusicManager: {getSavedMusic: () => ({documents: [] as any[], count: 0, isEnd: true})}
    },
    open: async(ctx) => {
      const {default: showMusicSearchPopup} = await import('@components/popups/musicSearch');
      showMusicSearchPopup({chat: ctx.chat()});
    }
  },
  {
    id: 'newMedia',
    title: 'Attach media',
    open: async(ctx) => {
      const {default: PopupElement} = await import('@components/popups');
      const {default: PopupNewMedia} = await import('@components/popups/newMedia');
      // A 1×1 PNG is enough to drive the whole attach flow without shipping a binary fixture.
      const bytes = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      ), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'sandbox.png', {type: 'image/png'});
      PopupElement.createPopup(PopupNewMedia, ctx.chat(), [file], 'media');
    }
  },
  {
    id: 'stickers',
    fixtureOnly: true,
    title: 'Sticker set preview',
    managers: {
      appStickersManager: {
        getStickerSet: () => ({
          set: {
            _: 'stickerSet',
            pFlags: {},
            id: '8001',
            access_hash: '8001',
            title: 'Sandbox Stickers',
            short_name: 'sandbox_stickers',
            count: 1,
            hash: 0
          },
          documents: [stickerDocument],
          packs: []
        })
      }
    },
    open: async(ctx) => {
      const {default: showStickersPopup} = await import('@components/popups/stickers');
      showStickersPopup({_: 'inputStickerSetShortName', short_name: 'sandbox_stickers'});
    }
  },
  {
    id: 'translate',
    title: 'Translate a message',
    managers: {
      appTranslationsManager: {
        translateText: () => [{_: 'textWithEntities', text: 'Переведённый текст', entities: []}]
      }
    },
    open: async(ctx) => {
      const [{openTranslatePopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/translate'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      openTranslatePopup({
        peerId: ctx.peer('private'),
        message: ctx.message('private'),
        detectedLanguage: 'en'
      }, HotReloadGuard);
    }
  },
  {
    id: 'aiEditor',
    title: 'AI editor',
    open: async(ctx) => {
      const [{openAiEditorPopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/aiEditorPopup'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      openAiEditorPopup({
        peerId: ctx.peer('private'),
        text: {_: 'textWithEntities', text: 'a draft the editor will rewrite', entities: []},
        onApply: noop
      }, HotReloadGuard);
    }
  },
  {
    // Both of these host an <iframe>. Pointed at the dev server's own root so the sandbox stays
    // off the network — the popup chrome (header, menu, close confirmation) is what a story here
    // is for, not the bot's page.
    id: 'webApp/miniApp',
    fixtureOnly: true,
    title: 'Mini app',
    managers: (ctx) => ({
      appProfileManager: {
        getProfile: () => ({
          _: 'userFull',
          pFlags: {},
          id: ctx.peer('bot'),
          settings: {_: 'peerSettings', pFlags: {}},
          bot_info: {_: 'botInfo', pFlags: {}, user_id: ctx.peer('bot'), description: 'A sandbox mini app'}
        })
      }
    }),
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupWebApp}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/webApp')
      ]);

      PopupElement.createPopup(PopupWebApp, {
        webViewResultUrl: {_: 'webViewResultUrl', pFlags: {}, query_id: '1', url: location.origin + '/'},
        webViewOptions: {botId: ctx.peer('bot').toUserId(), peerId: ctx.peer('private')}
      });
    }
  },
  {
    id: 'payment/verification',
    fixtureOnly: true,
    title: 'Payment verification (3-D Secure)',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupPaymentVerification}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentVerification')
      ]);

      PopupElement.createPopup(PopupPaymentVerification, location.origin + '/').show();
    }
  },
  {
    id: 'webApp/preparedMessage',
    fixtureOnly: true,
    title: 'Mini app wants to share a message',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupWebAppPreparedMessage}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/webAppPreparedMessage')
      ]);

      PopupElement.createPopup(PopupWebAppPreparedMessage, {
        botId: ctx.peer('bot').toUserId(),
        message: {
          _: 'messages.preparedInlineMessage',
          query_id: '1',
          result: {
            _: 'botInlineResult',
            id: '1',
            type: 'article',
            title: 'A prepared message',
            description: 'sent on the bot’s behalf',
            send_message: {
              _: 'botInlineMessageText',
              pFlags: {},
              message: 'Sent from a mini app'
            }
          },
          peer_types: [{_: 'inlineQueryPeerTypePM'}],
          cache_time: 300,
          users: []
        }
      }).show();
    }
  },
  {
    id: 'webApp/emojiStatusAccess',
    fixtureOnly: true,
    title: 'Mini app wants to set your emoji status',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupWebAppEmojiStatusAccess}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/webAppEmojiStatusAccess')
      ]);

      PopupElement.createPopup(PopupWebAppEmojiStatusAccess, {
        botId: ctx.peer('bot'),
        sticker: stickerDocument,
        period: 3600
      }).show();
    }
  }
]);

defineStories('Boosts & invites', [
  {
    id: 'giftLink',
    fixtureOnly: true,
    title: 'Gift code link',
    managers: {
      appPaymentsManager: {checkGiftCode: () => checkedGiftCode}
    },
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupGiftLink}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/giftLink')
      ]);

      PopupElement.createPopup(PopupGiftLink, 'sandbox-gift-code');
    }
  },
  {
    id: 'reassignBoost',
    fixtureOnly: true,
    title: 'Reassign a boost',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupReassignBoost}, {mockAppConfig}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/reassignBoost'),
        import('../mockManagers')
      ]);

      PopupElement.createPopup(PopupReassignBoost, ctx.peer('channel'), myBoosts, mockAppConfig);
    }
  },
  {
    id: 'boostsViaGifts',
    title: 'Boost via a giveaway',
    managers: {
      appPaymentsManager: {
        getPremiumGiftCodeOptions: () => [] as any[],
        getStarsGiveawayOptions: () => [] as any[]
      },
      appProfileManager: {getChannelFull: () => ({_: 'channelFull', pFlags: {}, id: channelChat.id})}
    },
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupBoostsViaGifts}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/boostsViaGifts')
      ]);

      PopupElement.createPopup(PopupBoostsViaGifts, ctx.peer('channel'));
    }
  },
  {
    id: 'chooseStory',
    title: 'Choose a story for an album',
    managers: {
      appStoriesManager: {
        getStoriesArchive: () => ({count: 1, stories: [storyItem], pinnedToTop: undefined as any[]}),
        getPinnedStories: () => ({count: 1, stories: [storyItem], pinnedToTop: undefined as any[]}),
        cantPinDeleteStories: () => ({cantPin: false, cantDelete: false}),
        getAlbums: () => [] as any[],
        hasRights: () => true,
        hasRightsMany: () => true
      }
    },
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupChooseStory}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/chooseStoryPopup')
      ]);

      PopupElement.createPopup(PopupChooseStory, {peerId: ctx.peer('self'), albumId: 1}).show();
    }
  }
]);

defineStories('Stars & payments (more)', [
  {
    id: 'starsRating',
    fixtureOnly: true,
    title: 'Stars rating',
    open: async(ctx) => {
      const {default: showStarsRatingPopup} = await import('@components/popups/starsRating');
      showStarsRatingPopup({user: selfUser, userFull: userFullWithRating});
    }
  },
  {
    id: 'starReaction',
    title: 'Send a paid (star) reaction',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStarReaction}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/starReaction')
      ]);

      PopupElement.createPopup(PopupStarReaction, ctx.peer('channel'), ctx.mid('private'), ctx.chat());
    }
  },
  {
    // `PopupPayment.create` is the real entry: it resolves the form, then picks the card popup or
    // the Stars one from its type. Both stories go through it so that choice is exercised too.
    id: 'payment/invoice',
    fixtureOnly: true,
    title: 'Invoice checkout',
    open: async(ctx) => {
      const [{default: PopupPayment}, {paymentForm}] = await Promise.all([
        import('@components/popups/payment'),
        import('../fixtures')
      ]);

      await PopupPayment.create({
        paymentForm,
        inputInvoice: {_: 'inputInvoiceMessage', peer: {_: 'inputPeerSelf'}, msg_id: ctx.mid('private')}
      });
    }
  },
  {
    id: 'payment/starsPay',
    fixtureOnly: true,
    title: 'Pay with Stars',
    open: async(ctx) => {
      const [{default: PopupPayment}, {starsPaymentForm}] = await Promise.all([
        import('@components/popups/payment'),
        import('../fixtures')
      ]);

      await PopupPayment.create({
        paymentForm: starsPaymentForm,
        inputInvoice: {_: 'inputInvoiceMessage', peer: {_: 'inputPeerSelf'}, msg_id: ctx.mid('private')}
      });
    }
  },
  {
    id: 'payment/cardConfirmation',
    fixtureOnly: true,
    title: 'Confirm a saved card',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupPaymentCardConfirmation}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentCardConfirmation')
      ]);

      PopupElement.createPopup(PopupPaymentCardConfirmation, 'Visa •••• 4242', passwordState).show();
    }
  },
  {
    id: 'emailSetup',
    fixtureOnly: true,
    title: 'Add a login email',
    open: async(ctx) => {
      const {showEmailSetupPopup} = await import('@components/popups/emailSetup');
      showEmailSetupPopup({purpose: {_: 'emailVerifyPurposeLoginChange'}, noskip: false});
    }
  }
]);
