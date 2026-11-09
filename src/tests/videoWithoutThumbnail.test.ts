import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import {getMiddleware} from '@helpers/middleware';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {ChatType} from '@components/chat/chatType';
import '@helpers/peerIdPolyfill';
import type {MyDocument} from '@appManagers/appDocsManager';
import type {Message} from '@layer';

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let wrapVideo: typeof import('@components/wrappers/video').default;
let clickEventName: string;
let downloadMediaURL: ReturnType<typeof vi.spyOn>;
const openMedia = vi.fn();
const setSearchContext = vi.fn();

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  wrapVideo = (await import('@components/wrappers/video')).default;
  clickEventName = (await import('@helpers/dom/clickEvent')).CLICK_EVENT_NAME;
  downloadMediaURL = vi.spyOn((await import('@lib/appDownloadManager')).default, 'downloadMediaURL');
  registerHotReloadGuard({AppMediaViewer: class {
    setSearchContext = setSearchContext.mockReturnValue(this);
    openMedia = openMedia;
  } as any});
}, LOAD_CHAT_BUBBLES_TIMEOUT);

beforeEach(() => {
  openMedia.mockClear();
  setSearchContext.mockClear();
  downloadMediaURL.mockClear();
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
});

async function makePreview(options: {size?: number, canAutoplay?: boolean, onlyPreview?: boolean, type?: 'video' | 'gif'} = {}) {
  const doc = {
    _: 'document',
    id: '1',
    mime_type: 'video/mp4',
    size: options.size ?? 410078932,
    type: options.type ?? 'video',
    w: 1920,
    h: 1080,
    duration: 1420,
    supportsStreaming: true
  } as MyDocument;
  const message = {
    _: 'message',
    mid: 1,
    peerId: 1,
    pFlags: {},
    message: '',
    media: {_: 'messageMediaDocument', pFlags: {}, document: doc}
  } as Message.message;
  const bubble = document.createElement('div');
  bubble.className = 'bubble video';
  bubble.dataset.mid = '1';
  bubble.dataset.peerId = '1';
  const attachment = document.createElement('div');
  attachment.className = 'attachment';
  bubble.append(attachment);
  document.body.append(bubble);

  await wrapVideo({
    doc,
    message,
    container: attachment,
    boxWidth: 480,
    boxHeight: 480,
    canAutoplay: options.canAutoplay,
    onlyPreview: options.onlyPreview,
    middleware: getMiddleware().get()
  });

  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {type: ChatType.Chat, peerId: 1, getMessage: () => message},
    skippedMids: new Set(),
    getRenderedHistory: () => ['1_1'],
    getBubble: () => bubble,
    log: vi.fn()
  });
  const click = (element: HTMLElement) => {
    const event = new MouseEvent('click', {bubbles: true, cancelable: true});
    return harness.checkTargetForMediaViewer(element, event);
  };
  return {bubble, attachment, message, harness, click};
}

describe('a non-autoplay video without a thumbnail', () => {
  test.each(['ltr', 'rtl'])('opens the viewer from its empty attachment in %s', async(dir) => {
    document.documentElement.dir = dir;
    const {attachment, message, click} = await makePreview();
    expect(attachment.querySelector('img, video, canvas, .preloader-container')).toBeNull();
    expect(attachment.querySelector('.video-play')).not.toBeNull();
    expect(openMedia).not.toHaveBeenCalled();
    expect(downloadMediaURL).not.toHaveBeenCalled();

    expect(click(attachment)).toBe(true);
    expect(openMedia).toHaveBeenCalledWith(expect.objectContaining({message, target: attachment}));
  });

  test('opens from a click targeted at the native play button', async() => {
    const {attachment, message, click} = await makePreview();
    attachment.addEventListener('click', (event) => click(event.target as HTMLElement));

    // Native buttons send their click to the button itself, unlike pointer hits through the overlay.
    attachment.querySelector<HTMLButtonElement>('.video-play').click();

    expect(openMedia).toHaveBeenCalledOnce();
    expect(openMedia).toHaveBeenCalledWith(expect.objectContaining({message}));
  });

  test('opens from the duration label too', async() => {
    const {attachment, click} = await makePreview();
    expect(click(attachment.querySelector('.video-time'))).toBe(true);
    expect(openMedia).toHaveBeenCalledOnce();
  });

  test('hands an upload preloader the click instead of opening the viewer', async() => {
    const {attachment, click} = await makePreview();
    const preloader = document.createElement('div');
    preloader.className = 'preloader-container';
    const onClick = vi.fn();
    preloader.addEventListener(clickEventName, onClick);
    attachment.append(preloader);

    click(attachment);

    expect(onClick).toHaveBeenCalledOnce();
    expect(openMedia).not.toHaveBeenCalled();
  });

  test('does not turn the bubble or its caption into a viewer trigger', async() => {
    const {bubble, click} = await makePreview();
    const caption = document.createElement('span');
    bubble.append(caption);
    expect(click(caption)).toBeUndefined();
    expect(click(bubble)).toBeUndefined();
    expect(openMedia).not.toHaveBeenCalled();
  });

  test('leaves log messages read-only', async() => {
    const {attachment, harness, click} = await makePreview();
    harness.chat.type = ChatType.Logs;
    expect(click(attachment)).toBeUndefined();
    expect(openMedia).not.toHaveBeenCalled();
  });

  test('also opens a small video when autoplay is disabled', async() => {
    const {attachment, click} = await makePreview({size: 1024, canAutoplay: false});
    expect(click(attachment)).toBe(true);
    expect(openMedia).toHaveBeenCalledOnce();
  });

  test('does not change the GIF preview path', async() => {
    const {attachment, click} = await makePreview({type: 'gif', canAutoplay: false, onlyPreview: true});
    expect(click(attachment)).toBeUndefined();
    expect(openMedia).not.toHaveBeenCalled();
  });

  test('does not change a preview-only video that allows autoplay', async() => {
    const {attachment, click} = await makePreview({canAutoplay: true, onlyPreview: true});
    expect(click(attachment)).toBeUndefined();
    expect(openMedia).not.toHaveBeenCalled();
  });

  test('keeps the existing image target when a thumbnail is present', async() => {
    const {attachment, message, click} = await makePreview();
    const image = document.createElement('img');
    attachment.append(image);
    expect(click(image)).toBe(true);
    expect(openMedia).toHaveBeenCalledWith(expect.objectContaining({message, target: image}));
  });
});
