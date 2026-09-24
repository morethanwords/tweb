/*
 * The rest: composer popups, invites, mini apps, verification.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';

import {
  EMBEDDED_PAGE_URL,
  channelChat,
  checkedGiftCode,
  myBoosts,
  passwordState,
  premiumGiftOptions,
  selfUser,
  starsGiveawayOptions,
  stickerDocument,
  storyItem,
  userFullWithRating
} from '../fixtures';

defineStories('Live streams', [false, true].map((active) => ({
  id: `rtmp/${active ? 'active' : 'start'}`,
  fixtureOnly: true,
  title: active ? 'Live stream settings' : 'Start a live stream',
  managers: {
    appGroupCallsManager: {
      fetchRtmpUrl: (_peerId: PeerId, revoke: boolean) => ({
        url: 'rtmp://localhost/sandbox',
        key: revoke ? 'sandbox-revoked-key' : 'sandbox-stream-key'
      })
    }
  },
  open: async(ctx) => {
    const {showRtmpStartStreamPopup} = await import('@components/rtmp/adminPopup');
    showRtmpStartStreamPopup({peerId: ctx.peer('channel'), active, onEndStream: noop});
  }
})));

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
    fixtureOnly: true,
    title: 'Attach media',
    open: async(ctx) => {
      const {default: showNewMediaPopup} = await import('@components/popups/newMedia');
      // A real preview size also exercises the edit/spoiler/delete controls.
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const painter = canvas.getContext('2d');
      painter.fillStyle = '#315d99';
      painter.fillRect(0, 0, canvas.width, canvas.height);
      painter.fillStyle = '#fff';
      painter.font = '32px sans-serif';
      painter.fillText('Local media preview', 40, 180);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = new File([blob], 'sandbox-a11y.png', {type: 'image/png'});
      showNewMediaPopup(ctx.chat(), [file], 'media');
    }
  },
  {
    id: 'newMedia/video',
    fixtureOnly: true,
    title: 'Attach video',
    open: async(ctx) => {
      const {default: showNewMediaPopup} = await import('@components/popups/newMedia');
      const {default: url} = await import('@/tests/fixtures/ephemeralBot/media/video.mp4?url');
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'sandbox-video.mp4', {type: 'video/mp4'});
      showNewMediaPopup(ctx.chat(), [file], 'media');
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
    // A local document tests the iframe chrome without booting another Telegram client.
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
      const {default: showWebAppPopup} = await import('@components/popups/webApp');
      showWebAppPopup({
        webViewResultUrl: {_: 'webViewResultUrl', pFlags: {}, query_id: '1', url: EMBEDDED_PAGE_URL},
        webViewOptions: {botId: ctx.peer('bot').toUserId(), peerId: ctx.peer('private')}
      });
    }
  },
  {
    id: 'payment/verification',
    fixtureOnly: true,
    title: 'Payment verification (3-D Secure)',
    open: async(ctx) => {
      const {default: showPaymentVerificationPopup} = await import('@components/popups/paymentVerification');
      showPaymentVerificationPopup({url: EMBEDDED_PAGE_URL});
    }
  },
  {
    id: 'webApp/preparedMessage',
    fixtureOnly: true,
    title: 'Mini app wants to share a message',
    open: async(ctx) => {
      const {default: showWebAppPreparedMessagePopup} = await import('@components/popups/webAppPreparedMessage');
      showWebAppPreparedMessagePopup({
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
      });
    }
  },
  {
    id: 'webApp/emojiStatusAccess',
    fixtureOnly: true,
    title: 'Mini app wants to set your emoji status',
    open: async(ctx) => {
      const {default: showWebAppEmojiStatusAccessPopup} = await import('@components/popups/webAppEmojiStatusAccess');
      showWebAppEmojiStatusAccessPopup({
        botId: ctx.peer('bot'),
        sticker: stickerDocument,
        period: 3600,
        onFinish: noop
      });
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
      const {default: showGiftLinkPopup} = await import('@components/popups/giftLink');
      showGiftLinkPopup('sandbox-gift-code');
    }
  },
  {
    id: 'reassignBoost',
    fixtureOnly: true,
    title: 'Reassign a boost',
    open: async(ctx) => {
      const [{default: showReassignBoostPopup}, {mockAppConfig}] = await Promise.all([
        import('@components/popups/reassignBoost'),
        import('../mockManagers')
      ]);

      showReassignBoostPopup(ctx.peer('channel'), myBoosts, mockAppConfig);
    }
  },
  {
    id: 'boostsViaGifts',
    title: 'Boost via a giveaway',
    managers: {
      appPaymentsManager: {
        getPremiumGiftCodeOptions: () => premiumGiftOptions,
        getStarsGiveawayOptions: () => starsGiveawayOptions
      },
      appProfileManager: {getChannelFull: () => ({_: 'channelFull', pFlags: {}, id: channelChat.id})}
    },
    open: async(ctx) => {
      const {default: showBoostsViaGiftsPopup} = await import('@components/popups/boostsViaGifts');
      showBoostsViaGiftsPopup(ctx.peer('channel'));
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
      const {default: showChooseStoryPopup} = await import('@components/popups/chooseStoryPopup');
      showChooseStoryPopup({peerId: ctx.peer('self'), albumId: 1, onFinish: noop});
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
      const {default: showStarReactionPopup} = await import('@components/popups/starReaction');
      showStarReactionPopup(ctx.peer('channel'), ctx.mid('channel'), ctx.chat());
    }
  },
  {
    // `createPaymentPopup` is the real entry: it resolves the form, then picks the card popup or
    // the Stars one from its type. Both stories go through it so that choice is exercised too.
    id: 'payment/invoice',
    fixtureOnly: true,
    title: 'Invoice checkout',
    open: async(ctx) => {
      const [{createPaymentPopup}, {paymentForm}] = await Promise.all([
        import('@components/popups/payment'),
        import('../fixtures')
      ]);

      await createPaymentPopup({
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
      const [{createPaymentPopup}, {starsPaymentForm}] = await Promise.all([
        import('@components/popups/payment'),
        import('../fixtures')
      ]);

      await createPaymentPopup({
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
      const {default: showPaymentCardConfirmationPopup} = await import('@components/popups/paymentCardConfirmation');
      showPaymentCardConfirmationPopup({card: 'Visa •••• 4242', passwordState});
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
