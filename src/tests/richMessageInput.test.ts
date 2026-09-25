import '@/tests/mocks/chatInputIntegrationUi';
import '@/tests/mocks/chatInputEditorNodes';
import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController, type RichMessageInputOptions} from '@components/richMessageInput';
import createEditor from '@components/chat/inputEditor';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import deferredPromise from '@helpers/cancellablePromise';
import type {ChatInputRichMedia} from '@components/chat/inputEditor/types';
import {setAppSettingsSilent} from '@stores/appSettings';
import {readdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

vi.mock('@components/chat/input', () => ({default: class {constructor() {throw new Error('A field must not construct ChatInput');}}}));
vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));
vi.mock('@components/chat/inputEditor/prepareRichMediaUpload', () => ({default: async(file: File) => ({file})}));

const disposers: VoidFunction[] = [];
let previewId = 0;
beforeEach(() => {
  setAppSettingsSilent('sendShortcut', 'enter');
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:field-${++previewId}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mount(options: RichMessageInputOptions = {}) {
  let field: RichMessageInputController;
  let destroy: VoidFunction;
  createRoot(dispose => {
    destroy = dispose;
    disposers.push(dispose);
    const element = RichMessageInput({...options, ref: value => field = value});
    document.body.append(element);
  });
  return {field, destroy};
}

test('field modules do not import the chat host or its application adapter', () => {
  const directory = resolve(__dirname, '../components/richMessageInput');
  for(const file of readdirSync(directory).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(resolve(directory, file), 'utf8');
    expect(source, file).not.toMatch(/from ['"](?:@components\/chat\/input|\.\.\/chat\/input)(?:\.ts)?['"]/);
    expect(source, file).not.toContain('createAiEditorContext');
  }
});

test('mounts the complete field, toolbars and submit callback without ChatInput', async() => {
  const onSubmit = vi.fn();
  const {field} = mount({onSubmit});
  expect(getChatInputEditor(field.input)).toBe(field.editor);
  expect(field.element.contains(field.toolbar.top)).toBe(true);
  expect(field.element.contains(field.toolbar.bottom)).toBe(true);
  field.setExpanded(true);
  expect(field.toolbar.bottom.getAttribute('aria-hidden')).toBe('false');
  field.editor.setTextWithEntities('Hello');
  field.input.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
  expect(onSubmit).toHaveBeenCalledOnce();
  const before = field.editor.getDocument();
  field.toolbar.run(editor => editor.insertTable());
  await vi.waitFor(() => expect(field.toolbar.top.querySelector('button')?.disabled).toBe(false));
  field.toolbar.top.querySelector('button')!.click();
  expect(field.editor.getDocument()).toEqual(before);
});

test('two fields keep independent content, history and lifecycle', () => {
  const first = mount();
  const second = mount();
  first.field.editor.setTextWithEntities('First');
  second.field.editor.setTextWithEntities('Second');
  first.field.editor.replaceSelection(' changed');
  first.destroy();
  expect(getChatInputEditor(first.field.input)).toBeUndefined();
  expect(getChatInputEditor(second.field.input)).toBe(second.field.editor);
  expect(second.field.editor.getRichValue().value).toBe('Second');
  expect(second.field.editor.canUndo()).toBe(false);
  second.field.editor.replaceSelection('!');
  expect(second.field.editor.undo()).toBe(true);
  expect(second.field.editor.getRichValue().value).toBe('Second');
});

test('engine reload preserves the mounted field, selection and toolbar commands', async() => {
  const {field} = mount();
  field.editor.setTextWithEntities('Original');
  field.editor.restoreSelection({from: 2, to: 5}, false);
  const before = field.editor.getDocument();
  const oldEditor = field.editor;
  const oldInput = field.input;
  field.reloadEditor(createEditor);
  await vi.waitFor(() => expect(field.editor).not.toBe(oldEditor));
  expect(field.input).toBe(oldInput);
  expect(field.editor.getDocument()).toEqual(before);
  expect(field.editor.getSelectedText()).toBe('rig');
  expect(field.toolbar.run(editor => editor.applyMarkup({type: 'bold'}))).toBe(true);
  expect(field.editor.getMarkupState('bold').fully).toBe(true);
});

test.each(['context', 'destroy'] as const)('pending media authorization cannot enter a different %s', async(interruption) => {
  let current = true;
  const allowed = deferredPromise<boolean>();
  const upload = vi.fn();
  const {field, destroy} = mount({
    captureContext: () => () => current,
    media: {capture: () => ({isCurrent: () => true, authorize: () => allowed, upload, cancel: vi.fn()})}
  });
  field.setExpanded(true);
  const operation = field.insertMedia([new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'})], field.editor.captureSelection());
  if(interruption === 'context') current = false;
  else destroy();
  allowed.resolve(true);
  expect(await operation).toBe(false);
  expect(upload).not.toHaveBeenCalled();
  expect(field.media.pendingTasks).toBe(0);
});

test('pending upload completes into the new engine after reload and disposal cancels remaining work', async() => {
  const pending = deferredPromise<ChatInputRichMedia>();
  const upload = vi.fn(() => pending);
  const cancel = vi.fn();
  const {field, destroy} = mount({media: {capture: () => ({isCurrent: () => true, authorize: async() => true, upload, cancel})}});
  field.setExpanded(true);
  expect(await field.insertMedia([new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'})], field.editor.captureSelection())).toBe(true);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  const oldEditor = field.editor;
  field.reloadEditor(createEditor);
  await vi.waitFor(() => expect(field.editor).not.toBe(oldEditor));
  pending.resolve({type: 'audio', document: {_: 'document', id: '1'} as any});
  await vi.waitFor(() => expect(field.media.pendingTasks).toBe(0));
  expect(field.editor.getRichMessage().input.blocks[0]._).toBe('pageBlockAudio');
  upload.mockReturnValue(new Promise(() => {}));
  expect(await field.insertMedia([new File(['next'], 'next.mp3', {type: 'audio/mpeg'})], field.editor.captureSelection())).toBe(true);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  destroy();
  expect(cancel).toHaveBeenCalledOnce();
  expect(field.media.pendingTasks).toBe(0);
});
