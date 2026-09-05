import {batch, createSignal, onMount} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';
import {render} from 'solid-js/web';
import {Message, Page, PageBlock, RichText} from '@layer';
import type {TextRevealFrameScheduler} from '@components/chat/bubbleParts/solidMessageText';

const instantViewMocks = vi.hoisted(() => ({
  openMedia: vi.fn(),
  wrapTelegramRichText: vi.fn(),
  photoMounted: vi.fn(),
  loadTemml: vi.fn(),
  generateStandaloneMessage: vi.fn(),
  scrollSave: vi.fn(),
  scrollRestore: vi.fn(),
  webViewDestroyed: vi.fn(),
  webViews: [] as Array<{
    iframe: HTMLIFrameElement,
    emitResize: (height: number) => void
  }>
}));

let InstantViewBlocks: typeof import('@components/instantView')['InstantViewBlocks'];
let createMessageTextRevealCoordinator:
  typeof import('@components/chat/bubbleParts/solidMessageText').createMessageTextRevealCoordinator;

beforeAll(async() => {
  class IntersectionObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  vi.stubGlobal('CSS', {supports: () => false, escape: (value: string) => value});
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.doMock('@lib/customEmoji/renderer', () => ({
    CustomEmojiRendererElement: {
      create: () => document.createElement('span')
    }
  }));
  vi.doMock('@components/telegramWebView', () => ({
    default: class {
      public iframe = document.createElement('iframe');
      private resizeListener: (event: {height: number}) => void;

      constructor() {
        instantViewMocks.webViews.push(this);
      }

      public addEventListener(type: string, listener: (event: {height: number}) => void) {
        if(type === 'resize_frame') this.resizeListener = listener;
      }

      public emitResize(height: number) {
        this.resizeListener?.({height});
      }

      public onMount() {}

      public destroy() {
        instantViewMocks.webViewDestroyed();
      }
    }
  }));
  vi.doMock('@helpers/scrollSaver', () => ({
    default: class {
      public save() {
        instantViewMocks.scrollSave();
      }

      public restore() {
        instantViewMocks.scrollRestore();
      }
    }
  }));
  vi.doMock('@lib/solidjs/hotReloadGuard', () => ({
    useHotReloadGuard: () => ({
      PhotoTsx: (props: {
        photo?: {id?: number},
        ref?: (element: HTMLDivElement) => void,
        onResult?: () => void,
        onClick?: () => void
      }) => {
        onMount(() => {
          instantViewMocks.photoMounted(props.photo?.id);
          props.onResult?.();
        });
        return (
          <div
            ref={(element) => {
              element.style.width = '100px';
              element.style.height = '100px';
              props.ref?.(element);
            }}
            data-photo-id={props.photo?.id}
            onClick={props.onClick}
          >
            <span />
          </div>
        );
      },
      wrapEmojiText: (value: string) => value,
      rootScope: {
        managers: {
          appMessagesManager: {
            generateStandaloneOutgoingMessage: instantViewMocks.generateStandaloneMessage
          }
        }
      },
      AppMediaViewer: class {
        public setSearchContext() {
          return this;
        }

        public openMedia(options: unknown) {
          instantViewMocks.openMedia(options);
          return this;
        }
      },
      I18n: {format: () => ''}
    })
  }));
  const wrapTelegramRichText = await vi.importActual<typeof import('@lib/richTextProcessor/wrapTelegramRichText')>(
    '@lib/richTextProcessor/wrapTelegramRichText'
  );
  vi.doMock('@lib/richTextProcessor/wrapTelegramRichText', () => ({
    default: (...args: Parameters<typeof wrapTelegramRichText.default>) => {
      instantViewMocks.wrapTelegramRichText(...args);
      return wrapTelegramRichText.default(...args);
    }
  }));
  instantViewMocks.loadTemml.mockResolvedValue(createTemmlRenderer());
  vi.doMock('@helpers/math/loadTemml', () => ({default: instantViewMocks.loadTemml}));
  ({createMessageTextRevealCoordinator} =
    await import('@components/chat/bubbleParts/solidMessageText'));
  ({InstantViewBlocks} = await import('@components/instantView'));
});

const text = (value: string): RichText => ({_: 'textPlain', text: value});
const caption = {
  _: 'pageCaption',
  text: {_: 'textEmpty'},
  credit: {_: 'textEmpty'}
} as const;

function photoBlock(id: number): PageBlock.pageBlockPhoto {
  return {_: 'pageBlockPhoto', pFlags: {}, photo_id: id, caption};
}

function makeMediaPage(ids: number[], collage = false): Page.page {
  const blocks = ids.map(photoBlock);
  return {
    _: 'page',
    pFlags: {},
    url: '',
    blocks: collage ? [{_: 'pageBlockCollage', items: blocks, caption}] : blocks,
    photos: ids.map((id) => ({_: 'photo', id, date: id}) as any),
    documents: [],
    views: 0
  };
}

