import assumeType from '../../helpers/assumeType';
import {Document, DocumentAttribute, Message, MessageMedia} from '../../layer';

const QUALITY_FILE_MIME_TYPE = 'application/x-mpegurl';
const QUALITY_FILE_NAME_PREFIX = 'mtproto:';

const FALLBACK_BANDWIDTH = 1_000_000;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;

export function createHlsVideoSource(message: Message.message): string | null {
  const altDocs = getAltDocsFromMessage(message);
  if(!altDocs.length) return;

  const videoAttributes = getVideoAttributesFromAltDocs(altDocs);
  const qualityURLs = getQualityURLsFromAltDocs(altDocs);

  const qualityEntries = Array.from(videoAttributes.entries()).map(([id, attr]) => {
    const {w = FALLBACK_WIDTH, h = FALLBACK_HEIGHT, duration = 0} = attr;
    const {size} = altDocs.find(doc => doc.id.toString() === id);

    const bandwidth = (duration > 0 ? size / duration * 8 : FALLBACK_BANDWIDTH) | 0;

    return {
      w,
      h,
      duration,
      bandwidth,
      url: qualityURLs.get(id)
    }
  });

  if(!qualityEntries.length) return null;

  qualityEntries.sort((a, b) => a.bandwidth - b.bandwidth);


  let hlsFileSource = '#EXTM3U\n';

  for(const qualityEntry of qualityEntries) {
    const {w, h, bandwidth, url} = qualityEntry;

    hlsFileSource += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${w}x${h}\n`;
    hlsFileSource += url + '\n';
  }

  hlsFileSource += '\n#EXT-X-ENDLIST';

  return hlsFileSource;
}

function getAltDocsFromMessage(message: Message.message) {
  const media = message?.media;
  assumeType<MessageMedia.messageMediaDocument>(media);
  if(!media) return [];

  const altDocs = media?.alt_documents || [];
  assumeType<Document.document[]>(altDocs);

  return altDocs;
}

function getVideoAttributesFromAltDocs(altDocs: Document.document[]) {
  const result: Map<string, DocumentAttribute.documentAttributeVideo> = new Map();

  for(const doc of altDocs) {
    const videoAttribute = doc?.attributes?.find(attr => attr._ === 'documentAttributeVideo');
    if(!videoAttribute) continue;
    assumeType<DocumentAttribute.documentAttributeVideo>(videoAttribute);

    result.set(doc.id.toString(), videoAttribute);
  }

  return result;
}

function getQualityURLsFromAltDocs(altDocs: Document.document[]) {
  const result: Map<string, string> = new Map();

  for(const doc of altDocs) {
    // "application/x-mpegurl" missing from union MTMimeType wtf
    if((doc.mime_type as string) !== QUALITY_FILE_MIME_TYPE) continue;

    result.set(getTargetDocIdForQualityFile(doc), getURLForQualityFile(doc));
  }

  return result;
}

function getURLForQualityFile(doc: Document.document) {
  return new URL(`hls_quality_file/${doc.id}`, window.location.href).toString();
}

function getTargetDocIdForQualityFile(doc: Document.document) {
  const fileNameAttribute = doc.attributes?.find(attr => attr._ === 'documentAttributeFilename');
  assumeType<DocumentAttribute.documentAttributeFilename>(fileNameAttribute);

  const rawFileName = doc.file_name || fileNameAttribute?.file_name;

  return rawFileName?.slice(QUALITY_FILE_NAME_PREFIX.length);
}
