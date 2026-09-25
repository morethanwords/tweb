import {useChatInputEditorHarness, TiptapEditorInternals} from '@/tests/helpers/chatInputEditorHarness';
import {AllSelection, NodeSelection} from '@tiptap/pm/state';
import slideshowStyles from '@components/slideshow.module.scss';
import {INSTANT_VIEW_MEDIA_MAX_HEIGHT, instantViewStyles} from '@components/instantViewFormatting';
import type {Document, PageBlock, Photo} from '@layer';
import I18n from '@lib/langPack';
import {resizeObserverInstances} from '@/tests/mocks/resizeObserver';

describe('Tiptap chat input editor: MediaActions', () => {
  const {mountEditor, openRichMediaMenu, richMediaMenuItem} = useChatInputEditorHarness();

  test('keeps slideshow height based on its tallest item instead of the active slide', () => {
    const {editor, input} = mountEditor();
    const photo = (id: number, width: number, height: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id]),
      sizes: [{
        _: 'photoSize',
        h: height,
        size: width * height,
        type: 'x',
        w: width
      }]
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(204, 1600, 400), previewUrl: 'blob:slideshow-wide'},
      {type: 'photo', photo: photo(205, 800, 1200), previewUrl: 'blob:slideshow-tall'}
    ], {grouped: true})).toBe(true);

    const tiptap = (editor as TiptapEditorInternals).editor;
    tiptap.view.dispatch(tiptap.state.tr.setSelection(
      NodeSelection.create(tiptap.state.doc, 0)
    ));
    expect(editor.toggleRichMediaLayout()).toBe(true);

    const slideshow = input.querySelector<HTMLElement>(`.${slideshowStyles.Slideshow}`)!;
    const aspectRatio = () => Number(
      slideshow.style.getPropertyValue('--slideshow-aspect-ratio')
    );
    expect(aspectRatio()).toBeCloseTo(800 / 1200);
    expect(slideshow.style.getPropertyValue('--slideshow-max-height')).toBe('');
    expect(INSTANT_VIEW_MEDIA_MAX_HEIGHT).toBe(360);
    const dots = slideshow.querySelectorAll<HTMLButtonElement>(`button.${slideshowStyles.Dot}`);
    expect(dots).toHaveLength(2);
    dots[1].click();
    expect(aspectRatio()).toBeCloseTo(800 / 1200);
  });

  test('preserves formatted media credit and switches grouped layout from its More menu', async() => {
    const {editor, input} = mountEditor();
    const firstPhoto = {
      _: 'photo',
      id: '201',
      access_hash: '301',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const secondPhoto = {
      _: 'photo',
      id: '202',
      access_hash: '302',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
    const emptyCaption = {
      _: 'pageCaption' as const,
      text: {_: 'textEmpty' as const},
      credit: {_: 'textEmpty' as const}
    };
    const credit = {
      _: 'textItalic' as const,
      text: {
        _: 'textBold' as const,
        text: {_: 'textPlain' as const, text: 'Photographer'}
      }
    };
    const block: PageBlock.pageBlockSlideshow = {
      _: 'pageBlockSlideshow',
      items: [{
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: firstPhoto.id,
        caption: emptyCaption
      }, {
        _: 'pageBlockPhoto',
        pFlags: {},
        photo_id: secondPhoto.id,
        caption: emptyCaption
      }],
      caption: {
        _: 'pageCaption',
        text: {_: 'textBold', text: {_: 'textPlain', text: 'Caption'}},
        credit
      }
    };

    expect(editor.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [block],
      photos: [firstPhoto, secondPhoto],
      documents: []
    })).toBe(true);
    expect(editor.getDocument().content?.[0].attrs?.captionCredit).toEqual(credit);
    expect(input.querySelectorAll('.chat-input-rich-media-more.btn-icon')).toHaveLength(2);
    expect(input.querySelectorAll('.chat-input-rich-media-control')).toHaveLength(0);
    expect(input.querySelector(`.${slideshowStyles.Slideshow}.${instantViewStyles.Slideshow}`))
    .not.toBeNull();
    const captionCredit = input.querySelector<HTMLElement>(
      `.${instantViewStyles.CaptionCredit}`
    );
    expect(captionCredit?.textContent).toBe('Photographer');
    expect(captionCredit?.querySelector('em strong, strong em')).not.toBeNull();

    let menu = await openRichMediaMenu(input);
    const showCollageLabel = I18n.format(
      'Chat.Input.Editor.Toolbar.ShowAsCollage',
      true
    );
    const showCollage = richMediaMenuItem(menu, showCollageLabel);
    expect(showCollage).not.toBeUndefined();
    expect(richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Ungroup', true)
    )).toBeUndefined();
    expect(richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Toolbar.ShowAsSlideshow', true)
    )).toBeUndefined();
    showCollage!.click();
    let convertedBlock = editor.getRichMessage().input.blocks[0] as
      PageBlock.pageBlockCollage | PageBlock.pageBlockSlideshow;
    expect(convertedBlock._).toBe('pageBlockCollage');
    expect(convertedBlock.caption.credit).toEqual(credit);
    const collage = input.querySelector<HTMLElement>(
      `.chat-input-rich-media-canvas.${instantViewStyles.Collage}.${instantViewStyles.Media}`
    );
    expect(collage).not.toBeNull();
    expect(collage?.querySelectorAll(`.${instantViewStyles.CollageItem}`)).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 350));
    menu = await openRichMediaMenu(input);
    const showSlideshow = richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Toolbar.ShowAsSlideshow', true)
    );
    expect(showSlideshow).not.toBeUndefined();
    expect(richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Ungroup', true)
    )).toBeUndefined();
    expect(richMediaMenuItem(menu, showCollageLabel)).toBeUndefined();
    showSlideshow!.click();
    convertedBlock = editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockSlideshow;
    expect(convertedBlock._).toBe('pageBlockSlideshow');
    expect(convertedBlock.caption.credit).toEqual(credit);
  });

  test('binds each grouped-media More menu to its own item', async() => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(211), previewUrl: 'blob:first'},
      {type: 'photo', photo: photo(212), previewUrl: 'blob:second'}
    ], {grouped: true})).toBe(true);
    expect(input.querySelectorAll('.chat-input-rich-media-more')).toHaveLength(2);

    const requested = vi.fn();
    input.addEventListener('chat-input-rich-media-action', requested);
    const menu = await openRichMediaMenu(input, 1);
    richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Add', true)
    )?.click();

    expect(requested).toHaveBeenCalledOnce();
    expect((requested.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      action: 'add',
      activeIndex: 1
    });
  });

  test('routes Edit Media to the selected visual item', async() => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    const first = photo(215);
    const second = photo(216);
    expect(editor.insertRichMedia([
      {type: 'photo', photo: first, previewUrl: 'blob:edit-first'},
      {type: 'photo', photo: second, previewUrl: 'blob:edit-second'}
    ], {grouped: true})).toBe(true);

    const requested = vi.fn();
    input.addEventListener('chat-input-rich-media-action', requested);
    const menu = await openRichMediaMenu(input, 1);
    richMediaMenuItem(
      menu,
      I18n.format('Chat.Input.Editor.Media.Edit', true)
    )?.click();

    expect(requested).toHaveBeenCalledOnce();
    const detail = (requested.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toMatchObject({
      action: 'edit',
      activeIndex: 1,
      grouped: true,
      media: second,
      previewUrl: 'blob:edit-second'
    });
    expect(detail.sourceElement).toBeInstanceOf(HTMLImageElement);
  });

  test('routes the media hover tooltip to the hovered collage item', () => {
    const {editor, input} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id]),
      sizes: [{
        _: 'photoSize',
        type: 'x',
        w: 600,
        h: 400,
        size: 1
      }]
    }) as Photo.photo;
    expect(editor.insertRichMedia([
      {type: 'photo', photo: photo(213), previewUrl: 'blob:hover-first'},
      {type: 'photo', photo: photo(214), previewUrl: 'blob:hover-second'}
    ], {grouped: true})).toBe(true);

    const tooltip = input.querySelector<HTMLElement>('.chat-input-rich-media-tooltip');
    const buttons = tooltip?.querySelectorAll<HTMLButtonElement>('.btn-icon');
    const items = input.querySelectorAll<HTMLElement>('.chat-input-rich-media-item');
    expect(tooltip?.hidden).toBe(false);
    expect(buttons).toHaveLength(2);
    expect(buttons?.[0].getAttribute('aria-label')).toBe(I18n.format(
      'Chat.Input.Editor.Media.Replace',
      true
    ));
    expect(buttons?.[1].getAttribute('aria-label')).toBe(I18n.format(
      'Chat.Input.Editor.Media.Add',
      true
    ));

    items[1].dispatchEvent(new Event('pointerenter'));
    const requested = vi.fn();
    input.addEventListener('chat-input-rich-media-action', requested);
    const mouseDown = new MouseEvent('mousedown', {bubbles: true, cancelable: true});
    buttons?.[1].dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    buttons?.[1].click();
    buttons?.[0].click();

    expect(requested).toHaveBeenCalledTimes(2);
    expect((requested.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      action: 'add',
      activeIndex: 1
    });
    expect((requested.mock.calls[1][0] as CustomEvent).detail).toMatchObject({
      action: 'replace',
      activeIndex: 1
    });

    const canvas = input.querySelector<HTMLElement>('.chat-input-rich-media-canvas')!;
    const collageItems = canvas.querySelectorAll<HTMLElement>(
      `.${instantViewStyles.CollageItem}`
    );
    const getGap = () => {
      const layoutWidth = parseFloat(canvas.style.getPropertyValue('--width'));
      const layoutHeight = parseFloat(canvas.style.height);
      const firstRight = (
        parseFloat(collageItems[0].style.left) +
        parseFloat(collageItems[0].style.width)
      ) * layoutWidth / 100;
      const secondLeft = parseFloat(collageItems[1].style.left) * layoutWidth / 100;
      const firstBottom = (
        parseFloat(collageItems[0].style.top) +
        parseFloat(collageItems[0].style.height)
      ) * layoutHeight / 100;
      const secondTop = parseFloat(collageItems[1].style.top) * layoutHeight / 100;
      return [secondLeft - firstRight, secondTop - firstBottom].find((value) => (
        value >= 0
      ));
    };
    expect(getGap()).toBeCloseTo(2, 5);

    const media = input.querySelector<HTMLElement>('.chat-input-rich-media')!;
    const resizeObserver = resizeObserverInstances.find((observer) => (
      observer.observe.mock.calls.some(([target]) => target === media)
    ));
    expect(resizeObserver).not.toBeUndefined();
    resizeObserver!.callback([{
      contentRect: {width: 640},
      target: media
    } as unknown as ResizeObserverEntry], resizeObserver! as unknown as ResizeObserver);
    expect(parseFloat(canvas.style.getPropertyValue('--width'))).toBe(640);
    expect(getGap()).toBeCloseTo(2, 5);
  });

  test('replaces only the active slideshow item and prunes its old resource', () => {
    const {editor} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    const video = (id: number) => ({
      _: 'document',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id]),
      mime_type: 'video/mp4',
      attributes: []
    }) as Document.document;
    const firstPhoto = photo(221);
    const replacedVideo = video(222);
    const lastVideo = video(223);
    const replacement = photo(224);
    const emptyCaption = {
      _: 'pageCaption' as const,
      text: {_: 'textEmpty' as const},
      credit: {_: 'textEmpty' as const}
    };
    const caption = {
      _: 'pageCaption' as const,
      text: {_: 'textBold' as const, text: {_: 'textPlain' as const, text: 'Album'}},
      credit: {_: 'textItalic' as const, text: {_: 'textPlain' as const, text: 'Author'}}
    };

    expect(editor.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockSlideshow',
        items: [{
          _: 'pageBlockPhoto',
          pFlags: {spoiler: true},
          photo_id: firstPhoto.id,
          caption: emptyCaption
        }, {
          _: 'pageBlockVideo',
          pFlags: {spoiler: true},
          video_id: replacedVideo.id,
          caption: emptyCaption
        }, {
          _: 'pageBlockVideo',
          pFlags: {},
          video_id: lastVideo.id,
          caption: emptyCaption
        }],
        caption
      }],
      photos: [firstPhoto],
      documents: [replacedVideo, lastVideo]
    })).toBe(true);
    const tiptap = (editor as TiptapEditorInternals).editor;
    let mediaPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'richMedia') return;
      mediaPosition = position;
      return false;
    });

    expect(editor.replaceRichMediaItem(mediaPosition, 1, {
      type: 'photo',
      photo: replacement,
      spoiler: false,
      previewUrl: 'blob:replacement'
    })).toBe(true);

    const rich = editor.getRichMessage();
    const block = rich.input.blocks[0] as PageBlock.pageBlockSlideshow;
    expect(block._).toBe('pageBlockSlideshow');
    expect(block.items).toMatchObject([{
      _: 'pageBlockPhoto',
      pFlags: {spoiler: true},
      photo_id: firstPhoto.id
    }, {
      _: 'pageBlockPhoto',
      pFlags: {spoiler: undefined},
      photo_id: replacement.id
    }, {
      _: 'pageBlockVideo',
      pFlags: {},
      video_id: lastVideo.id
    }]);
    expect(block.caption).toEqual(caption);
    expect(rich.output.photos).toEqual([firstPhoto, replacement]);
    expect(rich.output.documents).toEqual([lastVideo]);
    const attrs = editor.getDocument().content?.[0].attrs;
    expect(attrs?.photos).toEqual([firstPhoto, replacement]);
    expect(attrs?.documents).toEqual([lastVideo]);
    expect(attrs?.previewUrl).toBe('');
    expect(attrs?.previewUrls).toEqual(['', 'blob:replacement', '']);
  });

  test('adds visual items after the active item while preserving the media layout and caption', () => {
    const {editor} = mountEditor();
    const photo = (id: number) => ({
      _: 'photo',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id])
    }) as Photo.photo;
    const video = (id: number) => ({
      _: 'document',
      id: String(id),
      access_hash: String(id + 100),
      file_reference: new Uint8Array([id]),
      mime_type: 'video/mp4',
      attributes: []
    }) as Document.document;
    const first = photo(231);
    const last = photo(232);
    const insertedVideo = video(233);
    const insertedPhoto = photo(234);

    expect(editor.insertRichMedia([
      {type: 'photo', photo: first, previewUrl: 'blob:first', spoiler: true},
      {type: 'photo', photo: last}
    ], {
      caption: 'Album',
      captionEntities: [{_: 'messageEntityBold', offset: 0, length: 5}],
      grouped: true
    })).toBe(true);
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

    expect(editor.addRichMediaItems(mediaPosition, 0, [{
      type: 'video',
      document: insertedVideo,
      spoiler: true,
      previewUrl: 'blob:inserted-video'
    }, {
      type: 'photo',
      photo: insertedPhoto,
      previewUrl: 'blob:inserted-photo'
    }])).toBe(true);

    const rich = editor.getRichMessage();
    const block = rich.input.blocks[0] as PageBlock.pageBlockSlideshow;
    expect(block._).toBe('pageBlockSlideshow');
    expect(block.items.map((item) => item._)).toEqual([
      'pageBlockPhoto',
      'pageBlockVideo',
      'pageBlockPhoto',
      'pageBlockPhoto'
    ]);
    expect(block.items).toMatchObject([{
      pFlags: {spoiler: true},
      photo_id: first.id
    }, {
      pFlags: {spoiler: true},
      video_id: insertedVideo.id
    }, {
      photo_id: insertedPhoto.id
    }, {
      photo_id: last.id
    }]);
    expect(block.caption.text).toEqual({
      _: 'textBold',
      text: {_: 'textPlain', text: 'Album'}
    });
    expect(rich.output.photos).toEqual([first, insertedPhoto, last]);
    expect(rich.output.documents).toEqual([insertedVideo]);
    expect(editor.getDocument().content?.[0].attrs?.previewUrl).toBe('blob:first');
    expect(editor.getDocument().content?.[0].attrs?.previewUrls).toEqual([
      'blob:first',
      'blob:inserted-video',
      'blob:inserted-photo',
      ''
    ]);
  });

  test('converts a single visual item to a collage on add and rejects audio item actions', async() => {
    const {editor, input} = mountEditor();
    const first = {
      _: 'photo',
      id: '241',
      access_hash: '341',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const second = {
      _: 'photo',
      id: '242',
      access_hash: '342',
      file_reference: new Uint8Array([2])
    } as Photo.photo;
    const audio = {
      _: 'document',
      id: '243',
      access_hash: '343',
      file_reference: new Uint8Array([3]),
      mime_type: 'audio/mpeg',
      attributes: []
    } as Document.document;

    expect(editor.insertRichMedia([{
      type: 'photo',
      photo: first,
      previewUrl: 'blob:first'
    }], {caption: 'Caption'})).toBe(true);
    let tiptap = (editor as TiptapEditorInternals).editor;
    let mediaPosition = -1;
    tiptap.state.doc.descendants((node, position) => {
      if(node.type.name !== 'richMedia') return;
      mediaPosition = position;
      return false;
    });
    expect(editor.addRichMediaItems(mediaPosition, 0, [{
      type: 'photo',
      photo: second
    }])).toBe(true);
    const block = editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockCollage;
    expect(block._).toBe('pageBlockCollage');
    expect(block.items.map((item) => item._)).toEqual([
      'pageBlockPhoto',
      'pageBlockPhoto'
    ]);
    expect(block.caption.text).toEqual({_: 'textPlain', text: 'Caption'});
    expect(editor.addRichMediaItems(mediaPosition, 0, [{
      type: 'audio',
      document: audio
    }])).toBe(false);

    expect(editor.setRichMessage({
      _: 'richMessage',
      pFlags: {},
      blocks: [{
        _: 'pageBlockAudio',
        audio_id: audio.id,
        caption: {
          _: 'pageCaption',
          text: {_: 'textEmpty'},
          credit: {_: 'textEmpty'}
        }
      }],
      photos: [],
      documents: [audio]
    })).toBe(true);
    tiptap = (editor as TiptapEditorInternals).editor;
    mediaPosition = 0;
    expect(editor.replaceRichMediaItem(mediaPosition, 0, {
      type: 'photo',
      photo: first
    })).toBe(false);
    expect(editor.addRichMediaItems(mediaPosition, 0, [{
      type: 'photo',
      photo: second
    }])).toBe(false);
    const labels = [
      I18n.format('Chat.Input.Editor.Media.Replace', true),
      I18n.format('Chat.Input.Editor.Media.Add', true)
    ];
    const menu = await openRichMediaMenu(input);
    expect(labels.every((label) => !richMediaMenuItem(menu, label))).toBe(true);
  });

  test('removing the active group item prunes resources and promotes the next preview', async() => {
    const {editor, input} = mountEditor();
    const first = {
      _: 'photo',
      id: '251',
      access_hash: '351',
      file_reference: new Uint8Array([1])
    } as Photo.photo;
    const second = {
      _: 'photo',
      id: '252',
      access_hash: '352',
      file_reference: new Uint8Array([2])
    } as Photo.photo;

    expect(editor.insertRichMedia([
      {type: 'photo', photo: first, previewUrl: 'blob:first'},
      {type: 'photo', photo: second, previewUrl: 'blob:second'}
    ], {grouped: true})).toBe(true);
    const removeLabel = I18n.format('Chat.Input.Editor.Media.Remove', true);
    const menu = await openRichMediaMenu(input);
    const removeButton = richMediaMenuItem(menu, removeLabel);
    expect(removeButton).not.toBeUndefined();
    removeButton!.click();

    const block = editor.getRichMessage().input.blocks[0] as PageBlock.pageBlockPhoto;
    expect(block._).toBe('pageBlockPhoto');
    expect(block.photo_id).toBe(second.id);
    expect(editor.getRichMessage().output.photos).toEqual([second]);
    const attrs = editor.getDocument().content?.[0].attrs;
    expect(attrs?.photos).toEqual([second]);
    expect(attrs?.documents).toEqual([]);
    expect(attrs?.previewUrl).toBe('blob:second');
    expect(attrs?.previewUrls).toEqual(['blob:second']);
  });

  test.each(['collage', 'slideshow'] as const)(
    'groups selected adjacent visual media as a %s and transfers its first caption through ungroup',
    (layout) => {
      const {editor} = mountEditor();
      const firstPhoto = {
        _: 'photo',
        id: '211',
        access_hash: '311',
        file_reference: new Uint8Array([1])
      } as Photo.photo;
      const secondPhoto = {
        _: 'photo',
        id: '212',
        access_hash: '312',
        file_reference: new Uint8Array([2])
      } as Photo.photo;
      const emptyCaption = {
        _: 'pageCaption' as const,
        text: {_: 'textEmpty' as const},
        credit: {_: 'textEmpty' as const}
      };
      const caption = {
        _: 'pageCaption' as const,
        text: {
          _: 'textBold' as const,
          text: {_: 'textPlain' as const, text: 'Album'}
        },
        credit: {
          _: 'textItalic' as const,
          text: {_: 'textPlain' as const, text: 'Photographer'}
        }
      };
      expect(editor.setRichMessage({
        _: 'richMessage',
        pFlags: {},
        blocks: [{
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: firstPhoto.id,
          caption
        }, {
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: secondPhoto.id,
          caption: emptyCaption
        }],
        photos: [firstPhoto, secondPhoto],
        documents: []
      })).toBe(true);
      const tiptap = (editor as TiptapEditorInternals).editor;
      tiptap.view.dispatch(
        tiptap.state.tr.setSelection(new AllSelection(tiptap.state.doc))
      );

      expect(editor.canGroupSelectedRichMedia()).toBe(true);
      expect(editor.groupSelectedRichMedia(layout)).toBe(true);
      expect(editor.canGroupSelectedRichMedia()).toBe(false);
      let blocks = editor.getRichMessage().input.blocks;
      expect(blocks).toHaveLength(1);
      const grouped = blocks[0] as
        PageBlock.pageBlockCollage |
        PageBlock.pageBlockSlideshow;
      expect(grouped._).toBe(
        layout === 'collage' ? 'pageBlockCollage' : 'pageBlockSlideshow'
      );
      expect(grouped.items.map((item) => item._)).toEqual([
        'pageBlockPhoto',
        'pageBlockPhoto'
      ]);
      expect(grouped.items.every((item) => (
        item._ === 'pageBlockPhoto' &&
        item.caption.text._ === 'textEmpty' &&
        item.caption.credit._ === 'textEmpty'
      ))).toBe(true);
      expect(grouped.caption).toEqual(caption);

      expect(editor.ungroupSelectedRichMedia()).toBe(true);
      blocks = editor.getRichMessage().input.blocks;
      expect(blocks.map((block) => block._)).toEqual([
        'pageBlockPhoto',
        'pageBlockPhoto'
      ]);
      expect((blocks[0] as PageBlock.pageBlockPhoto).caption).toEqual(caption);
      expect((blocks[1] as PageBlock.pageBlockPhoto).caption).toEqual(emptyCaption);
      expect(editor.getRichMessage().output.photos).toEqual([firstPhoto, secondPhoto]);
    }
  );
});