function makePage(paragraph: string, detailsBody: string): Page.page {
  return {
    _: 'page',
    pFlags: {},
    url: '',
    blocks: [
      {_: 'pageBlockParagraph', text: text(paragraph)},
      {
        _: 'pageBlockDetails',
        pFlags: {},
        title: text('Reasoning'),
        blocks: [{_: 'pageBlockParagraph', text: text(detailsBody)}]
      }
    ],
    photos: [],
    documents: [],
    views: 0
  };
}

function findDetails(container: HTMLElement) {
  const title = Array.from(container.querySelectorAll('div'))
  .find((element) => element.textContent === 'Reasoning');
  return title.parentElement.parentElement;
}

function createTemmlRenderer() {
  return {
    render: (source: string, element: HTMLElement) => element.append(source)
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => resolve = resolvePromise);
  return {promise, resolve: resolve!};
}

function makeStandaloneMessage(): Message.message {
  return {
    _: 'message',
    pFlags: {},
    peer_id: {_: 'peerUser', user_id: 0},
    peerId: 0,
    id: 0,
    mid: 0,
    date: 0,
    message: ''
  };
}

const mathBlockCases: Array<[string, (source: string) => PageBlock]> = [
  ['pageBlockMath', (source) => ({_: 'pageBlockMath', source})],
  ['math preformatted block', (source) => ({
    _: 'pageBlockPreformatted',
    text: text(source),
    language: 'math'
  })]
];

class ManualFrameScheduler implements TextRevealFrameScheduler {
  private callbacks = new Map<number, FrameRequestCallback>();
  private nextId = 0;

  public request = (callback: FrameRequestCallback) => {
    const id = ++this.nextId;
    this.callbacks.set(id, callback);
    return id;
  };

  public cancel = (id: number) => {
    this.callbacks.delete(id);
  };

  public step(time: number) {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback(time));
  }
}

