/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {attachClickEvent} from '../../../../helpers/dom/clickEvent';
import {AccountPassword} from '../../../../layer';
import {_i18n} from '../../../../lib/langPack';
import Button from '../../../button';
import PopupElement from '../../../popups';
import PopupPeer from '../../../popups/peer';
import SettingSection from '../../../settingSection';
import {SliderSuperTab} from '../../../slider';
import wrapStickerEmoji from '../../../wrappers/stickerEmoji';
import AppSettingsTab from '../settings';
import AppTwoStepVerificationEmailTab from './email';
import AppTwoStepVerificationEnterPasswordTab from './enterPassword';

export default class AppTwoStepVerificationTab extends SliderSuperTab {
  public state: AccountPassword;
  public plainPassword: string;

  public init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-main');
    this.setTitle('TwoStepVerificationTitle');

    const section = new SettingSection({
      captionOld: true,
      noDelimiter: true
    });

    const emoji = '🔐';
    const stickerContainer = document.createElement('div');

    wrapStickerEmoji({
      div: stickerContainer,
      width: 168,
      height: 168,
      emoji
    });

    section.content.append(stickerContainer);

    const c = section.generateContentElement();
    if(this.state.pFlags.has_password) {
      _i18n(section.caption, 'TwoStepAuth.GenericHelp');

      const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'TwoStepAuth.ChangePassword'});
      const btnDisablePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'TwoStepAuth.RemovePassword'});
      const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: this.state.pFlags.has_recovery ? 'TwoStepAuth.ChangeEmail' : 'TwoStepAuth.SetupEmail'});

      attachClickEvent(btnChangePassword, () => {
        const tab = this.slider.createTab(AppTwoStepVerificationEnterPasswordTab);
        tab.state = this.state;
        tab.plainPassword = this.plainPassword;
        tab.open();
      });

      attachClickEvent(btnDisablePassword, () => {
        const popup = PopupElement.createPopup(PopupPeer, 'popup-disable-password', {
          buttons: [{
            langKey: 'Disable',
            callback: () => {
              this.managers.passwordManager.updateSettings({currentPassword: this.plainPassword}).then(() => {
                this.slider.sliceTabsUntilTab(AppSettingsTab, this);
                this.close();
              });
            },
            isDanger: true
          }],
          titleLangKey: 'TurnPasswordOffQuestionTitle',
          descriptionLangKey: 'TurnPasswordOffQuestion'
        });

        popup.show();
      });

      attachClickEvent(btnSetRecoveryEmail, () => {
        const tab = this.slider.createTab(AppTwoStepVerificationEmailTab);
        tab.state = this.state;
        tab.hint = this.state.hint;
        tab.plainPassword = this.plainPassword;
        tab.newPassword = this.plainPassword;
        tab.isFirst = true;
        tab.open();
      });

      c.append(btnChangePassword, btnDisablePassword, btnSetRecoveryEmail);
    } else {
      _i18n(section.caption, 'TwoStepAuth.SetPasswordHelp');

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      const btnSetPassword = Button('btn-primary btn-color-primary', {text: 'TwoStepVerificationSetPassword'});

      inputWrapper.append(btnSetPassword);
      c.append(inputWrapper);

      attachClickEvent(btnSetPassword, (e) => {
        const tab = this.slider.createTab(AppTwoStepVerificationEnterPasswordTab);
        tab.state = this.state;
        tab.open();
      });
    }

    this.scrollable.append(section.container);
  }
}
