import type {PhotoSize, VideoSize, InputFileLocation} from '@layer';
import type {DownloadOptions} from '@appManagers/apiFileManager';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {MyPhoto} from '@appManagers/appPhotosManager';

export default function getPhotoDownloadOptions(photo: MyPhoto | MyDocument, photoSize: PhotoSize | VideoSize.videoSize, queueId?: number, onlyCache?: boolean): DownloadOptions {
  const isDocument = photo._ === 'document';

  if(!photoSize || photoSize._ === 'photoSizeEmpty') {
    // console.error('no photoSize by photo:', photo);
    throw new Error('photoSizeEmpty!');
  }

  // A videoSize is an animated profile photo's video variant ('p'/'u').
  const isVideoSize = photoSize._ === 'videoSize';

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
    // A videoSize carries a real downloadable byte size — without it the
    // download loop stops after a single 512KB part and the video plays
    // truncated (≈half). photoSize/photoSizeProgressive also carry .size.
    size: (isPhoto || isVideoSize) ? (photoSize as PhotoSize.photoSize | VideoSize.videoSize).size : undefined,
    mimeType: isVideoSize ? 'video/mp4' : 'image/jpeg',
    queueId,
    onlyCache
  };
}
