import {Document, Message, MessageAction, MessageExtendedMedia, MessageMedia, Photo, WebPage} from '../../../../layer';

export default function getMediaFromMessage(message: Message) {
  if(!message) return;

  let media: any;
  if((message as Message.messageService).action) {
    media = ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo;
  } else if((message as Message.message).media) {
    let messageMedia = (message as Message.message).media;
    if((messageMedia as MessageMedia.messageMediaWebPage).webpage) {
      messageMedia = (messageMedia as MessageMedia.messageMediaWebPage).webpage as any as MessageMedia;
    } else if((messageMedia as MessageMedia.messageMediaInvoice).extended_media?._ === 'messageExtendedMedia') {
      messageMedia = ((messageMedia as MessageMedia.messageMediaInvoice).extended_media as MessageExtendedMedia.messageExtendedMedia).media;
    }

    media = (messageMedia as MessageMedia.messageMediaDocument).document ||
      (messageMedia as MessageMedia.messageMediaPhoto).photo;
  }

  return media as Photo.photo | Document.document;
}
