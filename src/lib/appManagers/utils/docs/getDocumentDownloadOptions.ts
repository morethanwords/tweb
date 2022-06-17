/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Document, PhotoSize } from "../../../../layer";
import type { DownloadOptions } from "../../../mtproto/apiFileManager";
import getDocumentInput from "./getDocumentInput";

export default function getDocumentDownloadOptions(doc: Document.document, thumb?: PhotoSize.photoSize, queueId?: number, onlyCache?: boolean): DownloadOptions {
  const inputFileLocation = getDocumentInput(doc, thumb?.type);

  let mimeType: string;
  if(thumb) {
    mimeType = doc.sticker ? 'image/webp' : 'image/jpeg'/* doc.mime_type */;
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
