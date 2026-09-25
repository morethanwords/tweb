import type {
  ChatInputEditorSelection,
  ChatInputRichMessage
} from '@components/chat/inputEditor/types';
import type {Document, PageBlock, Photo} from '@layer';

type RichMediaItemActionBase = {
  activeIndex: number,
  from: number,
  to: number
};

export type RichMediaItemInsertAction = RichMediaItemActionBase & {
  action: 'add' | 'replace'
};

export type RichMediaItemEditAction = RichMediaItemActionBase & {
  action: 'edit',
  grouped: boolean,
  media: Document.document | Photo.photo,
  previewUrl?: string,
  sourceElement?: HTMLImageElement | HTMLVideoElement
};

export type RichMediaItemAction =
  RichMediaItemEditAction |
  RichMediaItemInsertAction;

export function getAttachRichMediaTarget(
  expanded: boolean,
  target: ChatInputEditorSelection | undefined
) {
  return expanded ? target : undefined;
}

export function canStartRichMediaUpload(
  expanded: boolean,
  itemAction?: RichMediaItemAction
) {
  return expanded || !!itemAction;
}

export function isRichMediaInsertSelectionCurrent(
  selection: ChatInputEditorSelection,
  currentRevision?: number
) {
  return selection.revision === undefined ||
    selection.revision === currentRevision;
}

export function clipboardHasMatchingFile(
  event: ClipboardEvent,
  matches: (file: File | null, mimeType: string) => boolean
) {
  const items = event.clipboardData?.items;
  if(!items) return false;

  for(let index = 0; index < items.length; ++index) {
    const item = items[index];
    if(item.kind !== 'file') continue;
    if(matches(item.getAsFile(), item.type)) return true;
  }

  return false;
}

export function clipboardHasFile(event: ClipboardEvent) {
  return clipboardHasMatchingFile(event, () => true);
}

export function shouldPreventDefaultFilePaste(
  event: ClipboardEvent,
  hasFilePasteHandler: boolean
) {
  return hasFilePasteHandler && clipboardHasFile(event);
}

export function dragEventHasFiles(event: DragEvent) {
  const types = event.dataTransfer?.types;
  if(!types) return false;
  // DOMStringList is still exposed by a few older/WebKit implementations.
  // @ts-ignore
  return types.contains ? types.contains('Files') : types.indexOf('Files') >= 0;
}

export function shouldInsertRichMediaFiles<T>(
  files: T[],
  target: ChatInputEditorSelection | undefined,
  attachType: 'media' | 'document' | undefined,
  isRichMedia: (file: T) => boolean
) {
  return !!(
    target &&
    attachType !== 'document' &&
    files.length &&
    files.every(isRichMedia)
  );
}

const EMBEDDED_RICH_MEDIA_BLOCKS = new Set([
  'inputPageBlockMap',
  'pageBlockAudio',
  'pageBlockCollage',
  'pageBlockMap',
  'pageBlockPhoto',
  'pageBlockSlideshow',
  'pageBlockVideo'
]);

export function canFallbackRichMessageToPlain(
  richMessage: ChatInputRichMessage
) {
  const hasMedia = (block: PageBlock): boolean => {
    if(EMBEDDED_RICH_MEDIA_BLOCKS.has(block._)) return true;
    if(block._ === 'pageBlockDetails' || block._ === 'pageBlockBlockquoteBlocks') {
      return block.blocks.some(hasMedia);
    }
    if(block._ === 'pageBlockList' || block._ === 'pageBlockOrderedList') {
      return block.items.some(item => 'blocks' in item && item.blocks.some(hasMedia));
    }
    return false;
  };
  return !richMessage.input.blocks.some(hasMedia);
}
