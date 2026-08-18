import {Dynamic} from 'solid-js/web';
import {JSX} from 'solid-js';
import classNames from '@helpers/string/classNames';

export default function Badge(props: {
  tag: 'span' | 'div',
  /** the pill's height; the rectangle variant sizes itself to its text instead */
  size?: number,
  color?: 'primary' | 'gray',
  /** a compact tinted rectangle for badges that sit inline with a heading */
  rectangle?: boolean,
  children: JSX.Element,
  class?: string
}) {
  return (
    <Dynamic
      component={props.tag}
      class={classNames(
        'badge',
        props.size && `badge-${props.size}`,
        props.color && `badge-${props.color}`,
        props.rectangle && 'badge-rectangle',
        !props.children && 'is-badge-empty',
        props.class
      )}
    >
      {props.children}
    </Dynamic>
  );
}
