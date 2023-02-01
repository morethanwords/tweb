/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Document, InputMedia} from '../../../../layer';

export default function getMediaInput(doc: Document.document): InputMedia.inputMediaDocument {
  return {
    _: 'inputMediaDocument',
    id: {
      _: 'inputDocument',
      id: doc.id,
      access_hash: doc.access_hash,
      file_reference: doc.file_reference
    },
    ttl_seconds: 0,
    pFlags: {}
  };
}
