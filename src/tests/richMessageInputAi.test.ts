import '@/tests/mocks/chatInputIntegrationUi';
import '@/tests/mocks/chatInputEditorNodes';
import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController} from '@components/richMessageInput';
import type {AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {CreateWithAiPopupProps} from '@components/popups/aiEditorPopup/createWithAiPopup';
import type {RichMessage} from '@layer';

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

function mount() {
  let field: RichMessageInputController;
  let hidden = false;
  createRoot(dispose => {
    disposers.push(dispose);
    document.body.append(RichMessageInput({
      ai: {capture: () => ({peerId: 42 as PeerId, isCurrent: () => true, clear: vi.fn()})},
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
