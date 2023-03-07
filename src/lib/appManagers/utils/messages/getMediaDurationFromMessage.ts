import {Document, Message, MessageMedia} from '../../../../layer';

export default function getMediaDurationFromMessage(message: Message.message) {
  if(!message) return undefined;
  const doc = (message.media as MessageMedia.messageMediaDocument)?.document as Document.document;
  const duration = ((['voice', 'audio', 'video'] as Document.document['type'][]).includes(doc?.type) && doc.duration) || undefined;
  return duration;
}
