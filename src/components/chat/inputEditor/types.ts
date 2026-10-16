import type {JSONContent} from '@tiptap/core';
import type {
  Document,
  InputRichMessage,
  MessageEntity,
  PageBlock,
  Photo,
  RichMessage
} from '@layer';
import type {MarkdownType} from '@helpers/dom/getRichElementValue';
import type {InputFormattingTypes} from '@helpers/dom/getInputFormattingTypes';
import type {InstantViewHeadingLevel} from '@components/instantViewFormatting';
import type {ButtonBackground, ButtonRowAlign} from '@components/wrappers/buttonTypes';

export type ChatInputEditorSelection = {
  backward?: true,
  from: number,
  revision?: number,
  to: number,
  type?: 'all' | 'cell' | 'node'
};

export type ChatInputSelectedMath = {
  block: boolean,
  source: string
};

export type ChatInputSelectedLink = {
  from: number,
  text: string,
  to: number,
  url: string
};

export type ChatInputEditorSnapshot = {
  doc: JSONContent,
  editable: boolean,
  focused: boolean,
  richMessageOptions?: {
    noAutolink?: boolean,
    rtl?: boolean
  },
  selection: ChatInputEditorSelection
};

export type ChatInputMarkupState = {
  fully: boolean,
  partly: boolean
};

export type ChatInputEditorMode = 'plain' | 'rich';

export type ChatInputEditorOptions = {
  enableBlockSelection?: boolean,
  /** Restrict the schema to what a plain message can carry (captions, comments). */
  plainOnly?: boolean,
  /** Restrict it further to one line: no block structure, no break, no Enter. */
  singleLine?: boolean,
  /**
   * The formatting a plain field declares (`getInputFormattingTypes`); its schema
   * leaves out the rest. Everything a plain message carries when not given.
   */
  formatting?: InputFormattingTypes,
  isNewLineShortcutPressed?: (event: KeyboardEvent) => boolean,
  onCodeBlockLanguagePicker?: (element: HTMLElement) => void,
  onLinkEditor?: (selection: ChatInputEditorSelection) => void,
  onKeyDown?: (event: KeyboardEvent) => boolean,
  onStateChange?: () => void
};

export type ChatInputEditorInputEvent = Event & {
  chatInputEditorStructuralChange?: true,
  chatInputEditorUserInput?: true
};

export type ChatInputFormatting =
  | 'bulletList'
  | 'buttonRow'
  | 'codeBlock'
  | 'details'
  | 'divider'
  | 'footer'
  | 'heading'
  | 'inlineButton'
  | 'math'
  | 'orderedList'
  | 'pullquote'
  | 'taskList';

export type ChatInputTableOptions = {
  columns?: number,
  rows?: number,
  withHeaderRow?: boolean
};

export type ChatInputOrderedListState = {
  itemType?: string,
  itemValue?: number,
  reversed: boolean,
  start: number,
  type?: string
};

export type ChatInputPullquoteOptions = {
  caption?: string,
  text?: string
};

export type ChatInputDetailsOptions = {
  body?: string,
  open?: boolean,
  title?: string
};

/**
 * Layer 229's buttons in a message of one's own: what one may do is what desktop and WebA let
 * a user author — open a link, copy a text, open someone's profile, or nothing.
 */
export type ChatInputRichButtonAction = 'url' | 'copy' | 'userProfile' | 'disabled';
export type ChatInputRichButtonColor = ButtonBackground;
export type ChatInputButtonRowAlign = ButtonRowAlign;

export type ChatInputRichButton = {
  text: string,
  action: ChatInputRichButtonAction,
  url?: string,
  copyText?: string,
  userId?: UserId,
  color?: ChatInputRichButtonColor,
  // an inline button may be drawn as a link instead of a button; kept as it came
  link?: boolean
};

export type ChatInputRichButtonOptions = ChatInputRichButton & {
  // a row of its own (`pageBlockButtonRow`) rather than a button inside the text (`textButton`)
  separateLine?: boolean
};

export type ChatInputFooterOptions = {
  entities?: MessageEntity[],
  text?: string
};

export type ChatInputMapOptions = {
  accuracyRadius?: number,
  caption?: string,
  captionEntities?: MessageEntity[],
  credit?: string,
  creditEntities?: MessageEntity[],
  height?: number,
  latitude: number,
  longitude: number,
  width?: number,
  zoom?: number
};

// a file is a document row, as an audio is: one per block, never in a collage
export type ChatInputRichMediaType = 'audio' | 'document' | 'photo' | 'video';

export type ChatInputRichMedia = {
  document?: Document.document,
  photo?: Photo.photo,
  previewUrl?: string,
  spoiler?: boolean,
  type: ChatInputRichMediaType
};

