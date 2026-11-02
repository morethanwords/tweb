import toArray from '@helpers/array/toArray';
import {Document, Game, Message, MessageAction, MessageExtendedMedia, MessageMedia, Photo, StoryItem, WebPage} from '@layer';
import generatePhotoForExtendedMediaPreview from '@appManagers/utils/photos/generatePhotoForExtendedMediaPreview';
import getRichMessageMedia from '@appManagers/utils/richMessage/getRichMessageMedia';

export default function getMediaFromMessage(message: Message | StoryItem.storyItem, onlyInner: true, index?: number): Photo.photo | Document.document;
export default function getMediaFromMessage(message: Message | StoryItem.storyItem, onlyInner?: false, index?: number): Photo.photo | Document.document | Game.game | WebPage.webPage;
export default function getMediaFromMessage(message: Message | StoryItem.storyItem, onlyInner = false, index?: number): Photo.photo | Document.document | Game.game | WebPage.webPage {
  if(!message) return;

  let media: any;
  if((message as Message.messageService).action) {
    media = ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo;
  } else if((message as Message.message).media) {
    let messageMedia = (message as Message.message).media;
    const extendedMedia = (messageMedia as MessageMedia.messageMediaInvoice | MessageMedia.messageMediaPaidMedia).extended_media;
    if((messageMedia as MessageMedia.messageMediaWebPage).webpage) {
      messageMedia = (messageMedia as MessageMedia.messageMediaWebPage).webpage as any as MessageMedia;
    } else if(extendedMedia) {
      const media = toArray(extendedMedia)[index ?? 0];
      messageMedia = (media as MessageExtendedMedia.messageExtendedMedia).media;
      if(!messageMedia) {
        return generatePhotoForExtendedMediaPreview(media as MessageExtendedMedia.messageExtendedMediaPreview);
      }
    }

    media = /* (messageMedia as MessageMedia.messageMediaDocument).alt_document || */
      getPhotoOrDocument(messageMedia) ||
      (onlyInner ? undefined : (messageMedia as MessageMedia.messageMediaGame).game || messageMedia);
  }

  return media as any;
}

/**
 * The photo or video the shared media shows for a message, and the viewer opened from there: its own,
 * or the one a rich message stands for (`getRichMessageMedia`), which the server finds it by
 */
export function getMediaFromMessageOrRich(message: Message | StoryItem.storyItem, index?: number): Photo.photo | Document.document {
  const media = getMediaFromMessage(message, true, index);
  const richMessage = !media && (message as Message.message)?.rich_message;
  if(!richMessage) {
    return media;
  }

  const richMedia = getRichMessageMedia(richMessage);
  return richMedia && getPhotoOrDocument(richMedia);
}

function getPhotoOrDocument(messageMedia: MessageMedia) {
  return (messageMedia as MessageMedia.messageMediaDocument).document as Document.document ||
    (messageMedia as MessageMedia.messageMediaPhoto).photo as Photo.photo;
}
