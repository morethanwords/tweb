import {render} from 'solid-js/web';
import {createSignal} from 'solid-js';
import {Message, Page, RichMessage, RichText} from '@layer';
import {InstantViewBlocks} from '@components/instantView';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import {RichMessageBubble} from '@components/chat/bubbles/richMessage';
import {
  getMaximumHeightMediaSize,
  instantViewStyles
} from '@components/instantViewFormatting';

const mocks = vi.hoisted(() => ({
  getRichMessage: vi.fn(),
  canEditMessage: vi.fn(async() => true),
  toggleRichMessageChecklist: vi.fn(async() => true),
  processMessageForTranslation: vi.fn(),
  translateRichMessage: vi.fn(),
  translationEnabled: vi.fn(() => false),
  translationLanguage: vi.fn(() => 'de'),
  openInstantViewInAppBrowser: vi.fn(),
  onMediaSpoilerClick: vi.fn(),
  showTooltip: vi.fn((_options: any) => ({close: vi.fn()})),
  pageButtonClick: vi.fn(),
  getRichPageButtonHandler: vi.fn((_options: any): any => ({
    as: 'button',
    classNames: [],
    refCallbacks: [],
    onClick: mocks.pageButtonClick
  })),
  wrapMediaSpoiler: vi.fn(async(_options: any) => {
    const element = document.createElement('div');
    element.className = 'media-spoiler-container';
    return element;
  })
}));

vi.hoisted(() => {
  class IntersectionObserverMock {
    constructor(private callback: IntersectionObserverCallback) {}

    disconnect() {}

    // Everything rendered by these tests is on screen, so report it the way a
    // real observer does: asynchronously, right after `observe`.
    observe(element: Element) {
      queueMicrotask(() => this.callback(
        [{isIntersecting: true, target: element} as IntersectionObserverEntry],
        this as unknown as IntersectionObserver
      ));
    }

    unobserve() {}
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: () => 'data:image/webp;base64,'
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: (): null => null
  });
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    value: {supports: () => false}
  });
});

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    i18n: (key: string) => key,
    rootScope: {
      managers: {
        appMessagesManager: {
          getRichMessage: mocks.getRichMessage,
          canEditMessage: mocks.canEditMessage,
          toggleRichMessageChecklist: mocks.toggleRichMessageChecklist
        },
        acknowledged: {
          appTranslationsManager: {
            translateRichMessage: mocks.translateRichMessage
          }
        }
      }
    },
    usePeerTranslation: () => ({
      enabled: mocks.translationEnabled,
      language: mocks.translationLanguage
    }),
    wrapEmojiText: (value: string) => value,
    PhotoTsx: (props: any) => {
      const element = document.createElement('div');
      element.style.width = '120px';
      element.style.height = '80px';
      props.ref?.(element);
      queueMicrotask(() => props.onResult?.());
      return element;
    },
    VideoTsx: (props: any) => {
      const element = document.createElement('div');
      element.style.width = '160px';
      element.style.height = '90px';
      props.ref?.(element);
      queueMicrotask(() => props.onResult?.());
      return element;
    }
  })
}));

vi.mock('@lib/customEmoji/renderer', () => ({
  CustomEmojiRendererElement: {
    create: () => document.createElement('div')
  }
}));

vi.mock('@stores/peerLanguage', () => ({
  processMessageForTranslation: mocks.processMessageForTranslation
}));

vi.mock('@components/browser', () => ({
  openInstantViewInAppBrowser: mocks.openInstantViewInAppBrowser
}));

vi.mock('@lib/solidjs/hotReloadGuardProvider', () => ({
  default: class {}
}));

vi.mock('@components/tooltip', () => ({
  default: mocks.showTooltip
}));

vi.mock('@components/wrappers/mediaSpoiler', () => ({
  default: mocks.wrapMediaSpoiler,
  onMediaSpoilerClick: mocks.onMediaSpoilerClick
}));

