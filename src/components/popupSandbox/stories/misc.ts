/*
 * The rest: composer popups, invites, mini apps, verification.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import browserStyles from '@components/browser.module.scss';
import {defineStories, PopupStory} from '../registry';

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
      // a real photo: a real preview size also exercises the edit/spoiler/delete controls
      const {CHAT_INPUT_EDITOR_TEST_MEDIA_URL} = await import('@components/chat/inputEditor/testData');
      const response = await fetch(CHAT_INPUT_EDITOR_TEST_MEDIA_URL);
      if(!response.ok) throw new Error('Sandbox media fixture could not be loaded');
      const file = new File([await response.blob()], 'sandbox-photo.jpg', {type: 'image/jpeg'});
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
  // the ⋮ menu offers Archive for an added set; an archived one is offered to be added back
  ...(['new', 'added', 'archived'] as const).map((state): Omit<PopupStory, 'group'> => ({
    id: state === 'new' ? 'stickers' : `stickers/${state}`,
    fixtureOnly: true,
    title: {new: 'Sticker set preview', added: 'Added sticker set', archived: 'Archived sticker set'}[state],
    managers: {
      appStickersManager: {
        getStickerSet: () => ({
          set: {
            _: 'stickerSet',
            pFlags: state === 'archived' ? {archived: true} : {},
            id: '8001',
            access_hash: '8001',
            title: 'Sandbox Stickers',
            short_name: 'sandbox_stickers',
            count: 1,
            hash: 0,
            // an archived set keeps its installed_date
            installed_date: state === 'new' ? undefined : 1700000000
          },
          documents: [stickerDocument],
          packs: []
        })
      }
    },
    open: async() => {
      const {default: showStickersPopup} = await import('@components/popups/stickers');
      showStickersPopup({_: 'inputStickerSetShortName', short_name: 'sandbox_stickers'});
    }
  })),
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
    // layer 229 in a page: rows of buttons, buttons inside the text, a folded quote, a compact
    // table. Read outside a message, only links, copying and profiles act; a callback is inert.
    id: 'instantView/layer229',
    title: 'Instant View — buttons and folded quotes',
    // a page opens in the in-app browser, not in a popup; the page itself is made up
    surface: `.${browserStyles.Browser}`,
    fixtureOnly: true,
    open: async() => {
      const [{openInstantViewInAppBrowser, closeInAppBrowser}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/browser'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);
      const text = (value: string) => ({_: 'textPlain' as const, text: value});
      const cell = (value: string) => ({_: 'pageTableCell' as const, pFlags: {}, text: text(value)});
      openInstantViewInAppBrowser({
        cachedPage: {
          _: 'page',
          pFlags: {},
          url: 'https://telegram.org/sandbox',
          photos: [],
          documents: [],
          views: 0,
          blocks: [
            {_: 'pageBlockTitle', text: text('Buttons in a page')},
            {_: 'pageBlockParagraph', text: {_: 'textConcat', texts: [
              text('Read '),
              {_: 'textButton', text: text('the docs'), type: {_: 'inlineButtonTypeUrl', url: 'https://core.telegram.org'}},
              text(' or '),
              {
                _: 'textButton',
                text: text('copy the code'),
                type: {_: 'inlineButtonTypeCopy', copy_text: 'TELEGRAM'},
                style: {_: 'richButtonStyle', pFlags: {link: true}}
              },
              text(' — both work anywhere.')
            ]}},
            {_: 'pageBlockButtonRow', pFlags: {}, buttons: [
              {
                _: 'pageButton',
                text: text('Open site'),
                type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'},
                style: {_: 'richButtonStyle', pFlags: {bg_primary: true}}
              },
              {_: 'pageButton', text: text('Copy'), type: {_: 'inlineButtonTypeCopy', copy_text: 'TELEGRAM'}},
              {_: 'pageButton', text: text('Vote'), type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}}
            ]},
            {_: 'pageBlockButtonRow', pFlags: {align_right: true}, buttons: [
              {
                _: 'pageButton',
                text: text('Accept'),
                type: {_: 'inlineButtonTypeDisabled'},
                style: {_: 'richButtonStyle', pFlags: {bg_success: true}}
              },
              {
                _: 'pageButton',
                text: text('Decline'),
                type: {_: 'inlineButtonTypeCopy', copy_text: 'no'},
                style: {_: 'richButtonStyle', pFlags: {bg_danger: true}}
              }
            ]},
            {
              _: 'pageBlockBlockquote',
              pFlags: {collapsed: true},
              text: text('A folded quote keeps a few lines in sight.\nThe rest waits for a click.\nLine three.\nLine four.\nLine five.'),
              caption: text('Author')
            },
            {_: 'pageBlockTable', pFlags: {bordered: true, compact: true}, title: text('Compact table'), rows: [
              {_: 'pageTableRow', cells: [cell('One'), cell('Two')]},
              {_: 'pageTableRow', cells: [cell('Three'), cell('Four')]}
            ]}
          ]
        },
        HotReloadGuardProvider: HotReloadGuard
      });
      return closeInAppBrowser;
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
