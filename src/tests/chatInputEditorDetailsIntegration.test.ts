import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import createChatInputEditor from '@components/chat/inputEditor';
import {CHAT_INPUT_PLACEHOLDER_CLASS} from '@components/chat/inputEditor/placeholders';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import {instantViewStyles} from '@components/instantViewFormatting';
import I18n from '@lib/langPack';

describe('Tiptap chat input editor: Details', () => {
  const {editors, mountEditor, expectSingleTerminalParagraph} = useChatInputEditorHarness();

  test('inserts pullquotes with the shared Instant View presentation', () => {
    const {editor, input} = mountEditor();

    expect(editor.insertPullquote({text: 'Quoted text', caption: 'Author'})).toBe(true);
    const pullquote = input.querySelector<HTMLElement>('[data-pullquote]');
    const caption = pullquote?.querySelector<HTMLElement>('[data-pullquote-caption]');

    expect(pullquote?.tagName).toBe('DIV');
    expect(pullquote?.classList.contains(instantViewStyles.Pullquote)).toBe(true);
    expect(pullquote?.classList.contains('quote-like')).toBe(true);
    const text = pullquote?.querySelector<HTMLElement>('[data-pullquote-text]');
    expect(text?.textContent).toBe('Quoted text');
    expect(text?.classList.contains(instantViewStyles.PullquoteText)).toBe(true);
    expect(text?.classList.contains('text-italic')).toBe(true);
    expect(text?.querySelector('.chat-input-pullquote-quote-icon')).toBeNull();
    expect(text?.querySelector('.ProseMirror-widget')).toBeNull();
    expect(text?.dataset.placeholder).toBe(I18n.format(
      'Chat.Input.Editor.Placeholder.Pullquote',
      true
    ));
    expect(caption?.textContent).toBe('Author');
    expect(caption?.classList.contains(instantViewStyles.BlockquoteCaption)).toBe(true);
    expect(caption?.classList.contains(instantViewStyles.PullquoteAuthor)).toBe(true);
  });

  test.each([
    {
      convert: (editor: ChatInputEditor) => editor.insertFooter(),
      contentPath: ['content', 0],
      type: 'richFooter'
    },
    {
      convert: (editor: ChatInputEditor) => editor.insertPullquote(),
      contentPath: ['content', 0, 'content', 0],
      type: 'pullquote'
    },
    {
      convert: (editor: ChatInputEditor) => editor.insertDetails(),
      contentPath: ['content', 0, 'content', 0],
      type: 'details'
    }
  ])('converts the active rich paragraph to $type without losing marks', ({
    contentPath,
    convert,
    type
  }) => {
    const {editor} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'Formatted',
          marks: [{type: 'bold'}, {type: 'italic'}]
        }]
      }]
    })).toBe(true);
    editor.restoreSelection({from: 2, to: 2}, false);

    expect(convert(editor)).toBe(true);
    const block = editor.getDocument().content?.[0] as Record<string, any>;
    expect(block.type).toBe(type);
    if(type === 'details') expect(block.attrs.open).toBe(true);
    let marked: any = block;
    contentPath.forEach((part) => {
      marked = marked?.[part];
    });
    expect(marked).toMatchObject({
      type: 'text',
      text: 'Formatted',
      marks: [{type: 'bold'}, {type: 'italic'}]
    });
  });

  test('keeps Quote Author editable and mounts quote authors only after their title is filled', () => {
    const {editor, input} = mountEditor();
    expect(editor.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockBlockquote',
        pFlags: {},
        text: {_: 'textPlain', text: 'Quote'},
        caption: {
          _: 'textBold',
          text: {_: 'textItalic', text: {_: 'textPlain', text: 'Author'}}
        }
      }],
      photos: [],
      documents: []
    })).toBe(true);

    const author = input.querySelector<HTMLElement>('[data-blockquote-caption-content]');
    expect(author?.textContent).toBe('Author');
    expect(author?.querySelector('strong em, em strong')).not.toBeNull();
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      caption: {
        _: 'textBold',
        text: {_: 'textItalic', text: {_: 'textPlain', text: 'Author'}}
      }
    });

    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [{type: 'paragraph'}]
      }]
    })).toBe(true);
    expect(input.querySelector('[data-blockquote-caption-content]')).toBeNull();

    editor.setExpanded(true);
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{type: 'text', text: 'Quote'}]
        }]
      }]
    })).toBe(true);
    const emptyQuoteAuthor = input.querySelector<HTMLElement>(
      '[data-blockquote-caption-content]'
    );
    expect(emptyQuoteAuthor?.dataset.placeholder).toBe(I18n.format(
      'Chat.Input.Editor.Placeholder.Author',
      true
    ));
    expect(emptyQuoteAuthor?.classList.contains('chat-input-blockquote-author')).toBe(true);
    expect(emptyQuoteAuthor?.classList.contains(instantViewStyles.BlockquoteCaption)).toBe(true);

    editor.setTextWithEntities('');
    expect(editor.insertPullquote()).toBe(true);
    let pullquoteAuthor = input.querySelector<HTMLElement>('[data-pullquote-caption]');
    expect(pullquoteAuthor).toBeNull();

    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'pullquote',
        content: [{
          type: 'pullquoteText',
          content: [{type: 'text', text: 'Quote'}]
        }]
      }]
    })).toBe(true);
    pullquoteAuthor = input.querySelector<HTMLElement>('[data-pullquote-caption]');
    expect(pullquoteAuthor?.dataset.placeholder).toBe(I18n.format(
      'Chat.Input.Editor.Placeholder.PullquoteAuthor',
      true
    ));
    expect(pullquoteAuthor?.classList.contains('chat-input-context-placeholder-empty')).toBe(true);
  });

  test('shows contextual empty-block placeholders and keeps closed Details body in the document', () => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument({
      type: 'doc',
      content: [
        {type: 'heading', attrs: {level: 2}},
        {
          type: 'blockquote',
          content: [{type: 'paragraph'}]
        },
        {
          type: 'pullquote',
          content: [{type: 'pullquoteText'}]
        },
        {type: 'richFooter'},
        {
          type: 'details',
          attrs: {open: false},
          content: [
            {
              type: 'detailsSummary',
              content: [{
                type: 'text',
                text: 'Header',
                marks: [{type: 'link', attrs: {href: 'https://example.com'}}]
              }]
            },
            {
              type: 'detailsBody',
              content: [{type: 'paragraph'}]
            }
          ]
        },
        {type: 'richMap'}
      ]
    })).toBe(true);

    const placeholderElements = Array.from(input.querySelectorAll<HTMLElement>(
      '.chat-input-context-placeholder'
    ));
    const dataPlaceholderElements = Array.from(input.querySelectorAll<HTMLElement>(
      '[data-placeholder]'
    ));
    expect(dataPlaceholderElements.every((element) => (
      element.classList.contains(CHAT_INPUT_PLACEHOLDER_CLASS)
    ))).toBe(true);
    const placeholders = placeholderElements.map((element) => element.dataset.placeholder);
    expect(placeholders).toEqual(expect.arrayContaining([
      I18n.format('Chat.Input.Editor.Placeholder.Heading', true),
      I18n.format('Chat.Input.Editor.Placeholder.Quote', true),
      I18n.format('Chat.Input.Editor.Placeholder.Pullquote', true),
      I18n.format('Chat.Input.Editor.Placeholder.Footer', true),
      I18n.format('Chat.Input.Editor.Placeholder.DetailsHeader', true),
      I18n.format('Chat.Input.Editor.Placeholder.DetailsText', true),
      I18n.format('Chat.Input.Editor.Placeholder.Caption', true)
    ]));
    expect(placeholders).not.toContain(I18n.format(
      'Chat.Input.Editor.Placeholder.Author',
      true
    ));
    expect(placeholderElements.every((element) => (
      getComputedStyle(element).display !== 'inline'
    ))).toBe(true);
    expect(input.querySelector('.chat-input-details-content')).not.toBeNull();
    expect(input.querySelector('.chat-input-details-content-inner')).not.toBeNull();
    const details = editor.getDocument().content?.find((node) => node.type === 'details');
    expect(details?.content?.[0].content?.[0].marks).toBeUndefined();
  });

  test.each([
    {
      block: {
        type: 'heading',
        attrs: {level: 2},
        content: [{
          type: 'text',
          text: 'Heading',
          marks: [{type: 'bold'}, {type: 'italic'}]
        }]
      },
      text: 'Heading'
    },
    {
      block: {
        type: 'richFooter',
        content: [{
          type: 'text',
          text: 'Footer',
          marks: [{type: 'bold'}, {type: 'italic'}]
        }]
      },
      text: 'Footer'
    }
  ])('resets $block.type to an unmarked body paragraph', ({block, text}) => {
    const {editor} = mountEditor();
    expect(editor.setDocument({type: 'doc', content: [block]})).toBe(true);
    editor.focusAtEnd(false);

    expect(editor.setBodyText()).toBe(true);
    expect(editor.getDocument().content).toEqual([{
      type: 'paragraph',
      content: [{type: 'text', text}]
    }]);
  });

  test.each([
    {
      block: {
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{type: 'text', text: 'Quote', marks: [{type: 'bold'}]}]
        }, {
          type: 'blockquoteCaption',
          content: [{type: 'text', text: 'Author', marks: [{type: 'italic'}]}]
        }]
      }
    },
    {
      block: {
        type: 'pullquote',
        content: [{
          type: 'pullquoteText',
          content: [{type: 'text', text: 'Quote', marks: [{type: 'bold'}]}]
        }, {
          type: 'pullquoteCaption',
          content: [{type: 'text', text: 'Author', marks: [{type: 'italic'}]}]
        }]
      }
    },
    {
      block: {
        type: 'details',
        attrs: {open: false},
        content: [{
          type: 'detailsSummary',
          content: [{type: 'text', text: 'Header', marks: [{type: 'bold'}]}]
        }, {
          type: 'detailsBody',
          content: [{
            type: 'paragraph',
            content: [{type: 'text', text: 'Body', marks: [{type: 'italic'}]}]
          }]
        }]
      }
    },
    {
      block: {
        type: 'codeBlock',
        content: [{type: 'text', text: 'code'}]
      }
    }
  ])('exits $block.type into a new body paragraph without changing the container', ({block}) => {
    const {editor} = mountEditor();
    expect(editor.setDocument({type: 'doc', content: [block]})).toBe(true);
    editor.focusAtEnd(false);
    const before = editor.getDocument().content?.[0];

    expect(editor.setBodyText()).toBe(true);
    expect(editor.getDocument().content).toEqual([
      before,
      {type: 'paragraph'}
    ]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(tiptap.state.selection.$from.depth).toBe(1);
    expect(tiptap.state.selection.$from.index(0)).toBe(1);
  });

  test('renders Details with Instant View disclosure classes and opens it before entering its body', async() => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;

    expect(editor.insertDetails({title: 'More', body: 'Body', open: false})).toBe(true);
    await Promise.resolve();
    const details = input.querySelector<HTMLElement>('[data-rich-message-details]');
    const summary = details?.querySelector<HTMLElement>('[data-details-summary]');
    const summaryContent = summary?.querySelector<HTMLElement>('.chat-input-details-summary-content');
    const toggle = summary?.querySelector<HTMLButtonElement>('.chat-input-details-toggle');
    const toggleIcon = toggle?.querySelector<HTMLElement>(`.${instantViewStyles.DetailsIcon}`);
    const content = details?.querySelector<HTMLElement>(`.${instantViewStyles.DetailsContent}`);

    expect(details?.classList.contains(instantViewStyles.Details)).toBe(true);
    expect(details?.dataset.editorOpen).toBe('false');
    expect(summary?.classList.contains(instantViewStyles.DetailsSummary)).toBe(true);
    expect(summaryContent?.classList.contains(instantViewStyles.DetailsTitle)).toBe(true);
    expect(summaryContent?.classList.contains(instantViewStyles.Padding)).toBe(false);
    expect(summary?.textContent).toContain('More');
    expect(toggleIcon).not.toBeNull();
    expect(toggleIcon?.classList.contains(instantViewStyles.DetailsIconOpen)).toBe(false);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(content?.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(false);
    expect(content?.getAttribute('aria-hidden')).toBe('true');
    expect(content?.inert).toBe(true);
    expect(content?.textContent).toBe('Body');

    let summaryPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'detailsSummary') return;
      summaryPosition = position + 1 + node.content.size;
      return false;
    });
    expect(summaryPosition).toBeGreaterThan(0);
    expect(tiptap.commands.setTextSelection(summaryPosition)).toBe(true);
    const onTransaction = vi.fn();
    tiptap.on('transaction', onTransaction);
    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
    tiptap.off('transaction', onTransaction);
    expect(onTransaction).toHaveBeenCalledOnce();
    expect(details?.dataset.editorOpen).toBe('true');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggleIcon?.classList.contains(instantViewStyles.DetailsIconOpen)).toBe(true);
    expect(content?.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(true);
    expect(content?.getAttribute('aria-hidden')).toBe('false');
    expect(content?.inert).toBe(false);
    expect(editor.getDocument().content?.[0]).toMatchObject({type: 'details', attrs: {open: true}});
    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(Array.from({length: tiptap.state.selection.$from.depth + 1}, (_value, depth) => (
      tiptap.state.selection.$from.node(depth).type.name
    ))).toContain('detailsBody');
    const bodySelectionPosition = tiptap.state.selection.from;

    const focusEditor = vi.spyOn(tiptap.view, 'focus');
    toggle?.focus();
    toggle?.click();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(details?.dataset.editorOpen).toBe('false');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(content?.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(false);
    expect(content?.inert).toBe(true);
    expect(editor.getDocument().content?.[0]).toMatchObject({type: 'details', attrs: {open: false}});
    expect(tiptap.state.selection.$from.parent.type.name).toBe('detailsSummary');
    expect(editor.toggleDetailsOpen(details)).toBe(true);
    expect(details?.dataset.editorOpen).toBe('true');
    expect(content?.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(true);
    expect(content?.inert).toBe(false);
    expect(editor.getDocument().content?.[0]).toMatchObject({type: 'details', attrs: {open: true}});
    expect(tiptap.commands.setTextSelection(bodySelectionPosition)).toBe(true);
    expect(editor.toggleDetailsOpen(details)).toBe(true);
    expect(details?.dataset.editorOpen).toBe('false');
    expect(tiptap.state.selection.$from.parent.type.name).toBe('detailsSummary');
    expect(editor.toggleDetailsOpen(details)).toBe(true);
    expect(tiptap.commands.setTextSelection(bodySelectionPosition)).toBe(true);

    toggle?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
    expect(focusEditor).toHaveBeenCalledOnce();
    expect(details?.dataset.editorOpen).toBe('false');
    expect(content?.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(false);
    expect(content?.inert).toBe(true);
    expect(editor.getDocument().content?.[0]).toMatchObject({type: 'details', attrs: {open: false}});
    expect(tiptap.state.selection.$from.parent.type.name).toBe('detailsSummary');
  });

  test('keeps nested Details disclosure presentation scoped to each block', async() => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.commands.setContent({
      type: 'doc',
      content: [{
        type: 'details',
        attrs: {open: false},
        content: [
          {type: 'detailsSummary', content: [{type: 'text', text: 'Outer'}]},
          {
            type: 'detailsBody',
            content: [{
              type: 'details',
              attrs: {open: true},
              content: [
                {type: 'detailsSummary', content: [{type: 'text', text: 'Inner'}]},
                {
                  type: 'detailsBody',
                  content: [{type: 'paragraph', content: [{type: 'text', text: 'Body'}]}]
                }
              ]
            }]
          }
        ]
      }]
    });
    await Promise.resolve();

    const details = Array.from(input.querySelectorAll<HTMLElement>('[data-rich-message-details]'));
    expect(details).toHaveLength(2);
    const disclosure = (element: HTMLElement) => {
      const summary = Array.from(element.children).find((child) => (
        (child as HTMLElement).dataset.detailsSummary !== undefined
      )) as HTMLElement;
      const body = Array.from(element.children).find((child) => (
        (child as HTMLElement).dataset.detailsBody !== undefined
      )) as HTMLElement;
      return {
        content: Array.from(body.children).find((child) => (
          child.classList.contains(instantViewStyles.DetailsContent)
        )) as HTMLElement,
        icon: summary.querySelector<HTMLElement>(`.${instantViewStyles.DetailsIcon}`),
        toggle: summary.querySelector<HTMLButtonElement>('.chat-input-details-toggle')
      };
    };
    const outer = disclosure(details[0]);
    const inner = disclosure(details[1]);

    expect(outer.icon.classList.contains(instantViewStyles.DetailsIconOpen)).toBe(false);
    expect(outer.content.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(false);
    expect(outer.content.inert).toBe(true);
    expect(inner.icon.classList.contains(instantViewStyles.DetailsIconOpen)).toBe(true);
    expect(inner.content.classList.contains(instantViewStyles.DetailsContentOpen)).toBe(true);
    expect(inner.content.inert).toBe(false);
  });

  test.each([
    {blockName: 'pullquote', newLineWithShift: true},
    {blockName: 'details', newLineWithShift: true},
    {blockName: 'pullquote', newLineWithShift: false},
    {blockName: 'details', newLineWithShift: false}
  ] as const)(
    'exits a final $blockName using the configured newline when newLineWithShift=$newLineWithShift',
    ({blockName, newLineWithShift}) => {
      const input = document.createElement('div');
      input.className = 'input-message-input';
      document.body.append(input);
      const send = vi.fn();
      const editor = createChatInputEditor(input, {
        isNewLineShortcutPressed: (event) => event.key === 'Enter' && (
          newLineWithShift ? event.shiftKey : !event.shiftKey && !event.ctrlKey
        ),
        onKeyDown: (event) => {
          if(
            event.key !== 'Enter' ||
            (newLineWithShift ? event.shiftKey : !event.ctrlKey)
          ) return false;
          send();
          return true;
        }
      });
      editors.push(editor);
      const tiptap = (editor as TiptapEditorInternals).editor;
      const block = blockName === 'pullquote' ? {
        type: 'pullquote',
        content: [{type: 'pullquoteText', content: [{type: 'text', text: 'Quote'}]}]
      } : {
        type: 'details',
        attrs: {open: true},
        content: [
          {type: 'detailsSummary', content: [{type: 'text', text: 'More'}]},
          {
            type: 'detailsBody',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'Body'}]},
              {type: 'paragraph'}
            ]
          }
        ]
      };
      expect(editor.setDocument({type: 'doc', content: [block]})).toBe(true);
      editor.focusAtEnd(false);

      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ctrlKey: !newLineWithShift,
        key: 'Enter'
      }));
      expect(send).toHaveBeenCalledOnce();
      expect(editor.getDocument().content).toHaveLength(1);

      input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        shiftKey: newLineWithShift
      }));
      expect(send).toHaveBeenCalledOnce();
      if(blockName === 'pullquote') {
        expect(tiptap.state.selection.$from.parent.type.name).toBe('pullquoteText');
        expect(tiptap.state.doc.firstChild.firstChild.lastChild.type.name).toBe('hardBreak');
        input.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Enter',
          shiftKey: newLineWithShift
        }));
      }
      expect(tiptap.getJSON().content?.map((node) => node.type))
      .toEqual([blockName, 'paragraph']);
      expectSingleTerminalParagraph(input, tiptap);
      expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
      expect(tiptap.state.selection.$from.depth).toBe(1);
    }
  );

  test('uses ArrowDown to visit a Pullquote author before leaving the block', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'pullquote',
        content: [{
          type: 'pullquoteText',
          content: [{type: 'text', text: 'Quote'}]
        }]
      }]
    })).toBe(true);
    editor.focusAtEnd(false);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown'
    }));
    expect(tiptap.state.selection.$from.parent.type.name).toBe('pullquoteCaption');

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown'
    }));
    expect(tiptap.getJSON().content?.map((node) => node.type))
    .toEqual(['pullquote', 'paragraph']);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(tiptap.state.selection.$from.depth).toBe(1);
  });

  test('uses ArrowDown to leave a final Details block from its body', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    const block = {
      type: 'details',
      attrs: {open: true},
      content: [
        {type: 'detailsSummary', content: [{type: 'text', text: 'More'}]},
        {
          type: 'detailsBody',
          content: [{type: 'paragraph', content: [{type: 'text', text: 'Body'}]}]
        }
      ]
    };
    expect(editor.setDocument({type: 'doc', content: [block]})).toBe(true);
    editor.focusAtEnd(false);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown'
    }));

    expect(tiptap.getJSON().content?.map((node) => node.type)).toEqual(['details', 'paragraph']);
    expect(tiptap.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(tiptap.state.selection.$from.depth).toBe(1);
  });
});
