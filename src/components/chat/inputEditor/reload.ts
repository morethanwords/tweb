import type {
  ChatInputEditor,
  ChatInputEditorOptions,
  CreateChatInputEditor
} from '@components/chat/inputEditor/types';
import {retainRichMediaPreviewDocument} from '@components/chat/inputEditor/mediaPreviewUrl';

export function createChatInputEditorReloadScheduler(input: HTMLElement, isComposing: () => boolean) {
  const appWindow = input.ownerDocument.defaultView;
  let timer: number;
  let pending: () => void;
  let destroyed = false;
  const onCompositionEnd = () => {
    appWindow.clearTimeout(timer);
    // The final DOM mutation can reach ProseMirror after compositionend.
    // Observe every composition, including one that ends just before HMR.
    timer = appWindow.setTimeout(() => {
      timer = undefined;
      if(isComposing()) return;
      const callback = pending;
      pending = undefined;
      callback?.();
    }, 30);
  };
  input.addEventListener('compositionend', onCompositionEnd);
  return {
    run(callback: () => void) {
      if(destroyed) return;
      if(isComposing() || timer !== undefined) pending = callback;
      else callback();
    },
    destroy() {
      destroyed = true;
      appWindow.clearTimeout(timer);
      pending = undefined;
      input.removeEventListener('compositionend', onCompositionEnd);
    }
  };
}

export default function reloadChatInputEditor(
  editor: ChatInputEditor,
  create: CreateChatInputEditor,
  options: ChatInputEditorOptions,
  snapshot = editor.snapshot()
) {
  const release = retainRichMediaPreviewDocument(snapshot.doc);
  try {
    editor.destroy();
    return create(editor.input, options, snapshot);
  } finally {
    release();
  }
}
