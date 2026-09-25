import type {Editor} from '@tiptap/core';
import createChatInputEditor from '@components/chat/inputEditor';
import type {ChatInputEditor, ChatInputEditorOptions, ChatInputEditorSnapshot} from '@components/chat/inputEditor/types';

export function mountChatInputEditor(options: ChatInputEditorOptions = {}, snapshot?: ChatInputEditorSnapshot) {
  const input = document.createElement('div');
  input.className = 'input-message-input';
  document.body.append(input);
  const editor = createChatInputEditor(input, options, snapshot);
  const tiptap = (editor as ChatInputEditor & {editor: Editor}).editor;
  return {editor, input, tiptap};
}
