import {resolveFirst} from '@solid-primitives/refs';
import {createMemo, createSignal, For} from 'solid-js';
import {Portal} from 'solid-js/web';
import {I18nTsx} from '@helpers/solid/i18n';
import {wrapAsyncClickHandler} from '@helpers/wrapAsyncClickHandler';
import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import SaveButton from '@components/saveButton';
import Section from '@components/section';
import SettingsTabLottieAnimation from '@components/settingsTabLottieAnimation';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {AppMessagesAutoDeleteTab} from '@components/solidJsTabs/tabs';
import Space from '@components/space';
import StaticRadio from '@components/staticRadio';
import {findExistingOrCreateCustomOption, findMatchingCustomOption, getDefaultOptions, Option} from '@components/sidebarLeft/tabs/autoDeleteMessages/options';
import AutoDeleteMessagesCustomTimePopup from '@components/sidebarLeft/tabs/autoDeleteMessages/customTimePopup';


const AutoDeleteMessages = () => {
  const {Row, rootScope, HotReloadGuard} = useHotReloadGuard();

  const [tab] = useSuperTab<typeof AppMessagesAutoDeleteTab>();

  const initialPeriod = findMatchingCustomOption(tab.payload.period)?.value || tab.payload.period;

  const defaultOptions: Option[] = getDefaultOptions({
    offLabel: () => resolveFirst(() => <I18nTsx key='Off' />, item => item instanceof Element)()
  });

  const [period, setPeriod] = createSignal(initialPeriod);

  const hasChanges = createMemo(() => period() !== initialPeriod);

  const options = createMemo(() => {
    const result = [...defaultOptions];
    const localPeriod = period();

    for(let i = defaultOptions.length - 1; i >= 0; i--) {
      const value = defaultOptions[i].value;

      if(localPeriod === value) break;

      if(localPeriod > value) {
        result.splice(
          i + 1, 0,
          findExistingOrCreateCustomOption(localPeriod)
        );
        break;
      }
    }

    return result;
  });

  const saveSettings = wrapAsyncClickHandler(async() => {
    if(!hasChanges()) return;

    try {
      await rootScope.managers.appPrivacyManager.setDefaultAutoDeletePeriod(period());
      tab.payload.onSaved(period());
    } finally {
      tab.close();
    }
  });

  tab.isConfirmationNeededOnClose = useIsConfirmationNeededOnClose({
    descriptionLangKey: 'UnsavedChangesDescription.Privacy',
    hasChanges,
    saveAllSettings: saveSettings
  });

  const onOptionClick = (option: Option) => {
    setPeriod(option.value);
  };

  const onCustomOptionClick = () => {
    new AutoDeleteMessagesCustomTimePopup({
      HotReloadGuard,
      descriptionLangKey: 'AutoDeleteMessages.InfoDefault',
      onFinish: (value) => {
        setPeriod(value);
      },
      period: period()
    }).show();
  };

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges()} onClick={() => void saveSettings()} />
      </Portal>


      <Space amount='1rem' />
      <SettingsTabLottieAnimation name="UtyanDisappear" />
      <Space amount='2rem' />

      <Section name='AutoDeleteMessages.SectionTitle' caption='AutoDeleteMessages.SectionCaption'>
        <For each={options()}>
          {(option) => (
            <Row clickable={[onOptionClick, option]}>
              <Row.CheckboxField>
                <StaticRadio
                  floating
                  checked={period() === option.value}
                />
              </Row.CheckboxField>
              <Row.Title>
                {option.label()}
              </Row.Title>
            </Row>
          )}
        </For>
        <Row clickable={onCustomOptionClick}>
          <Row.Icon icon='tools' />
          <Row.Title>
            <I18nTsx key='AutoDeleteMessages.SetOtherTime' />
          </Row.Title>
        </Row>
      </Section>
    </>
  );
};

export default AutoDeleteMessages;
