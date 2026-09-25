import '@/tests/mocks/chatInputEditorNodes';
import {CHAT_INPUT_EXTENSIONS, PLAIN_MESSAGE_EXTENSIONS, TIPTAP_BASE_EXTENSIONS} from '@components/chat/inputEditor/extensions';
import {PLAIN_MESSAGE_MARK_NAMES, PLAIN_MESSAGE_NODE_NAMES} from '@components/chat/inputEditor/plainSchema';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';

const names = (type: string) => PLAIN_MESSAGE_EXTENSIONS
.filter((extension) => extension.type === type)
.map((extension) => extension.name);

describe('plain message schema', () => {
  test('carries every node and mark a plain message can represent', () => {
    // `doc` has no content of its own and is not part of the classification.
    expect(new Set(names('node'))).toEqual(new Set(['doc', ...PLAIN_MESSAGE_NODE_NAMES]));
    // `inlineQuote` is listed for the mode check but no extension provides it.
    const marks = new Set(PLAIN_MESSAGE_MARK_NAMES);
    marks.delete('inlineQuote');
    expect(new Set(names('mark'))).toEqual(marks);
  });

  test('leaves out everything a caption cannot carry', () => {
    const all = [...TIPTAP_BASE_EXTENSIONS, ...CHAT_INPUT_EXTENSIONS];
    const dropped = all
    .filter((extension) => !PLAIN_MESSAGE_EXTENSIONS.includes(extension))
    .map((extension) => extension.name);

    // A rich block reaching a caption is the failure this schema exists to
    // prevent, so name them rather than asserting a count.
    expect(dropped).toEqual(expect.arrayContaining([
      'heading', 'pullquote', 'details', 'chatTableWrapper', 'tableCell', 'tableHeader',
      'richMedia', 'richMap', 'richFooter', 'richDivider', 'richAnchor', 'inlineRichAnchor',
      'blockMath', 'inlineMath', 'opaqueRichBlock', 'taskList', 'taskItem',
      'highlight', 'subscript', 'superscript',
      'chatBlockReorder', 'chatRichBlockEditing', 'chatRichMediaUploadHistory', 'tableKit'
    ]));
    expect(dropped).not.toEqual(expect.arrayContaining([...PLAIN_MESSAGE_NODE_NAMES]));
  });

  test('a plain field stays in plain mode and serializes to text and entities', () => {
    const {editor, input} = mountChatInputEditor({plainOnly: true});
    try {
      editor.setTextWithEntities('Caption', [{_: 'messageEntityBold', offset: 0, length: 7}]);
      expect(editor.getMode()).toBe('plain');

      const value = editor.getRichValue(true);
      expect(value.value).toBe('Caption');
      expect(value.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 7}]);
      expect(editor.getLegacyValueIfLossless()).toBeTruthy();
    } finally {
      editor.destroy();
      input.remove();
    }
  });

  test('refuses a rich block instead of accepting one it cannot send', () => {
    const {editor, input} = mountChatInputEditor({plainOnly: true});
    try {
      expect(editor.setDocument({
        type: 'doc',
        content: [{type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Title'}]}]
      })).toBe(false);
      expect(editor.isEmpty()).toBe(true);
      expect(editor.getMode()).toBe('plain');
    } finally {
      editor.destroy();
      input.remove();
    }
  });
});
