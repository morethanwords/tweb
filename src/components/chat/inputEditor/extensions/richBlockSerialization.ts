import type {PageBlock} from '@layer';

const OPAQUE_RICH_BLOCK_LABELS: Partial<Record<PageBlock['_'], string>> = {
  inputPageBlockMap: 'Map',
  pageBlockAnchor: 'Anchor',
  pageBlockAudio: 'Audio',
  pageBlockCollage: 'Collage',
  pageBlockDivider: 'Divider',
  pageBlockFooter: 'Footer',
  pageBlockMap: 'Map',
  pageBlockPhoto: 'Photo',
  pageBlockSlideshow: 'Slideshow',
  pageBlockThinking: 'Thinking',
  pageBlockVideo: 'Video'
};

export function opaqueRichBlockType(block: unknown) {
  if(!block || typeof(block) !== 'object') return '';
  const type = (block as {_?: unknown})._;
  return typeof(type) === 'string' ? type : '';
}

export function opaqueRichBlockLabel(block: unknown) {
  const type = opaqueRichBlockType(block);
  return OPAQUE_RICH_BLOCK_LABELS[type as PageBlock['_']] || type || 'Rich content';
}

export function serializedOpaqueRichBlock(block: unknown) {
  try {
    return JSON.stringify(block);
  } catch{
    return '';
  }
}

export function parsedOpaqueRichBlock(element: HTMLElement) {
  try {
    const block = JSON.parse(element.getAttribute('data-rich-block') || '');
    const type = opaqueRichBlockType(block);
    return type.startsWith('pageBlock') || type.startsWith('inputPageBlock') ? {block} : false;
  } catch{
    return false;
  }
}

export function richCaptionContentElement(element: HTMLElement) {
  return element.querySelector<HTMLElement>('[data-rich-caption]') ||
    element.querySelector<HTMLElement>('figcaption > div') || element.ownerDocument.createElement('div');
}
