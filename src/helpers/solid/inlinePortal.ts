import {children, JSX, onCleanup, ParentProps, untrack} from 'solid-js';
import {insert} from 'solid-js/web';

/**
 * `<Portal>` always wraps its children in a container `<div>`, which breaks every host
 * element whose own styling has to reach the text — `text-overflow: ellipsis` on the
 * sidebar header rows, for one. This mounts the children DIRECTLY into `mount`, so the
 * host ends up with exactly the children it would have if it had built them itself.
 *
 * The children stay owned by the calling component: they update and are torn down with
 * it, and `mount` is emptied on cleanup — `insert` manages the whole element, the same
 * contract `render()` has with its root.
 */
export default function InlinePortal(
  props: ParentProps<{mount: Element}>
): JSX.Element {
  const mount = untrack(() => props.mount);
  insert(mount, children(() => props.children));
  onCleanup(() => mount.replaceChildren());
  return undefined;
}
