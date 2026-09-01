import PopupElement from '@components/popups';
import showPickUserPopup from '@components/popups/pickUser';
import PopupSendGift from '@components/popups/sendGift';

type PickUserOptions = Parameters<typeof showPickUserPopup>[0];

/**
 * The recipient picker behind every "send a gift" entry — the Settings row, the
 * birthday suggestion and `tg://settings/send-gift` all open the same one, and
 * pass only what is their own (the birthdays it puts on top, for instance).
 */
export default function showSendGiftPicker(options?: Partial<PickUserOptions>) {
  return showPickUserPopup({
    titleLangKey: 'SendGiftTo',
    placeholder: 'Chat.Menu.SendGift',
    selfPresence: 'SendGiftSelfCaption',
    meAsSaved: false,
    filterPeerTypeBy: ['isRegularUser', 'isBroadcast'],
    onSelect: ([{peerId}]) => {
      PopupElement.createPopup(PopupSendGift, {peerId});
    },
    ...options
  });
}
