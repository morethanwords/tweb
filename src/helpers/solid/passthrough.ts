import {ParentProps, JSX, createEffect, splitProps, untrack, children} from 'solid-js';
import {assign, insert} from 'solid-js/web';

export type PassthroughProps<E extends Element> = {element: E} & ParentProps & JSX.HTMLAttributes<E>;
export default function Passthrough<E extends Element>(props: PassthroughProps<E>): E {
  const element = untrack(() => props.element);
  const resolved = children(() => props.children);

  // Hand children to `insert` once: it sets up its own reactive tracking and
  // properly REMOVES the previous DOM nodes before inserting new ones.
  //
  // The previous implementation passed `children: resolved` to `assign` inside
  // a createEffect that re-fires on every prop change. Each re-fire ran the
  // children code path again with no notion of what was inserted before, so
  // when `resolved()` returned a new HTMLElement (e.g. a freshly-built i18n
  // span when a label changed), the new node was appended ALONGSIDE the old
  // one — producing visible duplicates like "JUMP TO DATE JUMP TO DATE".
  //
  // The createEffect below now skips children (`skipChildren: true`) and only
  // re-applies the other props.
  insert(element, resolved);

  createEffect(() => {
    const [_, others] = splitProps(props, ['element', 'children']);
    assign(element, others, element instanceof SVGElement, true);
  });

  return element;
}
