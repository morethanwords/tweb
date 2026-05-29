import {RemainingTime} from '@components/remainingTime';
import {Show} from 'solid-js';
import {attachHotClassName} from '../../helpers/solid/classname';
import {I18nTsx} from '../../helpers/solid/i18n';
import defineSolidElement, {PassedProps} from '../../lib/solidjs/defineSolidElement';
import {IconTsx} from '../iconTsx';
import styles from './contextMenuDeleteOptionText.module.scss';

if(import.meta.hot) import.meta.hot.accept();


type Props = {
  dateTimestamp: number;
  ttlPeriod?: number;
};

export const ContextMenuDeleteOptionText = defineSolidElement({
  name: 'context-menu-delete-option-text',
  component: (props: PassedProps<Props>) => {
    attachHotClassName(props.element, styles.Container);

    // Uncomment these lines to manually test different scenarios
    // props.dateTimestamp = Date.now() / 1000
    // props.ttlPeriod = 60 * 60 + 4

    return (
      <Show when={props.ttlPeriod} fallback={<I18nTsx key='Delete' />}>
        <div>
          <I18nTsx key='Delete' />
        </div>
        <div class={styles.Subtitle}>
          <IconTsx class={styles.Icon} icon='fire' />
          <RemainingTime finishTimestamp={props.dateTimestamp + props.ttlPeriod}>
            {(time) => {
              return <I18nTsx key='AutoDeletesIn' args={[time()]} />
            }}
          </RemainingTime>
        </div>
      </Show>
    );
  }
});
