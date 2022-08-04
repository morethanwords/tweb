import {WebDocument} from '../../../../layer';

export default function isWebDocument(webDocument: any): webDocument is WebDocument {
  return !!(webDocument && (webDocument._ === 'webDocument' || webDocument._ === 'webDocumentNoProxy'));
}
