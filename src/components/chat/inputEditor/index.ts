import '@components/chat/inputEditor/style.scss';
import {Editor, getMarkRange, JSONContent, selectionToInsertionEnd} from '@tiptap/core';
import {detectCodeLanguage} from '@/codeLanguages';
import {closeHistory, redoNoScroll, undoNoScroll} from '@tiptap/pm/history';
import {Fragment, Slice} from '@tiptap/pm/model';
import type {Node as ProseMirrorNode} from '@tiptap/pm/model';
import {
  AllSelection,
  EditorState,
  NodeSelection,
  Plugin,
  Selection,
  TextSelection,
  Transaction
} from '@tiptap/pm/state';
import {CellSelection, TableMap, cellAround} from '@tiptap/pm/tables';
import type {EditorView} from '@tiptap/pm/view';
import {ReplaceStep} from '@tiptap/pm/transform';
import {
  InstantViewHeadingLevel,
  instantViewStyles
} from '@components/instantViewFormatting';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {handleMarkdownShortcut} from '@helpers/dom/markdown';
import type {MarkdownType} from '@helpers/dom/getRichElementValue';
import classNames from '@helpers/string/classNames';
import type {Document, MessageEntity, PageBlock, Photo, RichMessage, RichText} from '@layer';
import {
  CHAT_INPUT_EXTENSIONS,
  PLAIN_MESSAGE_EXTENSIONS,
  SINGLE_LINE_MESSAGE_EXTENSIONS,
  TIPTAP_BASE_EXTENSIONS
} from '@components/chat/inputEditor/extensions';
import {PLAIN_MESSAGE_MARK_NAMES, PLAIN_MESSAGE_NODE_NAMES} from '@components/chat/inputEditor/plainSchema';
import {ChatTrailingPlaceholder} from '@components/chat/inputEditor/extensions/trailingPlaceholder';
import {moveSelectionToDetailsSummaryOnClose} from '@components/chat/inputEditor/extensions/details';
import {moveSelectedTopLevelBlock, selectedStructuralTopLevelRange} from '@components/chat/inputEditor/extensions/blockStructure';
import {wrapBareChatInputTables} from '@components/chat/inputEditor/extensions/tableNodes';
import {markProseMirrorPaste} from '@components/chat/inputEditor/paste';
import {
  getChatInputEditor,
  registerChatInputEditor
} from '@components/chat/inputEditor/registry';
import {
  CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT,
  CHAT_INPUT_MATH_MODE_REQUEST_EVENT,
  CHAT_INPUT_RICH_MEDIA_UPLOAD_UPDATE_EVENT,
  ChatInputMathModeRequestEvent,
  ChatInputRichMediaUploadUpdateEvent
} from '@components/chat/inputEditor/events';
import runHistoryCommandPreservingSelection from '@components/chat/inputEditor/history';
import {
  handleEmptyParagraphBackspaceAfterRichMedia,
  handleRichMediaCaptionBackspace,
  getRichMediaPreviewUrls,
  groupRichMediaNodes,
  preserveRichMediaSelection,
  richMediaSiblingInsertionPosition,
  ungroupRichMediaNode,
  withoutRichMediaUpload
} from '@components/chat/inputEditor/richMedia';
import {RICH_MEDIA_ACTION_SETTLED_META} from '@components/chat/inputEditor/mediaUploadHistory';
import {richReplacementSlice, selectedRichContent, withCopiedOrderedListStarts} from '@components/chat/inputEditor/selectionSlice';
import {
  clampSelectionOutsideTrailingPlaceholder,
  isTrailingPlaceholderNode,
  normalizeBlockOnlyQuotes,
  telegramTextToTiptap,
  telegramTextToTiptapInlineContent,
  tiptapToTelegram,
  withoutTrailingPlaceholder
} from '@components/chat/inputEditor/model';
import {
  inferRichMessageNoAutolink,
  normalizeOpaqueRichBlockForInput,
  richTextPlainText,
  richTextToTiptapInlineContent,
  richMessageToTiptap,
  splitOversizedRichMediaCollage,
  tiptapDocumentToCaptionRichText,
  tiptapToRichMessage
} from '@components/chat/inputEditor/richMessage';
import {
  replaceChatTableClipboardEmojiNodes,
  serializeChatTableClipboardText
} from '@components/chat/inputEditor/tableClipboard';
import {
  deleteChatInputTable,
  getChatInputTableSelection
} from '@components/chat/inputEditor/tableCommands';
import {
  CHAT_TABLE_TITLE_NODE_NAME,
  CHAT_TABLE_WRAPPER_NODE_NAME
} from '@components/chat/inputEditor/tableSchema';
import type {
  ChatInputEditor,
  ChatInputEditorInputEvent,
  ChatInputEditorMode,
  ChatInputRichMessage,
  ChatInputEditorOptions,
  ChatInputEditorSelection,
  ChatInputEditorSnapshot,
  ChatInputDetailsOptions,
  ChatInputFooterOptions,
  ChatInputMapOptions,
  ChatInputMarkupState,
  ChatInputOpaqueRichBlock,
  ChatInputPullquoteOptions,
  ChatInputRichMedia,
  ChatInputRichMediaLayout,
  ChatInputRichMediaOptions,
  ChatInputRichMediaUploadItem,
  ChatInputRichMediaUploadOptions,
  ChatInputRichButtonOptions,
  ChatInputTableOptions,
  CreateChatInputEditor
} from '@components/chat/inputEditor/types';
import {
  CHAT_INPUT_EDITOR_TEST_MEDIA_REQUEST_EVENT,
  ChatInputEditorTestMediaRequest,
  createChatInputEditorTestData
} from '@components/chat/inputEditor/testData';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';
import {
  CODE_LANGUAGE_DETECTION_META,
  getDetectedCodeBlockLanguage,
  getEffectiveCodeBlockLanguage,
  withDetectedCodeBlockLanguage,
  withoutDetectedCodeBlockLanguage
} from '@components/chat/inputEditor/codeLanguage';
import keepChatInputSelectionVisible from '@components/chat/inputEditor/selectionVisibility';
import {getReferencedRichMediaUploadIds, RichMediaPreviewHistoryLease} from '@components/chat/inputEditor/mediaPreviewUrl';
import {canonicalOrderedListType} from '@lib/richTextProcessor/orderedList';
import {isCollapsibleQuote} from '@components/chat/inputEditor/extensions/quotes';
import {createRichButtonNode} from '@components/chat/inputEditor/extensions/richButtons';
import {BUTTON_ROW_NODE_NAME} from '@components/chat/inputEditor/richButtonModel';

const SILENT_EDITOR_UPDATE_META = 'chatInputEditorSilentUpdate';
const TEST_DATA_QUERY_PARAM = 'fillChatInputEditorTestData';

function getActiveChatInputEditor() {
  const inputs = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-chat-input-editor="tiptap"]'
  ));
  const activeElement = document.activeElement;
  const focused = inputs.find((input) => (
    input === activeElement || input.contains(activeElement)
  ));
  if(focused) return getChatInputEditor(focused);

  for(let index = inputs.length - 1; index >= 0; --index) {
    const input = inputs[index];
    if(!input.getClientRects().length) continue;
    const editor = getChatInputEditor(input);
    if(editor) return editor;
  }
}

function fillChatInputEditorTestData(editor?: ChatInputEditor) {
  editor ||= getActiveChatInputEditor();
  if(!editor) return false;

  const mediaRequest: ChatInputEditorTestMediaRequest = {};
  const EventConstructor = editor.input.ownerDocument.defaultView?.CustomEvent || CustomEvent;
  editor.input.dispatchEvent(new EventConstructor(
    CHAT_INPUT_EDITOR_TEST_MEDIA_REQUEST_EVENT,
    {bubbles: true, detail: mediaRequest}
  ));
  if(!editor.setDocument(createChatInputEditorTestData({
    includeLocalMediaPreview: !mediaRequest.uploadMedia
  }))) return false;

  editor.focusAtEnd();
  const InputEventConstructor = editor.input.ownerDocument.defaultView?.Event || Event;
  const event = new InputEventConstructor(
    'input',
    {bubbles: true, cancelable: true}
  ) as ChatInputEditorInputEvent;
  event.chatInputEditorUserInput = true;
  editor.input.dispatchEvent(event);
  return mediaRequest.uploadMedia?.() || true;
}

function exposeChatInputEditorTestDataHelper(appWindow: Window) {
  appWindow.fillChatInputEditorTestData = fillChatInputEditorTestData;
}

function fillChatInputEditorTestDataFromQuery(
  appWindow: Window,
  editor: ChatInputEditor
) {
  const url = new URL(appWindow.location.href);
  if(!url.searchParams.has(TEST_DATA_QUERY_PARAM)) return;

  url.searchParams.delete(TEST_DATA_QUERY_PARAM);
  appWindow.history.replaceState(appWindow.history.state, '', url);
  // Draft restoration finishes after the editor itself is mounted. Give it a
  // chance to settle so the explicit preview fixture is not overwritten.
  appWindow.setTimeout(() => {
    void Promise.resolve(fillChatInputEditorTestData(editor)).catch(console.error);
  }, 10_000);
}

if(import.meta.env.DEV || import.meta.env.VITE_PREVIEW) {
  exposeChatInputEditorTestDataHelper(window);
}

function markupName(type: MarkdownType) {
  const names: Partial<Record<MarkdownType, string>> = {
    date: 'formattedDate',
    monospace: 'code',
    strikethrough: 'strike'
  };
  return names[type] || type;
}

function insertedContent(document: JSONContent, parentType?: string) {
  const blocks = document.content || [];
  if(blocks.length === 1 && (
    blocks[0].type === 'paragraph' ||
    blocks[0].type === 'codeBlock' && parentType === 'codeBlock'
  )) {
    return blocks[0].content || [];
  }
  return blocks;
}

function inlineSelectionDocument(state: EditorState) {
  const {selection, schema} = state;
  if(!(selection instanceof TextSelection)) return;
  const {$from, $to} = selection;
  if(!$from.sameParent($to) || !$from.parent.isTextblock) return;
  const parent = $from.parent;
  const code = parent.type.name === 'codeBlock';
  const type = code ? parent.type : schema.nodes.paragraph;
  const attrs = code ? {
    ...parent.attrs,
    language: getEffectiveCodeBlockLanguage(parent.attrs, parent.textContent)
  } : undefined;
  return schema.nodes.doc.create(null, type.create(
    attrs,
    parent.content.cut($from.parentOffset, $to.parentOffset)
  ));
}

function withNormalizedOrderedListStarts(node: JSONContent): JSONContent {
  const content = node.content?.map(withNormalizedOrderedListStarts);
  if(node.type !== 'orderedList') {
    return content ? {...node, content} : node;
  }
  const attrs = {...node.attrs};
  const currentStart = Number.isInteger(attrs.start) ? attrs.start as number : 1;
  const startExplicit = attrs.startExplicit ??
    currentStart !== 1;
  return {
    ...node,
    attrs: {
      ...attrs,
      start: startExplicit ?
        currentStart :
        attrs.reversed ? content?.length || 1 : 1,
      startExplicit
    },
    content
  };
}

function withTrailingPlaceholder(
  document: JSONContent,
  hasExistingPlaceholder = false
) {
  if(document.type !== 'doc') return document;
  const content = [...(document.content || [])];
  const last = content[content.length - 1];
  const emptyParagraph = last?.type === 'paragraph' && !(last.content?.length);
  if(!content.length) {
    content.push({type: 'paragraph'});
  } else if(
    !(content.length === 1 && emptyParagraph) &&
    !(hasExistingPlaceholder && emptyParagraph)
  ) {
    content.push({type: 'paragraph'});
  }
  return {...document, content};
}

/**
 * Everything the clipboard brought, as one line. The schema of a one-line field
 * has no block structure, so what arrives is already paragraphs of inline
 * content; they are concatenated rather than separated, which is what pasting
 * two lines into such a field used to do.
 */
function flattenSliceToInline(slice: Slice) {
  const inline: ProseMirrorNode[] = [];
  const collect = (fragment: Fragment) => {
    fragment.forEach((node) => {
      if(node.isInline) inline.push(node);
      else collect(node.content);
    });
  };
  collect(slice.content);
  return new Slice(Fragment.fromArray(inline), 0, 0);
}

function stripCopiedPlaceholders(slice: Slice, view: EditorView) {
  const strip = (fragment: Fragment, root = false): Fragment => {
    const children: ProseMirrorNode[] = [];
    let changed = false;
    fragment.forEach((node, _offset, index) => {
      const trailing = root && index === fragment.childCount - 1 &&
        view.state.selection instanceof AllSelection && isTrailingPlaceholderNode(node);
      if(trailing || node.type.name === 'blockquoteCaption' && !node.content.size) {
        changed = true;
        return;
      }
      const content = node.isLeaf ? node.content : strip(node.content);
      changed ||= content !== node.content;
      children.push(node.copy(content));
    });
    return changed ? Fragment.fromArray(children) : fragment;
  };
  const content = strip(slice.content, true);
  if(content === slice.content) return slice;
  if(!content.size) return Slice.empty;
  const maxOpen = Slice.maxOpen(content);
  return new Slice(content, Math.min(slice.openStart, maxOpen.openStart), Math.min(slice.openEnd, maxOpen.openEnd));
}

function inlineCopiedSoleParagraph(slice: Slice, view: EditorView) {
  const {doc, schema, selection} = view.state;
  const paragraph = doc.firstChild;
  const logicalChildCount = doc.childCount - (
    isTrailingPlaceholderNode(doc.lastChild) ? 1 : 0
  );
  if(
    !(selection instanceof AllSelection) ||
    logicalChildCount !== 1 ||
    paragraph?.type !== schema.nodes.paragraph ||
    !paragraph.content.size ||
    paragraph.lastChild?.type === schema.nodes.hardBreak ||
    slice.openStart !== 0 ||
    slice.openEnd !== 0 ||
    slice.content.childCount !== 1 ||
    slice.content.firstChild?.type !== schema.nodes.paragraph
  ) return slice;

  // Mod-A selects the whole document, so ProseMirror normally closes the
  // paragraph in the clipboard slice. Its plain-text representation has no
  // newline, though, and pasting that closed slice creates a surprising block.
  return new Slice(slice.content, 1, 1);
}

function wholeTableClipboardNode(
  view: EditorView,
  tablePosition: number,
  table: ProseMirrorNode
) {
  const $table = view.state.doc.resolve(tablePosition);
  return (
    $table.depth > 0 &&
    $table.parent.type.name === CHAT_TABLE_WRAPPER_NODE_NAME &&
    $table.nodeAfter === table
  ) ? $table.parent : table;
}

function selectedTableClipboardNode(view: EditorView) {
  const {selection, schema} = view.state;
  if(!(selection instanceof CellSelection)) return;
  const tablePosition = selection.$anchorCell.start(-1) - 1;
  const descriptor = getChatInputTableSelection(view.state, tablePosition);
  if(descriptor?.kind === 'table') return wholeTableClipboardNode(view, tablePosition, descriptor.table);
  const content = selection.content().content;
  const first = content.firstChild;
  return content.childCount === 1 && first?.type === schema.nodes.table ?
    first.type.create({...first.attrs, title: '', titleRichHTML: null, titleRichText: null}, first.content) :
    schema.nodes.table.create(null, content);
}

function transformCopiedContent(slice: Slice, view: EditorView) {
  let transformed = slice;
  if(view.state.selection instanceof CellSelection) {
    const tablePosition = view.state.selection.$anchorCell.start(-1) - 1;
    const descriptor = getChatInputTableSelection(view.state, tablePosition);
    if(descriptor?.kind === 'table') {
      transformed = new Slice(Fragment.from(wholeTableClipboardNode(
        view,
        tablePosition,
        descriptor.table
      )), 0, 0);
    }
  }

  transformed = stripCopiedPlaceholders(transformed, view);
  if(!(view.state.selection instanceof CellSelection)) {
    transformed = inlineCopiedSoleParagraph(transformed, view);
  }
  return replaceChatTableClipboardEmojiNodes(withCopiedOrderedListStarts(transformed, view.state.selection));
}

function pasteClosedSingleParagraphInline(
  view: EditorView,
  event: ClipboardEvent,
  slice: Slice
) {
  const {schema, selection} = view.state;
  const paragraph = slice.content.firstChild;
  const clipboardText = (
    event.clipboardData?.getData('text/plain') ||
    event.clipboardData?.getData('Text') ||
    ''
  ).replace(/\r\n?/g, '\n');
  if(
    !(selection instanceof TextSelection) ||
    !clipboardText ||
    clipboardText.endsWith('\n') ||
    slice.openStart !== 0 ||
    slice.openEnd !== 0 ||
    slice.content.childCount !== 1 ||
    paragraph?.type !== schema.nodes.paragraph ||
    !paragraph.content.size ||
    paragraph.lastChild?.type === schema.nodes.hardBreak
  ) return false;

  // Chromium may put a closed `0 0` paragraph on the system clipboard even
  // though our text/plain serializer has no newline. Treat that mismatch as
  // inline content so pasting at a caret doesn't split the current paragraph.
  view.dispatch(
    view.state.tr
    .replaceSelection(new Slice(slice.content, 1, 1))
    .scrollIntoView()
    .setMeta('paste', true)
    .setMeta('uiEvent', 'paste')
  );
  return true;
}

function textContent(text = ''): JSONContent[] | undefined {
  return text ? [{type: 'text', text}] : undefined;
}

