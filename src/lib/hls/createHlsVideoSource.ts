import assumeType from '../../helpers/assumeType';
import {Document, DocumentAttribute} from '../../layer';

import {isDocumentHlsQualityFile} from './common';

const QUALITY_FILE_NAME_PREFIX = 'mtproto:';

const FALLBACK_BANDWIDTH = 1_000_000;
const FALLBACK_WIDTH = 1280;
const FALLBACK_HEIGHT = 720;

export function createHlsVideoSource(
  // message: Message.message
  altDocs: Document.document[]
): string | null {
  // const altDocs = getAltDocsFromMessage(message);

  const qualityEntries = getQualityFilesEntries(altDocs);

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

export function getQualityFilesEntries(altDocs: Document.document[]) {
  if(!altDocs?.length) return [];

  const videoAttributes = getVideoAttributesFromAltDocs(altDocs);
  const qualityURLs = getQualityURLsFromAltDocs(altDocs);

  return Array.from(videoAttributes.entries()).map(([id, attr]) => {
    const {w = FALLBACK_WIDTH, h = FALLBACK_HEIGHT, duration = 0} = attr;
    const {size} = altDocs.find(doc => doc.id.toString() === id);

    const bandwidth = (duration > 0 ? size / duration * 8 : FALLBACK_BANDWIDTH) | 0;

    return {
      id,
      w,
      h,
      duration,
      bandwidth,
      url: qualityURLs.get(id)
    }
  });
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
    if(!isDocumentHlsQualityFile(doc)) continue;

    result.set(getTargetDocIdForQualityFile(doc), getURLForQualityFile(doc));
  }

  return result;
}

function getURLForQualityFile(doc: Document.document) {
  return `hls_quality_file/${doc.id}`;
}

function getTargetDocIdForQualityFile(doc: Document.document) {
  const fileNameAttribute = doc.attributes?.find(attr => attr._ === 'documentAttributeFilename');
  assumeType<DocumentAttribute.documentAttributeFilename>(fileNameAttribute);

  const rawFileName = doc.file_name || fileNameAttribute?.file_name;

  return rawFileName?.slice(QUALITY_FILE_NAME_PREFIX.length);
}
