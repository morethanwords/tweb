import {Document, Message, MessageMedia} from '@layer';

export function canSaveMessageMediaWithNoForwards(message: Message.message) {
  const document = (message.media as MessageMedia.messageMediaDocument)?.document;
  if(!document) {
    return false;
  }

  return !(['video', 'gif', 'round', 'sticker'] as Document.document['type'][]).includes((document as Document.document).type);
}

export default function canSaveMessageMedia(
  message: Message.message | Message.messageService,
  noForwards?: boolean
) {
  return message &&
    !message.pFlags.is_outgoing &&
    !((message as Message.message).media as MessageMedia.messageMediaInvoice)?.extended_media &&
    (!(message as Message.message).pFlags.noforwards || noForwards || canSaveMessageMediaWithNoForwards(message as Message.message));
}
