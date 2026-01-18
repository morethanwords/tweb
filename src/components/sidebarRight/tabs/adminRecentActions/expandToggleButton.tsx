import {keepMe} from '@helpers/keepMe';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import styles from '@components/sidebarRight/tabs/adminRecentActions/expandToggleButton.module.scss';

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
