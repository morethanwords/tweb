import {keepMe} from '../../../../helpers/keepMe';
import {IconTsx} from '../../../iconTsx';
import ripple from '../../../ripple';
import styles from './expandToggleButton.module.scss';

keepMe(ripple);


export const ExpandToggleButton = (props: {
  expanded: boolean;
  onClick: () => void;
}) => {
  return (
    <button use:ripple class='btn-icon' onClick={props.onClick}>
      <IconTsx icon='plus' class={styles.Placeholder} />
      <IconTsx icon='arrowhead' class={`${styles.Icon} ${styles.first}`} classList={{[styles.toggled]: props.expanded}} />
      <IconTsx icon='arrowhead' class={`${styles.Icon} ${styles.second}`} classList={{[styles.toggled]: props.expanded}} />
    </button>
  )
};
