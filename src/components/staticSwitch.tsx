import {JSX, splitProps} from 'solid-js';

import styles from '@components/staticSwitch.module.scss';
import {IconTsx, IconTsxProps} from './iconTsx';
import classNames from '@helpers/string/classNames';

const StaticSwitch = (props: {
  checked?: boolean;
  handleContent?: JSX.Element;
}) => {
  return (
    <div class={styles.StaticSwitch} classList={{
      [styles.checked]: props.checked
    }}>
      <div class={styles.Background} />
      <div class={styles.Handle}>{props.handleContent}</div>
    </div>
  );
}

StaticSwitch.HandleIcon = (inProps: IconTsxProps) => {
  const [props, restProps] = splitProps(inProps, ['class']);
  return <IconTsx class={classNames(props.class, styles.HandleIcon)} {...restProps} />
};

export default StaticSwitch;
