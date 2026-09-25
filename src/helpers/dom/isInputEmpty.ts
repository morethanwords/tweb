import {getChatInputEditor} from '@components/chat/inputEditor/registry';

export default function isInputEmpty(element: HTMLElement, allowStartingSpace?: boolean) {
  const editor = getChatInputEditor(element);
  if(editor) return editor.isEmpty();

  return isNativeInputEmpty(element, allowStartingSpace);
}

export function isInputPlaceholderEmpty(element: HTMLElement, allowStartingSpace?: boolean) {
  const editor = getChatInputEditor(element);
  if(editor) return editor.isPlaceholderEmpty();

  return isNativeInputEmpty(element, allowStartingSpace);
}

function isNativeInputEmpty(element: HTMLElement, allowStartingSpace?: boolean) {
  let value: string;
  if(element.isContentEditable || element.tagName !== 'INPUT') {
    if(element.querySelector('.emoji, .custom-emoji, .custom-emoji-placeholder')) {
      return false;
    }
    /* const value = element.innerText;

    return !value.trim() && !serializeNodes(Array.from(element.childNodes)).trim(); */
    // return !getRichValueWithCaret(element, false, false).value.trim();
    value = element.textContent;
  } else {
    value = (element as HTMLInputElement).value;
  }

  if(!allowStartingSpace) {
    return !value.trim();
  }

  return !value;
}
