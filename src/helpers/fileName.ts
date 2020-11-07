import type { InputFileLocation, FileLocation } from "../layer";
import type { DownloadOptions } from "../lib/mtproto/apiFileManager";

export function getFileNameByLocation(location: InputFileLocation | FileLocation, options?: Partial<{
  fileName: string
}>) {
  const fileName = '';//(options?.fileName || '').split('.');
  const ext = fileName[fileName.length - 1] || '';

  switch(location._) {
    case 'inputPhotoFileLocation':
    case 'inputDocumentFileLocation': {
      const thumbPart = location.thumb_size ? '_' + location.thumb_size : '';
      return (fileName[0] ? fileName[0] + '_' : '') + location.id + thumbPart + (ext ? '.' + ext : ext);
    }

    case 'fileLocationToBeDeprecated':
    case 'inputPeerPhotoFileLocation':
    case 'inputStickerSetThumb':
    case 'inputFileLocation': {
      return location.volume_id + '_' + location.local_id + (ext ? '.' + ext : ext);
    }

    default: {
      console.error('Unrecognized location:', location);
      return '';
    }
  }
}

export type FileURLType = 'photo' | 'thumb' | 'document' | 'stream' | 'download';
export function getFileURL(type: FileURLType, options: DownloadOptions) {
  //console.log('getFileURL', location);
  //const perf = performance.now();
  const encoded = encodeURIComponent(JSON.stringify(options));
  //console.log('getFileURL encode:', performance.now() - perf, encoded);

  return '/' + type + '/' + encoded;
}