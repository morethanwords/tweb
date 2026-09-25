const apiManagerProxyMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  invokeVoid: vi.fn()
}));

vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@environment/videoSupport', () => ({IS_MOV_SUPPORTED: false}));
vi.mock('@lib/apiManagerProxy', () => ({default: apiManagerProxyMocks}));

import prepareRichMediaUpload from '@components/chat/inputEditor/prepareRichMediaUpload';

let createObjectURL: ReturnType<typeof vi.spyOn>;
let revokeObjectURL: ReturnType<typeof vi.spyOn>;

function mockAudioMetadata(duration: number, eventName: 'error' | 'loadedmetadata') {
  const createElement = document.createElement.bind(document);
  return vi.spyOn(document, 'createElement').mockImplementation((
    tagName: string,
    options?: ElementCreationOptions
  ) => {
    const element = createElement(tagName, options);
    if(tagName.toLowerCase() !== 'audio') return element;
    Object.defineProperty(element, 'duration', {configurable: true, value: duration});
    vi.spyOn(element as HTMLAudioElement, 'load').mockImplementation(() => {});
    queueMicrotask(() => element.dispatchEvent(new Event(eventName)));
    return element;
  });
}

describe('rich-message media preparation', () => {
  beforeEach(() => {
    createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rich-audio');
    revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  test('prepares a supported audio file even when only metadata is needed', async() => {
    mockAudioMetadata(42.9, 'loadedmetadata');
    const file = new File(['audio'], 'track.mp3', {type: 'audio/mpeg'});

    await expect(prepareRichMediaUpload(file)).resolves.toMatchObject({
      file,
      duration: 42
    });
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rich-audio');

    const vendorFile = new File(['audio'], 'track.opus', {
      type: 'application/x-custom-audio'
    });
    const preparedVendorFile = await prepareRichMediaUpload(vendorFile);
    expect(preparedVendorFile.file).not.toBe(vendorFile);
    expect((preparedVendorFile.file as File).type).toBe('audio/ogg');
    expect((preparedVendorFile.file as File).name).toBe(vendorFile.name);
    expect(createObjectURL).toHaveBeenLastCalledWith(preparedVendorFile.file);
  });

  test('uploads an accepted audio file with zero duration when the browser cannot decode it', async() => {
    mockAudioMetadata(Number.NaN, 'error');
    const file = new File(['audio'], 'track.flac', {type: 'audio/flac'});

    await expect(prepareRichMediaUpload(file)).resolves.toMatchObject({
      file,
      duration: 0
    });
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:rich-audio');
  });

  test('rejects a generic document before creating a preview URL', async() => {
    const file = new File(['pdf'], 'notes.pdf', {type: 'application/pdf'});

    await expect(prepareRichMediaUpload(file)).rejects.toThrow(
      'RICH_MESSAGE_MEDIA_TYPE_UNSUPPORTED'
    );
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
