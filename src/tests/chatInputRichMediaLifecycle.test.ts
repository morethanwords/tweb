import '@/tests/mocks/chatInputIntegrationUi';
import RichMediaUploads from '@components/richMessageInput/media';
import editRichMediaItem from '@components/richMessageInput/editMedia';
import {createImageSource} from '@components/chat/editMessageMedia';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import ChatInput from '@components/chat/input';
import deferredPromise from '@helpers/cancellablePromise';
import {getMiddleware} from '@helpers/middleware';

vi.mock('@lib/appImManager', () => ({AppImManager: class {}, APP_TABS: {}, default: {}}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
const mediaEditor = vi.hoisted(() => ({open: vi.fn()}));
vi.mock('@components/mediaEditor', () => ({
  openMediaEditorFromMedia: mediaEditor.open,
  openMediaEditorFromMediaNoAnimation: mediaEditor.open
}));
vi.mock('@components/chat/editMessageMedia', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/chat/editMessageMedia')>(),
  createImageSource: vi.fn()
}));

function createSource() {
  const source = document.createElement('img');
  Object.defineProperties(source, {
    naturalWidth: {value: 100}, naturalHeight: {value: 100}
  });
  source.getBoundingClientRect = () => new DOMRect(0, 0, 100, 100);
  document.body.append(source);
  return source;
}

afterEach(() => vi.restoreAllMocks());

test.each(['none', 'peer', 'thread', 'edit', 'destroy'] as const)('rich media permission completion respects %s context', async(interruption) => {
  const permission = deferredPromise<boolean>();
  const middleware = getMiddleware();
  const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:media-context');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const editor = {
    captureSelection: () => ({revision: 0}),
    beginRichMediaUploads: vi.fn(() => true)
  };
  const host = Object.assign(Object.create(ChatInput.prototype), {
    richMessageInput: {editor, expanded: true, insertMedia: undefined as RichMediaUploads['insert']},
    editMsgId: undefined,
    chat: {peerId: 42, threadId: 1, canSend: () => permission},
    getMiddleware: () => middleware.get(),
    inputValueGeneration: 0
  });
  const uploads = new RichMediaUploads({
    getEditor: () => editor as unknown as ChatInputEditor,
    isExpanded: () => true,
    services: host.createMediaServices()
  });
  vi.spyOn(uploads as any, 'run').mockResolvedValue(undefined);
  host.richMessageInput.insertMedia = uploads.insert.bind(uploads);
  const task = host.insertRichMediaFiles([
    new File(['test'], 'test.mp3', {type: 'audio/mpeg'})
  ], {type: 'text', from: 1, to: 1, revision: 0});
  if(interruption === 'peer') host.chat.peerId = 43;
  if(interruption === 'thread') host.chat.threadId = 2;
  if(interruption === 'edit') host.editMsgId = 99;
  if(interruption === 'destroy') middleware.destroy();
  permission.resolve(true);
  try {
    expect(await task).toBe(interruption === 'none');
    expect(editor.beginRichMediaUploads).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
    expect(createObjectURL).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
  } finally {
    uploads.destroy();
    middleware.destroy();
  }
});

test.each(['none', 'normal-close', 'peer', 'thread', 'edit', 'new-editor', 'destroy'] as const)(
  'edited media result respects %s after rendering completes', async(interruption) => {
    const middleware = getMiddleware();
    const pending = deferredPromise<{blob: Blob}>();
    mediaEditor.open.mockReset();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['photo'], {type: 'image/jpeg'})));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:editing-context');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const source = createSource();
    const host = Object.assign(Object.create(ChatInput.prototype), {
      chat: {peerId: 42, threadId: 1},
      editMsgId: undefined,
      richMessageInput: {editor: {captureSelection: () => ({revision: 0, from: 1, to: 2, type: 'node'})}},
      getMiddleware: () => middleware.get(),
      inputValueGeneration: 0,
      insertMedia: vi.fn(async() => true)
    });
    const editor = host.richMessageInput.editor;
    const contextIsCurrent = host.captureMessageInputContext();
    await editRichMediaItem({
      action: 'edit', grouped: false,
      media: {_: 'photo', pFlags: {}, id: '1', access_hash: '1', file_reference: new Uint8Array(), date: 0, dc_id: 2, sizes: []}, from: 1, to: 2, activeIndex: 0,
      sourceElement: source, previewUrl: 'blob:source'
    }, {
      editor: editor as unknown as ChatInputEditor,
      middleware: middleware.get(),
      isCurrent: () => contextIsCurrent() && host.richMessageInput.editor === editor,
      insert: host.insertMedia
    });
    expect(mediaEditor.open).toHaveBeenCalledOnce();
    const options = mediaEditor.open.mock.calls[0][0];
    const task = options.onEditFinish({getResult: () => pending});
    if(interruption === 'normal-close') options.onClose();
    if(interruption === 'peer') host.chat.peerId = 43;
    if(interruption === 'thread') host.chat.threadId = 2;
    if(interruption === 'edit') host.editMsgId = 99;
    if(interruption === 'new-editor') host.richMessageInput.editor = {};
    if(interruption === 'destroy') middleware.destroy();
    pending.resolve({blob: new Blob(['edited'], {type: 'image/jpeg'})});
    try {
      await task;
      expect(host.insertMedia).toHaveBeenCalledTimes(
        interruption === 'none' || interruption === 'normal-close' ? 1 : 0
      );
    } finally {
      options.onClose();
      middleware.destroy();
      source.remove();
    }
  }
);

