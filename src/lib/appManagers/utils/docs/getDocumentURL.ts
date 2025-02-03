/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FileURLType, getFileURL} from '../../../../helpers/fileName';
import {Document, PhotoSize} from '../../../../layer';

import getDocumentDownloadOptions from './getDocumentDownloadOptions';

type GetDocumentURLOptions = {
  download?: boolean;
  thumb?: PhotoSize.photoSize;
  supportsHlsStreaming?: boolean;
};

export default function getDocumentURL(
  doc: Document.document,
  {
    download = false,
    thumb,
    supportsHlsStreaming
  }: GetDocumentURLOptions = {}
) {
  let type: FileURLType;
  if(download) {
    type = 'download';
  } else if(thumb) {
    type = 'thumb';
  } else if(supportsHlsStreaming) {
    type = 'hls';
  } else if(doc.supportsStreaming) {
    type = 'stream';
  } else {
    type = 'document';
  }

  return getFileURL(
    type,
    getDocumentDownloadOptions(doc, {
      thumb
    })
  );
}
