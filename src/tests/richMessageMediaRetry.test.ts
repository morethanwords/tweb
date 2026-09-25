import RichMediaUploads from '@components/richMessageInput/media';
import type {ChatInputEditor} from '@components/chat/inputEditor/types';
import type {SendFileDetails} from '@appManagers/appMessagesManager';
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
  const editor = {
    captureSelection: () => ({revision: 0}),
    beginRichMediaUploads: vi.fn((options: {id: string}[]) => {
      options.forEach(({id}) => uploadIds.push(id));
      return true;
    }),
    removeRichMediaUpload: vi.fn(() => true),
    updateRichMediaUpload: vi.fn(() => true)
  };

  const upload = vi.fn(async(): Promise<never> => {throw new Error('upload rejected');});
  const uploads = new RichMediaUploads({
    getEditor: () => editor as unknown as ChatInputEditor,
    isExpanded: () => true,
    services: {
      capture: () => ({
        authorize: async() => true,
        cancel: () => {},
        isCurrent: () => true,
        upload
      })
    }
  });

  const insert = (files: File[]) => uploads.insert(files, {
    type: 'text', from: 1, to: 1, revision: 0
  } as unknown as Parameters<RichMediaUploads['insert']>[1]);

  const preparedNames = () => prepare.mock.calls.map(([file]) => file.name);

  return {editor, insert, preparedNames, upload, uploadIds, uploads};
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
