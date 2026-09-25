import '@/tests/mocks/chatInputEditorUi';
import {mountChatInputEditor} from '@/tests/helpers/chatInputEditor';
import type {Editor, JSONContent} from '@tiptap/core';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {NodeSelection} from '@tiptap/pm/state';
import {TableMap} from '@tiptap/pm/tables';
import createChatInputEditor from '@components/chat/inputEditor';
import reconcileRichMediaUploads from '@components/chat/inputEditor/reconcileUploads';
import type {ChatInputEditor, ChatInputEditorOptions} from '@components/chat/inputEditor/types';
import InputField from '@components/inputField';
import slideshowStyles from '@components/slideshow.module.scss';
import type {MarkdownType} from '@helpers/dom/getRichElementValue';
import type {Document, MessageEntity, PageBlock, Photo} from '@layer';
import I18n from '@lib/langPack';
import {setAppSettingsSilent} from '@stores/appSettings';

vi.mock('@helpers/dom/copyFromElement', () => ({default: vi.fn()}));

const customEmojiRenderingMocks = vi.hoisted(() => ({
  createElement: vi.fn(),
  createRenderer: vi.fn(),
  elements: [] as any[],
  renderers: [] as any[]
}));

vi.hoisted(() => {
  const fetchMock = vi.fn(async() => new Response('', {status: 404}));
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: fetchMock,
    writable: true
  });
  if(window !== globalThis) {
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      value: fetchMock,
      writable: true
    });
  }

  class WebSocketMock extends EventTarget {
    public static readonly CLOSED = 3;
    public static readonly CLOSING = 2;
    public static readonly CONNECTING = 0;
    public static readonly OPEN = 1;

    public readonly CLOSED = 3;
    public readonly CLOSING = 2;
    public readonly CONNECTING = 0;
    public readonly OPEN = 1;
    public binaryType: BinaryType = 'blob';
    public bufferedAmount = 0;
    public extensions = '';
    public onclose: ((event: CloseEvent) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onmessage: ((event: MessageEvent) => void) | null = null;
    public onopen: ((event: Event) => void) | null = null;
    public protocol = '';
    public readyState = WebSocketMock.CONNECTING;
    public url: string;

    constructor(url: string | URL) {
      super();
      this.url = `${url}`;
    }

    public close() {
      this.readyState = WebSocketMock.CLOSED;
    }

    public send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {}
  }

  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: WebSocketMock,
    writable: true
  });
  if(window !== globalThis) {
    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: WebSocketMock,
      writable: true
    });
  }
});

vi.mock('@components/chat/markupTooltip', () => ({
  default: {
    getInstance: () => ({
      setActiveMarkupButton() {}
    })
  }
}));

vi.mock('@components/wrappers/document', () => ({
  default: vi.fn(async({doc}: {doc: {duration?: number}}) => {
    const element = document.createElement('audio-element') as HTMLElement & {
      doc?: unknown
    };
    element.classList.add('audio');
    element.doc = doc;
    const time = document.createElement('span');
    const duration = Math.max(0, Math.floor(doc.duration || 0));
    time.className = 'audio-time';
    time.textContent = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
    element.append(time);
    return element;
  })
}));

vi.mock('@components/wrappers/photo', () => ({
  default: vi.fn(async({container, photo}: {
    container: HTMLElement,
    photo: Photo.photo
  }) => {
    const image = document.createElement('img');
    image.className = 'media-photo';
    image.dataset.photoId = String(photo.id);
    container.append(image);
    return {
      images: {full: image, thumb: null},
      loadPromises: {full: Promise.resolve(), thumb: Promise.resolve()}
    };
  })
}));

vi.mock('@components/wrappers/video', () => ({
  default: vi.fn(async({container, doc}: {
    container: HTMLElement,
    doc: Document.document
  }) => {
    const video = document.createElement('video');
    video.className = 'media-video';
    video.dataset.documentId = String(doc.id);
    container.append(video);
    return video;
  })
}));

