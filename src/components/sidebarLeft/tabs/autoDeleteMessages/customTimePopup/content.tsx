import {createSignal} from 'solid-js';
import {I18nTsx} from '../../../../../helpers/solid/i18n';
import {LangPackKey} from '../../../../../lib/langPack';
import defineSolidElement, {PassedProps} from '../../../../../lib/solidjs/defineSolidElement';
import {VerticalOptionWheel} from '../../../../verticalOptionWheel';
import {customTimeOptions} from '../options';
import styles from './styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Props = {
  initialPeriod: number;
  descriptionLangKey: LangPackKey;
  onChange: (period: number) => void;
};

export const AutoDeleteMessagesCustomTimePopupContent = defineSolidElement({
  name: 'auto-delete-messages-custom-time-popup-content',
  component: (props: PassedProps<Props>) => {
    const [period, setPeriod] = createSignal(props.initialPeriod);

    return (
      <div class={styles.Container}>
        <I18nTsx  key={props.descriptionLangKey} />

        <VerticalOptionWheel
          value={period()}
          onChange={(value) => {
            setPeriod(value);
            props.onChange(value);
          }}
          options={customTimeOptions.map(option => ({
            label: option.label(),
            value: option.value
          }))}
        />
      </div>
    );
  }
});
