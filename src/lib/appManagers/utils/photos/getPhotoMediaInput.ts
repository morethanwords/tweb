import {InputMedia} from '@layer';
import {MyPhoto} from '@appManagers/appPhotosManager';
import getPhotoInput from '@appManagers/utils/photos/getPhotoInput';

export default function getPhotoMediaInput(photo: MyPhoto): InputMedia.inputMediaPhoto {
  return {
    _: 'inputMediaPhoto',
    id: getPhotoInput(photo),
    ttl_seconds: 0,
    pFlags: {}
  };
}
