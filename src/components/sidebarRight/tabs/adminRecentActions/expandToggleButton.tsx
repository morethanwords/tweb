import {keepMe} from '@helpers/keepMe';
import {IconTsx} from '@components/iconTsx';
import ripple from '@components/ripple';
import styles from '@components/sidebarRight/tabs/adminRecentActions/expandToggleButton.module.scss';
import I18n from '@lib/langPack';

keepMe(ripple);


export const ExpandToggleButton = (props: {
  expanded: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      use:ripple
      class='btn-icon'
      aria-label={I18n.format(props.expanded ? 'Separator.ShowLess' : 'Separator.ShowMore', true)}
      aria-expanded={props.expanded}
      onClick={props.onClick}
    >
      <IconTsx icon='plus' class={styles.Placeholder} />
      <IconTsx icon='arrowhead' class={`${styles.Icon} ${styles.first}`} classList={{[styles.toggled]: props.expanded}} />
      <IconTsx icon='arrowhead' class={`${styles.Icon} ${styles.second}`} classList={{[styles.toggled]: props.expanded}} />
    </button>
  )
};
