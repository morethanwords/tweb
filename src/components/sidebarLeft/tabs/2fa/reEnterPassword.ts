/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountPassword} from '../../../../layer';
import Button from '../../../button';
import PasswordInputField from '../../../passwordInputField';
import {SliderSuperTab} from '../../../slider';
import TrackingMonkey from '../../../monkeys/tracking';
import AppTwoStepVerificationHintTab from './hint';
import {InputState} from '../../../inputField';
import cancelEvent from '../../../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import SettingSection from '../../../settingSection';

export default class AppTwoStepVerificationReEnterPasswordTab extends SliderSuperTab {
  public state: AccountPassword;
  public passwordInputField: PasswordInputField;
  public plainPassword: string;
  public newPassword: string;

  public init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-enter-password', 'two-step-verification-re-enter-password');
    this.setTitle('PleaseReEnterPassword');

    const section = new SettingSection({
      noDelimiter: true
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const passwordInputField = this.passwordInputField = new PasswordInputField({
      name: 're-enter-password',
      label: 'PleaseReEnterPassword'
    });

    const monkey = new TrackingMonkey(passwordInputField, 157);

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});

    inputWrapper.append(passwordInputField.container, btnContinue);
    section.content.append(monkey.container, inputWrapper);

    this.scrollable.append(section.container);

    passwordInputField.input.addEventListener('keypress', (e) => {
      if(passwordInputField.input.classList.contains('error')) {
        passwordInputField.setState(InputState.Neutral);
      }

      if(e.key === 'Enter') {
        return onContinueClick();
      }
    });

    const verifyInput = () => {
      if(this.newPassword !== passwordInputField.value) {
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

      const tab = this.slider.createTab(AppTwoStepVerificationHintTab);
      tab.state = this.state;
      tab.plainPassword = this.plainPassword;
      tab.newPassword = this.newPassword;
      tab.open();
    };
    attachClickEvent(btnContinue, onContinueClick);

    return monkey.load();
  }

  onOpenAfterTimeout() {
    this.passwordInputField.input.focus();
  }
}
