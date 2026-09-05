import {createEffect, createSignal, onCleanup, onMount} from 'solid-js';
import type {JSX} from 'solid-js';
import type {Message, RichMessage} from '@layer';

const translationMocks = vi.hoisted(() => ({
  translateText: vi.fn(),
  translateRichMessage: vi.fn(),
  summarizeText: vi.fn(),
  processMessageForTranslation: vi.fn(),
  richMessageMounted: vi.fn(),
  richMessageDisposed: vi.fn(),
  translationEnabled: (() => true) as () => boolean
}));

vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: (props: {children: JSX.Element}) => props.children
}));

vi.mock('@components/chat/bubbles/richMessage', () => ({
  RichMessageBubble: (props: {
    richMessage: () => RichMessage,
    sourceRevision: () => number,
    phase: () => string,
    revealCoordinator?: import('@components/chat/bubbleParts/solidMessageText').MessageTextRevealCoordinator
  }) => {
    onMount(translationMocks.richMessageMounted);
    onCleanup(translationMocks.richMessageDisposed);
    const text = () => {
      const block = props.richMessage().blocks[0];
      return block && 'text' in block && block.text._ === 'textPlain' ? block.text.text : '';
    };
    const leaf = props.revealCoordinator?.registerLeaf();
    let element: HTMLElement;
    if(leaf) {
      createEffect(() => leaf.update({
        _: 'textWithEntities',
        text: text(),
        entities: []
      }, element));
      onCleanup(leaf.dispose);
    }
    return (
      <section
        ref={element}
        data-rich-message=""
        data-rich-block={props.richMessage().blocks[0]?._}
        data-source-revision={props.sourceRevision()}
        data-phase={props.phase()}
      >
        {text()}
      </section>
    );
  }
}));

vi.mock('@lib/richTextProcessor/wrapRichText', () => ({
  default: (text: string) => {
    const fragment = document.createDocumentFragment();
    fragment.append(text);
    return fragment;
  }
}));

vi.mock('@hooks/usePeerTranslation', () => ({
  default: () => ({language: () => 'ru', enabled: () => translationMocks.translationEnabled()})
}));
vi.mock('@stores/peerLanguage', () => ({
  getMessageTranslationSourceToken: () => 'source-token',
  processMessageForTranslation: translationMocks.processMessageForTranslation
}));
vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      acknowledged: {
        appTranslationsManager: {
          translateText: translationMocks.translateText,
          translateRichMessage: translationMocks.translateRichMessage,
          summarizeText: translationMocks.summarizeText
        }
      }
    }
  }
}));

let createSolidMessageBody: typeof import('@components/chat/bubbleParts/solidMessageBody')['createSolidMessageBody'];
let makeSolidMessageBodySnapshot: typeof import('@components/chat/bubbleParts/solidMessageBody')['makeSolidMessageBodySnapshot'];
type SolidMessageBodyController = import('@components/chat/bubbleParts/solidMessageBody').SolidMessageBodyController;
let setTranslationEnabled: (enabled: boolean) => void;

beforeAll(async() => {
  const [translationEnabled, setEnabled] = createSignal(true);
  translationMocks.translationEnabled = translationEnabled;
  setTranslationEnabled = setEnabled;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  ({createSolidMessageBody, makeSolidMessageBodySnapshot} =
    await import('@components/chat/bubbleParts/solidMessageBody'));
});

const peerId = 10 as PeerId;

function richMessage(value: string): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockParagraph', text: {_: 'textPlain', text: value}}],
    photos: [],
    documents: []
  };
}

function richHeadingMessage(value: string): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{_: 'pageBlockHeader', text: {_: 'textPlain', text: value}}],
    photos: [],
    documents: []
  };
}

function mediaOnlyRichMessage(): RichMessage {
  return {
    _: 'richMessage',
    pFlags: {},
    blocks: [{
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: 1,
      caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
    }],
    photos: [],
    documents: []
  };
}

function message(options: {
  text: string,
  mid?: number,
  streaming?: boolean,
  rich?: RichMessage
}): Message.message {
  const mid = options.mid ?? 100;
  return {
    _: 'message',
    pFlags: options.streaming ? {currentlyTyping: true} : {},
    id: mid,
    mid,
    peer_id: {_: 'peerUser', user_id: peerId},
    peerId,
    date: 1,
    message: options.text,
    rich_message: options.rich
  };
}

