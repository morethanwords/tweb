import findUpClassName from '@helpers/dom/findUpClassName';

export function expandAlbumSelectionRange(options: {
  first: HTMLElement,
  last: HTMLElement,
  elements: HTMLElement[],
  getGroupedItems: (bubble: HTMLElement) => HTMLElement[]
}) {
  const {first, last, elements, getGroupedItems} = options;
  const albums = new Map<HTMLElement, HTMLElement[]>();
  const getAlbumBubble = (element: HTMLElement) => {
    const bubble = findUpClassName(element, 'bubble');
    return bubble?.classList.contains('is-album') ? bubble : undefined;
  };
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
