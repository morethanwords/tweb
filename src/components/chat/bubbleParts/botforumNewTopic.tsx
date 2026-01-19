import {I18nTsx} from '@helpers/solid/i18n';
import defineSolidElement from '@lib/solidjs/defineSolidElement';
import {IconTsx} from '@components/iconTsx';
import styles from '@components/chat/bubbleParts/botforumNewTopic.module.scss';

if(import.meta.hot) import.meta.hot.accept();


const BotforumNewTopic = defineSolidElement({
  name: 'botforum-new-topic',
  component: () => {
    return (
      <div class={styles.Container}>
        <div class={styles.IconContainer}>
          <IconTsx class={styles.Icon} icon='add_chat' />
        </div>

        <div class={styles.Title}>
          <I18nTsx key='NewTopic' />
        </div>

        <div class={styles.Description}>
          <I18nTsx key='CreateNewTopicDescription' />
        </div>

        <div class={styles.ArrowDownIconContainer}>
          <IconTsx icon='down' />
        </div>
      </div>
    );
  }
});

export default BotforumNewTopic;
