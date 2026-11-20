import type {Document} from '@layer';
import type {EditorGifContext} from '@components/mediaEditor/animatedDocument';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getAccountSession, getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';

export type DocumentRendererSource = {
  isAlive: () => boolean;
  download: (doc: Document.document) => Promise<Blob>;
};

export function captureDocumentRendererSource(managers: EditorGifContext['managers']): DocumentRendererSource {
  const bound = bindManagersToSession(managers);
  const docs = bound?.appDocsManager;
  const session = bound && getManagersSession(bound);
  const isAlive = () => !session || !isSessionLeaving(session);
  return {
    isAlive,
    async download(doc) {
      checkDocumentRendererSource({isAlive});
      if(!docs) throw new Error('Editor document account unavailable');
      const blob = await docs.downloadDoc(doc);
      checkDocumentRendererSource({isAlive});
      return blob;
    }
  };
}

export function checkDocumentRendererSource(source?: Pick<DocumentRendererSource, 'isAlive'>, onStale?: () => void) {
  if(source && !source.isAlive()) {
    onStale?.();
    throw new Error('Editor document account session ended');
  }
}

export async function downloadDocumentRendererBlob(doc: Document.document, source?: DocumentRendererSource) {
  checkDocumentRendererSource(source);
  if(!source) {
    const session = getAccountSession();
    const {default: downloads} = await import('@lib/appDownloadManager');
    if(isSessionLeaving(session)) throw new Error('Editor document account session ended');
    const blob = await downloads.downloadMedia({media: doc});
    if(isSessionLeaving(session)) throw new Error('Editor document account session ended');
    return blob;
  }
  const blob = await source.download(doc);
  checkDocumentRendererSource(source);
  if(!(blob instanceof Blob)) throw new Error('Document download unavailable');
  return blob;
}
