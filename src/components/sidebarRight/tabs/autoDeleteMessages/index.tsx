import {resolveFirst} from '@solid-primitives/refs';
import {createEffect, createMemo, createResource, createSignal, For} from 'solid-js';
import {Portal} from 'solid-js/web';
import contextMenuController from '../../../../helpers/contextMenuController';
import {I18nTsx} from '../../../../helpers/solid/i18n';
import {wrapAsyncClickHandler} from '../../../../helpers/wrapAsyncClickHandler';
import useIsConfirmationNeededOnClose from '../../../../hooks/useIsConfirmationNeededOnClose';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import SaveButton from '../../../saveButton';
import Section from '../../../section';
import SettingsTabLottieAnimation from '../../../settingsTabLottieAnimation';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {AppMessagesAutoDeleteTab} from '../../../solidJsTabs/tabs';
import Space from '../../../space';
import StaticRadio from '../../../staticRadio';
import {customTimeOptions, getDefaultOptions, Option, tryFindMatchingCustomOption} from './options';
import styles from './styles.module.scss';


function findBestMatchingPeriod(period: number, options: Option[]) {
  const threshold = 0.2;
  const isCloseTo = (period: number, targetPeriod: number) => Math.abs(period - targetPeriod) / targetPeriod < threshold;

  if(period === 0) return 0;

  for(const option of options) {
    if(isCloseTo(period, option.value)) return option.value;
  }

  return period;
}

const AutoDeleteMessages = () => {
  const {Row, rootScope, ButtonMenu} = useHotReloadGuard();

  const [tab] = useSuperTab<typeof AppMessagesAutoDeleteTab>();

  const intialPeriod = tab.payload.period;

  const defaultOptions: Option[] = getDefaultOptions({
    offLabel: () => resolveFirst(() => <I18nTsx key='Off' />, item => item instanceof Element)()
  });

  const [period, setPeriod] = createSignal(findBestMatchingPeriod(intialPeriod, defaultOptions));
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);

  const hasChanges = createMemo(() => period() !== intialPeriod);

  const options = createMemo(() => {
    const result = [...defaultOptions];
    const localPeriod = period();

    for(let i = defaultOptions.length - 1; i >= 0; i--) {
      const value = defaultOptions[i].value;

      if(localPeriod === value) break;

      if(localPeriod > value) {
        result.splice(
          i + 1, 0,
          tryFindMatchingCustomOption(localPeriod)
        );
        break;
      }
    }

    return result;
  });

  const [menu] = createResource(async() => {
    const menu = await ButtonMenu({
      buttons: customTimeOptions.map((option) => ({
        regularText: resolveFirst(option.label, item => item instanceof Element)(),
        onClick: () => {
          setPeriod(option.value);
        }
      }))
    });

    menu.classList.add(styles.Menu);

    return menu;
  });

  createEffect(() => {
    if(!menu() || !isMenuOpen()) return;

    contextMenuController.openBtnMenu(menu(), () => {
      setIsMenuOpen(false);
    });
  });

  const onClick = (option: Option) => {
    setPeriod(option.value);
  };

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

  return (
    <>
      <Portal mount={tab.header}>
        <SaveButton hasChanges={hasChanges()} onClick={() => void saveSettings()} />
      </Portal>


      <Space amount='1rem' />
      <SettingsTabLottieAnimation name="UtyaAutoDelete" />
      <Space amount='2rem' />

      <Section name='AutoDeleteMessages.SectionTitle' caption='AutoDeleteMessages.Info'>
        <For each={options()}>
          {(option) => (
            <Row clickable={[onClick, option]}>
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
        <div class={styles.MenuContainer}>
          <Row clickable={() => setIsMenuOpen(true)}>
            <Row.CheckboxField> </Row.CheckboxField>
            <Row.Title>
              <I18nTsx key='AutoDeleteMessages.SetCustomTime' />
            </Row.Title>
          </Row>
          {menu()}
        </div>
      </Section>
    </>
  );
};

export default AutoDeleteMessages;
