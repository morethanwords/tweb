import {Component, onMount} from 'solid-js';
import Button from '@components/buttonTsx';
import Section from '@components/section';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import {AppSettingsTab} from '@components/solidJsTabs';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationSetTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationSet: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationSetTab>();
  const {messageFor} = tab.payload;

  const stickerContainer = document.createElement('div');
  wrapStickerEmoji({
    emoji: '🥳',
    div: stickerContainer,
    width: 160,
    height: 160
  });

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-set');
    tab.slider.sliceTabsUntilTab(AppSettingsTab, tab);
  });

  return (
    <Section
      caption={messageFor === 'password' ? 'TwoStepVerificationPasswordSetInfo' : 'TwoStepVerificationEmailSetInfo'}
      captionOld
      noDelimiter
    >
      {stickerContainer}
      <div class="input-wrapper">
        <Button
          primaryFilled
          text="TwoStepVerificationPasswordReturnSettings"
          onClick={() => tab.close()}
        />
      </div>
    </Section>
  );
};

export default TwoStepVerificationSet;
