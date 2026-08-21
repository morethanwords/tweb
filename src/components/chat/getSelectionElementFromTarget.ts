import findUpClassName from '@helpers/dom/findUpClassName';

/**
 * The message unit a click addresses: a single item of an album (a photo, a video or a document of
 * a group), or the whole bubble otherwise. What ChatSelection selects — and what the context menu
 * highlights as its target.
 */
export default function getSelectionElementFromTarget(target: EventTarget | HTMLElement) {
  return findUpClassName(target, 'grouped-item') || findUpClassName(target, 'bubble');
}
