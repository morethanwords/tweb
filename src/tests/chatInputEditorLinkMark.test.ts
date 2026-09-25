import {Editor} from '@tiptap/core';
import '@/tests/mocks/chatInputEditorNodes';
import {CHAT_INPUT_EXTENSIONS, TIPTAP_BASE_EXTENSIONS} from '@components/chat/inputEditor/extensions';

// The href whitelist itself is covered exhaustively by
// `chatInputEditorUpstreamContracts`; this file pins what the local mark had to
// reproduce by hand when `@tiptap/extension-link` was dropped.
describe('chat input editor link mark', () => {
  const editors: Editor[] = [];

  const parse = (html: string) => {
    const element = document.createElement('div');
    document.body.append(element);
    const editor = new Editor({
      content: html,
      element,
      extensions: [...TIPTAP_BASE_EXTENSIONS, ...CHAT_INPUT_EXTENSIONS],
      injectCSS: false
    });
    editors.push(editor);
    return editor;
  };

  const linkedText = (editor: Editor) => {
    const parts: string[] = [];
    editor.state.doc.descendants((node) => {
      if(!node.isText) return;
      parts.push(`${node.text}:${node.marks.some((mark) => mark.type.name === 'link') ? 'linked' : 'plain'}`);
    });
    return parts;
  };

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    document.body.replaceChildren();
  });

  test('renders the anchor attributes the clipboard and Instant View expect', () => {
    const html = parse('<p><a href="https://telegram.org/">probe</a></p>').getHTML();
    expect(html).toContain('href="https://telegram.org/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  test('does not extend over text typed after the link', () => {
    const editor = parse('<p><a href="https://telegram.org/">probe</a></p>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('tail');
    expect(linkedText(editor)).toEqual(['probe:linked', 'tail:plain']);
  });

  test.each(['file:///etc/passwd', 'blob:https://web.telegram.org/1234'])(
    'drops a pasted link with href %s',
    (href) => {
      const editor = parse(`<p><a href="${href}">probe</a></p>`);
      expect(linkedText(editor)).toEqual(['probe:plain']);
    }
  );
});
