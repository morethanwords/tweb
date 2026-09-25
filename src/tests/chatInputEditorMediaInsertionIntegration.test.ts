import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import {AllSelection, NodeSelection} from '@tiptap/pm/state';
import {getIconContent} from '@components/icon';
import {instantViewStyles} from '@components/instantViewFormatting';
import type {Document, PageBlock, Photo} from '@layer';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

describe('Tiptap chat input editor: MediaInsertion', () => {
  const {mountEditor, expectSingleTerminalParagraph} = useChatInputEditorHarness();

  test('inserts uploaded rich media with spoiler, formatted caption, and a trailing paragraph', () => {
    const {editor, input} = mountEditor();
    const photo = {
      _: 'photo',
      id: '101',
      access_hash: '201',
      file_reference: new Uint8Array([1])
    } as Photo.photo;

    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl: 'blob:rich-photo',
      spoiler: true
    }], {
      caption: 'Caption',
      captionEntities: [{_: 'messageEntityBold', offset: 0, length: 7}]
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media');
    expect(media?.hasAttribute('data-spoiler')).toBe(true);
    expect(media?.querySelector('img')?.getAttribute('src')).toBe('blob:rich-photo');
    const caption = media?.querySelector<HTMLElement>('.chat-input-rich-media-caption');
    const captionText = caption?.querySelector<HTMLElement>('.chat-input-context-placeholder');
    expect(caption?.classList.contains(instantViewStyles.Padding)).toBe(true);
    expect(caption?.classList.contains('secondary')).toBe(false);
    expect(captionText?.classList.contains(instantViewStyles.CaptionText)).toBe(true);
    expect(captionText?.querySelector('strong')).not.toBeNull();
    expect(captionText?.textContent).toBe('Caption');
    const moreButton = media?.querySelector<HTMLElement>(
      '.chat-input-rich-media-more.btn-icon'
    );
    expect(moreButton).not.toBeNull();
    expect(moreButton?.dataset.floatingDirection).toBe('bottom-end');
    expect(Array.from(
      media?.querySelectorAll<HTMLElement>(
        '.chat-input-rich-media-tooltip .btn-icon .tgico'
      ) || []
    ).map((icon) => icon.textContent)).toEqual(([
      'replace_circles',
      'image_add'
    ] as const).map(getIconContent));
    expect(media?.querySelectorAll('.chat-input-rich-media-control')).toHaveLength(0);
    const documentContent = editor.getDocument().content;
    expect(documentContent?.[documentContent.length - 1]?.type).toBe('richMedia');
    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.state.doc.lastChild?.type.name).toBe('paragraph');
    expectSingleTerminalParagraph(input, tiptap);

    const rich = editor.getRichMessage();
    expect(rich.input.blocks).toMatchObject([{
      _: 'pageBlockPhoto',
      pFlags: {spoiler: true},
      photo_id: photo.id,
      caption: {
        text: {
          _: 'textBold',
          text: {_: 'textPlain', text: 'Caption'}
        }
      }
    }]);
    expect(rich.input.photos?.[0]).toMatchObject({
      _: 'inputPhoto',
      id: photo.id
    });
    expect(rich.output.photos).toEqual([photo]);
  });

  test('inserts audio as a standalone rich-media block and keeps its document resource', () => {
    const {editor, input} = mountEditor();
    const audio = {
      _: 'document',
      id: '151',
      access_hash: '251',
      file_reference: new Uint8Array([1]),
      mime_type: 'audio/mpeg',
      attributes: [{
        _: 'documentAttributeAudio',
        pFlags: {},
        duration: 42,
        title: 'Track',
        performer: 'Artist'
      }]
    } as Document.document;

    expect(editor.insertRichMedia([{
      type: 'audio',
      document: audio,
      spoiler: true
    }], {
      caption: 'Listen',
      captionEntities: [{_: 'messageEntityItalic', offset: 0, length: 6}]
    })).toBe(true);

    const rich = editor.getRichMessage();
    expect(rich.input.blocks).toMatchObject([{
      _: 'pageBlockAudio',
      audio_id: audio.id,
      caption: {
        text: {
          _: 'textItalic',
          text: {_: 'textPlain', text: 'Listen'}
        }
      }
    }]);
    expect(rich.input.documents?.[0]).toMatchObject({
      _: 'inputDocument',
      id: audio.id
    });
    expect(rich.output.documents).toEqual([audio]);
    const tooltip = input.querySelector<HTMLElement>('.chat-input-rich-media-tooltip');
    expect(tooltip?.hidden).toBe(true);
    expect(Array.from(
      tooltip?.querySelectorAll<HTMLButtonElement>('.btn-icon') || []
    ).every((button) => button.disabled)).toBe(true);
  });

  test('shows the uploaded video duration without waiting for media playback metadata', () => {
    const {editor, input} = mountEditor();
    const video = {
      _: 'document',
      id: '152',
      access_hash: '252',
      file_reference: new Uint8Array([1]),
      mime_type: 'video/mp4',
      size: 1024,
      type: 'video',
      attributes: [{
        _: 'documentAttributeVideo',
        pFlags: {},
        duration: 65,
        w: 640,
        h: 360
      }]
    } as Document.document;

    expect(editor.insertRichMedia([{
      type: 'video',
      document: video,
      previewUrl: 'blob:rich-video'
    }])).toBe(true);

    expect(input.querySelector('.chat-input-rich-media-item .video-time')?.textContent)
    .toBe('1:05');
  });

  test('keeps audio separate from a grouped visual set and captions the first output block', () => {
    const {editor} = mountEditor();
    const audio = {
      _: 'document',
      id: '161',
      access_hash: '261',
      file_reference: new Uint8Array([1]),
      mime_type: 'audio/mpeg',
      attributes: []
    } as Document.document;
    const firstPhoto = {
      _: 'photo',
      id: '162',
      access_hash: '262',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
    const secondPhoto = {
      _: 'photo',
      id: '163',
      access_hash: '263',
      file_reference: new Uint8Array([3])
    } as Photo.photo;

    expect(editor.insertRichMedia([
      {type: 'audio', document: audio},
      {type: 'photo', photo: firstPhoto},
      {type: 'photo', photo: secondPhoto}
    ], {
      caption: 'Album caption',
      grouped: true
    })).toBe(true);

    const rich = editor.getRichMessage();
    expect(rich.input.blocks.map((block) => block._)).toEqual([
      'pageBlockAudio',
      'pageBlockCollage'
    ]);
    expect((rich.input.blocks[0] as PageBlock.pageBlockAudio).caption.text).toEqual({
      _: 'textPlain',
      text: 'Album caption'
    });
    expect((rich.input.blocks[1] as PageBlock.pageBlockCollage).caption.text).toEqual({
      _: 'textEmpty'
    });
    expect((rich.input.blocks[1] as PageBlock.pageBlockCollage).items.map((block) => block._))
    .toEqual(['pageBlockPhoto', 'pageBlockPhoto']);
    expect(rich.output.documents).toEqual([audio]);
    expect(rich.output.photos).toEqual([firstPhoto, secondPhoto]);
  });

  test('uses audio as a boundary between visual collage runs', () => {
    const {editor} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    const audio = {
      _: 'document',
      id: '303',
      access_hash: '403',
      file_reference: new Uint8Array([3]),
      mime_type: 'audio/mpeg',
      attributes: []
    } as Document.document;

    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(301)},
      {type: 'audio', document: audio},
      {type: 'photo', photo: photo(302)}
    ], {grouped: true})).toBe(true);

    expect(editor.getRichMessage().input.blocks.map((block) => block._)).toEqual([
      'pageBlockPhoto',
      'pageBlockAudio',
      'pageBlockPhoto'
    ]);
  });

  test('splits an oversized visual collage and keeps its caption on the last fragment', () => {
    const {editor} = mountEditor();
    const photos = Array.from({length: MESSAGES_ALBUM_MAX_SIZE * 2 + 1}, (_, index) => ({
      _: 'photo',
      id: String(600 + index),
      access_hash: String(700 + index),
      file_reference: new Uint8Array([index + 1])
    }) as Photo.photo);

    expect(editor.insertRichMedia(photos.map((photo) => ({type: 'photo', photo})), {
      caption: 'Last fragment caption',
      grouped: true
    })).toBe(true);

    const rich = editor.getRichMessage();
    expect(rich.input.blocks.map((block) => block._)).toEqual([
      'pageBlockCollage',
      'pageBlockCollage',
      'pageBlockPhoto'
    ]);
    expect((rich.input.blocks[0] as PageBlock.pageBlockCollage).items)
    .toHaveLength(MESSAGES_ALBUM_MAX_SIZE);
    expect((rich.input.blocks[1] as PageBlock.pageBlockCollage).items)
    .toHaveLength(MESSAGES_ALBUM_MAX_SIZE);
    expect((rich.input.blocks[0] as PageBlock.pageBlockCollage).caption.text)
    .toEqual({_: 'textEmpty'});
    expect((rich.input.blocks[1] as PageBlock.pageBlockCollage).caption.text)
    .toEqual({_: 'textEmpty'});
    expect((rich.input.blocks[2] as PageBlock.pageBlockPhoto).caption.text)
    .toEqual({_: 'textPlain', text: 'Last fragment caption'});
    expect(rich.output.photos).toEqual(photos);
  });

  test('enforces the collage limit across pending, Add Media and manual grouping paths', () => {
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    const pending = mountEditor().editor;
    const pendingItems = Array.from({length: MESSAGES_ALBUM_MAX_SIZE + 1}, (_, index) => ({
      id: `pending-${index}`,
      progress: 0,
      state: 'preparing' as const,
      type: 'photo' as const
    }));
    expect(pending.beginRichMediaUpload({
      grouped: true,
      id: 'oversized-pending-collage',
      items: pendingItems,
      previewUrls: pendingItems.map(() => ''),
      selection: pending.captureSelection()
    })).toBe(false);

    const {editor} = mountEditor();
    const photos = Array.from({length: MESSAGES_ALBUM_MAX_SIZE + 1}, (_, index) => (
      photo(800 + index)
    ));
    expect(editor.insertRichMedia(photos.slice(0, MESSAGES_ALBUM_MAX_SIZE).map((item) => ({
      type: 'photo',
      photo: item
    })), {grouped: true})).toBe(true);
    const lastPhoto = photos[photos.length - 1];
    expect(editor.addRichMediaItems(0, 0, [{type: 'photo', photo: lastPhoto}]))
    .toBe(false);
    expect(editor.beginRichMediaUpload({
      action: 'add',
      activeIndex: 0,
      id: 'oversized-add-collage',
      items: [{id: 'oversized-add-item', progress: 0, state: 'preparing', type: 'photo'}],
      previewUrls: [''],
      selection: {from: 0, to: editor.getDocument().content![0].content?.length || 0, type: 'node'}
    })).toBe(false);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(NodeSelection.create(tiptap.state.doc, 0)));
    expect(editor.toggleRichMediaLayout()).toBe(true);
    expect(editor.addRichMediaItems(0, 0, [{type: 'photo', photo: lastPhoto}]))
    .toBe(true);
    expect((editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockSlideshow).items)
    .toHaveLength(MESSAGES_ALBUM_MAX_SIZE + 1);

    const manual = mountEditor().editor;
    expect(manual.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: photos.map((item) => ({
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: item.id,
        caption: {
          _: 'pageCaption',
          text: {_: 'textEmpty'},
          credit: {_: 'textEmpty'}
        }
      })),
      photos,
      documents: []
    })).toBe(true);
    const manualTiptap = (manual as TiptapEditorInternals).editor;
    manualTiptap.view.dispatch(
      manualTiptap.state.tr.setSelection(new AllSelection(manualTiptap.state.doc))
    );
    expect(manual.groupSelectedRichMedia('collage')).toBe(false);
    expect(manual.groupSelectedRichMedia('slideshow')).toBe(true);
  });

  test('renders a local photo preview in an aspect-ratio media viewport', () => {
    const {editor, input} = mountEditor();
    const previewUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const photo = {
      _: 'photo',
      id: '199',
      access_hash: '299',
      file_reference: new Uint8Array([1]),
      sizes: [{
        _: 'photoSize',
        type: 'x',
        w: 600,
        h: 400,
        size: 1
      }]
    } as Photo.photo;

    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl
    }])).toBe(true);

    const item = input.querySelector<HTMLElement>(
      `.chat-input-rich-media-item.${instantViewStyles.Media}`
    );
    const image = item?.querySelector<HTMLImageElement>('img.media-photo');
    expect(item).not.toBeNull();
    expect(item?.style.getPropertyValue('--aspect-ratio')).toBe('1.5');
    expect(image?.getAttribute('src')).toBe(previewUrl);
    expect(item?.classList.contains('media-container-fitted')).toBe(true);
    expect(item?.querySelector('.media-container-aspecter img.media-photo'))
    .not.toBeNull();
    expect(item?.querySelector('.chat-input-rich-media-side-fill')).not.toBeNull();
  });
});
