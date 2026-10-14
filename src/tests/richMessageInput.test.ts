import '@/tests/mocks/chatInputIntegrationUi';
import '@/tests/mocks/chatInputEditorNodes';
import {createRoot} from 'solid-js';
import RichMessageInput, {type RichMessageInputController, type RichMessageInputOptions} from '@components/richMessageInput';
import createEditor from '@components/chat/inputEditor';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import deferredPromise from '@helpers/cancellablePromise';
import type {ChatInputRichMedia} from '@components/chat/inputEditor/types';
import {setAppSettingsSilent} from '@stores/appSettings';
import {isSendShortcutLeft} from '@helpers/dom/isSendShortcutPressed';
import {readdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

vi.mock('@components/chat/input', () => ({default: class {constructor() {throw new Error('A field must not construct ChatInput');}}}));
vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));
// what a test holds the file's metadata back with, while a row is prepared
const preparing = vi.hoisted(() => ({gate: undefined as Promise<void>}));
vi.mock('@components/chat/inputEditor/prepareRichMediaUpload', () => ({default: async(file: File) => {
  await preparing.gate;
  return {file};
}}));
// a photo or video preview that fails to load, for the test that needs one
const previewFailure = vi.hoisted(() => ({current: undefined as Error}));
vi.mock('@components/richMessageInput/mediaPreview', async(importOriginal) => {
  const original = await importOriginal<typeof import('@components/richMessageInput/mediaPreview')>();
  return {
    ...original,
    loadRichMediaPreview: (...args: Parameters<typeof original.loadRichMediaPreview>) => previewFailure.current ?
      Promise.reject(previewFailure.current) :
      original.loadRichMediaPreview(...args)
  };
});

const disposers: VoidFunction[] = [];
let previewId = 0;
beforeEach(() => {
  setAppSettingsSilent('sendShortcut', 'enter');
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:field-${++previewId}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => {
  previewFailure.current = undefined;
  preparing.gate = undefined;
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

// A send can open a popup (the rich-message Premium confirmation) while the
// field keeps the focus: Enter is then the popup's, not another send.
test.each(['enter', 'ctrlEnter'] as const)('leaves Enter to a modal popup over the field with %s sending', async(sendShortcut) => {
  setAppSettingsSilent('sendShortcut', sendShortcut);
  const {default: PopupElement} = await import('@components/popups/indexTsx');
  const onSubmit = vi.fn();
  const {field} = mount({onSubmit});
  field.editor.setTextWithEntities('Hello');
  const before = field.editor.getDocument();
  const popup = document.createElement('div');
  document.body.append(popup);
  const context = {element: popup, withoutOverlay: false, destroyed: false};
  PopupElement.POPUPS.push(context as unknown as typeof PopupElement.POPUPS[number]);
  try {
    for(const init of [{}, {ctrlKey: true}, {shiftKey: true}]) {
      const event = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true, ...init});
      field.input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(isSendShortcutLeft(event)).toBe(true);
    }
    expect(onSubmit).not.toHaveBeenCalled();
    expect(field.editor.getDocument()).toEqual(before);

    // closed, it stays in the stack while it fades out, and holds the field no longer
    context.destroyed = true;
    field.input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true, ctrlKey: sendShortcut === 'ctrlEnter'
    }));
    expect(onSubmit).toHaveBeenCalledOnce();
  } finally {
    PopupElement.POPUPS.splice(PopupElement.POPUPS.indexOf(context as unknown as typeof PopupElement.POPUPS[number]), 1);
  }
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

// the local document an audio's row is drawn from while it uploads
const prepareRow = vi.fn(async() => ({document: {_: 'document', id: 'local', file_name: 'audio.mp3', attributes: []} as any}));

test.each(['context', 'destroy'] as const)('pending media authorization cannot enter a different %s', async(interruption) => {
  let current = true;
  const allowed = deferredPromise<boolean>();
  const upload = vi.fn();
  const {field, destroy} = mount({
    captureContext: () => () => current,
    media: {capture: () => ({isCurrent: () => true, authorize: () => allowed, prepare: prepareRow, upload, cancel: vi.fn()})}
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

// a broken preview gives the insertion up while a row of it is still being prepared: that row's
// upload, prepared after the cleanup, is cancelled all the same
test('an insertion given up for a broken preview cancels a row prepared after it', async() => {
  previewFailure.current = new Error('corrupt');
  const prepared = deferredPromise<{document: any}>();
  const prepare = vi.fn(() => prepared);
  const cancel = vi.fn();
  const {field} = mount({media: {capture: () => ({isCurrent: () => true, authorize: async() => true, prepare, upload: vi.fn(), cancel})}});
  field.setExpanded(true);
  const operation = field.insertMedia([
    new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'}),
    new File(['video'], 'video.mp4', {type: 'video/mp4'})
  ], field.editor.captureSelection());
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  prepared.resolve({document: {_: 'document', id: 'local'}});
  expect(await operation).toBe(false);
  expect(cancel).toHaveBeenCalledOnce();
  expect(field.media.pendingTasks).toBe(0);
});

// a retry prepares the row's upload again; cleared before that is done, the composer had no upload
// name to cancel yet, so the preparation lets its own upload go
test('a row prepared again for a retry is let go when the composer is cleared meanwhile', async() => {
  let prepared = 0;
  const prepare = vi.fn(async(_details: unknown, _fileName: string) => ({document: {_: 'document', id: `local-${++prepared}`} as any}));
  const upload = vi.fn().mockRejectedValueOnce(new Error('network')).mockReturnValue(new Promise(() => {}));
  const cancel = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const {field} = mount({media: {capture: () => ({isCurrent: () => true, authorize: async() => true, prepare, upload, cancel})}});
  field.setExpanded(true);
  expect(await field.insertMedia([new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'})], field.editor.captureSelection())).toBe(true);
  await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('rich message media upload error', expect.anything()));
  const uploadId = field.editor.getDocument().content.find((node) => node.attrs?.uploadId)?.attrs.uploadId;

  let release: VoidFunction;
  preparing.gate = new Promise((resolve) => release = resolve);
  field.media.handleAction('retry', uploadId);
  field.media.clear();
  expect(cancel).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(cancel).toHaveBeenCalledWith(prepare.mock.calls[1][1]));
  expect(field.media.pendingTasks).toBe(0);
});

test('pending upload completes into the new engine after reload and disposal cancels remaining work', async() => {
  const pending = deferredPromise<ChatInputRichMedia>();
  const upload = vi.fn(() => pending);
  const cancel = vi.fn();
  const {field, destroy} = mount({media: {capture: () => ({isCurrent: () => true, authorize: async() => true, prepare: prepareRow, upload, cancel})}});
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
