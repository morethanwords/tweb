import {I18nTsx} from '@helpers/solid/i18n';
import {IconTsx} from '@components/iconTsx';
import styles from '@components/sidebarRight/tabs/adminRecentActions/noActionsPlaceholder.module.scss';


export const NoActionsPlaceholder = (props: {
  forFilters?: boolean;
}) => {
  return (
    <div class={styles.Overlay}>
      <div class={styles.Container}>
        <IconTsx icon='clipboard' class={styles.Icon} />
        <div class={styles.Title}>
          <I18nTsx key={props.forFilters ? 'AdminRecentActionsPlaceholder.WithFilterTitle' : 'AdminRecentActionsPlaceholder.Title'} />
        </div>
        <div class={styles.Description}>
          <I18nTsx key={props.forFilters ? 'AdminRecentActionsPlaceholder.WithFilterDescription' : 'AdminRecentActionsPlaceholder.Description'} />
        </div>
      </div>
    </div>
  );
};