vi.mock('@components/wrappers/keyboardButton', () => ({
  getRichPageButtonHandler: mocks.getRichPageButtonHandler
}));

const text = (value: string): RichText => ({_: 'textPlain', text: value});
const page = (blocks: Page.page['blocks']): Page.page => ({
  _: 'page',
  pFlags: {},
  url: '',
  blocks,
  photos: [],
  documents: [],
  views: 0
});

describe('Instant View lists', () => {
  let container: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.translationEnabled.mockReturnValue(false);
    mocks.translationLanguage.mockReturnValue('de');
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  test('renders checklist controls for text and block list items without replacing ordered markers', () => {
    const page: Page.page = {
      _: 'page',
      pFlags: {},
      url: '',
      blocks: [
        {
          _: 'pageBlockList',
          items: [
            {_: 'pageListItemText', pFlags: {checkbox: true}, text: text('Text task')},
            {
              _: 'pageListItemBlocks',
              pFlags: {checkbox: true, checked: true},
              blocks: [{_: 'pageBlockParagraph', text: text('Block task')}]
            },
            {
              _: 'pageListItemBlocks',
              pFlags: {},
              blocks: [{_: 'pageBlockParagraph', text: text('Plain block')}]
            }
          ]
        },
        {
          _: 'pageBlockOrderedList',
          pFlags: {},
          items: [
            {
              _: 'pageListOrderedItemText',
              pFlags: {checkbox: true},
              num: 'A',
              text: text('Ordered text task')
            },
            {
              _: 'pageListOrderedItemBlocks',
              pFlags: {checkbox: true, checked: true},
              num: 'B',
              blocks: [{_: 'pageBlockParagraph', text: text('Ordered block task')}]
            }
          ]
        }
      ],
      photos: [],
      documents: [],
      views: 0
    };
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const items = Array.from(container.querySelectorAll('li'));
    const lists = Array.from(container.querySelectorAll('ul, ol'));
    const taskCheckboxSelector = `.${instantViewStyles.TaskCheckbox}`;

    expect(items).toHaveLength(5);
    expect(lists[0].classList.contains(instantViewStyles.ListChecklist)).toBe(false);
    expect(lists[1].classList.contains(instantViewStyles.ListChecklist)).toBe(true);
    expect(container.querySelectorAll(taskCheckboxSelector)).toHaveLength(4);
    expect(items.find((item) => item.textContent.includes('Text task'))?.querySelector(taskCheckboxSelector)).toBeTruthy();
    expect(items.find((item) => item.textContent.includes('Block task'))?.querySelector(taskCheckboxSelector)).toBeTruthy();
    expect(items.find((item) => item.textContent.includes('Plain block'))?.querySelector(taskCheckboxSelector)).toBeNull();

    const orderedItems = Array.from(container.querySelectorAll('ol > li'));
    expect(orderedItems[0].querySelector(`.${instantViewStyles.ListItemNumber}`)?.textContent).toBe('A. ');
    expect(orderedItems[1].querySelector(`.${instantViewStyles.ListItemNumber}`)?.textContent).toBe('B. ');
    expect(orderedItems.every((item) => !!item.querySelector(taskCheckboxSelector))).toBe(true);
  });

  test('uses the shared preformatted wrapper geometry for code headers', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockPreformatted',
          language: 'javascript',
          text: text('const answer = 42;')
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const wrapper = container.querySelector<HTMLElement>(
      `.${instantViewStyles.PreformattedWrapper}`
    );
    const header = wrapper?.querySelector<HTMLElement>('.code-header');
    expect(wrapper).not.toBeNull();
    expect(header).not.toBeNull();
    expect(header?.closest(`.${instantViewStyles.PreformattedWrapper}`)).toBe(wrapper);
  });

  test('reports the structural path of an interactive nested checklist item', () => {
    const onChecklistToggle = vi.fn();
    const nestedPage = page([{
      _: 'pageBlockDetails',
      pFlags: {open: true},
      title: text('Details'),
      blocks: [{
        _: 'pageBlockList',
        items: [{
          _: 'pageListItemBlocks',
          pFlags: {},
          blocks: [{
            _: 'pageBlockList',
            items: [{
              _: 'pageListItemText',
              pFlags: {checkbox: true},
              text: text('Nested task')
            }]
          }]
        }]
      }]
    }]);

    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={nestedPage}
        openNewPage={() => {}}
        collapse={() => {}}
        onChecklistToggle={onChecklistToggle}
      />
    ), container);

    const checkbox = container.querySelector<HTMLButtonElement>(
      `.${instantViewStyles.TaskCheckboxButton}`
    );
    expect(checkbox?.getAttribute('role')).toBe('checkbox');
    expect(checkbox?.getAttribute('aria-checked')).toBe('false');
    checkbox?.click();
    expect(onChecklistToggle).toHaveBeenCalledWith([0, 0, 0, 0, 0], true);
  });

  test('renders server-provided numeric markers and preserves ordered value/type attributes', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockOrderedList',
          pFlags: {reversed: true},
          start: 8,
          type: 'A',
          items: [
            {_: 'pageListOrderedItemText', pFlags: {}, num: '8', value: 8, type: 'i', text: text('Eight')},
            {_: 'pageListOrderedItemText', pFlags: {}, num: '7', value: 7, text: text('Seven')}
          ]
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const list = container.querySelector('ol');
    const items = Array.from(list.querySelectorAll('li'));
    const numberSelector = `.${instantViewStyles.ListItemNumber}`;
    expect(list.reversed).toBe(true);
    expect(list.start).toBe(8);
    expect(list.type).toBe('A');
    expect(items[0].value).toBe(8);
    expect(items[0].type).toBe('i');
    expect(items[0].querySelector(numberSelector)?.textContent).toBe('8. ');
    expect(items[1].querySelector(numberSelector)?.textContent).toBe('7. ');
  });
});

