import {InputDocument} from '../../../../layer';
import type {MyDocument} from '../../appDocsManager';

export default function getDocumentInput(doc: MyDocument): InputDocument {
  return {
    _: 'inputDocument',
    id: doc.id,
    access_hash: doc.access_hash,
    file_reference: doc.file_reference
  };
}
