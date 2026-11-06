import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import Icon from '@components/icon';
import ripple from '@components/ripple';
import iconButtonLabel from '@helpers/dom/iconButtonLabel';
import Modes from '@config/modes';

export const ButtonIconTsx = (inProps: {icon?: Icon, noRipple?: boolean} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const [props, restProps] = splitProps(inProps, ['icon', 'class', 'children', 'noRipple', 'tabIndex']);
  // * given once, as the ripple is
  const hasRipple = !props.noRipple;

  const btn = (
    <button
      // * the ripple's `rp` (`ripple` below) is named here too: a class that changes is a new `className`, which
      // * would take it away, and its `overflow: hidden` with it - the ripple stood out of the circle
      class={classNames('btn-icon', hasRipple && 'rp', props.class)}
      {...restProps}
      type={restProps.type || 'button'}
      // Out of the tab order by default without the a11y layer — most of these
      // sit inside something already focusable.
      tabIndex={props.tabIndex ?? (Modes.a11y ? restProps.tabindex : -1)}
      aria-label={restProps['aria-label'] || (!restProps['aria-labelledby'] && !restProps.title ? iconButtonLabel(props.icon) : undefined)}
    >
      {props.icon && Icon(props.icon)}
      {props.children}
    </button>
  );

  if(hasRipple) ripple(btn as HTMLElement);

  return btn;
};
