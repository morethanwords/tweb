import type {Message, MessageMedia} from '@layer';
import bytesCmp from '@helpers/bytes/bytesCmp';
import deepEqual from '@helpers/object/deepEqual';
import {getSolidMessageBodyStructure} from '@components/chat/bubbleParts/solidMessageShell';

/**
 * How the bubble of an HTML widget's message (`messageMediaWidget`) takes an edit of it (`updateLocalOnEdit`): a new
 * state (the bot's edit of it, a poll of a shared widget) reaches the running widget (`data`), new HTML restarts it on
 * the same storage (`source`), and an edit says so in the time (`dated`); its caption's text the caption's body takes
 * along with it. Anything else — the id a sent message gets (the widget's storage, requests and polls go by it), the
 * shell as a message body sees it (a caption coming or going and the time going over the widget's corner or off it, a
 * caption shown above, a fact check, the buttons, the widget's size or flags) — has the bubble made anew: `false`.
 */
export default function createWidgetEditHandler(message: Message.message, on: {
  data: (media: MessageMedia.messageMediaWidget) => void,
  source: (media: MessageMedia.messageMediaWidget) => void,
  dated: (edited: Message.message) => void
}) {
  let shown = message;
  let shownShell = getSolidMessageBodyStructure(message);
  let shownPayload = (message.media as MessageMedia.messageMediaWidget).payload;
  return (edited: Message.message): void | false => {
    const media = edited.media;
    if(edited.mid !== message.mid || media?._ !== 'messageMediaWidget') return false;
    const shell = getSolidMessageBodyStructure(edited);
    if(!deepEqual(shell, shownShell)) return false;

    const dated = edited.edit_date !== shown.edit_date || !edited.pFlags.edit_hide !== !shown.pFlags.edit_hide;
    shown = edited;
    shownShell = shell;
    on.data(media);
    if(!bytesCmp(media.payload, shownPayload)) {
      shownPayload = media.payload;
      on.source(media);
    }

    if(dated) on.dated(edited);
  };
}

/**
 * How the bubble of an HTML widget's message takes an edit before its widget runs — its code or HTML loading, or failed
 * to load (from the bubble's render on, `createWidgetEditHandler` once it runs): nothing of the widget, its caption or
 * its time is taken in place then — what is made from the message as it was would not have it — so any of it changing,
 * or the id a sent message gets, has the bubble made anew (`false`: the load starts again from it, or tries again).
 */
export function createPendingWidgetEditHandler(message: Message.message) {
  const media = message.media as MessageMedia.messageMediaWidget;
  const shell = getSolidMessageBodyStructure(message);
  return (edited: Message.message): void | false => {
    const editedMedia = edited.media;
    if(
      edited.mid !== message.mid ||
      editedMedia?._ !== 'messageMediaWidget' ||
      !bytesCmp(editedMedia.payload, media.payload) ||
      editedMedia.chat_data !== media.chat_data ||
      editedMedia.public_data !== media.public_data ||
      edited.message !== message.message ||
      !deepEqual(edited.entities, message.entities) ||
      edited.edit_date !== message.edit_date ||
      !edited.pFlags.edit_hide !== !message.pFlags.edit_hide ||
      !deepEqual(getSolidMessageBodyStructure(edited), shell)
    ) {
      return false;
    }
  };
}
