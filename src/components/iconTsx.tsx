import {JSX, splitProps} from 'solid-js';
import classNames from '../helpers/string/classNames';
import {getIconContent} from './icon';

export const IconTsx = (props: {icon: Icon} & JSX.HTMLAttributes<HTMLSpanElement>) => {
  const [, rest] = splitProps(props, ['icon']);
  return (
    <span {...rest} class={classNames('tgico', props.class)}>
      {getIconContent(props.icon)}
    </span>
  );
};
