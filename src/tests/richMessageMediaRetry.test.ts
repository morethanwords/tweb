import RichMediaUploads from '@components/richMessageInput/media';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import type {SendFileDetails, UploadedRichMessageMedia} from '@appManagers/appMessagesManager';
import deferredPromise from '@helpers/cancellablePromise';

vi.mock('@environment/webpSupport', () => ({default: true}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@components/richMessageInput/mediaPreview', () => ({loadRichMediaPreview: async() => {}}));
const prepare = vi.hoisted(() => vi.fn<(file: File) => Promise<SendFileDetails>>());
vi.mock('@components/chat/inputEditor/prepareRichMediaUpload', () => ({default: prepare}));

const details = (file: File): SendFileDetails => ({file, duration: 0, height: 1, width: 1});
const image = (name: string) => new File([name], name, {type: 'image/jpeg'});

function setup() {
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:rich-media-retry');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  const uploadIds: string[] = [];
  // Upload ids of the media in the document and of those only history holds.
  const document = {pending: [] as string[], history: [] as string[]};
  const editor = {
    captureSelection: () => ({revision: 0}),
    beginRichMediaUploads: vi.fn((options: {id: string}[]) => {
      options.forEach(({id}) => uploadIds.push(id));
      document.pending.push(...options.map(({id}) => id));
      return true;
    }),
    cancelRichMediaUpload: vi.fn((id: string) => {
      document.pending = document.pending.filter((pending) => pending !== id);
      document.history.push(id);
      return true;
    }),
    completeRichMediaUpload: vi.fn(() => true),
    getPendingRichMediaUploadIds: () => document.pending,
    getReferencedRichMediaUploadIds: () => [...document.pending, ...document.history],
    removeRichMediaUpload: vi.fn(() => true),
    updateRichMediaUpload: vi.fn(() => true)
  };

  const upload = vi.fn(async(): Promise<UploadedRichMessageMedia> => {throw new Error('upload rejected');});
  const cancel = vi.fn();
  const uploads = new RichMediaUploads({
    getEditor: () => editor as unknown as ChatInputEditor,
    isExpanded: () => true,
    services: {
      capture: () => ({
        authorize: async() => true,
        cancel,
        isCurrent: () => true,
        upload
      })
    }
  });

  const insert = (files: File[]) => uploads.insert(files, {
    type: 'text', from: 1, to: 1, revision: 0
  } as unknown as Parameters<RichMediaUploads['insert']>[1]);

  const preparedNames = () => prepare.mock.calls.map(([file]) => file.name);

  return {cancel, document, editor, insert, preparedNames, upload, uploadIds, uploads};
}

afterEach(() => {
  prepare.mockReset();
  vi.restoreAllMocks();
});

test('a retry leaves an item that is still preparing to its own run', async() => {
  const {insert, preparedNames, upload, uploadIds, uploads} = setup();
  const slow = deferredPromise<SendFileDetails>();
  prepare.mockImplementation(async(file) => file.name === 'slow.jpg' ? slow : details(file));

  expect(await insert([image('fast.jpg'), image('slow.jpg')])).toBe(true);
  // The grouped item fails while its sibling is still being prepared.
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  expect(preparedNames()).toEqual(['fast.jpg', 'slow.jpg']);

  uploads.handleAction('retry', uploadIds[0]);
  await Promise.resolve();

  // Only the failed item is retried: preparing is not a claim of ownership, so
  // a second upload of the sibling would duplicate the file.
  expect(preparedNames().filter((name) => name === 'slow.jpg')).toHaveLength(1);
  expect(preparedNames().filter((name) => name === 'fast.jpg')).toHaveLength(2);

  slow.resolve(details(image('slow.jpg')));
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
  expect(preparedNames().filter((name) => name === 'slow.jpg')).toHaveLength(1);

  uploads.destroy();
});

test('a cancelled upload waits in history and starts over when Undo brings it back', async() => {
  const {cancel, document, editor, insert, upload, uploadIds, uploads} = setup();
  const photo = (id: string) => ({type: 'photo', photo: {_: 'photo', id}}) as UploadedRichMessageMedia;
  const cancelled = deferredPromise<UploadedRichMessageMedia>();
  prepare.mockImplementation(async(file) => details(file));
  upload.mockReturnValueOnce(cancelled).mockResolvedValueOnce(photo('2'));

  expect(await insert([image('photo.jpg')])).toBe(true);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  const [uploadId] = uploadIds;

  uploads.handleAction('remove', uploadId);
  expect(cancel).toHaveBeenCalledOnce();
  expect(editor.cancelRichMediaUpload).toHaveBeenCalledWith(uploadId);
  expect(editor.removeRichMediaUpload).not.toHaveBeenCalled();
  uploads.reconcile();
  expect(uploads.pendingTasks).toBe(1);

  // The transfer that was cancelled must not complete the restored media.
  cancelled.resolve(photo('1'));
  await Promise.resolve();
  await Promise.resolve();

  // Undo.
  document.pending.push(uploadId);
  document.history = [];
  uploads.reconcile();
  await vi.waitFor(() => expect(editor.completeRichMediaUpload).toHaveBeenCalledOnce());
  expect(editor.completeRichMediaUpload).toHaveBeenCalledWith(uploadId, [photo('2')]);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(uploads.pendingTasks).toBe(0);
});

test('a cancelled upload is released once history no longer holds it', async() => {
  const {cancel, document, insert, upload, uploadIds, uploads} = setup();
  prepare.mockImplementation(async(file) => details(file));
  upload.mockReturnValueOnce(new Promise(() => {}));

  expect(await insert([image('photo.jpg')])).toBe(true);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledOnce());
  uploads.handleAction('remove', uploadIds[0]);
  uploads.reconcile();
  expect(uploads.pendingTasks).toBe(1);

  document.history = [];
  uploads.reconcile();
  expect(uploads.pendingTasks).toBe(0);
  expect(cancel).toHaveBeenCalledOnce();
});
