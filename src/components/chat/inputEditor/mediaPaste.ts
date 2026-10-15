import type {ChatInputEditorSelection} from '@components/chat/inputEditor/types';
import type {Document, Photo} from '@layer';

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

// Any file goes into the expanded editor: a photo or a video as media, music as an audio, the rest —
// and whatever is attached as a file — as a file block.
export function shouldInsertRichMediaFiles<T>(
  files: T[],
  target: ChatInputEditorSelection | undefined
) {
  return !!(target && files.length);
}
