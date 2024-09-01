import {MessageExtendedMedia, Photo, PhotoSize} from '../../../../layer';

export default function generatePhotoForExtendedMediaPreview(media: MessageExtendedMedia.messageExtendedMediaPreview): Photo.photo {
  let thumb = media.thumb as PhotoSize.photoStrippedSize;
  if(thumb) {
    thumb.w = media.w;
    thumb.h = media.h;
  } else {
    thumb = {
      _: 'photoStrippedSize',
      bytes: new Uint8Array([1, 24, 30, 197, 162, 138, 40, 0, 162, 138, 40, 0, 162, 138, 40, 0, 162, 138, 40, 3]),
      type: 'i',
      w: 1,
      h: 1
    };
  }

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
