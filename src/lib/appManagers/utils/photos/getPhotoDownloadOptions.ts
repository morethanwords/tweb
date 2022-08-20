/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {PhotoSize, InputFileLocation} from '../../../../layer';
import type {DownloadOptions} from '../../../mtproto/apiFileManager';
import type {MyDocument} from '../../appDocsManager';
import type {MyPhoto} from '../../appPhotosManager';

export default function getPhotoDownloadOptions(photo: MyPhoto | MyDocument, photoSize: PhotoSize, queueId?: number, onlyCache?: boolean): DownloadOptions {
  const isDocument = photo._ === 'document';

  if(!photoSize || photoSize._ === 'photoSizeEmpty') {
    // console.error('no photoSize by photo:', photo);
    throw new Error('photoSizeEmpty!');
  }

  // maybe it's a thumb
  const isPhoto = !!((photoSize._ === 'photoSize' || photoSize._ === 'photoSizeProgressive') && photo.access_hash && photo.file_reference);
  const location: InputFileLocation.inputPhotoFileLocation | InputFileLocation.inputDocumentFileLocation = {
    _: isDocument ? 'inputDocumentFileLocation' : 'inputPhotoFileLocation',
    id: photo.id,
    access_hash: photo.access_hash,
    file_reference: photo.file_reference,
    thumb_size: photoSize.type
  };

  return {
    dcId: photo.dc_id,
    location,
    size: isPhoto ? (photoSize as PhotoSize.photoSize).size : undefined,
    mimeType: 'image/jpeg',
    queueId,
    onlyCache
  };
}
