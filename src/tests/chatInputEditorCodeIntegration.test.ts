import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import {TextSelection} from '@tiptap/pm/state';
import createChatInputEditor from '@components/chat/inputEditor';
import {isRichMediaInsertSelectionCurrent} from '@components/chat/inputEditor/mediaPaste';
import {getIconContent} from '@components/icon';
import copyFromElement from '@helpers/dom/copyFromElement';
import I18n from '@lib/langPack';

describe('Tiptap chat input editor: Code', () => {
  const {editors, mountEditor, logicalContent} = useChatInputEditorHarness();

  test('renders preformatted code as a distinct block while keeping inline code inline', () => {
    const {editor, input} = mountEditor();
    const inline = 'inline';
    const block = 'const answer = 42;\nreturn answer;';
    const text = `${inline}\n${block}`;
    editor.setTextWithEntities(text, [
      {_: 'messageEntityCode', offset: 0, length: inline.length},
      {
        _: 'messageEntityPre',
        offset: inline.length + 1,
        length: block.length,
        language: 'typescript'
      }
    ]);

    const inlineCode = input.querySelector('span[data-markup="markup-monospace"]');
    const codeBlock = input.querySelector('pre.chat-input-code-block.code.quote-like.quote-like-border');
    expect(inlineCode).toBeTruthy();
    expect(inlineCode?.classList.contains('chat-input-code-block')).toBe(false);
    expect(codeBlock?.getAttribute('data-language')).toBe('typescript');
    expect(codeBlock?.querySelector('code.code-code')?.textContent).toBe(block);
  });

  test.each([
    {label: 'Shift+Enter', newlineEvent: {shiftKey: true}, sendOnCtrl: false},
    {label: 'Enter', newlineEvent: {}, sendOnCtrl: true}
  ] as const)('uses $label to leave a code block after three newlines', ({newlineEvent, sendOnCtrl}) => {
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const send = vi.fn();
    const editor = createChatInputEditor(input, {
      isNewLineShortcutPressed: (event) => event.key === 'Enter' && (
        sendOnCtrl ? !event.ctrlKey : event.shiftKey
      ),
      onKeyDown: (event) => {
        const isSend = event.key === 'Enter' && (sendOnCtrl ? event.ctrlKey : !event.shiftKey);
        if(!isSend) return false;
        send();
        return true;
      }
    });
    editors.push(editor);
    editor.setTextWithEntities('const answer = 42;', [{
      _: 'messageEntityPre',
      offset: 0,
      length: 18,
      language: 'typescript'
    }]);
    editor.focusAtEnd();
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.state.selection.$from.parent.type.name).toBe('codeBlock');

    const pressNewline = () => input.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      ...newlineEvent
    }));
    pressNewline();
    expect(tiptap.state.doc.firstChild?.textContent).toBe('const answer = 42;\n');
    pressNewline();
    expect(tiptap.state.doc.firstChild?.textContent).toBe('const answer = 42;\n\n');
    expect({
      at: tiptap.state.selection.$from.parentOffset,
      size: tiptap.state.selection.$from.parent.nodeSize - 2
    }).toEqual({at: 20, size: 20});
    pressNewline();

    expect(send).not.toHaveBeenCalled();
    expect(logicalContent(tiptap).map((node) => node.type)).toEqual(['codeBlock', 'paragraph']);
    expect(editor.getRichValue(true, false)).toEqual({
      value: 'const answer = 42;\n',
      entities: [{
        _: 'messageEntityPre',
        offset: 0,
        length: 18,
        language: 'typescript'
      }],
      caretPos: -1
    });
  });

  test('starts a code block through the fenced-code input rule', async() => {
    const {editor} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.focusAtEnd(false);

    expect(tiptap.commands.insertContent('```typescript ', {applyInputRules: true})).toBe(true);
    await new Promise((resolve) => setTimeout(resolve));

    expect(tiptap.getJSON().content?.[0]).toMatchObject({
      type: 'codeBlock',
      attrs: {language: 'typescript'}
    });
    expect(editor.isEmpty()).toBe(true);
  });

  test('inserts code directly with an Auto language header and searchable-picker hook', () => {
    vi.mocked(copyFromElement).mockClear();
    const input = document.createElement('div');
    input.className = 'input-message-input';
    document.body.append(input);
    const onCodeBlockLanguagePicker = vi.fn();
    const editor = createChatInputEditor(input, {onCodeBlockLanguagePicker});
    editors.push(editor);
    const tiptap = (editor as TiptapEditorInternals).editor;

    expect(editor.insertCodeBlock()).toBe(true);
    expect(Array.from({length: tiptap.state.doc.childCount}, (_value, index) => (
      tiptap.state.doc.child(index).type.name
    ))).toEqual(['codeBlock', 'paragraph']);
    expect(editor.isEmpty()).toBe(true);
    expect(editor.isPlaceholderEmpty()).toBe(false);

    let picker = input.querySelector<HTMLButtonElement>('[data-code-language-picker]');
    const languageLabel = () => picker?.querySelector(
      '.chat-input-code-language-label'
    )?.textContent;
    expect(languageLabel()).toBe(
      I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true)
    );
    expect(picker?.querySelector('.inline-icon.inline-icon-right')).not.toBeNull();
    const copyButton = input.querySelector<HTMLElement>('.code-header-copy');
    expect(copyButton).not.toBeNull();
    expect(copyButton?.classList.contains('code-header-button')).toBe(true);
    expect(copyButton?.classList.contains('hover-primary-effect')).toBe(true);
    expect(copyButton?.querySelector('.tgico')?.textContent).toBe(
      getIconContent('copy_alt')
    );
    expect(input.querySelector('.code-header + .code-content > code.code-code')).not.toBeNull();
    const insideCodeSelection = editor.captureSelection();

    const trailing = tiptap.state.doc.lastChild!;
    const trailingPosition = tiptap.state.doc.content.size - trailing.nodeSize + 1;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, trailingPosition)
    ));
    expect(editor.getCodeBlockLanguage()).toBeUndefined();
    const outsideCodeSelection = editor.captureSelection();

    picker?.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    picker?.click();
    expect(onCodeBlockLanguagePicker).toHaveBeenCalledWith(picker);
    expect(editor.captureSelection()).toEqual(outsideCodeSelection);
    expect(editor.getCodeBlockLanguage(picker)).toBe('');

    expect(editor.setCodeBlockLanguage('typescript', picker)).toBe(true);
    expect(editor.captureSelection()).toEqual(outsideCodeSelection);
    picker = input.querySelector<HTMLButtonElement>('[data-code-language-picker]');
    expect(languageLabel()).toBe('TypeScript');
    expect(input.querySelector('pre')?.dataset.language).toBe('typescript');

    editor.restoreSelection(insideCodeSelection, false);
    expect(editor.replaceSelection('const answer = 42;')).toBe(true);
    const codeSelection = editor.captureSelection();
    copyButton?.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    copyButton?.click();
    expect(copyFromElement).toHaveBeenCalledWith(
      input.querySelector('.code-content > code.code-code')
    );
    expect(editor.captureSelection()).toEqual(codeSelection);
    picker?.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, button: 0}));
    picker?.click();
    expect(editor.captureSelection()).toEqual(codeSelection);
    expect(editor.getRichValue().value).not.toContain('Auto');
    expect(tiptap.getHTML()).not.toContain('Auto');
    expect(tiptap.getHTML()).not.toContain('data-code-language-picker');

    expect(editor.setCodeBlockLanguage('', picker)).toBe(true);
    expect(languageLabel()).toBe(
      I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true)
    );
  });

  test('gets, changes, clears, and trims the active code-block language', () => {
    const {editor} = mountEditor();
    const code = 'const answer = 42;';
    expect(editor.setDocument({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: {
          detectedLanguage: 'JavaScript',
          detectedLanguageCode: code,
          language: ''
        },
        content: [{type: 'text', text: code}]
      }]
    })).toBe(true);
    editor.restoreSelection({from: 2, to: 2}, false);

    expect(editor.getCodeBlockLanguage()).toBe('');
    expect(editor.input.querySelector('.chat-input-code-language-label')?.textContent)
    .toBe(`JavaScript (${I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true)})`);
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockPreformatted',
      language: 'JavaScript'
    });
    expect(editor.replaceSelection('x')).toBe(true);
    expect(editor.input.querySelector('.chat-input-code-language-label')?.textContent)
    .toBe(`JavaScript (${I18n.format('Chat.Input.Editor.CodeLanguage.Auto', true)})`);
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockPreformatted',
      language: ''
    });
    expect(editor.setCodeBlockLanguage('  typescript  ')).toBe(true);
    expect(editor.getCodeBlockLanguage()).toBe('typescript');
    expect(editor.getDocument().content?.[0].attrs?.language).toBe('typescript');
    expect(editor.getDocument().content?.[0].attrs).toMatchObject({
      detectedLanguage: '',
      detectedLanguageCode: ''
    });
    expect(editor.setCodeBlockLanguage('')).toBe(true);
    expect(editor.getCodeBlockLanguage()).toBe('');

    editor.setTextWithEntities('plain text');
    expect(editor.getCodeBlockLanguage()).toBeUndefined();
    expect(editor.setCodeBlockLanguage('javascript')).toBe(false);
  });

  test('keeps an insertion target valid after code detection', async() => {
    const detector = await import('@/codeLanguageDetector');
    vi.spyOn(detector, 'default').mockResolvedValue('javascript');
    const {editor} = mountEditor();
    editor.setDocument({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: {language: ''},
        content: [{type: 'text', text: 'const answer = 42;'}]
      }]
    });
    editor.focusAtEnd();
    const target = editor.captureSelection();

    await editor.resolveAutoCodeLanguages();
    await vi.waitFor(() => {
      expect(editor.getDocument().content?.[0].attrs?.detectedLanguage).toBe('JavaScript');
    });
    expect(isRichMediaInsertSelectionCurrent(target, editor.captureSelection().revision)).toBe(true);

    expect(editor.setCodeBlockLanguage('typescript')).toBe(true);
    expect(isRichMediaInsertSelectionCurrent(target, editor.captureSelection().revision)).toBe(false);
    const afterLanguageChange = editor.captureSelection();
    expect(editor.replaceSelection('x')).toBe(true);
    expect(isRichMediaInsertSelectionCurrent(afterLanguageChange, editor.captureSelection().revision)).toBe(false);
  });
});
