import findUpClassName from '@helpers/dom/findUpClassName';

function getBubbleByClassName(element: HTMLElement, className: string) {
  const bubble = findUpClassName(element, 'bubble');
  return bubble?.classList.contains(className) ? bubble : undefined;
}

const getAlbumBubble = (element: HTMLElement) => getBubbleByClassName(element, 'is-album');

/**
 * A grouped bubble (album, grouped documents) is a single drag unit: its outer bubble carries the
 * group's main mid, so hovering it right after one of its items would count as a second element and
 * start the selection without ever leaving the group. Only an item-to-item move inside the group is
 * a real range.
 */
export function isSameGroupedSelectionUnit(anchor: HTMLElement, element: HTMLElement) {
  const bubble = getBubbleByClassName(anchor, 'is-grouped');
  if(!bubble || bubble !== getBubbleByClassName(element, 'is-grouped')) {
    return false;
  }

  return !(anchor.classList.contains('grouped-item') && element.classList.contains('grouped-item'));
}

export function expandAlbumSelectionRange(options: {
  first: HTMLElement,
  last: HTMLElement,
  elements: HTMLElement[],
  getGroupedItems: (bubble: HTMLElement) => HTMLElement[]
}) {
  const {first, last, elements, getGroupedItems} = options;
  const albums = new Map<HTMLElement, HTMLElement[]>();
  const firstAlbum = getAlbumBubble(first);
  const lastAlbum = getAlbumBubble(last);
  const sharedEndpointAlbum = firstAlbum &&
    firstAlbum === lastAlbum &&
    first.classList.contains('grouped-item') &&
    last.classList.contains('grouped-item') ?
    firstAlbum :
    undefined;
  const addAlbum = (element: HTMLElement) => {
    const album = getAlbumBubble(element);
    if(album && album !== sharedEndpointAlbum && !albums.has(album)) {
      const items = getGroupedItems(album);
      if(items.length) {
        albums.set(album, items);
      }
    }
  };

  elements.forEach(addAlbum);

  if(!sharedEndpointAlbum) {
    addAlbum(first);
    addAlbum(last);
  }

  if(!albums.size) {
    return elements;
  }

  const expanded = elements.filter((element) => {
    const album = getAlbumBubble(element);
    return !album || !albums.has(album);
  });
  albums.forEach((items) => expanded.push(...items));

  return [...new Set(expanded)];
}

export function setAlbumItemsSelection(options: {
  album: HTMLElement,
  selected: boolean,
  getGroupedItems: (album: HTMLElement) => HTMLElement[],
  setElementSelection: (element: HTMLElement, selected: boolean) => void
}) {
  const {album, selected, getGroupedItems, setElementSelection} = options;
  if(!album.classList.contains('is-album')) {
    return false;
  }

  getGroupedItems(album).forEach((item) => setElementSelection(item, selected));
  return true;
}
