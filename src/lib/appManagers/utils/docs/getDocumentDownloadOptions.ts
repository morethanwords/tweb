/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Document, PhotoSize, VideoSize} from '../../../../layer';
import type {DownloadOptions} from '../../../mtproto/apiFileManager';
import getDocumentInputFileLocation from './getDocumentInputFileLocation';

type GetDocumentDownloadOptions = {
  thumb?: PhotoSize.photoSize | Extract<VideoSize, VideoSize.videoSize>;
  queueId?: number;
  onlyCache?: boolean;
};

export default function getDocumentDownloadOptions(
  doc: Document.document,
  {thumb, queueId, onlyCache}: GetDocumentDownloadOptions = {}
): DownloadOptions {
  const inputFileLocation = getDocumentInputFileLocation(doc, thumb?.type);

  let mimeType: MTMimeType;
  if(thumb?._ === 'photoSize') {
    mimeType = doc.sticker ? 'image/webp' : (doc.mime_type.startsWith('image/') ? doc.mime_type : 'image/jpeg');
  } else {
    mimeType = doc.mime_type || 'application/octet-stream';
  }

  return {
    dcId: doc.dc_id,
    location: inputFileLocation,
    size: thumb ? thumb.size : doc.size,
    mimeType,
    fileName: doc.file_name,
    queueId,
    onlyCache
  };
}
