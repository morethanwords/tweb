/*
 * Confirmation-style popups: a title, a line of copy and one destructive button.
 *
 * Popup modules are imported inside `open()`, never at the top: the popup graph has import cycles
 * (mute → peer → … → mute), and pulling a mid-cycle module in first leaves a base class in its
 * temporal dead zone. Starting the graph at the leaf the story actually opens always resolves.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';

defineStories('Confirmations', [
  {
    id: 'peer/basic',
    title: 'PopupPeer — title + description',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupPeer}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/peer')
      ]);

      PopupElement.createPopup(PopupPeer, 'popup-sandbox', {
        peerId: ctx.peer('private'),
        titleLangKey: 'AppName',
        descriptionLangKey: 'Chat.Message.Sponsored.What',
        buttons: [{langKey: 'OK', isDanger: true}]
      }).show();
    }
  },
  {
    id: 'peer/with-checkbox',
    title: 'PopupPeer — with a checkbox',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupPeer}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/peer')
      ]);

      PopupElement.createPopup(PopupPeer, 'popup-sandbox', {
        peerId: ctx.peer('supergroup'),
        titleLangKey: 'DeleteChatUser',
        descriptionLangKey: 'AreYouSureDeleteThisChatWithUser',
        descriptionLangArgs: ['Alice'],
        checkboxes: [{text: 'DeleteMessagesOption'}],
        buttons: [{langKey: 'Delete', isDanger: true}]
      }).show();
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
      const {SimpleConfirmationPopup} = await import('@components/popups/simpleConfirmation');
      SimpleConfirmationPopup.show({
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
      const {default: PopupDeleteMessages} = await import('@components/popups/deleteMessages');
      const {ChatType} = await import('@components/chat/chatType');
      new PopupDeleteMessages(ctx.peer('private'), [ctx.mid('private')], ChatType.Chat);
    }
  },
  {
    id: 'deleteDialog/private',
    title: 'Delete chat — private',
    managers: {
      appPeersManager: {isSavedDialog: () => false, getDialogType: () => 'chat'}
    },
    open: async(ctx) => {
      const {default: PopupDeleteDialog} = await import('@components/popups/deleteDialog');
      new PopupDeleteDialog(ctx.peer('private'));
    }
  },
  {
    id: 'deleteDialog/channel',
    title: 'Leave channel',
    managers: {
      appPeersManager: {isSavedDialog: () => false, getDialogType: () => 'channel'}
    },
    open: async(ctx) => {
      const {default: PopupDeleteDialog} = await import('@components/popups/deleteDialog');
      new PopupDeleteDialog(ctx.peer('channel'));
    }
  },
  {
    id: 'sendNow/one',
    title: 'Send scheduled message now',
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupSendNow}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/sendNow')
      ]);

      PopupElement.createPopup(PopupSendNow, ctx.peer('private'), [ctx.mid('private')]);
    }
  },
  {
    id: 'unpinMessage/one',
    title: 'Unpin message',
    managers: {
      appPeersManager: {canPinMessage: () => true}
    },
    open: async(ctx) => {
      const {default: PopupPinMessage} = await import('@components/popups/unpinMessage');
      new PopupPinMessage(ctx.peer('supergroup'), ctx.mid('private'), true);
    }
  },
  {
    id: 'pinMessage/one',
    title: 'Pin message',
    managers: {
      appPeersManager: {canPinMessage: () => true, isBroadcast: () => false}
    },
    open: async(ctx) => {
      const {default: PopupPinMessage} = await import('@components/popups/unpinMessage');
      new PopupPinMessage(ctx.peer('supergroup'), ctx.mid('private'));
    }
  },
  {
    id: 'mute/peer',
    title: 'Mute chat',
    open: async(ctx) => {
      const {default: PopupMute} = await import('@components/popups/mute');
      const {default: PopupElement} = await import('@components/popups');
      PopupElement.createPopup(PopupMute, ctx.peer('private'));
    }
  },
  {
    id: 'sponsored/what-is-this',
    title: 'What are sponsored messages?',
    open: async(ctx) => {
      const {default: PopupSponsored} = await import('@components/popups/sponsored');
      const {default: PopupElement} = await import('@components/popups');
      PopupElement.createPopup(PopupSponsored);
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
  }
]);
