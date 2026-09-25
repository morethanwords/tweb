import type {ChatInputEditor} from '@components/chat/inputEditor/types';

const editors = new WeakMap<HTMLElement, ChatInputEditor>();

export function getChatInputEditor(input: HTMLElement) {
  return editors.get(input);
}

export function registerChatInputEditor(input: HTMLElement, editor: ChatInputEditor) {
  editors.set(input, editor);
  return () => {
    if(editors.get(input) === editor) {
      editors.delete(input);
    }
  };
}
