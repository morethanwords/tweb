import assumeType from '../../helpers/assumeType';
import {Document} from '../../layer';
import {logger} from '../logger';

export const QUALITY_FILE_MIME_TYPE = 'application/x-mpegurl';

export const ctx = self as any as ServiceWorkerGlobalScope;
export const log = logger('HLS');
export const swLog = logger('SW-HLS');

export function isDocumentHlsQualityFile(doc: Document | undefined) {
  assumeType<Document.document | undefined>(doc);
  return doc?.mime_type === QUALITY_FILE_MIME_TYPE;
}
