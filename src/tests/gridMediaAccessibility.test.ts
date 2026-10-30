import {afterEach, describe, expect, test, vi} from 'vitest';
import '@/tests/helpers/a11yLayer';
import Modes from '@config/modes';
import I18n from '@lib/langPack';
import {makeGridMediaAccessible} from '@helpers/dom/mediaPreviewAccessibility';
import {toggleMediaSpoiler} from '@components/wrappers/mediaSpoiler';
import {Document, Photo} from '@layer';

// * the spoiler's dots and the videos under it play no part in a reveal's end
vi.mock('@components/dotRenderer', () => ({default: {}}));
vi.mock('@components/animationIntersector', () => ({default: {}}));

const photo = {_: 'photo', id: '1', sizes: []} as Photo.photo;
const video = {_: 'document', id: '2', type: 'video'} as Document.document;
const gif = {_: 'document', id: '3', type: 'gif'} as Document.document;

// * a tile in its grid, which opens it by a click on it bubbling up (the grid's delegated click); a spoiler goes in
// * before the tile is made accessible, as wrapGridMedia does
function renderTile(media: Photo.photo | Document.document, spoiler?: HTMLElement) {
  const grid = document.createElement('div');
  const tile = document.createElement('div');
  tile.classList.add('grid-item');
  spoiler && tile.append(spoiler);
  makeGridMediaAccessible(tile, media);
  grid.append(tile);
  document.body.append(grid);

  const opened = vi.fn();
  grid.addEventListener('click', (e) => (e.target as HTMLElement).closest('.grid-item') && opened());
  return {grid, tile, opened};
}

function press(tile: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true});
  tile.dispatchEvent(event);
  return event;
}

describe('a media grid tile', () => {
  afterEach(() => {
    Modes.a11y = true;
    document.body.replaceChildren();
  });

  test('is a button named by its kind', () => {
    const tiles = [photo, video, gif].map((media) => renderTile(media).tile);
    tiles.forEach((tile) => expect(tile.getAttribute('role')).toBe('button'));
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual([
      I18n.format('AttachPhoto', true),
      I18n.format('AttachVideo', true),
      I18n.format('AttachGif', true)
    ]);
  });

  test('with the a11y layer, is a tab stop opened with Enter or Space through the grid\'s click', () => {
    const {tile, opened} = renderTile(photo);
    expect(tile.tabIndex).toBe(0);

    expect(press(tile, 'Enter').defaultPrevented).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(press(tile, ' ').defaultPrevented).toBe(true);
    expect(opened).toHaveBeenCalledTimes(2);

    press(tile, 'a');
    expect(opened).toHaveBeenCalledTimes(2);
  });

  test('without the layer, is no tab stop and keys do not open it', () => {
    Modes.a11y = false;
    const {tile, opened} = renderTile(video);
    expect(tile.hasAttribute('tabindex')).toBe(false);

    expect(press(tile, 'Enter').defaultPrevented).toBe(false);
    press(tile, ' ');
    expect(opened).not.toHaveBeenCalled();
  });

  test('with a spoiler\'s reveal button in it, is no button till the reveal, which makes it one and gives it the focus', () => {
    vi.useFakeTimers();
    try {
      // * what wrapMediaSpoiler makes with the a11y layer: the control that reveals the media
      const spoiler = document.createElement('button');
      spoiler.classList.add('media-spoiler-container');
      const {tile, opened} = renderTile(gif, spoiler);
      expect(['role', 'tabindex', 'aria-label'].map((name) => tile.getAttribute(name))).toEqual([null, null, null]);
      press(tile, 'Enter');
      expect(opened).not.toHaveBeenCalled();

      spoiler.focus();
      toggleMediaSpoiler({mediaSpoiler: spoiler, reveal: true, destroyAfter: true});
      vi.runAllTimers();

      expect(spoiler.isConnected).toBe(false);
      expect([tile.getAttribute('role'), tile.tabIndex, tile.getAttribute('aria-label')])
      .toEqual(['button', 0, I18n.format('AttachGif', true)]);
      expect(document.activeElement).toBe(tile);
      press(tile, 'Enter');
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test('without the layer, a spoiler is a plain box and the tile stays the button', () => {
    Modes.a11y = false;
    const spoiler = document.createElement('div');
    spoiler.classList.add('media-spoiler-container');
    const {tile} = renderTile(photo, spoiler);
    expect([tile.getAttribute('role'), tile.getAttribute('aria-label')]).toEqual(['button', I18n.format('AttachPhoto', true)]);
  });
});
