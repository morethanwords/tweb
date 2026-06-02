import {Component, onMount} from 'solid-js';
import Button from '@components/buttonTsx';
import PasswordInputField from '@components/passwordInputField';
import TrackingMonkey from '@components/monkeys/tracking';
import {AppTwoStepVerificationHintTab} from '@components/solidJsTabs/tabs';
import {InputState} from '@components/inputField';
import cancelEvent from '@helpers/dom/cancelEvent';
import Section from '@components/section';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppTwoStepVerificationReEnterPasswordTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationReEnterPassword: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationReEnterPasswordTab>();
  const promiseCollector = usePromiseCollector();
  const {state, plainPassword, newPassword} = tab.payload;

  const passwordInputField = new PasswordInputField({
    name: 're-enter-password',
    label: 'PleaseReEnterPassword'
  });

  const monkey = new TrackingMonkey(passwordInputField, 157);

  const verifyInput = () => {
    if(newPassword !== passwordInputField.value) {
      passwordInputField.setError();
      return false;
    }

    return true;
  };

  const onContinueClick = (e?: Event) => {
    if(e) {
      cancelEvent(e);
    }

    if(!verifyInput()) return;

    tab.slider.createTab(AppTwoStepVerificationHintTab).open({
      state,
      plainPassword,
      newPassword
    });
  };

  onMount(() => {
    tab.container.classList.add('two-step-verification', 'two-step-verification-enter-password', 'two-step-verification-re-enter-password');

    passwordInputField.input.addEventListener('keypress', (e) => {
      if(passwordInputField.input.classList.contains('error')) {
        passwordInputField.setState(InputState.Neutral);
      }

      if(e.key === 'Enter') {
        return onContinueClick();
      }
    });
  });

  (tab as any)._onOpenAfterTimeout = () => {
    passwordInputField.input.focus();
  };

  promiseCollector.collect(monkey.load());

  return (
    <Section noDelimiter>
      {monkey.container}
      <div class="input-wrapper">
        {passwordInputField.container}
        <Button primaryFilled text="Continue" onClick={onContinueClick} />
      </div>
    </Section>
  );
};

export default TwoStepVerificationReEnterPassword;
