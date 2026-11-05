/*
 * Confirmation-style popups: a title, a line of copy and one destructive button.
 *
 * Popup modules are imported inside `open()`, never at the top: the popup graph has import cycles
 * (mute → peer → … → mute), and pulling a mid-cycle module in first leaves a base class in its
 * temporal dead zone. Starting the graph at the leaf the story actually opens always resolves.
 */

import noop from '@helpers/noop';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import showPeerPopup from '@components/popups/peer';
import {defineStories} from '../registry';

defineStories('Confirmations', [
  {
    id: 'peer/basic',
    title: 'PopupPeer — title + description',
    open: async(ctx) => {
      showPeerPopup('popup-sandbox', {
        peerId: ctx.peer('private'),
        titleLangKey: 'AppName',
        descriptionLangKey: 'Chat.Message.Sponsored.What',
        buttons: [{langKey: 'OK', isDanger: true}]
      });
    }
  },
  {
    id: 'peer/with-checkbox',
    title: 'PopupPeer — with a checkbox',
    open: async(ctx) => {
      showPeerPopup('popup-sandbox', {
        peerId: ctx.peer('supergroup'),
        titleLangKey: 'DeleteChatUser',
        descriptionLangKey: 'AreYouSureDeleteThisChatWithUser',
        descriptionLangArgs: ['Alice'],
        checkboxes: [{text: 'DeleteMessagesOption'}],
        buttons: [{langKey: 'Delete', isDanger: true}]
      });
    }
  },
  {
    id: 'confirmation/generic',
    title: 'confirmationPopup()',
    open: async(ctx) => {
      const {default: confirmationPopup} = await import('@components/confirmationPopup');
      confirmationPopup({
        titleLangKey: 'UnsavedChanges',
        descriptionLangKey: 'UnsavedChangesDescription',
        button: {langKey: 'Discard', isDanger: true}
      }).catch(noop);
    }
  },
  {
    id: 'simpleConfirmation',
    title: 'SimpleConfirmationPopup (auth flow)',
    open: async(ctx) => {
      const {default: simpleConfirmation} = await import('@components/popups/simpleConfirmation');
      simpleConfirmation({
        titleLangKey: 'LogOut',
        descriptionLangKey: 'LogOut.Description',
        button: {langKey: 'LogOut', isDanger: true}
      }).catch(noop);
    }
  },
  {
    id: 'deleteMessages/private',
    title: 'Delete messages — private chat',
    managers: (ctx) => ({
      appPeersManager: {isBot: () => false, isMegagroup: () => false},
      appMessagesManager: {getMessageByPeer: () => ctx.message('private'), canDeleteMessage: () => true}
    }),
    open: async(ctx) => {
      const {default: showDeleteMessagesPopup} = await import('@components/popups/deleteMessages');
      const {ChatType} = await import('@components/chat/chatType');
      showDeleteMessagesPopup(ctx.peer('private'), [ctx.mid('private')], ChatType.Chat);
    }
  },
  {
    id: 'deleteContacts/one',
    title: 'Delete a contact',
    open: async(ctx) => {
      const {default: confirmDeleteContacts} = await import('@components/popups/deleteContacts');
      confirmDeleteContacts([ctx.peer('private')]).catch(noop);
    }
  },
  {
    id: 'deleteContacts/several',
    title: 'Delete several contacts',
    open: async(ctx) => {
      const {default: confirmDeleteContacts} = await import('@components/popups/deleteContacts');
      confirmDeleteContacts([ctx.peer('private'), ctx.peer('bot')]).catch(noop);
    }
  },
  {
    id: 'deleteDialog/private',
    title: 'Delete chat — private',
    managers: {
      appPeersManager: {isSavedDialog: () => false, getDialogType: () => 'chat'}
    },
    open: async(ctx) => {
      const {default: showDeleteDialogPopup} = await import('@components/popups/deleteDialog');
      showDeleteDialogPopup(ctx.peer('private'));
    }
  },
  {
    id: 'deleteDialog/channel',
    title: 'Leave channel',
    managers: {
      appPeersManager: {isSavedDialog: () => false, getDialogType: () => 'channel'}
    },
    open: async(ctx) => {
      const {default: showDeleteDialogPopup} = await import('@components/popups/deleteDialog');
      showDeleteDialogPopup(ctx.peer('channel'));
    }
  },
  {
    id: 'blockUser/fromReplies',
    title: 'Block the one who replied — from the Replies chat',
    open: async(ctx) => {
      const {default: blockUserWithConfirmation} = await import('@components/blockUser');
      blockUserWithConfirmation({peerId: ctx.peer('private'), fromRepliesMid: ctx.mid('private')}).catch(noop);
    }
  },
  {
    id: 'sendNow/one',
    title: 'Send scheduled message now',
    open: async(ctx) => {
      const {default: showSendNowPopup} = await import('@components/popups/sendNow');
      showSendNowPopup(ctx.peer('private'), [ctx.mid('private')]);
    }
  },
  {
    id: 'unpinMessage/one',
    title: 'Unpin message',
    managers: {
      appPeersManager: {canPinMessage: () => true}
    },
    open: async(ctx) => {
      const {default: showPinMessagePopup} = await import('@components/popups/unpinMessage');
      showPinMessagePopup(ctx.peer('supergroup'), ctx.mid('private'), true);
    }
  },
  {
    id: 'pinMessage/one',
    title: 'Pin message',
    managers: {
      appPeersManager: {canPinMessage: () => true, isBroadcast: () => false}
    },
    open: async(ctx) => {
      const {default: showPinMessagePopup} = await import('@components/popups/unpinMessage');
      showPinMessagePopup(ctx.peer('supergroup'), ctx.mid('private'));
    }
  },
  {
    id: 'mute/peer',
    title: 'Mute chat',
    managers: {
      appNotificationsManager: {isPeerSoundOff: () => false}
    },
    open: async(ctx) => {
      const {default: showMutePopup} = await import('@components/popups/mute');
      showMutePopup(ctx.peer('private'));
    }
  },
  {
    id: 'mute/peer-sound-off',
    title: 'Mute chat — its sound off',
    managers: {
      appNotificationsManager: {isPeerSoundOff: () => true}
    },
    open: async(ctx) => {
      const {default: showMutePopup} = await import('@components/popups/mute');
      showMutePopup(ctx.peer('private'));
    }
  },
  {
    id: 'sponsored/what-is-this',
    title: 'What are sponsored messages?',
    open: async(ctx) => {
      const {default: showSponsoredPopup} = await import('@components/popups/sponsored');
      showSponsoredPopup();
    }
  },
  {
    id: 'logOut',
    title: 'Log out',
    open: async(ctx) => {
      const {default: showLogOutPopup} = await import('@components/popups/logOut');
      showLogOutPopup();
    }
  },
  {
    id: 'convertToGigagroup',
    title: 'Convert group to broadcast group',
    open: async(ctx) => {
      const {default: showConvertToGigagroupPopup} = await import('@components/popups/convertToGigagroup');
      showConvertToGigagroupPopup(ctx.peer('group').toChatId()).catch(noop);
    }
  },
  {
    id: 'requestPeer/confirm/plain',
    title: 'Send a group to a bot',
    open: async(ctx) => {
      const {showRequestPeerConfirmation} = await import('@components/popups/requestPeer');
      showRequestPeerConfirmation({
        peerType: {_: 'requestPeerTypeChat', pFlags: {}},
        requestingPeerId: ctx.peer('bot'),
        requestedPeerIds: [ctx.peer('supergroup')]
      }).catch(noop);
    }
  },
  {
    id: 'requestPeer/confirm/addBot',
    title: 'Send groups to a bot — the bot joins the one it is not in',
    open: async(ctx) => {
      const {showRequestPeerConfirmation} = await import('@components/popups/requestPeer');
      showRequestPeerConfirmation({
        peerType: {_: 'requestPeerTypeChat', pFlags: {bot_participant: true}},
        requestingPeerId: ctx.peer('bot'),
        requestedPeerIds: [ctx.peer('group'), ctx.peer('supergroup')],
        botChatIds: [ctx.peer('group').toChatId()]
      }).catch(noop);
    }
  },
  {
    id: 'requestPeer/confirm/adminRights',
    title: 'Send a channel to a bot — the bot becomes its admin',
    open: async(ctx) => {
      const {showRequestPeerConfirmation} = await import('@components/popups/requestPeer');
      showRequestPeerConfirmation({
        peerType: {
          _: 'requestPeerTypeBroadcast',
          pFlags: {},
          bot_admin_rights: {
            _: 'chatAdminRights',
            pFlags: {change_info: true, post_messages: true, delete_messages: true, other: true, add_admins: true}
          }
        },
        requestingPeerId: ctx.peer('bot'),
        requestedPeerIds: [ctx.peer('channel')]
      }).catch(noop);
    }
  },
  {
    id: 'requestPhone/bot',
    title: 'Share the phone number with a bot',
    open: async(ctx) => {
      const {default: requestPhone} = await import('@components/requestPhone');
      requestPhone({managers: bindManagersToSession(rootScope.managers), peerId: ctx.peer('bot')}).catch(noop);
    }
  },
  {
    // A mini app's bot the user blocked: the question says it will be unblocked too (Android's)
    id: 'requestPhone/blockedBot',
    title: 'Share the phone number with a blocked bot (mini app)',
    managers: {
      appProfileManager: {isUserBlocked: () => true}
    },
    open: async(ctx) => {
      const {default: requestPhone} = await import('@components/requestPhone');
      requestPhone({managers: bindManagersToSession(rootScope.managers), peerId: ctx.peer('bot'), unblockBot: true}).catch(noop);
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
