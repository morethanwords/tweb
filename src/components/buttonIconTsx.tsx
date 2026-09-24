import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import Icon from '@components/icon';
import ripple from '@components/ripple';
import iconButtonLabel from '@helpers/dom/iconButtonLabel';

export const ButtonIconTsx = (inProps: {icon?: Icon, noRipple?: boolean} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const [props, restProps] = splitProps(inProps, ['icon', 'class', 'children', 'noRipple', 'tabIndex']);

  const btn = (
    <button
      class={classNames('btn-icon', props.class)}
      {...restProps}
      type={restProps.type || 'button'}
      tabIndex={props.tabIndex ?? restProps.tabindex}
      aria-label={restProps['aria-label'] || (!restProps['aria-labelledby'] && !restProps.title ? iconButtonLabel(props.icon) : undefined)}
    >
      {props.icon && Icon(props.icon)}
      {props.children}
    </button>
  );

  if(!props.noRipple) ripple(btn as HTMLElement);

  return btn;
};
