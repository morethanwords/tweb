import {Component} from 'solid-js';

import styles from './staticSwitch.module.scss';

const StaticSwitch: Component<{
  checked?: boolean;
}> = (props) => {
  return (
    <div class={styles.StaticSwitch} classList={{
      [styles.checked]: props.checked
    }}>
      <div class={styles.Background} />
      <div class={styles.Handle} />
    </div>
  );
}

export default StaticSwitch;