function textRoot(host: HTMLElement) {
  return host.querySelector('[data-source-revision]') as HTMLElement;
}

function richRoot(host: HTMLElement) {
  return host.querySelector('[data-rich-message]') as HTMLElement;
}

describe('createSolidMessageBody', () => {
  let controller: SolidMessageBodyController;
  let host: HTMLElement;

  afterEach(() => {
    controller?.dispose();
    host?.remove();
    setTranslationEnabled(true);
    vi.clearAllMocks();
  });

  test('keeps the host and plain-text root through appends, rewrites and stale revisions', async() => {
    host = document.createElement('div');
    document.body.append(host);
    const initialMessage = message({text: 'hel', streaming: true});
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(initialMessage, 1),
      {reducedMotion: () => true}
    );
    await Promise.resolve();

    const stableHost = controller.element;
    const stableTextRoot = textRoot(host);
    expect(stableHost).toBe(host);
    expect(stableTextRoot.textContent).toContain('hel');

    expect(controller.update(makeSolidMessageBodySnapshot(
      message({text: 'hello', streaming: true}),
      2
    ))).toBe(true);
    await Promise.resolve();

    expect(controller.element).toBe(stableHost);
    expect(textRoot(host)).toBe(stableTextRoot);
    expect(stableTextRoot.textContent).toContain('hello');

    expect(controller.update(makeSolidMessageBodySnapshot(
      message({text: 'help', streaming: true}),
      3
    ))).toBe(true);
    await Promise.resolve();

    expect(textRoot(host)).toBe(stableTextRoot);
    expect(stableTextRoot.textContent).toContain('help');

    const beforeStaleUpdate = host.textContent;
    expect(controller.update(makeSolidMessageBodySnapshot(
      message({text: 'stale', streaming: true}),
      2
    ))).toBe(false);
    await Promise.resolve();

    expect(controller.getSnapshot().sourceRevision).toBe(3);
    expect(textRoot(host)).toBe(stableTextRoot);
    expect(host.textContent).toBe(beforeStaleUpdate);
  });

  test('keeps rich and plain roots stable across rich revisions and finalization', async() => {
    host = document.createElement('div');
    document.body.append(host);
    const revealPhases: string[] = [];
    const finalizedPhases: string[] = [];
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: 'draft',
        streaming: true,
        rich: richMessage('step one')
      }), 10),
      {
        reducedMotion: () => true,
        onReveal: ({phase}) => revealPhases.push(phase),
        onFinalized: ({phase}) => finalizedPhases.push(phase)
      }
    );
    await Promise.resolve();

    const stableHost = controller.element;
    const stableTextRoot = textRoot(host);
    const stableRichRoot = richRoot(host);
    expect(stableTextRoot.textContent).toBe('');
    expect(stableRichRoot.textContent).toBe('step one');
    expect(stableRichRoot.dataset.phase).toBe('streaming');

    expect(controller.update(makeSolidMessageBodySnapshot(message({
      text: 'draft extended',
      streaming: true,
      rich: richMessage('step one and two')
    }), 11))).toBe(true);
    await Promise.resolve();

    expect(controller.element).toBe(stableHost);
    expect(textRoot(host)).toBe(stableTextRoot);
    expect(richRoot(host)).toBe(stableRichRoot);
    expect(stableRichRoot.textContent).toBe('step one and two');
    expect(stableRichRoot.dataset.sourceRevision).toBe('11');

    expect(controller.finalize(message({
      text: 'final answer',
      mid: 777,
      rich: richMessage('final rich answer')
    }), 12)).toBe(true);
    await Promise.resolve();

    expect(controller.element).toBe(stableHost);
    expect(textRoot(host)).toBe(stableTextRoot);
    expect(richRoot(host)).toBe(stableRichRoot);
    expect(stableTextRoot.textContent).toBe('');
    expect(stableRichRoot.textContent).toBe('final rich answer');
    expect(stableRichRoot.dataset.phase).toBe('final');
    expect(controller.getSnapshot()).toMatchObject({
      sourceRevision: 12,
      phase: 'final',
      message: {mid: 777}
    });
    expect(revealPhases).toContain('finalizing');
    expect(revealPhases[revealPhases.length - 1]).toBe('final');
    expect(finalizedPhases).toEqual(['final']);

    expect(controller.update(makeSolidMessageBodySnapshot(message({
      text: 'late final',
      rich: richMessage('late rich')
    }), 11, 'final'))).toBe(false);
    expect(textRoot(host)).toBe(stableTextRoot);
    expect(richRoot(host)).toBe(stableRichRoot);
    expect(stableRichRoot.textContent).toBe('final rich answer');
  });

  test('does not flatten a rich block tree during a streaming revision', async() => {
    const streamingRichMessage = richMessage('streaming source');
    Object.defineProperty(streamingRichMessage.blocks, Symbol.iterator, {
      configurable: true,
      value: () => {
        throw new Error('streaming rich blocks must not be flattened');
      }
    });

    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        streaming: true,
        rich: streamingRichMessage
      }), 19),
      {
        reducedMotion: () => true,
        translation: {enabled: true}
      }
    );
    await Promise.resolve();

    expect(richRoot(host).textContent).toBe('streaming source');
    expect(translationMocks.processMessageForTranslation).not.toHaveBeenCalled();
  });

  test('starts rich-only translation while finalizing and commits it only after rich catch-up', async() => {
    let resolveResult: (value: RichMessage) => void;
    const result = new Promise<RichMessage>((resolve) => {resolveResult = resolve;});
    translationMocks.translateRichMessage.mockResolvedValue({cached: false, result});
    translationMocks.processMessageForTranslation.mockResolvedValue(undefined);
    const [reducedMotion, setReducedMotion] = createSignal(false);

    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        streaming: true,
        rich: richMessage('streamed source')
      }), 20),
      {
        reducedMotion,
        translation: {enabled: true}
      }
    );
    await Promise.resolve();

    const stableRichRoot = richRoot(host);
    expect(translationMocks.translateRichMessage).not.toHaveBeenCalled();
    expect(translationMocks.processMessageForTranslation).not.toHaveBeenCalled();
    expect(controller.finalize(message({
      text: '',
      mid: 999,
      rich: richMessage('final rich source')
    }), 21)).toBe(true);
    await Promise.resolve();

    expect(controller.getSnapshot().phase).toBe('finalizing');
    expect(textRoot(host).textContent).toBe('');
    expect(translationMocks.translateRichMessage).toHaveBeenCalledWith({
      peerId,
      mid: 999,
      lang: 'ru'
    });
    expect(translationMocks.translateText).not.toHaveBeenCalled();

    resolveResult(richHeadingMessage('перевод'));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.textContent).not.toContain('перевод');
    expect(richRoot(host)).toBe(stableRichRoot);

    setReducedMotion(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(controller.getSnapshot().phase).toBe('final');
    expect(host.textContent).toContain('перевод');
    expect(richRoot(host)).toBe(stableRichRoot);
    expect(stableRichRoot.dataset.richBlock).toBe('pageBlockHeader');
    expect(stableRichRoot.isConnected).toBe(true);
  });

  test('unmounts the original rich tree while a text summary is displayed', async() => {
    translationMocks.processMessageForTranslation.mockResolvedValue(undefined);
    translationMocks.summarizeText.mockResolvedValue({
      cached: true,
      result: Promise.resolve({
        _: 'textWithEntities',
        text: 'краткое содержание',
        entities: []
      })
    });
    translationMocks.translateRichMessage.mockResolvedValue({
      cached: false,
      result: new Promise(() => {})
    });
    const [summarizing, setSummarizing] = createSignal(true);

    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        mid: 703,
        rich: richMessage('large original rich tree')
      }), 35),
      {
        reducedMotion: () => true,
        translation: {enabled: true, summarizing}
      }
    );

    await vi.waitFor(() => expect(host.textContent).toContain('краткое содержание'));
    expect(translationMocks.summarizeText).toHaveBeenCalledWith({
      peerId,
      mid: 703,
      lang: 'ru'
    });
    expect(richRoot(host)).toBeNull();
    expect(translationMocks.richMessageMounted).toHaveBeenCalledOnce();
    expect(translationMocks.richMessageDisposed).toHaveBeenCalledOnce();

    setSummarizing(false);
    await vi.waitFor(() => expect(richRoot(host)).not.toBeNull());
    expect(richRoot(host).textContent).toContain('large original rich tree');
    expect(translationMocks.richMessageMounted).toHaveBeenCalledTimes(2);
    expect(translationMocks.richMessageDisposed).toHaveBeenCalledOnce();
  });

  test('detects a cold peer before translation becomes enabled without duplicating detection', async() => {
    setTranslationEnabled(false);
    translationMocks.processMessageForTranslation.mockResolvedValue(undefined);
    translationMocks.translateRichMessage.mockResolvedValue({
      cached: true,
      result: Promise.resolve(richHeadingMessage('detected translation'))
    });

    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: 'compact fallback summary',
        mid: 701,
        rich: richMessage('cold source')
      }), 32),
      {
        reducedMotion: () => true,
        translation: {enabled: true}
      }
    );

    await vi.waitFor(() => expect(translationMocks.processMessageForTranslation).toHaveBeenCalledOnce());
    expect(translationMocks.processMessageForTranslation).toHaveBeenCalledWith(peerId, 701, {
      sourceText: 'cold source',
      sourceToken: 'source-token'
    });
    expect(translationMocks.translateRichMessage).not.toHaveBeenCalled();

    setTranslationEnabled(true);
    await vi.waitFor(() => expect(translationMocks.translateRichMessage).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(host.textContent).toContain('detected translation'));
    expect(translationMocks.processMessageForTranslation).toHaveBeenCalledOnce();
  });

  test('does not detect language or request translation for a temporary message id', async() => {
    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        mid: 701.5,
        rich: richMessage('temporary source')
      }), 33),
      {
        reducedMotion: () => true,
        translation: {enabled: true}
      }
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(translationMocks.processMessageForTranslation).not.toHaveBeenCalled();
    expect(translationMocks.translateRichMessage).not.toHaveBeenCalled();
    expect(host.textContent).toContain('temporary source');
  });

  test('does not request translation for media-only rich fallback labels', async() => {
    translationMocks.processMessageForTranslation.mockResolvedValue(undefined);
    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        mid: 702,
        rich: mediaOnlyRichMessage()
      }), 34),
      {
        reducedMotion: () => true,
        translation: {enabled: true}
      }
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(translationMocks.processMessageForTranslation).toHaveBeenCalledWith(peerId, 702, {
      sourceText: '',
      sourceToken: 'source-token'
    });
    expect(translationMocks.translateRichMessage).not.toHaveBeenCalled();
  });

  test('ignores a rich translation that resolves after a newer source revision', async() => {
    let resolveFirst: (value: RichMessage) => void;
    let resolveSecond: (value: RichMessage) => void;
    const firstResult = new Promise<RichMessage>((resolve) => {resolveFirst = resolve;});
    const secondResult = new Promise<RichMessage>((resolve) => {resolveSecond = resolve;});
    translationMocks.translateRichMessage
    .mockResolvedValueOnce({cached: false, result: firstResult})
    .mockResolvedValueOnce({cached: false, result: secondResult});
    translationMocks.processMessageForTranslation.mockResolvedValue(undefined);

    host = document.createElement('div');
    document.body.append(host);
    controller = createSolidMessageBody(
      host,
      makeSolidMessageBodySnapshot(message({
        text: '',
        mid: 700,
        rich: richMessage('old source')
      }), 30),
      {
        reducedMotion: () => true,
        translation: {enabled: true}
      }
    );
    await vi.waitFor(() => expect(translationMocks.translateRichMessage).toHaveBeenCalledTimes(1));

    expect(controller.update(makeSolidMessageBodySnapshot(message({
      text: '',
      mid: 700,
      rich: richMessage('edited source')
    }), 31))).toBe(true);
    await vi.waitFor(() => expect(translationMocks.translateRichMessage).toHaveBeenCalledTimes(2));

    resolveFirst(richHeadingMessage('stale translation'));
    await Promise.resolve();
    await Promise.resolve();
    expect(host.textContent).not.toContain('stale translation');
    expect(host.textContent).toContain('edited source');

    resolveSecond(richHeadingMessage('current translation'));
    await vi.waitFor(() => expect(host.textContent).toContain('current translation'));
    expect(richRoot(host).dataset.richBlock).toBe('pageBlockHeader');
  });
});
