/*
 * Chat, moderation, invites and bot popups.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import {NOW, botUser} from '../fixtures';


const reportOptions = {
  _: 'reportResultChooseOption' as const,
  title: 'What is wrong with this message?',
  options: [
    {_: 'messageReportOption' as const, text: 'Spam', option: new Uint8Array([1])},
    {_: 'messageReportOption' as const, text: 'Violence', option: new Uint8Array([2])},
    {_: 'messageReportOption' as const, text: 'Other', option: new Uint8Array([3])}
  ]
};

const qrBackdrop = (backdrop_id: number, name: string, center_color: number, edge_color: number, pattern_color: number, text_color: number) => (
  {_: 'shareThemeBackdropOption', backdrop_id, name, center_color, edge_color, pattern_color, text_color}
);

/** A few of the colours the server serves for a share theme: the default, saturated, a light one and the tuned blue */
const QR_BACKDROPS = [
  qrBackdrop(1, 'Black', 0x363738, 0x0E0F0F, 0x000000, 0x8C8F91),
  qrBackdrop(2, 'Emerald', 0x4BCB97, 0x137F5D, 0x0A5A40, 0x127A58),
  qrBackdrop(3, 'Pink', 0xFF8FB3, 0xE0507C, 0xB22F5B, 0xC2305E),
  qrBackdrop(4, 'Neon Blue', 0x3FB1FF, 0x166ACE, 0x0F4FA0, 0x0075F1),
  qrBackdrop(5, 'Platinum', 0xE9ECEF, 0xB8BEC4, 0x8B9298, 0x4D5560),
  qrBackdrop(6, 'Ivory White', 0xFFFFFF, 0xE8E4DA, 0xCFC9BA, 0x6B665A),
  qrBackdrop(7, 'Violet', 0xA18BFF, 0x5B3FD4, 0x3B25A0, 0x4A2FC4),
  qrBackdrop(8, 'Orange', 0xFFB84D, 0xE0771A, 0xA85208, 0xB8600F),
  qrBackdrop(9, 'Crimson', 0xFF6B6B, 0xB3202E, 0x7C1320, 0xA01B29),
  qrBackdrop(10, 'Navy', 0x4D6FA8, 0x1C2F57, 0x111D38, 0x1E3566),
  qrBackdrop(11, 'Mint', 0xA8EBD2, 0x4FB594, 0x2F8068, 0x2A7B61),
  qrBackdrop(12, 'Sand', 0xE8CFA3, 0xB89560, 0x8A6A38, 0x7A5A2C)
];

const QR_PROFILE_ANSWERS = {
  getCachedShareTheme: () => ({_: 'shareThemeDefault'}),
  getShareThemeBackdrops: () => QR_BACKDROPS,
  getProfileByPeerId: (): undefined => undefined,
  setShareTheme: () => true
};

/** The emoji panel's presets are custom emoji of a set the fixtures do not have: the panel shows its own chrome only */
const QR_EMOJI_ANSWERS = {
  appStickersManager: {getStickerSet: (): {documents: any[]} => ({documents: []})},
  // the installed packs as the server lists them: none
  appEmojiManager: {getCustomEmojis: () => ({_: 'messages.allStickers', hash: 0, sets: [] as any[]}), getCachedCustomEmojiDocuments: (): any[] => []}
};

