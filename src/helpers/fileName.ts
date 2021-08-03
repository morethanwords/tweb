/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { InputFileLocation, InputStickerSet, InputWebFileLocation } from "../layer";
import type { DownloadOptions } from "../lib/mtproto/apiFileManager";

const FILENAME_JOINER = '_';

export function getFileNameByLocation(location: InputFileLocation | InputWebFileLocation, options?: Partial<{
  fileName: string
}>) {
  const fileName = '';//(options?.fileName || '').split('.');
  const ext = fileName[fileName.length - 1] || '';

  let str: string;
  switch(location._) {
    case 'inputPhotoFileLocation': {
      str = ['photo', fileName[0], location.id, location.thumb_size].filter(Boolean).join(FILENAME_JOINER);
      break;
    }

    case 'inputDocumentFileLocation': {
      str = ['document', fileName[0], location.id, location.thumb_size].filter(Boolean).join(FILENAME_JOINER);
      break;
    }

    case 'inputPeerPhotoFileLocation':
      str = ['peerPhoto', location.photo_id, location.pFlags.big ? 'big' : 'small'].join(FILENAME_JOINER);
      break;
    
    case 'inputStickerSetThumb': {
      const id = (location.stickerset as InputStickerSet.inputStickerSetID).id || 
        (location.stickerset as InputStickerSet.inputStickerSetShortName).short_name || 
        (location.stickerset as InputStickerSet.inputStickerSetDice).emoticon || 
        location.stickerset._;
      str = ['stickerSetThumb', id, location.thumb_version].join(FILENAME_JOINER);
      break;
    }

    case 'inputFileLocation': {
      str = location.volume_id + '_' + location.local_id;
      break;
    }

    case 'inputWebFileLocation': {
      str = ['webFile', location.url].join(FILENAME_JOINER);
      break;
    }

    default: {
      console.error('Unrecognized location:', location);
      str = '';
      break;
    }
  }

  return str + (ext ? '.' + ext : ext);
}

export type FileURLType = 'photo' | 'thumb' | 'document' | 'stream' | 'download';
export function getFileURL(type: FileURLType, options: DownloadOptions) {
  //console.log('getFileURL', location);
  //const perf = performance.now();
  const encoded = encodeURIComponent(JSON.stringify(options));
  //console.log('getFileURL encode:', performance.now() - perf, encoded);

  return '/' + type + '/' + encoded;
}