for(const stage of ['download', 'source'] as const) test.each([
  'none', 'peer', 'thread', 'edit', 'new-editor', 'new-value', 'document', 'destroy'
] as const)(`media editor opening after ${stage} respects %s context`, async(interruption) => {
  const middleware = getMiddleware();
  const download = deferredPromise<Response>();
  const loadingSource = deferredPromise<HTMLImageElement>();
  const source = createSource();
  const response = () => new Response(new Blob(['photo'], {type: 'image/jpeg'}));
  mediaEditor.open.mockClear();
  vi.mocked(createImageSource).mockReset().mockReturnValue(loadingSource);
  vi.spyOn(globalThis, 'fetch').mockReturnValue(stage === 'download' ? download : Promise.resolve(response()));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:opening-context');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let revision = 0;
  const editor = {captureSelection: () => ({revision, from: 1, to: 2, type: 'node'})};
  const host = Object.assign(Object.create(ChatInput.prototype), {
    chat: {peerId: 42, threadId: 1},
    richMessageInput: {editor},
    editMsgId: undefined,
    inputValueGeneration: 0,
    getMiddleware: () => middleware.get()
  });
  const contextIsCurrent = host.captureMessageInputContext();
  const task = editRichMediaItem({
    action: 'edit', grouped: false,
    media: {_: 'photo', pFlags: {}, id: '1', access_hash: '1', file_reference: new Uint8Array(), date: 0, dc_id: 2, sizes: []},
    from: 1, to: 2, activeIndex: 0, previewUrl: 'blob:source',
    sourceElement: stage === 'download' ? source : undefined
  }, {
    editor: editor as unknown as ChatInputEditor,
    middleware: middleware.get(),
    isCurrent: () => contextIsCurrent() && host.richMessageInput.editor === editor,
    insert: vi.fn(async() => true)
  });
  if(stage === 'source') await vi.waitFor(() => expect(createImageSource).toHaveBeenCalledOnce());
  if(interruption === 'peer') host.chat.peerId = 43;
  if(interruption === 'thread') host.chat.threadId = 2;
  if(interruption === 'edit') host.editMsgId = 99;
  if(interruption === 'new-editor') host.richMessageInput.editor = {};
  if(interruption === 'new-value') ++host.inputValueGeneration;
  if(interruption === 'document') ++revision;
  if(interruption === 'destroy') middleware.destroy();
  download.resolve(response());
  loadingSource.resolve(source);
  await task;
  try {
    expect(mediaEditor.open).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
    if(stage === 'source' && interruption !== 'none') expect(revoke).toHaveBeenCalledWith('blob:opening-context');
  } finally {
    mediaEditor.open.mock.calls[0]?.[0].onClose();
    middleware.destroy();
    source.remove();
  }
});

for(const stage of ['permission', 'picker'] as const) test.each([
  'none', 'peer', 'thread', 'edit', 'new-editor', 'new-value', 'destroy'
] as const)(`${stage} file selection respects %s context`, async(interruption) => {
  const middleware = getMiddleware();
  const permission = deferredPromise<boolean>();
  const input = document.createElement('input');
  input.type = 'file';
  const click = vi.spyOn(input, 'click').mockImplementation(() => {});
  const host = Object.assign(Object.create(ChatInput.prototype), {
    chat: {peerId: 42, threadId: 1},
    editMsgId: undefined,
    inputValueGeneration: 0,
    richMessageInput: {
      expanded: stage === 'picker',
      editor: {captureSelection: () => ({revision: 0, from: 1, to: 1, type: 'text'})},
      insertMedia: vi.fn(async() => true)
    },
    getMiddleware: () => middleware.get(),
    getEphemeralSendingSnapshot: (): undefined => undefined,
    showSlowModeTooltipIfNeeded: () => permission,
    btnSendContainer: {parentElement: document.body},
    fileInput: input
  });
  const task = host.openAttachmentPicker(false, true, false);
  if(stage === 'picker') await task;
  if(interruption === 'peer') host.chat.peerId = 43;
  if(interruption === 'thread') host.chat.threadId = 2;
  if(interruption === 'edit') host.editMsgId = 99;
  if(interruption === 'new-editor') host.richMessageInput.editor = {};
  if(interruption === 'new-value') ++host.inputValueGeneration;
  if(interruption === 'destroy') middleware.destroy();
  if(stage === 'permission') {
    permission.resolve(false);
    await task;
    expect(click).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
    host.fileSelectionPromise?.resolve([]);
  } else {
    const files = [new File(['photo'], 'photo.jpg', {type: 'image/jpeg'})];
    host.handleSelectedFiles(files);
    expect(await host.fileSelectionPromise).toEqual(interruption === 'none' ? files : []);
    expect(host.richMessageInput.insertMedia).toHaveBeenCalledTimes(interruption === 'none' ? 1 : 0);
    expect(host.fileSelectionIsCurrent).toBeUndefined();
  }
  middleware.destroy();
});