vi.mock('@components/buttonMenuToggle', () => ({
  default: (options: {
    buttons: Array<{
      danger?: boolean,
      onClick: (event: MouseEvent) => void,
      text?: string,
      verify?: () => boolean
    }>,
    container?: HTMLElement,
    floatingDirection?: string
  }) => {
    const trigger = options.container || document.createElement('button');
    trigger.classList.add('btn-icon', 'btn-menu-toggle');
    trigger.dataset.floatingDirection = options.floatingDirection || '';
    trigger.addEventListener('click', () => {
      document.body.querySelectorAll('.btn-menu').forEach((menu) => menu.remove());
      const menu = document.createElement('div');
      menu.className = 'btn-menu active';
      options.buttons.filter((button) => button.verify?.() ?? true).forEach((button) => {
        const item = document.createElement('div');
        item.className = 'btn-menu-item';
        item.dataset.langKey = button.text || '';
        item.textContent = button.text || '';
        item.classList.toggle('danger', !!button.danger);
        item.addEventListener('click', (event) => {
          button.onClick(event);
          menu.remove();
          trigger.classList.remove('menu-open');
        });
        menu.append(item);
      });
      trigger.classList.add('menu-open');
      document.body.append(menu);
    });
    return trigger;
  }
}));

vi.mock('@environment/webpSupport', () => ({default: true}));

vi.mock('@lib/richTextProcessor/wrapRichText', () => ({
  ENTITY_ELEMENT_MAP: new WeakMap(),
  isCustomFillerNeededBySiblingNode: () => false
}));

vi.mock('@lib/customEmoji/element', () => ({
  default: {create: customEmojiRenderingMocks.createElement}
}));

vi.mock('@lib/customEmoji/renderer', () => ({
  CustomEmojiRendererElement: {create: customEmojiRenderingMocks.createRenderer}
}));

export type TiptapEditorInternals = ChatInputEditor & {
  editor: Editor
};

export function findEntity<T extends MessageEntity['_']>(entities: MessageEntity[], type: T) {
  return entities.find((entity): entity is Extract<MessageEntity, {_?: T}> => entity._ === type);
}

export function tableDocument(rows: string[][], withHeaderRow = true): JSONContent {
  return {
    type: 'doc',
    content: [{
      type: 'table',
      content: rows.map((row, rowIndex) => ({
        type: 'tableRow',
        content: row.map((text) => ({
          type: withHeaderRow && rowIndex === 0 ? 'tableHeader' : 'tableCell',
          content: [{
            type: 'paragraph',
            content: text ? [{type: 'text', text}] : undefined
          }]
        }))
      }))
    }]
  };
}

export function currentTable(editor: Editor) {
  let table: ProseMirrorNode;
  let position = -1;
  editor.state.doc.descendants((node, nodePosition) => {
    if(table || node.type.name !== 'table') return;
    table = node;
    position = nodePosition;
    return false;
  });
  expect(table!).toBeTruthy();
  return {
    map: TableMap.get(table!),
    position,
    start: position + 1,
    table: table!
  };
}

export function typeTextThroughEditorView(editor: Editor, text: string) {
  for(const character of text) {
    const {from, to} = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (handler) => (
      handler(
        editor.view,
        from,
        to,
        character,
        () => editor.state.tr.insertText(character, from, to).scrollIntoView()
      )
    ));
    if(!handled) {
      editor.view.dispatch(editor.state.tr.insertText(character, from, to));
    }
  }
}

