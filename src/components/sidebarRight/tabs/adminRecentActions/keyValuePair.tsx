import {JSX} from 'solid-js';
import styles from './keyValuePair.module.scss';


type KeyValuePairProps = {
  label: JSX.Element;
  value: JSX.Element;
};

export const KeyValuePair = (props: KeyValuePairProps) => {
  return (
    <div class={styles.Container}>
      <div>{props.label}:</div>
      <div class={styles.Value}>{props.value}</div>
    </div>
  );
};
