import {StaticCheckbox, StaticCheckboxProps} from '@components/staticCheckbox';
import {splitProps} from 'solid-js';
import styles from './inMessageCheckbox.module.scss';


export const InMessageCheckbox = (inProps: StaticCheckboxProps & {
  isOutgoing?: boolean;
}) => {
  const [props, restProps] = splitProps(inProps, ['isOutgoing', 'classList', 'class']);

  return (
    <StaticCheckbox
      class={props.class}
      classList={{
        [styles.isOutgoing]: props.isOutgoing,
        ...props.classList
      }}
      {...restProps}
    />
  );
};
