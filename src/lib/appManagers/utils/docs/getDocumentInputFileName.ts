import {getFileNameByLocation} from '@helpers/fileName';
import {Document} from '@layer';
import getDocumentInputFileLocation from '@appManagers/utils/docs/getDocumentInputFileLocation';

export default function getDocumentInputFileName(doc: Document.document, thumbSize?: string) {
  return getFileNameByLocation(getDocumentInputFileLocation(doc, thumbSize), {fileName: doc.file_name});
}
