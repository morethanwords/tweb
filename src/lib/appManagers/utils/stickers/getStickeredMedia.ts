import type {Document, MessageMedia, Photo} from '@layer';

/**
 * The photo or document of a media that has stickers put on it, as `messages.getAttachedStickers`
 * asks for it (`appStickersManager.getAttachedStickers`): a photo says so with `has_stickers`, a
 * document with `documentAttributeHasStickers` (desktop's `hasAttachedStickers`)
 */
export default function getStickeredMedia(media: MessageMedia): {type: 'photo' | 'document', id: Long} {
  if(media?._ === 'messageMediaPhoto') {
    const photo = media.photo as Photo.photo;
    return photo?.pFlags?.has_stickers ? {type: 'photo', id: photo.id} : undefined;
  }

  if(media?._ === 'messageMediaDocument') {
    const doc = media.document as Document.document;
    const hasStickers = doc?.attributes?.some((attribute) => attribute._ === 'documentAttributeHasStickers');
    return hasStickers ? {type: 'document', id: doc.id} : undefined;
  }
}
