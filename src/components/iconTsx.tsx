import {JSX, splitProps} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {getIconContent} from '@components/icon';

export type IconTsxProps = {
  icon: Icon;
} & JSX.HTMLAttributes<HTMLSpanElement>;

export const IconTsx = (inProps: IconTsxProps) => {
  const [props, rest] = splitProps(inProps, ['icon', 'class']);
  return (
    <span class={classNames('tgico', props.class)} {...rest}>
      {getIconContent(props.icon)}
    </span>
  );
};
