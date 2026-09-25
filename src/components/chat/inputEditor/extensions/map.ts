import {Node, mergeAttributes} from '@tiptap/core';
import GeoPin from '@components/geoPin';
import {applyInstantViewMediaSize, instantViewStyles} from '@components/instantViewFormatting';
import {
  chatInputPlaceholderAttributes,
  setChatInputPlaceholder,
  setChatInputPlaceholderEmpty
} from '@components/chat/inputEditor/placeholders';
import {richTextPlainText} from '@components/chat/inputEditor/richMessage';
import getWebFileLocation from '@helpers/getWebFileLocation';
import makeGoogleMapsUrl from '@helpers/makeGoogleMapsUrl';
import classNames from '@helpers/string/classNames';
import {getMiddleware} from '@helpers/middleware';
import type {GeoPoint, PageBlock, RichText} from '@layer';
import I18n from '@lib/langPack';
import {
  parsedOpaqueRichBlock,
  richCaptionContentElement,
  opaqueRichBlockLabel,
  serializedOpaqueRichBlock
} from '@components/chat/inputEditor/extensions/richBlockSerialization';
import {renderReadonlyRichText} from '@components/chat/inputEditor/extensions/nodeViewHelpers';

const RICH_MEDIA_NODE_VIEW_ATTRIBUTES = new Set([
  'data-rich-block',
  'data-rich-media-layout',
  'data-rich-media-type',
  'data-spoiler',
  'data-upload-id'
]);

function parsedRichMap(element: HTMLElement) {
  const parsed = parsedOpaqueRichBlock(element);
  const block = parsed && parsed.block as PageBlock | undefined;
  if(block?._ !== 'pageBlockMap' && block?._ !== 'inputPageBlockMap') return false;
  return {
    block,
    captionCredit: block.caption.credit
  };
}

function richMapCoordinates(block: unknown) {
  if(!block || typeof(block) !== 'object') return;
  const map = block as PageBlock.pageBlockMap | PageBlock.inputPageBlockMap;
  if(map._ !== 'pageBlockMap' && map._ !== 'inputPageBlockMap') return;
  if(map.geo._ !== 'geoPoint' && map.geo._ !== 'inputGeoPoint') return;
  return {
    accuracyRadius: map.geo.accuracy_radius,
    height: map.h,
    latitude: map.geo.lat,
    longitude: map.geo.long,
    width: map.w,
    zoom: map.zoom
  };
}

