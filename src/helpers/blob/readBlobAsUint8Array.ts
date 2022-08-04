/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import readBlobAsArrayBuffer from './readBlobAsArrayBuffer';

export default function readBlobAsUint8Array(blob: Blob) {
  return readBlobAsArrayBuffer(blob).then((buffer) => new Uint8Array(buffer));
}