describe('InstantViewBlocks streaming updates', () => {
  beforeEach(() => {
    instantViewMocks.generateStandaloneMessage.mockImplementation(async() => makeStandaloneMessage());
  });

  afterEach(() => {
    instantViewMocks.openMedia.mockReset();
    instantViewMocks.wrapTelegramRichText.mockReset();
    instantViewMocks.photoMounted.mockReset();
    instantViewMocks.loadTemml.mockClear();
    instantViewMocks.generateStandaloneMessage.mockReset();
    instantViewMocks.scrollSave.mockReset();
    instantViewMocks.scrollRestore.mockReset();
    instantViewMocks.webViewDestroyed.mockReset();
    instantViewMocks.webViews.length = 0;
  });

  test('updates rich-text leaves without remounting the root, block or open details state', async() => {
    const [state, setState] = createStore({
      page: makePage('hel', 'step one'),
      revision: 1
    });
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await Promise.resolve();
    const root = container.firstElementChild;
    const paragraph = container.querySelector('p');
    const inlineText = paragraph.firstElementChild;
    const textNode = inlineText.firstChild;
    const details = findDetails(container);
    const summary = details.firstElementChild as HTMLElement;
    const detailsContent = details.children[2] as HTMLElement;

    summary.click();
    const openClass = detailsContent.className;

    batch(() => {
      setState('page', reconcile(makePage('hello', 'step one and two')));
      setState('revision', (revision) => revision + 1);
    });
    await Promise.resolve();

    expect(container.firstElementChild).toBe(root);
    expect(container.querySelector('p')).toBe(paragraph);
    expect(paragraph.firstElementChild).toBe(inlineText);
    expect(inlineText.firstChild).toBe(textNode);
    expect(findDetails(container)).toBe(details);
    expect(paragraph.textContent).toBe('hello');
    expect(details.textContent).toContain('step one and two');
    expect(detailsContent.className).toBe(openClass);

    summary.click();
    expect(detailsContent.className).not.toBe(openClass);

    dispose();
    container.remove();
  });

  test('preserves nested list owners and details state when one item streams', async() => {
    const makeListPage = (tail: string): Page.page => ({
      ...makePage('', ''),
      blocks: [{
        _: 'pageBlockList',
        items: [{
          _: 'pageListItemBlocks',
          pFlags: {},
          blocks: [{
            _: 'pageBlockDetails',
            pFlags: {},
            title: text('Reasoning'),
            blocks: [{_: 'pageBlockParagraph', text: text('stable details')}]
          }]
        }, {
          _: 'pageListItemText',
          pFlags: {},
          text: text(tail)
        }]
      }]
    });
    const [state, setState] = createStore({page: makeListPage('tail-a'), revision: 1});
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    const items = container.querySelectorAll('li');
    const firstItem = items[0];
    const tailItem = items[1];
    const details = findDetails(container);
    const summary = details.firstElementChild as HTMLElement;
    const content = details.children[2] as HTMLElement;
    summary.click();
    const openClass = content.className;

    batch(() => {
      setState('page', reconcile(makeListPage('tail-b')));
      setState('revision', 2);
    });
    await Promise.resolve();

    const currentItems = container.querySelectorAll('li');
    expect(currentItems[0]).toBe(firstItem);
    expect(currentItems[1]).toBe(tailItem);
    expect(findDetails(container)).toBe(details);
    expect(content.className).toBe(openClass);
    expect(tailItem.textContent).toBe('tail-b');
    dispose();
    container.remove();
  });

  test('preserves table row and cell owners while cell text streams', async() => {
    const makeTablePage = (tail: string): Page.page => ({
      ...makePage('', ''),
      blocks: [{
        _: 'pageBlockTable',
        pFlags: {bordered: true},
        title: text('Table'),
        rows: [{
          _: 'pageTableRow',
          cells: [{_: 'pageTableCell', pFlags: {}, text: text('stable')}, {
            _: 'pageTableCell',
            pFlags: {align_right: true},
            text: text(tail)
          }]
        }, {
          _: 'pageTableRow',
          cells: [{_: 'pageTableCell', pFlags: {header: true}, text: text('footer')}]
        }]
      }]
    });
    const [state, setState] = createStore({page: makeTablePage('tail-a'), revision: 1});
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    const rows = Array.from(container.querySelectorAll('tr'));
    const cells = Array.from(container.querySelectorAll('td, th'));
    const tailText = cells[1].firstElementChild;

    batch(() => {
      setState('page', reconcile(makeTablePage('tail-b')));
      setState('revision', 2);
    });
    await Promise.resolve();

    expect(Array.from(container.querySelectorAll('tr'))).toEqual(rows);
    expect(Array.from(container.querySelectorAll('td, th'))).toEqual(cells);
    expect(cells[1].firstElementChild).toBe(tailText);
    expect(cells[1].textContent).toBe('tail-b');
    dispose();
  });

  test('renders an empty rich page safely and updates it in place', async() => {
    const [state, setState] = createStore({
      page: {...makePage('', ''), blocks: []},
      revision: 1
    });
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={state.page}
        sourceRevision={state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await Promise.resolve();
    const root = container.firstElementChild;
    expect(root).toBeTruthy();
    expect(container.querySelector('p')).toBeNull();

    batch(() => {
      setState('page', reconcile(makePage('arrived', 'details')));
      setState('revision', (revision) => revision + 1);
    });
    await Promise.resolve();

    expect(container.firstElementChild).toBe(root);
    expect(container.querySelector('p').textContent).toBe('arrived');

    dispose();
  });

  test('syncs details open state until the user explicitly toggles it', async() => {
    const makeDetailsPage = (open: boolean, body: string): Page.page => {
      const page = makePage('', body);
      const block = page.blocks[1] as Page.page['blocks'][number] & {pFlags: {open?: true}};
      block.pFlags = open ? {open: true} : {};
      return {...page, blocks: [block]};
    };
    const [state, setState] = createStore({page: makeDetailsPage(false, 'one'), revision: 1});
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    const details = findDetails(container);
    const summary = details.firstElementChild as HTMLElement;
    const content = details.children[2] as HTMLElement;
    const closedClass = content.className;

    batch(() => {
      setState('page', reconcile(makeDetailsPage(true, 'two')));
      setState('revision', 2);
    });
    await Promise.resolve();
    expect(content.className).not.toBe(closedClass);

    summary.click();
    expect(content.className).toBe(closedClass);
    batch(() => {
      setState('page', reconcile(makeDetailsPage(true, 'three')));
      setState('revision', 3);
    });
    await Promise.resolve();
    expect(content.className).toBe(closedClass);
    expect(details.textContent).toContain('three');
    dispose();
    container.remove();
  });

  test('keeps a preformatted owner stable while code streams', async() => {
    const makeCodePage = (code: string): Page.page => ({
      ...makePage('', ''),
      blocks: [{_: 'pageBlockPreformatted', text: text(code), language: 'typescript'}]
    });
    const [state, setState] = createStore({page: makeCodePage('const a'), revision: 1});
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await Promise.resolve();
    const owner = container.querySelector('div[data-source-revision]') as HTMLElement;
    expect(owner.textContent).toContain('const a');

    batch(() => {
      setState('page', reconcile(makeCodePage('const answer = 42')));
      setState('revision', 2);
    });
    await Promise.resolve();

    expect(container.querySelector('div[data-source-revision]')).toBe(owner);
    expect(owner.textContent).toContain('const answer = 42');
    dispose();
  });

  test.each(mathBlockCases)('reveals %s through the shared grapheme cursor and reports async layout', async(
    _,
    makeMathBlock
  ) => {
    const family = '👨‍👩‍👧‍👦';
    const [snapshot, setSnapshot] = createSignal<{
      source: string,
      revision: number,
      phase: 'streaming' | 'finalizing' | 'final'
    }>({
      source: `A${family}B`,
      revision: 1,
      phase: 'streaming'
    });
    const scheduler = new ManualFrameScheduler();
    const layouts: Array<{reason: string, revision: number}> = [];
    const finalized: string[] = [];
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => snapshot().phase,
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        finalizingGraphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000,
        onFinalized: ({phase}) => finalized.push(phase)
      });
      const page = (): Page.page => ({
        _: 'page',
        pFlags: {},
        url: '',
        blocks: [makeMathBlock(snapshot().source)],
        photos: [],
        documents: [],
        views: 0
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={page}
          sourceRevision={() => snapshot().revision}
          phase={() => snapshot().phase}
          revealCoordinator={coordinator}
          onTextLayout={({reason, sourceRevision}) => layouts.push({reason, revision: sourceRevision})}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);

    await Promise.resolve();
    await Promise.resolve();
    const latex = container.querySelector<HTMLElement>('[data-source-revision="1"]');
    expect(latex.textContent).toBe('');

    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(latex.textContent).toBe(`A${family}`);
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    // Even a slow stream whose reveal cursor catches up between tokens must
    // stay raw: typesetting every complete intermediate snapshot is O(n²).
    scheduler.step(4);
    await Promise.resolve();
    await Promise.resolve();
    expect(latex.textContent).toBe(`A${family}B`);
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({
      source: `A${family}Be\u0301`,
      revision: 2,
      phase: 'finalizing'
    });
    await Promise.resolve();
    expect(container.querySelector('[data-source-revision="2"]')).toBe(latex);
    scheduler.step(10);
    await Promise.resolve();
    await Promise.resolve();

    expect(latex.textContent).toBe(`A${family}Be\u0301`);
    expect(finalized).toEqual(['final']);
    expect(instantViewMocks.loadTemml).toHaveBeenCalledOnce();
    expect(layouts).toContainEqual({reason: 'resources-ready', revision: 2});
    dispose();
    container.remove();
  });

  test('waits for the coordinator clamp before mutating rewritten block math', async() => {
    const [snapshot, setSnapshot] = createSignal({source: 'x', revision: 1});
    const scheduler = new ManualFrameScheduler();
    const layouts: string[] = [];
    const container = document.createElement('div');
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => 'streaming',
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000
      });
      const page = (): Page.page => ({
        _: 'page',
        pFlags: {},
        url: '',
        blocks: [{_: 'pageBlockMath', source: snapshot().source}],
        photos: [],
        documents: [],
        views: 0
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={page}
          sourceRevision={() => snapshot().revision}
          phase="streaming"
          revealCoordinator={coordinator}
          onTextLayout={({reason}) => layouts.push(reason)}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);

    await Promise.resolve();
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    const latex = container.querySelector<HTMLElement>('[data-source-revision="1"]');
    expect(latex.textContent).toBe('x');
    layouts.length = 0;

    setSnapshot({source: 'y', revision: 2});
    // No await: the old cursor must not render the rewritten source before
    // the coordinator's microtask publishes the zero-grapheme clamp.
    expect(latex.textContent).toBe('x');
    expect(layouts).toEqual([]);

    await Promise.resolve();
    expect(latex.textContent).toBe('');
    expect(layouts).toEqual(['render']);
    scheduler.step(10);
    scheduler.step(12);
    await Promise.resolve();
    expect(latex.textContent).toBe('y');
    expect(layouts).toEqual(['render', 'render']);
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();
    dispose();
  });

  test('typesets unchanged block math when a newer revision finalizes', async() => {
    const [snapshot, setSnapshot] = createSignal<{
      source: string,
      revision: number,
      phase: 'streaming' | 'finalizing'
    }>({source: 'x', revision: 1, phase: 'streaming'});
    const scheduler = new ManualFrameScheduler();
    const container = document.createElement('div');
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => snapshot().phase,
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        finalizingGraphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000
      });
      const page = (): Page.page => ({
        _: 'page',
        pFlags: {},
        url: '',
        blocks: [{_: 'pageBlockMath', source: snapshot().source}],
        photos: [],
        documents: [],
        views: 0
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={page}
          sourceRevision={() => snapshot().revision}
          phase={() => snapshot().phase}
          revealCoordinator={coordinator}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);

    await Promise.resolve();
    scheduler.step(0);
    scheduler.step(2);
    await Promise.resolve();
    const latex = container.querySelector<HTMLElement>('[data-source-revision="1"]');
    expect(latex.textContent).toBe('x');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'x', revision: 2, phase: 'finalizing'});
    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector('[data-source-revision="2"]')).toBe(latex);
    expect(instantViewMocks.loadTemml).toHaveBeenCalledOnce();
    expect(latex.textContent).toBe('x');
    dispose();
  });

  test('keeps inactive streaming math raw and finalizes it from synchronized coordinator state', async() => {
    const [snapshot, setSnapshot] = createSignal<{
      source: string,
      revision: number,
      phase: 'streaming' | 'finalizing' | 'final'
    }>({source: 'x', revision: 1, phase: 'streaming'});
    const finalized: string[] = [];
    const container = document.createElement('div');
    let coordinator: ReturnType<typeof createMessageTextRevealCoordinator>;
    const dispose = render(() => {
      coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => snapshot().phase,
        active: () => false,
        onFinalized: ({phase}) => {
          finalized.push(phase);
          setSnapshot((current) => ({...current, phase: 'final'}));
        }
      });
      const page = (): Page.page => ({
        _: 'page',
        pFlags: {},
        url: '',
        blocks: [{_: 'pageBlockMath', source: snapshot().source}],
        photos: [],
        documents: [],
        views: 0
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={page}
          sourceRevision={() => snapshot().revision}
          phase={() => snapshot().phase}
          revealCoordinator={coordinator}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);

    await Promise.resolve();
    await Promise.resolve();
    const latex = container.querySelector<HTMLElement>('[data-source-revision="1"]');
    expect(latex.textContent).toBe('x');
    expect(coordinator.phase()).toBe('streaming');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'xy', revision: 2, phase: 'streaming'});
    await Promise.resolve();
    expect(container.querySelector('[data-source-revision="2"]')).toBe(latex);
    expect(latex.textContent).toBe('xy');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'xy', revision: 3, phase: 'finalizing'});
    await Promise.resolve();
    await Promise.resolve();
    expect(finalized).toEqual(['final']);
    expect(coordinator.phase()).toBe('final');
    expect(container.querySelector('[data-source-revision="3"]')).toBe(latex);
    expect(instantViewMocks.loadTemml).toHaveBeenCalledOnce();
    expect(latex.textContent).toBe('xy');
    dispose();
  });

  test('keeps caught-up inline math raw while slow tokens stream and typesets once at final', async() => {
    const [snapshot, setSnapshot] = createSignal<{
      source: string,
      revision: number,
      phase: 'streaming' | 'finalizing'
    }>({source: 'x', revision: 1, phase: 'streaming'});
    const scheduler = new ManualFrameScheduler();
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => snapshot().revision,
        phase: () => snapshot().phase,
        frameScheduler: scheduler,
        graphemesPerSecond: 1000,
        finalizingGraphemesPerSecond: 1000,
        maxRevealFramesPerSecond: 1000
      });
      const page = (): Page.page => ({
        _: 'page',
        pFlags: {},
        url: '',
        blocks: [{
          _: 'pageBlockParagraph',
          text: {_: 'textMath', source: snapshot().source}
        }],
        photos: [],
        documents: [],
        views: 0
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={page}
          sourceRevision={() => snapshot().revision}
          phase={() => snapshot().phase}
          revealCoordinator={coordinator}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);

    const revealCurrentToken = async(time: number) => {
      await Promise.resolve();
      scheduler.step(time);
      scheduler.step(time + 2);
      await Promise.resolve();
      await Promise.resolve();
    };

    await revealCurrentToken(0);
    const owner = container.querySelector('p').firstElementChild;
    expect(container.querySelector('p').textContent).toBe('x');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'xy', revision: 2, phase: 'streaming'});
    await revealCurrentToken(10);
    expect(container.querySelector('p').textContent).toBe('xy');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'xyz', revision: 3, phase: 'streaming'});
    await revealCurrentToken(20);
    expect(container.querySelector('p').textContent).toBe('xyz');
    expect(instantViewMocks.loadTemml).not.toHaveBeenCalled();

    setSnapshot({source: 'xyz', revision: 4, phase: 'finalizing'});
    await Promise.resolve();
    await Promise.resolve();
    expect(instantViewMocks.loadTemml).toHaveBeenCalledOnce();
    expect(container.querySelector('p').firstElementChild).toBe(owner);
    expect(container.querySelector('p').textContent).toBe('xyz');
    dispose();
    container.remove();
  });

  test('ignores a stale async math render after the source advances', async() => {
    const firstLoad = createDeferred<ReturnType<typeof createTemmlRenderer>>();
    const secondLoad = createDeferred<ReturnType<typeof createTemmlRenderer>>();
    instantViewMocks.loadTemml
    .mockImplementationOnce(() => firstLoad.promise)
    .mockImplementationOnce(() => secondLoad.promise);
    const [snapshot, setSnapshot] = createSignal({source: 'first', revision: 1});
    const resourcesReady: number[] = [];
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => ({
          _: 'page',
          pFlags: {},
          url: '',
          blocks: [{_: 'pageBlockMath', source: snapshot().source}],
          photos: [],
          documents: [],
          views: 0
        })}
        sourceRevision={() => snapshot().revision}
        onTextLayout={({reason, sourceRevision}) => {
          if(reason === 'resources-ready') resourcesReady.push(sourceRevision);
        }}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    expect(instantViewMocks.loadTemml).toHaveBeenCalledOnce();
    setSnapshot({source: 'second', revision: 2});
    await Promise.resolve();
    expect(instantViewMocks.loadTemml).toHaveBeenCalledTimes(2);

    secondLoad.resolve(createTemmlRenderer());
    await Promise.resolve();
    await Promise.resolve();
    const latex = container.querySelector<HTMLElement>('[data-source-revision="2"]');
    expect(latex.textContent).toBe('second');
    expect(resourcesReady).toEqual([2]);

    firstLoad.resolve(createTemmlRenderer());
    await Promise.resolve();
    await Promise.resolve();
    expect(latex.textContent).toBe('second');
    expect(resourcesReady).toEqual([2]);
    dispose();
  });

  test('does not re-wrap unchanged prefix leaves on a tail-only revision', async() => {
    const makeLongPage = (last: string): Page.page => ({
      _: 'page',
      pFlags: {},
      url: '',
      blocks: [
        ...Array.from({length: 64}, (_, index) => ({
          _: 'pageBlockParagraph' as const,
          text: text(`stable-${index}`)
        })),
        {_: 'pageBlockParagraph', text: text(last)}
      ],
      photos: [],
      documents: [],
      views: 0
    });
    const [state, setState] = createStore({page: makeLongPage('tail-a'), revision: 1});
    const container = document.createElement('div');
    const dispose = render(() => {
      const coordinator = createMessageTextRevealCoordinator({
        sourceRevision: () => state.revision,
        phase: () => 'final'
      });
      return (
        <InstantViewBlocks
          webPageId={1}
          page={() => state.page}
          sourceRevision={() => state.revision}
          phase="final"
          revealCoordinator={coordinator}
          openNewPage={() => {}}
          collapse={() => {}}
        />
      );
    }, container);
    await Promise.resolve();
    await Promise.resolve();
    const prefix = Array.from(container.querySelectorAll('p')).slice(0, 64);
    const prefixText = prefix.map((element) => element.firstElementChild as HTMLElement);
    instantViewMocks.wrapTelegramRichText.mockClear();

    batch(() => {
      setState('page', reconcile(makeLongPage('tail-b')));
      setState('revision', 2);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(instantViewMocks.wrapTelegramRichText).toHaveBeenCalledTimes(1);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(65);
    prefix.forEach((element, index) => expect(paragraphs[index]).toBe(element));
    prefixText.forEach((element) => expect(element.dataset.sourceRevision).toBe('1'));
    expect((paragraphs[64].firstElementChild as HTMLElement).dataset.sourceRevision).toBe('2');
    expect(paragraphs[64].textContent).toBe('tail-b');
    dispose();
  });

  test('reactively disables manual Instant View links without remounting their block', async() => {
    const page: Page.page = {
      ...makePage('', ''),
      blocks: [{
        _: 'pageBlockRelatedArticles',
        title: text('Related'),
        articles: [{
          _: 'pageRelatedArticle',
          url: 'https://example.com',
          webpage_id: 10,
          title: 'Example',
          description: '',
          author: '',
          published_date: 0
        }]
      }]
    };
    const [noLinks, setNoLinks] = createSignal(true);
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={page}
        sourceRevision={1}
        richTextOptions={() => ({noLinks: noLinks()})}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await Promise.resolve();
    const anchor = container.querySelector('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBeNull();
    expect(anchor.getAttribute('aria-disabled')).toBe('true');

    setNoLinks(false);
    await Promise.resolve();
    expect(container.querySelector('a')).toBe(anchor);
    expect(anchor.getAttribute('href')).toBeTruthy();
    expect(anchor.getAttribute('aria-disabled')).toBe('false');
    dispose();
  });

  test('disables inline rich-text links when noNavigation is the only policy flag', async() => {
    const page: Page.page = {
      ...makePage('', ''),
      blocks: [{
        _: 'pageBlockParagraph',
        text: {
          _: 'textUrl',
          text: text('Inline link'),
          url: 'https://example.com',
          webpage_id: 0
        }
      }]
    };
    const [noNavigation, setNoNavigation] = createSignal(true);
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={page}
        sourceRevision={1}
        richTextOptions={() => ({noNavigation: noNavigation()})}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await Promise.resolve();
    expect(container.textContent).toContain('Inline link');
    expect(container.querySelector('a')).toBeNull();

    setNoNavigation(false);
    await Promise.resolve();
    expect(container.querySelector('a')?.getAttribute('href')).toBeTruthy();
    dispose();
  });

  test('cancels delayed embed scroll restore when policy unmounts the webview', async() => {
    const [navigationDisabled, setNavigationDisabled] = createSignal(false);
    const page: Page.page = {
      ...makePage('', ''),
      blocks: [{
        _: 'pageBlockEmbed',
        pFlags: {},
        url: 'https://example.com/embed',
        w: 16,
        h: 9,
        caption
      }]
    };
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={page}
        sourceRevision={1}
        richTextOptions={() => ({noNavigation: navigationDisabled()})}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    expect(instantViewMocks.webViews).toHaveLength(1);
    instantViewMocks.webViews[0].emitResize(100);
    expect(instantViewMocks.scrollSave).toHaveBeenCalledOnce();
    setNavigationDisabled(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(instantViewMocks.scrollRestore).not.toHaveBeenCalled();
    expect(instantViewMocks.webViewDestroyed).toHaveBeenCalledOnce();

    setNavigationDisabled(false);
    await Promise.resolve();
    expect(instantViewMocks.webViews).toHaveLength(2);
    instantViewMocks.webViews[1].emitResize(120);
    await Promise.resolve();
    await Promise.resolve();
    expect(instantViewMocks.scrollSave).toHaveBeenCalledTimes(2);
    expect(instantViewMocks.scrollRestore).toHaveBeenCalledOnce();
    dispose();
  });

  test('keeps hidden caption links disabled inside the media viewer', async() => {
    const page = makeMediaPage([1]);
    (page.blocks[0] as PageBlock.pageBlockPhoto).caption = {
      _: 'pageCaption',
      text: {
        _: 'textUrl',
        text: text('hidden link'),
        url: 'https://example.com',
        webpage_id: 0
      },
      credit: {_: 'textEmpty'}
    };
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={page}
        sourceRevision={1}
        richTextOptions={{noNavigation: true}}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    (container.querySelector('[data-photo-id="1"]') as HTMLElement).click();
    await vi.waitFor(() => expect(instantViewMocks.openMedia).toHaveBeenCalledOnce());
    const options = instantViewMocks.openMedia.mock.calls[0][0] as {
      message: {totalEntities?: Array<{_: string}>}
    };
    expect(options.message.totalEntities?.some((entity) => entity._ === 'messageEntityTextUrl')).toBe(false);
    dispose();
    container.remove();
  });

  test('drops an in-flight media open after policy changes or its owner is disposed', async() => {
    const hiddenEntities = new Set(['messageEntityTextUrl'] as const);
    const request = createDeferred<Message.message>();
    instantViewMocks.generateStandaloneMessage.mockReturnValueOnce(request.promise);
    let navigationDisabled = false;
    const getPolicy = () => ({
      noNavigation: navigationDisabled,
      disabledEntities: hiddenEntities
    });
    const [richTextOptions, setRichTextOptions] = createSignal(getPolicy(), {equals: false});
    const refreshPolicy = () => setRichTextOptions(getPolicy());
    const page = makeMediaPage([1]);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={page}
        sourceRevision={1}
        richTextOptions={richTextOptions}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    (container.querySelector('[data-photo-id="1"]') as HTMLElement).click();
    navigationDisabled = true;
    refreshPolicy();
    request.resolve(makeStandaloneMessage());
    await Promise.resolve();
    await Promise.resolve();
    expect(instantViewMocks.openMedia).not.toHaveBeenCalled();

    const allowedRequest = createDeferred<Message.message>();
    instantViewMocks.generateStandaloneMessage.mockReturnValueOnce(allowedRequest.promise);
    navigationDisabled = false;
    refreshPolicy();
    await Promise.resolve();
    (container.querySelector('[data-photo-id="1"]') as HTMLElement).click();
    allowedRequest.resolve(makeStandaloneMessage());
    await vi.waitFor(() => expect(instantViewMocks.openMedia).toHaveBeenCalledOnce());

    const disposedRequest = createDeferred<Message.message>();
    instantViewMocks.generateStandaloneMessage.mockReturnValueOnce(disposedRequest.promise);
    (container.querySelector('[data-photo-id="1"]') as HTMLElement).click();
    dispose();
    disposedRequest.resolve(makeStandaloneMessage());
    await Promise.resolve();
    await Promise.resolve();
    expect(instantViewMocks.openMedia).toHaveBeenCalledOnce();
    container.remove();
  });

  test('drops an in-flight media open after its DOM target is detached', async() => {
    const request = createDeferred<Message.message>();
    instantViewMocks.generateStandaloneMessage.mockReturnValueOnce(request.promise);
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={makeMediaPage([1])}
        sourceRevision={1}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();

    (container.querySelector('[data-photo-id="1"]') as HTMLElement).click();
    container.remove();
    request.resolve(makeStandaloneMessage());
    await Promise.resolve();
    await Promise.resolve();

    expect(instantViewMocks.openMedia).not.toHaveBeenCalled();
    dispose();
  });

  test('does not revisit or remount unchanged media for a text-only tail revision', async() => {
    const ids = Array.from({length: 24}, (_, index) => index + 1);
    const page = makeMediaPage(ids);
    page.blocks.push({_: 'pageBlockParagraph', text: text('tail-a')});
    const findPhoto = vi.spyOn(page.photos, 'find');
    const [state, setState] = createStore({page, revision: 1});
    const container = document.createElement('div');
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();
    const stableMedia = Array.from(container.querySelectorAll('[data-photo-id]'));
    expect(stableMedia).toHaveLength(ids.length);
    findPhoto.mockClear();
    instantViewMocks.photoMounted.mockClear();

    batch(() => {
      setState('page', 'blocks', reconcile([
        ...ids.map(photoBlock),
        {_: 'pageBlockParagraph', text: text('tail-b')}
      ]));
      setState('revision', 2);
    });
    await Promise.resolve();

    expect(findPhoto).not.toHaveBeenCalled();
    expect(instantViewMocks.photoMounted).not.toHaveBeenCalled();
    const currentMedia = container.querySelectorAll('[data-photo-id]');
    stableMedia.forEach((element, index) => expect(currentMedia[index]).toBe(element));
    expect(container.querySelector('p').textContent).toBe('tail-b');
    findPhoto.mockRestore();
    dispose();
  });

  test('recalculates collage positions when stable media reorder without changing length', async() => {
    const [state, setState] = createStore({page: makeMediaPage([1, 2], true), revision: 1});
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await vi.waitFor(() => {
      expect((container.querySelector('[data-photo-id="1"]')?.parentElement as HTMLElement).style.left).toBe('0%');
    });
    const firstPhoto = container.querySelector('[data-photo-id="1"]');
    const secondPhoto = container.querySelector('[data-photo-id="2"]');

    batch(() => {
      setState('page', reconcile(makeMediaPage([2, 1], true)));
      setState('revision', 2);
    });

    await vi.waitFor(() => {
      const photos = container.querySelectorAll('[data-photo-id]');
      expect(photos[0]).toBe(secondPhoto);
      expect(photos[1]).toBe(firstPhoto);
      expect((secondPhoto.parentElement as HTMLElement).style.left).toBe('0%');
      expect((firstPhoto.parentElement as HTMLElement).style.left).not.toBe('0%');
    });

    dispose();
    container.remove();
  });

  test('opens reordered stable media in current DOM order', async() => {
    const [state, setState] = createStore({page: makeMediaPage([1, 2]), revision: 1});
    const container = document.createElement('div');
    document.body.append(container);
    const dispose = render(() => (
      <InstantViewBlocks
        webPageId={1}
        page={() => state.page}
        sourceRevision={() => state.revision}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
    await Promise.resolve();
    const firstPhoto = container.querySelector('[data-photo-id="1"]');
    const secondPhoto = container.querySelector('[data-photo-id="2"]') as HTMLElement;

    batch(() => {
      setState('page', reconcile(makeMediaPage([2, 1])));
      setState('revision', 2);
    });
    await Promise.resolve();
    expect(container.querySelectorAll('[data-photo-id]')[0]).toBe(secondPhoto);

    secondPhoto.click();
    await vi.waitFor(() => expect(instantViewMocks.openMedia).toHaveBeenCalledOnce());
    const options = instantViewMocks.openMedia.mock.calls[0][0] as {
      message: {media: {photo: {id: number}}},
      prevTargets: Array<{message: {media: {photo: {id: number}}}}>,
      nextTargets: Array<{message: {media: {photo: {id: number}}}}>
    };
    expect(options.prevTargets).toHaveLength(0);
    expect(options.message.media.photo.id).toBe(2);
    expect(options.nextTargets.map((target) => target.message.media.photo.id)).toEqual([1]);
    expect(container.querySelectorAll('[data-photo-id]')[1]).toBe(firstPhoto);

    dispose();
    container.remove();
  });
});
