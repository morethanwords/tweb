import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';

/**
 * Swallows the click that ends a gesture - a drag, a held press - so that what the press began on is
 * not clicked as well. That click lands on the common ancestor of the press and the release rather
 * than on either element, so it has to get past the moved-since-mousedown guard (`ignoreMove`). A
 * release that makes no click leaves nothing behind: the next press, of the mouse or a key, drops the
 * swallow.
 */
export default function swallowNextClick(target: HTMLElement | Window) {
  const detach = attachClickEvent(target, cancelEvent, {capture: true, once: true, passive: false, ignoreMove: true});
  const doc = 'document' in target ? target.document : target.ownerDocument;
  doc.addEventListener('mousedown', detach, {capture: true, once: true});
  doc.addEventListener('keydown', detach, {capture: true, once: true});
}