export function useChatInputEditorHarness() {
  const editors: ChatInputEditor[] = [];

  beforeEach(() => {
    customEmojiRenderingMocks.elements.length = 0;
    customEmojiRenderingMocks.renderers.length = 0;
    customEmojiRenderingMocks.createElement.mockClear();
    customEmojiRenderingMocks.createRenderer.mockClear();
    customEmojiRenderingMocks.createElement.mockImplementation((docId) => {
      const element = document.createElement('span') as HTMLElement & {
        destroy: ReturnType<typeof vi.fn>,
        docId: string,
        placeholder?: HTMLImageElement
      };
      element.docId = `${docId}`;
      element.destroy = vi.fn();
      customEmojiRenderingMocks.elements.push(element);
      return element;
    });
    customEmojiRenderingMocks.createRenderer.mockImplementation(() => {
      const renderer = document.createElement('custom-emoji-renderer-element') as HTMLElement & {
        add: ReturnType<typeof vi.fn>,
        customEmojis: Map<string, Set<HTMLElement>>,
        destroy: ReturnType<typeof vi.fn>,
        forceRender: ReturnType<typeof vi.fn>
      };
      renderer.className = 'custom-emoji-renderer';
      renderer.customEmojis = new Map();
      renderer.add = vi.fn(({addCustomEmojis}) => {
        addCustomEmojis.forEach((elements: Set<HTMLElement>, docId: string) => {
          const current = renderer.customEmojis.get(docId) || new Set();
          elements.forEach((element) => current.add(element));
          renderer.customEmojis.set(docId, current);
        });
      });
      renderer.forceRender = vi.fn();
      renderer.destroy = vi.fn();
      customEmojiRenderingMocks.renderers.push(renderer);
      return renderer;
    });
  });

  function mountEditor(
    snapshot?: ReturnType<ChatInputEditor['snapshot']>,
    options: ChatInputEditorOptions = {}
  ) {
    const {editor, input} = mountChatInputEditor(options, snapshot);
    editors.push(editor);
    return {editor, input};
  }

  function mountInputFieldEditor() {
    const inputField = new InputField({
      placeholder: 'Message',
      withLinebreaks: true
    });
    document.body.append(inputField.container);
    const editor = createChatInputEditor(inputField.input);
    editors.push(editor);
    return {editor, inputField};
  }

  function mountPendingUpload(action?: 'add' | 'replace') {
    const {editor, input} = mountEditor();
    const photo = (id: string) => ({
      _: 'photo', id, access_hash: id, file_reference: new Uint8Array([1])
    }) as Photo.photo;
    if(action) {
      editor.insertRichMedia([{type: 'photo', photo: photo('900'), previewUrl: 'blob:upload-original'}]);
      editor.setDocument(editor.getDocument());
    }
    const before = editor.getDocument();
    const tiptap = (editor as TiptapEditorInternals).editor;
    if(action) tiptap.view.dispatch(tiptap.state.tr.setSelection(NodeSelection.create(tiptap.state.doc, 0)));
    const uploadId = `selection-upload-${action || 'insert'}`;
    expect(editor.beginRichMediaUpload({
      action,
      activeIndex: action ? 0 : undefined,
      id: uploadId,
      items: [{id: `${uploadId}-0`, progress: .2, state: 'uploading', type: 'photo'}],
      previewUrls: ['blob:upload-new'],
      selection: editor.captureSelection()
    })).toBe(true);
    return {editor, input, tiptap, before, uploadId, uploaded: {type: 'photo' as const, photo: photo('901')}};
  }

  function mountReconciledUpload(action?: 'add' | 'replace') {
    const fixture = mountPendingUpload(action);
    const {editor, uploadId, uploaded} = fixture;
    const task = {editor, id: uploadId, items: [{uploaded: undefined as typeof uploaded | undefined}]};
    const tasks = new Map([[uploadId, task]]);
    const handlers = {
      cancel: vi.fn((task: {id: string}, removeNode: boolean) => {
        if(removeNode) editor.removeRichMediaUpload(task.id);
        tasks.delete(task.id);
      }),
      complete: vi.fn((task: {id: string}) => tasks.delete(task.id)),
      update: vi.fn()
    };
    return {...fixture, task, tasks, handlers, reconcile: () => reconcileRichMediaUploads(editor, tasks, handlers)};
  }

  function expectSingleTerminalParagraph(input: HTMLElement, tiptap: Editor) {
    const {doc} = tiptap.state;
    const terminal = doc.lastChild;
    expect(terminal?.type.name).toBe('paragraph');
    expect(terminal?.content.size).toBe(0);

    const placeholders = input.querySelectorAll<HTMLElement>(
      '.chat-input-trailing-placeholder'
    );
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].dataset.placeholder).toBe(I18n.format(
      'Chat.Input.Editor.TrailingPlaceholder',
      true
    ));
    const position = doc.content.size - terminal!.nodeSize;
    expect(tiptap.view.nodeDOM(position)).toBe(placeholders[0]);
    return {node: terminal!, position};
  }

  function logicalContent(tiptap: Editor) {
    return (tiptap.getJSON().content || []).slice(0, -1);
  }

  function logicalTopLevelText(tiptap: Editor) {
    return Array.from({length: tiptap.state.doc.childCount - 1}, (_value, index) => (
      tiptap.state.doc.child(index).textContent
    ));
  }

  function insertPhotoSlideshow(
    editor: ChatInputEditor,
    input: HTMLElement,
    options: {count: number, idOffset: number, previewPrefix: string}
  ) {
    const photos = Array.from({length: options.count}, (_, index) => {
      const id = options.idOffset + index;
      return {
        _: 'photo',
        id: String(id),
        access_hash: String(id + 100),
        file_reference: new Uint8Array([index + 1])
      } as Photo.photo;
    });
    const uploadId = `upload-${options.previewPrefix}-seed`;
    expect(editor.beginRichMediaUpload({
      grouped: true,
      id: uploadId,
      items: photos.map((_photo, index) => ({
        id: `${uploadId}-${index}`,
        progress: 1,
        state: 'ready',
        type: 'photo'
      })),
      previewUrls: photos.map((_photo, index) => (
        `blob:${options.previewPrefix}-${index}`
      )),
      selection: editor.captureSelection()
    })).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);
    const emptyCaption = {
      _: 'pageCaption' as const,
      text: {_: 'textEmpty' as const},
      credit: {_: 'textEmpty' as const}
    };
    const seedNode = tiptap.state.doc.firstChild!;
    tiptap.view.dispatch(tiptap.state.tr.setNodeMarkup(0, undefined, {
      ...seedNode.attrs,
      block: {
        _: 'pageBlockSlideshow',
        items: photos.map((photo) => ({
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: photo.id,
          caption: emptyCaption
        })),
        caption: emptyCaption
      } satisfies PageBlock.pageBlockSlideshow,
      photos,
      uploadGrouped: false,
      uploadId: '',
      uploadItems: [],
      uploadPreviewUrls: []
    }));

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const slideshow = media.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    const itemsContainer = slideshow.querySelector<HTMLElement>(`.${slideshowStyles.Items}`)!;
    const items = [...media.querySelectorAll<HTMLElement>('.chat-input-rich-media-item')];
    const images = items.map((item) => (
      item.querySelector<HTMLImageElement>('img.media-photo')!
    ));
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(items).toHaveLength(options.count);
    expect(images.map((image) => image.getAttribute('src'))).toEqual(
      photos.map((_photo, index) => `blob:${options.previewPrefix}-${index}`)
    );

    return {images, items, itemsContainer, media, photos, slideshow, tiptap};
  }

  function selectAllText(editor: ChatInputEditor, length: number) {
    editor.restoreSelection({from: 1, to: length + 1}, false);
  }

  function applyToText(type: MarkdownType, options: {dateSuffix?: string, href?: string} = {}) {
    const {editor} = mountEditor();
    editor.setTextWithEntities('sample');
    selectAllText(editor, 6);
    expect(editor.applyMarkup({type, ...options})).toBe(true);
    return editor.getRichValue();
  }

  async function openRichMediaMenu(input: HTMLElement, index = 0) {
    const more = input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-rich-media-more'
    )[index];
    expect(more).not.toBeNull();
    await vi.waitFor(() => {
      expect(more?.classList.contains('btn-menu-toggle')).toBe(true);
    });
    more!.click();
    let menu: HTMLElement;
    await vi.waitFor(() => {
      menu = document.body.querySelector<HTMLElement>('.btn-menu.active')!;
      expect(menu).not.toBeNull();
    });
    return menu!;
  }

  function richMediaMenuItem(menu: HTMLElement, label: string) {
    return Array.from(menu.querySelectorAll<HTMLElement>('.btn-menu-item')).find((item) => (
      item.textContent?.trim() === label ||
      I18n.format(item.dataset.langKey as never, true) === label
    ));
  }

  afterEach(() => {
    editors.splice(0).forEach((editor) => editor.destroy());
    vi.restoreAllMocks();
    document.body.replaceChildren();
    setAppSettingsSilent('sendShortcut', 'enter');
  });

  return {customEmojiRenderingMocks, editors, mountEditor, mountInputFieldEditor, mountPendingUpload, mountReconciledUpload, expectSingleTerminalParagraph, logicalContent, logicalTopLevelText, insertPhotoSlideshow, selectAllText, applyToText, openRichMediaMenu, richMediaMenuItem};
}
