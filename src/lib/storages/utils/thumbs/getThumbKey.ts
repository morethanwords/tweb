import type {MyPhoto} from '../../../appManagers/appPhotosManager';
import type {ThumbStorageMedia} from '../../thumbs';
import type {WebDocument} from '../../../../layer';
import {getFileNameByLocation} from '../../../../helpers/fileName';
import isWebFileLocation from '../../../appManagers/utils/webFiles/isWebFileLocation';

export default function getThumbKey(media: ThumbStorageMedia) {
  if(isWebFileLocation(media)) {
    return getFileNameByLocation(media);
  }

  return media._ + ((media as MyPhoto).id ?? (media as WebDocument).url);
}
