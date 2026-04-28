import classNames from '@helpers/string/classNames';
import {JSX, splitProps} from 'solid-js';
import styles from './staticCheckbox.module.scss';


export const StaticCheckbox = (inProps: {
  checked?: boolean;
} & JSX.HTMLAttributes<HTMLDivElement>) => {
  const [props, restProps] = splitProps(inProps, ['checked', 'class', 'classList']);

  return (
    <div
      class={classNames(styles.Checkbox, props.class)}
      classList={{
        [styles.checked]: props.checked,
        ...props.classList
      }}
      {...restProps}
    >
      <div class={styles.Border}></div>
      <div class={styles.Background}></div>
      <svg class={styles.Check} viewBox="0 0 24 24"><use href="#check" x="-1"></use></svg>
    </div>
  );
};
