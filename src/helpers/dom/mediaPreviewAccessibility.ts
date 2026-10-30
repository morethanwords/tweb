import type {Document, Photo} from '@layer';
import ensureButtonSemantics from '@helpers/dom/ensureButtonSemantics';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import I18n, {LangPackKey} from '@lib/langPack';

export const MEDIA_PREVIEW_SELECTOR = '.attachment, .grouped-item, .media-photo';
// * a preview that holds one of these (a spoiler's reveal button) is no button itself: that one is the control
const CONTROL_SELECTOR = 'button, a[href], input, [role="button"]';
// * the media grids' tiles, with the names they take as buttons
const gridTileLabels: WeakMap<HTMLElement, LangPackKey> = new WeakMap();

/** Both bubble renderers and revealed spoilers use the existing delegated media action. */
export default function makeMediaPreviewsAccessible(container: HTMLElement) {
  if(gridTileLabels.has(container)) {
    makeGridMediaAccessible(container);
    return;
  }

  const previews = Array.from(container.querySelectorAll<HTMLElement>(MEDIA_PREVIEW_SELECTOR));
  if(container.matches(MEDIA_PREVIEW_SELECTOR)) previews.unshift(container);
  previews.forEach((element) => {
    if(element.hasAttribute('role') || element.querySelector(`${MEDIA_PREVIEW_SELECTOR}, ${CONTROL_SELECTOR}`)) return;
    ensureButtonSemantics(element);
    element.setAttribute('aria-label', I18n.format('AccDescr.OpenMedia', true));
  });
}

/** The preview a spoiler covers, to be the media's button once the spoiler goes: a message's, or a media grid's tile */
export function getSpoilerMediaPreview(mediaSpoiler: HTMLElement) {
  const tile = mediaSpoiler.closest<HTMLElement>('.grid-item');
  return tile && gridTileLabels.has(tile) ? tile : mediaSpoiler.closest<HTMLElement>(MEDIA_PREVIEW_SELECTOR);
}

/**
 * A tile of a media grid (a profile's photos and videos, its GIFs, a bot's previews) opens the media viewer, so it is
 * a button named by its kind: a tab stop with the a11y layer, pressed with Enter or Space through the grid's own click.
 * As a message's preview, not while a spoiler's reveal button is in it: its reveal makes it one
 */
export function makeGridMediaAccessible(tile: HTMLElement, media?: Photo.photo | Document.document) {
  if(media) {
    gridTileLabels.set(tile, media._ === 'photo' ? 'AttachPhoto' : media.type === 'gif' ? 'AttachGif' : 'AttachVideo');
  }

  if(tile.hasAttribute('role') || tile.querySelector(CONTROL_SELECTOR)) {
    return;
  }

  ensureButtonSemantics(tile);
  tile.setAttribute('aria-label', I18n.format(gridTileLabels.get(tile), true));
  tile.addEventListener('keydown', buttonKeyDown);
}
