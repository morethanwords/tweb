import {ParentProps, JSX, getOwner, createEffect, runWithOwner, splitProps} from 'solid-js/jsx-runtime';
import {assign} from 'solid-js/web';

export type PassthroughProps<E extends Element> = {element: E} & ParentProps & JSX.HTMLAttributes<E>;
export default function Passthrough<E extends Element>(props: PassthroughProps<E>): E {
  const owner = getOwner();
  let content: JSX.Element;

  createEffect(() => {
    content ||= runWithOwner(owner, () => props.children);
    const [_, others] = splitProps(props, ['element']);
    const isSvg = props.element instanceof SVGElement;
    assign(props.element, others, isSvg);
  });

  return props.element;
}
