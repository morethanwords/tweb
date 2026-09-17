/*
 * Popups that ask for something: a date, a peer, a country, a poll.
 *
 * Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import noop from '@helpers/noop';
import {defineStories} from '../registry';
import {NOW} from '../fixtures';

defineStories('Pickers', [
  {
    id: 'datePicker/plain',
    title: 'Date picker',
    open: async(ctx) => {
      const {default: showDatePickerPopup} = await import('@components/popups/datePicker');
      showDatePickerPopup({initDate: new Date(NOW * 1000), onPick: noop});
    }
  },
  {
    id: 'datePicker/withTime',
    title: 'Date picker — with time',
    open: async(ctx) => {
      const {default: showDatePickerPopup} = await import('@components/popups/datePicker');
      showDatePickerPopup({initDate: new Date(NOW * 1000), withTime: true, onPick: noop});
    }
  },
  {
    id: 'scheduleSending',
    title: 'Schedule message',
    open: async(ctx) => {
      const {default: showScheduleSendingPopup} = await import('@components/popups/scheduleSendingPopup');
      showScheduleSendingPopup({canSendSilently: true, canSendWhenOnline: true, onPick: noop});
    }
  },
  {
    id: 'pickUser/single',
    title: 'Pick a peer',
    open: async(ctx) => {
      const {default: showPickUserPopup} = await import('@components/popups/pickUser');
      showPickUserPopup({peerType: ['dialogs'], titleLangKey: 'SendMessageTo', onSelect: noop});
    }
  },
  {
    id: 'pickUser/multi',
    title: 'Pick peers — multi-select',
    open: async(ctx) => {
      const {default: showPickUserPopup} = await import('@components/popups/pickUser');
      showPickUserPopup({
        peerType: ['dialogs', 'contacts'],
        titleLangKey: 'ShareModal.Search.ForwardPlaceholder',
        multiSelect: true,
        onSelect: noop
      });
    }
  },
  {
    id: 'pickUser/leftCheckboxes',
    title: 'Pick peers — left checkboxes with media',
    open: async() => {
      const {default: showPickUserPopup} = await import('@components/popups/pickUser');
      showPickUserPopup({
        peerType: ['contacts'],
        titleLangKey: 'Contacts',
        multiSelect: true,
        design: 'square',
        checkboxSide: 'left',
        onSelect: noop
      });
    }
  },
  {
    id: 'pickUser/contacts',
    title: 'Contact picker',
    open: async(ctx) => {
      const {showContactPickerPopup} = await import('@components/popups/pickUser');
      showContactPickerPopup();
    }
  },
  {
    id: 'pickUser/sharing',
    title: 'Share with… picker',
    open: async(ctx) => {
      const {showSharingPickerPopup} = await import('@components/popups/pickUser');
      showSharingPickerPopup({onSelect: noop});
    }
  },
  {
    id: 'pickUser/sendGift',
    title: 'Pick a gift recipient',
    open: async() => {
      const {default: showSendGiftPicker} = await import('@components/popups/sendGiftPicker');
      showSendGiftPicker();
    }
  },
  {
    id: 'pickCountry',
    title: 'Country picker',
    open: async(ctx) => {
      const {default: showPickCountryPopup} = await import('@components/popups/pickCountry');
      showPickCountryPopup({titleLangKey: 'Country', onSelect: noop});
    }
  },
  {
    id: 'createContact',
    title: 'New contact',
    open: async(ctx) => {
      const {default: showCreateContactPopup} = await import('@components/popups/createContact');
      showCreateContactPopup();
    }
  },
  {
    id: 'createPoll',
    title: 'New poll',
    open: async(ctx) => {
      const [{openCreatePollPopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/createPoll'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      openCreatePollPopup({onSubmit: noop}, HotReloadGuard);
    }
  },
  {
    id: 'pollLink/editor',
    title: 'Poll link editor',
    open: async(ctx) => {
      const [{openPollLinkEditorPopup}, {default: HotReloadGuard}] = await Promise.all([
        import('@components/popups/pollLink'),
        import('@lib/solidjs/hotReloadGuardProvider')
      ]);

      openPollLinkEditorPopup({initialUrl: 'https://telegram.org/', onSubmit: noop}, HotReloadGuard);
    }
  },
  {
    id: 'forward',
    title: 'Forward messages',
    open: async(ctx) => {
      const {default: showForwardPopup} = await import('@components/popups/forward');
      await showForwardPopup({[ctx.peer('channel')]: [ctx.mid('channel')]});
    }
  },
  {
    id: 'shareUrl',
    title: 'Share a link',
    open: async(ctx) => {
      const {default: shareUrlToPeers} = await import('@components/popups/shareUrl');
      shareUrlToPeers({url: 'https://telegram.org/', multiSelect: true});
    }
  },
  {
    // The only popup that reserves room for a floating footer with `PopupElement.FooterPlaceholder`,
    // and until now the only one without a story — so that reserve was rendered nowhere the
    // sweep could see it. `enumerateDevices` needs no permission to answer, just a list.
    id: 'outputDevice',
    title: 'Audio output picker',
    open: async() => {
      const {default: showOutputDevicePopup} = await import('@components/rtmp/outputDevicePopup');
      showOutputDevicePopup({kind: 'audiooutput', onPick: noop});
    }
  },
  {
    id: 'chatPreview',
    title: 'Chat preview (shift-click a dialog)',
    managers: {
      appMessagesManager: {getHistory: () => ({history: [], count: 0, isEnd: {top: true, bottom: true, both: true}})}
    },
    open: async(ctx) => {
      const {default: showChatPreviewPopup} = await import('@components/popups/chatPreview');
      showChatPreviewPopup({peerId: ctx.peer('private')});
    }
  }
]);
