import {Message, MessageMedia} from '../../../../layer';

export default function canSaveMessageMedia(message: Message.message | Message.messageService) {
  return message &&
    !message.pFlags.is_outgoing &&
    !(message as Message.message).pFlags.noforwards &&
    !((message as Message.message).media as MessageMedia.messageMediaInvoice)?.extended_media
}