export type ChatInputRichMediaLayout = 'collage' | 'slideshow';

export type ChatInputRichMediaOptions = {
  caption?: string,
  captionEntities?: MessageEntity[],
  grouped?: boolean
};

export type ChatInputRichMediaUploadItem = {
  /** A file's or an audio's document as prepared for its upload, from the local file: its row's */
  document?: Document.document,
  duration?: number,
  fileName?: string,
  fileSize?: number,
  height?: number,
  id: string,
  mimeType?: string,
  progress: number,
  state: 'error' | 'preparing' | 'processing' | 'ready' | 'uploading',
  type: ChatInputRichMediaType,
  /** The upload the row shows, as an outgoing message's (`appDownloadManager.getUpload`) */
  uploadingFileName?: string,
  width?: number
};

export type ChatInputRichMediaUploadOptions = {
  action?: 'add' | 'replace',
  activeIndex?: number,
  grouped?: boolean,
  id: string,
  items: ChatInputRichMediaUploadItem[],
  previewUrls: string[],
  selection: ChatInputEditorSelection
};

export type ChatInputOpaqueRichBlock =
  PageBlock.pageBlockFooter |
  PageBlock.pageBlockDivider |
  PageBlock.pageBlockAnchor |
  PageBlock.inputPageBlockMap;

export type ChatInputRichMessage = {
  input: InputRichMessage.inputRichMessage,
  output: RichMessage
};

export interface ChatInputEditor {
  readonly input: HTMLElement;
  readonly isComposing: boolean;
  /** Runs on a plain message's schema (`plainOnly` or `singleLine`): no rich block fits it. */
  readonly plainOnly: boolean;

