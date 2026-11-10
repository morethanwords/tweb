import type {Dialog, Message} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

export type DialogsPaginationOffsets = {
  // * raw server date of the anchor dialog's top message (NOT shifted by the server time offset)
  date: number,
  // * raw server id of the anchor dialog's top message
  id: number,
  peerId: PeerId
};

/**
 * The offsets of the next `messages.getDialogs` page: the date, id and peer of the top message of
 * the LAST dialog of this page, in the server's response order — mirrors tdesktop's
 * `ApiWrap::updateDialogsOffset`.
 *
 * Never the oldest date of the page: the server can return a dialog out of its date order (e.g. a
 * channel's direct messages chat, ordered by the parent channel's activity rather than by its own
 * old top message), and anchoring the next page on that old date makes the server skip every
 * dialog between the two dates.
 *
 * Takes the raw response, before `saveApiResult` / `saveDialog` rewrite ids and dates.
 * Returns `undefined` when no dialog of the page can anchor the next one.
 */
export default function getDialogsPaginationOffsets(
  dialogs: Dialog[],
  messages: Message[]
): DialogsPaginationOffsets {
  for(let i = dialogs.length - 1; i >= 0; --i) {
    const dialog = dialogs[i];
    if(dialog?._ !== 'dialog' || dialog.pFlags?.pinned || !dialog.top_message) {
      continue;
    }

    const peerId = getPeerId(dialog.peer);
    const message = messages.find((m) => {
      return m &&
        m._ !== 'messageEmpty' &&
        m.id === dialog.top_message &&
        getPeerId(m.peer_id) === peerId;
    }) as Message.message | Message.messageService;

    if(message?.date) {
      return {
        date: message.date,
        id: dialog.top_message,
        peerId
      };
    }
  }
}
