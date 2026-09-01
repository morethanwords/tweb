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

defineStories('Chat & moderation', [
  {
    id: 'toggleReadDate/lastSeen',
    title: 'Show last seen — premium upsell',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupToggleReadDate}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/toggleReadDate')
      ]);

      PopupElement.createPopup(PopupToggleReadDate, ctx.peer('private'), 'lastSeen');
    }
  },
  {
    id: 'toggleReadDate/readTime',
    title: 'Show read time — premium upsell',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupToggleReadDate}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/toggleReadDate')
      ]);

      PopupElement.createPopup(PopupToggleReadDate, ctx.peer('private'), 'readTime');
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
      const [{default: PopupElement}, {default: PopupReactedList}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/reactedList')
      ]);

      PopupElement.createPopup(PopupReactedList, ctx.message('private'));
    }
  },
  {
    id: 'deleteMegagroupMessages',
    title: 'Delete & ban — supergroup',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupDeleteMegagroupMessages}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/deleteMegagroupMessages')
      ]);

      PopupElement.createPopup(PopupDeleteMegagroupMessages, {
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
      const [{default: PopupElement}, {default: PopupJoinChatInvite}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/joinChatInvite')
      ]);

      PopupElement.createPopup(PopupJoinChatInvite, 'sandbox-hash', {
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
      const [{default: PopupElement}, {default: PopupSharedFolderInvite}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/sharedFolderInvite')
      ]);

      PopupElement.createPopup(PopupSharedFolderInvite, {
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
    id: 'avatar/crop',
    title: 'Avatar cropper',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupAvatar}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/avatar')
      ]);

      PopupElement.createPopup(PopupAvatar).show();
    }
  },
  {
    id: 'myQrCode',
    title: 'My QR code',
    open: async(ctx) => {
      const {default: showMyQrCodePopup} = await import('@components/popups/myQrCode');
      await showMyQrCodePopup(ctx.peer('self'));
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
      const [{default: PopupElement}, {AgeVerificationPopup}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/ageVerification')
      ]);

      PopupElement.createPopup(AgeVerificationPopup, {onVerify: noop}).show();
    }
  },
  {
    id: 'webApp/locationAccess',
    title: 'Mini app wants your location',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupWebAppLocationAccess}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/webAppLocationAccess')
      ]);

      PopupElement.createPopup(PopupWebAppLocationAccess, {botId: ctx.peer('bot')}).show();
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
          creator_id: ctx.peer('self'),
          date: NOW,
          examples: []
        } as any
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