  applyMarkup(options: {
    type: MarkdownType,
    href?: string,
    dateSuffix?: string
  }): boolean;
  addTableColumnAfter(): boolean;
  addTableColumnBefore(): boolean;
  addTableRowAfter(): boolean;
  addTableRowBefore(): boolean;
  addRichMediaItems(position: number, activeIndex: number, media: ChatInputRichMedia[]): boolean;
  beginRichMediaUpload(options: ChatInputRichMediaUploadOptions): boolean;
  beginRichMediaUploads(options: ChatInputRichMediaUploadOptions[]): boolean;
  canInsertTable(options?: ChatInputTableOptions): boolean;
  /**
   * Whether a toolbar control would change anything at the selection. A table
   * cell, a table title, a details summary and a pullquote hold text only, so
   * the block controls have nothing to do there.
   */
  canApplyFormatting(type: ChatInputFormatting): boolean;
  /** The same for the selection tooltip: a code block carries no marks. */
  canApplyMarkup(type: MarkdownType): boolean;
  canMergeTableCells(): boolean;
  canRedo(): boolean;
  canSplitTableCell(): boolean;
  canUndo(): boolean;
  canGroupSelectedRichMedia(): boolean;
  canUseSeparateLineMath(): boolean;
  captureSelection(): ChatInputEditorSelection;
  captureSelectionAtPoint(clientX: number, clientY: number): ChatInputEditorSelection;
  deleteTable(): boolean;
  deleteTableColumn(): boolean;
  deleteTableRow(): boolean;
  deleteBackward(): boolean;
  destroy(): void;
  focus(): void;
  focusAtEnd(focus?: boolean): void;
  getDocument(): JSONContent;
  getMode(): ChatInputEditorMode;
  supportsMarkup(type: MarkdownType): boolean;
  getLegacyValueIfLossless(): {
    value: string,
    entities: MessageEntity[]
  } | undefined;
  getCodeBlockLanguage(element?: HTMLElement): string | undefined;
  getMarkupState(type: MarkdownType): ChatInputMarkupState;
  getOrderedListState(): ChatInputOrderedListState | undefined;
  getBlockquoteCaption(): string | undefined;
  /** A pullquote, or a quote with an author, around or in the selection. */
  isRichQuoteSelected(): boolean;
  getPendingRichMediaUploadIds(): string[];
  getReferencedRichMediaUploadIds(): string[] | undefined;
  getRichMessage(options?: {draft?: boolean}): ChatInputRichMessage;
  /**
   * The content as a plain message (`richMessageToPlainMessage`), where it holds what only a rich
   * message carries; undefined where it is a plain message already.
   */
  getPlainMessage(): {text: string, entities: MessageEntity[]} | undefined;
  /** Leaves only what a plain message carries, as one step undo takes back: Android's Remove Formatting. */
  convertToPlainMessage(): boolean;
  getSelectedRichMessage(): ChatInputRichMessage | undefined;
  getSelectedLink(): ChatInputSelectedLink | undefined;
  getSelectedMap(): ChatInputMapOptions | undefined;
  getSelectedMath(): ChatInputSelectedMath | undefined;
  getSelectedText(): string;
  /** The selection as `getRichValue` gives the whole field: its text, with the entities cut to it */
  getSelectedRichValue(): {value: string, entities: MessageEntity[]};
  getTableTitle(): string | undefined;
  hasPendingRichMediaUploads(): boolean;
  getRichValue(withEntities?: boolean, withCaret?: boolean): {
    value: string,
    entities: MessageEntity[],
    caretPos: number
  };
  groupSelectedRichMedia(layout: ChatInputRichMediaLayout): boolean;
  isEmpty(): boolean;
  isPlaceholderEmpty(): boolean;
  insertBlockMath(source: string): boolean;
  insertCodeBlock(): boolean;
  insertDetails(options?: ChatInputDetailsOptions): boolean;
  insertDivider(): boolean;
  insertRichButton(options: ChatInputRichButtonOptions): boolean;
  insertFooter(options?: ChatInputFooterOptions): boolean;
  insertInlineMath(source: string): boolean;
  insertMap(options: ChatInputMapOptions): boolean;
  insertOpaqueRichBlock(block: ChatInputOpaqueRichBlock): boolean;
  insertPullquote(options?: ChatInputPullquoteOptions): boolean;
  insertRichMedia(media: ChatInputRichMedia[], options?: ChatInputRichMediaOptions): boolean;
  insertTable(options?: ChatInputTableOptions): boolean;
  mergeTableCells(): boolean;
  moveBlockDown(): boolean;
  moveBlockUp(): boolean;
  redo(): boolean;
  replaceDocumentRange(
    from: number,
    to: number,
    text: string,
    entities?: MessageEntity[]
  ): boolean;
  replaceDocumentRangeWithRichMessage(from: number, to: number, message: RichMessage): boolean;
  replaceAllText(text: string, entities?: MessageEntity[]): boolean;
  replaceAllRichMessage(message: RichMessage): boolean;
  completeRichMediaUpload(uploadId: string, media: ChatInputRichMedia[]): boolean;
  removeRichMediaUpload(uploadId: string): boolean;
  /** The user's cancel: removes the pending media as an edit Undo can revert. */
  cancelRichMediaUpload(uploadId: string): boolean;
  replaceRichMediaItem(position: number, activeIndex: number, media: ChatInputRichMedia): boolean;
  replaceSelection(text: string, entities?: MessageEntity[]): boolean;
  replaceTextRange(from: number, to: number, text: string, entities?: MessageEntity[]): boolean;
  requestLinkEditor(): boolean;
  resolveAutoCodeLanguages(): Promise<void>;
  restoreSelection(selection: ChatInputEditorSelection, focus?: boolean): void;
  separateHistory(): void;
  setBodyText(): boolean;
  setContent(content: string | Node): void;
  setCodeBlockLanguage(language: string, element?: HTMLElement): boolean;
  setOrderedListItemType(type?: string): boolean;
  setOrderedListItemValue(value?: number): boolean;
  setOrderedListStart(start: number): boolean;
  setOrderedListType(type?: string): boolean;
  setBlockquoteCaption(caption: string): boolean;
  setDocument(document: JSONContent): boolean;
  setEditable(editable: boolean): void;
  isExpanded(): boolean;
  setExpanded(expanded: boolean): void;
  setNoAutolink(noAutolink: boolean): void;
  setRichMessage(message: RichMessage): boolean;
  setTableTitle(title: string): boolean;
  splitTableCell(): boolean;
  toggleBulletList(): boolean;
  toggleCodeBlock(): boolean;
  toggleDetailsOpen(element?: HTMLElement): boolean;
  toggleHeading(level: InstantViewHeadingLevel): boolean;
  toggleOrderedList(): boolean;
  toggleOrderedListReversed(): boolean;
  toggleRichMediaLayout(): boolean;
  toggleTableBordered(): boolean;
  toggleTableHeaderRow(): boolean;
  toggleTableStriped(): boolean;
  toggleTaskList(): boolean;
  ungroupSelectedRichMedia(): boolean;
  updateRichMediaUpload(
    uploadId: string,
    items: ChatInputRichMediaUploadItem[]
  ): boolean;
  updateLinkRange(from: number, to: number, url: string): boolean;
  updateSelectedMap(options: Partial<ChatInputMapOptions>): boolean;
  setTextWithEntities(text: string, entities?: MessageEntity[]): void;
  snapshot(): ChatInputEditorSnapshot;
  toggleBlockquoteCollapsed(element: HTMLElement): boolean;
  undo(): boolean;
}

export type CreateChatInputEditor = (
  input: HTMLElement,
  options?: ChatInputEditorOptions,
  snapshot?: ChatInputEditorSnapshot
) => ChatInputEditor;
