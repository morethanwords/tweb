import {ParentProps, JSX, createEffect, splitProps, untrack, children} from 'solid-js';
import {assign} from 'solid-js/web';

export type PassthroughProps<E extends Element> = {element: E} & ParentProps & JSX.HTMLAttributes<E>;
export default function Passthrough<E extends Element>(props: PassthroughProps<E>): E {
  const element = untrack(() => props.element);
  const resolved = children(() => props.children);

  createEffect(() => {
    const [_, others] = splitProps(props, ['element', 'children']);
    assign(element, {
      ...others,
      children: resolved
    }, element instanceof SVGElement);
  });

  return element;
}
