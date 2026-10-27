import '@/tests/mocks/chatInputIntegrationUi';
import '@/tests/mocks/chatInputEditorNodes';
import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController} from '@components/richMessageInput';
import {useAiEditorButton} from '@components/richMessageInput/ai';
import attachPlainMessageEditor from '@components/chat/inputEditor/plainField';
import InputField from '@components/inputField';
import type {AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {CreateWithAiPopupProps} from '@components/popups/aiEditorPopup/createWithAiPopup';
import type {MessageEntity, RichMessage} from '@layer';

const mocks = vi.hoisted(() => ({
  click: undefined as (() => Promise<void>),
  open: vi.fn(),
  create: vi.fn()
}));
vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));
vi.mock('@components/buttonTsx', () => ({default: (props: {onClick: () => Promise<void>}) => {
  mocks.click = props.onClick;
  return document.createElement('button');
}}));
vi.mock('@components/chat/createAiEditorIcon', () => ({default: () => document.createElement('span')}));
vi.mock('@components/resizeObserver', () => ({observeResize: () => () => {}}));
vi.mock('@lib/solidjs/hotReloadGuard', () => ({useHotReloadGuard: () => ({
  rootScope: {managers: {acknowledged: {aiTonesManager: {getTones: async() => ({cached: true, result: [] as never[]})}}}},
  toastNew: vi.fn(),
  HotReloadGuard: undefined as undefined
})}));
vi.mock('@components/popups/aiEditorPopup', () => ({openAiEditorPopup: mocks.open}));
vi.mock('@components/popups/aiEditorPopup/createWithAiPopup', () => ({openCreateWithAiPopup: mocks.create}));

const disposers: VoidFunction[] = [];
beforeEach(() => {mocks.open.mockClear(); mocks.create.mockClear();});
afterEach(() => {disposers.splice(0).forEach(dispose => dispose()); document.body.replaceChildren();});

const ai = {capture: () => ({peerId: 42 as PeerId, isCurrent: () => true, clear: vi.fn()})};

function mount(options: Pick<Parameters<typeof RichMessageInput>[0], 'canWriteRich'> = {}) {
  let field: RichMessageInputController;
  let hidden = false;
  createRoot(dispose => {
    disposers.push(dispose);
    document.body.append(RichMessageInput({
      ...options,
      ai,
      isAiHidden: () => hidden,
      ref: value => field = value
    }));
  });
  return {field, hideAi: () => {hidden = true; field.sync();}};
}

const result: RichMessage = {
  _: 'richMessage', pFlags: {}, photos: [], documents: [],
  blocks: [{_: 'pageBlockHeading2', text: {_: 'textPlain', text: 'Rewritten'}}]
};

for(const mode of ['whole', 'selection', 'create'] as const) test.each(['plain', 'rich'] as const)(
  `AI ${mode} %s replacement preserves earlier history and redo in the actual field`,
  async(format) => {
    const {field} = mount();
    const editor = field.editor;
    editor.setTextWithEntities('Original');
    editor.focusAtEnd();
    editor.replaceSelection(' typed');
    const before = editor.getDocument();
    if(mode === 'selection') editor.restoreSelection({from: 1, to: 9}, false);
    if(mode === 'create') field.setExpanded(true);
    await mocks.click();
    const popup = (mode === 'create' ? mocks.create : mocks.open).mock.calls[0][0] as AiEditorPopupProps & CreateWithAiPopupProps;
    if(format === 'rich') expect(popup.onApplyRichMessage(result)).toBe(true);
    else expect(popup.onApply({text: 'Rewritten', entities: []})).toBe(true);
    const after = editor.getDocument();
    expect(after).not.toEqual(before);
    expect(editor.getRichValue().value).toContain('Rewritten');
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.undo()).toBe(true);
    expect(editor.getRichValue().value).toBe('Original');
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.redo()).toBe(true);
    expect(editor.getDocument()).toEqual(after);
  }
);

