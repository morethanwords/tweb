import {Dynamic} from 'solid-js/web';
import {JSX} from 'solid-js';
import classNames from '../helpers/string/classNames';

export default function Badge(props: {
  tag: 'span' | 'div',
  size: number,
  color: string,
  children: JSX.Element,
  class?: string
}) {
  return (
    <Dynamic
      component={props.tag}
      class={classNames(
        'badge',
        `badge-${props.size}`,
        `badge-${props.color}`,
        !props.children && 'is-badge-empty',
        props.class
      )}
    >
      {props.children}
    </Dynamic>
  );
}
