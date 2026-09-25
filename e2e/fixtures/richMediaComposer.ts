import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController} from '@components/richMessageInput';
import type {ChatInputRichMedia} from '@components/chat/inputEditor/types';
import {createMockManagers} from '@components/popupSandbox/mockManagers';
import deferredPromise from '@helpers/cancellablePromise';
import rootScope from '@lib/rootScope';

/** The complete field mounts without ChatInput. Only transport is replaced. */
export function mountRichMediaComposerHarness() {
  const managers = createMockManagers();
  const requests: Array<ReturnType<typeof deferredPromise<ChatInputRichMedia>>> = [];
  let cancelRequests = 0;
  let sends = 0;
  let active = true;
  let dispose: VoidFunction;
  let field: RichMessageInputController;
  rootScope.managers = managers.managers;
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;z-index:3;overflow:auto;padding:32px;background:var(--surface-color);';
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.textContent = 'Choose media';
  const element = createRoot((disposeRoot) => {
    dispose = disposeRoot;
    return RichMessageInput({
      captureContext: () => () => active,
      onSubmit: () => {++sends;},
      media: {
        capture: () => ({
          isCurrent: () => active,
          authorize: async() => true,
          upload: () => {
            const pending = deferredPromise<ChatInputRichMedia>();
            requests.push(pending);
            return pending;
          },
          cancel: () => {++cancelRequests;}
        })
      },
      ref: (value) => {field = value;}
    });
  });
  element.style.cssText = 'margin:16px auto;max-width:700px;';
  container.append(choose, element);
  document.body.append(container);
  field.setExpanded(true);
  choose.onclick = () => field.chooseMedia(undefined, undefined, 'image/*');
  return {
    state: () => ({
      document: field.editor.getDocument(),
      uploads: requests.length,
      tasks: field.media.pendingTasks,
      cancelRequests,
      sends
    }),
    setText: (text: string) => field.editor.setTextWithEntities(text),
    setDocument: (document: Parameters<RichMessageInputController['editor']['setDocument']>[0]) => {
      field.editor.setDocument(document);
    },
    setExpanded: (expanded: boolean) => field.setExpanded(expanded),
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
    }
  };
}

export type RichMediaComposerHarness = ReturnType<typeof mountRichMediaComposerHarness>;
