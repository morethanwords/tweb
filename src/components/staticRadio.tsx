import {Component, splitProps, JSX} from 'solid-js';

import styles from './staticRadio.module.scss';

const StaticRadio: Component<{
  checked: boolean;
  floating?: boolean;
  class?: string;
} & JSX.HTMLAttributes<HTMLSpanElement>> = (inProps) => {
  const [props, spanProps] = splitProps(inProps, ['checked', 'floating', 'class', 'classList']);

  return <span
    class={styles.Radio}
    classList={{
      [props.class]: !!props.class,
      [styles.checked]: props.checked,
      [styles.floating]: props.floating,
      'offset-left': props.floating,
      ...props.classList
    }}
    {...spanProps}
  />;
};

export default StaticRadio;
