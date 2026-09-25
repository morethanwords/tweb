import {Node, mergeAttributes} from '@tiptap/core';
import {NodeSelection} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {createComponent, createSignal, onCleanup} from 'solid-js';
import {render} from 'solid-js/web';
import {type ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import ButtonIcon from '@components/buttonIcon';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {
  applyInstantViewMediaSize,
  getMaximumHeightMediaSize,
  INSTANT_VIEW_MEDIA_MAX_HEIGHT,
  instantViewStyles
} from '@components/instantViewFormatting';
import prepareAlbum from '@components/prepareAlbum';
import ProgressivePreloader from '@components/preloader';
import {observeResize} from '@components/resizeObserver';
import SetTransition from '@components/singleTransition';
import Slideshow from '@components/slideshow';
import wrapMediaSpoiler, {concealMediaSpoilerWithAnimation, toggleMediaSpoiler} from '@components/wrappers/mediaSpoiler';
import {CHAT_INPUT_RICH_MEDIA_UPLOAD_UPDATE_EVENT, ChatInputRichMediaUploadUpdateEvent} from '@components/chat/inputEditor/events';
import {
  chatInputPlaceholderAttributes,
  setChatInputPlaceholder,
  setChatInputPlaceholderEmpty
} from '@components/chat/inputEditor/placeholders';
import type {ChatInputRichMediaUploadItem} from '@components/chat/inputEditor/types';
import {richTextPlainText} from '@components/chat/inputEditor/richMessage';
import {getRichMediaPreviewUrls, ungroupRichMediaNode} from '@components/chat/inputEditor/richMedia';
import {
  getRichMediaPreviewPoster,
  getRichMediaPreviewSideFill,
  getRichMediaPreviewSource,
  retainRichMediaPreviewUrl
} from '@components/chat/inputEditor/mediaPreviewUrl';
import {NULL_PEER_ID} from '@appManagers/constants';
import choosePhotoSize from '@appManagers/utils/photos/choosePhotoSize';
import contextMenuController from '@helpers/contextMenuController';
import classNames from '@helpers/string/classNames';
import toHHMMSS from '@helpers/string/toHHMMSS';
import ListenerSetter from '@helpers/listenerSetter';
import {getMiddleware} from '@helpers/middleware';
import type {Document, Message, PageBlock, Photo, RichText} from '@layer';
import I18n from '@lib/langPack';
import {
  parsedOpaqueRichBlock,
  richCaptionContentElement,
  opaqueRichBlockLabel,
  serializedOpaqueRichBlock
} from '@components/chat/inputEditor/extensions/richBlockSerialization';
import {renderReadonlyRichText} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

const RICH_MEDIA_UPLOAD_HIDE_DURATION = 200;

function parsedRichMedia(element: HTMLElement) {
  const parsed = parsedOpaqueRichBlock(element);
  const block = parsed && parsed.block as PageBlock | undefined;
  const captionCredit = block && (
    block._ === 'pageBlockAudio' ||
    block._ === 'pageBlockPhoto' ||
    block._ === 'pageBlockVideo' ||
    block._ === 'pageBlockCollage' ||
    block._ === 'pageBlockSlideshow'
  ) ? block.caption.credit : null;
  return parsed && {
    ...parsed,
    captionCredit,
    documents: [] as never[],
    photos: [] as never[],
    previewUrl: '',
    previewUrls: [] as string[]
  };
}

export const ChatRichMedia = Node.create({
  name: 'richMedia',
  group: 'block',
  content: 'inline*',
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      block: {default: null, rendered: false},
      captionCredit: {default: null, rendered: false},
      documents: {default: [], rendered: false},
      photos: {default: [], rendered: false},
      previewUrl: {default: '', rendered: false},
      previewUrls: {default: [], rendered: false},
      uploadAction: {default: '', rendered: false},
      uploadActiveIndex: {default: -1, rendered: false},
      uploadGrouped: {default: false, rendered: false},
      uploadId: {default: '', rendered: false},
      uploadItems: {default: [], rendered: false},
      uploadPreviewUrls: {default: [], rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-rich-media]',
      getAttrs: parsedRichMedia,
      contentElement: richCaptionContentElement
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const block = node.attrs.block;
    const label = opaqueRichBlockLabel(block);
    const credit = node.attrs.captionCredit as RichText | undefined;
    return ['figure', mergeAttributes(HTMLAttributes, {
      'class': 'chat-input-rich-media',
      'data-rich-block': serializedOpaqueRichBlock(block),
      'data-rich-media': ''
    }), [
      'div',
      {
        'aria-label': label,
        'class': 'chat-input-rich-media-preview',
        'contenteditable': 'false'
      },
      label
    ], [
      'figcaption',
      {
        'class': classNames(
          instantViewStyles.Padding,
          instantViewStyles.Caption,
          'chat-input-rich-media-caption'
        )
      },
      ['div', {
        'data-rich-caption': '',
        ...chatInputPlaceholderAttributes(I18n.format(
          'Chat.Input.Editor.Placeholder.Caption',
          true
        ), {className: instantViewStyles.CaptionText})
      }, 0],
      ['div', {
        'class': instantViewStyles.CaptionCredit,
        'contenteditable': 'false'
      }, credit ? richTextPlainText(credit) : '']
    ]];
  },

  renderText({node}) {
    return `[${opaqueRichBlockLabel(node.attrs.block)}]`;
  },

  addNodeView() {
    return ({editor, getPos, node: initialNode}) => {
      let node = initialNode;
      let activeIndex = 0;
      let destroyed = false;
      let mediaLayoutGeneration = 0;
      let mediaLayoutResizeDispose: VoidFunction;
      let mediaTooltipTargetIndex = 0;
      let liveUploadItems = initialNode.attrs.uploadItems as ChatInputRichMediaUploadItem[] || [];
      const [slideshowActiveIndex, setSlideshowActiveIndex] = createSignal(0);
      let mediaVisualDispose: (() => void) | undefined;
      const mediaMiddleware = getMiddleware();
      const nodeViewListenerSetter = new ListenerSetter();
      const renderedUploadStates = new Map<HTMLElement, {
        actions?: HTMLElement,
        id: string,
        overlay: HTMLElement,
        preloader?: ProgressivePreloader,
        progress?: number,
        removeTimeout?: number,
        state: ChatInputRichMediaUploadItem['state']
      }>();
      const dom = document.createElement('figure');
      const preview = document.createElement('div');
      const mediaCanvas = document.createElement('div');
      const mediaTooltip = document.createElement('div');
      const mediaTooltipWrapper = document.createElement('div');
      const mediaTooltipTools = document.createElement('div');
      const mediaReplaceButton = ButtonIcon('replace_circles', {noRipple: true});
      const mediaAddButton = ButtonIcon('image_add', {noRipple: true});
      const caption = document.createElement('figcaption');
      const contentDOM = document.createElement('div');
      contentDOM.dataset.richCaption = '';
      const credit = document.createElement('div');
      dom.className = 'chat-input-rich-media';
      dom.dataset.richMedia = '';
      if(node.attrs.uploadId) dom.dataset.uploadId = `${node.attrs.uploadId}`;
      preview.className = 'chat-input-rich-media-preview';
      preview.contentEditable = 'false';
      mediaCanvas.className = 'chat-input-rich-media-canvas';
      mediaTooltip.className = classNames(
        'markup-tooltip',
        'markup-tooltip-contextual',
        'chat-input-rich-media-tooltip'
      );
      mediaTooltip.contentEditable = 'false';
      mediaTooltip.hidden = true;
      mediaTooltipWrapper.className = 'markup-tooltip-wrapper';
      mediaTooltipTools.className = 'markup-tooltip-tools';
      const replaceLabel = I18n.format('Chat.Input.Editor.Media.Replace', true);
      const addLabel = I18n.format('Chat.Input.Editor.Media.Add', true);
      mediaReplaceButton.setAttribute('aria-label', replaceLabel);
      mediaReplaceButton.title = replaceLabel;
      mediaAddButton.setAttribute('aria-label', addLabel);
      mediaAddButton.title = addLabel;
      mediaTooltipTools.append(mediaReplaceButton, mediaAddButton);
      mediaTooltipWrapper.append(mediaTooltipTools);
      mediaTooltip.append(mediaTooltipWrapper);
      caption.className = classNames(
        instantViewStyles.Padding,
        instantViewStyles.Caption,
        'chat-input-rich-media-caption'
      );
      contentDOM.className = instantViewStyles.CaptionText;
      setChatInputPlaceholder(contentDOM, I18n.format(
        'Chat.Input.Editor.Placeholder.Caption',
        true
      ), !node.content.size);
      credit.className = instantViewStyles.CaptionCredit;
      credit.contentEditable = 'false';
      caption.append(contentDOM, credit);
      preview.append(mediaCanvas, mediaTooltip);
      dom.append(preview, caption);

      type MediaPageBlock =
        PageBlock.pageBlockAudio |
        PageBlock.pageBlockPhoto |
        PageBlock.pageBlockVideo;

      type RenderedMediaEntry = {
        aggregateUpload: boolean,
        item: MediaPageBlock,
        previewUrl: string,
        record?: RenderedMediaItem,
        sourceIndex?: number,
        uploadIndex?: number
      };

      type RenderedMediaItem = {
        aggregateUpload: boolean,
        destroyed?: boolean,
        element: HTMLElement,
        entry: RenderedMediaEntry,
        itemType: MediaPageBlock['_'],
        listenerSetter: ListenerSetter,
        mediaSpoiler?: HTMLElement,
        middleware: ReturnType<typeof getMiddleware>,
        moreButton: HTMLElement,
        pendingAudioDocument?: Document.document,
        releasePreviewUrl?: () => void,
        sourceIndex?: number,
        spoilerGeneration: number,
        uploadIndex?: number,
        videoTime?: HTMLElement,
        visual: HTMLElement
      };

      let renderedItems: RenderedMediaItem[] = [];
      let renderedLayout: 'collage' | 'single' | 'slideshow';
      const [slideshowEntries, setSlideshowEntries] = createSignal<RenderedMediaEntry[]>([]);

      function cleanupRenderedItem(record: RenderedMediaItem) {
        if(record.destroyed) return;
        record.destroyed = true;
        ++record.spoilerGeneration;
        if(record.entry.record === record) record.entry.record = undefined;
        removeUploadState(record.element);
        record.listenerSetter.removeAll();
        record.middleware.destroy();
        record.releasePreviewUrl?.();
        record.releasePreviewUrl = undefined;
        const index = renderedItems.indexOf(record);
        if(index !== -1) renderedItems.splice(index, 1);
      }

      function mediaItems(block: PageBlock | undefined): MediaPageBlock[] {
        if(block?._ === 'pageBlockCollage' || block?._ === 'pageBlockSlideshow') {
          return block.items as MediaPageBlock[];
        }
        return (
          block?._ === 'pageBlockAudio' ||
          block?._ === 'pageBlockPhoto' ||
          block?._ === 'pageBlockVideo'
        ) ? [block] : [];
      }

      function mediaResource(item: MediaPageBlock | undefined) {
        if(item?._ === 'pageBlockPhoto') {
          return (node.attrs.photos as Photo.photo[] || []).find((photo) => (
            String(photo.id) === String(item.photo_id)
          ));
        }
        if(item?._ === 'pageBlockVideo') {
          return (node.attrs.documents as Document.document[] || []).find((document) => (
            String(document.id) === String(item.video_id)
          ));
        }
      }

      function isRenderedMediaItemPending(record: RenderedMediaItem | undefined) {
        return !!record && (
          record.aggregateUpload ||
          record.uploadIndex !== undefined
        );
      }

      function updateMediaTooltipAvailability() {
        const item = mediaItems(node.attrs.block as PageBlock)[mediaTooltipTargetIndex];
        const record = renderedItems.find((candidate) => (
          candidate.sourceIndex === mediaTooltipTargetIndex
        ));
        const unavailable = (
          isRenderedMediaItemPending(record) ||
          item?._ !== 'pageBlockPhoto' && item?._ !== 'pageBlockVideo'
        );
        if(mediaTooltip.hidden !== unavailable) mediaTooltip.hidden = unavailable;
        if(mediaReplaceButton.disabled !== unavailable) {
          mediaReplaceButton.disabled = unavailable;
        }
        if(mediaAddButton.disabled !== unavailable) mediaAddButton.disabled = unavailable;
      }

      function setMediaTooltipTarget(itemIndex: number) {
        const items = mediaItems(node.attrs.block as PageBlock);
        if(itemIndex < 0 || itemIndex >= items.length) return;
        mediaTooltipTargetIndex = itemIndex;
        updateMediaTooltipAvailability();
      }

      function removeRenderedMediaSpoiler(
        record: RenderedMediaItem,
        animated: boolean
      ) {
        ++record.spoilerGeneration;
        const {mediaSpoiler} = record;
        record.mediaSpoiler = undefined;
        if(!mediaSpoiler) return;
        if(animated) {
          toggleMediaSpoiler({
            mediaSpoiler,
            reveal: true,
            destroyAfter: true
          });
          return;
        }
        mediaSpoiler.remove();
        mediaSpoiler.middlewareHelper?.destroy();
      }

      function syncRenderedMediaSpoiler(
        record: RenderedMediaItem,
        item: MediaPageBlock | undefined,
        animated = false
      ) {
        const enabled = (
          item?._ === 'pageBlockPhoto' ||
          item?._ === 'pageBlockVideo'
        ) && !!item.pFlags.spoiler;
        if(!enabled) {
          removeRenderedMediaSpoiler(record, animated);
          return;
        }
        if(record.mediaSpoiler?.isConnected) return;

        const generation = ++record.spoilerGeneration;
        const size = mediaItemSize(item);
        const width = Math.max(1, record.element.clientWidth || Math.min(size.w, 480));
        const height = Math.max(
          1,
          record.element.clientHeight || width * size.h / size.w
        );
        const middleware = record.middleware.get();
        void wrapMediaSpoiler({
          animationGroup: 'chat',
          decorative: true,
          height,
          media: mediaResource(item),
          middleware,
          multiply: .3,
          previewUrl: record.entry.previewUrl,
          waitForReady: false,
          width
        }).then((mediaSpoiler) => {
          if(
            !mediaSpoiler ||
            record.destroyed ||
            generation !== record.spoilerGeneration ||
            !middleware()
          ) {
            mediaSpoiler?.remove();
            mediaSpoiler?.middlewareHelper?.destroy();
            return;
          }
          mediaSpoiler.contentEditable = 'false';
          record.mediaSpoiler = mediaSpoiler;
          if(animated) {
            void concealMediaSpoilerWithAnimation({
              mediaSpoiler,
              canAnimate: () => (
                !record.destroyed &&
                generation === record.spoilerGeneration &&
                record.mediaSpoiler === mediaSpoiler &&
                middleware()
              )
            });
          }
          record.element.insertBefore(mediaSpoiler, record.moreButton);
        }).catch((error) => {
          console.error('rich message media spoiler render error', error);
        });
      }

      function updateRenderedVideoTime(
        record: RenderedMediaItem,
        uploadItem?: ChatInputRichMediaUploadItem,
        measuredDuration?: number
      ) {
        if(record.itemType !== 'pageBlockVideo') {
          record.videoTime?.remove();
          record.videoTime = undefined;
          return;
        }
        const item = record.entry.item;
        const media = mediaResource(item) as Document.document | undefined;
        const attribute = media?.attributes?.find((candidate) => (
          candidate._ === 'documentAttributeVideo'
        ));
        const duration = Math.max(0, Math.floor(
          measuredDuration ||
          uploadItem?.duration ||
          media?.duration ||
          (attribute?._ === 'documentAttributeVideo' ? attribute.duration : 0) ||
          0
        ));
        const label = media?.type === 'gif' ? 'GIF' : duration ? toHHMMSS(duration, false) : '';
        if(!label) {
          record.videoTime?.remove();
          record.videoTime = undefined;
          return;
        }
        if(!record.videoTime) {
          record.videoTime = document.createElement('span');
          record.videoTime.className = 'video-time';
          record.element.insertBefore(record.videoTime, record.moreButton);
        }
        if(record.videoTime.textContent !== label) record.videoTime.textContent = label;
      }

      function resourcesForItems(items: MediaPageBlock[]) {
        const photosById = new Map((node.attrs.photos as Photo.photo[] || []).map((photo) => (
          [String(photo.id), photo]
        )));
        const documentsById = new Map((
          node.attrs.documents as Document.document[] || []
        ).map((document) => [String(document.id), document]));
        const seenPhotoIds = new Set<string>();
        const seenDocumentIds = new Set<string>();
        const photos: Photo.photo[] = [];
        const documents: Document.document[] = [];
        items.forEach((item) => {
          if(item._ === 'pageBlockPhoto') {
            const id = String(item.photo_id);
            const photo = photosById.get(id);
            if(photo && !seenPhotoIds.has(id)) {
              seenPhotoIds.add(id);
              photos.push(photo);
            }
            return;
          }
          const id = String(
            item._ === 'pageBlockVideo' ? item.video_id : item.audio_id
          );
          const document = documentsById.get(id);
          if(document && !seenDocumentIds.has(id)) {
            seenDocumentIds.add(id);
            documents.push(document);
          }
        });
        return {documents, photos};
      }

      function setBlock(
        block: PageBlock,
        previewUrls = getRichMediaPreviewUrls(
          node,
          mediaItems(node.attrs.block as PageBlock).length
        )
      ) {
        const position = getPos();
        if(typeof(position) !== 'number') return;
        const resources = resourcesForItems(mediaItems(block));
        editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(position, undefined, {
          ...node.attrs,
          block,
          ...resources,
          previewUrl: previewUrls[0] || '',
          previewUrls
        }));
        editor.view.focus();
      }

      function requestMedia(action: 'add' | 'replace', itemIndex: number) {
        const position = getPos();
        const item = mediaItems(node.attrs.block as PageBlock)[itemIndex];
        if(
          typeof(position) !== 'number' ||
          item?._ !== 'pageBlockPhoto' && item?._ !== 'pageBlockVideo'
        ) return;
        dom.dispatchEvent(new CustomEvent('chat-input-rich-media-action', {
          bubbles: true,
          detail: {
            action,
            activeIndex: itemIndex,
            from: position,
            to: position + node.nodeSize
          }
        }));
      }

      function requestMediaEdit(record: RenderedMediaItem) {
        const position = getPos();
        const itemIndex = record.sourceIndex;
        const item = itemIndex === undefined ?
          undefined :
          mediaItems(node.attrs.block as PageBlock)[itemIndex];
        const media = mediaResource(item);
        if(
          typeof(position) !== 'number' ||
          itemIndex === undefined ||
          !media ||
          item?._ !== 'pageBlockPhoto' && item?._ !== 'pageBlockVideo'
        ) return;
        const sourceElement = record.element.querySelector<
          HTMLImageElement | HTMLVideoElement
        >([
          '.media-container-aspecter .media-video',
          '.media-container-aspecter .media-photo',
          '.media-video:not(.chat-input-rich-media-side-fill)',
          '.media-photo:not(.chat-input-rich-media-side-fill)'
        ].join(','));
        const block = node.attrs.block as PageBlock;
        dom.dispatchEvent(new CustomEvent('chat-input-rich-media-action', {
          bubbles: true,
          detail: {
            action: 'edit',
            activeIndex: itemIndex,
            from: position,
            grouped: block?._ === 'pageBlockCollage' || block?._ === 'pageBlockSlideshow',
            media,
            previewUrl: record.entry.previewUrl,
            sourceElement,
            to: position + node.nodeSize
          }
        }));
      }

      [mediaReplaceButton, mediaAddButton].forEach((button) => {
        nodeViewListenerSetter.add(button)('mousedown', (event) => {
          event.preventDefault();
        });
      });
      nodeViewListenerSetter.add(mediaReplaceButton)('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestMedia('replace', mediaTooltipTargetIndex);
      });
      nodeViewListenerSetter.add(mediaAddButton)('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestMedia('add', mediaTooltipTargetIndex);
      });
      nodeViewListenerSetter.add(preview)('pointerenter', () => {
        setMediaTooltipTarget(activeIndex);
      });

      function toggleItemSpoiler(itemIndex: number) {
        const block = node.attrs.block as PageBlock;
        const items = mediaItems(block);
        const item = items[itemIndex];
        if(item?._ !== 'pageBlockPhoto' && item?._ !== 'pageBlockVideo') return;
        const nextItem = {
          ...item,
          pFlags: {
            ...item.pFlags,
            spoiler: item.pFlags.spoiler ? undefined : true as const
          }
        };
        if(block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow') {
          setBlock({
            ...block,
            items: block.items.map((candidate, index) => (
              index === itemIndex ? nextItem : candidate
            ))
          });
        } else {
          setBlock(nextItem);
        }
      }

      function removeItem(itemIndex: number) {
        const position = getPos();
        if(typeof(position) !== 'number') return;
        const block = node.attrs.block as PageBlock;
        const items = mediaItems(block);
        if(itemIndex < 0 || itemIndex >= items.length) return;
        if(block._ === 'pageBlockCollage' || block._ === 'pageBlockSlideshow') {
          const remaining = block.items.filter((_item, index) => index !== itemIndex);
          const previewUrls = getRichMediaPreviewUrls(node, block.items.length);
          previewUrls.splice(itemIndex, 1);
          activeIndex = Math.max(0, Math.min(itemIndex, remaining.length - 1));
          if(remaining.length > 1) {
            setBlock({...block, items: remaining}, previewUrls);
          } else if(remaining.length === 1) {
            setBlock(remaining[0], previewUrls);
          } else {
            editor.view.dispatch(editor.state.tr.delete(position, position + node.nodeSize));
          }
          return;
        }
        editor.view.dispatch(editor.state.tr.delete(position, position + node.nodeSize));
        editor.view.focus();
      }

      function ungroupMedia() {
        const position = getPos();
        if(typeof(position) !== 'number') return;
        const nodes = ungroupRichMediaNode(editor.schema.nodes.richMedia, node);
        if(!nodes?.length) return;
        const transaction = editor.state.tr.replaceWith(
          position,
          position + node.nodeSize,
          nodes
        );
        transaction.setSelection(NodeSelection.create(transaction.doc, position));
        editor.view.dispatch(
          transaction.scrollIntoView()
        );
        editor.view.focus();
      }

      function setActiveItem(
        itemIndex: number,
        itemCount = mediaItems(node.attrs.block as PageBlock).length
      ) {
        if(itemIndex < 0 || itemIndex >= itemCount) return;
        activeIndex = itemIndex;
        setMediaTooltipTarget(itemIndex);
        setSlideshowActiveIndex(itemIndex);
        renderedItems.forEach((record) => {
          record.element.toggleAttribute(
            'data-active',
            Number(record.element.dataset.index) === activeIndex
          );
        });
      }

      function moveActiveItem(itemIndex: number, offset: -1 | 1) {
        const items = mediaItems(node.attrs.block as PageBlock);
        if(items.length < 2) return;
        setActiveItem((itemIndex + items.length + offset) % items.length);
      }

      function setMediaLayout(layout: 'collage' | 'slideshow') {
        const position = getPos();
        const block = node.attrs.block as PageBlock | undefined;
        if(
          typeof(position) !== 'number' ||
          block?._ !== 'pageBlockCollage' && block?._ !== 'pageBlockSlideshow'
        ) return;
        const type = layout === 'collage' ? 'pageBlockCollage' : 'pageBlockSlideshow';
        if(block._ === type) return;

        editor.view.dispatch(editor.state.tr.setNodeMarkup(position, undefined, {
          ...node.attrs,
          block: {...block, _: type}
        }));
        editor.view.focus();
      }

      const moreLabel = I18n.format('MultiAccount.More', true);

      function mediaMenuButtons(record: RenderedMediaItem): ButtonMenuItemOptionsVerifiable[] {
        const itemIndex = () => record.sourceIndex;
        const visualItem = () => {
          const index = itemIndex();
          return index === undefined ?
            undefined :
            mediaItems(node.attrs.block as PageBlock)[index];
        };
        return [{
          icon: 'arrow_prev',
          text: 'Chat.Input.Editor.Media.Previous',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) moveActiveItem(index, -1);
          },
          verify: () => (
            itemIndex() !== undefined &&
            (node.attrs.block as PageBlock)?._ === 'pageBlockSlideshow' &&
            mediaItems(node.attrs.block as PageBlock).length > 1
          )
        }, {
          icon: 'arrow_next',
          text: 'Chat.Input.Editor.Media.Next',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) moveActiveItem(index, 1);
          },
          verify: () => (
            itemIndex() !== undefined &&
            (node.attrs.block as PageBlock)?._ === 'pageBlockSlideshow' &&
            mediaItems(node.attrs.block as PageBlock).length > 1
          )
        }, {
          icon: 'edit',
          text: 'Chat.Input.Editor.Media.Edit',
          onClick: () => requestMediaEdit(record),
          verify: () => {
            const item = visualItem();
            return item?._ === 'pageBlockPhoto' || item?._ === 'pageBlockVideo';
          }
        }, {
          icon: 'replace_circles',
          text: 'Chat.Input.Editor.Media.Replace',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) requestMedia('replace', index);
          },
          verify: () => {
            const item = visualItem();
            return item?._ === 'pageBlockPhoto' || item?._ === 'pageBlockVideo';
          }
        }, {
          icon: 'image_add',
          text: 'Chat.Input.Editor.Media.Add',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) requestMedia('add', index);
          },
          verify: () => {
            const item = visualItem();
            return item?._ === 'pageBlockPhoto' || item?._ === 'pageBlockVideo';
          }
        }, {
          icon: 'spoiler',
          text: 'Chat.Input.Editor.Media.Spoiler',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) toggleItemSpoiler(index);
          },
          verify: () => {
            const item = visualItem();
            return item?._ === 'pageBlockPhoto' || item?._ === 'pageBlockVideo';
          }
        }, {
          icon: 'group',
          text: 'Chat.Input.Editor.Media.Ungroup',
          onClick: () => ungroupMedia(),
          verify: () => {
            // Keep Ungroup hidden until the editor exposes the inverse Group Media action.
            return false;
          }
        }, {
          icon: 'carousel',
          text: 'Chat.Input.Editor.Toolbar.ShowAsSlideshow',
          onClick: () => setMediaLayout('slideshow'),
          verify: () => (
            itemIndex() !== undefined &&
            (node.attrs.block as PageBlock)?._ === 'pageBlockCollage'
          )
        }, {
          icon: 'table',
          text: 'Chat.Input.Editor.Toolbar.ShowAsCollage',
          onClick: () => setMediaLayout('collage'),
          verify: () => (
            itemIndex() !== undefined &&
            (node.attrs.block as PageBlock)?._ === 'pageBlockSlideshow'
          )
        }, {
          danger: true,
          icon: 'image_crossed',
          separator: true,
          text: 'Chat.Input.Editor.Media.Remove',
          onClick: () => {
            const index = itemIndex();
            if(index !== undefined) removeItem(index);
          },
          verify: () => itemIndex() !== undefined
        }];
      }

      function attachMediaMenu(record: RenderedMediaItem) {
        const {moreButton} = record;
        moreButton.classList.add('chat-input-rich-media-more');
        moreButton.contentEditable = 'false';
        moreButton.hidden = (
          record.sourceIndex === undefined ||
          isRenderedMediaItemPending(record)
        );
        moreButton.setAttribute('aria-label', moreLabel);
        moreButton.title = moreLabel;
        ButtonMenuToggle({
          buttons: mediaMenuButtons(record),
          container: moreButton,
          direction: 'bottom-left',
          floatingDirection: 'bottom-end',
          listenerSetter: record.listenerSetter,
          onOpenBefore: () => {
            if(record.sourceIndex !== undefined) {
              setActiveItem(record.sourceIndex);
            }
          }
        });
      }

      function requestUploadAction(action: 'remove' | 'retry') {
        const uploadId = `${node.attrs.uploadId || ''}`;
        if(!uploadId) return;
        dom.dispatchEvent(new CustomEvent('chat-input-rich-media-upload-action', {
          bubbles: true,
          detail: {action, uploadId}
        }));
      }

      function aggregateUploadItems(items: ChatInputRichMediaUploadItem[]) {
        if(!items.length) return;
        const state = items.some((item) => item.state === 'error') ? 'error' :
          items.some((item) => item.state === 'preparing') ? 'preparing' :
          items.some((item) => item.state === 'uploading') ? 'uploading' :
          items.some((item) => item.state === 'processing') ? 'processing' :
          'ready';
        return {
          id: items.map((item) => item.id).join(':'),
          progress: items.reduce((sum, item) => sum + item.progress, 0) / items.length,
          state,
          type: items[0].type
        } as ChatInputRichMediaUploadItem;
      }

      function removeUploadState(container: HTMLElement) {
        const rendered = renderedUploadStates.get(container);
        if(!rendered) return;
        if(rendered.removeTimeout !== undefined) {
          container.ownerDocument.defaultView?.clearTimeout(rendered.removeTimeout);
        }
        rendered.preloader && (rendered.preloader.promise = null);
        rendered.overlay.remove();
        renderedUploadStates.delete(container);
      }

      function finishUploadState(
        container: HTMLElement,
        rendered: NonNullable<ReturnType<typeof renderedUploadStates.get>>
      ) {
        if(rendered.state === 'ready') return;
        rendered.state = 'ready';
        rendered.overlay.dataset.state = 'ready';
        if(rendered.actions) rendered.actions.hidden = true;
        if(rendered.preloader) {
          const {preloader} = rendered;
          preloader.promise = null;
          preloader.preloader.hidden = false;
          preloader.preloader.setAttribute('aria-valuenow', '100');
          preloader.preloader.setAttribute('aria-label', '100%');
          preloader.setProgress(100);
          preloader.preloader.classList.add(
            'chat-input-rich-media-upload-progress-complete'
          );
          SetTransition({
            element: preloader.preloader,
            className: 'is-visible',
            forwards: false,
            duration: RICH_MEDIA_UPLOAD_HIDE_DURATION
          });
        }
        const appWindow = container.ownerDocument.defaultView;
        if(!appWindow) return;
        rendered.removeTimeout = appWindow.setTimeout(() => {
          if(renderedUploadStates.get(container) === rendered) {
            removeUploadState(container);
          }
        }, RICH_MEDIA_UPLOAD_HIDE_DURATION);
      }

      function updateUploadState(
        container: HTMLElement,
        item: ChatInputRichMediaUploadItem | undefined
      ) {
        let rendered = renderedUploadStates.get(container);
        if(rendered && item && rendered.id !== item.id) {
          removeUploadState(container);
          rendered = undefined;
        }
        if(item?.state === 'ready') {
          if(rendered) finishUploadState(container, rendered);
          return;
        }
        if(!item) {
          if(rendered?.state !== 'ready') removeUploadState(container);
          return;
        }

        if(!rendered) {
          const overlay = document.createElement('div');
          overlay.className = 'chat-input-rich-media-upload';
          container.append(overlay);
          rendered = {
            id: item.id,
            overlay,
            state: item.state
          };
          renderedUploadStates.set(container, rendered);
        }
        const {overlay} = rendered;
        const stateChanged = (
          rendered.state !== item.state ||
          !overlay.dataset.state
        );
        if(stateChanged) overlay.dataset.state = item.state;

        if(item.state === 'error') {
          if(rendered.preloader && !rendered.preloader.preloader.hidden) {
            rendered.preloader.preloader.hidden = true;
          }
          if(!rendered.actions) {
            const actions = rendered.actions = document.createElement('div');
            const retry = document.createElement('button');
            const remove = document.createElement('button');
            actions.className = 'chat-input-rich-media-upload-actions';
            retry.type = remove.type = 'button';
            retry.className = remove.className = 'chat-input-rich-media-upload-action';
            retry.textContent = I18n.format('RichMessage.Upload.Retry', true);
            remove.textContent = I18n.format('Remove', true);
            [retry, remove].forEach((button) => {
              button.contentEditable = 'false';
              button.addEventListener('mousedown', (event) => event.preventDefault());
            });
            retry.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              requestUploadAction('retry');
            });
            remove.addEventListener('click', (event) => {
              event.preventDefault();
              event.stopPropagation();
              requestUploadAction('remove');
            });
            actions.append(retry, remove);
            overlay.append(actions);
          }
          if(rendered.actions.hidden) rendered.actions.hidden = false;
          rendered.state = item.state;
          return;
        }

        if(rendered.actions && !rendered.actions.hidden) rendered.actions.hidden = true;
        if(!rendered.preloader) {
          const preloader = rendered.preloader = new ProgressivePreloader({
            attachMethod: 'prepend',
            isUpload: true
          });
          preloader.promise = {
            cancel: () => requestUploadAction('remove')
          } as ProgressivePreloader['promise'];
          preloader.attach(overlay, false, undefined, 0);
          preloader.preloader.classList.add(
            'chat-input-rich-media-upload-progress',
            'preloader-swing'
          );
          preloader.preloader.setAttribute('role', 'progressbar');
          preloader.preloader.setAttribute('aria-valuemin', '0');
          preloader.preloader.setAttribute('aria-valuemax', '100');
        }
        if(rendered.preloader.preloader.hidden) {
          rendered.preloader.preloader.hidden = false;
        }
        const progress = Math.max(0, Math.min(1, item.progress || 0));
        const percent = Math.round(progress * 100);
        const {preloader} = rendered;
        const progressChanged = rendered.progress !== percent;
        if(progressChanged) {
          preloader.preloader.setAttribute('aria-valuenow', `${percent}`);
          preloader.setProgress(percent);
        }
        if(stateChanged || progressChanged) {
          preloader.preloader.setAttribute(
            'aria-label',
            item.state === 'preparing' ?
              I18n.format('RichMessage.Upload.Preparing', true) :
              item.state === 'processing' ?
                I18n.format('RichMessage.Upload.Processing', true) :
                `${percent}%`
          );
        }
        rendered.progress = percent;
        rendered.state = item.state;
      }

      function updateUploadStateForRecord(
        record: RenderedMediaItem,
        uploadItems = liveUploadItems
      ) {
        const uploadItem = record.aggregateUpload ?
          aggregateUploadItems(uploadItems) :
          record.uploadIndex === undefined ?
            undefined :
            uploadItems[record.uploadIndex];
        const pendingAudioDocument = record.pendingAudioDocument;
        if(pendingAudioDocument && uploadItem) {
          if(Number.isFinite(uploadItem.duration)) {
            const duration = Math.max(0, Math.floor(uploadItem.duration));
            pendingAudioDocument.duration = duration;
            const attribute = pendingAudioDocument.attributes?.find((candidate) => (
              candidate._ === 'documentAttributeAudio'
            ));
            if(attribute?._ === 'documentAttributeAudio') attribute.duration = duration;
            const time = record.element.querySelector<HTMLElement>('.audio-time');
            if(time) time.textContent = toHHMMSS(duration);
          }
          if(uploadItem.fileName) {
            pendingAudioDocument.file_name = uploadItem.fileName;
            const attribute = pendingAudioDocument.attributes?.find((candidate) => (
              candidate._ === 'documentAttributeFilename'
            ));
            if(attribute?._ === 'documentAttributeFilename') {
              attribute.file_name = uploadItem.fileName;
            }
          }
          if(Number.isFinite(uploadItem.fileSize)) {
            pendingAudioDocument.size = Math.max(0, uploadItem.fileSize);
          }
          if(uploadItem.mimeType) {
            pendingAudioDocument.mime_type = uploadItem.mimeType as MTMimeType;
          }
        }
        updateRenderedVideoTime(record, uploadItem);
        updateUploadState(
          record.element,
          uploadItem
        );
      }

      function updateUploadStateOverlays() {
        const uploadItems = liveUploadItems;
        renderedItems.forEach((record) => {
          updateUploadStateForRecord(record, uploadItems);
        });
      }

      function pendingUploadMediaItem(
        item: ChatInputRichMediaUploadItem,
        index: number
      ): MediaPageBlock {
        const resourceId = `upload-${node.attrs.uploadId}-${item.id}-${index}` as Long;
        const caption = {
          _: 'pageCaption' as const,
          credit: {_: 'textEmpty' as const},
          text: {_: 'textEmpty' as const}
        };
        if(item.type === 'audio') {
          return {
            _: 'pageBlockAudio',
            audio_id: resourceId,
            caption
          };
        }
        return item.type === 'video' ? {
          _: 'pageBlockVideo',
          pFlags: {},
          video_id: resourceId,
          caption
        } : {
          _: 'pageBlockPhoto',
          pFlags: {},
          photo_id: resourceId,
          caption
        };
      }

      function mediaItemSize(
        item: MediaPageBlock,
        uploadItem?: ChatInputRichMediaUploadItem
      ) {
        const uploadWidth = uploadItem?.width;
        const uploadHeight = uploadItem?.height;
        if(
          Number.isFinite(uploadWidth) &&
          uploadWidth > 0 &&
          Number.isFinite(uploadHeight) &&
          uploadHeight > 0
        ) {
          return {w: uploadWidth, h: uploadHeight};
        }
        if(item?._ === 'pageBlockPhoto') {
          const photo = (node.attrs.photos as Photo.photo[]).find((candidate) => (
            String(candidate.id) === String(item.photo_id)
          ));
          const size = photo && choosePhotoSize(photo, 480, 480);
          if(size && 'w' in size && 'h' in size && size.w > 0 && size.h > 0) {
            return {w: size.w, h: size.h};
          }
        } else if(item?._ === 'pageBlockVideo') {
          const document = (node.attrs.documents as Document.document[]).find((candidate) => (
            String(candidate.id) === String(item.video_id)
          ));
          const sizedDocument = document as Document.document & {w?: number, h?: number};
          const attribute = document?.attributes?.find((candidate) => (
            candidate._ === 'documentAttributeVideo'
          ));
          const width = sizedDocument?.w || (
            attribute?._ === 'documentAttributeVideo' ? attribute.w : 0
          );
          const height = sizedDocument?.h || (
            attribute?._ === 'documentAttributeVideo' ? attribute.h : 0
          );
          if(width > 0 && height > 0) return {w: width, h: height};
        }
        return {w: 3, h: 2};
      }

      function mediaEntryUploadItem(
        entry: RenderedMediaEntry | undefined,
        uploadItems = liveUploadItems
      ) {
        if(!entry) return;
        if(entry.aggregateUpload) return uploadItems[0];
        if(entry.uploadIndex !== undefined) return uploadItems[entry.uploadIndex];
      }

      function mediaEntrySize(
        entry: RenderedMediaEntry,
        uploadItems = liveUploadItems
      ) {
        return mediaItemSize(entry.item, mediaEntryUploadItem(entry, uploadItems));
      }

      function mediaViewport(size: {w: number, h: number}) {
        const width = 480;
        return {
          height: Math.min(INSTANT_VIEW_MEDIA_MAX_HEIGHT, width * size.h / size.w),
          width
        };
      }

      function slideshowAspectRatio(
        entries: RenderedMediaEntry[],
        uploadItems = liveUploadItems
      ) {
        const maximumSize = getMaximumHeightMediaSize(entries.map((entry) => {
          const size = mediaEntrySize(entry, uploadItems);
          return {height: size.h, width: size.w};
        }));
        return maximumSize ? maximumSize.width / maximumSize.height : 16 / 9;
      }

      function appendLocalMedia(
        container: HTMLElement,
        media: HTMLImageElement | HTMLVideoElement,
        preparedSideFill?: HTMLImageElement
      ) {
        const background = preparedSideFill || (
          media.cloneNode() as HTMLImageElement | HTMLVideoElement
        );
        const aspecter = document.createElement('div');
        background.classList.add(
          background instanceof HTMLVideoElement ? 'media-video' : 'media-photo',
          'chat-input-rich-media-side-fill'
        );
        background.setAttribute('aria-hidden', 'true');
        if(background instanceof HTMLVideoElement) {
          background.muted = true;
          background.playsInline = true;
          background.preload = 'metadata';
        }
        aspecter.className = 'media-container-aspecter';
        aspecter.append(media);
        container.classList.add('media-container', 'media-container-fitted');
        container.append(background, aspecter);
      }

      function renderSingleMedia(
        previewBlock: MediaPageBlock,
        container: HTMLElement,
        previewUrl: string,
        middlewareHelper: ReturnType<typeof getMiddleware>,
        listenerSetter: ListenerSetter,
        uploadItem?: ChatInputRichMediaUploadItem,
        onSize?: (size: {w: number, h: number}) => void,
        onVideoDuration?: (duration: number) => void,
        fitted = false
      ): Document.document | undefined {
        const photos = node.attrs.photos as Photo.photo[];
        const documents = node.attrs.documents as Document.document[];
        const photo = previewBlock?._ === 'pageBlockPhoto' ?
          photos.find((photo) => String(photo.id) === String(previewBlock.photo_id)) :
          undefined;
        const videoDocument = previewBlock?._ === 'pageBlockVideo' ?
          documents.find((document) => String(document.id) === String(previewBlock.video_id)) :
          undefined;
        const audioDocument = previewBlock?._ === 'pageBlockAudio' ?
          documents.find((document) => String(document.id) === String(previewBlock.audio_id)) :
          undefined;
        const pendingAudioDocument = (
          previewBlock?._ === 'pageBlockAudio' &&
          !audioDocument &&
          uploadItem
        ) ? {
            _: 'document' as const,
            id: previewBlock.audio_id,
            access_hash: 0,
            file_reference: new Uint8Array(),
            date: 0,
            dc_id: 0,
            attributes: [{
              _: 'documentAttributeAudio' as const,
              pFlags: {},
              duration: uploadItem.duration || 0
            }, {
              _: 'documentAttributeFilename' as const,
              file_name: uploadItem.fileName || 'Audio'
            }],
            pFlags: {},
            type: 'audio' as const,
            file_name: uploadItem.fileName || 'Audio',
            duration: uploadItem.duration || 0,
            size: uploadItem.fileSize || 0,
            mime_type: (uploadItem.mimeType || 'audio/mpeg') as MTMimeType
          } satisfies Document.document :
          undefined;
        const renderedAudioDocument = audioDocument || pendingAudioDocument;

        if(previewUrl && previewBlock?._ === 'pageBlockPhoto') {
          const preparedSource = getRichMediaPreviewSource(previewUrl);
          const preparedPoster = getRichMediaPreviewPoster(previewUrl);
          const preparedSideFill = getRichMediaPreviewSideFill(previewUrl);
          const image = preparedPoster || (preparedSource?.tagName === 'IMG' ?
            preparedSource as HTMLImageElement :
            new Image());
          const middleware = middlewareHelper.get();
          listenerSetter.add(image)('load', () => {
            if(!middleware()) return;
            onSize?.({
              w: image.naturalWidth || 3,
              h: image.naturalHeight || 2
            });
          }, {once: true});
          image.alt = opaqueRichBlockLabel(previewBlock);
          image.className = 'media-photo';
          if(!preparedPoster && image.getAttribute('src') !== previewUrl) {
            image.src = previewUrl;
          }
          if(fitted) appendLocalMedia(container, image, preparedSideFill);
          else container.append(image);
        } else if(previewUrl && previewBlock?._ === 'pageBlockVideo') {
          const preparedSource = getRichMediaPreviewSource(previewUrl);
          const preparedPoster = getRichMediaPreviewPoster(previewUrl);
          const preparedSideFill = getRichMediaPreviewSideFill(previewUrl);
          const video = preparedSource?.tagName === 'VIDEO' ?
            preparedSource as HTMLVideoElement :
            document.createElement('video');
          const middleware = middlewareHelper.get();
          if(preparedPoster) {
            preparedPoster.alt = opaqueRichBlockLabel(previewBlock);
            preparedPoster.className = 'media-photo';
            onSize?.({
              w: video.videoWidth || uploadItem?.width || 3,
              h: video.videoHeight || uploadItem?.height || 2
            });
            if(fitted) appendLocalMedia(container, preparedPoster, preparedSideFill);
            else container.append(preparedPoster);
            return;
          }
          video.className = 'media-video';
          video.muted = true;
          video.playsInline = true;
          video.preload = 'auto';
          listenerSetter.add(video)('loadedmetadata', () => {
            if(!middleware()) return;
            onSize?.({
              w: video.videoWidth || 3,
              h: video.videoHeight || 2
            });
            onVideoDuration?.(video.duration);
          }, {once: true});
          if(video.getAttribute('src') !== previewUrl) video.src = previewUrl;
          if(fitted) appendLocalMedia(container, video);
          else container.append(video);
        } else if(photo) {
          const size = mediaItemSize(previewBlock);
          const viewport = mediaViewport(size);
          onSize?.(size);
          const middleware = middlewareHelper.get();
          void import('@components/wrappers/photo').then(async({default: wrapPhoto}): Promise<void> => {
            if(!middleware()) return;
            const {loadPromises} = await wrapPhoto({
              photo,
              container,
              boxHeight: fitted ? viewport.height : undefined,
              boxWidth: fitted ? viewport.width : undefined,
              fillBox: fitted,
              lazyLoadQueue: false,
              middleware,
              withoutPreloader: true
            });
            await Promise.all([loadPromises.thumb, loadPromises.full]);
          }).catch((): void => {});
        } else if(videoDocument) {
          const size = mediaItemSize(previewBlock);
          const viewport = mediaViewport(size);
          onSize?.(size);
          const middleware = middlewareHelper.get();
          void import('@components/wrappers/video').then(async({default: wrapVideo}): Promise<void> => {
            if(!middleware()) return;
            await wrapVideo({
              doc: videoDocument,
              container,
              boxHeight: fitted ? viewport.height : undefined,
              boxWidth: fitted ? viewport.width : undefined,
              fillBox: fitted,
              middleware,
              noInfo: true,
              noAutoplayAttribute: true,
              withPreview: true,
              withoutPreloader: true
            });
          }).catch((): void => {});
        } else if(renderedAudioDocument) {
          const middleware = middlewareHelper.get();
          const mediaId = Number(renderedAudioDocument.id) || 0;
          const localAudio = pendingAudioDocument && previewUrl ?
            document.createElement('audio') :
            undefined;
          if(localAudio) {
            localAudio.preload = 'metadata';
            localAudio.src = previewUrl;
            middleware.onDestroy(() => {
              localAudio.pause();
              localAudio.removeAttribute('src');
              localAudio.load();
            });
          }
          const message: Message.message = {
            _: 'message',
            id: mediaId,
            mid: mediaId,
            peer_id: {_: 'peerUser', user_id: 0},
            peerId: NULL_PEER_ID,
            pFlags: {},
            date: 0,
            message: '',
            media: {
              _: 'messageMediaDocument',
              document: renderedAudioDocument,
              pFlags: {}
            }
          };
          void import('@components/wrappers/document').then(async({default: wrapDocument}) => {
            const element = await wrapDocument({
              message,
              middleware,
              autoDownloadSize: pendingAudioDocument ? 0 : 10 * 1024 * 1024,
              doc: renderedAudioDocument,
              globalMedia: localAudio,
              withTime: false
            });
            if(middleware()) {
              container.append(element);
            }
          }).catch((): void => {});
          return pendingAudioDocument;
        } else {
          const fallback = document.createElement('span');
          fallback.className = 'chat-input-rich-media-fallback';
          fallback.textContent = opaqueRichBlockLabel(previewBlock);
          container.append(fallback);
        }
      }

      function renderMedia() {
        const layoutGeneration = ++mediaLayoutGeneration;
        const block = node.attrs.block as PageBlock;
        const items = mediaItems(block);
        const grouped = block?._ === 'pageBlockCollage' || block?._ === 'pageBlockSlideshow';
        const slideshow = block?._ === 'pageBlockSlideshow';
        const uploadId = `${node.attrs.uploadId || ''}`;
        const uploadItems = node.attrs.uploadItems as ChatInputRichMediaUploadItem[] || [];
        const uploadPreviewUrls = node.attrs.uploadPreviewUrls as string[] || [];
        const previewUrls = getRichMediaPreviewUrls(node, items.length);
        const uploadAction = `${node.attrs.uploadAction || ''}`;
        const uploadActiveIndex = Number(node.attrs.uploadActiveIndex);
        if(
          uploadAction &&
          Number.isInteger(uploadActiveIndex) &&
          uploadActiveIndex >= 0 &&
          uploadActiveIndex < items.length
        ) {
          activeIndex = uploadActiveIndex;
        }
        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
        mediaTooltipTargetIndex = activeIndex;
        const active = items[activeIndex];
        const existingEntries: RenderedMediaEntry[] = items.map((item, sourceIndex) => {
          const replacing = uploadAction === 'replace' && sourceIndex === activeIndex;
          return {
            aggregateUpload: replacing,
            item: replacing && uploadItems[0] ?
              pendingUploadMediaItem(uploadItems[0], 0) :
              item,
            previewUrl: uploadId && !uploadAction ?
              uploadPreviewUrls[sourceIndex] || '' :
              replacing ?
                uploadPreviewUrls[0] || '' :
                previewUrls[sourceIndex] || '',
            sourceIndex,
            uploadIndex: uploadId && !uploadAction ? sourceIndex : undefined
          };
        });
        const addedEntries: RenderedMediaEntry[] = uploadAction === 'add' ?
          uploadItems.map((item, uploadIndex) => ({
            aggregateUpload: false,
            item: pendingUploadMediaItem(item, uploadIndex),
            previewUrl: uploadPreviewUrls[uploadIndex] || '',
            sourceIndex: undefined as number | undefined,
            uploadIndex
          })) :
          [];
        const allEntries = addedEntries.length ? [
          ...existingEntries.slice(0, activeIndex + 1),
          ...addedEntries,
          ...existingEntries.slice(activeIndex + 1)
        ] : existingEntries;
        const displayAsCollage = (
          block?._ === 'pageBlockCollage' ||
          !slideshow && !!addedEntries.length
        );
        const displayedActive = existingEntries[activeIndex]?.item || active;
        renderedLayout = slideshow ? 'slideshow' :
          grouped || addedEntries.length ? 'collage' :
          'single';
        dom.dataset.richBlock = serializedOpaqueRichBlock(block);
        dom.dataset.richMediaType = displayedActive?._ || '';
        dom.dataset.richMediaLayout = renderedLayout;
        dom.toggleAttribute(
          'data-spoiler',
          !grouped &&
            (
              displayedActive?._ === 'pageBlockPhoto' ||
              displayedActive?._ === 'pageBlockVideo'
            ) &&
            !!displayedActive.pFlags.spoiler
        );
        preview.setAttribute('aria-label', opaqueRichBlockLabel(block));
        if(mediaCanvas.querySelector('.menu-open')) contextMenuController.close();
        mediaVisualDispose?.();
        mediaVisualDispose = undefined;
        mediaLayoutResizeDispose?.();
        mediaLayoutResizeDispose = undefined;
        [...renderedItems].forEach(cleanupRenderedItem);
        renderedUploadStates.clear();
        mediaMiddleware.clean();
        mediaCanvas.replaceChildren();
        mediaCanvas.className = 'chat-input-rich-media-canvas';
        mediaCanvas.removeAttribute('style');
        renderedItems = [];

        const createItem = (
          entry: RenderedMediaEntry,
          index: number,
          layout: 'collage' | 'single' | 'slideshow',
          onSize?: (size: {w: number, h: number}) => void
        ) => {
          const {sourceIndex, uploadIndex} = entry;
          const item = (
            layout === 'slideshow' &&
            sourceIndex !== undefined &&
            uploadIndex === undefined &&
            !entry.aggregateUpload
          ) ? mediaItems(node.attrs.block as PageBlock)[sourceIndex] || entry.item : entry.item;
          const itemElement = document.createElement('div');
          const visual = document.createElement('div');
          const moreButton = ButtonIcon('more');
          const listenerSetter = new ListenerSetter();
          const middleware = mediaMiddleware.get().create();
          const record: RenderedMediaItem = {
            aggregateUpload: entry.aggregateUpload,
            element: itemElement,
            entry,
            itemType: item._,
            listenerSetter,
            middleware,
            moreButton,
            sourceIndex,
            spoilerGeneration: 0,
            uploadIndex,
            visual
          };
          entry.record = record;
          if(entry.previewUrl) {
            record.releasePreviewUrl = retainRichMediaPreviewUrl(entry.previewUrl);
          }
          itemElement.className = classNames(
            'chat-input-rich-media-item',
            item._ === 'pageBlockAudio' && 'chat-input-rich-media-item-audio',
            layout === 'collage' && instantViewStyles.CollageItem,
            layout === 'single' && item._ !== 'pageBlockAudio' && instantViewStyles.Media,
            item._ === 'pageBlockAudio' && instantViewStyles.Padding,
            item._ === 'pageBlockAudio' && instantViewStyles.Audio
          );
          visual.className = instantViewStyles.Media;
          itemElement.dataset.index = `${index}`;
          itemElement.dataset.mediaType = item._;
          if(uploadIndex !== undefined) itemElement.dataset.uploadIndex = `${uploadIndex}`;
          if(entry.aggregateUpload) itemElement.dataset.uploadAggregate = 'true';
          itemElement.toggleAttribute('data-active', sourceIndex === activeIndex);
          itemElement.toggleAttribute(
            'data-spoiler',
            (item._ === 'pageBlockPhoto' || item._ === 'pageBlockVideo') &&
              !!item.pFlags.spoiler
          );
          if(layout !== 'single' && item._ !== 'pageBlockAudio') {
            itemElement.append(visual);
          }
          listenerSetter.add(itemElement)('click', () => {
            const itemIndex = record.sourceIndex;
            if(
              (node.attrs.block as PageBlock)?._ !== 'pageBlockCollage' ||
              itemIndex === undefined ||
              activeIndex === itemIndex
            ) return;
            setActiveItem(Number(record.element.dataset.index), allEntries.length);
          });
          listenerSetter.add(itemElement)('pointerenter', () => {
            const itemIndex = record.sourceIndex;
            if(itemIndex !== undefined) setMediaTooltipTarget(itemIndex);
          });
          const target = (
            layout === 'single' || item._ === 'pageBlockAudio'
          ) ? itemElement : visual;
          const uploadItem = mediaEntryUploadItem(entry, uploadItems);
          const initialSize = mediaEntrySize(entry, uploadItems);
          if(layout === 'single' && item._ !== 'pageBlockAudio') {
            applyInstantViewMediaSize(itemElement, initialSize.w, initialSize.h);
          }
          record.pendingAudioDocument = renderSingleMedia(
            item,
            target,
            entry.previewUrl,
            middleware,
            listenerSetter,
            uploadItem,
            (size) => {
              if(layout === 'single') {
                applyInstantViewMediaSize(itemElement, size.w, size.h);
              }
              onSize?.(size);
            },
            (duration) => updateRenderedVideoTime(record, undefined, duration),
            layout !== 'collage' && item._ !== 'pageBlockAudio'
          );
          itemElement.append(moreButton);
          renderedItems.push(record);
          attachMediaMenu(record);
          updateUploadStateForRecord(record);
          syncRenderedMediaSpoiler(record, item);
          if(layout === 'slideshow') onCleanup(() => cleanupRenderedItem(record));
          return itemElement;
        };

        if(slideshow) {
          setSlideshowActiveIndex(activeIndex);
          setSlideshowEntries(allEntries);
          mediaVisualDispose = render(() => createComponent(Slideshow, {
            get aspectRatio() {
              return slideshowAspectRatio(slideshowEntries(), liveUploadItems);
            },
            'class': classNames(
              instantViewStyles.Slideshow,
              'chat-input-rich-media-slideshow'
            ),
            get activeIndex() {
              return slideshowActiveIndex();
            },
            'hideArrows': true,
            'initialIndex': activeIndex,
            get items() {
              return slideshowEntries();
            },
            'keepItemsMounted': true,
            'onIndexChange': (index: number) => {
              setActiveItem(index, slideshowEntries().length);
            },
            'children': (entry: RenderedMediaEntry, index: number) => (
              createItem(entry, index, 'slideshow')
            )
          }), mediaCanvas);
        } else if(displayAsCollage) {
          setSlideshowEntries([]);
          mediaCanvas.classList.add(instantViewStyles.Collage, instantViewStyles.Media);
          const sizes = allEntries.map((entry) => mediaEntrySize(entry, uploadItems));
          let lastLayoutWidth = 0;
          const layout = (measuredWidth = 0, force = false) => {
            if(
              destroyed ||
              layoutGeneration !== mediaLayoutGeneration ||
              !sizes.length ||
              mediaCanvas.children.length !== sizes.length
            ) return;
            const layoutWidth = Math.max(
              1,
              Math.round(
                measuredWidth ||
                dom.getBoundingClientRect().width ||
                dom.clientWidth ||
                400
              )
            );
            if(!force && layoutWidth === lastLayoutWidth) return;
            lastLayoutWidth = layoutWidth;
            const result = prepareAlbum({
              container: mediaCanvas,
              items: sizes,
              maxWidth: layoutWidth,
              minWidth: layoutWidth / 4,
              spacing: 2,
              maxHeight: INSTANT_VIEW_MEDIA_MAX_HEIGHT
            });
            mediaCanvas.style.setProperty('--width', `${result.width}px`);
            applyInstantViewMediaSize(mediaCanvas, result.width, result.height);
          };
          allEntries.forEach((entry, index) => {
            mediaCanvas.append(createItem(entry, index, 'collage', (size) => {
              if(
                sizes[index].w === size.w &&
                sizes[index].h === size.h
              ) return;
              sizes[index] = size;
              layout(0, true);
            }));
          });
          layout();
          mediaLayoutResizeDispose = observeResize(dom, (entry) => {
            layout(entry.contentRect.width);
          });
          queueMicrotask(() => layout());
        } else if(existingEntries[activeIndex]) {
          setSlideshowEntries([]);
          mediaCanvas.append(createItem(existingEntries[activeIndex], 0, 'single'));
        } else {
          setSlideshowEntries([]);
        }
        updateUploadStateOverlays();
        updateMediaTooltipAvailability();
      }

      function mediaItemVisualIdentity(item: MediaPageBlock | undefined) {
        if(item?._ === 'pageBlockPhoto') return `photo:${item.photo_id}`;
        if(item?._ === 'pageBlockVideo') return `video:${item.video_id}`;
        if(item?._ === 'pageBlockAudio') return `audio:${item.audio_id}`;
        return '';
      }

      function applySlideshowEntries(
        entries: RenderedMediaEntry[],
        nextActiveIndex: number
      ) {
        setSlideshowEntries(entries);
        activeIndex = Math.max(0, Math.min(nextActiveIndex, entries.length - 1));
        setSlideshowActiveIndex(activeIndex);
        entries.forEach((entry, index) => {
          const record = entry.record;
          if(!record) return;
          record.aggregateUpload = entry.aggregateUpload;
          record.sourceIndex = entry.sourceIndex;
          record.uploadIndex = entry.uploadIndex;
          record.element.dataset.index = `${index}`;
          if(entry.uploadIndex === undefined) {
            delete record.element.dataset.uploadIndex;
          } else {
            record.element.dataset.uploadIndex = `${entry.uploadIndex}`;
          }
          record.element.toggleAttribute(
            'data-upload-aggregate',
            entry.aggregateUpload
          );
          record.element.toggleAttribute('data-active', index === activeIndex);
          record.element.toggleAttribute(
            'data-spoiler',
            (entry.item._ === 'pageBlockPhoto' || entry.item._ === 'pageBlockVideo') &&
              !!entry.item.pFlags.spoiler
          );
          record.moreButton.hidden = (
            entry.sourceIndex === undefined ||
            isRenderedMediaItemPending(record)
          );
          updateRenderedVideoTime(record);
          syncRenderedMediaSpoiler(record, entry.item);
        });
        const active = entries[activeIndex]?.item;
        const block = node.attrs.block as PageBlock;
        dom.dataset.richBlock = serializedOpaqueRichBlock(block);
        dom.dataset.richMediaType = active?._ || '';
        dom.dataset.richMediaLayout = 'slideshow';
        dom.removeAttribute('data-spoiler');
        preview.setAttribute('aria-label', opaqueRichBlockLabel(block));
        updateUploadStateOverlays();
        setMediaTooltipTarget(activeIndex);
      }

      function reconcileSlideshowUploadTransition(previousNode: typeof node) {
        const previousBlock = previousNode.attrs.block as PageBlock;
        const block = node.attrs.block as PageBlock;
        if(
          renderedLayout !== 'slideshow' ||
          previousBlock?._ !== 'pageBlockSlideshow' ||
          block?._ !== 'pageBlockSlideshow' ||
          !mediaBlockVisualStructureEquals(previousBlock, block)
        ) return false;

        const previousUploadId = `${previousNode.attrs.uploadId || ''}`;
        const uploadId = `${node.attrs.uploadId || ''}`;
        const previousEntries = slideshowEntries();
        const items = mediaItems(block);
        const starting = !previousUploadId && !!uploadId;
        const cancelling = !!previousUploadId && !uploadId;
        if(!starting && !cancelling) return false;

        if(mediaCanvas.querySelector('.menu-open')) contextMenuController.close();
        if(starting) {
          if(previousEntries.length !== items.length) return false;
          const uploadAction = `${node.attrs.uploadAction || ''}`;
          const uploadActiveIndex = Number(node.attrs.uploadActiveIndex);
          const uploadItems = node.attrs.uploadItems as ChatInputRichMediaUploadItem[] || [];
          const uploadPreviewUrls = node.attrs.uploadPreviewUrls as string[] || [];
          if(
            !uploadItems.length ||
            !Number.isInteger(uploadActiveIndex) ||
            uploadActiveIndex < 0 ||
            uploadActiveIndex >= items.length
          ) return false;
          previousEntries.forEach((entry, index) => {
            entry.aggregateUpload = false;
            entry.item = items[index];
            entry.sourceIndex = index;
            entry.uploadIndex = undefined;
          });
          if(uploadAction === 'add') {
            const addedEntries: RenderedMediaEntry[] = uploadItems.map((item, uploadIndex) => ({
              aggregateUpload: false,
              item: pendingUploadMediaItem(item, uploadIndex),
              previewUrl: uploadPreviewUrls[uploadIndex] || '',
              uploadIndex
            }));
            const insertionIndex = uploadActiveIndex + 1;
            applySlideshowEntries([
              ...previousEntries.slice(0, insertionIndex),
              ...addedEntries,
              ...previousEntries.slice(insertionIndex)
            ], uploadActiveIndex);
            return true;
          }
          if(uploadAction === 'replace' && uploadItems.length === 1) {
            const entries = [...previousEntries];
            entries[uploadActiveIndex] = {
              aggregateUpload: true,
              item: pendingUploadMediaItem(uploadItems[0], 0),
              previewUrl: uploadPreviewUrls[0] || '',
              sourceIndex: uploadActiveIndex
            };
            applySlideshowEntries(entries, uploadActiveIndex);
            return true;
          }
          return false;
        }

        const previousAction = `${previousNode.attrs.uploadAction || ''}`;
        if(previousAction !== 'add' && previousAction !== 'replace') return false;
        const selectedEntry = previousEntries[activeIndex];
        const previewUrls = getRichMediaPreviewUrls(node, items.length);
        const availableEntries = previousEntries.filter((entry) => (
          entry.uploadIndex === undefined &&
          !entry.aggregateUpload
        ));
        const entries = items.map((item, sourceIndex): RenderedMediaEntry => {
          const candidate = availableEntries.find((entry) => (
            mediaItemVisualIdentity(entry.item) === mediaItemVisualIdentity(item)
          ));
          if(candidate) {
            const index = availableEntries.indexOf(candidate);
            availableEntries.splice(index, 1);
            candidate.aggregateUpload = false;
            candidate.item = item;
            candidate.sourceIndex = sourceIndex;
            candidate.uploadIndex = undefined;
            return candidate;
          }
          return {
            aggregateUpload: false,
            item,
            previewUrl: previewUrls[sourceIndex] || '',
            sourceIndex
          };
        });
        const selectedIndex = entries.indexOf(selectedEntry);
        const fallbackIndex = Number(previousNode.attrs.uploadActiveIndex);
        applySlideshowEntries(
          entries,
          selectedIndex === -1 ? fallbackIndex : selectedIndex
        );
        return true;
      }

      function uploadItemsHaveSameShape(
        first: ChatInputRichMediaUploadItem[],
        second: ChatInputRichMediaUploadItem[]
      ) {
        return first.length === second.length && first.every((item, index) => (
          item.id === second[index]?.id &&
          item.type === second[index]?.type
        ));
      }

      function sameResourceSequence(first: unknown, second: unknown) {
        if(first === second) return true;
        if(!Array.isArray(first) || !Array.isArray(second)) return false;
        return (
          first.length === second.length &&
          first.every((resource, index) => {
            const candidate = second[index];
            if(resource === candidate) return true;
            if(
              !resource ||
              !candidate ||
              typeof(resource) !== 'object' ||
              typeof(candidate) !== 'object' ||
              !('id' in resource) ||
              !('id' in candidate)
            ) return false;
            return (
              String(resource.id) === String(candidate.id) &&
              ('_' in resource ? resource._ : '') ===
                ('_' in candidate ? candidate._ : '')
            );
          })
        );
      }

      function mediaPresentationShellEquals(
        first: typeof node,
        second: typeof node,
        allowEquivalentResourceArrays = false
      ) {
        return (
          first.attrs.uploadId === second.attrs.uploadId &&
          first.attrs.uploadAction === second.attrs.uploadAction &&
          first.attrs.uploadActiveIndex === second.attrs.uploadActiveIndex &&
          first.attrs.uploadGrouped === second.attrs.uploadGrouped &&
          (
            first.attrs.uploadPreviewUrls === second.attrs.uploadPreviewUrls ||
            allowEquivalentResourceArrays &&
              sameResourceSequence(
                first.attrs.uploadPreviewUrls || [],
                second.attrs.uploadPreviewUrls || []
              )
          ) &&
          (
            first.attrs.previewUrls === second.attrs.previewUrls ||
            allowEquivalentResourceArrays &&
              sameResourceSequence(
                first.attrs.previewUrls || [],
                second.attrs.previewUrls || []
              )
          ) &&
          (
            first.attrs.documents === second.attrs.documents ||
            allowEquivalentResourceArrays &&
              sameResourceSequence(
                first.attrs.documents || [],
                second.attrs.documents || []
              )
          ) &&
          (
            first.attrs.photos === second.attrs.photos ||
            allowEquivalentResourceArrays &&
              sameResourceSequence(
                first.attrs.photos || [],
                second.attrs.photos || []
              )
          ) &&
          first.attrs.previewUrl === second.attrs.previewUrl &&
          uploadItemsHaveSameShape(
            first.attrs.uploadItems as ChatInputRichMediaUploadItem[] || [],
            second.attrs.uploadItems as ChatInputRichMediaUploadItem[] || []
          )
        );
      }

      function mediaPresentationEquals(first: typeof node, second: typeof node) {
        return (
          mediaPresentationShellEquals(first, second) &&
          first.attrs.block === second.attrs.block
        );
      }

      type GroupedMediaBlock =
        PageBlock.pageBlockCollage |
        PageBlock.pageBlockSlideshow;

      function isGroupedMediaBlock(block: PageBlock): block is GroupedMediaBlock {
        return block?._ === 'pageBlockCollage' || block?._ === 'pageBlockSlideshow';
      }

      function mediaBlockVisualStructureEquals(
        first: PageBlock,
        second: PageBlock
      ) {
        if(first === second) return true;
        if(!first || !second || first._ !== second._) return false;
        const firstItems = mediaItems(first);
        const secondItems = mediaItems(second);
        return (
          firstItems.length > 0 &&
          firstItems.length === secondItems.length &&
          firstItems.every((item, index) => (
            mediaItemVisualIdentity(item) ===
              mediaItemVisualIdentity(secondItems[index])
          ))
        );
      }

      function mediaPresentationVisualStructureEquals(
        first: typeof node,
        second: typeof node
      ) {
        return (
          mediaPresentationShellEquals(first, second, true) &&
          mediaBlockVisualStructureEquals(
            first.attrs.block as PageBlock,
            second.attrs.block as PageBlock
          )
        );
      }

      function syncRenderedMediaMetadata() {
        const block = node.attrs.block as PageBlock;
        const items = mediaItems(block);
        const grouped = isGroupedMediaBlock(block);
        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
        renderedItems.forEach((record) => {
          if(
            record.aggregateUpload ||
            record.sourceIndex === undefined
          ) return;
          const item = items[record.sourceIndex];
          if(!item) return;
          const hadSpoiler = record.element.hasAttribute('data-spoiler');
          const hasSpoiler = (
            item._ === 'pageBlockPhoto' || item._ === 'pageBlockVideo'
          ) && !!item.pFlags.spoiler;
          record.entry.item = item;
          record.element.toggleAttribute('data-spoiler', hasSpoiler);
          updateRenderedVideoTime(record);
          syncRenderedMediaSpoiler(record, item, hadSpoiler !== hasSpoiler);
        });
        const activeRecord = renderedItems.find((record) => (
          Number(record.element.dataset.index) === activeIndex
        ));
        const active = activeRecord?.entry.item || items[activeIndex];
        dom.dataset.richBlock = serializedOpaqueRichBlock(block);
        dom.dataset.richMediaType = activeRecord?.itemType || active?._ || '';
        dom.toggleAttribute(
          'data-spoiler',
          !grouped &&
            (
              activeRecord ?
                activeRecord.element.hasAttribute('data-spoiler') :
                (active?._ === 'pageBlockPhoto' || active?._ === 'pageBlockVideo') &&
                  !!active.pFlags.spoiler
            )
        );
        preview.setAttribute('aria-label', opaqueRichBlockLabel(block));
      }

      function preserveCompletedUpload(previousNode: typeof node) {
        if(!previousNode.attrs.uploadId || node.attrs.uploadId) return false;
        if(previousNode.attrs.block === node.attrs.block) return false;
        const block = node.attrs.block as PageBlock;
        const items = mediaItems(block);
        const grouped = block?._ === 'pageBlockCollage' || block?._ === 'pageBlockSlideshow';
        const layout = block?._ === 'pageBlockSlideshow' ?
          'slideshow' :
          grouped ? 'collage' : 'single';
        if(
          layout !== renderedLayout ||
          items.some((item) => item._ === 'pageBlockAudio') ||
          renderedItems.some((record) => {
            const index = Number(record.element.dataset.index);
            return !Number.isInteger(index) || items[index]?._ !== record.itemType;
          })
        ) return false;

        activeIndex = Math.max(0, Math.min(activeIndex, items.length - 1));
        renderedItems.forEach((record) => {
          const index = Number(record.element.dataset.index);
          record.entry.aggregateUpload = false;
          record.entry.item = items[index];
          record.entry.sourceIndex = index;
          record.entry.uploadIndex = undefined;
          record.aggregateUpload = false;
          record.sourceIndex = index;
          record.uploadIndex = undefined;
          record.element.dataset.index = `${index}`;
          delete record.element.dataset.uploadIndex;
          delete record.element.dataset.uploadAggregate;
          record.element.toggleAttribute('data-active', index === activeIndex);
          record.moreButton.hidden = false;
          updateRenderedVideoTime(record);
          syncRenderedMediaSpoiler(record, items[index]);
        });
        dom.dataset.richMediaLayout = layout;
        syncRenderedMediaMetadata();
        updateUploadStateOverlays();
        return true;
      }

      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        const previousNode = node;
        const presentationEquals = mediaPresentationEquals(previousNode, updatedNode);
        const metadataOnlyChange = (
          !presentationEquals &&
          mediaPresentationVisualStructureEquals(previousNode, updatedNode)
        );
        const uploadStateChanged =
          previousNode.attrs.uploadItems !== updatedNode.attrs.uploadItems;
        const creditChanged =
          previousNode.attrs.captionCredit !== updatedNode.attrs.captionCredit;
        node = updatedNode;
        const uploadId = `${node.attrs.uploadId || ''}`;
        const previousUploadId = `${previousNode.attrs.uploadId || ''}`;
        if(uploadId !== previousUploadId || uploadStateChanged) {
          liveUploadItems = node.attrs.uploadItems as ChatInputRichMediaUploadItem[] || [];
        }
        if(uploadId) dom.dataset.uploadId = uploadId;
        else delete dom.dataset.uploadId;
        setChatInputPlaceholderEmpty(contentDOM, !node.content.size);
        if(creditChanged || renderedLayout === undefined) {
          renderReadonlyRichText(
            credit,
            node.attrs.captionCredit as RichText | undefined,
            editor
          );
        }
        if(renderedLayout === undefined) {
          renderMedia();
        } else if(presentationEquals) {
          if(uploadStateChanged) updateUploadStateOverlays();
        } else if(metadataOnlyChange) {
          syncRenderedMediaMetadata();
          if(uploadStateChanged) updateUploadStateOverlays();
        } else if(reconcileSlideshowUploadTransition(previousNode)) {
          // The slideshow root and unaffected slides stay mounted while a
          // provisional upload slide is inserted, replaced, or cancelled.
        } else if(!preserveCompletedUpload(previousNode)) {
          renderMedia();
        }
        updateMediaTooltipAvailability();
        return true;
      };
      nodeViewListenerSetter.add(dom)(
        CHAT_INPUT_RICH_MEDIA_UPLOAD_UPDATE_EVENT,
        (event) => {
          const {detail} = event as ChatInputRichMediaUploadUpdateEvent;
          if(detail.uploadId !== `${node.attrs.uploadId || ''}`) return;
          liveUploadItems = detail.items;
          updateUploadStateOverlays();
        }
      );
      update(node);

      return {
        dom,
        contentDOM,
        update,
        stopEvent: (event) => preview.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => preview.contains(mutation.target),
        destroy: () => {
          destroyed = true;
          ++mediaLayoutGeneration;
          if(mediaCanvas.querySelector('.menu-open')) contextMenuController.close();
          mediaLayoutResizeDispose?.();
          nodeViewListenerSetter.removeAll();
          mediaVisualDispose?.();
          [...renderedItems].forEach(cleanupRenderedItem);
          renderedUploadStates.clear();
          mediaMiddleware.destroy();
        }
      };
    };
  }
});
