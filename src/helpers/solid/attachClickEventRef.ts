import {onCleanup} from 'solid-js';
import {attachClickEvent, AttachClickOptions} from '@helpers/dom/clickEvent';

/**
 * Solid `ref` that binds a click through `attachClickEvent` and detaches it on
 * cleanup — so use it from inside a component, where there is an owner to clean
 * up with.
 *
 * Reach for it instead of `onClick` whenever an ancestor also listens with
 * `attachClickEvent`: that helper listens on `mousedown` wherever touch is
 * supported, while `onClick` is delegated at the document and so always runs
 * after the ancestor's own listener — too late for the handler's `cancelEvent`
 * to keep the ancestor from acting on the same tap.
 *
 * It also brings the rest of `attachClickEvent`'s behavior, notably the desktop
 * guard that ignores a click whose press started on a different element.
 */
export default function attachClickEventRef(
  callback: (e: MouseEvent) => void,
  options?: AttachClickOptions
) {
  return (element: HTMLElement) => {
    // `attachClickEvent` writes into the options it is given (`touchMouseDown`),
    // so hand it a copy rather than the caller's object
    onCleanup(attachClickEvent(element, callback, {...options}));
  };
}
