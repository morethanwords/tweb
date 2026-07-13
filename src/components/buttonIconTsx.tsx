import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import Icon from '@components/icon';
import ripple from '@components/ripple';

export const ButtonIconTsx = (inProps: {icon?: Icon, noRipple?: boolean} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const [props, restProps] = splitProps(inProps, ['icon', 'class', 'children', 'noRipple']);

  const btn = (
    <button
      class={classNames('btn-icon', props.class)}
      {...restProps}
      tabIndex={-1}
    >
      {props.icon && Icon(props.icon)}
      {props.children}
    </button>
  );

  if(!props.noRipple) ripple(btn as HTMLElement);

  return btn;
};
