import {Dynamic} from 'solid-js/web';
import {createEffect, JSX} from 'solid-js';
import {rollBadgeCount} from '@helpers/setBadgeContent';

export default function Badge(props: {
  tag: 'span' | 'div',
  /** the pill's height; the rectangle variant sizes itself to its text instead */
  size?: number,
  color?: 'primary' | 'gray',
  /** a compact tinted rectangle for badges that sit inline with a heading */
  rectangle?: boolean,
  children?: JSX.Element,
  /**
   * a count to show instead of `children`, which rolls to a new one as it changes
   * (`rollBadgeCount`) - written by the badge itself, then, and hidden at zero
   */
  count?: number,
  /** how the count reads, when not as the number itself (`formatNumber`) */
  format?: (count: number) => string,
  class?: string
}) {
  let element: HTMLElement;
  // * given at all, even with no count yet: the store it comes from may not have filled in
  const hasCount = 'count' in props;
  if(hasCount) {
    createEffect(() => {
      const count = props.count || 0;
      rollBadgeCount(element, count, count ? props.format?.(count) : undefined);
    });
  }

  // * class by class: the roll marks the badge too (`is-rolling`), and a whole new class name
  // * written over it - the badge greying as its chat is muted - would drop that
  return (
    <Dynamic
      component={props.tag}
      ref={(el: HTMLElement) => element = el}
      class="badge"
      classList={{
        [`badge-${props.size}`]: !!props.size,
        [`badge-${props.color}`]: !!props.color,
        'badge-rectangle': !!props.rectangle,
        'is-badge-empty': hasCount ? !props.count : !props.children,
        [props.class]: !!props.class
      }}
    >
      {hasCount ? undefined : props.children}
    </Dynamic>
  );
}
