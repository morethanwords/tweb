/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FileURLType, getFileURL} from '../../../../helpers/fileName';
import {Document, PhotoSize} from '../../../../layer';
import getDocumentDownloadOptions from './getDocumentDownloadOptions';

export default function getDocumentURL(doc: Document.document, download = false, thumb?: PhotoSize.photoSize) {
  let type: FileURLType;
  if(download) {
    type = 'download';
  } else if(thumb) {
    type = 'thumb';
  } else if(doc.supportsStreaming) {
    type = 'stream';
  } else {
    type = 'document';
  }

  return getFileURL(type, getDocumentDownloadOptions(doc, thumb));
}
