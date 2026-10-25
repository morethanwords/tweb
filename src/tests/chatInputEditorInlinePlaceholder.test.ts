import '@/tests/mocks/chatInputEditorNodes';
import {TextSelection} from '@tiptap/pm/state';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';

describe('inline bot placeholders', () => {
  test.each([false, true])('belongs to the username paragraph without becoming draft content (plainOnly=%s)', (plainOnly) => {
    const {editor, input, tiptap} = mountChatInputEditor({plainOnly});
    try {
      editor.setTextWithEntities('@pic ');
      const document = tiptap.state.doc.toJSON();
      editor.setInlineBotPlaceholder('Search Images');

      const paragraph = input.querySelector('.chat-input-inline-placeholder');
      expect(paragraph?.getAttribute('data-inline-placeholder')).toBe('Search Images');
      expect(paragraph?.textContent).toBe('@pic ');
      expect(input.hasAttribute('data-inline-placeholder')).toBe(false);
      expect(tiptap.state.doc.toJSON()).toEqual(document);
      expect(editor.getRichValue().value).toBe('@pic ');
      expect(editor.snapshot().doc).toEqual(document);
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('survives caret moves and clears immediately when the query changes', () => {
    const {editor, input, tiptap} = mountChatInputEditor();
    try {
      editor.setTextWithEntities('@pic ');
      tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 6)));
      editor.setInlineBotPlaceholder('Search Images');
      expect(tiptap.state.selection.from).toBe(6);

      tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(tiptap.state.doc, 5)));
      expect(input.querySelector('.chat-input-inline-placeholder')).not.toBeNull();

      tiptap.view.dispatch(tiptap.state.tr.insertText('cats', 6));
      expect(input.querySelector('.chat-input-inline-placeholder')).toBeNull();
      expect(editor.getRichValue().value).toBe('@pic cats');
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('clears the hint without changing the document or its selection', () => {
    const {editor, input, tiptap} = mountChatInputEditor();
    try {
      editor.setTextWithEntities('@pic ');
      editor.setInlineBotPlaceholder('Search Images');
      const document = tiptap.state.doc;
      const selection = tiptap.state.selection;

      editor.setInlineBotPlaceholder();
      expect(input.querySelector('[data-inline-placeholder]')).toBeNull();
      expect(tiptap.state.doc).toBe(document);
      expect(tiptap.state.selection.eq(selection)).toBe(true);
    } finally {
      editor.destroy();
      input.remove();
    }
  });
});
