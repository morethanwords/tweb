vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@environment/videoSupport', () => ({IS_MOV_SUPPORTED: false}));

import {
  canStartRichMediaUpload,
  clipboardHasFile,
  clipboardHasMatchingFile,
  dragEventHasFiles,
  getAttachRichMediaTarget,
  isRichMediaInsertSelectionCurrent,
  shouldPreventDefaultFilePaste,
  shouldInsertRichMediaFiles
} from '@components/chat/inputEditor/mediaPaste';

function clipboardEvent(items: Array<{
  file?: File,
  kind: string,
  type: string
}>) {
  return {
    clipboardData: {
      items: {
        ...items.map(({file, kind, type}) => ({
          getAsFile: (): File | null => file || null,
          kind,
          type
        })),
        length: items.length
      }
    }
  } as unknown as ClipboardEvent;
}

describe('rich-message media paste and drop routing', () => {
  const target = {from: 4, to: 4};

  test('routes Attach photo/video into the expanded rich editor at the saved selection', () => {
    expect(getAttachRichMediaTarget(true, target)).toBe(target);
    expect(getAttachRichMediaTarget(false, target)).toBeUndefined();
    expect(getAttachRichMediaTarget(true, undefined)).toBeUndefined();
  });

  test('keeps an explicit media-item Add or Replace action valid while collapsed', () => {
    const itemAction = {
      action: 'add' as const,
      activeIndex: 0,
      from: 0,
      to: 2
    };

    expect(canStartRichMediaUpload(false)).toBe(false);
    expect(canStartRichMediaUpload(true)).toBe(true);
    expect(canStartRichMediaUpload(false, itemAction)).toBe(true);
  });

  test('invalidates a saved media target only when the document revision changes', () => {
    expect(isRichMediaInsertSelectionCurrent({
      from: 4,
      revision: 7,
      to: 4
    }, 7)).toBe(true);
    expect(isRichMediaInsertSelectionCurrent({
      from: 4,
      revision: 7,
      to: 4
    }, 8)).toBe(false);
    expect(isRichMediaInsertSelectionCurrent({from: 4, to: 4}, 8)).toBe(true);
  });

  // what is no photo, video or music goes in as a file block (the other clients do the same)
  test('takes any file into the editor at the captured target', () => {
    const image = new File(['image'], 'image.png', {type: 'image/png'});
    const audio = new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'});
    const document = new File(['document'], 'notes.txt', {type: 'text/plain'});

    expect(shouldInsertRichMediaFiles([image, audio], target)).toBe(true);
    expect(shouldInsertRichMediaFiles([image, document], target)).toBe(true);
    expect(shouldInsertRichMediaFiles([document], target)).toBe(true);
    expect(shouldInsertRichMediaFiles([image], undefined)).toBe(false);
    expect(shouldInsertRichMediaFiles([], target)).toBe(false);
  });

  test('distinguishes a media clipboard item from a text-only ProseMirror paste', () => {
    const image = new File(['image'], 'image.png', {type: 'image/png'});
    const matchesMedia = (file: File | null, mimeType: string) => (
      file?.type.startsWith('image/') || mimeType.startsWith('image/')
    );

    expect(clipboardHasMatchingFile(clipboardEvent([
      {file: image, kind: 'file', type: image.type}
    ]), matchesMedia)).toBe(true);
    expect(clipboardHasMatchingFile(clipboardEvent([
      {kind: 'string', type: 'text/plain'}
    ]), matchesMedia)).toBe(false);
    expect(clipboardHasFile(clipboardEvent([
      {
        file: new File(['pdf'], 'notes.pdf', {type: 'application/pdf'}),
        kind: 'file',
        type: 'application/pdf'
      }
    ]))).toBe(true);
    expect(clipboardHasFile(clipboardEvent([
      {kind: 'string', type: 'text/plain'}
    ]))).toBe(false);
  });

  test('prevents the browser from also inserting a handled clipboard file into contenteditable', () => {
    const image = new File(['image'], 'image.png', {type: 'image/png'});
    const imagePaste = clipboardEvent([
      {file: image, kind: 'file', type: image.type}
    ]);
    const textPaste = clipboardEvent([
      {kind: 'string', type: 'text/plain'}
    ]);

    expect(shouldPreventDefaultFilePaste(imagePaste, true)).toBe(true);
    expect(shouldPreventDefaultFilePaste(textPaste, true)).toBe(false);
    expect(shouldPreventDefaultFilePaste(imagePaste, false)).toBe(false);
  });

  test('recognizes a Files drag even when its MIME list is unavailable', () => {
    const event = {
      dataTransfer: {types: ['Files']}
    } as unknown as DragEvent;
    const textEvent = {
      dataTransfer: {types: ['text/plain']}
    } as unknown as DragEvent;

    expect(dragEventHasFiles(event)).toBe(true);
    expect(dragEventHasFiles(textEvent)).toBe(false);
  });
});
