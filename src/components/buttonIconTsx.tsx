import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import Icon from '@components/icon';
import ripple from '@components/ripple';
import iconButtonLabel from '@helpers/dom/iconButtonLabel';
import Modes from '@config/modes';

export const ButtonIconTsx = (inProps: {icon?: Icon, noRipple?: boolean} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const [props, restProps] = splitProps(inProps, ['icon', 'class', 'children', 'noRipple', 'tabIndex']);

  const btn = (
    <button
      class={classNames('btn-icon', props.class)}
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

  if(!props.noRipple) ripple(btn as HTMLElement);

  return btn;
};
