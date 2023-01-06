/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Document, InputFileLocation} from '../../../../layer';

export default function getDocumentInputFileLocation(doc: Document.document, thumbSize?: string): InputFileLocation.inputDocumentFileLocation {
  return {
    _: 'inputDocumentFileLocation',
    id: doc.id,
    access_hash: doc.access_hash,
    file_reference: doc.file_reference,
    thumb_size: thumbSize
  };
}
