import {
  expandAlbumSelectionRange,
  isSameGroupedSelectionUnit,
  setAlbumItemsSelection
} from '@components/chat/selectionRange';

describe('chat album drag selection', () => {
  const createAlbum = () => {
    const album = document.createElement('div');
    album.classList.add('bubble', 'is-album', 'is-grouped');

    const firstItem = document.createElement('div');
    const secondItem = document.createElement('div');
    const thirdItem = document.createElement('div');
    firstItem.classList.add('grouped-item');
    secondItem.classList.add('grouped-item');
    thirdItem.classList.add('grouped-item');
    firstItem.dataset.mid = '100';
    secondItem.dataset.mid = '101';
    thirdItem.dataset.mid = '102';
    album.append(firstItem, secondItem, thirdItem);

    return {album, firstItem, secondItem, thirdItem};
  };

  it.each([
    ['text to album', false],
    ['album to text', true]
  ])('expands the full album when dragging from %s', (_name, albumFirst) => {
    const text = document.createElement('div');
    text.classList.add('bubble');
    const {album, firstItem, secondItem, thirdItem} = createAlbum();
    const getGroupedItems = () => [firstItem, secondItem, thirdItem];

    const elements = expandAlbumSelectionRange({
      first: albumFirst ? firstItem : text,
      last: albumFirst ? text : firstItem,
      elements: [album],
      getGroupedItems
    });

    expect(elements).toEqual([firstItem, secondItem, thirdItem]);
  });

  it('keeps a range within the same album granular', () => {
    const {firstItem, secondItem, thirdItem} = createAlbum();

    expect(expandAlbumSelectionRange({
      first: firstItem,
      last: thirdItem,
      elements: [secondItem],
      getGroupedItems: () => [firstItem, secondItem, thirdItem]
    })).toEqual([secondItem]);
  });

  it('expands the album when the drag starts on its outer bubble', () => {
    const {album, firstItem, secondItem, thirdItem} = createAlbum();

    expect(expandAlbumSelectionRange({
      first: album,
      last: secondItem,
      elements: [firstItem],
      getGroupedItems: () => [firstItem, secondItem, thirdItem]
    })).toEqual([firstItem, secondItem, thirdItem]);
  });

  it('does not expand grouped bubbles that are not albums', () => {
    const text = document.createElement('div');
    text.classList.add('bubble');
    const {album, firstItem, secondItem, thirdItem} = createAlbum();
    album.classList.remove('is-album');

    expect(expandAlbumSelectionRange({
      first: text,
      last: firstItem,
      elements: [album],
      getGroupedItems: () => [firstItem, secondItem, thirdItem]
    })).toEqual([album]);
  });

  it('treats an album and its items as one drag unit', () => {
    const {album, firstItem, thirdItem} = createAlbum();

    expect(isSameGroupedSelectionUnit(album, thirdItem)).toBe(true);
    expect(isSameGroupedSelectionUnit(thirdItem, album)).toBe(true);
    expect(isSameGroupedSelectionUnit(firstItem, thirdItem)).toBe(false);
  });

  it('treats grouped documents as one drag unit too', () => {
    const {album: documents, firstItem} = createAlbum();
    documents.classList.remove('is-album');
    documents.classList.add('is-multiple-documents');

    expect(isSameGroupedSelectionUnit(documents, firstItem)).toBe(true);
  });

  it('does not merge separate bubbles into one drag unit', () => {
    const text = document.createElement('div');
    text.classList.add('bubble');
    const {album, firstItem} = createAlbum();

    expect(isSameGroupedSelectionUnit(text, firstItem)).toBe(false);
    expect(isSameGroupedSelectionUnit(album, text)).toBe(false);
    expect(isSameGroupedSelectionUnit(text, text)).toBe(false);
  });

  it('forces deselection through every album item', () => {
    const {album, firstItem, secondItem, thirdItem} = createAlbum();
    const selectedItems = new Set<HTMLElement>([firstItem, secondItem, thirdItem]);

    expect(setAlbumItemsSelection({
      album,
      selected: false,
      getGroupedItems: () => [firstItem, secondItem, thirdItem],
      setElementSelection: (element, selected) => {
        if(selected) {
          selectedItems.add(element);
        } else {
          selectedItems.delete(element);
        }
      }
    })).toBe(true);
    expect(selectedItems.size).toBe(0);
  });
});
