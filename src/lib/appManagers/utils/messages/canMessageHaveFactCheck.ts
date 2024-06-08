import {Document, Message, MessageMedia} from '../../../../layer';

export default function canMessageHaveFactCheck(message: Message): boolean {
  if(message?._ !== 'message') {
    return false;
  }

  if(((message.media as MessageMedia.messageMediaDocument)?.document as Document.document)?.sticker) {
    return false;
  }

  return true;
}
