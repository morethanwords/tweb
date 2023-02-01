/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {InputMedia} from '../../../../layer';
import {MyPhoto} from '../../appPhotosManager';
import getPhotoInput from './getPhotoInput';

export default function getPhotoMediaInput(photo: MyPhoto): InputMedia.inputMediaPhoto {
  return {
    _: 'inputMediaPhoto',
    id: getPhotoInput(photo),
    ttl_seconds: 0,
    pFlags: {}
  };
}