function withoutLinkMarks(node: JSONContent): JSONContent {
  const marks = node.marks?.filter((mark) => mark.type !== 'link');
  return {
    ...node,
    marks: marks?.length ? marks : undefined,
    content: node.content?.map(withoutLinkMarks)
  };
}

function editableQuoteBodyHasContent(
  content: JSONContent[] | undefined,
  captionType: string
) {
  return !!content?.some((child) => child.type !== captionType && (
    child.type === 'text' ? !!child.text :
      !!child.content?.length || child.type !== 'paragraph'
  ));
}

function normalizeEditableRichBlocks(node: JSONContent): JSONContent {
  const opaqueBlock = node.attrs?.block as PageBlock | undefined;
  if(node.type === 'opaqueRichBlock' && opaqueBlock?._ === 'pageBlockAnchor') {
    return {type: 'richAnchor', attrs: {name: opaqueBlock.name}};
  }

  let content = node.content?.map(normalizeEditableRichBlocks);
  if(
    (node.type === 'tableCell' || node.type === 'tableHeader') &&
    content?.length > 1 &&
    content.every((child) => child.type === 'paragraph')
  ) {
    const inlineContent: JSONContent[] = [];
    content.forEach((paragraph, index) => {
      if(index) inlineContent.push({type: 'hardBreak'});
      inlineContent.push(...(paragraph.content || []));
    });
    content = [{
      type: 'paragraph',
      content: inlineContent.length ? inlineContent : undefined
    }];
  } else if(node.type === 'detailsSummary') {
    content = content?.map(withoutLinkMarks);
  } else if(node.type === 'blockquote' &&
    content?.[content.length - 1]?.type !== 'blockquoteCaption') {
    const richCaption = node.attrs?.captionRichText as RichText | undefined;
    const caption = richCaption?._ ?
      richTextToTiptapInlineContent(richCaption) :
      textContent(`${node.attrs?.caption || ''}`);
    const body = content?.length ? content : [{type: 'paragraph'}];
    content = editableQuoteBodyHasContent(body, 'blockquoteCaption') || caption?.length ? [
      ...body,
      {
        type: 'blockquoteCaption',
        content: caption?.length ? caption : undefined
      }
    ] : body;
  } else if(node.type === 'pullquote' &&
    content?.[content.length - 1]?.type !== 'pullquoteCaption') {
    content = [
      ...(content?.length ? content : [{type: 'pullquoteText'}]),
      {type: 'pullquoteCaption'}
    ];
  }
  return {...node, content};
}

function captionContent(
  text: string,
  entities: MessageEntity[] = []
): JSONContent[] | undefined {
  if(!text) return;
  const content = telegramTextToTiptapInlineContent(text, entities);
  return content.length ? content : undefined;
}

function captionRichText(text = '', entities: MessageEntity[] = []) {
  return tiptapDocumentToCaptionRichText({
    type: 'paragraph',
    content: captionContent(text, entities)
  });
}

type VisualRichMediaBlock =
  PageBlock.pageBlockPhoto |
  PageBlock.pageBlockVideo;

type VisualRichMediaEntry = {
  block: VisualRichMediaBlock,
  documents: Document.document[],
  photos: Photo.photo[],
  previewUrls: string[]
};

function emptyRichMediaCaption() {
  return {
    _: 'pageCaption' as const,
    text: {_: 'textEmpty' as const},
    credit: {_: 'textEmpty' as const}
  };
}

function visualRichMediaEntry(media: ChatInputRichMedia): VisualRichMediaEntry | undefined {
  if(media.type === 'photo' && media.photo) {
    return {
      block: {
        _: 'pageBlockPhoto',
        pFlags: {spoiler: media.spoiler ? true : undefined},
        photo_id: media.photo.id,
        caption: emptyRichMediaCaption()
      },
      documents: [],
      photos: [media.photo],
      previewUrls: [media.previewUrl || '']
    };
  }
  if(media.type === 'video' && media.document) {
    return {
      block: {
        _: 'pageBlockVideo',
        pFlags: {spoiler: media.spoiler ? true : undefined},
        video_id: media.document.id,
        caption: emptyRichMediaCaption()
      },
      documents: [media.document],
      photos: [],
      previewUrls: [media.previewUrl || '']
    };
  }
}

function visualRichMediaBlock(block: PageBlock | undefined): block is VisualRichMediaBlock {
  return block?._ === 'pageBlockPhoto' || block?._ === 'pageBlockVideo';
}

function visualRichMediaItems(block: PageBlock | undefined): VisualRichMediaBlock[] | undefined {
  if(visualRichMediaBlock(block)) return [block];
  if(block?._ !== 'pageBlockCollage' && block?._ !== 'pageBlockSlideshow') return;
  return block.items.every(visualRichMediaBlock) ?
    block.items as VisualRichMediaBlock[] :
    undefined;
}

function resourcesForVisualRichMedia(
  items: VisualRichMediaBlock[],
  photos: Photo.photo[],
  documents: Document.document[]
) {
  const photosById = new Map(photos.map((photo) => [String(photo.id), photo]));
  const documentsById = new Map(documents.map((document) => (
    [String(document.id), document]
  )));
  const usedPhotoIds = new Set<string>();
  const usedDocumentIds = new Set<string>();
  const outputPhotos: Photo.photo[] = [];
  const outputDocuments: Document.document[] = [];
  items.forEach((item) => {
    if(item._ === 'pageBlockPhoto') {
      const id = String(item.photo_id);
      const photo = photosById.get(id);
      if(photo && !usedPhotoIds.has(id)) {
        usedPhotoIds.add(id);
        outputPhotos.push(photo);
      }
    } else {
      const id = String(item.video_id);
      const document = documentsById.get(id);
      if(document && !usedDocumentIds.has(id)) {
        usedDocumentIds.add(id);
        outputDocuments.push(document);
      }
    }
  });
  return {documents: outputDocuments, photos: outputPhotos};
}

function addedRichMediaNodeAttrs(
  node: ProseMirrorNode,
  activeIndex: number,
  media: ChatInputRichMedia[]
) {
  if(node.type.name !== 'richMedia' || !media.length) return;
  const block = node.attrs.block as PageBlock | undefined;
  const currentItems = visualRichMediaItems(block);
  const entries = media.map(visualRichMediaEntry);
  if(
    !currentItems ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= currentItems.length ||
    entries.some((entry) => !entry)
  ) return;

  const visualEntries = entries as VisualRichMediaEntry[];
  const insertedItems = visualEntries.map(({block}) => block);
  const items = [
    ...currentItems.slice(0, activeIndex + 1),
    ...insertedItems,
    ...currentItems.slice(activeIndex + 1)
  ].map((item) => ({...item, caption: emptyRichMediaCaption()}));
  const nextBlock: PageBlock.pageBlockCollage | PageBlock.pageBlockSlideshow = (
    block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow'
  ) ? {
      ...block,
      items
    } : {
      _: 'pageBlockCollage',
      items,
      caption: emptyRichMediaCaption()
    };
  if(
    nextBlock._ === 'pageBlockCollage' &&
    nextBlock.items.length > MESSAGES_ALBUM_MAX_SIZE
  ) return;
  const resources = resourcesForVisualRichMedia(
    items,
    [
      ...(node.attrs.photos as Photo.photo[] || []),
      ...visualEntries.flatMap(({photos}) => photos)
    ],
    [
      ...(node.attrs.documents as Document.document[] || []),
      ...visualEntries.flatMap(({documents}) => documents)
    ]
  );
  const previewUrls = getRichMediaPreviewUrls(node, currentItems.length);
  previewUrls.splice(
    activeIndex + 1,
    0,
    ...visualEntries.flatMap((entry) => entry.previewUrls)
  );
  return {
    ...node.attrs,
    block: nextBlock,
    ...resources,
    previewUrl: previewUrls[0] || '',
    previewUrls
  };
}

function replacedRichMediaNodeAttrs(
  node: ProseMirrorNode,
  activeIndex: number,
  media: ChatInputRichMedia
) {
  const entry = visualRichMediaEntry(media);
  if(node.type.name !== 'richMedia' || !entry) return;
  const block = node.attrs.block as PageBlock | undefined;
  const currentItems = visualRichMediaItems(block);
  if(
    !currentItems ||
    !Number.isInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex >= currentItems.length
  ) return;

  const items = currentItems.map((item, index) => (
    index === activeIndex ? entry.block : item
  ));
  const nextBlock = (
    block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow'
  ) ? {
      ...block,
      items
    } : entry.block;
  const resources = resourcesForVisualRichMedia(
    items,
    [
      ...(node.attrs.photos as Photo.photo[] || []),
      ...entry.photos
    ],
    [
      ...(node.attrs.documents as Document.document[] || []),
      ...entry.documents
    ]
  );
  const previewUrls = getRichMediaPreviewUrls(node, currentItems.length);
  previewUrls[activeIndex] = entry.previewUrls[0] || '';
  return {
    ...node.attrs,
    block: nextBlock,
    ...resources,
    previewUrl: previewUrls[0] || '',
    previewUrls
  };
}

type RichMediaEntry = {
  block:
    PageBlock.pageBlockAudio |
    PageBlock.pageBlockCollage |
    PageBlock.pageBlockPhoto |
    PageBlock.pageBlockVideo,
  documents: Document.document[],
  photos: Photo.photo[],
  previewUrls: string[]
};

function richMediaJSONContent(
  media: ChatInputRichMedia[],
  {
    caption = '',
    captionEntities = [],
    grouped = false
  }: ChatInputRichMediaOptions = {},
  firstContent = captionContent(caption, captionEntities)
) {
  const entries: RichMediaEntry[] = [];
  media.forEach((item) => {
    const visual = visualRichMediaEntry(item);
    if(visual) {
      entries.push(visual);
    } else if(item.type === 'audio' && item.document) {
      entries.push({
        block: {
          _: 'pageBlockAudio',
          audio_id: item.document.id,
          caption: emptyRichMediaCaption()
        },
        photos: [],
        documents: [item.document],
        previewUrls: [item.previewUrl || '']
      });
    }
  });
  if(!entries.length) return [];

  type VisualEntry = RichMediaEntry & {
    block: PageBlock.pageBlockPhoto | PageBlock.pageBlockVideo
  };
  let outputEntries = entries;
  if(grouped) {
    outputEntries = [];
    let visualRun: VisualEntry[] = [];
    const appendVisualRun = () => {
      if(!visualRun.length) return;
      const blocks = visualRun.length === 1 ?
        [visualRun[0].block] :
        splitOversizedRichMediaCollage({
          _: 'pageBlockCollage',
          items: visualRun.map(({block}) => block),
          caption: emptyRichMediaCaption()
        });
      let offset = 0;
      blocks.forEach((block) => {
        const length = block._ === 'pageBlockCollage' ? block.items.length : 1;
        const chunk = visualRun.slice(offset, offset + length);
        outputEntries.push({
          block,
          photos: chunk.flatMap(({photos}) => photos),
          documents: chunk.flatMap(({documents}) => documents),
          previewUrls: chunk.flatMap(({previewUrls}) => previewUrls)
        });
        offset += length;
      });
      visualRun = [];
    };

    entries.forEach((entry) => {
      if(entry.block._ === 'pageBlockPhoto' || entry.block._ === 'pageBlockVideo') {
        visualRun.push(entry as VisualEntry);
      } else {
        appendVisualRun();
        outputEntries.push(entry);
      }
    });
    appendVisualRun();
  }

  const splitVisualCollage = (
    grouped &&
    entries.length > MESSAGES_ALBUM_MAX_SIZE &&
    entries.every(({block}) => (
      block._ === 'pageBlockPhoto' || block._ === 'pageBlockVideo'
    ))
  );
  const captionIndex = splitVisualCollage ? outputEntries.length - 1 : 0;
  return outputEntries.map((entry, index): JSONContent => ({
    type: 'richMedia',
    attrs: {
      block: entry.block,
      captionCredit: emptyRichMediaCaption().credit,
      photos: entry.photos,
      documents: entry.documents,
      previewUrl: entry.previewUrls[0] || '',
      previewUrls: entry.previewUrls
    },
    content: index === captionIndex ? firstContent : undefined
  }));
}

function pendingRichMediaBlock(
  uploadId: string,
  items: ChatInputRichMediaUploadItem[],
  grouped: boolean
) {
  type PendingRichMediaBlock =
    PageBlock.pageBlockAudio |
    VisualRichMediaBlock;
  const blocks = items.map((item, index): PendingRichMediaBlock => {
    const resourceId = `upload-${uploadId}-${index}` as Long;
    if(item.type === 'audio') {
      return {
        _: 'pageBlockAudio',
        audio_id: resourceId,
        caption: emptyRichMediaCaption()
      };
    }
    return item.type === 'video' ? {
      _: 'pageBlockVideo',
      pFlags: {},
      video_id: resourceId,
      caption: emptyRichMediaCaption()
    } : {
      _: 'pageBlockPhoto',
      pFlags: {},
      photo_id: resourceId,
      caption: emptyRichMediaCaption()
    };
  });
  const visualBlocks = blocks.filter(visualRichMediaBlock);
  if(grouped && visualBlocks.length > MESSAGES_ALBUM_MAX_SIZE) return;
  if(grouped && blocks.length > 1 && visualBlocks.length === blocks.length) {
    return {
      _: 'pageBlockCollage',
      items: visualBlocks,
      caption: emptyRichMediaCaption()
    } as PageBlock.pageBlockCollage;
  }
  if(blocks.length > 1) return;
  return blocks[0];
}

function selectedNode(editor: Editor, type: string) {
  const {selection} = editor.state;
  if(selection instanceof NodeSelection && selection.node.type.name === type) {
    return {node: selection.node, position: selection.from};
  }

  const {$from} = selection;
  for(let depth = $from.depth; depth > 0; --depth) {
    const node = $from.node(depth);
    if(node.type.name === type) return {
      node,
      position: $from.before(depth)
    };
  }
}

function selectedChatTable({
  doc,
  selection
}: Pick<EditorState, 'doc' | 'selection'>) {
  if(
    selection instanceof NodeSelection &&
    selection.node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME
  ) {
    const wrapper = selection.node;
    const title = wrapper.firstChild;
    const table = wrapper.lastChild;
    if(
      title?.type.name !== CHAT_TABLE_TITLE_NODE_NAME ||
      table?.type.spec.tableRole !== 'table'
    ) return;
    return {
      table,
      tablePosition: selection.from + 1 + title.nodeSize,
      title,
      titlePosition: selection.from + 1,
      wrapper,
      wrapperPosition: selection.from
    };
  }
  const {$from} = selection;
  for(let depth = $from.depth; depth > 0; --depth) {
    const node = $from.node(depth);
    if(node.type.name === CHAT_TABLE_WRAPPER_NODE_NAME) {
      const title = node.firstChild;
      const table = node.lastChild;
      if(
        title?.type.name !== CHAT_TABLE_TITLE_NODE_NAME ||
        table?.type.spec.tableRole !== 'table'
      ) return;
      const wrapperPosition = $from.before(depth);
      return {
        table,
        tablePosition: wrapperPosition + 1 + title.nodeSize,
        title,
        titlePosition: wrapperPosition + 1,
        wrapper: node,
        wrapperPosition
      };
    }
  }
  for(let depth = $from.depth; depth > 0; --depth) {
    const node = $from.node(depth);
    if(node.type.spec.tableRole === 'table') {
      const tablePosition = $from.before(depth);
      return {
        table: node,
        tablePosition,
        title: undefined,
        titlePosition: undefined,
        wrapper: undefined,
        wrapperPosition: undefined
      };
    }
  }
  if(
    selection instanceof NodeSelection &&
    selection.node.type.spec.tableRole === 'table'
  ) {
    return {
      table: selection.node,
      tablePosition: selection.from,
      title: undefined,
      titlePosition: undefined,
      wrapper: undefined,
      wrapperPosition: undefined
    };
  }
}

function richMediaUploadNode(editor: Editor, uploadId: string) {
  let found: {node: ProseMirrorNode, position: number};
  editor.state.doc.descendants((node, position) => {
    if(node.type.name !== 'richMedia' || node.attrs.uploadId !== uploadId) return;
    found = {node, position};
    return false;
  });
  return found;
}

function inputMapBlock(options: ChatInputMapOptions) {
  const {
    accuracyRadius,
    caption = '',
    captionEntities = [],
    credit = '',
    creditEntities = [],
    height = 200,
    latitude,
    longitude,
    width = 400,
    zoom = 15
  } = options;
  const accuracy = Number.isFinite(accuracyRadius) ? accuracyRadius : undefined;
  const block: PageBlock.inputPageBlockMap = {
    _: 'inputPageBlockMap',
    geo: {
      _: 'inputGeoPoint',
      lat: latitude,
      long: longitude,
      accuracy_radius: accuracy
    },
    zoom,
    w: width,
    h: height,
    caption: {
      _: 'pageCaption',
      text: captionRichText(caption, captionEntities),
      credit: captionRichText(credit, creditEntities)
    }
  };
  const normalized = normalizeOpaqueRichBlockForInput(block);
  return normalized?._ === 'inputPageBlockMap' ? normalized : undefined;
}

function lastGraphemeLength(value: string) {
  let start = 0;
  for(const part of new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(value)) {
    start = part.index;
  }
  return value.length - start;
}

