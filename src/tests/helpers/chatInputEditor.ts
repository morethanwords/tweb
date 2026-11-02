import type {Editor} from '@tiptap/core';
import createChatInputEditor from '@components/chat/inputEditor';
import type {ChatInputEditor, ChatInputEditorOptions, ChatInputEditorSnapshot} from '@components/chat/inputEditor/types';

/**
 * Mounts editors for the tests of a suite and, after each test, destroys them and empties the document:
 * call it in the suite's body, and mount with what it returns
 */
export function useMountedChatInputEditors() {
  const editors: ChatInputEditor[] = [];
  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.replaceChildren();
  });

  return (...args: Parameters<typeof mountChatInputEditor>) => {
    const mounted = mountChatInputEditor(...args);
    editors.push(mounted.editor);
    return mounted;
  };
}

export function mountChatInputEditor(options: ChatInputEditorOptions = {}, snapshot?: ChatInputEditorSnapshot) {
  const input = document.createElement('div');
  input.className = 'input-message-input';
  document.body.append(input);
  const editor = createChatInputEditor(input, options, snapshot);
  const tiptap = (editor as ChatInputEditor & {editor: Editor}).editor;
  return {editor, input, tiptap};
}

/** pastes into `input` a clipboard that holds `html`, and `text` as its plain text */
export function dispatchPaste(input: HTMLElement, html: string, text = '') {
  const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {value: {
    getData: (type: string) => type === 'text/html' ? html : type === 'text/plain' ? text : ''
  }});
  input.dispatchEvent(event);
}
