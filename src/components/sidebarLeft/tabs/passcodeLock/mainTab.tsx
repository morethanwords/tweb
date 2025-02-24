import {} from 'solid-js';

import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';

import {i18n} from '../../../../lib/langPack';
import Section from '../../../section';
import Space from '../../../mediaEditor/space';
import ripple from '../../../ripple';

import {LottieAnimation} from './lottieAnimation';
import {useSuperTab} from './superTabProvider';

import commonStyles from './common.module.scss';
import styles from './main.module.scss';

const MainTab = () => {
  const [tab, {AppPasscodeEnterPasswordTab}] = useSuperTab();

  return (
    <>
      <Section caption="PasscodeLock.Notice">
        <LottieAnimation name="UtyanPasscode" />

        <div class={styles.MainDescription}>{i18n('PasscodeLock.Description')}</div>

        <Space amount="0.5rem" />

        <div class={commonStyles.LargeButtonWrapper}>
          <button
            use:ripple
            class={`btn-primary btn-color-primary ${commonStyles.LargeButton}`}
            onClick={() => {
              tab.slider.createTab(AppPasscodeEnterPasswordTab).open();
            }}
          >
            {i18n('PasscodeLock.TurnOn')}
          </button>
        </div>

        <Space amount="1rem" />
      </Section>
    </>
  );
};

export default MainTab;