defineStories('Chat & moderation', [
  {
    id: 'toggleReadDate/lastSeen',
    title: 'Show last seen — premium upsell',
    open: async(ctx) => {
      const {default: showToggleReadDatePopup} = await import('@components/popups/toggleReadDate');
      showToggleReadDatePopup(ctx.peer('private'), 'lastSeen');
    }
  },
  {
    id: 'toggleReadDate/readTime',
    title: 'Show read time — premium upsell',
    open: async(ctx) => {
      const {default: showToggleReadDatePopup} = await import('@components/popups/toggleReadDate');
      showToggleReadDatePopup(ctx.peer('private'), 'readTime');
    }
  },
  {
    id: 'reactedList',
    title: 'Who reacted',
    managers: {
      appMessagesManager: {
        getGroupsFirstMessage: (message: unknown) => message,
        getMessageReactionsListAndReadParticipants: () => ({
          reactions: [],
          readParticipants: [],
          combined: []
        })
      }
    },
    open: async(ctx) => {
      const {default: showReactedListPopup} = await import('@components/popups/reactedList');
      showReactedListPopup(ctx.message('private'));
    }
  },
  {
    id: 'reactedList/read',
    title: 'Who read — no reactions',
    managers: (ctx) => {
      const readers = [ctx.peer('private'), ctx.peer('bot')];
      return {
        appMessagesManager: {
          getGroupsFirstMessage: (message: unknown) => message,
          canViewMessageReadParticipants: () => true,
          getMessageReadParticipants: () => readers.map((peerId, idx) => ({
            _: 'readParticipantDate',
            user_id: peerId.toUserId(),
            date: NOW - 60 * (idx + 1)
          })),
          getMessageReactionsListAndReadParticipants: () => ({
            reactions: [],
            readParticipantDates: [],
            combined: readers.map((peerId, idx) => ({peerId, date: NOW - 60 * (idx + 1)}))
          })
        },
        appReactionsManager: {
          canDeleteParticipantReactions: () => false
        }
      };
    },
    open: async(ctx) => {
      const {default: showReactedListPopup} = await import('@components/popups/reactedList');
      showReactedListPopup(ctx.message('private'));
    }
  },
  {
    id: 'deleteMegagroupMessages',
    title: 'Delete & ban — supergroup',
    open: async(ctx) => {
      const {default: showDeleteMegagroupMessagesPopup} = await import('@components/popups/deleteMegagroupMessages');
      showDeleteMegagroupMessagesPopup({
        messages: [{...ctx.message('private'), peerId: ctx.peer('supergroup'), fromId: ctx.peer('private')}]
      });
    }
  },
  {
    id: 'report/message',
    title: 'Report a message',
    managers: {
      appMessagesManager: {reportMessages: () => reportOptions}
    },
    open: async(ctx) => {
      const {showMessageReport} = await import('@components/popups/reportAd');
      showMessageReport(ctx.peer('supergroup'), [ctx.mid('private')]);
    }
  },
  {
    id: 'report/peer',
    title: 'Report a chat',
    managers: {
      appMessagesManager: {reportMessages: () => reportOptions}
    },
    open: async(ctx) => {
      const {showPeerReport} = await import('@components/popups/reportAd');
      showPeerReport(ctx.peer('supergroup'));
    }
  },
  {
    id: 'joinChatInvite',
    title: 'Join a chat by invite link',
    open: async(ctx) => {
      const {default: showJoinChatInvitePopup} = await import('@components/popups/joinChatInvite');
      showJoinChatInvitePopup('sandbox-hash', {
        _: 'chatInvite',
        pFlags: {channel: true, broadcast: true},
        title: 'Sandbox Invite Channel',
        about: 'A channel you have not joined yet',
        photo: {_: 'photoEmpty', id: '0'},
        participants_count: 4321,
        color: 0
      });
    }
  },
  {
    id: 'sharedFolderInvite',
    title: 'Shared folder invite',
    open: async(ctx) => {
      const {default: showSharedFolderInvitePopup} = await import('@components/popups/sharedFolderInvite');
      showSharedFolderInvitePopup({
        slug: 'sandbox-folder',
        chatlistInvite: {
          _: 'chatlists.chatlistInvite',
          pFlags: {},
          title: {_: 'textWithEntities', text: 'Sandbox Folder', entities: []},
          peers: [
            {_: 'peerChannel', channel_id: (-ctx.peer('channel')).toString()},
            {_: 'peerChannel', channel_id: (-ctx.peer('supergroup')).toString()}
          ],
          chats: [],
          users: []
        }
      });
    }
  },
  {
    id: 'contactDetails',
    title: 'Shared contact — vCard details',
    open: async() => {
      const [{default: showContactDetailsPopup}, {default: parseVcard}] = await Promise.all([
        import('@components/popups/contactDetails'),
        import('@helpers/parseVcard')
      ]);
      showContactDetailsPopup(parseVcard([
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:Appleseed;Johnny;;;',
        'ORG:Sandbox Inc.;',
        'TEL;TYPE=CELL:+1 555 010 0100',
        'TEL;TYPE=WORK:+1 555 010 0101',
        'EMAIL;TYPE=INTERNET:johnny@example.com',
        'ADR;TYPE=HOME:;;1 Infinite Loop;Cupertino;CA;95014;USA',
        'URL:https://example.com',
        'BDAY:1990-01-15',
        'NOTE:Call after 10:30',
        'END:VCARD'
      ].join('\r\n')));
    }
  },
  {
    id: 'myQrCode',
    title: 'My QR code',
    managers: {appProfileManager: QR_PROFILE_ANSWERS, ...QR_EMOJI_ANSWERS},
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('self'));
    }
  },
  {
    // a theme with emoji on a colour: the pattern turns and drifts, and the backdrop drags it
    id: 'myQrCodeEmoji',
    title: 'My QR code with emoji',
    managers: {
      appProfileManager: {
        ...QR_PROFILE_ANSWERS,
        getCachedShareTheme: () => ({
          _: 'shareThemeEmojiBackdrop',
          backdrop_id: 4,
          emojis: [{_: 'reactionEmoji', emoticon: '🚀'}, {_: 'reactionEmoji', emoticon: '⭐'}, {_: 'reactionEmoji', emoticon: '🔥'}]
        })
      },
      ...QR_EMOJI_ANSWERS
    },
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('self'));
    }
  },
  {
    // a message fee: the pill under the card takes it off with a temporary code
    id: 'myQrCodeFee',
    title: 'My QR code with a message fee',
    managers: {
      appProfileManager: QR_PROFILE_ANSWERS,
      ...QR_EMOJI_ANSWERS,
      appPrivacyManager: {
        getGlobalPrivacySettings: () => ({_: 'globalPrivacySettings', noncontact_peers_paid_stars: 250}),
        getPrivacy: () => []
      },
      appUsersManager: {
        getKeptNoPaidMessagesToken: () => null,
        setKeptNoPaidMessagesTokenPermanent: () => undefined,
        exportNoPaidMessagesToken: (params: {temporary?: boolean}) => ({
          _: 'exportedNoPaidMessagesToken',
          token: 'free123',
          url: 'https://t.me/durov?free=free123',
          expires: params?.temporary ? Math.floor(Date.now() / 1000) + 60 : undefined
        })
      }
    },
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('self'));
    }
  },
  {
    // somebody else's code: their theme, nothing to change
    id: 'myQrCodeOtherUser',
    title: 'QR code of another user',
    managers: {appProfileManager: QR_PROFILE_ANSWERS, ...QR_EMOJI_ANSWERS},
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('private'));
    }
  },
  {
    id: 'myQrCodeChannel',
    title: 'QR code of a channel',
    managers: {appProfileManager: QR_PROFILE_ANSWERS, ...QR_EMOJI_ANSWERS},
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('channel'));
    }
  },
  {
    id: 'linkQrCode',
    title: 'Invite by QR code',
    open: async() => {
      const {default: showLinkQrCodePopup} = await import('@components/popups/linkQrCode');
      showLinkQrCodePopup({
        url: 'https://t.me/call/AbCdEfGhIjKlMnOpQr',
        aboutLangKey: 'InviteLink.QRCode.InfoGroupCall'
      });
    }
  },
  {
    id: 'birthday',
    title: 'Set your birthday',
    open: async(ctx) => {
      const {default: showBirthdayPopup} = await import('@components/popups/birthday');
      await showBirthdayPopup({onSave: () => true});
    }
  },
  {
    id: 'ageVerification',
    title: 'Age verification',
    open: async(ctx) => {
      const {showAgeVerificationPopup} = await import('@components/popups/ageVerification');
      showAgeVerificationPopup({onVerify: noop});
    }
  },
  {
    id: 'webApp/locationAccess',
    title: 'Mini app wants your location',
    open: async(ctx) => {
      const {default: showWebAppLocationAccessPopup} = await import('@components/popups/webAppLocationAccess');
      showWebAppLocationAccessPopup({botId: ctx.peer('bot'), onFinish: noop});
    }
  },
  {
    id: 'addBotToChat',
    title: 'Add a bot to a group',
    managers: (ctx) => ({
      appUsersManager: {getUser: () => botUser},
      appProfileManager: {
        getProfile: () => ({
          _: 'userFull',
          pFlags: {bot_can_manage_emoji_status: true},
          id: ctx.peer('bot'),
          settings: {_: 'peerSettings', pFlags: {}},
          bot_group_admin_rights: {_: 'chatAdminRights', pFlags: {delete_messages: true}}
        })
      }
    }),
    open: async(ctx) => {
      const {default: showAddBotToChat} = await import('@components/popups/addBotToChat');
      await showAddBotToChat({botId: ctx.peer('bot').toUserId()});
    }
  },
  {
    id: 'createBot',
    title: 'Create a bot',
    open: async(ctx) => {
      const [{default: showCreateBotPopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/createBot'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      showCreateBotPopup({
        HotReloadGuard,
        requestingPeerId: ctx.peer('bot'),
        suggestedBotName: 'Sandbox Helper',
        suggestedUsername: 'sandbox_helper_bot',
        onCreate: () => true
      });
    }
  },
  {
    id: 'aiTone/create',
    title: 'AI editor — new tone',
    open: async(ctx) => {
      const [{default: showCreateTonePopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/aiEditorPopup/createTonePopup'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      showCreateTonePopup({HotReloadGuard, onSubmit: async() => {}});
    }
  },
  {
    id: 'aiTone/view',
    title: 'AI editor — view tone',
    open: async(ctx) => {
      const [{default: showViewTonePopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/aiEditorPopup/viewTonePopup'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      showViewTonePopup({
        HotReloadGuard,
        isSaved: true,
        savedTones: 1,
        tone: {
          _: 'aiComposeTone',
          pFlags: {},
          id: '1',
          title: 'Pirate',
          prompt: 'Rewrite the message as a pirate would say it.',
          access_hash: '1',
          slug: 'SandboxPirate',
          author_id: ctx.peer('self')
        }
      });
    }
  },
  {
    id: 'storiesStealthMode',
    title: 'Stories stealth mode',
    managers: {
      appStoriesManager: {getStealthMode: () => ({_: 'storiesStealthMode', pFlags: {}})}
    },
    open: async(ctx) => {
      const {default: showStoriesStealthModePopup} = await import('@components/popups/storiesStealthMode');
      await showStoriesStealthModePopup();
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