const HORIZONTAL_SPACES_REGEXP = /^[\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]+$/;
function documentRequiresRichMode(
  document: ProseMirrorNode,
  ignoreEmptyRichBlockquotes = false
) {
  let found = false;
  document.descendants((node) => {
    if(found) return false;
    const name = node.type.name;
    if(!PLAIN_MESSAGE_NODE_NAMES.has(name)) {
      found = true;
      return false;
    }
    if(name === 'blockquote') {
      const caption = node.lastChild?.type.name === 'blockquoteCaption' ?
        node.lastChild :
        undefined;
      const richCaption = node.attrs.captionRichText as RichText | undefined;
      if(
        caption?.content.size ||
        node.attrs.caption ||
        richCaption?._ && !!richTextPlainText(richCaption) ||
        node.attrs.rich && !ignoreEmptyRichBlockquotes
      ) {
        found = true;
        return false;
      }
    } else if(name === 'blockquoteCaption' && node.content.size) {
      found = true;
      return false;
    } else if(name === 'orderedList' && (node.attrs.reversed || node.attrs.type)) {
      found = true;
      return false;
    } else if(name === 'listItem' && (
      node.attrs.checkbox ||
      node.attrs.checked !== null ||
      node.attrs.type ||
      node.attrs.value !== null
    )) {
      found = true;
      return false;
    }
    if(node.marks.some((mark) => (
      !PLAIN_MESSAGE_MARK_NAMES.has(mark.type.name) ||
      mark.type.name === 'link' && !!mark.attrs.richAnchorName
    ))) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

function isEmptyFirstLineSpace(
  state: EditorState,
  from: number,
  to: number,
  text: string
) {
  const firstBlock = state.doc.firstChild;
  return (
    from === 1 &&
    to === 1 &&
    firstBlock?.type === state.schema.nodes.paragraph &&
    firstBlock.content.size === 0 &&
    HORIZONTAL_SPACES_REGEXP.test(text)
  );
}

function convertTypedChecklistMarker(
  view: EditorView,
  from: number,
  to: number,
  text: string
) {
  if(text !== ' ' || from !== to) return false;
  const $from = view.state.doc.resolve(from);
  if(!$from.parent.isTextblock || $from.parentOffset !== $from.parent.content.size) return false;
  const marker = /^\[([ xX])\]$/.exec($from.parent.textContent);
  if(!marker) return false;

  for(let depth = $from.depth - 1; depth > 0; --depth) {
    const item = $from.node(depth);
    if(item.type.name === 'taskItem') return false;
    if(item.type.name !== 'listItem') continue;
    const list = $from.node(depth - 1);
    if(list.type.name !== 'bulletList' && list.type.name !== 'orderedList') return false;
    const position = $from.before(depth);
    view.dispatch(
      view.state.tr
      .delete($from.start(), from)
      .setNodeMarkup(position, undefined, {
        ...item.attrs,
        checkbox: true,
        checked: marker[1].toLowerCase() === 'x'
      })
      .scrollIntoView()
    );
    return true;
  }

  return false;
}

function customEmojiPointerPosition(
  view: EditorView,
  fallbackPosition: number,
  nodePosition: number,
  nodeSize: number
) {
  const selection = view.dom.ownerDocument.defaultView.getSelection();
  if(selection && !selection.isCollapsed && selection.focusNode && view.dom.contains(selection.focusNode)) {
    try {
      const position = view.posAtDOM(selection.focusNode, selection.focusOffset);
      if(position === nodePosition || position === nodePosition + nodeSize) return position;
    } catch{
      // A native selection can briefly retain a detached NodeView during an update.
    }
  }

  return fallbackPosition <= nodePosition ? nodePosition : nodePosition + nodeSize;
}

type CustomEmojiPointerState = {
  anchor: number,
  dragging: boolean,
  nodePosition: number,
  nodeSize: number,
  shiftKey: boolean,
  view: EditorView,
  x: number,
  y: number
};

type StructuralDoubleClickSelection = {
  clientX: number,
  clientY: number,
  doc: ProseMirrorNode,
  position: number
};

type SelectedTopLevelTextblock = {
  node: ProseMirrorNode,
  position: number
};

type SelectedLeafContext = {
  index: number,
  parent: ProseMirrorNode,
  position: number
};

type NodeTextRenderer = (options: {
  index: number,
  node: ProseMirrorNode,
  parent: ProseMirrorNode,
  pos: number
}) => string;

function selectedTextWithLeafFallback(state: EditorState) {
  const {doc, selection} = state;
  const contexts = new Map<ProseMirrorNode, SelectedLeafContext>();
  doc.nodesBetween(selection.from, selection.to, (node, position, parent, index) => {
    if(node.isLeaf && parent) contexts.set(node, {index, parent, position});
  });

  return doc.textBetween(selection.from, selection.to, '\n', (node) => {
    if(node.type.spec.leafText) return node.type.spec.leafText(node);

    const context = contexts.get(node);
    const renderText = (node.type.spec as typeof node.type.spec & {
      toText?: NodeTextRenderer
    }).toText;
    if(renderText && context) {
      return renderText({
        index: context.index,
        node,
        parent: context.parent,
        pos: context.position
      });
    }

    const fallback = node.attrs.alt ?? node.attrs.emoji;
    return typeof(fallback) === 'string' ? fallback : '';
  });
}

function isUnmodifiedPrimaryMouseEvent(event: MouseEvent) {
  return event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey;
}

function pointerIsPastTextAtPosition(
  view: EditorView,
  position: number,
  pointer: {clientX: number, clientY: number}
) {
  let caret: ReturnType<EditorView['coordsAtPos']>;
  try {
    caret = view.coordsAtPos(position, -1);
  } catch{
    return;
  }
  if(
    pointer.clientY < caret.top - 1 ||
    pointer.clientY > caret.bottom + 1
  ) return false;

  const dom = view.domAtPos(position, -1).node;
  const element = dom.nodeType === 1 ? dom as HTMLElement : dom.parentElement;
  const direction = element && view.dom.ownerDocument.defaultView
  ?.getComputedStyle(element).direction;
  return direction === 'rtl' ?
    pointer.clientX <= caret.left :
    pointer.clientX >= caret.right;
}

function canInsertBlockAtSelection(state: EditorState, nodeTypeName: string) {
  const nodeType = state.schema.nodes[nodeTypeName];
  if(!nodeType) return false;

  const {$from} = state.selection;
  let parentDepth = $from.depth;
  while(parentDepth > 0 && $from.node(parentDepth).isTextblock) {
    --parentDepth;
  }

  const parent = $from.node(parentDepth);
  const index = $from.index(parentDepth);
  return (
    parent.canReplaceWith(index, index, nodeType) ||
    parent.canReplaceWith(index + 1, index + 1, nodeType)
  );
}

function selectedTopLevelTextblocks(state: EditorState) {
  const {doc, selection} = state;
  const blocks: SelectedTopLevelTextblock[] = [];
  doc.forEach((node, position, index) => {
    if(
      !node.isTextblock ||
      !new Set(['codeBlock', 'heading', 'paragraph', 'richFooter']).has(node.type.name)
    ) return;
    const trailing = (
      index === doc.childCount - 1 &&
      doc.childCount > 1 &&
      isTrailingPlaceholderNode(node)
    );
    if(trailing && !selection.empty) return;
    const end = position + node.nodeSize;
    const selected = selection.empty ?
      selection.from >= position && selection.from <= end :
      selection.from < end && selection.to > position;
    if(selected) blocks.push({node, position});
  });
  return blocks;
}

class TiptapChatInputEditor implements ChatInputEditor {
  public readonly input: HTMLElement;
  public isComposing = false;

  private editor: Editor;
  private documentRevision = 0;
  private expanded: boolean;
  private inputEventFromUser = false;
  private inputEventScheduled = false;
  private inputEventStructuralChange = false;
  private stateChangeScheduled = false;
  private remappingNewLineShortcut = false;
  private richMediaPreviewHistoryLease = new RichMediaPreviewHistoryLease();
  private richMessageOptions: NonNullable<ChatInputEditorSnapshot['richMessageOptions']>;
  private mode: ChatInputEditorMode = 'plain';
  private pendingScrollTargetPosition: number;
  private customEmojiPointer: CustomEmojiPointerState;
  private structuralDoubleClickSelection: StructuralDoubleClickSelection;
  private unregister: () => void;
  private destroyed = false;

  private openSelectedMathTooltip() {
    const {selection} = this.editor.state;
    if(
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== 'inlineMath' &&
      selection.node.type.name !== 'blockMath'
    ) return;
    const anchor = this.editor.view.nodeDOM(selection.from) as HTMLElement;
    if(!anchor?.matches('[data-inline-math], [data-block-math]')) return;
    const EventConstructor = anchor.ownerDocument.defaultView?.MouseEvent || MouseEvent;
    anchor.dispatchEvent(new EventConstructor('click', {bubbles: true, button: 0}));
  }

  private onMathModeRequest = (event: Event) => {
    const {detail} = event as ChatInputMathModeRequestEvent;
    if(!detail.apply) {
      detail.accepted = detail.inline || this.canUseSeparateLineMath();
      return;
    }

    detail.accepted = detail.inline ?
      this.insertInlineMath(detail.source) :
      this.insertBlockMath(detail.source);
    if(detail.accepted) this.openSelectedMathTooltip();
  };

  private removeCustomEmojiPointerListeners(pointer = this.customEmojiPointer) {
    if(!pointer) return;
    const appWindow = pointer.view.dom.ownerDocument.defaultView;
    appWindow.removeEventListener('mousemove', this.onCustomEmojiMouseMove, true);
    appWindow.removeEventListener('mouseup', this.onCustomEmojiMouseUp, true);
  }

  private clearCustomEmojiPointer() {
    this.removeCustomEmojiPointerListeners();
    this.customEmojiPointer = undefined;
  }

  private handleScrollToSelection = (view: EditorView) => {
    const position = this.pendingScrollTargetPosition;
    this.pendingScrollTargetPosition = undefined;
    const node = position === undefined ? undefined : view.nodeDOM(position);
    const target = node?.nodeType === Node.ELEMENT_NODE ? node as Element : undefined;
    return keepChatInputSelectionVisible(view, target);
  };

  private trackStructuralDoubleClick(
    view: EditorView,
    position: number,
    event: MouseEvent
  ) {
    const pending = {
      clientX: event.clientX,
      clientY: event.clientY,
      doc: view.state.doc,
      position
    };
    this.structuralDoubleClickSelection = pending;
    view.dom.ownerDocument.defaultView?.setTimeout(() => {
      if(this.structuralDoubleClickSelection === pending) {
        this.structuralDoubleClickSelection = undefined;
      }
    }, 250);
    return pending;
  }

  private normalizeStructuralDoubleClickSelection() {
    const pending = this.structuralDoubleClickSelection;
    if(!pending) return false;
    this.structuralDoubleClickSelection = undefined;

    const {state, view} = this.editor;
    const {selection} = state;
    if(
      state.doc !== pending.doc ||
      !(selection instanceof TextSelection) ||
      selection.empty
    ) return false;

    let position = pending.position;
    if(selectedTextWithLeafFallback(state).replace(/[\r\n]/g, '')) {
      const {$from, $to} = selection;
      if(
        !$from.sameParent($to) ||
        !$from.parent.isTextblock ||
        $from.parentOffset !== 0 ||
        $to.parentOffset !== $to.parent.content.size ||
        !pointerIsPastTextAtPosition(view, selection.to, pending)
      ) return false;
      position = selection.to;
    }

    position = Math.max(0, Math.min(position, state.doc.content.size));
    const $position = state.doc.resolve(position);
    const caret = $position.parent.inlineContent ?
      TextSelection.create(state.doc, position) :
      TextSelection.findFrom($position, -1, true) ||
        TextSelection.findFrom($position, 1, true);
    if(!caret || selection.eq(caret)) return false;

    view.dispatch(
      state.tr
      .setSelection(caret)
      .setMeta('pointer', true)
      .setMeta('addToHistory', false)
    );
    return true;
  }

  private getCustomEmojiDragPosition(view: EditorView, event: MouseEvent) {
    const coordinates = view.posAtCoords({left: event.clientX, top: event.clientY});
    if(coordinates) return coordinates.pos;

    const rect = view.dom.getBoundingClientRect();
    const atStart = Selection.atStart(view.state.doc).from;
    const atEnd = Selection.atEnd(view.state.doc).to;
    if(event.clientY < rect.top) return atStart;
    if(event.clientY > rect.bottom) return atEnd;

    const clampedX = Math.max(rect.left + 1, Math.min(rect.right - 1, event.clientX));
    return view.posAtCoords({left: clampedX, top: event.clientY})?.pos;
  }

  private updateCustomEmojiDrag(event: MouseEvent) {
    const pointer = this.customEmojiPointer;
    if(!pointer || pointer.view.isDestroyed) return;

    const head = this.getCustomEmojiDragPosition(pointer.view, event);
    if(head === undefined) return;

    const {doc} = pointer.view.state;
    const selection = TextSelection.between(
      doc.resolve(pointer.anchor),
      doc.resolve(head)
    );
    if(!pointer.view.hasFocus()) pointer.view.focus();
    if(pointer.view.state.selection.eq(selection)) return;
    pointer.view.dispatch(
      pointer.view.state.tr
      .setSelection(selection)
      .setMeta('pointer', true)
    );
  }

  private onCustomEmojiMouseMove = (event: MouseEvent) => {
    const pointer = this.customEmojiPointer;
    if(!pointer) return;
    if(!(event.buttons & 1)) {
      this.clearCustomEmojiPointer();
      return;
    }

    if(!pointer.dragging) {
      if(
        Math.abs(event.clientX - pointer.x) <= 4 &&
        Math.abs(event.clientY - pointer.y) <= 4
      ) return;
      pointer.dragging = true;
    }

    event.preventDefault();
    this.updateCustomEmojiDrag(event);
  };

  private onCustomEmojiMouseUp = (event: MouseEvent) => {
    const pointer = this.customEmojiPointer;
    if(!pointer) return;

    if(pointer.dragging) {
      event.preventDefault();
      this.updateCustomEmojiDrag(event);
    }
    this.removeCustomEmojiPointerListeners(pointer);
    if(pointer.dragging || !pointer.shiftKey) this.customEmojiPointer = undefined;
  };

  private runKeyboardShortcut(key: string) {
    const {view} = this.editor;
    const KeyboardEventConstructor = this.input.ownerDocument.defaultView?.KeyboardEvent || KeyboardEvent;
    const event = new KeyboardEventConstructor('keydown', {
      bubbles: true,
      cancelable: true,
      key
    });
    return !!view.someProp('handleKeyDown', (handler) => handler(view, event));
  }

  private exitCodeBlockOnThirdNewline() {
    const {selection} = this.editor.state;
    const {$from, empty} = selection;
    if(
      !empty ||
      $from.parent.type.name !== 'codeBlock' ||
      $from.parentOffset !== $from.parent.content.size ||
      !$from.parent.textContent.endsWith('\n\n')
    ) return false;

    return this.editor
    .chain()
    .command(({tr}) => {
      tr.delete($from.pos - 2, $from.pos);
      return true;
    })
    .exitCode()
    .run();
  }

  private applyMonospaceShortcut() {
    const {selection} = this.editor.state;
    const {$from, $to} = selection;
    for(let depth = $from.depth; depth > 0; --depth) {
      if($from.node(depth).type.name !== 'codeBlock') continue;
      return this.editor.chain().focus().toggleCodeBlock().run();
    }

    const currentBlock = $from.parent;
    if(
      $from.sameParent($to) &&
      (currentBlock.type.name === 'paragraph' || currentBlock.type.name === 'heading')
    ) {
      if(this.getMarkupState('monospace').fully) {
        return this.applyMarkup({type: 'monospace'});
      }
      return this.editor.chain().focus().setCodeBlock().run();
    }

    return this.applyMarkup({type: 'monospace'});
  }

  constructor(
    input: HTMLElement,
    private options: ChatInputEditorOptions = {},
    snapshot?: ChatInputEditorSnapshot
  ) {
    this.input = input;
    this.expanded = !!input.closest('.is-message-input-expanded');
    this.richMessageOptions = {...snapshot?.richMessageOptions};
    input.dataset.chatInputEditor = 'tiptap';
    // A plain field builds its schema so rich blocks cannot exist in it, rather
    // than letting them in and reporting `rich` afterwards — a caption has no way
    // to carry them.
    const composerExtensions = this.options.singleLine ?
      SINGLE_LINE_MESSAGE_EXTENSIONS :
      this.options.plainOnly ?
        PLAIN_MESSAGE_EXTENSIONS :
        [...TIPTAP_BASE_EXTENSIONS, ...(this.options.enableBlockSelection === false ?
          CHAT_INPUT_EXTENSIONS.filter((extension) => extension.name !== 'chatBlockReorder') :
          CHAT_INPUT_EXTENSIONS)];

    this.editor = new Editor({
      autofocus: false,
      content: withNormalizedOrderedListStarts(
        normalizeEditableRichBlocks(this.withTrailingPlaceholder(
          snapshot?.doc ? normalizeBlockOnlyQuotes(snapshot.doc) : telegramTextToTiptap(''),
          !!snapshot
        ))
      ),
      editorProps: {
        handleScrollToSelection: this.handleScrollToSelection,
        attributes: {
          'role': 'textbox',
          'aria-multiline': 'true',
          'class': classNames(
            instantViewStyles.RichMessage,
            instantViewStyles.RichText,
            instantViewStyles.Blocks
          ),
          'data-chat-input-editor': 'tiptap'
        },
        clipboardTextSerializer: () => {
          const {selection} = this.editor.state;
          const table = selectedTableClipboardNode(this.editor.view);
          if(table) return serializeChatTableClipboardText(Fragment.from(table));

          const inline = inlineSelectionDocument(this.editor.state);
          if(inline) return tiptapToTelegram(inline).text;
          const serialized = tiptapToTelegram(this.editor.state.doc, true, {forClipboard: true});
          return serialized.text.slice(
            serialized.textOffsetAtPosition(selection.from, 'backward'),
            serialized.textOffsetAtPosition(selection.to, 'forward')
          );
        },
        transformCopied: transformCopiedContent,
        handleTextInput: (view, from, to, text) => {
          if(convertTypedChecklistMarker(view, from, to, text)) return true;
          if(!isEmptyFirstLineSpace(view.state, from, to, text)) return false;

          // handleTextInput can run after a mobile/IME DOM mutation. Updating
          // the same state makes ProseMirror restore its still-empty document.
          view.updateState(view.state);
          return true;
        },
        handleDoubleClick: (view, position, event) => {
          if(!isUnmodifiedPrimaryMouseEvent(event)) return false;
          this.trackStructuralDoubleClick(view, position, event);
          return false;
        },
        handleClickOn: (view, position, node, nodePosition, event, direct) => {
          if(
            !direct ||
            event.button !== 0 ||
            event.shiftKey ||
            node.type.name !== 'customEmoji'
          ) return false;

          const target = position <= nodePosition ? nodePosition : nodePosition + node.nodeSize;
          const selection = TextSelection.create(view.state.doc, target);
          if(!view.hasFocus()) view.focus();
          if(!view.state.selection.eq(selection)) {
            view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
          }
          return true;
        },
        handleDOMEvents: {
          beforeinput: (view, event) => {
            const deletionKey = event.inputType === 'deleteContentBackward' ? 'Backspace' :
              event.inputType === 'deleteContentForward' ? 'Delete' : undefined;
            if(
              deletionKey && event.cancelable && view.editable &&
              !event.isComposing && !this.isComposing &&
              this.runKeyboardShortcut(deletionKey)
            ) {
              event.preventDefault();
              return true;
            }
            if(
              ![
                'insertCompositionText',
                'insertReplacementText',
                'insertText'
              ].includes(event.inputType) ||
              !isEmptyFirstLineSpace(
                view.state,
                view.state.selection.from,
                view.state.selection.to,
                event.data || ''
              )
            ) return false;

            event.preventDefault();
            return true;
          },
          dblclick: (view, event) => {
            if(!isUnmodifiedPrimaryMouseEvent(event)) return false;
            const coordinates = view.posAtCoords({
              left: event.clientX,
              top: event.clientY
            });
            if(!coordinates) return false;

            const pending = this.trackStructuralDoubleClick(
              view,
              coordinates.pos,
              event
            );
            view.dom.ownerDocument.defaultView?.requestAnimationFrame(() => {
              if(this.structuralDoubleClickSelection === pending) {
                this.normalizeStructuralDoubleClickSelection();
              }
            });
            return false;
          },
          mousedown: (view, event) => {
            this.structuralDoubleClickSelection = undefined;
            this.clearCustomEmojiPointer();
            if(event.button !== 0 || !(event.target instanceof Element)) return false;

            const languagePicker = event.target.closest<HTMLElement>(
              '[data-code-language-picker]'
            );
            if(languagePicker && view.dom.contains(languagePicker)) {
              event.preventDefault();
              return true;
            }

            const element = event.target.closest<HTMLElement>('.chat-input-custom-emoji');
            if(!element || !view.dom.contains(element)) return false;

            const nodePosition = view.posAtDOM(element, 0);
            const node = view.state.doc.nodeAt(nodePosition);
            if(node?.type.name !== 'customEmoji') return false;

            const coordinates = view.posAtCoords({left: event.clientX, top: event.clientY});
            const pointerPosition = coordinates?.pos ?? nodePosition;
            const clickedPosition = pointerPosition <= nodePosition ?
              nodePosition :
              nodePosition + node.nodeSize;
            this.customEmojiPointer = {
              anchor: event.shiftKey ? view.state.selection.anchor : clickedPosition,
              dragging: false,
              nodePosition,
              nodeSize: node.nodeSize,
              shiftKey: event.shiftKey,
              view,
              x: event.clientX,
              y: event.clientY
            };
            const appWindow = view.dom.ownerDocument.defaultView;
            appWindow.addEventListener('mousemove', this.onCustomEmojiMouseMove, true);
            appWindow.addEventListener('mouseup', this.onCustomEmojiMouseUp, true);
            return false;
          },
          click: (view, event) => {
            const pointer = this.customEmojiPointer;
            this.clearCustomEmojiPointer();
            if(event.button === 0 && event.target instanceof Element) {
              const languagePicker = event.target.closest<HTMLElement>(
                '[data-code-language-picker]'
              );
              const code = languagePicker
              ?.closest('pre')
              ?.querySelector<HTMLElement>('code.code-code');
              if(languagePicker && code && view.dom.contains(languagePicker)) {
                event.preventDefault();
                this.options.onCodeBlockLanguagePicker?.(languagePicker);
                return true;
              }
            }
            if(
              !pointer ||
              pointer.dragging ||
              !pointer.shiftKey ||
              event.button !== 0 ||
              !event.shiftKey ||
              Math.abs(event.clientX - pointer.x) > 4 ||
              Math.abs(event.clientY - pointer.y) > 4 ||
              !(event.target instanceof Element)
            ) return false;

            const element = event.target.closest<HTMLElement>('.chat-input-custom-emoji');
            if(!element || !view.dom.contains(element)) return false;

            const node = view.state.doc.nodeAt(pointer.nodePosition);
            if(node?.type.name !== 'customEmoji') return false;

            const coordinates = view.posAtCoords({left: event.clientX, top: event.clientY});
            const pointerPosition = coordinates?.pos ?? pointer.nodePosition;
            const target = customEmojiPointerPosition(
              view,
              pointerPosition,
              pointer.nodePosition,
              pointer.nodeSize
            );
            const selection = TextSelection.between(
              view.state.doc.resolve(pointer.anchor),
              view.state.doc.resolve(target)
            );
            if(!view.hasFocus()) view.focus();
            if(!view.state.selection.eq(selection)) {
              view.dispatch(view.state.tr.setSelection(selection).setMeta('pointer', true));
            }
            event.preventDefault();
            return true;
          }
        },
        handleKeyDown: (view, event) => {
          if(this.remappingNewLineShortcut) return false;

          if(event.key === 'Backspace' && !event.isComposing && !this.isComposing &&
            this.editor.can().undoInputRule() && this.editor.commands.undoInputRule()) {
            event.preventDefault();
            return true;
          }

          if(
            event.key === 'Backspace' &&
            (
              handleEmptyParagraphBackspaceAfterRichMedia(
                view.state,
                (transaction) => view.dispatch(transaction)
              ) ||
              handleRichMediaCaptionBackspace(
                view.state,
                (transaction) => view.dispatch(transaction)
              )
            )
          ) {
            event.preventDefault();
            return true;
          }

          if(this.options.onKeyDown?.(event)) return true;
          // A one-line field has nowhere to put a second line, and the field's
          // own Enter handling — moving to the next poll option, submitting —
          // still runs from its DOM listener.
          if(this.options.singleLine && event.key === 'Enter') {
            event.preventDefault();
            return true;
          }
          if(this.options.isNewLineShortcutPressed?.(event)) {
            this.remappingNewLineShortcut = true;
            try {
              if(this.exitCodeBlockOnThirdNewline()) return true;
              return this.runKeyboardShortcut('Enter');
            } finally {
              this.remappingNewLineShortcut = false;
            }
          }
          const mod = event.ctrlKey || event.metaKey;
          if(mod && event.altKey && !event.shiftKey) {
            const level = event.code === 'Digit1' ? 1 :
              event.code === 'Digit2' ? 2 :
              undefined;
            if(level) {
              event.preventDefault();
              return this.toggleHeading(level as 1 | 2);
            }
          }
          if(mod && !event.altKey) {
            const code = event.code;
            if(!event.shiftKey && code === 'KeyK') {
              event.preventDefault();
              return this.requestLinkEditor();
            }
            if(event.shiftKey && code === 'KeyH') {
              event.preventDefault();
              return this.toggleHeading(2);
            }
            if(event.shiftKey && code === 'KeyT') {
              event.preventDefault();
              return this.insertTable();
            }
            if(event.shiftKey && code === 'KeyB') {
              event.preventDefault();
              return this.setBodyText();
            }
            if(!event.shiftKey && code === 'KeyM') {
              event.preventDefault();
              return this.applyMonospaceShortcut();
            }
          }
          if(event.ctrlKey || event.metaKey) {
            handleMarkdownShortcut(input, event);
          }
          return event.defaultPrevented;
        },
        handlePaste: (view, event, slice) => {
          // The editor document is the source of truth. Keep ProseMirror's parsed
          // structure except for Chromium's closed single-paragraph mismatch.
          markProseMirrorPaste(event);
          if(this.options.singleLine) {
            view.dispatch(view.state.tr.replaceSelection(flattenSliceToInline(slice)).scrollIntoView());
            return true;
          }
          return pasteClosedSingleParagraphInline(view, event, slice);
        }
      },
      element: {mount: input} as unknown as HTMLElement,
      extensions: this.options.singleLine ?
        composerExtensions :
        [...composerExtensions, ChatTrailingPlaceholder],
      injectCSS: false
    });
    this.editor.registerPlugin(new Plugin({
      appendTransaction: (transactions, _oldState, newState) => {
        if(!transactions.some(transaction => transaction.docChanged)) return;
        // Quote presentation changes belong to the triggering edit. Dispatching
        // them later outside history prevents its wrapping steps from undoing.
        return this.quoteModeTransaction(newState);
      }
    }));
    this.richMediaPreviewHistoryLease.sync(this.editor.state);

    this.syncMode(false);
    this.unregister = registerChatInputEditor(input, this);
    if(import.meta.env.DEV || import.meta.env.VITE_PREVIEW) {
      const appWindow = input.ownerDocument.defaultView;
      if(appWindow) {
        exposeChatInputEditorTestDataHelper(appWindow);
        fillChatInputEditorTestDataFromQuery(appWindow, this);
      }
    }
    this.editor.on('update', this.onUpdate);
    this.editor.on('selectionUpdate', this.onSelectionUpdate);
    this.editor.on('transaction', this.onTransaction);
    input.addEventListener('input', this.onNativeInputCapture, {capture: true});
    input.addEventListener('compositionstart', this.onCompositionStart);
    input.addEventListener('compositionend', this.onCompositionEnd);
    input.addEventListener(CHAT_INPUT_MATH_MODE_REQUEST_EVENT, this.onMathModeRequest);
    input.addEventListener('keydown', this.onDocumentButtonKeyDown);

    if(snapshot) {
      this.setEditable(snapshot.editable);
      this.restoreSelection(snapshot.selection, snapshot.focused);
    }
    const legacyTables = wrapBareChatInputTables(this.editor.state, false);
    if(legacyTables) {
      this.editor.view.dispatch(
        legacyTables.setMeta(SILENT_EDITOR_UPDATE_META, true)
      );
    }
  }

  /**
   * A button inside the document — a details toggle, a checklist box, a button chip, a quote's fold
   * switch — is not text, but the caret stays in the text while it holds the focus, and with an
   * editable selection the browser hands Enter to editing instead of pressing the button. Press it.
   * Space still reaches the button: editing does not claim a key-up.
   */
  private onDocumentButtonKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if(
      event.key !== 'Enter' ||
      event.defaultPrevented ||
      event.isComposing ||
      event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
      target === this.input ||
      target.tagName !== 'BUTTON' ||
      (target as HTMLButtonElement).disabled
    ) return;
    event.preventDefault();
    target.click();
  };

  private onCompositionStart = () => {
    this.isComposing = true;
  };

  private onCompositionEnd = () => {
    this.isComposing = false;
  };

  private onNativeInputCapture = (event: Event) => {
    if(!event.isTrusted) return;

    // ProseMirror imports the browser mutation after the native input event.
    // Keep legacy listeners from reading the previous editor state; onUpdate
    // emits one replacement input event after the transaction is committed.
    this.inputEventFromUser = true;
    event.stopImmediatePropagation();
    queueMicrotask(() => {
      if(!this.inputEventScheduled) this.inputEventFromUser = false;
    });
  };

  private onUpdate = ({transaction}: {transaction: Transaction}) => {
    if(
      transaction.docChanged &&
      !transaction.getMeta(SILENT_EDITOR_UPDATE_META) &&
      !transaction.getMeta(CODE_LANGUAGE_DETECTION_META)
    ) {
      ++this.documentRevision;
    }
    if(transaction.getMeta(SILENT_EDITOR_UPDATE_META)) return;
    if(transaction.docChanged) this.syncMode(false);
    if(!this.inputEventFromUser) this.inputEventStructuralChange = true;
    if(this.inputEventScheduled) return;
    this.inputEventScheduled = true;
    queueMicrotask(() => {
      this.inputEventScheduled = false;
      if(this.destroyed) return;

      const event = new Event('input', {bubbles: true, cancelable: true}) as ChatInputEditorInputEvent;
      if(this.inputEventStructuralChange) event.chatInputEditorStructuralChange = true;
      if(this.inputEventFromUser) event.chatInputEditorUserInput = true;
      this.inputEventStructuralChange = false;
      this.inputEventFromUser = false;
      this.input.dispatchEvent(event);
    });
  };

  private scheduleStateChange() {
    if(this.stateChangeScheduled) return;
    this.stateChangeScheduled = true;
    queueMicrotask(() => {
      this.stateChangeScheduled = false;
      if(!this.destroyed) this.options.onStateChange?.();
    });
  }

  private onTransaction = ({transaction}: {transaction: Transaction}) => {
    if(transaction.docChanged) {
      this.richMediaPreviewHistoryLease.sync(this.editor.state);
    }
    this.scheduleStateChange();
  };

  private onSelectionUpdate = () => {
    if(this.normalizeStructuralDoubleClickSelection()) return;
    const EventConstructor = this.input.ownerDocument.defaultView?.Event || Event;
    this.input.dispatchEvent(new EventConstructor(
      CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT,
      {bubbles: true}
    ));
  };

  public getRichValue(withEntities = true, withCaret = true) {
    const serialized = tiptapToTelegram(this.editor.state.doc, true);
    const selection = this.editor.state.selection;
    return {
      value: serialized.text,
      entities: withEntities ? serialized.entities : [],
      caretPos: withCaret && selection.empty ? serialized.textOffsetAtPosition(selection.from) : -1
    };
  }

  public getDocument() {
    return withoutTrailingPlaceholder(this.editor.state.doc).toJSON();
  }

  public getMode() {
    return this.mode;
  }

  private getLegacyValueForDocument(document: ProseMirrorNode) {
    if(documentRequiresRichMode(document)) return;
    const serialized = tiptapToTelegram(document);
    return {value: serialized.text, entities: serialized.entities};
  }

  private modeForDocument(document: ProseMirrorNode): ChatInputEditorMode {
    let hasBlockquote = false;
    document.descendants((node) => {
      if(node.type.name !== 'blockquote') return true;
      hasBlockquote = true;
      return false;
    });
    return documentRequiresRichMode(withoutTrailingPlaceholder(document), true) ||
      this.expanded && hasBlockquote ? 'rich' : 'plain';
  }

  private syncMode(notify: boolean) {
    this.mode = this.modeForDocument(this.editor.state.doc);
    this.input.dataset.chatInputEditorMode = this.mode;
    this.input.classList.toggle('chat-input-editor-expanded', this.expanded);
    const transaction = this.quoteModeTransaction(this.editor.state);
    if(!transaction) return false;
    transaction.setMeta('addToHistory', false);
    if(!notify) transaction.setMeta(SILENT_EDITOR_UPDATE_META, true);
    this.editor.view.dispatch(transaction);
    return true;
  }

  private quoteModeTransaction(state: EditorState) {
    const rich = this.modeForDocument(state.doc) === 'rich';
    const blockquotes: number[] = [];
    state.doc.descendants((node, position) => {
      if(node.type.name === 'blockquote') blockquotes.push(position);
    });
    const transaction = state.tr;
    blockquotes.reverse().forEach((position) => {
      const mappedPosition = transaction.mapping.map(position);
      const node = transaction.doc.nodeAt(mappedPosition);
      if(node?.type.name !== 'blockquote') return;
      const collapsed = !!node.attrs.collapsed && isCollapsibleQuote(node, rich);
      if(
        node.attrs.rich !== rich ||
        node.attrs.collapsed !== collapsed ||
        node.attrs.caption ||
        node.attrs.captionRichText
      ) {
        const attributes: Record<string, unknown> = {
          caption: '',
          captionRichText: null,
          collapsed,
          rich
        };
        Object.entries(attributes).forEach(([name, value]) => {
          if(node.attrs[name] !== value) transaction.setNodeAttribute(mappedPosition, name, value);
        });
      }
    });
    if(!rich && transaction.selection instanceof TextSelection) {
      const {selection} = transaction;
      const visiblePosition = (position: number) => {
        const resolved = transaction.doc.resolve(position);
        if(resolved.parent.type.name !== 'blockquoteCaption' || resolved.parent.content.size) return position;
        return TextSelection.near(transaction.doc.resolve(resolved.before() - 1), -1).from;
      };
      const anchor = visiblePosition(selection.anchor);
      const head = visiblePosition(selection.head);
      if(anchor !== selection.anchor || head !== selection.head) {
        transaction.setSelection(TextSelection.create(transaction.doc, anchor, head));
      }
    }
    return transaction.docChanged || transaction.selectionSet ? transaction : undefined;
  }

  public getLegacyValueIfLossless() {
    const document = withoutTrailingPlaceholder(this.editor.state.doc);
    return this.getLegacyValueForDocument(document);
  }

  public getRichMessage(options: {draft?: boolean} = {}) {
    return tiptapToRichMessage(this.getDocument(), {
      ...this.richMessageOptions,
      draft: options.draft
    });
  }

  public async resolveAutoCodeLanguages() {
    const pending = new Map<string, Promise<string | undefined>>();
    this.editor.state.doc.descendants((node) => {
      if(
        node.type.name !== 'codeBlock' ||
        node.attrs.language ||
        getDetectedCodeBlockLanguage(node.attrs, node.textContent) ||
        !node.textContent.trim()
      ) {
        return;
      }
      const code = node.textContent;
      if(!pending.has(code)) pending.set(code, detectCodeLanguage(code));
    });
    if(!pending.size) return;

    const detected = new Map<string, string | undefined>();
    await Promise.all([...pending].map(async([code, result]) => {
      detected.set(code, await result);
    }));
    if(this.destroyed) return;

    let transaction = this.editor.state.tr;
    this.editor.state.doc.descendants((node, position) => {
      if(node.type.name !== 'codeBlock' || node.attrs.language) return;
      const language = detected.get(node.textContent);
      if(!language) return;
      if(getDetectedCodeBlockLanguage(node.attrs, node.textContent) === language) return;
      transaction = transaction.setNodeMarkup(
        position,
        undefined,
        withDetectedCodeBlockLanguage(node.attrs, language, node.textContent)
      );
    });
    if(!transaction.docChanged) return;
    transaction.setMeta(CODE_LANGUAGE_DETECTION_META, true);
    transaction.setMeta('addToHistory', false);
    this.editor.view.dispatch(transaction);
  }

  public getSelectedRichMessage() {
    const {selection} = this.editor.state;
    if(selection.empty) return;
    if(selection instanceof AllSelection) return this.getRichMessage();
    const inline = inlineSelectionDocument(this.editor.state);
    if(inline) return tiptapToRichMessage(inline.toJSON(), this.richMessageOptions);

    const table = selectedTableClipboardNode(this.editor.view);
    const content = table ? [table.toJSON()] : selectedRichContent(withCopiedOrderedListStarts(selection.content(), selection));
    return tiptapToRichMessage({type: 'doc', content}, this.richMessageOptions);
  }

  public getSelectedText() {
    const {from, to} = this.editor.state.selection;
    return from === to ? '' : this.editor.state.doc.textBetween(from, to, ' ');
  }

  public getSelectedLink() {
    const {doc, schema, selection} = this.editor.state;
    const linkType = schema.marks.link;
    const {$from} = selection;
    const range = getMarkRange($from, linkType);
    if(!range) return;
    const activeMark = doc.nodeAt(range.from)?.marks.find((mark) => mark.type === linkType);
    if(!activeMark) return;

    if(!selection.empty) {
      if(!selection.$from.sameParent(selection.$to)) return;
      let sameLink = true;
      doc.nodesBetween(selection.from, selection.to, (node) => {
        if(!node.isInline) return;
        const link = node.marks.find((mark) => mark.type === linkType);
        if(link?.attrs.href !== activeMark.attrs.href) sameLink = false;
      });
      if(!sameLink) return;
    }

    const {from, to} = selection.empty ? range : selection;

    return {
      from,
      text: doc.textBetween(from, to, ''),
      to,
      url: `${activeMark.attrs.href || ''}`
    };
  }

  public requestLinkEditor() {
    if(!this.options.onLinkEditor) return false;
    this.options.onLinkEditor(this.captureSelection());
    return true;
  }

  public updateLinkRange(from: number, to: number, url: string) {
    const link = this.editor.schema.marks.link;
    if(!link || from >= to || from < 0 || to > this.editor.state.doc.content.size) {
      return false;
    }
    let previousAttributes: Record<string, unknown> = {};
    this.editor.state.doc.nodesBetween(from, to, (node) => {
      const previous = node.marks.find((mark) => mark.type === link);
      if(!previous) return;
      previousAttributes = previous.attrs;
      return false;
    });
    const transaction = this.editor.state.tr
    .removeMark(from, to, link)
    .addMark(from, to, link.create({...previousAttributes, href: url}));
    this.editor.view.dispatch(transaction);
    this.editor.view.focus();
    return true;
  }

  private getSelectedNode(type: string) {
    const {selection} = this.editor.state;
    if(selection instanceof NodeSelection && selection.node.type.name === type) {
      return {node: selection.node, position: selection.from};
    }

    const {$from} = selection;
    for(let depth = $from.depth; depth > 0; --depth) {
      const node = $from.node(depth);
      if(node.type.name === type) return {node, position: $from.before(depth)};
    }
  }

  private serializeInlineContent(node: ProseMirrorNode) {
    const paragraph = this.editor.schema.nodes.paragraph.create(null, node.content);
    const document = this.editor.schema.nodes.doc.create(null, paragraph);
    return tiptapToTelegram(document);
  }

  private serializeRichText(text: PageBlock.pageBlockFooter['text']) {
    const document = richMessageToTiptap({
      _: 'richMessage',
      pFlags: {},
      blocks: [{_: 'pageBlockFooter', text}],
      photos: [],
      documents: []
    });
    return tiptapToTelegram(this.editor.schema.nodeFromJSON(document));
  }

  public getSelectedMap(): ChatInputMapOptions | undefined {
    const selected = this.getSelectedNode('richMap');
    if(!selected) return;
    const block = normalizeOpaqueRichBlockForInput(selected.node.attrs.block as PageBlock);
    if(block?._ !== 'inputPageBlockMap' || block.geo._ !== 'inputGeoPoint') return;
    const caption = this.serializeInlineContent(selected.node);
    const credit = this.serializeRichText(block.caption.credit);
    return {
      accuracyRadius: block.geo.accuracy_radius,
      caption: caption.text,
      captionEntities: caption.entities,
      credit: credit.text,
      creditEntities: credit.entities,
      height: block.h,
      latitude: block.geo.lat,
      longitude: block.geo.long,
      width: block.w,
      zoom: block.zoom
    };
  }

  public getSelectedMath() {
    const {selection} = this.editor.state;
    if(!(selection instanceof NodeSelection)) return;
    const {node} = selection;
    if(node.type.name !== 'inlineMath' && node.type.name !== 'blockMath') return;
    return {
      block: node.type.name === 'blockMath',
      source: `${node.attrs.source || ''}`
    };
  }

  public canUseSeparateLineMath() {
    const {selection} = this.editor.state;
    const {$from, $to} = selection;
    const selectedMathType = selection instanceof NodeSelection ?
      selection.node.type.name :
      undefined;
    const selectedBlock = selectedMathType === 'blockMath';
    const selectedInline = selectedMathType === 'inlineMath';
    if(!selectedBlock) {
      if(
        $from.parent.type.name !== 'paragraph' ||
        !selectedInline && !$from.sameParent($to)
      ) {
        return false;
      }
      if($from.depth === 1) return true;
    } else if($from.depth === 0) {
      return true;
    }

    const allowed = new Set(['blockquote', 'listItem', 'taskItem']);
    const disallowed = new Set([
      'blockquoteCaption',
      'detailsBody',
      'detailsSummary',
      'pullquote',
      'pullquoteCaption',
      'pullquoteText',
      'richFooter',
      'tableCell',
      'tableHeader'
    ]);
    for(
      let depth = selectedBlock ? $from.depth : $from.depth - 1;
      depth > 0;
      --depth
    ) {
      const name = $from.node(depth).type.name;
      if(allowed.has(name)) return true;
      if(disallowed.has(name)) return false;
    }
    return false;
  }

  public isEmpty() {
    let empty = true;
    this.editor.state.doc.descendants((node) => {
      if(
        (node.isText && !!node.text?.trim()) ||
        node.type.name === 'customEmoji' ||
        node.type.name === 'richDivider' ||
        node.type.name === 'richMap' ||
        node.type.name === 'richMedia' ||
        (node.type.name === 'inlineRichAnchor' && !!`${node.attrs.name || ''}`) ||
        (node.type.name === 'richAnchor' && !!`${node.attrs.name || ''}`) ||
        (node.type.name === 'opaqueRichBlock' && !!node.attrs.block) ||
        ((node.type.name === 'inlineMath' || node.type.name === 'blockMath') &&
          !!`${node.attrs.source || ''}`.trim())
      ) {
        empty = false;
        return false;
      }
    });
    return empty;
  }

  public isPlaceholderEmpty() {
    if(!this.isEmpty()) return false;

    let empty = true;
    this.editor.state.doc.forEach((node) => {
      if(node.type.name !== 'paragraph' && !isTrailingPlaceholderNode(node)) {
        empty = false;
      }
    });
    return empty;
  }

  public setTextWithEntities(text: string, entities: MessageEntity[] = []) {
    this.setDocument(telegramTextToTiptap(text, entities));
  }

  public setDocument(document: JSONContent) {
    const set = this.replaceDocument(document);
    if(set) this.richMessageOptions = {};
    return set;
  }

  /**
   * A one-line field has no trailing paragraph: the placeholder exists so a
   * block at the end of a message still has a line to type after, and here the
   * one line is all there is — a second would show as an empty row.
   */
  private withTrailingPlaceholder(document: JSONContent, hasExistingPlaceholder = false) {
    if(this.options.singleLine) return document;
    return withTrailingPlaceholder(document, hasExistingPlaceholder);
  }

  private parseDocument(document: JSONContent) {
    const doc = this.editor.schema.nodeFromJSON(withNormalizedOrderedListStarts(
      this.withTrailingPlaceholder(
        normalizeEditableRichBlocks(normalizeBlockOnlyQuotes(document))
      )
    ));
    doc.check();
    return doc;
  }

  private replaceDocument(document: JSONContent) {
    try {
      const doc = this.parseDocument(document);
      const state = EditorState.create({
        doc,
        plugins: this.editor.state.plugins,
        schema: this.editor.schema
      });
      const changed = !this.editor.state.doc.eq(doc);
      this.editor.view.updateState(state);
      this.richMediaPreviewHistoryLease.sync(state);
      this.scheduleStateChange();
      const legacyTables = wrapBareChatInputTables(this.editor.state, false);
      if(legacyTables) {
        this.editor.view.dispatch(
          legacyTables.setMeta(SILENT_EDITOR_UPDATE_META, true)
        );
      }
      if(changed) ++this.documentRevision;
      this.syncMode(false);
      return true;
    } catch{
      return false;
    }
  }

  public setRichMessage(message: RichMessage) {
    const set = this.replaceDocument(richMessageToTiptap(message));
    if(set) {
      this.richMessageOptions = {
        noAutolink: inferRichMessageNoAutolink(message) || undefined,
        rtl: message.pFlags.rtl
      };
    }
    return set;
  }

  public setNoAutolink(noAutolink: boolean) {
    if(noAutolink) this.richMessageOptions.noAutolink = true;
    else delete this.richMessageOptions.noAutolink;
  }

  public toggleHeading(level: InstantViewHeadingLevel) {
    const chain = this.editor.chain().focus();
    return this.editor.isActive('heading', {level}) ?
      chain.setNode('paragraph').run() :
      chain.setNode('heading', {level}).run();
  }

  public setBodyText() {
    const {schema, selection} = this.editor.state;
    const {$from} = selection;
    const paragraph = schema.nodes.paragraph;
    let simpleDepth = -1;
    let containerDepth = -1;
    for(let current = $from.depth; current > 0; --current) {
      const name = $from.node(current).type.name;
      if(name === 'heading' || name === 'richFooter') {
        simpleDepth = current;
        break;
      }
      if(name === 'details') {
        const insideBody = Array.from({length: $from.depth - current}, (_value, index) => (
          $from.node(current + index + 1).type.name
        )).includes('detailsBody');
        if(!insideBody) return false;
        containerDepth = current;
        break;
      }
      if(name === 'blockquote' || name === 'codeBlock' || name === 'pullquote') {
        containerDepth = current;
        break;
      }
    }

    if(simpleDepth > 0) {
      const node = $from.node(simpleDepth);
      const position = $from.before(simpleDepth);
      const content: ProseMirrorNode[] = [];
      node.forEach((child) => content.push(child.mark([])));
      const transaction = this.editor.state.tr.replaceWith(
        position,
        position + node.nodeSize,
        paragraph.create(null, content)
      );
      transaction.setSelection(TextSelection.create(
        transaction.doc,
        position + 1 + Math.min($from.parentOffset, node.content.size)
      ));
      this.editor.view.dispatch(transaction.scrollIntoView());
      this.editor.view.focus();
      return true;
    }

    if(containerDepth < 0) return false;
    const position = $from.after(containerDepth);
    const transaction = this.editor.state.tr.insert(position, paragraph.create());
    transaction.setSelection(TextSelection.create(transaction.doc, position + 1));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public toggleTaskList() {
    return this.editor
    .chain()
    .focus()
    .toggleTaskList()
    .run();
  }

  public toggleBulletList() {
    return this.editor
    .chain()
    .focus()
    .toggleBulletList()
    .run();
  }

  public toggleOrderedList() {
    return this.editor
    .chain()
    .focus()
    .toggleOrderedList()
    .run();
  }

  public getOrderedListState() {
    if(!this.editor.isActive('orderedList')) return;
    const list = this.editor.getAttributes('orderedList');
    const item = this.editor.getAttributes('listItem');
    return {
      itemType: item.type || undefined,
      itemValue: Number.isInteger(item.value) ? item.value : undefined,
      reversed: !!list.reversed,
      start: Number.isInteger(list.start) ? list.start : 1,
      type: list.type || undefined
    };
  }

  public setOrderedListType(type?: string) {
    if(!this.editor.isActive('orderedList')) return false;
    return this.editor.chain().focus().command(({tr}) => {
      const {$from} = tr.selection;
      let listDepth = -1;
      for(let depth = $from.depth; depth > 0; --depth) {
        if($from.node(depth).type.name === 'orderedList') {
          listDepth = depth;
          break;
        }
      }
      if(listDepth < 0) return false;

      const list = $from.node(listDepth);
      const listPosition = $from.before(listDepth);
      tr.setNodeMarkup(listPosition, undefined, {
        ...list.attrs,
        type: type || null
      });
      list.forEach((item, offset) => {
        if(item.type.name !== 'listItem') return;
        tr.setNodeMarkup(listPosition + 1 + offset, undefined, {
          ...item.attrs,
          num: null,
          type: null
        });
      });
      return true;
    }).run();
  }

  public toggleOrderedListReversed() {
    const state = this.getOrderedListState();
    if(!state) return false;
    return this.editor.chain().focus().updateAttributes('orderedList', {
      reversed: !state.reversed
    }).run();
  }

  public setOrderedListStart(start: number) {
    if(!this.editor.isActive('orderedList') || !Number.isInteger(start)) return false;
    return this.editor.chain().focus().updateAttributes('orderedList', {
      start,
      startExplicit: true
    }).run();
  }

  public setOrderedListItemValue(value?: number) {
    if(
      !this.editor.isActive('orderedList') ||
      value !== undefined && !Number.isInteger(value)
    ) return false;
    return this.editor.chain().focus().updateAttributes('listItem', {
      value: value ?? null
    }).run();
  }

  public setOrderedListItemType(type?: string) {
    const state = this.getOrderedListState();
    if(!state) return false;
    const parentType = canonicalOrderedListType(state.type);
    const storedType = type && canonicalOrderedListType(type) !== parentType ? type : null;
    return this.editor.chain().focus().updateAttributes('listItem', {
      num: null,
      type: storedType
    }).run();
  }

  public toggleCodeBlock() {
    return this.editor.chain().focus().toggleCodeBlock().run();
  }

  public insertCodeBlock() {
    return this.finishStructuralCommand(this.editor
    .chain()
    .setCodeBlock()
    .command(({state, tr}) => {
      if(isTrailingPlaceholderNode(tr.doc.lastChild)) return true;
      const paragraph = state.schema.nodes.paragraph.createAndFill();
      if(paragraph) tr.insert(tr.doc.content.size, paragraph);
      return true;
    })
    .scrollIntoView()
    .run());
  }

  private codeBlockContext(element?: HTMLElement) {
    const {state, view} = this.editor;
    let $position = state.selection.$from;
    if(element) {
      const code = element.closest('pre')?.querySelector<HTMLElement>('code.code-code');
      if(!code || !view.dom.contains(element)) return;
      try {
        $position = state.doc.resolve(view.posAtDOM(code, 0));
      } catch{
        return;
      }
    }

    for(let depth = $position.depth; depth > 0; --depth) {
      const node = $position.node(depth);
      if(node.type.name === 'codeBlock') {
        return {node, position: $position.before(depth)};
      }
    }
  }

  public getCodeBlockLanguage(element?: HTMLElement) {
    const context = this.codeBlockContext(element);
    return context ? `${context.node.attrs.language || ''}` : undefined;
  }

  public setCodeBlockLanguage(language: string, element?: HTMLElement) {
    const context = this.codeBlockContext(element);
    if(!context) return false;
    const transaction = this.editor.state.tr.setNodeMarkup(
      context.position,
      undefined,
      {
        ...withoutDetectedCodeBlockLanguage(context.node.attrs),
        language: language.trim()
      }
    );
    this.editor.view.dispatch(transaction);
    return true;
  }

  public canUndo() {
    return this.editor.can().undo();
  }

  public canRedo() {
    return this.editor.can().redo();
  }

  public canInsertTable({
    columns = 3,
    rows = 3,
    withHeaderRow = true
  }: ChatInputTableOptions = {}) {
    if(
      !this.editor.isEditable ||
      this.editor.isActive('codeBlock') ||
      !canInsertBlockAtSelection(this.editor.state, 'table')
    ) {
      return false;
    }

    return this.editor.can().insertTable({
      cols: columns,
      rows,
      withHeaderRow
    });
  }

  public undo() {
    return runHistoryCommandPreservingSelection(this.editor.view, undoNoScroll);
  }

  public redo() {
    return runHistoryCommandPreservingSelection(this.editor.view, redoNoScroll);
  }

  public separateHistory() {
    this.editor.view.dispatch(
      closeHistory(this.editor.state.tr).setMeta('addToHistory', false)
    );
  }

  public moveBlockUp() {
    return moveSelectedTopLevelBlock(this.editor.view, -1);
  }

  public moveBlockDown() {
    return moveSelectedTopLevelBlock(this.editor.view, 1);
  }

  private updateSelectedMath(type: 'inlineMath' | 'blockMath', source: string) {
    const {schema, selection} = this.editor.state;
    if(
      !(selection instanceof NodeSelection) ||
      selection.node.type.name !== 'inlineMath' &&
      selection.node.type.name !== 'blockMath'
    ) return false;
    if(selection.node.type.name === type) {
      const transaction = this.editor.state.tr.setNodeMarkup(selection.from, undefined, {
        ...selection.node.attrs,
        source
      });
      transaction.setSelection(NodeSelection.create(transaction.doc, selection.from));
      this.editor.view.dispatch(transaction);
      this.editor.view.focus();
      return true;
    }

    if(type === 'blockMath') {
      const {$from} = selection;
      const parent = $from.parent;
      if(!parent.isTextblock) return false;
      const parentPosition = $from.before();
      const inlineOffset = selection.from - $from.start();
      const before = parent.content.cut(0, inlineOffset);
      const after = parent.content.cut(inlineOffset + selection.node.nodeSize);
      let beforeNode = before.size ? parent.copy(before) : undefined;
      const afterNode = after.size ? parent.copy(after) : undefined;
      const containerDepth = $from.depth - 1;
      const container = containerDepth >= 0 ? $from.node(containerDepth) : undefined;
      if(
        !beforeNode &&
        (container?.type.name === 'listItem' || container?.type.name === 'taskItem') &&
        $from.index(containerDepth) === 0
      ) {
        beforeNode = parent.type.create(parent.attrs);
      }
      const math = schema.nodes.blockMath.create({source});
      const replacement = [beforeNode, math, afterNode].filter(Boolean) as ProseMirrorNode[];
      const mathPosition = parentPosition + (beforeNode?.nodeSize || 0);
      try {
        const transaction = this.editor.state.tr.replaceWith(
          parentPosition,
          parentPosition + parent.nodeSize,
          replacement
        );
        transaction.setSelection(NodeSelection.create(transaction.doc, mathPosition));
        this.editor.view.dispatch(transaction.scrollIntoView());
        this.editor.view.focus();
        return true;
      } catch{
        return false;
      }
    }

    const inline = schema.nodes.inlineMath.create({source});
    const replacement = schema.nodes.paragraph.create(null, inline);
    const inlinePosition = selection.from + 1;

    try {
      const transaction = this.editor.state.tr.replaceWith(
        selection.from,
        selection.to,
        replacement
      );
      transaction.setSelection(NodeSelection.create(transaction.doc, inlinePosition));
      this.editor.view.dispatch(transaction.scrollIntoView());
      this.editor.view.focus();
      return true;
    } catch{
      return false;
    }
  }

  public insertInlineMath(source: string) {
    if(!source.trim()) return false;
    const selected = this.getSelectedMath();
    if(selected?.block && !this.canUseSeparateLineMath()) return false;
    if(this.updateSelectedMath('inlineMath', source)) return true;
    const {selection} = this.editor.state;
    const inline = this.editor.schema.nodes.inlineMath.create({source});
    try {
      const transaction = this.editor.state.tr.replaceWith(
        selection.from,
        selection.to,
        inline
      );
      transaction.setSelection(TextSelection.create(
        transaction.doc,
        selection.from + inline.nodeSize
      ));
      this.editor.view.dispatch(transaction.scrollIntoView());
      this.editor.view.focus();
      return true;
    } catch{
      return false;
    }
  }

  public insertBlockMath(source: string) {
    if(!source.trim()) return false;
    const selected = this.getSelectedMath();
    if(!selected?.block && !this.canUseSeparateLineMath()) return false;
    if(this.updateSelectedMath('blockMath', source)) return true;
    return this.insertStructuralContent([
      {type: 'blockMath', attrs: {source}},
      {type: 'paragraph'}
    ]);
  }

  private finishStructuralCommand(result: boolean) {
    const {view} = this.editor;
    if(result && !view.hasFocus()) view.focus();
    return result;
  }

  private insertStructuralContent(
    content: JSONContent | JSONContent[],
    position?: number
  ) {
    position ??= richMediaSiblingInsertionPosition(this.editor.state);
    const chain = this.editor.chain();
    const result = position === undefined ?
      chain.insertContent(content).scrollIntoView().run() :
      chain.insertContentAt(position, content).scrollIntoView().run();
    return this.finishStructuralCommand(result);
  }

  public insertOpaqueRichBlock(block: ChatInputOpaqueRichBlock) {
    const normalized = normalizeOpaqueRichBlockForInput(block);
    if(!normalized) return false;
    const document = richMessageToTiptap({
      _: 'richMessage',
      pFlags: {},
      blocks: [normalized],
      photos: [],
      documents: []
    });
    const editableBlock = document.content?.[0];
    if(!editableBlock) return false;
    return this.insertStructuralContent([
      editableBlock,
      {type: 'paragraph'}
    ]);
  }

  private convertSelectedTextblocks(
    createNode: (node: ProseMirrorNode) => ProseMirrorNode | undefined
  ) {
    const blocks = selectedTopLevelTextblocks(this.editor.state);
    if(!blocks.length) return false;
    const transaction = this.editor.state.tr;
    blocks.slice().reverse().forEach(({node, position}) => {
      const replacement = createNode(node);
      if(replacement) {
        transaction.replaceWith(position, position + node.nodeSize, replacement);
      }
    });
    if(!transaction.docChanged) return false;
    const firstPosition = blocks[0].position;
    transaction.setSelection(Selection.near(
      transaction.doc.resolve(Math.min(firstPosition + 1, transaction.doc.content.size))
    ));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public insertFooter({text = '', entities = []}: ChatInputFooterOptions = {}) {
    if(!text && !entities.length) {
      const footer = this.editor.schema.nodes.richFooter;
      return this.convertSelectedTextblocks((node) => footer?.create(null, node.content));
    }
    return this.insertStructuralContent([
      {
        type: 'richFooter',
        content: captionContent(text, entities)
      },
      {type: 'paragraph'}
    ]);
  }

  public insertDivider() {
    return this.insertStructuralContent([
      {type: 'richDivider'},
      {type: 'paragraph'}
    ]);
  }

  public insertRichButton({separateLine, ...button}: ChatInputRichButtonOptions) {
    const node = createRichButtonNode(this.editor.schema, button);
    if(separateLine) {
      return this.insertStructuralContent([
        {type: BUTTON_ROW_NODE_NAME, attrs: {align: null, buttons: [node.attrs]}},
        {type: 'paragraph'}
      ]);
    }

    return this.editor.chain().focus().insertContent(node.toJSON()).scrollIntoView().run();
  }

  public insertMap(options: ChatInputMapOptions) {
    const block = inputMapBlock(options);
    if(!block) return false;
    return this.insertStructuralContent([
      {
        type: 'richMap',
        attrs: {block, captionCredit: block.caption.credit},
        content: captionContent(options.caption, options.captionEntities)
      },
      {type: 'paragraph'}
    ]);
  }

  public updateSelectedMap(options: Partial<ChatInputMapOptions>) {
    const selected = this.getSelectedNode('richMap');
    if(!selected) return false;
    const current = normalizeOpaqueRichBlockForInput(selected.node.attrs.block as PageBlock);
    if(current?._ !== 'inputPageBlockMap' || current.geo._ !== 'inputGeoPoint') return false;

    const currentCaption = tiptapDocumentToCaptionRichText({
      type: 'paragraph',
      content: selected.node.toJSON().content
    });
    const captionChanged = options.caption !== undefined || options.captionEntities !== undefined;
    const creditChanged = options.credit !== undefined || options.creditEntities !== undefined;
    const accuracyChanged = Object.prototype.hasOwnProperty.call(options, 'accuracyRadius');
    const currentCaptionValue = captionChanged ? this.serializeInlineContent(selected.node) : undefined;
    const currentCreditValue = creditChanged ? this.serializeRichText(current.caption.credit) : undefined;
    const caption = captionChanged ?
      captionRichText(
        options.caption ?? currentCaptionValue.text,
        options.captionEntities ?? []
      ) :
      currentCaption;
    const credit = creditChanged ?
      captionRichText(
        options.credit ?? currentCreditValue.text,
        options.creditEntities ?? []
      ) :
      current.caption.credit;
    const next = normalizeOpaqueRichBlockForInput({
      ...current,
      geo: {
        ...current.geo,
        lat: options.latitude ?? current.geo.lat,
        long: options.longitude ?? current.geo.long,
        accuracy_radius: accuracyChanged ?
          options.accuracyRadius :
          current.geo.accuracy_radius
      },
      zoom: options.zoom ?? current.zoom,
      w: options.width ?? current.w,
      h: options.height ?? current.h,
      caption: {
        _: 'pageCaption',
        text: caption,
        credit
      }
    });
    if(next?._ !== 'inputPageBlockMap') return false;
    const content = captionChanged ? captionContent(
      options.caption ?? currentCaptionValue.text,
      options.captionEntities ?? []
    ) : selected.node.toJSON().content;
    const replacement = this.editor.schema.nodeFromJSON({
      type: 'richMap',
      attrs: {block: next, captionCredit: next.caption.credit},
      content
    });
    const transaction = this.editor.state.tr.replaceWith(
      selected.position,
      selected.position + selected.node.nodeSize,
      replacement
    );
    transaction.setSelection(NodeSelection.create(transaction.doc, selected.position));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public insertPullquote({text = '', caption}: ChatInputPullquoteOptions = {}) {
    if(!text && caption === undefined) {
      const {pullquote, pullquoteText} = this.editor.schema.nodes;
      return this.convertSelectedTextblocks((node) => pullquote?.create(
        null,
        [pullquoteText.create(null, node.content)]
      ));
    }
    const content: JSONContent[] = [{
      type: 'pullquoteText',
      content: textContent(text)
    }];
    if(text) {
      content.push({
        type: 'pullquoteCaption',
        content: textContent(caption)
      });
    }
    return this.insertStructuralContent({type: 'pullquote', content});
  }

  private insertRichMediaContent(content: JSONContent | JSONContent[]) {
    return this.insertStructuralContent(content);
  }

  public beginRichMediaUpload(options: ChatInputRichMediaUploadOptions) {
    const {
      action,
      activeIndex,
      grouped = false,
      id,
      items,
      previewUrls,
      selection
    } = options;
    if(!id || !items.length || items.length !== previewUrls.length) return false;
    const uploadAttrs = {
      uploadAction: action || '',
      uploadActiveIndex: Number.isInteger(activeIndex) ? activeIndex : -1,
      uploadGrouped: grouped,
      uploadId: id,
      uploadItems: items,
      uploadPreviewUrls: previewUrls
    };

    if(action) {
      const node = this.editor.state.doc.nodeAt(selection.from);
      if(node?.type.name !== 'richMedia' || node.attrs.uploadId) return false;
      const block = node.attrs.block as PageBlock | undefined;
      const visualItems = visualRichMediaItems(block);
      if(
        !visualItems ||
        !Number.isInteger(activeIndex) ||
        activeIndex < 0 ||
        activeIndex >= visualItems.length ||
        items.some(({type}) => type === 'audio') ||
        (action === 'replace' && items.length !== 1) ||
        (action === 'add' &&
          block?._ !== 'pageBlockSlideshow' &&
          visualItems.length + items.length > MESSAGES_ALBUM_MAX_SIZE)
      ) return false;
      const transaction = this.editor.state.tr.setNodeMarkup(
        selection.from,
        undefined,
        {...node.attrs, ...uploadAttrs}
      );
      closeHistory(transaction);
      preserveRichMediaSelection(transaction, this.editor.state.selection, selection.from, selection.from + node.nodeSize);
      this.editor.view.dispatch(transaction);
      return true;
    }

    const block = pendingRichMediaBlock(id, items, grouped);
    if(!block) return false;
    this.restoreSelection(selection, false);
    return this.insertRichMediaContent({
      type: 'richMedia',
      attrs: {
        ...uploadAttrs,
        block,
        captionCredit: emptyRichMediaCaption().credit,
        documents: [],
        photos: [],
        previewUrl: previewUrls[0] || '',
        previewUrls
      }
    });
  }

  public beginRichMediaUploads(options: ChatInputRichMediaUploadOptions[]) {
    if(!options.length) return false;
    const uploadIds = new Set<string>();
    const content: JSONContent[] = [];
    for(const option of options) {
      const {
        action,
        grouped = false,
        id,
        items,
        previewUrls
      } = option;
      if(
        action ||
        !id ||
        uploadIds.has(id) ||
        !items.length ||
        items.length !== previewUrls.length
      ) return false;
      const block = pendingRichMediaBlock(id, items, grouped);
      if(!block) return false;
      uploadIds.add(id);
      content.push({
        type: 'richMedia',
        attrs: {
          uploadAction: '',
          uploadActiveIndex: -1,
          uploadGrouped: grouped,
          uploadId: id,
          uploadItems: items,
          uploadPreviewUrls: previewUrls,
          block,
          captionCredit: emptyRichMediaCaption().credit,
          documents: [],
          photos: [],
          previewUrl: previewUrls[0] || '',
          previewUrls
        }
      });
    }

    this.restoreSelection(options[0].selection, false);
    return this.insertRichMediaContent(content);
  }

  public hasPendingRichMediaUploads() {
    let pending = false;
    this.editor.state.doc.descendants((node) => {
      if(node.type.name === 'richMedia' && !!node.attrs.uploadId) {
        pending = true;
        return false;
      }
    });
    return pending;
  }

  public getPendingRichMediaUploadIds() {
    const ids: string[] = [];
    this.editor.state.doc.descendants((node) => {
      if(node.type.name !== 'richMedia' || !node.attrs.uploadId) return;
      ids.push(`${node.attrs.uploadId}`);
      return false;
    });
    return ids;
  }

  public getReferencedRichMediaUploadIds() {
    return getReferencedRichMediaUploadIds(this.editor.state);
  }

  public updateRichMediaUpload(
    uploadId: string,
    items: ChatInputRichMediaUploadItem[]
  ) {
    const found = richMediaUploadNode(this.editor, uploadId);
    if(!found) return false;
    const media = Array.from(this.input.querySelectorAll<HTMLElement>(
      '[data-rich-media][data-upload-id]'
    )).find((element) => element.dataset.uploadId === uploadId);
    if(!media) return false;
    const EventConstructor = this.input.ownerDocument.defaultView?.CustomEvent || CustomEvent;
    media.dispatchEvent(new EventConstructor(
      CHAT_INPUT_RICH_MEDIA_UPLOAD_UPDATE_EVENT,
      {detail: {items, uploadId}}
    ) as ChatInputRichMediaUploadUpdateEvent);
    return true;
  }

  public addRichMediaItems(
    position: number,
    activeIndex: number,
    media: ChatInputRichMedia[]
  ) {
    const node = this.editor.state.doc.nodeAt(position);
    if(!node) return false;
    const attrs = addedRichMediaNodeAttrs(node, activeIndex, media);
    if(!attrs) return false;
    const transaction = this.editor.state.tr.setNodeMarkup(position, undefined, attrs);
    transaction.setSelection(NodeSelection.create(transaction.doc, position));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public replaceRichMediaItem(
    position: number,
    activeIndex: number,
    media: ChatInputRichMedia
  ) {
    const node = this.editor.state.doc.nodeAt(position);
    if(!node) return false;
    const attrs = replacedRichMediaNodeAttrs(node, activeIndex, media);
    if(!attrs) return false;
    const transaction = this.editor.state.tr.setNodeMarkup(position, undefined, attrs);
    transaction.setSelection(NodeSelection.create(transaction.doc, position));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public insertRichMedia(
    media: ChatInputRichMedia[],
    options: ChatInputRichMediaOptions = {}
  ) {
    const nodes = richMediaJSONContent(media, options);
    if(!nodes.length) return false;
    return this.insertRichMediaContent(nodes);
  }

  public completeRichMediaUpload(uploadId: string, media: ChatInputRichMedia[]) {
    const found = richMediaUploadNode(this.editor, uploadId);
    if(!found || !media.length) return false;
    const {node, position} = found;
    const action = node.attrs.uploadAction as 'add' | 'replace' | '';
    const activeIndex = Number(node.attrs.uploadActiveIndex);
    const uploadPreviewUrls = node.attrs.uploadPreviewUrls as string[] || [];
    const mediaWithPreviews = media.map((item, index) => ({
      ...item,
      previewUrl: item.previewUrl || uploadPreviewUrls[index] || ''
    }));
    if(action) {
      const attrs = action === 'replace' ?
        replacedRichMediaNodeAttrs(node, activeIndex, mediaWithPreviews[0]) :
        addedRichMediaNodeAttrs(node, activeIndex, mediaWithPreviews);
      if(!attrs) return false;
      const transaction = this.editor.state.tr.setNodeMarkup(position, undefined, withoutRichMediaUpload(attrs));
      transaction.setMeta(RICH_MEDIA_ACTION_SETTLED_META, uploadId);
      transaction.setMeta('addToHistory', false);
      preserveRichMediaSelection(transaction, this.editor.state.selection, position, position + node.nodeSize);
      this.editor.view.dispatch(transaction);
      return true;
    }

    const content = richMediaJSONContent(
      mediaWithPreviews,
      {grouped: !!node.attrs.uploadGrouped},
      node.toJSON().content
    );
    if(!content.length) return false;
    const replacement = Fragment.fromArray(content.map((item) => (
      this.editor.schema.nodeFromJSON(item)
    )));
    const selection = this.editor.state.selection;
    const replacedTo = position + node.nodeSize;
    const transaction = this.editor.state.tr.replaceWith(
      position,
      replacedTo,
      replacement
    );
    transaction.setMeta('addToHistory', false);
    preserveRichMediaSelection(transaction, selection, position, replacedTo);
    this.editor.view.dispatch(transaction);
    return true;
  }

  public removeRichMediaUpload(uploadId: string) {
    const found = richMediaUploadNode(this.editor, uploadId);
    if(!found) return false;
    const {node, position} = found;
    if(node.attrs.uploadAction) {
      const transaction = this.editor.state.tr.setNodeMarkup(position, undefined, withoutRichMediaUpload(node.attrs));
      transaction.setMeta(RICH_MEDIA_ACTION_SETTLED_META, uploadId);
      transaction.setMeta('addToHistory', false);
      preserveRichMediaSelection(transaction, this.editor.state.selection, position, position + node.nodeSize);
      this.editor.view.dispatch(transaction);
    } else {
      const transaction = this.editor.state.tr
      .delete(position, position + node.nodeSize)
      .scrollIntoView();
      transaction.setMeta('addToHistory', false);
      this.editor.view.dispatch(transaction);
    }
    this.editor.view.focus();
    return true;
  }

  public groupSelectedRichMedia(layout: ChatInputRichMediaLayout) {
    const {doc} = this.editor.state;
    const range = selectedStructuralTopLevelRange(this.editor.view);
    if(!range || range.to - range.from < 2) return false;

    let position = 0;
    for(let index = 0; index < range.from; ++index) {
      position += doc.child(index).nodeSize;
    }
    const nodes: ProseMirrorNode[] = [];
    let end = position;
    for(let index = range.from; index < range.to; ++index) {
      const node = doc.child(index);
      nodes.push(node);
      end += node.nodeSize;
    }

    const grouped = groupRichMediaNodes(
      this.editor.schema.nodes.richMedia,
      nodes,
      layout
    );
    if(!grouped) return false;

    const transaction = this.editor.state.tr.replaceWith(position, end, grouped);
    transaction.setSelection(NodeSelection.create(transaction.doc, position));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public canGroupSelectedRichMedia() {
    const {doc} = this.editor.state;
    const range = selectedStructuralTopLevelRange(this.editor.view);
    if(!range || range.to - range.from < 2) return false;

    const nodes: ProseMirrorNode[] = [];
    for(let index = range.from; index < range.to; ++index) {
      nodes.push(doc.child(index));
    }
    return !!groupRichMediaNodes(
      this.editor.schema.nodes.richMedia,
      nodes,
      'collage'
    );
  }

  public toggleRichMediaLayout() {
    const selected = selectedNode(this.editor, 'richMedia');
    if(!selected) return false;
    const block = selected.node.attrs.block as PageBlock | undefined;
    if(block?._ !== 'pageBlockCollage' && block?._ !== 'pageBlockSlideshow') return false;
    if(
      block._ === 'pageBlockSlideshow' &&
      block.items.length > MESSAGES_ALBUM_MAX_SIZE
    ) return false;
    const nextBlock = {
      ...block,
      _: block._ === 'pageBlockCollage' ? 'pageBlockSlideshow' : 'pageBlockCollage'
    } as PageBlock.pageBlockCollage | PageBlock.pageBlockSlideshow;
    const transaction = this.editor.state.tr.setNodeMarkup(selected.position, undefined, {
      ...selected.node.attrs,
      block: nextBlock
    });
    if(this.editor.state.selection instanceof NodeSelection) {
      transaction.setSelection(NodeSelection.create(transaction.doc, selected.position));
    }
    this.editor.view.dispatch(transaction);
    this.editor.view.focus();
    return true;
  }

  public ungroupSelectedRichMedia() {
    const selected = selectedNode(this.editor, 'richMedia');
    if(!selected) return false;
    const nodes = ungroupRichMediaNode(
      this.editor.schema.nodes.richMedia,
      selected.node
    );
    if(!nodes?.length) return false;

    const transaction = this.editor.state.tr.replaceWith(
      selected.position,
      selected.position + selected.node.nodeSize,
      nodes
    );
    transaction.setSelection(NodeSelection.create(transaction.doc, selected.position));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public insertDetails({title = '', body = '', open = true}: ChatInputDetailsOptions = {}) {
    if(!title && !body) {
      const {
        details,
        detailsBody,
        detailsSummary,
        paragraph
      } = this.editor.schema.nodes;
      return this.convertSelectedTextblocks((node) => details?.create({open}, [
        detailsSummary.create(null, node.content),
        detailsBody.create(null, paragraph.create())
      ]));
    }
    return this.insertStructuralContent({
      type: 'details',
      attrs: {open},
      content: [
        {type: 'detailsSummary', content: textContent(title)},
        {
          type: 'detailsBody',
          content: [{type: 'paragraph', content: textContent(body)}]
        }
      ]
    });
  }

  public toggleDetailsOpen(element?: HTMLElement) {
    const toggle = (detailsPosition: number, details: ProseMirrorNode) => {
      const open = !details.attrs.open;
      let transaction = this.editor.state.tr.setNodeMarkup(detailsPosition, undefined, {
        ...details.attrs,
        open
      });
      if(!open) {
        transaction = moveSelectionToDetailsSummaryOnClose(
          transaction,
          detailsPosition,
          details
        );
      }
      this.editor.view.dispatch(transaction);
      return true;
    };
    let position = this.editor.state.selection.from;
    if(element) {
      try {
        position = this.editor.view.posAtDOM(element, 0);
      } catch{
        return false;
      }
    }

    const {doc} = this.editor.state;
    const node = doc.nodeAt(position);
    if(node?.type.name === 'details') {
      return toggle(position, node);
    }

    const resolved = doc.resolve(position);
    for(let depth = resolved.depth; depth > 0; --depth) {
      const details = resolved.node(depth);
      if(details.type.name !== 'details') continue;
      return toggle(resolved.before(depth), details);
    }
    return false;
  }

  public setContent(content: string | Node) {
    if(typeof(content) === 'string') {
      this.setTextWithEntities(content);
      return;
    }

    const {value, entities} = getRichValueWithCaret(content, true, false);
    this.setTextWithEntities(value, entities);
  }

  public insertTable({columns = 3, rows = 3, withHeaderRow = true}: ChatInputTableOptions = {}) {
    const {state} = this.editor;
    if(!this.canInsertTable({columns, rows, withHeaderRow})) return false;
    const {selection} = state;
    const richMediaInsertionPosition = richMediaSiblingInsertionPosition(state);
    const selectedText = richMediaInsertionPosition !== undefined || selection.empty ?
      '' :
      selectedTextWithLeafFallback(state);
    const chain = this.editor.chain();
    if(richMediaInsertionPosition !== undefined) {
      chain.command(({state, tr}) => {
        const paragraph = state.schema.nodes.paragraph.createAndFill();
        if(!paragraph) return false;
        tr.insert(richMediaInsertionPosition, paragraph);
        tr.setSelection(TextSelection.create(
          tr.doc,
          richMediaInsertionPosition + 1
        ));
        return true;
      });
    }
    const result = chain
    .insertTable({cols: columns, rows, withHeaderRow})
    .command(({state, tr}) => {
      const context = selectedChatTable({
        doc: tr.doc,
        selection: tr.selection
      });
      if(!context || context.wrapper) return !!context;
      const wrapper = state.schema.nodes[CHAT_TABLE_WRAPPER_NODE_NAME];
      const title = state.schema.nodes[CHAT_TABLE_TITLE_NODE_NAME];
      if(!wrapper || !title) return false;
      const table = context.table.type.create({
        ...context.table.attrs,
        title: '',
        titleRichHTML: null,
        titleRichText: null
      }, context.table.content, context.table.marks);
      tr.replaceWith(
        context.tablePosition,
        context.tablePosition + context.table.nodeSize,
        wrapper.create(null, [title.create(), table])
      );
      this.pendingScrollTargetPosition = context.tablePosition;
      const tablePosition = context.tablePosition + 1 + title.create().nodeSize;
      const firstCellPosition = tablePosition + 1 + TableMap.get(table).map[0];
      const firstCellSelection = TextSelection.findFrom(
        tr.doc.resolve(firstCellPosition + 1),
        1,
        true
      );
      if(firstCellSelection) tr.setSelection(firstCellSelection);
      return true;
    })
    .command(({tr}) => {
      if(selectedText) tr.insertText(selectedText);
      return true;
    })
    .command(({state, tr}) => {
      if(isTrailingPlaceholderNode(tr.doc.lastChild)) return true;
      const paragraph = state.schema.nodes.paragraph.createAndFill();
      if(paragraph) tr.insert(tr.doc.content.size, paragraph);
      return true;
    })
    .scrollIntoView()
    .run();
    this.pendingScrollTargetPosition = undefined;
    return this.finishStructuralCommand(result);
  }

  public getTableTitle() {
    const context = selectedChatTable(this.editor.state);
    if(!context) return;
    return context.title ?
      context.title.textBetween(0, context.title.content.size, '\n') :
      `${context.table.attrs.title || ''}`;
  }

  public getBlockquoteCaption() {
    const {$from} = this.editor.state.selection;
    for(let depth = $from.depth; depth >= 0; --depth) {
      const node = $from.node(depth);
      if(node.type.name !== 'blockquote') continue;
      const caption = node.lastChild?.type.name === 'blockquoteCaption' ?
        node.lastChild :
        undefined;
      return caption ?
        caption.textBetween(0, caption.content.size, '\n') :
        `${node.attrs.caption || ''}`;
    }
  }

  public setBlockquoteCaption(caption: string) {
    if(this.getBlockquoteCaption() === undefined) return false;
    const {$from} = this.editor.state.selection;
    for(let depth = $from.depth; depth > 0; --depth) {
      const quote = $from.node(depth);
      if(quote.type.name !== 'blockquote') continue;
      const quotePosition = $from.before(depth);
      const captionType = this.editor.schema.nodes.blockquoteCaption;
      const content = caption ? this.editor.schema.text(caption) : undefined;
      const replacement = captionType.create(null, content);
      let captionPosition: number;
      let captionNode: ProseMirrorNode;
      quote.forEach((child, offset) => {
        if(child.type !== captionType) return;
        captionPosition = quotePosition + 1 + offset;
        captionNode = child;
      });
      const transaction = this.editor.state.tr;
      if(captionNode) {
        transaction.replaceWith(
          captionPosition,
          captionPosition + captionNode.nodeSize,
          replacement
        );
      } else {
        transaction.insert(quotePosition + quote.nodeSize - 1, replacement);
      }
      this.editor.view.dispatch(transaction);
      this.editor.view.focus();
      return true;
    }
    return false;
  }

  public setTableTitle(title: string) {
    const context = selectedChatTable(this.editor.state);
    if(!context) return false;
    if(!context.title || context.titlePosition === undefined) {
      return this.editor.chain().focus().updateAttributes('table', {
        title,
        titleRichHTML: null,
        titleRichText: null
      }).run();
    }

    const replacement = context.title.type.create(
      context.title.attrs,
      title ? this.editor.schema.text(title) : undefined
    );
    const transaction = this.editor.state.tr.replaceWith(
      context.titlePosition,
      context.titlePosition + context.title.nodeSize,
      replacement
    );
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public toggleTableBordered() {
    return this.toggleTableBooleanAttribute('bordered');
  }

  public toggleTableStriped() {
    return this.toggleTableBooleanAttribute('striped');
  }

  private toggleTableBooleanAttribute(name: 'bordered' | 'striped') {
    const context = selectedChatTable(this.editor.state);
    if(!context) return false;
    const transaction = this.editor.state.tr.setNodeMarkup(
      context.tablePosition,
      undefined,
      {
        ...context.table.attrs,
        [name]: !context.table.attrs[name]
      }
    );
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  public toggleTableHeaderRow() {
    return this.editor.chain().focus().toggleHeaderRow().run();
  }

  public canMergeTableCells() {
    return this.editor.can().mergeCells();
  }

  public mergeTableCells() {
    return this.editor.chain().focus().mergeCells().run();
  }

  public canSplitTableCell() {
    return this.editor.can().splitCell();
  }

  public splitTableCell() {
    return this.editor.chain().focus().splitCell().run();
  }

  private collapseTableStructureSelection(transaction: Transaction) {
    if(!(transaction.selection instanceof CellSelection)) return true;
    const $cell = cellAround(transaction.selection.$from);
    if(!$cell) return true;
    const selection = TextSelection.findFrom(
      transaction.doc.resolve(Math.min(transaction.doc.content.size, $cell.pos + 1)),
      1,
      true
    );
    if(selection) transaction.setSelection(selection);
    return true;
  }

  private changeTableStructure(command: 'addColumnBefore' | 'addColumnAfter' | 'deleteColumn' | 'addRowBefore' | 'addRowAfter' | 'deleteRow') {
    return this.editor.chain().focus()[command]()
    .command(({tr}) => this.collapseTableStructureSelection(tr))
    .run();
  }

  public addTableColumnBefore() {
    return this.changeTableStructure('addColumnBefore');
  }

  public addTableColumnAfter() {
    return this.changeTableStructure('addColumnAfter');
  }

  public deleteTableColumn() {
    return this.changeTableStructure('deleteColumn');
  }

  public addTableRowBefore() {
    return this.changeTableStructure('addRowBefore');
  }

  public addTableRowAfter() {
    return this.changeTableStructure('addRowAfter');
  }

  public deleteTableRow() {
    return this.changeTableStructure('deleteRow');
  }

  public deleteTable() {
    const deleted = deleteChatInputTable(
      this.editor.state,
      (transaction) => this.editor.view.dispatch(transaction)
    );
    if(deleted) this.editor.view.focus();
    return deleted;
  }

  public replaceDocumentRange(
    from: number,
    to: number,
    text: string,
    entities: MessageEntity[] = []
  ) {
    if(isEmptyFirstLineSpace(this.editor.state, from, to, text)) return false;

    return this.replaceContent(from, to, telegramTextToTiptap(text, entities));
  }

  public replaceDocumentRangeWithRichMessage(from: number, to: number, message: RichMessage) {
    return this.replaceContent(from, to, richMessageToTiptap(message));
  }

  public replaceAllText(text: string, entities: MessageEntity[] = []) {
    return this.replaceAllContent(telegramTextToTiptap(text, entities));
  }

  public replaceAllRichMessage(message: RichMessage) {
    return this.replaceAllContent(richMessageToTiptap(message));
  }

  /** Edit the content while retaining the document's policy and undo history. */
  private replaceAllContent(document: JSONContent) {
    let doc: ProseMirrorNode;
    try {
      doc = this.parseDocument(document);
    } catch{
      return false;
    }
    const {state, view} = this.editor;
    const transaction = state.tr.replaceWith(0, state.doc.content.size, doc.content);
    transaction.setSelection(Selection.atEnd(transaction.doc));
    view.dispatch(transaction.scrollIntoView());
    view.focus();
    return true;
  }

  private replaceContent(from: number, to: number, document: JSONContent) {
    return this.editor.chain().focus().setTextSelection({from, to}).command(({tr, commands}) => {
      const {$from, $to} = tr.selection;
      const parentType = $from.sameParent($to) ? $from.parent.type.name : undefined;
      const content = insertedContent(document, parentType);
      if(!content.length) return commands.deleteSelection();
      const nodes = content.map((node) => this.editor.schema.nodeFromJSON(node));
      if(nodes.every((node) => node.isInline)) return commands.insertContent(content);
      const start = tr.steps.length;
      const {from, to} = tr.selection;
      const slice = richReplacementSlice(Fragment.from(nodes), tr.selection);
      if(tr.maybeStep(new ReplaceStep(from, to, slice)).failed) tr.replaceRange(from, to, slice);
      selectionToInsertionEnd(tr, start, -1);
      return true;
    }).run();
  }

  public replaceSelection(text: string, entities: MessageEntity[] = []) {
    const {from, to} = this.editor.state.selection;
    return this.replaceDocumentRange(from, to, text, entities);
  }

  public replaceTextRange(from: number, to: number, text: string, entities: MessageEntity[] = []) {
    const serialized = tiptapToTelegram(this.editor.state.doc, true);
    const pmFrom = serialized.positionAtTextOffset(from, 'forward');
    const pmTo = serialized.positionAtTextOffset(to, 'backward');
    return this.replaceDocumentRange(pmFrom, pmTo, text, entities);
  }

  private splitQuoteSelection(transaction: Transaction) {
    const {selection} = transaction;
    if(selection.empty || !(selection instanceof TextSelection)) return;
    const {from, to, $from, $to} = selection;
    // A new block boundary replaces one existing line break. Keep any extra
    // authored blank lines, and count inline atoms as one position as well.
    const leafText = (node: ProseMirrorNode) => node.type.name === 'hardBreak' ? '\n' : '\ufffc';
    const splitStart = $from.parent.isTextblock && $from.parentOffset > 0;
    const splitEnd = $to.parent.isTextblock && $to.parentOffset < $to.parent.content.size;
    const selectedStart = splitStart ?
      /^[\t ]*\n[\t ]*/.exec($from.parent.textBetween($from.parentOffset, Math.min($from.parent.content.size, $from.parentOffset + to - from), '', leafText))?.[0].length || 0 : 0;
    const selectedEnd = splitEnd ?
      /[\t ]*\n[\t ]*$/.exec($to.parent.textBetween(Math.max(0, $to.parentOffset - (to - from)), $to.parentOffset, '', leafText))?.[0].length || 0 : 0;
    if(selectedStart + selectedEnd >= to - from) return;
    const beforeText = $from.parent.textBetween(0, $from.parentOffset, '', leafText);
    const afterText = $to.parent.textBetween($to.parentOffset, $to.parent.content.size, '', leafText);
    const before = splitStart ? (selectedStart ? /[\t ]*$/ : /[\t ]*(?:\n[\t ]*)?$/).exec(beforeText)?.[0].length || 0 : 0;
    const after = splitEnd ? (selectedEnd ? /^[\t ]*/ : /^[\t ]*(?:\n[\t ]*)?/).exec(afterText)?.[0].length || 0 : 0;
    if(after || selectedEnd) transaction.delete(to - selectedEnd, to + after);
    if(before || selectedStart) transaction.delete(from - before, from + selectedStart);

    const splitFrom = transaction.mapping.map(from, 1);
    const splitTo = transaction.mapping.map(to, -1);
    const $splitTo = transaction.doc.resolve(splitTo);
    if(splitEnd && $splitTo.parent.isTextblock &&
      ($splitTo.parentOffset < $splitTo.parent.content.size || selectedEnd || afterText.includes('\n'))) {
      transaction.split(splitTo);
    }
    const $splitFrom = transaction.doc.resolve(splitFrom);
    if(splitStart && $splitFrom.parent.isTextblock &&
      ($splitFrom.parentOffset > 0 || selectedStart || beforeText.includes('\n'))) {
      transaction.split(splitFrom);
    }

    const mappedFrom = transaction.mapping.map(from, 1);
    const mappedTo = transaction.mapping.map(to, -1);
    transaction.setSelection(selection.anchor > selection.head ?
      TextSelection.create(transaction.doc, mappedTo, mappedFrom) :
      TextSelection.create(transaction.doc, mappedFrom, mappedTo));
  }

  private unwrapSelectedBlockquote() {
    const {selection: initialSelection} = this.editor.state;
    if(initialSelection.empty || !(initialSelection instanceof TextSelection)) return;
    const {$from: initialFrom, $to: initialTo} = initialSelection;
    let initialQuoteDepth = -1;
    for(let depth = initialFrom.depth; depth > 0; --depth) {
      if(
        initialFrom.node(depth).type.name === 'blockquote' &&
        initialTo.depth >= depth &&
        initialTo.node(depth) === initialFrom.node(depth)
      ) {
        initialQuoteDepth = depth;
        break;
      }
    }
    if(initialQuoteDepth < 0) return;

    const {from, to} = initialSelection;
    const transaction = this.editor.state.tr;
    this.splitQuoteSelection(transaction);

    const selectedFrom = transaction.mapping.map(from, 1);
    const selectedTo = transaction.mapping.map(to, -1);
    const resolved = transaction.doc.resolve(selectedFrom);
    let quoteDepth = -1;
    for(let depth = resolved.depth; depth > 0; --depth) {
      if(resolved.node(depth).type.name === 'blockquote') {
        quoteDepth = depth;
        break;
      }
    }
    if(quoteDepth < 0) return false;
    const quote = resolved.node(quoteDepth);
    const quotePosition = resolved.before(quoteDepth);
    const beforeBlocks: ProseMirrorNode[] = [];
    const selectedBlocks: ProseMirrorNode[] = [];
    const afterBlocks: ProseMirrorNode[] = [];
    let caption: ProseMirrorNode;
    quote.forEach((child, offset) => {
      if(child.type.name === 'blockquoteCaption') {
        caption = child;
        return;
      }
      const position = quotePosition + 1 + offset;
      const end = position + child.nodeSize;
      if(selectedFrom < end && selectedTo > position) {
        selectedBlocks.push(child);
      } else if(end <= selectedFrom) {
        beforeBlocks.push(child);
      } else {
        afterBlocks.push(child);
      }
    });
    if(!selectedBlocks.length) return false;

    const replacements: ProseMirrorNode[] = [];
    const makeQuote = (blocks: ProseMirrorNode[], includeCaption: boolean) => {
      if(!blocks.length) return;
      replacements.push(quote.type.create(quote.attrs, [
        ...blocks,
        ...(includeCaption && caption ? [caption] : [])
      ]));
    };
    makeQuote(beforeBlocks, !afterBlocks.length);
    const selectedPosition = quotePosition + (
      replacements.length ? replacements[0].nodeSize : 0
    );
    replacements.push(...selectedBlocks);
    makeQuote(afterBlocks, true);
    if(!beforeBlocks.length && !afterBlocks.length && caption?.content.size) {
      replacements.push(this.editor.schema.nodes.paragraph.create(null, caption.content));
    }

    transaction.replaceWith(
      quotePosition,
      quotePosition + quote.nodeSize,
      replacements
    );
    const selectedEnd = selectedPosition + selectedBlocks.reduce(
      (size, block) => size + block.nodeSize,
      0
    );
    const selectionFrom = selectedPosition + 1;
    const selectionTo = selectedEnd - 1;
    transaction.setSelection(initialSelection.anchor > initialSelection.head ?
      TextSelection.create(transaction.doc, selectionTo, selectionFrom) :
      TextSelection.create(transaction.doc, selectionFrom, selectionTo));
    this.editor.view.dispatch(transaction.scrollIntoView());
    this.editor.view.focus();
    return true;
  }

  /**
   * Whether the mounted schema can carry this markup at all. A plain field has no
   * `highlight` mark to toggle, so the control for it must not be offered rather
   * than fail on click.
   */
  public supportsMarkup(type: MarkdownType) {
    if(type === 'quote') return !!this.editor.schema.nodes.blockquote;
    return !!this.editor.schema.marks[markupName(type)];
  }

  public applyMarkup({
    type,
    href,
    dateSuffix
  }: {
    type: MarkdownType,
    href?: string,
    dateSuffix?: string
  }) {
    if(type === 'quote') {
      const {$from, $to, empty} = this.editor.state.selection;
      if(!empty && $from.sameParent($to) &&
        $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size) {
        for(let depth = $from.depth - 1; depth > 0; --depth) {
          const parentName = $from.node(depth).type.name;
          if(parentName !== 'listItem' && parentName !== 'taskItem') continue;
          return this.editor.chain()
          .focus()
          .liftListItem(parentName)
          .toggleWrap('blockquote')
          .run();
        }
      }

      const unwrapped = this.unwrapSelectedBlockquote();
      if(unwrapped !== undefined) return unwrapped;

      const wasAllSelection = this.editor.state.selection instanceof AllSelection;
      return this.editor.chain().focus().command(({tr}) => {
        clampSelectionOutsideTrailingPlaceholder(tr);
        this.splitQuoteSelection(tr);
        return true;
      }).toggleWrap('blockquote').command(({tr}) => {
        // The clamp pulled the selection out of the technical paragraph; a
        // select-all has to come back, or the next markup applies to less than
        // the user still sees selected.
        if(wasAllSelection) tr.setSelection(new AllSelection(tr.doc));
        return true;
      }).run();
    }

    if(type === 'link') {
      const chain = this.editor.chain().focus();
      if(!href) return chain.extendMarkRange('link').unsetMark('link').run();
      return chain.unsetMark('code').unsetMark('formattedDate').setMark('link', {href}).run();
    }

    if(type === 'date') {
      const chain = this.editor.chain().focus();
      if(!dateSuffix) return chain.unsetMark('formattedDate').run();
      const date = Number(dateSuffix);
      if(!Number.isFinite(date)) return false;
      const pFlags = this.editor.getAttributes('formattedDate').pFlags || {};
      return chain.setMark('formattedDate', {date, pFlags}).run();
    }

    const name = markupName(type);
    if(type === 'monospace') {
      const chain = this.editor.chain().focus();
      return this.editor.isActive('code') ? chain.unsetMark('code').run() : chain.setMark('code').run();
    }

    const chain = this.editor
    .chain()
    .focus()
    .unsetMark('code')
    .unsetMark('formattedDate');
    if(type === 'subscript' || type === 'superscript') {
      chain.unsetMark(type === 'subscript' ? 'superscript' : 'subscript');
    }
    return chain.toggleMark(name).run();
  }

  public getMarkupState(type: MarkdownType): ChatInputMarkupState {
    const getState = (name: string): ChatInputMarkupState => {
      const {from, to, empty} = this.editor.state.selection;
      const fully = this.editor.isActive(name);
      if(empty) return {fully, partly: fully};

      let partly = fully;
      this.editor.state.doc.nodesBetween(from, to, (node) => {
        if(partly) return false;
        if(node.type.name === name || node.marks.some((mark) => mark.type.name === name)) {
          partly = true;
          return false;
        }
      });
      return {fully, partly};
    };

    if(type !== 'quote') return getState(markupName(type));

    return getState('blockquote');
  }

  private withDocumentRevision(selection: ChatInputEditorSelection) {
    Object.defineProperty(selection, 'revision', {
      configurable: true,
      value: this.documentRevision
    });
    return selection;
  }

  public captureSelection(): ChatInputEditorSelection {
    const {selection} = this.editor.state;
    if(selection instanceof AllSelection) {
      return this.withDocumentRevision({from: selection.from, to: selection.to, type: 'all'});
    }
    if(selection instanceof CellSelection) {
      return this.withDocumentRevision({
        from: selection.$anchorCell.pos,
        to: selection.$headCell.pos,
        type: 'cell'
      });
    }
    const {from, to} = selection;
    return this.withDocumentRevision(
      selection instanceof NodeSelection ?
        {from, to, type: 'node'} :
        {
          ...(selection.anchor > selection.head ? {backward: true as const} : {}),
          from,
          to
        }
    );
  }

  public captureSelectionAtPoint(clientX: number, clientY: number) {
    const {state, view} = this.editor;
    const rect = view.dom.getBoundingClientRect();
    const left = Math.max(rect.left + 1, Math.min(rect.right - 1, clientX));
    const top = Math.max(rect.top + 1, Math.min(rect.bottom - 1, clientY));
    const coordinates = view.posAtCoords({left, top});
    if(!coordinates) return this.captureSelection();

    const position = Math.max(0, Math.min(state.doc.content.size, coordinates.pos));
    const resolved = state.doc.resolve(position);
    const selection = TextSelection.findFrom(resolved, 1, true) ||
      TextSelection.findFrom(resolved, -1, true);
    return selection ?
      this.withDocumentRevision({
        from: selection.from,
        to: selection.to
      }) :
      this.captureSelection();
  }

  public restoreSelection(selection: ChatInputEditorSelection, focus = true) {
    const max = this.editor.state.doc.content.size;
    const from = Math.max(0, Math.min(max, selection.from));
    const rawTo = Math.max(0, Math.min(max, selection.to));
    const to = selection.type === 'cell' ? rawTo : Math.max(from, rawTo);
    let restoredSelection: Selection;
    if(selection.type === 'all') {
      restoredSelection = new AllSelection(this.editor.state.doc);
    } else if(selection.type === 'cell') {
      try {
        restoredSelection = CellSelection.create(this.editor.state.doc, from, to);
      } catch{
        // The table may have changed while a toolbar popup was open. Fall back
        // to the nearest valid text selection below.
      }
    }
    if(!restoredSelection) {
      const node = selection.type === 'node' ? this.editor.state.doc.nodeAt(from) : undefined;
      if(node && NodeSelection.isSelectable(node)) {
        restoredSelection = NodeSelection.create(this.editor.state.doc, from);
      } else {
        this.editor.commands.setTextSelection(selection.backward ? {from: to, to: from} : {from, to});
      }
    }
    if(restoredSelection) {
      this.editor.view.dispatch(this.editor.state.tr.setSelection(restoredSelection));
    }
    if(focus) this.editor.commands.focus();
  }

  public focus() {
    this.editor.view.focus();
  }

  public focusAtEnd(focus = true) {
    const {doc} = this.editor.state;
    const trailing = doc.lastChild;
    let boundary = isTrailingPlaceholderNode(trailing) ?
      doc.content.size - trailing.nodeSize :
      doc.content.size;
    const logicalLast = isTrailingPlaceholderNode(trailing) && doc.childCount > 1 ?
      doc.child(doc.childCount - 2) :
      doc.lastChild;
    const caption = logicalLast?.lastChild;
    if(
      (logicalLast?.type.name === 'blockquote' && caption?.type.name === 'blockquoteCaption' ||
        logicalLast?.type.name === 'pullquote' && caption?.type.name === 'pullquoteCaption') &&
      !caption.content.size
    ) {
      boundary -= caption.nodeSize + 1;
    }
    const selection = TextSelection.findFrom(doc.resolve(boundary), -1, true) ||
      Selection.atStart(doc);
    this.editor.view.dispatch(this.editor.state.tr.setSelection(selection));
    if(focus) this.editor.view.focus();
  }

  public setEditable(editable: boolean) {
    this.editor.setEditable(editable, false);
    this.scheduleStateChange();
  }

  public setExpanded(expanded: boolean) {
    if(this.expanded === expanded) return;
    this.expanded = expanded;
    this.syncMode(true);
    this.scheduleStateChange();
  }

  public deleteBackward() {
    if(this.destroyed || !this.editor.isEditable) return false;
    this.editor.view.focus();
    // Tiptap's keyboardShortcut command copies document steps but drops
    // selection-only transactions. Use the actual key handlers for both.
    if(this.runKeyboardShortcut('Backspace')) return true;

    const {selection} = this.editor.state;
    if(!selection.empty) return this.editor.chain().focus().deleteSelection().run();

    const node = selection.$from.nodeBefore;
    if(!node) return false;
    if(node.isInline && !node.isText) {
      return this.editor.chain().focus().deleteRange({
        from: selection.from - node.nodeSize,
        to: selection.from
      }).run();
    }
    if(node.isText) {
      // Formatting can split a grapheme across text nodes. Inline atoms are
      // represented by a hard boundary so deletion does not cross them.
      const length = lastGraphemeLength(selection.$from.parent.textBetween(
        0,
        selection.$from.parentOffset,
        undefined,
        '\n'
      ));
      if(!length) return false;
      return this.editor.chain().focus().deleteRange({
        from: selection.from - length,
        to: selection.from
      }).run();
    }
    return false;
  }

  public toggleBlockquoteCollapsed(element: HTMLElement) {
    let position: number;
    try {
      position = this.editor.view.posAtDOM(element, 0);
    } catch{
      return false;
    }

    const resolved = this.editor.state.doc.resolve(position);
    for(let depth = resolved.depth; depth > 0; --depth) {
      const node = resolved.node(depth);
      if(node.type.name !== 'blockquote') continue;
      if(!isCollapsibleQuote(node, node.attrs.rich || this.mode === 'rich')) return false;
      const nodePosition = resolved.before(depth);
      const transaction = this.editor.state.tr.setNodeMarkup(nodePosition, undefined, {
        ...node.attrs,
        collapsed: !node.attrs.collapsed
      });
      this.editor.view.dispatch(transaction);
      return true;
    }
    return false;
  }

  public snapshot(): ChatInputEditorSnapshot {
    return {
      doc: this.editor.getJSON(),
      editable: this.editor.isEditable,
      focused: this.editor.isFocused,
      richMessageOptions: {...this.richMessageOptions},
      selection: this.captureSelection()
    };
  }

  public destroy() {
    if(this.destroyed) return;
    this.destroyed = true;
    this.clearCustomEmojiPointer();
    this.editor.off('update', this.onUpdate);
    this.editor.off('selectionUpdate', this.onSelectionUpdate);
    this.editor.off('transaction', this.onTransaction);
    this.input.removeEventListener('input', this.onNativeInputCapture, {capture: true});
    this.input.removeEventListener('compositionstart', this.onCompositionStart);
    this.input.removeEventListener('compositionend', this.onCompositionEnd);
    this.input.removeEventListener(CHAT_INPUT_MATH_MODE_REQUEST_EVENT, this.onMathModeRequest);
    this.input.removeEventListener('keydown', this.onDocumentButtonKeyDown);
    this.unregister();
    this.editor.destroy();
    this.richMediaPreviewHistoryLease.clear();
    this.input.classList.remove('tiptap', 'chat-input-editor-expanded');
    this.input.classList.remove(
      instantViewStyles.RichMessage,
      instantViewStyles.RichText,
      instantViewStyles.Blocks
    );
    delete this.input.dataset.chatInputEditor;
    delete this.input.dataset.chatInputEditorMode;
  }
}

const createChatInputEditor: CreateChatInputEditor = (input, options, snapshot) => (
  new TiptapChatInputEditor(input, options, snapshot)
);

export default createChatInputEditor;
export type {
  ChatInputDetailsOptions,
  ChatInputEditor,
  ChatInputEditorMode,
  ChatInputEditorInputEvent,
  ChatInputRichMessage,
  ChatInputEditorSnapshot,
  ChatInputPullquoteOptions,
  ChatInputRichMediaLayout,
  ChatInputTableOptions,
  CreateChatInputEditor
};
