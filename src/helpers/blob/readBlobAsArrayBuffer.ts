/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import readBlobAs from './readBlobAs';

export default function readBlobAsArrayBuffer(blob: Blob) {
  return readBlobAs(blob, 'readAsArrayBuffer');
}
