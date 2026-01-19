import {createSignal} from 'solid-js';
import {I18nTsx} from '@helpers/solid/i18n';
import {LangPackKey} from '@lib/langPack';
import defineSolidElement, {PassedProps} from '@lib/solidjs/defineSolidElement';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {VerticalOptionWheel} from '@components/verticalOptionWheel';
import {customTimeOptions} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';
import styles from '@components/sidebarLeft/tabs/autoDeleteMessages/customTimePopup/styles.module.scss';

if(import.meta.hot) import.meta.hot.accept();

type Props = {
  initialPeriod: number;
  descriptionLangKey: LangPackKey;
  onChange: (period: number) => void;
};


export const AutoDeleteMessagesCustomTimePopupContent = defineSolidElement({
  name: 'auto-delete-messages-custom-time-popup-content',
  component: (props: PassedProps<Props>) => {
    const {i18n} = useHotReloadGuard();

    const [period, setPeriod] = createSignal(props.initialPeriod);

    const options = [
      {
        value: 0,
        label: () => i18n('Never')
      },
      ...customTimeOptions
    ];

    return (
      <div class={styles.Container}>
        <I18nTsx key={props.descriptionLangKey} />

        <VerticalOptionWheel
          value={period()}
          onChange={(value) => {
            setPeriod(value);
            props.onChange(value);
          }}
          options={options.map(option => ({
            label: option.label(),
            value: option.value
          }))}
        />
      </div>
    );
  }
});
