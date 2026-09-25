vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@environment/videoSupport', () => ({IS_MOV_SUPPORTED: false}));

import {
  canFallbackRichMessageToPlain,
  canStartRichMediaUpload,
  clipboardHasFile,
  clipboardHasMatchingFile,
  dragEventHasFiles,
  getAttachRichMediaTarget,
  isRichMediaInsertSelectionCurrent,
  shouldPreventDefaultFilePaste,
  shouldInsertRichMediaFiles
} from '@components/chat/inputEditor/mediaPaste';
import {isRichMessageMediaMimeType} from '@helpers/files/richMessageMediaInsertPolicy';
import type {Document, PageBlock, Photo} from '@layer';

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
  const supported = (file: File) => isRichMessageMediaMimeType(file.type);

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

  test('uses the captured target only for an all-media paste or drop', () => {
    const image = new File(['image'], 'image.png', {type: 'image/png'});
    const video = new File(['video'], 'video.mp4', {type: 'video/mp4'});
    const audio = new File(['audio'], 'audio.mp3', {type: 'audio/mpeg'});
    const document = new File(['document'], 'notes.txt', {type: 'text/plain'});

    expect(shouldInsertRichMediaFiles([image, video], target, undefined, supported)).toBe(true);
    expect(shouldInsertRichMediaFiles([audio], target, undefined, supported)).toBe(true);
    expect(shouldInsertRichMediaFiles([image, audio], target, 'media', supported)).toBe(true);
    expect(shouldInsertRichMediaFiles([image], target, 'media', supported)).toBe(true);
    expect(shouldInsertRichMediaFiles([image], target, 'document', supported)).toBe(false);
    expect(shouldInsertRichMediaFiles([image], undefined, 'media', supported)).toBe(false);
    expect(shouldInsertRichMediaFiles([image, document], target, 'media', supported)).toBe(false);
  });

  test('does not offer a lossy plain fallback for embedded rich media', () => {
    const richMessage = (block: PageBlock) => ({
      input: {
        _: 'inputRichMessage' as const,
        pFlags: {},
        blocks: [block]
      },
      output: {
        _: 'richMessage' as const,
        pFlags: {},
        blocks: [block],
        documents: [] as Document.document[],
        photos: [] as Photo.photo[]
      }
    });

    expect(canFallbackRichMessageToPlain(richMessage({
      _: 'pageBlockParagraph',
      text: {_: 'textPlain', text: 'Text'}
    }))).toBe(true);
    expect(canFallbackRichMessageToPlain(richMessage({
      _: 'pageBlockAudio',
      audio_id: '10',
      caption: {
        _: 'pageCaption',
        credit: {_: 'textEmpty'},
        text: {_: 'textEmpty'}
      }
    }))).toBe(false);
    expect(canFallbackRichMessageToPlain(richMessage({
      _: 'inputPageBlockMap',
      geo: {_: 'inputGeoPoint', lat: 1, long: 2},
      zoom: 10,
      w: 400,
      h: 200,
      caption: {
        _: 'pageCaption',
        credit: {_: 'textEmpty'},
        text: {_: 'textEmpty'}
      }
    }))).toBe(false);
    const media: PageBlock = {
      _: 'pageBlockPhoto', pFlags: {}, photo_id: '10',
      caption: {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}}
    };
    const wrappers: Array<(block: PageBlock) => PageBlock> = [
      block => ({_: 'pageBlockDetails', pFlags: {}, title: {_: 'textEmpty'}, blocks: [block]}),
      block => ({_: 'pageBlockBlockquoteBlocks', caption: {_: 'textEmpty'}, blocks: [block]}),
      block => ({_: 'pageBlockList', items: [{_: 'pageListItemBlocks', pFlags: {}, blocks: [block]}]}),
      block => ({_: 'pageBlockOrderedList', pFlags: {}, items: [{_: 'pageListOrderedItemBlocks', pFlags: {}, blocks: [block]}]})
    ];
    for(const wrap of wrappers) {
      expect(canFallbackRichMessageToPlain(richMessage(wrap(media)))).toBe(false);
      expect(canFallbackRichMessageToPlain(richMessage(wrap(wrappers[0](media))))).toBe(false);
      expect(canFallbackRichMessageToPlain(richMessage(wrap({_: 'pageBlockParagraph', text: {_: 'textPlain', text: 'Text'}})))).toBe(true);
    }
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
