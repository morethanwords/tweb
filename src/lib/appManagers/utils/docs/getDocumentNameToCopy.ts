import type {MyDocument} from '@appManagers/appDocsManager';
import type {DocumentAttribute} from '@layer';
import getAudioAttribute from '@appManagers/utils/docs/getAudioAttribute';

/**
 * What "Copy Filename" copies of a document, as desktop's `AddCopyFilename`: a song's performer and
 * title, a file's own name, and nothing for what is shown rather than named - a sticker, a GIF, a
 * video, a voice or round message (their name is one made up for saving them)
 */
export default function getDocumentNameToCopy(doc: MyDocument) {
  switch(doc?.type) {
    case 'sticker':
    case 'gif':
    case 'video':
    case 'round':
    case 'voice':
      return;
  }

  const fileName = (doc?.attributes?.find((attribute) => attribute._ === 'documentAttributeFilename') as DocumentAttribute.documentAttributeFilename)?.file_name;
  if(doc?.type === 'audio') {
    const attribute = getAudioAttribute(doc);
    const title = attribute?.title || (attribute?.performer ? undefined : fileName);
    return [attribute?.performer, title].filter(Boolean).join(' – ') || undefined;
  }

  return fileName || undefined;
}
