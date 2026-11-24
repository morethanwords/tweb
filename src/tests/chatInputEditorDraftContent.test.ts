import '@/tests/mocks/chatInputEditorNodes';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import deriveEditorDraftContent from '@components/chat/inputEditor/draftContent';
import type {PageBlock} from '@layer';
import makePhoto from '@/tests/mocks/photo';

describe('chat input editor draft content', () => {
  const beginPhotoUpload = (
    editor: ChatInputEditor,
    id: string
  ) => editor.beginRichMediaUpload({
    grouped: false,
    id,
    items: [{
      id: `${id}-0`,
      progress: 0,
      state: 'preparing',
      type: 'photo'
    }],
    previewUrls: [`blob:${id}`],
    selection: editor.captureSelection()
  });

  test('preserves an inserted empty table as a rich draft', () => {
    const {editor, input} = mountChatInputEditor();

    try {
      expect(editor.insertTable({columns: 1, rows: 1, withHeaderRow: false})).toBe(true);
      expect(editor.getDocument().content?.[0]).toMatchObject({
        type: 'chatTableWrapper',
        content: [
          {type: 'chatTableTitle'},
          {
            type: 'table',
            content: [{
              type: 'tableRow',
              content: [{type: 'tableCell'}]
            }]
          }
        ]
      });
      expect(editor.isEmpty()).toBe(true);
      expect(editor.isPlaceholderEmpty()).toBe(false);

      const content = deriveEditorDraftContent(editor);
      expect(content.legacyValue).toBeUndefined();
      expect(content.richMessage?.input.blocks).toHaveLength(1);
      expect(content.richMessage?.input.blocks[0]._).toBe('pageBlockTable');
      expect((content.richMessage?.input.blocks[0] as PageBlock.pageBlockTable)
      .rows[0].cells[0].text).toEqual({_: 'textEmpty'});
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('does not persist a pending-only media placeholder as an empty rich draft', () => {
    const {editor, input} = mountChatInputEditor();

    try {
      expect(beginPhotoUpload(editor, 'pending-only')).toBe(true);
      expect(editor.hasPendingRichMediaUploads()).toBe(true);
      expect(editor.getRichMessage({draft: true}).input.blocks).toEqual([]);
      expect(deriveEditorDraftContent(editor)).toEqual({});
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('keeps real text in a rich draft while omitting its pending media placeholder', () => {
    const {editor, input} = mountChatInputEditor();

    try {
      editor.setTextWithEntities('Draft text');
      editor.focusAtEnd(false);
      expect(beginPhotoUpload(editor, 'pending-with-text')).toBe(true);

      const content = deriveEditorDraftContent(editor);
      expect(content.legacyValue).toBeUndefined();
      expect(content.richMessage?.input.blocks[0]).toMatchObject({
        _: 'pageBlockParagraph',
        text: {_: 'textPlain', text: 'Draft text'}
      });
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  // * an Add or a Replace uploads onto media already there, which stays in the draft as it stands meanwhile
  test.each(['add', 'replace'] as const)('keeps the media a pending %s stands on in a rich draft', (action) => {
    const {editor, input, tiptap} = mountChatInputEditor();

    try {
      expect(editor.insertRichMedia([
        {type: 'photo', photo: makePhoto(1), previewUrl: 'blob:draft-first'},
        {type: 'photo', photo: makePhoto(2), previewUrl: 'blob:draft-second'}
      ], {grouped: true})).toBe(true);
      const before = deriveEditorDraftContent(editor).richMessage;
      expect(before?.input.blocks).toMatchObject([{_: 'pageBlockCollage'}]);

      const id = `draft-${action}`;
      expect(editor.beginRichMediaUpload({
        action,
        activeIndex: 0,
        grouped: false,
        id,
        items: [{id: `${id}-0`, progress: 0, state: 'uploading', type: 'photo'}],
        previewUrls: [`blob:${id}`],
        selection: {from: 0, to: tiptap.state.doc.firstChild.nodeSize, type: 'node'}
      })).toBe(true);

      const content = deriveEditorDraftContent(editor);
      expect(content.richMessage?.input.blocks).toEqual(before.input.blocks);
      expect(content.richMessage?.output.photos).toEqual(before.output.photos);
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('persists quotes as plain or rich according to expansion and author state', () => {
    const {editor, input} = mountChatInputEditor();

    try {
      editor.setTextWithEntities('Quote', [{
        _: 'messageEntityBlockquote',
        offset: 0,
        length: 5,
        pFlags: {}
      }]);
      expect(deriveEditorDraftContent(editor)).toMatchObject({
        legacyValue: {value: 'Quote'},
        richMessage: undefined
      });

      editor.setExpanded(true);
      let content = deriveEditorDraftContent(editor);
      expect(content.legacyValue).toBeUndefined();
      expect(content.richMessage?.input.blocks[0]).toMatchObject({
        _: 'pageBlockBlockquote',
        caption: {_: 'textEmpty'}
      });

      editor.setExpanded(false);
      expect(deriveEditorDraftContent(editor)).toMatchObject({
        legacyValue: {value: 'Quote'},
        richMessage: undefined
      });

      editor.setExpanded(true);
      editor.restoreSelection({from: 2, to: 2}, false);
      expect(editor.setBlockquoteCaption('Author')).toBe(true);
      editor.setExpanded(false);
      content = deriveEditorDraftContent(editor);
      expect(content.legacyValue).toBeUndefined();
      expect(content.richMessage?.input.blocks[0]).toMatchObject({
        _: 'pageBlockBlockquote'
      });
    } finally {
      editor.destroy();
      input.remove();
    }
  });
});
