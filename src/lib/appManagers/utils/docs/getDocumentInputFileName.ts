/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { getFileNameByLocation } from "../../../../helpers/fileName";
import { Document } from "../../../../layer";
import getDocumentInput from "./getDocumentInput";

export default function getDocumentInputFileName(doc: Document.document, thumbSize?: string) {
  return getFileNameByLocation(getDocumentInput(doc, thumbSize), {fileName: doc.file_name});
}
