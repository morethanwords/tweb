/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {getFileNameByLocation} from '../../../../helpers/fileName';
import {DownloadOptions} from '../../../mtproto/apiFileManager';

export default function getDownloadFileNameFromOptions(options: DownloadOptions) {
  return getFileNameByLocation(options.location, options);
}
