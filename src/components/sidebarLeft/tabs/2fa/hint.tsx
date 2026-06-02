import {Component, onMount} from 'solid-js';
import Button from '@components/buttonTsx';
import InputField from '@components/inputField';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {AppTwoStepVerificationEmailTab} from '@components/solidJsTabs/tabs';
import cancelEvent from '@helpers/dom/cancelEvent';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import Section from '@components/section';
import {toastNew} from '@components/toast';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import type {AppTwoStepVerificationHintTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationHint: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationHintTab>();
  const {state, plainPassword, newPassword} = tab.payload;

  let inputField!: InputField;

  const stickerContainer = document.createElement('div');
  wrapStickerEmoji({
    div: stickerContainer,
    width: 160,
    height: 160,
    emoji: '💡'
  });

  const goNext = (e?: Event, saveHint?: boolean) => {
    if(e) {
      cancelEvent(e);
    }

    const hint = saveHint ? inputField.value : undefined;
    if(hint && newPassword === hint) {
      toastNew({langPackKey: 'PasswordAsHintError'});
      return;
    }

    tab.slider.createTab(AppTwoStepVerificationEmailTab).open({
      state,
      plainPassword,
      newPassword,
      hint,
      justSetPasssword: true
    });
  };

  const onContinueClick = (e?: Event) => goNext(e, true);
  const onSkipClick = (e?: Event) => goNext(e, false);

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-hint');

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return inputField.value ? onContinueClick() : onSkipClick();
      }
    });
  });

  (tab as any)._onOpenAfterTimeout = () => {
    inputField.input.focus();
  };

  return (
    <Section noDelimiter>
      {stickerContainer}
      <div class="input-wrapper">
        <InputFieldTsx
          name="hint"
          label="TwoStepAuth.SetupHintPlaceholder"
          instanceRef={(ref) => inputField = ref}
        />
        <Button primaryFilled text="Continue" onClick={onContinueClick} />
        <Button
          class="btn-primary btn-secondary btn-primary-transparent primary"
          text="YourEmailSkip"
          onClick={onSkipClick}
        />
      </div>
    </Section>
  );
};

export default TwoStepVerificationHint;
