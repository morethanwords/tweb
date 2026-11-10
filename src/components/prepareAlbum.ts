import {GroupMediaLayout, Layouter, RectPart} from '@components/groupedLayout';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';
import chunk from '@helpers/array/chunk';

// the gap between an album's items, in px — a message's album and a rich message's collage alike
export const ALBUM_ITEM_SPACING = 1;

type AlbumOptions = {
  items: {w: number, h: number}[],
  maxWidth: number,
  minWidth: number,
  spacing: number,
  maxHeight?: number
};

function layoutAlbum({items, maxWidth, minWidth, spacing, maxHeight}: AlbumOptions) {
  const layout = new Layouter(items, maxWidth, minWidth, spacing, maxHeight).layout();

  const widthItem = layout.find((item) => item.sides & RectPart.Right);
  const width = widthItem.geometry.width + widthItem.geometry.x;

  const heightItem = layout.find((item) => item.sides & RectPart.Bottom);
  const height = heightItem.geometry.height + heightItem.geometry.y;

  return {layout, width, height, stacked: false};
}

/**
 * An album's layout has no shape for more items than an album holds: more of them (a rich message's collage) are
 * laid out an album at a time, one under another (tdesktop's SplitGroupedMediaBlock), and rounded as one.
 */
function layoutAlbumItems(options: AlbumOptions) {
  if(options.items.length <= MESSAGES_ALBUM_MAX_SIZE) {
    return layoutAlbum(options);
  }

  const parts = chunk(options.items, MESSAGES_ALBUM_MAX_SIZE).map((items) => layoutAlbum({...options, items}));
  const layout: GroupMediaLayout[] = [];
  let top = 0;
  parts.forEach((part, index) => {
    for(const {geometry, sides} of part.layout) {
      layout.push({
        geometry: {...geometry, y: geometry.y + top},
        // * only the first part's top and the last one's bottom are the edges of the whole
        sides: sides & ~(index ? RectPart.Top : 0) & ~(index < parts.length - 1 ? RectPart.Bottom : 0)
      });
    }

    top += part.height + options.spacing;
  });

  return {
    layout,
    width: Math.max(...parts.map((part) => part.width)),
    height: top - options.spacing,
    // * as tall as its parts, each held to the album's height: not to be held to one album's as a whole
    stacked: true
  };
}

export default function prepareAlbum(options: AlbumOptions & {
  container: HTMLElement,
  forMedia?: true,
  noGroupedItem?: boolean
}) {
  const {layout, width, height, stacked} = layoutAlbumItems(options);

  const container = options.container;
  container.style.width = width + 'px';
  container.style.height = height + 'px';
  const children = container.children;

  const items = layout.map(({geometry, sides}, idx) => {
    let div: HTMLElement;
    div = children[idx] as HTMLElement;
    if(!div) {
      div = document.createElement('div');
      container.append(div);
    }

    div.classList.add('album-item');
    if(!options.noGroupedItem) div.classList.add('grouped-item');

    div.style.width = (geometry.width / width * 100) + '%';
    div.style.height = (geometry.height / height * 100) + '%';
    div.style.top = (geometry.y / height * 100) + '%';
    // * the layout's left is the line's start, as the corners below say: an album reads from the right in RTL
    div.style.insetInlineStart = (geometry.x / width * 100) + '%';

    // * a cell reused by a new layout (reorder, resize) drops the corners it had as an outer one
    div.style.borderStartStartRadius = div.style.borderEndStartRadius = div.style.borderStartEndRadius = div.style.borderEndEndRadius = '';

    if(sides & RectPart.Left && sides & RectPart.Top) {
      div.style.borderStartStartRadius = `calc(var(--border-start-start-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Left && sides & RectPart.Bottom) {
      div.style.borderEndStartRadius =  `calc(var(--border-end-start-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Right && sides & RectPart.Top) {
      div.style.borderStartEndRadius =  `calc(var(--border-start-end-radius) - ${options.spacing}px)`;
    }

    if(sides & RectPart.Right && sides & RectPart.Bottom) {
      div.style.borderEndEndRadius =  `calc(var(--border-end-end-radius) - ${options.spacing}px)`;
    }

    if(options.forMedia) {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');

      div.append(mediaDiv);
    }

    // @ts-ignore
    // div.style.backgroundColor = '#' + Math.floor(Math.random() * (2 ** 24 - 1)).toString(16).padStart(6, '0');

    return div;
  });

  /* if(options.forMedia) {
    layout.forEach((_, i) => {
      const mediaDiv = document.createElement('div');
      mediaDiv.classList.add('album-item-media');

      options.container.children[i].append(mediaDiv);
    });
  } */

  return {items, width, height, stacked};
}
