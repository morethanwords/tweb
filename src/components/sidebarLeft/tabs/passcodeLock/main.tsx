import {createEffect, onCleanup, onMount} from 'solid-js';

import type {LottieAssetName} from '../../../../lib/rlottie/lottieLoader';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';

import { i18n } from '../../../../lib/langPack';
import Button from '../../../buttonTsx';
import Section from '../../../section';

import {LottieAnimation} from './lottieAnimation';

import commonStyles from './common.module.scss';
import styles from './main.module.scss';

export default function PasscodeLockTab() {
  return (
    <>
      <Section>
        <LottieAnimation name="UtyanPasscode" />

        <div class={styles.MainDescription}>
          {i18n('PasscodeLock.Description')}
        </div>

        <div class={commonStyles.LargeButtonWrapper}>
          <Button class={`btn-primary btn-color-primary ${commonStyles.LargeButton}`} text="PasscodeLock.TurnOn" />
        </div>
      </Section>
    </>
  );
}
