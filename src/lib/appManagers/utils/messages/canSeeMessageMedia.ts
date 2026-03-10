import {Document, Message, MessageMedia} from '@layer';

export default function canSeeMessageMedia(message: Message) {
  const media = (message as Message.message)?.media;
  if(!media) {
    return false;
  }

  if((media as MessageMedia.messageMediaPhoto).ttl_seconds) {
    // const {document} = (media as MessageMedia.messageMediaDocument);
    // if(!document || (document as Document.document).type !== 'voice') {
    //   return false;
    // }
    return false;
  }

  return true;
}