export const ChatRichMap = Node.create({
  name: 'richMap',
  group: 'block',
  content: 'inline*',
  defining: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      block: {default: null, rendered: false},
      captionCredit: {default: null, rendered: false}
    };
  },

  parseHTML() {
    return [{
      tag: '[data-rich-map]',
      getAttrs: parsedRichMap,
      contentElement: richCaptionContentElement
    }];
  },

  renderHTML({node, HTMLAttributes}) {
    const block = node.attrs.block;
    const coordinates = richMapCoordinates(block);
    const label = coordinates ? 'Map' : opaqueRichBlockLabel(block);
    const credit = node.attrs.captionCredit as RichText | undefined;
    return ['figure', mergeAttributes(HTMLAttributes, {
      'class': 'chat-input-rich-map',
      'data-rich-block': serializedOpaqueRichBlock(block),
      'data-rich-map': ''
    }), [
      'div',
      {
        'aria-label': label,
        'class': classNames(instantViewStyles.Map, 'chat-input-rich-map-preview'),
        'contenteditable': 'false',
        'style': coordinates ? [
          `--aspect-ratio: ${coordinates.width / coordinates.height}`,
          '--paddings: 0',
          `--max-height: ${coordinates.height}px`
        ].join('; ') : ''
      },
      ['div', {'class': instantViewStyles.Media}],
      ['span', {'aria-hidden': 'true', 'class': 'geo-pin'}]
    ], [
      'figcaption',
      {
        'class': classNames(
          instantViewStyles.Padding,
          instantViewStyles.Caption,
          'chat-input-rich-map-caption'
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
    const coordinates = richMapCoordinates(node.attrs.block);
    return coordinates ?
      `[Map: ${coordinates.latitude}, ${coordinates.longitude}]` :
      '[Map]';
  },

  addNodeView() {
    return ({editor, node: initialNode}) => {
      let node = initialNode;
      let renderedMapKey: string;
      const mapMiddleware = getMiddleware();
      const dom = document.createElement('figure');
      const preview = document.createElement('a');
      const caption = document.createElement('figcaption');
      const contentDOM = document.createElement('div');
      contentDOM.dataset.richCaption = '';
      const credit = document.createElement('div');
      dom.className = 'chat-input-rich-map';
      dom.dataset.richMap = '';
      preview.className = classNames(instantViewStyles.Map, 'chat-input-rich-map-preview');
      preview.contentEditable = 'false';
      preview.target = '_blank';
      preview.rel = 'noopener noreferrer';
      caption.className = classNames(
        instantViewStyles.Padding,
        instantViewStyles.Caption,
        'chat-input-rich-map-caption'
      );
      contentDOM.className = instantViewStyles.CaptionText;
      setChatInputPlaceholder(contentDOM, I18n.format(
        'Chat.Input.Editor.Placeholder.Caption',
        true
      ), !node.content.size);
      credit.className = instantViewStyles.CaptionCredit;
      credit.contentEditable = 'false';
      caption.append(contentDOM, credit);
      dom.append(preview, caption);

      const update = (updatedNode: typeof node) => {
        if(updatedNode.type !== node.type) return false;
        node = updatedNode;
        setChatInputPlaceholderEmpty(contentDOM, !node.content.size);
        const block = node.attrs.block as PageBlock;
        const coordinates = richMapCoordinates(block);
        const label = coordinates ? 'Map' : opaqueRichBlockLabel(block);
        dom.dataset.richBlock = serializedOpaqueRichBlock(block);
        preview.setAttribute('aria-label', label);
        renderReadonlyRichText(
          credit,
          node.attrs.captionCredit as RichText | undefined,
          editor
        );
        const mapKey = coordinates ? [
          coordinates.latitude,
          coordinates.longitude,
          coordinates.accuracyRadius,
          coordinates.zoom,
          coordinates.width,
          coordinates.height
        ].join(':') : '';
        if(mapKey === renderedMapKey) return true;

        renderedMapKey = mapKey;
        mapMiddleware.clean();
        preview.replaceChildren();
        if(!coordinates) {
          preview.removeAttribute('href');
          preview.style.removeProperty('--aspect-ratio');
          preview.style.removeProperty('--max-height');
          preview.style.removeProperty('--paddings');
          const fallback = document.createElement('span');
          fallback.className = 'chat-input-rich-media-fallback';
          fallback.textContent = label;
          preview.append(fallback);
          return true;
        }

        applyInstantViewMediaSize(
          preview,
          coordinates.width,
          coordinates.height
        );
        preview.style.setProperty('--max-height', `${coordinates.height}px`);
        const geo: GeoPoint.geoPoint = {
          _: 'geoPoint',
          long: coordinates.longitude,
          lat: coordinates.latitude,
          access_hash: 0,
          accuracy_radius: coordinates.accuracyRadius
        };
        preview.href = makeGoogleMapsUrl(geo);
        const image = document.createElement('div');
        image.className = instantViewStyles.Media;
        preview.append(image, GeoPin());

        const middleware = mapMiddleware.get();
        const location = getWebFileLocation(
          geo,
          coordinates.width,
          coordinates.height,
          coordinates.zoom
        );
        void import('@components/wrappers/photo').then(async({default: wrapPhoto}): Promise<void> => {
          if(!middleware()) return;
          const {loadPromises} = await wrapPhoto({
            photo: location,
            container: image,
            lazyLoadQueue: false,
            middleware,
            withoutPreloader: true
          });
          await Promise.all([loadPromises.thumb, loadPromises.full]);
        }).catch((): void => {});
        return true;
      };
      update(node);

      return {
        dom,
        contentDOM,
        update,
        stopEvent: (event) => preview.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => (
          preview.contains(mutation.target) ||
          mutation.type === 'attributes' &&
            mutation.target === dom &&
            RICH_MEDIA_NODE_VIEW_ATTRIBUTES.has(mutation.attributeName || '')
        ),
        destroy: () => mapMiddleware.destroy()
      };
    };
  }
});
