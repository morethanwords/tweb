/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import readBlobAs from './readBlobAs';

export default function readBlobAsDataURL(blob: Blob) {
  return readBlobAs(blob, 'readAsDataURL');
}
