import {Component} from 'solid-js';
import Button from '@components/button';
import PasswordInputField from '@components/passwordInputField';
import TrackingMonkey from '@components/monkeys/tracking';
import {AppTwoStepVerificationHintTab} from '@components/solidJsTabs/tabs';
import {InputState} from '@components/inputField';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import {i18n} from '@lib/langPack';
import SettingSection from '@components/settingSection';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppTwoStepVerificationReEnterPasswordTab} from '@components/solidJsTabs/tabs';

const TwoStepVerificationReEnterPassword: Component = () => {
  const [tab] = useSuperTab<typeof AppTwoStepVerificationReEnterPasswordTab>();
  const promiseCollector = usePromiseCollector();
  const {state, plainPassword, newPassword} = tab.payload;

  tab.container.classList.add('two-step-verification', 'two-step-verification-enter-password', 'two-step-verification-re-enter-password');
  tab.title.replaceChildren(i18n('PleaseReEnterPassword'));

  const section = new SettingSection({
    noDelimiter: true
  });

  const inputWrapper = document.createElement('div');
  inputWrapper.classList.add('input-wrapper');

  const passwordInputField = new PasswordInputField({
    name: 're-enter-password',
    label: 'PleaseReEnterPassword'
  });

  const monkey = new TrackingMonkey(passwordInputField, 157);

  const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});

  inputWrapper.append(passwordInputField.container, btnContinue);
  section.content.append(monkey.container, inputWrapper);

  tab.scrollable.append(section.container);

  passwordInputField.input.addEventListener('keypress', (e) => {
    if(passwordInputField.input.classList.contains('error')) {
      passwordInputField.setState(InputState.Neutral);
    }

    if(e.key === 'Enter') {
      return onContinueClick();
    }
  });

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
  attachClickEvent(btnContinue, onContinueClick);

  (tab as any)._onOpenAfterTimeout = () => {
    passwordInputField.input.focus();
  };

  promiseCollector.collect(monkey.load());

  return null;
};

export default TwoStepVerificationReEnterPassword;
