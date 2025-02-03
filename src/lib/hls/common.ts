import assumeType from '../../helpers/assumeType';
import {Document} from '../../layer';
import {logger} from '../logger';

export const QUALITY_FILE_MIME_TYPE = 'application/x-mpegurl';

export const ctx = self as any as ServiceWorkerGlobalScope;
export const log = logger('HLS');
export const swLog = logger('SW-HLS');

export function isDocumentHlsQualityFile(doc: Document | undefined) {
  assumeType<Document.document | undefined>(doc);
  // "application/x-mpegurl" missing from union MTMimeType wtf
  return (doc?.mime_type as string) === QUALITY_FILE_MIME_TYPE;
}