describe('Instant View rich rendering', () => {
  let container: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  test('chooses the media producing the tallest slideshow viewport', () => {
    expect(getMaximumHeightMediaSize([
      {height: 90, width: 160},
      {height: 80, width: 120}
    ])).toEqual({height: 80, width: 120});
  });

  test('renders an optimistic input map instead of an unsupported block', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'inputPageBlockMap',
          geo: {_: 'inputGeoPoint', lat: 25.2, long: 55.3},
          zoom: 12,
          w: 320,
          h: 180,
          caption: {
            _: 'pageCaption',
            text: text('Map caption'),
            credit: {_: 'textEmpty'}
          }
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    expect(container.textContent).toContain('Map caption');
    expect(container.textContent).not.toContain('Unsupported');
    expect(container.querySelector<HTMLAnchorElement>('a')?.href).toContain('25.2,55.3');
  });

  test('uses the explicit targets of email and phone rich text and renders the new side of a diff', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockParagraph',
          text: {
            _: 'textConcat',
            texts: [
              {_: 'textEmail', email: 'real@example.com', text: text('Email us')},
              text(' '),
              {_: 'textPhone', phone: '+123456', text: text('Call us')},
              text(' '),
              {_: 'textDiff', text: text('new version'), old_text: text('old version')}
            ]
          }
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const links = Array.from(container.querySelectorAll('a'));
    expect(links[0].getAttribute('href')).toBe('mailto:real@example.com');
    expect(links[0].textContent).toBe('Email us');
    expect(links[1].getAttribute('href')).toBe('tel:+123456');
    expect(links[1].textContent).toBe('Call us');
    expect(container.textContent).toContain('new version');
    expect(container.textContent).not.toContain('old version');
  });

  test('renders both sides of rich textDiff in AI display mode', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockParagraph',
          text: {
            _: 'textDiff',
            text: {_: 'textBold', text: text('new version')},
            old_text: {_: 'textItalic', text: text('old version')}
          }
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
        displayTextDiff
      />
    ), container);

    const deleted = container.querySelector('.markup-diff-delete');
    const inserted = container.querySelector('.markup-diff-insert');
    expect(deleted?.textContent).toBe('old version');
    expect(inserted?.textContent).toBe('new version');
    expect(deleted?.querySelector('em')).not.toBeNull();
    expect(inserted?.querySelector('strong')).not.toBeNull();
  });

  test('opens a tg-reference footnote in the existing tooltip instead of scrolling', () => {
    const scrollToElement = vi.fn();
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([
          {
            _: 'pageBlockParagraph',
            text: {_: 'textUrl', webpage_id: 0, url: '#fn-note', text: text('1')}
          },
          {
            _: 'pageBlockFooter',
            text: {_: 'textAnchor', name: 'fn-note', text: text('Footnote definition')}
          }
        ])}
        openNewPage={() => {}}
        collapse={() => {}}
        scrollToElement={scrollToElement}
      />
    ), container);

    const link = container.querySelector('a.anchor-url') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));

    expect(mocks.showTooltip).toHaveBeenCalledOnce();
    expect(mocks.showTooltip.mock.calls[0][0].textElement.textContent).toBe('Footnote definition');
    expect(scrollToElement).not.toHaveBeenCalled();
  });

  test('makes details a keyboard-native disclosure with synchronized aria and inert state', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockDetails',
          pFlags: {},
          title: text('More'),
          blocks: [{_: 'pageBlockParagraph', text: text('Hidden')}]
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const button = container.querySelector(`.${instantViewStyles.DetailsSummary}`) as HTMLButtonElement;
    const content = document.getElementById(button.getAttribute('aria-controls')) as HTMLDivElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(content.getAttribute('role')).toBe('region');
    expect(content.getAttribute('aria-labelledby')).toBe(button.id);
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.inert).toBe(true);
    expect(
      container.querySelector(`.${instantViewStyles.Details} > .${instantViewStyles.Border}`)
    ).toBeNull();

    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(content.getAttribute('aria-hidden')).toBe('false');
    expect(content.inert).toBe(false);
  });

  test('renders pullquotes with the same structural classes as the editor', () => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page([{
          _: 'pageBlockPullquote',
          text: text('Quoted text'),
          caption: text('Author')
        }])}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    const pullquote = container.querySelector<HTMLElement>(`.${instantViewStyles.Pullquote}`);
    const quote = pullquote?.querySelector<HTMLElement>(`.${instantViewStyles.PullquoteText}`);
    const author = pullquote?.querySelector<HTMLElement>(`.${instantViewStyles.PullquoteAuthor}`);
    expect(pullquote?.classList.contains('quote-like')).toBe(true);
    expect(quote?.textContent).toBe('Quoted text');
    expect(quote?.classList.contains('text-italic')).toBe(true);
    expect(author?.textContent).toBe('Author');
    expect(author?.classList.contains(instantViewStyles.BlockquoteCaption)).toBe(true);
    expect(author?.classList.contains('text-bold')).toBe(true);
  });

  test('attaches the existing media spoiler to rich photos and videos', async() => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={{
          ...page([
            {
              _: 'pageBlockPhoto',
              pFlags: {spoiler: true},
              photo_id: 1,
              caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
            },
            {
              _: 'pageBlockVideo',
              pFlags: {spoiler: true},
              video_id: 2,
              caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
            },
            {
              _: 'pageBlockPhoto',
              pFlags: {},
              photo_id: 3,
              caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
            }
          ]),
          photos: [
            {_: 'photo', id: 1, sizes: []} as any,
            {_: 'photo', id: 3, sizes: []} as any
          ],
          documents: [{_: 'document', id: 2, thumbs: []} as any]
        }}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);

    await vi.waitFor(() => expect(mocks.wrapMediaSpoiler).toHaveBeenCalledTimes(2));
    expect(mocks.wrapMediaSpoiler.mock.calls.map(([options]) => options.media.id)).toEqual([1, 2]);
    expect(container.querySelectorAll('.media-spoiler-container')).toHaveLength(2);
  });
});

