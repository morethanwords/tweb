import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {getIconContent} from '@components/icon';

export const IconTsx = (inProps: {icon: Icon} & JSX.HTMLAttributes<HTMLSpanElement>) => {
  const [props, rest] = splitProps(inProps, ['icon', 'class']);
  return (
    <span class={classNames('tgico', props.class)} {...rest}>
      {getIconContent(props.icon)}
    </span>
  );
};
