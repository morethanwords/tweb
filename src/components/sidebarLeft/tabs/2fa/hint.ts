/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AccountPassword} from '@layer';
import Button from '@components/button';
import {SliderSuperTab} from '@components/slider';
import InputField from '@components/inputField';
import AppTwoStepVerificationEmailTab from '@components/sidebarLeft/tabs/2fa/email';
import {toast} from '@components/toast';
import I18n from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import wrapStickerEmoji from '@components/wrappers/stickerEmoji';
import SettingSection from '@components/settingSection';

export default class AppTwoStepVerificationHintTab extends SliderSuperTab {
  public inputField: InputField;
  public state: AccountPassword;
  public plainPassword: string;
  public newPassword: string;

  public init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-hint');
    this.setTitle('TwoStepAuth.SetupHintTitle');

    const section = new SettingSection({
      noDelimiter: true
    });

    const emoji = '💡';
    const stickerContainer = document.createElement('div');
    wrapStickerEmoji({
      div: stickerContainer,
      width: 160,
      height: 160,
      emoji
    });

    section.content.append(stickerContainer);

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    const inputField = this.inputField = new InputField({
      name: 'hint',
      label: 'TwoStepAuth.SetupHintPlaceholder'
    });

    inputField.input.addEventListener('keypress', (e) => {
      if(e.key === 'Enter') {
        cancelEvent(e);
        return inputField.value ? onContinueClick() : onSkipClick();
      }
    });

    const goNext = (e?: Event, saveHint?: boolean) => {
      if(e) {
        cancelEvent(e);
      }

      const hint = saveHint ? inputField.value : undefined;
      if(hint && this.newPassword === hint) {
        toast(I18n.format('PasswordAsHintError', true));
        return;
      }

      const tab = this.slider.createTab(AppTwoStepVerificationEmailTab);
      tab.state = this.state;
      tab.plainPassword = this.plainPassword;
      tab.newPassword = this.newPassword;
      tab.hint = hint;

      tab.open({justSetPasssword: true});
    };

    const btnContinue = Button('btn-primary btn-color-primary', {text: 'Continue'});
    const btnSkip = Button('btn-primary btn-secondary btn-primary-transparent primary', {text: 'YourEmailSkip'});

    const onContinueClick = (e?: Event) => goNext(e, true);
    const onSkipClick = (e?: Event) => goNext(e, false);
    attachClickEvent(btnContinue, onContinueClick);
    attachClickEvent(btnSkip, onSkipClick);

    inputWrapper.append(inputField.container, btnContinue, btnSkip);

    section.content.append(inputWrapper);

    this.scrollable.append(section.container);
  }

  onOpenAfterTimeout() {
    this.inputField.input.focus();
  }
}
