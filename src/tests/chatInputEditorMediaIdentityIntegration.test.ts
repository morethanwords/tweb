import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  typeTextThroughEditorView
} from '@/tests/helpers/chatInputEditorHarness';
import {closeHistory} from '@tiptap/pm/history';
import {NodeSelection, TextSelection} from '@tiptap/pm/state';
import {createRichMediaPreviewUrl} from '@components/chat/inputEditor/mediaPreviewUrl';
import slideshowStyles from '@components/slideshow.module.scss';
import type {PageBlock, Photo} from '@layer';
import I18n from '@lib/langPack';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';

describe('Tiptap chat input editor: MediaIdentity', () => {
  const {mountEditor, insertPhotoSlideshow, openRichMediaMenu, richMediaMenuItem} = useChatInputEditorHarness();

  test('ignores a detached blob preview load after rebuilding a collage', () => {
    const {editor, input} = mountEditor();
    const seedUploadId = 'upload-stale-load-seed';
    expect(editor.beginRichMediaUpload({
      grouped: true,
      id: seedUploadId,
      items: [0, 1].map((index) => ({
        id: `${seedUploadId}-${index}`,
        progress: 1,
        state: 'ready' as const,
        type: 'photo' as const
      })),
      previewUrls: ['blob:stale-first', 'blob:stale-second'],
      selection: editor.captureSelection()
    })).toBe(true);
    const photos = [171, 172].map((id) => ({
      _: 'photo',
      id: `${id}`,
      access_hash: `${id + 100}`,
      file_reference: new Uint8Array([id - 170])
    })) as Photo.photo[];
    expect(editor.completeRichMediaUpload(seedUploadId, photos.map((photo) => ({
      type: 'photo' as const,
      photo
    })))).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const canvas = media.querySelector<HTMLElement>('.chat-input-rich-media-canvas')!;
    const detachedImage = canvas.querySelector<HTMLImageElement>('img.media-photo')!;
    const tiptap = (editor as TiptapEditorInternals).editor;
    const collageNode = tiptap.state.doc.firstChild!;
    const replaceUploadId = 'upload-stale-load-replace';
    expect(editor.beginRichMediaUpload({
      action: 'replace',
      activeIndex: 0,
      grouped: false,
      id: replaceUploadId,
      items: [{
        id: `${replaceUploadId}-0`,
        progress: .2,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:stale-replacement'],
      selection: {from: 0, to: collageNode.nodeSize, type: 'node'}
    })).toBe(true);
    expect(detachedImage.isConnected).toBe(false);

    canvas.style.setProperty('--aspect-ratio', '9');
    detachedImage.dispatchEvent(new Event('load'));
    expect(canvas.style.getPropertyValue('--aspect-ratio')).toBe('9');
  });

  test('media upload identity: Add preserves a slideshow and all of its media DOM', () => {
    const {editor, input} = mountEditor();
    const seedUploadId = 'upload-slideshow-seed';
    expect(editor.beginRichMediaUpload({
      grouped: true,
      id: seedUploadId,
      items: [{
        id: `${seedUploadId}-0`,
        progress: 1,
        state: 'ready',
        type: 'photo'
      }, {
        id: `${seedUploadId}-1`,
        progress: 1,
        state: 'ready',
        type: 'photo'
      }],
      previewUrls: ['blob:slideshow-seed-first', 'blob:slideshow-seed-second'],
      selection: editor.captureSelection()
    })).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);
    const first = {
      _: 'photo',
      id: '141',
      access_hash: '241',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const second = {
      _: 'photo',
      id: '142',
      access_hash: '242',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
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
        items: [{
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: first.id,
          caption: emptyCaption
        }, {
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: second.id,
          caption: emptyCaption
        }],
        caption: emptyCaption
      } satisfies PageBlock.pageBlockSlideshow,
      photos: [first, second],
      uploadGrouped: false,
      uploadId: '',
      uploadItems: [],
      uploadPreviewUrls: []
    }));

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const slideshow = media.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    const itemsContainer = slideshow.querySelector<HTMLElement>(`.${slideshowStyles.Items}`)!;
    const existingItems = [...media.querySelectorAll<HTMLElement>(
      '.chat-input-rich-media-item'
    )];
    const existingImages = existingItems.map((item) => (
      item.querySelector<HTMLImageElement>('img.media-photo')!
    ));
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(existingItems).toHaveLength(2);
    expect(existingImages.map((image) => image.getAttribute('src'))).toEqual([
      'blob:slideshow-seed-first',
      'blob:slideshow-seed-second'
    ]);
    expect(itemsContainer.children).toHaveLength(2);
    expect(itemsContainer.style.transform).toBe('translate(0%, 0)');

    const addUploadId = 'upload-slideshow-add';
    const slideshowNode = tiptap.state.doc.firstChild!;
    expect(editor.beginRichMediaUpload({
      action: 'add',
      activeIndex: 0,
      grouped: false,
      id: addUploadId,
      items: [{
        id: `${addUploadId}-0`,
        progress: .24,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:slideshow-added'],
      selection: {from: 0, to: slideshowNode.nodeSize, type: 'node'}
    })).toBe(true);

    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(existingItems.map((item) => media.contains(item))).toEqual([true, true]);
    expect(existingImages.map((image) => media.contains(image))).toEqual([true, true]);
    const pendingItem = media.querySelector<HTMLElement>('[data-upload-index="0"]')!;
    const pendingImage = pendingItem.querySelector<HTMLImageElement>('img.media-photo')!;
    const pendingOverlay = pendingItem.querySelector<HTMLElement>(
      '.chat-input-rich-media-upload'
    )!;
    expect(pendingImage.getAttribute('src')).toBe('blob:slideshow-added');
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(0%, 0)');

    expect(editor.updateRichMediaUpload(addUploadId, [{
      id: `${addUploadId}-0`,
      progress: .72,
      state: 'uploading',
      type: 'photo'
    }])).toBe(true);
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(media.querySelector('[data-upload-index="0"]')).toBe(pendingItem);
    expect(pendingItem.querySelector('img.media-photo')).toBe(pendingImage);
    expect(pendingItem.querySelector('.chat-input-rich-media-upload')).toBe(pendingOverlay);
    expect(pendingOverlay.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'))
    .toBe('72');

    const added = {
      _: 'photo',
      id: '143',
      access_hash: '243',
      file_reference: new Uint8Array([3])
    } as Photo.photo;
    expect(editor.completeRichMediaUpload(addUploadId, [{
      type: 'photo',
      photo: added
    }])).toBe(true);
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(existingItems.map((item) => media.contains(item))).toEqual([true, true]);
    expect(existingImages.map((image) => media.contains(image))).toEqual([true, true]);
    expect(media.contains(pendingItem)).toBe(true);
    expect(media.contains(pendingImage)).toBe(true);
    expect(pendingItem.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(pendingOverlay.isConnected).toBe(false);
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(0%, 0)');
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockSlideshow',
      items: [
        {_: 'pageBlockPhoto', photo_id: first.id},
        {_: 'pageBlockPhoto', photo_id: added.id},
        {_: 'pageBlockPhoto', photo_id: second.id}
      ]
    });
  });

  test('media upload identity: Replace preserves a slideshow and non-target media DOM', () => {
    const {editor, input} = mountEditor();
    const {
      images,
      items,
      itemsContainer,
      media,
      photos,
      slideshow,
      tiptap
    } = insertPhotoSlideshow(editor, input, {
      count: 3,
      idOffset: 151,
      previewPrefix: 'slideshow-replace'
    });
    const targetIndex = 1;
    const preservedItems = items.filter((_item, index) => index !== targetIndex);
    const preservedImages = images.filter((_image, index) => index !== targetIndex);
    const uploadId = 'upload-slideshow-replace';
    const slideshowNode = tiptap.state.doc.firstChild!;

    expect(editor.beginRichMediaUpload({
      action: 'replace',
      activeIndex: targetIndex,
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .27,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:slideshow-replacement'],
      selection: {from: 0, to: slideshowNode.nodeSize, type: 'node'}
    })).toBe(true);

    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(preservedItems.map((item) => media.contains(item))).toEqual([true, true]);
    expect(preservedImages.map((image) => media.contains(image))).toEqual([true, true]);
    const pendingOverlay = media.querySelector<HTMLElement>(
      '.chat-input-rich-media-upload'
    )!;
    const pendingItem = pendingOverlay.closest<HTMLElement>(
      '.chat-input-rich-media-item'
    )!;
    const pendingImage = pendingItem.querySelector<HTMLImageElement>('img.media-photo')!;
    const pendingProgress = pendingOverlay.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(pendingImage.getAttribute('src')).toBe('blob:slideshow-replacement');
    expect(pendingProgress.getAttribute('aria-valuenow')).toBe('27');
    expect(pendingProgress.classList.contains('is-visible')).toBe(true);
    expect(pendingProgress.classList.contains('animating')).toBe(false);
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(-100%, 0)');

    expect(editor.updateRichMediaUpload(uploadId, [{
      id: `${uploadId}-0`,
      progress: .74,
      state: 'uploading',
      type: 'photo'
    }])).toBe(true);
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(preservedItems.map((item) => media.contains(item))).toEqual([true, true]);
    expect(preservedImages.map((image) => media.contains(image))).toEqual([true, true]);
    expect(media.querySelector('.chat-input-rich-media-upload')).toBe(pendingOverlay);
    expect(pendingOverlay.closest('.chat-input-rich-media-item')).toBe(pendingItem);
    expect(pendingItem.querySelector('img.media-photo')).toBe(pendingImage);
    expect(pendingItem.querySelector('.chat-input-rich-media-upload')).toBe(pendingOverlay);
    expect(pendingOverlay.querySelector('[role="progressbar"]')).toBe(pendingProgress);
    expect(pendingProgress.getAttribute('aria-valuenow')).toBe('74');
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(-100%, 0)');

    const replacement = {
      _: 'photo',
      id: '154',
      access_hash: '254',
      file_reference: new Uint8Array([4])
    } as Photo.photo;
    expect(editor.completeRichMediaUpload(uploadId, [{
      type: 'photo',
      photo: replacement
    }])).toBe(true);
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(preservedItems.map((item) => media.contains(item))).toEqual([true, true]);
    expect(preservedImages.map((image) => media.contains(image))).toEqual([true, true]);
    expect(media.contains(pendingItem)).toBe(true);
    expect(media.contains(pendingImage)).toBe(true);
    expect(pendingItem.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(pendingOverlay.isConnected).toBe(false);
    expect(pendingProgress.isConnected).toBe(false);
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(-100%, 0)');
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockSlideshow',
      items: [
        {_: 'pageBlockPhoto', photo_id: photos[0].id},
        {_: 'pageBlockPhoto', photo_id: replacement.id},
        {_: 'pageBlockPhoto', photo_id: photos[2].id}
      ]
    });
  });

  test('media upload identity: cancelling Add removes only the pending slideshow item', () => {
    const {editor, input} = mountEditor();
    const {
      images,
      items,
      itemsContainer,
      media,
      photos,
      slideshow,
      tiptap
    } = insertPhotoSlideshow(editor, input, {
      count: 2,
      idOffset: 161,
      previewPrefix: 'slideshow-add-cancel'
    });
    const uploadId = 'upload-slideshow-add-cancel';
    const slideshowNode = tiptap.state.doc.firstChild!;

    expect(editor.beginRichMediaUpload({
      action: 'add',
      activeIndex: 0,
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .36,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:slideshow-cancelled-add'],
      selection: {from: 0, to: slideshowNode.nodeSize, type: 'node'}
    })).toBe(true);

    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(items.map((item) => media.contains(item))).toEqual([true, true]);
    expect(images.map((image) => media.contains(image))).toEqual([true, true]);
    const pendingItem = media.querySelector<HTMLElement>('[data-upload-index="0"]')!;
    const pendingImage = pendingItem.querySelector<HTMLImageElement>('img.media-photo')!;
    const pendingOverlay = pendingItem.querySelector<HTMLElement>(
      '.chat-input-rich-media-upload'
    )!;
    const pendingProgress = pendingOverlay.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(pendingImage.getAttribute('src')).toBe('blob:slideshow-cancelled-add');
    expect(itemsContainer.children).toHaveLength(3);
    expect(itemsContainer.style.transform).toBe('translate(0%, 0)');

    expect(editor.removeRichMediaUpload(uploadId)).toBe(true);
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(items.map((item) => media.contains(item))).toEqual([true, true]);
    expect(images.map((image) => media.contains(image))).toEqual([true, true]);
    expect(pendingItem.isConnected).toBe(false);
    expect(pendingImage.isConnected).toBe(false);
    expect(pendingOverlay.isConnected).toBe(false);
    expect(pendingProgress.isConnected).toBe(false);
    expect(media.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(itemsContainer.children).toHaveLength(2);
    expect(itemsContainer.style.transform).toBe('translate(0%, 0)');
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockSlideshow',
      items: [
        {_: 'pageBlockPhoto', photo_id: photos[0].id},
        {_: 'pageBlockPhoto', photo_id: photos[1].id}
      ]
    });
  });

  test('restores the original media after cancelling a same-type Replace upload', () => {
    const {editor, input} = mountEditor();
    const original = {
      _: 'photo',
      id: '125',
      access_hash: '225',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo: original,
      previewUrl: 'blob:replace-original'
    }])).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const uploadId = 'upload-replace-cancel';
    expect(editor.beginRichMediaUpload({
      action: 'replace',
      activeIndex: 0,
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .35,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:replace-pending'],
      selection: {from: 0, to: tiptap.state.doc.firstChild!.nodeSize, type: 'node'}
    })).toBe(true);
    expect(input.querySelector<HTMLImageElement>('img.media-photo')?.src)
    .toContain('blob:replace-pending');

    expect(editor.removeRichMediaUpload(uploadId)).toBe(true);
    expect(input.querySelector<HTMLImageElement>('img.media-photo')?.src)
    .toContain('blob:replace-original');
    expect(input.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockPhoto',
      photo_id: original.id
    });
  });

  test('moves a slideshow from its media menu without recreating its DOM', async() => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(123), previewUrl: 'blob:menu-first'},
      {type: 'photo', photo: photo(124), previewUrl: 'blob:menu-second'}
    ], {grouped: true})).toBe(true);
    expect(editor.getDocument().content?.[0].attrs?.previewUrls).toEqual([
      'blob:menu-first',
      'blob:menu-second'
    ]);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);

    const slideshow = input.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    const items = [...input.querySelectorAll<HTMLElement>('.chat-input-rich-media-item')];
    const images = [...input.querySelectorAll<HTMLImageElement>(
      'img.media-photo:not(.chat-input-rich-media-side-fill)'
    )];
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      'blob:menu-first',
      'blob:menu-second'
    ]);
    const menu = await openRichMediaMenu(input, 0);
    richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Next', true)
    )!.click();

    expect(input.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect([...input.querySelectorAll('.chat-input-rich-media-item')]).toEqual(items);
    expect([...input.querySelectorAll(
      'img.media-photo:not(.chat-input-rich-media-side-fill)'
    )]).toEqual(images);
    expect(items[0].hasAttribute('data-active')).toBe(false);
    expect(items[1].hasAttribute('data-active')).toBe(true);
    expect(slideshow.querySelector<HTMLElement>(
      `.${slideshowStyles.Items}`
    )?.style.transform).toBe('translate(-100%, 0)');
  });

  test('keeps all rich-editor slideshow items mounted while changing the active slide', () => {
    const {editor, input} = mountEditor();
    const photos = Array.from({length: 11}, (_, index) => ({
      _: 'photo',
      id: String(130 + index),
      access_hash: String(230 + index),
      file_reference: new Uint8Array([index + 1])
    })) as Photo.photo[];
    expect(editor.insertRichMedia(photos.slice(0, MESSAGES_ALBUM_MAX_SIZE).map((photo, index) => ({
      type: 'photo' as const,
      photo,
      previewUrl: `blob:mounted-${index}`
    })), {grouped: true})).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);
    expect(editor.addRichMediaItems(0, MESSAGES_ALBUM_MAX_SIZE - 1, [{
      type: 'photo',
      photo: photos[MESSAGES_ALBUM_MAX_SIZE],
      previewUrl: `blob:mounted-${MESSAGES_ALBUM_MAX_SIZE}`
    }])).toBe(true);

    const slideshow = input.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    vi.spyOn(slideshow, 'getBoundingClientRect').mockReturnValue({
      bottom: 200,
      height: 200,
      left: 0,
      right: 300,
      toJSON: () => ({}),
      top: 0,
      width: 300,
      x: 0,
      y: 0
    });
    const firstItem = input.querySelector<HTMLElement>(
      '.chat-input-rich-media-item[data-index="0"]'
    );
    expect(input.querySelectorAll('.chat-input-rich-media-item')).toHaveLength(11);
    expect([...input.querySelectorAll<HTMLImageElement>(
      'img.media-photo:not(.chat-input-rich-media-side-fill)'
    )].map((image) => image.getAttribute('src'))).toEqual(
      Array.from({length: 11}, (_, index) => `blob:mounted-${index}`)
    );

    for(let index = 0; index < 10; ++index) {
      slideshow.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: 299
      }));
    }

    expect(input.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
    expect(input.querySelectorAll('.chat-input-rich-media-item')).toHaveLength(11);
    expect(input.querySelector(
      '.chat-input-rich-media-item[data-index="0"]'
    )).toBe(firstItem);
    expect(slideshow.querySelector<HTMLElement>(
      `.${slideshowStyles.Items}`
    )?.style.transform).toBe('translate(-1000%, 0)');
  });

  test('keeps a deleted local media preview alive throughout undo and redo history', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:undoable-photo');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const {editor, input} = mountEditor();
    const photo = {
      _: 'photo',
      id: '299',
      access_hash: '399',
      file_reference: new Uint8Array([1])
    } as Photo.photo;

    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl: preview.url
    }])).toBe(true);
    preview.release();

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(closeHistory(tiptap.state.tr));
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(tiptap.commands.deleteSelection()).toBe(true);
    expect(input.querySelector('.chat-input-rich-media')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    expect(editor.undo()).toBe(true);
    expect(editor.getDocument().content?.[0].attrs?.previewUrl)
    .toBe('blob:undoable-photo');
    expect(revokeObjectURL).not.toHaveBeenCalled();

    expect(editor.redo()).toBe(true);
    expect(input.querySelector('.chat-input-rich-media')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    expect(editor.setDocument({type: 'doc', content: [{type: 'paragraph'}]})).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:undoable-photo');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  test('releases a local media preview when its redo branch is discarded', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL')
    .mockReturnValue('blob:discarded-redo-photo');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {});
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const {editor} = mountEditor();
    const photo = {
      _: 'photo',
      id: '300',
      access_hash: '400',
      file_reference: new Uint8Array([1])
    } as Photo.photo;

    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl: preview.url
    }])).toBe(true);
    preview.release();
    expect(editor.undo()).toBe(true);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    const tiptap = (editor as TiptapEditorInternals).editor;
    expect(tiptap.commands.insertContent('new history')).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:discarded-redo-photo');

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  test('keeps the media canvas and image mounted while typing its caption', () => {
    const {editor, input} = mountEditor();
    const previewUrl = 'blob:stable-caption-photo';
    const photo = {
      _: 'photo',
      id: '200',
      access_hash: '300',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl
    }])).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    const canvas = input.querySelector<HTMLElement>('.chat-input-rich-media-canvas');
    const item = input.querySelector<HTMLElement>('.chat-input-rich-media-item');
    const image = input.querySelector<HTMLImageElement>('.chat-input-rich-media-item img');
    const tooltip = input.querySelector<HTMLElement>('.chat-input-rich-media-tooltip');
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1)
    ));
    typeTextThroughEditorView(tiptap, 'Caption');

    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockPhoto',
      caption: {
        text: {_: 'textPlain', text: 'Caption'}
      }
    });
    expect(input.querySelector('.chat-input-rich-media-canvas')).toBe(canvas);
    expect(input.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(input.querySelector('.chat-input-rich-media-item img')).toBe(image);
    expect(input.querySelector('.chat-input-rich-media-tooltip')).toBe(tooltip);
  });

  test('toggles a media spoiler without recreating its item or image', async() => {
    const {editor, input} = mountEditor();
    const previewUrl = 'blob:stable-spoiler-photo';
    const photo = {
      _: 'photo',
      id: '201',
      access_hash: '301',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl
    }])).toBe(true);

    const item = input.querySelector<HTMLElement>('.chat-input-rich-media-item');
    const image = item?.querySelector<HTMLImageElement>('img.media-photo');
    expect(item).not.toBeNull();
    expect(image?.getAttribute('src')).toBe(previewUrl);
    expect(item?.hasAttribute('data-spoiler')).toBe(false);

    const menu = await openRichMediaMenu(input);
    const spoiler = richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Spoiler', true)
    );
    expect(spoiler).not.toBeUndefined();
    spoiler!.click();

    const block = editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockPhoto;
    expect(block._).toBe('pageBlockPhoto');
    expect(block.pFlags.spoiler).toBe(true);
    expect(input.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(input.querySelector('.chat-input-rich-media-item img.media-photo')).toBe(image);
    expect(item?.hasAttribute('data-spoiler')).toBe(true);
    expect(input.querySelector('.chat-input-rich-media')?.hasAttribute('data-spoiler')).toBe(true);

    expect(editor.undo()).toBe(true);
    expect(input.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(input.querySelector('.chat-input-rich-media-item img.media-photo')).toBe(image);
    expect(item?.hasAttribute('data-spoiler')).toBe(false);

    expect(editor.redo()).toBe(true);
    expect(input.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(input.querySelector('.chat-input-rich-media-item img.media-photo')).toBe(image);
    expect(item?.hasAttribute('data-spoiler')).toBe(true);
  });

  test('toggles a slideshow item spoiler without recreating the slideshow or its items', async() => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(202), previewUrl: 'blob:slideshow-first'},
      {type: 'photo', photo: photo(203), previewUrl: 'blob:slideshow-second'}
    ], {grouped: true})).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    let mediaPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'richMedia') return;
      mediaPosition = position;
      return false;
    });
    tiptap.view.dispatch(
      tiptap.state.tr.setSelection(NodeSelection.create(tiptap.state.doc, mediaPosition))
    );
    expect(editor.toggleRichMediaLayout()).toBe(true);

    const slideshow = input.querySelector<HTMLElement>(
      '.chat-input-rich-media[data-rich-media-layout="slideshow"]'
    );
    const items = Array.from(
      input.querySelectorAll<HTMLElement>('.chat-input-rich-media-item')
    );
    expect(slideshow).not.toBeNull();
    expect(slideshow?.querySelector('.chat-input-rich-media-slideshow')).not.toBeNull();
    expect(items).toHaveLength(2);

    const menu = await openRichMediaMenu(input, 1);
    richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Spoiler', true)
    )!.click();

    const block = editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockSlideshow;
    expect((block.items[1] as PageBlock.pageBlockPhoto).pFlags.spoiler).toBe(true);
    expect(input.querySelector(
      '.chat-input-rich-media[data-rich-media-layout="slideshow"]'
    )).toBe(slideshow);
    expect(Array.from(
      input.querySelectorAll('.chat-input-rich-media-item')
    )).toEqual(items);
    expect(items[0].hasAttribute('data-spoiler')).toBe(false);
    expect(items[1].hasAttribute('data-spoiler')).toBe(true);
  });
});
