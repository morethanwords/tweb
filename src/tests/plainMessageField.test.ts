import '@/tests/mocks/chatInputEditorNodes';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import InputField from '@components/inputField';
import draftTextWithEntities from '@lib/richTextProcessor/draftTextWithEntities';
import wrapDraftText from '@lib/richTextProcessor/wrapDraftText';
import type {DraftMessage, MessageEntity} from '@layer';
import type {Editor} from '@tiptap/core';
import {Fragment, Slice} from '@tiptap/pm/model';

vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

/**
 * What a caption, a forward comment, a poll description or a fact check hands to
 * the manager on send. Every one of them reads its field with
 * `getRichValueWithCaret`, which answers from the mounted editor — so this is the
 * contract that keeps the plain fields sending what the person typed.
 */
describe('plain message field', () => {
  const mounted: Array<{destroy(): void}> = [];

  const mountField = (options: ConstructorParameters<typeof InputField>[0] = {}) => {
    const inputField = new InputField({withLinebreaks: true, ...options});
    document.body.append(inputField.container);
    const editor = attachPlainMessageEditor(inputField.input);
    mounted.push({destroy: () => {
      editor.destroy();
      inputField.container.remove();
    }});
    return {editor, inputField};
  };

  afterEach(() => {
    mounted.splice(0).forEach((item) => item.destroy());
  });

  test('reads back the text and entities the field was given', () => {
    const {editor, inputField} = mountField();
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

  test('applies formatting through the same entry point as the chat input', () => {
    const {editor, inputField} = mountField();
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
      const {inputField} = mountField();
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
      const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {value: {getData: () => ''}});

      expect(tiptap.view.someProp('handlePaste')?.(tiptap.view, event, slice)).toBe(true);

      expect(tiptap.getJSON().content).toHaveLength(1);
      expect(getRichValueWithCaret(inputField.input, true, false).value).toBe('firstsecond');
    });

    test('keeps the marks a pasted line brings', () => {
      const {editor, inputField, tiptap} = mountSingleLine();
      const {schema} = tiptap;
      const slice = new Slice(Fragment.fromArray([
        schema.nodes.paragraph.create(null, schema.text('bold', [schema.marks.bold.create()]))
      ]), 0, 0);
      const event = new Event('paste', {bubbles: true, cancelable: true}) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {value: {getData: () => ''}});

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
});
