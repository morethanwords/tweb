/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SettingSection } from "../..";
import { attachClickEvent } from "../../../../helpers/dom/clickEvent";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
import { _i18n } from "../../../../lib/langPack";
import passwordManager from "../../../../lib/mtproto/passwordManager";
import Button from "../../../button";
import PopupPeer from "../../../popups/peer";
import { SliderSuperTab } from "../../../slider";
import { wrapSticker } from "../../../wrappers";
import AppSettingsTab from "../settings";
import AppTwoStepVerificationEmailTab from "./email";
import AppTwoStepVerificationEnterPasswordTab from "./enterPassword";

export default class AppTwoStepVerificationTab extends SliderSuperTab {
  public state: AccountPassword;
  public plainPassword: string;

  protected init() {
    this.container.classList.add('two-step-verification', 'two-step-verification-main');
    this.setTitle('TwoStepVerificationTitle');

    const section = new SettingSection({
      caption: true,
      noDelimiter: true
    });

    const emoji = '🔐';
    const doc = appStickersManager.getAnimatedEmojiSticker(emoji);
    const stickerContainer = document.createElement('div');

    if(doc) {
      wrapSticker({
        doc,
        div: stickerContainer,
        loop: false,
        play: true,
        width: 168,
        height: 168,
        emoji
      }).then(() => {
        // this.animation = player;
      });
    } else {
      stickerContainer.classList.add('media-sticker-wrapper');
    }

    section.content.append(stickerContainer);

    const c = section.generateContentElement();
    if(this.state.pFlags.has_password) {
      _i18n(section.caption, 'TwoStepAuth.GenericHelp');

      const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'TwoStepAuth.ChangePassword'});
      const btnDisablePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'TwoStepAuth.RemovePassword'});
      const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: this.state.pFlags.has_recovery ? 'TwoStepAuth.ChangeEmail' : 'TwoStepAuth.SetupEmail'});

      attachClickEvent(btnChangePassword, () => {
        const tab = new AppTwoStepVerificationEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.plainPassword = this.plainPassword;
        tab.open();
      });

      attachClickEvent(btnDisablePassword, () => {
        const popup = new PopupPeer('popup-disable-password', {
          buttons: [{
            langKey: 'Disable',
            callback: () => {
              passwordManager.updateSettings({currentPassword: this.plainPassword}).then(() => {
                this.slider.sliceTabsUntilTab(AppSettingsTab, this);
                this.close();
              });
            },
            isDanger: true,
          }], 
          titleLangKey: 'TurnPasswordOffQuestionTitle',
          descriptionLangKey: 'TurnPasswordOffQuestion'
        });

        popup.show();
      });

      attachClickEvent(btnSetRecoveryEmail, () => {
        const tab = new AppTwoStepVerificationEmailTab(this.slider);
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
        const tab = new AppTwoStepVerificationEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.open();
      });
    }

    this.scrollable.container.append(section.container);
  }
}
