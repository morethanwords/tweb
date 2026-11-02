import type {MyDocument} from '@appManagers/appDocsManager';
import type {Message, MessageMedia, PageBlock, RichMessage} from '@layer';

/**
 * The photo or video a rich message stands for where one picture shows the whole message (a reply,
 * the shared media), as Android picks it (`MessageObject.findVideo`, `findPhoto`): the first video, or
 * the first photo when there is none, among the top blocks and the items of the first collage or
 * slideshow.
 */
export default function getRichMessageMedia(richMessage: RichMessage): MessageMedia.messageMediaPhoto | MessageMedia.messageMediaDocument {
  const video = findRichMedia(richMessage?.blocks, 'pageBlockVideo');
  if(video) {
    const document = findRichMessageDocument(richMessage, video.video_id);
    return document && {_: 'messageMediaDocument', pFlags: {spoiler: video.pFlags.spoiler}, document};
  }

  const photo = findRichMedia(richMessage?.blocks, 'pageBlockPhoto');
  const found = photo && richMessage.photos?.find((item) => item.id === photo.photo_id);
  return found && {_: 'messageMediaPhoto', pFlags: {spoiler: photo.pFlags.spoiler}, photo: found};
}

function findRichMedia<T extends 'pageBlockPhoto' | 'pageBlockVideo'>(blocks: PageBlock[], type: T): Extract<PageBlock, {_: T}> {
  for(const block of blocks || []) {
    if(block._ === type) {
      return block as Extract<PageBlock, {_: T}>;
    } else if(block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow') {
      return findRichMedia(block.items, type);
    }
  }
}

export function findRichMessageDocument(richMessage: RichMessage, id: string | number) {
  return richMessage.documents?.find((document) => document.id === id) as MyDocument;
}

/** A message's media, or for a rich message the photo or video it stands for */
export function getMessageMediaOrRich(message: Message): MessageMedia {
  return (message as Message.message)?.media || getRichMessageMedia((message as Message.message)?.rich_message);
}

/**
 * A rich message as a message holding `media` (by default the photo or video it stands for), for what reads only a
 * message's own media: the shared media's context menu, the playback controller. Any other message as it is
 */
export function getMessageWithRichMedia<T extends Message>(message: T, media?: MessageMedia): T {
  const {rich_message: richMessage, media: ownMedia} = (message as Message.message) ?? {};
  if(!richMessage || ownMedia) {
    return message;
  }

  media ??= getRichMessageMedia(richMessage);
  return media ? {...message, media} : message;
}
