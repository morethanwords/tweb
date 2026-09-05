import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import type {JSX} from 'solid-js';
import type {Message, Page, RichMessage} from '@layer';

const richMessageMocks = vi.hoisted(() => ({
  getRichMessage: vi.fn(),
  openInstantView: vi.fn()
}));

vi.mock('@components/browser', () => ({
  openInstantViewInAppBrowser: richMessageMocks.openInstantView
}));

vi.mock('@components/instantView', () => ({
  InstantViewBlocks: (props: {afterBlocks?: JSX.Element}) => (
    <div data-instant-view-blocks="">{props.afterBlocks}</div>
  ),
  hasInstantViewDisabledNavigation(options?: {noLinks?: boolean, noNavigation?: boolean}) {
    return !!(options?.noNavigation || options?.noLinks);
  },
  readReactiveInstantViewValue<T>(value: T | (() => T)) {
    return typeof value === 'function' ? (value as () => T)() : value;
  }
}));

vi.mock('@components/chat/bubbleParts/solidMessageText', () => ({
  MessageTextStreamingTail: () => <span data-streaming-tail="" />
}));

vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: (props: {children: JSX.Element}) => props.children
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    i18n: (key: string) => key,
    rootScope: {
      managers: {
        appMessagesManager: {
          getRichMessage: richMessageMocks.getRichMessage
        }
      }
    }
  })
}));

vi.mock('@lib/richMessage', () => ({
  isRichMessagePart: (richMessage: RichMessage) => !!richMessage.pFlags.part,
  richMessageToPage: (richMessage: RichMessage): Page.page => ({
    _: 'page',
    pFlags: {...richMessage.pFlags},
    url: '',
    blocks: richMessage.blocks,
    photos: richMessage.photos,
    documents: richMessage.documents,
    views: 0
  })
}));

let RichMessageBubble: typeof import('@components/chat/bubbles/richMessage')['RichMessageBubble'];

beforeAll(async() => {
  ({RichMessageBubble} = await import('@components/chat/bubbles/richMessage'));
});

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {promise, resolve, reject};
}

const peerId = 10 as PeerId;

function message(): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: 100,
    mid: 100,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    date: 1,
    message: ''
  };
}

function richMessage(part = true): RichMessage {
  return {
    _: 'richMessage',
    pFlags: part ? {part: true} : {},
    blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'answer'}}],
    photos: [],
    documents: []
  };
}

function page(rich = richMessage()): Page.page {
  return {
    _: 'page',
    pFlags: {...rich.pFlags},
    url: '',
    blocks: rich.blocks,
    photos: rich.photos,
    documents: rich.documents,
    views: 0
  };
}

describe('RichMessageBubble Read More lifecycle', () => {
  afterEach(() => {
    richMessageMocks.getRichMessage.mockReset();
    richMessageMocks.openInstantView.mockReset();
  });

  test('drops an in-flight page when links become disabled and allows a fresh request later', async() => {
    const request = deferred<RichMessage>();
    richMessageMocks.getRichMessage.mockReturnValueOnce(request.promise);
    let navigationDisabled = false;
    const getPolicy = () => ({noNavigation: navigationDisabled});
    const [richTextOptions, setRichTextOptions] = createSignal(getPolicy(), {equals: false});
    const refreshPolicy = () => setRichTextOptions(getPolicy());
    const host = document.createElement('div');
    document.body.append(host);
    const value = richMessage();
    const dispose = render(() => (
      <RichMessageBubble
        message={message()}
        richMessage={value}
        page={page(value)}
        phase="final"
        richTextOptions={richTextOptions}
      />
    ), host);

    const button = host.querySelector('button');
    button.click();
    expect(richMessageMocks.getRichMessage).toHaveBeenCalledTimes(1);

    navigationDisabled = true;
    refreshPolicy();
    await Promise.resolve();
    request.resolve(richMessage(false));
    await Promise.resolve();
    await Promise.resolve();

    expect(richMessageMocks.openInstantView).not.toHaveBeenCalled();
    expect(button.disabled).toBe(true);

    richMessageMocks.getRichMessage.mockResolvedValueOnce(richMessage(false));
    navigationDisabled = false;
    refreshPolicy();
    await Promise.resolve();
    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(richMessageMocks.getRichMessage).toHaveBeenCalledTimes(2);
    expect(richMessageMocks.openInstantView).toHaveBeenCalledTimes(1);

    dispose();
    host.remove();
  });

  test('offers Read More only after streaming ends', async() => {
    const [phase, setPhase] = createSignal<'streaming' | 'final'>('streaming');
    const host = document.createElement('div');
    document.body.append(host);
    const value = richMessage();
    const dispose = render(() => (
      <RichMessageBubble
        message={message()}
        richMessage={value}
        page={page(value)}
        phase={phase}
      />
    ), host);

    // A partial rich message has nothing complete to open yet, and the tail is still growing.
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('[data-streaming-tail]')).toBeNull();

    setPhase('final');
    await Promise.resolve();

    expect(host.querySelector('button')).not.toBeNull();

    dispose();
    host.remove();
  });

  test('drops the cached full page when the source revision advances', async() => {
    const first = richMessage(false);
    const second = richMessage(false);
    richMessageMocks.getRichMessage
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
    const [sourceRevision, setSourceRevision] = createSignal(1);
    const host = document.createElement('div');
    document.body.append(host);
    const value = richMessage();
    const dispose = render(() => (
      <RichMessageBubble
        message={message()}
        richMessage={value}
        page={page(value)}
        phase="final"
        sourceRevision={sourceRevision}
      />
    ), host);

    const button = host.querySelector('button');
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(richMessageMocks.getRichMessage).toHaveBeenCalledTimes(1);

    // A second click on the same revision must reuse the resolved page.
    button.click();
    await Promise.resolve();
    expect(richMessageMocks.getRichMessage).toHaveBeenCalledTimes(1);
    expect(richMessageMocks.openInstantView).toHaveBeenCalledTimes(2);

    // A newer revision invalidates it: the cached page describes older content.
    setSourceRevision(2);
    await Promise.resolve();
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(richMessageMocks.getRichMessage).toHaveBeenCalledTimes(2);
    expect(richMessageMocks.openInstantView).toHaveBeenCalledTimes(3);

    dispose();
    host.remove();
  });

  test('does not publish async page or queued layout work after disposal', async() => {
    const request = deferred<RichMessage>();
    richMessageMocks.getRichMessage.mockReturnValueOnce(request.promise);
    const onTextLayout = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const value = richMessage();
    const dispose = render(() => (
      <RichMessageBubble
        message={message()}
        richMessage={value}
        page={page(value)}
        phase="final"
        onTextLayout={onTextLayout}
      />
    ), host);

    host.querySelector('button').click();
    dispose();
    request.resolve(richMessage(false));
    await Promise.resolve();
    await Promise.resolve();

    expect(richMessageMocks.openInstantView).not.toHaveBeenCalled();
    expect(onTextLayout).not.toHaveBeenCalled();
    host.remove();
  });
});
