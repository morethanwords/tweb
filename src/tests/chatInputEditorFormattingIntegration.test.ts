import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  findEntity,
  typeTextThroughEditorView
} from '@/tests/helpers/chatInputEditorHarness';
import {undoNoScroll} from '@tiptap/pm/history';
import createChatInputEditor from '@components/chat/inputEditor';
import {getInstantViewHeadingPresentation, instantViewStyles} from '@components/instantViewFormatting';

describe('Tiptap chat input editor: Formatting', () => {
  const {editors, mountEditor, selectAllText, applyToText} = useChatInputEditorHarness();

  test.each([
    ['bold', 'messageEntityBold'],
    ['spoiler', 'messageEntitySpoiler'],
    ['highlight', 'messageEntityHighlight'],
    ['subscript', 'messageEntitySubscript'],
    ['superscript', 'messageEntitySuperscript'],
    ['monospace', 'messageEntityCode']
  ] as const)('applies %s markup', (type, entityType) => {
    const richValue = applyToText(type);

    expect(richValue.value).toBe('sample');
    expect(findEntity(richValue.entities, entityType)).toMatchObject({offset: 0, length: 6});
  });

  test('applies links and dates with their Telegram attributes', () => {
    const linked = applyToText('link', {href: 'https://example.com/path'});
    expect(findEntity(linked.entities, 'messageEntityTextUrl')).toEqual({
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 6,
      url: 'https://example.com/path'
    });

    const tonsite = applyToText('link', {href: 'tonsite://foundation.ton'});
    expect(findEntity(tonsite.entities, 'messageEntityTextUrl')).toEqual({
      _: 'messageEntityTextUrl',
      offset: 0,
      length: 6,
      url: 'tonsite://foundation.ton'
    });

    const dated = applyToText('date', {dateSuffix: '1784635200'});
    expect(findEntity(dated.entities, 'messageEntityFormattedDate')).toEqual({
      _: 'messageEntityFormattedDate',
      offset: 0,
      length: 6,
      date: 1784635200,
      pFlags: {}
    });
  });

  test('keeps subscript and superscript mutually exclusive', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('sample');
    selectAllText(editor, 6);

    expect(editor.applyMarkup({type: 'subscript'})).toBe(true);
    expect(editor.getMarkupState('subscript').fully).toBe(true);
    expect(editor.applyMarkup({type: 'superscript'})).toBe(true);

    expect(editor.getMarkupState('subscript').partly).toBe(false);
    expect(editor.getMarkupState('superscript').fully).toBe(true);
    expect(editor.getRichValue().entities).toEqual([{
      _: 'messageEntitySuperscript',
      offset: 0,
      length: 6
    }]);
  });

  test.each([
    ['highlight', 'messageEntityHighlight', 'textMarked'],
    ['subscript', 'messageEntitySubscript', 'textSubscript'],
    ['superscript', 'messageEntitySuperscript', 'textSuperscript']
  ] as const)('routes authored %s through a native rich message', (type, entityType, richTextType) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('sample');
    selectAllText(editor, 6);

    expect(editor.applyMarkup({type})).toBe(true);
    expect(findEntity(editor.getRichValue().entities, entityType)).toBeDefined();
    expect(editor.getLegacyValueIfLossless()).toBeUndefined();
    expect(editor.getRichMessage()?.input).toMatchObject({
      _: 'inputRichMessage',
      blocks: [{
        _: 'pageBlockParagraph',
        text: {
          _: richTextType
        }
      }]
    });
  });

  test.each([
    [{
      _: 'messageEntityFormattedDate',
      offset: 0,
      length: 4,
      date: 1784635200,
      pFlags: {}
    }],
    [{
      _: 'messageEntityMentionName',
      offset: 0,
      length: 4,
      user_id: 1 as UserId
    }]
  ] as const)('does not extend a semantic mark when typing at its right boundary', (entity) => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('mark', [entity]);
    editor.focusAtEnd(false);
    expect(editor.replaceSelection('x')).toBe(true);

    const richValue = editor.getRichValue(true, false);
    expect(richValue.value).toBe('markx');
    expect(richValue.entities).toEqual([entity]);
  });

  test('uses the rich bubble CSS module class on the editor root and every heading level', () => {
    const {editor, input} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: ([1, 2, 3, 4, 5, 6] as const).map((level) => ({
        type: 'heading',
        attrs: {level},
        content: [{type: 'text', text: `Heading ${level}`}]
      }))
    });

    expect(input.classList.contains(instantViewStyles.RichMessage)).toBe(true);
    expect(input.classList.contains(instantViewStyles.RichText)).toBe(true);
    expect(input.classList.contains(instantViewStyles.Blocks)).toBe(true);
    const headings = Array.from(input.querySelectorAll<HTMLElement>('.chat-input-heading'));
    expect(headings).toHaveLength(6);
    headings.forEach((heading, index) => {
      const level = index + 1 as 1 | 2 | 3 | 4 | 5 | 6;
      const presentation = getInstantViewHeadingPresentation(level);
      expect(heading.tagName.toLowerCase()).toBe(presentation.tag);
      expect(Array.from(heading.classList)).toEqual(expect.arrayContaining(
        presentation.class.split(' ').filter(Boolean)
      ));
      expect(heading.classList.contains(instantViewStyles[`HeadingH${level}`])).toBe(true);
      expect(heading.classList.contains('text-bold')).toBe(true);
    });
  });

  test('toggles every heading level back to a paragraph through the public editor API', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Heading');
    editor.focusAtEnd(false);

    ([1, 2, 3, 4, 5, 6] as const).forEach((level) => {
      expect(editor.toggleHeading(level)).toBe(true);
      expect(editor.getDocument().content?.[0]).toMatchObject({
        type: 'heading',
        attrs: {level}
      });
      expect(editor.toggleHeading(level)).toBe(true);
      expect(editor.getDocument().content?.[0].type).toBe('paragraph');
    });
  });

  test.each([
    {
      label: 'pure task',
      document: {
        type: 'doc',
        content: [{
          type: 'taskList',
          content: [{
            type: 'taskItem',
            attrs: {checked: false},
            content: [{type: 'paragraph', content: [{type: 'text', text: 'task'}]}]
          }]
        }]
      }
    },
    {
      label: 'mixed bullet',
      document: {
        type: 'doc',
        content: [{
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{type: 'paragraph', content: [{type: 'text', text: 'plain'}]}]
            },
            {
              type: 'listItem',
              attrs: {checkbox: true, checked: false},
              content: [{type: 'paragraph', content: [{type: 'text', text: 'task'}]}]
            }
          ]
        }]
      }
    },
    {
      label: 'ordered checkbox',
      document: {
        type: 'doc',
        content: [{
          type: 'orderedList',
          attrs: {start: 3},
          content: [{
            type: 'listItem',
            attrs: {checkbox: true, checked: false},
            content: [{type: 'paragraph', content: [{type: 'text', text: 'task'}]}]
          }]
        }]
      }
    }
  ])('renders $label with StaticCheckbox and makes checking undoable', ({document}) => {
    const {editor, input} = mountEditor();
    expect(editor.setDocument(document)).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const button = Array.from(input.querySelectorAll<HTMLButtonElement>('.chat-input-checklist-button'))
    .find((element) => !element.hidden);
    const checkbox = button?.firstElementChild as HTMLElement;
    const listItem = button?.closest('li');

    expect(button).toBeTruthy();
    expect(listItem).toBeTruthy();
    expect(button?.getAttribute('role')).toBe('checkbox');
    expect(button?.getAttribute('aria-checked')).toBe('false');
    expect(checkbox?.classList.contains(instantViewStyles.TaskCheckbox)).toBe(true);
    expect(checkbox?.querySelector('svg use')?.getAttribute('href')).toBe('#check');

    const initialClassName = listItem?.className;
    const focusEditor = vi.spyOn(tiptap.view, 'focus');
    button?.focus();
    button?.click();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(listItem?.className).toBe(initialClassName);
    expect(button?.getAttribute('aria-checked')).toBe('true');
    let checked = false;
    tiptap.state.doc.descendants((node) => {
      if(node.type.name === 'taskItem' || node.attrs.checkbox === true) {
        checked = !!node.attrs.checked;
        return false;
      }
    });
    expect(checked).toBe(true);

    expect(undoNoScroll(tiptap.state, tiptap.view.dispatch)).toBe(true);
    checked = true;
    tiptap.state.doc.descendants((node) => {
      if(node.type.name === 'taskItem' || node.attrs.checkbox === true) {
        checked = !!node.attrs.checked;
        return false;
      }
    });
    expect(checked).toBe(false);
    expect(button?.getAttribute('aria-checked')).toBe('false');
    expect(listItem?.className).toBe(initialClassName);

    button?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1
    }));
    expect(focusEditor).toHaveBeenCalledOnce();
    expect(listItem?.className).toBe(initialClassName);
  });

  test('types a visual checklist through real text-input rules and uses the configured newline', () => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && event.shiftKey,
      onKeyDown: (event) => {
        if(event.key !== 'Enter' || event.shiftKey) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.focusAtEnd(false);

    typeTextThroughEditorView(tiptap, '- [ ] first');
    expect(tiptap.getJSON().content?.[0]).toMatchObject({
      type: 'bulletList',
      content: [{type: 'listItem', attrs: {checkbox: true, checked: false}}]
    });
    let buttons = Array.from(input.querySelectorAll<HTMLButtonElement>('.chat-input-checklist-button'))
    .filter((element) => !element.hidden);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].firstElementChild?.classList.contains(instantViewStyles.TaskCheckbox)).toBe(true);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      shiftKey: true
    }));

    expect(send).not.toHaveBeenCalled();
    expect(tiptap.getJSON().content?.[0].content).toMatchObject([
      {type: 'listItem', attrs: {checkbox: true, checked: false}},
      {type: 'listItem', attrs: {checkbox: true, checked: false}}
    ]);
    buttons = Array.from(input.querySelectorAll<HTMLButtonElement>('.chat-input-checklist-button'))
    .filter((element) => !element.hidden);
    expect(buttons).toHaveLength(2);
  });
});
