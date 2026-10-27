import '@/tests/mocks/chatInputEditorNodes';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import isRTL from '@helpers/string/isRTL';

describe('chat input editor direction', () => {
  test('a draft is laid out in the direction it is sent in, an empty one in the field\'s', () => {
    const {editor, input} = mountChatInputEditor();
    input.setAttribute('dir', 'auto');

    try {
      editor.setTextWithEntities('Hello, world.');
      expect(input.dir).toBe('ltr');

      editor.setTextWithEntities('مرحبا بالعالم');
      expect(input.dir).toBe('rtl');

      // * a line of digits has no letter to go by: sent left to right, laid out so
      editor.setTextWithEntities('123');
      expect(input.dir).toBe('ltr');

      // * an emoji is no letter either: the word after it decides
      editor.setTextWithEntities('😀 مرحبا');
      expect(input.dir).toBe('rtl');

      editor.setTextWithEntities('');
      expect(input.getAttribute('dir')).toBe('auto');
    } finally {
      editor.destroy();
    }
  });

  test('emoji, icons and variation selectors decide no direction', () => {
    expect(isRTL('😀 مرحبا')).toBe(true);
    expect(isRTL('❤️ שלום')).toBe(true);
    expect(isRTL('😀 hello')).toBe(false);
    expect(isRTL('hello مرحبا')).toBe(false);
    expect(isRTL('漢字 مرحبا')).toBe(false);
  });

  test('the draft\'s direction is the one its rich message is sent with', () => {
    const {editor, input} = mountChatInputEditor();

    try {
      for(const document of [
        {type: 'doc', content: [{type: 'paragraph'}, {type: 'paragraph', content: [{type: 'text', text: 'שלום, world'}]}]},
        {type: 'doc', content: [{type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Title'}]}, {type: 'paragraph', content: [{type: 'text', text: 'نص'}]}]},
        {type: 'doc', content: [{type: 'blockquote', content: [{type: 'paragraph', content: [{type: 'text', text: 'مرحبا'}]}]}, {type: 'paragraph', content: [{type: 'text', text: 'Hi'}]}]},
        // * a collapsed quote goes as one text: its second line's letter decides, not the first's digits
        {type: 'doc', content: [{type: 'blockquote', attrs: {collapsed: true}, content: [
          {type: 'paragraph', content: [{type: 'text', text: '123'}]},
          {type: 'paragraph', content: [{type: 'text', text: 'مرحبا'}]}
        ]}]},
        {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: '❤️ שלום'}]}]},
        // * a button's label is the block's first text, as it is sent
        {type: 'doc', content: [{type: 'paragraph', content: [
          {type: 'richButton', attrs: {action: 'copy', copyText: 'x', label: [{type: 'text', text: 'Hello'}]}},
          {type: 'text', text: ' مرحبا'}
        ]}]}
      ]) {
        expect(editor.setDocument(document)).toBe(true);
        const {output} = editor.getRichMessage();
        expect(input.dir).toBe(output.pFlags.rtl ? 'rtl' : 'ltr');
      }
    } finally {
      editor.destroy();
    }
  });
});
