import toArray from '../../../../helpers/array/toArray';
import {Document, Game, Message, MessageAction, MessageExtendedMedia, MessageMedia, Photo, StoryItem, WebPage} from '../../../../layer';
import generatePhotoForExtendedMediaPreview from '../photos/generatePhotoForExtendedMediaPreview';

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
      (messageMedia as MessageMedia.messageMediaDocument).document ||
      (messageMedia as MessageMedia.messageMediaPhoto).photo ||
      (onlyInner ? undefined : (messageMedia as MessageMedia.messageMediaGame).game || messageMedia);
  }

  return media as any;
}
