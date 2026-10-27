import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController} from '@components/richMessageInput';
import type {ChatInputRichMedia} from '@components/chat/inputEditor/types';
import {createMockManagers} from '@components/popupSandbox/mockManagers';
import {getMockManagers} from '@components/popupSandbox/environment';
import deferredPromise, {type CancellablePromise} from '@helpers/cancellablePromise';
import noop from '@helpers/noop';
import rootScope from '@lib/rootScope';
import {ensureMediaPlayback} from './mediaPlayback';

/**
 * The complete field mounts without ChatInput. Only transport is replaced. `premiumRequired` shows
 * the premium stars on what a rich message alone can carry; `sendsRich: false` is a rich message that
 * would not go out as it is (no Premium), which leaves the folded field a plain one; `inChat` puts the
 * field where the chat keeps it, in the composer's rows, whose rules size every button in them.
 */
export function mountRichMediaComposerHarness({premiumRequired = false, sendsRich = true, inChat = false} = {}) {
  const managers = createMockManagers();
  const requests: Array<ReturnType<typeof deferredPromise<ChatInputRichMedia>>> = [];
  // whether each upload was asked for as a file block, and under what name
  const asFileRequests: boolean[] = [];
  const requestNames: string[] = [];
  // a file's or an audio's upload, as the worker keeps one for its row (`prepareRichMessageMedia`)
  const uploads = new Map<string, CancellablePromise<void>>();
  let preparedDocuments = 0;
  // what the row asks the managers about its upload, through the app's own download manager
  const revertUploads = getMockManagers().override({
    appMessagesManager: {getUploadPromise: (fileName: string) => uploads.get(fileName)},
    // the row's ring cancels the upload where the app's does
    apiFileManager: {cancelDownload: (fileName: string) => {
      const index = requestNames.lastIndexOf(fileName);
      if(index === -1) return false;
      requests[index].reject({type: 'UPLOAD_CANCELED'});
      return true;
    }}
  });
  let cancelRequests = 0;
  let sends = 0;
  let active = true;
  let dispose: VoidFunction;
  let field: RichMessageInputController;
  rootScope.managers = managers.managers;
  ensureMediaPlayback();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;z-index:3;overflow:auto;padding:32px;background:var(--surface-color);';
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.textContent = 'Choose media';
  const element = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return RichMessageInput({
      captureContext: () => () => active,
      getPremiumRequired: async() => premiumRequired,
      canSendRich: async() => sendsRich,
      onSubmit: () => {++sends;},
      media: {
        capture: () => ({
          isCurrent: () => active,
          authorize: async() => true,
          // the local document a row is drawn from, as the worker makes one of the file
          prepare: async(details, fileName, asFile) => {
            const file = details.file as File;
            const audio = !asFile && file.type.startsWith('audio/');
            const upload = deferredPromise<void>();
            upload.catch(noop);
            uploads.set(fileName, upload);
            return {document: {
              _: 'document', pFlags: {}, id: String(8000 + ++preparedDocuments), access_hash: '0',
              file_reference: new Uint8Array(), date: 0, dc_id: 0, size: file.size, mime_type: file.type as MTMimeType,
              file_name: file.name, attributes: [
                {_: 'documentAttributeFilename', file_name: file.name},
                ...(audio ? [{_: 'documentAttributeAudio' as const, pFlags: {}, duration: details.duration || 0}] : [])
              ],
              ...(audio && {type: 'audio' as const, duration: details.duration || 0})
            }};
          },
          upload: (_details, fileName, asFile) => {
            const pending = deferredPromise<ChatInputRichMedia>();
            requests.push(pending);
            asFileRequests.push(!!asFile);
            requestNames.push(fileName);
            // the row's upload ends with the request, as the worker's does
            const upload = uploads.get(fileName);
            if(upload) pending.then(() => upload.resolve(), (error) => upload.reject(error));
            return pending;
          },
          cancel: (fileName) => {
            ++cancelRequests;
            uploads.get(fileName)?.reject({type: 'UPLOAD_CANCELED'});
          }
        })
      },
      ref: (value) => {field = value;}
    });
  });
  element.style.cssText = 'margin:16px auto;max-width:700px;';
  if(inChat) {
    // the chat's composer lays itself out around its rows, so of it only the button size it hands
    // them down is taken over, as its own styles set it
    const chatInput = document.createElement('div');
    chatInput.className = 'chat-input-wrapper';
    document.body.append(chatInput);
    const rows = document.createElement('div');
    rows.className = 'rows-wrapper';
    rows.style.setProperty('--button-size', getComputedStyle(chatInput).getPropertyValue('--button-size'));
    chatInput.remove();
    rows.append(element);
    container.append(choose, rows);
  } else {
    container.append(choose, element);
  }
  document.body.append(container);
  field.setExpanded(true);
  choose.onclick = () => field.chooseMedia(undefined, undefined, 'image/*');
  return {
    state: () => ({
      document: field.editor.getDocument(),
      uploads: requests.length,
      asFileRequests: [...asFileRequests],
      tasks: field.media.pendingTasks,
      cancelRequests,
      sends
    }),
    setText: (text: string) => field.editor.setTextWithEntities(text),
    setDocument: (document: Parameters<RichMessageInputController['editor']['setDocument']>[0]) => {
      field.editor.setDocument(document);
    },
    setExpanded: (expanded: boolean) => field.setExpanded(expanded),
    /** Settled on the schema the capabilities call for (`richReady`). */
    ready: () => field.richReady,
    /** Files put in where the caret is, as the attach menu's File does with `asFile`. */
    insertFiles: (files: File[], asFile?: boolean) => {
      field.editor.focusAtEnd(false);
      return field.insertMedia(files, field.editor.captureSelection(), undefined, asFile);
    },
    richMessage: () => field.editor.getRichMessage(),
    /** How far the upload `index` has got, as the worker reports an upload's progress. */
    progress: (index: number, done: number, total: number) => {
      rootScope.dispatchEvent('download_progress', {fileName: requestNames[index], done, total, offset: done});
    },
    /** The upload `index` done as a file (or an audio): the document the server made of it. */
    finishDocument: (index: number, file: {name: string, size: number, mimeType: string, type?: 'audio' | 'document'}) => {
      const audio = file.type === 'audio';
      requests[index].resolve({type: file.type || 'document', document: {
        _: 'document', pFlags: {}, id: String(9200 + index), access_hash: '1',
        file_reference: new Uint8Array(), date: 0, dc_id: 2, size: file.size, mime_type: file.mimeType as MTMimeType,
        file_name: file.name, attributes: [
          {_: 'documentAttributeFilename', file_name: file.name},
          ...(audio ? [{_: 'documentAttributeAudio' as const, pFlags: {}, duration: 125}] : [])
        ],
        // as the drafts manager hands back a processed document
        ...(audio && {type: 'audio' as const, duration: 125})
      }});
    },
    finish: (index: number, success = true) => {
      if(!success) {
        requests[index].reject(new Error('FIXTURE_UPLOAD_FAILED'));
        return;
      }
      requests[index].resolve({type: 'photo', photo: {
        _: 'photo', pFlags: {}, id: String(9100 + index), access_hash: '1',
        file_reference: new Uint8Array(), date: 0, sizes: [], dc_id: 2
      }});
    },
    destroy: () => {
      active = false;
      dispose();
      container.remove();
      revertUploads();
    }
  };
}

export type RichMediaComposerHarness = ReturnType<typeof mountRichMediaComposerHarness>;
