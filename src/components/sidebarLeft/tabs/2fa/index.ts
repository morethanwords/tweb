import { SettingSection } from "../..";
import { attachClickEvent } from "../../../../helpers/dom";
import { AccountPassword } from "../../../../layer";
import appStickersManager from "../../../../lib/appManagers/appStickersManager";
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
    this.title.innerHTML = 'Two-Step Verification';

    const section = new SettingSection({
      caption: ' ',
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
      section.caption.innerHTML = 'You have enabled Two-Step verification.<br/>You\'ll need the password you set up here to log in to your Telegram account.';

      const btnChangePassword = Button('btn-primary btn-transparent', {icon: 'edit', text: 'Change Password'});
      const btnDisablePassword = Button('btn-primary btn-transparent', {icon: 'passwordoff', text: 'Turn Password Off'});
      const btnSetRecoveryEmail = Button('btn-primary btn-transparent', {icon: 'email', text: this.state.pFlags.has_recovery ? 'Change Recovery Email' : 'Set Recovery Email'});

      attachClickEvent(btnChangePassword, () => {
        const tab = new AppTwoStepVerificationEnterPasswordTab(this.slider);
        tab.state = this.state;
        tab.plainPassword = this.plainPassword;
        tab.open();
      });

      attachClickEvent(btnDisablePassword, () => {
        const popup = new PopupPeer('popup-disable-password', {
          buttons: [{
            text: 'DISABLE',
            callback: () => {
              passwordManager.updateSettings({currentPassword: this.plainPassword}).then(() => {
                this.slider.sliceTabsUntilTab(AppSettingsTab, this);
                this.close();
              });
            },
            isDanger: true,
          }], 
          titleLangKey: 'Warning',
          descriptionLangKey: 'Are you sure you want to disable<br/>your password?'
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
      section.caption.innerHTML = 'You can set a password that will be required when you log in on a new device in addition to the code you get in the SMS.';

      const inputWrapper = document.createElement('div');
      inputWrapper.classList.add('input-wrapper');

      const btnSetPassword = Button('btn-primary btn-color-primary', {text: 'SET PASSWORD'});
      
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
