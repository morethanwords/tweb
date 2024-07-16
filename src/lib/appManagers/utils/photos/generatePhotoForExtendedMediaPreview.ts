import {MessageExtendedMedia, Photo, PhotoSize} from '../../../../layer';

export default function generatePhotoForExtendedMediaPreview(media: MessageExtendedMedia.messageExtendedMediaPreview): Photo.photo {
  const thumb = media.thumb as PhotoSize.photoStrippedSize;
  thumb.w = media.w;
  thumb.h = media.h;
  return {
    _: 'photo',
    access_hash: '',
    pFlags: {},
    date: 0,
    dc_id: 0,
    file_reference: [],
    id: 0,
    sizes: [thumb]
  };
}
