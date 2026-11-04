import type {Editor} from '@tiptap/core';
import '@/tests/mocks/chatInputEditorNodes';
import {appleEnv} from '@/tests/mocks/isApple';
import {useMountedChatInputEditors} from '@/tests/helpers/chatInputEditor';
import type {ChatInputEditor, ChatInputEditorOptions} from '@components/chat/inputEditor/types';
import isSelectionEmpty from '@helpers/dom/isSelectionEmpty';
import selectElementContents from '@helpers/dom/selectElementContents';

type Press = readonly [name: string, code: string, key: string, init: KeyboardEventInit];

/*
 * The composer takes Ctrl (Cmd on a Mac) and a letter, and only where the key does something. What a browser or
 * the system binds to more than that stays theirs: a closed tab to reopen, the bookmarks bar, DevTools, print,
 * a letter AltGr types — with the text selected or not.
 */
describe('the editor leaves the browser its shortcuts', () => {
  const mountChatInputEditor = useMountedChatInputEditors();

  function mount(selected: boolean, options?: ChatInputEditorOptions) {
    const mounted = mountChatInputEditor(options);
    Object.defineProperty(mounted.tiptap.view, 'scrollToSelection', {configurable: true, value: vi.fn()});
    mounted.editor.setTextWithEntities('Body');
    if(selected) {
      mounted.editor.restoreSelection({from: 1, to: 5}, false);
      // the formatting keys read the document's selection too, which jsdom's view does not write
      selectElementContents(mounted.input);
    } else {
      mounted.editor.focusAtEnd(false);
    }
    expect(isSelectionEmpty(document.getSelection()), 'the document holds no such selection').toBe(!selected);
    expect(mounted.tiptap.state.selection.empty, 'the editor holds no such selection').toBe(!selected);
    return mounted;
  }

  function press(input: HTMLElement, [, code, key, init]: Press) {
    const event = new KeyboardEvent('keydown', {code, key, bubbles: true, cancelable: true, ...init});
    input.dispatchEvent(event);
    return event.defaultPrevented;
  }

  const snapshot = (editor: ChatInputEditor, tiptap: Editor) =>
    JSON.stringify([tiptap.getJSON(), editor.getRichValue(true, false).entities]);

  function expectLeftAlone(shortcut: Press, selected: boolean, options?: ChatInputEditorOptions) {
    const {editor, input, tiptap} = mount(selected, options);
    const before = snapshot(editor, tiptap);
    expect(press(input, shortcut), `${shortcut[0]} was taken from the browser`).toBe(false);
    expect(snapshot(editor, tiptap), `${shortcut[0]} changed the text`).toBe(before);
  }

  afterEach(() => {
    appleEnv.isApple = false;
  });

  const ELSEWHERE: Press[] = [
    ['Ctrl+Shift+T, reopening a closed tab', 'KeyT', 'T', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+B, the bookmarks bar', 'KeyB', 'B', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+H, the history', 'KeyH', 'H', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+I, DevTools', 'KeyI', 'I', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+K, the console', 'KeyK', 'K', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+M, the profiles', 'KeyM', 'M', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+P, a private window', 'KeyP', 'P', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+S, a screenshot', 'KeyS', 'S', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+Shift+U', 'KeyU', 'U', {ctrlKey: true, shiftKey: true}],
    ['Ctrl+M, muting the tab', 'KeyM', 'm', {ctrlKey: true}],
    ['Ctrl+P, print', 'KeyP', 'p', {ctrlKey: true}],
    // Tiptap's code block, Cmd+Option+C on a Mac — DevTools' inspect; jsdom's keymap reads Mod as Ctrl
    ['Ctrl+Alt+C', 'KeyC', 'c', {ctrlKey: true, altKey: true}],
    ['AltGr+1 typing ~', 'Digit1', '~', {ctrlKey: true, altKey: true}],
    ['AltGr+2 typing ²', 'Digit2', '²', {ctrlKey: true, altKey: true}],
    ['AltGr+S typing ś', 'KeyS', 'ś', {ctrlKey: true, altKey: true}]
  ];

  const ON_A_MAC: Press[] = [
    ['Cmd+Shift+T, reopening a closed tab', 'KeyT', 'T', {metaKey: true, shiftKey: true}],
    ['Cmd+Shift+B, the bookmarks bar', 'KeyB', 'B', {metaKey: true, shiftKey: true}],
    ['Cmd+Shift+H, the home page', 'KeyH', 'H', {metaKey: true, shiftKey: true}],
    ['Cmd+Shift+M, the profiles', 'KeyM', 'M', {metaKey: true, shiftKey: true}],
    ['Cmd+M, minimizing the window', 'KeyM', 'm', {metaKey: true}],
    ['Cmd+P, print', 'KeyP', 'p', {metaKey: true}],
    ['Cmd+Option+I, DevTools', 'KeyI', 'Dead', {metaKey: true, altKey: true}],
    ['Cmd+Option+U, the page source', 'KeyU', 'Dead', {metaKey: true, altKey: true}],
    ['Cmd+Option+B, the bookmark manager', 'KeyB', '∫', {metaKey: true, altKey: true}],
    ['Cmd+Option+K, the console', 'KeyK', '˚', {metaKey: true, altKey: true}],
    // and Ctrl+B or Ctrl+I, which only the composer's own handler looks at: the marks' keymap knows a Mac by
    // the platform jsdom has no say in
    ['Ctrl+K, deleting to the end of the line', 'KeyK', 'k', {ctrlKey: true}]
  ];

  describe.each([false, true])('with the text selected: %s', (selected) => {
    test.each(ELSEWHERE)('leaves %s', (...shortcut) => {
      expectLeftAlone(shortcut, selected);
    });

    test.each(ON_A_MAC)('on a Mac, leaves %s', (...shortcut) => {
      appleEnv.isApple = true;
      expectLeftAlone(shortcut, selected);
    });

    test('leaves Ctrl+K where the field has no links', () => {
      expectLeftAlone(['Ctrl+K', 'KeyK', 'k', {ctrlKey: true}], selected, {
        plainOnly: true,
        formatting: new Set(['bold']),
        onLinkEditor: vi.fn()
      });
    });

    test('takes Ctrl+K for the link where there are links', () => {
      const onLinkEditor = vi.fn();
      const {input} = mount(selected, {onLinkEditor});
      expect(press(input, ['Ctrl+K', 'KeyK', 'k', {ctrlKey: true}])).toBe(true);
      expect(onLinkEditor).toHaveBeenCalledOnce();
    });
  });

  test('leaves Ctrl+S where the field has no strikethrough', () => {
    expectLeftAlone(['Ctrl+S', 'KeyS', 's', {ctrlKey: true}], true, {
      plainOnly: true,
      formatting: new Set(['bold'])
    });
  });

  test.each([
    ['Ctrl+B', 'KeyB', 'b', 'messageEntityBold'],
    ['Ctrl+I', 'KeyI', 'i', 'messageEntityItalic'],
    ['Ctrl+U', 'KeyU', 'u', 'messageEntityUnderline'],
    ['Ctrl+S', 'KeyS', 's', 'messageEntityStrike']
  ] as const)('formats a selection on %s', (name, code, key, entity) => {
    const {editor, input} = mount(true);
    expect(press(input, [name, code, key, {ctrlKey: true}])).toBe(true);
    expect(editor.getRichValue(true, false).entities.map((it) => it._)).toEqual([entity]);
  });

  test('on a Mac, formats a selection on Cmd+B', () => {
    appleEnv.isApple = true;
    const {editor, input} = mount(true);
    expect(press(input, ['Cmd+B', 'KeyB', 'b', {metaKey: true}])).toBe(true);
    expect(editor.getRichValue(true, false).entities.map((it) => it._)).toEqual(['messageEntityBold']);
  });

  // jsdom's keymap reads Mod as Ctrl on any platform, so the Mac's Cmd+Y is pressed as Ctrl+Y here
  test.each([false, true])('redoes on Mod+Y but on a Mac, where Cmd+Y is the history (a Mac: %s)', (isApple) => {
    appleEnv.isApple = isApple;
    const {editor, input, tiptap} = mount(false);
    tiptap.commands.insertContent(' more');
    const edited = editor.getRichValue(false).value;
    tiptap.commands.undo();
    const undone = editor.getRichValue(false).value;
    expect(undone).not.toBe(edited);
    expect(press(input, ['Mod+Y', 'KeyY', 'y', {ctrlKey: true}])).toBe(!isApple);
    expect(editor.getRichValue(false).value).toBe(isApple ? undone : edited);
  });

  // the typed digit is the binding's, which ProseMirror's keymap does not look for under AltGr on Windows
  test('makes a heading on Ctrl+Alt+1', () => {
    const {input, tiptap} = mount(false);
    expect(press(input, ['Ctrl+Alt+1', 'Digit1', '1', {ctrlKey: true, altKey: true}])).toBe(true);
    expect(tiptap.getJSON().content?.[0]).toMatchObject({type: 'heading', attrs: {level: 1}});
  });
});