describe('Instant View buttons (layer 229)', () => {
  let container: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  const renderBlocks = (blocks: Page.page['blocks'], context: {chat?: any, message?: Message.message} = {}) => {
    dispose = render(() => (
      <InstantViewBlocks
        webPageId={0}
        page={page(blocks)}
        chat={context.chat}
        message={context.message}
        openNewPage={() => {}}
        collapse={() => {}}
      />
    ), container);
  };

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  test('lays a row out with its alignment and each button with its style', () => {
    renderBlocks([{
      _: 'pageBlockButtonRow',
      pFlags: {align_center: true},
      buttons: [
        {
          _: 'pageButton',
          text: text('Site'),
          type: {_: 'inlineButtonTypeUrl', url: 'https://telegram.org'},
          style: {_: 'richButtonStyle', pFlags: {bg_primary: true}}
        },
        {_: 'pageButton', text: text('Soon'), type: {_: 'inlineButtonTypeDisabled'}},
        {_: 'pageButton', text: text('Press'), type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}}
      ]
    }]);

    const row = container.querySelector(`.${instantViewStyles.PageButtonRow}`);
    expect(row.classList.contains(instantViewStyles.PageButtonRowCenter)).toBe(true);
    const [site, soon, press] = Array.from(row.children) as HTMLElement[];
    // a link button is a link, with the link's own checks
    expect(site.tagName).toBe('A');
    expect(site.getAttribute('href')).toBe('https://telegram.org');
    expect(site.classList.contains(instantViewStyles['PageButton-primary'])).toBe(true);
    expect(site.textContent).toContain('Site');
    expect((soon as HTMLButtonElement).disabled).toBe(true);
    // a callback acts on a message: a page read on its own has none
    expect((press as HTMLButtonElement).disabled).toBe(true);
  });

  test('a button inside the text is drawn in place and acts on click', async() => {
    const copy: RichText.textButton = {
      _: 'textButton',
      text: text('Copy'),
      type: {_: 'inlineButtonTypeCopy', copy_text: 'code'}
    };
    renderBlocks([{
      _: 'pageBlockParagraph',
      text: {_: 'textConcat', texts: [text('Press '), copy, text(' please')]}
    }]);

    const button = container.querySelector<HTMLElement>('[data-rich-button]');
    expect(button.textContent).toBe('Copy');
    expect(button.classList.contains(instantViewStyles.PageButtonInline)).toBe(true);
    expect(button.parentElement.textContent).toBe('Press Copy please');

    simulateClickEvent(button);
    await flush();
    expect(mocks.getRichPageButtonHandler).toHaveBeenCalledWith(expect.objectContaining({
      button: copy,
      label: 'Copy',
      chat: undefined
    }));
    expect(mocks.pageButtonClick).toHaveBeenCalledTimes(1);
  });

  test('inside a message a callback button answers through that message', async() => {
    const chat = {peerId: 1};
    const message = {_: 'message', mid: 5, peerId: 1} as Message.message;
    renderBlocks([{
      _: 'pageBlockButtonRow',
      pFlags: {},
      buttons: [{_: 'pageButton', text: text('Press'), type: {_: 'inlineButtonTypeCallback', pFlags: {}, data: new Uint8Array([1])}}]
    }], {chat, message});

    const button = container.querySelector<HTMLButtonElement>(`.${instantViewStyles.PageButton}`);
    expect(button.disabled).toBe(false);
    button.click();
    await flush();
    expect(mocks.getRichPageButtonHandler).toHaveBeenCalledWith(expect.objectContaining({chat, message}));
    expect(mocks.pageButtonClick).toHaveBeenCalledTimes(1);
  });
});