test('AI rewrite targets its own field and retains explicit document policy', async() => {
  const first = mount().field;
  first.editor.setTextWithEntities('Other field');
  const second = mount().field;
  second.editor.setRichMessage({...result, pFlags: {rtl: true}});
  second.editor.setNoAutolink(true);
  const policy = second.editor.snapshot().richMessageOptions;
  second.editor.focusAtEnd();
  await mocks.click();
  const popup = mocks.open.mock.calls[0][0] as AiEditorPopupProps;
  expect(popup.onApplyRichMessage({...result, blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Changed'}}]})).toBe(true);
  expect(second.editor.getRichValue().value).toBe('Changed');
  expect(second.editor.getRichMessage().input.pFlags.noautolink).toBe(true);
  expect(second.editor.snapshot().richMessageOptions).toEqual(policy);
  expect(first.editor.getRichValue().value).toBe('Other field');
  expect(first.editor.canUndo()).toBe(false);
  expect(second.editor.undo()).toBe(true);
  expect(second.editor.getRichValue().value).toBe('Rewritten');
});

test('AI visibility changes cannot remove the field expansion control', () => {
  const {field, hideAi} = mount();
  field.field.onChangeHeight(100);
  expect(field.row.classList.contains('has-message-input-expand-button')).toBe(true);
  hideAi();
  expect(field.row.classList.contains('has-message-input-expand-button')).toBe(true);
  field.field.onChangeHeight(40);
  expect(field.row.classList.contains('has-message-input-expand-button')).toBe(false);
});

// A plain message — and a caption, or the composer where rich posting is off, which send only one —
// goes to the AI editor as text, not as a rich message: a rich result may hold a block a plain field
// cannot (a footer), and an account that may not post rich messages is refused the rich endpoints.
describe('AI on plain content', () => {
  const bold: MessageEntity = {_: 'messageEntityBold', offset: 6, length: 4};

  function mountCaption() {
    const inputField = new InputField({withLinebreaks: true});
    // what InputFieldMessage does: a caption is a message field, with all of a message's formatting
    inputField.input.classList.replace('input-field-input', 'input-message-input');
    document.body.append(inputField.container);
    const editor = attachPlainMessageEditor(inputField.input);
    disposers.push(() => editor.destroy());
    editor.setTextWithEntities('Hello bold', [bold]);
    createRoot(dispose => {
      disposers.push(dispose);
      useAiEditorButton({
        context: ai,
        inputField: () => inputField,
        container: () => inputField.container as HTMLDivElement,
        appendTo: () => inputField.container as HTMLDivElement,
        canSend: false,
        shouldShowFromHeight: () => 0
      });
    });
    return editor;
  }

  const open = async() => {
    await mocks.click();
    return mocks.open.mock.calls[0][0] as AiEditorPopupProps;
  };

  test('a caption is rewritten as text and takes the text back', async() => {
    const editor = mountCaption();
    const popup = await open();
    expect(popup.richMessage).toBeUndefined();
    expect(popup.text).toEqual({_: 'textWithEntities', text: 'Hello bold', entities: [bold]});
    expect(popup.onApply({text: 'Changed text', entities: [{...bold, offset: 8}]})).toBe(true);
    expect(editor.getRichValue()).toMatchObject({value: 'Changed text', entities: [{...bold, offset: 8}]});
  });

  test('a caption\'s selection is rewritten in its place', async() => {
    const editor = mountCaption();
    editor.restoreSelection({from: 1, to: 6}, false);
    const popup = await open();
    expect(popup.richMessage).toBeUndefined();
    expect(popup.text).toEqual({_: 'textWithEntities', text: 'Hello', entities: []});
    expect(popup.onApply({text: 'Hi', entities: []})).toBe(true);
    expect(editor.getRichValue()).toMatchObject({value: 'Hi bold', entities: [{...bold, offset: 3}]});
  });

  test('a selection goes as its part of what the field sends: no local emoji entity, a quote still collapsed', async() => {
    const editor = mountCaption();
    const quote: MessageEntity = {_: 'messageEntityBlockquote', offset: 6, length: 6, pFlags: {collapsed: true}};
    editor.setTextWithEntities('Hi 😀\nquoted', [quote]);
    editor.restoreSelection({type: 'all', from: 0, to: 0}, false);
    const popup = await open();
    expect(popup.richMessage).toBeUndefined();
    expect(popup.text.text).toBe('Hi 😀\nquoted');
    expect(popup.text.entities.map((entity) => entity._)).not.toContain('messageEntityEmoji');
    expect(popup.text.entities).toContainEqual(expect.objectContaining({
      _: 'messageEntityBlockquote',
      pFlags: expect.objectContaining({collapsed: true})
    }));
  });

  test('a selection keeps the part of a link and of a code block it cuts', async() => {
    const editor = mountCaption();
    const url = 'https://example.com/';
    editor.setTextWithEntities('detailed guide', [{_: 'messageEntityTextUrl', offset: 0, length: 14, url}]);
    editor.restoreSelection({from: 10, to: 15}, false);
    expect((await open()).text).toEqual({
      _: 'textWithEntities',
      text: 'guide',
      entities: [{_: 'messageEntityTextUrl', offset: 0, length: 5, url}]
    });

    mocks.open.mockClear();
    editor.setTextWithEntities('a\nb\nc', [{_: 'messageEntityPre', offset: 0, length: 5, language: ''}]);
    editor.restoreSelection({from: 3, to: 6}, false);
    const code = (await open()).text;
    expect(code.text).toBe('b\nc');
    expect(code.entities).toEqual([expect.objectContaining({_: 'messageEntityPre', offset: 0, length: 3})]);
  });

  test('the composer rewrites plain text as text and rich content as a rich message', async() => {
    const {field} = mount();
    expect(field.editor.plainOnly).toBe(false);
    field.editor.setTextWithEntities('Hello bold', [bold]);
    const plain = await open();
    expect(plain.richMessage).toBeUndefined();
    expect(plain.text).toEqual({_: 'textWithEntities', text: 'Hello bold', entities: [bold]});
    expect(plain.onApply({text: 'Changed', entities: []})).toBe(true);
    expect(field.editor.getRichValue().value).toBe('Changed');

    mocks.open.mockClear();
    field.editor.setRichMessage(result);
    const rich = await open();
    expect(rich.richMessage).toMatchObject({_: 'inputRichMessage', blocks: [{_: 'pageBlockHeading2'}]});
  });

  test('the composer without rich posting is rewritten as text', async() => {
    const {field} = mount({canWriteRich: async() => false});
    await field.richReady;
    await vi.waitFor(() => expect(field.editor.plainOnly).toBe(true));
    field.editor.setTextWithEntities('Hello bold', [bold]);
    const popup = await open();
    expect(popup.richMessage).toBeUndefined();
    expect(popup.text).toEqual({_: 'textWithEntities', text: 'Hello bold', entities: [bold]});
  });
});
