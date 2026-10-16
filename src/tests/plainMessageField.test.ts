import '@/tests/mocks/chatInputEditorNodes';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import {isSendShortcutLeft} from '@helpers/dom/isSendShortcutPressed';
import {setAppSettingsSilent} from '@stores/appSettings';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import InputField from '@components/inputField';
import draftTextWithEntities from '@lib/richTextProcessor/draftTextWithEntities';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import type {DraftMessage, MessageEntity} from '@layer';
import type {Editor} from '@tiptap/core';
import {Fragment, Slice} from '@tiptap/pm/model';
import {typeTextThroughEditorView, useChatInputEditorHarness, type TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';

vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

/** A paste whose clipboard holds `text` as plain text, nothing else */
function createPasteEvent(text = '') {
  const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {getData: (type: string) => type === 'text/plain' ? text : ''}
  });
  return event;
}

/**
 * What a caption, a forward comment, a poll description or a fact check hands to
 * the manager on send. Every one of them reads its field with
 * `getRichValueWithCaret`, which answers from the mounted editor — so this is the
 * contract that keeps the plain fields sending what the person typed.
 */
describe('plain message field', () => {
  const mounted: Array<{destroy(): void}> = [];
  const {mountEditor} = useChatInputEditorHarness();

  const mountField = (
    options: ConstructorParameters<typeof InputField>[0] = {},
    editorOptions?: Parameters<typeof attachPlainMessageEditor>[1],
    messageField?: boolean
  ) => {
    const inputField = new InputField({withLinebreaks: true, ...options});
    // what InputFieldMessage does before attaching: a caption or a forward comment
    // is a message field, and declares all the formatting a plain message carries
    if(messageField) inputField.input.classList.replace('input-field-input', 'input-message-input');
    document.body.append(inputField.container);
    const editor = attachPlainMessageEditor(inputField.input, editorOptions);
    mounted.push({destroy: () => {
      editor.destroy();
      inputField.container.remove();
    }});
    return {editor, inputField};
  };

  const mountCaption = (
    options: ConstructorParameters<typeof InputField>[0] = {},
    editorOptions?: Parameters<typeof attachPlainMessageEditor>[1]
  ) => mountField(options, editorOptions, true);

  afterEach(() => {
    mounted.splice(0).forEach((item) => item.destroy());
  });

  test('reads back the text and entities the field was given', () => {
    const {editor, inputField} = mountCaption();
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 4},
      {_: 'messageEntityTextUrl', offset: 5, length: 4, url: 'https://telegram.org/'}
    ];
    editor.setTextWithEntities('bold link', entities);

    // The send paths call exactly this.
    const read = getRichValueWithCaret(inputField.input, true, false);
    expect(read.value).toBe('bold link');
    expect(read.entities).toEqual(expect.arrayContaining(entities));
  });

  // a chat input turns into a plain field where rich posting is off, and its toolbar keeps asking
  test('answers that a list cannot be made, rather than throwing for the command it lacks', () => {
    const {editor} = mountCaption();
    editor.setTextWithEntities('caption');
    for(const type of ['bulletList', 'orderedList', 'taskList'] as const) {
      expect(editor.canApplyFormatting(type)).toBe(false);
    }
  });

  test('applies formatting through the same entry point as the chat input', () => {
    const {editor, inputField} = mountCaption();
    editor.setTextWithEntities('caption');
    editor.restoreSelection({from: 1, to: 8}, false);

    expect(editor.applyMarkup({type: 'bold'})).toBe(true);

    const read = getRichValueWithCaret(inputField.input, true, false);
    expect(read.value).toBe('caption');
    expect(read.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 7}]);
  });

  test('counts the length the manager will see, not the DOM', () => {
    const {editor, inputField} = mountField({maxLength: 10});
    editor.setTextWithEntities('caption');

    // The document also holds the technical trailing paragraph; counting it would
    // make the field report one character too many.
    expect(inputField.value).toBe('caption');
    expect([...inputField.value].length).toBe(7);
  });

  // What every draft, edited message and fact check used to be filled with: the
  // value rendered into DOM and parsed straight back out. The field takes the
  // text and entities themselves now, and must land on the same document.
  const DRAFTS: Array<{name: string, text: string, entities: MessageEntity[]}> = [
    {
      name: 'inline marks',
      text: 'bold and italic',
      entities: [
        {_: 'messageEntityBold', offset: 0, length: 4},
        {_: 'messageEntityItalic', offset: 9, length: 6}
      ]
    },
    {
      name: 'a link',
      text: 'open the page',
      entities: [{_: 'messageEntityTextUrl', offset: 5, length: 8, url: 'https://telegram.org/'}]
    },
    {name: 'a bare url the text parser finds itself', text: 'see https://telegram.org/ now', entities: []},
    {name: 'line breaks', text: 'first\nsecond\n\nthird', entities: []},
    {
      name: 'a quote',
      text: 'said:\nquoted line\nafter',
      entities: [{_: 'messageEntityBlockquote', offset: 6, length: 11, pFlags: {}}]
    },
    {
      name: 'code and spoiler',
      text: 'x = 1 hidden',
      entities: [
        {_: 'messageEntityCode', offset: 0, length: 5},
        {_: 'messageEntitySpoiler', offset: 6, length: 6}
      ]
    }
  ];

  DRAFTS.forEach(({name, text, entities}) => {
    test(`fills from text and entities exactly as rendering them first did: ${name}`, () => {
      const draft = {
        _: 'draftMessage',
        message: text,
        entities,
        date: 0,
        pFlags: {}
      } as DraftMessage.draftMessage;
      const {inputField} = mountCaption();
      const value = draftTextWithEntities(draft);

      inputField.setValueSilently(wrapDraftText(value.text, {entities: value.entities}));
      const throughDom = getRichValueWithCaret(inputField.input, true, false);

      inputField.setValueSilently(value);
      const direct = getRichValueWithCaret(inputField.input, true, false);

      expect(direct.value).toBe(text);
      expect(direct).toEqual(throughDom);
    });
  });

  describe('a field that holds one line', () => {
    const mountSingleLine = () => {
      const {editor, inputField} = mountField({withLinebreaks: false});
      return {editor, inputField, tiptap: (editor as unknown as {editor: Editor}).editor};
    };

    test('carries no block structure to put a second line in', () => {
      const {tiptap} = mountSingleLine();
      const {nodes} = tiptap.schema;
      expect(Object.keys(nodes).sort()).toEqual(['customEmoji', 'doc', 'paragraph', 'text']);
    });

    test('holds no technical trailing paragraph', () => {
      const {editor, tiptap} = mountSingleLine();
      editor.setTextWithEntities('Option');
      expect(tiptap.getJSON().content).toHaveLength(1);
      expect(editor.getRichValue(false).value).toBe('Option');
    });

    test('stays on one line when Enter is pressed', () => {
      const {editor, inputField, tiptap} = mountSingleLine();
      editor.setTextWithEntities('Option');
      editor.focusAtEnd();

      inputField.input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter'
      }));

      expect(tiptap.getJSON().content).toHaveLength(1);
      expect(editor.getRichValue(false).value).toBe('Option');
    });

    test('takes a two-line clipboard as one line', () => {
      const {editor, inputField, tiptap} = mountSingleLine();
      const {schema} = tiptap;
      const slice = new Slice(Fragment.fromArray([
        schema.nodes.paragraph.create(null, schema.text('first')),
        schema.nodes.paragraph.create(null, schema.text('second'))
      ]), 0, 0);
      const event = createPasteEvent();

      expect(tiptap.view.someProp('handlePaste')?.(tiptap.view, event, slice)).toBe(true);

      expect(tiptap.getJSON().content).toHaveLength(1);
      expect(getRichValueWithCaret(inputField.input, true, false).value).toBe('firstsecond');
    });

    test('keeps the marks a pasted line brings, of the formatting the field declares', () => {
      const {editor, inputField} = mountField({withLinebreaks: false, canHaveFormatting: ['bold']});
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      const {schema} = tiptap;
      const slice = new Slice(Fragment.fromArray([
        schema.nodes.paragraph.create(null, schema.text('bold', [schema.marks.bold.create()]))
      ]), 0, 0);
      const event = createPasteEvent();

      tiptap.view.someProp('handlePaste')?.(tiptap.view, event, slice);

      const read = getRichValueWithCaret(inputField.input, true, false);
      expect(read.value).toBe('bold');
      expect(read.entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 4}]);
      expect(editor.getMode()).toBe('plain');
    });
  });

  test('hands over a field that was built read-only', () => {
    const {editor} = mountField({canBeEdited: false});
    const {editor: tiptap} = editor as unknown as {editor: Editor};
    expect(tiptap.isEditable).toBe(false);
  });

  test('never reports a rich document, whatever is put in it', () => {
    const {editor} = mountField();
    expect(editor.setDocument({
      type: 'doc',
      content: [{type: 'chatTableWrapper', content: []}]
    })).toBe(false);
    expect(editor.getMode()).toBe('plain');
    expect(editor.getLegacyValueIfLossless()).toBeTruthy();
  });

  // A list is rich-only: what a caption shows as list markers is its text.
  test('keeps a typed list marker as text', async() => {
    const {editor, inputField} = mountField();
    const {editor: tiptap} = editor as unknown as {editor: Editor};
    expect(tiptap.schema.nodes.orderedList).toBeUndefined();
    editor.focusAtEnd();

    tiptap.commands.insertContent('1. ', {applyInputRules: true});
    await new Promise((resolve) => setTimeout(resolve));
    tiptap.commands.insertContent('one');

    expect(tiptap.getJSON().content?.[0].type).toBe('paragraph');
    expect(getRichValueWithCaret(inputField.input, true, false).value).toBe('1. one');
  });

  test('keeps the markers of a pasted list', () => {
    const {editor, inputField} = mountField();
    const {editor: tiptap} = editor as unknown as {editor: Editor};
    tiptap.view.pasteHTML(
      '<ol start="3" type="a"><li><p>three</p><ul><li>nested</li></ul></li>' +
      '<li><input type="checkbox" checked>done</li></ol><p>after</p>',
      new Event('paste', {cancelable: true}) as ClipboardEvent
    );

    expect(getRichValueWithCaret(inputField.input, true, false).value).toBe('c. three\n  - nested\nd. [x] done\nafter');
    expect(editor.getMode()).toBe('plain');
  });

  test('keeps every line of pasted text, blank ones too', () => {
    const {inputField} = mountCaption();
    const event = createPasteEvent('one\r\n\r\n\r\ntwo');
    inputField.input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(getRichValueWithCaret(inputField.input, true, false).value).toBe('one\n\n\ntwo');
  });

  test('keeps the formatting of a message copied out of a chat', () => {
    const text = 'bold\nquote\na = 1';
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 4},
      {_: 'messageEntityBlockquote', offset: 5, length: 5, pFlags: {}},
      {_: 'messageEntityPre', offset: 11, length: 5, language: 'js'}
    ];
    const {html} = prepareTextWithEntitiesForCopying({text, entities});

    const {editor, inputField} = mountCaption();
    const {editor: caption} = editor as unknown as {editor: Editor};
    caption.view.pasteHTML(html, new Event('paste', {cancelable: true}) as ClipboardEvent);

    const value = getRichValueWithCaret(inputField.input, true, false);
    expect(value.value).toBe(text);
    expect(value.entities).toEqual(entities);
  });

  test('keeps the markers of a list copied out of the composer, as the list is sent', () => {
    const paragraph = (text: string, marks?: {type: string}[]) => ({type: 'paragraph', content: [{type: 'text', text, marks}]});
    const {editor: composer} = mountEditor();
    composer.setDocument({type: 'doc', content: [
      {type: 'taskList', content: [
        {type: 'taskItem', attrs: {checked: true}, content: [paragraph('done')]},
        {type: 'taskItem', attrs: {checked: false}, content: [paragraph('todo')]}
      ]},
      {type: 'orderedList', attrs: {start: 3, reversed: true}, content: [
        {type: 'listItem', content: [paragraph('three')]},
        {type: 'listItem', content: [paragraph('two')]}
      ]},
      {type: 'bulletList', content: [
        {type: 'listItem', attrs: {checkbox: true, checked: true}, content: [paragraph('boxed', [{type: 'bold'}])]},
        {type: 'listItem', content: [paragraph('first'), paragraph('second')]}
      ]}
    ]});
    const tiptap = (composer as TiptapEditorInternals).editor;
    tiptap.commands.selectAll();
    const {dom} = tiptap.view.serializeForClipboard(tiptap.state.selection.content());

    const {editor, inputField} = mountCaption();
    const {editor: caption} = editor as unknown as {editor: Editor};
    caption.view.pasteHTML(dom.innerHTML, new Event('paste', {cancelable: true}) as ClipboardEvent);

    const value = getRichValueWithCaret(inputField.input, true, false);
    expect(value.value).toBe('- [x] done\n- [ ] todo\n3. three\n2. two\n- [x] boxed\n- first\nsecond');
    // what the composer sends for the same lists
    expect(value.value).toBe(composer.getRichValue(true, false).value);
    expect(value.entities).toContainEqual(expect.objectContaining({_: 'messageEntityBold', offset: value.value.indexOf('boxed'), length: 5}));
  });

  // The media popup sends its caption on the send shortcut, from its own Enter handler — the field
  // only has to keep the shortcut out of the text and say so, since stopping it prevents the default.
  describe('a caption whose popup sends on the send shortcut', () => {
    beforeEach(() => setAppSettingsSilent('sendShortcut', 'enter'));

    const pressEnter = (input: HTMLElement, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Enter', ...init});
      input.dispatchEvent(event);
      return event;
    };

    test('breaks no line on it and leaves it to the popup', () => {
      const {editor, inputField} = mountField({}, {leaveSendShortcut: true});
      editor.setTextWithEntities('caption');
      editor.focusAtEnd();

      const event = pressEnter(inputField.input);
      expect(isSendShortcutLeft(event)).toBe(true);
      expect(editor.getRichValue(false).value).toBe('caption');
    });

    test('still breaks the line on the new-line shortcut', () => {
      const {editor, inputField} = mountField({}, {leaveSendShortcut: true});
      editor.setTextWithEntities('caption');
      editor.focusAtEnd();

      const event = pressEnter(inputField.input, {shiftKey: true});
      expect(isSendShortcutLeft(event)).toBe(false);
      expect(editor.getRichValue(false).value).toBe('caption\n');
    });

    test('breaks no line in an empty field, on either shortcut', () => {
      for(const {editor, inputField} of [mountCaption({}, {leaveSendShortcut: true}), mountField()]) {
        editor.focusAtEnd();
        const event = pressEnter(inputField.input, {shiftKey: true});
        expect(event.defaultPrevented).toBe(true);
        expect(isSendShortcutLeft(event)).toBe(false);
        // a break would sit inside the one paragraph: the value tells it, not the paragraphs
        expect(editor.getRichValue(false).value).toBe('');
      }

      // a field whose popup does not send on Enter takes Enter for a line — but not an empty one's
      const {editor, inputField} = mountField();
      editor.focusAtEnd();
      expect(pressEnter(inputField.input).defaultPrevented).toBe(true);
      expect(editor.getRichValue(false).value).toBe('');
    });

    test('leaves a quote that ends the caption on a second new-line shortcut', () => {
      const {editor, inputField} = mountCaption({}, {leaveSendShortcut: true});
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      editor.setTextWithEntities('quoted', [{_: 'messageEntityBlockquote', offset: 0, length: 6} as MessageEntity]);
      editor.focusAtEnd();
      pressEnter(inputField.input, {shiftKey: true});
      pressEnter(inputField.input, {shiftKey: true});
      typeTextThroughEditorView(tiptap, 'after');

      const {value, entities} = editor.getRichValue(true, false);
      expect(value).toBe('quoted\nafter');
      expect(entities).toEqual([expect.objectContaining({_: 'messageEntityBlockquote', offset: 0, length: 6})]);
    });

    test('keeps Enter for the text in a field whose popup does not send on it', () => {
      const {editor, inputField} = mountField();
      editor.setTextWithEntities('description');
      editor.focusAtEnd();

      const event = pressEnter(inputField.input);
      expect(isSendShortcutLeft(event)).toBe(false);
      expect(editor.getRichValue(false).value).toBe('description\n');
    });

    // A one-line field takes no line break at all, so its Enter belongs to whatever the
    // field sits in: the popup's confirm button, a poll option moving to the next one.
    test('leaves Enter to the popup in a one-line field', () => {
      const {editor, inputField} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('Folder');
      editor.focusAtEnd();

      const event = pressEnter(inputField.input);
      expect(isSendShortcutLeft(event)).toBe(true);
      expect(editor.getRichValue(false).value).toBe('Folder');
    });

    test('takes Backspace at the start of a one-line field', () => {
      const {editor, inputField} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('Folder');
      editor.restoreSelection({from: 1, to: 1}, false);

      const errors: ErrorEvent[] = [];
      const onError = (event: ErrorEvent) => errors.push(event);
      window.addEventListener('error', onError);
      inputField.input.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Backspace'
      }));
      window.removeEventListener('error', onError);

      expect(errors.map((event) => event.error?.message ?? event.message)).toEqual([]);
      expect(editor.getRichValue(false).value).toBe('Folder');
    });
  });

  /**
   * The composer keeps an empty paragraph after the document so a block at the end of a
   * message has a line to type after. A plain field can hold no block, and the line it
   * would leave under the text carries "Type something..." over the field's own placeholder.
   */
  describe('the composer\'s trailing paragraph', () => {
    const trailingPlaceholders = (input: HTMLElement) =>
      input.querySelectorAll('.chat-input-trailing-placeholder').length;

    test('is not in a plain field, empty or with text', () => {
      const {editor, inputField} = mountField();
      expect(editor.getDocument().content).toHaveLength(1);
      expect(trailingPlaceholders(inputField.input)).toBe(0);

      editor.setTextWithEntities('caption');
      expect(editor.getDocument().content).toHaveLength(1);
      expect(trailingPlaceholders(inputField.input)).toBe(0);
      expect(editor.getRichValue(false).value).toBe('caption');
    });

    // a field with no block to type after takes no paragraph for the technical one
    test('keeps the last empty line of a value in a field that holds no block', () => {
      const {editor, inputField} = mountField();
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      editor.setTextWithEntities('one\n');
      expect(editor.getRichValue(false).value).toBe('one\n');
      // nothing takes it for the technical paragraph: not the label (a plain field hides that)…
      expect(trailingPlaceholders(inputField.input)).toBe(0);
      // …nor the clipboard, which leaves the technical one out of a select-all
      tiptap.commands.selectAll();
      const {slice} = tiptap.view.serializeForClipboard(tiptap.state.selection.content());
      expect(slice.content.childCount).toBe(2);
    });

    // a caption may end in a quote, and the line after it is where the second break leaves it for
    test('is kept in a field that can hold a quote, and a second break leaves one that ends it', () => {
      const {editor, inputField} = mountCaption();
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      editor.setTextWithEntities('quoted', [{_: 'messageEntityBlockquote', offset: 0, length: 6} as MessageEntity]);
      editor.focusAtEnd(false);
      inputField.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
      inputField.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
      typeTextThroughEditorView(tiptap, 'after');

      const {value, entities} = editor.getRichValue(true, false);
      expect(value).toBe('quoted\nafter');
      expect(entities).toEqual([expect.objectContaining({_: 'messageEntityBlockquote', offset: 0, length: 6})]);
    });

    test('leaves the field as many lines high as the text is', () => {
      const {editor, inputField} = mountField();
      editor.setTextWithEntities('one\ntwo');

      expect(inputField.input.querySelectorAll('[data-chat-input-paragraph]')).toHaveLength(2);
      expect(trailingPlaceholders(inputField.input)).toBe(0);
      expect(editor.getRichValue(false).value).toBe('one\ntwo');
    });
  });

  /**
   * A field carries the formatting it declares — `can-format`, or all of it for a
   * message field (a caption, a forward comment) — and nothing else: no shortcut,
   * no typed markdown, no value arriving with it puts any of the rest into it.
   */
  describe('formatting', () => {
    const press = (input: HTMLElement, init: KeyboardEventInit) => {
      input.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, ...init}));
    };
    const selectAll = (editor: ReturnType<typeof mountField>['editor']) => {
      editor.restoreSelection({from: 1, to: editor.getRichValue(false).value.length + 1}, false);
    };
    const entityTypes = (editor: ReturnType<typeof mountField>['editor']) =>
      editor.getRichValue(true, false).entities.map((entity) => entity._);

    test('is none in a field that declares none', () => {
      const {editor} = mountField({withLinebreaks: false});
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      editor.setTextWithEntities('Folder');
      selectAll(editor);
      press(editor.input, {key: 'b', code: 'KeyB', ctrlKey: true});
      press(editor.input, {key: 'i', code: 'KeyI', ctrlKey: true});
      expect(entityTypes(editor)).toEqual([]);

      editor.focusAtEnd(false);
      typeTextThroughEditorView(tiptap, ' **bold** ');
      expect(editor.getRichValue(true, false)).toMatchObject({value: 'Folder **bold** ', entities: []});
    });

    test('keeps the text of a value that carries what the field does not', () => {
      const {editor} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('quoted bold', [
        {_: 'messageEntityBlockquote', offset: 0, length: 6} as MessageEntity,
        {_: 'messageEntityBold', offset: 7, length: 4}
      ]);
      expect(editor.getRichValue(true, false)).toMatchObject({value: 'quoted bold', entities: []});
    });

    test('is only what a field declares', () => {
      const {editor} = mountField({canHaveFormatting: ['bold', 'italic', 'link']});
      editor.setTextWithEntities('fact');
      selectAll(editor);
      press(editor.input, {key: 'u', code: 'KeyU', ctrlKey: true});
      expect(entityTypes(editor)).toEqual([]);
      press(editor.input, {key: 'b', code: 'KeyB', ctrlKey: true});
      expect(entityTypes(editor)).toEqual(['messageEntityBold']);

      editor.setTextWithEntities('quoted', [{_: 'messageEntityBlockquote', offset: 0, length: 6} as MessageEntity]);
      expect(editor.getRichValue(true, false)).toMatchObject({value: 'quoted', entities: []});
      expect(editor.supportsMarkup('quote')).toBe(false);
      expect(editor.supportsMarkup('link')).toBe(true);
    });

    // the tooltip's path: applying a mark clears code and a formatted date — of those the field has
    test('applies what a field declares when code and dates are not among it', () => {
      const {editor} = mountField({canHaveFormatting: ['bold', 'italic', 'link']});
      editor.setTextWithEntities('fact');
      selectAll(editor);
      expect(editor.applyMarkup({type: 'link', href: 'https://telegram.org/'})).toBe(true);
      expect(editor.applyMarkup({type: 'bold'})).toBe(true);
      expect(entityTypes(editor).sort()).toEqual(['messageEntityBold', 'messageEntityTextUrl']);
    });

    test('is all a plain message carries in a message field', () => {
      const {editor} = mountCaption();
      editor.setTextWithEntities('caption');
      selectAll(editor);
      press(editor.input, {key: 'u', code: 'KeyU', ctrlKey: true});
      expect(entityTypes(editor)).toEqual(['messageEntityUnderline']);
      expect(editor.supportsMarkup('quote')).toBe(true);
      expect(editor.supportsMarkup('monospace')).toBe(true);
    });

    // a plain field has no heading, and a one-line one no code block, for these to make
    test.each([
      ['heading', {key: 'H', code: 'KeyH', ctrlKey: true, shiftKey: true}],
      ['heading level', {key: '1', code: 'Digit1', ctrlKey: true, altKey: true}],
      ['monospace', {key: 'm', code: 'KeyM', ctrlKey: true}]
    ] as const)('takes the %s shortcut without throwing', (_name, init) => {
      for(const {editor} of [mountCaption(), mountCaption({withLinebreaks: false})]) {
        editor.setTextWithEntities('line');
        selectAll(editor);
        const errors: ErrorEvent[] = [];
        const onError = (event: ErrorEvent) => errors.push(event);
        window.addEventListener('error', onError);
        press(editor.input, init);
        window.removeEventListener('error', onError);
        expect(errors.map((event) => event.error?.message ?? event.message)).toEqual([]);
        expect(editor.getRichValue(false).value).toBe('line');
      }
    });
  });

  /**
   * The app draws an emoji as its own image wherever the platform's font would
   * not (jsdom's agent is not an Apple one), and a field shows it as the message
   * will — over the text, which stays what is sent.
   */
  describe('emoji', () => {
    const images = (input: HTMLElement) => [...input.querySelectorAll<HTMLElement>('.chat-input-emoji-image')];

    test('is drawn as the app\'s image over the text it stays', () => {
      const {editor, inputField} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('a \u{1F603} b');

      const [image, ...rest] = images(inputField.input);
      expect(rest).toEqual([]);
      expect(image.textContent).toBe('\u{1F603}');
      expect(image.style.backgroundImage).toContain('assets/img/emoji/1f603.png');
      expect(editor.getRichValue(true, false)).toMatchObject({value: 'a \u{1F603} b', entities: []});
    });

    test('follows the text it is typed into', () => {
      const {editor, inputField} = mountCaption();
      const {editor: tiptap} = editor as unknown as {editor: Editor};
      editor.setTextWithEntities('one');
      editor.focusAtEnd(false);
      typeTextThroughEditorView(tiptap, ' \u{1F44D}\u{1F3FD} two');
      expect(images(inputField.input).map((image) => image.textContent)).toEqual(['\u{1F44D}\u{1F3FD}']);

      editor.setTextWithEntities('');
      expect(images(inputField.input)).toEqual([]);
    });

    test('goes when code is applied over it and comes back when code is taken off', () => {
      const {editor, inputField} = mountCaption();
      editor.setTextWithEntities('a \u{1F603} b');
      editor.restoreSelection({from: 1, to: editor.getRichValue(false).value.length + 1}, false);
      expect(images(inputField.input)).toHaveLength(1);

      expect(editor.applyMarkup({type: 'monospace'})).toBe(true);
      expect(images(inputField.input)).toHaveLength(0);
      expect(editor.applyMarkup({type: 'monospace'})).toBe(true);
      expect(images(inputField.input)).toHaveLength(1);
    });

    // formatting can split one emoji over text nodes: it stays one image, not one per part
    test('is one image when formatting splits it over text nodes', () => {
      const {editor, inputField} = mountCaption();
      const grapheme = '\u{1F469}\u{1F3FD}\u200D\u{1F4BB}';
      editor.setDocument({type: 'doc', content: [{type: 'paragraph', content: [
        {type: 'text', text: 'A'},
        ...Array.from(grapheme).map((text, index) => ({type: 'text', text, marks: [{type: index % 2 ? 'italic' : 'bold'}]})),
        {type: 'text', text: 'B'}
      ]}]});

      const [image, ...rest] = images(inputField.input);
      expect(rest).toEqual([]);
      expect(image.style.backgroundImage).toContain('1f469-1f3fd-200d-1f4bb.png');
      expect(inputField.input.querySelectorAll('.chat-input-emoji-image-rest')).toHaveLength(Array.from(grapheme).length - 1);
      expect(editor.getRichValue(false).value).toBe(`A${grapheme}B`);
    });

    test('is left as typed in code', () => {
      const {editor, inputField} = mountCaption();
      editor.setTextWithEntities('\u{1F603}', [{_: 'messageEntityCode', offset: 0, length: 2}]);
      expect(images(inputField.input)).toEqual([]);
    });
  });

  // The emoji panel takes the focus itself, and a field opened with a value — a folder
  // name, a contact note — may never have been given a caret at all.
  describe('what the emoji panel inserts', () => {
    test('goes after the text when the field was never focused', () => {
      const {editor} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('Folder');

      editor.replaceSelection('\u{1F60A}');
      expect(editor.getRichValue(false).value).toBe('Folder\u{1F60A}');
    });

    test('goes to the caret the person left', () => {
      const {editor} = mountField({withLinebreaks: false});
      editor.setTextWithEntities('Folder');
      editor.restoreSelection({from: 4, to: 4}, false);

      editor.replaceSelection('\u{1F60A}');
      expect(editor.getRichValue(false).value).toBe('Fol\u{1F60A}der');
    });
  });
});
