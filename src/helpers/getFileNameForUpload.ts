/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import tabId from '../config/tabId';

let uploadId = 0;
export default function getFileNameForUpload(file: File | Blob) {
  let fileName: string;
  const mimeType = file?.type;
  if(mimeType) { // the same like apiFileName in appMessagesManager for upload!
    const ext = `${tabId}_${uploadId++}.${mimeType.split('/')[1]}`;

    if(['image/jpeg', 'image/png', 'image/bmp'].indexOf(mimeType) >= 0) {
      fileName = 'photo' + ext;
    } else if(mimeType.indexOf('audio/') === 0 || ['video/ogg'].indexOf(mimeType) >= 0) {
      fileName = 'audio' + ext;
    } else if(mimeType.indexOf('video/') === 0) {
      fileName = 'video' + ext;
    } else {
      fileName = 'document' + ext;
    }
  } else {
    fileName = `upload-${tabId}_${uploadId++}`;
  }

  return fileName;
}
