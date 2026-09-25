import type {ChatInputEditor} from '@components/chat/inputEditor/types';

/** Match content across an asynchronous composer operation without copying a rich document. */
export default function captureInputContent(input: HTMLElement, editor?: ChatInputEditor) {
  const revision = editor?.captureSelection().revision;
  const html = !editor ? input.innerHTML : undefined;
  return (currentEditor?: ChatInputEditor) => currentEditor === editor && (
    editor ? editor.captureSelection().revision === revision : input.innerHTML === html
  );
}
