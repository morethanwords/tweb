import {
  useChatInputEditorHarness,
  TiptapEditorInternals,
  typeTextThroughEditorView
} from '@/tests/helpers/chatInputEditorHarness';
import {closeHistory} from '@tiptap/pm/history';
import {NodeSelection, TextSelection} from '@tiptap/pm/state';
import {
  createRichMediaPreviewUrl,
  setRichMediaPreviewPoster,
  setRichMediaPreviewSideFill,
  setRichMediaPreviewSource
} from '@components/chat/inputEditor/mediaPreviewUrl';
import type {ChatInputEditorInputEvent} from '@components/chat/inputEditor/types';
import slideshowStyles from '@components/slideshow.module.scss';
import type {Document, PageBlock, Photo} from '@layer';
import I18n from '@lib/langPack';

describe('Tiptap chat input editor: UploadRendering', () => {
  const {mountEditor, mountPendingUpload, mountReconciledUpload, expectSingleTerminalParagraph} = useChatInputEditorHarness();

  test('shows an optimistic rich-media preview, updates progress, and replaces it in place', async() => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-1';
    const selection = editor.captureSelection();
    const photo = {
      _: 'photo',
      id: '101',
      access_hash: '201',
      file_reference: new Uint8Array([1])
    } as Photo.photo;

    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: 'upload-1-0',
        progress: 0,
        state: 'preparing',
        type: 'photo'
      }],
      previewUrls: ['blob:pending-photo'],
      selection
    })).toBe(true);
    expect(editor.hasPendingRichMediaUploads()).toBe(true);
    expect(editor.getRichMessage().input.blocks).toEqual([]);

    const tiptap = (editor as TiptapEditorInternals).editor;
    const pendingNode = tiptap.state.doc.firstChild;
    let media = input.querySelector<HTMLElement>('.chat-input-rich-media');
    expect(media?.querySelector('img')?.getAttribute('src')).toBe('blob:pending-photo');
    const previewImage = media?.querySelector('img');
    const previewImages = [...(media?.querySelectorAll('img') || [])];
    const uploadOverlay = media?.querySelector<HTMLElement>('.chat-input-rich-media-upload');
    const uploadProgress = media?.querySelector<HTMLElement>('[role="progressbar"]');
    const uploadCircle = uploadProgress?.querySelector('circle');
    expect(uploadOverlay?.dataset.state).toBe('preparing');
    expect(uploadOverlay).not.toBeNull();
    expect(uploadProgress?.classList.contains('preloader-container')).toBe(true);
    expect(uploadProgress?.getAttribute('aria-valuenow')).toBe('0');
    expect(uploadProgress?.getAttribute('aria-label')).toBe(
      I18n.format('RichMessage.Upload.Preparing', true)
    );
    expect(uploadProgress?.classList.contains('preloader-swing')).toBe(true);

    const inputEvent = vi.fn();
    input.addEventListener('input', inputEvent);
    await Promise.resolve();
    inputEvent.mockClear();
    expect(media?.querySelector('img')).toBe(previewImage);
    const progressChildListMutations: MutationRecord[] = [];
    const progressObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        if(record.type === 'childList') progressChildListMutations.push(record);
      });
    });
    progressObserver.observe(media!, {attributes: true, childList: true, subtree: true});
    expect(editor.updateRichMediaUpload(uploadId, [{
      id: 'upload-1-0',
      progress: .42,
      state: 'uploading',
      type: 'photo'
    }])).toBe(true);
    await Promise.resolve();
    progressObserver.disconnect();
    expect(progressChildListMutations).toEqual([]);
    expect(inputEvent).not.toHaveBeenCalled();
    expect(tiptap.state.doc.firstChild).toBe(pendingNode);
    media = input.querySelector<HTMLElement>('.chat-input-rich-media');
    expect(media?.querySelector('img')).toBe(previewImage);
    expect(media?.querySelectorAll('img')).toHaveLength(previewImages.length);
    previewImages.forEach((image, index) => {
      expect(media?.querySelectorAll('img')[index]).toBe(image);
    });
    expect(media?.querySelector('[role="progressbar"]')).toBe(uploadProgress);
    expect(media?.querySelector('[role="progressbar"] circle')).toBe(uploadCircle);
    expect(uploadProgress?.classList.contains('preloader-swing')).toBe(true);
    expect(uploadOverlay?.dataset.state).toBe('uploading');
    expect(media?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('42');
    expect(media?.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe('42%');

    const uploadAction = vi.fn();
    input.addEventListener('chat-input-rich-media-upload-action', uploadAction);
    expect(editor.updateRichMediaUpload(uploadId, [{
      id: 'upload-1-0',
      progress: .42,
      state: 'error',
      type: 'photo'
    }])).toBe(true);
    expect(media?.querySelector('.chat-input-rich-media-upload')).toBe(uploadOverlay);
    expect(media?.querySelector('[role="progressbar"]')).toBe(uploadProgress);
    expect(media?.querySelector('[role="progressbar"] circle')).toBe(uploadCircle);
    expect(uploadProgress?.hidden).toBe(true);
    const retry = Array.from(input.querySelectorAll<HTMLButtonElement>(
      '.chat-input-rich-media-upload-action'
    )).find((button) => button.textContent === I18n.format(
      'RichMessage.Upload.Retry',
      true
    ));
    retry?.click();
    expect(uploadAction).toHaveBeenCalledOnce();
    expect((uploadAction.mock.calls[0][0] as CustomEvent).detail).toEqual({
      action: 'retry',
      uploadId
    });
    expect(editor.updateRichMediaUpload(uploadId, [{
      id: 'upload-1-0',
      progress: 0,
      state: 'preparing',
      type: 'photo'
    }])).toBe(true);
    expect(media?.querySelector('.chat-input-rich-media-upload')).toBe(uploadOverlay);
    expect(media?.querySelector('[role="progressbar"]')).toBe(uploadProgress);
    expect(media?.querySelector('[role="progressbar"] circle')).toBe(uploadCircle);
    expect(uploadProgress?.classList.contains('preloader-swing')).toBe(true);
    expect(uploadProgress?.hidden).toBe(false);
    expect(media?.querySelector<HTMLElement>(
      '.chat-input-rich-media-upload-actions'
    )?.hidden).toBe(true);

    expect(editor.completeRichMediaUpload(uploadId, [{
      type: 'photo',
      photo
    }])).toBe(true);
    await Promise.resolve();
    expect(inputEvent).toHaveBeenCalledOnce();
    expect((inputEvent.mock.calls[0][0] as ChatInputEditorInputEvent)
    .chatInputEditorStructuralChange).toBe(true);
    expect(editor.hasPendingRichMediaUploads()).toBe(false);
    expect(editor.getRichMessage().input.blocks).toMatchObject([{
      _: 'pageBlockPhoto',
      photo_id: photo.id
    }]);
    expect(editor.getDocument().content?.[0].attrs?.previewUrls).toEqual([
      'blob:pending-photo'
    ]);
    expect(input.querySelector('.chat-input-rich-media-upload')).toBeNull();
    const completedDocument = editor.getDocument();

    expect(editor.undo()).toBe(true);
    expect(editor.getRichMessage().input.blocks).toEqual([]);
    expect(editor.redo()).toBe(true);
    expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
    expect(editor.getDocument()).toEqual(completedDocument);
  });

  test('shows a pending audio player and updates its upload progress without remounting it', async() => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const {editor, input} = mountEditor();
    const uploadId = 'upload-audio';
    const uploadItem = {
      fileName: 'Track.mp3',
      fileSize: 1024,
      id: `${uploadId}-0`,
      mimeType: 'audio/mpeg',
      progress: 0,
      state: 'preparing' as const,
      type: 'audio' as const
    };

    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [uploadItem],
      previewUrls: ['blob:pending-audio'],
      selection: editor.captureSelection()
    })).toBe(true);
    expect(editor.getRichMessage().input.blocks).toEqual([]);

    await vi.waitFor(() => {
      expect(input.querySelector('audio-element.audio')).not.toBeNull();
    });
    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const audio = media.querySelector('audio-element.audio');
    const overlay = media.querySelector<HTMLElement>('.chat-input-rich-media-upload');
    const progress = media.querySelector('[role="progressbar"]');
    expect(media.dataset.richMediaType).toBe('pageBlockAudio');
    expect(overlay?.dataset.state).toBe('preparing');

    expect(editor.updateRichMediaUpload(uploadId, [{
      ...uploadItem,
      duration: 42,
      progress: .64,
      state: 'uploading'
    }])).toBe(true);
    await Promise.resolve();
    expect(media.querySelector('audio-element.audio')).toBe(audio);
    expect(media.querySelector('.chat-input-rich-media-upload')).toBe(overlay);
    expect(media.querySelector('[role="progressbar"]')).toBe(progress);
    expect(progress?.getAttribute('aria-valuenow')).toBe('64');
    expect(media.querySelector('.audio-time')?.textContent).toBe('0:42');

    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.focusAtEnd(false);
    expect(tiptap.chain().insertContent('Keep typing').run()).toBe(true);
    const caretOffsetBeforeCompletion = tiptap.state.selection.$from.parentOffset;
    const caretParentBeforeCompletion = tiptap.state.selection.$from.parent.type.name;
    const document = {
      _: 'document',
      id: '501',
      access_hash: '601',
      file_reference: new Uint8Array([1]),
      pFlags: {},
      type: 'audio',
      file_name: 'Track.mp3',
      size: 1024,
      mime_type: 'audio/mpeg',
      duration: 42,
      attributes: [{
        _: 'documentAttributeAudio',
        pFlags: {},
        duration: 42
      }]
    } as Document.document;
    expect(editor.completeRichMediaUpload(uploadId, [{
      type: 'audio',
      document
    }])).toBe(true);
    expect(editor.getRichMessage().input.blocks).toMatchObject([{
      _: 'pageBlockAudio',
      audio_id: document.id
    }]);
    expect(tiptap.state.selection).toBeInstanceOf(TextSelection);
    expect(tiptap.state.selection.$from.parent.type.name).toBe(caretParentBeforeCompletion);
    expect(tiptap.state.selection.$from.parentOffset).toBe(caretOffsetBeforeCompletion);
    expect(tiptap.state.selection.$from.parent.textContent).toBe('Keep typing');
    expect(input.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    pause.mockRestore();
    load.mockRestore();
  });

  test('inserts split visual and audio uploads atomically', () => {
    const {editor, input} = mountEditor();
    const tiptap = (editor as TiptapEditorInternals).editor;
    editor.setTextWithEntities('Replace this');
    editor.restoreSelection({from: 1, to: 8}, false);
    const selection = editor.captureSelection();
    const before = editor.getDocument();
    const invalid = [{
      grouped: false,
      id: 'atomic-photo',
      items: [{
        id: 'atomic-photo-0',
        progress: 0,
        state: 'preparing' as const,
        type: 'photo' as const
      }],
      previewUrls: ['blob:atomic-photo'],
      selection
    }, {
      grouped: false,
      id: 'atomic-invalid-audio',
      items: [{
        id: 'atomic-invalid-audio-0',
        progress: 0,
        state: 'preparing' as const,
        type: 'audio' as const
      }, {
        id: 'atomic-invalid-audio-1',
        progress: 0,
        state: 'preparing' as const,
        type: 'audio' as const
      }],
      previewUrls: ['blob:atomic-audio-0', 'blob:atomic-audio-1'],
      selection
    }];

    expect(editor.beginRichMediaUploads(invalid)).toBe(false);
    expect(editor.getDocument()).toEqual(before);
    expect(editor.captureSelection()).toMatchObject(selection);

    const valid = [{
      ...invalid[0],
      grouped: true,
      items: [{
        id: 'atomic-photo-0',
        progress: 0,
        state: 'preparing' as const,
        type: 'photo' as const
      }, {
        id: 'atomic-video-0',
        progress: 0,
        state: 'preparing' as const,
        type: 'video' as const
      }],
      previewUrls: ['blob:atomic-photo', 'blob:atomic-video']
    }, {
      grouped: false,
      id: 'atomic-audio',
      items: [{
        id: 'atomic-audio-0',
        progress: 0,
        state: 'preparing' as const,
        type: 'audio' as const
      }],
      previewUrls: ['blob:atomic-audio'],
      selection
    }];
    expect(editor.beginRichMediaUploads(valid)).toBe(true);
    expect(editor.getPendingRichMediaUploadIds()).toEqual([
      'atomic-photo',
      'atomic-audio'
    ]);
    const insertedContent = editor.getDocument().content || [];
    expect(insertedContent.map(({type}) => type)).toEqual([
      'richMedia',
      'richMedia',
      'paragraph'
    ]);
    expect(insertedContent[2].content).toEqual([{type: 'text', text: ' this'}]);
    expectSingleTerminalParagraph(input, tiptap);

    editor.undo();
    expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
    expect(editor.getDocument()).toEqual(before);
  });

  test('invalidates a saved insertion target after a document change', () => {
    const {editor} = mountEditor();
    editor.setTextWithEntities('Initial');
    const saved = editor.captureSelection();
    expect(Object.keys(saved)).not.toContain('revision');

    editor.restoreSelection({from: 1, to: 1}, false);
    expect(editor.captureSelection().revision).toBe(saved.revision);

    editor.setTextWithEntities('Changed');
    expect(editor.captureSelection().revision).toBeGreaterThan(saved.revision);
  });

  test.each([undefined, 'add', 'replace'] as const)('keeps a selected media node when %s upload completes', (action) => {
    const {editor, input, tiptap, uploadId, uploaded} = mountPendingUpload(action);
    tiptap.view.dispatch(tiptap.state.tr.setSelection(NodeSelection.create(tiptap.state.doc, 0)));
    expect(editor.completeRichMediaUpload(uploadId, [uploaded])).toBe(true);
    expect(tiptap.state.selection).toBeInstanceOf(NodeSelection);
    expect((tiptap.state.selection as NodeSelection).node.type.name).toBe('richMedia');
    expect(input.querySelector('.chat-input-rich-media.ProseMirror-selectednode')).not.toBeNull();
  });

  test.each(['add', 'replace'] as const)('undoes a completed %s upload without restoring orphaned upload metadata', (action) => {
    const {editor, before, uploadId, uploaded} = mountPendingUpload(action);
    expect(editor.completeRichMediaUpload(uploadId, [uploaded])).toBe(true);
    const completed = editor.getDocument();
    for(let count = 0; count < 3; ++count) {
      expect(editor.undo()).toBe(true);
      expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
      expect(editor.getDocument()).toEqual(before);
      expect(editor.redo()).toBe(true);
      expect(editor.getDocument()).toEqual(completed);
    }
  });

  test.each([false, true])('keeps a cross-boundary caption selection during upload completion with backward=%s', (backward) => {
    const {editor, tiptap, uploadId, uploaded} = mountPendingUpload();
    const prefix = tiptap.schema.nodes.paragraph.create(null, tiptap.schema.text('Before'));
    tiptap.view.dispatch(tiptap.state.tr.insert(0, prefix));
    const captionStart = prefix.nodeSize + 1;
    tiptap.view.dispatch(tiptap.state.tr.insertText('Caption', captionStart));
    const from = 1;
    const to = captionStart + 3;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(TextSelection.create(
      tiptap.state.doc, backward ? to : from, backward ? from : to
    )));
    const before = editor.captureSelection();
    const text = editor.getSelectedText();

    expect(editor.completeRichMediaUpload(uploadId, [uploaded])).toBe(true);
    expect(editor.captureSelection()).toEqual(before);
    expect(editor.getSelectedText()).toBe(text);
  });

  test.each([undefined, 'add', 'replace'] as const)('retains an undoable pending %s upload until Redo or a history branch', (action) => {
    const {editor, before, uploadId, uploaded, task, tasks, handlers, reconcile} = mountReconciledUpload(action);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
    reconcile();
    expect(tasks.has(uploadId)).toBe(true);
    expect(handlers.cancel).not.toHaveBeenCalled();

    task.items[0].uploaded = uploaded;
    reconcile();
    expect(editor.getDocument()).toEqual(before);
    expect(editor.redo()).toBe(true);
    reconcile();
    expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
    expect(editor.getRichMessage().input.blocks.length).toBeGreaterThan(0);
    expect(handlers.complete).toHaveBeenCalledOnce();
    expect(tasks.size).toBe(0);
  });

  test('cancels an undone upload when a new edit discards its Redo branch', () => {
    const {editor, tasks, handlers, reconcile} = mountReconciledUpload();
    expect(editor.undo()).toBe(true);
    reconcile();
    expect(tasks.size).toBe(1);
    expect(editor.replaceSelection('New branch')).toBe(true);
    reconcile();
    expect(editor.canRedo()).toBe(false);
    expect(tasks.size).toBe(0);
    expect(handlers.cancel).toHaveBeenCalledOnce();
  });

  test.each(['add', 'replace'] as const)('keeps caption edits after a pending %s ahead of that action in Undo history', (action) => {
    const {editor, tiptap, before, uploadId, uploaded} = mountPendingUpload(action);
    tiptap.view.dispatch(closeHistory(tiptap.state.tr).insertText('Caption', 1));
    expect(editor.completeRichMediaUpload(uploadId, [uploaded])).toBe(true);
    const completedBlock = editor.getDocument().content?.[0].attrs?.block;
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument().content?.[0].content).toBeUndefined();
    expect(editor.getDocument().content?.[0].attrs?.block).toEqual(completedBlock);
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(before);
  });

  test('does not restore an orphaned pending-media upload through Undo', () => {
    const {editor} = mountEditor();
    const uploadId = 'upload-cancelled';
    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: 0,
        state: 'preparing',
        type: 'photo'
      }],
      previewUrls: ['blob:cancelled-photo'],
      selection: editor.captureSelection()
    })).toBe(true);
    expect(editor.getPendingRichMediaUploadIds()).toEqual([uploadId]);

    expect(editor.removeRichMediaUpload(uploadId)).toBe(true);
    expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
    editor.undo();
    expect(editor.getPendingRichMediaUploadIds()).toEqual([]);
    expect(editor.hasPendingRichMediaUploads()).toBe(false);
  });

  test('shows a predecoded Add item with its final collage geometry immediately', () => {
    const {editor, input} = mountEditor();
    const existing = {
      _: 'photo',
      id: '111',
      access_hash: '211',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const added = {
      _: 'photo',
      id: '112',
      access_hash: '212',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo: existing,
      previewUrl: 'blob:existing-photo'
    }])).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    const existingNode = tiptap.state.doc.firstChild!;
    const uploadId = 'upload-add';
    const addedPreview = createRichMediaPreviewUrl(new Blob(['added-photo']));
    const decodedImage = new Image();
    decodedImage.src = addedPreview.url;
    Object.defineProperties(decodedImage, {
      naturalHeight: {configurable: true, value: 600},
      naturalWidth: {configurable: true, value: 300}
    });
    const addedPosterUrl = URL.createObjectURL(new Blob(['added-photo-poster']));
    const decodedPoster = new Image();
    decodedPoster.src = addedPosterUrl;
    Object.defineProperties(decodedPoster, {
      naturalHeight: {configurable: true, value: 720},
      naturalWidth: {configurable: true, value: 360}
    });
    expect(setRichMediaPreviewSource(addedPreview.url, decodedImage)).toBe(true);
    expect(setRichMediaPreviewPoster(
      addedPreview.url,
      decodedPoster,
      addedPosterUrl
    )).toBe(true);

    expect(editor.beginRichMediaUpload({
      action: 'add',
      activeIndex: 0,
      grouped: false,
      id: uploadId,
      items: [{
        height: 600,
        id: `${uploadId}-0`,
        progress: .25,
        state: 'uploading',
        type: 'photo',
        width: 300
      }],
      previewUrls: [addedPreview.url],
      selection: {from: 0, to: existingNode.nodeSize, type: 'node'}
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    expect(media.dataset.richMediaLayout).toBe('collage');
    const pendingImages = [...media.querySelectorAll('img')];
    expect(pendingImages.map((image) => image.getAttribute('src')))
    .toEqual(['blob:existing-photo', addedPosterUrl]);
    expect(pendingImages[1]).toBe(decodedPoster);
    const mediaCanvas = media.querySelector<HTMLElement>('.chat-input-rich-media-canvas')!;
    const pendingItem = pendingImages[1].closest<HTMLElement>('.chat-input-rich-media-item')!;
    const layout = () => [mediaCanvas, ...mediaCanvas.children].map((item) => {
      const element = item as HTMLElement;
      return [element.style.width, element.style.height, element.style.top, element.style.left];
    });
    const layoutBeforePreview = layout();
    expect(pendingItem.style.visibility).toBe('');
    pendingImages[1].dispatchEvent(new Event('load'));
    expect(layout()).toEqual(layoutBeforePreview);
    expect(media.querySelectorAll('.chat-input-rich-media-upload')).toHaveLength(1);
    expect(media.querySelector('.chat-input-rich-media-upload')?.parentElement?.dataset.uploadIndex)
    .toBe('0');
    const pendingMoreButtons = media.querySelectorAll<HTMLButtonElement>(
      '.chat-input-rich-media-more'
    );
    expect(pendingMoreButtons).toHaveLength(2);
    expect(pendingMoreButtons[0].hidden).toBe(false);
    expect(pendingMoreButtons[1].hidden).toBe(true);

    expect(editor.completeRichMediaUpload(uploadId, [{
      type: 'photo',
      photo: added
    }])).toBe(true);
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockCollage',
      items: [
        {_: 'pageBlockPhoto', photo_id: existing.id},
        {_: 'pageBlockPhoto', photo_id: added.id}
      ]
    });
    const completedImages = [...media.querySelectorAll('img')];
    expect(completedImages).toHaveLength(2);
    expect(completedImages[0]).toBe(pendingImages[0]);
    expect(completedImages[1]).toBe(pendingImages[1]);
    expect(completedImages[1].getAttribute('src')).toBe(addedPosterUrl);
    expect(media.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(media.querySelectorAll('.chat-input-rich-media-more:not([hidden])')).toHaveLength(2);
    addedPreview.release();
  });

  test('mounts the predecoded pending video poster together with its duration', () => {
    const {editor, input} = mountEditor();
    const preview = createRichMediaPreviewUrl(new Blob(['video']));
    const decodedVideo = document.createElement('video');
    decodedVideo.src = preview.url;
    Object.defineProperties(decodedVideo, {
      duration: {configurable: true, value: 4},
      videoHeight: {configurable: true, value: 720},
      videoWidth: {configurable: true, value: 1280}
    });
    const posterUrl = URL.createObjectURL(new Blob(['poster']));
    const decodedPoster = new Image();
    decodedPoster.src = posterUrl;
    const decodedSideFill = new Image();
    decodedSideFill.src = posterUrl;
    expect(setRichMediaPreviewSource(preview.url, decodedVideo)).toBe(true);
    expect(setRichMediaPreviewPoster(
      preview.url,
      decodedPoster,
      posterUrl
    )).toBe(true);
    expect(setRichMediaPreviewSideFill(preview.url, decodedSideFill)).toBe(true);

    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: 'upload-add-video',
      items: [{
        duration: 4,
        height: 720,
        id: 'upload-add-video-0',
        progress: .25,
        state: 'uploading',
        type: 'video',
        width: 1280
      }],
      previewUrls: [preview.url],
      selection: editor.captureSelection()
    })).toBe(true);

    const pendingItem = input.querySelector<HTMLElement>(
      '.chat-input-rich-media-item[data-upload-index="0"]'
    )!;
    expect(pendingItem.querySelector('.media-container-aspecter > img.media-photo'))
    .toBe(decodedPoster);
    expect(pendingItem.querySelector('.chat-input-rich-media-side-fill'))
    .toBe(decodedSideFill);
    expect(pendingItem.querySelector('video')).toBeNull();
    expect(pendingItem.querySelector('.video-time')?.textContent).toBe('0:04');

    expect(editor.removeRichMediaUpload('upload-add-video')).toBe(true);
    preview.release();
  });

  test('mounts a predecoded photo and its side fill in the first pending render', () => {
    const {editor, input} = mountEditor();
    const preview = createRichMediaPreviewUrl(new Blob(['photo']));
    const decodedSource = new Image();
    decodedSource.src = preview.url;
    const posterUrl = URL.createObjectURL(new Blob(['poster']));
    const decodedPhoto = new Image();
    decodedPhoto.src = posterUrl;
    const decodedSideFill = new Image();
    decodedSideFill.src = posterUrl;
    Object.defineProperties(decodedSource, {
      naturalHeight: {configurable: true, value: 600},
      naturalWidth: {configurable: true, value: 300}
    });
    expect(setRichMediaPreviewSource(preview.url, decodedSource)).toBe(true);
    expect(setRichMediaPreviewPoster(preview.url, decodedPhoto, posterUrl)).toBe(true);
    expect(setRichMediaPreviewSideFill(preview.url, decodedSideFill)).toBe(true);

    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: 'upload-photo-first-frame',
      items: [{
        height: 600,
        id: 'upload-photo-first-frame-0',
        progress: .25,
        state: 'uploading',
        type: 'photo',
        width: 300
      }],
      previewUrls: [preview.url],
      selection: editor.captureSelection()
    })).toBe(true);

    const pendingItem = input.querySelector<HTMLElement>(
      '.chat-input-rich-media-item[data-upload-index="0"]'
    )!;
    expect(pendingItem.querySelector('.media-container-aspecter > .media-photo'))
    .toBe(decodedPhoto);
    expect(decodedPhoto.getAttribute('src')).toBe(posterUrl);
    expect(pendingItem.querySelector('.chat-input-rich-media-side-fill'))
    .toBe(decodedSideFill);

    expect(editor.removeRichMediaUpload('upload-photo-first-frame')).toBe(true);
    preview.release();
  });

  test('keeps slideshow media and preloader DOM stable across upload progress ticks', () => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(121), previewUrl: 'blob:slideshow-first'},
      {type: 'photo', photo: photo(122), previewUrl: 'blob:slideshow-second'}
    ], {grouped: true})).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);
    const slideshowNode = tiptap.state.doc.firstChild!;
    const uploadId = 'upload-slideshow-progress';
    expect(editor.beginRichMediaUpload({
      action: 'replace',
      activeIndex: 0,
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: 0,
        state: 'preparing',
        type: 'photo'
      }],
      previewUrls: ['blob:slideshow-replacement'],
      selection: {from: 0, to: slideshowNode.nodeSize, type: 'node'}
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const slideshow = media.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    const item = media.querySelector<HTMLElement>('[data-upload-aggregate="true"]')!;
    const image = item.querySelector<HTMLImageElement>('img.media-photo')!;
    const progress = item.querySelector<HTMLElement>('[role="progressbar"]')!;
    expect(media.dataset.richMediaLayout).toBe('slideshow');
    expect(image.getAttribute('src')).toBe('blob:slideshow-replacement');
    expect(progress.getAttribute('aria-valuenow')).toBe('0');

    ([
      [.18, 'uploading'],
      [.67, 'uploading'],
      [1, 'processing']
    ] as const).forEach(([value, state]) => {
      expect(editor.updateRichMediaUpload(uploadId, [{
        id: `${uploadId}-0`,
        progress: value,
        state,
        type: 'photo'
      }])).toBe(true);

      expect(media.querySelector(`.${slideshowStyles.Slideshow}`)).toBe(slideshow);
      expect(media.querySelector('[data-upload-aggregate="true"]')).toBe(item);
      expect(item.querySelector('img.media-photo')).toBe(image);
      expect(item.querySelector('[role="progressbar"]')).toBe(progress);
      expect(progress.getAttribute('aria-valuenow')).toBe(`${Math.round(value * 100)}`);
      expect(progress.closest<HTMLElement>('.chat-input-rich-media-upload')?.dataset.state)
      .toBe(state);
    });
  });

  test('does not mutate media DOM for a duplicate rounded upload progress tick', async() => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-progress-noop';
    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .421,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:progress-noop'],
      selection: editor.captureSelection()
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const progress = media.querySelector<HTMLElement>('[role="progressbar"]')!;
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(media, {
      attributes: true,
      childList: true,
      subtree: true
    });

    expect(editor.updateRichMediaUpload(uploadId, [{
      id: `${uploadId}-0`,
      progress: .424,
      state: 'uploading',
      type: 'photo'
    }])).toBe(true);
    await Promise.resolve();
    observer.disconnect();

    expect(mutations).toEqual([]);
    expect(media.querySelector('[role="progressbar"]')).toBe(progress);
    expect(progress.getAttribute('aria-valuenow')).toBe('42');
  });

  test('media upload identity: ready fades the same progress before completion cleanup', async() => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-ready-identity';
    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .45,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:ready-identity'],
      selection: editor.captureSelection()
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const item = media.querySelector<HTMLElement>('.chat-input-rich-media-item')!;
    const image = item.querySelector<HTMLImageElement>('img.media-photo')!;
    const overlay = item.querySelector<HTMLElement>('.chat-input-rich-media-upload')!;
    expect(overlay).not.toBeNull();

    expect(editor.updateRichMediaUpload(uploadId, [{
      id: `${uploadId}-0`,
      progress: 1,
      state: 'ready',
      type: 'photo'
    }])).toBe(true);
    expect(input.querySelector('.chat-input-rich-media')).toBe(media);
    expect(media.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(item.querySelector('img.media-photo')).toBe(image);
    expect(item.querySelector('.chat-input-rich-media-upload')).toBe(overlay);
    expect(overlay.dataset.state).toBe('ready');
    const progress = overlay.querySelector<HTMLElement>('[role="progressbar"]')!;
    const circle = progress.querySelector('circle');
    expect(progress.getAttribute('aria-valuenow')).toBe('100');
    expect(progress.classList.contains(
      'chat-input-rich-media-upload-progress-complete'
    )).toBe(true);
    expect(progress.classList.contains('forwards')).toBe(false);
    expect(overlay.isConnected).toBe(true);

    const uploaded = {
      _: 'photo',
      id: '131',
      access_hash: '231',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.completeRichMediaUpload(uploadId, [{
      type: 'photo',
      photo: uploaded
    }])).toBe(true);
    expect(input.querySelector('.chat-input-rich-media')).toBe(media);
    expect(media.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(item.querySelector('img.media-photo')).toBe(image);
    expect(media.querySelector('.chat-input-rich-media-upload')).toBe(overlay);
    expect(overlay.querySelector('[role="progressbar"]')).toBe(progress);
    expect(progress.querySelector('circle')).toBe(circle);
    await vi.waitFor(() => expect(overlay.isConnected).toBe(false));
    expect(media.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(editor.getRichMessage().input.blocks[0]).toMatchObject({
      _: 'pageBlockPhoto',
      photo_id: uploaded.id
    });
  });

  test('media upload identity: one ready grouped item fades while the other stays stable', async() => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-group-ready-identity';
    expect(editor.beginRichMediaUpload({
      grouped: true,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .8,
        state: 'uploading',
        type: 'photo'
      }, {
        id: `${uploadId}-1`,
        progress: .2,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:group-ready-first', 'blob:group-ready-second'],
      selection: editor.captureSelection()
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const firstItem = media.querySelector<HTMLElement>('[data-upload-index="0"]')!;
    const secondItem = media.querySelector<HTMLElement>('[data-upload-index="1"]')!;
    const firstImage = firstItem.querySelector<HTMLImageElement>('img.media-photo')!;
    const secondImage = secondItem.querySelector<HTMLImageElement>('img.media-photo')!;
    const firstOverlay = firstItem.querySelector<HTMLElement>('.chat-input-rich-media-upload')!;
    const secondOverlay = secondItem.querySelector<HTMLElement>('.chat-input-rich-media-upload')!;
    const secondProgress = secondItem.querySelector<HTMLElement>('[role="progressbar"]')!;

    expect(editor.updateRichMediaUpload(uploadId, [{
      id: `${uploadId}-0`,
      progress: 1,
      state: 'ready',
      type: 'photo'
    }, {
      id: `${uploadId}-1`,
      progress: .63,
      state: 'uploading',
      type: 'photo'
    }])).toBe(true);

    expect(media.querySelector('[data-upload-index="0"]')).toBe(firstItem);
    expect(media.querySelector('[data-upload-index="1"]')).toBe(secondItem);
    expect(firstItem.querySelector('img.media-photo')).toBe(firstImage);
    expect(secondItem.querySelector('img.media-photo')).toBe(secondImage);
    expect(firstItem.querySelector('.chat-input-rich-media-upload')).toBe(firstOverlay);
    expect(firstOverlay.dataset.state).toBe('ready');
    expect(firstOverlay.isConnected).toBe(true);
    expect(secondItem.querySelector('.chat-input-rich-media-upload')).toBe(secondOverlay);
    expect(secondItem.querySelector('[role="progressbar"]')).toBe(secondProgress);
    expect(secondProgress.getAttribute('aria-valuenow')).toBe('63');
    expect(secondOverlay.dataset.state).toBe('uploading');
    await vi.waitFor(() => expect(firstOverlay.isConnected).toBe(false));
    expect(firstItem.querySelector('.chat-input-rich-media-upload')).toBeNull();
    expect(secondItem.querySelector('.chat-input-rich-media-upload')).toBe(secondOverlay);
  });

  test('media upload identity: caption editing preserves an active preview and progress', () => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-caption-identity';
    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .31,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:caption-identity'],
      selection: editor.captureSelection()
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const item = media.querySelector<HTMLElement>('.chat-input-rich-media-item')!;
    const image = item.querySelector<HTMLImageElement>('img.media-photo')!;
    const overlay = item.querySelector<HTMLElement>('.chat-input-rich-media-upload')!;
    const progress = item.querySelector<HTMLElement>('[role="progressbar"]')!;
    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      TextSelection.create(tiptap.state.doc, 1)
    ));
    typeTextThroughEditorView(tiptap, 'Uploading caption');

    expect(tiptap.state.doc.firstChild?.textContent).toBe('Uploading caption');
    expect(input.querySelector('.chat-input-rich-media')).toBe(media);
    expect(media.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(item.querySelector('img.media-photo')).toBe(image);
    expect(item.querySelector('.chat-input-rich-media-upload')).toBe(overlay);
    expect(item.querySelector('[role="progressbar"]')).toBe(progress);
    expect(progress.getAttribute('aria-valuenow')).toBe('31');
  });

  test('media upload identity: metadata and spoiler updates do not rebuild an active preview', () => {
    const {editor, input} = mountEditor();
    const uploadId = 'upload-metadata-identity';
    expect(editor.beginRichMediaUpload({
      grouped: false,
      id: uploadId,
      items: [{
        id: `${uploadId}-0`,
        progress: .38,
        state: 'uploading',
        type: 'photo'
      }],
      previewUrls: ['blob:metadata-identity'],
      selection: editor.captureSelection()
    })).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const item = media.querySelector<HTMLElement>('.chat-input-rich-media-item')!;
    const image = item.querySelector<HTMLImageElement>('img.media-photo')!;
    const overlay = item.querySelector<HTMLElement>('.chat-input-rich-media-upload')!;
    const progress = item.querySelector<HTMLElement>('[role="progressbar"]')!;
    const tiptap = (editor as TiptapEditorInternals).editor;
    const uploadNode = tiptap.state.doc.firstChild!;
    const block = uploadNode.attrs.block as PageBlock.pageBlockPhoto;
    tiptap.view.dispatch(tiptap.state.tr.setNodeMarkup(0, undefined, {
      ...uploadNode.attrs,
      block: {
        ...block,
        pFlags: {...block.pFlags, spoiler: true},
        url: 'https://example.com/metadata-only'
      },
      uploadItems: [...uploadNode.attrs.uploadItems],
      uploadPreviewUrls: [...uploadNode.attrs.uploadPreviewUrls]
    }));

    expect(input.querySelector('.chat-input-rich-media')).toBe(media);
    expect(media.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(item.querySelector('img.media-photo')).toBe(image);
    expect(item.querySelector('.chat-input-rich-media-upload')).toBe(overlay);
    expect(item.querySelector('[role="progressbar"]')).toBe(progress);
    expect(item.hasAttribute('data-spoiler')).toBe(true);
    expect(media.hasAttribute('data-spoiler')).toBe(true);
  });

  test('media upload identity: resource metadata refresh preserves the rendered media', () => {
    const {editor, input} = mountEditor();
    const photo = {
      _: 'photo',
      id: '139',
      access_hash: '239',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    expect(editor.insertRichMedia([{
      type: 'photo',
      photo,
      previewUrl: 'blob:resource-refresh'
    }])).toBe(true);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const item = media.querySelector<HTMLElement>('.chat-input-rich-media-item')!;
    const image = item.querySelector<HTMLImageElement>('img.media-photo')!;
    const tiptap = (editor as TiptapEditorInternals).editor;
    const mediaNode = tiptap.state.doc.firstChild!;
    const block = mediaNode.attrs.block as PageBlock.pageBlockPhoto;
    tiptap.view.dispatch(tiptap.state.tr.setNodeMarkup(0, undefined, {
      ...mediaNode.attrs,
      block: {
        ...block,
        url: 'https://example.com/refreshed-metadata'
      },
      photos: [{
        ...photo,
        access_hash: '999',
        file_reference: new Uint8Array([9])
      }]
    }));

    expect(input.querySelector('.chat-input-rich-media')).toBe(media);
    expect(media.querySelector('.chat-input-rich-media-item')).toBe(item);
    expect(item.querySelector('img.media-photo')).toBe(image);
  });
});
