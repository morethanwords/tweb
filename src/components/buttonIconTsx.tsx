import {JSX, splitProps} from 'solid-js';
import classNames from '../helpers/string/classNames';
import Icon from './icon';
import ripple from './ripple';

export const ButtonIconTsx = (props: {icon?: Icon, noRipple?: boolean} & JSX.ButtonHTMLAttributes<HTMLButtonElement>) => {
  const [, rest] = splitProps(props, ['icon', 'noRipple']);

  const btn = (
    <button
      {...rest}
      class={classNames('btn-icon', props.class)}
      tabIndex={-1}
    >
      {props.icon && Icon(props.icon)}
      {props.children}
    </button>
  );

  if(!props.noRipple) ripple(btn as HTMLElement);

  return btn;
};
