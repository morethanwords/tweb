import {I18nTsx} from '../../../../helpers/solid/i18n';
import {IconTsx} from '../../../iconTsx';
import styles from './noActionsPlaceholder.module.scss';


export const NoActionsPlaceholder = () => {
  return (
    <div class={styles.Overlay}>
      <div class={styles.Container}>
        <IconTsx icon='clipboard' class={styles.Icon} />
        <div class={styles.Title}>
          <I18nTsx key='AdminRecentActionsPlaceholder.Title' />
        </div>
        <div class={styles.Description}>
          <I18nTsx key='AdminRecentActionsPlaceholder.Description' />
        </div>
      </div>
    </div>
  );
};
