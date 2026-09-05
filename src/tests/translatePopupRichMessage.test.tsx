import {describe, expect, test, vi} from 'vitest';
import type {JSX} from 'solid-js';
import type {Message, RichMessage} from '@layer';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

/**
 * A rich message keeps its content in `rich_message` and leaves `message` empty, so the
 * translate card has to reach for the rich endpoint instead of sending an empty string to the
 * plain one. Desktop only swaps the rich page inside the bubble and never offers this card for
 * a rich message; offering it here is a deliberate difference, which is why these expectations
 * have no upstream counterpart to check against.
 */

const mocks = vi.hoisted(() => ({
  translateText: vi.fn(),
  translateRichMessage: vi.fn(),
  wrapRichText: vi.fn((text: string) => document.createTextNode(text))
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    wrapRichText: mocks.wrapRichText,
    rootScope: {
      managers: {
        appTranslationsManager: {
          translateText: mocks.translateText,
          translateRichMessage: mocks.translateRichMessage
        }
      }
    }
  })
}));

vi.mock('@components/scrollable2', () => ({
  default: (props: {children: JSX.Element}) => <div>{props.children}</div>
}));

vi.mock('@components/skeleton', () => ({
  Skeleton: {Div: () => <div data-skeleton="" />}
}));

vi.mock('@components/buttonIconTsx', () => ({
  ButtonIconTsx: () => <button type="button" />
}));

vi.mock('@components/popups/previewCard', () => ({
  previewStyles: new Proxy({}, {get: (_target, key) => String(key)})
}));

vi.mock('@components/toast', () => ({toastNew: vi.fn()}));

// Constructed at import time and would immediately fetch its worker scripts.
vi.mock('@lib/apiManagerProxy', () => ({
  default: new Proxy({}, {get: () => () => {}})
}));

vi.mock('solid-transition-group', () => ({
  Transition: (props: {children: JSX.Element}) => props.children
}));

let Result: typeof import('@components/popups/translate/parts')['Result'];

beforeAll(async() => {
  // `webpSupport` probes a canvas at import time and jsdom returns null for toDataURL.
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('Worker', class {
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    terminate() {}
  });
  ({Result} = await import('@components/popups/translate/parts'));
});

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const peerId = 10 as PeerId;

function message(rich?: RichMessage): Message.message {
  return {
    _: 'message',
    pFlags: {},
    id: 5,
    mid: 5,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    date: 1,
    message: rich ? '' : 'plain source',
    rich_message: rich
  } as Message.message;
}

function richMessage(heading: string, paragraph: string): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [
      {_: 'pageBlockHeading1', text: {_: 'textPlain', text: heading}},
      {_: 'pageBlockParagraph', text: {_: 'textPlain', text: paragraph}}
    ],
    photos: [],
    documents: []
  };
}

function mount(msg: Message.message) {
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => (
    <Result title={<span />} language={'en' as TranslatableLanguageISO} message={msg} />
  ), host);
  return {host, dispose: () => {dispose(); host.remove();}};
}

describe('translate card source selection', () => {
  afterEach(() => {
    mocks.translateText.mockReset();
    mocks.translateRichMessage.mockReset();
    mocks.wrapRichText.mockClear();
  });

  test('translates a rich message through the rich endpoint and renders its blocks', async() => {
    mocks.translateRichMessage.mockResolvedValue(richMessage('Fenwick Tree', 'A data structure.'));
    const {host, dispose} = mount(message(richMessage('Дерево Фенвика', 'Структура данных.')));

    await vi.waitFor(() => expect(mocks.wrapRichText).toHaveBeenCalled());

    expect(mocks.translateRichMessage).toHaveBeenCalledWith({peerId, mid: 5, lang: 'en'});
    expect(mocks.translateText).not.toHaveBeenCalled();

    // The card is a compact side-by-side, so the blocks arrive flattened — but they must all
    // arrive, not just the first one.
    const calls = mocks.wrapRichText.mock.calls;
    const rendered = calls[calls.length - 1][0] as string;
    expect(rendered).toContain('Fenwick Tree');
    expect(rendered).toContain('A data structure.');

    dispose();
    expect(host.isConnected).toBe(false);
  });

  test('keeps a plain message on the plain endpoint', async() => {
    mocks.translateText.mockResolvedValue({_: 'textWithEntities', text: 'plain result', entities: []});
    const {dispose} = mount(message());

    await vi.waitFor(() => expect(mocks.wrapRichText).toHaveBeenCalled());

    expect(mocks.translateText).toHaveBeenCalledWith({peerId, mid: 5, lang: 'en'});
    expect(mocks.translateRichMessage).not.toHaveBeenCalled();
    const calls = mocks.wrapRichText.mock.calls;
    expect(calls[calls.length - 1][0]).toBe('plain result');

    dispose();
  });
});
