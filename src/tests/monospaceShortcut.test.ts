import type {Editor} from '@tiptap/core';
import '@/tests/mocks/chatInputEditorNodes';
import {appleEnv} from '@/tests/mocks/isApple';
import {useMountedChatInputEditors} from '@/tests/helpers/chatInputEditor';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';

/*
 * Monospace by the keyboard is tdesktop's ctrl+shift+m - Cmd+Shift+M on a Mac, where Cmd+M minimizes the
 * window and is left to the system, with text selected or not. Elsewhere Ctrl+M stays monospace.
 */
describe('the monospace shortcut', () => {
  const mountChatInputEditor = useMountedChatInputEditors();

  function mountEditor(text: string, selected: boolean) {
    const mounted = mountChatInputEditor();
    Object.defineProperty(mounted.tiptap.view, 'scrollToSelection', {configurable: true, value: vi.fn()});
    mounted.editor.setTextWithEntities(text);
    if(selected) mounted.editor.restoreSelection({from: 1, to: text.length + 1}, false);
    else mounted.editor.focusAtEnd(false);
    return mounted;
  }

  function press(input: HTMLElement, init: KeyboardEventInit) {
    const event = new KeyboardEvent('keydown', {key: 'm', code: 'KeyM', bubbles: true, cancelable: true, ...init});
    input.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** whether the text came out monospace: a code block for a caret, the code entity for a selection */
  function isMonospace(editor: ChatInputEditor, tiptap: Editor) {
    return tiptap.getJSON().content?.[0]?.type === 'codeBlock' ||
      editor.getRichValue(true, false).entities.some((entity) => entity._ === 'messageEntityCode');
  }

  afterEach(() => {
    appleEnv.isApple = false;
  });

  describe.each([false, true])('with the text selected: %s', (selected) => {
    test('on a Mac, Cmd+M is left to the system and Cmd+Shift+M makes it monospace', () => {
      appleEnv.isApple = true;
      const {editor, input, tiptap} = mountEditor('Body', selected);
      expect(press(input, {metaKey: true}), 'Cmd+M was taken from the system').toBe(false);
      expect(isMonospace(editor, tiptap)).toBe(false);

      expect(press(input, {metaKey: true, shiftKey: true})).toBe(true);
      expect(isMonospace(editor, tiptap), 'Cmd+Shift+M did not make the text monospace').toBe(true);
    });

    test('elsewhere, Ctrl+M makes it monospace', () => {
      const {editor, input, tiptap} = mountEditor('Body', selected);
      expect(press(input, {ctrlKey: true})).toBe(true);
      expect(isMonospace(editor, tiptap), 'Ctrl+M did not make the text monospace').toBe(true);
    });
  });
});