describe('RichMessageBubble partial hydration', () => {
  let container: HTMLDivElement;
  let dispose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.translationEnabled.mockReturnValue(false);
    mocks.translationLanguage.mockReturnValue('de');
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  test('optimistically toggles an editable original checklist and persists its path', async() => {
    const richMessage: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockList',
        items: [{
          _: 'pageListItemText',
          pFlags: {checkbox: true},
          text: text('Task')
        }]
      }],
      photos: [],
      documents: []
    };
    const message = {
      _: 'message',
      peerId: 10 as PeerId,
      mid: 42,
      pFlags: {}
    } as Message.message;

    dispose = render(() => (
      <RichMessageBubble
        message={message}
        richMessage={richMessage}
        page={page(richMessage.blocks)}
      />
    ), container);

    const selector = `.${instantViewStyles.TaskCheckboxButton}`;
    await vi.waitFor(() => expect(container.querySelector(selector)).toBeTruthy());
    const checkbox = container.querySelector<HTMLButtonElement>(selector)!;
    checkbox.click();

    expect(
      container.querySelector<HTMLButtonElement>(selector)?.getAttribute('aria-checked')
    ).toBe('true');
    expect(mocks.toggleRichMessageChecklist).toHaveBeenCalledWith({
      peerId: 10,
      mid: 42,
      path: [0, 0],
      checked: true,
      scheduled: false
    });
  });

  test('fetches a part once on screen and reactively replaces its preview', async() => {
    const preview: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {part: true},
      blocks: [{_: 'pageBlockParagraph', text: text('Preview')}],
      photos: [],
      documents: []
    };
    const full: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockParagraph', text: text('Full message')}],
      photos: [],
      documents: []
    };
    mocks.getRichMessage.mockResolvedValue(full);

    dispose = render(() => (
      <RichMessageBubble
        message={{peerId: 10 as PeerId, mid: 42} as Message.message}
        richMessage={preview}
        page={page(preview.blocks)}
      />
    ), container);

    expect(container.textContent).toContain('Preview');
    expect(container.querySelector(`.${instantViewStyles.RichMessageMore}`)).toBeTruthy();
    await vi.waitFor(() => expect(container.textContent).toContain('Full message'));
    expect(container.textContent).not.toContain('Preview');
    expect(container.querySelector(`.${instantViewStyles.RichMessageMore}`)).toBeNull();
    expect(mocks.getRichMessage).toHaveBeenCalledOnce();
    expect(mocks.getRichMessage).toHaveBeenCalledWith(10, 42);
  });

  test('reactively renders a translated rich page supplied by the message body without flattening its blocks', async() => {
    const original: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockHeading2', text: text('Original heading')}],
      photos: [],
      documents: []
    };
    const translated: RichMessage.richMessage = {
      _: 'richMessage',
      pFlags: {},
      blocks: [
        {_: 'pageBlockHeading2', text: text('Übersetzte Überschrift')},
        {
          _: 'pageBlockList',
          items: [{
            _: 'pageListItemText',
            pFlags: {checkbox: true},
            text: text('Aufgabe')
          }]
        }
      ],
      photos: [],
      documents: []
    };
    const [displayed, setDisplayed] = createSignal<RichMessage>(original);

    dispose = render(() => (
      <RichMessageBubble
        message={{peerId: 10 as PeerId, mid: 42} as Message.message}
        richMessage={displayed}
        page={() => page(displayed().blocks)}
        checklistsDisabled={true}
      />
    ), container);

    setDisplayed(translated);
    await vi.waitFor(() => expect(container.textContent).toContain('Übersetzte Überschrift'));
    expect(container.querySelector('h2')?.textContent).toBe('Übersetzte Überschrift');
    expect(container.querySelector(`.${instantViewStyles.TaskCheckbox}`)).toBeTruthy();
    expect(container.textContent).not.toContain('Original heading');
  });
});
